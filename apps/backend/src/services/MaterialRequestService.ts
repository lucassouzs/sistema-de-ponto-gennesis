import { prisma } from '../lib/prisma';
import { type EngineeringMaterial, Prisma } from '@prisma/client';
import { isUnbCostCenterRecord } from '../lib/unbCostCenterScope';
import { resolveRmServiceOrderFields } from '../utils/materialRequestServiceOrder';

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
  return {
    demandSheetAttachmentUrl: files[0]?.url ?? null,
    demandSheetAttachmentName: files[0]?.name ?? null,
    demandSheetAttachments: files.length > 0 ? (files as Prisma.InputJsonValue) : Prisma.DbNull,
  };
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
        medianPrice: eng.medianPrice ? Number(eng.medianPrice) : null
      };
    });

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
              const rawMedian = material?.medianPrice;
              const unitPriceNum = rawMedian != null ? Number(rawMedian) : 0;
              const safeUnit = Number.isFinite(unitPriceNum) ? unitPriceNum : 0;
              const totalPrice = safeUnit * qty;
              const safeTotal = Number.isFinite(totalPrice) ? totalPrice : 0;

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
    return withEnrichedMaterialRequestPurchaseOrders(request);
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

    const itemCreates = data.items.map((item) => {
      const material = materialMap.get(item.materialId)!;
      const qty = Number(item.quantity);
      const rawMedian = material.medianPrice;
      const unitPriceNum = rawMedian != null ? Number(rawMedian) : 0;
      const safeUnit = Number.isFinite(unitPriceNum) ? unitPriceNum : 0;
      const totalPrice = safeUnit * qty;
      const safeTotal = Number.isFinite(totalPrice) ? totalPrice : 0;
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
        ...demandSheetAttachmentFields(
          data.demandSheetAttachments !== undefined || data.demandSheetAttachmentUrl !== undefined
            ? demandSheetFiles
            : normalizeDemandSheetAttachments(existing)
        ),
        priority: data.priority || existing.priority,
        ...(data.submitForApproval ? { status: 'PENDING' } : {}),
        updatedAt: new Date(),
        items: {
          deleteMany: {},
          create: itemCreates
        }
      }
    });

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
}
