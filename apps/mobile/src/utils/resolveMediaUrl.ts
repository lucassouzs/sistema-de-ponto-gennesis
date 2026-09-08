import { API_CONFIG } from '../config/api';

/** URLs relativas `/uploads/...` → API; absolutas http(s) ficam como estão. */
export function resolveMediaUrl(url: string | null | undefined): string | undefined {
  if (url == null || String(url).trim() === '') return undefined;
  const u = String(url).trim();
  if (/^https?:\/\//i.test(u)) return u;
  if (u.startsWith('/')) {
    const origin = API_CONFIG.BASE_URL.replace(/\/$/, '');
    return `${origin}${u}`;
  }
  return u;
}
