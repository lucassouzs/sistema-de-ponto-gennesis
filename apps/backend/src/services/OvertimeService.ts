import moment from 'moment';
import { prisma } from '../lib/prisma';
import { getCompanySettings } from '../lib/cache';

export interface OvertimeBalance {
  totalHours: number;
  usedHours: number;
  availableHours: number;
  pendingHours: number;
  compensationDeadline?: Date;
  canCompensate: boolean;
}

export interface OvertimeSummary {
  totalEmployees: number;
  totalOvertime: number;
  approvedOvertime: number;
  pendingOvertime: number;
  rejectedOvertime: number;
  totalHours: number;
  totalHoursPending: number;
  averageHoursPerEmployee: number;
  byDepartment: Array<{
    department: string;
    totalEmployees: number;
    totalOvertime: number;
    totalHours: number;
  }>;
  byMonth: Array<{
    month: string;
    totalOvertime: number;
    totalHours: number;
  }>;
  byType: Array<{
    type: string;
    count: number;
    totalHours: number;
  }>;
}

export class OvertimeService {
  /**
   * Calcula o saldo de horas extras de um funcionário
   */
  async getOvertimeBalance(userId: string): Promise<OvertimeBalance> {
    // Buscar configurações da empresa
    const companySettings = await getCompanySettings(prisma);
    const maxOvertimeHours = companySettings?.maxOvertimeHours || 2;

    // Buscar horas extras aprovadas
    const approvedOvertime = await prisma.overtime.findMany({
      where: {
        userId,
        status: 'APPROVED'
      }
    });

    const totalHours = approvedOvertime.reduce((total: any, overtime: any) => total + Number(overtime.hours), 0);

    // Buscar horas extras pendentes
    const pendingOvertime = await prisma.overtime.findMany({
      where: {
        userId,
        status: 'PENDING'
      }
    });

    const pendingHours = pendingOvertime.reduce((total: any, overtime: any) => total + Number(overtime.hours), 0);

    // Calcular horas disponíveis para compensação
    const availableHours = Math.max(0, totalHours - pendingHours);

    // Verificar se pode compensar (dentro do prazo de 6 meses)
    const sixMonthsAgo = moment().subtract(6, 'months').toDate();
    const recentOvertime = approvedOvertime.filter((overtime: any) => 
      new Date(overtime.date) >= sixMonthsAgo
    );

    const canCompensate = recentOvertime.length > 0;
    const compensationDeadline = canCompensate ? 
      moment(recentOvertime[0].date).add(6, 'months').toDate() : 
      undefined;

    return {
      totalHours,
      usedHours: 0, // Implementar lógica de horas já compensadas
      availableHours,
      pendingHours,
      compensationDeadline,
      canCompensate
    };
  }

  /**
   * Calcula o valor das horas extras
   */
  calculateOvertimeValue(
    hours: number,
    type: string,
    baseSalary: number,
    workDaysPerMonth: number = 22
  ): number {
    const hourlyRate = baseSalary / (workDaysPerMonth * 8); // Taxa horária base

    let multiplier = 1;
    switch (type) {
      case 'REGULAR':
        multiplier = 1.5; // 50% adicional
        break;
      case 'WEEKEND':
        multiplier = 2.0; // 100% adicional
        break;
      case 'HOLIDAY':
        multiplier = 2.0; // 100% adicional
        break;
      case 'NIGHT':
        multiplier = 1.5; // 50% adicional + adicional noturno
        break;
    }

    return hours * hourlyRate * multiplier;
  }

  /**
   * Verifica se o funcionário pode solicitar horas extras
   */
  async canRequestOvertime(userId: string, date: Date, hours: number): Promise<{
    canRequest: boolean;
    reason?: string;
    maxHoursAllowed: number;
  }> {
    // Verificar se já existe solicitação para a data
    const existingOvertime = await prisma.overtime.findFirst({
      where: {
        userId,
        date,
        status: { in: ['PENDING', 'APPROVED'] }
      }
    });

    if (existingOvertime) {
      return {
        canRequest: false,
        reason: 'Já existe uma solicitação de horas extras para esta data',
        maxHoursAllowed: 0
      };
    }

    // Verificar limite máximo de horas por dia
    const companySettings = await getCompanySettings(prisma);
    const maxHoursPerDay = companySettings?.maxOvertimeHours || 2;

    if (hours > maxHoursPerDay) {
      return {
        canRequest: false,
        reason: `Máximo de ${maxHoursPerDay} horas extras por dia`,
        maxHoursAllowed: maxHoursPerDay
      };
    }

    // Verificar se é dia útil
    const dayOfWeek = moment(date).day();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

    if (!isWeekday && hours > 0) {
      return {
        canRequest: true,
        maxHoursAllowed: hours
      };
    }

    return {
      canRequest: true,
      maxHoursAllowed: maxHoursPerDay
    };
  }

  /**
   * Gera relatório de horas extras
   */
  async getOvertimeSummary(params: {
    year: number;
    department?: string;
  }): Promise<OvertimeSummary> {
    const { year, department } = params;

    const startYear = new Date(year, 0, 1);
    const endYear = new Date(year, 11, 31);

    const where: any = {
      date: {
        gte: startYear,
        lte: endYear
      }
    };

    if (department) {
      where.employee = {
        department: { contains: department, mode: 'insensitive' }
      };
    }

    // Buscar todas as horas extras do período
    const overtime = await prisma.overtime.findMany({
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
    const totalOvertime = overtime.length;
    const approvedOvertime = overtime.filter((o: any) => o.status === 'APPROVED').length;
    const pendingOvertime = overtime.filter((o: any) => o.status === 'PENDING').length;
    const rejectedOvertime = overtime.filter((o: any) => o.status === 'REJECTED').length;

    const totalHours = overtime
      .filter((o: any) => o.status === 'APPROVED')
      .reduce((total: any, o: any) => total + Number(o.hours), 0);

    const totalHoursPending = overtime
      .filter((o: any) => o.status === 'PENDING')
      .reduce((total: any, o: any) => total + Number(o.hours), 0);

    const averageHoursPerEmployee = totalEmployees > 0 ? totalHours / totalEmployees : 0;

    // Agrupar por departamento
    const byDepartment = new Map<string, {
      department: string;
      totalEmployees: number;
      totalOvertime: number;
      totalHours: number;
    }>();

    overtime.forEach((ot: any) => {
      const dept = ot.employee.department;
      if (!byDepartment.has(dept)) {
        byDepartment.set(dept, {
          department: dept,
          totalEmployees: 0,
          totalOvertime: 0,
          totalHours: 0
        });
      }

      const deptData = byDepartment.get(dept)!;
      deptData.totalOvertime++;
      deptData.totalHours += Number(ot.hours);
    });

    // Contar funcionários por departamento
    const employeesByDept = await prisma.employee.groupBy({
      by: ['department'],
      where: employeeWhere,
      _count: { department: true }
    });

    employeesByDept.forEach((emp: any) => {
      if (byDepartment.has(emp.department)) {
        byDepartment.get(emp.department)!.totalEmployees = emp._count.department;
      }
    });

    // Agrupar por mês
    const byMonth = new Map<string, {
      month: string;
      totalOvertime: number;
      totalHours: number;
    }>();

    overtime.forEach((ot: any) => {
      const month = moment(ot.date).format('YYYY-MM');
      if (!byMonth.has(month)) {
        byMonth.set(month, {
          month,
          totalOvertime: 0,
          totalHours: 0
        });
      }

      const monthData = byMonth.get(month)!;
      monthData.totalOvertime++;
      monthData.totalHours += Number(ot.hours);
    });

    // Agrupar por tipo
    const byType = new Map<string, {
      type: string;
      count: number;
      totalHours: number;
    }>();

    overtime.forEach((ot: any) => {
      if (!byType.has(ot.type)) {
        byType.set(ot.type, {
          type: ot.type,
          count: 0,
          totalHours: 0
        });
      }

      const typeData = byType.get(ot.type)!;
      typeData.count++;
      typeData.totalHours += Number(ot.hours);
    });

    return {
      totalEmployees,
      totalOvertime,
      approvedOvertime,
      pendingOvertime,
      rejectedOvertime,
      totalHours,
      totalHoursPending,
      averageHoursPerEmployee,
      byDepartment: Array.from(byDepartment.values()),
      byMonth: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)),
      byType: Array.from(byType.values())
    };
  }

  /**
   * Calcula horas extras por período
   */
  async calculateOvertimeByPeriod(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalHours: number;
    regularHours: number;
    weekendHours: number;
    holidayHours: number;
    nightHours: number;
    totalValue: number;
  }> {
    const overtime = await prisma.overtime.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate
        },
        status: 'APPROVED'
      }
    });

    let totalHours = 0;
    let regularHours = 0;
    let weekendHours = 0;
    let holidayHours = 0;
    let nightHours = 0;

    overtime.forEach((ot: any) => {
      const hours = Number(ot.hours);
      totalHours += hours;

      switch (ot.type) {
        case 'REGULAR':
          regularHours += hours;
          break;
        case 'WEEKEND':
          weekendHours += hours;
          break;
        case 'HOLIDAY':
          holidayHours += hours;
          break;
        case 'NIGHT':
          nightHours += hours;
          break;
      }
    });

    // Calcular valor total (simplificado)
    const totalValue = totalHours * 50; // Valor fixo por hora

    return {
      totalHours,
      regularHours,
      weekendHours,
      holidayHours,
      nightHours,
      totalValue
    };
  }

  /**
   * Verifica horas extras próximas do vencimento
   */
  async getExpiringOvertime(daysBeforeExpiration: number = 30): Promise<Array<{
    userId: string;
    employeeName: string;
    department: string;
    hours: number;
    date: Date;
    expiresAt: Date;
  }>> {
    const expirationDate = moment().add(daysBeforeExpiration, 'days').toDate();
    const sixMonthsAgo = moment().subtract(6, 'months').toDate();

    const overtime = await prisma.overtime.findMany({
      where: {
        status: 'APPROVED',
        date: {
          gte: sixMonthsAgo,
          lte: expirationDate
        }
      },
      include: {
        user: {
          select: { name: true }
        },
        employee: {
          select: { department: true }
        }
      }
    });

    return overtime.map((ot: any) => ({
      userId: ot.userId,
      employeeName: ot.user.name,
      department: ot.employee.department,
      hours: Number(ot.hours),
      date: ot.date,
      expiresAt: moment(ot.date).add(6, 'months').toDate()
    })).sort((a: any, b: any) => a.expiresAt.getTime() - b.expiresAt.getTime());
  }
}
