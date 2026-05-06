/**
 * Exibe OS/SE com Nº pasta quando existir: "OS 10 - 1".
 * Sem pasta: apenas "OS 10" (prefixo OS se o valor não começar já por OS ou SE).
 */
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

export function formatOsSePastaOrDash(
  divSe: string | null | undefined,
  folderNumber: string | null | undefined
): string {
  const s = formatOsSePasta(divSe, folderNumber);
  return s || '—';
}

/** Primeira pasta encontrada para o mesmo OS/SE (ex.: exibir faturamento com pasta). */
export function folderForDivSe(
  pleitos: Array<{ divSe: string | null; folderNumber: string | null }>,
  divSe: string | null | undefined
): string | null {
  const key = (divSe || '').trim().toLowerCase();
  if (!key) return null;
  const found = pleitos.find((p) => (p.divSe || '').trim().toLowerCase() === key);
  return found?.folderNumber?.trim() || null;
}

export type DivSeOptionRow = { divSe: string; folderNumber: string | null };

/**
 * Junta a lista global (`/pleitos/divse-list`) com as OS do contrato e,
 * quando a pasta não veio na API, preenche a partir dos pleitos do contrato.
 * Assim as listas suspensas mostram "OS x - pasta" sempre que existir no contrato.
 */
export function enrichDivSeOptionsWithPleitos(
  base: DivSeOptionRow[],
  pleitos: Array<{ divSe: string | null; folderNumber: string | null }>
): DivSeOptionRow[] {
  const seen = new Set<string>();
  const out: DivSeOptionRow[] = [];
  const add = (divSe: string, folderNumber: string | null) => {
    const d = divSe.trim();
    if (!d) return;
    const f = folderNumber?.trim() || null;
    const key = `${d}\0${f ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ divSe: d, folderNumber: f });
  };
  for (const o of base) {
    add(o.divSe, o.folderNumber);
  }
  for (const p of pleitos) {
    add(p.divSe || '', p.folderNumber);
  }
  out.sort(
    (a, b) =>
      a.divSe.localeCompare(b.divSe, 'pt-BR') ||
      (a.folderNumber || '').localeCompare(b.folderNumber || '', 'pt-BR')
  );
  const filled = out.map((opt) => {
    if (opt.folderNumber?.trim()) return opt;
    const pasta = folderForDivSe(pleitos, opt.divSe);
    return pasta ? { ...opt, folderNumber: pasta } : opt;
  });
  const seenFinal = new Set<string>();
  const deduped: DivSeOptionRow[] = [];
  for (const o of filled) {
    const k = `${o.divSe}\0${o.folderNumber ?? ''}`;
    if (seenFinal.has(k)) continue;
    seenFinal.add(k);
    deduped.push(o);
  }
  return deduped;
}
