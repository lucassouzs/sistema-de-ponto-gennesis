export type OcCorrectionInfo = {
  reason: string;
  byRole: string | null;
  byName: string | null;
  at: string | null;
  kind: 'oc' | 'proof';
};

function parseCorrectionBlock(block: string): OcCorrectionInfo | null {
  const trimmed = block.trim();
  if (!trimmed) return null;

  const newOc = trimmed.match(
    /^\[Correção OC — (.+?) em (.+?)(?: — (.+?))?\]\s*\n([\s\S]+)$/
  );
  if (newOc) {
    return {
      kind: 'oc',
      byRole: newOc[1]?.trim() || null,
      at: newOc[2]?.trim() || null,
      byName: newOc[3]?.trim() || null,
      reason: newOc[4]?.trim() || '',
    };
  }

  const newProof = trimmed.match(
    /^\[Correção comprovante — (.+?) em (.+?)(?: — (.+?))?\]\s*\n([\s\S]+)$/
  );
  if (newProof) {
    return {
      kind: 'proof',
      byRole: newProof[1]?.trim() || null,
      at: newProof[2]?.trim() || null,
      byName: newProof[3]?.trim() || null,
      reason: newProof[4]?.trim() || '',
    };
  }

  const legacyOc = trimmed.match(/^\[Correção OC[^\]]*\]\s*([\s\S]+)$/);
  if (legacyOc) {
    return {
      kind: 'oc',
      byRole: null,
      byName: null,
      at: null,
      reason: legacyOc[1]?.trim() || '',
    };
  }

  const legacyProof = trimmed.match(/^\[Correção comprovante[^\]]*\]\s*([\s\S]+)$/);
  if (legacyProof) {
    return {
      kind: 'proof',
      byRole: null,
      byName: null,
      at: null,
      reason: legacyProof[1]?.trim() || '',
    };
  }

  return null;
}

/** Último bloco de correção da OC (fluxo de aprovação ou comprovante). */
export function parseLastOcCorrectionInfo(notes?: string | null): OcCorrectionInfo | null {
  if (!notes?.trim()) return null;
  const blocks = notes.split(/\n\n+/);
  for (let i = blocks.length - 1; i >= 0; i--) {
    const parsed = parseCorrectionBlock(blocks[i]);
    if (parsed?.reason) return parsed;
  }
  return null;
}

export function formatOcCorrectionAuthor(info: OcCorrectionInfo): string | null {
  const parts: string[] = [];
  if (info.byRole) parts.push(info.byRole);
  if (info.byName) parts.push(info.byName);
  if (parts.length === 0) return null;
  return parts.join(' · ');
}
