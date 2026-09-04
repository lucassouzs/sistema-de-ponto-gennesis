import { Response, NextFunction } from 'express';
import type { VehicleUsageType } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { listFipeBrands, listFipeFleetBrands, listFipeModels } from '../services/FipeService';
import {
  isValidBrazilianPlate,
  normalizePlacaForStorage,
  placaVariants,
  repairBrazilianPlate
} from '../lib/brazilianVehiclePlate';
import {
  createVehicleImportNormalizeContext,
  normalizeVehicleImportFields,
  repairExistingVehicleModelsFromFipe
} from '../lib/vehicleImportNormalize';
import { findIdsByUnaccentSearch } from '../lib/normalizeSearchText';

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function normalizePlaca(value: unknown): string {
  return normalizePlacaForStorage(value);
}

async function findDuplicatePlaca(placa: string, excludeId?: string) {
  const variants = placaVariants(placa);
  return prisma.vehicle.findFirst({
    where: {
      ...(excludeId ? { NOT: { id: excludeId } } : {}),
      placaVeic: { in: variants }
    }
  });
}

function parseFrotaPartic(value: unknown): VehicleUsageType | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const normalized = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['frota', 'f', 'fleet'].includes(normalized)) return 'FROTA';
  if (['particular', 'partic', 'p', 'private'].includes(normalized)) return 'PARTICULAR';
  if (normalized === 'frota_partic') return null;

  const upper = String(value).trim().toUpperCase();
  if (upper === 'FROTA') return 'FROTA';
  if (upper === 'PARTICULAR') return 'PARTICULAR';

  throw createError('Frota/Particular inválido. Use Frota ou Particular.', 400);
}

function buildVehicleData(body: Record<string, unknown>) {
  const contratoRaw =
    normalizeOptionalString(body.contrato) ?? normalizeOptionalString(body.projeto);
  const contrato = contratoRaw
    ? contratoRaw.replace(/^\d{1,2}(?:\.\d{1,2})+\s*[-–—]\s*/, '').trim() || contratoRaw
    : null;

  return {
    marcaVeic: normalizeOptionalString(body.marcaVeic),
    modeloVeic: normalizeOptionalString(body.modeloVeic) || '',
    placaVeic: normalizePlaca(body.placaVeic),
    polo: normalizeOptionalString(body.polo),
    contrato,
    responsavel: normalizeOptionalString(body.responsavel),
    frotaPartic: parseFrotaPartic(body.frota_partic ?? body.frotaPartic),
    isActive:
      body.isActive === undefined
        ? true
        : typeof body.isActive === 'boolean'
          ? body.isActive
          : ['true', '1', 'sim', 's', 'ativo'].includes(String(body.isActive).trim().toLowerCase())
  };
}

async function reserveVehicleCodes(count: number): Promise<string[]> {
  if (count <= 0) return [];

  const result = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(
      CASE WHEN code ~ '^[0-9]+$' THEN CAST(code AS INTEGER) END
    ) AS max
    FROM vehicles
  `;

  let start = Number(result[0]?.max ?? 0);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    start += 1;
    codes.push(String(start));
  }
  return codes;
}

async function generateVehicleCode(): Promise<string> {
  const [code] = await reserveVehicleCodes(1);
  if (!code) throw createError('Não foi possível gerar o código do veículo', 500);
  return code;
}

export class VehicleController {
  async getFipeBrands(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const type = String(req.query.type ?? 'cars').trim().toLowerCase();
      const brands =
        type === 'fleet' || type === 'all' || type === 'cars+motos'
          ? await listFipeFleetBrands()
          : await listFipeBrands(req.query.type);
      res.json({ success: true, data: brands });
    } catch (error) {
      next(error);
    }
  }

  async getFipeModels(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { brandId } = req.params;
      const models = await listFipeModels(req.query.type, brandId);
      res.json({ success: true, data: models });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      try {
        await repairExistingVehicleModelsFromFipe();
      } catch (err) {
        console.error('[Vehicle] repairExistingVehicleModelsFromFipe', err);
      }

      const { search, isActive, page = 1, limit = 20 } = req.query;
      const where: Record<string, unknown> = {};

      if (search) {
        const ids = await findIdsByUnaccentSearch({
          from: Prisma.sql`vehicles`,
          columns: [
            'code',
            '"marcaVeic"',
            '"modeloVeic"',
            '"placaVeic"',
            'polo',
            'contrato',
            'responsavel',
          ],
          search: String(search),
        });
        where.id = { in: ids && ids.length > 0 ? ids : ['__none__'] };
      }

      if (isActive !== undefined) where.isActive = isActive === 'true';

      const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 500);
      const pageNum = Math.max(1, Number(page) || 1);
      const skip = (pageNum - 1) * limitNum;

      const [vehicles, total] = await Promise.all([
        prisma.vehicle.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: [{ createdAt: 'asc' }]
        }),
        prisma.vehicle.count({ where })
      ]);

      const vehicleIds = vehicles.map((v) => v.id);
      const activeReservations =
        vehicleIds.length === 0
          ? []
          : await prisma.vehicleReservation.findMany({
              where: {
                vehicleId: { in: vehicleIds },
                status: 'APPROVED'
              },
              select: {
                id: true,
                code: true,
                vehicleId: true,
                solicitante: true,
                motorista: true,
                dataUsoInicio: true,
                dataUsoFim: true
              }
            });

      const activeByVehicleId = new Map(
        activeReservations
          .filter((r) => r.vehicleId)
          .map((r) => [r.vehicleId as string, r])
      );

      const data = vehicles.map((vehicle) => {
        const activeReservation = activeByVehicleId.get(vehicle.id) ?? null;
        return {
          ...vehicle,
          inUse: Boolean(activeReservation),
          activeReservation
        };
      });

      res.json({
        success: true,
        data,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const vehicle = await prisma.vehicle.findUnique({ where: { id } });
      if (!vehicle) throw createError('Veículo não encontrado', 404);

      const activeReservation = await prisma.vehicleReservation.findFirst({
        where: {
          vehicleId: id,
          status: 'APPROVED'
        },
        select: {
          id: true,
          code: true,
          vehicleId: true,
          solicitante: true,
          motorista: true,
          dataUsoInicio: true,
          dataUsoFim: true
        }
      });

      res.json({
        success: true,
        data: {
          ...vehicle,
          inUse: Boolean(activeReservation),
          activeReservation
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = buildVehicleData(req.body);
      if (!parsed.modeloVeic) throw createError('Modelo do veículo é obrigatório', 400);
      if (!parsed.placaVeic) throw createError('Placa é obrigatória', 400);
      if (!isValidBrazilianPlate(parsed.placaVeic)) {
        throw createError('Placa inválida. Use ABC-1234 (antiga) ou ABC1D23 (Mercosul).', 400);
      }

      const existingPlaca = await findDuplicatePlaca(parsed.placaVeic);
      if (existingPlaca) throw createError('Já existe um veículo com esta placa', 400);

      const finalCode = await generateVehicleCode();
      const vehicle = await prisma.vehicle.create({
        data: {
          ...parsed,
          code: finalCode
        }
      });

      res.status(201).json({ success: true, data: vehicle });
    } catch (error) {
      next(error);
    }
  }

  async importVehicles(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { vehicles } = req.body;

      if (!Array.isArray(vehicles) || vehicles.length === 0) {
        throw createError('Envie um array "vehicles" com ao menos um item', 400);
      }

      let created = 0;
      const errors: { index: number; message: string }[] = [];
      const reservedCodes = await reserveVehicleCodes(vehicles.length);
      const seenPlacas = new Set<string>();
      const normalizeCtx = await createVehicleImportNormalizeContext();

      for (let i = 0; i < vehicles.length; i++) {
        const row = vehicles[i] as Record<string, unknown>;
        try {
          const normalized = await normalizeVehicleImportFields(
            {
              marcaVeic: normalizeOptionalString(row.marcaVeic),
              modeloVeic:
                normalizeOptionalString(row.modeloVeic) ||
                normalizeOptionalString(row.veiculo) ||
                normalizeOptionalString(row.descricao),
              contrato:
                normalizeOptionalString(row.contrato) || normalizeOptionalString(row.projeto),
              polo: normalizeOptionalString(row.polo)
            },
            normalizeCtx
          );

          const repairedPlaca = repairBrazilianPlate(row.placaVeic ?? row.placa);
          const parsed = buildVehicleData({
            ...row,
            marcaVeic: normalized.marcaVeic,
            modeloVeic: normalized.modeloVeic,
            contrato: normalized.contrato,
            polo: normalized.polo,
            placaVeic: repairedPlaca || row.placaVeic || row.placa
          });

          if (!parsed.modeloVeic) {
            errors.push({ index: i, message: 'Modelo do veículo é obrigatório' });
            continue;
          }
          if (!parsed.placaVeic) {
            errors.push({ index: i, message: 'Placa é obrigatória' });
            continue;
          }
          if (!repairedPlaca || !isValidBrazilianPlate(parsed.placaVeic)) {
            errors.push({
              index: i,
              message: `Não foi possível corrigir a placa "${String(row.placaVeic ?? row.placa ?? '').trim()}". Use ABC-1234 ou ABC1D23.`
            });
            continue;
          }

          const placaKey = parsed.placaVeic.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
          if (seenPlacas.has(placaKey)) {
            errors.push({ index: i, message: `Placa duplicada na planilha: ${parsed.placaVeic}` });
            continue;
          }

          const existingPlaca = await findDuplicatePlaca(parsed.placaVeic);
          if (existingPlaca) {
            errors.push({ index: i, message: `Já existe um veículo com a placa ${parsed.placaVeic}` });
            continue;
          }

          await prisma.vehicle.create({
            data: {
              ...parsed,
              code: reservedCodes[i]
            }
          });

          seenPlacas.add(placaKey);
          created += 1;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Erro ao importar linha';
          errors.push({ index: i, message });
        }
      }

      res.json({
        success: true,
        data: {
          created,
          failed: errors.length,
          errors
        },
        message: `Importação concluída: ${created} criado(s), ${errors.length} erro(s)`
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.vehicle.findUnique({ where: { id } });
      if (!existing) throw createError('Veículo não encontrado', 404);

      const parsed = buildVehicleData({ ...existing, ...req.body });
      if (!parsed.modeloVeic) throw createError('Modelo do veículo é obrigatório', 400);
      if (!parsed.placaVeic) throw createError('Placa é obrigatória', 400);
      if (!isValidBrazilianPlate(parsed.placaVeic)) {
        throw createError('Placa inválida. Use ABC-1234 (antiga) ou ABC1D23 (Mercosul).', 400);
      }

      const duplicatePlaca = await findDuplicatePlaca(parsed.placaVeic, id);
      if (duplicatePlaca) throw createError('Já existe um veículo com esta placa', 400);

      const vehicle = await prisma.vehicle.update({
        where: { id },
        data: parsed
      });

      res.json({ success: true, data: vehicle });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.vehicle.findUnique({ where: { id } });
      if (!existing) throw createError('Veículo não encontrado', 404);

      await prisma.$transaction(async (tx) => {
        await tx.vehicleReservation.updateMany({
          where: { vehicleId: id },
          data: { vehicleId: null },
        });
        await tx.vehicle.delete({ where: { id } });
      });

      res.json({ success: true, message: 'Veículo excluído com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async deleteMany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? (req.body.ids as unknown[])
            .map((id) => String(id || '').trim())
            .filter(Boolean)
        : [];

      if (ids.length === 0) {
        throw createError('Envie um array "ids" com ao menos um veículo', 400);
      }

      const uniqueIds = Array.from(new Set(ids));

      const result = await prisma.$transaction(async (tx) => {
        await tx.vehicleReservation.updateMany({
          where: { vehicleId: { in: uniqueIds } },
          data: { vehicleId: null },
        });
        return tx.vehicle.deleteMany({
          where: { id: { in: uniqueIds } },
        });
      });

      res.json({
        success: true,
        data: { deleted: result.count },
        message: `${result.count} veículo(s) excluído(s)`,
      });
    } catch (error) {
      next(error);
    }
  }
}
