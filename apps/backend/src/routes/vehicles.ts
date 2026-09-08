import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { VehicleController } from '../controllers/VehicleController';

const router = Router();
const controller = new VehicleController();

router.use(authenticate);

router.get('/fipe/brands', (req, res, next) => controller.getFipeBrands(req, res, next));
router.get('/fipe/brands/:brandId/models', (req, res, next) => controller.getFipeModels(req, res, next));
router.get('/', (req, res, next) => controller.getAll(req, res, next));
router.get('/:id', (req, res, next) => controller.getById(req, res, next));
router.post('/import', (req, res, next) => controller.importVehicles(req, res, next));
router.post('/delete-many', (req, res, next) => controller.deleteMany(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.patch('/:id', (req, res, next) => controller.update(req, res, next));
router.delete('/:id', (req, res, next) => controller.delete(req, res, next));

export default router;
