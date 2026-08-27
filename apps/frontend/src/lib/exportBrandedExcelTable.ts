import ExcelJS from 'exceljs';
import {
  EXPORT_COMPANY,
  loadExcelDualLogoStrip,
  type ExcelLogoStrip,
} from '@/lib/exportBrandingLogos';

const BRAND_RED = 'FFB91C1C';
const HEADER_BG = 'FFF8F9FA';
const TITLE_TEXT = 'FF111827';
const MUTED_TEXT = 'FF4B5563';
const BORDER = 'FFD1D5DB';
const ROW_ALT = 'FFF9FAFB';
const WHITE = 'FFFFFFFF';
const GREEN_BG = 'FFDCFCE7';
const GREEN_FG = 'FF166534';
const AMBER_BG = 'FFFEF3C7';
const AMBER_FG = 'FF92400E';
const RED_BG = 'FFFEE2E2';
const RED_FG = 'FF991B1B';
const GRAY_BG = 'FFF3F4F6';
const GRAY_FG = 'FF4B5563';

export type BrandedExcelColumn = {
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  statusTone?: boolean;
};

export type ExportBrandedExcelOptions = {
  title: string;
  subtitle?: string;
  sheetName: string;
  filename: string;
  columns: BrandedExcelColumn[];
  rows: (string | number)[][];
};

function statusStyle(value: string): { bg: string; fg: string } | null {
  const v = value.trim().toUpperCase();
  if (['ATIVO', 'PAGO', 'SIM'].includes(v)) return { bg: GREEN_BG, fg: GREEN_FG };
  if (['PENDENTE', 'EM_ABERTA', 'EM ABERTO', 'NAO', 'NÃO'].includes(v)) {
    return { bg: AMBER_BG, fg: AMBER_FG };
  }
  if (['VENCIDO', 'VENCIDA', 'BAIXADA', 'INATIVO'].includes(v)) {
    return { bg: RED_BG, fg: RED_FG };
  }
  if (!v) return null;
  return { bg: GRAY_BG, fg: GRAY_FG };
}

function applyThinBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: 'thin', color: { argb: BORDER } },
    left: { style: 'thin', color: { argb: BORDER } },
    bottom: { style: 'thin', color: { argb: BORDER } },
    right: { style: 'thin', color: { argb: BORDER } },
  };
}

function placeLogoStrip(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  strip: ExcelLogoStrip
) {
  const imageId = workbook.addImage({
    base64: strip.base64,
    extension: strip.extension,
  });
  sheet.addImage(imageId, {
    tl: { col: 0.1, row: 0.25 },
    ext: { width: strip.widthPx, height: strip.heightPx },
    editAs: 'absolute',
  });
}

/**
 * Excel estilizado Gennesis: logos (Gennesis+ENG PAC) à esquerda, faixa vermelha, tabela.
 * Linha de cabeçalho com nomes das colunas — parsers de import encontram essa linha.
 */
export async function exportBrandedExcelTable(
  options: ExportBrandedExcelOptions
): Promise<void> {
  const { title, subtitle, sheetName, filename, columns, rows } = options;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = EXPORT_COMPANY;
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet(sheetName.slice(0, 31), {
    views: [{ state: 'frozen', ySplit: 5 }],
    properties: { defaultRowHeight: 18 },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });

  columns.forEach((col, i) => {
    sheet.getColumn(i + 1).width = col.width ?? 14;
  });
  if (columns.length >= 2) {
    sheet.getColumn(1).width = Math.max(sheet.getColumn(1).width || 12, 14);
    sheet.getColumn(2).width = Math.max(sheet.getColumn(2).width || 12, 16);
  }

  const logoStrip = await loadExcelDualLogoStrip();
  const textStartCol = Math.min(3, Math.max(1, columns.length));
  const colCount = columns.length;

  sheet.mergeCells(1, textStartCol, 1, colCount);
  sheet.mergeCells(2, textStartCol, 2, colCount);
  sheet.mergeCells(3, textStartCol, 3, colCount);
  sheet.mergeCells(4, 1, 4, colCount);

  const brandTotalH = Math.max(48, logoStrip?.heightPx ?? 48) + 12;
  const brandRowH = brandTotalH / 3;
  for (let r = 1; r <= 3; r++) {
    const row = sheet.getRow(r);
    row.height = brandRowH;
    for (let c = 1; c <= colCount; c++) {
      row.getCell(c).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: HEADER_BG },
      };
    }
  }

  const titleCell = sheet.getCell(1, textStartCol);
  titleCell.value = title;
  titleCell.font = { name: 'Calibri', size: 18, bold: true, color: { argb: TITLE_TEXT } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const generatedAt = new Date();
  const dateLabel = generatedAt.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  const metaCell = sheet.getCell(2, textStartCol);
  metaCell.value = `${EXPORT_COMPANY}  ·  Gerado em ${dateLabel}  ·  ${rows.length} registro(s)`;
  metaCell.font = { name: 'Calibri', size: 10, color: { argb: MUTED_TEXT } };
  metaCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const subtitleCell = sheet.getCell(3, textStartCol);
  subtitleCell.value =
    subtitle || 'Exportação do sistema Gennesis — alinhada ao cadastro do módulo';
  subtitleCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: MUTED_TEXT } };
  subtitleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };

  const brandRow = sheet.getRow(4);
  brandRow.height = 6;
  for (let c = 1; c <= colCount; c++) {
    brandRow.getCell(c).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: BRAND_RED },
    };
  }

  if (logoStrip) placeLogoStrip(workbook, sheet, logoStrip);

  const headerRow = sheet.getRow(5);
  headerRow.height = 22;
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_RED } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    applyThinBorder(cell);
  });

  rows.forEach((values, i) => {
    const row = sheet.getRow(6 + i);
    row.height = 18;
    const zebra = i % 2 === 1;
    values.forEach((value, colIdx) => {
      const col = columns[colIdx];
      const cell = row.getCell(colIdx + 1);
      cell.value = value;
      cell.font = { name: 'Calibri', size: 10, color: { argb: TITLE_TEXT } };
      cell.alignment = {
        vertical: 'middle',
        horizontal: col?.align || 'left',
        wrapText: false,
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: zebra ? ROW_ALT : WHITE },
      };
      applyThinBorder(cell);

      if (col?.statusTone) {
        const tone = statusStyle(String(value ?? ''));
        if (tone) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: tone.bg } };
          cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: tone.fg } };
        }
      }
    });
  });

  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: 5 + rows.length, column: colCount },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as ArrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
