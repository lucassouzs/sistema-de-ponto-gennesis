import express from 'express';
import { uploadFinancialAnalysis } from '../controllers/FinancialAnalysisController';
import { uploadImport, handleUploadError } from '../middleware/upload';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();

// Rota para upload e análise de planilha financeira
router.post(
  '/upload',
  authenticate,
  authorize('EMPLOYEE'),
  uploadImport.single('file'),
  handleUploadError,
  uploadFinancialAnalysis
);

export default router;

