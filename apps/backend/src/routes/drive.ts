import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { DriveController } from '../controllers/DriveController';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.DRIVE_MAX_FILE_SIZE || '104857600'), // 100 MB
  },
});

router.use(authenticate);

// Listagem combinada (pastas + arquivos de uma pasta)
router.get('/', DriveController.listFolder);

// Pesquisa
router.get('/search', DriveController.search);

// Pastas
router.post('/folders', DriveController.createFolder);
router.get('/folders', DriveController.listFolders);
router.patch('/folders/:id', DriveController.renameFolder);
router.delete('/folders/:id', DriveController.deleteFolder);
// Compartilhamento (rotas mais específicas antes de :id/path)
router.get('/folders/:id/shares', DriveController.listFolderShares);
router.post('/folders/:id/shares', DriveController.addFolderShare);
router.patch('/folders/:id/shares/:userId', DriveController.updateFolderShare);
router.delete('/folders/:id/shares/:userId', DriveController.removeFolderShare);
router.get('/folders/:id/path', DriveController.getFolderPath);

// Arquivos
router.post('/files', upload.single('file'), DriveController.uploadFile);
router.get('/files', DriveController.listFiles);
router.get('/files/:id/download', DriveController.downloadFile);
router.get('/files/:id/preview', DriveController.previewFile);
router.patch('/files/:id', DriveController.renameFile);
router.patch('/files/:id/move', DriveController.moveFile);
router.delete('/files/:id', DriveController.deleteFile);

export default router;
