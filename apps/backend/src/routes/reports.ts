import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { ReportController } from '../controllers/ReportController';

const router = express.Router();
const reportController = new ReportController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rotas para funcionários (todas as funcionalidades)
router.get('/', reportController.getAllReports);
router.get('/:id', reportController.getReportById);
router.post('/generate', reportController.generateReport);
router.get('/:id/download', reportController.downloadReport);

// Relatórios específicos
router.get('/attendance/summary', reportController.getAttendanceSummary);
router.get('/productivity/analysis', reportController.getProductivityAnalysis);
router.get('/overtime/summary', reportController.getOvertimeSummary);
router.get('/vacation/summary', reportController.getVacationSummary);

export default router;
