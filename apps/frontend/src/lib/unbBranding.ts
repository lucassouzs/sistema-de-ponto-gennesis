const UNB_BRANDING_STORAGE_KEY = 'gennesis-unb-branding';

function normalizeUnbLabel(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Centro de custo da UNB (nome ou código no cadastro do funcionário). */
export function isUnbCostCenter(costCenter: string | null | undefined): boolean {
  return isUnbRelatedLabel(costCenter);
}

/** Rótulo exatamente "UNB" (não "UNB - CAR", etc.). */
export function isExactUnbCostCenterLabel(label: string | null | undefined): boolean {
  if (!label?.trim()) return false;
  return normalizeUnbLabel(label) === 'UNB';
}

/** Contrato, centro de custo, polo ou qualquer rótulo ligado à UNB. */
export function isUnbRelatedLabel(label: string | null | undefined): boolean {
  if (!label?.trim()) return false;
  const normalized = normalizeUnbLabel(label);

  if (normalized === 'UNB') return true;
  // "UNB - DF", "UNB/Predial", "UNB Engenharia"
  if (/^UNB(\s|$|-|\/)/.test(normalized)) return true;
  // "Centro UNB", "CC-UNB", "Predial UNB" (token UNB, evita falso positivo tipo SUNBEAM)
  return /(^|[^A-Z0-9])UNB([^A-Z0-9]|$)/.test(normalized);
}

/**
 * ID do centro de custo "UNB" para travar filtros/formulários de usuário UNB.
 * Prefere o CC com nome/código exatamente "UNB".
 */
export function resolveLockedUnbCostCenterId(
  costCenters: Array<{ id: string; name?: string | null; code?: string | null }>,
  preferredIds: string[] = []
): string | null {
  if (costCenters.length === 0 && preferredIds.length === 0) return null;

  const preferredSet = preferredIds.length > 0 ? new Set(preferredIds) : null;
  const pool = preferredSet
    ? costCenters.filter((cc) => preferredSet.has(cc.id))
    : costCenters;
  const searchPool = pool.length > 0 ? pool : costCenters;

  const exact = searchPool.find(
    (cc) => isExactUnbCostCenterLabel(cc.name) || isExactUnbCostCenterLabel(cc.code)
  );
  if (exact) return exact.id;

  if (preferredIds[0]) return preferredIds[0];

  const related = searchPool.find(
    (cc) => isUnbRelatedLabel(cc.name) || isUnbRelatedLabel(cc.code)
  );
  return related?.id ?? null;
}

/** Usuário UNB (localStorage) ou contexto do documento (contrato/CC/OS). */
export function shouldUseUnbBranding(...labels: (string | null | undefined)[]): boolean {
  if (labels.some((label) => isUnbRelatedLabel(label))) return true;
  return readStoredUnbBranding();
}

/** Logos escuras para PDF em fundo branco (evita *branco* invisível). */
export function resolvePdfLogoCandidates(useUnbBranding: boolean): string[] {
  if (useUnbBranding) {
    return ['/predialpreto.png', '/predialbranco.png', '/logopv.png'];
  }
  return [
    process.env.NEXT_PUBLIC_OC_PDF_LOGO_URL,
    '/oc-pdf-logo.png',
    '/logopv.png',
    '/logo.png',
  ].filter(Boolean) as string[];
}

export function resolveBrandingLogoSrc(isDark: boolean, useUnbBranding: boolean): string {
  if (useUnbBranding) {
    return isDark ? '/predialbranco.png' : '/predialpreto.png';
  }
  return isDark ? '/logobranca.png' : '/logopv.png';
}

export function resolveBrandingLogoAlt(useUnbBranding: boolean): string {
  return useUnbBranding ? 'Predial Engenharia' : 'Gennesis Engenharia';
}

export type OcPdfCompanyHeader = {
  name: string;
  subtitle: string;
  address: string;
  phone: string;
  cnpj: string;
};

/** Emitente da OC no PDF — Gennesis ou Consórcio Predial (UNB). */
export function resolveOcPdfCompanyHeader(useUnbBranding: boolean): OcPdfCompanyHeader {
  if (useUnbBranding) {
    return {
      name: 'Consórcio Predial',
      subtitle: '',
      address: 'SOFN, QUADRA 4, CONJUNTO G, LOTE 07, SALA 66, ZONA INDUSTRIAL, BRASÍLIA, DF',
      phone: '',
      cnpj: '58.344.545/0001-03',
    };
  }
  return {
    name:
      process.env.NEXT_PUBLIC_OC_PDF_COMPANY_NAME || 'Gennesis Engenharia e Consultoria LTDA',
    subtitle: process.env.NEXT_PUBLIC_OC_PDF_COMPANY_SUBTITLE || 'Engenharia e Consultoria',
    address:
      process.env.NEXT_PUBLIC_OC_PDF_COMPANY_ADDRESS ||
      'SHIS QI 15, Sobreloja 55 — Lago Sul — Brasília/DF',
    phone: process.env.NEXT_PUBLIC_OC_PDF_COMPANY_PHONE || '',
    cnpj: process.env.NEXT_PUBLIC_OC_PDF_COMPANY_CNPJ || '17.851.596/0001-36',
  };
}

export function readStoredUnbBranding(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(UNB_BRANDING_STORAGE_KEY) === '1';
}

export function persistUnbBrandingFlag(isUnb: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(UNB_BRANDING_STORAGE_KEY, isUnb ? '1' : '0');
}

export function persistUnbBranding(costCenter: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  persistUnbBrandingFlag(isUnbCostCenter(costCenter));
}
