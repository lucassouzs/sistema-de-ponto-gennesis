import { Response, NextFunction } from 'express';
import { VehicleReservationStatus } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { assertUserHasVehicleReservationSuppliesAccess, userHasVehicleReservationSuppliesAccess } from '../lib/vehicleReservationSuppliesAccess';
import { PhotoService } from '../services/PhotoService';

const PERIODO_USO_VALUES = new Set(['INTEGRAL', 'MATUTINO', 'VESPERTINO', 'NOTURNO']);
const photoService = new PhotoService();

const reservationInclude = {
  vehicle: {
    select: {
      id: true,
      code: true,
      marcaVeic: true,
      modeloVeic: true,
      placaVeic: true
    }
  },
  createdBy: { select: { id: true, name: true } },
  suppliesApprovedBy: { select: { id: true, name: true } },
  baixaReportedBy: { select: { id: true, name: true } },
  vistoriaReportedBy: { select: { id: true, name: true } }
} as const;

function normalizeOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function parsePeriodoUso(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items = value
    .map((item) => String(item).trim().toUpperCase())
    .filter((item) => PERIODO_USO_VALUES.has(item));
  return Array.from(new Set(items));
}

function parseDateOnly(value: unknown, fieldLabel: string): Date {
  const raw = String(value ?? '').trim();
  if (!raw) throw createError(`${fieldLabel} é obrigatória`, 400);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw createError(`${fieldLabel} inválida`, 400);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw createError(`${fieldLabel} inválida`, 400);
  }
  return date;
}

function parseDateTime(value: unknown, fieldLabel: string): Date {
  const raw = String(value ?? '').trim();
  if (!raw) throw createError(`${fieldLabel} é obrigatória`, 400);

  // datetime-local: yyyy-MM-ddTHH:mm (hora local do solicitante, sem timezone)
  const localMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const year = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const day = Number(localMatch[3]);
    const hour = Number(localMatch[4]);
    const minute = Number(localMatch[5]);
    const second = Number(localMatch[6] || 0);
    const date = new Date(year, month - 1, day, hour, minute, second, 0);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day ||
      date.getHours() !== hour ||
      date.getMinutes() !== minute
    ) {
      throw createError(`${fieldLabel} inválida`, 400);
    }
    return date;
  }

  // Compat: apenas data (legado)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return parseDateOnly(raw, fieldLabel);
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw createError(`${fieldLabel} inválida`, 400);
  return date;
}

function parseStatusFilter(value: unknown): VehicleReservationStatus[] | undefined {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw || raw === 'ALL') return undefined;

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const statuses: VehicleReservationStatus[] = [];

  for (const part of parts) {
    if (Object.values(VehicleReservationStatus).includes(part as VehicleReservationStatus)) {
      statuses.push(part as VehicleReservationStatus);
    } else {
      throw createError('Status de filtro inválido', 400);
    }
  }

  return statuses.length ? statuses : undefined;
}

function parseImageContentType(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/[a-z+]+);base64,/i);
  return match?.[1] || 'image/jpeg';
}

function parseDocumentContentType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/i);
  return match?.[1] || 'application/pdf';
}

function userOwnsReservation(
  reservation: { createdById: string | null; solicitante: string },
  user: { id: string; name?: string }
): boolean {
  if (reservation.createdById && reservation.createdById === user.id) return true;
  if (reservation.createdById) return false;
  const userName = String(user.name ?? '').trim().toLowerCase();
  const solicitante = reservation.solicitante.trim().toLowerCase();
  return userName.length > 0 && userName === solicitante;
}

function userCanSubmitReturn(
  reservation: { createdById: string | null; solicitante: string },
  user: { id: string; name?: string; isAdmin?: boolean }
): boolean {
  if (user.isAdmin) return true;
  return userOwnsReservation(reservation, user);
}

function buildListWhere(
  query: AuthRequest['query'],
  ownership?: { userId: string; userName?: string | null }
): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  const { search, status } = query;

  const statusFilter = parseStatusFilter(status);
  if (statusFilter?.length === 1) {
    where.status = statusFilter[0];
  } else if (statusFilter && statusFilter.length > 1) {
    where.status = { in: statusFilter };
  }

  if (search) {
    const term = search as string;
    where.OR = [
      { code: { contains: term, mode: 'insensitive' } },
      { solicitante: { contains: term, mode: 'insensitive' } },
      { motorista: { contains: term, mode: 'insensitive' } },
      { atividade: { contains: term, mode: 'insensitive' } },
      { localDestino: { contains: term, mode: 'insensitive' } },
      { contrato: { contains: term, mode: 'insensitive' } },
      { observacaoCapacidadeVeiculo: { contains: term, mode: 'insensitive' } },
      { vehicle: { placaVeic: { contains: term, mode: 'insensitive' } } },
      { vehicle: { modeloVeic: { contains: term, mode: 'insensitive' } } },
    ];
  }

  if (ownership) {
    const userName = String(ownership.userName ?? '').trim();
    where.AND = [
      {
        OR: [
          { createdById: ownership.userId },
          ...(userName
            ? [
                {
                  createdById: null,
                  solicitante: { equals: userName, mode: 'insensitive' as const },
                },
              ]
            : []),
        ],
      },
    ];
  }

  return where;
}

function buildReservationData(body: Record<string, unknown>) {
  const dataUsoInicio = parseDateTime(body.dataUsoInicio, 'Data de uso (início)');
  const dataUsoFim = parseDateTime(body.dataUsoFim, 'Data de uso (fim)');
  if (dataUsoFim < dataUsoInicio) {
    throw createError('Data final não pode ser anterior à data inicial', 400);
  }

  const assinatura = normalizeOptionalString(body.assinatura) || '';

  const motorista = normalizeOptionalString(body.motorista);
  const atividade = normalizeOptionalString(body.atividade);
  const localDestino = normalizeOptionalString(body.localDestino);
  const solicitante = normalizeOptionalString(body.solicitante);

  if (!solicitante) throw createError('Solicitante é obrigatório', 400);
  if (!motorista) throw createError('Motorista é obrigatório', 400);
  if (!atividade) throw createError('Atividade é obrigatória', 400);
  if (!localDestino) throw createError('Local de destino é obrigatório', 400);

  const periodoUso = parsePeriodoUso(body.periodoUso);

  return {
    solicitante,
    motorista,
    atividade,
    localDestino,
    dataUsoInicio,
    dataUsoFim,
    periodoUso,
    polo: normalizeOptionalString(body.polo),
    contrato: normalizeOptionalString(body.contrato),
    observacaoCapacidadeVeiculo: normalizeOptionalString(body.observacaoCapacidadeVeiculo),
    assinatura
  };
}

async function reserveReservationCodes(count: number): Promise<string[]> {
  if (count <= 0) return [];

  const result = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(
      CASE WHEN code ~ '^[0-9]+$' THEN CAST(code AS INTEGER) END
    ) AS max
    FROM vehicle_reservations
  `;

  let start = Number(result[0]?.max ?? 0);
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    start += 1;
    codes.push(String(start));
  }
  return codes;
}

export class VehicleReservationController {
  private async listReservations(
    req: AuthRequest,
    ownership?: { userId: string; userName?: string | null }
  ) {
    const { page = 1, limit = 20 } = req.query;
    const where = buildListWhere(req.query, ownership);

    const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 500);
    const pageNum = Math.max(1, Number(page) || 1);
    const skip = (pageNum - 1) * limitNum;

    const [reservations, total] = await Promise.all([
      prisma.vehicleReservation.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: [{ createdAt: 'desc' }],
        include: reservationInclude,
      }),
      prisma.vehicleReservation.count({ where }),
    ]);

    return {
      success: true as const,
      data: reservations,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
    };
  }

  async getMine(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const profile = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { name: true },
      });
      const payload = await this.listReservations(req, {
        userId: req.user.id,
        userName: profile?.name,
      });
      res.json(payload);
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasVehicleReservationSuppliesAccess(req.user.id, req.user.isAdmin);
      const payload = await this.listReservations(req);
      res.json(payload);
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const reservation = await prisma.vehicleReservation.findUnique({
        where: { id },
        include: reservationInclude
      });
      if (!reservation) throw createError('Reserva não encontrada', 404);
      res.json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const parsed = buildReservationData(req.body);

      const [code] = await reserveReservationCodes(1);
      if (!code) throw createError('Não foi possível gerar o código da reserva', 500);

      const reservation = await prisma.vehicleReservation.create({
        data: {
          ...parsed,
          code,
          status: VehicleReservationStatus.PENDING_SUPPLIES,
          createdById: req.user?.id ?? null
        },
        include: reservationInclude
      });

      res.status(201).json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const { id } = req.params;
      const existing = await prisma.vehicleReservation.findUnique({ where: { id } });
      if (!existing) throw createError('Reserva não encontrada', 404);
      if (existing.status !== VehicleReservationStatus.PENDING_SUPPLIES) {
        throw createError('Somente reservas pendentes podem ser excluídas', 400);
      }
      const canManageAll = await userHasVehicleReservationSuppliesAccess(
        req.user.id,
        req.user.isAdmin
      );
      if (!canManageAll && !userOwnsReservation(existing, req.user)) {
        throw createError('Você só pode excluir suas próprias reservas', 403);
      }

      await prisma.vehicleReservation.delete({ where: { id } });
      res.json({ success: true, message: 'Reserva excluída com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async suppliesPendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const count = await prisma.vehicleReservation.count({
        where: {
          status: {
            in: [VehicleReservationStatus.PENDING_SUPPLIES, VehicleReservationStatus.COMPLETED]
          }
        }
      });
      res.json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  }

  async suppliesApprove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasVehicleReservationSuppliesAccess(req.user.id, req.user.isAdmin);

      const { id } = req.params;
      const comment = normalizeOptionalString(req.body?.comment);
      const vehicleId = normalizeOptionalString(req.body?.vehicleId);
      if (!vehicleId) throw createError('Selecione o veículo disponibilizado', 400);

      const vehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, isActive: true }
      });
      if (!vehicle) throw createError('Veículo não encontrado ou inativo', 400);

      const existing = await prisma.vehicleReservation.findUnique({ where: { id } });
      if (!existing) throw createError('Reserva não encontrada', 404);
      if (existing.status !== VehicleReservationStatus.PENDING_SUPPLIES) {
        throw createError('Esta reserva não está aguardando aprovação do Suprimentos', 400);
      }

      const vehicleInUse = await prisma.vehicleReservation.findFirst({
        where: {
          vehicleId,
          status: VehicleReservationStatus.APPROVED,
          NOT: { id }
        },
        select: {
          id: true,
          code: true,
          solicitante: true,
          motorista: true
        }
      });
      if (vehicleInUse) {
        const who =
          vehicleInUse.motorista || vehicleInUse.solicitante || 'outro colaborador';
        const codeLabel = vehicleInUse.code ? ` #${vehicleInUse.code}` : '';
        throw createError(
          `Este veículo já está em uso (reserva${codeLabel} — ${who}). Aguarde a devolução ou escolha outro.`,
          400
        );
      }

      const reservation = await prisma.vehicleReservation.update({
        where: { id },
        data: {
          status: VehicleReservationStatus.APPROVED,
          vehicleId,
          suppliesApprovedById: req.user.id,
          suppliesApprovedAt: new Date(),
          suppliesApprovalComment: comment,
          suppliesRejectionReason: null
        },
        include: reservationInclude
      });

      res.json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }

  async suppliesReject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasVehicleReservationSuppliesAccess(req.user.id, req.user.isAdmin);

      const { id } = req.params;
      const reason = normalizeOptionalString(req.body?.reason);
      if (!reason) throw createError('Informe o motivo da rejeição', 400);

      const existing = await prisma.vehicleReservation.findUnique({ where: { id } });
      if (!existing) throw createError('Reserva não encontrada', 404);
      if (existing.status !== VehicleReservationStatus.PENDING_SUPPLIES) {
        throw createError('Esta reserva não está aguardando aprovação do Suprimentos', 400);
      }

      const reservation = await prisma.vehicleReservation.update({
        where: { id },
        data: {
          status: VehicleReservationStatus.REJECTED,
          suppliesApprovedById: req.user.id,
          suppliesApprovedAt: new Date(),
          suppliesRejectionReason: reason,
          suppliesApprovalComment: null
        },
        include: reservationInclude
      });

      res.json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }

  async submitReturn(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const { id } = req.params;
      const devolucaoAt = parseDateTime(req.body?.devolucaoAt, 'Data e hora da devolução');
      const baixaObservacao = normalizeOptionalString(req.body?.baixaObservacao);
      const baixaFoto = normalizeOptionalString(req.body?.baixaFoto);
      const baixaAssinatura = normalizeOptionalString(req.body?.baixaAssinatura);

      if (!baixaFoto || !baixaFoto.startsWith('data:image/')) {
        throw createError('Foto do veículo é obrigatória', 400);
      }
      if (!baixaAssinatura || !baixaAssinatura.startsWith('data:image/')) {
        throw createError('Assinatura da devolução é obrigatória', 400);
      }

      const existing = await prisma.vehicleReservation.findUnique({ where: { id } });
      if (!existing) throw createError('Reserva não encontrada', 404);
      if (existing.status !== VehicleReservationStatus.APPROVED) {
        throw createError('Somente reservas aprovadas podem receber baixa', 400);
      }
      if (
        !userCanSubmitReturn(existing, {
          id: req.user.id,
          name: (
            await prisma.user.findUnique({
              where: { id: req.user.id },
              select: { name: true }
            })
          )?.name,
          isAdmin: req.user.isAdmin
        })
      ) {
        throw createError('Você não tem permissão para dar baixa nesta reserva', 403);
      }

      const upload = await photoService.uploadPhotoFromBase64(
        baixaFoto,
        req.user.id,
        parseImageContentType(baixaFoto)
      );

      const reservation = await prisma.vehicleReservation.update({
        where: { id },
        data: {
          status: VehicleReservationStatus.COMPLETED,
          devolucaoAt,
          baixaObservacao,
          baixaFotoUrl: upload.url,
          baixaFotoKey: upload.key,
          baixaAssinatura,
          baixaReportedAt: new Date(),
          baixaReportedById: req.user.id
        },
        include: reservationInclude
      });

      res.json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }

  async submitInspection(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      await assertUserHasVehicleReservationSuppliesAccess(req.user.id, req.user.isAdmin);

      const { id } = req.params;
      const vistoriaAt = parseDateTime(req.body?.vistoriaAt, 'Data e hora da vistoria');
      const laudoBase64 = normalizeOptionalString(req.body?.vistoriaLaudo);
      const laudoFileName = normalizeOptionalString(req.body?.vistoriaLaudoFileName) || 'laudo-vistoria.pdf';

      if (!laudoBase64 || !laudoBase64.startsWith('data:')) {
        throw createError('Laudo de vistoria é obrigatório', 400);
      }

      const existing = await prisma.vehicleReservation.findUnique({ where: { id } });
      if (!existing) throw createError('Reserva não encontrada', 404);
      if (existing.status !== VehicleReservationStatus.COMPLETED) {
        throw createError('Somente reservas devolvidas podem receber vistoria', 400);
      }

      const contentType = parseDocumentContentType(laudoBase64);
      const upload = await photoService.uploadReservationLaudoFromBase64(
        laudoBase64,
        req.user.id,
        contentType,
        laudoFileName
      );

      const reservation = await prisma.vehicleReservation.update({
        where: { id },
        data: {
          status: VehicleReservationStatus.INSPECTED,
          vistoriaAt,
          vistoriaLaudoUrl: upload.url,
          vistoriaLaudoKey: upload.key,
          vistoriaLaudoFileName: laudoFileName,
          vistoriaReportedAt: new Date(),
          vistoriaReportedById: req.user.id
        },
        include: reservationInclude
      });

      res.json({ success: true, data: reservation });
    } catch (error) {
      next(error);
    }
  }
}
