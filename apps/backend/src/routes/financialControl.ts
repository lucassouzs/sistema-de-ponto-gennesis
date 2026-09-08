import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadImport, handleUploadError } from '../middleware/upload';
import { FinancialControlController } from '../controllers/FinancialControlController';
import { createError } from '../middleware/errorHandler';
import { savePersistentUpload } from '../lib/persistentUpload';
import { fixMulterOriginalName } from '../lib/fixUploadFileName';

const router = Router();
const controller = new FinancialControlController();

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('image/') ||
      /\.(pdf|png|jpg|jpeg|webp|doc|docx|xls|xlsx)$/i.test(name);
    if (ok) cb(null, true);
    else cb(new Error('Envie PDF, imagem ou documento Office (PDF, PNG, JPG, DOC, XLS…)'));
  },
});

router.use(authenticate);

router.post('/upload-attachment', (req: AuthRequest, res: Response, next: NextFunction) => {
  attachmentUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) {
      throw createError('Selecione um arquivo', 400);
    }
    const saved = await savePersistentUpload({
      folder: 'financial-control',
      buffer: req.file.buffer,
      originalName: fixMulterOriginalName(req.file.originalname),
      mimeType: req.file.mimetype,
    });
    res.json({
      success: true,
      data: {
        url: saved.url,
        originalName: fixMulterOriginalName(req.file.originalname) || saved.originalName || saved.fileName,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/months', (req, res, next) => controller.getMonths(req, res, next));
router.get('/check-by-oc/:orderNumber', (req, res, next) => controller.hasEntryForOc(req, res, next));
router.get('/by-oc-batch', (req, res, next) => controller.getByOcNumbersBatch(req, res, next));
router.get('/by-oc/:ocNumber', (req, res, next) => controller.getByOcNumber(req, res, next));
router.get('/', (req, res, next) => controller.getAll(req, res, next));
router.get('/:id', (req, res, next) => controller.getById(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.post(
  '/import',
  uploadImport.single('file'),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) =>
    controller.importSpreadsheet(req, res, next)
);
router.patch('/:id', (req, res, next) => controller.update(req, res, next));
router.delete('/:id', (req, res, next) => controller.delete(req, res, next));

export default router;
