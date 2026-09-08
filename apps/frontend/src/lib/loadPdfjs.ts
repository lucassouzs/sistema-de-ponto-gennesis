/**
 * Carrega pdfjs sem passar pelo bundler.
 * Turbopack/Next 14 quebra ao analisar o import dinamico do workerSrc em pdfjs-dist.
 * Os arquivos ficam em /public/pdfjs/.
 */
export type PdfjsModule = {
  version: string;
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<PdfjsDocument> };
};

type PdfjsDocument = {
  getPage: (pageNumber: number) => Promise<PdfjsPage>;
};

type PdfjsPage = {
  getViewport: (params: { scale: number }) => { width: number; height: number };
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};

declare global {
  interface Window {
    __gennesisPdfjsPromise?: Promise<PdfjsModule>;
  }
}

export async function loadPdfjs(): Promise<PdfjsModule> {
  if (typeof window === 'undefined') {
    throw new Error('pdfjs só pode ser carregado no browser');
  }

  if (!window.__gennesisPdfjsPromise) {
    window.__gennesisPdfjsPromise = (async () => {
      // Impede análise estática do Turbopack (não use import() direto de URL).
      const dynamicImport = new Function('u', 'return import(u)') as (
        url: string
      ) => Promise<PdfjsModule>;
      const pdfjs = await dynamicImport('/pdfjs/pdf.min.mjs');
      pdfjs.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      return pdfjs;
    })();
  }

  return window.__gennesisPdfjsPromise;
}
