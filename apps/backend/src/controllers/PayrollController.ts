import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { PayrollService, PayrollFilters } from '../services/PayrollService';
import { PayrollStatusService } from '../services/PayrollStatusService';
import { prisma } from '../lib/prisma';

const payrollService = new PayrollService();
const payrollStatusService = new PayrollStatusService();

export class PayrollController {
  /**
   * Gera folha de pagamento mensal
   */
  async generateMonthlyPayroll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { 
        search, 
        company, 
        department, 
        month, 
        year 
      } = req.query;

      // Validar parâmetros obrigatórios
      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      // Validar valores
      if (monthNum < 1 || monthNum > 12) {
        throw createError('Mês deve estar entre 1 e 12', 400);
      }

      if (yearNum < 2020 || yearNum > 2030) {
        throw createError('Ano deve estar entre 2020 e 2030', 400);
      }

      const filters: PayrollFilters = {
        search: search as string,
        company: company as string,
        department: department as string,
        month: monthNum,
        year: yearNum
      };

      const payrollData = await payrollService.generateMonthlyPayroll(filters);

      res.json({
        success: true,
        data: payrollData
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtém dados de um funcionário específico para folha
   */
  async getEmployeePayrollData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params;
      const { month, year } = req.query;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      const employeeData = await payrollService.getEmployeePayrollData(
        employeeId, 
        monthNum, 
        yearNum
      );

      if (!employeeData) {
        throw createError('Funcionário não encontrado', 404);
      }

      res.json({
        success: true,
        data: employeeData
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtém estatísticas de folha por empresa
   */
  async getPayrollStatsByCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      const stats = await payrollService.getPayrollStatsByCompany(monthNum, yearNum);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtém estatísticas de folha por departamento
   */
  async getPayrollStatsByDepartment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      const stats = await payrollService.getPayrollStatsByDepartment(monthNum, yearNum);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtém lista de funcionários para folha (versão simplificada)
   */
  async getEmployeesForPayroll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { 
        search, 
        company, 
        department, 
        position,
        costCenter,
        client,
        modality,
        bank,
        accountType,
        polo,
        month, 
        year,
        page = 1,
        limit = 50,
        forAllocation = false // Parâmetro para indicar se é para relatório de alocação
      } = req.query;

      // Validar parâmetros obrigatórios
      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);
      // Converter forAllocation para boolean de forma segura
      const isForAllocation = typeof forAllocation === 'string' 
        ? (forAllocation === 'true' || forAllocation === '1')
        : Boolean(forAllocation);

      const filters: PayrollFilters = {
        search: search as string,
        company: company as string,
        department: department as string,
        position: position as string,
        costCenter: costCenter as string,
        client: client as string,
        modality: modality as string,
        bank: bank as string,
        accountType: accountType as string,
        polo: polo as string,
        month: monthNum,
        year: yearNum,
        forAllocation: isForAllocation
      };

      const payrollData = await payrollService.generateMonthlyPayroll(filters);

      // Aplicar paginação
      const startIndex = (pageNum - 1) * limitNum;
      const endIndex = startIndex + limitNum;
      const paginatedEmployees = payrollData.employees.slice(startIndex, endIndex);

      res.json({
        success: true,
        data: {
          employees: paginatedEmployees,
          period: payrollData.period,
          totals: payrollData.totals,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total: payrollData.employees.length,
            totalPages: Math.ceil(payrollData.employees.length / limitNum)
          }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Salva valores manuais de INSS
   */
  async saveManualInssValues(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId, month, year, inssRescisao, inss13, descontoPorFaltas, dsrPorFalta, horasExtrasValue, dsrHEValue, alocacaoFinal } = req.body;

      // Validar parâmetros obrigatórios
      if (!employeeId || !month || !year) {
        throw createError('ID do funcionário, mês e ano são obrigatórios', 400);
      }

      // Validar valores numéricos
      if (month < 1 || month > 12) {
        throw createError('Mês deve estar entre 1 e 12', 400);
      }

      if (year < 2020 || year > 2030) {
        throw createError('Ano deve estar entre 2020 e 2030', 400);
      }

      if (inssRescisao < 0 || inss13 < 0) {
        throw createError('Valores de INSS não podem ser negativos', 400);
      }

      const monthNum = parseInt(month);
      const yearNum = parseInt(year);

      // Verificar se a folha está finalizada
      const isFinalized = await payrollStatusService.isPayrollFinalized(monthNum, yearNum);
      if (isFinalized) {
        throw createError('Não é possível alterar valores de uma folha finalizada. Solicite ao setor financeiro que reabra a folha para correções.', 403);
      }

      const result = await payrollService.saveManualInssValues({
        employeeId: employeeId,
        month: monthNum,
        year: yearNum,
        inssRescisao: parseFloat(inssRescisao) || 0,
        inss13: parseFloat(inss13) || 0,
        descontoPorFaltas: descontoPorFaltas !== undefined ? parseFloat(descontoPorFaltas) : null,
        dsrPorFalta: dsrPorFalta !== undefined ? parseFloat(dsrPorFalta) : null,
        horasExtrasValue: horasExtrasValue !== undefined ? parseFloat(horasExtrasValue) : null,
        dsrHEValue: dsrHEValue !== undefined ? parseFloat(dsrHEValue) : null,
        alocacaoFinal: alocacaoFinal !== undefined && alocacaoFinal !== null ? String(alocacaoFinal).trim() : null
      });

      res.json({
        success: true,
        message: 'Valores manuais salvos com sucesso',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Finaliza a folha de pagamento (apenas DP)
   */
  async finalizePayroll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year } = req.body;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month);
      const yearNum = parseInt(year);

      if (monthNum < 1 || monthNum > 12) {
        throw createError('Mês deve estar entre 1 e 12', 400);
      }

      if (yearNum < 2020 || yearNum > 2030) {
        throw createError('Ano deve estar entre 2020 e 2030', 400);
      }

      if (!req.user?.id) {
        throw createError('Usuário não autenticado', 401);
      }

      await payrollStatusService.finalizePayroll(monthNum, yearNum, req.user.id);

      res.json({
        success: true,
        message: 'Folha de pagamento finalizada com sucesso',
        data: {
          month: monthNum,
          year: yearNum,
          finalizedAt: new Date()
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtém o status da folha de pagamento
   */
  async getPayrollStatus(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year } = req.query;

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

      const status = await payrollStatusService.getPayrollStatus(monthNum, yearNum);

      res.json({
        success: true,
        data: status || {
          month: monthNum,
          year: yearNum,
          isFinalized: false
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reabre a folha de pagamento (apenas Financeiro)
   */
  async reopenPayroll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year } = req.body;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month);
      const yearNum = parseInt(year);

      if (monthNum < 1 || monthNum > 12) {
        throw createError('Mês deve estar entre 1 e 12', 400);
      }

      if (yearNum < 2020 || yearNum > 2030) {
        throw createError('Ano deve estar entre 2020 e 2030', 400);
      }

      if (!req.user?.id) {
        throw createError('Usuário não autenticado', 401);
      }

      // Verificar se o usuário é do setor financeiro ou administrador
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { employee: true }
      });

      if (!user) {
        throw createError('Usuário não encontrado', 404);
      }

      const userDepartment = user.employee?.department?.toLowerCase() || '';
      const isFinanceiro = userDepartment.includes('financeiro') || userDepartment.includes('financeiro');
      const isAdministrator = user.employee?.position === 'Administrador';

      if (!isFinanceiro && !isAdministrator) {
        throw createError('Apenas o setor financeiro ou administrador pode reabrir a folha', 403);
      }

      await payrollStatusService.reopenPayroll(monthNum, yearNum);

      res.json({
        success: true,
        message: 'Folha de pagamento reaberta com sucesso. O Departamento Pessoal pode fazer correções.',
        data: {
          month: monthNum,
          year: yearNum,
          reopenedAt: new Date()
        }
      });
    } catch (error) {
      next(error);
    }
  }
}
