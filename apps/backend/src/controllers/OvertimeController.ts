import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { OvertimeService } from '../services/OvertimeService';
import { prisma } from '../lib/prisma';

const overtimeService = new OvertimeService();

export class OvertimeController {
  async requestOvertime(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { date, hours, type, description } = req.body;

      // Validar data
      const overtimeDate = new Date(date);
      if (overtimeDate > new Date()) {
        throw createError('Data de horas extras deve ser no passado', 400);
      }

      // Validar horas
      if (hours <= 0 || hours > 12) {
        throw createError('Horas extras devem ser entre 1 e 12', 400);
      }

      // Verificar se já existe solicitação para a mesma data
      const existingOvertime = await prisma.overtime.findFirst({
        where: {
          userId,
          date: overtimeDate,
          status: { in: ['PENDING', 'APPROVED'] }
        }
      });

      if (existingOvertime) {
        throw createError('Já existe uma solicitação de horas extras para esta data', 400);
      }

      // Buscar dados do funcionário
      const employee = await prisma.employee.findUnique({
        where: { userId }
      });

      if (!employee) {
        throw createError('Dados de funcionário não encontrados', 404);
      }

      // Criar solicitação de horas extras
      const overtime = await prisma.overtime.create({
        data: {
          userId,
          employeeId: employee.id,
          date: overtimeDate,
          hours,
          type: type || 'REGULAR',
          description: description || null,
          status: 'PENDING'
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
        data: overtime,
        message: 'Solicitação de horas extras criada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyOvertime(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { page = 1, limit = 10, status, year, month } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { userId };

      if (status) {
        where.status = status;
      }

      if (year) {
        const startYear = new Date(Number(year), 0, 1);
        const endYear = new Date(Number(year), 11, 31);
        where.date = {
          gte: startYear,
          lte: endYear
        };
      }

      if (month) {
        const startMonth = new Date(Number(year) || new Date().getFullYear(), Number(month) - 1, 1);
        const endMonth = new Date(Number(year) || new Date().getFullYear(), Number(month), 0);
        where.date = {
          gte: startMonth,
          lte: endMonth
        };
      }

      const [overtime, total] = await Promise.all([
        prisma.overtime.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { date: 'desc' },
          include: {
            employee: {
              select: { employeeId: true, department: true }
            }
          }
        }),
        prisma.overtime.count({ where })
      ]);

      res.json({
        success: true,
        data: overtime,
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

  async getOvertimeBalance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      const balance = await overtimeService.getOvertimeBalance(userId);

      res.json({
        success: true,
        data: balance
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllOvertime(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, userId, employeeId, status, department, year, month } = req.query;
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
        where.date = {
          gte: startYear,
          lte: endYear
        };
      }

      if (month) {
        const startMonth = new Date(Number(year) || new Date().getFullYear(), Number(month) - 1, 1);
        const endMonth = new Date(Number(year) || new Date().getFullYear(), Number(month), 0);
        where.date = {
          gte: startMonth,
          lte: endMonth
        };
      }

      const [overtime, total] = await Promise.all([
        prisma.overtime.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { date: 'desc' },
          include: {
            user: {
              select: { name: true, email: true }
            },
            employee: {
              select: { employeeId: true, department: true, position: true }
            }
          }
        }),
        prisma.overtime.count({ where })
      ]);

      res.json({
        success: true,
        data: overtime,
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

  async getPendingOvertime(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, department } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {
        status: 'PENDING'
      };

      if (department) {
        where.employee = {
          department: { contains: department as string, mode: 'insensitive' }
        };
      }

      const [overtime, total] = await Promise.all([
        prisma.overtime.findMany({
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
        prisma.overtime.count({ where })
      ]);

      res.json({
        success: true,
        data: overtime,
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

  async approveOvertime(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const approverId = req.user!.id;

      const overtime = await prisma.overtime.findUnique({
        where: { id }
      });

      if (!overtime) {
        throw createError('Solicitação de horas extras não encontrada', 404);
      }

      if (overtime.status !== 'PENDING') {
        throw createError('Apenas solicitações pendentes podem ser aprovadas', 400);
      }

      const updatedOvertime = await prisma.overtime.update({
        where: { id },
        data: {
          status: 'APPROVED',
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
        data: updatedOvertime,
        message: 'Solicitação de horas extras aprovada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async rejectOvertime(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const approverId = req.user!.id;

      if (!reason) {
        throw createError('Motivo da rejeição é obrigatório', 400);
      }

      const overtime = await prisma.overtime.findUnique({
        where: { id }
      });

      if (!overtime) {
        throw createError('Solicitação de horas extras não encontrada', 404);
      }

      if (overtime.status !== 'PENDING') {
        throw createError('Apenas solicitações pendentes podem ser rejeitadas', 400);
      }

      const updatedOvertime = await prisma.overtime.update({
        where: { id },
        data: {
          status: 'REJECTED',
          description: reason,
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
        data: updatedOvertime,
        message: 'Solicitação de horas extras rejeitada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getOvertimeSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year = new Date().getFullYear(), department } = req.query;

      const summary = await overtimeService.getOvertimeSummary({
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
