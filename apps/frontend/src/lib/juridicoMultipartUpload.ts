import { API_BASE_URL } from './apiBaseUrl';

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function parseErrorPayload(text: string): string {
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return data.message || data.error || 'Falha no envio';
  } catch {
    return text?.trim() || 'Falha no envio';
  }
}

export type JuridicoUploadProgressCb = (loaded: number, total: number | null) => void;

/** Upload multipart sem timeout do axios — adequado para ZIPs grandes. */
export function postJuridicoMultipart<T = unknown>(
  endpoint: string,
  formData: FormData,
  onProgress?: JuridicoUploadProgressCb,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${API_BASE_URL}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    xhr.open('POST', url);
    xhr.timeout = 0;

    const token = getAuthToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (!onProgress) return;
      if (e.lengthComputable) onProgress(e.loaded, e.total);
      else onProgress(e.loaded, null);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const body = xhr.responseText ? (JSON.parse(xhr.responseText) as T) : ({} as T);
          resolve(body);
        } catch {
          resolve({} as T);
        }
        return;
      }
      reject(new Error(parseErrorPayload(xhr.responseText)));
    };

    xhr.onerror = () =>
      reject(
        new Error(
          'Conexão interrompida durante o envio. Verifique a internet ou envie um ZIP menor.',
        ),
      );
    xhr.onabort = () => reject(new Error('Envio cancelado.'));
    xhr.ontimeout = () => reject(new Error('Tempo esgotado no envio. Tente um ZIP menor.'));

    xhr.send(formData);
  });
}
