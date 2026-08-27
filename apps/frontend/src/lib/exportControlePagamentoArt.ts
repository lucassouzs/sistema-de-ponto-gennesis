import { exportBrandedExcelTable } from '@/lib/exportBrandedExcelTable';
import { exportBrandedPdfTable } from '@/lib/exportBrandedPdfTable';
import {
  CONTROLE_PAGAMENTO_ART_IMPORT_TEMPLATE_HEADERS,
  type ControlePagamentoArtExportRow,
} from '@/lib/controlePagamentoArtImport';

function formatExportDate(value: string | null | undefined): string {
  if (!value) return '';
  const raw = String(value).trim();
  if (!raw) return '';
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function formatExportValor(value: string | number | null | undefined): string | number {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  const n = parseFloat(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : String(value);
}

function toRowValues(r: ControlePagamentoArtExportRow): (string | number)[] {
  return [
    r.uf || '',
    r.empresa || '',
    r.contratante || '',
    r.cnpjCpf || '',
    r.contrato || '',
    r.observacoes || '',
    formatExportDate(r.vigenciaInicio),
    formatExportDate(r.vigenciaTermino),
    formatExportDate(r.renovacao),
    r.art || '',
    formatExportValor(r.valor),
    r.profissional || '',
    formatExportDate(r.vencDoBoleto),
    r.status || '',
    r.pago || '',
    formatExportDate(r.solicitaEm),
    formatExportDate(r.pagoEm),
    r.fluig || '',
  ];
}

export async function exportControlePagamentoArtEntries(
  entries: ControlePagamentoArtExportRow[],
  filenameSuffix?: string
): Promise<void> {
  const suffix = filenameSuffix || new Date().toISOString().slice(0, 10);
  const headers = CONTROLE_PAGAMENTO_ART_IMPORT_TEMPLATE_HEADERS;
  await exportBrandedExcelTable({
    title: "ART's / Protocolos",
    subtitle: 'Exportação do sistema Gennesis — pagamentos, vigências e vencimentos de ART',
    sheetName: 'ART Protocolos',
    filename: `controle-pagamentos-art_${suffix}.xlsx`,
    columns: headers.map((header) => ({
      header,
      width:
        header === 'PROFISSIONAL' || header === 'CONTRATANTE' || header === 'OBSERVAÇÕES'
          ? 22
          : header === 'STATUS' || header === 'PAGO' || header === 'UF'
            ? 10
            : header.includes('VIGÊNCIA') || header.includes('VENC') || header.includes('EM')
              ? 13
              : 12,
      align:
        header === 'STATUS' || header === 'PAGO' || header === 'UF' || header === 'VALOR'
          ? 'center'
          : 'left',
      statusTone: header === 'STATUS' || header === 'PAGO',
    })),
    rows: entries.map(toRowValues),
  });
}

export async function exportControlePagamentoArtPdf(
  entries: ControlePagamentoArtExportRow[],
  filenameSuffix?: string
): Promise<void> {
  const suffix = filenameSuffix || new Date().toISOString().slice(0, 10);
  await exportBrandedPdfTable({
    title: "ART's / Protocolos",
    subtitle: 'Pagamentos e vigências de ART/protocolos — lista conforme filtros da tela.',
    filename: `controle-pagamentos-art_${suffix}.pdf`,
    footerLabel: "ART's / Protocolos",
    columns: [
      { key: 'n', label: '#', width: 10, tone: 'muted' },
      { key: 'uf', label: 'UF', width: 12, tone: 'muted' },
      { key: 'profissional', label: 'PROFISSIONAL', width: 42, tone: 'bold' },
      { key: 'empresa', label: 'EMPRESA', width: 32 },
      { key: 'contrato', label: 'CONTRATO', width: 28 },
      { key: 'art', label: 'ART', width: 28 },
      { key: 'valor', label: 'VALOR', width: 22 },
      { key: 'venc', label: 'VENC. BOLETO', width: 26 },
      { key: 'status', label: 'STATUS', width: 22, tone: 'status' },
      { key: 'pago', label: 'PAGO', width: 16, tone: 'status' },
    ],
    rows: entries.map((r, i) => ({
      n: String(i + 1),
      uf: String(r.uf || '—').trim().toUpperCase() || '—',
      profissional: String(r.profissional || '—').trim() || '—',
      empresa: String(r.empresa || '—').trim() || '—',
      contrato: String(r.contrato || '—').trim() || '—',
      art: String(r.art || '—').trim() || '—',
      valor:
        r.valor === null || r.valor === undefined || r.valor === ''
          ? '—'
          : typeof r.valor === 'number'
            ? r.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            : String(r.valor),
      venc: formatExportDate(r.vencDoBoleto) || '—',
      status: String(r.status || '—').trim().toUpperCase() || '—',
      pago: String(r.pago || '—').trim().toUpperCase() || '—',
    })),
  });
}
