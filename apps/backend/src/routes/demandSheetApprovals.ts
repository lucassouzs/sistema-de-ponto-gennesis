import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireDpApproverAccess, requireModuleAccess } from '../middleware/permissionAuth';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { DemandSheetApprovalController } from '../controllers/DemandSheetApprovalController';

const router = Router();
const controller = new DemandSheetApprovalController();
const fdModule = pathToModuleKey('/ponto/aprovacao-fds');
const fdsAprovadasModule = pathToModuleKey('/ponto/fds-aprovadas');

router.use(authenticate);

router.get('/', requireModuleAccess(fdModule), controller.list.bind(controller));
router.post('/', requireModuleAccess(fdModule), controller.create.bind(controller));

router.get('/notification-counts', controller.getNotificationCounts.bind(controller));
router.get(
  '/aprovadas-compras',
  requireModuleAccess(fdsAprovadasModule),
  controller.listApprovedForPurchasing.bind(controller)
);
router.get('/aprovacoes', requireDpApproverAccess, controller.getManagerApprovals.bind(controller));

router.patch(
  '/:id/purchase-status',
  requireModuleAccess(fdsAprovadasModule),
  controller.updatePurchaseStatus.bind(controller)
);
router.patch('/:id', requireModuleAccess(fdModule), controller.update.bind(controller));
router.delete('/:id', requireModuleAccess(fdModule), controller.remove.bind(controller));
router.put('/:id/manager-approve', requireDpApproverAccess, controller.approveManager.bind(controller));
router.put('/:id/manager-reject', requireDpApproverAccess, controller.rejectManager.bind(controller));

export default router;
