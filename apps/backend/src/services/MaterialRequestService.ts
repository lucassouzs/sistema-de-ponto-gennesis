import { prisma } from '../lib/prisma';
import type { EngineeringMaterial } from '@prisma/client';

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
  /** Se true, volta para PENDING após salvar (reenvio para aprovação). */
  submitForApproval?: boolean;
}

export class MaterialRequestService {
  /**
   * Materiais do combo da RM: só cadastro de Construção, com espelho em EngineeringMaterial (sinapiCode CM-*).
   * Uma consulta em lote aos eng. existentes e criação apenas dos faltantes.
   */
  async listConstructionMaterialsForRmDropdown(): Promise<RmDropdownMaterial[]> {
    const constructionMaterials = await prisma.constructionMaterial.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' }
    });

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
        name: cm.description || cm.name || eng.description || eng.name || '',
        description: cm.description || eng.description || '',
        unit: eng.unit,
        medianPrice: eng.medianPrice ? Number(eng.medianPrice) : null
      };
    });

    mapped.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    return mapped;
  }

  /**
   * Gera número único para requisição (formato: REQ-YYYY-NNN)
   */
  private async generateRequestNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const lastRequest = await prisma.materialRequest.findFirst({
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
      const lastSequence = parseInt(lastRequest.requestNumber.split('-')[2]);
      sequence = lastSequence + 1;
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

    const requestNumber = await this.generateRequestNumber();

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

    // Ordem de serviço: preferir campo explícito; fallback para projectId quando vier texto livre
    const serviceOrder =
      (data.serviceOrder || '').trim() ||
      (data.projectId && !(data.projectId.length === 25 && data.projectId.startsWith('c'))
        ? data.projectId.trim()
        : undefined);

    const obra = (data.obra || '').trim() || undefined;

    // Criar requisição com itens
    const request = await prisma.materialRequest.create({
      data: {
        requestNumber,
        requestedBy: data.requestedBy,
        costCenterId: data.costCenterId,
        projectId,
        serviceOrder,
        obra,
        description: data.description,
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
              notes: item.notes,
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

    return request;
  }

  /**
   * Lista requisições com filtros
   */
  async listMaterialRequests(filters: {
    status?: string;
    costCenterId?: string;
    projectId?: string;
    requestedBy?: string;
    priority?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, filters.page || 1);
    const rawLimit = filters.limit ?? 20;
    const limit = Math.min(Math.max(rawLimit, 1), 500);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.costCenterId) {
      where.costCenterId = filters.costCenterId;
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

    const [requests, total] = await Promise.all([
      prisma.materialRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          requestedAt: 'desc'
        },
        include: {
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
          costCenter: true,
          project: true,
          items: {
            include: {
              material: true
            }
          },
          purchaseOrders: {
            select: {
              id: true,
              status: true,
              orderNumber: true
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      }),
      prisma.materialRequest.count({ where })
    ]);

    return {
      requests,
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
    return await prisma.materialRequest.findUnique({
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
            createdAt: true
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });
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

    const serviceOrder =
      (data.serviceOrder || '').trim() ||
      (data.projectId && !(data.projectId.length === 25 && data.projectId.startsWith('c'))
        ? data.projectId.trim()
        : null);

    const obra = (data.obra || '').trim() || null;

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
        serviceOrder,
        obra,
        description: data.description ?? null,
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
