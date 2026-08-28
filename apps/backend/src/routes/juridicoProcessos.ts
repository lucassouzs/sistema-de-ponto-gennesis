import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth';
import { JuridicoProcessoController } from '../controllers/JuridicoProcessoController';

const router = Router();
const controller = new JuridicoProcessoController();

const uploadDir = path.join(os.tmpdir(), 'juridico-import-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

/** ZIPs grandes vão para disco (não RAM). Limite ~8 GB por arquivo. */
const importUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '') || '.bin';
      cb(null, `${Date.now()}-${uuidv4()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 * 1024, files: 400 },
});

function handleJuridicoImportUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        success: false,
        message:
          'Arquivo ZIP grande demais (máx. 8 GB por arquivo). Divida em ZIPs menores e tente de novo.',
      });
      return;
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      res.status(400).json({
        success: false,
        message: 'Muitos arquivos no envio. Envie os ZIPs em etapas menores.',
      });
      return;
    }
    res.status(400).json({
      success: false,
      message: err.message || 'Erro no upload da importação.',
    });
    return;
  }
  next(err);
}

function cleanupUploadedFiles(req: Request) {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  if (!files) return;
  for (const list of Object.values(files)) {
    for (const file of list || []) {
      if (file?.path) {
        try {
          fs.unlinkSync(file.path);
        } catch {
          // ignore
        }
      }
    }
  }
}

/** Upload avulso de anexos/comprovantes na modal (arquivos menores). */
const fileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024, files: 30 },
});

function handleFileUploadError(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(413).json({
        success: false,
        message: 'Arquivo grande demais (máx. 40 MB por arquivo).',
      });
      return;
    }
    res.status(400).json({
      success: false,
      message: err.message || 'Erro no upload do arquivo.',
    });
    return;
  }
  next(err);
}

router.use(authenticate);

router.get('/', (req, res, next) => controller.getAll(req, res, next));
router.post('/', (req, res, next) => controller.create(req, res, next));
router.post(
  '/import',
  (req, res, next) => {
    importUpload.fields([
      { name: 'anexos', maxCount: 300 },
      { name: 'anexosZip', maxCount: 5 },
      { name: 'comprovantes', maxCount: 300 },
      { name: 'comprovantesZip', maxCount: 5 },
    ])(req, res, (err) => {
      if (err) return handleJuridicoImportUploadError(err, req, res, next);
      return next();
    });
  },
  (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = ((body?: unknown) => {
      cleanupUploadedFiles(req);
      return originalJson(body);
    }) as typeof res.json;

    const originalNext = next;
    next = ((err?: unknown) => {
      if (err) cleanupUploadedFiles(req);
      return originalNext(err);
    }) as NextFunction;

    return controller.importMany(req, res, next);
  },
);
router.post(
  '/link-files',
  (req, res, next) => {
    importUpload.fields([
      { name: 'anexos', maxCount: 300 },
      { name: 'anexosZip', maxCount: 5 },
      { name: 'comprovantes', maxCount: 300 },
      { name: 'comprovantesZip', maxCount: 5 },
    ])(req, res, (err) => {
      if (err) return handleJuridicoImportUploadError(err, req, res, next);
      return next();
    });
  },
  (req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = ((body?: unknown) => {
      cleanupUploadedFiles(req);
      return originalJson(body);
    }) as typeof res.json;

    const originalNext = next;
    next = ((err?: unknown) => {
      if (err) cleanupUploadedFiles(req);
      return originalNext(err);
    }) as NextFunction;

    return controller.linkPendingFiles(req, res, next);
  },
);

router.post(
  '/:id/anexos',
  (req, res, next) => {
    fileUpload.array('files', 30)(req, res, (err) => {
      if (err) return handleFileUploadError(err, req, res, next);
      return next();
    });
  },
  (req, res, next) => controller.addAnexos(req, res, next),
);
router.post(
  '/:id/comprovantes',
  (req, res, next) => {
    fileUpload.array('files', 30)(req, res, (err) => {
      if (err) return handleFileUploadError(err, req, res, next);
      return next();
    });
  },
  (req, res, next) => controller.addComprovantes(req, res, next),
);
router.delete('/:id/anexos/:fileId', (req, res, next) =>
  controller.deleteAnexo(req, res, next),
);
router.delete('/:id/comprovantes/:fileId', (req, res, next) =>
  controller.deleteComprovante(req, res, next),
);

router.get('/:id', (req, res, next) => controller.getById(req, res, next));
router.put('/:id', (req, res, next) => controller.update(req, res, next));

export default router;
