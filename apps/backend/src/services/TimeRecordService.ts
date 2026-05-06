import moment from 'moment-timezone';
import { HolidayService } from './HolidayService';
import { prisma } from '../lib/prisma';
import { getCompanySettings } from '../lib/cache';

const holidayService = new HolidayService();

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
  /**
   * Converte polo para estado (UF)
   */
  private poloToState(polo?: string | null): string | undefined {
    if (!polo) return undefined;
    const poloUpper = polo.toUpperCase();
    if (poloUpper.includes('BRASÍLIA') || poloUpper.includes('BRASILIA')) return 'DF';
    if (poloUpper.includes('GOIÁS') || poloUpper.includes('GOIAS')) return 'GO';
    return undefined;
  }

  private async getExpectedWorkHoursByRule(date: Date, state?: string): Promise<number> {
    // Verificar se é feriado primeiro
    const isHoliday = await holidayService.isHoliday(date, state);
    if (isHoliday) {
      return 0; // Feriado: não há horas esperadas
    }

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

    // Buscar funcionário para obter o estado (polo)
    const employee = await prisma.employee.findFirst({ where: { userId } });
    const employeeState = this.poloToState(employee?.polo);

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
    const entryRecord = records.find((r: any) => r.type === 'ENTRY');
    const exitRecord = records.find((r: any) => r.type === 'EXIT');
    const lunchStartRecord = records.find((r: any) => r.type === 'LUNCH_START');
    const lunchEndRecord = records.find((r: any) => r.type === 'LUNCH_END');

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

    // Buscar horas esperadas baseado no dia da semana e feriados
    const expectedWorkHours = await this.getExpectedWorkHoursByRule(date, employeeState);

    if (effectiveHours > expectedWorkHours) {
      regularHours = expectedWorkHours;
      overtimeHours = effectiveHours - expectedWorkHours;
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
    const isComplete = records.some((r: any) => r.type === 'ENTRY') && 
                      records.some((r: any) => r.type === 'EXIT');

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
    // Buscar funcionário uma única vez para obter o estado (polo)
    const employee = await prisma.employee.findFirst({ where: { userId } });
    const employeeState = this.poloToState(employee?.polo);

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
    records.forEach((record: any) => {
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

    // Buscar configurações da empresa uma única vez (com cache)
    const companySettings = await getCompanySettings(prisma);

    // Iterar por cada dia do período
    const currentDate = moment(startDate);
    const endMoment = moment(endDate);

    while (currentDate.isSameOrBefore(endMoment, 'day')) {
      totalDays++;
      const dayStr = currentDate.format('YYYY-MM-DD');
      const dayRecords = recordsByDay.get(dayStr) || [];

      // Verificar se há ausência justificada para este dia
      const hasAbsenceJustified = dayRecords.some((r: any) => r.type === 'ABSENCE_JUSTIFIED');
      
      if (dayRecords.length > 0 && !hasAbsenceJustified) {
        presentDays++;
        const dayWorkHours = await this.calculateWorkHours(userId, currentDate.toDate());
        totalHours += dayWorkHours.totalHours;
        regularHours += dayWorkHours.regularHours;
        overtimeHours += dayWorkHours.overtimeHours;

        // Verificar atrasos
        const entryRecord = dayRecords.find((r: any) => r.type === 'ENTRY');
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
        const exitRecord = dayRecords.find((r: any) => r.type === 'EXIT');
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
        const expectedHours = await this.getExpectedWorkHoursByRule(currentDate.toDate(), employeeState);
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
    // Usar o método detalhado para garantir consistência
    const detailedResult = await this.calculateBankHoursDetailed(userId, startDate, endDate);

    return {
      startDate: detailedResult.startDate,
      endDate: detailedResult.endDate,
      totalOvertimeHours: detailedResult.totalOvertimeHours,
      totalOwedHours: detailedResult.totalOwedHours,
      balanceHours: detailedResult.balanceHours,
      totalOvertimeRaw: detailedResult.days.reduce((acc, d) => acc + Math.max((d.workedHours || 0) - (d.expectedHours || 0), 0), 0),
      balanceHoursRaw: detailedResult.days.reduce((acc, d) => acc + Math.max((d.workedHours || 0) - (d.expectedHours || 0), 0), 0) - detailedResult.totalOwedHours,
    };
  }

  async calculateBankHoursDetailed(userId: string, startDate: Date, endDate: Date) {
    const employee = await prisma.employee.findFirst({ where: { userId } });
    // Usar createdAt (data de criação no sistema) para cálculos de banco de horas
    // hireDate é usado apenas para cálculos de férias
    const controlStartDate = employee?.createdAt 
      ? moment(employee.createdAt).startOf('day')
      : employee?.hireDate 
        ? moment(employee.hireDate).startOf('day')
        : moment(startDate).startOf('day');
    
    const adjustedStart = employee 
      ? moment.max(moment(startDate).startOf('day'), controlStartDate) 
      : moment(startDate).startOf('day');
    
    const cursor = adjustedStart.clone();
    // Limitar até o dia atual (não incluir dias futuros)
    const today = moment().endOf('day');
    const end = moment.min(moment(endDate).endOf('day'), today);

    // Converter polo para estado (para verificação de feriados)
    const employeeState = this.poloToState(employee?.polo);

    // OTIMIZAÇÃO: Buscar todos os dados de uma vez
    const periodStart = adjustedStart.clone().startOf('day').toDate();
    const periodEnd = end.clone().endOf('day').toDate();

    // Buscar todos os registros do período de uma vez
    const allRecords = await prisma.timeRecord.findMany({
      where: { 
        userId, 
        timestamp: { 
          gte: periodStart, 
          lte: periodEnd 
        } 
      },
      orderBy: { timestamp: 'asc' },
    });

    // Buscar todos os feriados do período de uma vez
    const holidays = await holidayService.getHolidaysByPeriod(periodStart, periodEnd, employeeState);
    const holidayDates = new Set(
      holidays.map(h => moment(h.date).format('YYYY-MM-DD'))
    );

    const days: Array<{
      date: Date;
      expectedHours: number;
      workedHours: number;
      overtimeHours: number;
      overtimeHours15?: number; // horas extras com multiplicador 1.5 (já multiplicadas)
      overtimeHours20?: number; // horas extras com multiplicador 2.0 (já multiplicadas)
      owedHours: number;
      notes: string[];
    }> = [];

    while (cursor.isSameOrBefore(end, 'day')) {
      const dateStr = cursor.format('YYYY-MM-DD');
      const isHoliday = holidayDates.has(dateStr);
      
      // Calcular horas esperadas sem fazer query (otimizado)
      const dow = cursor.day(); // 0 dom, 1 seg ... 6 sáb
      const expected = isHoliday ? 0 : (dow >= 1 && dow <= 4 ? 9 : dow === 5 ? 8 : 0);

      let worked = 0;
      let overtime = 0;
      let overtime15 = 0; // 1.5x
      let overtime20 = 0; // 2.0x
      let owed = 0;
      const notes: string[] = [];

      // Verificar se é feriado para adicionar nota
      if (isHoliday) {
        notes.push('Feriado');
      }

      // Buscar registros do dia (já em memória)
      const dayStart = cursor.clone().startOf('day').toDate();
      const dayEnd = cursor.clone().endOf('day').toDate();
      const dayRecords = allRecords.filter(r => {
        const recordDate = moment(r.timestamp);
        return recordDate.isSameOrAfter(dayStart) && recordDate.isSameOrBefore(dayEnd);
      });

      if (expected > 0) {

        // Verificar se há ausência justificada para este dia
        const hasAbsenceJustified = dayRecords.some((r: any) => r.type === 'ABSENCE_JUSTIFIED');
        
        if (dayRecords.length === 0) {
          owed = expected;
          notes.push('Ausência no dia');
        } else if (hasAbsenceJustified) {
          // Ausência justificada - não trabalhou, mas não deve horas
          worked = 0;
          owed = 0; // Não deve horas
          notes.push('Ausência Justificada');
        } else {
          const entry = dayRecords.find((r: any) => r.type === 'ENTRY');
          const exit = [...dayRecords].reverse().find((r: any) => r.type === 'EXIT');
          const lunchStart = dayRecords.find((r: any) => r.type === 'LUNCH_START');
          const lunchEnd = dayRecords.find((r: any) => r.type === 'LUNCH_END');

          if (!entry) notes.push('Entrada não registrada');
          if (!exit) notes.push('Saída não registrada');
          if (entry && exit) {
            const TZ = 'America/Sao_Paulo';
            // Usar o horário diretamente como está salvo (sem conversão)
            const toLocal = (d: Date) => moment(d);
            const entryMoment = toLocal(entry.timestamp);
            const exitMoment = toLocal(exit.timestamp);

            const total = exitMoment.diff(entryMoment, 'hours', true);
            let lunch = 0;
            let firstIntervalStart = entryMoment.clone();
            let firstIntervalEnd = exitMoment.clone();
            let secondIntervalStart: moment.Moment | null = null;
            let secondIntervalEnd: moment.Moment | null = null;

            if (lunchStart && lunchEnd) {
              const lunchStartMoment = toLocal(lunchStart.timestamp);
              const lunchEndMoment = toLocal(lunchEnd.timestamp);
              lunch = lunchEndMoment.diff(lunchStartMoment, 'hours', true);
              firstIntervalEnd = lunchStartMoment.clone();
              secondIntervalStart = lunchEndMoment.clone();
              secondIntervalEnd = exitMoment.clone();
            } else {
              lunch = 1; // assume 1h
              notes.push('Almoço não registrado - assumindo 1h');
            }

            // Horas trabalhadas totais
            worked = Math.max(0, total - lunch);

            // Calcular horas trabalhadas após as 22:00 usando horário local
            const localDayStr = entryMoment.format('YYYY-MM-DD');
            const boundary22Local = moment(`${localDayStr} 22:00`, 'YYYY-MM-DD HH:mm');
            const endOfLocalDayLocal = boundary22Local.clone().endOf('day');

            const overlapAfter22Local = (startLocal: moment.Moment, endLocal: moment.Moment) => {
              const s = moment.max(startLocal, boundary22Local);
              const e = moment.min(endLocal, endOfLocalDayLocal);
              if (e.isAfter(s)) return e.diff(s, 'hours', true);
              return 0;
            };

            let workedAfter22 = 0;
            workedAfter22 += overlapAfter22Local(firstIntervalStart, firstIntervalEnd);
            if (secondIntervalStart && secondIntervalEnd) {
              workedAfter22 += overlapAfter22Local(secondIntervalStart, secondIntervalEnd);
            }
            // workedAfter22 mantém precisão cheia
            const workedBefore22 = Math.max(0, worked - workedAfter22);

            const dayOfWeek = cursor.day();

            if (expected > 0) {
            if (worked >= expected) {
                const rawOvertime = worked - expected; // total de horas extras
                // Parte 2x são as horas após 22h, limitadas ao total de extras
                const extra20 = Math.min(workedAfter22, rawOvertime);
                const extra15 = Math.max(0, rawOvertime - extra20);
                overtime15 = extra15 * 1.5;
                overtime20 = extra20 * 2.0;
                overtime = overtime15 + overtime20;


            } else {
              owed = expected - worked;
              }
            } else {
              // Dias sem horas esperadas (sábado/domingo/feriado): tudo é extra
              if (dayOfWeek === 0 || isHoliday) {
                // Domingo ou Feriado: todas as horas são 2x
                overtime20 = worked * 2.0;
                overtime15 = 0;
              } else {
                // Sábado: 1.5x antes de 22h, 2x depois de 22h
                overtime15 = workedBefore22 * 1.5;
                overtime20 = workedAfter22 * 2.0;
              }
              overtime = overtime15 + overtime20;
            }
          } else {
            owed = expected;
          }
        }
      } else {
        // Quando expected = 0 (feriado ou final de semana), ainda precisa processar se houver registros
        if (dayRecords.length > 0) {
          const entry = dayRecords.find((r: any) => r.type === 'ENTRY');
          const exit = [...dayRecords].reverse().find((r: any) => r.type === 'EXIT');
          const lunchStart = dayRecords.find((r: any) => r.type === 'LUNCH_START');
          const lunchEnd = dayRecords.find((r: any) => r.type === 'LUNCH_END');

          if (entry && exit) {
            const TZ = 'America/Sao_Paulo';
            const toLocal = (d: Date) => moment(d);
            const entryMoment = toLocal(entry.timestamp);
            const exitMoment = toLocal(exit.timestamp);

            const total = exitMoment.diff(entryMoment, 'hours', true);
            let lunch = 0;

            if (lunchStart && lunchEnd) {
              const lunchStartMoment = toLocal(lunchStart.timestamp);
              const lunchEndMoment = toLocal(lunchEnd.timestamp);
              lunch = lunchEndMoment.diff(lunchStartMoment, 'hours', true);
            } else {
              lunch = 1; // assume 1h
            }

            worked = Math.max(0, total - lunch);

            // Calcular horas trabalhadas após as 22:00
            const localDayStr = entryMoment.format('YYYY-MM-DD');
            const boundary22Local = moment(`${localDayStr} 22:00`, 'YYYY-MM-DD HH:mm');
            const endOfLocalDayLocal = boundary22Local.clone().endOf('day');

            const overlapAfter22Local = (startLocal: moment.Moment, endLocal: moment.Moment) => {
              const s = moment.max(startLocal, boundary22Local);
              const e = moment.min(endLocal, endOfLocalDayLocal);
              if (e.isAfter(s)) return e.diff(s, 'hours', true);
              return 0;
            };

            let firstIntervalStart = entryMoment.clone();
            let firstIntervalEnd = exitMoment.clone();
            let secondIntervalStart: moment.Moment | null = null;
            let secondIntervalEnd: moment.Moment | null = null;

            if (lunchStart && lunchEnd) {
              const lunchStartMoment = toLocal(lunchStart.timestamp);
              const lunchEndMoment = toLocal(lunchEnd.timestamp);
              firstIntervalEnd = lunchStartMoment.clone();
              secondIntervalStart = lunchEndMoment.clone();
              secondIntervalEnd = exitMoment.clone();
            }

            let workedAfter22 = 0;
            workedAfter22 += overlapAfter22Local(firstIntervalStart, firstIntervalEnd);
            if (secondIntervalStart && secondIntervalEnd) {
              workedAfter22 += overlapAfter22Local(secondIntervalStart, secondIntervalEnd);
            }
            const workedBefore22 = Math.max(0, worked - workedAfter22);

            const dayOfWeek = cursor.day();

            // Feriado ou domingo: todas as horas são 2x
            if (dayOfWeek === 0 || isHoliday) {
              overtime20 = worked * 2.0;
              overtime15 = 0;
            } else {
              // Sábado: 1.5x antes de 22h, 2x depois de 22h
              overtime15 = workedBefore22 * 1.5;
              overtime20 = workedAfter22 * 2.0;
            }
            overtime = overtime15 + overtime20;
          }
        }
      }

      days.push({
        date: cursor.toDate(),
        expectedHours: expected,
        workedHours: worked,
        overtimeHours: overtime,
        overtimeHours15: overtime15,
        overtimeHours20: overtime20,
        owedHours: owed,
        notes,
      });

      cursor.add(1, 'day');
    }

    const totalOvertimeHours = days.reduce((acc, d) => acc + d.overtimeHours, 0);
    const totalOwedHours = days.reduce((acc, d) => acc + d.owedHours, 0);

    return {
      startDate: adjustedStart.toDate(),
      endDate,
      totalOvertimeHours: totalOvertimeHours,
      totalOwedHours: totalOwedHours,
      balanceHours: totalOvertimeHours - totalOwedHours,
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
    
    records.forEach((record: any) => {
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
      type: 'ENTRY',
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
    const companySettings = await getCompanySettings(prisma);
    const workStartTime = companySettings?.workStartTime || '07:00';
    const toleranceMinutes = companySettings?.toleranceMinutes || 10;
    const [startHour, startMinute] = workStartTime.split(':').map(Number);
    
    // Filtrar apenas atrasos (após horário + tolerância)
    const lateArrivals = entryRecords.filter((record: any) => {
      const entryTime = moment(record.timestamp);
      const expectedTime = moment(entryTime).hour(startHour).minute(startMinute + toleranceMinutes).second(0);
      return entryTime.isAfter(expectedTime);
    });

    const report = lateArrivals.map((record: any) => {
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
