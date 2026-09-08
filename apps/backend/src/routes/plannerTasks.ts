import { Router } from 'express';
import { PlannerTaskController } from '../controllers/PlannerTaskController';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new PlannerTaskController();

router.use(authenticate);

router.get('/lists', (req, res, next) => controller.listLists(req, res, next));
router.post('/lists', (req, res, next) => controller.createList(req, res, next));
router.patch('/lists/:id', (req, res, next) => controller.updateList(req, res, next));
router.delete('/lists/:id', (req, res, next) => controller.deleteList(req, res, next));

router.get('/', (req, res, next) => controller.list(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.patch('/:id', (req, res, next) => controller.update(req, res, next));
router.delete('/:id', (req, res, next) => controller.delete(req, res, next));

export default router;
