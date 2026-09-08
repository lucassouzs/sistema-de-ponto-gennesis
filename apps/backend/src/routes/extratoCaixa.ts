import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { ExtratoCaixaController } from '../controllers/ExtratoCaixaController';
import { ExtratoCaixaAjusteController } from '../controllers/ExtratoCaixaAjusteController';
import { ExtratoCaixaFiltroSalvoController } from '../controllers/ExtratoCaixaFiltroSalvoController';

const router = Router();
const controller = new ExtratoCaixaController();
const ajusteController = new ExtratoCaixaAjusteController();
const filtroSalvoController = new ExtratoCaixaFiltroSalvoController();

router.use(authenticate);
router.use(authorize('EMPLOYEE'));

router.get('/', (req, res, next) => controller.list(req, res, next));

router.get('/ajustes', (req, res, next) => ajusteController.list(req, res, next));
router.post('/ajustes', (req, res, next) => ajusteController.create(req, res, next));
router.put('/ajustes/:id', (req, res, next) => ajusteController.update(req, res, next));
router.delete('/ajustes/:id', (req, res, next) => ajusteController.remove(req, res, next));

router.get('/filtros-salvos', (req, res, next) => filtroSalvoController.list(req, res, next));
router.post('/filtros-salvos', (req, res, next) => filtroSalvoController.create(req, res, next));
router.put('/filtros-salvos/:id', (req, res, next) => filtroSalvoController.update(req, res, next));
router.delete('/filtros-salvos/:id', (req, res, next) => filtroSalvoController.remove(req, res, next));

export default router;
