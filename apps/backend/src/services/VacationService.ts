import { PrismaClient, VacationStatus, VacationType } from '@prisma/client';
import moment from 'moment';

const prisma = new PrismaClient();

export interface VacationBalance {
  totalDays: number;
  usedDays: number;
  availableDays: number;
  pendingDays: number;
  nextVacationDate?: Date;
  expiresAt?: Date;
}

export interface VacationSummary {
  totalEmployees: number;
  totalVacations: number;
  approvedVacations: number;
  pendingVacations: number;
  rejectedVacations: number;
  totalDaysUsed: number;
  totalDaysPending: number;
  averageDaysPerEmployee: number;
  byDepartment: Array<{
    department: string;
    totalEmployees: number;
    totalVacations: number;
    totalDays: number;
  }>;
  byMonth: Array<{
    month: string;
    totalVacations: number;
    totalDays: number;
  }>;
}

export class VacationService {
  /**
   * Calcula o saldo de férias de um funcionário
   */
  async getVacationBalance(userId: string): Promise<VacationBalance> {
    // Buscar dados do funcionário
    const employee = await prisma.employee.findUnique({
      where: { userId }
    });

    if (!employee) {
      throw new Error('Funcionário não encontrado');
    }

    // Buscar configurações da empresa
    const companySettings = await prisma.companySettings.findFirst();
    const vacationDaysPerYear = companySettings?.vacationDaysPerYear || 30;

    // Calcular período aquisitivo (12 meses a partir da data de contratação)
    const hireDate = moment(employee.hireDate);
    const currentDate = moment();
    
    // Calcular quantos períodos aquisitivos completos o funcionário tem
    const yearsWorked = currentDate.diff(hireDate, 'years');
    const totalDays = Math.min(yearsWorked * vacationDaysPerYear, vacationDaysPerYear * 2); // Máximo 2 anos

    // Buscar férias aprovadas e usadas
    const usedVacations = await prisma.vacation.findMany({
      where: {
        userId,
        status: VacationStatus.APPROVED,
        type: VacationType.ANNUAL
      }
    });

    const usedDays = usedVacations.reduce((total, vacation) => total + vacation.days, 0);

    // Buscar férias pendentes
    const pendingVacations = await prisma.vacation.findMany({
      where: {
        userId,
        status: VacationStatus.PENDING,
        type: VacationType.ANNUAL
      }
    });

    const pendingDays = pendingVacations.reduce((total, vacation) => total + vacation.days, 0);

    // Calcular próximo período de férias
    const nextVacationDate = this.calculateNextVacationDate(hireDate, currentDate);
    
    // Calcular data de vencimento das férias (período concessivo)
    const expiresAt = this.calculateVacationExpiration(hireDate, currentDate);

    return {
      totalDays,
      usedDays,
      availableDays: Math.max(0, totalDays - usedDays),
      pendingDays,
      nextVacationDate: nextVacationDate.toDate(),
      expiresAt: expiresAt.toDate()
    };
  }

  /**
   * Calcula o número de dias úteis entre duas datas
   */
  calculateVacationDays(startDate: Date, endDate: Date): number {
    const start = moment(startDate);
    const end = moment(endDate);
    let days = 0;

    while (start.isSameOrBefore(end, 'day')) {
      // Contar apenas dias úteis (segunda a sexta)
      if (start.day() >= 1 && start.day() <= 5) {
        days++;
      }
      start.add(1, 'day');
    }

    return days;
  }

  /**
   * Calcula a próxima data em que o funcionário pode tirar férias
   */
  private calculateNextVacationDate(hireDate: moment.Moment, currentDate: moment.Moment): moment.Moment {
    // Primeiro período aquisitivo: 12 meses após a contratação
    const firstPeriodEnd = hireDate.clone().add(12, 'months');
    
    if (currentDate.isBefore(firstPeriodEnd)) {
      return firstPeriodEnd;
    }

    // Períodos subsequentes: a cada 12 meses
    const yearsWorked = currentDate.diff(hireDate, 'years');
    return hireDate.clone().add(yearsWorked + 1, 'years');
  }

  /**
   * Calcula quando as férias vencem (período concessivo)
   */
  private calculateVacationExpiration(hireDate: moment.Moment, currentDate: moment.Moment): moment.Moment {
    // Período concessivo: 12 meses após o período aquisitivo
    const yearsWorked = currentDate.diff(hireDate, 'years');
    const acquisitionPeriodEnd = hireDate.clone().add(yearsWorked, 'years');
    return acquisitionPeriodEnd.clone().add(12, 'months');
  }

  /**
   * Verifica se o funcionário pode tirar férias
   */
  async canTakeVacation(userId: string, startDate: Date, endDate: Date): Promise<{
    canTake: boolean;
    reason?: string;
    availableDays: number;
  }> {
    const balance = await this.getVacationBalance(userId);
    const requestedDays = this.calculateVacationDays(startDate, endDate);

    if (balance.availableDays < requestedDays) {
      return {
        canTake: false,
        reason: `Saldo insuficiente. Disponível: ${balance.availableDays} dias, solicitado: ${requestedDays} dias`,
        availableDays: balance.availableDays
      };
    }

    if (balance.expiresAt && new Date() > balance.expiresAt) {
      return {
        canTake: false,
        reason: 'Período concessivo vencido',
        availableDays: balance.availableDays
      };
    }

    return {
      canTake: true,
      availableDays: balance.availableDays
    };
  }

  /**
   * Gera relatório de férias
   */
  async getVacationSummary(params: {
    year: number;
    department?: string;
  }): Promise<VacationSummary> {
    const { year, department } = params;

    const startYear = new Date(year, 0, 1);
    const endYear = new Date(year, 11, 31);

    const where: any = {
      startDate: {
        gte: startYear,
        lte: endYear
      }
    };

    if (department) {
      where.employee = {
        department: { contains: department, mode: 'insensitive' }
      };
    }

    // Buscar todas as férias do período
    const vacations = await prisma.vacation.findMany({
      where,
      include: {
        employee: {
          select: { department: true }
        }
      }
    });

    // Buscar total de funcionários
    const employeeWhere: any = {};
    if (department) {
      employeeWhere.department = { contains: department, mode: 'insensitive' };
    }

    const totalEmployees = await prisma.employee.count({
      where: employeeWhere
    });

    // Calcular estatísticas
    const totalVacations = vacations.length;
    const approvedVacations = vacations.filter(v => v.status === VacationStatus.APPROVED).length;
    const pendingVacations = vacations.filter(v => v.status === VacationStatus.PENDING).length;
    const rejectedVacations = vacations.filter(v => v.status === VacationStatus.REJECTED).length;

    const totalDaysUsed = vacations
      .filter(v => v.status === VacationStatus.APPROVED)
      .reduce((total, v) => total + v.days, 0);

    const totalDaysPending = vacations
      .filter(v => v.status === VacationStatus.PENDING)
      .reduce((total, v) => total + v.days, 0);

    const averageDaysPerEmployee = totalEmployees > 0 ? totalDaysUsed / totalEmployees : 0;

    // Agrupar por departamento
    const byDepartment = new Map<string, {
      department: string;
      totalEmployees: number;
      totalVacations: number;
      totalDays: number;
    }>();

    vacations.forEach(vacation => {
      const dept = vacation.employee.department;
      if (!byDepartment.has(dept)) {
        byDepartment.set(dept, {
          department: dept,
          totalEmployees: 0,
          totalVacations: 0,
          totalDays: 0
        });
      }

      const deptData = byDepartment.get(dept)!;
      deptData.totalVacations++;
      deptData.totalDays += vacation.days;
    });

    // Contar funcionários por departamento
    const employeesByDept = await prisma.employee.groupBy({
      by: ['department'],
      where: employeeWhere,
      _count: { department: true }
    });

    employeesByDept.forEach(emp => {
      if (byDepartment.has(emp.department)) {
        byDepartment.get(emp.department)!.totalEmployees = emp._count.department;
      }
    });

    // Agrupar por mês
    const byMonth = new Map<string, {
      month: string;
      totalVacations: number;
      totalDays: number;
    }>();

    vacations.forEach(vacation => {
      const month = moment(vacation.startDate).format('YYYY-MM');
      if (!byMonth.has(month)) {
        byMonth.set(month, {
          month,
          totalVacations: 0,
          totalDays: 0
        });
      }

      const monthData = byMonth.get(month)!;
      monthData.totalVacations++;
      monthData.totalDays += vacation.days;
    });

    return {
      totalEmployees,
      totalVacations,
      approvedVacations,
      pendingVacations,
      rejectedVacations,
      totalDaysUsed,
      totalDaysPending,
      averageDaysPerEmployee,
      byDepartment: Array.from(byDepartment.values()),
      byMonth: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month))
    };
  }

  /**
   * Calcula o 1/3 constitucional das férias
   */
  calculateConstitutionalThird(vacationDays: number): number {
    return Math.ceil(vacationDays / 3);
  }

  /**
   * Verifica se as férias estão vencendo
   */
  async getExpiringVacations(daysBeforeExpiration: number = 30): Promise<Array<{
    userId: string;
    employeeName: string;
    department: string;
    expiresAt: Date;
    availableDays: number;
  }>> {
    const expirationDate = moment().add(daysBeforeExpiration, 'days').toDate();

    // Buscar funcionários com férias próximas do vencimento
    const employees = await prisma.employee.findMany({
      include: {
        user: {
          select: { name: true }
        }
      }
    });

    const expiringVacations = [];

    for (const employee of employees) {
      const balance = await this.getVacationBalance(employee.userId);
      
      if (balance.expiresAt && balance.expiresAt <= expirationDate && balance.availableDays > 0) {
        expiringVacations.push({
          userId: employee.userId,
          employeeName: employee.user.name,
          department: employee.department,
          expiresAt: balance.expiresAt,
          availableDays: balance.availableDays
        });
      }
    }

    return expiringVacations.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  }
}
