import { Request, Response, NextFunction } from 'express';
import { PrismaClient, MedicalCertificateType, MedicalCertificateStatus, TimeRecordType } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { MedicalCertificateService } from '../services/MedicalCertificateService';
import { PhotoService } from '../services/PhotoService';

const prisma = new PrismaClient();
const medicalCertificateService = new MedicalCertificateService();

export class MedicalCertificateController {
  // Enviar atestado médico
  async submitCertificate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { type, startDate, endDate, description } = req.body;
      const file = req.file; // Arquivo enviado via multer

      // Validar dados obrigatórios
      if (!type || !startDate || !endDate) {
        throw createError('Tipo, data de início e data de fim são obrigatórios', 400);
      }

      // Validar tipo de atestado
      if (!Object.values(MedicalCertificateType).includes(type)) {
        throw createError('Tipo de atestado inválido', 400);
      }

      // Validar datas
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (start > end) {
        throw createError('Data de início não pode ser posterior à data de fim', 400);
      }

      // Calcular dias
      const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

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

      // Upload do arquivo se fornecido
      let fileUrl = null;
      let fileKey = null;
      let fileName = null;

      if (file) {
        const photoService = new PhotoService();
        const uploadResult = await photoService.uploadPhoto(file, userId);
        fileUrl = uploadResult.url;
        fileKey = uploadResult.key;
        fileName = file.originalname;
      }

      // Criar atestado
      const certificate = await prisma.medicalCertificate.create({
        data: {
          userId,
          employeeId: employee.id,
          type,
          startDate: start,
          endDate: end,
          days,
          description,
          fileName,
          fileUrl,
          fileKey,
          status: MedicalCertificateStatus.PENDING,
          submittedAt: new Date()
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
        data: certificate,
        message: 'Atestado enviado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  // Listar atestados do usuário
  async getUserCertificates(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { status, page = 1, limit = 10 } = req.query;

      const where: any = { userId };

      if (status && Object.values(MedicalCertificateStatus).includes(status as MedicalCertificateStatus)) {
        where.status = status;
      }

      const certificates = await prisma.medicalCertificate.findMany({
        where,
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true, position: true }
          },
          approver: {
            select: { name: true, email: true }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      });

      const total = await prisma.medicalCertificate.count({ where });

      return res.json({
        success: true,
        data: {
          certificates,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      return next(error);
    }
  }

  // Listar todos os atestados (RH/Admin)
  async getAllCertificates(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { status, userId, type, page = 1, limit = 10, search } = req.query;

      const where: any = {};

      if (status && Object.values(MedicalCertificateStatus).includes(status as MedicalCertificateStatus)) {
        where.status = status;
      }

      if (userId) {
        where.userId = userId;
      }

      if (type && Object.values(MedicalCertificateType).includes(type as MedicalCertificateType)) {
        where.type = type;
      }

      if (search) {
        where.OR = [
          {
            user: {
              name: {
                contains: search as string,
                mode: 'insensitive'
              }
            }
          },
          {
            user: {
              email: {
                contains: search as string,
                mode: 'insensitive'
              }
            }
          }
        ];
      }

      const certificates = await prisma.medicalCertificate.findMany({
        where,
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true, position: true }
          },
          approver: {
            select: { name: true, email: true }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit)
      });

      const total = await prisma.medicalCertificate.count({ where });

      return res.json({
        success: true,
        data: {
          certificates,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            pages: Math.ceil(total / Number(limit))
          }
        }
      });
    } catch (error) {
      return next(error);
    }
  }

  // Ver detalhes de um atestado
  async getCertificateById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const certificate = await prisma.medicalCertificate.findUnique({
        where: { id },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true, position: true }
          },
          approver: {
            select: { name: true, email: true }
          }
        }
      });

      if (!certificate) {
        throw createError('Atestado não encontrado', 404);
      }

      // Verificar se o usuário pode acessar este atestado
      if (userRole === 'EMPLOYEE' && certificate.userId !== userId) {
        throw createError('Acesso negado', 403);
      }

      return res.json({
        success: true,
        data: certificate
      });
    } catch (error) {
      return next(error);
    }
  }

  // Aprovar atestado (RH/Admin)
  async approveCertificate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const approvedBy = req.user!.id;

      const certificate = await prisma.medicalCertificate.findUnique({
        where: { id }
      });

      if (!certificate) {
        throw createError('Atestado não encontrado', 404);
      }

      if (certificate.status !== MedicalCertificateStatus.PENDING) {
        throw createError('Este atestado já foi processado', 400);
      }

      // Aprovar atestado e criar registros de ausência justificada em transação
      const updatedCertificate = await prisma.$transaction(async (tx) => {
        // Atualizar status do atestado
        const updatedCert = await tx.medicalCertificate.update({
          where: { id },
          data: {
            status: MedicalCertificateStatus.APPROVED,
            approvedBy,
            approvedAt: new Date()
          }
        });

        // Criar registros de ausência justificada para cada dia do atestado
        const startDate = new Date(certificate.startDate);
        const endDate = new Date(certificate.endDate);
        
        // Iterar por cada dia do período do atestado
        for (let currentDate = new Date(startDate); currentDate <= endDate; currentDate.setDate(currentDate.getDate() + 1)) {
          // Verificar se já existe um registro para este dia
          const dayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 0, 0, 0);
          const dayEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59);
          
          const existingRecord = await tx.timeRecord.findFirst({
            where: {
              userId: certificate.userId,
              employeeId: certificate.employeeId,
              type: TimeRecordType.ABSENCE_JUSTIFIED,
              timestamp: {
                gte: dayStart,
                lte: dayEnd
              }
            }
          });

          // Se não existe registro para este dia, criar um
          if (!existingRecord) {
            await tx.timeRecord.create({
              data: {
                userId: certificate.userId,
                employeeId: certificate.employeeId,
                type: TimeRecordType.ABSENCE_JUSTIFIED,
                timestamp: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 8, 0, 0), // 8h da manhã
                isValid: true,
                reason: `Ausência justificada por atestado médico - ${certificate.type.toLowerCase()}`,
                approvedBy: approvedBy,
                approvedAt: new Date()
              }
            });
          }
        }

        return updatedCert;
      });

      // Buscar o atestado atualizado com as informações completas
      const updatedCertificateWithDetails = await prisma.medicalCertificate.findUnique({
        where: { id },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true, position: true }
          },
          approver: {
            select: { name: true, email: true }
          }
        }
      });

      return res.json({
        success: true,
        data: updatedCertificateWithDetails,
        message: 'Atestado aprovado com sucesso e registros de ausência justificada criados'
      });
    } catch (error) {
      return next(error);
    }
  }

  // Rejeitar atestado (RH/Admin)
  async rejectCertificate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const approvedBy = req.user!.id;

      if (!reason) {
        throw createError('Motivo da rejeição é obrigatório', 400);
      }

      const certificate = await prisma.medicalCertificate.findUnique({
        where: { id }
      });

      if (!certificate) {
        throw createError('Atestado não encontrado', 404);
      }

      if (certificate.status !== MedicalCertificateStatus.PENDING) {
        throw createError('Este atestado já foi processado', 400);
      }

      const updatedCertificate = await prisma.medicalCertificate.update({
        where: { id },
        data: {
          status: MedicalCertificateStatus.REJECTED,
          reason,
          approvedBy,
          approvedAt: new Date()
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true, position: true }
          },
          approver: {
            select: { name: true, email: true }
          }
        }
      });

      return res.json({
        success: true,
        data: updatedCertificate,
        message: 'Atestado rejeitado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  // Cancelar atestado (Funcionário)
  async cancelCertificate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const certificate = await prisma.medicalCertificate.findUnique({
        where: { id }
      });

      if (!certificate) {
        throw createError('Atestado não encontrado', 404);
      }

      if (certificate.userId !== userId) {
        throw createError('Acesso negado', 403);
      }

      if (certificate.status !== MedicalCertificateStatus.PENDING) {
        throw createError('Apenas atestados pendentes podem ser cancelados', 400);
      }

      const updatedCertificate = await prisma.medicalCertificate.update({
        where: { id },
        data: {
          status: MedicalCertificateStatus.CANCELLED
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

      return res.json({
        success: true,
        data: updatedCertificate,
        message: 'Atestado cancelado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  // Download do arquivo do atestado
  async downloadFile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const userRole = req.user!.role;

      const certificate = await prisma.medicalCertificate.findUnique({
        where: { id }
      });

      if (!certificate) {
        throw createError('Atestado não encontrado', 404);
      }

      // Verificar se o usuário pode acessar este atestado
      if (userRole === 'EMPLOYEE' && certificate.userId !== userId) {
        throw createError('Acesso negado', 403);
      }

      if (!certificate.fileKey) {
        throw createError('Arquivo não encontrado', 404);
      }

      // Redirecionar para o arquivo no S3
      const photoService = new PhotoService();
      const fileUrl = await photoService.getSignedUrl(certificate.fileKey);
      
      return res.redirect(fileUrl);
    } catch (error) {
      return next(error);
    }
  }
}
