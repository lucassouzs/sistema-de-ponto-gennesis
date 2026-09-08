import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { NfeRecebidaController } from '../controllers/NfeRecebidaController';
import { runNfeAutoFetch } from '../services/NfeRecebidaAutoFetch';

const router = Router();
const controller = new NfeRecebidaController();

function cronSecretOk(req: Request): boolean {
  const secret = process.env.NFE_CRON_SECRET?.trim();
  if (!secret) return false;
  const header = req.header('x-cron-secret') || req.header('authorization') || '';
  const bearer = header.toLowerCase().startsWith('bearer ')
    ? header.slice(7).trim()
    : header.trim();
  return bearer === secret;
}

/**
 * Endpoint para Cron do Railway (ou curl externo).
 * Não usa JWT — autentica com NFE_CRON_SECRET.
 * POST /api/nfe-recebidas/cron
 */
router.post('/cron', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!cronSecretOk(req)) {
      res.status(401).json({ success: false, error: 'Não autorizado' });
      return;
    }
    const data = await runNfeAutoFetch('http');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.use(authenticate);
router.use(authorize('EMPLOYEE'));

router.get('/', (req, res, next) => controller.list(req, res, next));
router.get('/emitentes', (req, res, next) => controller.listEmitentes(req, res, next));
router.post('/buscar', (req, res, next) => controller.buscar(req, res, next));
router.post('/reimportar', (req, res, next) => controller.reimportar(req, res, next));
router.get('/:id/detalhe', (req, res, next) => controller.getDetalhe(req, res, next));
router.get('/:id/danfe', (req, res, next) => controller.downloadDanfe(req, res, next));
router.get('/:id/xml', (req, res, next) => controller.downloadXml(req, res, next));

export default router;
