import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { ReportController } from '../controllers/ReportController';

const router = express.Router();
const reportController = new ReportController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rotas para administradores e RH
router.get('/', authorize('ADMIN', 'HR'), reportController.getAllReports);
router.get('/:id', authorize('ADMIN', 'HR'), reportController.getReportById);
router.post('/generate', authorize('ADMIN', 'HR'), reportController.generateReport);
router.get('/:id/download', authorize('ADMIN', 'HR'), reportController.downloadReport);

// Relatórios específicos
router.get('/attendance/summary', authorize('ADMIN', 'HR'), reportController.getAttendanceSummary);
router.get('/productivity/analysis', authorize('ADMIN', 'HR'), reportController.getProductivityAnalysis);
router.get('/overtime/summary', authorize('ADMIN', 'HR'), reportController.getOvertimeSummary);
router.get('/vacation/summary', authorize('ADMIN', 'HR'), reportController.getVacationSummary);

export default router;
