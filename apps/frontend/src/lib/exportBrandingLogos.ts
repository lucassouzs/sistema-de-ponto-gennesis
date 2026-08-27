import { loadPdfBrandingLogoDataUrl } from '@/lib/loadPdfBrandingLogo';

export const EXPORT_COMPANY = 'Gennesis Engenharia e Consultoria LTDA';
export const LOGO_MAX_H_PX = 48;
export const LOGO_GAP_PX = 12;

export type ExcelLogoStrip = {
  base64: string;
  extension: 'png' | 'jpeg';
  widthPx: number;
  heightPx: number;
};

export type PdfLogoStrip = {
  dataUrl: string;
  wMm: number;
  hMm: number;
};

type LoadedLogo = {
  bitmap: ImageBitmap;
  widthPx: number;
  heightPx: number;
};

function knockOutNearBlack(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 28 && d[i + 1] < 28 && d[i + 2] < 28) d[i + 3] = 0;
  }
  ctx.putImageData(imageData, 0, 0);
}

function loadImageElement(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    const url = src.startsWith('http')
      ? src
      : `${window.location.origin}${src.startsWith('/') ? src : `/${src}`}`;
    img.src = url;
  });
}

async function scaleImageToLogo(
  img: HTMLImageElement,
  maxHPx: number,
  knockOutBlack = false
): Promise<LoadedLogo | null> {
  if (!img.naturalWidth || !img.naturalHeight) return null;
  const scale = Math.min(1, maxHPx / img.naturalHeight);
  const widthPx = Math.max(1, Math.round(img.naturalWidth * scale));
  const heightPx = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, widthPx, heightPx);
  if (knockOutBlack) knockOutNearBlack(ctx, widthPx, heightPx);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), 'image/png')
  );
  if (!blob) return null;
  const bitmap = await createImageBitmap(blob);
  return { bitmap, widthPx, heightPx };
}

async function loadGennesisLogo(maxHPx: number): Promise<LoadedLogo | null> {
  const dataUrl = await loadPdfBrandingLogoDataUrl({
    maxW: 48,
    maxH: 28,
    userBrandingOnly: true,
  });
  if (dataUrl) {
    const img = await new Promise<HTMLImageElement | null>((resolve) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => resolve(null);
      el.src = dataUrl;
    });
    if (img) return scaleImageToLogo(img, maxHPx);
  }
  for (const src of ['/logopv.png', '/logo.png', '/oc-pdf-logo.png']) {
    const img = await loadImageElement(src);
    if (!img) continue;
    const logo = await scaleImageToLogo(img, maxHPx);
    if (logo) return logo;
  }
  return null;
}

async function loadEngPacLogo(maxHPx: number): Promise<LoadedLogo | null> {
  const img = await loadImageElement('/logo-engpac.png');
  if (!img) return null;
  return scaleImageToLogo(img, maxHPx, true);
}

async function loadDualLogos(maxHPx = LOGO_MAX_H_PX): Promise<LoadedLogo[]> {
  const logos: LoadedLogo[] = [];
  const gennesis = await loadGennesisLogo(maxHPx);
  if (gennesis) logos.push(gennesis);
  const engPac = await loadEngPacLogo(maxHPx);
  if (engPac) logos.push(engPac);
  return logos;
}

function composeHorizontal(logos: LoadedLogo[]): {
  canvas: HTMLCanvasElement;
  widthPx: number;
  heightPx: number;
} | null {
  if (!logos.length) return null;
  const heightPx = Math.max(...logos.map((l) => l.heightPx));
  const widthPx =
    logos.reduce((sum, l) => sum + l.widthPx, 0) + Math.max(0, logos.length - 1) * LOGO_GAP_PX;
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let x = 0;
  for (const logo of logos) {
    const y = Math.round((heightPx - logo.heightPx) / 2);
    ctx.drawImage(logo.bitmap, x, y, logo.widthPx, logo.heightPx);
    x += logo.widthPx + LOGO_GAP_PX;
  }
  return { canvas, widthPx, heightPx };
}

/** Faixa Gennesis + ENG PAC lado a lado para Excel (uma única imagem). */
export async function loadExcelDualLogoStrip(
  maxHPx = LOGO_MAX_H_PX
): Promise<ExcelLogoStrip | null> {
  const logos = await loadDualLogos(maxHPx);
  const composed = composeHorizontal(logos);
  logos.forEach((l) => l.bitmap.close());
  if (!composed) return null;
  const dataUrl = composed.canvas.toDataURL('image/png');
  const match = dataUrl.match(/^data:image\/png;base64,(.+)$/i);
  if (!match) return null;
  return {
    base64: match[1],
    extension: 'png',
    widthPx: composed.widthPx,
    heightPx: composed.heightPx,
  };
}

/** Faixa Gennesis + ENG PAC lado a lado para PDF (mm). */
export async function loadPdfDualLogoStrip(maxHMm = 16): Promise<PdfLogoStrip | null> {
  const maxHPx = Math.round((maxHMm * 96) / 25.4);
  const logos = await loadDualLogos(maxHPx);
  const composed = composeHorizontal(logos);
  logos.forEach((l) => l.bitmap.close());
  if (!composed) return null;
  const dataUrl = composed.canvas.toDataURL('image/png');
  const mmPerPx = 25.4 / 96;
  return {
    dataUrl,
    wMm: composed.widthPx * mmPerPx,
    hMm: composed.heightPx * mmPerPx,
  };
}
