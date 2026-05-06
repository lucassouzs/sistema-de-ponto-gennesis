import { Router } from 'express';
import { CostCenterController } from '../controllers/CostCenterController';
import { authenticate } from '../middleware/auth';

const router = Router();
const costCenterController = new CostCenterController();

router.use(authenticate);

// Listar todos os centros de custo
router.get('/', (req, res, next) => 
  costCenterController.getAllCostCenters(req, res, next)
);

// Obter centro de custo por ID
router.get('/:id', (req, res, next) => 
  costCenterController.getCostCenterById(req, res, next)
);

// Criar centro de custo
router.post('/', (req, res, next) => 
  costCenterController.createCostCenter(req, res, next)
);

// Atualizar centro de custo
router.patch('/:id', (req, res, next) => 
  costCenterController.updateCostCenter(req, res, next)
);

// Deletar centro de custo
router.delete('/:id', (req, res, next) => 
  costCenterController.deleteCostCenter(req, res, next)
);

// Importar centros de custo em massa
router.post('/import/bulk', (req, res, next) => 
  costCenterController.importBulkCostCenters(req, res, next)
);

export default router;
