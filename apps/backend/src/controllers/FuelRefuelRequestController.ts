import { Response, NextFunction } from 'express';
import { FuelRefuelRequestStatus, FuelTankLevelAfter, FuelVehicleType } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { fuelRefuelRequestService } from '../services/FuelRefuelRequestService';
import {
  assertManagerCanActOnFuelContract,
  getManagerFuelApprovalContractScope,
} from '../lib/fuelApprovalAccess';
import { assertUserHasFuelSuppliesAccess } from '../lib/fuelSuppliesAccess';
import {
  listActiveFuelGasStationsByCity,
  listActiveFuelGasStationsForRequest,
  listFuelSatelliteCities,
} from '../lib/fuelAdministrativeRegions';
import { FUEL_ABASTECIMENTO_STATE_CODES } from '../constants/fuelSatelliteCities';
import { getFuelSuppliesSlaHours } from '../lib/fuelSuppliesSla';
import {
  findEmployeeByCpf,
  isValidCpf,
  resolveFuelRequestContextFromEmployee,
  type EmployeeCpfLookupResult,
} from '../lib/employeeCpfLookup';
import { prisma } from '../lib/prisma';
import { PhotoService } from '../services/PhotoService';

const photoService = new PhotoService();

function parseImageContentType(dataUrl: string): string {
  const match = /^data:([^;]+);base64,/i.exec(dataUrl);
  return match?.[1]?.trim() || 'image/jpeg';
}

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  queue: z.enum(['supplies', 'all']).optional(),
  mine: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

function parseStatusFilter(value: unknown): FuelRefuelRequestStatus[] | undefined {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw || raw === 'ALL') return undefined;

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const statuses: FuelRefuelRequestStatus[] = [];

  for (const part of parts) {
    if (Object.values(FuelRefuelRequestStatus).includes(part as FuelRefuelRequestStatus)) {
      statuses.push(part as FuelRefuelRequestStatus);
    } else {
      throw createError('Status de filtro inválido', 400);
    }
  }

  return statuses.length ? statuses : undefined;
}

const approveSchema = z.object({
  comment: z.string().optional(),
});

const suppliesApproveSchema = z.object({
  comment: z.string().optional(),
  gasStationId: z.string().min(1, 'Selecione o posto para abastecimento'),
  refuelDeadlineAmount: z.coerce.number().int().min(1).max(365),
  refuelDeadlineUnit: z.enum(['HOURS', 'DAYS']),
});

const rejectSchema = z.object({
  reason: z.string().min(1, 'Informe o motivo da rejeição'),
  comment: z.string().optional(),
});

const adminUpdateSchema = z.object({
  contractId: z.string().min(1, 'Selecione o contrato'),
});

const createSchema = z.object({
  refuelDate: z.string().min(1, 'Informe a data do abastecimento'),
  route: z.string().min(2, 'Informe a rota'),
  satelliteCityCode: z.string().min(1, 'Selecione a cidade de abastecimento'),
  contractId: z.string().min(1, 'Selecione o contrato'),
  vehiclePlate: z.string().min(1, 'Informe a placa do veículo'),
  vehicleDescription: z.string().optional(),
  vehicleType: z.enum(['PRIVATE', 'COMPANY']),
  dashboardPhotoBase64: z.string().min(1, 'Envie a foto do painel'),
  observations: z.string().optional(),
  driverCpf: z.string().optional(),
  driverUserId: z.string().optional(),
});

const reportSchema = z.object({
  odometerKm: z.coerce.number().int().positive('Informe o hodômetro em km'),
  tankLevelAfter: z.enum(['RESERVE', 'QUARTER', 'HALF', 'THREE_QUARTERS', 'FULL'], {
    required_error: 'Informe o nível do tanque',
  }),
  litersRefueled: z.coerce.number().positive('Informe os litros abastecidos'),
  pricePerLiter: z.coerce.number().positive('Informe o valor por litro'),
  receiptPhotoBase64: z.string().min(1, 'Envie a foto do cupom fiscal'),
  observations: z.string().optional(),
});

async function resolveDriverContext(
  requesterId: string,
  opts?: { driverCpf?: string | null; driverUserId?: string | null },
): Promise<{ driverName: string; costCenterLabel: string; contractId?: string | null }> {
  const driverUserId = opts?.driverUserId?.trim();
  if (driverUserId) {
    const user = await prisma.user.findUnique({
      where: { id: driverUserId },
      select: {
        id: true,
        name: true,
        cpf: true,
        employee: { select: { costCenter: true, id: true } },
      },
    });
    if (!user?.employee) {
      throw createError('Condutor não encontrado ou sem vínculo de colaborador.', 404);
    }
    const asLookup: EmployeeCpfLookupResult = {
      userId: user.id,
      employeeId: user.employee.id,
      name: user.name,
      cpfDigits: (user.cpf || '').replace(/\D/g, ''),
      cpfMasked: user.cpf || '',
      costCenter: user.employee.costCenter,
      department: null,
      position: null,
    };
    const ctx = await resolveFuelRequestContextFromEmployee(asLookup);
    if (!ctx.ok) throw createError(ctx.message, 400);
    return {
      driverName: user.name,
      costCenterLabel: ctx.costCenterLabel,
      contractId: ctx.contractId,
    };
  }

  const cpfRaw = opts?.driverCpf?.trim();
  if (cpfRaw) {
    if (!isValidCpf(cpfRaw)) {
      throw createError('CPF do condutor inválido', 400);
    }
    const employee = await findEmployeeByCpf(cpfRaw);
    if (!employee) {
      throw createError('Condutor não encontrado. Verifique o CPF cadastrado.', 404);
    }
    const ctx = await resolveFuelRequestContextFromEmployee(employee);
    if (!ctx.ok) throw createError(ctx.message, 400);
    return {
      driverName: employee.name,
      costCenterLabel: ctx.costCenterLabel,
      contractId: ctx.contractId,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: requesterId },
    select: {
      name: true,
      cpf: true,
      employee: { select: { costCenter: true, id: true } },
    },
  });
  if (!user) throw createError('Usuário não encontrado', 404);
  if (!user.employee) {
    throw createError(
      'Seu usuário não está vinculado a um colaborador. Fale com o RH.',
      400,
    );
  }

  const asLookup: EmployeeCpfLookupResult = {
    userId: requesterId,
    employeeId: user.employee.id,
    name: user.name,
    cpfDigits: (user.cpf || '').replace(/\D/g, ''),
    cpfMasked: user.cpf || '',
    costCenter: user.employee.costCenter,
    department: null,
    position: null,
  };
  const ctx = await resolveFuelRequestContextFromEmployee(asLookup);
  if (!ctx.ok) throw createError(ctx.message, 400);
  return {
    driverName: user.name,
    costCenterLabel: ctx.costCenterLabel,
    contractId: ctx.contractId,
  };
}

function mapManagerScopeToFuelWhere(
  scope: Record<string, unknown>,
): { contractId?: { in: string[] } } {
  const contractId = scope.contractId as { in: string[] } | undefined;
  if (contractId?.in?.length) return { contractId };
  return {};
}

export class FuelRefuelRequestController {
  async listSatelliteCitiesForRequester(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const stateCode = String(req.query.stateCode ?? '').trim().toUpperCase();
      if (stateCode && !FUEL_ABASTECIMENTO_STATE_CODES.includes(stateCode as 'DF' | 'GO')) {
        throw createError('Estado inválido. Use DF ou GO.', 400);
      }
      const rows = listFuelSatelliteCities(stateCode || undefined);
      res.json({
        success: true,
        data: {
          states: [...FUEL_ABASTECIMENTO_STATE_CODES],
          cities: rows,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async lookupDriver(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const cpf = String(req.query.cpf ?? '').trim();
      if (!cpf) throw createError('Informe o CPF', 400);
      if (!isValidCpf(cpf)) throw createError('CPF inválido', 400);

      const employee = await findEmployeeByCpf(cpf);
      if (!employee) throw createError('Colaborador não encontrado', 404);

      const ctx = await resolveFuelRequestContextFromEmployee(employee);
      if (!ctx.ok) {
        return res.json({
          success: true,
          data: {
            name: employee.name,
            cpf: employee.cpfMasked,
            costCenter: null,
            contractId: null,
            ok: false,
            message: ctx.message,
          },
        });
      }

      return res.json({
        success: true,
        data: {
          name: employee.name,
          cpf: employee.cpfMasked,
          costCenter: ctx.costCenterLabel,
          contractId: ctx.contractId || null,
          ok: true,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  async listDriverOptions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          role: 'EMPLOYEE',
          employee: { isNot: null },
        },
        select: {
          id: true,
          name: true,
          cpf: true,
          profilePhotoUrl: true,
          employee: {
            select: {
              id: true,
              costCenter: true,
              position: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        take: 2000,
      });

      const data = users
        .filter((u) => {
          if (!u.employee?.id) return false;
          if (u.employee.position === 'Administrador') return false;
          const name = String(u.name || '').trim();
          if (name.localeCompare('Administrador', 'pt-BR', { sensitivity: 'accent' }) === 0) {
            return false;
          }
          return true;
        })
        .map((u) => {
          const cpfDigits = (u.cpf || '').replace(/\D/g, '');
          const cpfMasked =
            cpfDigits.length === 11
              ? `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${cpfDigits.slice(9)}`
              : u.cpf || '';
          return {
            id: u.id,
            name: String(u.name || '').trim(),
            cpf: cpfMasked,
            cpfDigits,
            costCenter: u.employee?.costCenter?.trim() || null,
            profilePhotoUrl: u.profilePhotoUrl || null,
          };
        })
        .filter((row) => row.id && row.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async listMine(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const parsed = listQuerySchema.parse(req.query);
      const rows = await fuelRefuelRequestService.listForSupplies({
        search: parsed.search,
        statuses: parseStatusFilter(parsed.status),
        requesterId: user.id,
      });

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const body = createSchema.parse(req.body);
      const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(body.refuelDate.trim());
      if (!dateMatch) {
        throw createError('Data inválida. Use o formato AAAA-MM-DD.', 400);
      }
      const refuelDate = new Date(
        `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T12:00:00`,
      );
      if (Number.isNaN(refuelDate.getTime())) {
        throw createError('Data inválida', 400);
      }

      const { driverName, costCenterLabel, contractId: driverContractId } =
        await resolveDriverContext(user.id, {
          driverCpf: body.driverCpf,
          driverUserId: body.driverUserId,
        });

      if (!body.dashboardPhotoBase64.includes('base64,')) {
        throw createError('Foto do painel inválida', 400);
      }

      const upload = await photoService.uploadPhotoFromBase64(
        body.dashboardPhotoBase64,
        user.id,
        parseImageContentType(body.dashboardPhotoBase64),
      );

      const row = await fuelRefuelRequestService.create({
        requesterId: user.id,
        refuelDate,
        route: body.route,
        satelliteCityCode: body.satelliteCityCode,
        contractId: body.contractId || driverContractId || undefined,
        costCenter: costCenterLabel,
        driverName,
        vehiclePlate: body.vehiclePlate,
        vehicleDescription: body.vehicleDescription,
        vehicleType: body.vehicleType as FuelVehicleType,
        dashboardPhotoUrl: upload.url,
        dashboardPhotoKey: upload.key,
        dashboardPhotoName: 'painel.jpg',
        observations: body.observations,
      });

      const presented = await fuelRefuelRequestService.getByIdForApi(row.id);
      const waitingMsg =
        row.status === FuelRefuelRequestStatus.PENDING_MANAGER
          ? 'Solicitação registrada. Aguardando aprovação do gestor.'
          : 'Solicitação registrada. Aguardando análise do Suprimentos.';

      res.status(201).json({ success: true, data: presented, message: waitingMsg });
    } catch (error) {
      next(error);
    }
  }

  async listAdministrativeRegions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const stateCode = String(req.query.stateCode ?? '').trim().toUpperCase();
      const rows = listFuelSatelliteCities(stateCode || undefined);
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async listGasStationsByRegion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const contractId = String(req.query.contractId || '').trim();
      const costCenter = String(req.query.costCenter || '').trim();
      if (contractId || costCenter) {
        const rows = await listActiveFuelGasStationsForRequest({
          contractId: contractId || null,
          costCenter: costCenter || null,
        });
        return res.json({ success: true, data: rows });
      }

      const cityCode = String(req.query.cityCode || req.params.regionId || '').trim();
      if (!cityCode) throw createError('Informe o contrato ou a cidade', 400);

      const rows = await listActiveFuelGasStationsByCity(cityCode);
      return res.json({ success: true, data: rows });
    } catch (error) {
      return next(error);
    }
  }

  async getSuppliesSla(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const hours = await getFuelSuppliesSlaHours();
      res.json({ success: true, data: { fuelSuppliesSlaHours: hours } });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const parsed = listQuerySchema.parse(req.query);
      const rows = await fuelRefuelRequestService.listForSupplies({
        search: parsed.search,
        statuses: parseStatusFilter(parsed.status),
        queue: parsed.queue,
        requesterId: parsed.mine ? user.id : undefined,
      });

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async listManagerApprovals(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const scope = await getManagerFuelApprovalContractScope(user.id, user.isAdmin);
      if (scope === null) {
        return res.json({ success: true, data: [] });
      }

      const rawPhase = String(req.query.phase ?? 'PENDING').toUpperCase();
      type Phase = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
      const phase: Phase = (['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).includes(
        rawPhase as Phase,
      )
        ? (rawPhase as Phase)
        : 'PENDING';

      const rows = await fuelRefuelRequestService.listForManagerApprovals({
        phase,
        contractScope: mapManagerScopeToFuelWhere(scope),
      });

      return res.json({ success: true, data: rows });
    } catch (error) {
      return next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const row = await fuelRefuelRequestService.getByIdForApi(req.params.id);
      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  private async assertCanDecide(req: AuthRequest, contractId: string | null) {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    await assertManagerCanActOnFuelContract(req.user.id, req.user.isAdmin, contractId);
  }

  async approve(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const existing = await fuelRefuelRequestService.getById(req.params.id);
      await this.assertCanDecide(req, existing.contractId);

      const body = approveSchema.parse(req.body);
      const row = await fuelRefuelRequestService.managerApprove(
        req.params.id,
        userId,
        body.comment,
      );
      res.json({ success: true, data: row, message: 'Solicitação aprovada' });
    } catch (error) {
      next(error);
    }
  }

  async reject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const existing = await fuelRefuelRequestService.getById(req.params.id);
      await this.assertCanDecide(req, existing.contractId);

      const body = rejectSchema.parse(req.body);
      const reason = body.reason?.trim() || body.comment?.trim() || '';
      const row = await fuelRefuelRequestService.managerReject(req.params.id, userId, reason);
      res.json({ success: true, data: row, message: 'Solicitação rejeitada' });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const row = await fuelRefuelRequestService.cancel(req.params.id, userId);
      res.json({ success: true, data: row, message: 'Solicitação cancelada' });
    } catch (error) {
      next(error);
    }
  }

  async submitReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const body = reportSchema.parse(req.body);
      if (!body.receiptPhotoBase64.includes('base64,')) {
        throw createError('Foto do cupom fiscal inválida', 400);
      }

      const upload = await photoService.uploadPhotoFromBase64(
        body.receiptPhotoBase64,
        user.id,
        parseImageContentType(body.receiptPhotoBase64),
      );

      const row = await fuelRefuelRequestService.submitRefuelReport({
        requesterId: user.id,
        requestId: req.params.id,
        odometerKm: body.odometerKm,
        tankLevelAfter: body.tankLevelAfter as FuelTankLevelAfter,
        litersRefueled: body.litersRefueled,
        pricePerLiter: body.pricePerLiter,
        receiptPhotoUrl: upload.url,
        receiptPhotoKey: upload.key,
        receiptPhotoName: 'cupom-fiscal.jpg',
        observations: body.observations,
      });

      const presented = await fuelRefuelRequestService.getByIdForApi(row.id);
      res.json({
        success: true,
        data: presented,
        message: 'Abastecimento informado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async suppliesApprove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const body = suppliesApproveSchema.parse(req.body);
      const row = await fuelRefuelRequestService.suppliesApprove(req.params.id, user.id, {
        gasStationId: body.gasStationId,
        refuelDeadlineAmount: body.refuelDeadlineAmount,
        refuelDeadlineUnit: body.refuelDeadlineUnit,
        comment: body.comment,
      });
      res.json({ success: true, data: row, message: 'Solicitação atendida — colaborador liberado para abastecer' });
    } catch (error) {
      next(error);
    }
  }

  async suppliesReject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const body = rejectSchema.parse(req.body);
      const reason = body.reason?.trim() || body.comment?.trim() || '';
      const row = await fuelRefuelRequestService.suppliesReject(req.params.id, user.id, reason);
      res.json({ success: true, data: row, message: 'Solicitação rejeitada' });
    } catch (error) {
      next(error);
    }
  }

  async adminUpdate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      if (!user.isAdmin) {
        throw createError('Apenas administradores podem editar a solicitação', 403);
      }
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const body = adminUpdateSchema.parse(req.body);
      const row = await fuelRefuelRequestService.adminUpdateContract(
        req.params.id,
        body.contractId,
      );
      res.json({ success: true, data: row, message: 'Solicitação atualizada' });
    } catch (error) {
      next(error);
    }
  }

  async pendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const scope = await getManagerFuelApprovalContractScope(user.id, user.isAdmin);
      if (scope === null) {
        return res.json({ success: true, data: { count: 0 } });
      }

      const count = await fuelRefuelRequestService.countPendingManager(
        mapManagerScopeToFuelWhere(scope),
      );
      return res.json({ success: true, data: { count } });
    } catch (error) {
      return next(error);
    }
  }

  async suppliesPendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const count = await fuelRefuelRequestService.countPendingSupplies();
      return res.json({ success: true, data: { count } });
    } catch (error) {
      return next(error);
    }
  }
}

export const fuelRefuelRequestController = new FuelRefuelRequestController();
