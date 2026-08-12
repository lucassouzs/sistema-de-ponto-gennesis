/**
 * Corrige nomes de arquivo com mojibake (UTF-8 lido como Latin-1),
 * ex.: "CONSÃRCIO" → "CONSÓRCIO", "RemoÃ§Ã£o" → "Remoção".
 * Seguro para nomes já corretos.
 */
export function fixMojibakeFileName(name: string | null | undefined): string {
  const raw = String(name ?? '').trim();
  if (!raw) return '';
  if (!/[ÃÂ]/.test(raw)) return raw;

  try {
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      bytes[i] = raw.charCodeAt(i) & 0xff;
    }
    const decoded = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    if (!decoded || decoded.includes('\uFFFD')) return raw;
    if (!/[ÃÂ]/.test(decoded) && /[ÃÂ]/.test(raw)) return decoded;
    return decoded;
  } catch {
    return raw;
  }
}
