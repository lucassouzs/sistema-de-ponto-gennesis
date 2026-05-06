import { Router } from 'express';
import { BorderController } from '../controllers/BorderController';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/roleAuth';

const router = Router();
const borderController = new BorderController();

router.use(authenticate);
// Permitir acesso para funcionários e departamento financeiro
router.use(requireRole(['EMPLOYEE', 'DEPARTAMENTO_FINANCEIRO', 'ADMIN']));

// Obter dados do borderô
router.get('/data', (req, res, next) => 
  borderController.getBorderData(req, res, next)
);

// Gerar PDF do borderô
router.get('/pdf', (req, res, next) => 
  borderController.generateBorderPDF(req, res, next)
);

// Gerar arquivo CNAB400
router.get('/cnab400', (req, res, next) => 
  borderController.generateCNAB400(req, res, next)
);

export default router;

