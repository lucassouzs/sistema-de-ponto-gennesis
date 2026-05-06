import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { BudgetNatureController } from '../controllers/BudgetNatureController';
import { uploadImport, handleUploadError } from '../middleware/upload';

const router = Router();
const controller = new BudgetNatureController();

// Todas as rotas requerem autenticação
router.use(authenticate);

// Import route (file upload)
router.post('/import', uploadImport.single('file'), (req: Request, res: Response, next: NextFunction) => controller.importFile(req, res, next), handleUploadError);

router.get('/', (req, res, next) => controller.getAll(req as any, res as any, next));
router.get('/:id', (req, res, next) => controller.getById(req as any, res as any, next));
router.post('/', (req, res, next) => controller.create(req as any, res as any, next));
router.patch('/:id', (req, res, next) => controller.update(req as any, res as any, next));
router.delete('/:id', (req, res, next) => controller.delete(req as any, res as any, next));

export default router;

