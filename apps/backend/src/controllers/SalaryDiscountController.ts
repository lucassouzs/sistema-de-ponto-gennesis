import { Request, Response, NextFunction } from 'express';
import { SalaryDiscountService, CreateDiscountData, UpdateDiscountData } from '../services/SalaryDiscountService';
import { AuthRequest } from '../middleware/auth';

const salaryDiscountService = new SalaryDiscountService();

export class SalaryDiscountController {
  /**
   * Cria um novo desconto salarial
   */
  async createDiscount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { employeeId, type, description, amount } = req.body;
      const createdBy = req.user?.id;

      if (!createdBy) {
        res.status(401).json({ error: 'Usuário não autenticado' });
        return;
      }

      // Validações básicas
      if (!employeeId || !type || !description || amount === undefined) {
        res.status(400).json({ 
          error: 'Todos os campos são obrigatórios: employeeId, type, description, amount' 
        });
        return;
      }

      if (amount <= 0) {
        res.status(400).json({ 
          error: 'O valor do desconto deve ser maior que zero' 
        });
        return;
      }

      const createData: CreateDiscountData = {
        employeeId,
        type,
        description,
        amount: Number(amount),
        createdBy,
      };

      console.log('Creating discount with data:', createData);

      const discount = await salaryDiscountService.createDiscount(createData);

      res.status(201).json({
        success: true,
        data: discount,
        message: 'Desconto criado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao criar desconto:', error);
      next(error);
    }
  }

  /**
   * Obtém todos os descontos de um funcionário
   */
  async getEmployeeDiscounts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { employeeId } = req.params;

      if (!employeeId) {
        res.status(400).json({ error: 'ID do funcionário é obrigatório' });
        return;
      }

      const discounts = await salaryDiscountService.getDiscountsByEmployee(employeeId);

      res.json({
        success: true,
        data: discounts
      });
    } catch (error) {
      console.error('Erro ao buscar descontos:', error);
      next(error);
    }
  }

  /**
   * Atualiza um desconto salarial
   */
  async updateDiscount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { type, description, amount } = req.body;

      if (!id) {
        res.status(400).json({ error: 'ID do desconto é obrigatório' });
        return;
      }

      const updateData: UpdateDiscountData = {};

      if (type !== undefined) updateData.type = type;
      if (description !== undefined) updateData.description = description;
      if (amount !== undefined) {
        if (amount <= 0) {
          res.status(400).json({ 
            error: 'O valor do desconto deve ser maior que zero' 
          });
          return;
        }
        updateData.amount = Number(amount);
      }

      const discount = await salaryDiscountService.updateDiscount(id, updateData);

      res.json({
        success: true,
        data: discount,
        message: 'Desconto atualizado com sucesso'
      });
    } catch (error) {
      console.error('Erro ao atualizar desconto:', error);
      next(error);
    }
  }

  /**
   * Remove um desconto salarial
   */
  async deleteDiscount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'ID do desconto é obrigatório' });
        return;
      }

      await salaryDiscountService.deleteDiscount(id);

      res.json({
        success: true,
        message: 'Desconto removido com sucesso'
      });
    } catch (error) {
      console.error('Erro ao remover desconto:', error);
      next(error);
    }
  }

  /**
   * Obtém um desconto por ID
   */
  async getDiscountById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({ error: 'ID do desconto é obrigatório' });
        return;
      }

      const discount = await salaryDiscountService.getDiscountById(id);

      if (!discount) {
        res.status(404).json({ error: 'Desconto não encontrado' });
        return;
      }

      res.json({
        success: true,
        data: discount
      });
    } catch (error) {
      console.error('Erro ao buscar desconto:', error);
      next(error);
    }
  }
}
