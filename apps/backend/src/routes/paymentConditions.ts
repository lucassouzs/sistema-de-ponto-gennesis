import { Router } from 'express';
import { PaymentConditionController } from '../controllers/PaymentConditionController';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new PaymentConditionController();

router.use(authenticate);

router.get('/', (req, res, next) => controller.list(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.patch('/:id', (req, res, next) => controller.update(req, res, next));
router.delete('/:id', (req, res, next) => controller.remove(req, res, next));

export default router;
