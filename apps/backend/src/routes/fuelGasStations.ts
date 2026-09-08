import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireFuelSuppliesAccess } from '../middleware/permissionAuth';
import { fuelGasStationController } from '../controllers/FuelGasStationController';

const router = Router();

router.use(authenticate);
router.use(requireFuelSuppliesAccess);

router.get('/satellite-cities', (req, res, next) =>
  fuelGasStationController.listSatelliteCities(req, res, next),
);
router.get('/', (req, res, next) => fuelGasStationController.list(req, res, next));
router.post('/import', (req, res, next) => fuelGasStationController.importStations(req, res, next));
router.post('/', (req, res, next) => fuelGasStationController.create(req, res, next));
router.put('/:id', (req, res, next) => fuelGasStationController.update(req, res, next));
router.delete('/:id', (req, res, next) => fuelGasStationController.remove(req, res, next));

export default router;
