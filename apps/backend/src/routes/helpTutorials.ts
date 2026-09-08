import { Router } from 'express';
import { authenticate, requireAdministrator } from '../middleware/auth';
import { HelpTutorialController } from '../controllers/HelpTutorialController';

const router = Router();
const controller = new HelpTutorialController();

router.use(authenticate);

router.get('/', (req, res, next) => controller.list(req, res, next));
router.get('/by-slug/:slug', (req, res, next) => controller.getBySlug(req, res, next));
router.post('/', requireAdministrator, (req, res, next) => controller.create(req, res, next));
router.patch('/:id', requireAdministrator, (req, res, next) => controller.update(req, res, next));
router.delete('/:id', requireAdministrator, (req, res, next) => controller.remove(req, res, next));

export default router;
