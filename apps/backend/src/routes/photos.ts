import express from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { PhotoService } from '../services/PhotoService';
import { createError } from '../middleware/errorHandler';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma';

const router = express.Router();
const photoService = new PhotoService();

// Middleware de autenticação para todas as rotas
router.use(authenticate);

/**
 * GET /api/photos/:photoKey
 * Serve uma foto específica com verificação de permissão
 */
router.get('/:photoKey', async (req: AuthRequest, res, next) => {
  try {
    const { photoKey } = req.params;
    const userId = req.user!.id;

    // Verificar se a foto existe no banco de dados
    const timeRecord = await prisma.timeRecord.findFirst({
      where: {
        OR: [
          { photoKey: photoKey },
          { photoUrl: { contains: photoKey } }
        ]
      },
      include: {
        user: {
          select: { id: true, name: true }
        }
      }
    });

    if (!timeRecord) {
      throw createError('Foto não encontrada', 404);
    }

    // Verificar permissões - todos os funcionários podem acessar suas próprias fotos
    const canAccess = timeRecord.userId === userId;

    if (!canAccess) {
      throw createError('Acesso negado a esta foto', 403);
    }

    // Construir caminho da foto
    const photoPath = path.join(process.cwd(), 'apps', 'backend', photoKey);
    
    // Verificar se o arquivo existe
    if (!fs.existsSync(photoPath)) {
      throw createError('Arquivo de foto não encontrado no servidor', 404);
    }

    // Determinar o tipo de conteúdo
    const ext = path.extname(photoKey).toLowerCase();
    const contentType = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif'
    }[ext] || 'image/jpeg';

    // Enviar a foto
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache por 1 hora
    res.sendFile(photoPath);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photos/user/:userId
 * Lista fotos de um usuário específico (todos os funcionários)
 */
router.get('/user/:userId', async (req: AuthRequest, res, next) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;

    const photos = await photoService.listUserPhotos(userId, Number(limit));

    res.json({
      success: true,
      data: photos
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/photos/record/:recordId
 * Obtém a foto de um registro específico
 */
router.get('/record/:recordId', async (req: AuthRequest, res, next) => {
  try {
    const { recordId } = req.params;
    const userId = req.user!.id;

    const timeRecord = await prisma.timeRecord.findUnique({
      where: { id: recordId },
      select: {
        id: true,
        userId: true,
        photoUrl: true,
        photoKey: true,
        user: {
          select: { id: true, name: true }
        }
      }
    });

    if (!timeRecord) {
      throw createError('Registro não encontrado', 404);
    }

    // Verificar permissões - todos os funcionários podem acessar suas próprias fotos
    const canAccess = timeRecord.userId === userId;

    if (!canAccess) {
      throw createError('Acesso negado a este registro', 403);
    }

    if (!timeRecord.photoKey && !timeRecord.photoUrl) {
      throw createError('Nenhuma foto associada a este registro', 404);
    }

    // Se tem photoKey, usar o endpoint de foto
    if (timeRecord.photoKey) {
      return res.redirect(`/api/photos/${timeRecord.photoKey}`);
    }

    // Se tem photoUrl, redirecionar para ela
    if (timeRecord.photoUrl) {
      return res.redirect(timeRecord.photoUrl);
    }

    throw createError('Foto não encontrada', 404);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/photos/:photoKey
 * Remove uma foto (todos os funcionários)
 */
router.delete('/:photoKey', async (req: AuthRequest, res, next) => {
  try {
    const { photoKey } = req.params;

    // Verificar se a foto está sendo usada em algum registro
    const timeRecord = await prisma.timeRecord.findFirst({
      where: {
        OR: [
          { photoKey: photoKey },
          { photoUrl: { contains: photoKey } }
        ]
      }
    });

    if (timeRecord) {
      throw createError('Não é possível deletar uma foto que está sendo usada em um registro', 400);
    }

    await photoService.deletePhoto(photoKey);

    res.json({
      success: true,
      message: 'Foto removida com sucesso'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
