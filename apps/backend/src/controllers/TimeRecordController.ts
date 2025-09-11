import { Request, Response, NextFunction } from 'express';
import { PrismaClient, TimeRecordType } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { TimeRecordService } from '../services/TimeRecordService';
import { LocationService } from '../services/LocationService';
import { PhotoService } from '../services/PhotoService';
import { uploadPhoto, handleUploadError } from '../middleware/upload';

const prisma = new PrismaClient();
const timeRecordService = new TimeRecordService();
const locationService = new LocationService();
const photoService = new PhotoService();

export class TimeRecordController {
  async punchInOut(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { type, latitude, longitude } = req.body;
      const photo = req.file; // Arquivo enviado via multer

      // Normalizar latitude/longitude para número
      const latNum = latitude !== undefined && latitude !== null && latitude !== '' ? Number(latitude) : null;
      const lonNum = longitude !== undefined && longitude !== null && longitude !== '' ? Number(longitude) : null;

      // Buscar dados do funcionário
      const employee = await prisma.employee.findUnique({
        where: { userId },
        include: {
          user: {
            select: { name: true, email: true }
          }
        }
      });

      if (!employee) {
        throw createError('Dados de funcionário não encontrados', 404);
      }

      // Validar tipo de registro
      if (!Object.values(TimeRecordType).includes(type)) {
        throw createError('Tipo de registro inválido', 400);
      }

      // Validar localização se fornecida
      let isValidLocation = true;
      let locationReason = '';

      // Corrigir allowedLocations para garantir que é array
      let allowedLocations: any[] = [];
      if (employee.allowedLocations) {
        if (Array.isArray(employee.allowedLocations)) {
          allowedLocations = employee.allowedLocations;
        } else if (typeof employee.allowedLocations === 'string') {
          try {
            allowedLocations = JSON.parse(employee.allowedLocations);
          } catch {
            allowedLocations = [];
          }
        }
      }

      if (latNum !== null && lonNum !== null && !Number.isNaN(latNum) && !Number.isNaN(lonNum)) {
        const locationValidation = await locationService.validateLocation(
          latNum,
          lonNum,
          allowedLocations
        );
        isValidLocation = locationValidation.isValid;
        locationReason = locationValidation.reason;
      }

      // Upload da foto se fornecida
      let photoUrl = '';
      let photoKey = '';

      if (photo) {
        const photoResult = await photoService.uploadPhoto(photo, userId);
        photoUrl = photoResult.url;
        photoKey = photoResult.key;
      }

      // Verificar se já existe registro no mesmo dia para o mesmo tipo
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const existingRecord = await prisma.timeRecord.findFirst({
        where: {
          userId,
          type,
          timestamp: {
            gte: today,
            lt: tomorrow
          }
        }
      });

      if (existingRecord) {
        throw createError(`Já existe um registro de ${type.toLowerCase()} para hoje`, 400);
      }

      // Validar sequência obrigatória de batidas

      const todayRecords = await prisma.timeRecord.findMany({
        where: {
          userId,
          timestamp: {
            gte: today,
            lt: tomorrow
          }
        },
        orderBy: { timestamp: 'asc' }
      });

      // Verificar sequência obrigatória
      const hasEntry = todayRecords.some(r => r.type === TimeRecordType.ENTRY);
      const hasLunchStart = todayRecords.some(r => r.type === TimeRecordType.LUNCH_START);
      const hasLunchEnd = todayRecords.some(r => r.type === TimeRecordType.LUNCH_END);
      const hasExit = todayRecords.some(r => r.type === TimeRecordType.EXIT);

      // Validações de sequência
      if (type === TimeRecordType.LUNCH_START && !hasEntry) {
        throw createError('Você precisa bater o ponto de entrada antes de bater o ponto do almoço', 400);
      }
      
      if (type === TimeRecordType.LUNCH_END && !hasLunchStart) {
        throw createError('Você precisa bater o ponto do almoço antes de bater o ponto do retorno', 400);
      }
      
      if (type === TimeRecordType.EXIT && !hasLunchEnd) {
        throw createError('Você precisa bater o ponto do retorno antes de bater o ponto de saída', 400);
      }

      // Criar registro de ponto
      const timeRecord = await prisma.timeRecord.create({
        data: {
          userId,
          employeeId: employee.id,
          type,
          latitude: latNum !== null && !Number.isNaN(latNum) ? latNum : null,
          longitude: lonNum !== null && !Number.isNaN(lonNum) ? lonNum : null,
          photoUrl: photoUrl || null,
          photoKey: photoKey || null,
          isValid: isValidLocation,
          reason: !isValidLocation ? locationReason : null
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

      // Calcular horas trabalhadas se for saída
      let workHours = null;
      if (type === TimeRecordType.EXIT) {
        workHours = await timeRecordService.calculateWorkHours(userId, new Date());
      }

      res.status(201).json({
        success: true,
        data: {
          timeRecord,
          workHours,
          locationValid: isValidLocation,
          locationReason
        },
        message: 'Ponto registrado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyRecords(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { page = 1, limit = 20, startDate, endDate, type } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { userId };

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate as string);
        if (endDate) where.timestamp.lte = new Date(endDate as string);
      }

      if (type) {
        where.type = type;
      }

      const [records, total] = await Promise.all([
        prisma.timeRecord.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { timestamp: 'desc' },
          include: {
            employee: {
              select: { employeeId: true, department: true }
            }
          }
        }),
        prisma.timeRecord.count({ where })
      ]);

      res.json({
        success: true,
        data: records,
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

  async getTodayRecords(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const records = await prisma.timeRecord.findMany({
        where: {
          userId,
          timestamp: {
            gte: today,
            lt: tomorrow
          }
        },
        orderBy: { timestamp: 'asc' }
      });

      // Calcular resumo do dia
      const summary = await timeRecordService.calculateDaySummary(userId, today);

      res.json({
        success: true,
        data: {
          records,
          summary
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecordsByPeriod(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        throw createError('Data inicial e final são obrigatórias', 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const records = await prisma.timeRecord.findMany({
        where: {
          userId,
          timestamp: {
            gte: start,
            lte: end
          }
        },
        orderBy: { timestamp: 'asc' },
        include: {
          employee: {
            select: { employeeId: true, department: true }
          }
        }
      });

      // Calcular resumo do período
      const summary = await timeRecordService.calculatePeriodSummary(userId, start, end);

      res.json({
        success: true,
        data: {
          records,
          summary,
          period: { startDate: start, endDate: end }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getBankHours(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { startDate, endDate, detailed } = req.query as any;

      const now = new Date();
      let start: Date;
      
      if (startDate) {
        start = new Date(startDate as string);
      } else {
        // Se não há startDate, usar a data de admissão do funcionário
        const employee = await prisma.employee.findFirst({ where: { userId } });
        start = employee ? employee.hireDate : new Date(now.getFullYear(), now.getMonth(), 1);
      }
      
      // Sempre limitar até hoje, mesmo quando endDate não é especificada
      const end = endDate ? new Date(endDate as string) : now;

      const result = detailed === 'true'
        ? await timeRecordService.calculateBankHoursDetailed(userId, start, end)
        : await timeRecordService.calculateBankHours(userId, start, end);

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getAllRecords(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, userId, employeeId, startDate, endDate, type, isValid } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      if (userId) where.userId = userId;
      if (employeeId) where.employeeId = employeeId;
      if (type) where.type = type;
      if (isValid !== undefined) where.isValid = isValid === 'true';

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate as string);
        if (endDate) where.timestamp.lte = new Date(endDate as string);
      }

      const [records, total] = await Promise.all([
        prisma.timeRecord.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { timestamp: 'desc' },
          include: {
            user: {
              select: { name: true, email: true }
            },
            employee: {
              select: { employeeId: true, department: true, position: true }
            }
          }
        }),
        prisma.timeRecord.count({ where })
      ]);

      res.json({
        success: true,
        data: records,
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

  async getRecordById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const record = await prisma.timeRecord.findUnique({
        where: { id },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true, position: true }
          }
        }
      });

      if (!record) {
        throw createError('Registro não encontrado', 404);
      }

      res.json({
        success: true,
        data: record
      });
    } catch (error) {
      next(error);
    }
  }

  async validateRecord(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const approverId = req.user!.id;

      const record = await prisma.timeRecord.findUnique({
        where: { id }
      });

      if (!record) {
        throw createError('Registro não encontrado', 404);
      }

      const updatedRecord = await prisma.timeRecord.update({
        where: { id },
        data: {
          isValid: true,
          reason: null,
          approvedBy: approverId,
          approvedAt: new Date()
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
        data: updatedRecord,
        message: 'Registro validado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async invalidateRecord(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const approverId = req.user!.id;

      if (!reason) {
        throw createError('Motivo é obrigatório para invalidar registro', 400);
      }

      const record = await prisma.timeRecord.findUnique({
        where: { id }
      });

      if (!record) {
        throw createError('Registro não encontrado', 404);
      }

      const updatedRecord = await prisma.timeRecord.update({
        where: { id },
        data: {
          isValid: false,
          reason,
          approvedBy: approverId,
          approvedAt: new Date()
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
        data: updatedRecord,
        message: 'Registro invalidado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getAttendanceReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, department, userId } = req.query;

      if (!startDate || !endDate) {
        throw createError('Data inicial e final são obrigatórias', 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const report = await timeRecordService.generateAttendanceReport({
        startDate: start,
        endDate: end,
        department: department as string,
        userId: userId as string
      });

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }

  async getLateArrivalsReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, department } = req.query;

      if (!startDate || !endDate) {
        throw createError('Data inicial e final são obrigatórias', 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const report = await timeRecordService.generateLateArrivalsReport({
        startDate: start,
        endDate: end,
        department: department as string
      });

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }
}