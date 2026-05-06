import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { RelatorioFotograficoController } from '../controllers/RelatorioFotograficoController';

const router = Router();
const controller = new RelatorioFotograficoController();

router.use(authenticate);

router.get('/:contractId', (req, res, next) => controller.getList(req as any, res, next));
router.post('/:contractId', (req, res, next) => controller.create(req as any, res, next));
router.get('/:contractId/:relatorioId', (req, res, next) => controller.get(req as any, res, next));
router.put('/:contractId/:relatorioId', (req, res, next) => controller.save(req as any, res, next));
router.patch('/:contractId/:relatorioId', (req, res, next) => controller.rename(req as any, res, next));
router.delete('/:contractId/:relatorioId', (req, res, next) => controller.delete(req as any, res, next));

export default router;
