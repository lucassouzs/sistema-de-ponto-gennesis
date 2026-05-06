import express from 'express';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { UserController } from '../controllers/UserController';
import { getBirthdayEmployees } from '../controllers/EmployeeController';
import { importEmployees, importEmployeesPreview, importEmployeesBulk } from '../controllers/EmployeeImportController';
import { uploadImport, handleUploadError } from '../middleware/upload';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { Response, NextFunction } from 'express';

const router = express.Router();
const userController = new UserController();
const CHANGE_EMPLOYEE_PASSWORD_MODULE_KEY = pathToModuleKey('/ponto/controle/alterar-senha-funcionarios');

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rota para aniversariantes (DEVE vir antes de /:id)
router.get('/birthdays', authorize('EMPLOYEE'), getBirthdayEmployees);

// Rota para preview/validação de importação (DEVE vir antes de /:id)
router.post('/import/preview', authorize('EMPLOYEE'), uploadImport.single('file'), handleUploadError, importEmployeesPreview);

// Rota para importação em massa a partir de dados processados (DEVE vir antes de /:id)
router.post('/import/bulk', authorize('EMPLOYEE'), importEmployeesBulk);

// Rota para importação em massa (DEVE vir antes de /:id)
router.post('/import', authorize('EMPLOYEE'), uploadImport.single('file'), handleUploadError, importEmployees);

// Rota para verificar se CPF existe (DEVE vir antes de /:id)
router.get('/check-cpf', authorize('EMPLOYEE'), userController.checkCpfExists);

// Rota para verificar se email existe (DEVE vir antes de /:id)
router.get('/check-email', authorize('EMPLOYEE'), userController.checkEmailExists);

// Rotas para funcionários - agora todos têm acesso
router.get('/', authorize('EMPLOYEE'), userController.getAllUsers);
router.get('/me/employee', userController.getMyEmployeeData);
router.put('/me/employee', userController.updateMyEmployeeData);
router.post('/', authorize('EMPLOYEE'), userController.createUser);

// Rotas para funcionários
router.get('/department/:department', authorize('EMPLOYEE'), userController.getUsersByDepartment);

// Rotas com parâmetros (DEVEM vir por último)
router.put(
  '/:id/password',
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(createError('Usuário não autenticado', 401));
      }
      if (req.user.isAdmin) return next();

      const perm = await prisma.userPermission.findFirst({
        where: {
          userId: req.user.id,
          module: CHANGE_EMPLOYEE_PASSWORD_MODULE_KEY,
          allowed: true,
          action: {
            in: [PERMISSION_ACCESS_ACTION, 'ver']
          }
        },
        select: { id: true }
      });

      if (!perm) {
        return next(createError('Você não tem permissão para alterar senha de funcionários', 403));
      }
      return next();
    } catch (error) {
      return next(error);
    }
  },
  userController.updateUserPassword
);
router.get('/:id', authorize('EMPLOYEE'), userController.getUserById);
router.put('/:id', authorize('EMPLOYEE'), userController.updateUser);
router.delete('/:id', authorize('EMPLOYEE'), userController.deleteUser);

export default router;
