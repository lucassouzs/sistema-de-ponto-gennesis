import { Request, Response, NextFunction } from 'express';
import jwt, { SignOptions } from 'jsonwebtoken';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { comparePassword, hashPassword } from '../lib/passwordHash';
import { ChatService } from '../services/ChatService';
import { findUserByLoginIdentifier, normalizeLoginIdentifier } from '../lib/loginIdentifier';
import { recordSuccessfulLogin, recordSuccessfulLogout } from './UserActivityController';

const chatUploadService = new ChatService();

const userMeSelect = {
  id: true,
  email: true,
  name: true,
  cpf: true,
  role: true,
  isActive: true,
  isFirstLogin: true,
  profilePhotoUrl: true,
  profilePhotoKey: true,
  lastLoginAt: true,
  lastSeenAt: true,
  lastActivityPath: true,
  lastActivityLabel: true,
  createdAt: true,
  updatedAt: true,
  employee: true,
} as const;

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name, cpf, role = 'EMPLOYEE' } = req.body;

      // Verificar se usuário já existe
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { cpf }
          ]
        }
      });

      if (existingUser) {
        throw createError('Usuário já existe com este email ou CPF', 400);
      }

      // Criptografar senha
      const hashedPassword = await hashPassword(password);

      // Criar usuário
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          cpf,
          role,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        }
      });

      // Não emite token de sessão: registro é administrativo (ver rota protegida)
      return res.status(201).json({
        success: true,
        data: {
          user,
        },
        message: 'Usuário criado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const identifier = normalizeLoginIdentifier(req.body?.identifier ?? req.body?.email);
      const { password } = req.body;

      if (!identifier || !password) {
        throw createError('E-mail/CPF e senha são obrigatórios', 400);
      }

      // Verificar se JWT_SECRET está configurado
      if (!process.env.JWT_SECRET) {
        console.error('❌ JWT_SECRET não está configurado');
        throw createError('Erro de configuração do servidor', 500);
      }

      const user = await findUserByLoginIdentifier(identifier);

      if (!user) {
        throw createError('Credenciais inválidas', 401);
      }

      if (!user.isActive) {
        throw createError('Usuário inativo. Entre em contato com o administrador.', 401);
      }

      // Verificar senha
      if (!user.password) {
        throw createError('Credenciais inválidas', 401);
      }

      const isPasswordValid = await comparePassword(password, user.password);
      if (!isPasswordValid) {
        throw createError('Credenciais inválidas', 401);
      }

      // Gerar token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      try {
        await recordSuccessfulLogin(req, user.id, req.body?.source);
      } catch (trackErr) {
        console.error('[Auth] Falha ao registrar histórico de login:', trackErr);
      }

      // Remover senha da resposta
      const { password: _, ...userWithoutPassword } = user;

      return res.json({
        success: true,
        data: {
          user: {
            ...userWithoutPassword,
            lastLoginAt: new Date(),
            lastSeenAt: new Date(),
          },
          token,
          isFirstLogin: user.isFirstLogin,
        },
        message: 'Login realizado com sucesso'
      });
    } catch (error: any) {
      // Log do erro para debug
      console.error('Erro no login:', error);
      return next(error);
    }
  }

  async getProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.id) {
        throw createError('Token inválido ou expirado', 401);
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: userMeSelect,
      });

      if (!user) {
        throw createError('Usuário não encontrado', 404);
      }

      // Evita 304 no browser/Axios (tratado como erro no cliente)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');

      return res.json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      console.error('Erro ao buscar perfil do usuário:', error);
      return next(error);
    }
  }

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, email } = req.body;
      const userId = req.user!.id;

      // Verificar se email já existe em outro usuário
      if (email) {
        const existingUser = await prisma.user.findFirst({
          where: {
            email,
            id: { not: userId }
          }
        });

        if (existingUser) {
          throw createError('Email já está em uso', 400);
        }
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(name && { name }),
          ...(email && { email }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          cpf: true,
          role: true,
          isActive: true,
          updatedAt: true,
        }
      });

      return res.json({
        success: true,
        data: user,
        message: 'Perfil atualizado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  async logout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (req.user?.id) {
        try {
          await recordSuccessfulLogout(req, req.user.id, req.body?.source);
        } catch (trackError) {
          console.error('Falha ao registrar logout:', trackError);
        }
      }
      return res.json({
        success: true,
        message: 'Logout realizado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  async refreshToken(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // authenticate já validou usuário ativo em req.user
      const { id, email, role } = req.user!;

      const token = jwt.sign(
        { id, email, role },
        process.env.JWT_SECRET as string,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        data: { token },
        message: 'Token renovado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  // Refresh via authenticateForRefresh (já validou usuário ativo)
  async publicRefreshToken(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id, email, role } = req.user!;

      const token = jwt.sign(
        { id, email, role },
        process.env.JWT_SECRET as string,
        { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        data: { token },
        message: 'Token renovado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  async changePassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.id;

      // Buscar usuário
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw createError('Usuário não encontrado', 404);
      }

      // Verificar senha atual
      const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw createError('Senha atual incorreta', 400);
      }

      // Criptografar nova senha
      const hashedNewPassword = await hashPassword(newPassword);

      // Atualizar senha e marcar como não é mais primeiro login
      await prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedNewPassword,
          isFirstLogin: false,
        }
      });

      return res.json({
        success: true,
        message: 'Senha alterada com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  /** Upload foto de perfil (mesmo armazenamento que anexos de chat). */
  async uploadProfilePhoto(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const file = (req as unknown as Express.Request & { file?: Express.Multer.File }).file;
      if (!file?.buffer) throw createError('Nenhuma imagem enviada', 400);
      const uploadResult = await chatUploadService.uploadFile(file, userId);
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          profilePhotoUrl: uploadResult.url,
          profilePhotoKey: uploadResult.key,
        },
        select: userMeSelect,
      });
      return res.json({
        success: true,
        data: updated,
        message: 'Foto de perfil atualizada',
      });
    } catch (error) {
      return next(error);
    }
  }

  async removeProfilePhoto(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { profilePhotoUrl: null, profilePhotoKey: null },
        select: userMeSelect,
      });
      return res.json({
        success: true,
        data: updated,
        message: 'Foto de perfil removida',
      });
    } catch (error) {
      return next(error);
    }
  }
}
