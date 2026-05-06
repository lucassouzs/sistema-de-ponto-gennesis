import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { HolidayService } from '../services/HolidayService';

const holidayService = new HolidayService();

export class HolidayController {
  /**
   * Cria um novo feriado
   */
  async createHoliday(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, date, type, isRecurring, state, city, description, isActive } = req.body;
      const userId = req.user?.id;

      if (!name || !date) {
        throw createError('Nome e data são obrigatórios', 400);
      }

      const holiday = await holidayService.createHoliday({
        name,
        date,
        type,
        isRecurring,
        state,
        city,
        description,
        isActive,
        createdBy: userId,
      });

      return res.status(201).json({
        success: true,
        data: holiday,
        message: 'Feriado criado com sucesso',
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Lista feriados com filtros
   */
  async getHolidays(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year, month, type, state, city, isActive, isRecurring } = req.query;

      const filter: any = {};

      if (year) filter.year = parseInt(year as string, 10);
      if (month) filter.month = parseInt(month as string, 10);
      if (type) filter.type = type;
      if (state) filter.state = state as string;
      if (city) filter.city = city as string;
      if (isActive !== undefined) filter.isActive = isActive === 'true';
      if (isRecurring !== undefined) filter.isRecurring = isRecurring === 'true';

      console.log('🔍 Buscando feriados com filtros:', filter);
      const holidays = await holidayService.getHolidays(filter);
      console.log('✅ Feriados encontrados:', holidays.length);

      return res.status(200).json({
        success: true,
        data: holidays,
        count: holidays.length,
      });
    } catch (error) {
      console.error('❌ Erro ao buscar feriados:', error);
      return next(error);
    }
  }

  /**
   * Busca feriado por ID
   */
  async getHolidayById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const holiday = await holidayService.getHolidayById(id);

      if (!holiday) {
        throw createError('Feriado não encontrado', 404);
      }

      return res.status(200).json({
        success: true,
        data: holiday,
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Verifica se uma data é feriado
   */
  async checkIsHoliday(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { date, state } = req.query;

      if (!date) {
        throw createError('Data é obrigatória', 400);
      }

      const stateParam = state ? (state as string) : undefined;
      const isHoliday = await holidayService.isHoliday(date as string, stateParam);
      const holiday = await holidayService.getHolidayByDate(date as string, stateParam);

      return res.status(200).json({
        success: true,
        data: {
          isHoliday,
          holiday: holiday || null,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Busca feriados de um período
   */
  async getHolidaysByPeriod(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, state } = req.query;

      if (!startDate || !endDate) {
        throw createError('Data inicial e data final são obrigatórias', 400);
      }

      const stateParam = state ? (state as string) : undefined;
      const holidays = await holidayService.getHolidaysByPeriod(
        startDate as string,
        endDate as string,
        stateParam
      );

      return res.status(200).json({
        success: true,
        data: holidays,
        count: holidays.length,
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Conta dias úteis em um período
   */
  async countWorkingDays(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, state } = req.query;

      if (!startDate || !endDate) {
        throw createError('Data inicial e data final são obrigatórias', 400);
      }

      const stateParam = state ? (state as string) : undefined;
      const workingDays = await holidayService.countWorkingDays(
        startDate as string,
        endDate as string,
        stateParam
      );

      return res.status(200).json({
        success: true,
        data: {
          startDate,
          endDate,
          state: stateParam || 'Todos',
          workingDays,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Atualiza um feriado
   */
  async updateHoliday(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, date, type, isRecurring, state, city, description, isActive } = req.body;

      const holiday = await holidayService.updateHoliday(id, {
        name,
        date,
        type,
        isRecurring,
        state,
        city,
        description,
        isActive,
      });

      return res.status(200).json({
        success: true,
        data: holiday,
        message: 'Feriado atualizado com sucesso',
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Deleta um feriado
   */
  async deleteHoliday(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await holidayService.deleteHoliday(id);

      return res.status(200).json({
        success: true,
        message: 'Feriado deletado com sucesso',
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Importa feriados nacionais para um ano
   */
  async importNationalHolidays(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year } = req.body;
      const userId = req.user?.id;

      if (!year) {
        throw createError('Ano é obrigatório', 400);
      }

      const holidays = await holidayService.importNationalHolidays(year, userId);

      return res.status(201).json({
        success: true,
        data: holidays,
        count: holidays.length,
        message: `Feriados nacionais importados com sucesso para ${year}`,
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Gera feriados recorrentes para um ano
   */
  async generateRecurringHolidays(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year } = req.body;
      const userId = req.user?.id;

      if (!year) {
        throw createError('Ano é obrigatório', 400);
      }

      const holidays = await holidayService.generateRecurringHolidays(year, userId);

      return res.status(201).json({
        success: true,
        data: holidays,
        count: holidays.length,
        message: `Feriados recorrentes gerados com sucesso para ${year}`,
      });
    } catch (error) {
      return next(error);
    }
  }
}

