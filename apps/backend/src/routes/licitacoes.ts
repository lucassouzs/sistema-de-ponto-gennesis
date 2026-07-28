import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { LicitacaoController } from '../controllers/LicitacaoController';
import { AuthRequest } from '../middleware/auth';

const router = Router();
const ctrl = new LicitacaoController();

router.use(authenticate);

router.get('/checklist-template', (req, res, next) => ctrl.getChecklistTemplate(req, res, next));
router.put('/checklist-template', (req, res, next) => ctrl.updateChecklistTemplate(req, res, next));

router.get('/planilha-regioes', (req, res, next) => ctrl.listRegiaoTabs(req, res, next));
router.get('/planilha-regioes/:regiaoKey', (req, res, next) => ctrl.getRegiaoSheet(req, res, next));
router.post('/planilha-regioes/aceites', (req, res, next) => ctrl.registrarAceiteRegiao(req, res, next));
router.delete('/planilha-regioes/aceites', (req, res, next) => ctrl.desfazerAceiteRegiao(req, res, next));
router.post('/planilha-regioes/manuais', (req, res, next) => ctrl.createManualRegiao(req, res, next));
router.delete('/planilha-regioes/manuais', (req, res, next) => ctrl.deleteManualRegiao(req, res, next));
router.get('/banco-cats', (req, res, next) => ctrl.getBancoCatsSheet(req, res, next));
router.post('/banco-cats', (req, res, next) => ctrl.createBancoCatsServico(req, res, next));
router.delete('/banco-cats', (req, res, next) => ctrl.deleteBancoCatsServico(req, res, next));
router.get('/orcamento-line-template', (req, res, next) =>
  ctrl.getOrcamentoLineTemplate(req, res, next)
);
router.put('/orcamento-line-template', (req, res, next) =>
  ctrl.updateOrcamentoLineTemplate(req, res, next)
);

router.get('/', (req, res, next) => ctrl.list(req, res, next));
router.post('/', (req, res, next) => ctrl.create(req, res, next));
router.get('/:id', (req, res, next) => ctrl.getById(req, res, next));
router.patch('/:id/analise-manual', (req, res, next) => ctrl.updateAnaliseManual(req, res, next));
router.patch('/:id/assumir-analise', (req, res, next) => ctrl.assumirAnaliseManual(req, res, next));
router.patch('/:id/liberar-analise', (req, res, next) => ctrl.liberarAnaliseManual(req, res, next));
router.patch('/:id/finalizar-analise', (req, res, next) => ctrl.finalizarAnaliseManual(req, res, next));
router.patch('/:id/arquivar', (req, res, next) => ctrl.arquivarAnalise(req, res, next));
router.patch('/:id/desarquivar', (req, res, next) => ctrl.desarquivarAnalise(req, res, next));
router.get('/:id/orcamento', (req, res, next) => ctrl.getOrcamento(req, res, next));
router.put('/:id/orcamento', (req, res, next) => ctrl.saveOrcamento(req, res, next));
router.patch('/:id', (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id', (req, res, next) => ctrl.delete(req, res, next));

router.post('/:id/documentos', (req: AuthRequest, res: Response, next: NextFunction) => {
  ctrl.uploadMiddleware(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    void ctrl.uploadDocument(req, res, next);
  });
});

router.delete('/:id/documentos/:documentoId', (req, res, next) => ctrl.removeDocument(req, res, next));
router.post('/:id/extrair', (req, res, next) => ctrl.extrair(req, res, next));
router.post('/:id/perguntar', (req, res, next) => ctrl.perguntar(req, res, next));

export default router;
