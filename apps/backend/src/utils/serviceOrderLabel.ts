/** Marcador de pleito histórico gerado automaticamente — não usar como rótulo principal da OS. */
export const PLEITO_HISTORICO_MARKER = '__PLEITO_HISTORICO__';

export function formatOsSePasta(
  divSe: string | null | undefined,
  folderNumber: string | null | undefined
): string {
  const d = (divSe || '').trim();
  if (!d) return '';
  const pasta = (folderNumber || '').trim();
  const osPart = /^(OS|SE)\s/i.test(d) ? d : `OS ${d}`;
  if (pasta) return `${osPart} - ${pasta}`;
  return osPart;
}

export function serviceOrderFallbackLabel(numero: number, ano: number): string {
  return `OS ${numero}/${ano}`;
}

export function pickPleitoLabelSource<
  T extends { divSe: string | null; folderNumber: string | null; reportsBilling: string | null }
>(pleitos: T[]): T | null {
  const main = pleitos.find(
    (p) =>
      (p.divSe || '').trim() &&
      !(p.reportsBilling || '').trim().startsWith(PLEITO_HISTORICO_MARKER)
  );
  if (main) return main;
  const any = pleitos.find((p) => (p.divSe || '').trim());
  return any ?? null;
}

export function buildServiceOrderDisplayLabel(
  numero: number,
  ano: number,
  pleitos: Array<{ divSe: string | null; folderNumber: string | null; reportsBilling: string | null }>
): string {
  const src = pickPleitoLabelSource(pleitos);
  if (src) {
    const label = formatOsSePasta(src.divSe, src.folderNumber);
    if (label) return label;
  }
  return serviceOrderFallbackLabel(numero, ano);
}
