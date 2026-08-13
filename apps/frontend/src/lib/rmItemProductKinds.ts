export type RmItemProductKind = 'Materiais' | 'Serviços';

/** Rótulo da coluna Tipo na listagem de RMs. */
export function formatRmItemProductKinds(
  kinds?: Array<RmItemProductKind | string> | null
): string {
  const set = new Set(
    (kinds ?? [])
      .map((k) => String(k || '').trim())
      .filter((k): k is RmItemProductKind => k === 'Materiais' || k === 'Serviços')
  );
  if (set.has('Materiais') && set.has('Serviços')) return 'Materiais e Serviços';
  if (set.has('Materiais')) return 'Materiais';
  if (set.has('Serviços')) return 'Serviços';
  return '—';
}
