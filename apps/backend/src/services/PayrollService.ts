import { PrismaClient } from '@prisma/client';
import moment from 'moment';

const prisma = new PrismaClient();

export interface PayrollEmployee {
  id: string;
  name: string;
  position: string;
  department: string;
  employeeId: string;
  company: string | null;
  currentContract: string | null;
  costCenter: string | null;
  client: string | null;
  cpf: string;
  bank: string | null;
  accountType: string | null;
  agency: string | null;
  operation: string | null;
  account: string | null;
  digit: string | null;
  pixKeyType: string | null;
  pixKey: string | null;
  modality: string | null;
  familySalary: number;
  dangerPay: number;
  unhealthyPay: number;
  salary: number;
  dailyFoodVoucher: number;
  dailyTransportVoucher: number;
  totalFoodVoucher: number;
  totalTransportVoucher: number;
  totalAdjustments: number;
  totalDiscounts: number;
  daysWorked: number;
  totalWorkingDays: number;
}

export interface MonthlyPayrollData {
  employees: PayrollEmployee[];
  period: {
    month: number;
    year: number;
    monthName: string;
  };
  totals: {
    totalEmployees: number;
    totalFoodVoucher: number;
    totalTransportVoucher: number;
    totalAdjustments: number;
    totalDiscounts: number;
  };
}

export interface PayrollFilters {
  search?: string;
  company?: string;
  department?: string;
  month: number;
  year: number;
}

export class PayrollService {
  /**
   * Calcula os totais mensais de VA e VT para um funcionário
   */
  private async calculateMonthlyTotals(employeeId: string, month: number, year: number, hireDate?: Date) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const timeRecords = await prisma.timeRecord.findMany({
      where: {
        employeeId,
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        type: 'ENTRY' // Apenas entradas para contar dias trabalhados
      }
    });
    
    const totalVA = timeRecords.reduce((sum, record) => 
      sum + (record.foodVoucherAmount || 0), 0
    );
    
    const totalVT = timeRecords.reduce((sum, record) => 
      sum + (record.transportVoucherAmount || 0), 0
    );
    
    // Calcular dias trabalhados e faltas de forma mais inteligente
    const { daysWorked, totalWorkingDays } = this.calculateWorkingDays(
      timeRecords.length, 
      month, 
      year, 
      hireDate
    );
    
    return { 
      totalVA, 
      totalVT, 
      daysWorked,
      totalWorkingDays
    };
  }

  /**
   * Calcula dias trabalhados e faltas de forma inteligente
   */
  private calculateWorkingDays(daysWorked: number, month: number, year: number, hireDate?: Date) {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    
    // Se for o mês atual, só contar até hoje
    const endDay = (month === currentMonth && year === currentYear) 
      ? today.getDate() 
      : new Date(year, month, 0).getDate();
    
    // Data de início: data de admissão ou início do mês
    const startDay = hireDate && hireDate.getMonth() + 1 === month && hireDate.getFullYear() === year
      ? hireDate.getDate()
      : 1;
    
    let totalWorkingDays = 0;
    
    // Contar apenas dias úteis (segunda a sexta) no período
    for (let day = startDay; day <= endDay; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
      
      // Contar apenas dias úteis (1-5 = segunda a sexta)
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        totalWorkingDays++;
      }
    }
    
    return {
      daysWorked,
      totalWorkingDays
    };
  }

  /**
   * Calcula o total de acréscimos salariais para um funcionário no período
   */
  private async calculateMonthlyAdjustments(employeeId: string, month: number, year: number): Promise<number> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const adjustments = await prisma.salaryAdjustment.findMany({
      where: {
        employeeId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });
    
    return adjustments.reduce((sum, adjustment) => 
      sum + Number(adjustment.amount), 0
    );
  }

  /**
   * Calcula o total de descontos salariais para um funcionário no período
   */
  private async calculateMonthlyDiscounts(employeeId: string, month: number, year: number): Promise<number> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const discounts = await prisma.salaryDiscount.findMany({
      where: {
        employeeId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });
    
    return discounts.reduce((sum, discount) => 
      sum + Number(discount.amount), 0
    );
  }

  /**
   * Verifica se o funcionário estava ativo no período selecionado
   */
  private async isEmployeeActiveInPeriod(employeeId: string, month: number, year: number): Promise<boolean> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { hireDate: true }
    });

    if (!employee) return false;

    // Funcionário deve ter sido admitido antes ou durante o período
    return employee.hireDate <= endDate;
  }

  /**
   * Gera folha de pagamento mensal
   */
  async generateMonthlyPayroll(filters: PayrollFilters): Promise<MonthlyPayrollData> {
    const { search, company, department, month, year } = filters;

    // Validar período
    const currentDate = new Date();
    const selectedDate = new Date(year, month - 1, 1);
    
    if (selectedDate > currentDate) {
      throw new Error('Não é possível gerar folha para períodos futuros');
    }

    // Construir filtros de busca
    const where: any = {
      user: {
        isActive: true
      }
    };

    if (search) {
      where.user = {
        ...where.user,
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { cpf: { contains: search, mode: 'insensitive' } }
        ]
      };
    }

    if (company) {
      where.company = { contains: company, mode: 'insensitive' };
    }

    if (department) {
      where.department = { contains: department, mode: 'insensitive' };
    }

    // Buscar funcionários
    const employees = await prisma.employee.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            cpf: true
          }
        }
      },
      orderBy: {
        user: {
          name: 'asc'
        }
      }
    });

    // Calcular totais para cada funcionário e filtrar apenas os ativos no período
    const employeesWithTotals = await Promise.all(
      employees.map(async (employee) => {
        // Verificar se o funcionário estava ativo no período
        const isActiveInPeriod = await this.isEmployeeActiveInPeriod(employee.id, month, year);
        
        if (!isActiveInPeriod) {
          return null; // Funcionário não estava ativo no período
        }

        const totals = await this.calculateMonthlyTotals(employee.id, month, year, employee.hireDate);
        const totalAdjustments = await this.calculateMonthlyAdjustments(employee.id, month, year);
        const totalDiscounts = await this.calculateMonthlyDiscounts(employee.id, month, year);
        
        return {
          id: employee.id,
          name: employee.user.name,
          position: employee.position,
          department: employee.department,
          employeeId: employee.employeeId,
          company: employee.company,
          currentContract: employee.currentContract,
          costCenter: employee.costCenter,
          client: employee.client,
          cpf: employee.user.cpf,
          bank: employee.bank,
          accountType: employee.accountType,
          agency: employee.agency,
          operation: employee.operation,
          account: employee.account,
          digit: employee.digit,
          pixKeyType: employee.pixKeyType,
          pixKey: employee.pixKey,
          modality: employee.modality,
          familySalary: Number(employee.familySalary || 0),
          dangerPay: Number(employee.dangerPay || 0),
          unhealthyPay: Number(employee.unhealthyPay || 0),
          salary: Number(employee.salary),
          dailyFoodVoucher: employee.dailyFoodVoucher || 0,
          dailyTransportVoucher: employee.dailyTransportVoucher || 0,
          totalFoodVoucher: totals.totalVA,
          totalTransportVoucher: totals.totalVT,
          totalAdjustments,
          totalDiscounts,
          daysWorked: totals.daysWorked,
          totalWorkingDays: totals.totalWorkingDays
        } as PayrollEmployee;
      })
    );

    // Filtrar funcionários nulos (que não estavam ativos no período)
    const activeEmployees = employeesWithTotals.filter(emp => emp !== null) as PayrollEmployee[];

    // Calcular totais gerais apenas dos funcionários ativos
    const totalFoodVoucher = activeEmployees.reduce(
      (sum, emp) => sum + emp.totalFoodVoucher, 0
    );
    
    const totalTransportVoucher = activeEmployees.reduce(
      (sum, emp) => sum + emp.totalTransportVoucher, 0
    );

    const totalAdjustments = activeEmployees.reduce(
      (sum, emp) => sum + emp.totalAdjustments, 0
    );

    const totalDiscounts = activeEmployees.reduce(
      (sum, emp) => sum + emp.totalDiscounts, 0
    );

    // Nome do mês em português
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    return {
      employees: activeEmployees,
      period: {
        month,
        year,
        monthName: monthNames[month - 1]
      },
      totals: {
        totalEmployees: activeEmployees.length,
        totalFoodVoucher,
        totalTransportVoucher,
        totalAdjustments,
        totalDiscounts
      }
    };
  }

  /**
   * Obtém dados de um funcionário específico para folha
   */
  async getEmployeePayrollData(employeeId: string, month: number, year: number): Promise<PayrollEmployee | null> {
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
      return null;
    }

    const totals = await this.calculateMonthlyTotals(employee.id, month, year, employee.hireDate);
    const totalAdjustments = await this.calculateMonthlyAdjustments(employee.id, month, year);
    const totalDiscounts = await this.calculateMonthlyDiscounts(employee.id, month, year);

    return {
      id: employee.id,
      name: employee.user.name,
      position: employee.position,
      department: employee.department,
      employeeId: employee.employeeId,
      company: employee.company,
      currentContract: employee.currentContract,
      costCenter: employee.costCenter,
      client: employee.client,
      cpf: employee.user.cpf,
      bank: employee.bank,
      accountType: employee.accountType,
      agency: employee.agency,
      operation: employee.operation,
      account: employee.account,
      digit: employee.digit,
      pixKeyType: employee.pixKeyType,
      pixKey: employee.pixKey,
      modality: employee.modality,
      familySalary: Number(employee.familySalary || 0),
      dangerPay: Number(employee.dangerPay || 0),
      unhealthyPay: Number(employee.unhealthyPay || 0),
      salary: Number(employee.salary),
      dailyFoodVoucher: employee.dailyFoodVoucher || 0,
      dailyTransportVoucher: employee.dailyTransportVoucher || 0,
      totalFoodVoucher: totals.totalVA,
      totalTransportVoucher: totals.totalVT,
      totalAdjustments,
      totalDiscounts,
      daysWorked: totals.daysWorked,
      totalWorkingDays: totals.totalWorkingDays
    };
  }

  /**
   * Obtém estatísticas de folha por empresa
   */
  async getPayrollStatsByCompany(month: number, year: number) {
    const payrollData = await this.generateMonthlyPayroll({ month, year });
    
    const statsByCompany = payrollData.employees.reduce((acc, employee) => {
      const company = employee.company || 'Não informado';
      
      if (!acc[company]) {
        acc[company] = {
          company,
          totalEmployees: 0,
          totalFoodVoucher: 0,
          totalTransportVoucher: 0
        };
      }
      
      acc[company].totalEmployees++;
      acc[company].totalFoodVoucher += employee.totalFoodVoucher;
      acc[company].totalTransportVoucher += employee.totalTransportVoucher;
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(statsByCompany);
  }

  /**
   * Obtém estatísticas de folha por departamento
   */
  async getPayrollStatsByDepartment(month: number, year: number) {
    const payrollData = await this.generateMonthlyPayroll({ month, year });
    
    const statsByDepartment = payrollData.employees.reduce((acc, employee) => {
      const department = employee.department;
      
      if (!acc[department]) {
        acc[department] = {
          department,
          totalEmployees: 0,
          totalFoodVoucher: 0,
          totalTransportVoucher: 0
        };
      }
      
      acc[department].totalEmployees++;
      acc[department].totalFoodVoucher += employee.totalFoodVoucher;
      acc[department].totalTransportVoucher += employee.totalTransportVoucher;
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(statsByDepartment);
  }
}
