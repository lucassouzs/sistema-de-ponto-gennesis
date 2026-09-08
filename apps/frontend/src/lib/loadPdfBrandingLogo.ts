import {
  readStoredUnbBranding,
  resolvePdfLogoCandidates,
  shouldUseUnbBranding,
} from '@/lib/unbBranding';

export type PdfBrandingLogo = {
  dataUrl: string;
  wMm: number;
  hMm: number;
};

export type LoadPdfBrandingLogoOptions = {
  contextLabels?: (string | null | undefined)[];
  /**
   * Se true, ignora rótulos do documento e usa só o branding do usuário
   * (localStorage / centro de custo UNB). Relatórios multi-contrato devem usar isso.
   */
  userBrandingOnly?: boolean;
  /** Quando definido, força Gennesis (false) ou Predial/UNB (true), ignorando storage/rótulos. */
  forceUnbBranding?: boolean;
  maxW?: number;
  maxH?: number;
  extraCandidates?: string[];
};

/** Cache em memória — evita recarregar/converter a logo a cada PDF. */
const logoPromiseCache = new Map<string, Promise<PdfBrandingLogo | null>>();

function isLikelyWhiteOnlyLogo(src: string): boolean {
  return /branco|white/i.test(src);
}

function tryLoadImageAsDataUrl(
  src: string,
  maxW: number,
  maxH: number
): Promise<PdfBrandingLogo | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const mmPerPx = 25.4 / 96;
      const iw = img.naturalWidth * mmPerPx;
      const ih = img.naturalHeight * mmPerPx;
      const s = Math.min(maxW / iw, maxH / ih, 1);
      const wMm = iw * s;
      const hMm = ih * s;
      /** Escala no canvas ao tamanho do PDF — PNG full-res deixa toDataURL lento. */
      const outW = Math.max(1, Math.round(wMm / mmPerPx));
      const outH = Math.max(1, Math.round(hMm / mmPerPx));
      const c = document.createElement('canvas');
      c.width = outW;
      c.height = outH;
      const ctx = c.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, outW, outH);
      try {
        resolve({ dataUrl: c.toDataURL('image/png'), wMm, hMm });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    const url = src.startsWith('http')
      ? src
      : `${window.location.origin}${src.startsWith('/') ? src : `/${src}`}`;
    img.src = url;
  });
}

/**
 * Ordem de preferência (sequencial): o 1º que carregar vale.
 * Evita corrida em que predialbranco “vence” e some no PDF branco.
 */
async function loadPreferredLogo(
  candidates: string[],
  maxW: number,
  maxH: number
): Promise<PdfBrandingLogo | null> {
  const ordered = [
    ...candidates.filter((src) => !isLikelyWhiteOnlyLogo(src)),
    ...candidates.filter((src) => isLikelyWhiteOnlyLogo(src)),
  ];
  for (const src of ordered) {
    const loaded = await tryLoadImageAsDataUrl(src, maxW, maxH);
    if (loaded) return loaded;
  }
  return null;
}

/** Carrega logo Gennesis ou Predial (UNB) para PDFs no navegador. */
export async function loadPdfBrandingLogo(
  options: LoadPdfBrandingLogoOptions = {}
): Promise<PdfBrandingLogo | null> {
  const {
    contextLabels = [],
    userBrandingOnly = false,
    forceUnbBranding,
    maxW = 36,
    maxH = 22,
    extraCandidates = [],
  } = options;
  const useUnb =
    typeof forceUnbBranding === 'boolean'
      ? forceUnbBranding
      : userBrandingOnly
        ? readStoredUnbBranding()
        : shouldUseUnbBranding(...contextLabels);
  const candidates = [...extraCandidates, ...resolvePdfLogoCandidates(useUnb)];
  const cacheKey = `v2|${useUnb ? 'unb' : 'gen'}|${maxW}x${maxH}|${candidates.join(',')}`;

  let cached = logoPromiseCache.get(cacheKey);
  if (!cached) {
    cached = loadPreferredLogo(candidates, maxW, maxH);
    logoPromiseCache.set(cacheKey, cached);
  }
  return cached;
}

/** Atalho para PDFs que só precisam do data URL (tamanho fixo no jsPDF). */
export async function loadPdfBrandingLogoDataUrl(
  options: LoadPdfBrandingLogoOptions = {}
): Promise<string | null> {
  const logo = await loadPdfBrandingLogo(options);
  return logo?.dataUrl ?? null;
}
