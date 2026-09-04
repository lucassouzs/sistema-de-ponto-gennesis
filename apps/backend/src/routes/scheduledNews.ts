import { Router, Request, Response, NextFunction } from 'express';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { authenticate } from '../middleware/auth';
import { requireAnyModuleAccess } from '../middleware/permissionAuth';
import { uploadPhoto, handleUploadError } from '../middleware/upload';
import { scheduledNewsController } from '../controllers/ScheduledNewsController';

const router = Router();
const NEWS_MODULE_KEY = pathToModuleKey('/ponto/noticias');
const requireNewsAdmin = requireAnyModuleAccess([NEWS_MODULE_KEY]);

router.use(authenticate);

router.get('/current', (req, res, next) => scheduledNewsController.getCurrent(req, res, next));
router.post('/:id/view', (req, res, next) => scheduledNewsController.markViewed(req, res, next));

router.get('/admin', requireNewsAdmin, (req, res, next) =>
  scheduledNewsController.listAdmin(req, res, next),
);
router.get('/admin/:id', requireNewsAdmin, (req, res, next) =>
  scheduledNewsController.getAdminById(req, res, next),
);
router.get('/admin-audience-users', requireNewsAdmin, (req, res, next) =>
  scheduledNewsController.listAudienceUsers(req, res, next),
);
router.post('/admin', requireNewsAdmin, (req, res, next) =>
  scheduledNewsController.create(req, res, next),
);
router.patch('/admin/:id', requireNewsAdmin, (req, res, next) =>
  scheduledNewsController.update(req, res, next),
);
router.post('/admin/:id/publish', requireNewsAdmin, (req, res, next) =>
  scheduledNewsController.publish(req, res, next),
);
router.post('/admin/:id/cancel', requireNewsAdmin, (req, res, next) =>
  scheduledNewsController.cancel(req, res, next),
);
router.post(
  '/admin/:id/image',
  requireNewsAdmin,
  (req: Request, res: Response, next: NextFunction) => uploadPhoto.single('image')(req, res, next),
  handleUploadError,
  (req: Request, res: Response, next: NextFunction) => scheduledNewsController.uploadImage(req as any, res, next),
);

export default router;
