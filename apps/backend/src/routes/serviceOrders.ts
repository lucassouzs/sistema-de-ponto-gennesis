import { Router } from 'express';
import { ServiceOrderController } from '../controllers/ServiceOrderController';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new ServiceOrderController();

router.use(authenticate);

router.get('/contract-options', (req, res, next) =>
  controller.listContractOptions(req, res, next),
);
router.get('/linked-contract', (req, res, next) =>
  controller.resolveLinkedContract(req, res, next),
);
router.get('/', (req, res, next) => controller.list(req, res, next));

export default router;
