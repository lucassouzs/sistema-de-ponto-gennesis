import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { createError } from './errorHandler';
import { prisma } from '../lib/prisma';
import { runWithRequestContext } from '../lib/requestContext';

const PERMISOES_MODULE_KEY = pathToModuleKey('/ponto/permissoes');
const CONTROLE_ALTERAR_PERMISSOES_KEY = pathToModuleKey('/ponto/controle/alterar-permissoes');

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    isAdmin: boolean;
    /** true quando o token é sessão de impersonação */
    impersonating?: boolean;
    /** id do administrador que iniciou a impersonação */
    originalAdminId?: string;
  };
}

type JwtAuthClaims = {
  id: string;
  email?: string;
  role?: string;
  impersonating?: boolean;
  originalAdminId?: string;
  exp?: number;
};

function attachUserFromDecoded(
  decoded: JwtAuthClaims,
  user: {
    id: string;
    email: string;
    role: string;
    employee?: { position: string | null } | null;
  }
) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    isAdmin: (user.employee?.position || '').toLowerCase() === 'administrador',
    ...(decoded.impersonating && decoded.originalAdminId
      ? {
          impersonating: true as const,
          originalAdminId: String(decoded.originalAdminId),
        }
      : {}),
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw createError('Token de acesso necessário', 401);
    }

    // Verificar se JWT_SECRET está configurado
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET não está configurado');
      throw createError('Erro de configuração do servidor', 500);
    }

    // Verificar se o token está no formato correto (deve ter 3 partes separadas por ponto)
    if (!token || token.split('.').length !== 3) {
      throw createError('Token inválido', 401);
    }

    let decoded: JwtAuthClaims;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtAuthClaims;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw createError('Token expirado. Faça login novamente.', 401);
      } else if (error.name === 'JsonWebTokenError') {
        throw createError('Token inválido', 401);
      }
      throw error;
    }
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        employee: {
          select: {
            position: true,
          },
        },
      },
    });

    if (!user) {
      throw createError('Usuário não encontrado', 401);
    }

    if (!user.isActive) {
      throw createError('Usuário inativo', 401);
    }

    req.user = attachUserFromDecoded(decoded, user);

    const forwarded = req.headers['x-forwarded-for'];
    const ipAddress =
      (typeof forwarded === 'string' && forwarded.split(',')[0]?.trim()) ||
      (Array.isArray(forwarded) && String(forwarded[0] || '').split(',')[0]?.trim()) ||
      req.ip ||
      req.socket?.remoteAddress ||
      null;

    runWithRequestContext(
      {
        userId: user.id,
        ipAddress,
        userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null,
      },
      () => next()
    );
  } catch (error: any) {
    // Se for erro de JWT, retornar erro de autenticação
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(createError('Token inválido ou expirado', 401));
    }
    next(error);
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }

    if (req.user.isAdmin) {
      return next();
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return next(createError('Acesso negado', 403));
    }

    next();
  };
};

export const requireAdministrator = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(createError('Usuário não autenticado', 401));
  }

  if (!req.user.isAdmin) {
    return next(createError('Acesso permitido apenas para Administrador', 403));
  }

  return next();
};

/**
 * Administrador OU matriz de permissões (módulo Permissões e/ou Controle «alterar permissões»).
 * Alinha com a UI que permite gerenciar permissões sem cargo Administrador.
 */
export const requirePermissionManagerOrAdministrator = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user) {
    return next(createError('Usuário não autenticado', 401));
  }
  if (req.user.isAdmin) {
    return next();
  }
  const allowed = await prisma.userPermission.findFirst({
    where: {
      userId: req.user.id,
      allowed: true,
      OR: [
        { module: PERMISOES_MODULE_KEY, action: PERMISSION_ACCESS_ACTION },
        { module: PERMISOES_MODULE_KEY, action: 'ver' },
        { module: CONTROLE_ALTERAR_PERMISSOES_KEY, action: PERMISSION_ACCESS_ACTION },
      ],
    },
    select: { id: true },
  });
  if (allowed) {
    return next();
  }
  return next(
    createError('Acesso permitido apenas para Administrador ou quem pode gerenciar permissões de usuários', 403)
  );
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          employee: {
            select: {
              position: true,
            },
          },
        },
      });

      if (user && user.isActive) {
        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          isAdmin: (user.employee?.position || '').toLowerCase() === 'administrador',
        };
      }
    }

    return next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token inválido ou expirado' });
    }
    return next(error);
  }
};

/** Após o access token expirar, ainda permite refresh por este período (evita renovação infinita). */
const REFRESH_GRACE_MS = 24 * 60 * 60 * 1000; // 24h

// Middleware para refresh: token válido OU expirado dentro da janela de graça
export const authenticateForRefresh = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw createError('Token de acesso necessário', 401);
    }

    if (!process.env.JWT_SECRET) {
      throw createError('Erro de configuração do servidor', 500);
    }

    if (token.split('.').length !== 3) {
      throw createError('Token inválido', 401);
    }

    let decoded: JwtAuthClaims;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET) as JwtAuthClaims;
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err.name !== 'TokenExpiredError') {
        throw createError('Token inválido', 401);
      }

      // Assinatura ok, só a expiração falhou — revalida com ignoreExpiration
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        ignoreExpiration: true,
      }) as JwtAuthClaims;

      if (!decoded?.exp) {
        throw createError('Token inválido', 401);
      }

      const expiredAtMs = decoded.exp * 1000;
      if (Date.now() - expiredAtMs > REFRESH_GRACE_MS) {
        throw createError('Sessão expirada. Faça login novamente.', 401);
      }
    }

    if (!decoded?.id) {
      throw createError('Token inválido', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
        employee: {
          select: {
            position: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      throw createError('Usuário não encontrado ou inativo', 401);
    }

    req.user = attachUserFromDecoded(decoded, user);

    next();
  } catch (error) {
    next(error);
  }
};