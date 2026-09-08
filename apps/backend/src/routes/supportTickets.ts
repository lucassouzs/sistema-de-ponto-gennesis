import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAnyModuleAccess } from '../middleware/permissionAuth';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { supportTicketController } from '../controllers/SupportTicketController';

const router = Router();
const CENTRAL_ATENDIMENTOS_KEY = pathToModuleKey('/ponto/conversas-whatsapp');
const requireCentral = requireAnyModuleAccess([CENTRAL_ATENDIMENTOS_KEY]);

router.use(authenticate);

router.get('/mine', (req, res, next) => supportTicketController.listMine(req, res, next));
router.get('/pending-count', requireCentral, (req, res, next) =>
  supportTicketController.pendingCount(req, res, next),
);
router.get('/', requireCentral, (req, res, next) =>
  supportTicketController.list(req, res, next),
);
router.get('/:id', requireCentral, (req, res, next) =>
  supportTicketController.getById(req, res, next),
);
router.patch('/:id', requireCentral, (req, res, next) =>
  supportTicketController.update(req, res, next),
);

export default router;
