import { Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { SalaryAdjustmentService, CreateAdjustmentData, UpdateAdjustmentData } from '../services/SalaryAdjustmentService';

const salaryAdjustmentService = new SalaryAdjustmentService();

export class SalaryAdjustmentController {
  /**
   * Criar acréscimo salarial
   */
  async createAdjustment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { employeeId, type, description, amount } = req.body;

      // Validar parâmetros obrigatórios
      if (!employeeId || !type || !description || !amount) {
        throw createError('Todos os campos são obrigatórios', 400);
      }

      // Validar valores
      if (amount <= 0) {
        throw createError('Valor deve ser maior que zero', 400);
      }

      if (description.length < 3) {
        throw createError('Descrição deve ter pelo menos 3 caracteres', 400);
      }

      const data: CreateAdjustmentData = {
        employeeId,
        type,
        description: description.trim(),
        amount: parseFloat(amount),
        createdBy: userId
      };

      const adjustment = await salaryAdjustmentService.createAdjustment(data);

      res.status(201).json({
        success: true,
        data: adjustment,
        message: 'Acréscimo salarial criado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Listar acréscimos por funcionário
   */
  async getEmployeeAdjustments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params;

      const adjustments = await salaryAdjustmentService.getAdjustmentsByEmployee(employeeId);

      res.json({
        success: true,
        data: adjustments
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar acréscimo
   */
  async updateAdjustment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { type, description, amount } = req.body;

      // Validar se pelo menos um campo foi fornecido
      if (!type && !description && !amount) {
        throw createError('Pelo menos um campo deve ser fornecido para atualização', 400);
      }

      // Validar valores se fornecidos
      if (amount !== undefined && amount <= 0) {
        throw createError('Valor deve ser maior que zero', 400);
      }

      if (description !== undefined && description.length < 3) {
        throw createError('Descrição deve ter pelo menos 3 caracteres', 400);
      }

      const data: UpdateAdjustmentData = {};
      
      if (type) data.type = type;
      if (description) data.description = description.trim();
      if (amount !== undefined) data.amount = parseFloat(amount);

      const adjustment = await salaryAdjustmentService.updateAdjustment(id, data);

      res.json({
        success: true,
        data: adjustment,
        message: 'Acréscimo salarial atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deletar acréscimo
   */
  async deleteAdjustment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      await salaryAdjustmentService.deleteAdjustment(id);

      res.json({
        success: true,
        message: 'Acréscimo salarial deletado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter acréscimo por ID
   */
  async getAdjustmentById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const adjustment = await salaryAdjustmentService.getAdjustmentById(id);

      if (!adjustment) {
        throw createError('Acréscimo não encontrado', 404);
      }

      res.json({
        success: true,
        data: adjustment
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Calcular total de acréscimos por funcionário
   */
  async getTotalAdjustments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params;

      const total = await salaryAdjustmentService.getTotalAdjustments(employeeId);

      res.json({
        success: true,
        data: { total }
      });
    } catch (error) {
      next(error);
    }
  }
}