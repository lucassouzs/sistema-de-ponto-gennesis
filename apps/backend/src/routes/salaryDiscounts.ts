import { Router } from 'express';
import { SalaryDiscountController } from '../controllers/SalaryDiscountController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const salaryDiscountController = new SalaryDiscountController();

// Aplicar middleware de autenticação para todas as rotas
router.use(authenticate);

// Rotas para descontos salariais
router.post('/', (req, res, next) => salaryDiscountController.createDiscount(req, res, next));
router.get('/employee/:employeeId', (req, res, next) => salaryDiscountController.getEmployeeDiscounts(req, res, next));
router.get('/:id', (req, res, next) => salaryDiscountController.getDiscountById(req, res, next));
router.put('/:id', (req, res, next) => salaryDiscountController.updateDiscount(req, res, next));
router.delete('/:id', (req, res, next) => salaryDiscountController.deleteDiscount(req, res, next));

export default router;
