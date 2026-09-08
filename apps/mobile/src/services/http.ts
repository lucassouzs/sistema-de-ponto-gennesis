/** Lê JSON e lança se a resposta não for ok. */
export async function readApiJson<T = any>(res: globalThis.Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (typeof json?.message === 'string' && json.message) ||
      (typeof json?.error === 'string' && json.error) ||
      `Erro HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json as T;
}

export async function readApiData<T>(res: globalThis.Response): Promise<T> {
  const json = await readApiJson<{ data?: T; message?: string }>(res);
  return json.data as T;
}
