import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { BorderService } from '../services/BorderService';
import { PayrollFilters } from '../services/PayrollService';

const borderService = new BorderService();

export class BorderController {
  /**
   * Obter dados do borderô de pagamento
   */
  async getBorderData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year, company, costCenter, department, search } = req.query;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      if (monthNum < 1 || monthNum > 12) {
        throw createError('Mês deve estar entre 1 e 12', 400);
      }

      if (yearNum < 2020 || yearNum > 2030) {
        throw createError('Ano deve estar entre 2020 e 2030', 400);
      }

      const filters: PayrollFilters = {
        month: monthNum,
        year: yearNum,
        company: company as string,
        costCenter: costCenter as string,
        department: department as string,
        search: search as string
      };

      const borderData = await borderService.generateBorderData(filters);

      res.json({
        success: true,
        data: borderData
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Gerar PDF do borderô de pagamento
   */
  async generateBorderPDF(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year, company, costCenter, department, search } = req.query;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      if (monthNum < 1 || monthNum > 12) {
        throw createError('Mês deve estar entre 1 e 12', 400);
      }

      if (yearNum < 2020 || yearNum > 2030) {
        throw createError('Ano deve estar entre 2020 e 2030', 400);
      }

      const filters: PayrollFilters = {
        month: monthNum,
        year: yearNum,
        company: company as string,
        costCenter: costCenter as string,
        department: department as string,
        search: search as string
      };

      const pdfBuffer = await borderService.generateBorderPDF(filters);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="bordero-${monthNum}-${yearNum}.pdf"`);
      res.send(pdfBuffer);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Gerar arquivo CNAB400
   */
  async generateCNAB400(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year, company, costCenter, department, search } = req.query;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      if (monthNum < 1 || monthNum > 12) {
        throw createError('Mês deve estar entre 1 e 12', 400);
      }

      if (yearNum < 2020 || yearNum > 2030) {
        throw createError('Ano deve estar entre 2020 e 2030', 400);
      }

      const filters: PayrollFilters = {
        month: monthNum,
        year: yearNum,
        company: company as string,
        costCenter: costCenter as string,
        department: department as string,
        search: search as string
      };

      const cnabContent = await borderService.generateCNAB400(filters);

      res.setHeader('Content-Type', 'text/plain; charset=ISO-8859-1');
      res.setHeader('Content-Disposition', `attachment; filename="CNAB400-${monthNum.toString().padStart(2, '0')}-${yearNum}.REM"`);
      res.send(cnabContent);
    } catch (error) {
      next(error);
    }
  }
}

