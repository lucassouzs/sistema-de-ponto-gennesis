/** Notas fiscais ignoradas no somatório de valor bruto, por aba do Controle de NF's. */
export const NFS_TAB_EXCLUDED_NOTA_NUMBERS: Record<string, readonly string[]> = {
  'capitania-fluvial': ['3577']
};

export function normalizeNotaFiscalNumber(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^\d]/g, '');
}

export function isExcludedNotaForTab(tabKey: string | undefined, notaNumber: string): boolean {
  if (!tabKey) return false;
  const excluded = NFS_TAB_EXCLUDED_NOTA_NUMBERS[tabKey];
  if (!excluded?.length) return false;

  const normalizedNota = normalizeNotaFiscalNumber(notaNumber);
  if (!normalizedNota) return false;

  return excluded.some((candidate) => normalizeNotaFiscalNumber(candidate) === normalizedNota);
}
