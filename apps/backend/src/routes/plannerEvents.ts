import { Router, Response, NextFunction } from 'express';
import { PlannerEventController } from '../controllers/PlannerEventController';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const controller = new PlannerEventController();

// Callback do Google não usa Bearer token (vem do redirect do navegador).
router.get('/google/callback', (req, res, next) => controller.googleCallback(req as any, res, next));

router.use(authenticate);

router.get('/', (req, res, next) => controller.list(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));

router.get('/agendas', (req, res, next) => controller.listAgendas(req, res, next));
router.get('/shares', (req, res, next) => controller.listShares(req, res, next));
router.post('/shares', (req, res, next) => controller.addShare(req, res, next));
router.patch('/shares/:userId', (req, res, next) => controller.updateShare(req, res, next));
router.delete('/shares/:userId', (req, res, next) => controller.removeShare(req, res, next));

router.get('/google/status', (req, res, next) => controller.googleStatus(req, res, next));
router.get('/google/auth-url', (req, res, next) => controller.googleAuthUrl(req, res, next));
router.post('/google/sync', (req, res, next) => controller.googleSync(req, res, next));
router.delete('/google/disconnect', (req, res, next) =>
  controller.googleDisconnect(req, res, next)
);

router.post(
  '/:id/ata',
  ...PlannerEventController.uploadAtaMiddleware(),
  (req: AuthRequest, res: Response, next: NextFunction) =>
    controller.uploadAta(req, res, next)
);
router.delete('/:id/ata', (req, res, next) => controller.deleteAta(req, res, next));

router.patch('/:id', (req, res, next) => controller.update(req, res, next));
router.delete('/:id', (req, res, next) => controller.delete(req, res, next));

export default router;
