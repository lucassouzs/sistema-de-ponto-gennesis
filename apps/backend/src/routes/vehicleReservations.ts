import { Router } from 'express';

import { authenticate } from '../middleware/auth';

import { requireVehicleReservationSuppliesAccess } from '../middleware/permissionAuth';

import { VehicleReservationController } from '../controllers/VehicleReservationController';



const router = Router();

const controller = new VehicleReservationController();



router.use(authenticate);



router.get('/supplies-pending-count', requireVehicleReservationSuppliesAccess, (req, res, next) =>
  controller.suppliesPendingCount(req, res, next)
);

router.get('/mine', (req, res, next) => controller.getMine(req, res, next));

router.get('/', requireVehicleReservationSuppliesAccess, (req, res, next) =>
  controller.getAll(req, res, next)
);
router.get('/:id', (req, res, next) => controller.getById(req, res, next));

router.post('/', (req, res, next) => controller.create(req, res, next));

router.put('/:id/supplies-approve', requireVehicleReservationSuppliesAccess, (req, res, next) =>

  controller.suppliesApprove(req, res, next)

);

router.put('/:id/supplies-reject', requireVehicleReservationSuppliesAccess, (req, res, next) =>

  controller.suppliesReject(req, res, next)

);

router.put('/:id/submit-return', (req, res, next) => controller.submitReturn(req, res, next));

router.put('/:id/submit-inspection', requireVehicleReservationSuppliesAccess, (req, res, next) =>
  controller.submitInspection(req, res, next)
);

router.delete('/:id', (req, res, next) => controller.delete(req, res, next));



export default router;

