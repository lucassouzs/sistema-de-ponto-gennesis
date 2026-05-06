import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';

export interface PhotoUploadResult {
  url: string;
  key: string;
  size: number;
  contentType: string;
}

export interface PhotoValidation {
  isValid: boolean;
  reason?: string;
  size?: number;
  contentType?: string;
}

export class PhotoService {
  private s3: AWS.S3 | null;
  private bucketName: string;
  private useLocal: boolean;

  constructor() {
    // Detectar modo de armazenamento
    this.useLocal = (process.env.STORAGE_PROVIDER || '').toLowerCase() === 'local'
      || !process.env.AWS_ACCESS_KEY_ID
      || !process.env.AWS_SECRET_ACCESS_KEY;

    // Configurar AWS S3 quando aplicável
    this.s3 = this.useLocal ? null : new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });
    
    this.bucketName = process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos';
    
    // Log de configuração do PhotoService
    console.log('📸 PhotoService configurado:');
    console.log(`   💾 Modo: ${this.useLocal ? 'Local Storage' : 'AWS S3'}`);
    console.log(`   📦 Bucket: ${this.bucketName}`);
    console.log(`   🌍 Região: ${process.env.AWS_REGION || 'us-east-1'}`);
  }

  /**
   * Valida se a foto é válida
   */
  validatePhoto(photo: any): PhotoValidation {
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '5242880'); // 5MB
    const allowedTypes = (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/jpg,image/png,image/webp').split(',');

    if (!photo) {
      return { isValid: false, reason: 'Nenhuma foto fornecida' };
    }

    if (photo.size && photo.size > maxSize) {
      return {
        isValid: false,
        reason: `Foto muito grande. Máximo permitido: ${Math.round(maxSize / 1024 / 1024)}MB`,
        size: photo.size
      };
    }

    // Normalizar/Inferir tipo quando necessário
    const nameLower: string = (photo.originalname || '').toLowerCase();
    const extToMime: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
    };

    const ext = Object.keys(extToMime).find((e) => nameLower.endsWith(e));
    const inferredMime = ext ? extToMime[ext] : undefined;

    if (!photo.mimetype || photo.mimetype === 'application/octet-stream') {
      if (inferredMime) {
        photo.mimetype = inferredMime;
      }
    }

    if (photo.mimetype && !allowedTypes.includes(photo.mimetype)) {
      if (inferredMime && allowedTypes.includes(inferredMime)) {
        photo.mimetype = inferredMime;
      } else {
        return {
          isValid: false,
          reason: `Tipo de arquivo não permitido. Tipos aceitos: ${allowedTypes.join(', ')}`,
          contentType: photo.mimetype
        };
      }
    }

    return {
      isValid: true,
      size: photo.size,
      contentType: photo.mimetype
    };
  }

  private async saveLocalPhoto(photo: any, userId: string): Promise<PhotoUploadResult> {
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };
    const ext = extMap[photo.mimetype || 'image/jpeg'] || 'jpg';

    const fileName = `${uuidv4()}.${ext}`;
    const relativeDir = path.join('uploads', 'ponto', userId);
    const absoluteDir = path.join(process.cwd(), 'apps', 'backend', relativeDir);

    // Garantir diretório
    await fs.promises.mkdir(absoluteDir, { recursive: true });

    const filePath = path.join(absoluteDir, fileName);
    const buffer: Buffer = photo.buffer || photo.data;
    await fs.promises.writeFile(filePath, buffer);

    // URL pública servida pelo Express (ver index.ts)
    const publicUrlBase = process.env.PUBLIC_BASE_URL || 'http://localhost:5000';
    const url = `${publicUrlBase}/${relativeDir.replace(/\\/g, '/')}/${fileName}`.replace(/\s/g, '%20');

    return {
      url,
      key: path.join(relativeDir, fileName).replace(/\\/g, '/'),
      size: buffer.length,
      contentType: photo.mimetype || 'image/jpeg'
    };
  }

  /**
   * Faz upload da foto para S3 ou armazenamento local
   */
  async uploadPhoto(photo: any, userId: string): Promise<PhotoUploadResult> {
    try {
      console.log(`📸 Upload iniciado - Usuário: ${userId}`);
      
      const validation = this.validatePhoto(photo);
      if (!validation.isValid) {
        throw new Error(validation.reason);
      }

      if (this.useLocal || !this.s3) {
        console.log('💾 Salvando localmente...');
        return await this.saveLocalPhoto(photo, userId);
      }

      console.log('☁️ Enviando para AWS S3...');

      const fileExtension = this.getFileExtension(photo.mimetype || 'image/jpeg');
      const fileName = `ponto/${userId}/${uuidv4()}.${fileExtension}`;

      const uploadParams = {
        Bucket: this.bucketName,
        Key: fileName,
        Body: photo.buffer || photo.data,
        ContentType: photo.mimetype || 'image/jpeg',
        ACL: 'private',
        Metadata: {
          userId,
          uploadedAt: new Date().toISOString(),
          originalName: photo.originalname || 'ponto.jpg'
        }
      } as AWS.S3.PutObjectRequest;

      const result = await this.s3.upload(uploadParams).promise();
      
      console.log(`✅ Upload concluído - URL: ${result.Location}`);

      return {
        url: result.Location,
        key: fileName,
        size: photo.size || 0,
        contentType: photo.mimetype || 'image/jpeg'
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Erro ao fazer upload da foto: ${error.message}`);
      }
      throw new Error('Erro ao fazer upload da foto: erro desconhecido');
    }
  }

  async uploadPhotoFromBase64(base64Data: string, userId: string, contentType: string = 'image/jpeg'): Promise<PhotoUploadResult> {
    try {
      const base64String = base64Data.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64String, 'base64');
      const photo = { buffer, size: buffer.length, mimetype: contentType, originalname: 'ponto.jpg' };
      return await this.uploadPhoto(photo, userId);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Erro ao processar foto base64: ${error.message}`);
      }
      throw new Error('Erro ao processar foto base64: erro desconhecido');
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      if (this.useLocal) {
        const publicUrlBase = process.env.PUBLIC_BASE_URL || 'http://localhost:5000';
        return `${publicUrlBase}/${key}`.replace(/\s/g, '%20');
      }

      const params = { Bucket: this.bucketName, Key: key, Expires: expiresIn };
      return await (this.s3 as AWS.S3).getSignedUrlPromise('getObject', params);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Erro ao gerar URL: ${error.message}`);
      }
      throw new Error('Erro ao gerar URL: erro desconhecido');
    }
  }

  async deletePhoto(key: string): Promise<void> {
    try {
      if (this.useLocal) {
        const absolutePath = path.join(process.cwd(), 'apps', 'backend', key);
        try {
          await fs.promises.unlink(absolutePath);
        } catch {}
        return;
      }

      await (this.s3 as AWS.S3).deleteObject({ Bucket: this.bucketName, Key: key }).promise();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Erro ao deletar foto: ${error.message}`);
      }
      throw new Error('Erro ao deletar foto: erro desconhecido');
    }
  }

  async listUserPhotos(userId: string, limit: number = 50): Promise<Array<{ key: string; url: string; size: number; lastModified: Date }>> {
    try {
      if (this.useLocal) {
        const relativeDir = path.join('uploads', 'ponto', userId);
        const absoluteDir = path.join(process.cwd(), 'apps', 'backend', relativeDir);
        try {
          const files = await fs.promises.readdir(absoluteDir);
          return files.slice(0, limit).map((file) => ({
            key: path.join(relativeDir, file).replace(/\\/g, '/'),
            url: `${(process.env.PUBLIC_BASE_URL || 'http://localhost:5000')}/${relativeDir.replace(/\\/g, '/')}/${file}`,
            size: 0,
            lastModified: new Date()
          }));
        } catch {
          return [];
        }
      }

      const params = { Bucket: this.bucketName, Prefix: `ponto/${userId}/`, MaxKeys: limit };
      const result = await (this.s3 as AWS.S3).listObjectsV2(params).promise();
      const photos = await Promise.all((result.Contents || []).map(async (object) => {
        const signedUrl = await this.getSignedUrl(object.Key!, 3600);
        return { key: object.Key!, url: signedUrl, size: object.Size || 0, lastModified: object.LastModified || new Date() };
      }));
      return photos;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Erro ao listar fotos: ${error.message}`);
      }
      throw new Error('Erro ao listar fotos: erro desconhecido');
    }
  }

  private getFileExtension(mimeType: string): string {
    const extensions: { [key: string]: string } = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif'
    };
    return extensions[mimeType] || 'jpg';
  }

  isImageFile(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }

  /**
   * Redimensiona uma foto (opcional - requer biblioteca adicional)
   */
  async resizePhoto(photo: any, maxWidth: number = 800, maxHeight: number = 600): Promise<Buffer> {
    // Implementação básica - em produção, usar biblioteca como sharp
    // Por enquanto, retorna o buffer original
    return photo.buffer || photo.data;
  }

  /**
   * Obtém metadados de uma foto
   */
  async getPhotoMetadata(key: string): Promise<{
    size: number;
    lastModified: Date;
    contentType: string;
    metadata: any;
  }> {
    try {
      if (this.useLocal) {
        const absolutePath = path.join(process.cwd(), 'apps', 'backend', key);
        const stats = await fs.promises.stat(absolutePath);
        return {
          size: stats.size,
          lastModified: stats.mtime,
          contentType: this.getFileExtension(absolutePath),
          metadata: {}
        };
      }

      const params = { Bucket: this.bucketName, Key: key };
      const result = await (this.s3 as AWS.S3).headObject(params).promise();
      return {
        size: result.ContentLength || 0,
        lastModified: result.LastModified || new Date(),
        contentType: result.ContentType || 'image/jpeg',
        metadata: result.Metadata || {}
      };
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Erro ao obter metadados da foto: ${error.message}`);
      }
      throw new Error('Erro ao obter metadados da foto: erro desconhecido');
    }
  }

  /**
   * Calcula hash MD5 do arquivo (para verificação de integridade)
   */
  calculateFileHash(buffer: Buffer): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Verifica se o bucket S3 existe e está acessível
   */
  async checkBucketAccess(): Promise<boolean> {
    if (this.useLocal) {
      return true; // Local storage is always accessible
    }
    try {
      await (this.s3 as AWS.S3).headBucket({ Bucket: this.bucketName }).promise();
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Cria o bucket se não existir
   */
  async createBucketIfNotExists(): Promise<void> {
    if (this.useLocal) {
      return; // Local storage does not require bucket creation
    }
    try {
      const exists = await this.checkBucketAccess();
      if (!exists) {
        await (this.s3 as AWS.S3).createBucket({ Bucket: this.bucketName }).promise();
        console.log(`Bucket ${this.bucketName} criado com sucesso`);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Erro ao criar bucket: ${error.message}`);
      }
      throw new Error('Erro ao criar bucket: erro desconhecido');
    }
  }
}