import { Router } from 'express';
import { ContractController } from '../controllers/ContractController';
import { ContractBillingController } from '../controllers/ContractBillingController';
import { ContractAnnualValueController } from '../controllers/ContractAnnualValueController';
import { ContractAddendumController } from '../controllers/ContractAddendumController';
import { ContractPleitoController } from '../controllers/ContractPleitoController';
import { ContractWeeklyProductionController } from '../controllers/ContractWeeklyProductionController';
import { authenticate } from '../middleware/auth';

const router = Router();
const contractController = new ContractController();
const billingController = new ContractBillingController();
const weeklyProductionController = new ContractWeeklyProductionController();
const annualValueController = new ContractAnnualValueController();
const addendumController = new ContractAddendumController();
const pleitoController = new ContractPleitoController();

router.use(authenticate);

router.get('/', (req, res, next) =>
  contractController.getAllContracts(req, res, next)
);

router.get('/overview', (req, res, next) =>
  contractController.getOverview(req, res, next)
);

router.post('/', (req, res, next) =>
  contractController.createContract(req, res, next)
);

// Rotas de faturamento e andamento da OS (devem vir antes de /:id para não conflitar)
router.get('/:contractId/billings', (req, res, next) =>
  billingController.getBillingsByContract(req, res, next)
);
router.get('/:contractId/pleitos', (req, res, next) =>
  pleitoController.getPleitosByContract(req, res, next)
);
router.post('/:contractId/pleitos', (req, res, next) =>
  pleitoController.createPleito(req, res, next)
);
router.post('/:contractId/billings', (req, res, next) =>
  billingController.createBilling(req, res, next)
);
router.patch('/:contractId/billings/:id', (req, res, next) =>
  billingController.updateBilling(req, res, next)
);
router.delete('/:contractId/billings/:id', (req, res, next) =>
  billingController.deleteBilling(req, res, next)
);

router.get('/:contractId/weekly-productions', (req, res, next) =>
  weeklyProductionController.getProductionsByContract(req, res, next)
);
router.post('/:contractId/weekly-productions', (req, res, next) =>
  weeklyProductionController.createProduction(req, res, next)
);
router.patch('/:contractId/weekly-productions/:id', (req, res, next) =>
  weeklyProductionController.updateProduction(req, res, next)
);
router.delete('/:contractId/weekly-productions/:id', (req, res, next) =>
  weeklyProductionController.deleteProduction(req, res, next)
);

// Rotas de valor anual por ano
router.get('/:contractId/annual-values', (req, res, next) =>
  annualValueController.getAnnualValues(req, res, next)
);
router.put('/:contractId/annual-values/:year', (req, res, next) =>
  annualValueController.setAnnualValue(req, res, next)
);
router.get('/:contractId/addenda', (req, res, next) =>
  addendumController.listByContract(req, res, next)
);
router.post('/:contractId/addenda', (req, res, next) =>
  addendumController.create(req, res, next)
);
router.delete('/:contractId/addenda/:id', (req, res, next) =>
  addendumController.delete(req, res, next)
);

router.get('/:id', (req, res, next) =>
  contractController.getContractById(req, res, next)
);

router.patch('/:id', (req, res, next) =>
  contractController.updateContract(req, res, next)
);

router.delete('/:id', (req, res, next) =>
  contractController.deleteContract(req, res, next)
);

export default router;
