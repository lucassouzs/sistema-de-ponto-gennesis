import express, { Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { TimeRecordController } from '../controllers/TimeRecordController';
import { uploadPhoto, handleUploadError } from '../middleware/upload';

const router = express.Router();
const timeRecordController = new TimeRecordController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rotas para funcionários
router.post('/punch', uploadPhoto.single('photo'), handleUploadError, timeRecordController.punchInOut);
router.get('/my-records', timeRecordController.getMyRecords);
router.get('/my-records/today', timeRecordController.getTodayRecords);
router.get('/my-records/period', timeRecordController.getRecordsByPeriod);
router.get('/my-records/bank-hours', timeRecordController.getBankHours);

// Rotas para administradores e RH
router.get('/', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), timeRecordController.getAllRecords);
router.get('/:id', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), timeRecordController.getRecordById);
router.put('/:id/validate', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), timeRecordController.validateRecord);
router.put('/:id/invalidate', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), timeRecordController.invalidateRecord);

// Rota para editar registros - APENAS ADMINISTRADORES
router.put('/:id', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL'), timeRecordController.updateRecord);

// Rota para deletar registros - APENAS ADMINISTRADORES E DEPARTAMENTO PESSOAL
router.delete('/:id', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL'), timeRecordController.deleteRecord);

// Relatórios
router.get('/reports/attendance', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), timeRecordController.getAttendanceReport);
router.get('/reports/late-arrivals', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), timeRecordController.getLateArrivalsReport);

// Centro de custo por funcionário
router.get('/employee/:employeeId/cost-center', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL', 'GESTOR', 'DIRETOR'), timeRecordController.getEmployeeCostCenter);

// Criar ponto manualmente (apenas ADMIN)
router.post('/manual', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL'), timeRecordController.createManualRecord);

// Importar pontos de planilha (apenas ADMIN e DEPARTAMENTO_PESSOAL)
router.post('/import', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL'), timeRecordController.importRecordsFromSpreadsheet);

// Registrar faltas manualmente (apenas ADMIN e DEPARTAMENTO_PESSOAL)
router.post('/absence', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL'), timeRecordController.registerAbsence);
router.post('/absence/multiple', authorize('ADMIN', 'DEPARTAMENTO_PESSOAL'), timeRecordController.registerMultipleAbsences);

export default router;
