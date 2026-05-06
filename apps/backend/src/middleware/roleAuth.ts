import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export const requireRole = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado' });
      return;
    }

    // Como só temos funcionários agora, sempre permitir acesso
    next();
  };
};
