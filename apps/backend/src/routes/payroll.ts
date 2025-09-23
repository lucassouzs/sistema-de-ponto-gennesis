import { Router } from 'express';
import { PayrollController } from '../controllers/PayrollController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const payrollController = new PayrollController();

// Todas as rotas de folha de pagamento requerem autenticação e permissão de admin
router.use(authenticate);
router.use(requireRole(['ADMIN']));

// Gerar folha de pagamento mensal
router.get('/monthly', (req, res, next) => 
  payrollController.generateMonthlyPayroll(req, res, next)
);

// Obter dados de um funcionário específico para folha
router.get('/employee/:employeeId', (req, res, next) => 
  payrollController.getEmployeePayrollData(req, res, next)
);

// Obter estatísticas por empresa
router.get('/stats/company', (req, res, next) => 
  payrollController.getPayrollStatsByCompany(req, res, next)
);

// Obter estatísticas por departamento
router.get('/stats/department', (req, res, next) => 
  payrollController.getPayrollStatsByDepartment(req, res, next)
);

// Obter lista de funcionários para folha (com paginação)
router.get('/employees', (req, res, next) => 
  payrollController.getEmployeesForPayroll(req, res, next)
);

export default router;
