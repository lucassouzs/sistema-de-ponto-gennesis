import express, { Response, NextFunction } from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { uploadAsoAttachment } from '../middleware/upload';
import { savePersistentUpload } from '../lib/persistentUpload';
import { AsoController } from '../controllers/AsoController';
import { AsoService } from '../services/AsoService';

const router = express.Router();
const controller = new AsoController();
const asoService = new AsoService();

router.use(authenticate);

router.get('/tipos', (req, res, next) => controller.listTipos(req, res, next));
router.put('/tipos/:id', authorize('EMPLOYEE'), (req, res, next) =>
  controller.updateTipo(req, res, next)
);
router.get('/dashboard', (req, res, next) => controller.dashboard(req, res, next));
router.get('/preview-validade', (req, res, next) => controller.previewValidade(req, res, next));
router.get('/export', (req, res, next) => controller.exportRegistros(req, res, next));

router.get('/cargos-risco', (req, res, next) => controller.listCargosRisco(req, res, next));
router.get('/cargos-disponiveis', (req, res, next) =>
  controller.listCargosDisponiveis(req, res, next)
);
router.get('/cargos-sem-periodicidade', (req, res, next) =>
  controller.cargosSemPeriodicidade(req, res, next)
);
router.post('/cargos-risco', authorize('EMPLOYEE'), (req, res, next) =>
  controller.createCargoRisco(req, res, next)
);
router.put('/cargos-risco/:id', authorize('EMPLOYEE'), (req, res, next) =>
  controller.updateCargoRisco(req, res, next)
);
router.delete('/cargos-risco/:id', authorize('EMPLOYEE'), (req, res, next) =>
  controller.deleteCargoRisco(req, res, next)
);

router.get('/por-funcionario', (req, res, next) => controller.listPorFuncionario(req, res, next));
router.get('/funcionarios/:funcionarioId/historico', (req, res, next) =>
  controller.historicoFuncionario(req, res, next)
);
router.get('/funcionarios/:funcionarioId/ultimo', (req, res, next) =>
  controller.ultimoAsoFuncionario(req, res, next)
);

router.get('/registros', (req, res, next) => controller.listRegistros(req, res, next));
router.post('/registros/import', authorize('EMPLOYEE'), (req, res, next) =>
  controller.importRegistros(req, res, next)
);
router.post('/registros', authorize('EMPLOYEE'), (req, res, next) =>
  controller.createRegistro(req, res, next)
);

// Upload de anexo (PDF ou imagem) do registro de ASO — precisa vir antes das rotas /registros/:id genéricas
router.post(
  '/registros/:id/anexo',
  authorize('EMPLOYEE'),
  (req: AuthRequest, res: Response, next: NextFunction) => {
    uploadAsoAttachment.single('file')(req, res, (err: unknown) => {
      if (err) {
        const msg = err instanceof Error ? err.message : 'Erro no upload';
        res.status(400).json({ success: false, message: msg });
        return;
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.file?.buffer) {
        throw createError('Selecione um arquivo', 400);
      }
      const saved = await savePersistentUpload({
        folder: 'aso',
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        includeSafeOriginalName: true,
      });

      const data = await asoService.setAnexo(req.params.id, saved.url);
      res.json({ success: true, data, message: 'Anexo enviado com sucesso' });
    } catch (error) {
      next(error);
    }
  }
);

router.get('/registros/:id', (req, res, next) => controller.getRegistro(req, res, next));
router.put('/registros/:id', authorize('EMPLOYEE'), (req, res, next) =>
  controller.updateRegistro(req, res, next)
);
router.delete('/registros/:id', authorize('EMPLOYEE'), (req, res, next) =>
  controller.deleteRegistro(req, res, next)
);

export default router;
