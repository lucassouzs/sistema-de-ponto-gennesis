import { API_BASE_URL } from '@/lib/apiBaseUrl';

/** Origem HTTP do backend sem sufixo `/api` (uploads e arquivos estáticos). */
export function getApiOrigin(): string {
  return API_BASE_URL.replace(/\/api\/?$/, '');
}

/** URL absoluta para caminhos retornados pela API (ex.: `/uploads/...`). */
export function absoluteUploadUrl(relative: string): string {
  if (!relative) return '';
  if (relative.startsWith('http')) return relative;
  const origin = getApiOrigin();
  return `${origin}${relative.startsWith('/') ? '' : '/'}${relative}`;
}
