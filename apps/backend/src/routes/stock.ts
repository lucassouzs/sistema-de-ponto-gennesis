import { Router } from 'express';
import multer from 'multer';
import { StockController } from '../controllers/StockController';
import { StockShortfallController } from '../controllers/StockShortfallController';
import { authenticate } from '../middleware/auth';
import { savePersistentUpload } from '../lib/persistentUpload';
import { fixMulterOriginalName } from '../lib/fixUploadFileName';

const router = Router();
const stockController = new StockController();
const stockShortfallController = new StockShortfallController();
const invoiceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype === 'application/xml' ||
      file.mimetype === 'text/xml' ||
      file.mimetype.startsWith('image/') ||
      /\.(pdf|xml|png|jpg|jpeg|webp)$/i.test(name);
    if (ok) cb(null, true);
    else cb(new Error('Envie PDF, XML ou imagem (PNG, JPG, WEBP)'));
  }
});
const withdrawalSheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('image/') ||
      /\.(pdf|png|jpg|jpeg|webp)$/i.test(name);
    if (ok) cb(null, true);
    else cb(new Error('Envie PDF ou imagem (PNG, JPG, WEBP)'));
  }
});
const paymentSlipUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('image/') ||
      /\.(pdf|png|jpg|jpeg|webp)$/i.test(name);
    if (ok) cb(null, true);
    else cb(new Error('Envie PDF ou imagem (PNG, JPG, WEBP)'));
  }
});

router.use(authenticate);

// Listar movimentações
router.get('/movements', (req, res, next) => 
  stockController.listMovements(req, res, next)
);

// Obter saldo atual
router.get('/balance', (req, res, next) => 
  stockController.getStockBalance(req, res, next)
);

// Obter movimentação por ID
router.get('/movements/:id', (req, res, next) => 
  stockController.getMovementById(req, res, next)
);

// Criar movimentação
router.post('/movements', (req, res, next) => 
  stockController.createMovement(req, res, next)
);

router.post('/adjustments/import', (req, res, next) =>
  stockController.importAdjustments(req, res, next)
);

// Upload de nota fiscal para movimentação
router.post('/upload-invoice', (req, res, next) => {
  invoiceUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Erro no upload da nota fiscal';
      res.status(400).json({ success: false, message });
      return;
    }
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, message: 'Selecione um arquivo para enviar' });
      return;
    }

    const saved = await savePersistentUpload({
      folder: 'stock-invoices',
      buffer: req.file.buffer,
      originalName: fixMulterOriginalName(req.file.originalname),
      mimeType: req.file.mimetype,
      fileNamePrefix: 'nf-',
    });

    res.json({
      success: true,
      data: {
        url: saved.url,
        originalName: fixMulterOriginalName(req.file.originalname) || saved.originalName || saved.fileName
      }
    });
  } catch (error) {
    next(error);
  }
});

// Upload da ficha de retirada para movimentação de saída
router.post('/upload-withdrawal-sheet', (req, res, next) => {
  withdrawalSheetUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Erro no upload da ficha de retirada';
      res.status(400).json({ success: false, message });
      return;
    }
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, message: 'Selecione um arquivo para enviar' });
      return;
    }

    const saved = await savePersistentUpload({
      folder: 'stock-withdrawal-sheets',
      buffer: req.file.buffer,
      originalName: fixMulterOriginalName(req.file.originalname),
      mimeType: req.file.mimetype,
      fileNamePrefix: 'ficha-retirada-',
    });

    res.json({
      success: true,
      data: {
        url: saved.url,
        originalName: fixMulterOriginalName(req.file.originalname) || saved.originalName || saved.fileName
      }
    });
  } catch (error) {
    next(error);
  }
});

// Upload de boleto para movimentação de entrada
router.post('/upload-payment-slip', (req, res, next) => {
  paymentSlipUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : 'Erro no upload do boleto';
      res.status(400).json({ success: false, message });
      return;
    }
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, message: 'Selecione um arquivo para enviar' });
      return;
    }

    const saved = await savePersistentUpload({
      folder: 'stock-payment-slips',
      buffer: req.file.buffer,
      originalName: fixMulterOriginalName(req.file.originalname),
      mimeType: req.file.mimetype,
      fileNamePrefix: 'boleto-',
    });

    res.json({
      success: true,
      data: {
        url: saved.url,
        originalName: fixMulterOriginalName(req.file.originalname) || saved.originalName || saved.fileName
      }
    });
  } catch (error) {
    next(error);
  }
});

// Deletar movimentação
router.delete('/movements/:id', (req, res, next) => 
  stockController.deleteMovement(req, res, next)
);

router.get('/shortfalls/pending-count', (req, res, next) =>
  stockShortfallController.countPending(req, res, next)
);
router.get('/shortfalls', (req, res, next) => stockShortfallController.list(req, res, next));
router.patch('/shortfalls/:id/resolve', (req, res, next) =>
  stockShortfallController.resolve(req, res, next)
);

export default router;
