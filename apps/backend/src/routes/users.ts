import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserController } from '../controllers/UserController';

const router = express.Router();
const userController = new UserController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rotas para administradores e RH
router.get('/', authorize('ADMIN', 'HR'), userController.getAllUsers);
router.get('/:id', authorize('ADMIN', 'HR'), userController.getUserById);
router.post('/', authorize('ADMIN', 'HR'), userController.createUser);
router.put('/:id', authorize('ADMIN', 'HR'), userController.updateUser);
router.delete('/:id', authorize('ADMIN'), userController.deleteUser);

// Rotas para funcionários
router.get('/me/employee', userController.getMyEmployeeData);
router.put('/me/employee', userController.updateMyEmployeeData);

// Rotas para gestores
router.get('/department/:department', authorize('ADMIN', 'HR', 'MANAGER'), userController.getUsersByDepartment);

export default router;
