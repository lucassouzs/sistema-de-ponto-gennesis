/**
 * Multer/busboy costuma interpretar bytes UTF-8 do filename como Latin-1,
 * gerando nomes como "CONSÃRCIO" / "ORÃAMENTO" / "RemoÃ§Ã£o".
 * Corrige quando o padrão de mojibake é detectado.
 */
export function fixMulterOriginalName(name: string | null | undefined): string {
  const raw = String(name ?? '').trim();
  if (!raw) return '';

  // Já parece UTF-8 válido sem marcas típicas de mojibake.
  if (!/[ÃÂ]/.test(raw)) return raw;

  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (!decoded || decoded.includes('\uFFFD')) return raw;

    // Round-trip: se latin1→utf8→latin1 recupera o original, a correção é segura.
    const roundTrip = Buffer.from(decoded, 'utf8').toString('latin1');
    if (roundTrip === raw) return decoded;

    // Fallback: se o decodificado removeu os Ã/Â típicos, preferir o decodificado.
    if (!/[ÃÂ]/.test(decoded) && /[ÃÂ]/.test(raw)) return decoded;

    return raw;
  } catch {
    return raw;
  }
}
