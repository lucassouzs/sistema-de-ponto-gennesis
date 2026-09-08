/** Chave canônica para unicidade do número da NF (ignora espaços, pontos, traços e barras). */
export function normalizeNfNumberKey(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .replace(/[\s.\-\/_]/g, '')
    .toUpperCase();
}

export function isValidNfNumber(raw: string | null | undefined): boolean {
  return normalizeNfNumberKey(raw).length > 0;
}
