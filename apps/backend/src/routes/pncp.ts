import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { PncpController } from '../controllers/PncpController';

const router = Router();
const ctrl = new PncpController();

router.use(authenticate);

router.get('/modalidades', (req, res) => ctrl.listModalidades(req, res));
router.get('/keywords', (req, res, next) => ctrl.listKeywords(req, res, next));
router.post('/keywords', (req, res, next) => ctrl.addKeyword(req, res, next));
router.delete('/keywords', (req, res, next) => ctrl.removeKeyword(req, res, next));
router.get('/contratacoes', (req, res, next) => ctrl.listContratacoes(req, res, next));
router.post('/enviar-analise', (req, res, next) => ctrl.enviarParaAnalise(req, res, next));
router.get('/meus-envios-count', (req, res, next) => ctrl.meusEnviosCount(req, res, next));
router.post('/rejeitar', (req, res, next) => ctrl.rejeitar(req, res, next));
router.get('/sync/status', (req, res, next) => ctrl.syncStatus(req, res, next));
router.post('/sync', (req, res, next) => ctrl.startSync(req, res, next));
router.post('/sync/stop', (req, res, next) => ctrl.stopSync(req, res, next));

export default router;
