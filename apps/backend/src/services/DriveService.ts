import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import { DriveFile, DriveFolder, DriveFolderSharePermission } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** Limite padrão: 5 GB (vídeos longos). Override via DRIVE_MAX_FILE_SIZE (bytes). */
export const DRIVE_MAX_FILE_SIZE_BYTES = parseInt(
  process.env.DRIVE_MAX_FILE_SIZE || String(5 * 1024 * 1024 * 1024),
  10,
);

/** Cota de armazenamento exibida na sidebar (default 15 GB). */
export const DRIVE_QUOTA_BYTES = parseInt(
  process.env.DRIVE_QUOTA_BYTES || String(15 * 1024 * 1024 * 1024),
  10,
);

const NOT_TRASHED = { trashedAt: null } as const;

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
      // Uploads grandes (multipart ~GB) — sem cortar no meio
      httpOptions: { timeout: 0, connectTimeout: 120_000 },
    });
    this.bucketName = process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos';
  }

  /**
   * Libera PUT/GET do browser no bucket (upload direto sem CORS block).
   * Idempotente: mescla origens novas com as regras existentes.
   */
  async ensureBucketCorsForBrowserUploads(): Promise<void> {
    const extra = (process.env.DRIVE_CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const desiredOrigins = Array.from(
      new Set([
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'https://www.gennesisconecta.com.br',
        'https://gennesisconecta.com.br',
        'https://sistema-pontofrontend-production.up.railway.app',
        ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.replace(/\/$/, '')] : []),
        ...extra,
      ]),
    );

    let existingRules: AWS.S3.CORSRule[] = [];
    try {
      const current = await this.s3.getBucketCors({ Bucket: this.bucketName }).promise();
      existingRules = current.CORSRules || [];
    } catch (err: any) {
      // Sem CORS ainda (NoSuchCORSConfiguration)
      if (err?.code !== 'NoSuchCORSConfiguration') {
        console.warn('[drive] getBucketCors:', err?.message || err);
      }
    }

    const originSet = new Set<string>();
    for (const rule of existingRules) {
      for (const o of rule.AllowedOrigins || []) originSet.add(o);
    }
    for (const o of desiredOrigins) originSet.add(o);

    const methods = new Set<string>(['GET', 'PUT', 'HEAD', 'POST']);
    for (const rule of existingRules) {
      for (const m of rule.AllowedMethods || []) methods.add(m);
    }

    await this.s3
      .putBucketCors({
        Bucket: this.bucketName,
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedHeaders: ['*'],
              AllowedMethods: Array.from(methods) as Array<'GET' | 'PUT' | 'HEAD' | 'POST' | 'DELETE'>,
              AllowedOrigins: Array.from(originSet),
              ExposeHeaders: ['ETag', 'x-amz-request-id', 'x-amz-version-id'],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      })
      .promise();

    console.log(
      `[drive] CORS do bucket ${this.bucketName} atualizado (${originSet.size} origens) para upload direto.`,
    );
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
      if (current.trashedAt) return false;
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
      where: { parentId: null, ownerId: userId, ...NOT_TRASHED },
      orderBy: { name: 'asc' },
    });

    const shareRows = await prisma.driveFolderShare.findMany({
      where: { userId, folder: { trashedAt: null } },
      include: { folder: true },
    });

    const seen = new Set(owned.map((o) => o.id));
    const extra: typeof owned = [];

    for (const s of shareRows) {
      const f = s.folder;
      if (f.trashedAt) continue;
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

  private async resolveOwnerInfo(
    ownerIds: string[],
  ): Promise<Map<string, { name: string; profilePhotoUrl: string | null }>> {
    const unique = [...new Set(ownerIds.filter(Boolean))];
    const map = new Map<string, { name: string; profilePhotoUrl: string | null }>();
    if (unique.length === 0) return map;
    const users = await prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true, profilePhotoUrl: true },
    });
    for (const u of users) {
      map.set(u.id, { name: u.name, profilePhotoUrl: u.profilePhotoUrl ?? null });
    }
    return map;
  }

  private mapFolder(
    f: any,
    userId: string,
    shareCount: number,
    ownerInfo?: Map<string, { name: string; profilePhotoUrl: string | null }>,
  ) {
    const { _count: _c, owner: _owner, ...rest } = f;
    const info = ownerInfo?.get(f.ownerId);
    return {
      ...rest,
      isOwner: f.ownerId === userId,
      canManageShares: f.ownerId === userId,
      shareCount,
      ownerName: info?.name ?? f.owner?.name ?? null,
      ownerPhotoUrl: info?.profilePhotoUrl ?? f.owner?.profilePhotoUrl ?? null,
    };
  }

  private mapFile(
    f: DriveFile,
    ownerInfo?: Map<string, { name: string; profilePhotoUrl: string | null }>,
  ) {
    const info = ownerInfo?.get(f.ownerId);
    return {
      ...f,
      ownerName: info?.name ?? null,
      ownerPhotoUrl: info?.profilePhotoUrl ?? null,
    };
  }

  async listFolderContents(
    userId: string,
    parentId?: string,
  ): Promise<{
    folders: Array<Record<string, unknown>>;
    files: Array<Record<string, unknown>>;
  }> {
    if (parentId === undefined || parentId === null) {
      const foldersRaw = await this.listRootFoldersForUser(userId);
      const shareMap = await this.getShareCountsByFolderIds(foldersRaw.map((f) => f.id));
      const files = await prisma.driveFile.findMany({
        where: { ownerId: userId, folderId: null, ...NOT_TRASHED },
        orderBy: { name: 'asc' },
      });
      const ownerNames = await this.resolveOwnerInfo([
        ...foldersRaw.map((f) => f.ownerId),
        ...files.map((f) => f.ownerId),
      ]);
      return {
        folders: foldersRaw.map((f) =>
          this.mapFolder(f, userId, shareMap.get(f.id) ?? 0, ownerNames),
        ),
        files: files.map((f) => this.mapFile(f, ownerNames)),
      };
    }

    if (!(await this.canUserAccessFolder(userId, parentId))) {
      throw new Error('Pasta não encontrada ou sem permissão de acesso');
    }

    const [foldersRaw, allFiles] = await Promise.all([
      prisma.driveFolder.findMany({
        where: { parentId, ...NOT_TRASHED },
        orderBy: { name: 'asc' },
      }),
      prisma.driveFile.findMany({
        where: { folderId: parentId, ...NOT_TRASHED },
        orderBy: { name: 'asc' },
      }),
    ]);
    const shareMap = await this.getShareCountsByFolderIds(foldersRaw.map((f) => f.id));
    const ownerNames = await this.resolveOwnerInfo([
      ...foldersRaw.map((f) => f.ownerId),
      ...allFiles.map((f) => f.ownerId),
    ]);
    return {
      folders: foldersRaw.map((f) =>
        this.mapFolder(f, userId, shareMap.get(f.id) ?? 0, ownerNames),
      ),
      files: allFiles.map((f) => this.mapFile(f, ownerNames)),
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
    const ownerNames = await this.resolveOwnerInfo([f.ownerId]);
    return { ...this.mapFolder(f, userId, shareMap.get(folderId) ?? 0, ownerNames), canWrite };
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
    const folder = await prisma.driveFolder.findFirst({ where: { id, ...NOT_TRASHED } });
    if (!folder) throw new Error('Pasta não encontrada');
    if (folder.ownerId !== userId) throw new Error('Apenas o dono da pasta pode renomeá-la');
    return prisma.driveFolder.update({ where: { id }, data: { name } });
  }

  async deleteFolder(id: string, userId: string): Promise<void> {
    const folder = await prisma.driveFolder.findFirst({ where: { id } });
    if (!folder) throw new Error('Pasta não encontrada');
    if (folder.ownerId !== userId) throw new Error('Apenas o dono da pasta pode excluí-la');
    if (folder.trashedAt) throw new Error('Pasta já está na lixeira');

    const now = new Date();
    await this.softDeleteFolderRecursive(id, now);
  }

  /** Soft-delete recursivo (pasta + subpastas + arquivos). */
  private async softDeleteFolderRecursive(folderId: string, trashedAt: Date): Promise<void> {
    await prisma.driveFile.updateMany({
      where: { folderId, trashedAt: null },
      data: { trashedAt },
    });

    const subFolders = await prisma.driveFolder.findMany({
      where: { parentId: folderId, trashedAt: null },
      select: { id: true },
    });
    for (const sub of subFolders) {
      await this.softDeleteFolderRecursive(sub.id, trashedAt);
    }

    await prisma.driveFolder.update({
      where: { id: folderId },
      data: { trashedAt },
    });
  }

  /** Exclusão definitiva (S3 + DB) — só a partir da lixeira. */
  private async hardDeleteFolderRecursive(folderId: string): Promise<void> {
    const files = await prisma.driveFile.findMany({ where: { folderId } });
    for (const file of files) {
      await this.deleteS3Object(file.s3Key);
    }
    await prisma.driveFile.deleteMany({ where: { folderId } });

    const subFolders = await prisma.driveFolder.findMany({ where: { parentId: folderId } });
    for (const sub of subFolders) {
      await this.hardDeleteFolderRecursive(sub.id);
    }
    await prisma.driveFolder.delete({ where: { id: folderId } }).catch(() => {});
  }

  // ── Arquivos ─────────────────────────────────────────────────────────

  private async buildDriveS3Key(userId: string, fileName: string, folderId?: string): Promise<string> {
    const ext = path.extname(fileName) || '';
    const safeStem = this.toSafeFileStem(fileName);
    const folderPath = folderId ? `/${(await this.getFolderPathSlugs(folderId)).join('/')}` : '';
    return `drive/${userId}${folderPath}/${safeStem}-${uuidv4()}${ext}`;
  }

  private assertOwnDriveKey(userId: string, s3Key: string) {
    const prefix = `drive/${userId}/`;
    if (!s3Key.startsWith(prefix)) {
      throw new Error('Chave de upload inválida');
    }
  }

  /**
   * URL assinada para o browser enviar direto ao S3 (arquivos grandes, sem timeout do API).
   */
  async createUploadPresign(
    userId: string,
    input: { name: string; mimeType?: string; size: number; folderId?: string },
  ): Promise<{ uploadUrl: string; s3Key: string; contentType: string; expiresIn: number }> {
    const name = input.name?.trim();
    if (!name) throw new Error('Nome do arquivo é obrigatório');
    if (!Number.isFinite(input.size) || input.size <= 0) {
      throw new Error('Tamanho do arquivo inválido');
    }
    if (input.size > DRIVE_MAX_FILE_SIZE_BYTES) {
      const gb = Math.round(DRIVE_MAX_FILE_SIZE_BYTES / (1024 ** 3));
      throw new Error(`Arquivo excede o limite de ${gb} GB`);
    }
    if (input.folderId) {
      const can = await this.canUserWriteInFolder(userId, input.folderId);
      if (!can) throw new Error('Sem permissão para enviar arquivo nesta pasta');
    }

    const contentType = input.mimeType || 'application/octet-stream';
    const s3Key = await this.buildDriveS3Key(userId, name, input.folderId);
    const expiresIn = 6 * 3600;

    const uploadUrl = await this.s3.getSignedUrlPromise('putObject', {
      Bucket: this.bucketName,
      Key: s3Key,
      ContentType: contentType,
      Expires: expiresIn,
    });

    return { uploadUrl, s3Key, contentType, expiresIn };
  }

  /** Confirma o objeto no S3 e grava o registro no banco. */
  async confirmUpload(
    userId: string,
    input: { s3Key: string; name: string; mimeType?: string; size: number; folderId?: string },
  ): Promise<DriveUploadResult> {
    const name = input.name?.trim();
    if (!name) throw new Error('Nome do arquivo é obrigatório');
    this.assertOwnDriveKey(userId, input.s3Key);

    if (input.folderId) {
      const can = await this.canUserWriteInFolder(userId, input.folderId);
      if (!can) throw new Error('Sem permissão para enviar arquivo nesta pasta');
    }

    let actualSize = input.size;
    try {
      const head = await this.s3
        .headObject({ Bucket: this.bucketName, Key: input.s3Key })
        .promise();
      if (typeof head.ContentLength === 'number') actualSize = head.ContentLength;
    } catch {
      throw new Error('Upload incompleto — arquivo não encontrado no armazenamento');
    }

    if (actualSize > DRIVE_MAX_FILE_SIZE_BYTES) {
      await this.s3.deleteObject({ Bucket: this.bucketName, Key: input.s3Key }).promise().catch(() => {});
      throw new Error('Arquivo excede o limite permitido');
    }

    const record = await prisma.driveFile.create({
      data: {
        name,
        originalName: name,
        s3Key: input.s3Key,
        size: actualSize,
        mimeType: input.mimeType || 'application/octet-stream',
        folderId: input.folderId ?? null,
        ownerId: userId,
      },
    });

    return record as DriveUploadResult;
  }

  async uploadFile(
    file: Express.Multer.File,
    userId: string,
    folderId?: string,
  ): Promise<DriveUploadResult> {
    if (folderId) {
      const can = await this.canUserWriteInFolder(userId, folderId);
      if (!can) throw new Error('Sem permissão para enviar arquivo nesta pasta');
    }

    if (file.size > DRIVE_MAX_FILE_SIZE_BYTES) {
      const gb = Math.round(DRIVE_MAX_FILE_SIZE_BYTES / (1024 ** 3));
      throw new Error(`Arquivo excede o limite de ${gb} GB`);
    }

    const s3Key = await this.buildDriveS3Key(userId, file.originalname, folderId);
    const body =
      file.path && fs.existsSync(file.path)
        ? fs.createReadStream(file.path)
        : file.buffer;

    if (!body) {
      throw new Error('Conteúdo do arquivo indisponível');
    }

    try {
      // Sem ACL: buckets com "Bucket owner enforced" rejeitam ACL e o upload trava/falha.
      await this.s3
        .upload(
          {
            Bucket: this.bucketName,
            Key: s3Key,
            Body: body,
            ContentType: file.mimetype || 'application/octet-stream',
            ContentDisposition: `attachment; filename="${encodeURIComponent(file.originalname)}"`,
            Metadata: {
              userid: userId,
              uploadedat: new Date().toISOString(),
            },
          } as AWS.S3.PutObjectRequest,
          {
            partSize: 16 * 1024 * 1024,
            queueSize: 3,
          },
        )
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
    } finally {
      if (file.path) {
        await fs.promises.unlink(file.path).catch(() => {});
      }
    }
  }

  async getSignedDownloadUrl(fileId: string, userId: string, expiresIn = 3600): Promise<string> {
    const file = await this.assertUserCanAccessFile(fileId, userId);

    return this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucketName,
      Key: file.s3Key,
      Expires: expiresIn,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(file.originalName)}"`,
    });
  }

  /** URL assinada para exibir no browser (sem forçar download) — imagens no Drive, etc. */
  async getSignedPreviewUrl(fileId: string, userId: string, expiresIn = 600): Promise<string> {
    const file = await this.assertUserCanAccessFile(fileId, userId);

    return this.s3.getSignedUrlPromise('getObject', {
      Bucket: this.bucketName,
      Key: file.s3Key,
      Expires: expiresIn,
      ResponseContentType: file.mimeType || 'application/octet-stream',
    });
  }

  /** Baixa o objeto do S3 para gerar preview no cliente (PDF, planilha, etc.). */
  async getFileContentBuffer(
    fileId: string,
    userId: string,
    maxBytes = 12 * 1024 * 1024,
  ): Promise<{ buffer: Buffer; mimeType: string; name: string; size: number }> {
    const file = await this.assertUserCanAccessFile(fileId, userId);
    if (file.size > maxBytes) {
      throw new Error('Arquivo grande demais para pré-visualização');
    }

    const result = await this.s3
      .getObject({ Bucket: this.bucketName, Key: file.s3Key })
      .promise();

    const body = result.Body;
    if (!body) throw new Error('Conteúdo indisponível');

    let buffer: Buffer;
    if (Buffer.isBuffer(body)) {
      buffer = body;
    } else if (body instanceof Uint8Array) {
      buffer = Buffer.from(body);
    } else if (body instanceof ArrayBuffer) {
      buffer = Buffer.from(new Uint8Array(body));
    } else if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === 'function') {
      const bytes = await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
      buffer = Buffer.from(bytes);
    } else {
      buffer = Buffer.from(Uint8Array.from(body as ArrayLike<number>));
    }

    return {
      buffer,
      mimeType: file.mimeType || 'application/octet-stream',
      name: file.name || file.originalName,
      size: file.size,
    };
  }

  private async assertUserCanAccessFile(fileId: string, userId: string): Promise<DriveFile> {
    const file = await prisma.driveFile.findFirst({ where: { id: fileId } });
    if (!file) throw new Error('Arquivo não encontrado');
    if (file.trashedAt) throw new Error('Arquivo está na lixeira');
    if (file.folderId) {
      if (!(await this.canUserAccessFolder(userId, file.folderId))) {
        throw new Error('Arquivo não encontrado ou sem permissão');
      }
    } else if (file.ownerId !== userId) {
      throw new Error('Arquivo não encontrado');
    }
    return file;
  }

  async renameFile(id: string, name: string, userId: string) {
    const file = await prisma.driveFile.findFirst({ where: { id, ...NOT_TRASHED } });
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
    const file = await prisma.driveFile.findFirst({ where: { id, ...NOT_TRASHED } });
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
    if (file.trashedAt) throw new Error('Arquivo já está na lixeira');

    const canDelete =
      file.ownerId === userId ||
      (file.folderId != null && (await this.canUserWriteInFolder(userId, file.folderId)));
    if (!canDelete) throw new Error('Sem permissão para excluir');

    await prisma.driveFile.update({
      where: { id },
      data: { trashedAt: new Date() },
    });
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
        where: { name: { contains: q, mode: 'insensitive' }, ...NOT_TRASHED },
        orderBy: { name: 'asc' },
        take: 200,
      }),
      prisma.driveFile.findMany({
        where: { name: { contains: q, mode: 'insensitive' }, ...NOT_TRASHED },
        orderBy: { name: 'asc' },
        take: 200,
      }),
    ]);
    const shareMap = await this.getShareCountsByFolderIds(folderCandidates.map((f) => f.id));

    const accessibleFolders: typeof folderCandidates = [];
    for (const f of folderCandidates) {
      if (await this.canUserAccessFolder(userId, f.id)) {
        accessibleFolders.push(f);
      }
    }

    const accessibleFiles: DriveFile[] = [];
    for (const f of fileCandidates) {
      if (f.folderId) {
        if (await this.canUserAccessFolder(userId, f.folderId)) accessibleFiles.push(f);
      } else if (f.ownerId === userId) {
        accessibleFiles.push(f);
      }
    }

    const ownerNames = await this.resolveOwnerInfo([
      ...accessibleFolders.map((f) => f.ownerId),
      ...accessibleFiles.map((f) => f.ownerId),
    ]);

    return {
      folders: accessibleFolders.map((f) =>
        this.mapFolder(f, userId, shareMap.get(f.id) ?? 0, ownerNames),
      ),
      files: accessibleFiles.map((f) => this.mapFile(f, ownerNames)),
    };
  }

  // ── Views da sidebar ──────────────────────────────────────────────────

  async listSharedWithMe(userId: string) {
    const shareRows = await prisma.driveFolderShare.findMany({
      where: {
        userId,
        folder: { trashedAt: null, ownerId: { not: userId } },
      },
      include: { folder: true },
      orderBy: { folder: { name: 'asc' } },
    });

    const foldersRaw = shareRows.map((s) => s.folder);
    const shareMap = await this.getShareCountsByFolderIds(foldersRaw.map((f) => f.id));
    const ownerNames = await this.resolveOwnerInfo(foldersRaw.map((f) => f.ownerId));
    return {
      folders: foldersRaw.map((f) =>
        this.mapFolder(f, userId, shareMap.get(f.id) ?? 0, ownerNames),
      ),
      files: [] as Array<Record<string, unknown>>,
    };
  }

  async listRecent(userId: string, limit = 50) {
    const files = await prisma.driveFile.findMany({
      where: { ownerId: userId, ...NOT_TRASHED },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
    const ownerNames = await this.resolveOwnerInfo(files.map((f) => f.ownerId));
    return {
      folders: [] as Array<Record<string, unknown>>,
      files: files.map((f) => this.mapFile(f, ownerNames)),
    };
  }

  async listStarred(userId: string) {
    const [foldersRaw, files] = await Promise.all([
      prisma.driveFolder.findMany({
        where: { ownerId: userId, starred: true, ...NOT_TRASHED },
        orderBy: { name: 'asc' },
      }),
      prisma.driveFile.findMany({
        where: { ownerId: userId, starred: true, ...NOT_TRASHED },
        orderBy: { name: 'asc' },
      }),
    ]);
    const shareMap = await this.getShareCountsByFolderIds(foldersRaw.map((f) => f.id));
    const ownerNames = await this.resolveOwnerInfo([
      ...foldersRaw.map((f) => f.ownerId),
      ...files.map((f) => f.ownerId),
    ]);
    return {
      folders: foldersRaw.map((f) =>
        this.mapFolder(f, userId, shareMap.get(f.id) ?? 0, ownerNames),
      ),
      files: files.map((f) => this.mapFile(f, ownerNames)),
    };
  }

  async listTrash(userId: string) {
    const [foldersRaw, files] = await Promise.all([
      prisma.driveFolder.findMany({
        where: { ownerId: userId, trashedAt: { not: null } },
        orderBy: { trashedAt: 'desc' },
      }),
      prisma.driveFile.findMany({
        where: { ownerId: userId, trashedAt: { not: null } },
        orderBy: { trashedAt: 'desc' },
      }),
    ]);
    const shareMap = await this.getShareCountsByFolderIds(foldersRaw.map((f) => f.id));
    const ownerNames = await this.resolveOwnerInfo([
      ...foldersRaw.map((f) => f.ownerId),
      ...files.map((f) => f.ownerId),
    ]);
    return {
      folders: foldersRaw.map((f) =>
        this.mapFolder(f, userId, shareMap.get(f.id) ?? 0, ownerNames),
      ),
      files: files.map((f) => this.mapFile(f, ownerNames)),
    };
  }

  async getStorageUsage(userId: string): Promise<{ usedBytes: number; quotaBytes: number }> {
    const agg = await prisma.driveFile.aggregate({
      where: { ownerId: userId, ...NOT_TRASHED },
      _sum: { size: true },
    });
    return {
      usedBytes: agg._sum.size ?? 0,
      quotaBytes: DRIVE_QUOTA_BYTES,
    };
  }

  async setFolderStarred(id: string, userId: string, starred: boolean) {
    const folder = await prisma.driveFolder.findFirst({ where: { id, ...NOT_TRASHED } });
    if (!folder) throw new Error('Pasta não encontrada');
    if (folder.ownerId !== userId) throw new Error('Apenas o dono pode marcar com estrela');
    return prisma.driveFolder.update({ where: { id }, data: { starred } });
  }

  async setFileStarred(id: string, userId: string, starred: boolean) {
    const file = await prisma.driveFile.findFirst({ where: { id, ...NOT_TRASHED } });
    if (!file) throw new Error('Arquivo não encontrado');
    if (file.ownerId !== userId) throw new Error('Apenas o dono pode marcar com estrela');
    return prisma.driveFile.update({ where: { id }, data: { starred } });
  }

  async restoreFolder(id: string, userId: string) {
    const folder = await prisma.driveFolder.findFirst({ where: { id } });
    if (!folder) throw new Error('Pasta não encontrada');
    if (folder.ownerId !== userId) throw new Error('Sem permissão');
    if (!folder.trashedAt) throw new Error('Pasta não está na lixeira');

    await this.restoreFolderRecursive(id);
    return prisma.driveFolder.findUnique({ where: { id } });
  }

  private async restoreFolderRecursive(folderId: string): Promise<void> {
    await prisma.driveFolder.update({
      where: { id: folderId },
      data: { trashedAt: null },
    });
    await prisma.driveFile.updateMany({
      where: { folderId, trashedAt: { not: null } },
      data: { trashedAt: null },
    });
    const subs = await prisma.driveFolder.findMany({
      where: { parentId: folderId, trashedAt: { not: null } },
      select: { id: true },
    });
    for (const sub of subs) {
      await this.restoreFolderRecursive(sub.id);
    }
  }

  async restoreFile(id: string, userId: string) {
    const file = await prisma.driveFile.findFirst({ where: { id } });
    if (!file) throw new Error('Arquivo não encontrado');
    if (file.ownerId !== userId) throw new Error('Sem permissão');
    if (!file.trashedAt) throw new Error('Arquivo não está na lixeira');
    return prisma.driveFile.update({ where: { id }, data: { trashedAt: null } });
  }

  async permanentlyDeleteFolder(id: string, userId: string): Promise<void> {
    const folder = await prisma.driveFolder.findFirst({ where: { id } });
    if (!folder) throw new Error('Pasta não encontrada');
    if (folder.ownerId !== userId) throw new Error('Sem permissão');
    if (!folder.trashedAt) throw new Error('Mova para a lixeira antes de excluir permanentemente');
    await this.hardDeleteFolderRecursive(id);
    await prisma.driveFolder.delete({ where: { id } }).catch(() => {});
  }

  async permanentlyDeleteFile(id: string, userId: string): Promise<void> {
    const file = await prisma.driveFile.findFirst({ where: { id } });
    if (!file) throw new Error('Arquivo não encontrado');
    if (file.ownerId !== userId) throw new Error('Sem permissão');
    if (!file.trashedAt) throw new Error('Mova para a lixeira antes de excluir permanentemente');
    await this.deleteS3Object(file.s3Key);
    await prisma.driveFile.delete({ where: { id } });
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
