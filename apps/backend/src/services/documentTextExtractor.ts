import pdfParse from 'pdf-parse';

export type DocumentTextInput = {
  buffer: Buffer;
  mimeType: string;
  name: string;
};

const MAX_PDF_TEXT_CHARS = 180_000;
const MIN_USEFUL_PDF_TEXT_CHARS = 120;

const TABLE_HEADER_HINT =
  /lote|item|descri|area|área|m²|m2|valor|quantidade|unid|codigo|código|planilha|quadro|tabela|nº|numero|número|endereco|endereço|metrag|dimens/i;

function normalizeMime(mimeType: string, fileName: string): string {
  const m = (mimeType || '').toLowerCase().trim();
  if (m) return m;
  const ext = fileName.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

/** Converte linhas com colunas (espaços múltiplos / tabs) em formato legível para IA. */
export function extractTablesMarkdown(rawText: string): string {
  const lines = rawText.split('\n');
  const tableRows: string[] = [];
  let lastWasHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      lastWasHeader = false;
      continue;
    }

    const isHeader = TABLE_HEADER_HINT.test(line);
    const hasMultiCol = /\s{2,}|\t/.test(rawLine) || rawLine.includes('|');
    const hasNumber = /\d/.test(line);
    const isLoteRow = /\blote\b\s*\d+|\b\d{2,}\b.*\b(m²|m2|area|área|ha|hectare)\b/i.test(line);

    if (isHeader) {
      tableRows.push(`| ${line.replace(/\s{2,}|\t/g, ' | ')} |`);
      lastWasHeader = true;
      continue;
    }

    if ((hasMultiCol && hasNumber) || isLoteRow || (lastWasHeader && hasNumber)) {
      tableRows.push(`| ${line.replace(/\s{2,}|\t/g, ' | ')} |`);
      lastWasHeader = false;
      continue;
    }

    lastWasHeader = false;
  }

  if (tableRows.length === 0) return '';

  return `## Tabelas e quadros extraídos\n\n${tableRows.slice(0, 1200).join('\n')}`;
}

export async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const result = await pdfParse(buffer);
    return (result.text ?? '').replace(/\r\n/g, '\n').trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[documentTextExtractor] PDF parse failed:', msg.slice(0, 120));
    return '';
  }
}

export async function buildDocumentTextForAi(doc: DocumentTextInput): Promise<{
  texto: string;
  tabelas: string;
} | null> {
  const mime = normalizeMime(doc.mimeType, doc.name);

  if (mime === 'application/pdf') {
    const raw = await extractPdfText(doc.buffer);
    if (raw.length < MIN_USEFUL_PDF_TEXT_CHARS) return null;
    const tabelas = extractTablesMarkdown(raw);
    const texto = raw.slice(0, MAX_PDF_TEXT_CHARS);
    return { texto, tabelas };
  }

  if (mime.startsWith('text/') || doc.name.toLowerCase().endsWith('.txt')) {
    const raw = doc.buffer.toString('utf8').slice(0, MAX_PDF_TEXT_CHARS);
    return { texto: raw, tabelas: extractTablesMarkdown(raw) };
  }

  return null;
}
