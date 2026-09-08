import { absoluteUploadUrl } from '@/lib/apiOrigin';

/** Baixa arquivo servido em `/uploads` (ou URL absoluta) com autenticação quando houver token. */
export async function downloadUploadFile(relativeOrAbsoluteUrl: string, fileName: string): Promise<void> {
  const url = absoluteUploadUrl(relativeOrAbsoluteUrl);
  if (!url) throw new Error('URL inválida');

  const token =
    typeof window !== 'undefined'
      ? localStorage.getItem('token') || sessionStorage.getItem('token')
      : null;

  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = (fileName || 'documento').replace(/[<>:"/\\|?*]+/g, '_');
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}
