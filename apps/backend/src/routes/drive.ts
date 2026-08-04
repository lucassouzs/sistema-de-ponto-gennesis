import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authenticate } from '../middleware/auth';
import { DriveController } from '../controllers/DriveController';
import { DRIVE_MAX_FILE_SIZE_BYTES } from '../services/DriveService';

const router = Router();

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, os.tmpdir()),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '';
      cb(null, `drive-upload-${uuidv4()}${ext}`);
    },
  }),
  limits: {
    fileSize: DRIVE_MAX_FILE_SIZE_BYTES,
  },
});

function handleMulterUpload(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (req.file?.path) {
        fs.promises.unlink(req.file.path).catch(() => {});
      }
      if (err.code === 'LIMIT_FILE_SIZE') {
        const gb = Math.round(DRIVE_MAX_FILE_SIZE_BYTES / (1024 ** 3));
        res.status(400).json({
          success: false,
          error: `Arquivo excede o limite de ${gb} GB`,
        });
        return;
      }
      res.status(400).json({ success: false, error: err.message });
      return;
    }
    if (err) {
      next(err);
      return;
    }
    void DriveController.uploadFile(req as any, res);
  });
}

router.use(authenticate);

// Listagem combinada (pastas + arquivos de uma pasta)
router.get('/', DriveController.listFolder);

// Pesquisa
router.get('/search', DriveController.search);

// Views da sidebar
router.get('/views/shared', DriveController.viewShared);
router.get('/views/recent', DriveController.viewRecent);
router.get('/views/starred', DriveController.viewStarred);
router.get('/views/trash', DriveController.viewTrash);
router.get('/storage', DriveController.storage);

// Pastas
router.post('/folders', DriveController.createFolder);
router.get('/folders', DriveController.listFolders);
router.patch('/folders/:id', DriveController.renameFolder);
router.patch('/folders/:id/star', DriveController.starFolder);
router.post('/folders/:id/restore', DriveController.restoreFolder);
router.delete('/folders/:id/permanent', DriveController.permanentDeleteFolder);
router.delete('/folders/:id', DriveController.deleteFolder);
// Compartilhamento (rotas mais específicas antes de :id/path)
router.get('/folders/:id/shares', DriveController.listFolderShares);
router.post('/folders/:id/shares', DriveController.addFolderShare);
router.patch('/folders/:id/shares/:userId', DriveController.updateFolderShare);
router.delete('/folders/:id/shares/:userId', DriveController.removeFolderShare);
router.get('/folders/:id/path', DriveController.getFolderPath);

// Arquivos
router.post('/files/presign', DriveController.presignUpload);
router.post('/files/confirm', DriveController.confirmUpload);
router.post('/files', handleMulterUpload);
router.get('/files', DriveController.listFiles);
router.get('/files/:id/download', DriveController.downloadFile);
router.get('/files/:id/preview', DriveController.previewFile);
router.get('/files/:id/content', DriveController.contentFile);
router.patch('/files/:id', DriveController.renameFile);
router.patch('/files/:id/star', DriveController.starFile);
router.patch('/files/:id/move', DriveController.moveFile);
router.post('/files/:id/restore', DriveController.restoreFile);
router.delete('/files/:id/permanent', DriveController.permanentDeleteFile);
router.delete('/files/:id', DriveController.deleteFile);

export default router;
