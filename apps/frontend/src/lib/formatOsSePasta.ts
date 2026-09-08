/**
 * Exibe OS/SE com Nº pasta quando existir: "AD-725 - 1".
 * Sem pasta: apenas o código (ex.: "AD-725"), sem prefixo "OS"/"SE".
 */
/** Exibe rótulo de OS/SE sem duplicar o prefixo (ex.: evita "OS OS 9030"). */
export function ensureOsSePrefix(label: string | null | undefined): string {
  const d = (label || '').trim();
  if (!d) return '';
  return /^(OS|SE)\s/i.test(d) ? d : `OS ${d}`;
}

/** Remove prefixo "OS "/"SE " para exibição em listas. */
export function stripOsSePrefix(label: string | null | undefined): string {
  return (label || '').trim().replace(/^(OS|SE)\s+/i, '').trim();
}

export function formatOsSePasta(
  divSe: string | null | undefined,
  folderNumber: string | null | undefined
): string {
  const d = stripOsSePrefix(divSe);
  if (!d) return '';
  const pasta = (folderNumber || '').trim();
  if (pasta) return `${d} - ${pasta}`;
  return d;
}

export function formatOsSePastaOrDash(
  divSe: string | null | undefined,
  folderNumber: string | null | undefined
): string {
  const s = formatOsSePasta(divSe, folderNumber);
  return s || '—';
}

/** Partes para ordenação natural: AD-4 < AD-42 < AD-402. */
export function parseOsSeSortParts(divSe: string | null | undefined): {
  prefix: string;
  num: number;
  rest: string;
} {
  const s = stripOsSePrefix(divSe);
  const m = s.match(/^([A-Za-zÀ-ÿ]+)?[-_\s]*(\d+)(.*)$/);
  if (m) {
    return {
      prefix: (m[1] || '').toLowerCase(),
      num: parseInt(m[2], 10),
      rest: (m[3] || '').trim().toLowerCase(),
    };
  }
  return { prefix: s.toLowerCase(), num: Number.POSITIVE_INFINITY, rest: '' };
}

export function compareOsSeNatural(
  a: string | null | undefined,
  b: string | null | undefined
): number {
  const pa = parseOsSeSortParts(a);
  const pb = parseOsSeSortParts(b);
  if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix, 'pt-BR');
  if (pa.num !== pb.num) return pa.num - pb.num;
  if (pa.rest !== pb.rest) return pa.rest.localeCompare(pb.rest, 'pt-BR');
  return stripOsSePrefix(a).localeCompare(stripOsSePrefix(b), 'pt-BR', { numeric: true });
}

/**
 * Quanto menor, melhor o match na busca por OS.
 * Ex.: "ad-4" → AD-4 (exato) antes de AD-45 / AD-402.
 */
export function osSeSearchRank(divSe: string | null | undefined, rawQuery: string): number {
  const q = stripOsSePrefix(rawQuery).toLowerCase();
  if (!q) return 0;
  const id = stripOsSePrefix(divSe).toLowerCase();
  if (!id) return 5000;
  if (id === q) return 0;
  if (id.startsWith(q)) return 1 + (id.length - q.length);
  const idx = id.indexOf(q);
  if (idx >= 0) return 1000 + idx;
  return 5000;
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
 * Assim as listas suspensas mostram "AD-725 - pasta" sempre que existir no contrato.
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
