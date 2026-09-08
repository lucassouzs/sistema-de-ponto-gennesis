import express from 'express';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { requireEmployeesModuleAccess } from '../middleware/permissionAuth';
import { UserController } from '../controllers/UserController';
import { UserActivityController } from '../controllers/UserActivityController';
import { getBirthdayEmployees } from '../controllers/EmployeeController';
import { importEmployees, importEmployeesPreview, importEmployeesBulk } from '../controllers/EmployeeImportController';
import { uploadImport, handleUploadError } from '../middleware/upload';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import { Response, NextFunction } from 'express';

const router = express.Router();
const userController = new UserController();
const userActivityController = new UserActivityController();
const CHANGE_EMPLOYEE_PASSWORD_MODULE_KEY = pathToModuleKey('/ponto/controle/alterar-senha-funcionarios');

// Todas as rotas precisam de autenticação
router.use(authenticate);

// Rota para aniversariantes (DEVE vir antes de /:id)
router.get('/birthdays', authorize('EMPLOYEE'), getBirthdayEmployees);

// Rota para preview/validação de importação (DEVE vir antes de /:id)
router.post('/import/preview', requireEmployeesModuleAccess, uploadImport.single('file'), handleUploadError, importEmployeesPreview);

// Rota para importação em massa a partir de dados processados (DEVE vir antes de /:id)
router.post('/import/bulk', requireEmployeesModuleAccess, importEmployeesBulk);

// Rota para importação em massa (DEVE vir antes de /:id)
router.post('/import', requireEmployeesModuleAccess, uploadImport.single('file'), handleUploadError, importEmployees);

// Rota para verificar se CPF existe (DEVE vir antes de /:id)
router.get('/check-cpf', requireEmployeesModuleAccess, userController.checkCpfExists);

// Rota para verificar se email existe (DEVE vir antes de /:id)
router.get('/check-email', requireEmployeesModuleAccess, userController.checkEmailExists);

// Rotas para funcionários — exige permissão no módulo Funcionários
router.get('/', requireEmployeesModuleAccess, userController.getAllUsers);
router.get('/me/employee', userController.getMyEmployeeData);
router.put('/me/employee', userController.updateMyEmployeeData);
router.post('/me/page-view', userActivityController.recordPageView);
router.post('/', requireEmployeesModuleAccess, userController.createUser);

// Rotas para funcionários
router.get('/department/:department', requireEmployeesModuleAccess, userController.getUsersByDepartment);

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
router.get(
  '/:id/activity/insights',
  requireEmployeesModuleAccess,
  userActivityController.getUserActivityInsights.bind(userActivityController)
);
router.get('/:id/activity', requireEmployeesModuleAccess, userActivityController.getUserActivity);
router.get('/:id', requireEmployeesModuleAccess, userController.getUserById);
router.put('/:id', requireEmployeesModuleAccess, userController.updateUser);
router.delete('/:id', requireEmployeesModuleAccess, userController.deleteUser);

export default router;
