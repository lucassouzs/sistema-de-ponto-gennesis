import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import {
  requireControleNfsAccess,
  requireControleNfsSharedDataAccess,
} from '../middleware/permissionAuth';
import { ControleNfsController } from '../controllers/ControleNfsController';

const router = Router();
const controller = new ControleNfsController();

router.use(authenticate);
router.use(authorize('EMPLOYEE'));

router.get('/tabs', requireControleNfsAccess, (req, res, next) => controller.listTabs(req, res, next));
router.get('/summary/totals', requireControleNfsAccess, (req, res, next) =>
  controller.getTotalsSummary(req, res, next)
);
router.get('/summary/base-gastos', requireControleNfsSharedDataAccess, (req, res, next) =>
  controller.getBaseGastosSummary(req, res, next)
);
router.get('/summary/controle-geral-financial', requireControleNfsSharedDataAccess, (req, res, next) =>
  controller.getControleGeralFinancialSummary(req, res, next)
);
router.get(
  '/summary/faturamento-by-gastos-contract',
  requireControleNfsSharedDataAccess,
  (req, res, next) => controller.getFaturamentoByGastosContract(req, res, next)
);
router.get(
  '/summary/recebido-mensal-by-gastos-contract',
  requireControleNfsSharedDataAccess,
  (req, res, next) => controller.getRecebidoMensalByGastosContract(req, res, next)
);
router.get('/summary/valor-bruto-total', requireControleNfsAccess, (req, res, next) =>
  controller.getValorBrutoTotal(req, res, next)
);
/** Busca dados pela aba real da planilha (sheetName). */
router.get('/sheet-data', requireControleNfsSharedDataAccess, (req, res, next) =>
  controller.getSheetByName(req, res, next)
);
router.get('/sheet/:tabKey', requireControleNfsAccess, (req, res, next) =>
  controller.getSheet(req, res, next)
);

export default router;
