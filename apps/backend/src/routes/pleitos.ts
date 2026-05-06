import { Router } from 'express';
import { PleitoController } from '../controllers/PleitoController';
import { authenticate } from '../middleware/auth';

const router = Router();
const ctrl = new PleitoController();

router.use(authenticate);

router.get('/divse-list', (req, res, next) => ctrl.getDivSeList(req, res, next));
router.get('/', (req, res, next) => ctrl.getAll(req, res, next));
router.get('/:id', (req, res, next) => ctrl.getById(req, res, next));
router.post('/', (req, res, next) => ctrl.create(req, res, next));
router.patch('/:id', (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id', (req, res, next) => ctrl.delete(req, res, next));

export default router;
