import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { VacationService, VacationRequest } from '../services/VacationService';
import { prisma } from '../lib/prisma';

const vacationService = new VacationService();

export class VacationController {
  async requestVacation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { startDate, endDate, type, reason, fraction } = req.body;

      // Criar objeto de solicitação
      // Garantir que as datas sejam tratadas como data UTC para evitar problemas de timezone
      // Parse da data no formato YYYY-MM-DD e criar como meia-noite UTC
      const startDateParts = startDate.split('-');
      const endDateParts = endDate.split('-');
      const startDateObj = new Date(Date.UTC(
        parseInt(startDateParts[0]), 
        parseInt(startDateParts[1]) - 1, 
        parseInt(startDateParts[2]),
        0, 0, 0, 0
      ));
      const endDateObj = new Date(Date.UTC(
        parseInt(endDateParts[0]), 
        parseInt(endDateParts[1]) - 1, 
        parseInt(endDateParts[2]),
        23, 59, 59, 999
      ));
      
      const vacationRequest: VacationRequest = {
        startDate: startDateObj,
        endDate: endDateObj,
        type: type || 'ANNUAL',
        reason,
        fraction
      };

      // Validar solicitação conforme regras trabalhistas
      const validation = await vacationService.validateVacationRequest(userId, vacationRequest);
      
      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Solicitação inválida',
          errors: validation.errors,
          warnings: validation.warnings
        });
      }

      // Calcular dias de férias
      const days = vacationService.calculateVacationDays(vacationRequest.startDate, vacationRequest.endDate);

      // Buscar dados do funcionário
      const employee = await prisma.employee.findUnique({
        where: { userId }
      });

      if (!employee) {
        throw createError('Dados de funcionário não encontrados', 404);
      }

      // Calcular períodos aquisitivo e concessivo
      const balance = await vacationService.getVacationBalance(userId);

      // Determinar tipo baseado no fracionamento
      let vacationType = vacationRequest.type;
      // Se o tipo for FRACTIONED, converter para FRACTIONED_1, FRACTIONED_2 ou FRACTIONED_3 baseado no fraction
      if (vacationRequest.type === 'FRACTIONED') {
        if (fraction) {
          switch (fraction) {
            case 1: vacationType = 'FRACTIONED_1'; break;
            case 2: vacationType = 'FRACTIONED_2'; break;
            case 3: vacationType = 'FRACTIONED_3'; break;
            default: throw createError('Período fracionado inválido. Deve ser 1, 2 ou 3', 400);
          }
        } else {
          throw createError('Período fracionado é obrigatório quando o tipo é Fracionado', 400);
        }
      } else if (fraction) {
        // Se não for FRACTIONED mas tiver fraction, também converter
        switch (fraction) {
          case 1: vacationType = 'FRACTIONED_1'; break;
          case 2: vacationType = 'FRACTIONED_2'; break;
          case 3: vacationType = 'FRACTIONED_3'; break;
        }
      }

      // Criar solicitação de férias
      // As datas já estão em UTC (startDateObj e endDateObj)
      const vacation = await prisma.vacation.create({
        data: {
          userId,
          employeeId: employee.id,
          startDate: startDateObj,
          endDate: endDateObj,
          days,
          type: vacationType as any,
          status: 'PENDING',
          fraction: fraction || null,
          aquisitiveStart: balance.aquisitiveStart || new Date(),
          aquisitiveEnd: balance.aquisitiveEnd || new Date(),
          concessiveEnd: balance.concessiveEnd || new Date(),
          reason: vacationRequest.reason || null
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

      return res.status(201).json({
        success: true,
        data: vacation,
        message: 'Solicitação de férias criada com sucesso',
        warnings: validation.warnings
      });
    } catch (error) {
      return next(error);
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

      if (vacation.status !== 'PENDING') {
        throw createError('Apenas solicitações pendentes podem ser canceladas', 400);
      }

      if (new Date(vacation.startDate) <= new Date()) {
        throw createError('Não é possível cancelar férias que já iniciaram', 400);
      }

      const updatedVacation = await prisma.vacation.update({
        where: { id },
        data: {
          status: 'CANCELLED'
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
        status: 'PENDING'
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

      if (vacation.status !== 'PENDING') {
        throw createError('Apenas solicitações pendentes podem ser aprovadas', 400);
      }

      const updatedVacation = await prisma.vacation.update({
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

      if (vacation.status !== 'PENDING') {
        throw createError('Apenas solicitações pendentes podem ser rejeitadas', 400);
      }

      const updatedVacation = await prisma.vacation.update({
        where: { id },
        data: {
          status: 'REJECTED',
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

  async sendVacationNotice(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await vacationService.sendVacationNotice(id);

      res.json({
        success: true,
        message: 'Aviso de férias enviado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async confirmVacationNotice(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await vacationService.confirmVacationNotice(id);

      res.json({
        success: true,
        message: 'Aviso de férias confirmado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getComplianceReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const report = await vacationService.getComplianceReport();

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }

  async getExpiringVacations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { days = 30 } = req.query;
      const expiringVacations = await vacationService.getExpiringVacations(Number(days));

      res.json({
        success: true,
        data: expiringVacations
      });
    } catch (error) {
      next(error);
    }
  }

  async calculateVacationPayment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const payment = await vacationService.calculateVacationPayment(id);

      res.json({
        success: true,
        data: payment
      });
    } catch (error) {
      next(error);
    }
  }

  async validateVacationRequest(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { startDate, endDate, type, fraction } = req.body;

      const vacationRequest: VacationRequest = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        type: type || 'ANNUAL',
        fraction
      };

      const validation = await vacationService.validateVacationRequest(userId, vacationRequest);

      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      next(error);
    }
  }
}
