import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { ReuniaoController, parseReuniaoKindParam } from '../controllers/ReuniaoController';

const router = Router();
const controller = new ReuniaoController();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.REUNIAO_ANEXO_MAX_FILE_SIZE || String(300 * 1024 * 1024)),
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const tipo = (req.params as { tipo?: string }).tipo;
    const nameLower = (file.originalname || '').toLowerCase();

    if (tipo === 'ata') {
      const allowedExt = ['.pdf', '.doc', '.docx'];
      const ok =
        allowedExt.some((ext) => nameLower.endsWith(ext)) ||
        file.mimetype === 'application/pdf' ||
        file.mimetype.includes('word');
      if (!ok) return cb(new Error('Envie um arquivo PDF ou Word para a ata da reunião.'));
      return cb(null, true);
    }

    if (tipo === 'video') {
      const allowedExt = ['.mp4', '.mov', '.webm', '.avi', '.mkv'];
      const ok = file.mimetype.startsWith('video/') || allowedExt.some((ext) => nameLower.endsWith(ext));
      if (!ok) return cb(new Error('Envie um arquivo de vídeo válido.'));
      return cb(null, true);
    }

    return cb(new Error('Tipo de anexo inválido.'));
  },
});

function handleReuniaoUploadError(error: unknown, req: Request, res: Response, next: NextFunction) {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ success: false, message: 'Arquivo muito grande.' });
  }
  if (error instanceof Error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  return next(error);
}

router.use(authenticate);

router.get('/template', (req, res, next) => controller.getTemplate(req as any, res, next));
router.put('/template', (req, res, next) => controller.saveTemplate(req as any, res, next));
router.post('/template/reset', (req, res, next) => controller.resetTemplate(req as any, res, next));
router.get('/mensal/overview', (req, res, next) => controller.getMensalOverview(req as any, res, next));
router.get('/semanal/overview', (req, res, next) => controller.getSemanalOverview(req as any, res, next));

router.use('/:contractId/:kind', parseReuniaoKindParam);

router.get('/:contractId/:kind', (req, res, next) => controller.getList(req as any, res, next));
router.get('/:contractId/:kind/config', (req, res, next) => controller.getConfig(req as any, res, next));
router.put('/:contractId/:kind/config', (req, res, next) => controller.saveConfig(req as any, res, next));
router.post('/:contractId/:kind/periodo-atual', (req, res, next) =>
  controller.ensurePeriodoAtual(req as any, res, next)
);
router.post('/:contractId/:kind', (req, res, next) => controller.create(req as any, res, next));
router.get('/:contractId/:kind/:reuniaoId', (req, res, next) => controller.get(req as any, res, next));
router.put('/:contractId/:kind/:reuniaoId', (req, res, next) => controller.save(req as any, res, next));
router.delete('/:contractId/:kind/:reuniaoId', (req, res, next) => controller.delete(req as any, res, next));
router.post(
  '/:contractId/:kind/:reuniaoId/anexo/:tipo',
  upload.single('file'),
  handleReuniaoUploadError,
  (req: Request, res: Response, next: NextFunction) => controller.uploadAnexo(req as any, res, next)
);
router.delete('/:contractId/:kind/:reuniaoId/anexo/:tipo', (req, res, next) =>
  controller.deleteAnexo(req as any, res, next)
);

export default router;
