import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { TimeRecordService } from '../services/TimeRecordService';
import { LocationService } from '../services/LocationService';
import { PhotoService } from '../services/PhotoService';
import { HolidayService } from '../services/HolidayService';
import { uploadPhoto, handleUploadError } from '../middleware/upload';
import moment from 'moment-timezone';
import { prisma } from '../lib/prisma';

const timeRecordService = new TimeRecordService();
const locationService = new LocationService();
const photoService = new PhotoService();
const holidayService = new HolidayService();

export class TimeRecordController {
  async punchInOut(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { type, latitude, longitude, observation, clientTimestamp } = req.body;
      const photo = req.file; // Arquivo enviado via multer



      // Normalizar latitude/longitude para número
      const latNum = latitude !== undefined && latitude !== null && latitude !== '' ? Number(latitude) : null;
      const lonNum = longitude !== undefined && longitude !== null && longitude !== '' ? Number(longitude) : null;

      // Buscar dados do funcionário
      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: {
          id: true,
          userId: true,
          employeeId: true,
          department: true,
          position: true,
          hireDate: true,
          salary: true,
          workSchedule: true,
          isRemote: true,
          allowedLocations: true,
          costCenter: true,
          client: true,
          dailyFoodVoucher: true,
          dailyTransportVoucher: true,
          user: {
            select: { name: true, email: true }
          }
        }
      });

      if (!employee) {
        throw createError('Dados de funcionário não encontrados', 404);
      }

      // Verificar se o funcionário está de férias aprovadas na data do ponto
      const punchDate = clientTimestamp ? new Date(clientTimestamp) : new Date();
      const punchDateStart = moment(punchDate).tz('America/Sao_Paulo').startOf('day').toDate();
      const punchDateEnd = moment(punchDate).tz('America/Sao_Paulo').endOf('day').toDate();

      const activeVacation = await prisma.vacation.findFirst({
        where: {
          userId,
          status: 'APPROVED',
          startDate: { lte: punchDateEnd },
          endDate: { gte: punchDateStart }
        }
      });

      if (activeVacation) {
        res.status(400).json({
          success: false,
          message: `Você está de férias no período de ${moment(activeVacation.startDate).format('DD/MM/YYYY')} a ${moment(activeVacation.endDate).format('DD/MM/YYYY')}. Não é possível bater ponto durante as férias.`
        });
        return;
      }

      // Validar tipo de registro
      if (!Object.values(['ENTRY', 'EXIT', 'LUNCH_START', 'LUNCH_END', 'BREAK_START', 'BREAK_END', 'ABSENCE_JUSTIFIED']).includes(type)) {
        throw createError('Tipo de registro inválido', 400);
      }

      // Sempre permitir bater ponto de qualquer lugar, mas salvar a localização
      let isValidLocation = true;
      let locationReason = '';

      // Se a localização foi fornecida, validar e salvar
      if (latNum !== null && lonNum !== null && !Number.isNaN(latNum) && !Number.isNaN(lonNum)) {
        // Verificar se as coordenadas são válidas
        if (locationService.isValidCoordinates(latNum, lonNum)) {
          locationReason = `Localização registrada: ${locationService.formatLocation(latNum, lonNum)}`;
        } else {
          locationReason = 'Coordenadas inválidas fornecidas';
        }
      } else {
        locationReason = 'Localização não fornecida';
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
      // Usar timezone de Brasília
      const today = moment().tz('America/Sao_Paulo').startOf('day').toDate();
      const tomorrow = moment().tz('America/Sao_Paulo').add(1, 'day').startOf('day').toDate();

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
      const hasEntry = todayRecords.some((r: any) => r.type === 'ENTRY');
      const hasLunchStart = todayRecords.some((r: any) => r.type === 'LUNCH_START');
      const hasLunchEnd = todayRecords.some((r: any) => r.type === 'LUNCH_END');
      const hasExit = todayRecords.some((r: any) => r.type === 'EXIT');

      // Verificar se todos os 4 pontos já foram batidos
      const allPointsCompleted = hasEntry && hasLunchStart && hasLunchEnd && hasExit;
      
      if (allPointsCompleted) {
        throw createError('Todos os pontos obrigatórios já foram batidos hoje. Você poderá bater ponto novamente amanhã.', 400);
      }

      // Validações de sequência
      if (type === 'LUNCH_START' && !hasEntry) {
        throw createError('Você precisa bater o ponto de entrada antes de bater o ponto do almoço', 400);
      }
      
      if (type === 'LUNCH_END' && !hasLunchStart) {
        throw createError('Você precisa bater o ponto do almoço antes de bater o ponto do retorno', 400);
      }
      
      if (type === 'EXIT' && !hasLunchEnd) {
        throw createError('Você precisa bater o ponto do retorno antes de bater o ponto de saída', 400);
      }


      // Cliente envia timestamp no horário local (ex: "2025-01-15T09:19:00")
      // Salvar EXATAMENTE esse valor sem conversão
      let timestamp: Date;
      if (clientTimestamp) {
        // Parse manual para criar Date no horário local
        const parts = clientTimestamp.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
        if (parts) {
          const year = parseInt(parts[1]);
          const month = parseInt(parts[2]) - 1;
          const day = parseInt(parts[3]);
          const hours = parseInt(parts[4]);
          const minutes = parseInt(parts[5]);
          const seconds = parseInt(parts[6]);
          // Criar timestamp simulando que é UTC mas sem timezone
          // Assim salva no banco o horário literal exato
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
          timestamp = new Date(dateStr + 'Z'); // Adicionar Z para forçar UTC
        } else {
          timestamp = new Date(clientTimestamp);
        }
      } else {
        timestamp = moment.tz('America/Sao_Paulo').toDate();
      }
      
      // Calcular VA e VT baseado no tipo de registro
      // VA e VT são adicionados apenas em registros de ENTRY (primeira batida do dia)
      let foodVoucherAmount = 0;
      let transportVoucherAmount = 0;
      
      if (type === 'ENTRY') {
        // Verificar se já existe registro de ENTRY hoje
        const existingEntry = await prisma.timeRecord.findFirst({
          where: {
            userId,
            type: 'ENTRY',
            timestamp: {
              gte: today,
              lt: tomorrow
            }
          }
        });
        
        // Se não existe ENTRY hoje, adicionar VA e VT
        if (!existingEntry) {
          foodVoucherAmount = employee.dailyFoodVoucher || 0;
          transportVoucherAmount = employee.dailyTransportVoucher || 0;
        }
      }

      const timeRecord = await prisma.timeRecord.create({
        data: {
          userId,
          employeeId: employee.id,
          type,
          timestamp: timestamp, // Usar timestamp exatamente como veio do mobile
          latitude: latNum !== null && !Number.isNaN(latNum) ? latNum : null,
          longitude: lonNum !== null && !Number.isNaN(lonNum) ? lonNum : null,
          photoUrl: photoUrl || null,
          photoKey: photoKey || null,
          isValid: true, // Sempre válido - permitir bater ponto de qualquer lugar
          reason: locationReason, // Sempre incluir informações da localização
          observation: observation && observation.trim() ? observation.trim() : null, // Observação do funcionário
          foodVoucherAmount,
          transportVoucherAmount,
          costCenter: employee.costCenter // Incluir centro de custo automaticamente
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { 
              employeeId: true, 
              department: true, 
              position: true,
              dailyFoodVoucher: true,
              dailyTransportVoucher: true
            }
          }
        }
      });

      // Calcular horas trabalhadas se for saída
      let workHours = null;
      if (type === 'EXIT') {
        workHours = await timeRecordService.calculateWorkHours(userId, new Date());
      }

      res.status(201).json({
        success: true,
        data: {
          timeRecord,
          workHours,
          locationValid: true, // Sempre válido - permitir bater ponto de qualquer lugar
          locationReason: locationReason
        },
        message: 'Ponto registrado com sucesso'
      });
      return;
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
      // Usar timezone de Brasília
      const today = moment().tz('America/Sao_Paulo').startOf('day').toDate();
      const tomorrow = moment().tz('America/Sao_Paulo').add(1, 'day').startOf('day').toDate();

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

      // Buscar detalhes do atestado médico para registros de ausência justificada
      const recordsWithDetails = await Promise.all(records.map(async (record: any) => {
        if (record.type === 'ABSENCE_JUSTIFIED') {
          const recordDate = moment(record.timestamp).startOf('day').toDate();

          const medicalCertificate = await prisma.medicalCertificate.findFirst({
            where: {
              userId: record.userId,
              status: 'APPROVED',
              startDate: {
                lte: recordDate,
              },
              endDate: {
                gte: recordDate,
              },
            },
            select: {
              startDate: true,
              endDate: true,
              days: true,
              submittedAt: true,
              description: true,
              type: true,
            },
          });

          return {
            ...record,
            medicalCertificateDetails: medicalCertificate,
          };
        }
        return record;
      }));

      // Calcular resumo do dia
      const summary = await timeRecordService.calculateDaySummary(userId, today);

      res.json({
        success: true,
        data: {
          records: recordsWithDetails,
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

      // Buscar detalhes do atestado médico para registros de ausência justificada
      const recordsWithDetails = await Promise.all(records.map(async (record: any) => {
        if (record.type === 'ABSENCE_JUSTIFIED') {
          const recordDate = moment(record.timestamp).startOf('day').toDate();

          const medicalCertificate = await prisma.medicalCertificate.findFirst({
            where: {
              userId: record.userId,
              status: 'APPROVED',
              startDate: {
                lte: recordDate,
              },
              endDate: {
                gte: recordDate,
              },
            },
            select: {
              startDate: true,
              endDate: true,
              days: true,
              submittedAt: true,
              description: true,
              type: true,
            },
          });

          return {
            ...record,
            medicalCertificateDetails: medicalCertificate,
          };
        }
        return record;
      }));

      // Calcular resumo do período
      const summary = await timeRecordService.calculatePeriodSummary(userId, start, end);

      res.json({
        success: true,
        data: {
          records: recordsWithDetails,
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

      // Buscar detalhes do atestado médico para registros de ausência justificada
      const recordsWithDetails = await Promise.all(records.map(async (record: any) => {
        if (record.type === 'ABSENCE_JUSTIFIED') {
          const recordDate = moment(record.timestamp).startOf('day').toDate();

          const medicalCertificate = await prisma.medicalCertificate.findFirst({
            where: {
              userId: record.userId,
              status: 'APPROVED',
              startDate: {
                lte: recordDate,
              },
              endDate: {
                gte: recordDate,
              },
            },
            select: {
              startDate: true,
              endDate: true,
              days: true,
              submittedAt: true,
              description: true,
              type: true,
            },
          });

          return {
            ...record,
            medicalCertificateDetails: medicalCertificate,
          };
        }
        return record;
      }));

      res.json({
        success: true,
        data: recordsWithDetails,
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
            select: { 
              employeeId: true, 
              department: true, 
              position: true,
              dailyFoodVoucher: true,
              dailyTransportVoucher: true
            }
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

  async updateRecord(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { type, timestamp, reason, observation } = req.body;

      // Verificar se o registro existe
      const existingRecord = await prisma.timeRecord.findUnique({
        where: { id },
        include: {
          user: {
            select: { name: true, email: true }
          }
        }
      });

      if (!existingRecord) {
        throw createError('Registro não encontrado', 404);
      }

      // Validar tipo se fornecido
      if (type && !Object.values(['ENTRY', 'EXIT', 'LUNCH_START', 'LUNCH_END', 'BREAK_START', 'BREAK_END', 'ABSENCE_JUSTIFIED']).includes(type)) {
        throw createError('Tipo de registro inválido', 400);
      }

      // Validar timestamp se fornecido
      let newTimestamp = existingRecord.timestamp;
      if (timestamp) {
        // Converter timestamp para horário local (Brasília) sem conversão de timezone
        const date = new Date(timestamp);
        const brazilTime = new Date(date.getTime() - (3 * 60 * 60 * 1000)); // Subtrair 3 horas para converter UTC para horário de Brasília
        newTimestamp = brazilTime;
        if (isNaN(newTimestamp.getTime())) {
          throw createError('Data/hora inválida', 400);
        }
      }

      // Atualizar registro
      const updatedRecord = await prisma.timeRecord.update({
        where: { id },
        data: {
          ...(type && { type }),
          ...(timestamp && { timestamp: newTimestamp }),
          ...(reason !== undefined && { reason }),
          ...(observation !== undefined && { observation: observation?.trim() || null }),
          updatedAt: new Date()
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { 
              employeeId: true, 
              department: true, 
              position: true,
              dailyFoodVoucher: true,
              dailyTransportVoucher: true
            }
          }
        }
      });

      res.json({
        success: true,
        data: updatedRecord,
        message: 'Registro atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteRecord(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Verificar se o registro existe
      const existingRecord = await prisma.timeRecord.findUnique({
        where: { id },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { 
              employeeId: true, 
              department: true, 
              position: true
            }
          }
        }
      });

      if (!existingRecord) {
        throw createError('Registro não encontrado', 404);
      }

      // Deletar registro
      await prisma.timeRecord.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Registro removido com sucesso',
        data: {
          id: existingRecord.id,
          employeeName: existingRecord.user.name,
          timestamp: existingRecord.timestamp,
          type: existingRecord.type
        }
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

  async getEmployeeCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params;
      const { month, year } = req.query;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      // Verificar se o funcionário existe
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              cpf: true
            }
          }
        }
      });

      if (!employee) {
        throw createError('Funcionário não encontrado', 404);
      }

      // Converter polo para estado (para verificação de feriados)
      const poloToState = (polo?: string | null): string | undefined => {
        if (!polo) return undefined;
        const poloUpper = polo.toUpperCase();
        if (poloUpper.includes('BRASÍLIA') || poloUpper.includes('BRASILIA')) return 'DF';
        if (poloUpper.includes('GOIÁS') || poloUpper.includes('GOIAS')) return 'GO';
        return undefined;
      };

      const employeeState = poloToState(employee.polo);

      // Calcular início e fim do mês
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

      // Buscar todos os registros do funcionário no mês
      const timeRecords = await prisma.timeRecord.findMany({
        where: {
          employeeId: employeeId,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: {
          timestamp: 'asc'
        }
      });

      // Buscar férias aprovadas no período
      const vacations = await prisma.vacation.findMany({
        where: {
          userId: employee.userId,
          status: 'APPROVED',
          OR: [
            {
              AND: [
                { startDate: { lte: endDate } },
                { endDate: { gte: startDate } }
              ]
            }
          ]
        }
      });

      // Buscar atestados médicos aprovados no período
      const medicalCertificates = await prisma.medicalCertificate.findMany({
        where: {
          userId: employee.userId,
          status: 'APPROVED',
          OR: [
            {
              AND: [
                { startDate: { lte: endDate } },
                { endDate: { gte: startDate } }
              ]
            }
          ]
        }
      });

      // Buscar todos os feriados do mês de uma vez (otimização)
      const holidays = await holidayService.getHolidaysByPeriod(
        moment(startDate).format('YYYY-MM-DD'),
        moment(endDate).format('YYYY-MM-DD'),
        employeeState
      );
      const holidaysSet = new Set(holidays.map(h => moment(h.date).format('YYYY-MM-DD')));

      // Agrupar registros por dia
      const daysMap = new Map<string, any[]>();
      
      timeRecords.forEach(record => {
        const dateKey = moment(record.timestamp).format('YYYY-MM-DD');
        if (!daysMap.has(dateKey)) {
          daysMap.set(dateKey, []);
        }
        daysMap.get(dateKey)!.push({
          id: record.id,
          type: record.type,
          timestamp: record.timestamp,
          costCenter: record.costCenter || 'SEDE',
          isValid: record.isValid,
          reason: record.reason // Incluir reason para extrair o tipo da ausência
        });
      });

      // Criar array de dias do mês
      const daysInMonth = [];
      const daysCount = endDate.getDate();
      
      for (let day = 1; day <= daysCount; day++) {
        const date = new Date(yearNum, monthNum - 1, day);
        const dateKey = moment(date).format('YYYY-MM-DD');
        const dayRecords = daysMap.get(dateKey) || [];
        
        // Verificar se está em férias
        const isOnVacation = vacations.some(vacation => {
          const vacationStart = moment(vacation.startDate).format('YYYY-MM-DD');
          const vacationEnd = moment(vacation.endDate).format('YYYY-MM-DD');
          return dateKey >= vacationStart && dateKey <= vacationEnd;
        });

        // Verificar se está com atestado médico e extrair o tipo
        const medicalCertificate = medicalCertificates.find(cert => {
          const certStart = moment(cert.startDate).format('YYYY-MM-DD');
          const certEnd = moment(cert.endDate).format('YYYY-MM-DD');
          return dateKey >= certStart && dateKey <= certEnd;
        });
        const hasMedicalCertificate = !!medicalCertificate;

        // Verificar se é feriado (usando o Set para verificação rápida)
        const isHoliday = holidaysSet.has(dateKey);
        
        // Verificar se há ausência justificada (registro do tipo ABSENCE_JUSTIFIED)
        const absenceRecord = dayRecords.find((r: any) => r.type === 'ABSENCE_JUSTIFIED');
        const hasAbsenceJustified = !!absenceRecord;
        
        // Extrair o tipo da ausência do campo reason ou do atestado médico
        let absenceType = null;
        let customAbsenceType = null; // Tipo personalizado quando for "Outros"
        
        // Primeiro, tentar pegar do atestado médico se existir
        if (medicalCertificate?.type) {
          absenceType = medicalCertificate.type;
          // Se for "Outros", extrair o tipo personalizado da descrição
          if (medicalCertificate.type === 'OTHER' && medicalCertificate.description) {
            // O tipo personalizado está no início da descrição (antes do " - ")
            const descParts = medicalCertificate.description.split(' - ');
            customAbsenceType = descParts[0] || null;
          }
        }
        // Se não tiver, tentar extrair do reason do registro
        else if (absenceRecord?.reason) {
          // Formato: "Ausência justificada por atestado médico - medical"
          // ou "Ausência justificada - {tipo personalizado}" para "Outros"
          const reasonLower = absenceRecord.reason.toLowerCase();
          if (reasonLower.includes('ausência justificada - ')) {
            // Formato para "Outros": "Ausência justificada - {tipo personalizado}"
            const customMatch = absenceRecord.reason.match(/ausência justificada - (.+)/i);
            if (customMatch && customMatch[1]) {
              absenceType = 'OTHER';
              customAbsenceType = customMatch[1].trim();
            }
          } else if (reasonLower.includes('medical') || reasonLower.includes('médico')) {
            absenceType = 'MEDICAL';
          } else if (reasonLower.includes('dental') || reasonLower.includes('odontológico')) {
            absenceType = 'DENTAL';
          } else if (reasonLower.includes('preventive') || reasonLower.includes('preventivo')) {
            absenceType = 'PREVENTIVE';
          } else if (reasonLower.includes('accident') || reasonLower.includes('acidente')) {
            absenceType = 'ACCIDENT';
          } else if (reasonLower.includes('covid')) {
            absenceType = 'COVID';
          } else if (reasonLower.includes('maternity') || reasonLower.includes('maternidade')) {
            absenceType = 'MATERNITY';
          } else if (reasonLower.includes('paternity') || reasonLower.includes('paternidade')) {
            absenceType = 'PATERNITY';
          } else if (reasonLower.includes('other') || reasonLower.includes('outros')) {
            absenceType = 'OTHER';
          }
        }
        
        daysInMonth.push({
          date: dateKey,
          day: day,
          points: dayRecords,
          costCenter: dayRecords.length > 0 ? dayRecords[0].costCenter : null,
          isOnVacation,
          hasMedicalCertificate,
          isHoliday,
          hasAbsenceJustified,
          absenceType, // Tipo da ausência extraído do reason
          customAbsenceType // Tipo personalizado quando for "Outros"
        });
      }

      res.json({
        success: true,
        data: {
          employee: {
            id: employee.id,
            name: employee.user.name,
            cpf: employee.user.cpf,
            admissionDate: employee.hireDate,
            hireDate: employee.hireDate // Debug: adicionar também como hireDate
          },
          month: monthNum,
          year: yearNum,
          days: daysInMonth
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Criar ponto manualmente para um funcionário (apenas admin)
   */
  async createManualRecord(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId, date, time, type, observation } = req.body;

      if (!employeeId || !date || !time || !type) {
        throw createError('ID do funcionário, data, horário e tipo são obrigatórios', 400);
      }

      // Validar tipo de registro
      if (!['ENTRY', 'LUNCH_START', 'LUNCH_END', 'EXIT'].includes(type)) {
        throw createError('Tipo de registro inválido. Use: ENTRY, LUNCH_START, LUNCH_END ou EXIT', 400);
      }

      // Buscar dados do funcionário
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          userId: true,
          employeeId: true,
          costCenter: true,
          dailyFoodVoucher: true,
          dailyTransportVoucher: true,
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      if (!employee) {
        throw createError('Funcionário não encontrado', 404);
      }

      // Criar data completa para o ponto (mesma lógica do punchInOut para evitar problemas de timezone)
      // Parsear a data manualmente para criar Date no horário correto
      const [year, month, day] = date.split('-').map(Number);
      const [hour, minute] = time.split(':').map(Number);
      
      // Construir timestamp exatamente como é salvo no banco (mesma lógica do TimeRecordController)
      // Formato: YYYY-MM-DDTHH:mm:00Z
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
      const timestamp = new Date(dateStr + 'Z'); // Adicionar Z para forçar UTC

      // Verificar se já existe ponto do mesmo tipo para essa data
      // Criar range do dia usando a mesma lógica
      const startOfDayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`;
      const endOfDayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59`;
      const startOfDay = new Date(startOfDayStr + 'Z');
      const endOfDay = new Date(endOfDayStr + 'Z');

      const existingRecord = await prisma.timeRecord.findFirst({
        where: {
          employeeId,
          type: type as any,
          timestamp: {
            gte: startOfDay,
            lte: endOfDay
          }
        }
      });

      if (existingRecord) {
        throw createError(`Já existe um ponto de ${type === 'ENTRY' ? 'entrada' : type === 'LUNCH_START' ? 'início do almoço' : type === 'LUNCH_END' ? 'retorno do almoço' : 'saída'} para esta data.`, 400);
      }

      // Adicionar VT e VA apenas no ponto de entrada
      let foodVoucherAmount = null;
      let transportVoucherAmount = null;
      
      if (type === 'ENTRY') {
        foodVoucherAmount = employee.dailyFoodVoucher || 0;
        transportVoucherAmount = employee.dailyTransportVoucher || 0;
      }

      // Criar o ponto
      const record = await prisma.timeRecord.create({
        data: {
          userId: employee.userId,
          employeeId: employee.id,
          type: type as any,
          timestamp: timestamp,
          isValid: true,
          reason: 'Ponto criado manualmente',
          observation: observation || null,
          foodVoucherAmount,
          transportVoucherAmount,
          costCenter: employee.costCenter,
          approvedBy: req.user!.id,
          approvedAt: new Date()
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { 
              employeeId: true, 
              department: true, 
              position: true
            }
          }
        }
      });

      res.status(201).json({
        success: true,
        data: {
          record,
          message: 'Ponto criado manualmente com sucesso'
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Importar múltiplos pontos de uma planilha
   */
  async importRecordsFromSpreadsheet(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId, records } = req.body;

      if (!employeeId || !Array.isArray(records) || records.length === 0) {
        throw createError('ID do funcionário e lista de registros são obrigatórios', 400);
      }

      // Buscar dados do funcionário
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          userId: true,
          employeeId: true,
          costCenter: true,
          dailyFoodVoucher: true,
          dailyTransportVoucher: true,
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      if (!employee) {
        throw createError('Funcionário não encontrado', 404);
      }

      const createdRecords = [];
      const errors = [];
      const skipped = [];

      for (const recordData of records) {
        try {
          const { date, time, type } = recordData;

          if (!date || !time || !type) {
            errors.push({ date, time, type, error: 'Data, horário e tipo são obrigatórios' });
            continue;
          }

          // Validar tipo
          if (!['ENTRY', 'LUNCH_START', 'LUNCH_END', 'EXIT'].includes(type)) {
            errors.push({ date, time, type, error: 'Tipo de registro inválido' });
            continue;
          }

          // Parsear data e hora
          const [year, month, day] = date.split('-').map(Number);
          const [hour, minute] = time.split(':').map(Number);
          
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
          const timestamp = new Date(dateStr + 'Z');

          // Verificar se já existe
          const startOfDayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00`;
          const endOfDayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T23:59:59`;
          const startOfDay = new Date(startOfDayStr + 'Z');
          const endOfDay = new Date(endOfDayStr + 'Z');

          const existingRecord = await prisma.timeRecord.findFirst({
            where: {
              employeeId,
              type: type as any,
              timestamp: {
                gte: startOfDay,
                lte: endOfDay
              }
            }
          });

          if (existingRecord) {
            skipped.push({ date, time, type, reason: 'Ponto já existe' });
            continue;
          }

          // Adicionar VT e VA apenas no ponto de entrada
          let foodVoucherAmount = null;
          let transportVoucherAmount = null;
          
          if (type === 'ENTRY') {
            // Verificar se já existe ENTRY neste dia
            const existingEntry = await prisma.timeRecord.findFirst({
              where: {
                employeeId,
                type: 'ENTRY',
                timestamp: {
                  gte: startOfDay,
                  lte: endOfDay
                }
              }
            });

            if (!existingEntry) {
              foodVoucherAmount = employee.dailyFoodVoucher || 0;
              transportVoucherAmount = employee.dailyTransportVoucher || 0;
            }
          }

          // Criar o ponto
          const record = await prisma.timeRecord.create({
            data: {
              userId: employee.userId,
              employeeId: employee.id,
              type: type as any,
              timestamp: timestamp,
              isValid: true,
              reason: 'Ponto importado de planilha',
              observation: recordData.observation || null,
              foodVoucherAmount,
              transportVoucherAmount,
              costCenter: employee.costCenter,
              approvedBy: req.user!.id,
              approvedAt: new Date()
            }
          });

          createdRecords.push(record);
        } catch (error: any) {
          errors.push({ 
            date: recordData.date, 
            time: recordData.time, 
            type: recordData.type, 
            error: error.message || 'Erro ao criar registro' 
          });
        }
      }

      res.status(201).json({
        success: true,
        data: {
          created: createdRecords.length,
          skipped: skipped.length,
          errors: errors.length,
          details: {
            created: createdRecords,
            skipped,
            errors
          },
          message: `${createdRecords.length} ponto(s) importado(s) com sucesso${skipped.length > 0 ? `, ${skipped.length} ponto(s) ignorado(s) (já existem)` : ''}${errors.length > 0 ? `, ${errors.length} erro(s)` : ''}`
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Registrar falta manualmente para um funcionário (apenas admin/departamento pessoal)
   * Funciona para todos os funcionários, mesmo os que não precisam bater ponto
   */
  async registerAbsence(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId, date, reason, observation } = req.body;
      const approvedBy = req.user!.id;

      if (!employeeId || !date) {
        throw createError('ID do funcionário e data são obrigatórios', 400);
      }

      // Buscar dados do funcionário
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          userId: true,
          employeeId: true,
          costCenter: true,
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      if (!employee) {
        throw createError('Funcionário não encontrado', 404);
      }

      // Parsear a data manualmente para criar Date no horário correto
      const [year, month, day] = date.split('-').map(Number);
      
      // Criar timestamp para 8h da manhã no horário UTC
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T08:00:00`;
      const timestamp = new Date(dateStr + 'Z'); // Adicionar Z para forçar UTC

      // Verificar se já existe um registro de falta para este dia
      const dayStart = new Date(year, month - 1, day, 0, 0, 0);
      const dayEnd = new Date(year, month - 1, day, 23, 59, 59);

      const existingRecord = await prisma.timeRecord.findFirst({
        where: {
          userId: employee.userId,
          employeeId: employee.id,
          type: 'ABSENCE_JUSTIFIED',
          timestamp: {
            gte: dayStart,
            lte: dayEnd
          }
        }
      });

      if (existingRecord) {
        throw createError('Já existe um registro de falta para este funcionário nesta data', 400);
      }

      // Criar registro de falta (usando ABSENCE_JUSTIFIED mas será tratado como falta normal)
      const absenceRecord = await prisma.timeRecord.create({
        data: {
          userId: employee.userId,
          employeeId: employee.id,
          type: 'ABSENCE_JUSTIFIED',
          timestamp: timestamp,
          isValid: true,
          reason: reason || 'Falta registrada manualmente',
          observation: observation || null,
          approvedBy: approvedBy,
          approvedAt: new Date(),
          costCenter: employee.costCenter || null
        }
      });

      res.status(201).json({
        success: true,
        data: {
          absenceRecord,
          employee: {
            id: employee.id,
            name: employee.user.name,
            employeeId: employee.employeeId
          }
        },
        message: 'Falta registrada com sucesso'
      });
      return;
    } catch (error) {
      next(error);
    }
  }

  /**
   * Registrar múltiplas faltas para um funcionário (período)
   */
  async registerMultipleAbsences(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId, startDate, endDate, reason, observation } = req.body;
      const approvedBy = req.user!.id;

      if (!employeeId || !startDate || !endDate) {
        throw createError('ID do funcionário, data de início e data de fim são obrigatórios', 400);
      }

      // Buscar dados do funcionário
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          userId: true,
          employeeId: true,
          costCenter: true,
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      if (!employee) {
        throw createError('Funcionário não encontrado', 404);
      }

      // Parsear datas
      const startDateParts = startDate.split('-').map(Number);
      const endDateParts = endDate.split('-').map(Number);
      const startDateObj = new Date(startDateParts[0], startDateParts[1] - 1, startDateParts[2]);
      const endDateObj = new Date(endDateParts[0], endDateParts[1] - 1, endDateParts[2]);

      if (endDateObj < startDateObj) {
        throw createError('Data de fim deve ser posterior à data de início', 400);
      }

      const createdRecords = [];
      const skippedDates = [];

      // Iterar por cada dia do período
      for (let currentDate = new Date(startDateObj); currentDate <= endDateObj; currentDate.setDate(currentDate.getDate() + 1)) {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const day = currentDate.getDate();

        // Verificar se já existe um registro para este dia
        const dayStart = new Date(year, month - 1, day, 0, 0, 0);
        const dayEnd = new Date(year, month - 1, day, 23, 59, 59);

        const existingRecord = await prisma.timeRecord.findFirst({
          where: {
            userId: employee.userId,
            employeeId: employee.id,
            type: 'ABSENCE_JUSTIFIED',
            timestamp: {
              gte: dayStart,
              lte: dayEnd
            }
          }
        });

        if (existingRecord) {
          skippedDates.push(`${day.toString().padStart(2, '0')}/${month.toString().padStart(2, '0')}/${year}`);
          continue;
        }

        // Criar timestamp para 8h da manhã no horário UTC
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T08:00:00`;
        const timestamp = new Date(dateStr + 'Z');

        // Criar registro de falta
        const absenceRecord = await prisma.timeRecord.create({
          data: {
            userId: employee.userId,
            employeeId: employee.id,
            type: 'ABSENCE_JUSTIFIED',
            timestamp: timestamp,
            isValid: true,
            reason: reason || 'Falta registrada manualmente',
            observation: observation || null,
            approvedBy: approvedBy,
            approvedAt: new Date(),
            costCenter: employee.costCenter || null
          }
        });

        createdRecords.push(absenceRecord);
      }

      res.status(201).json({
        success: true,
        data: {
          createdRecords,
          skippedDates,
          totalCreated: createdRecords.length,
          totalSkipped: skippedDates.length,
          employee: {
            id: employee.id,
            name: employee.user.name,
            employeeId: employee.employeeId
          }
        },
        message: `${createdRecords.length} falta(s) registrada(s) com sucesso${skippedDates.length > 0 ? `. ${skippedDates.length} data(s) ignorada(s) (já possuem registro)` : ''}`
      });
      return;
    } catch (error) {
      next(error);
    }
  }
}
