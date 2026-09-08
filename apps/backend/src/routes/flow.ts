import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { FlowController } from '../controllers/FlowController';

const router = Router();
const controller = new FlowController();

router.use(authenticate);

router.get('/diagrams', (req, res, next) => controller.list(req, res, next));
router.post('/diagrams', (req, res, next) => controller.create(req, res, next));
router.get('/diagrams/:id', (req, res, next) => controller.get(req, res, next));
router.patch('/diagrams/:id', (req, res, next) => controller.update(req, res, next));
router.delete('/diagrams/:id', (req, res, next) => controller.remove(req, res, next));
router.post('/generate', (req, res, next) => controller.generate(req, res, next));

export default router;
