import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireAnyModuleAccess } from '../middleware/permissionAuth';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { supportTicketController } from '../controllers/SupportTicketController';

const router = Router();
const SUPORTE_TI_KEY = pathToModuleKey('/ponto/suporte-ti');
const CENTRAL_ATENDIMENTOS_KEY = pathToModuleKey('/ponto/conversas-whatsapp');
const CENTRAL_OR_SUPORTE = requireAnyModuleAccess([CENTRAL_ATENDIMENTOS_KEY, SUPORTE_TI_KEY]);

router.use(authenticate);

router.get('/mine', (req, res, next) => supportTicketController.listMine(req, res, next));
router.get('/pending-count', CENTRAL_OR_SUPORTE, (req, res, next) =>
  supportTicketController.pendingCount(req, res, next),
);
router.get('/', CENTRAL_OR_SUPORTE, (req, res, next) =>
  supportTicketController.list(req, res, next),
);
router.get('/:id', CENTRAL_OR_SUPORTE, (req, res, next) =>
  supportTicketController.getById(req, res, next),
);
router.patch('/:id', CENTRAL_OR_SUPORTE, (req, res, next) =>
  supportTicketController.update(req, res, next),
);

export default router;
