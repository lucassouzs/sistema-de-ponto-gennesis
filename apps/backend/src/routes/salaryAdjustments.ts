import { Router } from 'express';
import { SalaryAdjustmentController } from '../controllers/SalaryAdjustmentController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const salaryAdjustmentController = new SalaryAdjustmentController();

// Todas as rotas de acréscimos salariais requerem apenas autenticação
router.use(authenticate);

// Criar acréscimo salarial
router.post('/', (req, res, next) => 
  salaryAdjustmentController.createAdjustment(req, res, next)
);

// Listar acréscimos por funcionário
router.get('/employee/:employeeId', (req, res, next) => 
  salaryAdjustmentController.getEmployeeAdjustments(req, res, next)
);

// Obter acréscimo por ID
router.get('/:id', (req, res, next) => 
  salaryAdjustmentController.getAdjustmentById(req, res, next)
);

// Atualizar acréscimo
router.put('/:id', (req, res, next) => 
  salaryAdjustmentController.updateAdjustment(req, res, next)
);

// Deletar acréscimo
router.delete('/:id', (req, res, next) => 
  salaryAdjustmentController.deleteAdjustment(req, res, next)
);

// Calcular total de acréscimos por funcionário
router.get('/employee/:employeeId/total', (req, res, next) => 
  salaryAdjustmentController.getTotalAdjustments(req, res, next)
);

export default router;