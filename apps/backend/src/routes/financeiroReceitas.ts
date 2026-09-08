import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { FinanceiroReceitasController } from '../controllers/FinanceiroReceitasController';

const router = Router();
const controller = new FinanceiroReceitasController();

router.use(authenticate);

router.get('/receitas', (req, res, next) => controller.listReceitas(req, res, next));
router.post('/receitas', (req, res, next) => controller.createReceita(req, res, next));
router.post('/receitas/import', (req, res, next) => controller.importReceitas(req, res, next));
router.patch('/receitas/:id', (req, res, next) => controller.updateReceita(req, res, next));
router.delete('/receitas/:id', (req, res, next) => controller.deleteReceita(req, res, next));

router.get('/repasses', (req, res, next) => controller.listRepasses(req, res, next));
router.post('/repasses', (req, res, next) => controller.createRepasse(req, res, next));
router.post('/repasses/import', (req, res, next) => controller.importRepasses(req, res, next));
router.patch('/repasses/:id', (req, res, next) => controller.updateRepasse(req, res, next));
router.delete('/repasses/:id', (req, res, next) => controller.deleteRepasse(req, res, next));

export default router;
