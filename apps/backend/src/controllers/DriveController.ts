import { Response } from 'express';
import { DriveFolderSharePermission } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { DriveService } from '../services/DriveService';

const driveService = new DriveService();

function parseParentId(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value);
  if (s === '' || s === 'undefined') return undefined;
  return s;
}

export class DriveController {
  // ── Pastas ────────────────────────────────────────────────────────────────

  static async createFolder(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { name, parentId } = req.body;
      const ownerId = req.user!.id;

      if (!name || !name.trim()) {
        res.status(400).json({ success: false, error: 'Nome da pasta é obrigatório' });
        return;
      }

      const folder = await driveService.createFolder(
        name.trim(),
        ownerId,
        parseParentId(parentId),
      );
      res.status(201).json({ success: true, data: folder });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async listFolders(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const parentId = parseParentId(req.query.parentId);
      const { folders } = await driveService.listFolderContents(userId, parentId);
      res.json({ success: true, data: folders });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async renameFolder(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const ownerId = req.user!.id;

      if (!name || !name.trim()) {
        res.status(400).json({ success: false, error: 'Nome é obrigatório' });
        return;
      }

      const folder = await driveService.renameFolder(id, name.trim(), ownerId);
      res.json({ success: true, data: folder });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async deleteFolder(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const ownerId = req.user!.id;
      await driveService.deleteFolder(id, ownerId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async getFolderPath(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const breadcrumb = await driveService.getFolderBreadcrumb(userId, id);
      res.json({ success: true, data: breadcrumb });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // ── Compartilhamento ─────────────────────────────────────────────────────

  static async listFolderShares(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const data = await driveService.listShares(id, userId);
      res.json({ success: true, data });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async addFolderShare(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { userId: targetUserId, permission = 'READ' } = req.body;
      const requesterId = req.user!.id;
      if (!targetUserId) {
        res.status(400).json({ success: false, error: 'userId do convidado é obrigatório' });
        return;
      }
      const perm =
        permission === 'READ_WRITE'
          ? DriveFolderSharePermission.READ_WRITE
          : DriveFolderSharePermission.READ;
      const row = await driveService.addShare(id, targetUserId, perm, requesterId);
      res.status(201).json({ success: true, data: row });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async updateFolderShare(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id, userId: targetUserId } = req.params;
      const { permission = 'READ' } = req.body;
      const requesterId = req.user!.id;
      const perm =
        permission === 'READ_WRITE'
          ? DriveFolderSharePermission.READ_WRITE
          : DriveFolderSharePermission.READ;
      const row = await driveService.updateSharePermission(
        id,
        targetUserId,
        perm,
        requesterId,
      );
      res.json({ success: true, data: row });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async removeFolderShare(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id, userId: targetUserId } = req.params;
      const requesterId = req.user!.id;
      await driveService.removeShare(id, targetUserId, requesterId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // ── Arquivos ──────────────────────────────────────────────────────────────

  static async uploadFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'Arquivo não encontrado' });
        return;
      }

      const ownerId = req.user!.id;
      const folderId = parseParentId(req.body.folderId);

      const result = await driveService.uploadFile(req.file, ownerId, folderId);
      res.status(201).json({ success: true, data: result });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async listFiles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const folderId = parseParentId(req.query.folderId);
      const { files } = await driveService.listFolderContents(userId, folderId);
      res.json({ success: true, data: files });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async downloadFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const ownerId = req.user!.id;
      const url = await driveService.getSignedDownloadUrl(id, ownerId, 300);
      res.json({ success: true, data: { url } });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async previewFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user!.id;
      const url = await driveService.getSignedPreviewUrl(id, userId, 600);
      res.json({ success: true, data: { url } });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async renameFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const ownerId = req.user!.id;

      if (!name || !name.trim()) {
        res.status(400).json({ success: false, error: 'Nome é obrigatório' });
        return;
      }

      const file = await driveService.renameFile(id, name.trim(), ownerId);
      res.json({ success: true, data: file });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async moveFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { folderId } = req.body;
      const ownerId = req.user!.id;
      const file = await driveService.moveFile(id, parseParentId(folderId) ?? null, ownerId);
      res.json({ success: true, data: file });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  static async deleteFile(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const ownerId = req.user!.id;
      await driveService.deleteFile(id, ownerId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ success: false, error: err.message });
    }
  }

  // ── Busca ─────────────────────────────────────────────────────────────────

  static async search(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const query = (req.query.q as string) || '';
      const result = await driveService.search(userId, query);
      res.json({ success: true, data: result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  static async listFolder(req: AuthRequest, res: Response): Promise<void> {
    try {
      const userId = req.user!.id;
      const folderId = parseParentId(req.query.folderId);

      const { folders, files } = await driveService.listFolderContents(userId, folderId);
      let breadcrumb: Array<{ id: string; name: string }> = [];
      let currentFolder: Record<string, unknown> | null = null;
      if (folderId) {
        breadcrumb = await driveService.getFolderBreadcrumb(userId, folderId);
        currentFolder = await driveService.getCurrentFolderMeta(userId, folderId);
      }

      res.json({ success: true, data: { folders, files, breadcrumb, currentFolder } });
    } catch (err: any) {
      console.error('[Drive] listFolder:', err);
      const dev = process.env.NODE_ENV === 'development';
      const status = err?.message?.includes('permissão') || err?.message?.includes('não encontrada') ? 403 : 500;
      res.status(status).json({
        success: false,
        error: err?.message || 'Erro ao listar o Drive',
        ...(dev && {
          name: err?.name,
          code: err?.code,
          meta: err?.meta,
        }),
      });
    }
  }
}
