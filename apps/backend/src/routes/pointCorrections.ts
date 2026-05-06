import { Router } from 'express';
import { PointCorrectionController } from '../controllers/PointCorrectionController';
import { authenticate } from '../middleware/auth';

const router = Router();
const pointCorrectionController = new PointCorrectionController();

// Middleware de autenticação para todas as rotas
router.use(authenticate);

// Rotas para funcionários
router.get('/minhas-solicitacoes', pointCorrectionController.getMyRequests.bind(pointCorrectionController));
router.post('/', pointCorrectionController.createRequest.bind(pointCorrectionController));

// Rotas para supervisores/RH (DEVEM VIR ANTES das rotas com :id)
router.get('/gerenciar', pointCorrectionController.getPendingApproval.bind(pointCorrectionController));
router.post('/:id/aprovar', pointCorrectionController.approveRequest.bind(pointCorrectionController));
router.post('/:id/rejeitar', pointCorrectionController.rejectRequest.bind(pointCorrectionController));

// Rotas com parâmetros (DEVEM VIR POR ÚLTIMO)
router.get('/:id', pointCorrectionController.getRequestById.bind(pointCorrectionController));
router.put('/:id', pointCorrectionController.updateRequest.bind(pointCorrectionController));
router.delete('/:id', pointCorrectionController.cancelRequest.bind(pointCorrectionController));

export default router;
