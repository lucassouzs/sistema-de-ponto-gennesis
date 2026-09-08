import { API_BASE_URL } from './apiBaseUrl';

const FRONTEND_PUBLIC_ORIGIN =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APP_URL?.trim()) ||
  'http://localhost:3000';

/** Caminho no /public do Next (avatar da Gennecy/Luna). */
export const GENNECY_BOT_AVATAR_PATH = '/Logo%20-%20Luna.png';

function isBackendUploadPath(path: string): boolean {
  return path.startsWith('/uploads') || path.startsWith('/api/');
}

/** URLs relativas `/uploads/...` → API; arquivos do /public do Next → frontend. */
export function resolveApiMediaUrl(url: string | null | undefined): string | undefined {
  if (url == null || String(url).trim() === '') return undefined;
  const u = String(url).trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) {
    if (isBackendUploadPath(u)) {
      const apiOrigin = API_BASE_URL.replace(/\/api\/?$/i, '').replace(/\/$/, '');
      return `${apiOrigin}${u}`;
    }
    const feOrigin =
      typeof window !== 'undefined'
        ? window.location.origin
        : FRONTEND_PUBLIC_ORIGIN.replace(/\/$/, '');
    return `${feOrigin}${u}`;
  }
  return u;
}

export function hasFuelStoredPhoto(
  url?: string | null,
  key?: string | null,
): boolean {
  return Boolean(String(url || '').trim() || String(key || '').trim());
}

/** Prioriza URL resolvida pela API (ex.: S3 assinada); senão tenta URL legada. */
export function resolveFuelPhotoSrc(
  viewUrl?: string | null,
  fallbackUrl?: string | null,
): string | undefined {
  const resolved = viewUrl?.trim() || resolveApiMediaUrl(fallbackUrl);
  return resolved || undefined;
}
