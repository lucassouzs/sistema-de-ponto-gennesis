import moment from 'moment';
import { HolidayService } from './HolidayService';
import { prisma } from '../lib/prisma';
const holidayService = new HolidayService();

export interface HoursExtrasCalculation {
  he50Hours: number;
  he50Value: number;
  he100Hours: number;
  he100Value: number;
  hourlyRate: number;
}

export interface DayHoursExtras {
  date: Date;
  dayOfWeek: number;
  totalHours: number;
  he50Hours: number;
  he100Hours: number;
  isWeekend: boolean;
  isHoliday: boolean;
}

export class HoursExtrasService {
  /**
   * Calcula o valor da hora normal baseado no salário base + periculosidade + insalubridade
   */
  private calculateHourlyRate(baseSalary: number, dangerPay: number, unhealthyPay: number): number {
    // 220 horas por mês (jornada padrão)
    const totalSalary = baseSalary + dangerPay + unhealthyPay;
    return totalSalary / 220;
  }

  /**
   * Verifica se é feriado usando o HolidayService
   * @param date Data a verificar
   * @param state Estado do funcionário (opcional)
   */
  private async isHoliday(date: Date, state?: string): Promise<boolean> {
    return await holidayService.isHoliday(date, state);
  }

  /**
   * Calcula as horas trabalhadas em um dia específico
   */
  private async calculateDayHours(userId: string, date: Date): Promise<number> {
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

    if (records.length < 2) return 0;

    let totalMinutes = 0;
    let entryTime: Date | null = null;

    for (const record of records) {
      if (record.type === 'ENTRY' || record.type === 'LUNCH_END' || record.type === 'BREAK_END') {
        entryTime = record.timestamp;
      } else if ((record.type === 'EXIT' || record.type === 'LUNCH_START' || record.type === 'BREAK_START') && entryTime) {
        const diffMinutes = moment(record.timestamp).diff(moment(entryTime), 'minutes');
        totalMinutes += diffMinutes;
        entryTime = null;
      }
    }

    return totalMinutes / 60; // Converter para horas
  }

  /**
   * Calcula horas extras 50% para um dia específico
   */
  private calculateHE50ForDay(totalHours: number, dayOfWeek: number, isHoliday: boolean): number {
    // Domingo e feriados não têm H.E 50%
    if (dayOfWeek === 0 || isHoliday) {
      return 0;
    }
    
    let expectedHours = 0;
    
    if (dayOfWeek >= 1 && dayOfWeek <= 4) {
      // Segunda a Quinta: 9h
      expectedHours = 9;
    } else if (dayOfWeek === 5) {
      // Sexta: 8h
      expectedHours = 8;
    } else if (dayOfWeek === 6) {
      // Sábado: todas as horas são extras 50%
      return totalHours;
    }

    // Retorna apenas as horas acima do esperado
    return Math.max(0, totalHours - expectedHours);
  }

  /**
   * Calcula horas extras 100% para um dia específico
   */
  private async calculateHE100ForDay(userId: string, date: Date, dayOfWeek: number, state?: string): Promise<number> {
    const startOfDay = moment(date).startOf('day').toDate();
    const endOfDay = moment(date).endOf('day').toDate();

    // Domingo: todas as horas são extras 100%
    if (dayOfWeek === 0) {
      return await this.calculateDayHours(userId, date);
    }

    // Feriado: todas as horas são extras 100%
    if (await this.isHoliday(date, state)) {
      return await this.calculateDayHours(userId, date);
    }

    // Após 22h: calcular horas após 22h
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

    let hoursAfter22h = 0;
    let entryTime: Date | null = null;

    for (const record of records) {
      const recordHour = record.timestamp.getHours();
      
      if (record.type === 'ENTRY' || record.type === 'LUNCH_END' || record.type === 'BREAK_END') {
        entryTime = record.timestamp;
      } else if ((record.type === 'EXIT' || record.type === 'LUNCH_START' || record.type === 'BREAK_START') && entryTime) {
        // Se a entrada foi antes das 22h mas a saída foi depois das 22h
        if (entryTime.getHours() < 22 && recordHour >= 22) {
          const after22hTime = new Date(entryTime);
          after22hTime.setHours(22, 0, 0, 0);
          const diffMinutes = moment(record.timestamp).diff(moment(after22hTime), 'minutes');
          hoursAfter22h += diffMinutes / 60;
        }
        // Se tanto entrada quanto saída foram após 22h
        else if (entryTime.getHours() >= 22) {
          const diffMinutes = moment(record.timestamp).diff(moment(entryTime), 'minutes');
          hoursAfter22h += diffMinutes / 60;
        }
        entryTime = null;
      }
    }

    return hoursAfter22h;
  }

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

  /**
   * Calcula horas extras para um funcionário em um mês específico
   * OTIMIZADO: Busca todos os registros do mês de uma vez
   */
  async calculateHoursExtrasForMonth(
    userId: string, 
    year: number, 
    month: number, 
    baseSalary: number,
    dangerPay: number,
    unhealthyPay: number
  ): Promise<HoursExtrasCalculation> {
    // Buscar dados do funcionário para obter o polo
    const employee = await prisma.employee.findUnique({
      where: { userId },
      select: { polo: true },
    });

    const state = this.poloToState(employee?.polo);

    const startDate = moment([year, month - 1, 1]).startOf('day').toDate();
    const endDate = moment([year, month - 1]).endOf('month').toDate();
    
    // OTIMIZAÇÃO: Buscar todos os registros do mês de uma vez
    const allRecords = await prisma.timeRecord.findMany({
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

    // Buscar feriados do mês de uma vez
    const holidays = await holidayService.getHolidaysByPeriod(startDate, endDate, state);
    const holidayDates = new Set(
      holidays.map(h => moment(h.date).format('YYYY-MM-DD'))
    );
    
    const hourlyRate = this.calculateHourlyRate(baseSalary, dangerPay, unhealthyPay);
    let totalHE50Hours = 0;
    let totalHE100Hours = 0;

    // Agrupar registros por dia
    const recordsByDay = new Map<string, typeof allRecords>();
    allRecords.forEach(record => {
      const dayKey = moment(record.timestamp).format('YYYY-MM-DD');
      if (!recordsByDay.has(dayKey)) {
        recordsByDay.set(dayKey, []);
      }
      recordsByDay.get(dayKey)!.push(record);
    });

    // Processar cada dia
    const cursor = moment(startDate);
    while (cursor.isSameOrBefore(endDate, 'day')) {
      const date = cursor.toDate();
      const dayKey = cursor.format('YYYY-MM-DD');
      const dayOfWeek = cursor.day();
      const isHoliday = holidayDates.has(dayKey);
      
      const dayRecords = recordsByDay.get(dayKey) || [];
      const totalHours = this.calculateDayHoursFromRecords(dayRecords);
      
      if (totalHours > 0) {
        const he50Hours = this.calculateHE50ForDay(totalHours, dayOfWeek, isHoliday);
        const he100Hours = this.calculateHE100ForDayFromRecords(dayRecords, dayOfWeek, isHoliday);
        
        totalHE50Hours += he50Hours;
        totalHE100Hours += he100Hours;
      }
      
      cursor.add(1, 'day');
    }

    return {
      he50Hours: Number((totalHE50Hours * 1.5).toFixed(2)),
      he50Value: Number(((totalHE50Hours * 1.5) * hourlyRate).toFixed(2)),
      he100Hours: Number((totalHE100Hours * 2.0).toFixed(2)),
      he100Value: Number(((totalHE100Hours * 2.0) * hourlyRate).toFixed(2)),
      hourlyRate: Number(hourlyRate.toFixed(2))
    };
  }

  /**
   * Calcula horas trabalhadas a partir de registros já buscados (otimizado)
   */
  private calculateDayHoursFromRecords(records: any[]): number {
    if (records.length < 2) return 0;

    let totalMinutes = 0;
    let entryTime: Date | null = null;

    for (const record of records) {
      if (record.type === 'ENTRY' || record.type === 'LUNCH_END' || record.type === 'BREAK_END') {
        entryTime = record.timestamp;
      } else if ((record.type === 'EXIT' || record.type === 'LUNCH_START' || record.type === 'BREAK_START') && entryTime) {
        const diffMinutes = moment(record.timestamp).diff(moment(entryTime), 'minutes');
        totalMinutes += diffMinutes;
        entryTime = null;
      }
    }

    return totalMinutes / 60; // Converter para horas
  }

  /**
   * Calcula horas extras 100% a partir de registros já buscados (otimizado)
   */
  private calculateHE100ForDayFromRecords(records: any[], dayOfWeek: number, isHoliday: boolean): number {
    // Domingo: todas as horas são extras 100%
    if (dayOfWeek === 0) {
      return this.calculateDayHoursFromRecords(records);
    }

    // Feriado: todas as horas são extras 100%
    if (isHoliday) {
      return this.calculateDayHoursFromRecords(records);
    }

    // Após 22h: calcular horas após 22h
    let hoursAfter22h = 0;
    let entryTime: Date | null = null;

    for (const record of records) {
      const recordHour = record.timestamp.getHours();
      
      if (record.type === 'ENTRY' || record.type === 'LUNCH_END' || record.type === 'BREAK_END') {
        entryTime = record.timestamp;
      } else if ((record.type === 'EXIT' || record.type === 'LUNCH_START' || record.type === 'BREAK_START') && entryTime) {
        // Se a entrada foi antes das 22h mas a saída foi depois das 22h
        if (entryTime.getHours() < 22 && recordHour >= 22) {
          const after22hTime = new Date(entryTime);
          after22hTime.setHours(22, 0, 0, 0);
          const diffMinutes = moment(record.timestamp).diff(moment(after22hTime), 'minutes');
          hoursAfter22h += diffMinutes / 60;
        }
        // Se tanto entrada quanto saída foram após 22h
        else if (entryTime.getHours() >= 22) {
          const diffMinutes = moment(record.timestamp).diff(moment(entryTime), 'minutes');
          hoursAfter22h += diffMinutes / 60;
        }
        entryTime = null;
      }
    }

    return hoursAfter22h;
  }

  /**
   * Calcula detalhes dia a dia das horas extras
   */
  async calculateHoursExtrasDetailed(
    userId: string, 
    year: number, 
    month: number
  ): Promise<DayHoursExtras[]> {
    // Buscar dados do funcionário para obter o polo
    const employee = await prisma.employee.findUnique({
      where: { userId },
      select: { polo: true },
    });

    const state = this.poloToState(employee?.polo);

    const startDate = moment([year, month - 1, 1]).startOf('day').toDate();
    const endDate = moment([year, month - 1]).endOf('month').toDate();
    
    const days: DayHoursExtras[] = [];
    const cursor = moment(startDate);
    
    while (cursor.isSameOrBefore(endDate, 'day')) {
      const date = cursor.toDate();
      const dayOfWeek = cursor.day();
      const isHoliday = await this.isHoliday(date, state);
      const totalHours = await this.calculateDayHours(userId, date);
      
      if (totalHours > 0) {
        const he50Hours = this.calculateHE50ForDay(totalHours, dayOfWeek, isHoliday);
        const he100Hours = await this.calculateHE100ForDay(userId, date, dayOfWeek, state);
        
        days.push({
          date,
          dayOfWeek,
          totalHours: Number(totalHours.toFixed(2)),
          he50Hours: Number((he50Hours * 1.5).toFixed(2)),
          he100Hours: Number((he100Hours * 2.0).toFixed(2)),
          isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
          isHoliday
        });
      }
      
      cursor.add(1, 'day');
    }

    return days;
  }
}
