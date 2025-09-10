import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { VacationController } from '../controllers/VacationController';

const router = express.Router();
const vacationController = new VacationController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rotas para funcionários
router.post('/request', vacationController.requestVacation);
router.get('/my-vacations', vacationController.getMyVacations);
router.get('/my-vacations/balance', vacationController.getVacationBalance);
router.put('/:id/cancel', vacationController.cancelVacation);

// Rotas para administradores e RH
router.get('/', authorize('ADMIN', 'HR'), vacationController.getAllVacations);
router.get('/pending', authorize('ADMIN', 'HR'), vacationController.getPendingVacations);
router.put('/:id/approve', authorize('ADMIN', 'HR'), vacationController.approveVacation);
router.put('/:id/reject', authorize('ADMIN', 'HR'), vacationController.rejectVacation);

// Relatórios
router.get('/reports/summary', authorize('ADMIN', 'HR'), vacationController.getVacationSummary);

export default router;
