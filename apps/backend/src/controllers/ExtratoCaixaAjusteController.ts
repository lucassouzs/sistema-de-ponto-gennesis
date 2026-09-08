import { Response, NextFunction } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export type ExtratoCaixaAjusteDto = {
  id: string;
  dataCompensacao: string;
  codCCusto: string;
  ccusto: string;
  codNatFinanceira: string;
  natureza: string;
  codFilial: number | null;
  fornecedor: string;
  valor: number;
  observacao: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

type AjusteBody = {
  dataCompensacao?: string;
  codCCusto?: string;
  ccusto?: string;
  codNatFinanceira?: string;
  natureza?: string;
  codFilial?: number | string | null;
  fornecedor?: string;
  valor?: number | string;
  observacao?: string | null;
};

function parseCalendarDateInput(value: unknown): Date | null {
  if (value == null || value === '') return null;
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const dt = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return isNaN(dt.getTime()) ? null : dt;
  }
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
}

function toDateString(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function decimalToNumber(value: Decimal | number): number {
  if (value instanceof Decimal) return value.toNumber();
  return Number(value);
}

function serialize(row: {
  id: string;
  dataCompensacao: Date;
  codCCusto: string;
  ccusto: string;
  codNatFinanceira: string;
  natureza: string;
  codFilial: number | null;
  fornecedor: string;
  valor: Decimal;
  observacao: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ExtratoCaixaAjusteDto {
  return {
    id: row.id,
    dataCompensacao: toDateString(row.dataCompensacao),
    codCCusto: row.codCCusto,
    ccusto: row.ccusto,
    codNatFinanceira: row.codNatFinanceira,
    natureza: row.natureza,
    codFilial: row.codFilial,
    fornecedor: row.fornecedor,
    valor: decimalToNumber(row.valor),
    observacao: row.observacao,
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function parseBody(body: AjusteBody) {
  const dataCompensacao = parseCalendarDateInput(body.dataCompensacao);
  if (!dataCompensacao) {
    throw new Error('Data de compensação é obrigatória (formato AAAA-MM-DD).');
  }

  const valorRaw = body.valor;
  const valor =
    typeof valorRaw === 'number'
      ? valorRaw
      : Number(String(valorRaw ?? '').replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(valor) || valor === 0) {
    throw new Error('Informe um valor de correção diferente de zero.');
  }

  let codFilial: number | null = null;
  if (body.codFilial != null && body.codFilial !== '') {
    const n = Number(body.codFilial);
    if (!Number.isFinite(n)) throw new Error('Filial inválida.');
    codFilial = n;
  }

  return {
    dataCompensacao,
    codCCusto: String(body.codCCusto ?? '').trim(),
    ccusto: String(body.ccusto ?? '').trim(),
    codNatFinanceira: String(body.codNatFinanceira ?? '').trim(),
    natureza: String(body.natureza ?? '').trim(),
    codFilial,
    fornecedor: String(body.fornecedor ?? '').trim(),
    valor: new Decimal(valor),
    observacao: body.observacao != null ? String(body.observacao).trim() || null : null
  };
}

export class ExtratoCaixaAjusteController {
  async list(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.extratoCaixaAjuste.findMany({
        orderBy: [{ dataCompensacao: 'desc' }, { createdAt: 'desc' }]
      });
      res.json({
        success: true,
        data: rows.map(serialize)
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = parseBody(req.body as AjusteBody);
      const row = await prisma.extratoCaixaAjuste.create({
        data: {
          ...data,
          createdById: req.user?.id ?? null
        }
      });
      res.status(201).json({ success: true, data: serialize(row) });
    } catch (error) {
      if (error instanceof Error && error.message) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = parseBody(req.body as AjusteBody);
      const row = await prisma.extratoCaixaAjuste.update({
        where: { id },
        data
      });
      res.json({ success: true, data: serialize(row) });
    } catch (error) {
      if (error instanceof Error && error.message) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await prisma.extratoCaixaAjuste.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}
