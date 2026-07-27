import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { ControleGeralTetoOrcamentarioController } from '../controllers/ControleGeralTetoOrcamentarioController';

const router = Router();
const tetoController = new ControleGeralTetoOrcamentarioController();

router.use(authenticate);
router.use(authorize('EMPLOYEE'));

router.get('/teto-orcamentario', (req, res, next) => tetoController.list(req, res, next));
router.put('/teto-orcamentario', (req, res, next) => tetoController.save(req, res, next));
router.delete('/teto-orcamentario/:id', (req, res, next) => tetoController.remove(req, res, next));

export default router;
