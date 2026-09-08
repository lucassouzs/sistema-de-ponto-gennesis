import { prisma } from '../lib/prisma';

const DAY_MS = 24 * 60 * 60 * 1000;
const SAO_PAULO_TZ = 'America/Sao_Paulo';

const OC_CLOSED = ['FINALIZED', 'RECEIVED', 'REJECTED', 'CANCELLED'] as const;
const RM_CLOSED = ['FULFILLED', 'REJECTED', 'CANCELLED'] as const;
const OC_APPROVAL = ['PENDING_COMPRAS', 'PENDING', 'PENDING_DIRETORIA', 'IN_REVIEW'] as const;
const OC_POST_APPROVAL = [
  'APPROVED',
  'PENDING_PROOF_VALIDATION',
  'PENDING_PROOF_CORRECTION',
  'PENDING_NF_ATTACHMENT',
  'SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
] as const;

const OC_STATUS_LABELS: Record<string, string> = {
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

const RM_PRIORITY_LABELS: Record<string, string> = {
  URGENT: 'Urgente',
  HIGH: 'Alta',
  MEDIUM: 'Média',
  LOW: 'Baixa',
};

const PRIORITY_ORDER = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const;

function decimalToNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toNumber' in value &&
    typeof (value as { toNumber: () => number }).toNumber === 'function'
  ) {
    try {
      return (value as { toNumber: () => number }).toNumber();
    } catch {
      return Number(String(value)) || 0;
    }
  }
  return Number(value) || 0;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
}

function avg(nums: number[]): number {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

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

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type RmOcInsights = {
  sla: {
    ocAvgAgeDays: number;
    rmAvgAgeDays: number;
    ocStuckOver7Days: number;
    ocStuckOver14Days: number;
    rmStuckOver7Days: number;
    rmStuckOver14Days: number;
    ocAgeByApprovalStage: Array<{
      status: string;
      label: string;
      count: number;
      avgAgeDays: number;
    }>;
  };
  bottlenecks: Array<{ status: string; label: string; count: number; sharePct: number }>;
  rmByPriority: Array<{ priority: string; label: string; count: number; sharePct: number }>;
  finance: {
    openAmount: number;
    totalAmount: number;
    openSharePct: number;
    byStatus: Array<{ status: string; label: string; count: number; amount: number }>;
    topSuppliers: Array<{ supplierId: string; name: string; count: number; amount: number }>;
  };
  demandByCostCenter: Array<{ id: string; name: string; count: number; sharePct: number }>;
  demandByServiceOrder: Array<{ name: string; count: number; sharePct: number }>;
  rmToOc: {
    totalRms: number;
    withOc: number;
    withoutOc: number;
    conversionPct: number;
    approvedWithoutOc: number;
  };
  postApproval: Array<{ status: string; label: string; count: number }>;
  /** OCs abertas com data prevista de entrega já vencida. */
  overdueDeliveries: number;
  /** Itens em correção (IN_REVIEW). */
  inReview: { oc: number; rm: number; total: number };
  /** Tempos médios de ciclo (em dias). */
  leadTime: {
    rmToOcApprovedDays: number;
    rmToOcApprovedSample: number;
    ocApprovedToClosedDays: number;
    ocApprovedToClosedSample: number;
  };
  trends: {
    days7: {
      ocCreated: number;
      ocApproved: number;
      ocClosed: number;
      rmCreated: number;
      rmApproved: number;
      rmClosed: number;
    };
    days30: {
      ocCreated: number;
      ocApproved: number;
      ocClosed: number;
      rmCreated: number;
      rmApproved: number;
      rmClosed: number;
    };
    daily: Array<{
      date: string;
      label: string;
      ocCreated: number;
      rmCreated: number;
      ocClosed: number;
      rmClosed: number;
    }>;
  };
};

const EMPTY_TREND_BUCKET = {
  ocCreated: 0,
  ocApproved: 0,
  ocClosed: 0,
  rmCreated: 0,
  rmApproved: 0,
  rmClosed: 0,
};

export async function buildRmOcInsights(now = new Date()): Promise<RmOcInsights> {
  const sevenAgo = new Date(now.getTime() - 7 * DAY_MS);
  const thirtyAgo = new Date(now.getTime() - 30 * DAY_MS);

  const [
    openOcs,
    openRms,
    allOcAmounts,
    rmPriorityRaw,
    rmCostCenters,
    rmServiceOrders,
    rmToOcCounts,
    postApprovalRaw,
    ocTrendRows,
    rmTrendRows,
    leadTimeRows,
  ] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { status: { notIn: [...OC_CLOSED] } },
      select: {
        status: true,
        createdAt: true,
        updatedAt: true,
        expectedDelivery: true,
        amountToPay: true,
        supplierId: true,
        supplier: { select: { id: true, name: true, tradeName: true } },
      },
    }),
    prisma.materialRequest.findMany({
      where: { status: { notIn: [...RM_CLOSED] } },
      select: {
        status: true,
        createdAt: true,
        updatedAt: true,
        priority: true,
        costCenterId: true,
        serviceOrder: true,
        serviceOrderId: true,
        costCenter: { select: { id: true, name: true, code: true } },
        service_orders: { select: { numero: true, ano: true, descricao: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      select: { status: true, amountToPay: true },
    }),
    prisma.materialRequest.groupBy({
      by: ['priority'],
      _count: { priority: true },
    }),
    prisma.materialRequest.groupBy({
      by: ['costCenterId'],
      _count: { costCenterId: true },
      orderBy: { _count: { costCenterId: 'desc' } },
      take: 8,
    }),
    prisma.materialRequest.groupBy({
      by: ['serviceOrder'],
      where: { serviceOrder: { not: null } },
      _count: { serviceOrder: true },
      orderBy: { _count: { serviceOrder: 'desc' } },
      take: 8,
    }),
    Promise.all([
      prisma.materialRequest.count(),
      prisma.materialRequest.count({ where: { purchaseOrders: { some: {} } } }),
      prisma.materialRequest.count({
        where: {
          status: 'APPROVED',
          purchaseOrders: { none: {} },
        },
      }),
    ]),
    prisma.purchaseOrder.groupBy({
      by: ['status'],
      where: { status: { in: [...OC_POST_APPROVAL] } },
      _count: { status: true },
    }),
    prisma.purchaseOrder.findMany({
      where: {
        OR: [
          { createdAt: { gte: thirtyAgo } },
          { approvedAt: { gte: thirtyAgo } },
          {
            AND: [{ status: { in: [...OC_CLOSED] } }, { updatedAt: { gte: thirtyAgo } }],
          },
        ],
      },
      select: { createdAt: true, approvedAt: true, updatedAt: true, status: true },
    }),
    prisma.materialRequest.findMany({
      where: {
        OR: [
          { createdAt: { gte: thirtyAgo } },
          { approvedAt: { gte: thirtyAgo } },
          {
            AND: [
              { status: { in: [...RM_CLOSED] } },
              {
                OR: [{ completedAt: { gte: thirtyAgo } }, { updatedAt: { gte: thirtyAgo } }],
              },
            ],
          },
        ],
      },
      select: {
        createdAt: true,
        approvedAt: true,
        completedAt: true,
        updatedAt: true,
        status: true,
      },
    }),
    Promise.all([
      prisma.materialRequest.findMany({
        where: {
          createdAt: { gte: thirtyAgo },
          purchaseOrders: { some: { approvedAt: { not: null } } },
        },
        select: {
          createdAt: true,
          purchaseOrders: {
            where: { approvedAt: { not: null } },
            select: { approvedAt: true },
            orderBy: { approvedAt: 'asc' },
            take: 1,
          },
        },
        take: 800,
      }),
      prisma.purchaseOrder.findMany({
        where: {
          status: { in: ['FINALIZED', 'RECEIVED'] },
          approvedAt: { not: null },
          updatedAt: { gte: thirtyAgo },
        },
        select: { approvedAt: true, updatedAt: true },
        take: 800,
      }),
    ]),
  ]);

  const [rmsForLeadTime, ocsForLeadTime] = leadTimeRows;

  // —— SLA / idade ——
  const ocAges = openOcs.map((o) => daysBetween(o.createdAt, now));
  const rmAges = openRms.map((r) => daysBetween(r.createdAt, now));
  const ocStageAge = new Map<string, number[]>();
  for (const oc of openOcs) {
    if (!(OC_APPROVAL as readonly string[]).includes(oc.status)) continue;
    const list = ocStageAge.get(oc.status) ?? [];
    list.push(daysBetween(oc.updatedAt, now));
    ocStageAge.set(oc.status, list);
  }
  const ocAgeByApprovalStage = (OC_APPROVAL as readonly string[]).map((status) => {
    const ages = ocStageAge.get(status) ?? [];
    return {
      status,
      label: OC_STATUS_LABELS[status] || status,
      count: ages.length,
      avgAgeDays: avg(ages),
    };
  });

  // —— Gargalos ——
  const bottleneckTotal = openOcs.filter((o) =>
    (OC_APPROVAL as readonly string[]).includes(o.status)
  ).length;
  const bottlenecks = (OC_APPROVAL as readonly string[]).map((status) => {
    const count = openOcs.filter((o) => o.status === status).length;
    return {
      status,
      label: OC_STATUS_LABELS[status] || status,
      count,
      sharePct: bottleneckTotal > 0 ? Math.round((count / bottleneckTotal) * 100) : 0,
    };
  });

  // —— Prioridade RM ——
  const rmPriorityTotal = rmPriorityRaw.reduce(
    (s, r) => s + (typeof r._count === 'number' ? r._count : r._count.priority),
    0
  );
  const priorityCountMap = new Map(
    rmPriorityRaw.map((r) => [
      String(r.priority),
      typeof r._count === 'number' ? r._count : r._count.priority,
    ])
  );
  const rmByPriority = PRIORITY_ORDER.map((priority) => {
    const count = priorityCountMap.get(priority) ?? 0;
    return {
      priority,
      label: RM_PRIORITY_LABELS[priority] || priority,
      count,
      sharePct: rmPriorityTotal > 0 ? Math.round((count / rmPriorityTotal) * 100) : 0,
    };
  });

  // —— Financeiro OC ——
  let totalAmount = 0;
  let openAmount = 0;
  const amountByStatus = new Map<string, { count: number; amount: number }>();
  for (const row of allOcAmounts) {
    const amount = decimalToNumber(row.amountToPay);
    totalAmount += amount;
    const cur = amountByStatus.get(row.status) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += amount;
    amountByStatus.set(row.status, cur);
    if (!(OC_CLOSED as readonly string[]).includes(row.status)) {
      openAmount += amount;
    }
  }
  const financeByStatus = Array.from(amountByStatus.entries())
    .map(([status, v]) => ({
      status,
      label: OC_STATUS_LABELS[status] || status,
      count: v.count,
      amount: roundMoney(v.amount),
    }))
    .filter((r) => r.amount > 0 || r.count > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const supplierMap = new Map<string, { name: string; count: number; amount: number }>();
  for (const oc of openOcs) {
    const amount = decimalToNumber(oc.amountToPay);
    const name = oc.supplier.tradeName?.trim() || oc.supplier.name;
    const cur = supplierMap.get(oc.supplierId) ?? { name, count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += amount;
    supplierMap.set(oc.supplierId, cur);
  }
  const topSuppliers = Array.from(supplierMap.entries())
    .map(([supplierId, v]) => ({
      supplierId,
      name: v.name,
      count: v.count,
      amount: roundMoney(v.amount),
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 8);

  // —— Demanda CC / obra ——
  const ccIds = rmCostCenters.map((r) => r.costCenterId);
  const ccRows =
    ccIds.length > 0
      ? await prisma.costCenter.findMany({
          where: { id: { in: ccIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
  const ccNameById = new Map(
    ccRows.map((c) => [c.id, c.code ? `${c.code} · ${c.name}` : c.name])
  );
  const openCcCounts = new Map<string, { name: string; count: number }>();
  for (const rm of openRms) {
    const name = rm.costCenter.code
      ? `${rm.costCenter.code} · ${rm.costCenter.name}`
      : rm.costCenter.name;
    const cur = openCcCounts.get(rm.costCenterId) ?? { name, count: 0 };
    cur.count += 1;
    openCcCounts.set(rm.costCenterId, cur);
  }
  const demandByCostCenterSorted = Array.from(openCcCounts.entries())
    .map(([id, v]) => ({
      id,
      name: v.name,
      count: v.count,
      sharePct: 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  let demandByCostCenter =
    demandByCostCenterSorted.length > 0
      ? demandByCostCenterSorted
      : rmCostCenters.map((r) => {
          const count = typeof r._count === 'number' ? r._count : r._count.costCenterId;
          return {
            id: r.costCenterId,
            name: ccNameById.get(r.costCenterId) || r.costCenterId,
            count,
            sharePct: 0,
          };
        });
  const ccTotal = demandByCostCenter.reduce((s, r) => s + r.count, 0) || 1;
  demandByCostCenter = demandByCostCenter.map((r) => ({
    ...r,
    sharePct: Math.round((r.count / ccTotal) * 100),
  }));

  const openOsCounts = new Map<string, number>();
  for (const rm of openRms) {
    const fromText = (rm.serviceOrder || '').trim();
    const fromRelation = rm.service_orders
      ? `OS ${rm.service_orders.numero}/${rm.service_orders.ano}`
      : '';
    const name = fromText || fromRelation;
    if (!name) continue;
    openOsCounts.set(name, (openOsCounts.get(name) ?? 0) + 1);
  }
  let demandByServiceOrder = Array.from(openOsCounts.entries())
    .map(([name, count]) => ({ name, count, sharePct: 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  if (demandByServiceOrder.length === 0) {
    demandByServiceOrder = rmServiceOrders
      .filter((r) => r.serviceOrder)
      .map((r) => ({
        name: String(r.serviceOrder),
        count: typeof r._count === 'number' ? r._count : r._count.serviceOrder,
        sharePct: 0,
      }));
  }
  const osTotal = demandByServiceOrder.reduce((s, r) => s + r.count, 0) || 1;
  demandByServiceOrder = demandByServiceOrder.map((r) => ({
    ...r,
    sharePct: Math.round((r.count / osTotal) * 100),
  }));

  // —— RM → OC ——
  const [totalRms, withOc, approvedWithoutOc] = rmToOcCounts;
  const withoutOc = Math.max(0, totalRms - withOc);
  const conversionPct = totalRms > 0 ? Math.round((withOc / totalRms) * 100) : 0;

  // —— Pós-aprovação ——
  const postMap = new Map(
    postApprovalRaw.map((r) => [
      String(r.status),
      typeof r._count === 'number' ? r._count : r._count.status,
    ])
  );
  const postApproval = (OC_POST_APPROVAL as readonly string[]).map((status) => ({
    status,
    label: OC_STATUS_LABELS[status] || status,
    count: postMap.get(status) ?? 0,
  }));

  // —— Tendências ——
  const makeTrend = (since: Date) => {
    const bucket = { ...EMPTY_TREND_BUCKET };
    for (const oc of ocTrendRows) {
      if (oc.createdAt >= since) bucket.ocCreated += 1;
      if (oc.approvedAt && oc.approvedAt >= since) bucket.ocApproved += 1;
      if ((OC_CLOSED as readonly string[]).includes(oc.status) && oc.updatedAt >= since) {
        bucket.ocClosed += 1;
      }
    }
    for (const rm of rmTrendRows) {
      if (rm.createdAt >= since) bucket.rmCreated += 1;
      if (rm.approvedAt && rm.approvedAt >= since) bucket.rmApproved += 1;
      const closedAt = rm.completedAt ?? rm.updatedAt;
      if ((RM_CLOSED as readonly string[]).includes(rm.status) && closedAt >= since) {
        bucket.rmClosed += 1;
      }
    }
    return bucket;
  };

  const dayBuckets = new Map<
    string,
    {
      date: string;
      label: string;
      ocCreated: number;
      rmCreated: number;
      ocClosed: number;
      rmClosed: number;
    }
  >();
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now.getTime() - i * DAY_MS);
    const key = ymdInSaoPaulo(d);
    dayBuckets.set(key, {
      date: key,
      label: labelForDay(d),
      ocCreated: 0,
      rmCreated: 0,
      ocClosed: 0,
      rmClosed: 0,
    });
  }
  for (const oc of ocTrendRows) {
    const createdKey = ymdInSaoPaulo(oc.createdAt);
    const createdBucket = dayBuckets.get(createdKey);
    if (createdBucket) createdBucket.ocCreated += 1;
    if ((OC_CLOSED as readonly string[]).includes(oc.status)) {
      const closedKey = ymdInSaoPaulo(oc.updatedAt);
      const closedBucket = dayBuckets.get(closedKey);
      if (closedBucket) closedBucket.ocClosed += 1;
    }
  }
  for (const rm of rmTrendRows) {
    const createdKey = ymdInSaoPaulo(rm.createdAt);
    const createdBucket = dayBuckets.get(createdKey);
    if (createdBucket) createdBucket.rmCreated += 1;
    if ((RM_CLOSED as readonly string[]).includes(rm.status)) {
      const closedKey = ymdInSaoPaulo(rm.completedAt ?? rm.updatedAt);
      const closedBucket = dayBuckets.get(closedKey);
      if (closedBucket) closedBucket.rmClosed += 1;
    }
  }

  const overdueDeliveries = openOcs.filter(
    (o) => o.expectedDelivery != null && o.expectedDelivery.getTime() < now.getTime()
  ).length;

  const ocInReview = openOcs.filter((o) => o.status === 'IN_REVIEW').length;
  const rmInReview = openRms.filter((r) => r.status === 'IN_REVIEW').length;

  const rmToOcLeadDays: number[] = [];
  for (const rm of rmsForLeadTime) {
    const approvedAt = rm.purchaseOrders[0]?.approvedAt;
    if (!approvedAt) continue;
    rmToOcLeadDays.push(daysBetween(rm.createdAt, approvedAt));
  }
  const ocCloseLeadDays: number[] = [];
  for (const oc of ocsForLeadTime) {
    if (!oc.approvedAt) continue;
    ocCloseLeadDays.push(daysBetween(oc.approvedAt, oc.updatedAt));
  }

  return {
    sla: {
      ocAvgAgeDays: avg(ocAges),
      rmAvgAgeDays: avg(rmAges),
      ocStuckOver7Days: ocAges.filter((d) => d >= 7).length,
      ocStuckOver14Days: ocAges.filter((d) => d >= 14).length,
      rmStuckOver7Days: rmAges.filter((d) => d >= 7).length,
      rmStuckOver14Days: rmAges.filter((d) => d >= 14).length,
      ocAgeByApprovalStage,
    },
    bottlenecks,
    rmByPriority,
    finance: {
      openAmount: roundMoney(openAmount),
      totalAmount: roundMoney(totalAmount),
      openSharePct: totalAmount > 0 ? Math.round((openAmount / totalAmount) * 100) : 0,
      byStatus: financeByStatus,
      topSuppliers,
    },
    demandByCostCenter,
    demandByServiceOrder,
    rmToOc: {
      totalRms,
      withOc,
      withoutOc,
      conversionPct,
      approvedWithoutOc,
    },
    postApproval,
    overdueDeliveries,
    inReview: {
      oc: ocInReview,
      rm: rmInReview,
      total: ocInReview + rmInReview,
    },
    leadTime: {
      rmToOcApprovedDays: avg(rmToOcLeadDays),
      rmToOcApprovedSample: rmToOcLeadDays.length,
      ocApprovedToClosedDays: avg(ocCloseLeadDays),
      ocApprovedToClosedSample: ocCloseLeadDays.length,
    },
    trends: {
      days7: makeTrend(sevenAgo),
      days30: makeTrend(thirtyAgo),
      daily: Array.from(dayBuckets.values()),
    },
  };
}
