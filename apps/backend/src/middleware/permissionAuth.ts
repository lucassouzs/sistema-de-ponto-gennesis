import { Response, NextFunction } from 'express';
import { PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from '../lib/prisma';
import { userHasDpApprovePermission } from '../lib/dpApprovalAccess';
import { AuthRequest } from './auth';
import { createError } from './errorHandler';

/** Acesso total ao submenu (módulo) — ação persistida como `acesso`. */
export const requireModuleAccess = (moduleKey: string) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(createError('Usuário não autenticado', 401));
      }

      if (req.user.isAdmin) {
        return next();
      }

      const permission = await prisma.userPermission.findUnique({
        where: {
          userId_module_action: {
            userId: req.user.id,
            module: moduleKey,
            action: PERMISSION_ACCESS_ACTION,
          },
        },
      });

      if (!permission?.allowed) {
        return next(createError('Você não tem permissão para esta ação', 403));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

/** Gestor DP por contrato (aba Contratos) ou permissão legada; admin sempre. */
export const requireDpApproverAccess = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }
    if (req.user.isAdmin) {
      return next();
    }
    const ok = await userHasDpApprovePermission(req.user.id);
    if (!ok) {
      return next(createError('Você não tem permissão para esta ação', 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};
