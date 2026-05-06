import express from 'express';
import multer from 'multer';
import { authenticate, authenticateForRefresh } from '../middleware/auth';
import { AuthController } from '../controllers/AuthController';

const router = express.Router();
const authController = new AuthController();

const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// Rotas públicas
router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
// Rota pública de refresh que aceita tokens expirados
router.post('/refresh-token', authenticateForRefresh, authController.publicRefreshToken);

// Rotas protegidas
router.use(authenticate);
router.post('/logout', authController.logout);
router.get('/me', authController.getProfile);
router.put('/profile', authController.updateProfile);
router.patch('/me/photo', uploadAvatar.single('profileAvatar'), authController.uploadProfilePhoto);
router.delete('/me/photo', authController.removeProfilePhoto);
router.put('/change-password', authController.changePassword);
// Rota protegida de refresh (para compatibilidade, mantém a antiga)
router.post('/refresh-token-protected', authController.refreshToken);

export default router;
