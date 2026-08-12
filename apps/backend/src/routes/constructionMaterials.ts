import { Router } from 'express';
import multer from 'multer';
import { ConstructionMaterialController } from '../controllers/ConstructionMaterialController';
import { authenticate } from '../middleware/auth';
import { savePersistentUpload } from '../lib/persistentUpload';

const router = Router();
const constructionMaterialController = new ConstructionMaterialController();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
      return;
    }
    cb(new Error('Apenas arquivos de imagem são permitidos'));
  }
});

router.use(authenticate);

// Upload de imagem do produto
router.post('/upload-image', (req, res, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Erro no upload da imagem';
      res.status(400).json({ success: false, message });
      return;
    }
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, message: 'Selecione uma imagem para enviar' });
      return;
    }

    const saved = await savePersistentUpload({
      folder: 'construction-materials',
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });

    res.json({
      success: true,
      data: {
        url: saved.url,
        originalName: req.file.originalname || saved.fileName
      }
    });
  } catch (error) {
    next(error);
  }
});

// Importar materiais em lote (JSON)
router.post('/import', (req, res, next) =>
  constructionMaterialController.importMaterials(req, res, next)
);

// Produtos ativos do TOTVS RM (consulta PRODUTOSATIVOS)
router.get('/totvs/produtos-ativos', (req, res, next) =>
  constructionMaterialController.getTotvsProdutosAtivos(req, res, next)
);

// Listar todos os materiais
router.get('/', (req, res, next) => 
  constructionMaterialController.getAllMaterials(req, res, next)
);

// Resolver IDs por nomes (estoque / OC)
router.post('/resolve-by-names', (req, res, next) =>
  constructionMaterialController.resolveByNames(req, res, next)
);

// Obter material por ID
router.get('/:id', (req, res, next) => 
  constructionMaterialController.getMaterialById(req, res, next)
);

// Histórico de compras (média paga + linhas de OC efetivas)
router.get('/:id/purchase-history', (req, res, next) =>
  constructionMaterialController.getMaterialPurchaseHistory(req, res, next)
);

// Criar novo material
router.post('/', (req, res, next) => 
  constructionMaterialController.createMaterial(req, res, next)
);

// Atualizar material
router.patch('/:id', (req, res, next) => 
  constructionMaterialController.updateMaterial(req, res, next)
);

// Deletar material
router.delete('/:id', (req, res, next) => 
  constructionMaterialController.deleteMaterial(req, res, next)
);

export default router;

