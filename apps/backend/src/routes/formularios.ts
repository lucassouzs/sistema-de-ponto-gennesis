import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { FormularioTemplateController } from '../controllers/FormularioTemplateController';

const router = Router();
const controller = new FormularioTemplateController();

router.use(authenticate);

router.get('/', (req, res, next) => controller.list(req as any, res, next));
router.post('/', (req, res, next) => controller.create(req as any, res, next));
router.get('/:id', (req, res, next) => controller.get(req as any, res, next));
router.put('/:id', (req, res, next) => controller.update(req as any, res, next));
router.delete('/:id', (req, res, next) => controller.delete(req as any, res, next));

export default router;
