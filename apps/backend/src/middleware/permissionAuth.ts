import { Response, NextFunction } from 'express';
import { PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from '../lib/prisma';
import { userHasAnyDpApproverAccess } from '../lib/dpApprovalAccess';
import { userHasFuelApprovePermission } from '../lib/fuelApprovalAccess';
import { userHasFuelSuppliesAccess } from '../lib/fuelSuppliesAccess';
import { userHasVehicleReservationSuppliesAccess } from '../lib/vehicleReservationSuppliesAccess';
import { userHasToolRentalSuppliesAccess } from '../lib/toolRentalSuppliesAccess';
import { userHasLogisticsDeliveryAccess } from '../lib/logisticsDeliveryAccess';
import {
  userHasLogisticsDeliveryCompletionAccess,
  userHasLogisticsDeliveryReadAccess,
} from '../lib/logisticsDeliveryCompletionAccess';
import { AuthRequest } from './auth';
import { createError } from './errorHandler';
import { userHasEmployeesModuleAccess } from '../lib/employeesModuleAccess';
import {
  userHasControleNfsAccess,
  userHasControleNfsSharedDataAccess,
} from '../lib/controleNfsAccess';

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

/**
 * Dados lidos por mais de uma página (ex.: bootstrap do Espelho da NF).
 * Cada página continua exigindo a própria chave; aqui basta ter uma das que consomem o endpoint.
 */
export const requireAnyModuleAccess = (moduleKeys: string[]) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return next(createError('Usuário não autenticado', 401));
      }

      if (req.user.isAdmin) {
        return next();
      }

      const permission = await prisma.userPermission.findFirst({
        where: {
          userId: req.user.id,
          module: { in: moduleKeys },
          action: PERMISSION_ACCESS_ACTION,
          allowed: true,
        },
      });

      if (!permission) {
        return next(createError('Você não tem permissão para esta ação', 403));
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};

/** Módulo Funcionários — admin, DP ou permissão na matriz (acesso ou CRUD). */
export const requireEmployeesModuleAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }
    const ok = await userHasEmployeesModuleAccess(req.user.id, req.user.isAdmin);
    if (!ok) {
      return next(createError('Você não tem permissão para acessar o módulo de Funcionários', 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Controle de NF's — admin, setor Financeiro ou permissão do módulo. */
export const requireControleNfsAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }
    const ok = await userHasControleNfsAccess(req.user.id, req.user.isAdmin);
    if (!ok) {
      return next(createError("Você não tem permissão para acessar o Controle de NF's", 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Dados da planilha compartilhados entre as páginas de Métricas. */
export const requireControleNfsSharedDataAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }
    const ok = await userHasControleNfsSharedDataAccess(req.user.id, req.user.isAdmin);
    if (!ok) {
      return next(createError('Você não tem permissão para acessar estes dados', 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
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
    const ok = await userHasAnyDpApproverAccess(req.user.id);
    if (!ok) {
      return next(createError('Você não tem permissão para esta ação', 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Aprovação de abastecimento: permissão Controle ou gestor de contrato. */
export const requireFuelApproverAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }
    if (req.user.isAdmin) {
      return next();
    }
    const ok = await userHasFuelApprovePermission(req.user.id);
    if (!ok) {
      return next(createError('Você não tem permissão para esta ação', 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Fila Suprimentos — solicitações de combustível. */
export const requireFuelSuppliesAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }
    const ok = await userHasFuelSuppliesAccess(req.user.id, req.user.isAdmin);
    if (!ok) {
      return next(createError('Você não tem permissão para esta ação', 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Fila Suprimentos — reservas de veículos. */
export const requireVehicleReservationSuppliesAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }
    const ok = await userHasVehicleReservationSuppliesAccess(req.user.id, req.user.isAdmin);
    if (!ok) {
      return next(createError('Você não tem permissão para esta ação', 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Fila Suprimentos — locações de ferramentas. */
export const requireToolRentalSuppliesAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }
    const ok = await userHasToolRentalSuppliesAccess(req.user.id, req.user.isAdmin);
    if (!ok) {
      return next(createError('Você não tem permissão para esta ação', 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Entregas logísticas — Suprimentos. */
export const requireLogisticsDeliveryAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }
    const ok = await userHasLogisticsDeliveryAccess(req.user.id, req.user.isAdmin);
    if (!ok) {
      return next(createError('Você não tem permissão para esta ação', 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Leitura de solicitações logísticas — Suprimentos ou finalização (Principal). */
export const requireLogisticsDeliveryReadAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/** Finalização de entregas logísticas — Principal. */
export const requireLogisticsDeliveryCompletionAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }
    const ok = await userHasLogisticsDeliveryCompletionAccess(req.user.id, req.user.isAdmin);
    if (!ok) {
      return next(createError('Você não tem permissão para finalizar entregas logísticas', 403));
    }
    return next();
  } catch (error) {
    return next(error);
  }
};
