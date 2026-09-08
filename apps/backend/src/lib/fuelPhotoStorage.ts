import fs from 'fs';
import path from 'path';
import { metaWhatsApp } from '../services/MetaWhatsAppService';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

function apiOrigin(): string {
  const raw =
    process.env.API_BASE_URL?.trim() ||
    process.env.API_URL?.trim().replace(/\/api\/?$/i, '') ||
    '';
  return raw.replace(/\/$/, '');
}

function contentTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

function extractUploadsRelativePath(url: string): string | null {
  const trimmed = url.trim();
  if (trimmed.startsWith('/uploads/')) return trimmed;
  const idx = trimmed.indexOf('/uploads/');
  if (idx >= 0) return trimmed.slice(idx).split('?')[0] || null;
  return null;
}

function extractS3KeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const objectPath = u.pathname.replace(/^\//, '');
    if (!objectPath) return null;

    if (host.startsWith('s3.') || host.startsWith('s3-') || host.startsWith('s3.')) {
      const parts = objectPath.split('/');
      if (parts.length >= 2) return parts.slice(1).join('/');
      return null;
    }

    if (host.includes('.s3.') || host.endsWith('.amazonaws.com')) {
      return objectPath;
    }
  } catch {
    return null;
  }
  return null;
}

function readLocalUpload(relativePath: string): { buffer: Buffer; contentType: string } | null {
  const normalized = relativePath.replace(/^\/uploads\//, '');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const filePath = path.join(process.cwd(), 'apps', 'backend', 'uploads', ...segments);
  if (!fs.existsSync(filePath)) return null;

  return {
    buffer: fs.readFileSync(filePath),
    contentType: contentTypeFromPath(filePath),
  };
}

export function hasFuelStoredPhoto(
  fileUrl?: string | null,
  fileKey?: string | null,
): boolean {
  return Boolean(String(fileUrl || '').trim() || String(fileKey || '').trim());
}

/** URL utilizável no frontend (`<img src>`): local `/uploads`, assinada S3 ou URL pública. */
export async function resolveFuelPhotoViewUrl(
  fileUrl?: string | null,
  fileKey?: string | null,
): Promise<string | null> {
  const url = String(fileUrl || '').trim();
  const key = String(fileKey || '').trim();

  if (!url && !key) return null;

  const uploadsPath = url ? extractUploadsRelativePath(url) : null;
  if (uploadsPath) {
    const origin = apiOrigin();
    return origin ? `${origin}${uploadsPath}` : uploadsPath;
  }

  const s3Key = key || (url ? extractS3KeyFromUrl(url) : null);
  if (s3Key) {
    const signed = await metaWhatsApp.getSignedUrlForMedia(s3Key);
    if (signed) return signed;
  }

  if (url && /^https?:\/\//i.test(url)) return url;

  return null;
}

export async function readFuelStoredPhoto(params: {
  fileUrl?: string | null;
  fileKey?: string | null;
  fileName?: string | null;
}): Promise<{ buffer: Buffer; contentType: string; fileName: string } | null> {
  const fileName = params.fileName?.trim() || 'foto.jpg';
  const url = String(params.fileUrl || '').trim();
  const key = String(params.fileKey || '').trim();

  if (key) {
    const fromS3 = await metaWhatsApp.getObjectBuffer(key);
    if (fromS3) {
      return { buffer: fromS3.buffer, contentType: fromS3.contentType, fileName };
    }
  }

  const uploadsPath = url ? extractUploadsRelativePath(url) : null;
  if (uploadsPath) {
    const local = readLocalUpload(uploadsPath);
    if (local) {
      return { buffer: local.buffer, contentType: local.contentType, fileName };
    }
  }

  const s3KeyFromUrl = url ? extractS3KeyFromUrl(url) : null;
  if (s3KeyFromUrl) {
    const fromS3 = await metaWhatsApp.getObjectBuffer(s3KeyFromUrl);
    if (fromS3) {
      return { buffer: fromS3.buffer, contentType: fromS3.contentType, fileName };
    }
  }

  if (url && /^https?:\/\//i.test(url)) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const contentType = res.headers.get('content-type') || 'image/jpeg';
        return { buffer, contentType, fileName };
      }
    } catch {
      return null;
    }
  }

  return null;
}
