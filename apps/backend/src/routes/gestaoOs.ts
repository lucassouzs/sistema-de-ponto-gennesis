import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { savePersistentUpload } from '../lib/persistentUpload';
import { gestaoOsController } from '../controllers/GestaoOsController';
import { gestaoOsCadastrosController } from '../controllers/GestaoOsCadastrosController';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 }
});

router.use(authenticate);

router.get('/summary', (req, res, next) => gestaoOsController.summary(req, res, next));
router.get('/locations', (req, res, next) => gestaoOsController.locationTree(req, res, next));
router.get('/technicians', (req, res, next) => gestaoOsController.technicians(req, res, next));

// ── Cadastros (antes de /:id) ───────────────────────────────────────
router.get('/cadastros/companies', (req, res, next) =>
  gestaoOsCadastrosController.listCompanies(req, res, next)
);
router.post('/cadastros/companies', (req, res, next) =>
  gestaoOsCadastrosController.createCompany(req, res, next)
);
router.patch('/cadastros/companies/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateCompany(req, res, next)
);
router.post('/cadastros/branches', (req, res, next) =>
  gestaoOsCadastrosController.createBranch(req, res, next)
);
router.patch('/cadastros/branches/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateBranch(req, res, next)
);

router.get('/cadastros/locations', (req, res, next) =>
  gestaoOsCadastrosController.locationTreeAdmin(req, res, next)
);
router.post('/cadastros/buildings', (req, res, next) =>
  gestaoOsCadastrosController.createBuilding(req, res, next)
);
router.patch('/cadastros/buildings/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateBuilding(req, res, next)
);
router.post('/cadastros/sectors', (req, res, next) =>
  gestaoOsCadastrosController.createSector(req, res, next)
);
router.patch('/cadastros/sectors/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateSector(req, res, next)
);
router.post('/cadastros/places', (req, res, next) =>
  gestaoOsCadastrosController.createPlace(req, res, next)
);
router.patch('/cadastros/places/:id', (req, res, next) =>
  gestaoOsCadastrosController.updatePlace(req, res, next)
);
router.post('/cadastros/assets', (req, res, next) =>
  gestaoOsCadastrosController.createAsset(req, res, next)
);
router.patch('/cadastros/assets/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateAsset(req, res, next)
);
router.get('/cadastros/assets/:id/qr', (req, res, next) =>
  gestaoOsCadastrosController.assetQr(req, res, next)
);
router.get('/cadastros/qr/resolve', (req, res, next) =>
  gestaoOsCadastrosController.resolveQr(req, res, next)
);

router.get('/cadastros/providers', (req, res, next) =>
  gestaoOsCadastrosController.listProviders(req, res, next)
);
router.post('/cadastros/providers', (req, res, next) =>
  gestaoOsCadastrosController.createProvider(req, res, next)
);
router.patch('/cadastros/providers/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateProvider(req, res, next)
);

router.get('/cadastros/categories', (req, res, next) =>
  gestaoOsCadastrosController.listCategories(req, res, next)
);
router.post('/cadastros/categories', (req, res, next) =>
  gestaoOsCadastrosController.createCategory(req, res, next)
);
router.patch('/cadastros/categories/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateCategory(req, res, next)
);

router.get('/cadastros/memberships', (req, res, next) =>
  gestaoOsCadastrosController.listMemberships(req, res, next)
);
router.post('/cadastros/memberships', (req, res, next) =>
  gestaoOsCadastrosController.upsertMembership(req, res, next)
);
router.patch('/cadastros/memberships/:id', (req, res, next) =>
  gestaoOsCadastrosController.updateMembership(req, res, next)
);
router.get('/cadastros/users', (req, res, next) =>
  gestaoOsCadastrosController.listUsers(req, res, next)
);
router.get('/cadastros/settings', (req, res, next) =>
  gestaoOsCadastrosController.getSettings(req, res, next)
);
router.patch('/cadastros/settings', (req, res, next) =>
  gestaoOsCadastrosController.updateSettings(req, res, next)
);

router.get('/', (req, res, next) => gestaoOsController.list(req, res, next));

router.post('/upload-attachment', (req: AuthRequest, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) throw createError('Selecione um arquivo', 400);
    const saved = await savePersistentUpload({
      folder: 'gestao-os',
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype
    });
    res.json({
      success: true,
      data: {
        url: saved.url,
        name: req.file.originalname || saved.fileName,
        mimeType: req.file.mimetype
      }
    });
  } catch (error) {
    next(error);
  }
});

router.post('/', (req, res, next) => gestaoOsController.create(req, res, next));
router.get('/:id', (req, res, next) => gestaoOsController.getById(req, res, next));
router.patch('/:id', (req, res, next) => gestaoOsController.update(req, res, next));
router.post('/:id/transition', (req, res, next) => gestaoOsController.transition(req, res, next));

export default router;
