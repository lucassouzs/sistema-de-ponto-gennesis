import { Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { parseDateOnlyValue } from '../utils/dateInput';
import { FinancialControlStatus, Prisma } from '@prisma/client';

const ALLOWED_STATUSES: FinancialControlStatus[] = [
  'PROCESSO_COMPLETO',
  'PAGO',
  'AGUARDAR_NOTA',
  'AGUARDAR_PAGAMENTO',
  'LANCADO',
  'CANCELADO',
];

const ALLOWED_CONSORCIOS = ['brasilia', 'hub'] as const;
type FinancialControlConsorcio = (typeof ALLOWED_CONSORCIOS)[number];

function parseStatus(value: unknown): FinancialControlStatus | null {
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase().trim();
  if (ALLOWED_STATUSES.includes(upper as FinancialControlStatus)) {
    return upper as FinancialControlStatus;
  }
  return null;
}

function parseConsorcio(value: unknown): FinancialControlConsorcio | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (ALLOWED_CONSORCIOS.includes(normalized as FinancialControlConsorcio)) {
    return normalized as FinancialControlConsorcio;
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  return parseDateOnlyValue(value);
}

function parseDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (isNaN(n)) return null;
  return new Prisma.Decimal(n);
}

function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return isNaN(n) ? null : n;
}

/** Resolve OS real da RM vinculada à OC (evita mostrar código de contrato/CC). */
async function resolveOsCodeByOcNumber(
  entries: Array<{ id: string; ocNumber: string | null; osCode: string | null }>
): Promise<Array<{ id: string; ocNumber: string | null; osCode: string | null } & Record<string, unknown>>> {
  const ocNumbers = [
    ...new Set(entries.map((e) => (e.ocNumber || '').trim()).filter(Boolean)),
  ];
  if (ocNumbers.length === 0) return entries;

  const orders = await prisma.purchaseOrder.findMany({
    where: {
      OR: ocNumbers.map((n) => ({
        orderNumber: { equals: n, mode: 'insensitive' as const },
      })),
    },
    select: {
      orderNumber: true,
      materialRequest: { select: { serviceOrder: true } },
    },
  });

  const osByOc = new Map<string, string>();
  for (const order of orders) {
    const so = order.materialRequest?.serviceOrder?.trim();
    if (so) osByOc.set(order.orderNumber.trim().toLowerCase(), so);
  }

  const persistFixes: Array<{ id: string; osCode: string }> = [];
  const enriched = entries.map((entry) => {
    const key = (entry.ocNumber || '').trim().toLowerCase();
    const serviceOrder = key ? osByOc.get(key) : undefined;
    if (!serviceOrder) return entry;
    if ((entry.osCode || '').trim() !== serviceOrder) {
      persistFixes.push({ id: entry.id, osCode: serviceOrder });
    }
    return { ...entry, osCode: serviceOrder };
  });

  if (persistFixes.length > 0) {
    void Promise.all(
      persistFixes.map((fix) =>
        prisma.financialControlEntry
          .update({ where: { id: fix.id }, data: { osCode: fix.osCode } })
          .catch(() => undefined)
      )
    );
  }

  return enriched;
}

function buildEntryData(body: any, userId?: string | null, isUpdate = false) {
  const data: Prisma.FinancialControlEntryUncheckedCreateInput | Prisma.FinancialControlEntryUncheckedUpdateInput =
    {} as any;

  if (body.paymentMonth !== undefined) {
    const m = parseInteger(body.paymentMonth);
    if (m === null || m < 1 || m > 12) {
      throw createError('Mês de pagamento inválido (1-12)', 400);
    }
    (data as any).paymentMonth = m;
  }
  if (body.paymentYear !== undefined) {
    const y = parseInteger(body.paymentYear);
    if (y === null || y < 2000 || y > 2100) {
      throw createError('Ano de pagamento inválido', 400);
    }
    (data as any).paymentYear = y;
  }
  if (body.status !== undefined) {
    const s = parseStatus(body.status);
    if (!s) throw createError('Status inválido', 400);
    (data as any).status = s;
  }
  if (body.consorcio !== undefined) {
    const c = parseConsorcio(body.consorcio);
    if (!c) throw createError('Consórcio inválido (brasilia | hub)', 400);
    (data as any).consorcio = c;
  } else if (!isUpdate) {
    (data as any).consorcio = 'brasilia';
  }
  if (body.osCode !== undefined) (data as any).osCode = body.osCode || null;
  if (body.supplierName !== undefined) (data as any).supplierName = body.supplierName || null;
  if (body.nfNumber !== undefined) (data as any).nfNumber = body.nfNumber || null;
  if (body.parcelNumber !== undefined) (data as any).parcelNumber = body.parcelNumber || null;
  if (body.emissionDate !== undefined) (data as any).emissionDate = parseDate(body.emissionDate);
  if (body.boleto !== undefined) (data as any).boleto = body.boleto || null;
  if (body.dueDate !== undefined) (data as any).dueDate = parseDate(body.dueDate);
  if (body.originalValue !== undefined) (data as any).originalValue = parseDecimal(body.originalValue);
  if (body.ocNumber !== undefined) (data as any).ocNumber = body.ocNumber || null;
  if (body.finalValue !== undefined) (data as any).finalValue = parseDecimal(body.finalValue);
  if (body.paidDate !== undefined) (data as any).paidDate = parseDate(body.paidDate);
  if (body.remainingDays !== undefined) (data as any).remainingDays = parseInteger(body.remainingDays);
  if (body.receivedNote !== undefined) (data as any).receivedNote = body.receivedNote || null;
  if (body.notes !== undefined) (data as any).notes = body.notes || null;

  if (isUpdate) {
    (data as any).updatedBy = userId || null;
  } else {
    (data as any).createdBy = userId || null;
    (data as any).updatedBy = userId || null;
  }

  return data;
}

export class FinancialControlController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year, status, search, consorcio } = req.query;
      const where: Prisma.FinancialControlEntryWhereInput = {};

      if (consorcio) {
        const c = parseConsorcio(consorcio);
        if (c) where.consorcio = c;
      }
      if (month) {
        const m = parseInt(String(month), 10);
        if (!isNaN(m)) where.paymentMonth = m;
      }
      if (year) {
        const y = parseInt(String(year), 10);
        if (!isNaN(y)) where.paymentYear = y;
      }
      if (status) {
        const s = parseStatus(status);
        if (s) where.status = s;
      }
      if (search) {
        const q = String(search);
        where.OR = [
          { osCode: { contains: q, mode: 'insensitive' } },
          { supplierName: { contains: q, mode: 'insensitive' } },
          { nfNumber: { contains: q, mode: 'insensitive' } },
          { parcelNumber: { contains: q, mode: 'insensitive' } },
          { ocNumber: { contains: q, mode: 'insensitive' } },
          { receivedNote: { contains: q, mode: 'insensitive' } },
        ];
      }

      const entries = await prisma.financialControlEntry.findMany({
        where,
        orderBy: [
          { paymentYear: 'asc' },
          { paymentMonth: 'asc' },
          { dueDate: 'desc' },
          { createdAt: 'asc' },
        ],
      });

      const data = await resolveOsCodeByOcNumber(entries);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /** Verifica se existe lançamento no controle financeiro vinculado ao número da OC. */
  async hasEntryForOc(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const orderNumber = decodeURIComponent(String(req.params.orderNumber || '')).trim();
      if (!orderNumber) {
        res.json({ success: true, data: { hasEntry: false } });
        return;
      }
      const count = await prisma.financialControlEntry.count({
        where: { ocNumber: { equals: orderNumber, mode: 'insensitive' } }
      });
      res.json({ success: true, data: { hasEntry: count > 0 } });
    } catch (error) {
      next(error);
    }
  }

  async getMonths(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const grouped = await prisma.financialControlEntry.groupBy({
        by: ['paymentYear', 'paymentMonth'],
        _count: { _all: true },
        _sum: { finalValue: true },
        orderBy: [
          { paymentYear: 'asc' },
          { paymentMonth: 'asc' },
        ],
      });

      const data = grouped.map((g) => ({
        year: g.paymentYear,
        month: g.paymentMonth,
        count: g._count?._all ?? 0,
        totalFinalValue: g._sum?.finalValue ? Number(g._sum.finalValue) : 0,
      }));

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getByOcNumber(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ocNumber = String(req.params.ocNumber || '').trim();
      if (!ocNumber) throw createError('Número da OC é obrigatório', 400);
      const entries = await prisma.financialControlEntry.findMany({
        where: { ocNumber: { equals: ocNumber, mode: 'insensitive' } },
        orderBy: [{ paymentYear: 'desc' }, { paymentMonth: 'desc' }, { createdAt: 'desc' }],
      });
      res.json({ success: true, data: entries });
    } catch (error) {
      next(error);
    }
  }

  /** Lançamentos do controle financeiro para várias OCs (listagem Pagamento). */
  async getByOcNumbersBatch(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const raw = String(req.query.numbers || '').trim();
      const numbers = [...new Set(raw.split(',').map((n) => n.trim()).filter(Boolean))];
      if (numbers.length === 0) {
        res.json({ success: true, data: [] });
        return;
      }
      const entries = await prisma.financialControlEntry.findMany({
        where: {
          OR: numbers.map((ocNumber) => ({
            ocNumber: { equals: ocNumber, mode: 'insensitive' as const },
          })),
        },
        orderBy: [{ paymentYear: 'desc' }, { paymentMonth: 'desc' }, { createdAt: 'desc' }],
      });
      res.json({ success: true, data: entries });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const entry = await prisma.financialControlEntry.findUnique({ where: { id } });
      if (!entry) throw createError('Lançamento não encontrado', 404);
      res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (req.body.paymentMonth === undefined || req.body.paymentYear === undefined) {
        throw createError('paymentMonth e paymentYear são obrigatórios', 400);
      }
      const data = buildEntryData(req.body, req.user?.id, false);
      const entry = await prisma.financialControlEntry.create({
        data: data as Prisma.FinancialControlEntryUncheckedCreateInput,
      });
      res.status(201).json({ success: true, data: entry, message: 'Lançamento criado com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.financialControlEntry.findUnique({ where: { id } });
      if (!existing) throw createError('Lançamento não encontrado', 404);
      const data = buildEntryData(req.body, req.user?.id, true);
      const updated = await prisma.financialControlEntry.update({
        where: { id },
        data: data as Prisma.FinancialControlEntryUncheckedUpdateInput,
      });
      res.json({ success: true, data: updated, message: 'Lançamento atualizado com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.financialControlEntry.findUnique({ where: { id } });
      if (!existing) throw createError('Lançamento não encontrado', 404);
      await prisma.financialControlEntry.delete({ where: { id } });
      res.json({ success: true, message: 'Lançamento excluído com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async importSpreadsheet(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw createError('Arquivo não enviado', 400);

      const mode = (req.body?.mode as string) || 'append'; // append | replace
      const consorcio = parseConsorcio(req.body?.consorcio) || 'brasilia';
      const userId = req.user?.id || null;

      const parsed = await parseControleFinanceiroSpreadsheet(req.file.buffer);
      if (!parsed.entries.length) {
        throw createError('Nenhum lançamento válido encontrado na planilha', 400);
      }

      const IMPORT_BATCH_SIZE = 250;
      const result = await prisma.$transaction(
        async (tx) => {
          let removed = 0;
          if (mode === 'replace') {
            const monthYearPairs = Array.from(
              new Set(parsed.entries.map((e) => `${e.paymentYear}-${e.paymentMonth}`)),
            ).map((s) => {
              const [y, m] = s.split('-').map(Number);
              return { paymentYear: y, paymentMonth: m, consorcio };
            });

            if (monthYearPairs.length) {
              const del = await tx.financialControlEntry.deleteMany({
                where: { OR: monthYearPairs },
              });
              removed = del.count;
            }
          }

          let created = 0;
          for (let i = 0; i < parsed.entries.length; i += IMPORT_BATCH_SIZE) {
            const batch = parsed.entries.slice(i, i + IMPORT_BATCH_SIZE);
            const insert = await tx.financialControlEntry.createMany({
              data: batch.map((entry) => ({
                consorcio,
                paymentMonth: entry.paymentMonth,
                paymentYear: entry.paymentYear,
                status: entry.status,
                osCode: entry.osCode,
                supplierName: entry.supplierName,
                nfNumber: entry.nfNumber,
                parcelNumber: entry.parcelNumber,
                emissionDate: toSafeDate(entry.emissionDate),
                boleto: entry.boleto,
                dueDate: toSafeDate(entry.dueDate),
                originalValue: entry.originalValue,
                ocNumber: entry.ocNumber,
                finalValue: entry.finalValue,
                paidDate: toSafeDate(entry.paidDate),
                remainingDays: entry.remainingDays,
                receivedNote: entry.receivedNote,
                notes: entry.notes,
                createdBy: userId,
                updatedBy: userId,
              })),
            });
            created += insert.count;
          }

          return { created, removed };
        },
        { maxWait: 30_000, timeout: 120_000 },
      );

      res.json({
        success: true,
        message: `${result.created} lançamento(s) importado(s) com sucesso${
          result.removed ? ` (${result.removed} substituído(s))` : ''
        }`,
        data: {
          created: result.created,
          removed: result.removed,
          warnings: parsed.warnings,
          months: parsed.monthsDetected,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

// ============================================================================
// Parser da planilha "Controle Financeiro - Material/Serviço Aplicado"
// ============================================================================

interface ParsedEntry {
  paymentMonth: number;
  paymentYear: number;
  status: FinancialControlStatus;
  osCode: string | null;
  supplierName: string | null;
  nfNumber: string | null;
  parcelNumber: string | null;
  emissionDate: Date | null;
  boleto: string | null;
  dueDate: Date | null;
  originalValue: Prisma.Decimal | null;
  ocNumber: string | null;
  finalValue: Prisma.Decimal | null;
  paidDate: Date | null;
  remainingDays: number | null;
  receivedNote: string | null;
  notes: string | null;
}

interface ParseResult {
  entries: ParsedEntry[];
  warnings: string[];
  monthsDetected: { year: number; month: number; label: string }[];
}

/**
 * Separa NF e parcela quando a planilha traz combinado (ex.: `556713-2/2`, `005510-1`).
 * Textos/códigos (`RECIBO`, `FL-002016`) ficam inteiros na NF, sem parcela.
 */
function splitNfAndParcel(raw: string | null | undefined): {
  nfNumber: string | null;
  parcelNumber: string | null;
} {
  if (raw === null || raw === undefined) return { nfNumber: null, parcelNumber: null };
  const s = String(raw).trim();
  if (!s) return { nfNumber: null, parcelNumber: null };

  // 556713-2/2 — NF só dígitos + parcela N/M
  const withSlash = s.match(/^(\d+)-(\d+\/\d+)$/);
  if (withSlash) {
    return { nfNumber: withSlash[1], parcelNumber: withSlash[2] };
  }

  // 005510-1 / 027283-1 — NF só dígitos + parcela curta (não divide FL-002016)
  const withShortParcel = s.match(/^(\d+)-(\d{1,3})$/);
  if (withShortParcel) {
    return { nfNumber: withShortParcel[1], parcelNumber: withShortParcel[2] };
  }

  // Só parcela: 2/2
  if (/^\d+\/\d+$/.test(s)) {
    return { nfNumber: null, parcelNumber: s };
  }

  // RECIBO, FL-002016, 0, etc. → tudo na NF
  return { nfNumber: s, parcelNumber: null };
}

function cellToTrimmedString(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value).trim();
  return s || null;
}

const MONTHS_PT_TO_NUM: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  MARÇO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

function parseMonthValue(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && value >= 1 && value <= 12) return Math.trunc(value);
  const normalized = normalizeText(value);
  const fromName = MONTHS_PT_TO_NUM[normalized];
  if (fromName) return fromName;
  const n = parseInt(normalized, 10);
  if (n >= 1 && n <= 12) return n;
  return null;
}

function parseStatusFromExportLabel(value: any): FinancialControlStatus | null {
  const t = normalizeText(value);
  if (!t) return null;
  if (t === 'PROCESSO COMPLETO' || t.includes('PROCESSO COMPLETO')) return 'PROCESSO_COMPLETO';
  if (t === 'PAGO') return 'PAGO';
  if (t.includes('AGUARDAR NOTA') || t.includes('AGUARDAR A NOTA')) return 'AGUARDAR_NOTA';
  if (t.includes('AGUARDAR PAGAMENTO') || t === 'AGENDADO' || t.includes('AGENDADO')) {
    return 'AGUARDAR_PAGAMENTO';
  }
  if (t === 'LANCADO' || t.includes('LANCADO')) return 'LANCADO';
  if (t === 'PENDENTE') return 'AGUARDAR_PAGAMENTO';
  if (t === 'CANCELADO' || t.includes('CANCEL')) return 'CANCELADO';
  return null;
}

function normalizeText(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  if (typeof value !== 'string') return null;
  let cleaned = value
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseCellDate(value: any): Date | null {
  const date = parseDateOnlyValue(value);
  if (!date) return null;
  const year = date.getUTCFullYear();
  if (year < 1990 || year > 2100) return null;
  return date;
}

function toSafeDate(value: Date | null | undefined): Date | null {
  if (!value) return null;
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return value;
}

function inferStatus(opts: {
  boleto: string | null;
  receivedNote: string | null;
  paidDate: Date | null;
  finalValue: Prisma.Decimal | null;
}): FinancialControlStatus {
  const boletoNorm = normalizeText(opts.boleto);
  const receivedNorm = normalizeText(opts.receivedNote);

  if (boletoNorm.includes('CANCEL') || receivedNorm.includes('CANCEL')) {
    return 'CANCELADO';
  }
  if (
    opts.finalValue !== null &&
    Number(opts.finalValue) === 0 &&
    boletoNorm.includes('CANCEL')
  ) {
    return 'CANCELADO';
  }
  if (receivedNorm.startsWith('PAGO') || opts.paidDate) {
    if (receivedNorm.includes('ENFASE') || receivedNorm.includes('AGUARDAR NOTA') || receivedNorm.includes('AGUARDAR A NOTA')) {
      return 'AGUARDAR_NOTA';
    }
    return 'PAGO';
  }
  return 'AGUARDAR_PAGAMENTO';
}

/**
 * Cores base do tema Office padrão do Excel (índice → RGB hex).
 * Usado quando a célula só traz `theme` + `tint` em vez de ARGB.
 */
const EXCEL_THEME_BASE_HEX = [
  '000000', 'FFFFFF', '44546A', 'E7E6E6', '4472C4', 'ED7D31',
  'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72',
];

function applyExcelTint(rgbHex: string, tint: number): string {
  let r = parseInt(rgbHex.slice(0, 2), 16);
  let g = parseInt(rgbHex.slice(2, 4), 16);
  let b = parseInt(rgbHex.slice(4, 6), 16);
  if (tint > 0) {
    r = Math.round(r + (255 - r) * tint);
    g = Math.round(g + (255 - g) * tint);
    b = Math.round(b + (255 - b) * tint);
  } else if (tint < 0) {
    r = Math.round(r * (1 + tint));
    g = Math.round(g * (1 + tint));
    b = Math.round(b * (1 + tint));
  }
  return [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
}

function colorObjectToHex(color: any): string | null {
  if (!color) return null;
  if (typeof color.argb === 'string') {
    let hex = color.argb.toUpperCase().replace('#', '');
    if (hex.length === 8) hex = hex.slice(2);
    return hex.length === 6 ? hex : null;
  }
  if (typeof color.theme === 'number') {
    const base = EXCEL_THEME_BASE_HEX[color.theme];
    if (!base) return null;
    const tint = typeof color.tint === 'number' ? color.tint : 0;
    return applyExcelTint(base, tint);
  }
  return null;
}

function inferStatusFromColor(argbOrRgb: string | null | undefined): FinancialControlStatus | null {
  if (!argbOrRgb) return null;
  let hex = argbOrRgb.toUpperCase().replace('#', '');
  if (hex.length === 8) hex = hex.slice(2);
  if (hex.length !== 6) return null;

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;

  // Vermelho dominante
  if (r > 150 && r > g + 30 && r > b + 30) return 'CANCELADO';

  // Amarelo / dourado (processo completo) — inclui #FFF2CC
  if (r > 160 && g > 120 && b < 170 && r >= g - 45) return 'PROCESSO_COMPLETO';

  // Azul claro / ciano — inclui pastéis (#DDEBF7, #B4C6E7) e tema Excel com tint
  const blueLead = b - Math.max(r, g);
  if (b >= r && b >= g - 20 && blueLead >= 6 && b > 90) {
    return 'AGUARDAR_PAGAMENTO';
  }

  // Branco / preto / cinza sem destaque
  if (spread < 28) return null;

  // Verde dominante
  if (g > 110 && g > r + 15 && g > b + 15) return 'PAGO';

  return null;
}

/** Lê a cor de status na coluna de status e nas primeiras colunas da linha (legado). */
function resolveStatusFromRowColors(
  rowColors: (string | null)[],
  statusColumnIdx: number,
): FinancialControlStatus | null {
  const indices: number[] = [];
  if (statusColumnIdx >= 0) indices.push(statusColumnIdx);
  for (let i = 0; i < Math.min(rowColors.length, 5); i++) {
    if (!indices.includes(i)) indices.push(i);
  }

  for (const idx of indices) {
    const status = inferStatusFromColor(rowColors[idx]);
    if (status) return status;
  }
  return null;
}

/**
 * Extrai a cor de preenchimento de uma célula ExcelJS (ARGB ou tema Office).
 */
function getCellFillArgb(cell: ExcelJS.Cell): string | null {
  const fill: any = (cell as any).fill;
  if (!fill || fill.type !== 'pattern') return null;
  const fg = fill.fgColor || fill.bgColor;
  return colorObjectToHex(fg);
}

/**
 * Converte o valor de uma célula ExcelJS em algo "simples" (string, number,
 * Date, etc.). ExcelJS pode retornar objetos para fórmulas ou rich text.
 */
function unwrapCellValue(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    if (value instanceof Date) return value;
    if ('result' in value) return value.result; // fórmulas
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((p: any) => p.text || '').join('');
    }
    if ('text' in value) return value.text;
  }
  return value;
}

/**
 * Parser para a planilha "Controle Financeiro - Material/Serviço Aplicado".
 * Detecta linhas separadoras tipo "PAGAMENTOS DE JANEIRO 2025" e usa a posição
 * fixa das colunas (O.S., Fornecedor, Parcela, Emissão, Boleto, Vencto, Vlr Orig, O.C., Vlr Final, Pago Dia, Falta Dias, Recebido)
 * conforme o cabeçalho identificado. Também lê a cor de fundo da coluna de
 * "Status" (geralmente coluna B) para inferir o status do lançamento.
 */
async function parseControleFinanceiroSpreadsheet(buffer: Buffer): Promise<ParseResult> {
  const warnings: string[] = [];
  const entries: ParsedEntry[] = [];
  const monthsDetected: { year: number; month: number; label: string }[] = [];
  const monthsSet = new Set<string>();

  // Carrega com exceljs para ter acesso a cores de células.
  // Converte para ArrayBuffer porque o tipo Buffer<ArrayBufferLike> do Node 22+
  // não é estritamente compatível com o tipo Buffer esperado pelo ExcelJS.
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);

  if (workbook.worksheets.length === 0) {
    warnings.push('Planilha sem abas válidas.');
    return { entries, warnings, monthsDetected };
  }

  // Procurar a aba mais relevante: "MATERIAL APLICADO" tem prioridade, senão a primeira
  const preferredNames = ['MATERIAL APLICADO', 'CONTROLE FINANCEIRO', 'PAGAMENTOS', 'LANCAMENTOS'];
  let worksheet = workbook.worksheets[0];
  for (const candidate of workbook.worksheets) {
    const norm = normalizeText(candidate.name);
    if (preferredNames.some((p) => norm.includes(p))) {
      worksheet = candidate;
      break;
    }
  }

  // Converte cada linha em array (índice 0-based) com valores "unwrapped".
  // Mantemos também uma matriz paralela com cores de fundo das células.
  const rows: any[][] = [];
  const colors: (string | null)[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const rowValues: any[] = [];
    const rowColors: (string | null)[] = [];
    // ExcelJS indexa 1-based; iteramos cell por cell até o último preenchido
    const lastCol = row.cellCount || 0;
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      rowValues.push(unwrapCellValue(cell.value));
      rowColors.push(getCellFillArgb(cell));
    }
    // ignora linhas totalmente vazias
    if (rowValues.every((v) => v === null || v === undefined || String(v).trim() === '')) return;
    rows.push(rowValues);
    colors.push(rowColors);
  });

  // Mapeamento default das colunas conforme a planilha do usuário
  // (compatível com cabeçalho da imagem fornecida)
  let colIdx = {
    month: -1,
    year: -1,
    statusText: -1,
    osCode: 0,
    statusColumn: 1, // coluna B: célula com cor representando status (geralmente vazia)
    supplierName: 2,
    nfNumber: -1,
    parcelNumber: 3,
    emissionDate: 4,
    boleto: 5,
    dueDate: 6,
    originalValue: 7,
    ocNumber: 8,
    finalValue: 9,
    paidDate: 10,
    remainingDays: 11,
    receivedNote: 12,
  };

  let currentMonth: number | null = null;
  let currentYear: number | null = null;
  let usePerRowMonthYear = false;

  const tryDetectMonthYearFromRow = (row: any[]): { month: number; year: number } | null => {
    const joined = row
      .map((c) => (c === null || c === undefined ? '' : String(c)))
      .join(' ');
    const text = normalizeText(joined);
    // Ex.: "PAGAMENTOS DE JANEIRO 2025", "PAGAMENTOS DE JANEIRO/2025"
    const match = text.match(/PAGAMENTOS DE\s+([A-Z]+)[\s/-]+(\d{4})/);
    if (!match) return null;
    const monthName = match[1];
    const year = parseInt(match[2], 10);
    const month = MONTHS_PT_TO_NUM[monthName];
    if (!month || !year) return null;
    return { month, year };
  };

  const tryRemapColumnsFromHeader = (row: any[]) => {
    // Reconfigura o mapeamento caso o cabeçalho tenha posições diferentes.
    const normalized = row.map((c) => normalizeText(c));
    const findCol = (...candidates: string[]) => {
      for (const cand of candidates) {
        const idx = normalized.findIndex((h) => h === cand || h.includes(cand));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const m = {
      month: findCol('MES'),
      year: findCol('ANO'),
      statusText: findCol('STATUS'),
      osCode: findCol('O.S.', 'OS'),
      supplierName: findCol('CODIGO-NOME DO FORNECEDOR', 'NOME DO FORNECEDOR', 'FORNECEDOR'),
      nfNumber: findCol(
        'NUMERO DA NF',
        'NUMERO NF',
        'NOTA FISCAL',
        'Nº NF',
        'N NF',
        'NF'
      ),
      parcelNumber: findCol(
        'PRF-NUMERO PARCELA',
        'NUMERO DA PARCELA',
        'NUMERO PARCELA',
        'PARCELA'
      ),
      emissionDate: findCol('DATA DE EMISSAO', 'EMISSAO'),
      boleto: findCol('BOLETO'),
      dueDate: findCol('DATA DE VENCTO', 'DATA DE VENCIMENTO', 'VENCTO', 'VENCIMENTO'),
      originalValue: findCol('VALOR ORIGINAL'),
      ocNumber: findCol('O. C.', 'O.C.', 'OC'),
      finalValue: findCol('VALOR FINAL'),
      paidDate: findCol('DATA DE PAGAMENTO', 'DATA PAGAMENTO', 'DATA PAGTO', 'PAGO DIA', 'PAGAMENTO'),
      remainingDays: findCol('DIFERENCA DE DIAS', 'DIFERENCA DIAS', 'FALTA DIAS', 'DIAS'),
      receivedNote: findCol('OBSERVACAO', 'OBSERVACOES', 'OBS', 'RECEBIDO'),
    };

    if (m.month >= 0 && m.year >= 0) {
      usePerRowMonthYear = true;
    }

    // Se O.S. está em coluna X e Fornecedor está em X+2 (gap de 1), a coluna do meio
    // costuma ser a célula de "Status" (coloridinha). Detectamos esse padrão automaticamente.
    let statusColumn = colIdx.statusColumn;
    if (m.osCode >= 0 && m.supplierName > m.osCode) {
      const gap = m.supplierName - m.osCode;
      if (gap === 2) {
        statusColumn = m.osCode + 1;
      } else {
        statusColumn = -1; // sem coluna de status separada
      }
    }

    // Só remapeia se identificou pelo menos 4 colunas-chave (evita falsos positivos)
    const knownCount = Object.values(m).filter((v) => v >= 0).length;
    if (knownCount >= 4) {
      // Garante que cada índice seja único — se uma coluna não foi achada pelo nome
      // e o índice default colide com outra que JÁ foi mapeada, descarta o default.
      const usedIndices = new Set<number>(Object.values(m).filter((v) => v >= 0) as number[]);
      if (statusColumn >= 0) usedIndices.add(statusColumn);
      const safeFallback = (mapped: number, fallback: number) => {
        if (mapped >= 0) return mapped;
        if (usedIndices.has(fallback)) return -1; // descarta para não duplicar
        return fallback;
      };
      colIdx = {
        month: safeFallback(m.month, -1),
        year: safeFallback(m.year, -1),
        statusText: safeFallback(m.statusText, -1),
        osCode: safeFallback(m.osCode, colIdx.osCode),
        statusColumn,
        supplierName: safeFallback(m.supplierName, colIdx.supplierName),
        nfNumber: safeFallback(m.nfNumber, colIdx.nfNumber),
        parcelNumber: safeFallback(m.parcelNumber, colIdx.parcelNumber),
        emissionDate: safeFallback(m.emissionDate, colIdx.emissionDate),
        boleto: safeFallback(m.boleto, colIdx.boleto),
        dueDate: safeFallback(m.dueDate, colIdx.dueDate),
        originalValue: safeFallback(m.originalValue, colIdx.originalValue),
        ocNumber: safeFallback(m.ocNumber, colIdx.ocNumber),
        finalValue: safeFallback(m.finalValue, colIdx.finalValue),
        paidDate: safeFallback(m.paidDate, colIdx.paidDate),
        remainingDays: safeFallback(m.remainingDays, colIdx.remainingDays),
        receivedNote: safeFallback(m.receivedNote, colIdx.receivedNote),
      };
    }
  };

  const isHeaderRow = (row: any[]): boolean => {
    const joined = normalizeText(row.map((c) => (c ?? '')).join(' '));
    if (joined.includes('MES') && joined.includes('ANO') && joined.includes('O.S.')) {
      return true;
    }
    return (
      joined.includes('O.S.') &&
      joined.includes('FORNECEDOR') &&
      (joined.includes('VENCTO') || joined.includes('VENCIMENTO'))
    );
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowColors = colors[i];
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;

    // 1) Linha de cabeçalho de mês ("PAGAMENTOS DE JANEIRO 2025")
    const detected = tryDetectMonthYearFromRow(row);
    if (detected) {
      currentMonth = detected.month;
      currentYear = detected.year;
      const key = `${detected.year}-${detected.month}`;
      if (!monthsSet.has(key)) {
        monthsSet.add(key);
        monthsDetected.push({
          year: detected.year,
          month: detected.month,
          label: `${Object.keys(MONTHS_PT_TO_NUM).find((k) => MONTHS_PT_TO_NUM[k] === detected.month)} ${detected.year}`,
        });
      }
      continue;
    }

    // 2) Linha de cabeçalho das colunas: reconfigurar mapeamento
    if (isHeaderRow(row)) {
      tryRemapColumnsFromHeader(row);
      continue;
    }

    // 3) Linhas legenda/topo (PROCESSO COMPLETO, CONTROLE FINANCEIRO, FORNECEDOR sozinho)
    const firstCellNorm = normalizeText(row[0]);
    if (
      firstCellNorm === 'PROCESSO COMPLETO' ||
      firstCellNorm === 'PAGO, AGUARDAR A NOTA' ||
      firstCellNorm === 'FORNECEDOR' ||
      firstCellNorm.includes('CONTROLE FINANCEIRO')
    ) {
      continue;
    }

    // 4) Linha de dados — precisamos do mês/ano (por seção ou por coluna na exportação)
    let paymentMonth = currentMonth;
    let paymentYear = currentYear;

    if (usePerRowMonthYear) {
      paymentMonth = colIdx.month >= 0 ? parseMonthValue(row[colIdx.month]) : null;
      const yearRaw = colIdx.year >= 0 ? row[colIdx.year] : null;
      if (yearRaw !== null && yearRaw !== undefined && yearRaw !== '') {
        const parsedYear = typeof yearRaw === 'number' ? yearRaw : parseInt(String(yearRaw), 10);
        paymentYear = isNaN(parsedYear) ? null : parsedYear;
      } else {
        paymentYear = null;
      }
    }

    if (paymentMonth === null || paymentYear === null) {
      continue;
    }

    const osCode = row[colIdx.osCode] ? String(row[colIdx.osCode]).trim() : null;
    const supplierName = row[colIdx.supplierName] ? String(row[colIdx.supplierName]).trim() : null;

    // Linha precisa ter pelo menos O.S. ou Fornecedor para ser considerada
    if (!osCode && !supplierName) continue;

    const parcelNumberRaw = colIdx.parcelNumber >= 0 ? row[colIdx.parcelNumber] : null;
    const nfNumberRaw = colIdx.nfNumber >= 0 ? row[colIdx.nfNumber] : null;
    let nfNumber = cellToTrimmedString(nfNumberRaw);
    let parcelNumber = cellToTrimmedString(parcelNumberRaw);

    // Planilha legada: NF e parcela numa coluna só (ex.: 556713-2/2)
    if (!nfNumber && parcelNumber) {
      const split = splitNfAndParcel(parcelNumber);
      nfNumber = split.nfNumber;
      parcelNumber = split.parcelNumber;
    } else if (nfNumber && parcelNumber) {
      const split = splitNfAndParcel(parcelNumber);
      if (split.nfNumber && split.parcelNumber) {
        parcelNumber = split.parcelNumber;
      }
    } else if (nfNumber && !parcelNumber) {
      const split = splitNfAndParcel(nfNumber);
      if (split.parcelNumber) {
        nfNumber = split.nfNumber;
        parcelNumber = split.parcelNumber;
      }
    }
    const emissionDate = parseCellDate(row[colIdx.emissionDate]);
    const boletoRaw = row[colIdx.boleto];
    const boleto = boletoRaw === null || boletoRaw === undefined ? null : String(boletoRaw).trim();
    const dueDate = parseCellDate(row[colIdx.dueDate]);
    const origNum = parseNumber(row[colIdx.originalValue]);
    const originalValue = origNum === null ? null : new Prisma.Decimal(origNum);
    const ocNumberRaw = row[colIdx.ocNumber];
    const ocNumber =
      ocNumberRaw === null || ocNumberRaw === undefined || ocNumberRaw === ''
        ? null
        : String(ocNumberRaw).trim();
    const finalNum = parseNumber(row[colIdx.finalValue]);
    const finalValue = finalNum === null ? null : new Prisma.Decimal(finalNum);
    const paidDate = parseCellDate(row[colIdx.paidDate]);
    const remainingDaysRaw = row[colIdx.remainingDays];
    let remainingDays: number | null = null;
    if (remainingDaysRaw !== null && remainingDaysRaw !== undefined && remainingDaysRaw !== '') {
      const n = typeof remainingDaysRaw === 'number'
        ? remainingDaysRaw
        : parseInt(String(remainingDaysRaw), 10);
      remainingDays = isNaN(n) ? null : n;
    }
    const receivedNoteRaw = row[colIdx.receivedNote];
    const receivedNote =
      receivedNoteRaw === null || receivedNoteRaw === undefined
        ? null
        : String(receivedNoteRaw).trim() || null;

    // Status: exportação (texto) → cor da linha (legado) → conteúdo (sem sobrescrever cor)
    let status: FinancialControlStatus;
    const statusFromExport =
      colIdx.statusText >= 0 ? parseStatusFromExportLabel(row[colIdx.statusText]) : null;
    const statusFromColor = resolveStatusFromRowColors(rowColors, colIdx.statusColumn);

    if (statusFromExport) {
      status = statusFromExport;
    } else if (statusFromColor) {
      status = statusFromColor;
      // Verde na planilha pode ser PAGO ou AGUARDAR NOTA — só refinamos nesse caso.
      if (status === 'PAGO') {
        const refined = inferStatus({ boleto, receivedNote, paidDate, finalValue });
        if (refined === 'AGUARDAR_NOTA') status = refined;
      }
    } else {
      status = inferStatus({ boleto, receivedNote, paidDate, finalValue });
    }

    const monthYearKey = `${paymentYear}-${paymentMonth}`;
    if (!monthsSet.has(monthYearKey)) {
      monthsSet.add(monthYearKey);
      monthsDetected.push({
        year: paymentYear,
        month: paymentMonth,
        label: `${Object.keys(MONTHS_PT_TO_NUM).find((k) => MONTHS_PT_TO_NUM[k] === paymentMonth) ?? paymentMonth} ${paymentYear}`,
      });
    }

    entries.push({
      paymentMonth,
      paymentYear,
      status,
      osCode,
      supplierName,
      nfNumber,
      parcelNumber,
      emissionDate,
      boleto,
      dueDate,
      originalValue,
      ocNumber,
      finalValue,
      paidDate,
      remainingDays,
      receivedNote,
      notes: null,
    });
  }

  if (!entries.length) {
    warnings.push(
      'Nenhuma linha válida encontrada. Verifique se a planilha contém cabeçalhos "PAGAMENTOS DE [MÊS] [ANO]" (formato legado) ou as colunas Mês/Ano (formato exportado pelo sistema).',
    );
  }

  return { entries, warnings, monthsDetected };
}
