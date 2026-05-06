import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { ReportService } from '../services/ReportService';
import { prisma } from '../lib/prisma';

const reportService = new ReportService();

export class ReportController {
  async getAllReports(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, type, status, startDate, endDate } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      if (type) where.type = type;
      if (status) where.status = status;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = new Date(startDate as string);
        if (endDate) where.createdAt.lte = new Date(endDate as string);
      }

      const [reports, total] = await Promise.all([
        prisma.report.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { name: true, email: true }
            }
          }
        }),
        prisma.report.count({ where })
      ]);

      res.json({
        success: true,
        data: reports,
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

  async getReportById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const report = await prisma.report.findUnique({
        where: { id },
        include: {
          user: {
            select: { name: true, email: true }
          }
        }
      });

      if (!report) {
        throw createError('Relatório não encontrado', 404);
      }

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }

  async generateReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { type, title, description, period, filters } = req.body;

      if (!type || !title || !period) {
        throw createError('Tipo, título e período são obrigatórios', 400);
      }

      // Gerar relatório baseado no tipo
      let reportData;
      switch (type) {
        case 'ATTENDANCE':
          reportData = await reportService.generateAttendanceReport(period, filters);
          break;
        case 'OVERTIME':
          reportData = await reportService.generateOvertimeReport(period, filters);
          break;
        case 'VACATION':
          reportData = await reportService.generateVacationReport(period, filters);
          break;
        case 'PRODUCTIVITY':
          reportData = await reportService.generateProductivityReport(period, filters);
          break;
        default:
          throw createError('Tipo de relatório não suportado', 400);
      }

      // Salvar relatório no banco
      const report = await prisma.report.create({
        data: {
          userId,
          type,
          title,
          description: description || null,
          data: JSON.parse(JSON.stringify(reportData)),
          period,
          status: 'GENERATED'
        },
        include: {
          user: {
            select: { name: true, email: true }
          }
        }
      });

      res.status(201).json({
        success: true,
        data: report,
        message: 'Relatório gerado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async downloadReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { format = 'json' } = req.query;

      const report = await prisma.report.findUnique({
        where: { id }
      });

      if (!report) {
        throw createError('Relatório não encontrado', 404);
      }

      // Gerar arquivo baseado no formato
      let fileContent;
      let contentType;
      let fileName;

      switch (format) {
        case 'json':
          fileContent = JSON.stringify(report.data, null, 2);
          contentType = 'application/json';
          fileName = `${report.title}.json`;
          break;
        case 'csv':
          fileContent = reportService.convertToCSV(report.data);
          contentType = 'text/csv';
          fileName = `${report.title}.csv`;
          break;
        case 'pdf':
          // Implementar geração de PDF
          throw createError('Formato PDF não implementado ainda', 400);
        default:
          throw createError('Formato não suportado', 400);
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(fileContent);
    } catch (error) {
      next(error);
    }
  }

  async getAttendanceSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, department } = req.query;

      if (!startDate || !endDate) {
        throw createError('Data inicial e final são obrigatórias', 400);
      }

      const period = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string)
      };

      const summary = await reportService.generateAttendanceSummary(period, {
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

  async getProductivityAnalysis(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, department } = req.query;

      if (!startDate || !endDate) {
        throw createError('Data inicial e final são obrigatórias', 400);
      }

      const period = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string)
      };

      const analysis = await reportService.generateProductivityAnalysis(period, {
        department: department as string
      });

      res.json({
        success: true,
        data: analysis
      });
    } catch (error) {
      next(error);
    }
  }

  async getOvertimeSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, department } = req.query;

      if (!startDate || !endDate) {
        throw createError('Data inicial e final são obrigatórias', 400);
      }

      const period = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string)
      };

      const summary = await reportService.generateOvertimeSummary(period, {
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

  async getVacationSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year = new Date().getFullYear(), department } = req.query;

      const period = {
        startDate: new Date(Number(year), 0, 1),
        endDate: new Date(Number(year), 11, 31)
      };

      const summary = await reportService.generateVacationSummary(period, {
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
