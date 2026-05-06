import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { OvertimeController } from '../controllers/OvertimeController';

const router = express.Router();
const overtimeController = new OvertimeController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rotas para funcionários
router.post('/request', overtimeController.requestOvertime);
router.get('/my-overtime', overtimeController.getMyOvertime);
router.get('/my-overtime/balance', overtimeController.getOvertimeBalance);

// Rotas para funcionários (todas as funcionalidades)
router.get('/', overtimeController.getAllOvertime);
router.get('/pending', overtimeController.getPendingOvertime);
router.put('/:id/approve', overtimeController.approveOvertime);
router.put('/:id/reject', overtimeController.rejectOvertime);

// Relatórios
router.get('/reports/summary', overtimeController.getOvertimeSummary);

export default router;
