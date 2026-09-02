import express from 'express';
import multer from 'multer';
import {
  authenticate,
  authenticateForRefresh,
  requireAdministrator,
} from '../middleware/auth';
import { AuthController } from '../controllers/AuthController';

const router = express.Router();
const authController = new AuthController();

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Rotas públicas
router.post('/login', authController.login);
// Aceita access token válido ou expirado dentro da janela de graça
router.post('/refresh-token', authenticateForRefresh, authController.publicRefreshToken);

// Registro apenas para administradores autenticados (criação de usuários também existe em /users)
router.post('/register', authenticate, requireAdministrator, authController.register);

// Rotas protegidas
router.use(authenticate);
router.post('/logout', authController.logout);
router.get('/me', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.patch('/me/photo', uploadAvatar.single('profileAvatar'), authController.uploadProfilePhoto);
router.delete('/me/photo', authController.removeProfilePhoto);
router.put('/change-password', authController.changePassword);
router.post(
  '/impersonate/:userId',
  requireAdministrator,
  authController.startImpersonation
);
router.post('/stop-impersonation', authController.stopImpersonation);
// Rota protegida de refresh (para compatibilidade, mantém a antiga)
router.post('/refresh-token-protected', authController.refreshToken);

export default router;
