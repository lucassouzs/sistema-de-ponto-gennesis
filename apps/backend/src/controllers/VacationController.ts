import { Request, Response, NextFunction } from 'express';
import { PrismaClient, VacationType, VacationStatus } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { VacationService } from '../services/VacationService';

const prisma = new PrismaClient();
const vacationService = new VacationService();

export class VacationController {
  async requestVacation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { startDate, endDate, type, reason } = req.body;

      // Validar datas
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (start >= end) {
        throw createError('Data de início deve ser anterior à data de fim', 400);
      }

      if (start <= new Date()) {
        throw createError('Data de início deve ser futura', 400);
      }

      // Verificar se já existe solicitação para o mesmo período
      const existingVacation = await prisma.vacation.findFirst({
        where: {
          userId,
          status: { in: [VacationStatus.PENDING, VacationStatus.APPROVED] },
          OR: [
            {
              startDate: { lte: end },
              endDate: { gte: start }
            }
          ]
        }
      });

      if (existingVacation) {
        throw createError('Já existe uma solicitação de férias para este período', 400);
      }

      // Calcular dias de férias
      const days = vacationService.calculateVacationDays(start, end);

      // Verificar saldo de férias
      const balance = await vacationService.getVacationBalance(userId);
      if (balance.availableDays < days) {
        throw createError(`Saldo insuficiente. Disponível: ${balance.availableDays} dias, solicitado: ${days} dias`, 400);
      }

      // Buscar dados do funcionário
      const employee = await prisma.employee.findUnique({
        where: { userId }
      });

      if (!employee) {
        throw createError('Dados de funcionário não encontrados', 404);
      }

      // Criar solicitação de férias
      const vacation = await prisma.vacation.create({
        data: {
          userId,
          employeeId: employee.id,
          startDate: start,
          endDate: end,
          days,
          type: type || VacationType.ANNUAL,
          reason: reason || null,
          status: VacationStatus.PENDING
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true, position: true }
          }
        }
      });

      res.status(201).json({
        success: true,
        data: vacation,
        message: 'Solicitação de férias criada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyVacations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { page = 1, limit = 10, status, year } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { userId };

      if (status) {
        where.status = status;
      }

      if (year) {
        const startYear = new Date(Number(year), 0, 1);
        const endYear = new Date(Number(year), 11, 31);
        where.startDate = {
          gte: startYear,
          lte: endYear
        };
      }

      const [vacations, total] = await Promise.all([
        prisma.vacation.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { startDate: 'desc' },
          include: {
            employee: {
              select: { employeeId: true, department: true }
            }
          }
        }),
        prisma.vacation.count({ where })
      ]);

      res.json({
        success: true,
        data: vacations,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getVacationBalance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      const balance = await vacationService.getVacationBalance(userId);

      res.json({
        success: true,
        data: balance
      });
    } catch (error) {
      next(error);
    }
  }

  async cancelVacation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { id } = req.params;

      const vacation = await prisma.vacation.findFirst({
        where: {
          id,
          userId
        }
      });

      if (!vacation) {
        throw createError('Solicitação de férias não encontrada', 404);
      }

      if (vacation.status !== VacationStatus.PENDING) {
        throw createError('Apenas solicitações pendentes podem ser canceladas', 400);
      }

      if (new Date(vacation.startDate) <= new Date()) {
        throw createError('Não é possível cancelar férias que já iniciaram', 400);
      }

      const updatedVacation = await prisma.vacation.update({
        where: { id },
        data: {
          status: VacationStatus.CANCELLED
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true }
          }
        }
      });

      res.json({
        success: true,
        data: updatedVacation,
        message: 'Solicitação de férias cancelada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllVacations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, userId, employeeId, status, department, year } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      if (userId) where.userId = userId;
      if (employeeId) where.employeeId = employeeId;
      if (status) where.status = status;

      if (department) {
        where.employee = {
          department: { contains: department as string, mode: 'insensitive' }
        };
      }

      if (year) {
        const startYear = new Date(Number(year), 0, 1);
        const endYear = new Date(Number(year), 11, 31);
        where.startDate = {
          gte: startYear,
          lte: endYear
        };
      }

      const [vacations, total] = await Promise.all([
        prisma.vacation.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { startDate: 'desc' },
          include: {
            user: {
              select: { name: true, email: true }
            },
            employee: {
              select: { employeeId: true, department: true, position: true }
            }
          }
        }),
        prisma.vacation.count({ where })
      ]);

      res.json({
        success: true,
        data: vacations,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getPendingVacations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, department } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {
        status: VacationStatus.PENDING
      };

      if (department) {
        where.employee = {
          department: { contains: department as string, mode: 'insensitive' }
        };
      }

      const [vacations, total] = await Promise.all([
        prisma.vacation.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'asc' },
          include: {
            user: {
              select: { name: true, email: true }
            },
            employee: {
              select: { employeeId: true, department: true, position: true }
            }
          }
        }),
        prisma.vacation.count({ where })
      ]);

      res.json({
        success: true,
        data: vacations,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async approveVacation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const approverId = req.user!.id;

      const vacation = await prisma.vacation.findUnique({
        where: { id }
      });

      if (!vacation) {
        throw createError('Solicitação de férias não encontrada', 404);
      }

      if (vacation.status !== VacationStatus.PENDING) {
        throw createError('Apenas solicitações pendentes podem ser aprovadas', 400);
      }

      const updatedVacation = await prisma.vacation.update({
        where: { id },
        data: {
          status: VacationStatus.APPROVED,
          approvedBy: approverId,
          approvedAt: new Date()
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true, position: true }
          }
        }
      });

      res.json({
        success: true,
        data: updatedVacation,
        message: 'Solicitação de férias aprovada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async rejectVacation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const approverId = req.user!.id;

      if (!reason) {
        throw createError('Motivo da rejeição é obrigatório', 400);
      }

      const vacation = await prisma.vacation.findUnique({
        where: { id }
      });

      if (!vacation) {
        throw createError('Solicitação de férias não encontrada', 404);
      }

      if (vacation.status !== VacationStatus.PENDING) {
        throw createError('Apenas solicitações pendentes podem ser rejeitadas', 400);
      }

      const updatedVacation = await prisma.vacation.update({
        where: { id },
        data: {
          status: VacationStatus.REJECTED,
          reason: reason,
          approvedBy: approverId,
          approvedAt: new Date()
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true, position: true }
          }
        }
      });

      res.json({
        success: true,
        data: updatedVacation,
        message: 'Solicitação de férias rejeitada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getVacationSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year = new Date().getFullYear(), department } = req.query;

      const summary = await vacationService.getVacationSummary({
        year: Number(year),
        department: department as string
      });

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }
}
