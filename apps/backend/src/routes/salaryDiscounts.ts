import { Router } from 'express';
import { SalaryDiscountController } from '../controllers/SalaryDiscountController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const salaryDiscountController = new SalaryDiscountController();

// Aplicar middleware de autenticação e autorização para todas as rotas
router.use(authenticate);
router.use(requireRole(['ADMIN']));

// Rotas para descontos salariais
router.post('/', salaryDiscountController.createDiscount);
router.get('/employee/:employeeId', salaryDiscountController.getEmployeeDiscounts);
router.get('/:id', salaryDiscountController.getDiscountById);
router.put('/:id', salaryDiscountController.updateDiscount);
router.delete('/:id', salaryDiscountController.deleteDiscount);

export default router;
