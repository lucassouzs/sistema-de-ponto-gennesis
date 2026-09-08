import { API_BASE_URL } from './apiBaseUrl';

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function parseErrorPayload(text: string): string {
  try {
    const data = JSON.parse(text) as { error?: string; message?: string };
    return data.error || data.message || 'Falha no upload';
  } catch {
    return text?.trim() || 'Falha no upload';
  }
}

export type UploadProgressCb = (loaded: number, total: number) => void;

/** Arquivo do drop/seleção, com caminho relativo quando veio de uma pasta. */
export type DriveDroppedFile = {
  file: File;
  /** Ex.: "Capturas de tela/foto.png" — vazio se solto solto. */
  relativePath: string;
};

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  fullPath?: string;
  file?: (
    success: (file: File) => void,
    error?: (err: DOMException) => void,
  ) => void;
  createReader?: () => {
    readEntries: (
      success: (entries: FileSystemEntryLike[]) => void,
      error?: (err: DOMException) => void,
    ) => void;
  };
};

function readAllDirectoryEntries(reader: {
  readEntries: (
    success: (entries: FileSystemEntryLike[]) => void,
    error?: (err: DOMException) => void,
  ) => void;
}): Promise<FileSystemEntryLike[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntryLike[] = [];
    const readBatch = () => {
      reader.readEntries(
        (entries) => {
          if (!entries.length) {
            resolve(all);
            return;
          }
          all.push(...entries);
          readBatch();
        },
        reject,
      );
    };
    readBatch();
  });
}

async function collectFromEntry(
  entry: FileSystemEntryLike,
  pathPrefix: string,
  out: DriveDroppedFile[],
): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file!(resolve, reject);
    });
    if (!file.size) return;
    const relativePath = pathPrefix ? `${pathPrefix}/${file.name}` : file.name;
    out.push({ file, relativePath });
    return;
  }
  if (entry.isDirectory && entry.createReader) {
    const nextPrefix = pathPrefix ? `${pathPrefix}/${entry.name}` : entry.name;
    const children = await readAllDirectoryEntries(entry.createReader());
    for (const child of children) {
      await collectFromEntry(child, nextPrefix, out);
    }
  }
}

/**
 * Lê arquivos de um DataTransfer (inclui pastas arrastadas via webkitGetAsEntry).
 * Pastas vazias ou stubs de diretório (size 0) são ignorados.
 */
export async function collectFilesFromDataTransfer(
  dataTransfer: DataTransfer,
): Promise<DriveDroppedFile[]> {
  const out: DriveDroppedFile[] = [];
  const items = dataTransfer.items;

  if (items?.length) {
    const entries: FileSystemEntryLike[] = [];
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (item.kind !== 'file') continue;
      const entry =
        typeof item.webkitGetAsEntry === 'function'
          ? (item.webkitGetAsEntry() as FileSystemEntryLike | null)
          : null;
      if (entry) entries.push(entry);
    }

    if (entries.length > 0) {
      for (const entry of entries) {
        await collectFromEntry(entry, '', out);
      }
      if (out.length > 0) return out;
    }
  }

  for (let i = 0; i < dataTransfer.files.length; i += 1) {
    const file = dataTransfer.files[i];
    if (!file || !file.size) continue;
    const relative =
      typeof (file as File & { webkitRelativePath?: string }).webkitRelativePath === 'string'
        ? (file as File & { webkitRelativePath?: string }).webkitRelativePath!.replace(/\\/g, '/')
        : file.name;
    out.push({ file, relativePath: relative || file.name });
  }

  return out;
}

export function filesFromFileList(fileList: FileList): DriveDroppedFile[] {
  const out: DriveDroppedFile[] = [];
  for (let i = 0; i < fileList.length; i += 1) {
    const file = fileList[i];
    if (!file || !file.size) continue;
    const relativeRaw = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
    const relative =
      typeof relativeRaw === 'string' && relativeRaw
        ? relativeRaw.replace(/\\/g, '/')
        : file.name;
    out.push({ file, relativePath: relative });
  }
  return out;
}

/** PUT direto no S3 com URL assinada (sem timeout do axios). */
export function putFileToPresignedUrl(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress: UploadProgressCb,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.timeout = 0;
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
      else onProgress(e.loaded, file.size);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Falha ao enviar ao armazenamento (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Erro de rede ao enviar ao armazenamento'));
    xhr.onabort = () => reject(Object.assign(new Error('Upload cancelado'), { name: 'AbortError' }));
    xhr.ontimeout = () => reject(new Error('Tempo esgotado no envio'));

    const onAbort = () => xhr.abort();
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.send(file);
  });
}

/** Fallback: multipart pelo API (disco no servidor → S3), sem timeout. */
export function postFileViaApi(
  file: File,
  folderId: string | undefined,
  onProgress: UploadProgressCb,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file);
    if (folderId) form.append('folderId', folderId);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_BASE_URL}/drive/files`);
    xhr.timeout = 0;

    const token = getAuthToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
      else onProgress(e.loaded, file.size);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(parseErrorPayload(xhr.responseText)));
    };
    xhr.onerror = () => reject(new Error('Erro de rede no upload'));
    xhr.onabort = () => reject(Object.assign(new Error('Upload cancelado'), { name: 'AbortError' }));
    xhr.ontimeout = () => reject(new Error('Tempo esgotado no upload'));

    const onAbort = () => xhr.abort();
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.send(form);
  });
}

export function isAbortError(err: unknown): boolean {
  return (
    (err instanceof DOMException && err.name === 'AbortError') ||
    (err instanceof Error && err.name === 'AbortError') ||
    (err instanceof Error && /cancelad/i.test(err.message))
  );
}
