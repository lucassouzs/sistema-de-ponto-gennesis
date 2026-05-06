import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { DriveFile, DriveFolder, DriveFolderSharePermission } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface DriveUploadResult {
  id: string;
  name: string;
  originalName: string;
  s3Key: string;
  size: number;
  mimeType: string;
  folderId: string | null;
  ownerId: string;
  createdAt: Date;
}

export class DriveService {
  private s3: AWS.S3;
  private bucketName: string;

  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1',
    });
    this.bucketName = process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos';
  }

  /**
   * Gera um trecho legível e seguro para usar na key do S3.
   * Ex.: "Logo - Luna.png" -> "logo-luna"
   */
  private toSafeFileStem(fileName: string): string {
    const stem = path.parse(fileName).name;
    const normalized = stem.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const slug = normalized
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'arquivo';
  }

  /** Monta o caminho "humano" da pasta atual para usar como prefixo no S3. */
  private async getFolderPathSlugs(folderId: string): Promise<string[]> {
    const segments: string[] = [];
    let current = await prisma.driveFolder.findUnique({
      where: { id: folderId },
      select: { id: true, name: true, parentId: true },
    });

    if (!current) throw new Error('Pasta não encontrada');

    while (current) {
      segments.unshift(this.toSafeFileStem(current.name));
      if (!current.parentId) break;
      current = await prisma.driveFolder.findUnique({
        where: { id: current.parentId },
        select: { id: true, name: true, parentId: true },
      });
    }

    return segments;
  }

  // ── Acesso: leitura (ver pasta e conteúdo abaixo) ───────────────────────

  async canUserAccessFolder(userId: string, folderId: string): Promise<boolean> {
    let current = await prisma.driveFolder.findUnique({ where: { id: folderId } });
    while (current) {
      if (current.ownerId === userId) return true;
      const sh = await prisma.driveFolderShare.findUnique({
        where: { folderId_userId: { folderId: current.id, userId } },
      });
      if (sh) return true;
      if (!current.parentId) return false;
      current = await prisma.driveFolder.findUnique({ where: { id: current.parentId } });
    }
    return false;
  }

  /// Pode enviar arquivos / criar subpastas nesta pasta (ou com permissão em ancestral com READ_WRITE)
  async canUserWriteInFolder(userId: string, folderId: string): Promise<boolean> {
    let current = await prisma.driveFolder.findUnique({ where: { id: folderId } });
    while (current) {
      if (current.ownerId === userId) return true;
      const sh = await prisma.driveFolderShare.findUnique({
        where: { folderId_userId: { folderId: current.id, userId } },
      });
      if (sh?.permission === DriveFolderSharePermission.READ_WRITE) return true;
      if (!current.parentId) return false;
      current = await prisma.driveFolder.findUnique({ where: { id: current.parentId } });
    }
    return false;
  }

  /** Contagem de compartilhamentos por pasta (não usa `_count.shares` no DriveFolder: compatível com cliente Prisma antigo). */
  private async getShareCountsByFolderIds(folderIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (folderIds.length === 0) return map;
    const rows = await prisma.driveFolderShare.groupBy({
      by: ['folderId'],
      where: { folderId: { in: folderIds } },
      _count: { _all: true },
    });
    for (const r of rows) {
      map.set(r.folderId, r._count._all);
    }
    return map;
  }

  // ── Pastas na raiz (minhas + compartilhadas que não enxergo via pai) ────

  private async listRootFoldersForUser(userId: string) {
    const owned = await prisma.driveFolder.findMany({
      where: { parentId: null, ownerId: userId },
      orderBy: { name: 'asc' },
    });

    const shareRows = await prisma.driveFolderShare.findMany({
      where: { userId },
      include: { folder: true },
    });

    const seen = new Set(owned.map((o) => o.id));
    const extra: typeof owned = [];

    for (const s of shareRows) {
      const f = s.folder;
      if (seen.has(f.id)) continue;
      if (!f.parentId) {
        extra.push(f as any);
        seen.add(f.id);
        continue;
      }
      const canParent = await this.canUserAccessFolder(userId, f.parentId);
      if (!canParent) {
        extra.push(f as any);
        seen.add(f.id);
      }
    }

    extra.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return [...owned, ...extra];
  }

  private mapFolder(f: any, userId: string, shareCount: number) {
    const { _count: _c, ...rest } = f;
    return {
      ...rest,
      isOwner: f.ownerId === userId,
      canManageShares: f.ownerId === userId,
      shareCount,
    };
  }

  async listFolderContents(
    userId: string,
    parentId?: string,
  ): Promise<{
    folders: Array<Record<string, unknown>>;
    files: DriveFile[];
  }> {
    if (parentId === undefined || parentId === null) {
      const foldersRaw = await this.listRootFoldersForUser(userId);
      const shareMap = await this.getShareCountsByFolderIds(foldersRaw.map((f) => f.id));
      const files = await prisma.driveFile.findMany({
        where: { ownerId: userId, folderId: null },
        orderBy: { name: 'asc' },
      });
      return {
        folders: foldersRaw.map((f) => this.mapFolder(f, userId, shareMap.get(f.id) ?? 0)),
        files,
      };
    }

    if (!(await this.canUserAccessFolder(userId, parentId))) {
      throw new Error('Pasta não encontrada ou sem permissão de acesso');
    }

    const [foldersRaw, allFiles] = await Promise.all([
      prisma.driveFolder.findMany({
        where: { parentId },
        orderBy: { name: 'asc' },
      }),
      prisma.driveFile.findMany({
        where: { folderId: parentId },
        orderBy: { name: 'asc' },
      }),
    ]);
    const shareMap = await this.getShareCountsByFolderIds(foldersRaw.map((f) => f.id));
    return {
      folders: foldersRaw.map((f) => this.mapFolder(f, userId, shareMap.get(f.id) ?? 0)),
      files: allFiles,
    };
  }

  async getFolderBreadcrumb(userId: string, folderId: string): Promise<Array<{ id: string; name: string }>> {
    const path: Array<{ id: string; name: string }> = [];
    let id: string | null = folderId;
    while (id) {
      if (!(await this.canUserAccessFolder(userId, id))) break;
      const f: DriveFolder | null = await prisma.driveFolder.findUnique({ where: { id } });
      if (!f) break;
      path.unshift({ id: f.id, name: f.name });
      id = f.parentId;
    }
    return path;
  }

  /** Pasta aberta (para UI: partilhar, esconder upload se só leitura, etc.). */
  async getCurrentFolderMeta(
    userId: string,
    folderId: string,
  ): Promise<Record<string, unknown> | null> {
    if (!(await this.canUserAccessFolder(userId, folderId))) return null;
    const f = await prisma.driveFolder.findUnique({ where: { id: folderId } });
    if (!f) return null;
    const shareMap = await this.getShareCountsByFolderIds([folderId]);
    const canWrite = await this.canUserWriteInFolder(userId, folderId);
    return { ...this.mapFolder(f, userId, shareMap.get(folderId) ?? 0), canWrite };
  }

  async createFolder(name: string, userId: string, parentId?: string) {
    if (parentId) {
      const can = await this.canUserWriteInFolder(userId, parentId);
      if (!can) throw new Error('Sem permissão para criar pasta neste local');
    }
    return prisma.driveFolder.create({
      data: { name, ownerId: userId, parentId: parentId ?? null },
    });
  }

  async renameFolder(id: string, name: string, userId: string) {
    const folder = await prisma.driveFolder.findFirst({ where: { id } });
    if (!folder) throw new Error('Pasta não encontrada');
    if (folder.ownerId !== userId) throw new Error('Apenas o dono da pasta pode renomeá-la');
    return prisma.driveFolder.update({ where: { id }, data: { name } });
  }

  async deleteFolder(id: string, userId: string): Promise<void> {
    const folder = await prisma.driveFolder.findFirst({ where: { id } });
    if (!folder) throw new Error('Pasta não encontrada');
    if (folder.ownerId !== userId) throw new Error('Apenas o dono da pasta pode excluí-la');

    await this.deleteFolderRecursive(id);
    await prisma.driveFolder.delete({ where: { id } });
  }

  private async deleteFolderRecursive(folderId: string): Promise<void> {
    const files = await prisma.driveFile.findMany({ where: { folderId } });
    for (const file of files) {
      await this.deleteS3Object(file.s3Key);
    }
    await prisma.driveFile.deleteMany({ where: { folderId } });

    const subFolders = await prisma.driveFolder.findMany({ where: { parentId: folderId } });
    for (const sub of subFolders) {
      await this.deleteFolderRecursive(sub.id);
    }
  }

  // ── Arquivos ─────────────────────────────────────────────────────────

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    folderId?: string,
  ): Promise<DriveUploadResult> {
    if (folderId) {
      const can = await this.canUserWriteInFolder(userId, folderId);
      if (!can) throw new Error('Sem permissão para enviar arquivo nesta pasta');
    }

    const ext = path.extname(file.originalname) || '';
    const safeStem = this.toSafeFileStem(file.originalname);
    const folderPath = folderId ? `/${(await this.getFolderPathSlugs(folderId)).join('/')}` : '';
    const s3Key = `drive/${userId}${folderPath}/${safeStem}-${uuidv4()}${ext}`;

    await this.s3
      .upload({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ContentDisposition: `attachment; filename="${encodeURIComponent(file.originalname)}"`,
        ACL: 'private',
        Metadata: {
          userId,
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
        },
      } as AWS.S3.PutObjectRequest)
      .promise();

    const record = await prisma.driveFile.create({
      data: {
        name: file.originalname,
        originalName: file.originalname,
        s3Key,
        size: file.size,
        mimeType: file.mimetype,
        folderId: folderId ?? null,
        ownerId: userId,
      },
    });

    return record as DriveUploadResult;
  }

  async getSignedDownloadUrl(fileId: string, userId: string, expiresIn = 3600): Promise<string> {
    const file = await prisma.driveFile.findFirst({ where: { id: fileId } });
    if (!file) throw new Error('Arquivo não encontrado');
    if (file.folderId) {
      if (!(await this.canUserAccessFolder(userId, file.folderId))) {
        throw new Error('Arquivo não encontrado ou sem permissão');
      }
    } else if (file.ownerId !== userId) {
      throw new Error('Arquivo não encontrado');
    }

    return this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucketName,
      Key: file.s3Key,
      Expires: expiresIn,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(file.originalName)}"`,
    });
  }

  /** URL assinada para exibir no browser (sem forçar download) — imagens no Drive, etc. */
  async getSignedPreviewUrl(fileId: string, userId: string, expiresIn = 600): Promise<string> {
    const file = await prisma.driveFile.findFirst({ where: { id: fileId } });
    if (!file) throw new Error('Arquivo não encontrado');
    if (file.folderId) {
      if (!(await this.canUserAccessFolder(userId, file.folderId))) {
        throw new Error('Arquivo não encontrado ou sem permissão');
      }
    } else if (file.ownerId !== userId) {
      throw new Error('Arquivo não encontrado');
    }

    return this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucketName,
      Key: file.s3Key,
      Expires: expiresIn,
      ResponseContentType: file.mimeType || 'application/octet-stream',
    });
  }

  async renameFile(id: string, name: string, userId: string) {
    const file = await prisma.driveFile.findFirst({ where: { id } });
    if (!file) throw new Error('Arquivo não encontrado');
    if (file.ownerId === userId) {
      return prisma.driveFile.update({ where: { id }, data: { name } });
    }
    if (file.folderId && (await this.canUserWriteInFolder(userId, file.folderId))) {
      return prisma.driveFile.update({ where: { id }, data: { name } });
    }
    throw new Error('Sem permissão para renomear');
  }

  async moveFile(id: string, folderId: string | null, userId: string) {
    const file = await prisma.driveFile.findFirst({ where: { id } });
    if (!file) throw new Error('Arquivo não encontrado');
    if (file.ownerId !== userId) throw new Error('Sem permissão');
    if (folderId) {
      const can = await this.canUserWriteInFolder(userId, folderId);
      if (!can) throw new Error('Pasta de destino sem permissão de escrita');
    }
    return prisma.driveFile.update({ where: { id }, data: { folderId } });
  }

  async deleteFile(id: string, userId: string): Promise<void> {
    const file = await prisma.driveFile.findFirst({ where: { id } });
    if (!file) throw new Error('Arquivo não encontrado');
    if (file.ownerId === userId) {
      await this.deleteS3Object(file.s3Key);
      await prisma.driveFile.delete({ where: { id } });
      return;
    }
    if (file.folderId && (await this.canUserWriteInFolder(userId, file.folderId))) {
      await this.deleteS3Object(file.s3Key);
      await prisma.driveFile.delete({ where: { id } });
      return;
    }
    throw new Error('Sem permissão para excluir');
  }

  // ── Compartilhamento (só o dono da pasta) ─────────────────────────────

  async listShares(folderId: string, requesterId: string) {
    const folder = await prisma.driveFolder.findFirst({ where: { id: folderId } });
    if (!folder) throw new Error('Pasta não encontrada');
    if (folder.ownerId !== requesterId) throw new Error('Apenas o dono pode ver quem tem acesso');

    return prisma.driveFolderShare.findMany({
      where: { folderId },
      include: { user: { select: { id: true, name: true, email: true, cpf: true } } },
      orderBy: { user: { name: 'asc' } },
    });
  }

  async addShare(
    folderId: string,
    targetUserId: string,
    permission: DriveFolderSharePermission,
    requesterId: string,
  ) {
    if (targetUserId === requesterId) throw new Error('Não é possível compartilhar consigo mesmo');
    const folder = await prisma.driveFolder.findFirst({ where: { id: folderId } });
    if (!folder) throw new Error('Pasta não encontrada');
    if (folder.ownerId !== requesterId) throw new Error('Apenas o dono pode compartilhar');

    const target = await prisma.user.findFirst({ where: { id: targetUserId, isActive: true } });
    if (!target) throw new Error('Usuário não encontrado');

    return prisma.driveFolderShare.upsert({
      where: { folderId_userId: { folderId, userId: targetUserId } },
      create: { folderId, userId: targetUserId, permission, createdBy: requesterId },
      update: { permission },
    });
  }

  async removeShare(folderId: string, targetUserId: string, requesterId: string) {
    const folder = await prisma.driveFolder.findFirst({ where: { id: folderId } });
    if (!folder) throw new Error('Pasta não encontrada');
    if (folder.ownerId !== requesterId) throw new Error('Apenas o dono pode remover acesso');

    await prisma.driveFolderShare.delete({
      where: { folderId_userId: { folderId, userId: targetUserId } },
    });
  }

  async updateSharePermission(
    folderId: string,
    targetUserId: string,
    permission: DriveFolderSharePermission,
    requesterId: string,
  ) {
    const folder = await prisma.driveFolder.findFirst({ where: { id: folderId } });
    if (!folder) throw new Error('Pasta não encontrada');
    if (folder.ownerId !== requesterId) throw new Error('Apenas o dono pode alterar permissões');

    return prisma.driveFolderShare.update({
      where: { folderId_userId: { folderId, userId: targetUserId } },
      data: { permission },
    });
  }

  // ── Busca ─────────────────────────────────────────────────────────────

  async search(userId: string, query: string) {
    const q = query.trim();
    if (!q) return { folders: [] as any[], files: [] as any[] };

    const [folderCandidates, fileCandidates] = await Promise.all([
      prisma.driveFolder.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      prisma.driveFile.findMany({
        where: { name: { contains: q, mode: 'insensitive' } },
        orderBy: { name: 'asc' },
        take: 200,
      }),
    ]);
    const shareMap = await this.getShareCountsByFolderIds(folderCandidates.map((f) => f.id));

    const folders: any[] = [];
    for (const f of folderCandidates) {
      if (await this.canUserAccessFolder(userId, f.id)) {
        folders.push(this.mapFolder(f, userId, shareMap.get(f.id) ?? 0));
      }
    }

    const files: DriveFile[] = [];
    for (const f of fileCandidates) {
      if (f.folderId) {
        if (await this.canUserAccessFolder(userId, f.folderId)) files.push(f);
      } else if (f.ownerId === userId) {
        files.push(f);
      }
    }

    return { folders, files };
  }

  // ── Utilitários ───────────────────────────────────────────────────────

  private async deleteS3Object(key: string): Promise<void> {
    try {
      await this.s3.deleteObject({ Bucket: this.bucketName, Key: key }).promise();
    } catch {
      // Ignorar
    }
  }
}
