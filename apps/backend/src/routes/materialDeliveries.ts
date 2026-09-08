import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { MaterialDeliveryController } from '../controllers/MaterialDeliveryController';

const router = Router();
const controller = new MaterialDeliveryController();

router.use(authenticate);

router.get('/summary', (req, res, next) => controller.getSummary(req, res, next));
router.get('/resolve-shortfall-type', (req, res, next) => controller.resolveShortfallType(req, res, next));
router.post('/geral-lookups', (req, res, next) => controller.upsertGeralLookups(req, res, next));
router.get('/', (req, res, next) => controller.getAll(req, res, next));
router.get('/:id', (req, res, next) => controller.getById(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.patch('/:id', (req, res, next) => controller.update(req, res, next));
router.patch('/:id/receive', (req, res, next) => controller.markReceivedByEngineering(req, res, next));
router.delete('/:id', (req, res, next) => controller.delete(req, res, next));

export default router;
