import { Router } from 'express';
import { MedicalCertificateController } from '../controllers/MedicalCertificateController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';
import { uploadPhoto } from '../middleware/upload';

const router = Router();
const medicalCertificateController = new MedicalCertificateController();

// Middleware de autenticação para todas as rotas
router.use(authenticate);

// Rotas para funcionários
router.post('/', uploadPhoto.single('file'), medicalCertificateController.submitCertificate);
router.get('/my', medicalCertificateController.getUserCertificates);
router.get('/:id', medicalCertificateController.getCertificateById);
router.delete('/:id', medicalCertificateController.cancelCertificate);
router.get('/:id/download', medicalCertificateController.downloadFile);

// Rotas para RH/Admin
router.get('/', requireRole(['ADMIN', 'HR']), medicalCertificateController.getAllCertificates);
router.put('/:id/approve', requireRole(['ADMIN', 'HR']), medicalCertificateController.approveCertificate);
router.put('/:id/reject', requireRole(['ADMIN', 'HR']), medicalCertificateController.rejectCertificate);

export default router;
