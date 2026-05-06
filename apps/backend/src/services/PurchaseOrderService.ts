import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { BorderService, BorderData } from './BorderService';

export type BoletoInstallmentPaymentStatus = 'PENDING_BOLETO' | 'AWAITING_PAYMENT' | 'PAID';

export type BoletoInstallmentStored = {
  amount: number;
  dueDate: string;
  boletoUrl: string | null;
  boletoName: string | null;
  paymentStatus?: BoletoInstallmentPaymentStatus | null;
  /** Comprovante do pagamento desta parcela (financeiro, enquanto AWAITING_PAYMENT ou após PAID) */
  installmentProofUrl?: string | null;
  installmentProofName?: string | null;
};

function normalizeParcelDueDaysJson(input: unknown): number[] {
  if (input == null) return [];
  if (Array.isArray(input)) {
    return input
      .map((x) => Math.round(Number(x)))
      .filter((n) => Number.isFinite(n) && n >= 0);
  }
  return [];
}

function parseStoredInstallments(raw: unknown): BoletoInstallmentStored[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw.map((x: Record<string, unknown>) => {
    const ps = x.paymentStatus;
    const paymentStatus =
      ps === 'PENDING_BOLETO' || ps === 'AWAITING_PAYMENT' || ps === 'PAID' ? ps : undefined;
    const ipu = x.installmentProofUrl;
    const ipn = x.installmentProofName;
    return {
      amount: Number(x.amount),
      dueDate: typeof x.dueDate === 'string' ? x.dueDate.slice(0, 10) : '',
      boletoUrl: typeof x.boletoUrl === 'string' && x.boletoUrl.trim() ? String(x.boletoUrl).trim() : null,
      boletoName: typeof x.boletoName === 'string' && x.boletoName.trim() ? String(x.boletoName).trim() : null,
      paymentStatus,
      installmentProofUrl:
        typeof ipu === 'string' && ipu.trim() ? String(ipu).trim() : null,
      installmentProofName:
        typeof ipn === 'string' && ipn.trim() ? String(ipn).trim() : null
    };
  });
}

function rowStatus(row: BoletoInstallmentStored | undefined): BoletoInstallmentPaymentStatus {
  const s = row?.paymentStatus;
  if (s === 'PAID' || s === 'AWAITING_PAYMENT' || s === 'PENDING_BOLETO') return s;
  return 'PENDING_BOLETO';
}

/** Todas as parcelas com boleto e sem paymentStatus (cadastro antigo). */
function isLegacyBulkNoExplicitStatus(inst: BoletoInstallmentStored[], parcelCount: number): boolean {
  if (inst.length < parcelCount) return false;
  for (let i = 0; i < parcelCount; i++) {
    if (!((inst[i]?.boletoUrl || '').trim())) return false;
    if (inst[i]?.paymentStatus) return false;
  }
  return true;
}

function allMultiInstallmentsPaid(
  inst: BoletoInstallmentStored[],
  parcelCount: number
): boolean {
  if (inst.length < parcelCount) return false;
  for (let i = 0; i < parcelCount; i++) {
    if (rowStatus(inst[i]) !== 'PAID') return false;
  }
  return true;
}

export type NfAttachmentStored = {
  url: string;
  name: string | null;
  uploadedAt: string;
};

function parseNfAttachments(raw: unknown): NfAttachmentStored[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: NfAttachmentStored[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const rec = x as Record<string, unknown>;
    const u = typeof rec.url === 'string' ? rec.url.trim() : '';
    if (!u) continue;
    const name =
      typeof rec.name === 'string' && rec.name.trim() ? String(rec.name).trim() : null;
    const uploadedAt =
      typeof rec.uploadedAt === 'string' && rec.uploadedAt.trim()
        ? String(rec.uploadedAt).trim()
        : new Date().toISOString();
    out.push({ url: u, name, uploadedAt });
  }
  return out;
}

/** Departamento financeiro ou cargo Administrador (mesma regra do front em gerenciar materiais). */
async function assertUserIsFinanceOrAdmin(
  userId: string | undefined,
  errorMessage = 'Apenas o financeiro pode realizar esta ação'
): Promise<void> {
  if (!userId) {
    throw new Error('Usuário não autenticado');
  }
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { department: true, position: true } } }
  });
  const pos = row?.employee?.position?.trim();
  const dept = (row?.employee?.department || '').toLowerCase();
  if (pos === 'Administrador' || dept.includes('financeiro')) return;
  throw new Error(errorMessage);
}

async function resolvePaymentProofUrlForOrder(order: {
  paymentProofUrl: string | null;
  paymentType: string | null;
  paymentCondition: string | null;
  paymentBoletoInstallments: unknown;
}): Promise<string> {
  let proofUrl = (order.paymentProofUrl || '').trim();
  if (proofUrl) return proofUrl;
  if (order.paymentType === 'BOLETO') {
    const [meta] = await enrichOrdersParcelPlans([
      { paymentCondition: order.paymentCondition }
    ]);
    if (meta.paymentParcelCount > 1) {
      const inst = parseStoredInstallments(order.paymentBoletoInstallments);
      if (allMultiInstallmentsPaid(inst, meta.paymentParcelCount)) {
        const last = inst[meta.paymentParcelCount - 1];
        const u = (last?.installmentProofUrl || '').trim();
        if (u) return u;
      }
    }
  }
  return '';
}

function ymdAddDays(ymdOrDate: Date | string, addDays: number): string {
  const d = typeof ymdOrDate === 'string' ? new Date(ymdOrDate) : new Date(ymdOrDate);
  if (Number.isNaN(d.getTime())) {
    const t = new Date();
    t.setDate(t.getDate() + addDays);
    return t.toISOString().slice(0, 10);
  }
  d.setDate(d.getDate() + addDays);
  return d.toISOString().slice(0, 10);
}

async function enrichOrdersParcelPlans<T extends { paymentCondition: string | null }>(
  orders: T[]
): Promise<Array<T & { paymentParcelCount: number; paymentParcelDueDays: number[] }>> {
  const codes = [...new Set(orders.map((o) => o.paymentCondition).filter(Boolean))] as string[];
  const condMap = new Map<string, { parcelCount: number; parcelDueDays: unknown }>();
  if (codes.length > 0) {
    const conds = await prisma.paymentCondition.findMany({ where: { code: { in: codes } } });
    for (const c of conds) condMap.set(c.code, { parcelCount: c.parcelCount, parcelDueDays: c.parcelDueDays });
  }
  return orders.map((o) => {
    const c = o.paymentCondition ? condMap.get(o.paymentCondition) : undefined;
    const paymentParcelCount = c?.parcelCount && c.parcelCount >= 1 ? c.parcelCount : 1;
    const paymentParcelDueDays = normalizeParcelDueDaysJson(c?.parcelDueDays);
    return { ...o, paymentParcelCount, paymentParcelDueDays };
  });
}

export interface CreatePurchaseOrderData {
  materialRequestId?: string;
  quoteMapId?: string;
  supplierId: string;
  expectedDelivery?: Date;
  deliveryAddress?: string;
  paymentType?: string;
  paymentCondition?: string;
  paymentDetails?: string;
  boletoAttachmentUrl?: string;
  boletoAttachmentName?: string;
  /** Frete (R$). Total a pagar gravado = soma dos itens + frete. */
  freightAmount?: number;
  /** @deprecated Ignorado: o total é sempre calculado como itens + frete. */
  amountToPay?: number;
  notes?: string;
  items: {
    materialRequestItemId?: string;
    materialId: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    notes?: string;
  }[];
}

export interface UpdatePurchaseOrderDetailsData {
  supplierId?: string;
  expectedDelivery?: Date | string | null;
  deliveryAddress?: string | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentDetails?: string | null;
  freightAmount?: number | string | null;
  notes?: string | null;
  items?: {
    materialRequestItemId?: string | null;
    materialId: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    notes?: string | null;
  }[];
}

async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `OC-${year}-`;
  const last = await prisma.purchaseOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' }
  });
  let n = 1;
  if (last) {
    const num = parseInt(last.orderNumber.replace(prefix, ''), 10);
    if (!isNaN(num)) n = num + 1;
  }
  return `${prefix}${n.toString().padStart(4, '0')}`;
}

/** Listagem: menos joins aninhados para listas grandes (detalhe via getById). */
const purchaseOrderIncludeList = {
  supplier: true,
  quoteMap: { select: { id: true, createdAt: true } },
  materialRequest: {
    select: {
      id: true,
      requestNumber: true,
      serviceOrder: true,
      description: true,
      costCenter: { select: { id: true, code: true, name: true } }
    }
  },
  creator: { select: { id: true, name: true, email: true } },
  items: { include: { material: true, materialRequestItem: true } }
} as const;

const purchaseOrderIncludeDetail = {
  supplier: true,
  quoteMap: {
    include: {
      suppliers: { include: { supplier: true } },
      winners: { include: { winnerSupplier: true, materialRequestItem: { include: { material: true } } } }
    }
  },
  materialRequest: {
    include: {
      requester: true,
      costCenter: true,
      items: { include: { material: true } },
      quoteMaps: { orderBy: { createdAt: 'desc' as const }, take: 1 }
    }
  },
  creator: { select: { id: true, name: true, email: true } },
  items: { include: { material: true, materialRequestItem: true } }
} as const;

export class PurchaseOrderService {
  async create(data: CreatePurchaseOrderData, userId: string) {
    if (!data.supplierId || !data.items?.length) {
      throw new Error('Fornecedor e itens são obrigatórios');
    }

    let maxQtyByRmItem: Map<string, Decimal> | null = null;
    if (data.materialRequestId) {
      const rm = await prisma.materialRequest.findUnique({
        where: { id: data.materialRequestId },
        select: { items: { select: { id: true, quantity: true } } }
      });
      if (rm?.items?.length) {
        maxQtyByRmItem = new Map(rm.items.map((it) => [it.id, new Decimal(it.quantity)]));
      }
    }

    const orderNumber = await generateOrderNumber();
    const items = data.items.map((i) => {
      const qty = new Decimal(i.quantity);
      if (maxQtyByRmItem && i.materialRequestItemId) {
        const maxQ = maxQtyByRmItem.get(i.materialRequestItemId);
        if (!maxQ) throw new Error('Item da requisição inválido na OC');
        if (qty.lte(0)) throw new Error('Quantidade deve ser maior que zero');
        if (qty.gt(maxQ)) throw new Error('Quantidade da OC não pode exceder a solicitada na SC');
      }
      const price = new Decimal(i.unitPrice);
      const total = qty.mul(price);
      return {
        materialRequestItemId: i.materialRequestItemId || null,
        materialId: i.materialId,
        quantity: qty,
        unit: i.unit,
        unitPrice: price,
        totalPrice: total,
        notes: i.notes || null
      };
    });
    const freight =
      data.freightAmount !== undefined && data.freightAmount !== null && !Number.isNaN(Number(data.freightAmount))
        ? new Decimal(data.freightAmount)
        : new Decimal(0);
    if (freight.lt(0)) {
      throw new Error('Frete não pode ser negativo');
    }
    const itemsSum = items.reduce((s, row) => s.plus(row.totalPrice), new Decimal(0));
    const amountToPay = itemsSum.plus(freight);

    const createDataBase = {
      orderNumber,
      materialRequestId: data.materialRequestId || null,
      quoteMapId: data.quoteMapId || null,
      supplierId: data.supplierId,
      expectedDelivery: data.expectedDelivery || null,
      deliveryAddress: data.deliveryAddress || null,
      paymentType: data.paymentType || null,
      paymentCondition: data.paymentCondition || null,
      paymentDetails: data.paymentDetails || null,
      boletoAttachmentUrl: data.boletoAttachmentUrl || null,
      boletoAttachmentName: data.boletoAttachmentName || null,
      freightAmount: freight,
      amountToPay,
      notes: data.notes || null,
      createdBy: userId,
      items: { create: items }
    } as const;

    try {
      return await prisma.purchaseOrder.create({
        data: { ...createDataBase, status: 'PENDING_COMPRAS' as any },
        include: purchaseOrderIncludeDetail
      });
    } catch (error: any) {
      const msg = typeof error?.message === 'string' ? error.message : '';
      const isPrismaValidation = error?.name === 'PrismaClientValidationError' && msg;
      // Compatibilidade temporária: Prisma Client antigo sem enum / campo.
      if (isPrismaValidation && msg.includes('PENDING_COMPRAS')) {
        return await prisma.purchaseOrder.create({
          data: { ...createDataBase, status: 'PENDING' as any },
          include: purchaseOrderIncludeDetail
        });
      }
      if (isPrismaValidation && msg.includes('quoteMapId') && createDataBase.quoteMapId) {
        const { quoteMapId: _omit, ...withoutQuote } = createDataBase as typeof createDataBase & { quoteMapId?: string | null };
        return await prisma.purchaseOrder.create({
          data: { ...withoutQuote, status: 'PENDING_COMPRAS' as any },
          include: purchaseOrderIncludeDetail
        });
      }
      throw error;
    }
  }

  private buildPurchaseOrderListWhere(filters: {
    status?: string;
    supplierId?: string;
    materialRequestId?: string;
    costCenterId?: string;
    orderDateFrom?: string;
    orderDateTo?: string;
    q?: string;
  }): Record<string, unknown> {
    const where: Record<string, unknown> = {};
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.materialRequestId) where.materialRequestId = filters.materialRequestId;

    const andParts: object[] = [];

    if (filters.costCenterId) {
      andParts.push({ materialRequest: { costCenterId: filters.costCenterId } });
    }

    if (filters.status) {
      const parts = filters.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (parts.length > 1) {
        andParts.push({ status: { in: parts } });
      } else if (parts.length === 1) {
        where.status = parts[0];
      }
    }

    if (filters.orderDateFrom || filters.orderDateTo) {
      const range: { gte?: Date; lte?: Date } = {};
      if (filters.orderDateFrom) {
        const d = new Date(filters.orderDateFrom);
        if (!Number.isNaN(d.getTime())) range.gte = d;
      }
      if (filters.orderDateTo) {
        const d = new Date(filters.orderDateTo);
        if (!Number.isNaN(d.getTime())) {
          d.setHours(23, 59, 59, 999);
          range.lte = d;
        }
      }
      if (range.gte || range.lte) {
        andParts.push({ orderDate: range });
      }
    }

    if (filters.q?.trim()) {
      const q = filters.q.trim();
      andParts.push({
        OR: [
          { orderNumber: { contains: q, mode: 'insensitive' as const } },
          { supplier: { name: { contains: q, mode: 'insensitive' as const } } },
          { materialRequest: { requestNumber: { contains: q, mode: 'insensitive' as const } } }
        ]
      });
    }

    if (andParts.length > 0) {
      where.AND = andParts;
    }
    return where;
  }

  async list(filters: {
    status?: string;
    supplierId?: string;
    materialRequestId?: string;
    costCenterId?: string;
    orderDateFrom?: string;
    orderDateTo?: string;
    q?: string;
    page?: number;
    limit?: number;
  }) {
    const where = this.buildPurchaseOrderListWhere(filters);
    const page = filters.page || 1;
    const limit = Math.min(Math.max(filters.limit || 20, 1), 100);
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderDate: 'desc' },
        include: purchaseOrderIncludeList
      }),
      prisma.purchaseOrder.count({ where })
    ]);
    const enriched = await enrichOrdersParcelPlans(orders);
    return { orders: enriched, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  /**
   * CSV (UTF-8 com BOM) — OCs finalizadas ou enviadas (legado), com os mesmos filtros da listagem.
   */
  async exportFinalizedOrdersCsv(filters: {
    supplierId?: string;
    costCenterId?: string;
    orderDateFrom?: string;
    orderDateTo?: string;
    q?: string;
  }): Promise<string> {
    const where = this.buildPurchaseOrderListWhere({
      status: 'FINALIZED,SENT',
      supplierId: filters.supplierId,
      costCenterId: filters.costCenterId,
      orderDateFrom: filters.orderDateFrom,
      orderDateTo: filters.orderDateTo,
      q: filters.q
    });
    const orders = await prisma.purchaseOrder.findMany({
      where,
      take: 25_000,
      orderBy: { orderDate: 'desc' },
      include: purchaseOrderIncludeList
    });
    const rows = await enrichOrdersParcelPlans(orders);

    const esc = (v: string | number | null | undefined) => {
      const s = v == null || v === '' ? '' : String(v);
      if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };

    const header = [
      'Nº OC',
      'Data OC',
      'Centro de custo',
      'Fornecedor',
      'CNPJ Fornecedor',
      'SC',
      'OS',
      'Status',
      'Tipo pagamento',
      'Condição',
      'Valor itens',
      'Frete',
      'Valor a pagar',
      'Criador',
      'Atualizado em'
    ];

    const lines = [header.join(';')];
    for (const o of rows) {
      const itemsTotal = (o.items || []).reduce((s, it) => s + Number(it.totalPrice || 0), 0);
      const cc = o.materialRequest?.costCenter as { code?: string; name?: string } | undefined;
      const ccLabel = cc ? [cc.code, cc.name].filter(Boolean).join(' — ') : '';
      const freightNum = o.freightAmount != null ? Number(o.freightAmount) : 0;
      lines.push(
        [
          esc(o.orderNumber),
          esc(o.orderDate ? new Date(o.orderDate).toLocaleDateString('pt-BR') : ''),
          esc(ccLabel),
          esc(o.supplier?.name),
          esc(o.supplier?.cnpj),
          esc(o.materialRequest?.requestNumber),
          esc(o.materialRequest?.serviceOrder),
          esc(o.status),
          esc(o.paymentType),
          esc(o.paymentCondition),
          esc(itemsTotal.toFixed(2).replace('.', ',')),
          esc(Number.isFinite(freightNum) ? freightNum.toFixed(2).replace('.', ',') : ''),
          esc(o.amountToPay != null ? Number(o.amountToPay).toFixed(2).replace('.', ',') : ''),
          esc(o.creator?.name),
          esc(o.updatedAt ? new Date(o.updatedAt).toLocaleString('pt-BR') : '')
        ].join(';')
      );
    }
    return `\uFEFF${lines.join('\n')}`;
  }

  async getById(id: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: purchaseOrderIncludeDetail
    });
    if (!order) return null;
    const [withPlan] = await enrichOrdersParcelPlans([order]);
    return withPlan;
  }

  async updateStatus(
    id: string,
    status: string,
    userId?: string,
    options?: { rejectionReason?: string }
  ) {
    const order = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }

    const st = order.status;

    // Fase 1 (compras): PENDING_COMPRAS | DRAFT → PENDING
    if (status === 'PENDING') {
      if (st !== 'PENDING_COMPRAS' && st !== 'DRAFT') {
        throw new Error('Apenas OC em rascunho ou na fase de compras pode seguir para aprovação do gestor');
      }
    }

    // Fase 2 (gestor): PENDING → PENDING_DIRETORIA
    if (status === 'PENDING_DIRETORIA') {
      if (st !== 'PENDING') {
        throw new Error('Apenas OC na fase do gestor pode seguir para aprovação da diretoria');
      }
    }

    // 2ª fase (diretoria): PENDING_DIRETORIA → APPROVED
    if (status === 'APPROVED') {
      if (st !== 'PENDING_DIRETORIA') {
        throw new Error('A OC só pode ser aprovada após aprovação do gestor (fase diretoria)');
      }
    }

    if (status === 'IN_REVIEW') {
      if (st !== 'PENDING_COMPRAS' && st !== 'PENDING' && st !== 'DRAFT' && st !== 'PENDING_DIRETORIA') {
        throw new Error('Apenas OC nas fases de aprovação ou rascunho pode ir para correção');
      }
    }

    if (status === 'REJECTED') {
      if (st !== 'PENDING_COMPRAS' && st !== 'PENDING' && st !== 'DRAFT' && st !== 'PENDING_DIRETORIA') {
        throw new Error('Apenas OC pendente de aprovação pode ser reprovada');
      }
    }

    if (status === 'PENDING_COMPRAS' && st === 'IN_REVIEW') {
      if (!userId || order.createdBy !== userId) {
        throw new Error('Apenas quem criou a OC pode reenviá-la após correção');
      }
    }

    let fillPaymentProofFromLastInstallment: { paymentProofUrl: string; paymentProofName: string | null } | null =
      null;

    if (status === 'PENDING_PROOF_CORRECTION') {
      if (st !== 'PENDING_PROOF_VALIDATION') {
        throw new Error('Apenas OC em validação do comprovante pode ir para correção do comprovante');
      }
    }

    // Pagamento (ou correção) → validação do comprovante (exige comprovante anexado)
    if (status === 'PENDING_PROOF_VALIDATION') {
      if (st !== 'APPROVED' && st !== 'PENDING_PROOF_CORRECTION') {
        throw new Error(
          'Apenas OC na fase Pagamento ou em correção do comprovante pode ser enviada para validação do comprovante'
        );
      }
      if (st === 'PENDING_PROOF_CORRECTION') {
        await assertUserIsFinanceOrAdmin(
          userId,
          'Apenas o financeiro pode reenviar o comprovante para validação após correção'
        );
      }
      if (order.paymentType === 'BOLETO' && !order.paymentBoletoPhaseReleased) {
        throw new Error(
          'Envie a OC para a fase Pagamento (botão após anexar o boleto) antes de enviar o comprovante para validação'
        );
      }
      let proofUrl = (order.paymentProofUrl || '').trim();
      let proofName = ((order.paymentProofName || '').trim() || null) as string | null;

      if (order.paymentType === 'BOLETO') {
        const [meta] = await enrichOrdersParcelPlans([order]);
        if (meta.paymentParcelCount > 1) {
          const inst = parseStoredInstallments(order.paymentBoletoInstallments);
          if (!allMultiInstallmentsPaid(inst, meta.paymentParcelCount)) {
            throw new Error(
              'Aguarde o pagamento de todas as parcelas antes de enviar o comprovante para validação'
            );
          }
          if (!proofUrl) {
            const last = inst[meta.paymentParcelCount - 1];
            const fromLast = (last?.installmentProofUrl || '').trim();
            if (fromLast) {
              proofUrl = fromLast;
              proofName = ((last?.installmentProofName || '').trim() || null) as string | null;
            }
          }
        }
      }

      if (!proofUrl) {
        throw new Error('Anexe o comprovante de pagamento antes de enviar para validação');
      }

      if (!(order.paymentProofUrl || '').trim() && proofUrl) {
        fillPaymentProofFromLastInstallment = { paymentProofUrl: proofUrl, paymentProofName: proofName };
      }
    }

    if (status === 'PENDING_NF_ATTACHMENT') {
      if (st !== 'PENDING_PROOF_VALIDATION') {
        throw new Error('Apenas OC em validação de comprovante pode seguir para anexo de NF');
      }
      const forProof = await prisma.purchaseOrder.findUnique({
        where: { id },
        select: {
          paymentProofUrl: true,
          paymentType: true,
          paymentCondition: true,
          paymentBoletoInstallments: true
        }
      });
      if (!forProof) {
        throw new Error('Ordem de compra não encontrada');
      }
      const p = await resolvePaymentProofUrlForOrder(forProof);
      if (!p) {
        throw new Error('Registre o comprovante de pagamento antes de liberar a fase de anexo de NF');
      }
    }

    if (status === 'FINALIZED') {
      if (st !== 'PENDING_NF_ATTACHMENT') {
        throw new Error('A OC só pode ser finalizada após anexar a(s) nota(s) fiscal(is)');
      }
      if (!userId) {
        throw new Error('Usuário não autenticado');
      }
      const row = await prisma.purchaseOrder.findUnique({
        where: { id },
        select: { nfAttachments: true, createdBy: true }
      });
      if (!row) {
        throw new Error('Ordem de compra não encontrada');
      }
      if (row.createdBy !== userId) {
        throw new Error('Apenas quem criou a OC pode finalizar após anexar as notas fiscais');
      }
      const nfs = parseNfAttachments(row.nfAttachments);
      if (nfs.length === 0) {
        throw new Error('Anexe ao menos uma nota fiscal antes de finalizar a OC');
      }
    }

    const data: any = {
      status,
      updatedAt: new Date(),
      ...(fillPaymentProofFromLastInstallment || {})
    };

    if (status === 'APPROVED' && userId) {
      data.approvedBy = userId;
      data.approvedAt = new Date();
    }

    if (
      status === 'IN_REVIEW' ||
      status === 'REJECTED' ||
      status === 'PENDING' ||
      status === 'PENDING_DIRETORIA' ||
      (status === 'PENDING_COMPRAS' && st === 'IN_REVIEW')
    ) {
      data.approvedBy = null;
      data.approvedAt = null;
    }

    if (status === 'REJECTED' && options?.rejectionReason) {
      const note = `[Reprovação ${new Date().toLocaleString('pt-BR')}] ${options.rejectionReason}`;
      data.notes = order.notes ? `${order.notes}\n\n${note}` : note;
    }

    if (status === 'PENDING_PROOF_CORRECTION' && options?.rejectionReason?.trim()) {
      const note = `[Correção comprovante ${new Date().toLocaleString('pt-BR')}] ${options.rejectionReason.trim()}`;
      data.notes = order.notes ? `${order.notes}\n\n${note}` : note;
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data,
      include: purchaseOrderIncludeDetail
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  async updateDetails(id: string, data: UpdatePurchaseOrderDetailsData, userId?: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, status: true, createdBy: true, freightAmount: true }
    });

    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }

    if (!userId || order.createdBy !== userId) {
      throw new Error('Apenas o criador da OC pode editar a OC em correção');
    }

    if (order.status !== 'IN_REVIEW') {
      throw new Error('A OC só pode ser editada durante a CORREÇÃO OC');
    }

    const expectedDelivery =
      data.expectedDelivery !== undefined && data.expectedDelivery !== null && data.expectedDelivery !== ''
        ? new Date(data.expectedDelivery)
        : null;

    let freightToStore: Decimal;
    if (data.freightAmount !== undefined && data.freightAmount !== null && data.freightAmount !== '') {
      freightToStore = new Decimal(Number(data.freightAmount));
    } else {
      freightToStore =
        order.freightAmount != null ? new Decimal(order.freightAmount) : new Decimal(0);
    }
    if (freightToStore.lt(0)) {
      throw new Error('Frete não pode ser negativo');
    }

    const supplierId = data.supplierId;
    const items = data.items;

    await prisma.$transaction(async (tx) => {
      let itemsSum = new Decimal(0);

      if (items && Array.isArray(items)) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        const createdItems = items.map((i) => {
          const qty = new Decimal(i.quantity);
          const price = new Decimal(i.unitPrice);
          const total = qty.mul(price);
          itemsSum = itemsSum.plus(total);
          return {
            purchaseOrderId: id,
            materialRequestItemId: i.materialRequestItemId ?? null,
            materialId: i.materialId,
            quantity: qty,
            unit: i.unit,
            unitPrice: price,
            totalPrice: total,
            notes: i.notes ?? null
          };
        });
        if (createdItems.length > 0) {
          await tx.purchaseOrderItem.createMany({ data: createdItems });
        }
      } else {
        const rows = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: id } });
        itemsSum = rows.reduce((s, it) => s.plus(new Decimal(it.totalPrice)), new Decimal(0));
      }

      const amountToPay = itemsSum.plus(freightToStore);

      await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: supplierId !== undefined ? supplierId : undefined,
          expectedDelivery,
          deliveryAddress: data.deliveryAddress !== undefined ? data.deliveryAddress : undefined,
          paymentType: data.paymentType !== undefined ? data.paymentType : undefined,
          paymentCondition: data.paymentCondition !== undefined ? data.paymentCondition : undefined,
          paymentDetails: data.paymentDetails !== undefined ? data.paymentDetails : undefined,
          freightAmount: freightToStore,
          amountToPay,
          notes: data.notes !== undefined ? data.notes : undefined,
          updatedAt: new Date()
        }
      });
    });

    return await this.getById(id);
  }

  /**
   * Financeiro: anexa boleto para pagamento em OC já aprovada, tipo BOLETO.
   * Compatível só com 1 parcela; com várias parcelas use savePaymentBoletoInstallments.
   */
  async attachPaymentBoleto(
    id: string,
    data: { paymentBoletoUrl: string; paymentBoletoName?: string },
    _userId?: string
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        orderDate: true,
        amountToPay: true
      }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível anexar boleto de pagamento em OC aprovada');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Anexo de boleto para pagamento aplica-se apenas a OC com pagamento em boleto');
    }
    const [meta] = await enrichOrdersParcelPlans([order]);
    if (meta.paymentParcelCount > 1) {
      throw new Error(
        'Esta OC tem várias parcelas na condição de pagamento. Use o formulário de parcelas para anexar cada boleto.'
      );
    }
    const url = (data.paymentBoletoUrl || '').trim();
    if (!url) {
      throw new Error('URL do arquivo do boleto é obrigatória');
    }
    const name = (data.paymentBoletoName || '').trim() || null;
    const amt =
      order.amountToPay != null && String(order.amountToPay).trim() !== ''
        ? Number(order.amountToPay)
        : 0;
    const days = meta.paymentParcelDueDays[0] ?? 30;
    const due = ymdAddDays(order.orderDate, days);
    const row: BoletoInstallmentStored = {
      amount: Number.isFinite(amt) ? amt : 0,
      dueDate: due,
      boletoUrl: url,
      boletoName: name,
      paymentStatus: 'PENDING_BOLETO'
    };
    return await prisma.purchaseOrder.update({
      where: { id },
      data: {
        paymentBoletoUrl: url,
        paymentBoletoName: name,
        paymentBoletoInstallments: [row] as unknown as Prisma.InputJsonValue,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeDetail
    }).then(async (o) => {
      const [e] = await enrichOrdersParcelPlans([o]);
      return e;
    });
  }

  /**
   * Grava todas as parcelas de boleto (valor, vencimento, anexo por parcela).
   */
  async savePaymentBoletoInstallments(
    id: string,
    body: {
      installments: Array<{
        amount: number;
        dueDate: string;
        boletoUrl?: string | null;
        boletoName?: string | null;
      }>;
    },
    _userId?: string
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoInstallments: true
      }
    });
    if (!order) throw new Error('Ordem de compra não encontrada');
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível registrar boletos em OC aprovada');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Parcelas de boleto aplicam-se apenas a OC com pagamento em boleto');
    }
    const [meta] = await enrichOrdersParcelPlans([order]);
    const parcelCount = meta.paymentParcelCount;
    if (body.installments.length !== parcelCount) {
      throw new Error(`Envie exatamente ${parcelCount} parcela(s), conforme a condição de pagamento.`);
    }
    const existing = parseStoredInstallments(order.paymentBoletoInstallments);
    const merged: BoletoInstallmentStored[] = body.installments.map((row, i) => {
      const prev = existing[i] || {};
      const prevSt = rowStatus(prev);
      if (prevSt === 'AWAITING_PAYMENT' || prevSt === 'PAID') {
        return {
          amount: prev.amount,
          dueDate: prev.dueDate,
          boletoUrl: prev.boletoUrl,
          boletoName: prev.boletoName,
          paymentStatus: prevSt,
          installmentProofUrl: prev.installmentProofUrl ?? null,
          installmentProofName: prev.installmentProofName ?? null
        };
      }
      const urlIn = row.boletoUrl;
      const url =
        urlIn !== undefined && urlIn !== null && String(urlIn).trim() !== ''
          ? String(urlIn).trim()
          : prev.boletoUrl || null;
      const nameIn = row.boletoName;
      const name =
        nameIn !== undefined && nameIn !== null && String(nameIn).trim() !== ''
          ? String(nameIn).trim()
          : url
            ? prev.boletoName || null
            : null;
      const amount = Number(row.amount);
      const dueDate = String(row.dueDate || '').trim().slice(0, 10);
      return {
        amount,
        dueDate,
        boletoUrl: url,
        boletoName: name,
        paymentStatus: 'PENDING_BOLETO' as const
      };
    });
    for (const m of merged) {
      if (!Number.isFinite(m.amount) || m.amount < 0) {
        throw new Error('Valor da parcela inválido');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(m.dueDate)) {
        throw new Error('Data de vencimento inválida (use AAAA-MM-DD)');
      }
    }
    const data: Prisma.PurchaseOrderUpdateInput = {
      paymentBoletoInstallments: merged as unknown as Prisma.InputJsonValue,
      updatedAt: new Date()
    };
    if (parcelCount === 1 && merged[0]?.boletoUrl) {
      data.paymentBoletoUrl = merged[0].boletoUrl;
      data.paymentBoletoName = merged[0].boletoName;
    } else if (parcelCount === 1 && !merged[0]?.boletoUrl) {
      data.paymentBoletoUrl = null;
      data.paymentBoletoName = null;
    } else {
      data.paymentBoletoUrl = null;
      data.paymentBoletoName = null;
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data,
      include: purchaseOrderIncludeDetail
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Anexa comprovante de pagamento na fase Pagamento (OC aprovada).
   */
  async attachPaymentProof(
    id: string,
    data: { paymentProofUrl: string; paymentProofName?: string },
    userId?: string
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, status: true, paymentType: true, paymentBoletoPhaseReleased: true }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED' && order.status !== 'PENDING_PROOF_CORRECTION') {
      throw new Error(
        'Só é possível anexar comprovante na fase Pagamento ou em correção do comprovante'
      );
    }
    if (order.status === 'PENDING_PROOF_CORRECTION') {
      await assertUserIsFinanceOrAdmin(
        userId,
        'Apenas o financeiro pode anexar ou substituir o comprovante nesta fase'
      );
    }
    if (order.paymentType === 'BOLETO' && !order.paymentBoletoPhaseReleased) {
      throw new Error(
        'Confirme o envio para a fase Pagamento (botão após anexar o boleto) antes de anexar o comprovante'
      );
    }
    if (order.paymentType === 'BOLETO') {
      const full = await prisma.purchaseOrder.findUnique({
        where: { id },
        select: { paymentCondition: true, paymentBoletoInstallments: true }
      });
      if (full) {
        const [meta] = await enrichOrdersParcelPlans([{ paymentCondition: full.paymentCondition }]);
        const n = meta.paymentParcelCount;
        if (n > 1) {
          const inst = parseStoredInstallments(full.paymentBoletoInstallments);
          if (!allMultiInstallmentsPaid(inst, n)) {
            throw new Error(
              'Aguarde o pagamento de todas as parcelas (financeiro libera cada uma) antes de anexar o comprovante'
            );
          }
        }
      }
    }
    const url = (data.paymentProofUrl || '').trim();
    if (!url) {
      throw new Error('Arquivo do comprovante é obrigatório');
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        paymentProofUrl: url,
        paymentProofName: (data.paymentProofName || '').trim() || null,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeDetail
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Comprador: anexa uma NF na fase após validação do comprovante (pode repetir quantas vezes precisar).
   */
  async appendNfAttachment(
    id: string,
    data: { nfUrl: string; nfName?: string | null },
    userId?: string
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, status: true, createdBy: true, nfAttachments: true }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'PENDING_NF_ATTACHMENT') {
      throw new Error('Só é possível anexar NF quando a OC está na fase Anexar NF');
    }
    if (!userId || order.createdBy !== userId) {
      throw new Error('Apenas quem criou a OC pode anexar notas fiscais nesta fase');
    }
    const url = (data.nfUrl || '').trim();
    if (!url) {
      throw new Error('Arquivo da nota fiscal é obrigatório');
    }
    const name = (data.nfName || '').trim() || null;
    const list = parseNfAttachments(order.nfAttachments);
    list.push({
      url,
      name,
      uploadedAt: new Date().toISOString()
    });
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        nfAttachments: list as unknown as Prisma.InputJsonValue,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeDetail
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Comprador: remove uma NF anexada (ainda na fase Anexar NF).
   */
  async removeNfAttachment(id: string, index: number, userId?: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, status: true, createdBy: true, nfAttachments: true }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'PENDING_NF_ATTACHMENT') {
      throw new Error('Só é possível remover NF na fase Anexar NF');
    }
    if (!userId || order.createdBy !== userId) {
      throw new Error('Apenas quem criou a OC pode remover notas fiscais nesta fase');
    }
    const list = parseNfAttachments(order.nfAttachments);
    if (!Number.isInteger(index) || index < 0 || index >= list.length) {
      throw new Error('Índice da nota fiscal inválido');
    }
    list.splice(index, 1);
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        nfAttachments: list.length > 0 ? (list as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeDetail
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Comprador envia a parcela atual para o financeiro pagar (uma de cada vez em multi-parcela).
   */
  async releasePaymentBoletoPhase(id: string, _userId?: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoUrl: true,
        paymentBoletoInstallments: true,
        paymentBoletoPhaseReleased: true
      }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível confirmar fase Pagamento em OC aprovada');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Confirmação aplica-se apenas a OC com pagamento em boleto');
    }
    if (order.paymentBoletoPhaseReleased) {
      throw new Error('Esta OC já está com o financeiro para a parcela atual');
    }
    const [meta] = await enrichOrdersParcelPlans([order]);
    const n = meta.paymentParcelCount;

    if (n <= 1) {
      if (!((order.paymentBoletoUrl || '').trim())) {
        throw new Error('Anexe o boleto antes de enviar para a fase Pagamento');
      }
    } else {
      let inst = parseStoredInstallments(order.paymentBoletoInstallments);
      if (inst.length < n) {
        throw new Error('Registre as parcelas (valores e vencimentos) antes de enviar o boleto');
      }
      if (isLegacyBulkNoExplicitStatus(inst, n)) {
        inst = inst.map((row, i) => ({
          ...row,
          paymentStatus: (i === 0 ? 'AWAITING_PAYMENT' : 'PENDING_BOLETO') as BoletoInstallmentPaymentStatus
        }));
        const updated = await prisma.purchaseOrder.update({
          where: { id },
          data: {
            paymentBoletoInstallments: inst as unknown as Prisma.InputJsonValue,
            paymentBoletoUrl: null,
            paymentBoletoName: null,
            paymentBoletoPhaseReleased: true,
            updatedAt: new Date()
          },
          include: purchaseOrderIncludeDetail
        });
        const [e] = await enrichOrdersParcelPlans([updated]);
        return e;
      }
      for (let i = 0; i < n; i++) {
        const st = rowStatus(inst[i]);
        if (st === 'PAID') continue;
        if (st === 'AWAITING_PAYMENT') {
          throw new Error('Aguarde o financeiro registrar o pagamento desta parcela antes de enviar outra');
        }
        if (st === 'PENDING_BOLETO') {
          if (!((inst[i]?.boletoUrl || '').trim())) {
            throw new Error(`Anexe o boleto da parcela ${i + 1} antes de enviar para a fase Pagamento`);
          }
          const next = inst.map((row, j) =>
            j === i ? { ...row, paymentStatus: 'AWAITING_PAYMENT' as const } : row
          );
          const updated = await prisma.purchaseOrder.update({
            where: { id },
            data: {
              paymentBoletoInstallments: next as unknown as Prisma.InputJsonValue,
              paymentBoletoUrl: null,
              paymentBoletoName: null,
              paymentBoletoPhaseReleased: true,
              updatedAt: new Date()
            },
            include: purchaseOrderIncludeDetail
          });
          const [e] = await enrichOrdersParcelPlans([updated]);
          return e;
        }
      }
      throw new Error('Não há parcela pendente de envio ao financeiro');
    }

    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        paymentBoletoPhaseReleased: true,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeDetail
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Financeiro: anexa comprovante do pagamento da parcela atual (em AWAITING_PAYMENT).
   */
  async attachBoletoInstallmentPaymentProof(
    id: string,
    data: { paymentProofUrl: string; paymentProofName?: string },
    _userId?: string
  ) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoInstallments: true,
        paymentBoletoPhaseReleased: true
      }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível anexar comprovante em OC aprovada');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Comprovante de parcela aplica-se apenas a OC em boleto');
    }
    if (!order.paymentBoletoPhaseReleased) {
      throw new Error('Anexe o comprovante apenas quando a parcela estiver na fase Pagamento');
    }
    const [meta] = await enrichOrdersParcelPlans([order]);
    const n = meta.paymentParcelCount;
    if (n <= 1) {
      throw new Error('Use o comprovante geral da OC para pagamento em parcela única');
    }
    const inst = parseStoredInstallments(order.paymentBoletoInstallments);
    const idx = inst.findIndex((r) => rowStatus(r) === 'AWAITING_PAYMENT');
    if (idx < 0) {
      throw new Error('Não há parcela aguardando pagamento para anexar comprovante');
    }
    const url = (data.paymentProofUrl || '').trim();
    if (!url) {
      throw new Error('Arquivo do comprovante é obrigatório');
    }
    const name = (data.paymentProofName || '').trim() || null;
    const next = inst.map((row, j) =>
      j === idx ? { ...row, installmentProofUrl: url, installmentProofName: name } : row
    );
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        paymentBoletoInstallments: next as unknown as Prisma.InputJsonValue,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeDetail
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Financeiro: após pagar a parcela em aberto, devolve a OC ao comprador para anexar o próximo boleto.
   */
  async returnAfterBoletoInstallmentPaid(id: string, _userId?: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        paymentType: true,
        paymentCondition: true,
        paymentBoletoInstallments: true,
        paymentBoletoPhaseReleased: true
      }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível usar esta ação em OC aprovada');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Esta ação aplica-se apenas a OC em boleto');
    }
    if (!order.paymentBoletoPhaseReleased) {
      throw new Error('A OC não está na fase Pagamento aguardando pagamento de parcela');
    }
    const [meta] = await enrichOrdersParcelPlans([order]);
    const n = meta.paymentParcelCount;
    if (n <= 1) {
      throw new Error('Fluxo por parcela aplica-se apenas a OC com mais de uma parcela na condição de pagamento');
    }
    const inst = parseStoredInstallments(order.paymentBoletoInstallments);
    const idx = inst.findIndex((r) => rowStatus(r) === 'AWAITING_PAYMENT');
    if (idx < 0) {
      throw new Error('Não há parcela aguardando pagamento para liberar a próxima');
    }
    const cur = inst[idx];
    if (!((cur.installmentProofUrl || '').trim())) {
      throw new Error('Anexe o comprovante de pagamento desta parcela antes de liberar a próxima');
    }
    const next = inst.map((row, j) =>
      j === idx ? { ...row, paymentStatus: 'PAID' as const } : row
    );
    const allPaid = allMultiInstallmentsPaid(next, n);
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        paymentBoletoInstallments: next as unknown as Prisma.InputJsonValue,
        paymentBoletoPhaseReleased: allPaid,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeDetail
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Volta OC em boleto para a fila "Anexar Boleto" (remove boleto de pagamento já anexado).
   */
  async reopenAttachPaymentBoleto(id: string, _userId?: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, status: true, paymentType: true, paymentBoletoUrl: true, paymentBoletoInstallments: true }
    });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }
    if (order.status !== 'APPROVED') {
      throw new Error('Só é possível reabrir anexo de boleto em OC aprovada (fase Pagamento)');
    }
    if (order.paymentType !== 'BOLETO') {
      throw new Error('Reabrir fase de boleto aplica-se apenas a pagamento em boleto (parcelado)');
    }
    const inst = parseStoredInstallments(order.paymentBoletoInstallments);
    const hasInstUrl = inst.some((x) => (x.boletoUrl || '').trim());
    const hasLegacy = (order.paymentBoletoUrl || '').trim().length > 0;
    if (!hasLegacy && !hasInstUrl) {
      throw new Error('Não há boleto de pagamento anexado para remover');
    }
    const updated = await prisma.purchaseOrder.update({
      where: { id },
      data: {
        paymentBoletoUrl: null,
        paymentBoletoName: null,
        paymentBoletoInstallments: Prisma.JsonNull,
        paymentBoletoPhaseReleased: false,
        updatedAt: new Date()
      },
      include: purchaseOrderIncludeDetail
    });
    const [e] = await enrichOrdersParcelPlans([updated]);
    return e;
  }

  /**
   * Remessa CNAB400 (mesmo layout do módulo financeiro / borderô Itaú) para OCs em Pagamento.
   * Exige fornecedor com banco, agência e conta preenchidos.
   */
  async generateCnab400Remessa(orderIds: string[]): Promise<{ content: string; skippedOrderNumbers: string[] }> {
    const uniqueIds = [...new Set(orderIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) {
      throw new Error('Selecione ao menos uma ordem de compra');
    }

    const orders = await prisma.purchaseOrder.findMany({
      where: { id: { in: uniqueIds }, status: 'APPROVED' },
      include: { supplier: true, items: true }
    });

    if (orders.length !== uniqueIds.length) {
      throw new Error('Alguma OC não existe ou não está aprovada (fase Pagamento)');
    }

    const skippedOrderNumbers: string[] = [];
    const borderItems: BorderData[] = [];
    const borderService = new BorderService();

    for (const o of orders) {
      if (o.paymentType === 'BOLETO' && !o.paymentBoletoPhaseReleased) {
        skippedOrderNumbers.push(o.orderNumber);
        continue;
      }
      const s = o.supplier;
      const bank = (s.bank || '').trim();
      const agency = (s.agency || '').trim();
      const account = (s.account || '').trim();
      if (!bank || !agency || !account) {
        skippedOrderNumbers.push(o.orderNumber);
        continue;
      }

      const itemsTotal = o.items.reduce((sum, it) => sum + Number(it.totalPrice), 0);
      let amount =
        o.amountToPay != null && String(o.amountToPay).trim() !== ''
          ? Number(o.amountToPay)
          : itemsTotal;

      if (o.paymentType === 'BOLETO') {
        const [ocMeta] = await enrichOrdersParcelPlans([o]);
        if (ocMeta.paymentParcelCount > 1) {
          const inst = parseStoredInstallments(o.paymentBoletoInstallments);
          const aw = inst.findIndex((r) => rowStatus(r) === 'AWAITING_PAYMENT');
          if (aw >= 0) {
            const part = Number(inst[aw]?.amount);
            if (Number.isFinite(part) && part > 0) {
              amount = part;
            }
          }
        }
      }

      if (!(amount > 0)) {
        skippedOrderNumbers.push(o.orderNumber);
        continue;
      }

      let doc = (s.cnpj || '').replace(/\D/g, '');
      if (doc.length <= 11) {
        doc = doc.padStart(14, '0');
      } else {
        doc = doc.slice(0, 14);
      }

      borderItems.push({
        date: new Date().toLocaleDateString('pt-BR'),
        name: s.name,
        amount,
        bank,
        accountType: 'CORRENTE',
        agency,
        operation: null,
        account,
        digit: (s.accountDigit || '0').trim().slice(0, 1) || '0',
        pixKeyType: null,
        pixKey: null,
        cpf: doc
      });
    }

    if (borderItems.length === 0) {
      throw new Error(
        'Nenhuma OC selecionada tem fornecedor com banco, agência e conta cadastrados. Cadastre em Suprimentos → Fornecedores.'
      );
    }

    const content = await borderService.generateCNAB400FromBorderData(borderItems);
    return { content, skippedOrderNumbers };
  }
}
