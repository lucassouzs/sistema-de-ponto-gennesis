import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { CompanyController } from '../controllers/CompanyController';

const router = express.Router();
const companyController = new CompanyController();

// Rotas públicas
router.get('/settings', companyController.getCompanySettings);

// Rotas protegidas
router.use(authenticate);
router.put('/settings', authorize('ADMIN'), companyController.updateCompanySettings);

export default router;
