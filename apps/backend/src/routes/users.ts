import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { UserController } from '../controllers/UserController';
import { getBirthdayEmployees } from '../controllers/EmployeeController';

const router = express.Router();
const userController = new UserController();

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rota para aniversariantes (DEVE vir antes de /:id)
router.get('/birthdays', authorize('ADMIN', 'HR'), getBirthdayEmployees);

// Rotas para administradores e RH
router.get('/', authorize('ADMIN', 'HR'), userController.getAllUsers);
router.get('/me/employee', userController.getMyEmployeeData);
router.put('/me/employee', userController.updateMyEmployeeData);
router.post('/', authorize('ADMIN', 'HR'), userController.createUser);

// Rotas para gestores
router.get('/department/:department', authorize('ADMIN', 'HR', 'MANAGER'), userController.getUsersByDepartment);

// Rotas com parâmetros (DEVEM vir por último)
router.get('/:id', authorize('ADMIN', 'HR'), userController.getUserById);
router.put('/:id', authorize('ADMIN', 'HR'), userController.updateUser);
router.delete('/:id', authorize('ADMIN'), userController.deleteUser);

export default router;
