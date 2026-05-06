import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { OrcamentoController } from '../controllers/OrcamentoController';

const router = Router();
const controller = new OrcamentoController();

router.use(authenticate);

router.get('/composicoes/geral', (req, res, next) => controller.getComposicoesGeral(req as any, res, next));
router.put('/composicoes/geral', (req, res, next) => controller.saveComposicoesGeral(req as any, res, next));

router.post('/:centroCustoId/orcamentos', (req, res, next) => controller.createOrcamento(req as any, res, next));
router.patch('/:centroCustoId/orcamentos/:orcamentoId', (req, res, next) =>
  controller.renameOrcamento(req as any, res, next)
);
router.get('/:centroCustoId/orcamentos/:orcamentoId', (req, res, next) =>
  controller.getOrcamento(req as any, res, next)
);
router.put('/:centroCustoId/orcamentos/:orcamentoId', (req, res, next) =>
  controller.saveOrcamento(req as any, res, next)
);
router.delete('/:centroCustoId/orcamentos/:orcamentoId', (req, res, next) =>
  controller.deleteOrcamento(req as any, res, next)
);

router.get('/:centroCustoId/servicos-padrao', (req, res, next) =>
  controller.getServicosPadrao(req as any, res, next)
);
router.put('/:centroCustoId/servicos-padrao', (req, res, next) =>
  controller.saveServicosPadrao(req as any, res, next)
);

router.get('/:centroCustoId', (req, res, next) => controller.getList(req as any, res, next));
router.put('/:centroCustoId', (req, res, next) => controller.save(req as any, res, next));

export default router;
