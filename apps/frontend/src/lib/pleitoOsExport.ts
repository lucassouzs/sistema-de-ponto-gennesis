import * as XLSX from 'xlsx';
import { formatOsSePasta } from '@/lib/formatOsSePasta';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { loadPdfBrandingLogoDataUrl } from '@/lib/loadPdfBrandingLogo';

export const PLEITO_HISTORY_MARKER = '__PLEITO_HISTORICO__';
export const PLEITO_HISTORY_MARKER_GERADO_100 = '__PLEITO_HISTORICO__GERADO_100__';

export interface PleitoOsExportRow {
  id: string;
  divSe: string | null;
  creationMonth: string | null;
  creationYear: number | null;
  startDate: string | null;
  endDate: string | null;
  budgetStatus: string | null;
  folderNumber: string | null;
  lot: string | null;
  location: string | null;
  unit: string | null;
  serviceDescription: string;
  executionStatus: string | null;
  budget: string | null;
  billingStatus: string | null;
  accumulatedBilled: number | null;
  billingRequest: number | null;
  invoiceNumber: string | null;
  estimator: string | null;
  budgetAmount1: number | null;
  budgetAmount2: number | null;
  budgetAmount3: number | null;
  budgetAmount4: number | null;
  pv: string | null;
  ipi: string | null;
  reportsBilling: string | null;
  engineer: string | null;
  supervisor: string | null;
  createdAt?: string;
  updatedAt?: string;
}

function parseBudgetToNumberSafe(v: string | null | undefined): number {
  if (!v) return 0;
  const s = String(v).replace(/[R$\s]/g, '').trim();
  if (!s) return 0;
  if (s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export type BillingForOsCheck = { serviceOrder?: string | null; grossValue: number };

export function getOsFaturamentoAcumulado(
  p: Pick<PleitoOsExportRow, 'divSe'>,
  billings: BillingForOsCheck[]
): number {
  const osSe = (p.divSe || '').trim();
  if (!osSe) return 0;
  return billings
    .filter((b) => (b.serviceOrder || '').trim() === osSe)
    .reduce((sum, b) => sum + Number(b.grossValue || 0), 0);
}

export function isOsConcluida(
  p: Pick<PleitoOsExportRow, 'divSe' | 'budget'>,
  billings: BillingForOsCheck[]
): boolean {
  const orcamento = parseBudgetToNumberSafe(p.budget);
  if (orcamento <= 0) return false;
  const acumulado = getOsFaturamentoAcumulado(p, billings);
  return acumulado >= orcamento - 0.01;
}

export type OsEtiquetaAbertura = 'Aberta' | 'Concluída';

export function getOsEtiquetaAbertura(
  p: Pick<PleitoOsExportRow, 'divSe' | 'budget'>,
  billings: BillingForOsCheck[]
): OsEtiquetaAbertura {
  return isOsConcluida(p, billings) ? 'Concluída' : 'Aberta';
}

export type OsStatusPleito = 'Pendente' | 'Pleiteado parcial' | 'Pleiteado 100%';
export type OsStatusFaturamento = 'Pendente' | 'Faturado parcial' | 'Faturado 100%';

/** @deprecated use OsStatusPleito */
export type OsStatus = OsStatusPleito;

/** Status do pleito (independente do faturamento). */
export function getOsStatus(
  p: Pick<PleitoOsExportRow, 'divSe' | 'budget'>,
  _billings: BillingForOsCheck[],
  allPleitos: PleitoForOsPleiteadoSum[]
): OsStatusPleito {
  const pleiteado = sumOsPleiteadoTotal(allPleitos, p.divSe);
  if (pleiteado <= 0.01) return 'Pendente';

  const pctPleiteado = getOsPleiteadoPct(p, allPleitos);
  if (pctPleiteado !== null && pctPleiteado >= 99.99) return 'Pleiteado 100%';

  return 'Pleiteado parcial';
}

/** Status de faturamento da OS (independente do pleito). */
export function getOsStatusFaturamento(
  p: Pick<PleitoOsExportRow, 'divSe' | 'budget'>,
  billings: BillingForOsCheck[]
): OsStatusFaturamento {
  const orcamento = parseBudgetToNumberSafe(p.budget);
  const acumulado = getOsFaturamentoAcumulado(p, billings);
  if (acumulado <= 0.01) return 'Pendente';
  if (orcamento > 0 && acumulado >= orcamento - 0.01) return 'Faturado 100%';
  return 'Faturado parcial';
}

export function osStatusBadgeClass(status: string): string {
  const GREEN = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
  const BLUE = 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300';
  const YELLOW = 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';

  // Completos → verde
  if (
    status === 'Pleiteado 100%' ||
    status === 'Faturado 100%' ||
    status === 'Pleiteado' ||
    status === 'Faturado' ||
    status === 'Concluído' ||
    status === 'Concluída'
  ) {
    return GREEN;
  }
  // Parciais → azul
  if (status === 'Pleiteado parcial' || status === 'Faturado parcial') {
    return BLUE;
  }
  // Pendente → amarelo
  return YELLOW;
}

export function getOsStatusFaturamentoPct(
  p: Pick<PleitoOsExportRow, 'divSe' | 'budget'>,
  billings: BillingForOsCheck[]
): number | null {
  const orcamento = parseBudgetToNumberSafe(p.budget);
  if (orcamento <= 0) return null;
  const acumulado = getOsFaturamentoAcumulado(p, billings);
  return (acumulado / orcamento) * 100;
}

export type PleitoForOsPleiteadoSum = {
  divSe?: string | null;
  billingRequest?: number | string | null;
};

/** Soma valores já pleiteados (billingRequest) para o mesmo OS/SE no contrato. */
export function sumOsPleiteadoTotal(
  allPleitos: PleitoForOsPleiteadoSum[],
  divSe: string | null | undefined
): number {
  const key = (divSe || '').trim().toLowerCase();
  if (!key) return 0;
  return allPleitos.reduce((sum, p) => {
    if ((p.divSe || '').trim().toLowerCase() !== key) return sum;
    const br = p.billingRequest != null ? Number(p.billingRequest) : 0;
    return sum + (Number.isFinite(br) && br > 0 ? br : 0);
  }, 0);
}

export function getOsPleiteadoPct(
  p: Pick<PleitoOsExportRow, 'divSe' | 'budget'>,
  allPleitos: PleitoForOsPleiteadoSum[]
): number | null {
  const orcamento = parseBudgetToNumberSafe(p.budget);
  if (orcamento <= 0) return null;
  const pleiteado = sumOsPleiteadoTotal(allPleitos, p.divSe);
  return (pleiteado / orcamento) * 100;
}

export function getOsRestantePleitear(
  p: Pick<PleitoOsExportRow, 'divSe' | 'budget'>,
  allPleitos: PleitoForOsPleiteadoSum[]
): number | null {
  const orcamento = parseBudgetToNumberSafe(p.budget);
  if (orcamento <= 0) return null;
  return Math.max(0, orcamento - sumOsPleiteadoTotal(allPleitos, p.divSe));
}

/** OS com orçamento totalmente pleiteado — não há mais nada a pleitear. */
export function isOsPleiteada100(
  p: Pick<PleitoOsExportRow, 'divSe' | 'budget'>,
  allPleitos: PleitoForOsPleiteadoSum[]
): boolean {
  const restante = getOsRestantePleitear(p, allPleitos);
  return restante != null && restante <= 0.01;
}

export function getOsRestanteFaturar(
  p: Pick<PleitoOsExportRow, 'divSe' | 'budget'>,
  billings: BillingForOsCheck[]
): number | null {
  const orcamento = parseBudgetToNumberSafe(p.budget);
  if (orcamento <= 0) return null;
  return Math.max(0, orcamento - getOsFaturamentoAcumulado(p, billings));
}

export function getPleitoOsSituacao(
  p: PleitoOsExportRow,
  billings: BillingForOsCheck[] = []
): string {
  void billings;
  const marker = (p.reportsBilling || '').trim();
  const orc = parseBudgetToNumberSafe(p.budget);
  const br = p.billingRequest != null ? Number(p.billingRequest) : 0;
  if (marker === PLEITO_HISTORY_MARKER_GERADO_100 || (orc > 0 && br >= orc - 0.01)) {
    return 'Pleiteado 100%';
  }
  if (marker === PLEITO_HISTORY_MARKER || br > 0) return 'Pleiteado parcial';
  return 'Pendente';
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '';
  const raw = String(dateStr).trim();
  const only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = only
    ? new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]), 12, 0, 0, 0)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function numOrEmpty(v: number | null | undefined): number | string {
  if (v == null || Number.isNaN(Number(v))) return '';
  return Number(v);
}

function displayReportsBilling(value: string | null | undefined): string {
  const t = (value || '').trim();
  if (!t) return '';
  if (t === PLEITO_HISTORY_MARKER || t === PLEITO_HISTORY_MARKER_GERADO_100) return '';
  return t;
}

function pleitoToXlsxRow(p: PleitoOsExportRow, billings: BillingForOsCheck[]): (string | number)[] {
  const valorFaturado = getOsFaturamentoAcumulado(p, billings);
  const statusFatPct = getOsStatusFaturamentoPct(p, billings);
  return [
    getOsEtiquetaAbertura(p, billings),
    getPleitoOsSituacao(p, billings),
    formatOsSePasta(p.divSe, p.folderNumber),
    p.folderNumber ?? '',
    p.creationMonth ?? '',
    p.creationYear ?? '',
    p.startDate ? formatDate(p.startDate) : '',
    p.endDate ? formatDate(p.endDate) : '',
    p.budgetStatus ?? '',
    p.executionStatus ?? '',
    p.budget ?? '',
    valorFaturado > 0 ? valorFaturado : '',
    statusFatPct != null ? Number(statusFatPct.toFixed(2)) : '',
    numOrEmpty(p.billingRequest),
    numOrEmpty(p.accumulatedBilled),
    p.billingStatus ?? '',
    p.invoiceNumber ?? '',
    p.lot ?? '',
    p.location ?? '',
    p.unit ?? '',
    p.serviceDescription ?? '',
    p.estimator ?? '',
    numOrEmpty(p.budgetAmount1),
    numOrEmpty(p.budgetAmount2),
    numOrEmpty(p.budgetAmount3),
    numOrEmpty(p.budgetAmount4),
    p.pv ?? '',
    p.ipi ?? '',
    displayReportsBilling(p.reportsBilling),
    p.engineer ?? '',
    p.supervisor ?? '',
    p.createdAt ? formatDateTimeBr(p.createdAt, '') : '',
    p.updatedAt ? formatDateTimeBr(p.updatedAt, '') : '',
  ];
}

const PLEITO_OS_XLSX_HEADERS = [
  'Etiqueta',
  'Situação pleito',
  'OS / SE',
  'Nº pasta',
  'Mês criação',
  'Ano criação',
  'Data início',
  'Data término',
  'Status Orçamento',
  'Status Execução',
  'Orçamento',
  'Valor faturado',
  'Status Faturamento (%)',
  'Valor pleiteado',
  'Acumulado faturado (campo OS)',
  'Status Faturamento (campo OS)',
  'Nº NF',
  'Lote',
  'Local',
  'Unidade',
  'Descrição do serviço',
  'Orçamentista',
  'Orçamento R01',
  'Orçamento R02',
  'Orçamento R03',
  'Orçamento R04',
  'RVI',
  'RVF',
  'Feedback relatórios',
  'Engenheiro',
  'Encarregado',
  'Criado em',
  'Atualizado em',
];

export function exportPleitosOsToXlsx(
  rows: PleitoOsExportRow[],
  billings: BillingForOsCheck[],
  filenamePrefix = 'historico-os'
) {
  const data = rows.map((p) => pleitoToXlsxRow(p, billings));
  const ws = XLSX.utils.aoa_to_sheet([PLEITO_OS_XLSX_HEADERS, ...data]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Histórico de OS');
  const date = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${filenamePrefix}-${date}.xlsx`);
}

export function getPleitoOrcamentoValor(p: Pick<PleitoOsExportRow, 'budget'>): number {
  return parseBudgetToNumberSafe(p.budget);
}

export function getPleitoCreationYear(p: PleitoOsExportRow): number | null {
  if (p.creationYear != null && Number.isFinite(Number(p.creationYear))) {
    return Number(p.creationYear);
  }
  if (p.createdAt) {
    const d = new Date(p.createdAt);
    if (!Number.isNaN(d.getTime())) return d.getFullYear();
  }
  return null;
}

export function getPleitoCreationMonth(p: PleitoOsExportRow): number | null {
  const raw = p.creationMonth ? parseInt(String(p.creationMonth).replace(/\D/g, '') || '0', 10) : 0;
  if (raw >= 1 && raw <= 12) return raw;
  if (p.createdAt) {
    const d = new Date(p.createdAt);
    if (!Number.isNaN(d.getTime())) return d.getMonth() + 1;
  }
  return null;
}

export type HistoricoOsTotals = {
  totalOrcado: number;
  totalPleiteado: number;
  totalFaturado: number;
};

export function computeHistoricoOsTotals(
  rows: PleitoOsExportRow[],
  billings: BillingForOsCheck[]
): HistoricoOsTotals {
  let totalOrcado = 0;
  let totalPleiteado = 0;
  const seenOs = new Set<string>();
  let totalFaturado = 0;
  for (const p of rows) {
    totalOrcado += getPleitoOrcamentoValor(p);
    const br = p.billingRequest != null ? Number(p.billingRequest) : 0;
    totalPleiteado += Number.isFinite(br) ? br : 0;
    const key = (p.divSe || '').trim().toLowerCase();
    if (key && !seenOs.has(key)) {
      seenOs.add(key);
      totalFaturado += getOsFaturamentoAcumulado(p, billings);
    }
  }
  return { totalOrcado, totalPleiteado, totalFaturado };
}

function formatCurrencyBr(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export async function exportHistoricoOsPdf(
  rows: PleitoOsExportRow[],
  billings: BillingForOsCheck[],
  options: {
    contractName?: string;
    contractNumber?: string;
    filenamePrefix?: string;
  } = {}
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const totals = computeHistoricoOsTotals(rows, billings);
  const logoBase64 = await loadPdfBrandingLogoDataUrl({
    contextLabels: [options.contractName, options.contractNumber],
    maxW: 22,
    maxH: 20,
  });
  const pdf = new jsPDF('l', 'mm', 'a4');
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 10;
  let y = margin;

  pdf.setFillColor(55, 65, 81);
  pdf.rect(0, 0, pageWidth, 26, 'F');
  if (logoBase64) {
    pdf.addImage(logoBase64, 'PNG', margin, 5, 16, 14);
  }
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(16);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Histórico de OS', pageWidth / 2, 14, { align: 'center' });
  pdf.setFontSize(9);
  pdf.setFont('helvetica', 'normal');
  const contractLine = [options.contractNumber, options.contractName].filter(Boolean).join(' – ');
  if (contractLine) {
    pdf.text(contractLine, pageWidth / 2, 20, { align: 'center' });
  }
  pdf.text(
    `Gerado em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
    pageWidth / 2,
    24,
    { align: 'center' }
  );
  pdf.setTextColor(0, 0, 0);
  y = 32;

  const colW = [32, 52, 18, 22, 28, 28, 28, 14];
  const headers = ['OS / SE', 'Descrição', 'Mês/Ano', 'Etiqueta', 'Orçamento', 'Pleiteado', 'Faturado', '% Fat.'];
  const totalW = colW.reduce((a, b) => a + b, 0);
  const rowH = 7;
  const startX = margin;

  const drawTableHeader = () => {
    pdf.setFillColor(55, 65, 81);
    pdf.rect(startX, y, totalW, rowH, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    let x = startX;
    headers.forEach((h, i) => {
      pdf.text(h, x + 2, y + 4.5);
      x += colW[i];
    });
    pdf.setTextColor(0, 0, 0);
    y += rowH;
  };

  drawTableHeader();
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(6);

  rows.forEach((p, idx) => {
    if (y + rowH > pageHeight - 28) {
      pdf.addPage();
      y = margin;
      drawTableHeader();
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6);
    }
    if (idx % 2 === 1) {
      pdf.setFillColor(249, 250, 251);
      pdf.rect(startX, y, totalW, rowH, 'F');
    }
    const mesAno =
      p.creationMonth && getPleitoCreationYear(p)
        ? `${String(getPleitoCreationMonth(p) ?? p.creationMonth).padStart(2, '0')}/${getPleitoCreationYear(p)}`
        : '—';
    const valorFaturado = getOsFaturamentoAcumulado(p, billings);
    const pct = getOsStatusFaturamentoPct(p, billings);
    const cells = [
      formatOsSePasta(p.divSe, p.folderNumber).slice(0, 22) || '—',
      (p.serviceDescription || '—').slice(0, 38),
      mesAno,
      getOsEtiquetaAbertura(p, billings),
      getPleitoOrcamentoValor(p) > 0 ? formatCurrencyBr(getPleitoOrcamentoValor(p)) : '—',
      p.billingRequest != null && Number(p.billingRequest) > 0
        ? formatCurrencyBr(Number(p.billingRequest))
        : '—',
      valorFaturado > 0 ? formatCurrencyBr(valorFaturado) : '—',
      pct != null ? `${pct.toFixed(1)}%` : '—',
    ];
    let x = startX;
    cells.forEach((cell, i) => {
      pdf.text(String(cell), x + 2, y + 4.5);
      x += colW[i];
    });
    y += rowH;
  });

  y += 4;
  if (y + 22 > pageHeight - margin) {
    pdf.addPage();
    y = margin;
  }
  pdf.setFillColor(241, 245, 249);
  pdf.rect(startX, y, totalW, 20, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.text('Totais', startX + 2, y + 6);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`Total orçado: ${formatCurrencyBr(totals.totalOrcado)}`, startX + 2, y + 12);
  pdf.text(`Total pleiteado: ${formatCurrencyBr(totals.totalPleiteado)}`, startX + 2, y + 17);
  pdf.text(
    `Total faturado: ${formatCurrencyBr(totals.totalFaturado)} (${rows.length} registro(s))`,
    startX + 80,
    y + 12
  );

  const prefix = options.filenamePrefix || 'historico-os';
  pdf.save(`${prefix}-${new Date().toISOString().slice(0, 10)}.pdf`);
}
