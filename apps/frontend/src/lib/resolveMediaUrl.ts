import { API_BASE_URL } from './apiBaseUrl';

/** URLs relativas `/uploads/...` apontam para o host da API (não do Next.js). */
export function resolveApiMediaUrl(url: string | null | undefined): string | null {
  if (url == null || String(url).trim() === '') return null;
  const u = String(url).trim();
  if (/^https?:\/\//i.test(u)) return u;
  const origin = API_BASE_URL.replace(/\/api\/?$/i, '').replace(/\/$/, '');
  if (u.startsWith('/')) return `${origin}${u}`;
  return u;
}
