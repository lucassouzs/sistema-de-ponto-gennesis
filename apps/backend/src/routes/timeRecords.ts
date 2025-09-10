import express from 'express';
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

// Rotas para administradores e RH
router.get('/', authorize('ADMIN', 'HR'), timeRecordController.getAllRecords);
router.get('/:id', authorize('ADMIN', 'HR'), timeRecordController.getRecordById);
router.put('/:id/validate', authorize('ADMIN', 'HR'), timeRecordController.validateRecord);
router.put('/:id/invalidate', authorize('ADMIN', 'HR'), timeRecordController.invalidateRecord);

// Relatórios
router.get('/reports/attendance', authorize('ADMIN', 'HR'), timeRecordController.getAttendanceReport);
router.get('/reports/late-arrivals', authorize('ADMIN', 'HR'), timeRecordController.getLateArrivalsReport);

export default router;
