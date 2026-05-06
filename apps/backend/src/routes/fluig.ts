import express from 'express';
import { authenticate } from '../middleware/auth';
import {
  getAvailableDatasets,
  getDatasetStructure,
  getDatasetData,
  searchDataset,
} from '../controllers/FluigController';

const router = express.Router();

router.get('/datasets', authenticate, getAvailableDatasets);
router.get('/datasets/:datasetId/structure', authenticate, getDatasetStructure);
router.post('/datasets/:datasetId/data', authenticate, getDatasetData);
router.post('/datasets/:datasetId/search', authenticate, searchDataset);

export default router;
