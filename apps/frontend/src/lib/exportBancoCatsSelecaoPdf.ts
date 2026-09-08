import jsPDF from 'jspdf';
import { loadPdfBrandingLogo } from '@/lib/loadPdfBrandingLogo';

export type BancoCatsPdfServico = {
  empresa: string;
  descricao: string;
  und: string;
  quant: string;
  fonte?: string;
};

export type BancoCatsPdfQuadrante = {
  index: number;
  query: string;
  somaQuant: number;
  somaQuantFormatada: string;
  servicos: BancoCatsPdfServico[];
};

export type ExportBancoCatsSelecaoPdfInput = {
  quadrantes: BancoCatsPdfQuadrante[];
  generatedAt?: Date;
};

const BRAND_RED: [number, number, number] = [185, 28, 28];
const HEADER_BG: [number, number, number] = [248, 249, 250];
const SECTION_BG: [number, number, number] = [241, 245, 249];
const ROW_ALT: [number, number, number] = [249, 250, 251];
const BORDER: [number, number, number] = [209, 213, 219];
const TEXT_BLACK: [number, number, number] = [17, 24, 39];
const TEXT_MUTED: [number, number, number] = [75, 85, 99];
const TEXT_GREEN: [number, number, number] = [22, 101, 52];

const COMPANY = 'Gennesis Engenharia e Consultoria LTDA';
const FOOTER_RESERVE = 14;
const MARGIN = 14;

function getPageBottom(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight() - MARGIN - FOOTER_RESERVE;
}

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  if (y + need > getPageBottom(doc)) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function drawFooters(doc: jsPDF, generatedAt: Date) {
  const pageCount = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const dateStr = generatedAt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.line(MARGIN, pageHeight - MARGIN - 8, pageWidth - MARGIN, pageHeight - MARGIN - 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Banco CAT's — Seleção de serviços · ${dateStr}`, MARGIN, pageHeight - MARGIN - 3);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - MARGIN, pageHeight - MARGIN - 3, {
      align: 'right',
    });
  }
}

function drawHeader(doc: jsPDF, logo: Awaited<ReturnType<typeof loadPdfBrandingLogo>>, generatedAt: Date): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const headerH = 26;

  doc.setFillColor(...HEADER_BG);
  doc.rect(0, 0, pageWidth, headerH, 'F');
  doc.setFillColor(...BRAND_RED);
  doc.rect(0, headerH - 1, pageWidth, 1, 'F');

  let textX = MARGIN;
  if (logo) {
    doc.addImage(logo.dataUrl, 'PNG', MARGIN, 4, logo.wMm, logo.hMm);
    textX = MARGIN + logo.wMm + 5;
  }

  doc.setTextColor(...TEXT_BLACK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text("Banco CAT's — Serviços selecionados", textX, 11);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(COMPANY, textX, 17);

  const dateStr = generatedAt.toLocaleDateString('pt-BR');
  const timeStr = generatedAt.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  doc.text(`Gerado em ${dateStr} às ${timeStr}`, pageWidth - MARGIN, 11, { align: 'right' });

  return headerH + 8;
}

export async function exportBancoCatsSelecaoPdf(
  input: ExportBancoCatsSelecaoPdfInput
): Promise<void> {
  const quadrantes = input.quadrantes.filter((q) => q.servicos.length > 0);
  if (quadrantes.length === 0) {
    throw new Error('Nenhum serviço marcado para exportar.');
  }

  const generatedAt = input.generatedAt ?? new Date();
  const logo = await loadPdfBrandingLogo({ maxW: 32, maxH: 18 });
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentW = pageWidth - MARGIN * 2;

  let y = drawHeader(doc, logo, generatedAt);

  const totalItens = quadrantes.reduce((sum, q) => sum + q.servicos.length, 0);
  const somaGeral = quadrantes.reduce((sum, q) => sum + q.somaQuant, 0);
  const somaGeralFmt = somaGeral.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });

  y = ensureSpace(doc, y, 14);
  doc.setFillColor(236, 253, 245);
  doc.setDrawColor(167, 243, 208);
  doc.roundedRect(MARGIN, y, contentW, 12, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...TEXT_GREEN);
  doc.text(
    `${quadrantes.length} quadrante(s) · ${totalItens} serviço(s) marcado(s) · Soma geral QUANT.: ${somaGeralFmt}`,
    MARGIN + 4,
    y + 7.5
  );
  y += 18;

  const colEmpresa = 22;
  const colUnd = 14;
  const colQuant = 20;
  const colDesc = contentW - colEmpresa - colUnd - colQuant;

  for (const quadrante of quadrantes) {
    const queryLines = doc.splitTextToSize(
      quadrante.query.trim() || '—',
      contentW - 8
    ) as string[];
    const queryBlockH = Math.min(queryLines.length, 4) * 4 + 4;
    const headerBlockH = 10 + queryBlockH + 8;

    y = ensureSpace(doc, y, headerBlockH + 20);

    doc.setFillColor(...SECTION_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(MARGIN, y, contentW, headerBlockH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...TEXT_BLACK);
    doc.text(`Serviço ${quadrante.index}`, MARGIN + 4, y + 6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_GREEN);
    doc.text(
      `Soma QUANT.: ${quadrante.somaQuantFormatada} (${quadrante.servicos.length})`,
      pageWidth - MARGIN - 4,
      y + 6,
      { align: 'right' }
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    let qy = y + 11;
    for (const line of queryLines.slice(0, 4)) {
      doc.text(line, MARGIN + 4, qy);
      qy += 4;
    }
    if (queryLines.length > 4) {
      doc.text('…', MARGIN + 4, qy);
    }

    y += headerBlockH + 3;

    // cabeçalho da tabela
    y = ensureSpace(doc, y, 8);
    doc.setFillColor(243, 244, 246);
    doc.rect(MARGIN, y, contentW, 7, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    let x = MARGIN + 1.5;
    doc.text('EMPRESA', x, y + 4.8);
    x += colEmpresa;
    doc.text('DESCRIÇÃO / FONTE', x, y + 4.8);
    x += colDesc;
    doc.text('UND', x, y + 4.8);
    x += colUnd;
    doc.text('QUANT.', x, y + 4.8);
    y += 8;

    for (let i = 0; i < quadrante.servicos.length; i += 1) {
      const item = quadrante.servicos[i];
      const empresaLines = doc.splitTextToSize(item.empresa || '—', colEmpresa - 2) as string[];
      const descLines = doc.splitTextToSize(item.descricao || '—', colDesc - 2) as string[];
      const fonteLines = doc.splitTextToSize(
        `FONTE: ${item.fonte?.trim() || '—'}`,
        colDesc - 2
      ) as string[];
      const undLines = doc.splitTextToSize(item.und || '—', colUnd - 2) as string[];
      const quantLines = doc.splitTextToSize(item.quant || '—', colQuant - 2) as string[];
      const descBlockLines = [...descLines, ...fonteLines];
      const maxLines = Math.max(
        empresaLines.length,
        descBlockLines.length,
        undLines.length,
        quantLines.length,
        1
      );
      const rowH = Math.max(7, maxLines * 3.8 + 3);

      y = ensureSpace(doc, y, rowH + 1);
      if (i % 2 === 1) {
        doc.setFillColor(...ROW_ALT);
        doc.rect(MARGIN, y, contentW, rowH, 'F');
      }

      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.line(MARGIN, y + rowH, MARGIN + contentW, y + rowH);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...TEXT_BLACK);

      const textTop = y + 4.2;
      let cx = MARGIN + 1.5;
      for (let li = 0; li < empresaLines.length; li += 1) {
        doc.text(empresaLines[li], cx, textTop + li * 3.8);
      }
      cx += colEmpresa;
      for (let li = 0; li < descLines.length; li += 1) {
        doc.text(descLines[li], cx, textTop + li * 3.8);
      }
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BRAND_RED);
      for (let li = 0; li < fonteLines.length; li += 1) {
        doc.text(fonteLines[li], cx, textTop + (descLines.length + li) * 3.8);
      }
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...TEXT_BLACK);
      cx += colDesc;
      for (let li = 0; li < undLines.length; li += 1) {
        doc.text(undLines[li], cx, textTop + li * 3.8);
      }
      cx += colUnd;
      doc.setFont('helvetica', 'bold');
      for (let li = 0; li < quantLines.length; li += 1) {
        doc.text(quantLines[li], cx, textTop + li * 3.8);
      }

      y += rowH;
    }

    y = ensureSpace(doc, y, 12);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TEXT_GREEN);
    doc.text(
      `Soma QUANT. do quadrante: ${quadrante.somaQuantFormatada}`,
      pageWidth - MARGIN,
      y + 5,
      { align: 'right' }
    );
    y += 14;
  }

  drawFooters(doc, generatedAt);

  const stamp = generatedAt.toISOString().slice(0, 10);
  doc.save(`banco-cats-selecao-${stamp}.pdf`);
}
