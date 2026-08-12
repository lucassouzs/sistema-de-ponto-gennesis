import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import {
  requireLogisticsDeliveryAccess,
  requireLogisticsDeliveryCompletionAccess,
  requireLogisticsDeliveryReadAccess,
} from '../middleware/permissionAuth';
import { createError } from '../middleware/errorHandler';
import { savePersistentUpload } from '../lib/persistentUpload';
import { fixMulterOriginalName } from '../lib/fixUploadFileName';
import { logisticsDeliveryRequestController } from '../controllers/LogisticsDeliveryRequestController';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(authenticate);

router.get('/', requireLogisticsDeliveryReadAccess, (req, res, next) =>
  logisticsDeliveryRequestController.list(req, res, next),
);

router.post('/', requireLogisticsDeliveryAccess, (req, res, next) =>
  logisticsDeliveryRequestController.create(req, res, next),
);

router.post('/upload-attachment', requireLogisticsDeliveryReadAccess, (req: AuthRequest, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) throw createError('Selecione um arquivo', 400);
    const saved = await savePersistentUpload({
      folder: 'logistics-delivery-requests',
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

router.get('/pending-count', requireLogisticsDeliveryCompletionAccess, (req, res, next) =>
  logisticsDeliveryRequestController.pendingCount(req, res, next),
);

router.get('/:id', requireLogisticsDeliveryReadAccess, (req, res, next) =>
  logisticsDeliveryRequestController.getById(req, res, next),
);

router.post('/:id/finalize', requireLogisticsDeliveryCompletionAccess, (req, res, next) =>
  logisticsDeliveryRequestController.finalize(req, res, next),
);

router.patch('/:id', requireLogisticsDeliveryAccess, (req, res, next) =>
  logisticsDeliveryRequestController.update(req, res, next),
);

router.delete('/:id', requireLogisticsDeliveryAccess, (req, res, next) =>
  logisticsDeliveryRequestController.delete(req, res, next),
);

export default router;
