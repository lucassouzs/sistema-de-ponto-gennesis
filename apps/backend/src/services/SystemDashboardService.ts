import { prisma } from '../lib/prisma';
import { entityLabel, resolveTimelineRef } from '../lib/auditLog';

const SAO_PAULO_TZ = 'America/Sao_Paulo';

const DAY_MS = 24 * 60 * 60 * 1000;

type StatusCount = { status: string; label: string; count: number };

/** Rótulos em português para status de Ordem de Compra. */
const PURCHASE_ORDER_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Rascunho',
  PENDING_COMPRAS: 'Aprovação Compras',
  PENDING: 'Aprovação Gestor',
  PENDING_DIRETORIA: 'Aprovação Diretoria',
  IN_REVIEW: 'Em Correção',
  APPROVED: 'Aprovada',
  PENDING_PROOF_VALIDATION: 'Validação de Comprovante',
  PENDING_PROOF_CORRECTION: 'Correção de Comprovante',
  PENDING_NF_ATTACHMENT: 'Aguardando NF',
  SENT: 'Enviada',
  FINALIZED: 'Finalizada',
  PARTIALLY_RECEIVED: 'Parcialmente Recebida',
  RECEIVED: 'Recebida',
  REJECTED: 'Reprovada',
  CANCELLED: 'Cancelada',
};

/** Status de OC considerados "pendentes de aprovação" (alguém precisa agir). */
const PURCHASE_ORDER_PENDING_STATUSES = [
  'PENDING_COMPRAS',
  'PENDING',
  'PENDING_DIRETORIA',
  'IN_REVIEW',
];

/** Status de OC considerados "fechados" (fluxo encerrado). */
const PURCHASE_ORDER_CLOSED_STATUSES = ['FINALIZED', 'RECEIVED', 'REJECTED', 'CANCELLED'];

const MATERIAL_REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  IN_REVIEW: 'Em Correção',
  APPROVED: 'Aprovada',
  PARTIALLY_FULFILLED: 'Parcialmente Atendida',
  FULFILLED: 'Atendida',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const MATERIAL_REQUEST_PENDING_STATUSES = ['PENDING', 'IN_REVIEW'];
const MATERIAL_REQUEST_CLOSED_STATUSES = ['FULFILLED', 'REJECTED', 'CANCELLED'];

const FUEL_STATUS_LABELS: Record<string, string> = {
  PENDING_MANAGER: 'Aguardando Gestor',
  PENDING_SUPPLIES: 'Aguardando Suprimentos',
  AWAITING_REFUEL: 'Aguardando Abastecimento',
  COMPLETED: 'Concluído',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  CANCELLED: 'Cancelado',
};

const FUEL_PENDING_STATUSES = ['PENDING_MANAGER', 'PENDING_SUPPLIES'];

const LOGISTICS_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pendente',
  COMPLETED: 'Concluída',
};

const FINANCIAL_STATUS_LABELS: Record<string, string> = {
  PROCESSO_COMPLETO: 'Processo Completo',
  PAGO: 'Pago',
  AGUARDAR_NOTA: 'Aguardar Nota',
  AGUARDAR_PAGAMENTO: 'Aguardar Pagamento',
  LANCADO: 'Lançado',
  CANCELADO: 'Cancelado',
};

const FINANCIAL_AWAITING_PAYMENT_STATUSES = ['AGUARDAR_PAGAMENTO', 'LANCADO'];

const STOCK_SHORTFALL_STATUS_LABELS: Record<string, string> = {
  ABERTO: 'Aberto',
  RESOLVIDO: 'Resolvido',
};

const VEHICLE_RESERVATION_STATUS_LABELS: Record<string, string> = {
  PENDING_SUPPLIES: 'Aguardando Suprimentos',
  APPROVED: 'Aprovada',
  COMPLETED: 'Em uso / baixa',
  INSPECTED: 'Vistoriada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const VEHICLE_PENDING_STATUSES = ['PENDING_SUPPLIES'];

const TOOL_RENTAL_STATUS_LABELS: Record<string, string> = {
  OPEN: 'Aberta',
  SUPPLIER_RELATION: 'Relacionamento',
  AWAITING_PAYMENT: 'Aguardando Pagamento',
  COMPLETED: 'Concluída',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
};

const TOOL_RENTAL_OPEN_STATUSES = ['OPEN', 'SUPPLIER_RELATION', 'AWAITING_PAYMENT'];

const DEMAND_SHEET_PENDING_STATUSES = ['WAITING_MANAGER'];

const AUDIT_ACTIONS = ['CREATE', 'DELETE', 'APPROVE', 'REJECT'] as const;

function ymdInSaoPaulo(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: SAO_PAULO_TZ });
}

function labelForDay(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    timeZone: SAO_PAULO_TZ,
    day: '2-digit',
    month: '2-digit',
  });
}

function toStatusCounts(
  rows: Array<{ status: string | null; _count: { status: number } | number }>,
  labels: Record<string, string>
): StatusCount[] {
  return rows
    .map((row) => {
      const status = String(row.status ?? 'DESCONHECIDO');
      const count = typeof row._count === 'number' ? row._count : row._count.status;
      return { status, label: labels[status] || status, count };
    })
    .sort((a, b) => b.count - a.count);
}

function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'object' && value !== null && 'toNumber' in value && typeof (value as { toNumber: () => number }).toNumber === 'function') {
    try {
      return (value as { toNumber: () => number }).toNumber();
    } catch {
      return Number(String(value)) || 0;
    }
  }
  return Number(value) || 0;
}

/** Executa a query e retorna fallback zerado em caso de erro (ex.: tabela ausente em deploy). */
async function safe<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    console.warn(`[SystemDashboardService] falha ao carregar "${label}":`, (error as Error)?.message || error);
    return fallback;
  }
}

export interface SystemDashboardOverview {
  generatedAt: string;
  kpis: {
    pendingApprovals: number;
    openPurchaseOrders: number;
    openMaterialRequests: number;
    activeLogistics: number;
    pendingFuel: number;
    contractsExpiringSoon: number;
    financialAwaitingPayment: number;
    financialAwaitingPaymentAmount: number;
    openStockShortfalls: number;
    pendingVehicleReservations: number;
    openToolRentals: number;
    quoteMapsWithoutOc: number;
    espelhoNfWithoutAttachment: number;
    actionsLast7Days: number;
  };
  purchaseOrdersByStatus: StatusCount[];
  materialRequestsByStatus: StatusCount[];
  fuelByStatus: StatusCount[];
  logisticsByStatus: StatusCount[];
  financialByStatus: StatusCount[];
  stockShortfallsByStatus: StatusCount[];
  vehicleReservationsByStatus: StatusCount[];
  toolRentalsByStatus: StatusCount[];
  quoteMapsBreakdown: StatusCount[];
  espelhoNfBreakdown: StatusCount[];
  contractsTimeline: {
    active: number;
    expiring30: number;
    expiring60: number;
    expired: number;
  };
  activityByDay: Array<{
    date: string;
    label: string;
    creates: number;
    deletes: number;
    approves: number;
    rejects: number;
    total: number;
  }>;
  topAuditEntities: Array<{ entity: string; label: string; count: number }>;
  recentActions: Array<{
    id: string;
    action: string;
    entity: string;
    entityLabel: string;
    summary: string | null;
    timelineRef: string | null;
    userName: string | null;
    at: string;
  }>;
}

export class SystemDashboardService {
  static async getOverview(): Promise<SystemDashboardOverview> {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS);
    const fourteenDaysAgo = new Date(now.getTime() - 13 * DAY_MS);
    const in30Days = new Date(now.getTime() + 30 * DAY_MS);
    const in60Days = new Date(now.getTime() + 60 * DAY_MS);

    const [
      purchaseOrdersByStatusRaw,
      materialRequestsByStatusRaw,
      fuelByStatusRaw,
      logisticsByStatusRaw,
      financialByStatusRaw,
      stockShortfallsByStatusRaw,
      vehicleReservationsByStatusRaw,
      toolRentalsByStatusRaw,
      quoteMapsBreakdown,
      espelhoNfBreakdown,
      financialAwaitingPaymentAmount,
      contractsTimeline,
      pendingFdCount,
      actionsLast7Days,
      activityRows,
      topAuditEntitiesRaw,
      recentAuditRows,
    ] = await Promise.all([
      safe(
        () => prisma.purchaseOrder.groupBy({ by: ['status'], _count: { status: true } }),
        [] as Array<{ status: string; _count: { status: number } }>,
        'purchaseOrdersByStatus'
      ),
      safe(
        () => prisma.materialRequest.groupBy({ by: ['status'], _count: { status: true } }),
        [] as Array<{ status: string; _count: { status: number } }>,
        'materialRequestsByStatus'
      ),
      safe(
        () => prisma.fuelRefuelRequest.groupBy({ by: ['status'], _count: { status: true } }),
        [] as Array<{ status: string; _count: { status: number } }>,
        'fuelByStatus'
      ),
      safe(
        () => prisma.logisticsDeliveryRequest.groupBy({ by: ['status'], _count: { status: true } }),
        [] as Array<{ status: string; _count: { status: number } }>,
        'logisticsByStatus'
      ),
      safe(
        () => prisma.financialControlEntry.groupBy({ by: ['status'], _count: { status: true } }),
        [] as Array<{ status: string; _count: { status: number } }>,
        'financialByStatus'
      ),
      safe(
        () => prisma.stockShortfall.groupBy({ by: ['status'], _count: { status: true } }),
        [] as Array<{ status: string; _count: { status: number } }>,
        'stockShortfallsByStatus'
      ),
      safe(
        () => prisma.vehicleReservation.groupBy({ by: ['status'], _count: { status: true } }),
        [] as Array<{ status: string; _count: { status: number } }>,
        'vehicleReservationsByStatus'
      ),
      safe(
        () => prisma.toolRentalRequest.groupBy({ by: ['status'], _count: { status: true } }),
        [] as Array<{ status: string; _count: { status: number } }>,
        'toolRentalsByStatus'
      ),
      safe(
        async () => {
          const [withoutOc, withOc] = await Promise.all([
            prisma.quoteMap.count({ where: { purchaseOrders: { none: {} } } }),
            prisma.quoteMap.count({ where: { purchaseOrders: { some: {} } } }),
          ]);
          return [
            { status: 'WITHOUT_OC', label: 'Sem OC gerada', count: withoutOc },
            { status: 'WITH_OC', label: 'Com OC gerada', count: withOc },
          ] as StatusCount[];
        },
        [
          { status: 'WITHOUT_OC', label: 'Sem OC gerada', count: 0 },
          { status: 'WITH_OC', label: 'Com OC gerada', count: 0 },
        ] as StatusCount[],
        'quoteMapsBreakdown'
      ),
      safe(
        async () => {
          const [total, withoutNf] = await Promise.all([
            prisma.espelhoNfMirror.count(),
            prisma.espelhoNfMirror.count({
              where: {
                OR: [{ nfAttachmentName: null }, { nfAttachmentName: '' }],
              },
            }),
          ]);
          return [
            { status: 'WITH_NF', label: 'Com NF anexada', count: Math.max(0, total - withoutNf) },
            { status: 'WITHOUT_NF', label: 'Sem NF anexada', count: withoutNf },
          ] as StatusCount[];
        },
        [
          { status: 'WITH_NF', label: 'Com NF anexada', count: 0 },
          { status: 'WITHOUT_NF', label: 'Sem NF anexada', count: 0 },
        ] as StatusCount[],
        'espelhoNfBreakdown'
      ),
      safe(
        async () => {
          const rows = await prisma.financialControlEntry.findMany({
            where: { status: { in: FINANCIAL_AWAITING_PAYMENT_STATUSES as any } },
            select: { finalValue: true, originalValue: true },
          });
          return rows.reduce((acc, row) => {
            const final = decimalToNumber(row.finalValue);
            const original = decimalToNumber(row.originalValue);
            return acc + (final > 0 ? final : original);
          }, 0);
        },
        0,
        'financialAwaitingPaymentAmount'
      ),
      safe(
        async () => {
          const [expired, expiring30, expiring60, active] = await Promise.all([
            prisma.contract.count({ where: { endDate: { lt: now } } }),
            prisma.contract.count({ where: { endDate: { gte: now, lte: in30Days } } }),
            prisma.contract.count({ where: { endDate: { gt: in30Days, lte: in60Days } } }),
            prisma.contract.count({ where: { endDate: { gt: in60Days } } }),
          ]);
          return { expired, expiring30, expiring60, active };
        },
        { expired: 0, expiring30: 0, expiring60: 0, active: 0 },
        'contractsTimeline'
      ),
      safe(
        () =>
          prisma.demandSheetApproval.count({
            where: { status: { in: DEMAND_SHEET_PENDING_STATUSES as any } },
          }),
        0,
        'pendingFdCount'
      ),
      safe(
        () =>
          prisma.auditLog.count({
            where: {
              action: { in: AUDIT_ACTIONS as unknown as string[] },
              createdAt: { gte: sevenDaysAgo },
            },
          }),
        0,
        'actionsLast7Days'
      ),
      safe(
        () =>
          prisma.auditLog.findMany({
            where: {
              action: { in: AUDIT_ACTIONS as unknown as string[] },
              createdAt: { gte: fourteenDaysAgo },
            },
            select: { action: true, createdAt: true },
          }),
        [] as Array<{ action: string; createdAt: Date }>,
        'activityByDay'
      ),
      safe(
        () =>
          prisma.auditLog.groupBy({
            by: ['entity'],
            where: { createdAt: { gte: thirtyDaysAgo } },
            _count: { entity: true },
            orderBy: { _count: { entity: 'desc' } },
            take: 6,
          }),
        [] as Array<{ entity: string; _count: { entity: number } }>,
        'topAuditEntities'
      ),
      safe(
        () =>
          prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 12,
            select: {
              id: true,
              action: true,
              entity: true,
              entityId: true,
              summary: true,
              userId: true,
              newData: true,
              oldData: true,
              createdAt: true,
            },
          }),
        [] as Array<{
          id: string;
          action: string;
          entity: string;
          entityId: string | null;
          summary: string | null;
          userId: string | null;
          newData: unknown;
          oldData: unknown;
          createdAt: Date;
        }>,
        'recentActions'
      ),
    ]);

    const purchaseOrdersByStatus = toStatusCounts(purchaseOrdersByStatusRaw, PURCHASE_ORDER_STATUS_LABELS);
    const materialRequestsByStatus = toStatusCounts(materialRequestsByStatusRaw, MATERIAL_REQUEST_STATUS_LABELS);
    const fuelByStatus = toStatusCounts(fuelByStatusRaw, FUEL_STATUS_LABELS);
    const logisticsByStatus = toStatusCounts(logisticsByStatusRaw, LOGISTICS_STATUS_LABELS);
    const financialByStatus = toStatusCounts(financialByStatusRaw, FINANCIAL_STATUS_LABELS);
    const stockShortfallsByStatus = toStatusCounts(stockShortfallsByStatusRaw, STOCK_SHORTFALL_STATUS_LABELS);
    const vehicleReservationsByStatus = toStatusCounts(
      vehicleReservationsByStatusRaw,
      VEHICLE_RESERVATION_STATUS_LABELS
    );
    const toolRentalsByStatus = toStatusCounts(toolRentalsByStatusRaw, TOOL_RENTAL_STATUS_LABELS);

    const sumByStatuses = (rows: StatusCount[], statuses: string[]) =>
      rows.filter((r) => statuses.includes(r.status)).reduce((acc, r) => acc + r.count, 0);

    const purchaseOrdersPending = sumByStatuses(purchaseOrdersByStatus, PURCHASE_ORDER_PENDING_STATUSES);
    const openPurchaseOrders =
      purchaseOrdersByStatus.reduce((acc, r) => acc + r.count, 0) -
      sumByStatuses(purchaseOrdersByStatus, PURCHASE_ORDER_CLOSED_STATUSES);

    const materialRequestsPending = sumByStatuses(materialRequestsByStatus, MATERIAL_REQUEST_PENDING_STATUSES);
    const openMaterialRequests =
      materialRequestsByStatus.reduce((acc, r) => acc + r.count, 0) -
      sumByStatuses(materialRequestsByStatus, MATERIAL_REQUEST_CLOSED_STATUSES);

    const fuelPending = sumByStatuses(fuelByStatus, FUEL_PENDING_STATUSES);
    const activeLogistics = sumByStatuses(logisticsByStatus, ['PENDING']);
    const financialAwaitingPayment = sumByStatuses(financialByStatus, FINANCIAL_AWAITING_PAYMENT_STATUSES);
    const openStockShortfalls = sumByStatuses(stockShortfallsByStatus, ['ABERTO']);
    const pendingVehicleReservations = sumByStatuses(vehicleReservationsByStatus, VEHICLE_PENDING_STATUSES);
    const openToolRentals = sumByStatuses(toolRentalsByStatus, TOOL_RENTAL_OPEN_STATUSES);
    const quoteMapsWithoutOc = quoteMapsBreakdown.find((r) => r.status === 'WITHOUT_OC')?.count ?? 0;
    const espelhoNfWithoutAttachment = espelhoNfBreakdown.find((r) => r.status === 'WITHOUT_NF')?.count ?? 0;

    const contractsExpiringSoon = contractsTimeline.expiring30 + contractsTimeline.expiring60;

    const pendingApprovals =
      purchaseOrdersPending +
      materialRequestsPending +
      fuelPending +
      activeLogistics +
      pendingFdCount +
      pendingVehicleReservations +
      openToolRentals +
      openStockShortfalls;

    // Monta os últimos 14 dias (America/Sao_Paulo), mesmo sem eventos, para o gráfico não ter buracos.
    const dayBuckets = new Map<
      string,
      { date: string; label: string; creates: number; deletes: number; approves: number; rejects: number; total: number }
    >();
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(now.getTime() - i * DAY_MS);
      const key = ymdInSaoPaulo(d);
      dayBuckets.set(key, {
        date: key,
        label: labelForDay(d),
        creates: 0,
        deletes: 0,
        approves: 0,
        rejects: 0,
        total: 0,
      });
    }
    for (const row of activityRows) {
      const key = ymdInSaoPaulo(row.createdAt);
      const bucket = dayBuckets.get(key);
      if (!bucket) continue;
      const action = String(row.action || '').toUpperCase();
      if (action === 'CREATE') bucket.creates += 1;
      else if (action === 'DELETE') bucket.deletes += 1;
      else if (action === 'APPROVE') bucket.approves += 1;
      else if (action === 'REJECT') bucket.rejects += 1;
      bucket.total += 1;
    }
    const activityByDay = Array.from(dayBuckets.values());

    const topAuditEntities = topAuditEntitiesRaw
      .map((row) => ({
        entity: row.entity,
        label: entityLabel(row.entity),
        count: row._count.entity,
      }))
      .sort((a, b) => b.count - a.count);

    const recentUserIds = [...new Set(recentAuditRows.map((r) => r.userId).filter((id): id is string => !!id))];
    const users = recentUserIds.length
      ? await safe(
          () =>
            prisma.user.findMany({
              where: { id: { in: recentUserIds } },
              select: { id: true, name: true },
            }),
          [] as Array<{ id: string; name: string }>,
          'recentActionsUsers'
        )
      : [];
    const userNameById = new Map(users.map((u) => [u.id, u.name]));

    const recentActions = recentAuditRows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entity,
      entityLabel: entityLabel(row.entity),
      summary: row.summary,
      timelineRef: resolveTimelineRef(row.action, row.newData, row.oldData),
      userName: row.userId ? userNameById.get(row.userId) || null : null,
      at: row.createdAt.toISOString(),
    }));

    return {
      generatedAt: now.toISOString(),
      kpis: {
        pendingApprovals,
        openPurchaseOrders,
        openMaterialRequests,
        activeLogistics,
        pendingFuel: fuelPending,
        contractsExpiringSoon,
        financialAwaitingPayment,
        financialAwaitingPaymentAmount: Math.round(financialAwaitingPaymentAmount * 100) / 100,
        openStockShortfalls,
        pendingVehicleReservations,
        openToolRentals,
        quoteMapsWithoutOc,
        espelhoNfWithoutAttachment,
        actionsLast7Days,
      },
      purchaseOrdersByStatus,
      materialRequestsByStatus,
      fuelByStatus,
      logisticsByStatus,
      financialByStatus,
      stockShortfallsByStatus,
      vehicleReservationsByStatus,
      toolRentalsByStatus,
      quoteMapsBreakdown,
      espelhoNfBreakdown,
      contractsTimeline,
      activityByDay,
      topAuditEntities,
      recentActions,
    };
  }
}
