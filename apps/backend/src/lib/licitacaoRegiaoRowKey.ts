import { createHash } from 'crypto';

export function buildLicitacaoRegiaoRowKey(
  regiaoKey: string,
  spreadsheetId: string,
  row: string[]
): string {
  const normalized = row.map((cell) =>
    cell
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
  const payload = [regiaoKey.trim().toLowerCase(), spreadsheetId.trim(), ...normalized].join(
    '\u001f'
  );
  return createHash('sha256').update(payload).digest('hex');
}
