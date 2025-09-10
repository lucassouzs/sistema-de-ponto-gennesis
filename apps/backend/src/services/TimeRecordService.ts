import { PrismaClient, TimeRecordType } from '@prisma/client';
import moment from 'moment';

const prisma = new PrismaClient();

export interface WorkHoursCalculation {
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  lunchHours: number;
  breakHours: number;
  isValid: boolean;
  issues: string[];
}

export interface DaySummary {
  date: Date;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  lunchHours: number;
  breakHours: number;
  records: any[];
  isComplete: boolean;
  issues: string[];
}

export interface PeriodSummary {
  totalDays: number;
  presentDays: number;
  absentDays: number;
  totalHours: number;
  regularHours: number;
  overtimeHours: number;
  averageHoursPerDay: number;
  lateArrivals: number;
  earlyDepartures: number;
  issues: string[];
}

export class TimeRecordService {
  async calculateWorkHours(userId: string, date: Date): Promise<WorkHoursCalculation> {
    const startOfDay = moment(date).startOf('day').toDate();
    const endOfDay = moment(date).endOf('day').toDate();

    const records = await prisma.timeRecord.findMany({
      where: {
        userId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay
        },
        isValid: true
      },
      orderBy: { timestamp: 'asc' }
    });

    const issues: string[] = [];
    let totalHours = 0;
    let regularHours = 0;
    let overtimeHours = 0;
    let lunchHours = 0;
    let breakHours = 0;

    // Verificar se tem entrada e saída
    const entryRecord = records.find(r => r.type === TimeRecordType.ENTRY);
    const exitRecord = records.find(r => r.type === TimeRecordType.EXIT);
    const lunchStartRecord = records.find(r => r.type === TimeRecordType.LUNCH_START);
    const lunchEndRecord = records.find(r => r.type === TimeRecordType.LUNCH_END);

    if (!entryRecord) {
      issues.push('Entrada não registrada');
      return { totalHours: 0, regularHours: 0, overtimeHours: 0, lunchHours: 0, breakHours: 0, isValid: false, issues };
    }

    if (!exitRecord) {
      issues.push('Saída não registrada');
      return { totalHours: 0, regularHours: 0, overtimeHours: 0, lunchHours: 0, breakHours: 0, isValid: false, issues };
    }

    // Calcular horas totais
    const entryTime = moment(entryRecord.timestamp);
    const exitTime = moment(exitRecord.timestamp);
    totalHours = exitTime.diff(entryTime, 'hours', true);

    // Calcular horas de almoço
    if (lunchStartRecord && lunchEndRecord) {
      const lunchStart = moment(lunchStartRecord.timestamp);
      const lunchEnd = moment(lunchEndRecord.timestamp);
      lunchHours = lunchEnd.diff(lunchStart, 'hours', true);
    } else {
      // Assumir 1 hora de almoço se não registrado
      lunchHours = 1;
      issues.push('Horário de almoço não registrado - assumindo 1 hora');
    }

    // Calcular horas efetivas de trabalho
    const effectiveHours = totalHours - lunchHours;

    // Buscar configurações da empresa
    const companySettings = await prisma.companySettings.findFirst();
    const regularWorkHours = companySettings ? 8 : 8; // 8 horas por padrão

    if (effectiveHours > regularWorkHours) {
      regularHours = regularWorkHours;
      overtimeHours = effectiveHours - regularWorkHours;
    } else {
      regularHours = effectiveHours;
      overtimeHours = 0;
    }

    // Verificar se é dia útil
    const dayOfWeek = moment(date).day();
    const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5; // Segunda a sexta

    if (!isWeekday && effectiveHours > 0) {
      // Fim de semana - todas as horas são extras
      overtimeHours = effectiveHours;
      regularHours = 0;
    }

    return {
      totalHours,
      regularHours,
      overtimeHours,
      lunchHours,
      breakHours,
      isValid: issues.length === 0,
      issues
    };
  }

  async calculateDaySummary(userId: string, date: Date): Promise<DaySummary> {
    const startOfDay = moment(date).startOf('day').toDate();
    const endOfDay = moment(date).endOf('day').toDate();

    const records = await prisma.timeRecord.findMany({
      where: {
        userId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      orderBy: { timestamp: 'asc' }
    });

    const workHours = await this.calculateWorkHours(userId, date);
    const isComplete = records.some(r => r.type === TimeRecordType.ENTRY) && 
                      records.some(r => r.type === TimeRecordType.EXIT);

    return {
      date,
      totalHours: workHours.totalHours,
      regularHours: workHours.regularHours,
      overtimeHours: workHours.overtimeHours,
      lunchHours: workHours.lunchHours,
      breakHours: workHours.breakHours,
      records,
      isComplete,
      issues: workHours.issues
    };
  }

  async calculatePeriodSummary(userId: string, startDate: Date, endDate: Date): Promise<PeriodSummary> {
    const records = await prisma.timeRecord.findMany({
      where: {
        userId,
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        isValid: true
      },
      orderBy: { timestamp: 'asc' }
    });

    // Agrupar registros por dia
    const recordsByDay = new Map<string, any[]>();
    records.forEach(record => {
      const day = moment(record.timestamp).format('YYYY-MM-DD');
      if (!recordsByDay.has(day)) {
        recordsByDay.set(day, []);
      }
      recordsByDay.get(day)!.push(record);
    });

    let totalDays = 0;
    let presentDays = 0;
    let absentDays = 0;
    let totalHours = 0;
    let regularHours = 0;
    let overtimeHours = 0;
    let lateArrivals = 0;
    let earlyDepartures = 0;
    const issues: string[] = [];

    // Iterar por cada dia do período
    const currentDate = moment(startDate);
    const endMoment = moment(endDate);

    while (currentDate.isSameOrBefore(endMoment, 'day')) {
      totalDays++;
      const dayStr = currentDate.format('YYYY-MM-DD');
      const dayRecords = recordsByDay.get(dayStr) || [];

      if (dayRecords.length > 0) {
        presentDays++;
        const dayWorkHours = await this.calculateWorkHours(userId, currentDate.toDate());
        totalHours += dayWorkHours.totalHours;
        regularHours += dayWorkHours.regularHours;
        overtimeHours += dayWorkHours.overtimeHours;

        // Verificar atrasos
        const entryRecord = dayRecords.find(r => r.type === TimeRecordType.ENTRY);
        if (entryRecord) {
          const entryTime = moment(entryRecord.timestamp);
          const expectedEntryTime = moment(entryTime).hour(8).minute(0).second(0);
          
          if (entryTime.isAfter(expectedEntryTime)) {
            lateArrivals++;
          }
        }

        // Verificar saídas antecipadas
        const exitRecord = dayRecords.find(r => r.type === TimeRecordType.EXIT);
        if (exitRecord) {
          const exitTime = moment(exitRecord.timestamp);
          const expectedExitTime = moment(exitTime).hour(17).minute(0).second(0);
          
          if (exitTime.isBefore(expectedExitTime)) {
            earlyDepartures++;
          }
        }
      } else {
        absentDays++;
      }

      currentDate.add(1, 'day');
    }

    const averageHoursPerDay = presentDays > 0 ? totalHours / presentDays : 0;

    return {
      totalDays,
      presentDays,
      absentDays,
      totalHours,
      regularHours,
      overtimeHours,
      averageHoursPerDay,
      lateArrivals,
      earlyDepartures,
      issues
    };
  }

  async generateAttendanceReport(params: {
    startDate: Date;
    endDate: Date;
    department?: string;
    userId?: string;
  }) {
    const { startDate, endDate, department, userId } = params;

    const where: any = {
      timestamp: {
        gte: startDate,
        lte: endDate
      },
      isValid: true
    };

    if (userId) {
      where.userId = userId;
    }

    if (department) {
      where.employee = {
        department: { contains: department, mode: 'insensitive' }
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
    
    records.forEach(record => {
      const empId = record.employeeId;
      if (!employeeMap.has(empId)) {
        employeeMap.set(empId, {
          employeeId: record.employee.employeeId,
          employeeName: record.user.name,
          department: record.employee.department,
          position: record.employee.position,
          records: [],
          totalHours: 0,
          presentDays: 0,
          lateArrivals: 0,
          earlyDepartures: 0
        });
      }
      
      employeeMap.get(empId)!.records.push(record);
    });

    // Calcular métricas para cada funcionário
    const report = await Promise.all(Array.from(employeeMap.values()).map(async emp => {
      const periodSummary = await this.calculatePeriodSummary(emp.records[0].userId, startDate, endDate);
      
      return {
        employeeId: emp.employeeId,
        employeeName: emp.employeeName,
        department: emp.department,
        position: emp.position,
        period: { startDate, endDate },
        totalDays: periodSummary.totalDays,
        presentDays: periodSummary.presentDays,
        absentDays: periodSummary.absentDays,
        totalHours: periodSummary.totalHours,
        regularHours: periodSummary.regularHours,
        overtimeHours: periodSummary.overtimeHours,
        averageHoursPerDay: periodSummary.averageHoursPerDay,
        lateArrivals: periodSummary.lateArrivals,
        earlyDepartures: periodSummary.earlyDepartures,
        attendanceRate: periodSummary.totalDays > 0 ? (periodSummary.presentDays / periodSummary.totalDays) * 100 : 0
      };
    }));

    return report;
  }

  async generateLateArrivalsReport(params: {
    startDate: Date;
    endDate: Date;
    department?: string;
  }) {
    const { startDate, endDate, department } = params;

    const where: any = {
      type: TimeRecordType.ENTRY,
      timestamp: {
        gte: startDate,
        lte: endDate
      },
      isValid: true
    };

    if (department) {
      where.employee = {
        department: { contains: department, mode: 'insensitive' }
      };
    }

    const entryRecords = await prisma.timeRecord.findMany({
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

    // Filtrar apenas atrasos (após 8:10)
    const lateArrivals = entryRecords.filter(record => {
      const entryTime = moment(record.timestamp);
      const expectedTime = moment(entryTime).hour(8).minute(10).second(0);
      return entryTime.isAfter(expectedTime);
    });

    const report = lateArrivals.map(record => {
      const entryTime = moment(record.timestamp);
      const expectedTime = moment(entryTime).hour(8).minute(0).second(0);
      const delayMinutes = entryTime.diff(expectedTime, 'minutes');

      return {
        employeeId: record.employee.employeeId,
        employeeName: record.user.name,
        department: record.employee.department,
        position: record.employee.position,
        date: record.timestamp,
        expectedTime: expectedTime.toDate(),
        actualTime: record.timestamp,
        delayMinutes,
        delayHours: Math.floor(delayMinutes / 60),
        delayMinutesRemainder: delayMinutes % 60
      };
    });

    return report;
  }
}