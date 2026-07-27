import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { PncpController } from '../controllers/PncpController';

const router = Router();
const ctrl = new PncpController();

router.use(authenticate);

router.get('/modalidades', (req, res) => ctrl.listModalidades(req, res));
router.get('/keywords', (req, res) => ctrl.listKeywords(req, res));
router.get('/contratacoes', (req, res, next) => ctrl.listContratacoes(req, res, next));
router.post('/enviar-analise', (req, res, next) => ctrl.enviarParaAnalise(req, res, next));
router.get('/sync/status', (req, res, next) => ctrl.syncStatus(req, res, next));
router.post('/sync', (req, res, next) => ctrl.startSync(req, res, next));
router.post('/sync/stop', (req, res, next) => ctrl.stopSync(req, res, next));

export default router;
