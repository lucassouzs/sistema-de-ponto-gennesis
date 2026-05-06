import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { OrcafascioController } from '../controllers/OrcafascioController';

const router = Router();
const controller = new OrcafascioController();

router.use(authenticate);

router.get('/bases', (req, res, next) => controller.listarBases(req, res, next));

// Composições
router.get('/composicoes', (req, res, next) => controller.listarComposicoes(req, res, next));
router.get('/composicoes/by-code', (req, res, next) =>
  controller.buscarComposicaoPorCodigo(req, res, next)
);
router.get('/composicoes/:id', (req, res, next) =>
  controller.buscarComposicaoPorId(req, res, next)
);

// Orçamentos Orçafascio
router.get('/orcamentos/:id/analitico', (req, res, next) => controller.buscarAnaliticoOrcamento(req, res, next));
router.get('/orcamentos/:id/sintetico', (req, res, next) => controller.buscarSinteticoOrcamento(req, res, next));
router.get('/orcamentos/:id', (req, res, next) => controller.buscarDetalheOrcamento(req, res, next));
router.get('/orcamentos', (req, res, next) => controller.listarOrcamentos(req, res, next));

// Insumos
router.get('/insumos', (req, res, next) => controller.listarInsumos(req, res, next));

// Diagnóstico (ver user do login, department_id descoberto, candidatos de base)
router.get('/diagnostico', (req, res, next) => controller.diagnosticar(req, res, next));

export default router;
