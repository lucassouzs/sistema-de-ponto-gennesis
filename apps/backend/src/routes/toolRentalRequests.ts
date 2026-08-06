import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireToolRentalSuppliesAccess } from '../middleware/permissionAuth';
import { createError } from '../middleware/errorHandler';
import { backendUploadsRoot } from '../lib/uploads';
import { ToolRentalRequestController } from '../controllers/ToolRentalRequestController';

const router = Router();
const controller = new ToolRentalRequestController();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

router.use(authenticate);

router.get('/supplies-pending-count', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.suppliesPendingCount(req, res, next)
);
router.get('/supplies-summary', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.suppliesSummary(req, res, next)
);

router.post(
  '/upload-attachment',
  requireToolRentalSuppliesAccess,
  (req: AuthRequest, res: Response, next: NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Erro no upload';
        res.status(400).json({ success: false, message: msg });
        return;
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file?.buffer) throw createError('Selecione um arquivo', 400);
      const uploadsDir = path.join(backendUploadsRoot, 'tool-rental-requests');
      fs.mkdirSync(uploadsDir, { recursive: true });
      const ext = path.extname(req.file.originalname || '') || '.bin';
      const safeExt = ext.length <= 8 ? ext : '.bin';
      const fileName = `${uuidv4()}${safeExt}`;
      fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);
      res.json({
        success: true,
        data: {
          url: `/uploads/tool-rental-requests/${fileName}`,
          originalName: req.file.originalname || fileName,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/', (req, res, next) => controller.getAll(req, res, next));
router.get('/:id', (req, res, next) => controller.getById(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.put('/:id/to-supplier-relation', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.moveToSupplierRelation(req, res, next)
);
router.put('/:id/to-awaiting-payment', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.moveToAwaitingPayment(req, res, next)
);
router.put('/:id/complete', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.complete(req, res, next)
);
router.put('/:id/supplies-reject', requireToolRentalSuppliesAccess, (req, res, next) =>
  controller.suppliesReject(req, res, next)
);
router.put('/:id/cancel', (req, res, next) => controller.cancel(req, res, next));

export default router;
