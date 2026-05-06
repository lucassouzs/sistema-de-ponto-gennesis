import moment from 'moment';
import { prisma } from '../lib/prisma';
import { getCompanySettings } from '../lib/cache';

export interface ReportPeriod {
  startDate: Date;
  endDate: Date;
}

export interface ReportFilters {
  department?: string;
  userId?: string;
  employeeId?: string;
}

export class ReportService {
  /**
   * Gera relatório de frequência
   */
  async generateAttendanceReport(period: ReportPeriod, filters: ReportFilters = {}) {
    const where: any = {
      timestamp: {
        gte: period.startDate,
        lte: period.endDate
      },
      isValid: true
    };

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.department) {
      where.employee = {
        department: { contains: filters.department, mode: 'insensitive' }
      };
    }

    const records = await prisma.timeRecord.findMany({
      where,
      include: {
        user: {
          select: { name: true, email: true }
        },
        employee: {
          select: { employeeId: true, department: true, position: true }
        }
      },
      orderBy: { timestamp: 'asc' }
    });

    // Agrupar por funcionário
    const employeeMap = new Map<string, any>();

    records.forEach((record: any) => {
      const empId = record.employeeId;
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, {
          employeeId: record.employee.employeeId,
          employeeName: record.user.name,
          department: record.employee.department,
          position: record.employee.position,
          records: [],
          totalDays: 0,
          presentDays: 0,
          absentDays: 0,
          lateArrivals: 0,
          earlyDepartures: 0,
          totalHours: 0
        });
      }

      employeeMap.get(empId)!.records.push(record);
    });

    // Calcular métricas para cada funcionário
    const report = await Promise.all(Array.from(employeeMap.values()).map(async emp => {
      const days = this.calculateWorkingDays(period.startDate, period.endDate);
      const presentDays = this.calculatePresentDays(emp.records);
      const absentDays = days - presentDays;
      const lateArrivals = await this.calculateLateArrivals(emp.records);
      const earlyDepartures = this.calculateEarlyDepartures(emp.records);
      const totalHours = this.calculateTotalHours(emp.records);

      return {
        ...emp,
        totalDays: days,
        presentDays,
        absentDays,
        lateArrivals,
        earlyDepartures,
        totalHours,
        attendanceRate: days > 0 ? (presentDays / days) * 100 : 0
      };
    }));

    return {
      period,
      filters,
      totalEmployees: report.length,
      summary: {
        totalDays: report.reduce((sum, emp) => sum + emp.totalDays, 0),
        totalPresentDays: report.reduce((sum, emp) => sum + emp.presentDays, 0),
        totalAbsentDays: report.reduce((sum, emp) => sum + emp.absentDays, 0),
        totalLateArrivals: report.reduce((sum, emp) => sum + emp.lateArrivals, 0),
        totalEarlyDepartures: report.reduce((sum, emp) => sum + emp.earlyDepartures, 0),
        totalHours: report.reduce((sum, emp) => sum + emp.totalHours, 0),
        averageAttendanceRate: report.length > 0 ? 
          report.reduce((sum, emp) => sum + emp.attendanceRate, 0) / report.length : 0
      },
      employees: report
    };
  }

  /**
   * Gera relatório de horas extras
   */
  async generateOvertimeReport(period: ReportPeriod, filters: ReportFilters = {}) {
    const where: any = {
      date: {
        gte: period.startDate,
        lte: period.endDate
      },
      status: 'APPROVED'
    };

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.department) {
      where.employee = {
        department: { contains: filters.department, mode: 'insensitive' }
      };
    }

    const overtime = await prisma.overtime.findMany({
      where,
      include: {
        user: {
          select: { name: true, email: true }
        },
        employee: {
          select: { employeeId: true, department: true, position: true }
        }
      },
      orderBy: { date: 'asc' }
    });

    // Agrupar por funcionário
    const employeeMap = new Map<string, any>();

    overtime.forEach((ot: any) => {
      const empId = ot.employeeId;
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, {
          employeeId: ot.employee.employeeId,
          employeeName: ot.user.name,
          department: ot.employee.department,
          position: ot.employee.position,
          overtime: [],
          totalHours: 0,
          regularHours: 0,
          weekendHours: 0,
          holidayHours: 0,
          nightHours: 0
        });
      }

      const emp = employeeMap.get(empId)!;
      emp.overtime.push(ot);
      emp.totalHours += Number(ot.hours);

      switch (ot.type) {
        case 'REGULAR':
          emp.regularHours += Number(ot.hours);
          break;
        case 'WEEKEND':
          emp.weekendHours += Number(ot.hours);
          break;
        case 'HOLIDAY':
          emp.holidayHours += Number(ot.hours);
          break;
        case 'NIGHT':
          emp.nightHours += Number(ot.hours);
          break;
      }
    });

    const report = Array.from(employeeMap.values());

    return {
      period,
      filters,
      totalEmployees: report.length,
      summary: {
        totalOvertime: overtime.length,
        totalHours: report.reduce((sum, emp) => sum + emp.totalHours, 0),
        totalRegularHours: report.reduce((sum, emp) => sum + emp.regularHours, 0),
        totalWeekendHours: report.reduce((sum, emp) => sum + emp.weekendHours, 0),
        totalHolidayHours: report.reduce((sum, emp) => sum + emp.holidayHours, 0),
        totalNightHours: report.reduce((sum, emp) => sum + emp.nightHours, 0),
        averageHoursPerEmployee: report.length > 0 ? 
          report.reduce((sum, emp) => sum + emp.totalHours, 0) / report.length : 0
      },
      employees: report
    };
  }

  /**
   * Gera relatório de férias
   */
  async generateVacationReport(period: ReportPeriod, filters: ReportFilters = {}) {
    const where: any = {
      startDate: {
        gte: period.startDate,
        lte: period.endDate
      }
    };

    if (filters.userId) {
      where.userId = filters.userId;
    }

    if (filters.department) {
      where.employee = {
        department: { contains: filters.department, mode: 'insensitive' }
      };
    }

    const vacations = await prisma.vacation.findMany({
      where,
      include: {
        user: {
          select: { name: true, email: true }
        },
        employee: {
          select: { employeeId: true, department: true, position: true }
        }
      },
      orderBy: { startDate: 'asc' }
    });

    // Agrupar por funcionário
    const employeeMap = new Map<string, any>();

    vacations.forEach((vacation: any) => {
      const empId = vacation.employeeId;
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, {
          employeeId: vacation.employee.employeeId,
          employeeName: vacation.user.name,
          department: vacation.employee.department,
          position: vacation.employee.position,
          vacations: [],
          totalDays: 0,
          approvedDays: 0,
          pendingDays: 0,
          rejectedDays: 0
        });
      }

      const emp = employeeMap.get(empId)!;
      emp.vacations.push(vacation);
      emp.totalDays += vacation.days;

      switch (vacation.status) {
        case 'APPROVED':
          emp.approvedDays += vacation.days;
          break;
        case 'PENDING':
          emp.pendingDays += vacation.days;
          break;
        case 'REJECTED':
          emp.rejectedDays += vacation.days;
          break;
      }
    });

    const report = Array.from(employeeMap.values());

    return {
      period,
      filters,
      totalEmployees: report.length,
      summary: {
        totalVacations: vacations.length,
        totalDays: report.reduce((sum, emp) => sum + emp.totalDays, 0),
        approvedDays: report.reduce((sum, emp) => sum + emp.approvedDays, 0),
        pendingDays: report.reduce((sum, emp) => sum + emp.pendingDays, 0),
        rejectedDays: report.reduce((sum, emp) => sum + emp.rejectedDays, 0),
        averageDaysPerEmployee: report.length > 0 ? 
          report.reduce((sum, emp) => sum + emp.totalDays, 0) / report.length : 0
      },
      employees: report
    };
  }

  /**
   * Gera relatório de produtividade
   */
  async generateProductivityReport(period: ReportPeriod, filters: ReportFilters = {}) {
    // Implementação simplificada - em produção, integrar com métricas de produtividade
    const attendanceReport = await this.generateAttendanceReport(period, filters);
    const overtimeReport = await this.generateOvertimeReport(period, filters);

    const productivity = attendanceReport.employees.map(emp => {
      const overtime = overtimeReport.employees.find(ot => ot.employeeId === emp.employeeId);
      
      return {
        ...emp,
        overtimeHours: overtime ? overtime.totalHours : 0,
        productivityScore: this.calculateProductivityScore(emp, overtime),
        efficiency: this.calculateEfficiency(emp),
        punctuality: this.calculatePunctuality(emp)
      };
    });

    return {
      period,
      filters,
      totalEmployees: productivity.length,
      summary: {
        averageProductivityScore: productivity.length > 0 ? 
          productivity.reduce((sum, emp) => sum + emp.productivityScore, 0) / productivity.length : 0,
        averageEfficiency: productivity.length > 0 ? 
          productivity.reduce((sum, emp) => sum + emp.efficiency, 0) / productivity.length : 0,
        averagePunctuality: productivity.length > 0 ? 
          productivity.reduce((sum, emp) => sum + emp.punctuality, 0) / productivity.length : 0
      },
      employees: productivity
    };
  }

  /**
   * Gera resumo de frequência
   */
  async generateAttendanceSummary(period: ReportPeriod, filters: ReportFilters = {}) {
    const report = await this.generateAttendanceReport(period, filters);
    
    return {
      period,
      filters,
      summary: report.summary,
      topPerformers: report.employees
        .sort((a, b) => b.attendanceRate - a.attendanceRate)
        .slice(0, 10),
      needsAttention: report.employees
        .filter(emp => emp.attendanceRate < 80)
        .sort((a, b) => a.attendanceRate - b.attendanceRate)
    };
  }

  /**
   * Gera análise de produtividade
   */
  async generateProductivityAnalysis(period: ReportPeriod, filters: ReportFilters = {}) {
    const report = await this.generateProductivityReport(period, filters);
    
    return {
      period,
      filters,
      summary: report.summary,
      topPerformers: report.employees
        .sort((a, b) => b.productivityScore - a.productivityScore)
        .slice(0, 10),
      needsAttention: report.employees
        .filter(emp => emp.productivityScore < 70)
        .sort((a, b) => a.productivityScore - b.productivityScore)
    };
  }

  /**
   * Gera resumo de horas extras
   */
  async generateOvertimeSummary(period: ReportPeriod, filters: ReportFilters = {}) {
    const report = await this.generateOvertimeReport(period, filters);
    
    return {
      period,
      filters,
      summary: report.summary,
      topOvertime: report.employees
        .sort((a, b) => b.totalHours - a.totalHours)
        .slice(0, 10)
    };
  }

  /**
   * Gera resumo de férias
   */
  async generateVacationSummary(period: ReportPeriod, filters: ReportFilters = {}) {
    const report = await this.generateVacationReport(period, filters);
    
    return {
      period,
      filters,
      summary: report.summary,
      pendingApprovals: report.employees
        .filter(emp => emp.pendingDays > 0)
        .sort((a, b) => b.pendingDays - a.pendingDays)
    };
  }

  /**
   * Converte dados para CSV
   */
  convertToCSV(data: any): string {
    if (!data.employees || !Array.isArray(data.employees)) {
      return '';
    }

    const headers = Object.keys(data.employees[0]).join(',');
    const rows = data.employees.map((emp: any) =>
      Object.values(emp).map(val => 
        typeof val === 'string' && val.includes(',') ? `"${val}"` : val
      ).join(',')
    );

    return [headers, ...rows].join('\n');
  }

  // Métodos auxiliares
  private calculateWorkingDays(startDate: Date, endDate: Date): number {
    let days = 0;
    const current = moment(startDate);
    const end = moment(endDate);

    while (current.isSameOrBefore(end, 'day')) {
      if (current.day() >= 1 && current.day() <= 5) {
        days++;
      }
      current.add(1, 'day');
    }

    return days;
  }

  private calculatePresentDays(records: any[]): number {
    const days = new Set();
    records.forEach((record: any) => {
      const day = moment(record.timestamp).format('YYYY-MM-DD');
      days.add(day);
    });
    return days.size;
  }

  private async calculateLateArrivals(records: any[]): Promise<number> {
    // Buscar configurações da empresa para horário de entrada
    const companySettings = await getCompanySettings(prisma);
    const workStartTime = companySettings?.workStartTime || '07:00';
    const toleranceMinutes = companySettings?.toleranceMinutes || 10;
    const [startHour, startMinute] = workStartTime.split(':').map(Number);
    
    return records.filter((record: any) => {
      if (record.type !== 'ENTRY') return false;
      const entryTime = moment(record.timestamp);
      const expectedTime = moment(entryTime).hour(startHour).minute(startMinute + toleranceMinutes).second(0);
      return entryTime.isAfter(expectedTime);
    }).length;
  }

  private calculateEarlyDepartures(records: any[]): number {
    return records.filter((record: any) => {
      if (record.type !== 'EXIT') return false;
      const exitTime = moment(record.timestamp);
      const expectedTime = moment(exitTime).hour(17).minute(0).second(0);
      return exitTime.isBefore(expectedTime);
    }).length;
  }

  private calculateTotalHours(records: any[]): number {
    // Implementação simplificada
    return records.length * 8; // Assumindo 8 horas por registro
  }

  private calculateProductivityScore(emp: any, overtime: any): number {
    // Implementação simplificada
    let score = emp.attendanceRate;
    if (overtime && overtime.totalHours > 0) {
      score += Math.min(overtime.totalHours * 2, 20); // Bonus por horas extras
    }
    return Math.min(score, 100);
  }

  private calculateEfficiency(emp: any): number {
    // Implementação simplificada
    return emp.attendanceRate;
  }

  private calculatePunctuality(emp: any): number {
    // Implementação simplificada
    const totalDays = emp.totalDays;
    const lateDays = emp.lateArrivals;
    return totalDays > 0 ? ((totalDays - lateDays) / totalDays) * 100 : 100;
  }
}
