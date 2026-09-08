import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import {
  addFluigApproverViewer,
  listAllFluigApproverViewerKeys,
  listFluigApproverFullAccessUserIds,
  listFluigApproverViewers,
  normalizeFluigApproverNameKey,
  removeFluigApproverViewer,
  userCanManageFluigApproverViewers,
} from '../lib/fluigApproverAccess';
import {
  getAvailableDatasets,
  getDatasetStructure,
  getDatasetData,
  searchDataset,
} from '../controllers/FluigController';

const router = express.Router();

router.use(authenticate);

async function requireFluigApproverViewerManager(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!req.user) {
    return next(createError('Usuário não autenticado', 401));
  }
  const allowed = await userCanManageFluigApproverViewers(req.user.id, req.user.isAdmin);
  if (!allowed) {
    return next(createError('Sem permissão para gerenciar acessos de aprovadores', 403));
  }
  return next();
}

router.get('/datasets', getAvailableDatasets);
router.get('/datasets/:datasetId/structure', getDatasetStructure);
router.post('/datasets/:datasetId/data', getDatasetData);
router.post('/datasets/:datasetId/search', searchDataset);

router.get('/aprovadores/viewers', requireFluigApproverViewerManager, async (_req, res, next) => {
  try {
    const [viewersByApprover, fullAccessUserIds] = await Promise.all([
      listAllFluigApproverViewerKeys(),
      listFluigApproverFullAccessUserIds(),
    ]);
    return res.json({
      success: true,
      data: viewersByApprover,
      fullAccessUserIds: Array.from(fullAccessUserIds),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/aprovadores/:nameKey/viewers', requireFluigApproverViewerManager, async (req, res, next) => {
  try {
    const nameKey = normalizeFluigApproverNameKey(String(req.params.nameKey || ''));
    if (!nameKey) {
      throw createError('Aprovador inválido', 400);
    }
    const viewers = await listFluigApproverViewers(nameKey);
    return res.json({ success: true, data: viewers });
  } catch (error) {
    return next(error);
  }
});

router.post('/aprovadores/:nameKey/viewers', requireFluigApproverViewerManager, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);

    const nameKey = normalizeFluigApproverNameKey(String(req.params.nameKey || ''));
    const userId = String(req.body?.userId || '').trim();
    const approverName = String(req.body?.approverName || '').trim();

    if (!nameKey || !userId) {
      throw createError('Aprovador e usuário são obrigatórios', 400);
    }

    const fullAccessIds = await listFluigApproverFullAccessUserIds();
    if (fullAccessIds.has(userId)) {
      throw createError('Esta pessoa já tem acesso total aos aprovadores', 400);
    }

    const viewer = await addFluigApproverViewer({
      approverNameKey: nameKey,
      approverName,
      userId,
      updatedBy: req.user.id,
    });

    return res.status(201).json({ success: true, data: viewer });
  } catch (error) {
    return next(error);
  }
});

router.delete('/aprovadores/:nameKey/viewers/:userId', requireFluigApproverViewerManager, async (req, res, next) => {
  try {
    const nameKey = normalizeFluigApproverNameKey(String(req.params.nameKey || ''));
    const userId = String(req.params.userId || '').trim();

    if (!nameKey || !userId) {
      throw createError('Aprovador e usuário são obrigatórios', 400);
    }

    await removeFluigApproverViewer(nameKey, userId);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
