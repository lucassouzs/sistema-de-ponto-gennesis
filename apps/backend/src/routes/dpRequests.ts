import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireDpApproverAccess, requireModuleAccess } from '../middleware/permissionAuth';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { DpRequestController } from '../controllers/DpRequestController';

const router = Router();
const controller = new DpRequestController();

const myModule = pathToModuleKey('/ponto/solicitacoes-dp');
const manageModule = pathToModuleKey('/ponto/gerenciar-solicitacoes-dp');

router.use(authenticate);

router.get('/contratos-elegiveis', requireModuleAccess(myModule), controller.getEligibleContracts.bind(controller));

// Minhas solicitações (EMPLOYEE / DP usuário)
router.get('/minhas', requireModuleAccess(myModule), controller.getMyRequests.bind(controller));
router.post('/', requireModuleAccess(myModule), controller.createRequest.bind(controller));
router.put('/:id/requester-return', requireModuleAccess(myModule), controller.requesterReturn.bind(controller));

// Aprovações (gestor/aprovador)
router.get('/aprovacoes', requireDpApproverAccess, controller.getWaitingManagerApprovals.bind(controller));
router.put('/:id/manager-approve', requireDpApproverAccess, controller.approveManager.bind(controller));
router.put('/:id/manager-reject', requireDpApproverAccess, controller.rejectManager.bind(controller));

// Fila DP (feedback/conclusão)
router.get('/gerenciar', requireModuleAccess(manageModule), controller.getForApproval.bind(controller));
router.put('/:id/dp-feedback', requireModuleAccess(manageModule), controller.dpFeedback.bind(controller));

export default router;

