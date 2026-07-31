import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { assertUserHasFuelSuppliesAccess } from '../lib/fuelSuppliesAccess';
import {
  FUEL_ABASTECIMENTO_STATE_CODES,
  assertValidSatelliteCityCode,
  listFuelSatelliteCities,
  reserveFuelGasStationDisplayNumbers,
} from '../lib/fuelAdministrativeRegions';
import { getFuelSatelliteCityByCode } from '../constants/fuelSatelliteCities';

const stationBodySchema = z.object({
  cityCode: z.string().min(1),
  name: z.string().min(1).max(160),
  address: z.string().max(240).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

const stationUpdateSchema = stationBodySchema.partial().omit({ cityCode: true });

export class FuelGasStationController {
  private async assertAccess(req: AuthRequest) {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    await assertUserHasFuelSuppliesAccess(req.user.id, req.user.isAdmin);
  }

  async listSatelliteCities(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const stateCode = String(req.query.stateCode ?? '').trim().toUpperCase();
      const cities = listFuelSatelliteCities(
        stateCode && FUEL_ABASTECIMENTO_STATE_CODES.includes(stateCode as 'DF' | 'GO')
          ? stateCode
          : undefined,
      );
      res.json({ success: true, data: cities });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const stateCode = String(req.query.stateCode ?? '').trim().toUpperCase();
      const cityCode = String(req.query.cityCode ?? '').trim().toUpperCase();
      const includeInactive = req.query.includeInactive === 'true';

      const cityCodes = cityCode
        ? [cityCode]
        : listFuelSatelliteCities(
            stateCode && FUEL_ABASTECIMENTO_STATE_CODES.includes(stateCode as 'DF' | 'GO')
              ? stateCode
              : undefined,
          ).map((city) => city.code);

      const rows = await prisma.fuelGasStation.findMany({
        where: {
          cityCode: { in: cityCodes },
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ displayNumber: 'asc' }],
        include: { _count: { select: { requests: true } } },
      });

      const data = rows.map((row) => ({
        ...row,
        city: getFuelSatelliteCityByCode(row.cityCode) ?? null,
      }));

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const body = stationBodySchema.parse(req.body);
      assertValidSatelliteCityCode(body.cityCode);

      const [displayNumber] = await reserveFuelGasStationDisplayNumbers(1);
      if (!displayNumber) throw createError('Não foi possível gerar o código do posto', 500);

      const row = await prisma.fuelGasStation.create({
        data: {
          displayNumber,
          cityCode: body.cityCode.trim().toUpperCase(),
          name: body.name.trim(),
          address: body.address?.trim() || null,
          sortOrder: body.sortOrder ?? 0,
          isActive: body.isActive ?? true,
        },
      });

      res.status(201).json({
        success: true,
        data: { ...row, city: getFuelSatelliteCityByCode(row.cityCode) ?? null },
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'Cidade satélite inválida') {
        return next(createError(error.message, 400));
      }
      next(error);
    }
  }

  async importStations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const { stations } = req.body;

      if (!Array.isArray(stations) || stations.length === 0) {
        throw createError('Envie um array "stations" com ao menos um item', 400);
      }

      let created = 0;
      const errors: { index: number; message: string }[] = [];
      const displayNumbers = await reserveFuelGasStationDisplayNumbers(stations.length);

      for (let i = 0; i < stations.length; i++) {
        const row = stations[i] as Record<string, unknown>;
        try {
          const body = stationBodySchema.parse(row);
          assertValidSatelliteCityCode(body.cityCode);

          const displayNumber = displayNumbers[i];
          if (!displayNumber) {
            errors.push({ index: i, message: 'Não foi possível gerar o código do posto' });
            continue;
          }

          await prisma.fuelGasStation.create({
            data: {
              displayNumber,
              cityCode: body.cityCode.trim().toUpperCase(),
              name: body.name.trim(),
              address: body.address?.trim() || null,
              sortOrder: body.sortOrder ?? 0,
              isActive: body.isActive ?? true,
            },
          });

          created += 1;
        } catch (err: unknown) {
          if (err instanceof z.ZodError) {
            const first = err.issues[0];
            errors.push({
              index: i,
              message: first?.message || 'Dados inválidos',
            });
            continue;
          }
          const message =
            err instanceof Error
              ? err.message === 'Cidade satélite inválida'
                ? err.message
                : err.message
              : 'Erro ao importar linha';
          errors.push({ index: i, message });
        }
      }

      res.json({
        success: true,
        data: {
          created,
          failed: errors.length,
          errors,
        },
        message: `Importação concluída: ${created} criado(s), ${errors.length} erro(s)`,
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const body = stationUpdateSchema.parse(req.body);
      const existing = await prisma.fuelGasStation.findUnique({ where: { id: req.params.id } });
      if (!existing) throw createError('Posto não encontrado', 404);

      const row = await prisma.fuelGasStation.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined && { name: body.name.trim() }),
          ...(body.address !== undefined && { address: body.address?.trim() || null }),
          ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder }),
          ...(body.isActive !== undefined && { isActive: body.isActive }),
        },
      });

      res.json({
        success: true,
        data: { ...row, city: getFuelSatelliteCityByCode(row.cityCode) ?? null },
      });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await this.assertAccess(req);
      const existing = await prisma.fuelGasStation.findUnique({
        where: { id: req.params.id },
        include: { _count: { select: { requests: true } } },
      });
      if (!existing) throw createError('Posto não encontrado', 404);
      if (existing._count.requests > 0) {
        throw createError(
          'Não é possível excluir: existem solicitações vinculadas. Desative o posto.',
          400,
        );
      }

      await prisma.fuelGasStation.delete({ where: { id: existing.id } });
      res.json({ success: true, message: 'Posto excluído' });
    } catch (error) {
      next(error);
    }
  }
}

export const fuelGasStationController = new FuelGasStationController();
