import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { StockController } from '../controllers/StockController';
import { StockShortfallController } from '../controllers/StockShortfallController';
import { authenticate } from '../middleware/auth';
import { backendUploadsRoot } from '../lib/uploads';

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
}, (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, message: 'Selecione um arquivo para enviar' });
      return;
    }

    const uploadsDir = path.join(backendUploadsRoot, 'stock-invoices');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const ext = path.extname(req.file.originalname || '') || '.bin';
    const fileName = `nf-${uuidv4()}${ext.length <= 8 ? ext : '.bin'}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);

    res.json({
      success: true,
      data: {
        url: `/uploads/stock-invoices/${fileName}`,
        originalName: req.file.originalname || fileName
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
}, (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, message: 'Selecione um arquivo para enviar' });
      return;
    }

    const uploadsDir = path.join(backendUploadsRoot, 'stock-withdrawal-sheets');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const ext = path.extname(req.file.originalname || '') || '.bin';
    const fileName = `ficha-retirada-${uuidv4()}${ext.length <= 8 ? ext : '.bin'}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);

    res.json({
      success: true,
      data: {
        url: `/uploads/stock-withdrawal-sheets/${fileName}`,
        originalName: req.file.originalname || fileName
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
}, (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      res.status(400).json({ success: false, message: 'Selecione um arquivo para enviar' });
      return;
    }

    const uploadsDir = path.join(backendUploadsRoot, 'stock-payment-slips');
    fs.mkdirSync(uploadsDir, { recursive: true });

    const ext = path.extname(req.file.originalname || '') || '.bin';
    const fileName = `boleto-${uuidv4()}${ext.length <= 8 ? ext : '.bin'}`;
    fs.writeFileSync(path.join(uploadsDir, fileName), req.file.buffer);

    res.json({
      success: true,
      data: {
        url: `/uploads/stock-payment-slips/${fileName}`,
        originalName: req.file.originalname || fileName
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
