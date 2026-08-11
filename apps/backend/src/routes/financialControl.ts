import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';
import { uploadImport, handleUploadError } from '../middleware/upload';
import { FinancialControlController } from '../controllers/FinancialControlController';
import { createError } from '../middleware/errorHandler';
import { backendUploadsRoot } from '../lib/uploads';

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
    const uploadsDir = path.join(backendUploadsRoot, 'financial-control');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const ext = path.extname(req.file.originalname || '') || '.bin';
    const safeExt = ext.length <= 8 ? ext : '.bin';
    const fileName = `${uuidv4()}${safeExt}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
    res.json({
      success: true,
      data: {
        url: `/uploads/financial-control/${fileName}`,
        originalName: req.file.originalname || fileName,
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
