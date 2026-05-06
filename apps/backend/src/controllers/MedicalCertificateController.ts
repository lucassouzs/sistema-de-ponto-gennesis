import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { MedicalCertificateService } from '../services/MedicalCertificateService';
import { PhotoService } from '../services/PhotoService';
import path from 'path';
import fs from 'fs';
import AWS from 'aws-sdk';
import { prisma } from '../lib/prisma';

const medicalCertificateService = new MedicalCertificateService();

export class MedicalCertificateController {
  // Enviar atestado médico
  async submitCertificate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { type, startDate, endDate, description, otherType } = req.body;
      const file = req.file; // Arquivo enviado via multer

      // Validar dados obrigatórios
      if (!type || !startDate || !endDate) {
        throw createError('Tipo, data de início e data de fim são obrigatórios', 400);
      }

      // Validar tipo de atestado
      if (!Object.values(['MEDICAL', 'DENTAL', 'PREVENTIVE', 'ACCIDENT', 'COVID', 'MATERNITY', 'PATERNITY', 'OTHER']).includes(type)) {
        throw createError('Tipo de atestado inválido', 400);
      }

      // Validar se tipo "Outros" tem o campo otherType preenchido
      if (type === 'OTHER' && (!otherType || !otherType.trim())) {
        throw createError('Por favor, especifique o tipo de ausência', 400);
      }

      // Validar datas - tratar como data local para evitar problemas de timezone
      let start: Date;
      let end: Date;
      
      // Se a data já vem com horário, usar diretamente, senão adicionar horário do Brasil
      if (startDate.includes('T')) {
        start = new Date(startDate);
      } else {
        // Adicionar horário do Brasil (04:00) para evitar conversão de timezone
        // Isso garante que a data seja interpretada como meia-noite no horário do Brasil
        start = new Date(startDate + 'T04:00:00');
      }
      
      if (endDate.includes('T')) {
        end = new Date(endDate);
      } else {
        // Adicionar horário do Brasil (04:00) para evitar conversão de timezone
        end = new Date(endDate + 'T04:00:00');
      }
      
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

      // Se for tipo "Outros", incluir o tipo personalizado na descrição
      let finalDescription = description;
      if (type === 'OTHER' && otherType && otherType.trim()) {
        finalDescription = otherType.trim() + (description ? ` - ${description}` : '');
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
          description: finalDescription, // Inclui o tipo personalizado se for "Outros"
          fileName,
          fileUrl,
          fileKey,
          status: 'PENDING',
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

      if (status && Object.values(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).includes(status as any)) {
        where.status = status;
      }

      const certificates = await prisma.medicalCertificate.findMany({
        where,
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true, position: true, company: true }
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

      if (status && Object.values(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).includes(status as any)) {
        where.status = status;
      }

      if (userId) {
        where.userId = userId;
      }

      if (type && Object.values(['MEDICAL', 'DENTAL', 'PREVENTIVE', 'ACCIDENT', 'COVID', 'MATERNITY', 'PATERNITY', 'OTHER']).includes(type as any)) {
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
            select: { employeeId: true, department: true, position: true, company: true }
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
            select: { employeeId: true, department: true, position: true, company: true }
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

      if (certificate.status !== 'PENDING') {
        throw createError('Este atestado já foi processado', 400);
      }

      // Aprovar atestado e criar registros de ausência justificada em transação
      const updatedCertificate = await prisma.$transaction(async (tx: any) => {
        // Atualizar status do atestado
        const updatedCert = await tx.medicalCertificate.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedBy,
            approvedAt: new Date()
          }
        });

        // Criar registros de ausência justificada para cada dia do atestado
        // Garantir que as datas sejam tratadas como local (sem conversão de timezone)
        const startDate = new Date(certificate.startDate);
        const endDate = new Date(certificate.endDate);
        
        // Normalizar para meia-noite local
        const startDateLocal = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate(), 0, 0, 0);
        const endDateLocal = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59);
        
        // Iterar por cada dia do período do atestado
        for (let currentDate = new Date(startDateLocal); currentDate <= endDateLocal; currentDate.setDate(currentDate.getDate() + 1)) {
          // Verificar se já existe um registro para este dia
          const dayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 0, 0, 0);
          const dayEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 23, 59, 59);
          
          const existingRecord = await tx.timeRecord.findFirst({
            where: {
              userId: certificate.userId,
              employeeId: certificate.employeeId,
              type: 'ABSENCE_JUSTIFIED',
              timestamp: {
                gte: dayStart,
                lte: dayEnd
              }
            }
          });

          // Se não existe registro para este dia, criar um
          if (!existingRecord) {
            // Se for tipo "Outros", usar a descrição (que contém o tipo personalizado)
            let reasonText = `Ausência justificada por atestado médico - ${certificate.type.toLowerCase()}`;
            if (certificate.type === 'OTHER' && certificate.description) {
              // Extrair o tipo personalizado da descrição (está no início antes do " - ")
              const customType = certificate.description.split(' - ')[0];
              reasonText = `Ausência justificada - ${customType}`;
            }

            await tx.timeRecord.create({
              data: {
                userId: certificate.userId,
                employeeId: certificate.employeeId,
                type: 'ABSENCE_JUSTIFIED',
                timestamp: new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 8, 0, 0), // 8h da manhã
                isValid: true,
                reason: reasonText,
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
            select: { employeeId: true, department: true, position: true, company: true }
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

      if (certificate.status !== 'PENDING') {
        throw createError('Este atestado já foi processado', 400);
      }

      const updatedCertificate = await prisma.medicalCertificate.update({
        where: { id },
        data: {
          status: 'REJECTED',
          reason,
          approvedBy,
          approvedAt: new Date()
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true, position: true, company: true }
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

      if (certificate.status !== 'PENDING') {
        throw createError('Apenas atestados pendentes podem ser cancelados', 400);
      }

      const updatedCertificate = await prisma.medicalCertificate.update({
        where: { id },
        data: {
          status: 'CANCELLED'
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

      // Baixar arquivo do S3 e enviar como stream
      const photoService = new PhotoService();
      
      // Verificar se está usando S3 ou local
      const useLocal = (process.env.STORAGE_PROVIDER || '').toLowerCase() === 'local'
        || !process.env.AWS_ACCESS_KEY_ID
        || !process.env.AWS_SECRET_ACCESS_KEY;

      if (useLocal) {
        // Modo local: enviar arquivo diretamente
        const filePath = path.join(process.cwd(), 'apps', 'backend', certificate.fileKey);
        if (!fs.existsSync(filePath)) {
          throw createError('Arquivo não encontrado', 404);
        }
        
        const ext = path.extname(certificate.fileKey || '').toLowerCase();
        const contentType = {
          '.pdf': 'application/pdf',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }[ext] || 'application/octet-stream';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${certificate.fileName || 'atestado' + ext}"`);
        return res.sendFile(filePath);
      } else {
        // Modo S3: baixar e enviar como stream
        const s3 = new AWS.S3({
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1'
        });
        const bucketName = process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos';
        
        const params = {
          Bucket: bucketName,
          Key: certificate.fileKey
        };
        
        const s3Object = await s3.getObject(params).promise();
        
        const ext = path.extname(certificate.fileName || '').toLowerCase();
        const contentType = {
          '.pdf': 'application/pdf',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.doc': 'application/msword',
          '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        }[ext] || s3Object.ContentType || 'application/octet-stream';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${certificate.fileName || 'atestado' + ext}"`);
        return res.send(s3Object.Body);
      }
    } catch (error) {
      return next(error);
    }
  }
}
