import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { ResponsavelTecnicoController } from '../controllers/ResponsavelTecnicoController';

const router = Router();
const controller = new ResponsavelTecnicoController();

router.use(authenticate);

router.get('/', (req, res, next) => controller.getAll(req, res, next));
router.post('/import', (req, res, next) => controller.importMany(req, res, next));
router.post('/delete-many', (req, res, next) => controller.deleteMany(req, res, next));
router.get('/:id', (req, res, next) => controller.getById(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.patch('/:id', (req, res, next) => controller.update(req, res, next));
router.delete('/:id', (req, res, next) => controller.delete(req, res, next));

export default router;
