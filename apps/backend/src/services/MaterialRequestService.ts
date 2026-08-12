import { prisma } from '../lib/prisma';
import { type EngineeringMaterial, Prisma, PurchaseOrderStatus } from '@prisma/client';
import { isUnbCostCenterRecord } from '../lib/unbCostCenterScope';
import { resolveRmServiceOrderFields } from '../utils/materialRequestServiceOrder';

/** OCs já aprovadas (ou etapas posteriores) — entram na média paga das últimas compras. */
const EFFECTIVE_PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.APPROVED,
  PurchaseOrderStatus.PENDING_PROOF_VALIDATION,
  PurchaseOrderStatus.PENDING_PROOF_CORRECTION,
  PurchaseOrderStatus.PENDING_NF_ATTACHMENT,
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.FINALIZED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
  PurchaseOrderStatus.RECEIVED
];

const AVG_PAID_LAST_PURCHASES = 10;

/** Lock de sessão Postgres para serializar geração de requestNumber (mesmo padrão de DpRequest). */
const MATERIAL_REQUEST_NUMBER_ADVISORY_LOCK = 91827365;

/**
 * Transação com advisory lock + generateRequestNumber + create.
 * Prisma default: maxWait 2s, timeout 5s — insuficiente com latência Railway
 * e fila serializada no lock sob concorrência (mesmo padrão de OC).
 */
const MATERIAL_REQUEST_CREATE_TX_OPTIONS = {
  maxWait: Number(process.env.MATERIAL_REQUEST_CREATE_TX_MAX_WAIT_MS) || 30_000,
  timeout: Number(process.env.MATERIAL_REQUEST_CREATE_TX_TIMEOUT_MS) || 90_000,
};

export type DemandSheetAttachment = { url: string; name: string };

function parseDemandSheetAttachments(raw: unknown): DemandSheetAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: DemandSheetAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const url = String((item as { url?: unknown }).url || '').trim();
    if (!url) continue;
    const name = String((item as { name?: unknown }).name || '').trim() || 'Arquivo anexado';
    out.push({ url, name });
  }
  return out;
}

export function normalizeDemandSheetAttachments(data: {
  demandSheetAttachments?: unknown;
  demandSheetAttachmentUrl?: string | null;
  demandSheetAttachmentName?: string | null;
}): DemandSheetAttachment[] {
  const fromList = parseDemandSheetAttachments(data.demandSheetAttachments);
  if (fromList.length > 0) return fromList;
  const url = (data.demandSheetAttachmentUrl || '').trim();
  if (!url) return [];
  return [
    {
      url,
      name: (data.demandSheetAttachmentName || '').trim() || 'Arquivo anexado',
    },
  ];
}

function demandSheetAttachmentFields(files: DemandSheetAttachment[]) {
  // Client Prisma local ainda pode não ter `demandSheetAttachments` (Json) gerado —
  // só setamos Url/Name aqui; o JSON é persistido em `persistDemandSheetAttachmentsJson`.
  return {
    demandSheetAttachmentUrl: files[0]?.url ?? null,
    demandSheetAttachmentName: files[0]?.name ?? null,
  };
}

type PrismaExecutor = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
};

/** Persiste a lista JSON mesmo se o Prisma Client estiver desatualizado. */
async function persistDemandSheetAttachmentsJson(
  client: PrismaExecutor,
  id: string,
  files: DemandSheetAttachment[]
) {
  await client.$executeRawUnsafe(
    `UPDATE "material_requests" SET "demandSheetAttachments" = $1::jsonb WHERE "id" = $2`,
    JSON.stringify(files),
    id
  );
}

type NestedPurchaseOrderWithCondition = {
  paymentCondition: string | null;
};

/** Mesma lógica da listagem de OC: parcelCount vem da condição de pagamento. */
async function enrichNestedPurchaseOrdersParcelCount<T extends NestedPurchaseOrderWithCondition>(
  orders: T[]
): Promise<Array<T & { paymentParcelCount: number }>> {
  if (orders.length === 0) return [];
  const codes = [...new Set(orders.map((o) => o.paymentCondition).filter(Boolean))] as string[];
  const countByCode = new Map<string, number>();
  if (codes.length > 0) {
    const conds = await prisma.paymentCondition.findMany({
      where: { code: { in: codes } },
      select: { code: true, parcelCount: true }
    });
    for (const c of conds) {
      countByCode.set(c.code, c.parcelCount && c.parcelCount >= 1 ? c.parcelCount : 1);
    }
  }
  return orders.map((o) => ({
    ...o,
    paymentParcelCount: o.paymentCondition
      ? countByCode.get(o.paymentCondition) ?? 1
      : 1
  }));
}

async function withEnrichedMaterialRequestPurchaseOrders<
  T extends { purchaseOrders?: NestedPurchaseOrderWithCondition[] | null }
>(request: T | null): Promise<T | null> {
  if (!request?.purchaseOrders?.length) return request;
  const purchaseOrders = await enrichNestedPurchaseOrdersParcelCount(request.purchaseOrders);
  return { ...request, purchaseOrders };
}

async function withEnrichedMaterialRequestsPurchaseOrders<
  T extends { purchaseOrders?: NestedPurchaseOrderWithCondition[] | null }
>(requests: T[]): Promise<T[]> {
  const allOrders = requests.flatMap((r) => r.purchaseOrders ?? []);
  if (allOrders.length === 0) return requests;
  const enrichedAll = await enrichNestedPurchaseOrdersParcelCount(allOrders);
  let cursor = 0;
  return requests.map((r) => {
    const n = r.purchaseOrders?.length ?? 0;
    if (n === 0) return r;
    const purchaseOrders = enrichedAll.slice(cursor, cursor + n);
    cursor += n;
    return { ...r, purchaseOrders };
  });
}

export interface RmDropdownMaterial {
  id: string;
  code: string;
  sinapiCode?: string;
  name: string;
  description: string;
  unit: string;
  medianPrice: number | null;
  /** Média ponderada das últimas 10 compras efetivas (OCs aprovadas+). */
  avgPaidUnitPrice: number | null;
}

export interface CreateMaterialRequestData {
  requestedBy: string;
  costCenterId: string;
  projectId?: string;
  serviceOrderId?: string;
  serviceOrder?: string;
  obra?: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  demandSheet?: string;
  demandSheetAttachmentUrl?: string;
  demandSheetAttachmentName?: string;
  demandSheetAttachments?: DemandSheetAttachment[];
  items: {
    materialId: string;
    quantity: number;
    /** Valor unitário informado na RM (editável; padrão = média paga). */
    unitPrice?: number | null;
    notes?: string;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
  }[];
}

export interface UpdateMaterialRequestStatusData {
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'REJECTED' | 'CANCELLED';
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

export interface UpdateMaterialRequestCorrectionData {
  costCenterId: string;
  projectId?: string;
  serviceOrderId?: string;
  serviceOrder?: string;
  obra?: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  items: {
    materialId: string;
    quantity: number;
    unitPrice?: number | null;
    notes?: string;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
  }[];
  demandSheet?: string;
  demandSheetAttachmentUrl?: string;
  demandSheetAttachmentName?: string;
  demandSheetAttachments?: DemandSheetAttachment[];
  /** Se true, volta para PENDING após salvar (reenvio para aprovação). */
  submitForApproval?: boolean;
}

export class MaterialRequestService {
  /** FD obrigatória exceto quando o centro de custo é UNB. */
  private async assertCreateMaterialRequestFields(data: CreateMaterialRequestData) {
    const costCenter = data.costCenterId
      ? await prisma.costCenter.findUnique({
          where: { id: data.costCenterId },
          select: { name: true, code: true },
        })
      : null;
    if (isUnbCostCenterRecord(costCenter)) return;

    if (!(data.demandSheet || '').trim()) {
      throw new Error('Ficha de demanda é obrigatória');
    }
    if (normalizeDemandSheetAttachments(data).length === 0) {
      throw new Error('Anexo da ficha de demanda é obrigatório');
    }
  }

  private weightedAvgFromPurchaseLines(
    lines: Array<{ quantity: unknown; unitPrice: unknown }>
  ): number | null {
    let sumQty = 0;
    let sumAmount = 0;
    for (const it of lines) {
      const qty = Number(it.quantity);
      const unitPrice = Number(it.unitPrice);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice)) continue;
      sumQty += qty;
      sumAmount += qty * unitPrice;
    }
    if (sumQty <= 0) return null;
    return Math.round((sumAmount / sumQty) * 100) / 100;
  }

  /** Média ponderada das últimas N compras efetivas por EngineeringMaterial.id. */
  private async avgPaidByEngineeringMaterialIds(
    engIds: string[]
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    const unique = [...new Set(engIds.filter(Boolean))];
    if (unique.length === 0) return result;

    const items = await prisma.purchaseOrderItem.findMany({
      where: {
        materialId: { in: unique },
        purchaseOrder: { status: { in: EFFECTIVE_PURCHASE_ORDER_STATUSES } }
      },
      select: {
        materialId: true,
        quantity: true,
        unitPrice: true,
        createdAt: true,
        purchaseOrder: { select: { orderDate: true } }
      },
      orderBy: [{ purchaseOrder: { orderDate: 'desc' } }, { createdAt: 'desc' }]
    });

    const byEng = new Map<string, Array<{ quantity: unknown; unitPrice: unknown }>>();
    for (const it of items) {
      const list = byEng.get(it.materialId) || [];
      if (list.length >= AVG_PAID_LAST_PURCHASES) continue;
      list.push({ quantity: it.quantity, unitPrice: it.unitPrice });
      byEng.set(it.materialId, list);
    }

    for (const [engId, lines] of byEng) {
      const avg = this.weightedAvgFromPurchaseLines(lines);
      if (avg != null) result.set(engId, avg);
    }
    return result;
  }

  /**
   * Prioridade: unitPrice do cliente (editável na RM) → média paga → mediana SINAPI → 0.
   */
  private resolveItemUnitPrice(
    clientUnitPrice: number | null | undefined,
    avgPaid: number | null | undefined,
    medianPrice: unknown
  ): number {
    if (clientUnitPrice != null && clientUnitPrice !== undefined) {
      const n = Number(clientUnitPrice);
      if (Number.isFinite(n) && n >= 0) return Math.round(n * 100) / 100;
    }
    if (avgPaid != null && Number.isFinite(avgPaid) && avgPaid >= 0) {
      return Math.round(avgPaid * 100) / 100;
    }
    const rawMedian = medianPrice != null ? Number(medianPrice) : 0;
    return Number.isFinite(rawMedian) ? Math.round(rawMedian * 100) / 100 : 0;
  }

  /**
   * Materiais do combo da RM: só cadastro de Construção, com espelho em EngineeringMaterial (sinapiCode CM-*).
   * Uma consulta em lote aos eng. existentes e criação apenas dos faltantes.
   */
  async listConstructionMaterialsForRmDropdown(): Promise<RmDropdownMaterial[]> {
    const constructionMaterials = await prisma.constructionMaterial.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

    return this.mapConstructionMaterialsToRmDropdown(constructionMaterials);
  }

  /** Busca paginada para dropdown da RM (sem carregar o catálogo inteiro). */
  async searchConstructionMaterialsForRmDropdown(
    search: string,
    limit = 50
  ): Promise<RmDropdownMaterial[]> {
    const term = search.trim();
    if (term.length < 2) return [];

    const constructionMaterials = await prisma.constructionMaterial.findMany({
      where: {
        isActive: true,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { description: { contains: term, mode: 'insensitive' } },
          { code: { contains: term, mode: 'insensitive' } }
        ]
      },
      orderBy: { name: 'asc' },
      take: Math.min(Math.max(limit, 1), 100)
    });

    return this.mapConstructionMaterialsToRmDropdown(constructionMaterials);
  }

  private async mapConstructionMaterialsToRmDropdown(
    constructionMaterials: Array<{
      id: string;
      name: string;
      description: string | null;
      unit: string;
      isActive: boolean;
    }>
  ): Promise<RmDropdownMaterial[]> {
    if (constructionMaterials.length === 0) {
      return [];
    }

    const sinapiCodes = constructionMaterials.map((cm) => `CM-${cm.id}`);
    const existingEng = await prisma.engineeringMaterial.findMany({
      where: { sinapiCode: { in: sinapiCodes } }
    });
    const engByCode = new Map<string, EngineeringMaterial>(
      existingEng.map((e) => [e.sinapiCode, e])
    );

    for (const cm of constructionMaterials) {
      const sinapiCode = `CM-${cm.id}`;
      if (engByCode.has(sinapiCode)) continue;
      const eng = await prisma.engineeringMaterial.create({
        data: {
          sinapiCode,
          name: cm.name,
          description: cm.description || cm.name,
          unit: cm.unit,
          isActive: cm.isActive
        }
      });
      engByCode.set(sinapiCode, eng);
    }

    const mapped: RmDropdownMaterial[] = constructionMaterials.map((cm) => {
      const sinapiCode = `CM-${cm.id}`;
      const eng = engByCode.get(sinapiCode)!;
      return {
        id: eng.id,
        code: cm.name,
        sinapiCode: eng.sinapiCode,
        name: cm.name,
        description: cm.description || eng.description || '',
        unit: eng.unit,
        medianPrice: eng.medianPrice ? Number(eng.medianPrice) : null,
        avgPaidUnitPrice: null
      };
    });

    const avgByEng = await this.avgPaidByEngineeringMaterialIds(mapped.map((m) => m.id));
    for (const m of mapped) {
      m.avgPaidUnitPrice = avgByEng.get(m.id) ?? null;
    }

    mapped.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return mapped;
  }

  /**
   * Gera número único para requisição (formato: REQ-YYYY-NNN).
   * Deve ser chamado dentro de uma transação que já obteve o advisory lock.
   */
  private async generateRequestNumber(tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const lastRequest = await tx.materialRequest.findFirst({
      where: {
        requestNumber: {
          startsWith: `REQ-${year}-`
        }
      },
      orderBy: {
        requestNumber: 'desc'
      }
    });

    let sequence = 1;
    if (lastRequest) {
      const lastSequence = parseInt(lastRequest.requestNumber.split('-')[2], 10);
      sequence = (Number.isFinite(lastSequence) ? lastSequence : 0) + 1;
    }

    return `REQ-${year}-${sequence.toString().padStart(3, '0')}`;
  }

  /**
   * Cria uma nova requisição de material
   */
  async createMaterialRequest(data: CreateMaterialRequestData) {
    // Validar centro de custo
    const costCenter = await prisma.costCenter.findUnique({
      where: { id: data.costCenterId }
    });

    if (!costCenter || !costCenter.isActive) {
      throw new Error('Centro de custo não encontrado ou inativo');
    }

    // Validar projeto se informado (apenas se for um ID válido de projeto - CUID)
    if (data.projectId) {
      const isProjectId = data.projectId.length === 25 && data.projectId.startsWith('c');

      if (isProjectId) {
        const project = await prisma.project.findUnique({
          where: { id: data.projectId }
        });

        if (project && project.isActive) {
          // Verificar se o projeto pertence ao centro de custo
          if (project.costCenterId !== data.costCenterId) {
            throw new Error('O projeto não pertence ao centro de custo informado');
          }
        }
      }
    }

    // Validar materiais
    if (!data.items || data.items.length === 0) {
      throw new Error('É necessário informar pelo menos um item');
    }

    // Validar quantidades (usar Number.isFinite — evita strings inválidas passarem na checagem antiga)
    for (const item of data.items) {
      if (!item.materialId) {
        throw new Error('ID do material é obrigatório para todos os itens');
      }
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('Quantidade deve ser maior que zero para todos os itens');
      }
    }

    // Buscar preços dos materiais
    const materials = await prisma.engineeringMaterial.findMany({
      where: {
        id: {
          in: data.items.map(item => item.materialId)
        },
        isActive: true
      }
    });

    if (materials.length !== data.items.length) {
      throw new Error('Um ou mais materiais não foram encontrados ou estão inativos');
    }

    const materialMap = new Map(materials.map(m => [m.id, m]));

    // projectId só pode ser usado se for ID válido de projeto (CUID) - senão viola FK
    const projectId =
      data.projectId && data.projectId.length === 25 && data.projectId.startsWith('c')
        ? data.projectId
        : undefined;

    const { serviceOrderId, serviceOrder } = await resolveRmServiceOrderFields({
      costCenterId: data.costCenterId,
      serviceOrderId: data.serviceOrderId,
      serviceOrder: data.serviceOrder,
      projectId: data.projectId
    });

    if (!serviceOrderId) {
      throw new Error('Ordem de serviço é obrigatória. Selecione uma OS cadastrada no centro de custo.');
    }

    await this.assertCreateMaterialRequestFields(data);

    const obra = (data.obra || '').trim() || null;
    const demandSheet = (data.demandSheet || '').trim() || null;
    const demandSheetFiles = normalizeDemandSheetAttachments(data);

    const avgPaidByMaterial = await this.avgPaidByEngineeringMaterialIds(
      data.items.map((i) => i.materialId)
    );

    // Serializa geração de requestNumber + create (evita race em UNIQUE)
    const request = await prisma.$transaction(
      async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(${MATERIAL_REQUEST_NUMBER_ADVISORY_LOCK})`,
      );
      const requestNumber = await this.generateRequestNumber(tx);

      return tx.materialRequest.create({
        data: {
          requestNumber,
          requestedBy: data.requestedBy,
          costCenterId: data.costCenterId,
          projectId,
          serviceOrderId,
          serviceOrder,
          obra,
          description: data.description?.trim() || null,
          demandSheet,
          ...demandSheetAttachmentFields(demandSheetFiles),
          priority: data.priority || 'MEDIUM',
          status: 'PENDING',
          items: {
            create: data.items.map(item => {
              const material = materialMap.get(item.materialId);
              const qty = Number(item.quantity);
              const safeUnit = this.resolveItemUnitPrice(
                item.unitPrice,
                avgPaidByMaterial.get(item.materialId),
                material?.medianPrice
              );
              const totalPrice = safeUnit * qty;
              const safeTotal = Number.isFinite(totalPrice) ? Math.round(totalPrice * 100) / 100 : 0;

              return {
                materialId: item.materialId,
                quantity: qty,
                unit: material?.unit || 'UN',
                unitPrice: safeUnit,
                totalPrice: safeTotal,
                notes: (item.notes || '').trim(),
                attachmentUrl: item.attachmentUrl ?? null,
                attachmentName: item.attachmentName ?? null,
                status: 'PENDING'
              };
            })
          }
        },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          costCenter: true,
          project: true,
          items: {
            include: {
              material: true
            }
          }
        }
      }).then(async (created) => {
        await persistDemandSheetAttachmentsJson(tx, created.id, demandSheetFiles);
        return created;
      });
    },
      MATERIAL_REQUEST_CREATE_TX_OPTIONS,
    );

    return request;
  }

  /**
   * Lista requisições com filtros
   */
  async listMaterialRequests(filters: {
    status?: string;
    approvedBy?: string;
    costCenterId?: string;
    costCenterIds?: string[];
    projectId?: string;
    requestedBy?: string;
    priority?: string;
    page?: number;
    limit?: number;
    /** false = listagem leve sem linhas de item (detalhe via getById). */
    includeItems?: boolean;
  }) {
    const page = Math.max(1, filters.page || 1);
    const rawLimit = filters.limit ?? 20;
    const limit = Math.min(Math.max(rawLimit, 1), 500);
    const skip = (page - 1) * limit;
    const includeItems = filters.includeItems !== false;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.approvedBy) {
      where.approvedBy = filters.approvedBy;
    }

    if (filters.costCenterId) {
      where.costCenterId = filters.costCenterId;
    } else if (filters.costCenterIds?.length) {
      where.costCenterId = { in: filters.costCenterIds };
    }

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    if (filters.requestedBy) {
      where.requestedBy = filters.requestedBy;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    const baseInclude = {
      requester: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      approver: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      rejecter: {
        select: {
          id: true,
          name: true
        }
      },
      costCenter: {
        select: { id: true, code: true, name: true, state: true, polo: true }
      },
      project: {
        select: { id: true, name: true, code: true }
      },
      service_orders: {
        select: {
          id: true,
          numero: true,
          ano: true,
          pleitos: {
            where: { updatedContractId: { not: null } },
            orderBy: { updatedAt: 'desc' },
            take: 3,
            select: {
              divSe: true,
              folderNumber: true,
              reportsBilling: true,
              updatedContract: {
                select: { id: true, name: true, number: true }
              }
            }
          }
        }
      },
      purchaseOrders: {
        select: {
          id: true,
          status: true,
          orderNumber: true,
          updatedAt: true,
          createdAt: true,
          paymentType: true,
          paymentCondition: true,
          paymentBoletoUrl: true,
          boletoAttachmentUrl: true,
          paymentBoletoInstallments: true,
          paymentBoletoPhaseReleased: true
        },
        orderBy: { createdAt: 'asc' as const }
      }
    } as const;

    const [requests, total] = await Promise.all([
      prisma.materialRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          requestedAt: 'desc'
        },
        include: includeItems
          ? {
              ...baseInclude,
              items: {
                select: {
                  id: true,
                  quantity: true,
                  unit: true,
                  unitPrice: true,
                  totalPrice: true,
                  notes: true,
                  attachmentUrl: true,
                  attachmentName: true,
                  status: true,
                  materialId: true,
                  material: {
                    select: {
                      id: true,
                      name: true,
                      description: true,
                      unit: true,
                      sinapiCode: true
                    }
                  }
                }
              }
            }
          : {
              ...baseInclude,
              _count: { select: { items: true } }
            }
      }),
      prisma.materialRequest.count({ where })
    ]);

    const enrichedRequests = await withEnrichedMaterialRequestsPurchaseOrders(requests);

    return {
      requests: enrichedRequests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Obtém uma requisição por ID
   */
  async getMaterialRequestById(id: string) {
    const request = await prisma.materialRequest.findUnique({
      where: { id },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            employee: {
              select: {
                department: true,
                position: true
              }
            }
          }
        },
        approver: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        rejecter: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        costCenter: true,
        project: true,
        items: {
          include: {
            material: {
              include: {
                category: true
              }
            }
          }
        },
        purchaseOrders: {
          select: {
            id: true,
            status: true,
            orderNumber: true,
            updatedAt: true,
            createdAt: true,
            paymentType: true,
            paymentCondition: true,
            paymentBoletoUrl: true,
            boletoAttachmentUrl: true,
            paymentBoletoInstallments: true,
            paymentBoletoPhaseReleased: true
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
    const enriched = await withEnrichedMaterialRequestPurchaseOrders(request);
    if (!enriched) return enriched;

    // Client Prisma desatualizado pode omitir a coluna JSON — carrega via SQL.
    const currentList = (enriched as { demandSheetAttachments?: unknown }).demandSheetAttachments;
    if (!Array.isArray(currentList) || currentList.length === 0) {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{ demandSheetAttachments: unknown }>>(
          `SELECT "demandSheetAttachments" FROM "material_requests" WHERE "id" = $1 LIMIT 1`,
          id
        );
        const files = parseDemandSheetAttachments(rows[0]?.demandSheetAttachments);
        if (files.length > 0) {
          return this.attachAvgPaidToMaterialRequestItems({
            ...enriched,
            demandSheetAttachments: files,
            demandSheetAttachmentUrl:
              (enriched as { demandSheetAttachmentUrl?: string | null }).demandSheetAttachmentUrl ??
              files[0].url,
            demandSheetAttachmentName:
              (enriched as { demandSheetAttachmentName?: string | null }).demandSheetAttachmentName ??
              files[0].name,
          });
        }
      } catch {
        // ignora se a coluna ainda não existir
      }
    }

    return this.attachAvgPaidToMaterialRequestItems(enriched);
  }

  /** Anexa média paga (últimas 10 OCs) em cada item — só referência (mapa/modais), não afeta OC. */
  private async attachAvgPaidToMaterialRequestItems<T extends { items?: Array<{ materialId?: string; material?: { id?: string } | null }> | null }>(
    request: T | null
  ): Promise<T | null> {
    if (!request?.items?.length) return request;

    const engIds = request.items
      .map((it) => it.materialId || it.material?.id || '')
      .filter(Boolean);
    const avgByEng = await this.avgPaidByEngineeringMaterialIds(engIds);

    const items = request.items.map((it) => {
      const materialId = it.materialId || it.material?.id || '';
      const avgPaidUnitPrice = materialId ? avgByEng.get(materialId) ?? null : null;
      return {
        ...it,
        avgPaidUnitPrice,
        material: it.material
          ? { ...it.material, avgPaidUnitPrice }
          : it.material,
      };
    });

    return { ...request, items };
  }

  /**
   * Atualiza status da requisição
   */
  async updateMaterialRequestStatus(
    id: string,
    data: UpdateMaterialRequestStatusData,
    userId: string
  ) {
    const existing = await prisma.materialRequest.findUnique({ where: { id } });
    if (!existing) {
      throw new Error('Requisição não encontrada');
    }

    // Fase "REJECTED" foi removida do fluxo: tratar como CANCELLED por compatibilidade.
    const nextStatus = (data.status === 'REJECTED' ? 'CANCELLED' : data.status) as UpdateMaterialRequestStatusData['status'];

    if (data.status === 'IN_REVIEW') {
      if (existing.status !== 'PENDING') {
        throw new Error('Apenas requisições pendentes podem ser enviadas para correção');
      }
    }

    if (data.status === 'PENDING' && existing.status === 'IN_REVIEW') {
      if (existing.requestedBy !== userId) {
        throw new Error('Apenas o solicitante pode reenviar a requisição após correção');
      }
    }

    if (nextStatus === 'APPROVED') {
      if (existing.status !== 'PENDING') {
        throw new Error('Aprove apenas requisições pendentes');
      }
    }

    if (nextStatus === 'CANCELLED') {
      if (existing.requestedBy === userId) {
        if (existing.status === 'FULFILLED' || existing.status === 'CANCELLED') {
          throw new Error('Não é possível cancelar uma requisição já atendida ou cancelada');
        }
      } else {
        if (existing.status !== 'PENDING' && existing.status !== 'IN_REVIEW') {
          throw new Error('Apenas requisições pendentes ou em correção podem ser canceladas pelo compras');
        }
      }
    }

    const updateData: any = {
      status: nextStatus,
      updatedAt: new Date()
    };

    if (nextStatus === 'APPROVED' && data.approvedBy) {
      updateData.approvedBy = data.approvedBy;
      updateData.approvedAt = new Date();
    }

    if (nextStatus === 'CANCELLED' && data.rejectedBy) {
      updateData.rejectedBy = data.rejectedBy;
      updateData.rejectedAt = new Date();
      if (data.rejectionReason !== undefined) {
        updateData.rejectionReason = data.rejectionReason;
      }
    }

    // Se todos os itens foram atendidos, marcar como FULFILLED
    if (nextStatus === 'FULFILLED') {
      updateData.completedAt = new Date();
    }

    return await prisma.materialRequest.update({
      where: { id },
      data: updateData,
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        costCenter: true,
        project: true,
        items: {
          include: {
            material: true
          }
        }
      }
    });
  }

  /**
   * Solicitante edita a RM em Correção RM (IN_REVIEW). Opcionalmente reenvia para análise (PENDING).
   */
  async updateMaterialRequestInCorrection(
    id: string,
    userId: string,
    data: UpdateMaterialRequestCorrectionData
  ) {
    const existing = await prisma.materialRequest.findUnique({
      where: { id },
      include: { items: true }
    });

    if (!existing) {
      throw new Error('Requisição não encontrada');
    }
    if (existing.requestedBy !== userId) {
      throw new Error('Apenas o solicitante pode editar esta requisição');
    }
    if (existing.status !== 'IN_REVIEW') {
      throw new Error('Só é possível editar requisições em Correção RM');
    }

    const costCenter = await prisma.costCenter.findUnique({
      where: { id: data.costCenterId }
    });
    if (!costCenter || !costCenter.isActive) {
      throw new Error('Centro de custo não encontrado ou inativo');
    }

    if (!data.items || data.items.length === 0) {
      throw new Error('É necessário informar pelo menos um item');
    }
    for (const item of data.items) {
      if (!item.materialId) {
        throw new Error('ID do material é obrigatório para todos os itens');
      }
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        throw new Error('Quantidade deve ser maior que zero para todos os itens');
      }
    }

    if (data.projectId) {
      const isProjectId = data.projectId.length === 25 && data.projectId.startsWith('c');
      if (isProjectId) {
        const project = await prisma.project.findUnique({
          where: { id: data.projectId }
        });
        if (project && project.isActive && project.costCenterId !== data.costCenterId) {
          throw new Error('O projeto não pertence ao centro de custo informado');
        }
      }
    }

    const materials = await prisma.engineeringMaterial.findMany({
      where: {
        id: { in: data.items.map((i) => i.materialId) },
        isActive: true
      }
    });
    if (materials.length !== data.items.length) {
      throw new Error('Um ou mais materiais não foram encontrados ou estão inativos');
    }
    const materialMap = new Map(materials.map((m) => [m.id, m]));

    const projectId =
      data.projectId && data.projectId.length === 25 && data.projectId.startsWith('c')
        ? data.projectId
        : null;

    const { serviceOrderId, serviceOrder } = await resolveRmServiceOrderFields({
      costCenterId: data.costCenterId,
      serviceOrderId: data.serviceOrderId,
      serviceOrder: data.serviceOrder,
      projectId: data.projectId
    });

    if (!serviceOrderId) {
      throw new Error('Ordem de serviço é obrigatória. Selecione uma OS cadastrada no centro de custo.');
    }

    const obra = (data.obra || '').trim() || null;
    const demandSheetFiles = normalizeDemandSheetAttachments(data);

    const avgPaidByMaterial = await this.avgPaidByEngineeringMaterialIds(
      data.items.map((i) => i.materialId)
    );

    const itemCreates = data.items.map((item) => {
      const material = materialMap.get(item.materialId)!;
      const qty = Number(item.quantity);
      const safeUnit = this.resolveItemUnitPrice(
        item.unitPrice,
        avgPaidByMaterial.get(item.materialId),
        material.medianPrice
      );
      const totalPrice = safeUnit * qty;
      const safeTotal = Number.isFinite(totalPrice) ? Math.round(totalPrice * 100) / 100 : 0;
      return {
        materialId: item.materialId,
        quantity: qty,
        unit: material.unit || 'UN',
        unitPrice: safeUnit,
        totalPrice: safeTotal,
        notes: item.notes || null,
        attachmentUrl: item.attachmentUrl ?? null,
        attachmentName: item.attachmentName ?? null,
        status: 'PENDING' as const
      };
    });

    const attachmentFiles =
      data.demandSheetAttachments !== undefined || data.demandSheetAttachmentUrl !== undefined
        ? demandSheetFiles
        : normalizeDemandSheetAttachments(existing);

    await prisma.materialRequest.update({
      where: { id },
      data: {
        costCenterId: data.costCenterId,
        projectId,
        serviceOrderId,
        serviceOrder,
        obra,
        description: data.description ?? null,
        demandSheet: data.demandSheet !== undefined ? (data.demandSheet || '').trim() || null : existing.demandSheet,
        ...demandSheetAttachmentFields(attachmentFiles),
        priority: data.priority || existing.priority,
        ...(data.submitForApproval ? { status: 'PENDING' } : {}),
        updatedAt: new Date(),
        items: {
          deleteMany: {},
          create: itemCreates
        }
      }
    });

    await persistDemandSheetAttachmentsJson(prisma, id, attachmentFiles);

    return await this.getMaterialRequestById(id);
  }

  /**
   * Cancela uma requisição (apenas quem criou pode cancelar)
   */
  async cancelMaterialRequest(id: string, userId: string) {
    const request = await prisma.materialRequest.findUnique({
      where: { id }
    });

    if (!request) {
      throw new Error('Requisição não encontrada');
    }

    if (request.requestedBy !== userId) {
      throw new Error('Apenas o solicitante pode cancelar a requisição');
    }

    if (request.status === 'FULFILLED' || request.status === 'CANCELLED') {
      throw new Error('Não é possível cancelar uma requisição já atendida ou cancelada');
    }

    return await prisma.materialRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        updatedAt: new Date()
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        costCenter: true,
        project: true,
        items: {
          include: {
            material: true
          }
        }
      }
    });
  }

  /**
   * Atualiza status de um item da requisição
   */
  async updateItemStatus(
    itemId: string,
    status: 'PENDING' | 'APPROVED' | 'PURCHASED' | 'DELIVERED' | 'CANCELLED',
    fulfilledQuantity?: number
  ) {
    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    if (fulfilledQuantity !== undefined) {
      updateData.fulfilledQuantity = fulfilledQuantity;
    }

    const item = await prisma.materialRequestItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        materialRequest: true,
        material: true
      }
    });

    // Verificar se todos os itens foram atendidos
    const request = await prisma.materialRequest.findUnique({
      where: { id: item.materialRequestId },
      include: {
        items: true
      }
    });

    if (request) {
      const allFulfilled = request.items.every(i => 
        i.status === 'DELIVERED' || i.status === 'CANCELLED'
      );
      const someFulfilled = request.items.some(i => 
        i.status === 'DELIVERED' || i.status === 'PURCHASED'
      );

      if (allFulfilled && request.status !== 'FULFILLED') {
        await prisma.materialRequest.update({
          where: { id: request.id },
          data: {
            status: 'FULFILLED',
            completedAt: new Date()
          }
        });
      } else if (someFulfilled && request.status === 'APPROVED') {
        await prisma.materialRequest.update({
          where: { id: request.id },
          data: {
            status: 'PARTIALLY_FULFILLED'
          }
        });
      }
    }

    return item;
  }

  /** Administrador: substitui a lista de anexos da ficha de demanda da RM. */
  async adminReplaceDemandSheetAttachments(
    id: string,
    attachments: DemandSheetAttachment[]
  ) {
    const existing = await prisma.materialRequest.findUnique({ where: { id } });
    if (!existing) throw new Error('Requisição não encontrada');

    const files = attachments
      .map((file) => ({
        url: String(file?.url || '').trim(),
        name: String(file?.name || '').trim() || 'Arquivo anexado',
      }))
      .filter((file) => file.url.length > 0);

    await prisma.materialRequest.update({
      where: { id },
      data: {
        ...demandSheetAttachmentFields(files),
        updatedAt: new Date(),
      },
    });

    await persistDemandSheetAttachmentsJson(prisma, id, files);

    const updated = await this.getMaterialRequestById(id);
    if (!updated) return updated;
    return {
      ...updated,
      ...demandSheetAttachmentFields(files),
      demandSheetAttachments: files,
    };
  }

  /** Administrador: troca ou remove o anexo de um item da RM. */
  async adminReplaceItemAttachment(
    requestId: string,
    itemId: string,
    attachment: { url: string | null; name: string | null }
  ) {
    const item = await prisma.materialRequestItem.findFirst({
      where: { id: itemId, materialRequestId: requestId },
    });
    if (!item) throw new Error('Item da requisição não encontrado');

    const url = attachment.url ? String(attachment.url).trim().slice(0, 2000) : null;
    const name = url
      ? String(attachment.name || '').trim().slice(0, 500) || 'Arquivo anexado'
      : null;

    await prisma.materialRequestItem.update({
      where: { id: itemId },
      data: {
        attachmentUrl: url,
        attachmentName: name,
        updatedAt: new Date(),
      },
    });

    return await this.getMaterialRequestById(requestId);
  }

  async listComments(materialRequestId: string) {
    const db = prisma as typeof prisma & {
      auditLog?: {
        findMany: (args: unknown) => Promise<any[]>;
      };
    };

    const existing = await prisma.materialRequest.findUnique({
      where: { id: materialRequestId },
      select: {
        id: true,
        requestNumber: true,
        createdAt: true,
        requestedAt: true,
        status: true,
        approvedAt: true,
        rejectedAt: true,
        rejectionReason: true,
        requester: { select: { id: true, name: true, profilePhotoUrl: true } },
        approver: { select: { id: true, name: true, profilePhotoUrl: true } },
        rejecter: { select: { id: true, name: true, profilePhotoUrl: true } },
        purchaseOrders: {
          select: {
            id: true,
            orderNumber: true,
            createdAt: true,
            creator: { select: { id: true, name: true, profilePhotoUrl: true } },
            comprasApprovedAt: true,
            comprasApprover: { select: { id: true, name: true, profilePhotoUrl: true } },
            gestorApprovedAt: true,
            gestorApprover: { select: { id: true, name: true, profilePhotoUrl: true } },
            approvedAt: true,
            approver: { select: { id: true, name: true, profilePhotoUrl: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!existing) throw new Error('Requisição não encontrada');

    type Author = { id: string; name: string; profilePhotoUrl?: string | null };
    type FeedItem = {
      id: string;
      kind: 'comment' | 'system';
      content: string;
      createdAt: string;
      author: Author | null;
    };

    const feed: FeedItem[] = [];

    const pushSystem = (
      id: string,
      at: Date | string | null | undefined,
      text: string,
      author?: Author | null
    ) => {
      if (!at || !text.trim()) return;
      const createdAt = typeof at === 'string' ? at : at.toISOString();
      feed.push({
        id,
        kind: 'system',
        content: text.trim(),
        createdAt,
        author: author ?? null,
      });
    };

    const shortOcNumber = (orderNumber?: string | null) => {
      const trimmed = String(orderNumber ?? '').trim();
      if (!trimmed) return '';
      const match = trimmed.match(/(\d+)$/);
      if (match) return String(parseInt(match[1], 10));
      return trimmed;
    };

    if (existing.requester) {
      pushSystem(
        `sys-created-${existing.id}`,
        existing.requestedAt || existing.createdAt,
        `${existing.requester.name} criou a requisição de material`,
        existing.requester
      );
    }

    if (existing.approvedAt && existing.approver) {
      pushSystem(
        `sys-approved-${existing.id}`,
        existing.approvedAt,
        `${existing.approver.name} aprovou a requisição de material`,
        existing.approver
      );
    }

    if (existing.rejectedAt && existing.rejecter) {
      const reason = existing.rejectionReason?.trim();
      pushSystem(
        `sys-rejected-${existing.id}`,
        existing.rejectedAt,
        reason
          ? `${existing.rejecter.name} cancelou a requisição de material: ${reason}`
          : `${existing.rejecter.name} cancelou a requisição de material`,
        existing.rejecter
      );
    }

    for (const oc of existing.purchaseOrders || []) {
      const ocLabel = shortOcNumber(oc.orderNumber) || oc.id.slice(0, 8);
      if (oc.creator) {
        pushSystem(
          `sys-oc-created-${oc.id}`,
          oc.createdAt,
          `${oc.creator.name} criou a OC ${ocLabel}`,
          oc.creator
        );
      }
      if (oc.comprasApprovedAt && oc.comprasApprover) {
        pushSystem(
          `sys-oc-compras-${oc.id}`,
          oc.comprasApprovedAt,
          `${oc.comprasApprover.name} aprovou no compras a OC ${ocLabel}`,
          oc.comprasApprover
        );
      }
      if (oc.gestorApprovedAt && oc.gestorApprover) {
        pushSystem(
          `sys-oc-gestor-${oc.id}`,
          oc.gestorApprovedAt,
          `${oc.gestorApprover.name} aprovou como gestor a OC ${ocLabel}`,
          oc.gestorApprover
        );
      }
      if (oc.approvedAt && oc.approver) {
        pushSystem(
          `sys-oc-diretoria-${oc.id}`,
          oc.approvedAt,
          `${oc.approver.name} aprovou como diretoria a OC ${ocLabel}`,
          oc.approver
        );
      }
    }

    if (db.auditLog?.findMany) {
      try {
        const audits = await db.auditLog.findMany({
          where: {
            entity: 'MaterialRequest',
            entityId: materialRequestId,
            action: { in: ['REJECT', 'DELETE'] },
          },
          orderBy: { createdAt: 'asc' },
          take: 50,
        });
        const userIds = Array.from(
          new Set(audits.map((a: any) => a.userId).filter(Boolean))
        ) as string[];
        const users =
          userIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: userIds } },
                select: { id: true, name: true, profilePhotoUrl: true },
              })
            : [];
        const userById = new Map(users.map((u) => [u.id, u]));
        for (const a of audits) {
          // Já cobrimos cancelamento via rejectedAt/rejecter
          if (a.action === 'REJECT' && existing.rejectedAt && existing.rejecter) continue;
          const summary = String(a.summary || '').trim();
          if (!summary) continue;
          const author = a.userId ? userById.get(a.userId) || null : null;
          const who = author?.name ? `${author.name} ` : '';
          const rest = summary.charAt(0).toLowerCase() + summary.slice(1);
          pushSystem(
            `sys-audit-${a.id}`,
            a.createdAt,
            `${who}${rest}`.replace(/\s+/g, ' ').trim(),
            author
          );
        }
      } catch (err) {
        console.warn('[MaterialRequest] falha ao carregar auditoria no feed:', err);
      }
    }

    const rows = await prisma.materialRequestComment.findMany({
      where: { materialRequestId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: { select: { id: true, name: true, profilePhotoUrl: true } },
      },
    });
    for (const c of rows) {
      feed.push({
        id: c.id,
        kind: 'comment',
        content: c.content,
        createdAt: c.createdAt.toISOString(),
        author: {
          id: c.author.id,
          name: c.author.name,
          profilePhotoUrl: c.author.profilePhotoUrl,
        },
      });
    }

    feed.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return feed;
  }

  async createComment(materialRequestId: string, userId: string, content: string) {
    const text = content.trim();
    if (!text) throw new Error('Escreva um comentário');
    if (text.length > 4000) throw new Error('Comentário muito longo (máx. 4000 caracteres)');

    const existing = await prisma.materialRequest.findUnique({
      where: { id: materialRequestId },
      select: { id: true },
    });
    if (!existing) throw new Error('Requisição não encontrada');

    const comment = await prisma.materialRequestComment.create({
      data: {
        materialRequestId,
        userId,
        content: text,
      },
      include: {
        author: { select: { id: true, name: true, profilePhotoUrl: true } },
      },
    });

    return {
      id: comment.id,
      kind: 'comment' as const,
      content: comment.content,
      createdAt: comment.createdAt.toISOString(),
      author: {
        id: comment.author.id,
        name: comment.author.name,
        profilePhotoUrl: comment.author.profilePhotoUrl,
      },
    };
  }

  async deleteComment(commentId: string, userId: string, isAdmin: boolean) {
    const comment = await prisma.materialRequestComment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true },
    });
    if (!comment) throw new Error('Comentário não encontrado');
    if (!isAdmin && comment.userId !== userId) {
      throw new Error('Sem permissão para excluir este comentário');
    }
    await prisma.materialRequestComment.delete({ where: { id: commentId } });
  }
}
