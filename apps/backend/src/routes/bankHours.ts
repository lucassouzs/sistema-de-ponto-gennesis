import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { BankHoursController } from '../controllers/BankHoursController';

const router = express.Router();
const bankHoursController = new BankHoursController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rota para buscar banco de horas por funcionário (todos os funcionários)
router.get('/employees', bankHoursController.getBankHoursByEmployee);

export default router;
