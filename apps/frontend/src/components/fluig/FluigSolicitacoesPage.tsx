'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueries } from '@tanstack/react-query';
import {
  Loader2,
  AlertCircle,
  Building2,
  Search,
  Filter,
  RotateCcw,
  Download,
  ChevronUp,
  ChevronDown,
  Layers,
  Truck,
  Users,
  Landmark,
  FileText,
  ExternalLink,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { CadastroListSummary, getCadastroListRange } from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import {
  getListTableRowClassName,
  ListRowNavigableLabel,
} from '@/components/ui/listTableUi';
import { TabCountBadge } from '@/components/ui/TabCountBadge';
import { AppTabButton } from '@/components/ui/AppTabButton';
import { useCostCenters } from '@/hooks/useCostCenters';
import {
  buildFluigWorkflowProcessViewUrl,
  formatFluigBudgetFieldDisplay,
} from '@/lib/fluigWorkflowApproval';
import api from '@/lib/api';
import * as XLSX from 'xlsx';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

const FLUIG_LIST_PAGE_SIZE = 20;

const ACTIONS_COL_TH =
  'w-[4%] min-w-[3.5rem] whitespace-nowrap px-2 py-4 text-center align-middle text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-3';
const ACTIONS_COL_TD =
  'w-[4%] min-w-[3.5rem] whitespace-nowrap px-2 py-3 text-center align-middle sm:px-3';

export const G5_RELATORIO_DATASET_ID = 'G5-Relatorio-DF-GO-TODOS-SETORES';

const DEFAULT_BI_DATASETS = ['DataSet_G3FollowUp', 'DataSet_G4FollowUp', G5_RELATORIO_DATASET_ID] as const;

const DEFAULT_DATASET_TAB_LABELS: Record<string, string> = {
  DataSet_G3FollowUp: 'G3 - Aprovação de Ordem de Compra',
  DataSet_G4FollowUp: 'G4 - Anexação de Comprovante',
  [G5_RELATORIO_DATASET_ID]: 'G5 - Pagamentos Avulsos',
};

const FILIAIS_PERMITIDAS = [
  '1 - GENNESIS ENGENHARIA E CONSULTORIA LTDA',
  '2 - GENNESIS ENGENHARIA E CONSULTORIA LTDA',
  '3 - GENNESIS ENGENHARIA E CONSULTORIA LTDA',
  '4 - GENNESIS ENGENHARIA E CONSULTORIA LTDA',
  '5 - GENNESIS ENGENHARIA E CONSULTORIA LTDA',
] as const;

const LABEL_ABBREV: Record<string, string> = {
  cod: 'Código',
  nr: 'Número',
  num: 'Número',
  seq: 'Sequência',
  movto: 'Movimento',
  ant: 'Anterior',
  def: 'Definição',
  proces: 'Processo',
  aprovacao: 'Aprovação',
  identificador: 'Identificador',
  documento: 'Documento',
  card: 'Cartão',
  estado: 'Estado',
  tipo: 'Tipo',
  produtos: 'Produtos',
  mobile: 'Mobile',
  cc: 'Centro de custo',
  start: 'Início',
  end: 'Fim',
  date: 'Data',
  time: 'Hora',
  datetime: 'Data e hora',
};

function formatLabel(key: string): string {
  let label = key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  label = label.replace(/\b\w+/g, (word) => LABEL_ABBREV[word] ?? word.replace(/\b\w/, (c) => c.toUpperCase()));
  label = label.replace(/^Código\s+/g, 'Código de ');
  return label;
}

function parseFluigDateTime(val: unknown): Date | null {
  if (val instanceof Date) return val;
  const s = String(val ?? '').trim();
  if (!s) return null;
  const isoLike = s.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?)?/);
  if (isoLike) {
    const iso = isoLike[2] ? `${isoLike[1]}T${isoLike[2]}` : `${isoLike[1]}T12:00:00`;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
  if (br) {
    const dd = br[1].padStart(2, '0');
    const mm = br[2].padStart(2, '0');
    const yyyy = br[3];
    const hh = (br[4] ?? '12').padStart(2, '0');
    const min = (br[5] ?? '00').padStart(2, '0');
    const ss = (br[6] ?? '00').padStart(2, '0');
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const iso = s.replace(' ', 'T');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

/** Valor de célula Fluig (string ou objeto com display/value) → data. */
function parseCellDate(val: unknown): Date | null {
  if (val instanceof Date) return val;
  let v: unknown = val;
  if (v != null && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    v = o.display ?? o.displayValue ?? o.internalValue ?? o.value ?? o.date ?? '';
  }
  return parseFluigDateTime(v);
}

/** Detecta coluna de natureza orçamentária com nomes variados no Fluig/G5. */
function matchNaturezaOrcamentariaColumnKey(key: string): boolean {
  const raw = key.trim();
  const n = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (/titulo|historico|descricao|observac|mensagem|coment|anexo|link|url|email/i.test(n)) return false;
  if (/natureza.*(juridica|fiscal)|tipo.*pessoa/i.test(n)) return false;
  const compact = raw.toLowerCase().replace(/\s+/g, '_');
  if (/nat_?orc|natorc|naturorc|cd_?nat|cod_?nat|codigonatureza/i.test(compact)) return true;
  if (n.includes('natureza') && /orc|orcamento|despes|financ|orca\b|budget/i.test(n)) return true;
  if (n.includes('natureza')) return true;
  if ((/cod(igo)?\b|cd_/.test(n) || /^cd\s/.test(n)) && n.includes('natureza')) return true;
  if (/tipo.*(despesa|orcamento)|classificacao.*(desp|orc)|elemento.*desp|carteira.*orc/i.test(n)) return true;
  const lbl = formatLabel(key).toLowerCase();
  if (lbl.includes('natureza') && (lbl.includes('orc') || lbl.includes('despes') || lbl.includes('financeir')))
    return true;
  return false;
}

/** Coluna "Início Data" / "Inicio Data" (G5 Relatório DF e similares). */
function isInicioDataColumnName(name: string): boolean {
  const n = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (n === 'inicio data') return true;
  const lbl = formatLabel(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (lbl === 'inicio data') return true;
  return (
    lbl.includes('inicio') &&
    lbl.includes('data') &&
    !lbl.includes('fim') &&
    !lbl.includes('termino') &&
    !lbl.includes('final')
  );
}

/** Quando o dataset não expõe nomes padrão, escolhe a coluna que mais parece data de início do processo. */
function pickLeadTimeColumnHeuristic(rows: Record<string, unknown>[], columnOrder: string[]): string | null {
  if (!rows.length) return null;
  const first = rows[0] as Record<string, unknown>;
  const keys = (columnOrder.length > 0 ? columnOrder : Object.keys(first)).filter((k) => {
    const kn = k.toLowerCase().replace(/\s+/g, ' ');
    return !/titulo|historico|descricao|observ|mensagem|solicitacao|email|tel|cpf|cnpj|status|etapa|filial|fornecedor|setor|natureza|centro.*custo|^cc$|contrato|urgencia|valor|quant|preco|total|idmov|num_proces|numseq|seq|pedido|codigo|aprovador|gestor|usuario|nome|desc\b/i.test(
      kn,
    );
  });
  const sample = Math.min(rows.length, 40);
  const minOk = Math.max(2, Math.ceil(sample * 0.1));
  const tMin = new Date('2015-01-01').getTime();
  const tMax = Date.now() + 2 * 86400000;
  let bestK: string | null = null;
  let bestTotal = 0;
  for (const k of keys) {
    let score = 0;
    for (let i = 0; i < sample; i++) {
      const d = parseCellDate(rows[i][k]);
      if (!d) continue;
      const t = d.getTime();
      if (t < tMin || t > tMax) continue;
      score++;
    }
    if (score < minOk) continue;
    const kn = k.toLowerCase();
    let bonus = 0;
    if (/mov|inclus|criac|abert|solicit|inicio|dh_|dt_mov|data_mov|processo|start|envio|abertura/i.test(kn)) bonus += 8;
    if (/atualiz|alterad|modific|finaliz|conclu|aprovad|assinad|encerr/i.test(kn)) bonus -= 6;
    if (/data|dt|hora|time|dh\b/i.test(kn)) bonus += 2;
    const total = score + bonus;
    if (total > bestTotal) {
      bestTotal = total;
      bestK = k;
    }
  }
  return bestK;
}

/** Etapas encerradas: não exibir coluna de lead time (Finalizada / Finalizado / rótulos com "finaliz"). */
function isEtapaSemLeadTime(etapaLabel: string): boolean {
  const n = etapaLabel
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /\bfinalizad[oa]\b/.test(n) || n.includes('finaliz');
}

function formatLeadTime(from: Date | null): string {
  if (!from) return '—';
  const now = new Date();
  let diffMs = now.getTime() - from.getTime();
  if (diffMs <= 0) return '0 min';
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}min`);
  return parts.length > 0 ? parts.join(' ') : '0 min';
}

function formatValue(val: unknown): string {
  if (val == null) return '—';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (val instanceof Date) return val.toLocaleString('pt-BR');
  if (typeof val === 'object' && val !== null) {
    const o = val as Record<string, unknown>;
    const v = o.display ?? o.displayValue ?? o.value ?? o.internalValue;
    return v != null ? String(v) : '—';
  }
  return String(val);
}

function stripDiacriticsKey(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Colunas onde vem "3.03.01.32-SALÁRIOS…" sem o rótulo "natureza" (relatório G5 DF). */
function matchNaturezaExtendedFluigColumnKey(key: string): boolean {
  const raw = key.trim();
  const n = stripDiacriticsKey(raw).replace(/\s+/g, ' ').toLowerCase();
  if (/titulo|historico|descricao|observ|mensagem|coment|anexo|link|email|telefone|celular|filial|fornecedor|pix|boleto|agencia|conta\s*corrente|chave|vencimento/i.test(n))
    return false;
  if (/^valor\b|\bvalor\s|quant|qtd|etapa|fase|status|idmov|num_proces|sequencia|processo\s*$/i.test(n)) return false;
  if (/centro(\s+de)?\s*custo|^cc$|ccusto|centrocusto|custo\s*mecanismo|mecanismo.*custo|^contrato$/i.test(n)) return false;
  if (/\belemento\b/.test(n) && !/elemento.*(pessoa|jurid)/i.test(n)) return true;
  if (/classificacao.*(orc|despesa|desp)/i.test(n)) return true;
  if (/carteira.*orc/i.test(n)) return true;
  if (/evento.*(orc|desp)/i.test(n)) return true;
  if (/conta.*orcament/i.test(n)) return true;
  if (/plano.*(orc|desp)/i.test(n)) return true;
  if (/cod(igo)?(\s+do)?\s*elemento/i.test(n)) return true;
  if (/elemento\s*padrao/i.test(n)) return true;
  if (/unidade.*orcament|ud\s*orc/i.test(n)) return true;
  if (/despesa.*orcament|orcamento.*despesa/i.test(n)) return true;
  if (/mascara|reduzid|nat(ureza)?(\s|_)*desp|elemento(\s|_)*(orcament|orc\.?)/i.test(n)) return true;
  return false;
}

function isNaturezaOrcamentariaColumnCandidate(key: string): boolean {
  return matchNaturezaOrcamentariaColumnKey(key) || matchNaturezaExtendedFluigColumnKey(key);
}

function cellLooksLikeOrcNaturezaDisplay(val: unknown): boolean {
  const s = formatValue(val).trim();
  if (s === '—' || s.length < 8) return false;
  return /^\d{1,2}(\.\d{2,3}){2,6}\s*[-–—]/.test(s) || /^\d{1,2}(\.\d{2,3}){2,6}[A-Za-zÀ-ÿ]/.test(s);
}

function listNaturezaCandidateKeysFluig(columns: string[], firstRow: Record<string, unknown> | undefined): string[] {
  const out: string[] = [];
  const add = (k: string) => {
    if (!k || out.includes(k)) return;
    if (!isNaturezaOrcamentariaColumnCandidate(k)) return;
    out.push(k);
  };
  for (const c of columns) add(c);
  if (firstRow) for (const k of Object.keys(firstRow)) add(k);
  return out;
}

function pickBestNaturezaOrcamentariaColumn(
  columns: string[],
  firstRow: Record<string, unknown> | undefined,
  values: Record<string, unknown>[]
): string | null {
  const keys = listNaturezaCandidateKeysFluig(columns, firstRow).filter((k) => !/^valor\b/i.test(k.trim()));
  if (keys.length === 0) return null;
  if (keys.length === 1) return keys[0];
  const sample = values.slice(0, Math.min(600, values.length));
  let bestK: string | null = null;
  let bestScore = -1;
  for (const k of keys) {
    let filled = 0;
    let coded = 0;
    for (const row of sample) {
      const s = formatValue(row[k]).trim();
      if (s.length < 4 || s === '—') continue;
      filled++;
      if (cellLooksLikeOrcNaturezaDisplay(row[k])) coded++;
    }
    let score = filled + coded * 4;
    const kn = stripDiacriticsKey(k).replace(/\s+/g, ' ').toLowerCase();
    if (/\belemento\b|mascara|classificacao|despesa.*orc|nat_?orc|natureza\b/i.test(kn)) score += 2;
    if (score > bestScore) {
      bestScore = score;
      bestK = k;
    }
  }
  return bestK;
}

function normKeyForSolicitacaoId(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function columnLooksLikeIdMov(c: string): boolean {
  const compact = c.replace(/[_\s]+/g, '').toLowerCase();
  return compact === 'idmov';
}

function columnLooksLikeNumeroProcesso(c: string): boolean {
  const n = normKeyForSolicitacaoId(c).replace(/\s/g, '');
  if (!n.includes('numero') || !n.includes('processo')) return false;
  if (n.includes('sequencia') || n.includes('etapa')) return false;
  return true;
}

/** Coluna do id numérico da solicitação para o título do modal (IdMov, NUM_PROCES, Número Processo). */
function findSolicitacaoIdColumn(columns: string[]): string | null {
  const idMov = columns.find(columnLooksLikeIdMov);
  if (idMov) return idMov;
  const numProces = columns.find((c) => /^num_proces$/i.test(c.trim()));
  if (numProces) return numProces;
  return columns.find(columnLooksLikeNumeroProcesso) ?? null;
}

function formatSolicitacaoModalTitle(columns: string[], row: Record<string, unknown>): string {
  const col = findSolicitacaoIdColumn(columns);
  if (!col) return 'Solicitação';
  const num = formatValue(row[col]);
  if (!num || num === '—') return 'Solicitação';
  return `Solicitação ${num}`;
}

/** ID de processo Fluig para o link (preferência NUM_PROCES). */
function getFluigProcessInstanceId(
  row: Record<string, unknown>,
  columns: string[],
  fallbackIdCol: string
): string {
  const numProces =
    columns.find((c) => /^NUM_PROCES$/i.test(c.trim())) ??
    columns.find((c) => columnLooksLikeNumeroProcesso(c));
  if (numProces) {
    const v = formatValue(row[numProces]);
    if (v && v !== '—') return v;
  }
  const fromFallback = formatValue(row[fallbackIdCol] ?? '');
  if (fromFallback && fromFallback !== '—') return fromFallback;
  const idCol = findSolicitacaoIdColumn(columns);
  if (!idCol) return '';
  const v = formatValue(row[idCol]);
  return v && v !== '—' ? v : '';
}

/** Texto normalizado para classificar colunas do modal de detalhe (nome técnico + rótulo). */
function fluigDetailModalHint(colRaw: string): string {
  const r = colRaw.trim();
  const lbl = formatLabel(r);
  return `${r} ${lbl}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

const FLUIG_DETAIL_MODAL_SECTIONS = [
  'Aprovações e cancelamentos',
  'Pagamento e dados bancários',
  'Fornecedor',
  'Endereço e contato',
  'Empresa, local e solicitante',
  'Valores, contrato e natureza',
  'Processo e andamento',
  'Solicitação',
] as const;

/** Índice da seção; último índice = "Outros campos". */
function fluigDetailModalSectionIndex(colRaw: string): number {
  const h = fluigDetailModalHint(colRaw);
  if (/aprovacao|aprova\b|cancel|gestor|diretoria|mensagem.*cancel/i.test(h)) return 0;
  if (
    /pagamento|pix|boleto|favorecido|dados\s*pagamento|cpf\s*cnpj\s*favorecido|agencia|conta\s*corrente|digito\s*conta|camara\s*comp|cad\s*referencia|cod(igo)?\s*de\s*boleto|vencimento|data\s*vencimento/i.test(
      h,
    ) ||
    /chave\s*(aleatoria|celular|cnpj|cpf|email)/i.test(h) ||
    (h.includes('descricao') && (h.includes('pagamento') || h.includes('pix')))
  )
    return 1;
  if (/fornecedor/i.test(h) && !/solicitante/i.test(h)) return 2;
  if (
    /cep\b|enderec|logradouro|bairro|cidade|estado|complemento|\buf\b|telefone|celular|whatsapp/i.test(h) ||
    (h.includes('email') && !h.includes('chave'))
  )
    return 3;
  if (
    /\bempresa\b|coligada|\bfilial\b|codigo\s*de\s*empresa|setor\s*solicitante|centro\s*(de\s*)?custo|\bcc\b/i.test(
      h,
    ) ||
    (/\bsolicitante\b/i.test(h) && !/fornecedor/i.test(h))
  )
    return 4;
  if (/(\bvalor\b|contrato|orcamento)/i.test(h) || isNaturezaOrcamentariaColumnCandidate(colRaw)) return 5;
  if (
    /idmov|num_proces|numero\s*processo|numeroprocesso|numero\s*sequencia|sequencia.*estado|fase\s*atual|\betapa\b|inicio\s*data|dh_/i.test(
      h,
    ) ||
    (/^status\b|\bstatus$/i.test(h.trim()) && !/aprovacao/i.test(h))
  )
    return 6;
  if (/titulo\s*solicitacao|urgencia|historico/i.test(h) || (h.includes('descricao') && !h.includes('pagamento')))
    return 7;
  return FLUIG_DETAIL_MODAL_SECTIONS.length;
}

type FluigSolicitacoesPageConfig = {
  title?: string;
  subtitle?: string;
  datasets?: readonly string[];
  datasetTabLabels?: Record<string, string>;
  g5TitleDatasets?: readonly string[];
  allowedFiliais?: readonly string[] | null;
  /** Quando definido, aplica a whitelist padrão de filiais somente nesses datasets (ex.: apenas G3). */
  allowedFiliaisDatasets?: readonly string[];
  excludedFiliais?: readonly string[];
  hideFilialFilter?: boolean;
  showProcessCard?: boolean;
  useEmployeeListLayout?: boolean;
  showExportButton?: boolean;
  /** Nome exato da coluna Fluig com data/hora base do lead time (opcional). */
  leadTimeColumn?: string;
  /** Nome exato da coluna Fluig de natureza orçamentária (opcional). */
  naturezaOrcamentariaColumn?: string;
};

/** Histórico / título com “Ver mais”, no padrão PNCP. */
function FluigHistoricoExpandable({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);
  const value = text?.trim() || '';

  useEffect(() => {
    setExpanded(false);
  }, [value]);

  useEffect(() => {
    const el = textRef.current;
    if (!el || !value) {
      setNeedsToggle(false);
      return;
    }
    if (expanded) return;
    setNeedsToggle(el.scrollHeight > el.clientHeight + 2);
  }, [value, expanded]);

  if (!value || value === '—') {
    return <p className="text-sm text-gray-500 dark:text-gray-400">—</p>;
  }

  return (
    <div className="min-w-0 max-w-xl" onClick={(e) => e.stopPropagation()}>
      <p
        ref={textRef}
        className={`text-sm leading-relaxed text-gray-900 dark:text-gray-100 ${
          expanded ? '' : 'line-clamp-3'
        }`}
      >
        {value}
      </p>
      {needsToggle || expanded ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-red-600 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          {expanded ? (
            <>
              Ver menos
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            </>
          ) : (
            <>
              Ver mais
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}

export function FluigSolicitacoesPage({
  config,
}: {
  config?: FluigSolicitacoesPageConfig;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedFiliais, setSelectedFiliais] = useState<string[]>([]);
  const [selectedCCs, setSelectedCCs] = useState<string[]>([]);
  const [selectedSetoresSolicitantes, setSelectedSetoresSolicitantes] = useState<string[]>([]);
  const [selectedUrgencias, setSelectedUrgencias] = useState<string[]>([]);
  const [selectedFornecedores, setSelectedFornecedores] = useState<string[]>([]);
  const [selectedNaturezasOrcamentarias, setSelectedNaturezasOrcamentarias] = useState<string[]>([]);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  // Quando o usuário mexe em um filtro (Filial/CC/Fornecedor/…), ele vira o "ativo".
  // Os outros ficam temporariamente ignorados no resultado para evitar influência cruzada.
  const [activeFilterCategory, setActiveFilterCategory] = useState<
    'filial' | 'cc' | 'setorSolicitante' | 'urgencia' | 'fornecedor' | 'naturezaOrcamentaria' | null
  >(null);
  const [selectedEtapaIndex, setSelectedEtapaIndex] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [detail, setDetail] = useState<{
    row: Record<string, unknown>;
    columns: string[];
    datasetId: string;
  } | null>(null);

  const [{ data: userData, isLoading: loadingUser }] = useQueries({
    queries: [
      {
        queryKey: ['user'],
        queryFn: async () => {
          const res = await api.get('/auth/me');
          return res.data;
        },
      },
    ],
  });

  const { costCenters: dbCostCenters } = useCostCenters();
  const datasets = config?.datasets?.length ? config.datasets : DEFAULT_BI_DATASETS;
  const datasetTabLabels = useMemo(() => {
    return datasets.reduce<Record<string, string>>((acc, ds) => {
      acc[ds] = config?.datasetTabLabels?.[ds] ?? DEFAULT_DATASET_TAB_LABELS[ds] ?? ds;
      return acc;
    }, {});
  }, [datasets, config?.datasetTabLabels]);
  const g5TitleDatasets = useMemo(
    () => new Set(config?.g5TitleDatasets ?? [G5_RELATORIO_DATASET_ID]),
    [config?.g5TitleDatasets]
  );
  const datasetId = datasets[activeTab] ?? datasets[0];
  const allowedFiliais = useMemo(() => {
    if (config && 'allowedFiliais' in config) {
      const explicit = config.allowedFiliais ? [...config.allowedFiliais] : null;
      if (explicit === null && config.allowedFiliaisDatasets?.includes(datasetId)) {
        return [...FILIAIS_PERMITIDAS];
      }
      return explicit;
    }
    if (config?.allowedFiliaisDatasets) {
      return config.allowedFiliaisDatasets.includes(datasetId) ? [...FILIAIS_PERMITIDAS] : null;
    }
    return [...FILIAIS_PERMITIDAS];
  }, [config, datasetId]);
  const excludedFiliaisSet = useMemo(
    () => new Set((config?.excludedFiliais ?? []).map((f) => f.trim().toLowerCase())),
    [config?.excludedFiliais]
  );
  const hideFilialFilter = config?.hideFilialFilter ?? false;
  const showProcessCard = config?.showProcessCard ?? true;
  const useEmployeeListLayout = config?.useEmployeeListLayout ?? false;
  const showExportButton = config?.showExportButton ?? false;

  const normalizeStatus = (rawStatus: string): { key: string; label: string } => {
    const s = rawStatus.trim();

    if (datasetId === 'DataSet_G3FollowUp') {
      if (/Etapa\s*108\b/i.test(s)) {
        return { key: 'G3_ETAPA_108_ANALISE_CONTROLADORIA', label: 'Análise Controladoria' };
      }
      if (/Etapa\s*117\b/i.test(s)) {
        return { key: 'G3_ETAPA_117_VALIDACAO_FRETE', label: 'Validação de Frete' };
      }
      if (/Etapa\s*10\b/i.test(s)) {
        return { key: 'G3_ETAPA_10_FINALIZADA', label: 'Finalizada' };
      }
      const g3Norm = s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (/gestor\s+de\s+compras/.test(g3Norm) || /aprovacao\s+do\s+compras/.test(g3Norm)) {
        return { key: 'G3_APROVACAO_DO_COMPRAS', label: 'Aprovação do Compras' };
      }
      if (/setor\s+tecnico/.test(g3Norm)) {
        return { key: 'G3_APROVACAO_SETOR_TECNICO', label: 'Aprovação do Setor Técnico' };
      }
      if (/diretoria/.test(g3Norm)) {
        return { key: 'G3_APROVACAO_DIRETORIA', label: 'Aprovação da Diretoria' };
      }
      if (/estoque/.test(g3Norm)) {
        return { key: 'G3_APROVACAO_ESTOQUE', label: 'Aprovação de Estoque' };
      }
      if (/recotacao/.test(g3Norm)) {
        return { key: 'G3_RECOTACAO', label: 'Recotação' };
      }
      if (/finalizada/.test(g3Norm)) {
        return { key: 'G3_FINALIZADA', label: 'Finalizada' };
      }
      if (/validacao\s+de\s+frete|frete/.test(g3Norm) && /validacao|frete/.test(g3Norm)) {
        return { key: 'G3_VALIDACAO_FRETE', label: 'Validação de Frete' };
      }
    }

    if (datasetId === 'DataSet_G4FollowUp') {
      if (/Etapa\s*24\b/i.test(s) || /Etapa\s*147\b/i.test(s)) {
        return { key: 'G4_ETAPAS_FINALIZADA_24_147', label: 'Finalizada' };
      }
    }

    if (datasetId.startsWith('G5-Relatorio-DF')) {
      if (/Etapa\s*390\b/i.test(s)) {
        return { key: 'G5_DF_ETAPA_390_ANEXAR_NF', label: 'Anexar NF' };
      }
      if (/Etapa\s*395\b/i.test(s)) {
        return { key: 'G5_DF_ETAPA_395_VALIDACAO_NF', label: 'Validação de NF' };
      }
      if (/Etapa\s*117\b/i.test(s)) {
        return { key: 'G5_DF_ETAPA_117_FINALIZADO', label: 'Finalizado' };
      }
      // Fluig às vezes envia etapa como objeto (display) ou texto sem o número 117; RH/salários costuma encerrar com outras redações.
      if (/\b(finalizad[oa]|encerrad[oa]|conclu[íi]d[oa])\b/i.test(s) && !/\b(não|nao)\s+(finaliz|encerr|conclu)/i.test(s)) {
        return { key: 'G5_DF_FINALIZADO_TEXTO', label: 'Finalizado' };
      }
      if (/\bEtapa\s*(11[0-9]|12[0-9])\b/i.test(s) && /\b(finaliz|pagamento|quitad|liquidad|efetuad|pago)\b/i.test(s)) {
        return { key: 'G5_DF_ETAPA_PAGAMENTO_LIQ', label: 'Finalizado' };
      }
    }

    return { key: s || '(sem etapa)', label: s || '(sem etapa)' };
  };

  const ccCodeToName = useMemo(() => {
    const map = new Map<string, string>();
    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    (dbCostCenters || []).forEach((cc: { code?: string; name?: string }) => {
      const code = String(cc.code ?? '').trim();
      const name = String(cc.name ?? '').trim();
      const full = name || code;
      if (!full) return;
      if (code) {
        map.set(code, full);
        map.set(code.replace(/\s+/g, ''), full);
      }
      map.set(normalize(full), full);
      const dashParts = full.split(/\s*[-–—]\s*/);
      if (dashParts.length >= 2) {
        const short = normalize(dashParts.slice(1).join(' - '));
        if (short && !map.has(short)) map.set(short, full);
      }
    });
    return map;
  }, [dbCostCenters]);

  const getCCDisplayLabel = (code: string, hintText?: string): string => {
    const c = String(code).trim();
    if (!c) return '';

    const normalize = (s: string) =>
      s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    const fromSplit = formatFluigBudgetFieldDisplay(c);
    const looksLikeCodeOnly = (s: string) => /^[\d.\s]+$/.test(s.trim());

    const dashParts = c.split(/\s*[-–—]\s*/);
    const codeOnly = dashParts.length >= 2 ? dashParts[0].trim() : c;
    const nameFromValue =
      dashParts.length >= 2 ? dashParts.slice(1).join(' - ').trim() : '';

    const candidates = Array.from(
      new Set(
        [c, codeOnly, codeOnly.replace(/\s+/g, ''), c.replace(/\s+/g, ''), normalize(c), normalize(nameFromValue || c)]
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    );

    const resolvedFromMap: string[] = [];
    for (const key of candidates) {
      const name = ccCodeToName.get(key) || ccCodeToName.get(normalize(key));
      if (!name) continue;
      let cleaned = name;
      if (/^[\d.]+\s*[-–—]\s*/.test(cleaned)) {
        cleaned = cleaned.replace(/^[\d.]+\s*[-–—]\s*/, '').trim();
      }
      const displayName = formatFluigBudgetFieldDisplay(cleaned) ?? cleaned;
      if (displayName) resolvedFromMap.push(displayName);
    }

    if (resolvedFromMap.length === 1) return resolvedFromMap[0]!;
    if (resolvedFromMap.length > 1) {
      const hint = normalize(hintText || '');
      if (hint) {
        const byHint = resolvedFromMap.find((n) => {
          const nn = normalize(n);
          if (hint.includes(nn)) return true;
          const prefix = n.split(/\s*[-–—]\s*/)[0]?.trim();
          return Boolean(prefix && hint.includes(normalize(prefix)));
        });
        if (byHint) return byHint;
      }
      return resolvedFromMap.sort((a, b) => b.length - a.length)[0]!;
    }

    if (nameFromValue && !looksLikeCodeOnly(nameFromValue)) {
      return formatFluigBudgetFieldDisplay(c) ?? nameFromValue;
    }
    if (fromSplit && !looksLikeCodeOnly(fromSplit)) return fromSplit;
    return c;
  };

  const datasetQueries = useQueries({
    queries: datasets.map((datasetId) => ({
      queryKey: ['fluig-dataset', datasetId],
      queryFn: async () => {
        const res = await api.post(`/fluig/datasets/${encodeURIComponent(datasetId)}/data`, {}, {
          timeout: 130000,
        });
        return res.data;
      },
    })),
  });

  const loadingData = datasetQueries.some((q) => q.isLoading);
  const hasError = datasetQueries.some((q) => q.error);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleDatasetTabClick = (idx: number) => {
    if (idx < 0 || idx >= datasets.length) return;
    setActiveTab(idx);
    // Resetar estado de visualização e busca ao trocar de dataset
    setSelectedEtapaIndex(0);
    setCurrentPage(1);
    setSearchText('');
    setActiveFilterCategory(null);
  };

  function buildStatusList(values: Record<string, unknown>[], columns: string[]) {
    const statusCol =
      columns.find((c: string) => /^Etapa_Atual$/i.test(c))
      ?? columns.find((c: string) => /^EtapaAtual$/i.test(c))
      ?? columns.find((c: string) => /^fase_Atual$/i.test(c))
      ?? columns.find((c: string) => /^faseAtual$/i.test(c))
      ?? columns.find((c: string) => /^STATUS$/i.test(c))
      ?? null;
    const idCol =
      columns.find((c: string) => /^IdMov$|^idmov$/i.test(c))
      ?? columns.find((c: string) => /^NUM_PROCES$/i.test(c))
      ?? columns.find((c: string) => /^NUM_SEQ_ESTADO$/i.test(c))
      ?? 'IdMov';
    const historicoCol =
      columns.find((c: string) => /historico/i.test(c))
      ?? columns.find((c: string) => /^titulo_solicitacao$/i.test(c))
      ?? columns.find((c: string) => /^descricao$/i.test(c))
      ?? 'historico';
    const byStatus: Record<string, { label: string; rows: Record<string, unknown>[] }> = {};
    if (statusCol) {
      values.forEach((row: Record<string, unknown>) => {
        const rawStatusCell = formatValue(row[statusCol]);
        const rawStatus =
          rawStatusCell === '—' || rawStatusCell.trim() === '' ? '(sem etapa)' : rawStatusCell.trim();
        const { key, label } = normalizeStatus(rawStatus);
        if (!byStatus[key]) byStatus[key] = { label, rows: [] };
        byStatus[key].rows.push(row);
      });
    }
    if (Object.keys(byStatus).length === 0 && values.length > 0) {
      byStatus['(todos)'] = { label: '(todos)', rows: values };
    }
    const statusList = Object.values(byStatus)
      .map(({ label, rows }) => [label, rows] as const)

    // Ordenar etapas por fluxo (G3/G4) em vez de ordenar por quantidade.
    if (datasetId === 'DataSet_G3FollowUp' || datasetId === 'DataSet_G4FollowUp') {
      const norm = (s: string) =>
        s
          .toLowerCase()
          .normalize('NFD')
          // Evita \p{Diacritic} (Unicode property escapes), que pode falhar no build dependendo do target TS.
          // NFD separa acentos em marks na faixa U+0300..U+036F.
          .replace(/[\u0300-\u036f]/g, '');

      const stageOrderIndex = (label: string): number => {
        const l = norm(label);

        // G3: Aprovação do Compras -> Aprovação do Setor Técnico -> Aprovação da Diretoria -> Finalizada
        if (datasetId === 'DataSet_G3FollowUp') {
          if (l.includes('finalizada')) return 3;
          if (l.includes('diretoria')) return 2;
          if (l.includes('setor tecnico')) return 1;
          if (l.includes('gestor de compras') || l.includes('aprovacao do compras')) return 0;
          return 999;
        }

        // G4: Anexar Comprovante -> Validação Compras -> Anexar Nota Fiscal -> Finalizada
        if (datasetId === 'DataSet_G4FollowUp') {
          if (l.includes('finalizada')) return 3;
          if (l.includes('nota fiscal') || l.includes('nf')) return 2;
          if (l.includes('validacao') || l.includes('validacao compras') || l.includes('validacao compras')) return 1;
          if (l.includes('comprovante')) return 0;
          return 999;
        }

        return 999;
      };

      statusList.sort((a, b) => stageOrderIndex(a[0]) - stageOrderIndex(b[0]));
    } else {
      statusList.sort(([, a], [, b]) => b.length - a.length);
    }
    return { statusList, idCol, historicoCol, statusCol };
  }

  const currentQuery = datasetQueries[activeTab];
  const currentContent = currentQuery?.data?.data?.content;
  const currentValues = (currentContent?.values || []) as Record<string, unknown>[];
  const currentColumns = (currentContent?.columns || (currentValues[0] ? Object.keys(currentValues[0]) : [])) as string[];

  const filialCol = useMemo(
    () =>
      currentColumns.find((c: string) => /^filial$/i.test(c)) ??
      currentColumns.find((c: string) => /filial/i.test(c)) ??
      null,
    [currentColumns]
  );

  const getFilialValue = (row: Record<string, unknown>): string => {
    if (!filialCol) return '';
    const val = row[filialCol];
    if (val != null && typeof val === 'object') {
      const o = val as Record<string, unknown>;
      return String(o.display ?? o.displayValue ?? o.value ?? o.internalValue ?? val).trim();
    }
    return String(val ?? '').trim();
  };

  const currentValuesFilteredByFilial = useMemo(() => {
    if (!filialCol || currentValues.length === 0) return currentValues;

    const hasAllowedFilter = !!(allowedFiliais && allowedFiliais.length > 0);
    const allowedSet = hasAllowedFilter ? new Set<string>(allowedFiliais) : null;

    return currentValues.filter((row) => {
      const filial = getFilialValue(row);
      const filialNorm = filial.trim().toLowerCase();

      if (excludedFiliaisSet.size > 0 && excludedFiliaisSet.has(filialNorm)) return false;
      if (allowedSet && !allowedSet.has(filial)) return false;
      return true;
    });
  }, [currentValues, filialCol, allowedFiliais, excludedFiliaisSet]);

  const movimentoDataHoraCol = useMemo(() => {
    const firstEarly = currentValuesFilteredByFilial[0] as Record<string, unknown> | undefined;

    const override = config?.leadTimeColumn?.trim();
    if (override) {
      const exact = currentColumns.find((c) => c === override);
      if (exact) return exact;
      const low = override.toLowerCase();
      const byName = currentColumns.find((c) => c.toLowerCase() === low);
      if (byName) return byName;
      const norm = (s: string) =>
        s
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim();
      const byNorm = currentColumns.find((c) => norm(c) === norm(override));
      if (byNorm) return byNorm;
      if (firstEarly) {
        const fromKey =
          Object.keys(firstEarly).find((k) => k === override || k.toLowerCase() === low) ??
          Object.keys(firstEarly).find((k) => norm(k) === norm(override));
        if (fromKey) return fromKey;
      }
    }

    const inicioDataFromCols = currentColumns.find(isInicioDataColumnName) ?? null;
    if (inicioDataFromCols) return inicioDataFromCols;
    if (firstEarly) {
      const inicioKey = Object.keys(firstEarly).find(isInicioDataColumnName);
      if (inicioKey) return inicioKey;
    }

    const byLabel = currentColumns.find((c) => {
      const label = formatLabel(c).toLowerCase();
      return (
        label === 'movimento data hora' ||
        (/mov/.test(label) && /(data|dt)/.test(label) && /(hora|time)/.test(label))
      );
    });
    if (byLabel) return byLabel;

    const byRaw = currentColumns.find(
      (c) =>
        /movimento.*data.*hora|data.*hora.*movimento/i.test(c) ||
        /data_?hora_?mov|mov_?data_?hora|dh_?mov|dt_?hora_?mov|datahoramov|dhmovimento|data_?movimento|datamovimento|dt_?movimento/i.test(
          c.toLowerCase().replace(/\s+/g, '_')
        )
    );
    if (byRaw) return byRaw;

    const firstRow = firstEarly;
    if (!firstRow) return null;
    const fromKeys =
      Object.keys(firstRow).find((k) => {
        if (/movimento.*data.*hora|data.*hora.*movimento/i.test(k)) return true;
        const compact = k.toLowerCase().replace(/\s+/g, '_');
        return /data_?hora_?mov|mov_?data_?hora|dh_?mov|dt_?hora_?mov|datahoramov|dhmovimento|data_?movimento|datamovimento|dt_?movimento/i.test(
          compact
        );
      }) ?? null;
    if (fromKeys) return fromKeys;

    return pickLeadTimeColumnHeuristic(
      currentValuesFilteredByFilial,
      currentColumns.length > 0 ? currentColumns : Object.keys(firstRow)
    );
  }, [currentColumns, currentValuesFilteredByFilial, config?.leadTimeColumn]);

  const getLeadTimeFromRow = (row: Record<string, unknown>): string => {
    if (!movimentoDataHoraCol) return '—';
    const date = parseCellDate(row[movimentoDataHoraCol]);
    return formatLeadTime(date);
  };

  const { statusList: fullStatusList, idCol, historicoCol, statusCol } = useMemo(
    () => buildStatusList(currentValuesFilteredByFilial, currentColumns),
    [currentValuesFilteredByFilial, currentColumns, datasetId]
  );
  const ccColFromColumns = currentColumns.find((c: string) => {
    const t = c.trim();
    return (
      /^cc$/i.test(t) ||
      /^contrato$/i.test(t) ||
      /ccusto|cc_custo|centro[\s_-]?custo|centrocusto|cod[\s_-]?ccusto/i.test(t) ||
      /centro\s+de\s+custo\s+mecanismo/i.test(t) ||
      /custo\s+mecanismo|centro.*custo.*mecanismo/i.test(t)
    );
  }) ?? null;
  const fornecedorCol = currentColumns.find((c: string) => /^fornecedor$/i.test(c)) ?? null;
  const setorSolicitanteCol =
    currentColumns.find((c: string) => /^setor[_\s-]?solicitante$/i.test(c))
    ?? currentColumns.find((c: string) => /setor.*solicitante|solicitante.*setor/i.test(c))
    ?? null;
  const urgenciaCol =
    currentColumns.find((c: string) => /^urgencia$/i.test(c))
    ?? currentColumns.find((c: string) => /urg[eê]ncia|prioridade/i.test(c))
    ?? null;

  const naturezaOrcamentariaCol = useMemo(() => {
    const override = config?.naturezaOrcamentariaColumn?.trim();
    if (override) {
      const exact = currentColumns.find((c) => c === override);
      if (exact) return exact;
      const low = override.toLowerCase();
      const byName = currentColumns.find((c) => c.toLowerCase() === low);
      if (byName) return byName;
      const firstRow = currentValuesFilteredByFilial[0] as Record<string, unknown> | undefined;
      if (firstRow) {
        const fromKey = Object.keys(firstRow).find((k) => k === override || k.toLowerCase() === low);
        if (fromKey) return fromKey;
      }
    }

    const first = currentValuesFilteredByFilial[0] as Record<string, unknown> | undefined;
    return pickBestNaturezaOrcamentariaColumn(currentColumns, first, currentValuesFilteredByFilial);
  }, [currentColumns, currentValuesFilteredByFilial, config?.naturezaOrcamentariaColumn]);

  // Resolve coluna CC: usa columns, ou busca nas chaves reais das linhas (G4 usa "Centro De Custo Mecanismo")
  const ccColumnsCandidates = useMemo(() => {
    const matchesCc = (k: string) => {
      const n = k.toLowerCase().replace(/\s+/g, ' ').trim();
      return (
        n === 'cc' ||
        n === 'contrato' ||
        /ccusto|cc_custo|centro[\s_-]?custo|centrocusto|cod[\s_-]?ccusto|custo\s*mecanismo|mecanismo.*custo/.test(
          n
        )
      );
    };
    const fromColumns = currentColumns.filter(matchesCc);
    const fromFirstRow = currentValues[0]
      ? Object.keys(currentValues[0] as Record<string, unknown>).filter(matchesCc)
      : [];
    return Array.from(new Set([...fromColumns, ...fromFirstRow]));
  }, [currentColumns, currentValues]);

  const ccColResolved = useMemo(() => {
    if (ccColFromColumns) return ccColFromColumns;
    return ccColumnsCandidates[0] ?? null;
  }, [ccColFromColumns, ccColumnsCandidates]);

  const filiais = useMemo(() => {
    if (!filialCol) return [];
    const set = new Set<string>();
    currentValuesFilteredByFilial.forEach((row: Record<string, unknown>) => {
      const v = getFilialValue(row);
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [currentValuesFilteredByFilial, filialCol]);

  const readFluigCellString = (row: Record<string, unknown>, col: string): string => {
    const val = row[col];
    if (val != null && typeof val === 'object') {
      const o = val as Record<string, unknown>;
      return String(o.display ?? o.displayValue ?? o.internalValue ?? o.value ?? val).trim();
    }
    return String(val ?? '').trim();
  };

  const looksLikeCcCodeOnly = (s: string) => /^[\d.\s]+$/.test(s.trim());

  const getCCValue = (row: Record<string, unknown>): string => {
    const cols =
      ccColumnsCandidates.length > 0
        ? ccColumnsCandidates
        : ccColResolved
          ? [ccColResolved]
          : [];
    let codeFallback = '';
    for (const col of cols) {
      const v = readFluigCellString(row, col);
      if (!v || v === '—') continue;
      if (!looksLikeCcCodeOnly(v)) return v;
      if (!codeFallback) codeFallback = v;
    }
    return codeFallback;
  };

  const centrosCusto = useMemo(() => {
    if (!ccColResolved) return [];
    const set = new Set<string>();
    currentValuesFilteredByFilial.forEach((row) => {
      const v = getCCValue(row);
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [currentValuesFilteredByFilial, ccColResolved]);

  const fornecedores = useMemo(() => {
    if (!fornecedorCol) return [];
    const set = new Set<string>();
    currentValuesFilteredByFilial.forEach((row: Record<string, unknown>) => {
      const v = String(row[fornecedorCol] ?? '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [currentValuesFilteredByFilial, fornecedorCol]);

  const getSetorSolicitanteValue = (row: Record<string, unknown>): string => {
    if (!setorSolicitanteCol) return '';
    const val = row[setorSolicitanteCol];
    if (val != null && typeof val === 'object') {
      const o = val as Record<string, unknown>;
      return String(o.display ?? o.displayValue ?? o.internalValue ?? o.value ?? val).trim();
    }
    return String(val ?? '').trim();
  };

  const setoresSolicitantes = useMemo(() => {
    if (!setorSolicitanteCol) return [];
    const set = new Set<string>();
    currentValuesFilteredByFilial.forEach((row: Record<string, unknown>) => {
      const v = getSetorSolicitanteValue(row);
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [currentValuesFilteredByFilial, setorSolicitanteCol]);

  const getUrgenciaValue = (row: Record<string, unknown>): string => {
    if (!urgenciaCol) return '';
    const val = row[urgenciaCol];
    if (val != null && typeof val === 'object') {
      const o = val as Record<string, unknown>;
      return String(o.display ?? o.displayValue ?? o.internalValue ?? o.value ?? val).trim();
    }
    return String(val ?? '').trim();
  };

  const urgencias = useMemo(() => {
    if (!urgenciaCol) return [];
    const set = new Set<string>();
    currentValuesFilteredByFilial.forEach((row: Record<string, unknown>) => {
      const v = getUrgenciaValue(row);
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [currentValuesFilteredByFilial, urgenciaCol]);

  const getNaturezaOrcamentariaValue = (row: Record<string, unknown>): string => {
    if (!naturezaOrcamentariaCol) return '';
    const val = row[naturezaOrcamentariaCol];
    if (val != null && typeof val === 'object') {
      const o = val as Record<string, unknown>;
      return String(o.display ?? o.displayValue ?? o.internalValue ?? o.value ?? val).trim();
    }
    return String(val ?? '').trim();
  };

  const getNaturezaOrcamentariaDisplay = (row: Record<string, unknown>): string => {
    const raw = getNaturezaOrcamentariaValue(row);
    return formatFluigBudgetFieldDisplay(raw) ?? raw;
  };

  const naturezasOrcamentarias = useMemo(() => {
    if (!naturezaOrcamentariaCol) return [];
    const set = new Set<string>();
    currentValuesFilteredByFilial.forEach((row: Record<string, unknown>) => {
      const v = getNaturezaOrcamentariaValue(row);
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [currentValuesFilteredByFilial, naturezaOrcamentariaCol]);

  const naturezaOrcamentariaFilterOptions = useMemo(
    () =>
      naturezasOrcamentarias.map((n) => ({
        value: n,
        label: formatFluigBudgetFieldDisplay(n) ?? n,
        searchText: `${n} ${formatFluigBudgetFieldDisplay(n) ?? ''}`,
      })),
    [naturezasOrcamentarias]
  );

  // Resetar todos os filtros APENAS quando o dataset mudar (troca de aba/dataset),
  // nunca quando o usuário alterar seleções (evita loop infinito por referência de array)
  useEffect(() => {
    setSelectedFiliais(filiais);
    setSelectedCCs(centrosCusto);
    setSelectedSetoresSolicitantes(setoresSolicitantes);
    setSelectedUrgencias(urgencias);
    setSelectedFornecedores(fornecedores);
    setSelectedNaturezasOrcamentarias(naturezasOrcamentarias);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasetId]);

  const hasActiveFilters =
    searchText.trim() !== '' ||
    (filialCol && filiais.length > 0 && (selectedFiliais.length === 0 || selectedFiliais.length < filiais.length)) ||
    (ccColResolved && centrosCusto.length > 0 && (selectedCCs.length === 0 || selectedCCs.length < centrosCusto.length)) ||
    (setorSolicitanteCol && setoresSolicitantes.length > 0 && (selectedSetoresSolicitantes.length === 0 || selectedSetoresSolicitantes.length < setoresSolicitantes.length)) ||
    (urgenciaCol && urgencias.length > 0 && (selectedUrgencias.length === 0 || selectedUrgencias.length < urgencias.length)) ||
    (fornecedorCol && fornecedores.length > 0 && (selectedFornecedores.length === 0 || selectedFornecedores.length < fornecedores.length)) ||
    (naturezaOrcamentariaCol &&
      naturezasOrcamentarias.length > 0 &&
      (selectedNaturezasOrcamentarias.length === 0 || selectedNaturezasOrcamentarias.length < naturezasOrcamentarias.length));

  const filteredStatusList = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    const applyFilial = activeFilterCategory === 'filial';
    const applyCC = activeFilterCategory === 'cc';
    const applySetorSolicitante = activeFilterCategory === 'setorSolicitante';
    const applyUrgencia = activeFilterCategory === 'urgencia';
    const applyFornecedor = activeFilterCategory === 'fornecedor';
    const applyNaturezaOrcamentaria = activeFilterCategory === 'naturezaOrcamentaria';

    const byFiliais = applyFilial && selectedFiliais.length > 0 ? new Set(selectedFiliais) : null;
    const byCCs = applyCC && selectedCCs.length > 0 ? new Set(selectedCCs) : null;
    const bySetoresSolicitantes = applySetorSolicitante && selectedSetoresSolicitantes.length > 0 ? new Set(selectedSetoresSolicitantes) : null;
    const byUrgencias = applyUrgencia && selectedUrgencias.length > 0 ? new Set(selectedUrgencias) : null;
    const byFornecedores = applyFornecedor && selectedFornecedores.length > 0 ? new Set(selectedFornecedores) : null;
    const byNaturezasOrcamentarias =
      applyNaturezaOrcamentaria && selectedNaturezasOrcamentarias.length > 0 ? new Set(selectedNaturezasOrcamentarias) : null;

    const matchRow = (row: Record<string, unknown>) => {
      // Aplica SOMENTE a categoria de filtro ativa; as outras não "interferem" no resultado.
      if (applyFilial && filialCol && filiais.length > 0 && selectedFiliais.length === 0) return false;
      if (applyCC && ccColResolved && centrosCusto.length > 0 && selectedCCs.length === 0) return false;
      if (applySetorSolicitante && setorSolicitanteCol && setoresSolicitantes.length > 0 && selectedSetoresSolicitantes.length === 0) return false;
      if (applyUrgencia && urgenciaCol && urgencias.length > 0 && selectedUrgencias.length === 0) return false;
      if (applyFornecedor && fornecedorCol && fornecedores.length > 0 && selectedFornecedores.length === 0) return false;
      if (
        applyNaturezaOrcamentaria &&
        naturezaOrcamentariaCol &&
        naturezasOrcamentarias.length > 0 &&
        selectedNaturezasOrcamentarias.length === 0
      )
        return false;

      if (byFiliais && filialCol && !byFiliais.has(getFilialValue(row))) return false;
      if (byCCs && ccColResolved && !byCCs.has(getCCValue(row))) return false;
      if (bySetoresSolicitantes && setorSolicitanteCol && !bySetoresSolicitantes.has(getSetorSolicitanteValue(row))) return false;
      if (byUrgencias && urgenciaCol && !byUrgencias.has(getUrgenciaValue(row))) return false;
      if (byFornecedores && fornecedorCol && !byFornecedores.has(String(row[fornecedorCol] ?? '').trim()))
        return false;
      if (byNaturezasOrcamentarias && naturezaOrcamentariaCol && !byNaturezasOrcamentarias.has(getNaturezaOrcamentariaValue(row)))
        return false;
      if (search) {
        const colKeys = currentColumns.slice();
        for (const k of Object.keys(row)) {
          if (!colKeys.includes(k)) colKeys.push(k);
        }
        const found = colKeys.some((col) => {
          const str = formatValue(row[col]).toLowerCase();
          if (str === '—') return false;
          return str.includes(search);
        });
        if (!found) return false;
      }
      return true;
    };

    return fullStatusList.map(([etapa, rows]) => {
      const filtered = rows.filter(matchRow);
      return [etapa, filtered] as const;
    });
  }, [
    fullStatusList,
    selectedFiliais,
    selectedCCs,
    selectedSetoresSolicitantes,
    selectedUrgencias,
    selectedFornecedores,
    selectedNaturezasOrcamentarias,
    searchText,
    currentColumns,
    filialCol,
    ccColResolved,
    setorSolicitanteCol,
    urgenciaCol,
    fornecedorCol,
    naturezaOrcamentariaCol,
    filiais.length,
    centrosCusto.length,
    setoresSolicitantes.length,
    urgencias.length,
    fornecedores.length,
    naturezasOrcamentarias.length,
    activeFilterCategory,
  ]);

  /** Com busca ativa, se a aba atual não tem linhas mas outra aba tem, muda para a primeira aba com resultado (evita “sumir” o IdMov em outra etapa). */
  useEffect(() => {
    const q = searchText.trim();
    if (!q) return;
    const currentRows = filteredStatusList[selectedEtapaIndex]?.[1];
    if (currentRows && currentRows.length > 0) return;
    const idx = filteredStatusList.findIndex(([, rows]) => rows.length > 0);
    if (idx >= 0 && idx !== selectedEtapaIndex) setSelectedEtapaIndex(idx);
  }, [searchText, filteredStatusList, selectedEtapaIndex]);

  useEffect(() => {
    setSelectedEtapaIndex((prev) => Math.min(prev, Math.max(0, filteredStatusList.length - 1)));
  }, [filteredStatusList.length]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedEtapaIndex, searchText, datasetId]);

  const handleClearFilters = () => {
    setSelectedFiliais([...filiais]);
    setSelectedCCs([...centrosCusto]);
    setSelectedSetoresSolicitantes([...setoresSolicitantes]);
    setSelectedUrgencias([...urgencias]);
    setSelectedFornecedores([...fornecedores]);
    setSelectedNaturezasOrcamentarias([...naturezasOrcamentarias]);
    setSearchText('');
    setActiveFilterCategory(null);
  };

  const exportRowsToXlsx = (rows: Record<string, unknown>[], etapaLabel: string) => {
    if (!rows.length) return;
    const exportColumns = ['Etapa', ...currentColumns];
    const aoa: string[][] = [
      exportColumns,
      ...rows.map((row) => [
        etapaLabel,
        ...currentColumns.map((col) => formatValue(row[col])),
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Solicitações');
    const safeEtapa = etapaLabel.toLowerCase().replace(/\s+/g, '-');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `gestao-solicitacoes-${safeEtapa}-${date}.xlsx`);
  };

  if (loadingUser || !userData) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const error = currentQuery?.error;
  const isEmpty = currentValues.length === 0;

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            {config?.title ?? 'Fluig - Processos'}
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            {config?.subtitle ?? 'Veja em qual etapa está cada solicitação e acompanhe o andamento em tempo real'}
          </p>
        </div>

        {/* Abas G3 / G4 / G5 (centralizadas, padrão OCs) */}
        {showProcessCard && (
          <nav
            className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-visible py-3 sm:gap-x-2"
            role="tablist"
            aria-label="Processos Fluig"
          >
            {datasets.map((ds, idx) => {
              const active = activeTab === idx;
              return (
                <AppTabButton
                  key={ds}
                  active={active}
                  onClick={() => handleDatasetTabClick(idx)}
                  className="flex items-center gap-2 whitespace-nowrap px-2 py-2.5 text-xs font-medium sm:px-3 sm:text-sm"
                >
                  {datasetTabLabels[ds]}
                </AppTabButton>
              );
            })}
          </nav>
        )}

        {/* Modal de filtros (padrão do sistema) */}
        {isFiltersModalOpen && !loadingData && !error && !isEmpty ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setIsFiltersModalOpen(false)}
              aria-hidden
            />
            <div className="relative mx-4 w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                <button
                  type="button"
                  onClick={() => setIsFiltersModalOpen(false)}
                  className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="Fechar filtros"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
                {filialCol && !hideFilialFilter ? (
                  <MultiSelectSearchDropdown
                    label="Filial"
                    options={filiais.map((f) => ({ value: f, label: f }))}
                    selected={selectedFiliais}
                    onChange={(next) => {
                      setActiveFilterCategory('filial');
                      setSelectedFiliais(next);
                    }}
                    placeholder="Todas"
                    searchPlaceholder="Pesquisar..."
                    icon={<Building2 className="h-4 w-4" />}
                    noFocusRing
                  />
                ) : null}
                {ccColResolved ? (
                  <MultiSelectSearchDropdown
                    label="Centro de custo"
                    options={centrosCusto.map((c) => {
                      const nome = getCCDisplayLabel(c);
                      return {
                        value: c,
                        label: nome && nome !== '—' ? nome : c,
                        searchText: `${c} ${nome}`,
                      };
                    })}
                    selected={selectedCCs}
                    onChange={(next) => {
                      setActiveFilterCategory('cc');
                      setSelectedCCs(next);
                    }}
                    placeholder="Todos"
                    searchPlaceholder="Pesquisar..."
                    icon={<Layers className="h-4 w-4" />}
                    noFocusRing
                  />
                ) : null}
                {setorSolicitanteCol ? (
                  <MultiSelectSearchDropdown
                    label="Setor solicitante"
                    options={setoresSolicitantes.map((s) => ({ value: s, label: s }))}
                    selected={selectedSetoresSolicitantes}
                    onChange={(next) => {
                      setActiveFilterCategory('setorSolicitante');
                      setSelectedSetoresSolicitantes(next);
                    }}
                    placeholder="Todos"
                    searchPlaceholder="Pesquisar..."
                    icon={<Users className="h-4 w-4" />}
                    noFocusRing
                  />
                ) : null}
                {urgenciaCol ? (
                  <MultiSelectSearchDropdown
                    label="Urgência"
                    options={urgencias.map((u) => ({ value: u, label: u }))}
                    selected={selectedUrgencias}
                    onChange={(next) => {
                      setActiveFilterCategory('urgencia');
                      setSelectedUrgencias(next);
                    }}
                    placeholder="Todas"
                    searchPlaceholder="Pesquisar..."
                    icon={<AlertCircle className="h-4 w-4" />}
                    noFocusRing
                  />
                ) : null}
                {fornecedorCol ? (
                  <MultiSelectSearchDropdown
                    label="Fornecedor"
                    options={fornecedores.map((f) => ({ value: f, label: f }))}
                    selected={selectedFornecedores}
                    onChange={(next) => {
                      setActiveFilterCategory('fornecedor');
                      setSelectedFornecedores(next);
                    }}
                    placeholder="Todos"
                    searchPlaceholder="Pesquisar..."
                    icon={<Truck className="h-4 w-4" />}
                    noFocusRing
                  />
                ) : null}
                {naturezaOrcamentariaCol ? (
                  <MultiSelectSearchDropdown
                    label="Natureza orçamentária"
                    options={naturezaOrcamentariaFilterOptions}
                    selected={selectedNaturezasOrcamentarias}
                    onChange={(next) => {
                      setActiveFilterCategory('naturezaOrcamentaria');
                      setSelectedNaturezasOrcamentarias(next);
                    }}
                    placeholder="Todas"
                    searchPlaceholder="Pesquisar..."
                    icon={<Landmark className="h-4 w-4" />}
                    noFocusRing
                  />
                ) : null}
              </div>
              <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <RotateCcw className="h-4 w-4" />
                  Limpar filtros
                </button>
                <button
                  type="button"
                  onClick={() => setIsFiltersModalOpen(false)}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  Fechar
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {hasError && (
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-red-800 dark:text-red-200">Erro ao carregar dados</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Verifique as variáveis OAuth do Fluig no backend e se os processos existem.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {loadingData && (
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-red-600" />
                <p className="text-gray-500 dark:text-gray-400">Carregando processos...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loadingData && (
          <>
            {error && (
              <Card className="border-red-200 dark:border-red-800">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      Erro ao carregar {datasetId}. Verifique se o processo existe no Fluig.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {!error && isEmpty && (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col items-center justify-center py-12">
                    <Building2 className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">
                      Nenhum dado em {datasetTabLabels[datasetId] ?? datasetId}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      O Fluig pode demorar para responder nesta aba. Troque de aba e volte, ou recarregue a página.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {!error && !isEmpty && filteredStatusList.length > 0 && (() => {
              const [etapaAtual, rowsAtuais] = filteredStatusList[selectedEtapaIndex] ?? filteredStatusList[0];
              const showLeadTimeColumn = !!movimentoDataHoraCol && !isEtapaSemLeadTime(etapaAtual);
              const getHistText = (r: Record<string, unknown>) => {
                const val = r[historicoCol];
                if (val == null) return '—';
                if (typeof val === 'object' && val !== null) {
                  const o = val as Record<string, unknown>;
                  return String(o.display ?? o.displayValue ?? o.value ?? val);
                }
                return String(val);
              };
              return (
                <div className="space-y-5">
                    <div className="flex justify-center overflow-visible px-1 py-1">
                      <nav
                        className="flex max-w-full flex-wrap justify-center gap-x-1 gap-y-2 overflow-visible py-1 sm:gap-x-2"
                        role="tablist"
                        aria-label="Etapas do processo"
                      >
                        {filteredStatusList.map(([etapa, rows], idx) => {
                          const active = idx === selectedEtapaIndex;
                          return (
                            <AppTabButton
                              key={`${datasetId}-${etapa}`}
                              active={active}
                              onClick={() => setSelectedEtapaIndex(idx)}
                              className="flex items-center gap-1.5 whitespace-nowrap px-2 py-2 text-xs font-medium sm:px-3 sm:text-sm"
                              title={`${etapa} — ${rows.length} registro(s)`}
                            >
                              {etapa}
                              <span className="app-tab__badge">
                                <TabCountBadge count={rows.length} active={active} tone="red" />
                              </span>
                            </AppTabButton>
                          );
                        })}
                      </nav>
                    </div>

                  <Card className={`${cadastroListClasses.card} overflow-hidden`}>
                    <CardHeader className={cadastroListClasses.cardHeader}>
                      <div className={cadastroListClasses.cardHeaderRow}>
                        <div className={cadastroListClasses.cardHeaderIconRow}>
                          <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                            <FileText className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate" title={etapaAtual}>
                              {etapaAtual}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                              {rowsAtuais.length === 0
                                ? 'Nenhuma solicitação'
                                : `${rowsAtuais.length} registro(s) nesta etapa`}
                            </p>
                          </div>
                        </div>
                        <div className={cadastroListClasses.cardToolbar}>
                          <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                            <input
                              type="text"
                              role="searchbox"
                              placeholder="Buscar..."
                              value={searchText}
                              onChange={(e) => setSearchText(e.target.value)}
                              autoComplete="off"
                              className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                            />
                            {searchText ? (
                              <button
                                type="button"
                                onClick={() => setSearchText('')}
                                aria-label="Limpar busca"
                                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() => setIsFiltersModalOpen(true)}
                            className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                              hasActiveFilters
                                ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                                : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                            }`}
                            aria-label="Abrir filtro"
                            title={hasActiveFilters ? 'Filtro (ativo)' : 'Filtro'}
                          >
                            <Filter className="h-4 w-4" />
                            {hasActiveFilters ? (
                              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                            ) : null}
                          </button>
                          {showExportButton && (
                            <button
                              type="button"
                              onClick={() => exportRowsToXlsx(rowsAtuais, etapaAtual)}
                              disabled={rowsAtuais.length === 0}
                              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                              aria-label="Exportar solicitações filtradas"
                              title="Exportar solicitações filtradas"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className={cadastroListClasses.cardContent}>
                    {(() => {
                      const { startItem, endItem, totalPages } = getCadastroListRange(
                        currentPage,
                        FLUIG_LIST_PAGE_SIZE,
                        rowsAtuais.length
                      );
                      const safePage = Math.min(currentPage, totalPages);
                      const rowsToShow = rowsAtuais.slice(
                        (safePage - 1) * FLUIG_LIST_PAGE_SIZE,
                        (safePage - 1) * FLUIG_LIST_PAGE_SIZE + FLUIG_LIST_PAGE_SIZE
                      );
                      const listShowFilial = useEmployeeListLayout && !!filialCol && !hideFilialFilter;
                      const listShowCC = useEmployeeListLayout && !!ccColResolved;
                      const listShowNatureza = useEmployeeListLayout && !!naturezaOrcamentariaCol;
                      const listShowFornecedor = useEmployeeListLayout && !!fornecedorCol;
                      const thPad = 'py-4';
                      const tdPad = 'py-3';
                      const solicitacaoHeader = g5TitleDatasets.has(datasetId) ? 'Título da Solicitação' : 'Histórico';
                      const emptyColSpan = useEmployeeListLayout
                        ? 3 +
                          (listShowFilial ? 1 : 0) +
                          (listShowCC ? 1 : 0) +
                          (listShowNatureza ? 1 : 0) +
                          (listShowFornecedor ? 1 : 0) +
                          (showLeadTimeColumn ? 1 : 0)
                        : showLeadTimeColumn
                          ? 4
                          : 3;
                      return (
                        <>
                          {rowsAtuais.length > 0 ? (
                            <CadastroListSummary
                              startItem={startItem}
                              endItem={endItem}
                              total={rowsAtuais.length}
                              itemLabel="solicitação"
                              itemLabelPlural="solicitações"
                              currentPage={safePage}
                              totalPages={totalPages}
                            />
                          ) : null}
                          <div className="table-scroll">
                            <table className="w-full text-sm">
                              <thead
                                className={
                                  useEmployeeListLayout
                                    ? 'sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800'
                                    : 'bg-gray-50 dark:bg-gray-800/80 sticky top-0 z-10'
                                }
                              >
                                <tr>
                                  {useEmployeeListLayout ? (
                                    <>
                                      <th
                                        className={`px-3 sm:px-4 ${thPad} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24 sm:w-28 shrink-0`}
                                      >
                                        IdMov
                                      </th>
                                      <th
                                        className={`px-3 sm:px-6 ${thPad} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[18rem]`}
                                      >
                                        {solicitacaoHeader}
                                      </th>
                                      {listShowCC && (
                                        <th
                                          className={`px-3 sm:px-6 ${thPad} text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[10rem]`}
                                        >
                                          Centro de custo
                                        </th>
                                      )}
                                      {listShowNatureza && (
                                        <th
                                          className={`px-3 sm:px-6 ${thPad} text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[10rem]`}
                                        >
                                          Natureza
                                        </th>
                                      )}
                                      {listShowFornecedor && (
                                        <th
                                          className={`px-3 sm:px-6 ${thPad} text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[10rem]`}
                                        >
                                          Fornecedor
                                        </th>
                                      )}
                                      {listShowFilial && (
                                        <th
                                          className={`px-3 sm:px-6 ${thPad} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}
                                        >
                                          Filial
                                        </th>
                                      )}
                                      {showLeadTimeColumn && (
                                        <th
                                          className={`px-3 sm:px-6 ${thPad} text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap`}
                                        >
                                          Lead time
                                        </th>
                                      )}
                                      <th className={ACTIONS_COL_TH}>Ações</th>
                                    </>
                                  ) : (
                                    <>
                                      <th
                                        className="px-5 py-3 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28"
                                      >
                                        IdMov
                                      </th>
                                      <th
                                        className="px-5 py-3 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[18rem]"
                                      >
                                        {solicitacaoHeader}
                                      </th>
                                      {showLeadTimeColumn && (
                                        <th
                                          className="px-5 py-3 text-center font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32"
                                        >
                                          Lead time
                                        </th>
                                      )}
                                      <th className={ACTIONS_COL_TH}>Ações</th>
                                    </>
                                  )}
                                </tr>
                              </thead>
                              <tbody
                                className={
                                  useEmployeeListLayout
                                    ? 'bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700'
                                    : ''
                                }
                              >
                                {rowsToShow.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={emptyColSpan}
                                      className="px-5 py-12 text-center text-gray-500 dark:text-gray-400 text-sm"
                                    >
                                      Nenhuma solicitação nesta etapa. Tente outro termo na busca ou limpe os filtros.
                                    </td>
                                  </tr>
                                ) : (
                                  rowsToShow.map((row, i) => {
                                    const hist = getHistText(row);
                                    const idStr = formatValue(row[idCol] ?? '');
                                    const openDetail = () => setDetail({ row, columns: currentColumns, datasetId });
                                    if (useEmployeeListLayout) {
                                      const ccRaw = getCCValue(row);
                                      const ccNome = getCCDisplayLabel(ccRaw, getHistText(row));
                                      const processId = getFluigProcessInstanceId(row, currentColumns, idCol);
                                      return (
                                        <tr
                                          key={(safePage - 1) * FLUIG_LIST_PAGE_SIZE + i}
                                          onClick={openDetail}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                              event.preventDefault();
                                              openDetail();
                                            }
                                          }}
                                          tabIndex={0}
                                          role="button"
                                          className={getListTableRowClassName(true)}
                                        >
                                          <td
                                            className={`px-3 sm:px-4 ${tdPad} align-middle text-left whitespace-nowrap`}
                                          >
                                            <ListRowNavigableLabel className="font-mono font-medium tabular-nums">
                                              {idStr}
                                            </ListRowNavigableLabel>
                                          </td>
                                          <td className={`px-3 sm:px-6 ${tdPad} align-middle text-left`}>
                                            <FluigHistoricoExpandable text={hist} />
                                          </td>
                                          {listShowCC && (
                                            <td
                                              className={`px-3 sm:px-6 ${tdPad} align-middle text-sm text-center text-gray-700 dark:text-gray-300`}
                                            >
                                              <span
                                                className="line-clamp-2 mx-auto inline-block max-w-[14rem] text-center align-middle"
                                                title={ccNome && ccNome !== '—' ? ccNome : undefined}
                                              >
                                                {ccNome || '—'}
                                              </span>
                                            </td>
                                          )}
                                          {listShowNatureza && (
                                            <td
                                              className={`px-3 sm:px-6 ${tdPad} align-middle text-sm text-center text-gray-700 dark:text-gray-300 max-w-[16rem]`}
                                            >
                                              <span
                                                className="line-clamp-2 mx-auto inline-block max-w-[16rem] text-center align-middle"
                                                title={getNaturezaOrcamentariaDisplay(row) || undefined}
                                              >
                                                {getNaturezaOrcamentariaDisplay(row) || '—'}
                                              </span>
                                            </td>
                                          )}
                                          {listShowFornecedor && fornecedorCol && (
                                            <td
                                              className={`px-3 sm:px-6 ${tdPad} align-middle text-sm text-center text-gray-700 dark:text-gray-300 max-w-xs`}
                                            >
                                              <span
                                                className="line-clamp-2 mx-auto inline-block max-w-xs text-center align-middle"
                                                title={formatValue(row[fornecedorCol])}
                                              >
                                                {formatValue(row[fornecedorCol])}
                                              </span>
                                            </td>
                                          )}
                                          {listShowFilial && (
                                            <td
                                              className={`px-3 sm:px-6 ${tdPad} align-middle text-sm text-center text-gray-700 dark:text-gray-300 max-w-[12rem]`}
                                            >
                                              <span
                                                className="line-clamp-2 mx-auto inline-block max-w-[12rem] text-center"
                                                title={getFilialValue(row) || undefined}
                                              >
                                                {getFilialValue(row) || '—'}
                                              </span>
                                            </td>
                                          )}
                                          {showLeadTimeColumn && (
                                            <td
                                              className={`px-3 sm:px-6 ${tdPad} align-middle text-sm text-center text-gray-700 dark:text-gray-300 whitespace-nowrap tabular-nums`}
                                            >
                                              {getLeadTimeFromRow(row)}
                                            </td>
                                          )}
                                          <td className={ACTIONS_COL_TD}>
                                            <div className="flex justify-center">
                                              {processId ? (
                                                <a
                                                  href={buildFluigWorkflowProcessViewUrl(processId)}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  onClick={(event) => event.stopPropagation()}
                                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                                                  aria-label={`Abrir solicitação ${processId} no Fluig`}
                                                  title="Abrir no Fluig"
                                                >
                                                  <ExternalLink className="h-4 w-4" aria-hidden />
                                                </a>
                                              ) : (
                                                <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                                              )}
                                            </div>
                                          </td>
                                        </tr>
                                      );
                                    }
                                    const processId = getFluigProcessInstanceId(row, currentColumns, idCol);
                                    return (
                                      <tr
                                        key={(safePage - 1) * FLUIG_LIST_PAGE_SIZE + i}
                                        onClick={openDetail}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            openDetail();
                                          }
                                        }}
                                        tabIndex={0}
                                        role="button"
                                        className={getListTableRowClassName(
                                          true,
                                          'border-b border-gray-100 dark:border-gray-700/50 last:border-b-0'
                                        )}
                                      >
                                        <td className="px-5 py-3 align-middle">
                                          <ListRowNavigableLabel className="font-mono font-medium">
                                            {idStr}
                                          </ListRowNavigableLabel>
                                        </td>
                                        <td className="px-5 py-3 text-gray-800 dark:text-gray-200 align-middle overflow-hidden leading-relaxed">
                                          <FluigHistoricoExpandable text={hist} />
                                        </td>
                                        {showLeadTimeColumn && (
                                          <td className="px-5 py-3 text-gray-800 dark:text-gray-200 align-middle whitespace-nowrap text-center tabular-nums">
                                            {getLeadTimeFromRow(row)}
                                          </td>
                                        )}
                                        <td className={ACTIONS_COL_TD}>
                                          <div className="flex justify-center">
                                            {processId ? (
                                              <a
                                                href={buildFluigWorkflowProcessViewUrl(processId)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(event) => event.stopPropagation()}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-red-600 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-red-400"
                                                aria-label={`Abrir solicitação ${processId} no Fluig`}
                                                title="Abrir no Fluig"
                                              >
                                                <ExternalLink className="h-4 w-4" aria-hidden />
                                              </a>
                                            ) : (
                                              <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })
                                )}
                              </tbody>
                            </table>
                          </div>
                          <ListPagination
                            currentPage={safePage}
                            totalPages={totalPages}
                            onPageChange={setCurrentPage}
                            className={cadastroListClasses.pagination}
                          />
                        </>
                      );
                    })()}
                    </CardContent>
                  </Card>
                </div>
              );
            })()}

            {!error && !isEmpty && filteredStatusList.length === 0 && hasActiveFilters && (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Search className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                    <p className="text-gray-600 dark:text-gray-400">Nenhum resultado para os filtros</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Tente outro termo ou etapa.</p>
                    <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 w-full max-w-md">
                      <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                        <input
                          type="text"
                          placeholder="Buscar..."
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                          className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 dark:focus:border-red-500"
                        />
                        {searchText && (
                          <button
                            type="button"
                            onClick={() => setSearchText('')}
                            aria-label="Limpar busca"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsFiltersModalOpen(true)}
                        className="relative inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <Filter className="h-4 w-4" />
                        Filtro
                      </button>
                      <button
                        type="button"
                        onClick={handleClearFilters}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm transition-colors whitespace-nowrap"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Limpar filtros
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Modal detalhe da solicitação */}
      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? formatSolicitacaoModalTitle(detail.columns, detail.row) : 'Detalhe'}
        size="xl"
      >
        {detail &&
          (() => {
            const idColSkip = findSolicitacaoIdColumn(detail.columns);
            const numInTitle =
              idColSkip &&
              (() => {
                const n = formatValue(detail.row[idColSkip]);
                return n && n !== '—';
              })();
            const skipCols = new Set<string>();
            if (idColSkip && numInTitle) skipCols.add(idColSkip);

            const buckets: string[][] = [
              ...FLUIG_DETAIL_MODAL_SECTIONS.map(() => [] as string[]),
              [] as string[],
            ];
            for (const col of detail.columns) {
              if (skipCols.has(col)) continue;
              const idx = fluigDetailModalSectionIndex(col);
              buckets[idx].push(col);
            }
            const sortCols = (cols: string[]) =>
              [...cols].sort((a, b) => formatLabel(a).localeCompare(formatLabel(b), 'pt-BR'));

            const renderField = (col: string) => {
              const value = formatValue(detail.row[col]);
              const isLong = value.length > 70;
              return (
                <div key={col} className={isLong ? 'sm:col-span-2' : ''}>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {formatLabel(col)}
                  </dt>
                  <dd className="text-sm text-gray-900 dark:text-gray-100 break-words min-w-0 leading-relaxed">
                    {value || '—'}
                  </dd>
                </div>
              );
            };

            return (
              <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-4">
                {FLUIG_DETAIL_MODAL_SECTIONS.map((sectionTitle, i) => {
                  const cols = sortCols(buckets[i]);
                  if (cols.length === 0) return null;
                  return (
                    <div
                      key={sectionTitle}
                      className="rounded-xl border border-gray-200 dark:border-gray-600/80 bg-white dark:bg-gray-900/40 shadow-sm overflow-hidden"
                    >
                      <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-600/80 bg-gray-50/90 dark:bg-gray-800/50">
                        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                          {sectionTitle}
                        </h3>
                      </div>
                      <div className="p-4">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">{cols.map(renderField)}</dl>
                      </div>
                    </div>
                  );
                })}
                {buckets[FLUIG_DETAIL_MODAL_SECTIONS.length].length > 0 && (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-600/80 bg-white dark:bg-gray-900/40 shadow-sm overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-600/80 bg-gray-50/90 dark:bg-gray-800/50">
                      <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Outros campos</h3>
                    </div>
                    <div className="p-4">
                      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4">
                        {sortCols(buckets[FLUIG_DETAIL_MODAL_SECTIONS.length]).map(renderField)}
                      </dl>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
      </Modal>
    </MainLayout>
  );
}
