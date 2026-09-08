import express from 'express';
import { uploadFinancialAnalysis } from '../controllers/FinancialAnalysisController';
import { ExtratoCaixaController } from '../controllers/ExtratoCaixaController';
import { uploadImport, handleUploadError } from '../middleware/upload';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();
const extratoCaixaController = new ExtratoCaixaController();

// Rota para upload e análise de planilha financeira
router.post(
  '/upload',
  authenticate,
  authorize('EMPLOYEE'),
  uploadImport.single('file'),
  handleUploadError,
  uploadFinancialAnalysis
);

router.get(
  '/extrato-caixa',
  authenticate,
  authorize('EMPLOYEE'),
  (req, res, next) => extratoCaixaController.list(req, res, next)
);

export default router;

