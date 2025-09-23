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
  private getExpectedWorkHoursByRule(date: Date): number {
    const dow = moment(date).day(); // 0 dom, 1 seg ... 6 sáb
    if (dow >= 1 && dow <= 4) return 9; // seg-qui: 9h (7-17 com 1h almoço)
    if (dow === 5) return 8; // sexta: 8h (7-16 com 1h almoço)
    return 0; // fim de semana
  }

  private calculateOvertimeMultiplier(timestamp: Date, dayOfWeek: number): number {
    const hour = timestamp.getHours();
    const isSunday = dayOfWeek === 0;
    const isSaturday = dayOfWeek === 6;
    const isAfter22h = hour >= 22;
    
    if (isSunday) {
      // Domingo: 100% adicional (1h extra = 2h)
      return 2.0;
    } else if (isSaturday) {
      // Sábado: 50% adicional (1h extra = 1h30)
      return 1.5;
    } else if (isAfter22h) {
      // Depois das 22h: 100% adicional (1h extra = 2h)
      return 2.0;
    } else {
      // Segunda a sexta, após jornada normal: 50% adicional (1h extra = 1h30)
      return 1.5;
    }
  }
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
    const regularWorkHours = 8; // Mantemos aqui, pois banco de horas usará a regra externa de 9h/8h

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

    // Buscar configurações da empresa uma única vez
    const companySettings = await prisma.companySettings.findFirst();

    // Iterar por cada dia do período
    const currentDate = moment(startDate);
    const endMoment = moment(endDate);

    while (currentDate.isSameOrBefore(endMoment, 'day')) {
      totalDays++;
      const dayStr = currentDate.format('YYYY-MM-DD');
      const dayRecords = recordsByDay.get(dayStr) || [];

      // Verificar se há ausência justificada para este dia
      const hasAbsenceJustified = dayRecords.some(r => r.type === TimeRecordType.ABSENCE_JUSTIFIED);
      
      if (dayRecords.length > 0 && !hasAbsenceJustified) {
        presentDays++;
        const dayWorkHours = await this.calculateWorkHours(userId, currentDate.toDate());
        totalHours += dayWorkHours.totalHours;
        regularHours += dayWorkHours.regularHours;
        overtimeHours += dayWorkHours.overtimeHours;

        // Verificar atrasos
        const entryRecord = dayRecords.find(r => r.type === TimeRecordType.ENTRY);
        if (entryRecord) {
          const entryTime = moment(entryRecord.timestamp);
          
          // Usar configurações da empresa para horário de entrada
          const workStartTime = companySettings?.workStartTime || '07:00';
          const [startHour, startMinute] = workStartTime.split(':').map(Number);
          
          const expectedEntryTime = moment(entryTime).hour(startHour).minute(startMinute).second(0);
          
          if (entryTime.isAfter(expectedEntryTime)) {
            lateArrivals++;
          }
        }

        // Verificar saídas antecipadas
        const exitRecord = dayRecords.find(r => r.type === TimeRecordType.EXIT);
        if (exitRecord) {
          const exitTime = moment(exitRecord.timestamp);
          
          // Buscar configurações da empresa para horário de saída
          const workEndTime = companySettings?.workEndTime || '17:00';
          const [endHour, endMinute] = workEndTime.split(':').map(Number);
          
          const expectedExitTime = moment(exitTime).hour(endHour).minute(endMinute).second(0);
          
          if (exitTime.isBefore(expectedExitTime)) {
            earlyDepartures++;
          }
        }
      } else if (hasAbsenceJustified) {
        // Dia com ausência justificada - não conta como ausência nem presença
        // Não incrementa presentDays nem absentDays
        // Mas pode contar como horas regulares se configurado
        const expectedHours = this.getExpectedWorkHoursByRule(currentDate.toDate());
        if (expectedHours > 0) {
          regularHours += expectedHours; // Considerar como horas regulares trabalhadas
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

  async calculateBankHours(userId: string, startDate: Date, endDate: Date) {
    // Respeitar data de admissão para não contar antes do ingresso
    const employee = await prisma.employee.findFirst({ where: { userId } });
    const adjustedStart = employee ? moment.max(moment(startDate).startOf('day'), moment(employee.hireDate).startOf('day')) : moment(startDate).startOf('day');
    const cursor = adjustedStart.clone();
    // Limitar até o dia atual (não incluir dias futuros)
    const today = moment().endOf('day');
    const end = moment.min(moment(endDate).endOf('day'), today);
    let totalOvertimeHours = 0;
    let totalOwedHours = 0;

    while (cursor.isSameOrBefore(end, 'day')) {
      const expected = this.getExpectedWorkHoursByRule(cursor.toDate());
      if (expected > 0) {
        // Buscar registros do dia (incluindo inválidos) para não perder horas trabalhadas
        const dayStart = cursor.clone().startOf('day').toDate();
        const dayEnd = cursor.clone().endOf('day').toDate();
        const dayRecords = await prisma.timeRecord.findMany({
          where: {
            userId,
            timestamp: { gte: dayStart, lte: dayEnd },
          },
          orderBy: { timestamp: 'asc' },
        });

        let effective = 0;
        
        // Verificar se há ausência justificada para este dia
        const hasAbsenceJustified = dayRecords.some(r => r.type === TimeRecordType.ABSENCE_JUSTIFIED);
        
        if (dayRecords.length === 0) {
          // Ausência completa
          totalOwedHours += expected;
        } else if (hasAbsenceJustified) {
          // Ausência justificada - considerar como horas trabalhadas
          effective = expected;
        } else {
          const entry = dayRecords.find(r => r.type === TimeRecordType.ENTRY);
          const exit = [...dayRecords].reverse().find(r => r.type === TimeRecordType.EXIT);
          if (entry && exit) {
            const total = moment(exit.timestamp).diff(moment(entry.timestamp), 'hours', true);
            const lunchStart = dayRecords.find(r => r.type === TimeRecordType.LUNCH_START);
            const lunchEnd = dayRecords.find(r => r.type === TimeRecordType.LUNCH_END);
            let lunch = 0;
            if (lunchStart && lunchEnd) {
              lunch = moment(lunchEnd.timestamp).diff(moment(lunchStart.timestamp), 'hours', true);
            } else {
              // Assumir 1h de almoço na ausência de registros
              lunch = 1;
            }
            effective = Math.max(0, total - lunch);
          } else {
            // Sem entrada/saída completos: considera ausência
            totalOwedHours += expected;
          }

          if (effective > 0) {
            if (effective >= expected) {
              const overtimeHours = effective - expected;
              // Aplicar multiplicador apenas sobre as horas extras
              const dayOfWeek = cursor.day();
              const multiplier = entry ? this.calculateOvertimeMultiplier(entry.timestamp, dayOfWeek) : 1.5;
              totalOvertimeHours += overtimeHours * multiplier;
            } else {
              totalOwedHours += (expected - effective);
            }
          }
        }
      }
      cursor.add(1, 'day');
    }

    return {
      startDate: adjustedStart.toDate(),
      endDate,
      totalOvertimeHours,
      totalOwedHours,
      balanceHours: totalOvertimeHours - totalOwedHours,
    };
  }

  async calculateBankHoursDetailed(userId: string, startDate: Date, endDate: Date) {
    const employee = await prisma.employee.findFirst({ where: { userId } });
    const adjustedStart = employee ? moment.max(moment(startDate).startOf('day'), moment(employee.hireDate).startOf('day')) : moment(startDate).startOf('day');
    const cursor = adjustedStart.clone();
    // Limitar até o dia atual (não incluir dias futuros)
    const today = moment().endOf('day');
    const end = moment.min(moment(endDate).endOf('day'), today);

    const days: Array<{
      date: Date;
      expectedHours: number;
      workedHours: number;
      overtimeHours: number;
      owedHours: number;
      notes: string[];
    }> = [];

    while (cursor.isSameOrBefore(end, 'day')) {
      const expected = this.getExpectedWorkHoursByRule(cursor.toDate());
      let worked = 0;
      let overtime = 0;
      let owed = 0;
      const notes: string[] = [];

      if (expected > 0) {
        const dayStart = cursor.clone().startOf('day').toDate();
        const dayEnd = cursor.clone().endOf('day').toDate();
        const dayRecords = await prisma.timeRecord.findMany({
          where: { userId, timestamp: { gte: dayStart, lte: dayEnd } },
          orderBy: { timestamp: 'asc' },
        });

        // Verificar se há ausência justificada para este dia
        const hasAbsenceJustified = dayRecords.some(r => r.type === TimeRecordType.ABSENCE_JUSTIFIED);
        
        if (dayRecords.length === 0) {
          owed = expected;
          notes.push('Ausência no dia');
        } else if (hasAbsenceJustified) {
          // Ausência justificada - não trabalhou, mas não deve horas
          worked = 0;
          owed = 0; // Não deve horas
          notes.push('Ausência Justificada');
        } else {
          const entry = dayRecords.find(r => r.type === TimeRecordType.ENTRY);
          const exit = [...dayRecords].reverse().find(r => r.type === TimeRecordType.EXIT);
          const lunchStart = dayRecords.find(r => r.type === TimeRecordType.LUNCH_START);
          const lunchEnd = dayRecords.find(r => r.type === TimeRecordType.LUNCH_END);

          if (!entry) notes.push('Entrada não registrada');
          if (!exit) notes.push('Saída não registrada');
          if (entry && exit) {
            const total = moment(exit.timestamp).diff(moment(entry.timestamp), 'hours', true);
            let lunch = 0;
            if (lunchStart && lunchEnd) {
              lunch = moment(lunchEnd.timestamp).diff(moment(lunchStart.timestamp), 'hours', true);
            } else {
              lunch = 1; // assume 1h
              notes.push('Almoço não registrado - assumindo 1h');
            }
            worked = Math.max(0, total - lunch);
            if (worked >= expected) {
              const rawOvertime = worked - expected;
              // Aplicar multiplicador apenas sobre as horas extras
              const dayOfWeek = cursor.day();
              const multiplier = entry ? this.calculateOvertimeMultiplier(entry.timestamp, dayOfWeek) : 1.5;
              overtime = rawOvertime * multiplier;
            } else {
              owed = expected - worked;
            }
          } else {
            owed = expected;
          }
        }
      }

      days.push({
        date: cursor.toDate(),
        expectedHours: expected,
        workedHours: Number(worked.toFixed(2)),
        overtimeHours: Number(overtime.toFixed(2)),
        owedHours: Number(owed.toFixed(2)),
        notes,
      });

      cursor.add(1, 'day');
    }

    const totalOvertimeHours = days.reduce((acc, d) => acc + d.overtimeHours, 0);
    const totalOwedHours = days.reduce((acc, d) => acc + d.owedHours, 0);

    return {
      startDate: adjustedStart.toDate(),
      endDate,
      totalOvertimeHours: Number(totalOvertimeHours.toFixed(2)),
      totalOwedHours: Number(totalOwedHours.toFixed(2)),
      balanceHours: Number((totalOvertimeHours - totalOwedHours).toFixed(2)),
      days,
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

    // Buscar configurações da empresa para horário de entrada
    const companySettings = await prisma.companySettings.findFirst();
    const workStartTime = companySettings?.workStartTime || '07:00';
    const toleranceMinutes = companySettings?.toleranceMinutes || 10;
    const [startHour, startMinute] = workStartTime.split(':').map(Number);
    
    // Filtrar apenas atrasos (após horário + tolerância)
    const lateArrivals = entryRecords.filter(record => {
      const entryTime = moment(record.timestamp);
      const expectedTime = moment(entryTime).hour(startHour).minute(startMinute + toleranceMinutes).second(0);
      return entryTime.isAfter(expectedTime);
    });

    const report = lateArrivals.map(record => {
      const entryTime = moment(record.timestamp);
      const expectedTime = moment(entryTime).hour(startHour).minute(startMinute).second(0);
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