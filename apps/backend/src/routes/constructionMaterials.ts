import { Router } from 'express';
import { ConstructionMaterialController } from '../controllers/ConstructionMaterialController';
import { authenticate } from '../middleware/auth';

const router = Router();
const constructionMaterialController = new ConstructionMaterialController();

router.use(authenticate);

// Listar todos os materiais
router.get('/', (req, res, next) => 
  constructionMaterialController.getAllMaterials(req, res, next)
);

// Obter material por ID
router.get('/:id', (req, res, next) => 
  constructionMaterialController.getMaterialById(req, res, next)
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

