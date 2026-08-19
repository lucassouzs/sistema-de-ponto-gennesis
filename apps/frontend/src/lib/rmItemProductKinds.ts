export type RmItemProductKind = 'Materiais' | 'Serviços';

function normalizeRmItemProductKindSet(
  kinds?: Array<RmItemProductKind | string> | null
): Set<RmItemProductKind> {
  return new Set(
    (kinds ?? [])
      .map((k) => String(k || '').trim())
      .filter((k): k is RmItemProductKind => k === 'Materiais' || k === 'Serviços')
  );
}

/** Rótulo da coluna Tipo na listagem de RMs. */
export function formatRmItemProductKinds(
  kinds?: Array<RmItemProductKind | string> | null
): string {
  const set = normalizeRmItemProductKindSet(kinds);
  if (set.has('Materiais') && set.has('Serviços')) return 'Materiais e Serviços';
  if (set.has('Materiais')) return 'Materiais';
  if (set.has('Serviços')) return 'Serviços';
  return '—';
}

/** Rótulo curto Produto/Serviço (ex.: aprovações). */
export function formatRmItemProductKindShortLabel(
  kinds?: Array<RmItemProductKind | string> | null
): string {
  const set = normalizeRmItemProductKindSet(kinds);
  if (set.has('Materiais') && set.has('Serviços')) return 'Produto e Serviço';
  if (set.has('Materiais')) return 'Produto';
  if (set.has('Serviços')) return 'Serviço';
  return '—';
}

export function rmItemLineTotal(item: {
  quantity: number;
  unitPrice?: number | null;
  totalPrice?: number | null;
}): number | null {
  const totalFromDb = Number(item.totalPrice);
  if (Number.isFinite(totalFromDb) && totalFromDb >= 0) return totalFromDb;
  const qty = Number(item.quantity);
  const unit = Number(item.unitPrice);
  if (Number.isFinite(qty) && Number.isFinite(unit) && qty > 0 && unit >= 0) {
    return qty * unit;
  }
  return null;
}
