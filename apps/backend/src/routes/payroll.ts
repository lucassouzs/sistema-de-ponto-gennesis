import { Router } from 'express';
import { PayrollController } from '../controllers/PayrollController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const payrollController = new PayrollController();

// Todas as rotas de folha de pagamento requerem autenticação e permissão de funcionário
router.use(authenticate);
router.use(requireRole(['EMPLOYEE']));

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

// Salvar valores manuais de INSS
router.post('/manual-inss', (req, res, next) => 
  payrollController.saveManualInssValues(req, res, next)
);

// Finalizar folha de pagamento (apenas DP)
router.post('/finalize', (req, res, next) => 
  payrollController.finalizePayroll(req, res, next)
);

// Obter status da folha de pagamento
router.get('/status', (req, res, next) => 
  payrollController.getPayrollStatus(req, res, next)
);

// Reabrir folha de pagamento (apenas Financeiro)
router.post('/reopen', (req, res, next) => 
  payrollController.reopenPayroll(req, res, next)
);

export default router;
