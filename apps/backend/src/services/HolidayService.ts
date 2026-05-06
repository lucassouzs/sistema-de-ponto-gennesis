import { Holiday, HolidayType } from '@prisma/client';
import moment from 'moment-timezone';
import { prisma } from '../lib/prisma';
import { cache } from '../lib/cache';

export interface CreateHolidayInput {
  name: string;
  date: Date | string;
  type?: HolidayType;
  isRecurring?: boolean;
  state?: string;
  city?: string;
  description?: string;
  isActive?: boolean;
  createdBy?: string;
}

export interface UpdateHolidayInput {
  name?: string;
  date?: Date | string;
  type?: HolidayType;
  isRecurring?: boolean;
  state?: string;
  city?: string;
  description?: string;
  isActive?: boolean;
}

export interface HolidayFilter {
  year?: number;
  month?: number;
  type?: HolidayType;
  state?: string;
  city?: string;
  isActive?: boolean;
  isRecurring?: boolean;
}

export class HolidayService {
  /**
   * Cria um novo feriado
   */
  async createHoliday(input: CreateHolidayInput): Promise<Holiday> {
    let normalizedDate: Date;
    
    if (typeof input.date === 'string') {
      // Se for string no formato YYYY-MM-DD, criar data diretamente no timezone local
      if (input.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = input.date.split('-').map(Number);
        normalizedDate = moment.tz([year, month - 1, day], 'America/Sao_Paulo').startOf('day').toDate();
      } else {
        // Para outros formatos, usar moment normalmente
        normalizedDate = moment(input.date).tz('America/Sao_Paulo').startOf('day').toDate();
      }
    } else {
      // Se já for Date, normalizar no timezone de São Paulo
      normalizedDate = moment(input.date).tz('America/Sao_Paulo').startOf('day').toDate();
    }

    // Verificar se já existe feriado na mesma data com o mesmo nome
    const existing = await prisma.holiday.findFirst({
      where: {
        date: normalizedDate,
        name: input.name,
      },
    });

    if (existing) {
      throw new Error('Já existe um feriado com este nome nesta data');
    }

    return prisma.holiday.create({
      data: {
        name: input.name,
        date: normalizedDate,
        type: input.type || 'NATIONAL',
        isRecurring: input.isRecurring ?? false,
        state: input.state,
        city: input.city,
        description: input.description,
        isActive: input.isActive ?? true,
        createdBy: input.createdBy,
      },
    });
  }

  /**
   * Busca feriados com filtros
   */
  async getHolidays(filter: HolidayFilter = {}): Promise<Holiday[]> {
    const baseWhere: any = {};

    if (filter.year || filter.month) {
      const monthStr = filter.month ? String(filter.month).padStart(2, '0') : '01';
      const startDate = filter.year && filter.month
        ? moment(`${filter.year}-${monthStr}-01`).startOf('month').toDate()
        : filter.year
        ? moment(`${filter.year}-01-01`).startOf('year').toDate()
        : undefined;

      const endDate = filter.year && filter.month
        ? moment(`${filter.year}-${monthStr}-01`).endOf('month').toDate()
        : filter.year
        ? moment(`${filter.year}-12-31`).endOf('year').toDate()
        : undefined;

      if (startDate && endDate) {
        baseWhere.date = {
          gte: startDate,
          lte: endDate,
        };
      }
    }

    if (filter.type) {
      baseWhere.type = filter.type;
    }

    if (filter.city) {
      baseWhere.city = filter.city;
    }

    if (filter.isActive !== undefined) {
      baseWhere.isActive = filter.isActive;
    }

    if (filter.isRecurring !== undefined) {
      baseWhere.isRecurring = filter.isRecurring;
    }

    // Se fornecido estado, mostrar apenas feriados nacionais (sem estado) ou do estado especificado
    const where: any = filter.state
      ? {
          ...baseWhere,
          OR: [
            { state: null },
            { state: filter.state },
          ],
        }
      : {
          ...baseWhere,
          ...(filter.state === null ? { state: null } : {}), // Se explicitamente null, filtrar apenas nacionais
        };

    return prisma.holiday.findMany({
      where,
      orderBy: {
        date: 'asc',
      },
    });
  }

  /**
   * Busca um feriado por ID
   */
  async getHolidayById(id: string): Promise<Holiday | null> {
    return prisma.holiday.findUnique({
      where: { id },
    });
  }

  /**
   * Verifica se uma data é feriado
   * @param date Data a verificar
   * @param state Estado (opcional) - se fornecido, verifica apenas feriados nacionais ou do estado especificado
   */
  async isHoliday(date: Date | string, state?: string): Promise<boolean> {
    const checkDate = typeof date === 'string' ? new Date(date) : date;
    const normalizedDate = moment(checkDate).startOf('day').toDate();

    // Construir filtro de estado
    const stateFilter: any = state 
      ? {
          OR: [
            { state: null }, // Feriados nacionais (sem estado)
            { state: state }, // Feriados do estado especificado
          ]
        }
      : {};

    const holiday = await prisma.holiday.findFirst({
      where: {
        date: normalizedDate,
        isActive: true,
        ...stateFilter,
      },
    });

    if (holiday) {
      return true;
    }

    // Verificar feriados recorrentes (mesmo dia e mês, qualquer ano)
    const day = moment(checkDate).date();
    const month = moment(checkDate).month() + 1; // moment usa 0-11, precisamos 1-12

    const recurringHolidays = await prisma.holiday.findMany({
      where: {
        isRecurring: true,
        isActive: true,
        ...stateFilter,
      },
    });

    return recurringHolidays.some(h => {
      const holidayDate = moment(h.date);
      return holidayDate.date() === day && (holidayDate.month() + 1) === month;
    });
  }

  /**
   * Busca feriado em uma data específica
   * @param date Data a verificar
   * @param state Estado (opcional) - se fornecido, busca apenas feriados nacionais ou do estado especificado
   */
  async getHolidayByDate(date: Date | string, state?: string): Promise<Holiday | null> {
    const checkDate = typeof date === 'string' ? new Date(date) : date;
    const normalizedDate = moment(checkDate).startOf('day').toDate();

    // Construir filtro de estado
    const stateFilter: any = state 
      ? {
          OR: [
            { state: null }, // Feriados nacionais (sem estado)
            { state: state }, // Feriados do estado especificado
          ]
        }
      : {};

    // Primeiro, buscar feriado exato na data
    let holiday = await prisma.holiday.findFirst({
      where: {
        date: normalizedDate,
        isActive: true,
        ...stateFilter,
      },
    });

    if (holiday) {
      return holiday;
    }

    // Se não encontrou, verificar feriados recorrentes
    const day = moment(checkDate).date();
    const month = moment(checkDate).month() + 1;

    const recurringHolidays = await prisma.holiday.findMany({
      where: {
        isRecurring: true,
        isActive: true,
        ...stateFilter,
      },
    });

    const matchingRecurring = recurringHolidays.find(h => {
      const holidayDate = moment(h.date);
      return holidayDate.date() === day && (holidayDate.month() + 1) === month;
    });

    return matchingRecurring || null;
  }

  /**
   * Atualiza um feriado
   */
  async updateHoliday(id: string, input: UpdateHolidayInput): Promise<Holiday> {
    const updateData: any = { ...input };

    if (input.date) {
      let normalizedDate: Date;
      
      if (typeof input.date === 'string') {
        // Se for string no formato YYYY-MM-DD, criar data diretamente no timezone local
        if (input.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
          const [year, month, day] = input.date.split('-').map(Number);
          normalizedDate = moment.tz([year, month - 1, day], 'America/Sao_Paulo').startOf('day').toDate();
        } else {
          // Para outros formatos, usar moment normalmente
          normalizedDate = moment(input.date).tz('America/Sao_Paulo').startOf('day').toDate();
        }
      } else {
        // Se já for Date, normalizar no timezone de São Paulo
        normalizedDate = moment(input.date).tz('America/Sao_Paulo').startOf('day').toDate();
      }
      
      updateData.date = normalizedDate;
    }

    return prisma.holiday.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Deleta um feriado
   */
  async deleteHoliday(id: string): Promise<void> {
    await prisma.holiday.delete({
      where: { id },
    });
  }

  /**
   * Importa feriados nacionais do Brasil para um ano específico
   */
  async importNationalHolidays(year: number, createdBy?: string): Promise<Holiday[]> {
    const holidays: CreateHolidayInput[] = [
      {
        name: 'Confraternização Universal',
        date: `${year}-01-01`,
        type: 'NATIONAL',
        isRecurring: true,
        description: 'Dia 1º de Janeiro',
      },
      {
        name: 'Carnaval',
        date: this.calculateCarnival(year),
        type: 'OPTIONAL',
        isRecurring: false,
        description: 'Data variável (47 dias antes da Páscoa)',
      },
      {
        name: 'Sexta-feira Santa',
        date: this.calculateGoodFriday(year),
        type: 'NATIONAL',
        isRecurring: false,
        description: 'Data variável (2 dias antes da Páscoa)',
      },
      {
        name: 'Tiradentes',
        date: `${year}-04-21`,
        type: 'NATIONAL',
        isRecurring: true,
        description: 'Dia 21 de Abril',
      },
      {
        name: 'Dia do Trabalho',
        date: `${year}-05-01`,
        type: 'NATIONAL',
        isRecurring: true,
        description: 'Dia 1º de Maio',
      },
      {
        name: 'Corpus Christi',
        date: this.calculateCorpusChristi(year),
        type: 'OPTIONAL',
        isRecurring: false,
        description: 'Data variável (60 dias após a Páscoa)',
      },
      {
        name: 'Independência do Brasil',
        date: `${year}-09-07`,
        type: 'NATIONAL',
        isRecurring: true,
        description: 'Dia 7 de Setembro',
      },
      {
        name: 'Nossa Senhora Aparecida',
        date: `${year}-10-12`,
        type: 'NATIONAL',
        isRecurring: true,
        description: 'Dia 12 de Outubro',
      },
      {
        name: 'Finados',
        date: `${year}-11-02`,
        type: 'NATIONAL',
        isRecurring: true,
        description: 'Dia 2 de Novembro',
      },
      {
        name: 'Proclamação da República',
        date: `${year}-11-15`,
        type: 'NATIONAL',
        isRecurring: true,
        description: 'Dia 15 de Novembro',
      },
      {
        name: 'Dia Nacional de Zumbi e da Consciência Negra',
        date: `${year}-11-20`,
        type: 'OPTIONAL',
        isRecurring: true,
        description: 'Dia 20 de Novembro (Ponto facultativo em alguns estados)',
      },
      {
        name: 'Natal',
        date: `${year}-12-25`,
        type: 'NATIONAL',
        isRecurring: true,
        description: 'Dia 25 de Dezembro',
      },
    ];

    const createdHolidays: Holiday[] = [];

    for (const holiday of holidays) {
      try {
        const created = await this.createHoliday({
          ...holiday,
          createdBy,
        });
        createdHolidays.push(created);
      } catch (error: any) {
        // Se já existe, apenas ignora
        if (!error.message.includes('Já existe')) {
          throw error;
        }
      }
    }

    return createdHolidays;
  }

  /**
   * Calcula a data do Carnaval (47 dias antes da Páscoa)
   */
  private calculateCarnival(year: number): string {
    const easter = this.calculateEaster(year);
    const carnival = moment(easter).subtract(47, 'days');
    return carnival.format('YYYY-MM-DD');
  }

  /**
   * Calcula a data da Sexta-feira Santa (2 dias antes da Páscoa)
   */
  private calculateGoodFriday(year: number): string {
    const easter = this.calculateEaster(year);
    const goodFriday = moment(easter).subtract(2, 'days');
    return goodFriday.format('YYYY-MM-DD');
  }

  /**
   * Calcula a data de Corpus Christi (60 dias após a Páscoa)
   */
  private calculateCorpusChristi(year: number): string {
    const easter = this.calculateEaster(year);
    const corpusChristi = moment(easter).add(60, 'days');
    return corpusChristi.format('YYYY-MM-DD');
  }

  /**
   * Calcula a data da Páscoa usando o algoritmo de Meeus/Jones/Butcher
   */
  private calculateEaster(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    // Criar data no timezone de São Paulo para evitar problemas de timezone
    return moment.tz([year, month - 1, day], 'America/Sao_Paulo').toDate();
  }

  /**
   * Gera feriados recorrentes para um ano específico
   */
  async generateRecurringHolidays(year: number, createdBy?: string): Promise<Holiday[]> {
    const recurringHolidays = await prisma.holiday.findMany({
      where: {
        isRecurring: true,
        isActive: true,
      },
    });

    const createdHolidays: Holiday[] = [];

    for (const holiday of recurringHolidays) {
      const holidayDate = moment(holiday.date);
      const month = holidayDate.month() + 1; // moment usa 0-11
      const day = holidayDate.date();
      const dateString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      try {
        const created = await this.createHoliday({
          name: holiday.name,
          date: dateString, // Passar como string para usar a lógica de timezone correta
          type: holiday.type,
          isRecurring: false, // O novo feriado não é recorrente, é específico do ano
          state: holiday.state ?? undefined,
          city: holiday.city ?? undefined,
          description: holiday.description ?? undefined,
          isActive: true,
          createdBy,
        });
        createdHolidays.push(created);
      } catch (error: any) {
        // Se já existe, apenas ignora
        if (!error.message.includes('Já existe')) {
          throw error;
        }
      }
    }

    return createdHolidays;
  }

  /**
   * Busca feriados de um período
   * @param startDate Data inicial
   * @param endDate Data final
   * @param state Estado (opcional) - se fornecido, busca apenas feriados nacionais ou do estado especificado
   */
  async getHolidaysByPeriod(startDate: Date | string, endDate: Date | string, state?: string): Promise<Holiday[]> {
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

    const normalizedStart = moment(start).startOf('day').toDate();
    const normalizedEnd = moment(end).endOf('day').toDate();

    // OTIMIZAÇÃO: Usar cache para feriados
    const startMonth = moment(normalizedStart).month() + 1;
    const startYear = moment(normalizedStart).year();
    const endMonth = moment(normalizedEnd).month() + 1;
    const endYear = moment(normalizedEnd).year();
    
    // Se for o mesmo mês, usar cache
    if (startMonth === endMonth && startYear === endYear) {
      const cacheKey = `holidays-${startYear}-${startMonth}${state ? `-${state}` : ''}`;
      const cached = cache.get<Holiday[]>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Construir filtro de estado
    const stateFilter: any = state 
      ? {
          OR: [
            { state: null }, // Feriados nacionais (sem estado)
            { state: state }, // Feriados do estado especificado
          ]
        }
      : {};

    // Buscar feriados fixos no período
    const fixedHolidays = await prisma.holiday.findMany({
      where: {
        date: {
          gte: normalizedStart,
          lte: normalizedEnd,
        },
        isActive: true,
        ...stateFilter,
      },
      orderBy: {
        date: 'asc',
      },
    });

    // Buscar feriados recorrentes que caem no período
    const recurringHolidays = await prisma.holiday.findMany({
      where: {
        isRecurring: true,
        isActive: true,
        ...stateFilter,
      },
    });

    const recurringInPeriod: Holiday[] = [];

    for (const holiday of recurringHolidays) {
      const holidayDate = moment(holiday.date);
      const currentYear = moment(normalizedStart).year();
      const endYear = moment(normalizedEnd).year();

      for (let year = currentYear; year <= endYear; year++) {
        // Usar formato ISO válido (YYYY-MM-DD) com padding zero
        const month = String(holidayDate.month() + 1).padStart(2, '0');
        const day = String(holidayDate.date()).padStart(2, '0');
        const checkDate = moment(`${year}-${month}-${day}`, 'YYYY-MM-DD');
        
        if (checkDate.isSameOrAfter(normalizedStart, 'day') && 
            checkDate.isSameOrBefore(normalizedEnd, 'day')) {
          // Verificar se já não existe um feriado fixo nesta data
          const exists = fixedHolidays.some(fh => 
            moment(fh.date).isSame(checkDate, 'day')
          );

          if (!exists) {
            recurringInPeriod.push({
              ...holiday,
              date: checkDate.toDate(),
            } as Holiday);
          }
        }
      }
    }

    const result = [...fixedHolidays, ...recurringInPeriod].sort((a, b) => 
      moment(a.date).diff(moment(b.date))
    );

    // OTIMIZAÇÃO: Cachear resultado se for do mesmo mês
    if (startMonth === endMonth && startYear === endYear) {
      const cacheKey = `holidays-${startYear}-${startMonth}${state ? `-${state}` : ''}`;
      cache.set(cacheKey, result, 3600); // Cache por 1 hora
    }

    return result;
  }

  /**
   * Conta quantos dias úteis há em um período (excluindo sábados, domingos e feriados)
   * @param startDate Data inicial
   * @param endDate Data final
   * @param state Estado (opcional) - se fornecido, considera apenas feriados nacionais ou do estado especificado
   */
  async countWorkingDays(startDate: Date | string, endDate: Date | string, state?: string): Promise<number> {
    const start = typeof startDate === 'string' ? new Date(startDate) : startDate;
    const end = typeof endDate === 'string' ? new Date(endDate) : endDate;

    const holidays = await this.getHolidaysByPeriod(start, end, state);
    const holidayDates = new Set(
      holidays.map(h => moment(h.date).format('YYYY-MM-DD'))
    );

    let count = 0;
    const current = moment(start);

    while (current.isSameOrBefore(end, 'day')) {
      const dayOfWeek = current.day(); // 0 = domingo, 6 = sábado
      const dateStr = current.format('YYYY-MM-DD');

      // Se não é fim de semana e não é feriado
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidayDates.has(dateStr)) {
        count++;
      }

      current.add(1, 'day');
    }

    return count;
  }
}

