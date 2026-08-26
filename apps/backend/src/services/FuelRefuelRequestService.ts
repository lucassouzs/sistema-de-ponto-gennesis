import {
  FuelRefuelDeadlineUnit,
  FuelRefuelRequestStatus,
  FuelTankLevelAfter,
  FuelVehicleType,
  Prisma,
} from '@prisma/client';
import { resolveFuelPhotoViewUrl } from '../lib/fuelPhotoStorage';
import { getFuelSatelliteCityByCode } from '../constants/fuelSatelliteCities';
import { getFuelGasStationForContract } from '../lib/fuelAdministrativeRegions';
import {
  computeRefuelDeadlineAt,
  formatRefuelDeadlineLabel,
} from '../lib/fuelSuppliesSla';
import { prisma } from '../lib/prisma';
import { findUserIdsMatchingSearch } from '../lib/normalizeSearchText';
import { createError } from '../middleware/errorHandler';
import {
  notifyFuelRequesterApprovedBySupplies,
  notifyFuelRequesterRejectedBySupplies,
  notifyFuelRequesterReportCompleted,
  notifyFuelRequesterWaitingSupplies,
} from '../lib/fuelRefuelChatNotify';

export type CreateFuelRefuelRequestInput = {
  requesterId: string;
  refuelDate: Date;
  route: string;
  satelliteCityCode?: string | null;
  administrativeRegionId?: string | null;
  contractId?: string | null;
  costCenter?: string | null;
  driverName: string;
  vehiclePlate: string;
  vehicleDescription?: string | null;
  vehicleType: FuelVehicleType;
  dashboardPhotoUrl?: string | null;
  dashboardPhotoKey?: string | null;
  dashboardPhotoName?: string | null;
  observations?: string | null;
  sourceChatId?: string | null;
  sourceWhatsAppPhone?: string | null;
};

export type SuppliesApproveFuelRefuelInput = {
  gasStationId: string;
  refuelDeadlineAmount: number;
  refuelDeadlineUnit: FuelRefuelDeadlineUnit;
  comment?: string | null;
};

const fuelRefuelInclude = {
  requester: { select: { id: true, name: true, email: true } },
  administrativeRegion: { select: { id: true, code: true, name: true, stateCode: true } },
  gasStation: { select: { id: true, displayNumber: true, name: true, address: true, cityCode: true } },
  contract: {
    select: {
      id: true,
      name: true,
      number: true,
      costCenter: { select: { id: true, code: true, name: true } },
    },
  },
  managerApprover: { select: { id: true, name: true } },
  suppliesApprover: { select: { id: true, name: true } },
} satisfies Prisma.FuelRefuelRequestInclude;

export type SubmitFuelRefuelReportInput = {
  requesterId: string;
  requestId: string;
  odometerKm: number;
  tankLevelAfter: FuelTankLevelAfter;
  litersRefueled: number;
  pricePerLiter: number;
  receiptPhotoUrl?: string | null;
  receiptPhotoKey?: string | null;
  receiptPhotoName?: string | null;
  observations?: string | null;
};

function initialStatusForVehicleType(vehicleType: FuelVehicleType): FuelRefuelRequestStatus {
  return vehicleType === FuelVehicleType.PRIVATE
    ? FuelRefuelRequestStatus.PENDING_MANAGER
    : FuelRefuelRequestStatus.PENDING_SUPPLIES;
}

type FuelPhotoFields = {
  dashboardPhotoUrl?: string | null;
  dashboardPhotoKey?: string | null;
  receiptPhotoUrl?: string | null;
  receiptPhotoKey?: string | null;
};

async function presentFuelRowPhotos<T extends FuelPhotoFields & { satelliteCityCode?: string | null; administrativeRegion?: { code: string; name: string; stateCode: string } | null }>(row: T) {
  const [dashboardPhotoViewUrl, receiptPhotoViewUrl] = await Promise.all([
    resolveFuelPhotoViewUrl(row.dashboardPhotoUrl, row.dashboardPhotoKey),
    resolveFuelPhotoViewUrl(row.receiptPhotoUrl, row.receiptPhotoKey),
  ]);

  const city = row.satelliteCityCode ? getFuelSatelliteCityByCode(row.satelliteCityCode) : null;
  const administrativeRegion = city
    ? { id: city.code, code: city.code, name: city.name, stateCode: city.stateCode }
    : row.administrativeRegion ?? null;

  return {
    ...row,
    administrativeRegion,
    dashboardPhotoViewUrl,
    receiptPhotoViewUrl,
  };
}

async function presentFuelRowsPhotos<T extends FuelPhotoFields>(rows: T[]) {
  return Promise.all(rows.map((row) => presentFuelRowPhotos(row)));
}

export class FuelRefuelRequestService {
  async create(input: CreateFuelRefuelRequestInput) {
    const costCenter = input.costCenter?.trim() || null;
    const contractId = input.contractId?.trim() || null;

    if (!costCenter && !contractId) {
      throw createError('Centro de custo ou contrato é obrigatório', 400);
    }

    if (contractId) {
      const contract = await prisma.contract.findUnique({
        where: { id: contractId },
        select: { id: true },
      });
      if (!contract) throw createError('Contrato não encontrado', 404);
    }

    const satelliteCityCode = input.satelliteCityCode?.trim().toUpperCase() || null;
    if (!satelliteCityCode) {
      throw createError('Cidade é obrigatória', 400);
    }
    if (!getFuelSatelliteCityByCode(satelliteCityCode)) {
      throw createError('Cidade satélite inválida', 400);
    }

    const administrativeRegionId = input.administrativeRegionId?.trim() || null;

    return prisma.$transaction(async (tx) => {
      const agg = await tx.fuelRefuelRequest.aggregate({ _max: { displayNumber: true } });
      const nextDisplay = (agg._max.displayNumber ?? 0) + 1;

      return tx.fuelRefuelRequest.create({
        data: {
          displayNumber: nextDisplay,
          requesterId: input.requesterId,
          refuelDate: input.refuelDate,
          route: input.route.trim(),
          satelliteCityCode,
          administrativeRegionId,
          costCenter,
          contractId,
          driverName: input.driverName.trim(),
          vehiclePlate: input.vehiclePlate.trim(),
          vehicleDescription: input.vehicleDescription?.trim() || null,
          vehicleType: input.vehicleType,
          dashboardPhotoUrl: input.dashboardPhotoUrl || null,
          dashboardPhotoKey: input.dashboardPhotoKey || null,
          dashboardPhotoName: input.dashboardPhotoName || null,
          observations: input.observations?.trim() || null,
          sourceChatId: input.sourceChatId || null,
          sourceWhatsAppPhone: input.sourceWhatsAppPhone || null,
          status: initialStatusForVehicleType(input.vehicleType),
        },
        include: fuelRefuelInclude,
      });
    });
  }

  async listForSupplies(params: {
    search?: string;
    status?: FuelRefuelRequestStatus;
    statuses?: FuelRefuelRequestStatus[];
    requesterId?: string;
    queue?: 'supplies' | 'all';
  }) {
    const where: Prisma.FuelRefuelRequestWhereInput = {};

    if (params.statuses?.length) {
      where.status = { in: params.statuses };
    } else if (params.queue === 'supplies') {
      where.status = FuelRefuelRequestStatus.PENDING_SUPPLIES;
    } else if (params.status) {
      where.status = params.status;
    }

    if (params.requesterId) where.requesterId = params.requesterId;

    const search = params.search?.trim();
    if (search) {
      const asNumber = parseInt(search, 10);
      const matchedRequesterIds = await findUserIdsMatchingSearch(search);
      where.OR = [
        { route: { contains: search, mode: 'insensitive' } },
        { driverName: { contains: search, mode: 'insensitive' } },
        { vehiclePlate: { contains: search, mode: 'insensitive' } },
        {
          requesterId: {
            in: matchedRequesterIds.length > 0 ? matchedRequesterIds : ['__none__'],
          },
        },
        { contract: { name: { contains: search, mode: 'insensitive' } } },
        { contract: { number: { contains: search, mode: 'insensitive' } } },
        { costCenter: { contains: search, mode: 'insensitive' } },
        ...(Number.isFinite(asNumber) ? [{ displayNumber: asNumber }] : []),
      ];
    }

    const rows = await prisma.fuelRefuelRequest.findMany({
      where,
      include: fuelRefuelInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return presentFuelRowsPhotos(rows);
  }

  async getById(id: string) {
    const row = await prisma.fuelRefuelRequest.findUnique({
      where: { id },
      include: fuelRefuelInclude,
    });
    if (!row) throw createError('Solicitação não encontrada', 404);
    return row;
  }

  async getByIdForApi(id: string) {
    return presentFuelRowPhotos(await this.getById(id));
  }

  async adminUpdateContract(id: string, contractId: string) {
    const row = await this.getById(id);
    const editable: FuelRefuelRequestStatus[] = [
      FuelRefuelRequestStatus.PENDING_MANAGER,
      FuelRefuelRequestStatus.PENDING_SUPPLIES,
    ];
    if (!editable.includes(row.status)) {
      throw createError('Só é possível editar solicitações pendentes de análise', 400);
    }

    const contract = await prisma.contract.findUnique({
      where: { id: contractId.trim() },
      select: { id: true, name: true, number: true },
    });
    if (!contract) throw createError('Contrato não encontrado', 404);

    const costCenterLabel = contract.name.trim() || contract.number;

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id },
      data: {
        contractId: contract.id,
        costCenter: costCenterLabel,
      },
      include: fuelRefuelInclude,
    });

    return presentFuelRowPhotos(updated);
  }

  async managerApprove(id: string, managerId: string, comment?: string) {
    const row = await this.getById(id);
    if (row.status !== FuelRefuelRequestStatus.PENDING_MANAGER) {
      throw createError('Esta solicitação não está aguardando aprovação', 400);
    }
    if (row.vehicleType !== FuelVehicleType.PRIVATE) {
      throw createError('Apenas solicitações de veículo particular passam pelo gestor', 400);
    }

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id },
      data: {
        status: FuelRefuelRequestStatus.PENDING_SUPPLIES,
        managerApprovedBy: managerId,
        managerApprovedAt: new Date(),
        managerApprovalComment: comment?.trim() || null,
      },
      include: fuelRefuelInclude,
    });

    await notifyFuelRequesterWaitingSupplies(
      updated.sourceChatId,
      updated.displayNumber,
      updated.sourceWhatsAppPhone,
    );
    return updated;
  }

  async managerReject(id: string, managerId: string, reason: string) {
    const row = await this.getById(id);
    if (row.status !== FuelRefuelRequestStatus.PENDING_MANAGER) {
      throw createError('Esta solicitação não está aguardando aprovação', 400);
    }

    return prisma.fuelRefuelRequest.update({
      where: { id },
      data: {
        status: FuelRefuelRequestStatus.REJECTED,
        managerApprovedBy: managerId,
        managerApprovedAt: new Date(),
        managerRejectionReason: reason.trim(),
      },
      include: fuelRefuelInclude,
    });
  }

  async cancel(id: string, requesterId: string) {
    const row = await this.getById(id);
    if (row.requesterId !== requesterId) {
      throw createError('Você não pode cancelar esta solicitação', 403);
    }
    if (row.status !== FuelRefuelRequestStatus.PENDING_MANAGER) {
      throw createError('Só é possível cancelar solicitações pendentes de aprovação do gestor', 400);
    }

    return prisma.fuelRefuelRequest.update({
      where: { id },
      data: { status: FuelRefuelRequestStatus.CANCELLED },
      include: fuelRefuelInclude,
    });
  }

  async countPendingManager(
    contractScope?: Prisma.FuelRefuelRequestWhereInput,
  ): Promise<number> {
    return prisma.fuelRefuelRequest.count({
      where: {
        status: FuelRefuelRequestStatus.PENDING_MANAGER,
        vehicleType: FuelVehicleType.PRIVATE,
        ...contractScope,
      },
    });
  }

  async countPendingSupplies(): Promise<number> {
    return prisma.fuelRefuelRequest.count({
      where: { status: FuelRefuelRequestStatus.PENDING_SUPPLIES },
    });
  }

  async suppliesApprove(
    id: string,
    suppliesUserId: string,
    input: SuppliesApproveFuelRefuelInput,
  ) {
    const row = await this.getById(id);
    if (row.status !== FuelRefuelRequestStatus.PENDING_SUPPLIES) {
      throw createError('Esta solicitação não está aguardando aprovação do Suprimentos', 400);
    }
    const contractId = row.contractId?.trim() || null;
    if (!contractId) {
      throw createError('Solicitação sem contrato definido', 400);
    }

    const amount = Math.trunc(input.refuelDeadlineAmount);
    if (!Number.isFinite(amount) || amount < 1) {
      throw createError('Informe o prazo para abastecer (mínimo 1)', 400);
    }
    if (amount > 365) {
      throw createError('Prazo para abastecer inválido', 400);
    }

    const gasStation = await getFuelGasStationForContract(input.gasStationId, contractId);
    if (!gasStation) {
      throw createError('Selecione um posto vinculado ao contrato da solicitação', 400);
    }

    const refuelDeadlineAt = computeRefuelDeadlineAt(amount, input.refuelDeadlineUnit);

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id },
      data: {
        status: FuelRefuelRequestStatus.AWAITING_REFUEL,
        gasStationId: gasStation.id,
        refuelDeadlineAt,
        refuelDeadlineAmount: amount,
        refuelDeadlineUnit: input.refuelDeadlineUnit,
        suppliesApprovedBy: suppliesUserId,
        suppliesApprovedAt: new Date(),
        suppliesApprovalComment: input.comment?.trim() || null,
      },
      include: fuelRefuelInclude,
    });

    await notifyFuelRequesterApprovedBySupplies(
      updated.sourceChatId,
      updated.displayNumber,
      {
        gasStationName: gasStation.name,
        gasStationAddress: gasStation.address,
        refuelDeadlineLabel: formatRefuelDeadlineLabel(amount, input.refuelDeadlineUnit),
        refuelDeadlineAt,
        comment: updated.suppliesApprovalComment,
      },
      updated.sourceWhatsAppPhone,
    );
    return updated;
  }

  async suppliesReject(id: string, suppliesUserId: string, reason: string) {
    const row = await this.getById(id);
    if (row.status !== FuelRefuelRequestStatus.PENDING_SUPPLIES) {
      throw createError('Esta solicitação não está aguardando aprovação do Suprimentos', 400);
    }

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id },
      data: {
        status: FuelRefuelRequestStatus.REJECTED,
        suppliesApprovedBy: suppliesUserId,
        suppliesApprovedAt: new Date(),
        suppliesRejectionReason: reason.trim(),
      },
      include: fuelRefuelInclude,
    });

    await notifyFuelRequesterRejectedBySupplies(
      updated.sourceChatId,
      updated.displayNumber,
      reason,
      updated.sourceWhatsAppPhone,
    );
    return updated;
  }

  async listAwaitingRefuelForRequester(requesterId: string) {
    return prisma.fuelRefuelRequest.findMany({
      where: {
        requesterId,
        status: FuelRefuelRequestStatus.AWAITING_REFUEL,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        displayNumber: true,
        vehiclePlate: true,
        driverName: true,
        refuelDate: true,
        requesterId: true,
      },
    });
  }

  async listAwaitingRefuelForWhatsAppPhone(phone: string) {
    return prisma.fuelRefuelRequest.findMany({
      where: {
        sourceWhatsAppPhone: phone,
        status: FuelRefuelRequestStatus.AWAITING_REFUEL,
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        displayNumber: true,
        vehiclePlate: true,
        driverName: true,
        refuelDate: true,
        requesterId: true,
      },
    });
  }

  async submitRefuelReport(input: SubmitFuelRefuelReportInput) {
    const row = await this.getById(input.requestId);
    if (row.requesterId !== input.requesterId) {
      throw createError('Você não pode informar abastecimento desta solicitação', 403);
    }
    if (row.status !== FuelRefuelRequestStatus.AWAITING_REFUEL) {
      throw createError('Esta solicitação não está aguardando dados do abastecimento', 400);
    }

    if (!String(input.receiptPhotoUrl || '').trim() && !String(input.receiptPhotoKey || '').trim()) {
      throw createError('Foto do cupom fiscal é obrigatória', 400);
    }

    const updated = await prisma.fuelRefuelRequest.update({
      where: { id: input.requestId },
      data: {
        status: FuelRefuelRequestStatus.COMPLETED,
        refuelReportedAt: new Date(),
        odometerKm: input.odometerKm,
        tankLevelAfter: input.tankLevelAfter,
        litersRefueled: input.litersRefueled,
        pricePerLiter: input.pricePerLiter,
        receiptPhotoUrl: input.receiptPhotoUrl?.trim() || null,
        receiptPhotoKey: input.receiptPhotoKey || null,
        receiptPhotoName: input.receiptPhotoName || null,
        refuelReportObservations: input.observations?.trim() || null,
      },
      include: fuelRefuelInclude,
    });

    await notifyFuelRequesterReportCompleted(
      updated.sourceChatId,
      updated.displayNumber,
      updated.sourceWhatsAppPhone,
    );
    return updated;
  }

  async listForManagerApprovals(params: {
    phase: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
    contractScope: Prisma.FuelRefuelRequestWhereInput;
  }) {
    const phaseFilter: Prisma.FuelRefuelRequestWhereInput =
      params.phase === 'PENDING'
        ? {
            status: FuelRefuelRequestStatus.PENDING_MANAGER,
            vehicleType: FuelVehicleType.PRIVATE,
          }
        : params.phase === 'APPROVED'
          ? {
              managerApprovedAt: { not: null },
              vehicleType: FuelVehicleType.PRIVATE,
              status: {
                notIn: [
                  FuelRefuelRequestStatus.REJECTED,
                  FuelRefuelRequestStatus.CANCELLED,
                  FuelRefuelRequestStatus.PENDING_MANAGER,
                ],
              },
            }
          : params.phase === 'REJECTED'
            ? {
                vehicleType: FuelVehicleType.PRIVATE,
                OR: [
                  { status: FuelRefuelRequestStatus.REJECTED },
                  { status: FuelRefuelRequestStatus.CANCELLED },
                ],
              }
            : {
                vehicleType: FuelVehicleType.PRIVATE,
                OR: [
                  { status: FuelRefuelRequestStatus.PENDING_MANAGER },
                  {
                    managerApprovedAt: { not: null },
                    status: {
                      notIn: [
                        FuelRefuelRequestStatus.REJECTED,
                        FuelRefuelRequestStatus.CANCELLED,
                        FuelRefuelRequestStatus.PENDING_MANAGER,
                      ],
                    },
                  },
                  { status: FuelRefuelRequestStatus.REJECTED },
                  { status: FuelRefuelRequestStatus.CANCELLED },
                ],
              };

    const rows = await prisma.fuelRefuelRequest.findMany({
      where: { ...phaseFilter, ...params.contractScope },
      include: fuelRefuelInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return presentFuelRowsPhotos(rows);
  }
}

export const fuelRefuelRequestService = new FuelRefuelRequestService();
