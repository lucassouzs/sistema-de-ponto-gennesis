/** Número curto exibido na coluna RM da listagem (`REQ-2026-008` → `8`). */
export function formatRmListDisplayId(requestNumber?: string | null): string {
  const trimmed = String(requestNumber ?? '').trim();
  if (!trimmed) return '—';

  const match = trimmed.match(/^REQ-\d{4}-(\d+)$/i);
  if (match) return String(parseInt(match[1], 10));

  const lastSegment = trimmed.split('-').pop();
  if (lastSegment && /^\d+$/.test(lastSegment)) {
    return String(parseInt(lastSegment, 10));
  }

  return trimmed;
}
