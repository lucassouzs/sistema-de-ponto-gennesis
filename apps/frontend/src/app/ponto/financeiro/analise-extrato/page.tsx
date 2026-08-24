'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  Filter,
  HardHat,
  BookOpen,
  Briefcase,
  Building2,
  Landmark,
  ListPlus,
  Package,
  PieChart,
  Percent,
  Loader2,
  Search,
  Download,
  TrendingUp,
  Users,
  Wallet,
  X,
  type LucideIcon
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Loading } from '@/components/ui/Loading';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ListPagination } from '@/components/ui/ListPagination';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import {
  SEM_CENTRO_CUSTO_KEY,
  SEM_FORNECEDOR_KEY,
  SEM_NATUREZA_KEY,
  ajusteToExtratoItem,
  isExtratoAjusteManual
} from '@/lib/extratoCaixaAjuste';
import { extratoMatchesAnyNatureCodes, normalizeBudgetNatureCode } from '@/lib/budgetNatureMatch';
import { normalizeNaturezaLabel } from '@/lib/contractPaidNaturezaExclusions';
import {
  exportExtratoCaixaPdf,
  EXTRATO_RESUMO_TOP_SAIDA,
  pickResumoRowsForPdf,
  type ExtratoCaixaPdfAjusteRow
} from '@/lib/exportExtratoCaixaPdf';
import { exportDemonstrativoFinanceiroPdf } from '@/lib/exportDemonstrativoFinanceiroPdf';
import {
  buildExtratoResumoPolo,
  comparePoloKeys,
  extratoMatchesAnyPoloKeys,
  poloGroupKey,
  resolveExtratoPolo
} from '@/lib/extratoCaixaPolo';
import {
  buildExtratoFiltrosDesmarcados,
  findMatchingExtratoFiltroSalvo,
  type ExtratoCaixaFiltroPayload,
  type ExtratoCaixaFiltroSalvo,
  type ExtratoFiltroAllValues,
  type ExtratoFiltroLabelMaps
} from '@/lib/extratoCaixaFiltrosSalvos';
import { ExtratoCaixaAjustesPanel } from './ExtratoCaixaAjustesPanel';
import { ExtratoFluxoDiarioChart } from './ExtratoFluxoDiarioChart';
import { ExtratoFluxoMensalChart } from './ExtratoFluxoMensalChart';
import { ExtratoFluxoProjecaoAnualChart } from './ExtratoFluxoProjecaoAnualChart';
import { ExtratoFiltrosDesmarcadosResumo } from './ExtratoFiltrosDesmarcadosResumo';
import { ExtratoFiltrosModal } from './ExtratoFiltrosModal';
import {
  BalancoFinanceiroTabNav,
  type BalancoFinanceiroTabId
} from './BalancoFinanceiroTabNav';
import {
  ExtratoExportPdfModal,
  type ExtratoPdfNatureMode
} from './ExtratoExportPdfModal';
import {
  MOVIMENTO_TIPO_ALL_VALUES,
  MOVIMENTO_TIPO_FILTER_OPTIONS
} from './extratoFiltrosConstants';
import type { ExtratoCaixaApiResponse, ExtratoCaixaItem } from './extratoCaixaTypes';

const EXTRATO_ITEMS_PER_PAGE = 50;

/** Código da filial no RM → UF exibida no extrato. */
const FILIAL_UF_POR_CODIGO: Record<number, string> = {
  1: 'DF',
  2: 'RS',
  3: 'RN',
  4: 'PB',
  5: 'GO'
};

function formatFilialLabel(codFilial: number | null): string {
  if (codFilial == null) return 'Sem filial';
  const uf = FILIAL_UF_POR_CODIGO[codFilial];
  if (uf) return `FILIAL ${codFilial} - ${uf}`;
  return `Filial ${codFilial}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCurrencyOrDash(value: number): string {
  if (value === 0) return '—';
  return formatCurrency(value);
}

function formatPercent(value: number): string {
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}%`;
}

function parseCalendarDateParts(value: string): { y: number; m: number; d: number } | null {
  const s = value.trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return { y: Number(iso[1]), m: Number(iso[2]), d: Number(iso[3]) };
  }

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return { y: Number(br[3]), m: Number(br[2]), d: Number(br[1]) };
  }

  const parsed = new Date(s);
  if (isNaN(parsed.getTime())) return null;
  return {
    y: parsed.getFullYear(),
    m: parsed.getMonth() + 1,
    d: parsed.getDate()
  };
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const parts = parseCalendarDateParts(value);
  if (!parts) return value;
  const dd = String(parts.d).padStart(2, '0');
  const mm = String(parts.m).padStart(2, '0');
  return `${dd}/${mm}/${parts.y}`;
}

function localDayKey(data: string | null): number | null {
  if (!data) return null;
  const parts = parseCalendarDateParts(data);
  if (!parts) return null;
  return new Date(parts.y, parts.m - 1, parts.d).getTime();
}

function formatIsoDateInputBr(value: string): string {
  const s = value.trim();
  if (!s) return '';
  const parts = s.split('-');
  if (parts.length !== 3) return s;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function parseDateInputToDayKey(value: string): number | null {
  const s = value.trim();
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d).getTime();
}

/** Todos marcados (ou lista vazia) = sem filtro restritivo nesse campo. */
function multiselectFilterShowsAll(selected: string[], allValues: string[]): boolean {
  if (allValues.length === 0) return true;
  return selected.length === 0 || selected.length >= allValues.length;
}

function isMultiselectFilterActive(selected: string[], allValues: string[]): boolean {
  if (allValues.length === 0) return false;
  return selected.length > 0 && selected.length < allValues.length;
}

function extratoMatchesAnyCcCodes(
  codCCusto: string,
  selectedCcCodes: string[],
  allCcCodes: string[]
): boolean {
  if (multiselectFilterShowsAll(selectedCcCodes, allCcCodes)) return true;
  const code = codCCusto.trim();
  if (!code) return selectedCcCodes.includes(SEM_CENTRO_CUSTO_KEY);
  return selectedCcCodes.includes(code);
}

function extratoMatchesAnyFornecedor(
  fornecedor: string,
  selected: string[],
  allFornecedores: string[]
): boolean {
  if (multiselectFilterShowsAll(selected, allFornecedores)) return true;
  const v = fornecedor.trim();
  if (!v) return selected.includes(SEM_FORNECEDOR_KEY);
  return selected.includes(v);
}

function extratoMatchesAnyHistorico(
  historico: string,
  selected: string[],
  allHistoricos: string[]
): boolean {
  if (multiselectFilterShowsAll(selected, allHistoricos)) return true;
  const v = historico.trim();
  if (!v) return false;
  return selected.includes(v);
}

function extratoMatchesAnyTipoOperacao(
  tipoOperacao: string,
  selected: string[],
  allTipos: string[]
): boolean {
  if (multiselectFilterShowsAll(selected, allTipos)) return true;
  const v = tipoOperacao.trim();
  if (!v) return false;
  return selected.includes(v);
}

function extratoMatchesAnyNatureCodesFiltered(
  codNatFinanceira: string,
  selectedNatureCodes: string[],
  allNatureCodes: string[]
): boolean {
  if (multiselectFilterShowsAll(selectedNatureCodes, allNatureCodes)) return true;
  const code = normalizeBudgetNatureCode(codNatFinanceira);
  if (!code) {
    return selectedNatureCodes.includes(SEM_NATUREZA_KEY);
  }
  return extratoMatchesAnyNatureCodes(codNatFinanceira, selectedNatureCodes);
}

function displayCcLabel(item: ExtratoCaixaItem): string {
  return item.ccusto?.trim() || item.codCCusto?.trim() || '—';
}

function displayNatLabel(item: ExtratoCaixaItem): string {
  return item.natureza?.trim() || item.codNatFinanceira?.trim() || '—';
}

function itemEntrada(item: ExtratoCaixaItem): number {
  return item.entrada > 0 ? item.entrada : 0;
}

/** SAÍDA vem negativa do SQL (VALORBAIXA*-1 ou VALOR*-1). */
function itemSaidaAbs(item: ExtratoCaixaItem): number {
  if (item.saida < 0) return Math.abs(item.saida);
  return item.saida > 0 ? item.saida : 0;
}

function itemHasSaida(item: ExtratoCaixaItem): boolean {
  return item.saida !== 0;
}

/** Saldo da linha: entrada + saída (saída já vem negativa do SQL). */
function itemSaldoLinha(item: ExtratoCaixaItem): number {
  return item.entrada + item.saida;
}

/** Naturezas que compõem a Receita Líquida (comparação normalizada, sem acentos). */
const RECEITA_LIQUIDA_NATUREZAS_RAW = [
  'RECEITA - MANUTENCAO',
  'RECEITA - TERCEIRIZACAO MAO DE OBRA',
  'RECEITA - TERCEIRIZADO MAO DE OBRA'
] as const;

const RECEITA_LIQUIDA_NATUREZAS = new Set(
  RECEITA_LIQUIDA_NATUREZAS_RAW.map((n) => normalizeNaturezaLabel(n))
);

function receitaLiquidaLabelMatches(item: ExtratoCaixaItem): boolean {
  const label = normalizeNaturezaLabel(item.natureza?.trim() || '');
  return label.length > 0 && RECEITA_LIQUIDA_NATUREZAS.has(label);
}

function buildReceitaLiquidaNatureCodes(
  items: ExtratoCaixaItem[],
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): Set<string> {
  const codes = new Set<string>();
  for (const item of items) {
    if (!receitaLiquidaLabelMatches(item)) continue;
    const code = normalizeBudgetNatureCode(item.codNatFinanceira);
    if (code) codes.add(code.toUpperCase());
  }
  for (const opt of natureOptions) {
    if (opt.value === SEM_NATUREZA_KEY) continue;
    if (!RECEITA_LIQUIDA_NATUREZAS.has(normalizeNaturezaLabel(opt.label))) continue;
    const code = normalizeBudgetNatureCode(opt.value);
    if (code) codes.add(code.toUpperCase());
  }
  return codes;
}

function itemMatchesReceitaLiquidaNature(
  item: ExtratoCaixaItem,
  natureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): boolean {
  if (receitaLiquidaLabelMatches(item)) return true;
  const code = normalizeBudgetNatureCode(item.codNatFinanceira).toUpperCase();
  if (code && natureCodes.has(code)) return true;
  if (!code) return false;
  const opt = natureOptions.find(
    (o) => normalizeBudgetNatureCode(o.value).toUpperCase() === code
  );
  return Boolean(
    opt && RECEITA_LIQUIDA_NATUREZAS.has(normalizeNaturezaLabel(opt.label))
  );
}

/** RM: saldo da linha; ajuste manual: valor assinado. */
function contribuicaoReceitaLiquida(item: ExtratoCaixaItem): number {
  if (isExtratoAjusteManual(item)) {
    return Number.isFinite(item.valor) ? item.valor : 0;
  }
  return itemSaldoLinha(item);
}

function collectDemonstrativoReceitaLiquidaItems(
  filteredItems: ExtratoCaixaItem[],
  receitaLiquidaNatureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): ExtratoCaixaItem[] {
  const result: ExtratoCaixaItem[] = [];
  for (const item of filteredItems) {
    if (
      !itemMatchesReceitaLiquidaNature(item, receitaLiquidaNatureCodes, natureOptions)
    ) {
      continue;
    }
    if (contribuicaoReceitaLiquida(item) === 0) continue;
    result.push(item);
  }
  return sortItemsForResumoDetalhe(result);
}

/** Naturezas que compõem Gastos com Pessoal (comparação normalizada, sem acentos). */
const GASTOS_PESSOAL_NATUREZAS_RAW = [
  'COMPRA DE MEDICAMENTOS - SV',
  'PENSAO ALIMENTICIA',
  'SEGURO FUNCIONARIOS - SV',
  'GRATIFICACOES/COMISSOES',
  'AUXILIO ALIMENTACAO - SV',
  'INSS',
  'VIAGENS DE COLABORADORES - ALIMENTACAO',
  'BOLSAS E OUTROS GASTOS COM ESTAGIARIOS',
  'ADIANTAMENTO SALARIAL - SV',
  'ASO E EXAMES MEDICOS',
  'FARDAMENTOS',
  'FESTA E EVENTOS',
  'CURSOS E TREINAMENTOS',
  'DIARIAS SALARIAIS',
  'BONIFICACAO META (PREMIACAO) - SV',
  'VIAGENS DE COLABORADORES - HOSPEDAGEM E DIARIAS',
  'VIAGENS DE COLABORADORES - TRANSPORTE',
  'ACRESCIMOS (PESSOAL)',
  'FERIAS',
  'ACOES TRABALHISTAS/ INDENIZACOES/CUSTAS',
  'ACOES TRABALHISTAS/INDENIZACOES/CUSTAS',
  'VALE TRANSPORTE',
  'RESCISAO PESSOAL',
  'FGTS',
  'VALE ALIMENTACAO',
  'SALARIOS E ENCARGOS - COLIGADA',
  'SALARIO'
] as const;

const GASTOS_PESSOAL_NATUREZAS = new Set(
  GASTOS_PESSOAL_NATUREZAS_RAW.map((n) => normalizeNaturezaLabel(n))
);

function gastosPessoalLabelMatches(item: ExtratoCaixaItem): boolean {
  const label = normalizeNaturezaLabel(item.natureza?.trim() || '');
  return label.length > 0 && GASTOS_PESSOAL_NATUREZAS.has(label);
}

function buildGastosPessoalNatureCodes(
  items: ExtratoCaixaItem[],
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): Set<string> {
  const codes = new Set<string>();
  for (const item of items) {
    if (!gastosPessoalLabelMatches(item)) continue;
    const code = normalizeBudgetNatureCode(item.codNatFinanceira);
    if (code) codes.add(code.toUpperCase());
  }
  for (const opt of natureOptions) {
    if (opt.value === SEM_NATUREZA_KEY) continue;
    if (!GASTOS_PESSOAL_NATUREZAS.has(normalizeNaturezaLabel(opt.label))) continue;
    const code = normalizeBudgetNatureCode(opt.value);
    if (code) codes.add(code.toUpperCase());
  }
  return codes;
}

function itemMatchesGastosPessoalNature(
  item: ExtratoCaixaItem,
  natureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): boolean {
  if (gastosPessoalLabelMatches(item)) return true;
  const code = normalizeBudgetNatureCode(item.codNatFinanceira).toUpperCase();
  if (code && natureCodes.has(code)) return true;
  if (!code) return false;
  const opt = natureOptions.find(
    (o) => normalizeBudgetNatureCode(o.value).toUpperCase() === code
  );
  return Boolean(
    opt && GASTOS_PESSOAL_NATUREZAS.has(normalizeNaturezaLabel(opt.label))
  );
}

/** Saídas (valor absoluto) das naturezas de pessoal; ajuste manual negativo conta como gasto. */
function contribuicaoGastosPessoal(item: ExtratoCaixaItem): number {
  if (isExtratoAjusteManual(item)) {
    const v = item.valor;
    if (Number.isFinite(v) && v < 0) return Math.abs(v);
    return 0;
  }
  return itemSaidaAbs(item);
}

function collectDemonstrativoGastosPessoalItems(
  filteredItems: ExtratoCaixaItem[],
  gastosPessoalNatureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): ExtratoCaixaItem[] {
  const result: ExtratoCaixaItem[] = [];
  for (const item of filteredItems) {
    if (!itemMatchesGastosPessoalNature(item, gastosPessoalNatureCodes, natureOptions)) {
      continue;
    }
    if (contribuicaoGastosPessoal(item) === 0) continue;
    result.push(item);
  }
  return sortItemsForResumoDetalhe(result);
}

/** Naturezas que compõem Gastos com Assessoria Externa. */
const GASTOS_ASSESSORIA_EXTERNA_NATUREZAS_RAW = [
  'ASSESSORIA JURIDICA NAO TRABALHISTA',
  'CONTABILIDADE',
  'ASSESSORIA JURIDICA TRABALHISTA',
  'ASSESSORIA GERENCIAL'
] as const;

const GASTOS_ASSESSORIA_EXTERNA_NATUREZAS = new Set(
  GASTOS_ASSESSORIA_EXTERNA_NATUREZAS_RAW.map((n) => normalizeNaturezaLabel(n))
);

function gastosAssessoriaExternaLabelMatches(item: ExtratoCaixaItem): boolean {
  const label = normalizeNaturezaLabel(item.natureza?.trim() || '');
  return label.length > 0 && GASTOS_ASSESSORIA_EXTERNA_NATUREZAS.has(label);
}

function buildGastosAssessoriaExternaNatureCodes(
  items: ExtratoCaixaItem[],
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): Set<string> {
  const codes = new Set<string>();
  for (const item of items) {
    if (!gastosAssessoriaExternaLabelMatches(item)) continue;
    const code = normalizeBudgetNatureCode(item.codNatFinanceira);
    if (code) codes.add(code.toUpperCase());
  }
  for (const opt of natureOptions) {
    if (opt.value === SEM_NATUREZA_KEY) continue;
    if (!GASTOS_ASSESSORIA_EXTERNA_NATUREZAS.has(normalizeNaturezaLabel(opt.label))) continue;
    const code = normalizeBudgetNatureCode(opt.value);
    if (code) codes.add(code.toUpperCase());
  }
  return codes;
}

function itemMatchesGastosAssessoriaExternaNature(
  item: ExtratoCaixaItem,
  natureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): boolean {
  if (gastosAssessoriaExternaLabelMatches(item)) return true;
  const code = normalizeBudgetNatureCode(item.codNatFinanceira).toUpperCase();
  if (code && natureCodes.has(code)) return true;
  if (!code) return false;
  const opt = natureOptions.find(
    (o) => normalizeBudgetNatureCode(o.value).toUpperCase() === code
  );
  return Boolean(
    opt && GASTOS_ASSESSORIA_EXTERNA_NATUREZAS.has(normalizeNaturezaLabel(opt.label))
  );
}

function contribuicaoGastosAssessoriaExterna(item: ExtratoCaixaItem): number {
  if (isExtratoAjusteManual(item)) {
    const v = item.valor;
    if (Number.isFinite(v) && v < 0) return Math.abs(v);
    return 0;
  }
  return itemSaidaAbs(item);
}

function collectDemonstrativoGastosAssessoriaExternaItems(
  filteredItems: ExtratoCaixaItem[],
  gastosAssessoriaExternaNatureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): ExtratoCaixaItem[] {
  const result: ExtratoCaixaItem[] = [];
  for (const item of filteredItems) {
    if (
      !itemMatchesGastosAssessoriaExternaNature(
        item,
        gastosAssessoriaExternaNatureCodes,
        natureOptions
      )
    ) {
      continue;
    }
    if (contribuicaoGastosAssessoriaExterna(item) === 0) continue;
    result.push(item);
  }
  return sortItemsForResumoDetalhe(result);
}

/** Naturezas que compõem Gastos com Empreitas. */
const GASTOS_EMPREITAS_NATUREZAS_RAW = [
  'PROJETOS DE ARQUITETURA / ENGENHARIA',
  'PRESTACAO DE SERVICOS TERCEIRIZADOS - SV',
  'SERVICOS ESPECIALIZADOS DE ENGENHARIA (PF/PJ)',
  'OUTROS SERVICOS TOMADOS'
] as const;

const GASTOS_EMPREITAS_NATUREZAS = new Set(
  GASTOS_EMPREITAS_NATUREZAS_RAW.map((n) => normalizeNaturezaLabel(n))
);

function gastosEmpreitasLabelMatches(item: ExtratoCaixaItem): boolean {
  const label = normalizeNaturezaLabel(item.natureza?.trim() || '');
  return label.length > 0 && GASTOS_EMPREITAS_NATUREZAS.has(label);
}

function buildGastosEmpreitasNatureCodes(
  items: ExtratoCaixaItem[],
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): Set<string> {
  const codes = new Set<string>();
  for (const item of items) {
    if (!gastosEmpreitasLabelMatches(item)) continue;
    const code = normalizeBudgetNatureCode(item.codNatFinanceira);
    if (code) codes.add(code.toUpperCase());
  }
  for (const opt of natureOptions) {
    if (opt.value === SEM_NATUREZA_KEY) continue;
    if (!GASTOS_EMPREITAS_NATUREZAS.has(normalizeNaturezaLabel(opt.label))) continue;
    const code = normalizeBudgetNatureCode(opt.value);
    if (code) codes.add(code.toUpperCase());
  }
  return codes;
}

function itemMatchesGastosEmpreitasNature(
  item: ExtratoCaixaItem,
  natureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): boolean {
  if (gastosEmpreitasLabelMatches(item)) return true;
  const code = normalizeBudgetNatureCode(item.codNatFinanceira).toUpperCase();
  if (code && natureCodes.has(code)) return true;
  if (!code) return false;
  const opt = natureOptions.find(
    (o) => normalizeBudgetNatureCode(o.value).toUpperCase() === code
  );
  return Boolean(
    opt && GASTOS_EMPREITAS_NATUREZAS.has(normalizeNaturezaLabel(opt.label))
  );
}

function contribuicaoGastosEmpreitas(item: ExtratoCaixaItem): number {
  if (isExtratoAjusteManual(item)) {
    const v = item.valor;
    if (Number.isFinite(v) && v < 0) return Math.abs(v);
    return 0;
  }
  return itemSaidaAbs(item);
}

function collectDemonstrativoGastosEmpreitasItems(
  filteredItems: ExtratoCaixaItem[],
  gastosEmpreitasNatureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): ExtratoCaixaItem[] {
  const result: ExtratoCaixaItem[] = [];
  for (const item of filteredItems) {
    if (!itemMatchesGastosEmpreitasNature(item, gastosEmpreitasNatureCodes, natureOptions)) {
      continue;
    }
    if (contribuicaoGastosEmpreitas(item) === 0) continue;
    result.push(item);
  }
  return sortItemsForResumoDetalhe(result);
}

/** Naturezas que compõem Gastos com Materiais. */
const GASTOS_MATERIAIS_NATUREZAS_RAW = [
  'LOUCAS E METAIS',
  'INSUMOS - CONCRETO',
  'INSUMOS - PAISAGISMO',
  'MATERIAL BRUTO DE CONSTRUCAO (CIMENTO, AREIA, BRITA E TIJOLO)',
  'INSUMOS - MADEIRAMENTO',
  'INSUMOS - MATERIAL DE LIMPEZA DE OBRA',
  'MATERIAL DE CLIMATIZACAO',
  'SINALIZACAO',
  'COBERTURA/CALHA',
  'INSUMOS - EPI / EPC',
  'INSUMOS - VIDRACARIA',
  'FRETES E CARREGOS',
  'MATERIAL EXPEDIENTE',
  'INSUMOS - TELECOMUNICACOES',
  'MATERIAL CONSUMO',
  'INSUMOS - FORRO',
  'MARMORE/GRANITO',
  'INSUMOS - IMPERMEABILIZACAO',
  'INSUMOS - FERRAMENTAS EQUIP E MAQ',
  'INSUMOS - PINTURA',
  'INSUMOS - HIDRAULICA',
  'INSUMOS - MARCENARIA',
  'INSUMOS - ALVENARIA',
  'CAIXA - FUNDO FIXO OBRA - SV',
  'INSUMOS - REVESTIMENTOS',
  'INSUMOS - SERRALHERIA E FERRAGENS',
  'INSUMOS - ELETRICA'
] as const;

const GASTOS_MATERIAIS_NATUREZAS = new Set(
  GASTOS_MATERIAIS_NATUREZAS_RAW.map((n) => normalizeNaturezaLabel(n))
);

function gastosMateriaisLabelMatches(item: ExtratoCaixaItem): boolean {
  const label = normalizeNaturezaLabel(item.natureza?.trim() || '');
  return label.length > 0 && GASTOS_MATERIAIS_NATUREZAS.has(label);
}

function buildGastosMateriaisNatureCodes(
  items: ExtratoCaixaItem[],
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): Set<string> {
  const codes = new Set<string>();
  for (const item of items) {
    if (!gastosMateriaisLabelMatches(item)) continue;
    const code = normalizeBudgetNatureCode(item.codNatFinanceira);
    if (code) codes.add(code.toUpperCase());
  }
  for (const opt of natureOptions) {
    if (opt.value === SEM_NATUREZA_KEY) continue;
    if (!GASTOS_MATERIAIS_NATUREZAS.has(normalizeNaturezaLabel(opt.label))) continue;
    const code = normalizeBudgetNatureCode(opt.value);
    if (code) codes.add(code.toUpperCase());
  }
  return codes;
}

function itemMatchesGastosMateriaisNature(
  item: ExtratoCaixaItem,
  natureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): boolean {
  if (gastosMateriaisLabelMatches(item)) return true;
  const code = normalizeBudgetNatureCode(item.codNatFinanceira).toUpperCase();
  if (code && natureCodes.has(code)) return true;
  if (!code) return false;
  const opt = natureOptions.find(
    (o) => normalizeBudgetNatureCode(o.value).toUpperCase() === code
  );
  return Boolean(
    opt && GASTOS_MATERIAIS_NATUREZAS.has(normalizeNaturezaLabel(opt.label))
  );
}

function contribuicaoGastosMateriais(item: ExtratoCaixaItem): number {
  if (isExtratoAjusteManual(item)) {
    const v = item.valor;
    if (Number.isFinite(v) && v < 0) return Math.abs(v);
    return 0;
  }
  return itemSaidaAbs(item);
}

function collectDemonstrativoGastosMateriaisItems(
  filteredItems: ExtratoCaixaItem[],
  gastosMateriaisNatureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): ExtratoCaixaItem[] {
  const result: ExtratoCaixaItem[] = [];
  for (const item of filteredItems) {
    if (!itemMatchesGastosMateriaisNature(item, gastosMateriaisNatureCodes, natureOptions)) {
      continue;
    }
    if (contribuicaoGastosMateriais(item) === 0) continue;
    result.push(item);
  }
  return sortItemsForResumoDetalhe(result);
}

/** Naturezas que compõem Aporte de Capital dos Sócios. */
const APORTE_CAPITAL_SOCIOS_NATUREZAS_RAW = [
  'APORTE DE CAPITAL DE SOCIOS',
  'EMPRESTIMO DE SOCIOS - ENTRADA'
] as const;

const APORTE_CAPITAL_SOCIOS_NATUREZAS = new Set(
  APORTE_CAPITAL_SOCIOS_NATUREZAS_RAW.map((n) => normalizeNaturezaLabel(n))
);

function aporteCapitalSociosLabelMatches(item: ExtratoCaixaItem): boolean {
  const label = normalizeNaturezaLabel(item.natureza?.trim() || '');
  return label.length > 0 && APORTE_CAPITAL_SOCIOS_NATUREZAS.has(label);
}

function buildAporteCapitalSociosNatureCodes(
  items: ExtratoCaixaItem[],
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): Set<string> {
  const codes = new Set<string>();
  for (const item of items) {
    if (!aporteCapitalSociosLabelMatches(item)) continue;
    const code = normalizeBudgetNatureCode(item.codNatFinanceira);
    if (code) codes.add(code.toUpperCase());
  }
  for (const opt of natureOptions) {
    if (opt.value === SEM_NATUREZA_KEY) continue;
    if (!APORTE_CAPITAL_SOCIOS_NATUREZAS.has(normalizeNaturezaLabel(opt.label))) continue;
    const code = normalizeBudgetNatureCode(opt.value);
    if (code) codes.add(code.toUpperCase());
  }
  return codes;
}

function itemMatchesAporteCapitalSociosNature(
  item: ExtratoCaixaItem,
  natureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): boolean {
  if (aporteCapitalSociosLabelMatches(item)) return true;
  const code = normalizeBudgetNatureCode(item.codNatFinanceira).toUpperCase();
  if (code && natureCodes.has(code)) return true;
  if (!code) return false;
  const opt = natureOptions.find(
    (o) => normalizeBudgetNatureCode(o.value).toUpperCase() === code
  );
  return Boolean(
    opt && APORTE_CAPITAL_SOCIOS_NATUREZAS.has(normalizeNaturezaLabel(opt.label))
  );
}

function contribuicaoAporteCapitalSocios(item: ExtratoCaixaItem): number {
  if (isExtratoAjusteManual(item)) {
    return Number.isFinite(item.valor) ? item.valor : 0;
  }
  return itemSaldoLinha(item);
}

function collectDemonstrativoAporteCapitalSociosItems(
  filteredItems: ExtratoCaixaItem[],
  aporteCapitalSociosNatureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): ExtratoCaixaItem[] {
  const result: ExtratoCaixaItem[] = [];
  for (const item of filteredItems) {
    if (
      !itemMatchesAporteCapitalSociosNature(item, aporteCapitalSociosNatureCodes, natureOptions)
    ) {
      continue;
    }
    if (contribuicaoAporteCapitalSocios(item) === 0) continue;
    result.push(item);
  }
  return sortItemsForResumoDetalhe(result);
}

/** Naturezas que compõem Distribuição de Lucro. */
const DISTRIBUICAO_LUCRO_NATUREZAS_RAW = [
  'REPASSES A DEMANDAS DA DIRETORIA - SV',
  'DISTRIBUICAO DE LUCROS'
] as const;

const DISTRIBUICAO_LUCRO_NATUREZAS = new Set(
  DISTRIBUICAO_LUCRO_NATUREZAS_RAW.map((n) => normalizeNaturezaLabel(n))
);

function distribuicaoLucroLabelMatches(item: ExtratoCaixaItem): boolean {
  const label = normalizeNaturezaLabel(item.natureza?.trim() || '');
  return label.length > 0 && DISTRIBUICAO_LUCRO_NATUREZAS.has(label);
}

function buildDistribuicaoLucroNatureCodes(
  items: ExtratoCaixaItem[],
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): Set<string> {
  const codes = new Set<string>();
  for (const item of items) {
    if (!distribuicaoLucroLabelMatches(item)) continue;
    const code = normalizeBudgetNatureCode(item.codNatFinanceira);
    if (code) codes.add(code.toUpperCase());
  }
  for (const opt of natureOptions) {
    if (opt.value === SEM_NATUREZA_KEY) continue;
    if (!DISTRIBUICAO_LUCRO_NATUREZAS.has(normalizeNaturezaLabel(opt.label))) continue;
    const code = normalizeBudgetNatureCode(opt.value);
    if (code) codes.add(code.toUpperCase());
  }
  return codes;
}

function itemMatchesDistribuicaoLucroNature(
  item: ExtratoCaixaItem,
  natureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): boolean {
  if (distribuicaoLucroLabelMatches(item)) return true;
  const code = normalizeBudgetNatureCode(item.codNatFinanceira).toUpperCase();
  if (code && natureCodes.has(code)) return true;
  if (!code) return false;
  const opt = natureOptions.find(
    (o) => normalizeBudgetNatureCode(o.value).toUpperCase() === code
  );
  return Boolean(
    opt && DISTRIBUICAO_LUCRO_NATUREZAS.has(normalizeNaturezaLabel(opt.label))
  );
}

function contribuicaoDistribuicaoLucro(item: ExtratoCaixaItem): number {
  if (isExtratoAjusteManual(item)) {
    const v = item.valor;
    if (Number.isFinite(v) && v < 0) return Math.abs(v);
    return 0;
  }
  return itemSaidaAbs(item);
}

function collectDemonstrativoDistribuicaoLucroItems(
  filteredItems: ExtratoCaixaItem[],
  distribuicaoLucroNatureCodes: Set<string>,
  natureOptions: ReadonlyArray<{ value: string; label: string }>
): ExtratoCaixaItem[] {
  const result: ExtratoCaixaItem[] = [];
  for (const item of filteredItems) {
    if (!itemMatchesDistribuicaoLucroNature(item, distribuicaoLucroNatureCodes, natureOptions)) {
      continue;
    }
    if (contribuicaoDistribuicaoLucro(item) === 0) continue;
    result.push(item);
  }
  return sortItemsForResumoDetalhe(result);
}

function collectDemonstrativoEntradasItems(
  filteredItems: ExtratoCaixaItem[]
): ExtratoCaixaItem[] {
  return sortItemsForResumoDetalhe(
    filteredItems.filter((item) => itemEntrada(item) > 0)
  );
}

function collectDemonstrativoSaidasItems(
  filteredItems: ExtratoCaixaItem[]
): ExtratoCaixaItem[] {
  return sortItemsForResumoDetalhe(filteredItems.filter((item) => itemHasSaida(item)));
}

type DemonstrativoDetalheKind =
  | 'entradas'
  | 'saidas'
  | 'saldo-liquido'
  | 'receita-liquida'
  | 'gastos-pessoal'
  | 'gastos-assessoria-externa'
  | 'gastos-empreitas'
  | 'gastos-materiais'
  | 'aporte-capital-socios'
  | 'distribuicao-lucro';

function uniqueNatureLabelsForDisplay(labels: readonly string[]): string[] {
  const byKey = new Map<string, string>();
  for (const label of labels) {
    const key = normalizeNaturezaLabel(label);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, label);
  }
  return Array.from(byKey.values()).sort((a, b) =>
    a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
  );
}

function demonstrativoCardNatureLabels(kind: DemonstrativoDetalheKind): string[] {
  switch (kind) {
    case 'receita-liquida':
      return uniqueNatureLabelsForDisplay(RECEITA_LIQUIDA_NATUREZAS_RAW);
    case 'gastos-pessoal':
      return uniqueNatureLabelsForDisplay(GASTOS_PESSOAL_NATUREZAS_RAW);
    case 'gastos-assessoria-externa':
      return uniqueNatureLabelsForDisplay(GASTOS_ASSESSORIA_EXTERNA_NATUREZAS_RAW);
    case 'gastos-empreitas':
      return uniqueNatureLabelsForDisplay(GASTOS_EMPREITAS_NATUREZAS_RAW);
    case 'gastos-materiais':
      return uniqueNatureLabelsForDisplay(GASTOS_MATERIAIS_NATUREZAS_RAW);
    case 'aporte-capital-socios':
      return uniqueNatureLabelsForDisplay(APORTE_CAPITAL_SOCIOS_NATUREZAS_RAW);
    case 'distribuicao-lucro':
      return uniqueNatureLabelsForDisplay(DISTRIBUICAO_LUCRO_NATUREZAS_RAW);
    default:
      return [];
  }
}

function DemonstrativoNaturezasIncluidas({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50/80 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/40">
      <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Naturezas incluídas na soma ({labels.length})
      </p>
      <ul className="mt-2 flex max-h-32 flex-wrap gap-1.5 overflow-y-auto sm:max-h-40">
        {labels.map((label) => (
          <li
            key={label}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs leading-snug text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function valorLinhaDemonstrativoDetalhe(
  item: ExtratoCaixaItem,
  kind: DemonstrativoDetalheKind
): number {
  if (kind === 'receita-liquida') return contribuicaoReceitaLiquida(item);
  if (kind === 'gastos-pessoal') return -contribuicaoGastosPessoal(item);
  if (kind === 'gastos-assessoria-externa') return -contribuicaoGastosAssessoriaExterna(item);
  if (kind === 'gastos-empreitas') return -contribuicaoGastosEmpreitas(item);
  if (kind === 'gastos-materiais') return -contribuicaoGastosMateriais(item);
  if (kind === 'aporte-capital-socios') return contribuicaoAporteCapitalSocios(item);
  if (kind === 'distribuicao-lucro') return -contribuicaoDistribuicaoLucro(item);
  if (kind === 'saidas') return item.saida;
  if (kind === 'saldo-liquido') return itemSaldoLinha(item);
  return itemEntrada(item);
}

function isDemonstrativoFluxoKind(
  kind: DemonstrativoDetalheKind | null
): kind is 'entradas' | 'saidas' | 'saldo-liquido' {
  return kind === 'entradas' || kind === 'saidas' || kind === 'saldo-liquido';
}

function ExtratoDemonstrativoDetalheModal({
  kind,
  onClose,
  items,
  chartItems
}: {
  kind: DemonstrativoDetalheKind | null;
  onClose: () => void;
  items: ExtratoCaixaItem[];
  /** Série do gráfico geral (ex.: recorte da empresa nos cards de fluxo). */
  chartItems?: ExtratoCaixaItem[];
}) {
  const [selectedItem, setSelectedItem] = useState<ExtratoCaixaItem | null>(null);
  const title =
    kind === 'receita-liquida'
      ? 'Receita Líquida'
      : kind === 'gastos-pessoal'
        ? 'Gastos com Pessoal'
        : kind === 'gastos-assessoria-externa'
          ? 'Gastos com Assessoria Externa'
          : kind === 'gastos-empreitas'
            ? 'Gastos com Empreitas'
            : kind === 'gastos-materiais'
              ? 'Gastos com Materiais'
              : kind === 'aporte-capital-socios'
          ? 'Aporte de Capital dos Socios'
          : kind === 'distribuicao-lucro'
            ? 'Distribuição de Lucro'
            : kind === 'entradas'
            ? 'Entradas'
            : kind === 'saidas'
              ? 'Saídas'
              : kind === 'saldo-liquido'
                ? 'Saldo Líquido'
            : '';
  const sorted = useMemo(() => sortItemsForResumoDetalhe(items), [items]);
  const stats = useMemo(() => {
    if (!kind) {
      return { totalEntrada: 0, totalSaida: 0, totalValor: 0 };
    }
    if (kind === 'saldo-liquido') {
      const resumo = computeExtratoStats(sorted);
      return {
        totalEntrada: resumo.totalEntrada,
        totalSaida: resumo.totalSaida,
        totalValor: resumo.saldoLiquido
      };
    }
    if (kind === 'saidas') {
      let totalSaida = 0;
      for (const item of sorted) {
        totalSaida += item.saida;
      }
      return {
        totalEntrada: 0,
        totalSaida,
        totalValor: totalSaida
      };
    }
    if (kind === 'entradas') {
      let totalEntrada = 0;
      for (const item of sorted) {
        totalEntrada += itemEntrada(item);
      }
      return {
        totalEntrada,
        totalSaida: 0,
        totalValor: totalEntrada
      };
    }
    let totalEntrada = 0;
    let totalSaida = 0;
    for (const item of sorted) {
      const v = valorLinhaDemonstrativoDetalhe(item, kind);
      if (v > 0) totalEntrada += v;
      else if (v < 0) totalSaida += Math.abs(v);
    }
    return {
      totalEntrada,
      totalSaida,
      totalValor: totalEntrada - totalSaida
    };
  }, [sorted, kind]);

  const visiveis = sorted.slice(0, RESUMO_DETALHE_LIMITE);
  const restante = sorted.length - visiveis.length;
  const naturezasIncluidas = kind ? demonstrativoCardNatureLabels(kind) : [];
  const fluxoChartItems = chartItems ?? items;

  if (!kind) return null;

  return (
    <Modal isOpen onClose={onClose} title={title} size="xl" closeOnOverlayClick>
      <ExtratoResumoStatCards
        totalSaida={stats.totalSaida}
        totalEntrada={stats.totalEntrada}
        totalValor={stats.totalValor}
      />

      {isDemonstrativoFluxoKind(kind) ? (
        <>
          <ExtratoFluxoMensalChart
            items={fluxoChartItems}
            title="Evolução Mensal (Acumulado) — empresa"
          />
          <ExtratoFluxoMensalChart
            items={fluxoChartItems}
            mode="periodo"
            title="Evolução mensal por mês — empresa"
          />
          <ExtratoFluxoDiarioChart
            items={fluxoChartItems}
            title="Evolução diária — empresa"
          />
          <ExtratoFluxoProjecaoAnualChart
            items={fluxoChartItems}
            title="Projeção anual — empresa"
          />
        </>
      ) : null}

      <DemonstrativoNaturezasIncluidas labels={naturezasIncluidas} />

      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        {sorted.length} movimentação(ões){' '}
        {isDemonstrativoFluxoKind(kind) ? 'no recorte atual' : 'no total geral'}
        {restante > 0 ? ` — exibindo ${visiveis.length}` : null}. Clique em uma linha para ver os
        detalhes.
      </p>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Nenhuma movimentação neste total.
        </p>
      ) : (
        <div className="max-h-[min(60vh,32rem)] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Data
                </th>
                <th className="min-w-[12rem] px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Histórico
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Centro de custo
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Natureza
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Fornecedor
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Filial
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {visiveis.map((item, index) => {
                const linhaValor = valorLinhaDemonstrativoDetalhe(item, kind);
                return (
                  <tr
                    key={item.ajusteId ?? `dem-card-${index}-${item.dataCompensacao}`}
                    {...extratoLancamentoRowHandlers(item, setSelectedItem)}
                    className={`${EXTRATO_LANCAMENTO_ROW_CLICKABLE_CLASS} ${
                      item.isAjusteManual ? 'bg-amber-50/40 dark:bg-amber-950/15' : ''
                    }`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 text-gray-900 dark:text-gray-100">
                      {formatDate(item.dataCompensacao)}
                    </td>
                    <td className="max-w-[14rem] px-3 py-2">
                      <span
                        className="line-clamp-2 text-gray-700 dark:text-gray-300"
                        title={item.historico}
                      >
                        {item.historico || '—'}
                      </span>
                      {item.isAjusteManual ? (
                        <span className="mt-0.5 inline-block rounded bg-amber-200 px-1 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                          Ajuste
                        </span>
                      ) : null}
                    </td>
                    <td
                      className="max-w-[10rem] truncate px-3 py-2 text-gray-700 dark:text-gray-300"
                      title={displayCcLabel(item)}
                    >
                      {displayCcLabel(item)}
                    </td>
                    <td
                      className="max-w-[10rem] truncate px-3 py-2 text-gray-700 dark:text-gray-300"
                      title={displayNatLabel(item)}
                    >
                      {displayNatLabel(item)}
                    </td>
                    <td className="max-w-[8rem] truncate px-3 py-2 text-gray-700 dark:text-gray-300">
                      {item.fornecedor || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">
                      {item.codFilial != null ? formatFilialLabel(item.codFilial) : '—'}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${valorCellClass(linhaValor)}`}
                    >
                      {formatCurrency(linhaValor)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {restante > 0 ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          + {restante} movimentação(ões) não exibida(s). Refine os filtros para reduzir o volume.
        </p>
      ) : null}

      <ExtratoLancamentoDetalheModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </Modal>
  );
}

const DEMONSTRATIVO_CARD_CLICKABLE_CLASS =
  'cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900';

const DEMONSTRATIVO_RECORTE_CARD_CLASS = 'flex h-full flex-col';
const DEMONSTRATIVO_RECORTE_CARD_BUTTON_CLASS = 'flex h-full w-full flex-col text-left';
const DEMONSTRATIVO_RECORTE_CARD_CONTENT_CLASS = 'flex flex-1 flex-col p-4 sm:p-6';
const DEMONSTRATIVO_RECORTE_CARD_BODY_CLASS = 'flex h-full items-start';
const DEMONSTRATIVO_RECORTE_CARD_TEXT_CLASS =
  'ml-3 flex min-w-0 flex-1 flex-col sm:ml-4';
const DEMONSTRATIVO_RECORTE_CARD_DESC_CLASS =
  'mt-1 flex-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400';
const DEMONSTRATIVO_FILTRO_HINT_CLASS =
  'inline-flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400';

function formatMonthYearLabel(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return monthKey;
  }
  const text = new Date(year, month - 1, 1).toLocaleString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type ExtratoResumoRow = {
  key: string;
  label: string;
  totalEntrada: number;
  totalSaida: number;
  totalValor: number;
};

const EXTRATO_RESUMO_ITEMS_PER_PAGE = 20;

type ExtratoResumoRowSort = 'valor-desc' | 'month-desc' | 'month-asc' | 'label';

function sortResumoRows(rows: ExtratoResumoRow[], sort: ExtratoResumoRowSort): ExtratoResumoRow[] {
  return [...rows].sort((a, b) => {
    if (sort === 'month-desc' || sort === 'month-asc') {
      const cmp = a.key.localeCompare(b.key);
      if (cmp !== 0) return sort === 'month-desc' ? -cmp : cmp;
      return a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' });
    }
    if (sort === 'label') {
      return a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' });
    }
    const diff = b.totalValor - a.totalValor;
    if (diff !== 0) return diff;
    return a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' });
  });
}

function itemCompensacaoMonthKey(item: ExtratoCaixaItem): string | null {
  const data = item.dataCompensacao ?? item.data;
  if (!data) return null;
  const parts = parseCalendarDateParts(data);
  if (!parts) return null;
  return `${parts.y}-${String(parts.m).padStart(2, '0')}`;
}

function buildExtratoResumoMensal(items: ExtratoCaixaItem[]): ExtratoResumoRow[] {
  const map = new Map<string, { entrada: number; saida: number; valor: number }>();

  for (const item of items) {
    const key = itemCompensacaoMonthKey(item);
    if (!key) continue;
    const cur = map.get(key) ?? { entrada: 0, saida: 0, valor: 0 };
    cur.entrada += itemEntrada(item);
    cur.saida += item.saida;
    cur.valor += itemSaldoLinha(item);
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, totals]) => {
      const label = formatMonthYearLabel(monthKey);
      return {
        key: monthKey,
        label,
        totalEntrada: totals.entrada,
        totalSaida: totals.saida,
        totalValor: totals.valor
      };
    });
}

function ccGroupKey(item: ExtratoCaixaItem): string {
  const code = item.codCCusto.trim();
  return code ? code.toUpperCase() : SEM_CENTRO_CUSTO_KEY;
}

function ccGroupLabel(item: ExtratoCaixaItem): string {
  const name = item.ccusto.trim();
  if (name) return name;
  const code = item.codCCusto.trim();
  if (!code) return 'Sem centro de custo';
  return code;
}

function buildExtratoResumoCentroCusto(items: ExtratoCaixaItem[]): ExtratoResumoRow[] {
  const map = new Map<
    string,
    { label: string; entrada: number; saida: number; valor: number }
  >();

  for (const item of items) {
    const key = ccGroupKey(item);
    const cur = map.get(key) ?? {
      label: ccGroupLabel(item),
      entrada: 0,
      saida: 0,
      valor: 0
    };
    cur.entrada += itemEntrada(item);
    cur.saida += item.saida;
    cur.valor += itemSaldoLinha(item);
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .sort(([, a], [, b]) => a.label.localeCompare(b.label, 'pt-BR'))
    .map(([key, totals]) => ({
      key,
      label: totals.label,
      totalEntrada: totals.entrada,
      totalSaida: totals.saida,
      totalValor: totals.valor
    }));
}

function natureGroupKey(item: ExtratoCaixaItem): string {
  const code =
    normalizeBudgetNatureCode(item.codNatFinanceira) || item.codNatFinanceira.trim();
  return code ? code.toUpperCase() : SEM_NATUREZA_KEY;
}

function natureGroupLabel(item: ExtratoCaixaItem): string {
  const name = item.natureza.trim();
  if (name) return name;
  const code = item.codNatFinanceira.trim();
  if (!code) return 'Sem natureza financeira';
  return code;
}

function buildExtratoResumoNatureza(items: ExtratoCaixaItem[]): ExtratoResumoRow[] {
  const map = new Map<
    string,
    { label: string; entrada: number; saida: number; valor: number }
  >();

  for (const item of items) {
    const key = natureGroupKey(item);
    const cur = map.get(key) ?? {
      label: natureGroupLabel(item),
      entrada: 0,
      saida: 0,
      valor: 0
    };
    cur.entrada += itemEntrada(item);
    cur.saida += item.saida;
    cur.valor += itemSaldoLinha(item);
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .sort(([, a], [, b]) => a.label.localeCompare(b.label, 'pt-BR'))
    .map(([key, totals]) => ({
      key,
      label: totals.label,
      totalEntrada: totals.entrada,
      totalSaida: totals.saida,
      totalValor: totals.valor
    }));
}

function fornecedorGroupKey(item: ExtratoCaixaItem): string {
  const name = item.fornecedor.trim();
  return name ? name.toUpperCase() : SEM_FORNECEDOR_KEY;
}

function fornecedorGroupLabel(item: ExtratoCaixaItem): string {
  return item.fornecedor.trim() || 'Sem fornecedor';
}

function buildExtratoResumoFornecedor(items: ExtratoCaixaItem[]): ExtratoResumoRow[] {
  const map = new Map<
    string,
    { label: string; entrada: number; saida: number; valor: number }
  >();

  for (const item of items) {
    const key = fornecedorGroupKey(item);
    const cur = map.get(key) ?? {
      label: fornecedorGroupLabel(item),
      entrada: 0,
      saida: 0,
      valor: 0
    };
    cur.entrada += itemEntrada(item);
    cur.saida += item.saida;
    cur.valor += itemSaldoLinha(item);
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .sort(([, a], [, b]) => a.label.localeCompare(b.label, 'pt-BR'))
    .map(([key, totals]) => ({
      key,
      label: totals.label,
      totalEntrada: totals.entrada,
      totalSaida: totals.saida,
      totalValor: totals.valor
    }));
}

function valorCellClass(value: number): string {
  if (value > 0) return 'text-green-700 dark:text-green-300';
  if (value < 0) return 'text-red-600 dark:text-red-400';
  return 'text-gray-700 dark:text-gray-300';
}

const RESUMO_DETALHE_LIMITE = 150;

function itemDetailSortKey(item: ExtratoCaixaItem): number {
  const d = item.dataCompensacao ?? item.data;
  if (!d) return Number.NEGATIVE_INFINITY;
  const parts = parseCalendarDateParts(d);
  if (!parts) return Number.NEGATIVE_INFINITY;
  return new Date(parts.y, parts.m - 1, parts.d).getTime();
}

function sortItemsForResumoDetalhe(items: ExtratoCaixaItem[]): ExtratoCaixaItem[] {
  return [...items].sort((a, b) => itemDetailSortKey(b) - itemDetailSortKey(a));
}

function formatExtratoResumoStatValue(label: string, value: number): string {
  if (label === 'Saída' || label === 'Saídas') return formatCurrency(Math.abs(value));
  return formatCurrency(value);
}

type ExtratoTotaisStripItem = {
  label: string;
  value: number;
  sublabel?: string;
  valueClassName?: string;
};

function ExtratoTotaisStrip({
  items,
  className = ''
}: {
  items: ExtratoTotaisStripItem[];
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50 dark:border-gray-700 dark:bg-gray-900/30 ${className}`}
    >
      <div className="grid grid-cols-1 divide-y divide-gray-200 dark:divide-gray-700 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {items.map((item) => (
          <div key={item.label} className="min-w-0 px-4 py-3.5 sm:px-5">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {item.label}
              {item.sublabel ? (
                <span className="ml-1 font-normal text-gray-400 dark:text-gray-500">
                  {item.sublabel}
                </span>
              ) : null}
            </p>
            <p
              className={`mt-1 truncate text-base font-semibold tabular-nums sm:text-lg ${
                item.valueClassName ?? valorCellClass(item.value)
              }`}
            >
              {formatExtratoResumoStatValue(item.label, item.value)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExtratoResumoStatCards({
  totalSaida,
  totalEntrada,
  totalValor
}: {
  totalSaida: number;
  totalEntrada: number;
  totalValor: number;
}) {
  return (
    <ExtratoTotaisStrip
      className="mb-4"
      items={[
        {
          label: 'Saída',
          value: totalSaida,
          valueClassName: 'text-red-600 dark:text-red-400'
        },
        {
          label: 'Entrada',
          value: totalEntrada,
          valueClassName: 'text-green-600 dark:text-green-400'
        },
        {
          label: 'Valor',
          value: totalValor,
          valueClassName:
            totalValor >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
        }
      ]}
    />
  );
}

function ExtratoResumoDetalheModal({
  isOpen,
  onClose,
  rowLabelHeader,
  row,
  items
}: {
  isOpen: boolean;
  onClose: () => void;
  rowLabelHeader: string;
  row: ExtratoResumoRow | null;
  items: ExtratoCaixaItem[];
}) {
  const [selectedItem, setSelectedItem] = useState<ExtratoCaixaItem | null>(null);
  const sorted = useMemo(() => sortItemsForResumoDetalhe(items), [items]);
  const visiveis = sorted.slice(0, RESUMO_DETALHE_LIMITE);
  const restante = sorted.length - visiveis.length;

  if (!isOpen || !row) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${rowLabelHeader}: ${row.label}`}
      size="xl"
      closeOnOverlayClick
    >
      <ExtratoResumoStatCards
        totalSaida={row.totalSaida}
        totalEntrada={row.totalEntrada}
        totalValor={row.totalValor}
      />

      <ExtratoFluxoMensalChart items={items} title="Evolução Mensal (Acumulado)" />

      <ExtratoFluxoMensalChart items={items} mode="periodo" title="Evolução mensal — por mês" />

      <ExtratoFluxoDiarioChart items={items} title="Evolução diária" />

      <ExtratoFluxoProjecaoAnualChart items={items} title="Projeção anual" />

      <p className="mb-3 text-sm text-gray-600 dark:text-gray-400">
        {sorted.length} movimentação(ões) com os filtros atuais
        {restante > 0 ? ` — exibindo ${visiveis.length}` : null}. Clique em uma linha para ver os
        detalhes.
      </p>

      {sorted.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          Nenhuma movimentação neste grupo.
        </p>
      ) : (
        <div className="max-h-[min(60vh,32rem)] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Data
                </th>
                <th className="min-w-[12rem] px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Histórico
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Centro de custo
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Natureza
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Fornecedor
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">
                  Filial
                </th>
                <th className="px-3 py-2 text-right text-xs font-medium uppercase text-gray-500">
                  Valor
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {visiveis.map((item, index) => (
                <tr
                  key={item.ajusteId ?? `det-${index}-${item.dataCompensacao}`}
                  {...extratoLancamentoRowHandlers(item, setSelectedItem)}
                  className={`${EXTRATO_LANCAMENTO_ROW_CLICKABLE_CLASS} ${
                    item.isAjusteManual ? 'bg-amber-50/40 dark:bg-amber-950/15' : ''
                  }`}
                >
                  <td className="whitespace-nowrap px-3 py-2 text-gray-900 dark:text-gray-100">
                    {formatDate(item.dataCompensacao)}
                  </td>
                  <td className="max-w-[14rem] px-3 py-2">
                    <span className="line-clamp-2 text-gray-700 dark:text-gray-300" title={item.historico}>
                      {item.historico || '—'}
                    </span>
                    {item.isAjusteManual ? (
                      <span className="mt-0.5 inline-block rounded bg-amber-200 px-1 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                        Ajuste
                      </span>
                    ) : null}
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-2 text-gray-700 dark:text-gray-300" title={displayCcLabel(item)}>
                    {displayCcLabel(item)}
                  </td>
                  <td className="max-w-[10rem] truncate px-3 py-2 text-gray-700 dark:text-gray-300" title={displayNatLabel(item)}>
                    {displayNatLabel(item)}
                  </td>
                  <td className="max-w-[8rem] truncate px-3 py-2 text-gray-700 dark:text-gray-300">
                    {item.fornecedor || '—'}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700 dark:text-gray-300">
                    {item.codFilial != null ? formatFilialLabel(item.codFilial) : '—'}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${valorCellClass(itemSaldoLinha(item))}`}>
                    {formatCurrency(itemSaldoLinha(item))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {restante > 0 ? (
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          + {restante} movimentação(ões) não exibida(s). Refine os filtros para reduzir o volume.
        </p>
      ) : null}

      <ExtratoLancamentoDetalheModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </Modal>
  );
}

const RESUMO_TH =
  'px-3 sm:px-6 py-4 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400';
const RESUMO_TD = 'px-3 sm:px-6 py-3 text-sm';

function ExtratoBlockIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex shrink-0 items-center justify-center rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
      <Icon className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" aria-hidden />
    </div>
  );
}

function ExtratoResumoTable({
  title,
  subtitle,
  icon,
  rowLabelHeader,
  countLabel,
  rows,
  detailItems,
  getItemGroupKey,
  labelClassName = '',
  headerActions,
  totalRowLabel = 'Total geral',
  rowSort = 'valor-desc'
}: {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  rowLabelHeader: string;
  countLabel: string;
  rows: ExtratoResumoRow[];
  detailItems: ExtratoCaixaItem[];
  getItemGroupKey: (item: ExtratoCaixaItem) => string | null;
  labelClassName?: string;
  headerActions?: React.ReactNode;
  totalRowLabel?: string;
  /** Resumo por mês usa `month-desc` (mais recente primeiro). Demais tabelas: valor. */
  rowSort?: ExtratoResumoRowSort;
}) {
  const [detalheRow, setDetalheRow] = useState<ExtratoResumoRow | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const sortedRows = useMemo(() => sortResumoRows(rows, rowSort), [rows, rowSort]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / EXTRATO_RESUMO_ITEMS_PER_PAGE));
  const showPagination = sortedRows.length > EXTRATO_RESUMO_ITEMS_PER_PAGE;

  useEffect(() => {
    setCurrentPage(1);
  }, [rows]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * EXTRATO_RESUMO_ITEMS_PER_PAGE;
    return sortedRows.slice(start, start + EXTRATO_RESUMO_ITEMS_PER_PAGE);
  }, [sortedRows, currentPage]);

  const rangeStart =
    sortedRows.length === 0 ? 0 : (currentPage - 1) * EXTRATO_RESUMO_ITEMS_PER_PAGE + 1;
  const rangeEnd = Math.min(currentPage * EXTRATO_RESUMO_ITEMS_PER_PAGE, sortedRows.length);

  const detailsByKey = useMemo(() => {
    const map = new Map<string, ExtratoCaixaItem[]>();
    for (const item of detailItems) {
      const key = getItemGroupKey(item);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [detailItems, getItemGroupKey]);

  const totais = useMemo(() => {
    let totalEntrada = 0;
    let totalSaida = 0;
    let totalValor = 0;
    for (const row of rows) {
      totalEntrada += row.totalEntrada;
      totalSaida += row.totalSaida;
      totalValor += row.totalValor;
    }
    return { totalEntrada, totalSaida, totalValor };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="border-b-0 pb-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <ExtratoBlockIcon icon={icon} />
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
            </div>
          </div>
          {headerActions ? (
            <div className="flex min-w-0 flex-shrink-0 flex-wrap items-end gap-2 sm:justify-end">
              {headerActions}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <span>
            Mostrando {rangeStart} a {rangeEnd} de {sortedRows.length} {countLabel}
          </span>
          {showPagination ? (
            <span>
              Página {currentPage} de {totalPages}
            </span>
          ) : null}
        </div>
        <div className="table-scroll">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr>
                <th className={`${RESUMO_TH} text-left`}>{rowLabelHeader}</th>
                <th className={`${RESUMO_TH} text-right`}>Saída</th>
                <th className={`${RESUMO_TH} text-right`}>Entrada</th>
                <th className={`${RESUMO_TH} text-right`}>Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {paginatedRows.map((row) => {
                const detalhes = detailsByKey.get(row.key) ?? [];
                const qtd = detalhes.length;
                return (
                  <tr
                    key={row.key}
                    className="cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    onClick={() => setDetalheRow(row)}
                  >
                    <td
                      className={`${RESUMO_TD} font-medium text-gray-900 dark:text-gray-100 ${labelClassName}`}
                      title={row.label}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate">{row.label}</span>
                        <span className="shrink-0 text-xs font-normal text-gray-400 dark:text-gray-500">
                          ({qtd})
                        </span>
                      </div>
                    </td>
                    <td className={`${RESUMO_TD} text-right tabular-nums ${valorCellClass(row.totalSaida)}`}>
                      {formatCurrency(row.totalSaida)}
                    </td>
                    <td className={`${RESUMO_TD} text-right tabular-nums ${valorCellClass(row.totalEntrada)}`}>
                      {formatCurrency(row.totalEntrada)}
                    </td>
                    <td className={`${RESUMO_TD} text-right tabular-nums ${valorCellClass(row.totalValor)}`}>
                      {formatCurrency(row.totalValor)}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-gray-50 font-semibold dark:bg-gray-900/40">
                <td className={`${RESUMO_TD} text-gray-900 dark:text-gray-100`}>{totalRowLabel}</td>
                <td className={`${RESUMO_TD} text-right tabular-nums ${valorCellClass(totais.totalSaida)}`}>
                  {formatCurrency(totais.totalSaida)}
                </td>
                <td className={`${RESUMO_TD} text-right tabular-nums ${valorCellClass(totais.totalEntrada)}`}>
                  {formatCurrency(totais.totalEntrada)}
                </td>
                <td className={`${RESUMO_TD} text-right tabular-nums ${valorCellClass(totais.totalValor)}`}>
                  {formatCurrency(totais.totalValor)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ListPagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={setCurrentPage}
        />
      </CardContent>

      <ExtratoResumoDetalheModal
        isOpen={detalheRow != null}
        onClose={() => setDetalheRow(null)}
        rowLabelHeader={rowLabelHeader}
        row={detalheRow}
        items={detalheRow ? (detailsByKey.get(detalheRow.key) ?? []) : []}
      />
    </Card>
  );
}

function extratoMatchesMovimentoTipo(
  item: ExtratoCaixaItem,
  selected: string[],
  allMovimentoTipos: string[] = MOVIMENTO_TIPO_ALL_VALUES
): boolean {
  if (multiselectFilterShowsAll(selected, allMovimentoTipos)) return true;
  if (selected.length === 0) return false;
  const wantEntrada = selected.includes('entrada');
  const wantSaida = selected.includes('saida');
  const isEntrada = itemEntrada(item) > 0;
  const isSaida = itemHasSaida(item);
  if (wantEntrada && isEntrada) return true;
  if (wantSaida && isSaida) return true;
  return false;
}

function itemMatchesDateRange(
  data: string | null,
  periodFrom: string,
  periodTo: string
): boolean {
  if (!periodFrom && !periodTo) return true;
  const day = localDayKey(data);
  if (day == null) return false;

  let fromKey = parseDateInputToDayKey(periodFrom);
  let toKey = parseDateInputToDayKey(periodTo);
  if (fromKey != null && toKey != null && fromKey > toKey) {
    [fromKey, toKey] = [toKey, fromKey];
  }
  if (fromKey != null && day < fromKey) return false;
  if (toKey != null && day > toKey) return false;
  return true;
}

function itemMatchesCompensacaoPeriod(
  item: ExtratoCaixaItem,
  periodFrom: string,
  periodTo: string
): boolean {
  return itemMatchesDateRange(item.dataCompensacao, periodFrom, periodTo);
}

function itemMatchesDemonstrativoRecorte(
  item: ExtratoCaixaItem,
  params: {
    periodFrom: string;
    periodTo: string;
    ccFilterCodes: string[];
    ccAllValues: string[];
    poloFilterIds: string[];
    poloAllValues: string[];
    tipoOperacaoFilterValues: string[];
    tipoOperacaoAllValues: string[];
  }
): boolean {
  return (
    itemMatchesCompensacaoPeriod(item, params.periodFrom, params.periodTo) &&
    extratoMatchesAnyCcCodes(item.codCCusto, params.ccFilterCodes, params.ccAllValues) &&
    extratoMatchesAnyPoloKeys(item, params.poloFilterIds, params.poloAllValues) &&
    extratoMatchesAnyTipoOperacao(
      item.tipoOperacao,
      params.tipoOperacaoFilterValues,
      params.tipoOperacaoAllValues
    )
  );
}

function sortItemsByDateDesc(items: ExtratoCaixaItem[]): ExtratoCaixaItem[] {
  return [...items].sort((a, b) => {
    const ta = localDayKey(a.dataCompensacao) ?? localDayKey(a.data) ?? Number.NEGATIVE_INFINITY;
    const tb = localDayKey(b.dataCompensacao) ?? localDayKey(b.data) ?? Number.NEGATIVE_INFINITY;
    return tb - ta;
  });
}

function computeExtratoStats(source: readonly ExtratoCaixaItem[]) {
  let totalEntrada = 0;
  let totalSaida = 0;
  let qtdEntrada = 0;
  let qtdSaida = 0;
  for (const item of source) {
    const ent = itemEntrada(item);
    const sai = itemSaidaAbs(item);
    if (ent > 0) {
      totalEntrada += ent;
      qtdEntrada += 1;
    }
    if (itemHasSaida(item)) {
      totalSaida += sai;
      qtdSaida += 1;
    }
  }
  return {
    totalEntrada,
    totalSaida,
    qtdEntrada,
    qtdSaida,
    saldoLiquido: totalEntrada - totalSaida
  };
}

function extratoItemMatchesSearch(item: ExtratoCaixaItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const ccLabel = displayCcLabel(item);
  const natLabel = displayNatLabel(item);

  const haystack = [
    item.idxcx != null ? String(item.idxcx) : '',
    item.historico,
    item.codCxa,
    item.codCCusto,
    ccLabel,
    item.codNatFinanceira,
    natLabel,
    item.natureza,
    item.fornecedor,
    item.tipoOperacao,
    item.numeroDocumento,
    item.codFilial != null ? formatFilialLabel(item.codFilial) : '',
    item.codFilial != null ? String(item.codFilial) : '',
    formatDate(item.data),
    formatDate(item.dataCompensacao),
    formatCurrency(itemSaldoLinha(item)),
    String(itemSaldoLinha(item))
  ];

  return haystack.some((part) => part && part.toLowerCase().includes(q));
}

const EXTRATO_TH_CENTER =
  'whitespace-nowrap px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4';
const EXTRATO_TH_HISTORICO =
  'min-w-[14rem] px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-4';
const EXTRATO_TD_CENTER = 'px-3 py-3 text-center sm:px-4';
const EXTRATO_TD_HISTORICO =
  'max-w-[16rem] truncate px-3 py-3 text-left text-gray-700 dark:text-gray-300 sm:px-4';

const EXTRATO_LANCAMENTO_ROW_CLICKABLE_CLASS =
  'cursor-pointer transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500';

function extratoLancamentoRowHandlers(
  item: ExtratoCaixaItem,
  onSelect: (item: ExtratoCaixaItem) => void
) {
  const label =
    item.idxcx != null
      ? `Ver detalhes do lançamento ${item.idxcx}`
      : item.isAjusteManual
        ? 'Ver detalhes do ajuste manual'
        : 'Ver detalhes do lançamento';

  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => onSelect(item),
    onKeyDown: (e: React.KeyboardEvent<HTMLTableRowElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelect(item);
      }
    },
    'aria-label': label
  };
}

function ExtratoDetalheCampo({
  label,
  value,
  valueClassName
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd
        className={`mt-1 break-words text-sm text-gray-900 dark:text-gray-100 ${valueClassName ?? ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

function ExtratoLancamentoDetalheModal({
  item,
  onClose
}: {
  item: ExtratoCaixaItem | null;
  onClose: () => void;
}) {
  if (!item) return null;

  const saldo = itemSaldoLinha(item);
  const ccLabel = displayCcLabel(item);
  const natLabel = displayNatLabel(item);
  const title = item.isAjusteManual
    ? 'Detalhes do ajuste manual'
    : item.idxcx != null
      ? `Lançamento #${item.idxcx}`
      : 'Detalhes do lançamento';

  return (
    <Modal isOpen onClose={onClose} title={title} size="lg" closeOnOverlayClick>
      {item.isAjusteManual ? (
        <p className="mb-4 inline-flex items-center rounded-md bg-amber-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          Ajuste manual
        </p>
      ) : null}

      <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ExtratoDetalheCampo
          label={item.isAjusteManual ? 'ID do ajuste' : 'ID (TOTVS)'}
          value={
            item.isAjusteManual
              ? item.ajusteId ?? '—'
              : item.idxcx != null
                ? String(item.idxcx)
                : '—'
          }
          valueClassName="font-mono text-xs sm:text-sm"
        />
        <ExtratoDetalheCampo
          label="Data de compensação"
          value={formatDate(item.dataCompensacao)}
        />
        <ExtratoDetalheCampo label="Data do lançamento" value={formatDate(item.data)} />
        <ExtratoDetalheCampo label="Histórico" value={item.historico?.trim() || '—'} />
        <ExtratoDetalheCampo
          label="Centro de custo"
          value={
            item.codCCusto && ccLabel !== item.codCCusto
              ? `${ccLabel} (${item.codCCusto})`
              : ccLabel
          }
        />
        <ExtratoDetalheCampo
          label="Natureza financeira"
          value={
            item.codNatFinanceira && natLabel !== item.codNatFinanceira
              ? `${natLabel} (${item.codNatFinanceira})`
              : natLabel
          }
        />
        <ExtratoDetalheCampo label="Fornecedor" value={item.fornecedor?.trim() || '—'} />
        <ExtratoDetalheCampo
          label="Filial"
          value={item.codFilial != null ? formatFilialLabel(item.codFilial) : '—'}
        />
        <ExtratoDetalheCampo label="Tipo de operação" value={item.tipoOperacao?.trim() || '—'} />
        <ExtratoDetalheCampo label="Nº documento" value={item.numeroDocumento?.trim() || '—'} />
        <ExtratoDetalheCampo label="Conta caixa" value={item.codCxa?.trim() || '—'} />
        <ExtratoDetalheCampo
          label="Coligada"
          value={item.codColigada != null ? String(item.codColigada) : '—'}
        />
      </dl>

      <div className="mt-6 grid grid-cols-1 gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:grid-cols-3">
        <ExtratoDetalheCampo
          label="Entrada"
          value={formatCurrencyOrDash(itemEntrada(item))}
          valueClassName="font-semibold tabular-nums text-green-600 dark:text-green-400"
        />
        <ExtratoDetalheCampo
          label="Saída"
          value={formatCurrencyOrDash(itemSaidaAbs(item))}
          valueClassName="font-semibold tabular-nums text-red-600 dark:text-red-400"
        />
        <ExtratoDetalheCampo
          label="Saldo da linha"
          value={formatCurrency(saldo)}
          valueClassName={`font-semibold tabular-nums ${valorCellClass(saldo)}`}
        />
      </div>
    </Modal>
  );
}

const skeletonPulse = 'animate-pulse rounded-md bg-gray-200/90 dark:bg-gray-700/80';

type ExtratoSearchFilterBarProps = {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  onOpenFilters: () => void;
  hasActiveFilters: boolean;
  disabled?: boolean;
  exportAction?: React.ReactNode;
};

function ExtratoSearchFilterBar({
  searchQuery,
  onSearchQueryChange,
  searchInputRef,
  onOpenFilters,
  hasActiveFilters,
  disabled = false,
  exportAction
}: ExtratoSearchFilterBarProps) {
  return (
    <div className="flex flex-shrink-0 flex-wrap items-center justify-center gap-2">
      <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          placeholder="Pesquisar movimentação..."
          disabled={disabled}
          className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => onSearchQueryChange('')}
            disabled={disabled}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:pointer-events-none dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onOpenFilters}
        disabled={disabled}
        className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          hasActiveFilters
            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
        }`}
        aria-label="Abrir filtro"
        title={hasActiveFilters ? 'Filtros ativos' : 'Filtro'}
      >
        <Filter className="h-4 w-4" />
        {hasActiveFilters ? (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
        ) : null}
      </button>
      {exportAction}
    </div>
  );
}

function ExtratoCaixaLoadingSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando balanço financeiro">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className={`h-11 w-11 shrink-0 rounded-lg sm:h-12 sm:w-12 ${skeletonPulse}`} />
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className={`h-3.5 w-24 ${skeletonPulse}`} />
                  <div className={`h-7 w-36 max-w-full ${skeletonPulse}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-gray-100 dark:border-gray-700/80">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 shrink-0 rounded-lg ${skeletonPulse}`} />
              <div className="space-y-2">
                <div className={`h-5 w-36 ${skeletonPulse}`} />
                <div className={`h-4 w-28 ${skeletonPulse}`} />
              </div>
            </div>
            <div className="flex gap-2 sm:justify-end">
              <div className={`h-10 min-w-[240px] flex-1 sm:w-72 ${skeletonPulse}`} />
              <div className={`h-10 w-10 shrink-0 ${skeletonPulse}`} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0 pt-0">
          <div className={`mx-3 mb-3 mt-4 h-4 w-48 sm:mx-6 ${skeletonPulse}`} />
          <div className="space-y-0 border-t border-gray-100 dark:border-gray-700/80">
            <div className={`mx-3 my-3 h-9 rounded-lg sm:mx-4 ${skeletonPulse}`} />
            {Array.from({ length: 8 }).map((_, row) => (
              <div
                key={row}
                className="flex gap-3 border-b border-gray-100 px-3 py-3 last:border-0 dark:border-gray-700/60 sm:px-4"
              >
                <div className={`h-4 w-12 shrink-0 ${skeletonPulse}`} />
                <div className={`h-4 min-w-[8rem] flex-1 ${skeletonPulse}`} />
                <div className={`hidden h-4 w-20 sm:block ${skeletonPulse}`} />
                <div className={`hidden h-4 w-24 md:block ${skeletonPulse}`} />
                <div className={`hidden h-4 w-16 lg:block ${skeletonPulse}`} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-gray-100 px-4 py-4 dark:border-gray-700/80 sm:px-6">
            <div className={`h-4 w-40 ${skeletonPulse}`} />
            <div className="flex gap-2">
              <div className={`h-9 w-20 ${skeletonPulse}`} />
              <div className={`h-9 w-20 ${skeletonPulse}`} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ExtratoCaixaRefetchBar() {
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-red-200/80 bg-red-50/90 px-4 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      <span>Atualizando movimentações…</span>
    </div>
  );
}

interface ExtratoItemsListProps {
  items: ExtratoCaixaItem[];
  emptyMessage: string;
}

function ExtratoItemsList({ items, emptyMessage }: ExtratoItemsListProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<ExtratoCaixaItem | null>(null);

  const totalPages = Math.max(1, Math.ceil(items.length / EXTRATO_ITEMS_PER_PAGE));
  const showPagination = items.length > EXTRATO_ITEMS_PER_PAGE;

  useEffect(() => {
    setCurrentPage(1);
  }, [items]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * EXTRATO_ITEMS_PER_PAGE;
    return items.slice(start, start + EXTRATO_ITEMS_PER_PAGE);
  }, [items, currentPage]);

  const rangeStart = showPagination ? (currentPage - 1) * EXTRATO_ITEMS_PER_PAGE + 1 : 1;
  const rangeEnd = showPagination
    ? Math.min(currentPage * EXTRATO_ITEMS_PER_PAGE, items.length)
    : items.length;

  return (
    <Card className="w-full overflow-hidden">
      <CardHeader className="border-b-0 pb-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <ExtratoBlockIcon icon={CalendarDays} />
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Movimentações</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Consulte as movimentações do balanço financeiro. Clique em uma linha para ver os
                detalhes.
              </p>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
          {items.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Wallet className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
              <p className="text-gray-600 dark:text-gray-400">{emptyMessage}</p>
            </div>
          ) : (
            <>
            <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span>
                Mostrando {rangeStart} a {rangeEnd} de {items.length} movimentações
              </span>
              <span>
                Página {currentPage} de {totalPages}
              </span>
            </div>
          <div className="table-scroll">
            <table className="min-w-[64rem] w-full text-sm">
              <thead className="border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className={EXTRATO_TH_CENTER}>ID</th>
                  <th className={EXTRATO_TH_HISTORICO}>Histórico</th>
                  <th className={EXTRATO_TH_CENTER}>Centro de Custo</th>
                  <th className={EXTRATO_TH_CENTER}>Natureza Financeira</th>
                  <th className={EXTRATO_TH_CENTER}>Data de Compensação</th>
                  <th className={EXTRATO_TH_CENTER}>Fornecedor</th>
                  <th className={EXTRATO_TH_CENTER}>Filial</th>
                  <th className={EXTRATO_TH_CENTER}>Tipo operação</th>
                  <th className={EXTRATO_TH_CENTER}>Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                {paginatedItems.map((item, index) => {
                  const ccLabel = displayCcLabel(item);
                  const natLabel = displayNatLabel(item);
                  const rowIndex = (currentPage - 1) * EXTRATO_ITEMS_PER_PAGE + index;
                  return (
                  <tr
                    key={
                      item.ajusteId ??
                      `${item.idxcx ?? ''}-${item.data}-${item.dataCompensacao}-${rowIndex}`
                    }
                    {...extratoLancamentoRowHandlers(item, setSelectedItem)}
                    className={`${EXTRATO_LANCAMENTO_ROW_CLICKABLE_CLASS} ${
                      item.isAjusteManual ? 'bg-amber-50/40 dark:bg-amber-950/20' : ''
                    }`}
                  >
                    <td
                      className={`${EXTRATO_TD_CENTER} whitespace-nowrap font-mono text-gray-500 dark:text-gray-400`}
                    >
                      {item.idxcx ?? '—'}
                    </td>
                    <td className={EXTRATO_TD_HISTORICO} title={item.historico || undefined}>
                      <span className="inline-flex max-w-full items-center gap-2">
                        <span className="truncate">{item.historico || '—'}</span>
                        {item.isAjusteManual ? (
                          <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                            Ajuste
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} max-w-[12rem] truncate text-gray-900 dark:text-gray-100`}
                      title={
                        item.codCCusto && ccLabel !== item.codCCusto
                          ? `${ccLabel} (${item.codCCusto})`
                          : ccLabel || item.codCCusto || undefined
                      }
                    >
                      {ccLabel}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} max-w-[14rem] truncate text-gray-900 dark:text-gray-100`}
                      title={
                        item.codNatFinanceira && natLabel !== item.codNatFinanceira
                          ? item.codNatFinanceira
                          : undefined
                      }
                    >
                      {natLabel}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} whitespace-nowrap text-gray-900 dark:text-gray-100`}
                    >
                      {formatDate(item.dataCompensacao)}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} max-w-[12rem] truncate text-gray-700 dark:text-gray-300`}
                      title={item.fornecedor || undefined}
                    >
                      {item.fornecedor || '—'}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} whitespace-nowrap text-gray-700 dark:text-gray-300`}
                    >
                      {item.codFilial != null ? formatFilialLabel(item.codFilial) : '—'}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} max-w-[10rem] truncate text-gray-700 dark:text-gray-300`}
                      title={item.tipoOperacao || undefined}
                    >
                      {item.tipoOperacao || '—'}
                    </td>
                    <td
                      className={`${EXTRATO_TD_CENTER} whitespace-nowrap font-medium ${
                        itemSaldoLinha(item) > 0
                          ? 'text-green-600 dark:text-green-400'
                          : itemSaldoLinha(item) < 0
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-gray-900 dark:text-gray-100'
                      }`}
                    >
                      {formatCurrency(itemSaldoLinha(item))}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ListPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
            </>
          )}
      </CardContent>

      <ExtratoLancamentoDetalheModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </Card>
  );
}

export default function AnaliseExtratoPage() {
  const pageTitle = 'Balanço Financeiro';
  const pageSubtitle = 'Movimentações do balanço financeiro integradas ao TOTVS RM';

  const { isDepartmentFinanceiro, userPosition, can, user, isLoading: permissionsLoading } =
    usePermissions();
  const isAdministrator = userPosition === 'Administrador';
  const canAccess =
    isAdministrator ||
    isDepartmentFinanceiro ||
    can(pathToModuleKey('/ponto/financeiro/analise-extrato'));

  const [ccFilterCodes, setCcFilterCodes] = useState<string[]>([]);
  const [natureFilterCodes, setNatureFilterCodes] = useState<string[]>([]);
  const [poloFilterIds, setPoloFilterIds] = useState<string[]>([]);
  const [fornecedorFilterValues, setFornecedorFilterValues] = useState<string[]>([]);
  const [historicoFilterValues, setHistoricoFilterValues] = useState<string[]>([]);
  const [tipoOperacaoFilterValues, setTipoOperacaoFilterValues] = useState<string[]>([]);
  const [movimentoTipoFilter, setMovimentoTipoFilter] = useState<string[]>([]);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeBalancoTab, setActiveBalancoTab] = useState<BalancoFinanceiroTabId>('extrato');
  const [demonstrativoDetalhe, setDemonstrativoDetalhe] =
    useState<DemonstrativoDetalheKind | null>(null);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);

  useEffect(() => {
    if (activeBalancoTab !== 'demonstrativo') {
      setDemonstrativoDetalhe(null);
    }
  }, [activeBalancoTab]);
  const [exportPdfModalOpen, setExportPdfModalOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDemonstrativoPdf, setExportingDemonstrativoPdf] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const filtersInitializedRef = useRef(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => searchInputRef.current?.blur());
    return () => cancelAnimationFrame(id);
  }, []);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['extrato-caixa'],
    queryFn: async () => {
      const res = await api.get<ExtratoCaixaApiResponse>('/extrato-caixa', { timeout: 180000 });
      return res.data;
    },
    enabled: canAccess,
  });

  const rmItems = data?.data?.items ?? [];

  const { data: filtrosSalvos = [] } = useQuery({
    queryKey: ['extrato-caixa-filtros-salvos'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: ExtratoCaixaFiltroSalvo[] }>(
        '/extrato-caixa/filtros-salvos'
      );
      return res.data?.data ?? [];
    },
    enabled: canAccess
  });

  const { data: ajustesResponse } = useQuery({
    queryKey: ['extrato-caixa-ajustes'],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        data: import('@/lib/extratoCaixaAjuste').ExtratoCaixaAjuste[];
      }>('/extrato-caixa/ajustes');
      return res.data;
    },
    enabled: canAccess
  });

  const ajustes = ajustesResponse?.data ?? [];

  const items = useMemo(() => {
    const manual = ajustes.map(ajusteToExtratoItem);
    return sortItemsByDateDesc([...rmItems, ...manual]);
  }, [rmItems, ajustes]);

  const poloFilterOptions = useMemo(() => {
    const byKey = new Map<string, { value: string; label: string; searchText: string }>();
    for (const item of items) {
      const { key, label } = resolveExtratoPolo(item);
      if (!byKey.has(key)) {
        byKey.set(key, { value: key, label, searchText: `${key} ${label}` });
      }
    }
    return Array.from(byKey.values()).sort((a, b) => comparePoloKeys(a.value, b.value));
  }, [items]);

  const ccFilterOptions = useMemo(() => {
    const byCode = new Map<string, { value: string; label: string; searchText: string }>();
    let hasSemCc = false;
    for (const item of items) {
      const code = item.codCCusto.trim();
      if (!code) {
        hasSemCc = true;
        continue;
      }
      const key = code.toUpperCase();
      if (byCode.has(key)) continue;
      const label = item.ccusto.trim() || code;
      byCode.set(key, { value: code, label, searchText: `${code} ${label}` });
    }
    const options = Array.from(byCode.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR')
    );
    if (hasSemCc) {
      options.unshift({
        value: SEM_CENTRO_CUSTO_KEY,
        label: 'Sem centro de custo',
        searchText: 'sem centro de custo vazio'
      });
    }
    return options;
  }, [items]);

  const natureFilterOptions = useMemo(() => {
    const byCode = new Map<string, { value: string; label: string; searchText: string }>();
    let hasSemNatureza = false;
    for (const item of items) {
      const code = normalizeBudgetNatureCode(item.codNatFinanceira);
      if (!code) {
        hasSemNatureza = true;
        continue;
      }
      const label = item.natureza.trim() || code;
      const key = code.toUpperCase();
      if (byCode.has(key)) continue;
      byCode.set(key, { value: code, label, searchText: `${code} ${label}` });
    }
    const options = Array.from(byCode.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR')
    );
    if (hasSemNatureza) {
      options.unshift({
        value: SEM_NATUREZA_KEY,
        label: 'Sem natureza financeira',
        searchText: 'sem natureza financeira vazio'
      });
    }
    return options;
  }, [items]);

  const fornecedorFilterOptions = useMemo(() => {
    const names = new Set<string>();
    let hasSemFornecedor = false;
    for (const item of items) {
      const n = item.fornecedor.trim();
      if (n) names.add(n);
      else hasSemFornecedor = true;
    }
    const options = Array.from(names)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((name) => ({ value: name, label: name, searchText: name }));
    if (hasSemFornecedor) {
      options.unshift({
        value: SEM_FORNECEDOR_KEY,
        label: 'Sem fornecedor',
        searchText: 'sem fornecedor vazio'
      });
    }
    return options;
  }, [items]);

  const historicoFilterOptions = useMemo(() => {
    const textos = new Set<string>();
    for (const item of items) {
      const h = item.historico.trim();
      if (h) textos.add(h);
    }
    return Array.from(textos)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((texto) => ({ value: texto, label: texto, searchText: texto }));
  }, [items]);

  const tipoOperacaoFilterOptions = useMemo(() => {
    const tipos = new Set<string>();
    for (const item of items) {
      const t = item.tipoOperacao.trim();
      if (t) tipos.add(t);
    }
    return Array.from(tipos)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .map((tipo) => ({ value: tipo, label: tipo, searchText: tipo }));
  }, [items]);

  const poloAllValues = useMemo(
    () => poloFilterOptions.map((o) => o.value),
    [poloFilterOptions]
  );
  const ccAllValues = useMemo(() => ccFilterOptions.map((o) => o.value), [ccFilterOptions]);
  const natureAllValues = useMemo(
    () => natureFilterOptions.map((o) => o.value),
    [natureFilterOptions]
  );
  const fornecedorAllValues = useMemo(
    () => fornecedorFilterOptions.map((o) => o.value),
    [fornecedorFilterOptions]
  );
  const historicoAllValues = useMemo(
    () => historicoFilterOptions.map((o) => o.value),
    [historicoFilterOptions]
  );
  const tipoOperacaoAllValues = useMemo(
    () => tipoOperacaoFilterOptions.map((o) => o.value),
    [tipoOperacaoFilterOptions]
  );

  const filtroAllValues: ExtratoFiltroAllValues = useMemo(
    () => ({
      cc: ccAllValues,
      nature: natureAllValues,
      polo: poloAllValues,
      fornecedor: fornecedorAllValues,
      historico: historicoAllValues,
      tipoOperacao: tipoOperacaoAllValues,
      movimento: [...MOVIMENTO_TIPO_ALL_VALUES]
    }),
    [
      ccAllValues,
      natureAllValues,
      poloAllValues,
      fornecedorAllValues,
      historicoAllValues,
      tipoOperacaoAllValues
    ]
  );

  const buildDefaultFilters = useCallback(
    (): ExtratoCaixaFiltroPayload => ({
      ccFilterCodes: [...ccAllValues],
      natureFilterCodes: [...natureAllValues],
      poloFilterIds: [...poloAllValues],
      fornecedorFilterValues: [...fornecedorAllValues],
      historicoFilterValues: [...historicoAllValues],
      tipoOperacaoFilterValues: [...tipoOperacaoAllValues],
      movimentoTipoFilter: [...MOVIMENTO_TIPO_ALL_VALUES],
      periodFrom: '',
      periodTo: ''
    }),
    [
      ccAllValues,
      natureAllValues,
      poloAllValues,
      fornecedorAllValues,
      historicoAllValues,
      tipoOperacaoAllValues
    ]
  );

  useEffect(() => {
    if (rmItems.length === 0) return;
    if (filtersInitializedRef.current) return;
    const defaults = buildDefaultFilters();
    setCcFilterCodes(defaults.ccFilterCodes);
    setNatureFilterCodes(defaults.natureFilterCodes);
    setPoloFilterIds(defaults.poloFilterIds);
    setFornecedorFilterValues(defaults.fornecedorFilterValues);
    setHistoricoFilterValues(defaults.historicoFilterValues);
    setTipoOperacaoFilterValues(defaults.tipoOperacaoFilterValues);
    setMovimentoTipoFilter(defaults.movimentoTipoFilter);
    filtersInitializedRef.current = true;
  }, [rmItems.length, buildDefaultFilters]);

  const appliedFiltroPayload: ExtratoCaixaFiltroPayload = useMemo(
    () => ({
      ccFilterCodes,
      natureFilterCodes,
      poloFilterIds,
      fornecedorFilterValues,
      historicoFilterValues,
      tipoOperacaoFilterValues,
      movimentoTipoFilter,
      periodFrom,
      periodTo
    }),
    [
      ccFilterCodes,
      natureFilterCodes,
      poloFilterIds,
      fornecedorFilterValues,
      historicoFilterValues,
      tipoOperacaoFilterValues,
      movimentoTipoFilter,
      periodFrom,
      periodTo
    ]
  );

  const hasCcFilter = isMultiselectFilterActive(ccFilterCodes, ccAllValues);
  const hasNatureFilter = isMultiselectFilterActive(natureFilterCodes, natureAllValues);
  const hasPoloFilter = isMultiselectFilterActive(poloFilterIds, poloAllValues);
  const hasFornecedorFilter = isMultiselectFilterActive(fornecedorFilterValues, fornecedorAllValues);
  const hasHistoricoFilter = isMultiselectFilterActive(historicoFilterValues, historicoAllValues);
  const hasTipoOperacaoFilter = isMultiselectFilterActive(
    tipoOperacaoFilterValues,
    tipoOperacaoAllValues
  );
  const hasMovimentoTipoFilter = isMultiselectFilterActive(
    movimentoTipoFilter,
    MOVIMENTO_TIPO_ALL_VALUES
  );
  const hasPeriodFilter = Boolean(periodFrom || periodTo);
  const hasSearchQuery = searchQuery.trim().length > 0;

  const hasActiveFilters =
    hasCcFilter ||
    hasNatureFilter ||
    hasPoloFilter ||
    hasFornecedorFilter ||
    hasHistoricoFilter ||
    hasTipoOperacaoFilter ||
    hasMovimentoTipoFilter ||
    hasPeriodFilter;
  const hasListRefinement = hasActiveFilters || hasSearchQuery;

  const filtroLabelMaps: ExtratoFiltroLabelMaps = useMemo(
    () => ({
      cc: ccFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      nature: natureFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      polo: poloFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      fornecedor: fornecedorFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      historico: historicoFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      tipoOperacao: tipoOperacaoFilterOptions.map((o) => ({ value: o.value, label: o.label })),
      movimento: MOVIMENTO_TIPO_FILTER_OPTIONS.map((o) => ({ value: o.value, label: o.label }))
    }),
    [
      ccFilterOptions,
      natureFilterOptions,
      poloFilterOptions,
      fornecedorFilterOptions,
      historicoFilterOptions,
      tipoOperacaoFilterOptions
    ]
  );

  const filtrosDesmarcados = useMemo(
    () => buildExtratoFiltrosDesmarcados(appliedFiltroPayload, filtroLabelMaps, filtroAllValues),
    [appliedFiltroPayload, filtroLabelMaps, filtroAllValues]
  );

  const activeFiltroSalvo = useMemo(
    () => findMatchingExtratoFiltroSalvo(appliedFiltroPayload, filtrosSalvos, filtroAllValues),
    [appliedFiltroPayload, filtrosSalvos, filtroAllValues]
  );

  const hasMultiselectFilters =
    hasCcFilter ||
    hasNatureFilter ||
    hasPoloFilter ||
    hasFornecedorFilter ||
    hasHistoricoFilter ||
    hasTipoOperacaoFilter ||
    hasMovimentoTipoFilter;

  const configured = data?.data?.configured ?? false;
  const pathFailures = data?.data?.pathFailures ?? [];
  const apiMessage = data?.message || data?.data?.message || null;
  const loadFailed = data?.success === false;

  const filteredItems = useMemo(
    () =>
      sortItemsByDateDesc(
        items.filter((item) => {
          const matchesPeriod = itemMatchesCompensacaoPeriod(item, periodFrom, periodTo);
          const matchesSearch = extratoItemMatchesSearch(item, searchQuery);

          return (
            extratoMatchesAnyCcCodes(item.codCCusto, ccFilterCodes, ccAllValues) &&
            extratoMatchesAnyNatureCodesFiltered(
              item.codNatFinanceira,
              natureFilterCodes,
              natureAllValues
            ) &&
            extratoMatchesAnyPoloKeys(item, poloFilterIds, poloAllValues) &&
            extratoMatchesAnyFornecedor(
              item.fornecedor,
              fornecedorFilterValues,
              fornecedorAllValues
            ) &&
            extratoMatchesAnyHistorico(
              item.historico,
              historicoFilterValues,
              historicoAllValues
            ) &&
            extratoMatchesAnyTipoOperacao(
              item.tipoOperacao,
              tipoOperacaoFilterValues,
              tipoOperacaoAllValues
            ) &&
            extratoMatchesMovimentoTipo(item, movimentoTipoFilter, MOVIMENTO_TIPO_ALL_VALUES) &&
            matchesPeriod &&
            matchesSearch
          );
        })
      ),
    [
      items,
      ccFilterCodes,
      natureFilterCodes,
      poloFilterIds,
      fornecedorFilterValues,
      historicoFilterValues,
      tipoOperacaoFilterValues,
      movimentoTipoFilter,
      periodFrom,
      periodTo,
      searchQuery,
      ccAllValues,
      natureAllValues,
      poloAllValues,
      fornecedorAllValues,
      historicoAllValues,
      tipoOperacaoAllValues
    ]
  );

  const ajustesManuaisPdf = useMemo((): ExtratoCaixaPdfAjusteRow[] => {
    return filteredItems
      .filter(isExtratoAjusteManual)
      .sort(
        (a, b) =>
          (localDayKey(b.dataCompensacao) ?? 0) - (localDayKey(a.dataCompensacao) ?? 0)
      )
      .map((item) => ({
        data: formatDate(item.dataCompensacao),
        centroCusto: item.ccusto?.trim() || item.codCCusto?.trim() || '—',
        natureza: item.natureza?.trim() || '—',
        polo: resolveExtratoPolo(item).label,
        observacao: item.historico?.trim() || 'Ajuste manual',
        valor: item.valor
      }));
  }, [filteredItems]);

  const extratoStats = useMemo(() => computeExtratoStats(filteredItems), [filteredItems]);

  /** Base do grid do demonstrativo — data, centro de custo, polo e tipo de operação. */
  const demonstrativoItems = useMemo(
    () =>
      sortItemsByDateDesc(
        items.filter((item) =>
          itemMatchesDemonstrativoRecorte(item, {
            periodFrom,
            periodTo,
            ccFilterCodes,
            ccAllValues,
            poloFilterIds,
            poloAllValues,
            tipoOperacaoFilterValues,
            tipoOperacaoAllValues
          })
        )
      ),
    [
      items,
      periodFrom,
      periodTo,
      ccFilterCodes,
      ccAllValues,
      poloFilterIds,
      poloAllValues,
      tipoOperacaoFilterValues,
      tipoOperacaoAllValues
    ]
  );

  const demonstrativoRoi = useMemo(() => {
    // Mesma base dos cards Entradas / Saídas / Saldo líquido (filtros aplicados).
    const { totalEntrada, totalSaida } = extratoStats;
    if (totalSaida === 0) return null;
    return ((totalEntrada - totalSaida) / totalSaida) * 100;
  }, [extratoStats]);

  const receitaLiquidaNatureCodes = useMemo(
    () => buildReceitaLiquidaNatureCodes(items, natureFilterOptions),
    [items, natureFilterOptions]
  );

  const gastosPessoalNatureCodes = useMemo(
    () => buildGastosPessoalNatureCodes(items, natureFilterOptions),
    [items, natureFilterOptions]
  );

  const gastosAssessoriaExternaNatureCodes = useMemo(
    () => buildGastosAssessoriaExternaNatureCodes(items, natureFilterOptions),
    [items, natureFilterOptions]
  );

  const gastosEmpreitasNatureCodes = useMemo(
    () => buildGastosEmpreitasNatureCodes(items, natureFilterOptions),
    [items, natureFilterOptions]
  );

  const gastosMateriaisNatureCodes = useMemo(
    () => buildGastosMateriaisNatureCodes(items, natureFilterOptions),
    [items, natureFilterOptions]
  );

  const aporteCapitalSociosNatureCodes = useMemo(
    () => buildAporteCapitalSociosNatureCodes(items, natureFilterOptions),
    [items, natureFilterOptions]
  );

  const distribuicaoLucroNatureCodes = useMemo(
    () => buildDistribuicaoLucroNatureCodes(items, natureFilterOptions),
    [items, natureFilterOptions]
  );

  const ajustesVisiveis = useMemo(() => {
    const ids = new Set(
      filteredItems
        .filter(isExtratoAjusteManual)
        .map((item) => item.ajusteId)
        .filter((id): id is string => Boolean(id))
    );
    return ajustes.filter((a) => ids.has(a.id));
  }, [ajustes, filteredItems]);

  const demonstrativoReceitaLiquidaItems = useMemo(
    () =>
      collectDemonstrativoReceitaLiquidaItems(
        demonstrativoItems,
        receitaLiquidaNatureCodes,
        natureFilterOptions
      ),
    [demonstrativoItems, receitaLiquidaNatureCodes, natureFilterOptions]
  );

  const demonstrativoReceitaLiquida = useMemo(() => {
    let total = 0;
    for (const item of demonstrativoReceitaLiquidaItems) {
      total += contribuicaoReceitaLiquida(item);
    }
    return { total, qtd: demonstrativoReceitaLiquidaItems.length };
  }, [demonstrativoReceitaLiquidaItems]);

  const demonstrativoGastosPessoalItems = useMemo(
    () =>
      collectDemonstrativoGastosPessoalItems(
        demonstrativoItems,
        gastosPessoalNatureCodes,
        natureFilterOptions
      ),
    [demonstrativoItems, gastosPessoalNatureCodes, natureFilterOptions]
  );

  const demonstrativoGastosPessoal = useMemo(() => {
    let total = 0;
    for (const item of demonstrativoGastosPessoalItems) {
      total += contribuicaoGastosPessoal(item);
    }
    return { total, qtd: demonstrativoGastosPessoalItems.length };
  }, [demonstrativoGastosPessoalItems]);

  const demonstrativoGastosAssessoriaExternaItems = useMemo(
    () =>
      collectDemonstrativoGastosAssessoriaExternaItems(
        demonstrativoItems,
        gastosAssessoriaExternaNatureCodes,
        natureFilterOptions
      ),
    [demonstrativoItems, gastosAssessoriaExternaNatureCodes, natureFilterOptions]
  );

  const demonstrativoGastosAssessoriaExterna = useMemo(() => {
    let total = 0;
    for (const item of demonstrativoGastosAssessoriaExternaItems) {
      total += contribuicaoGastosAssessoriaExterna(item);
    }
    return { total, qtd: demonstrativoGastosAssessoriaExternaItems.length };
  }, [demonstrativoGastosAssessoriaExternaItems]);

  const demonstrativoGastosEmpreitasItems = useMemo(
    () =>
      collectDemonstrativoGastosEmpreitasItems(
        demonstrativoItems,
        gastosEmpreitasNatureCodes,
        natureFilterOptions
      ),
    [demonstrativoItems, gastosEmpreitasNatureCodes, natureFilterOptions]
  );

  const demonstrativoGastosEmpreitas = useMemo(() => {
    let total = 0;
    for (const item of demonstrativoGastosEmpreitasItems) {
      total += contribuicaoGastosEmpreitas(item);
    }
    return { total, qtd: demonstrativoGastosEmpreitasItems.length };
  }, [demonstrativoGastosEmpreitasItems]);

  const demonstrativoGastosMateriaisItems = useMemo(
    () =>
      collectDemonstrativoGastosMateriaisItems(
        demonstrativoItems,
        gastosMateriaisNatureCodes,
        natureFilterOptions
      ),
    [demonstrativoItems, gastosMateriaisNatureCodes, natureFilterOptions]
  );

  const demonstrativoGastosMateriais = useMemo(() => {
    let total = 0;
    for (const item of demonstrativoGastosMateriaisItems) {
      total += contribuicaoGastosMateriais(item);
    }
    return { total, qtd: demonstrativoGastosMateriaisItems.length };
  }, [demonstrativoGastosMateriaisItems]);

  const demonstrativoAporteCapitalSociosItems = useMemo(
    () =>
      collectDemonstrativoAporteCapitalSociosItems(
        demonstrativoItems,
        aporteCapitalSociosNatureCodes,
        natureFilterOptions
      ),
    [demonstrativoItems, aporteCapitalSociosNatureCodes, natureFilterOptions]
  );

  const demonstrativoAporteCapitalSocios = useMemo(() => {
    let total = 0;
    for (const item of demonstrativoAporteCapitalSociosItems) {
      total += contribuicaoAporteCapitalSocios(item);
    }
    return { total, qtd: demonstrativoAporteCapitalSociosItems.length };
  }, [demonstrativoAporteCapitalSociosItems]);

  const demonstrativoDistribuicaoLucroItems = useMemo(
    () =>
      collectDemonstrativoDistribuicaoLucroItems(
        demonstrativoItems,
        distribuicaoLucroNatureCodes,
        natureFilterOptions
      ),
    [demonstrativoItems, distribuicaoLucroNatureCodes, natureFilterOptions]
  );

  const demonstrativoDistribuicaoLucro = useMemo(() => {
    let total = 0;
    for (const item of demonstrativoDistribuicaoLucroItems) {
      total += contribuicaoDistribuicaoLucro(item);
    }
    return { total, qtd: demonstrativoDistribuicaoLucroItems.length };
  }, [demonstrativoDistribuicaoLucroItems]);

  const demonstrativoEntradasItems = useMemo(
    () => collectDemonstrativoEntradasItems(filteredItems),
    [filteredItems]
  );

  const demonstrativoSaidasItems = useMemo(
    () => collectDemonstrativoSaidasItems(filteredItems),
    [filteredItems]
  );

  const demonstrativoAjustesManuaisPdf = useMemo((): ExtratoCaixaPdfAjusteRow[] => {
    return demonstrativoItems
      .filter(isExtratoAjusteManual)
      .sort(
        (a, b) =>
          (localDayKey(b.dataCompensacao) ?? 0) - (localDayKey(a.dataCompensacao) ?? 0)
      )
      .map((item) => ({
        data: formatDate(item.dataCompensacao),
        centroCusto: item.ccusto?.trim() || item.codCCusto?.trim() || '—',
        natureza: item.natureza?.trim() || '—',
        polo: resolveExtratoPolo(item).label,
        observacao: item.historico?.trim() || 'Ajuste manual',
        valor: item.valor
      }));
  }, [demonstrativoItems]);

  const extratoResumoMensal = useMemo(
    () => buildExtratoResumoMensal(filteredItems),
    [filteredItems]
  );

  const extratoResumoCentroCusto = useMemo(
    () => buildExtratoResumoCentroCusto(filteredItems),
    [filteredItems]
  );

  const extratoResumoNatureza = useMemo(
    () => buildExtratoResumoNatureza(filteredItems),
    [filteredItems]
  );

  const extratoResumoPolo = useMemo(
    () =>
      buildExtratoResumoPolo(filteredItems, {
        entrada: itemEntrada,
        saida: (item) => item.saida,
        valor: itemSaldoLinha
      }),
    [filteredItems]
  );

  const extratoResumoFornecedor = useMemo(
    () => buildExtratoResumoFornecedor(filteredItems),
    [filteredItems]
  );

  const showDashboards =
    !isLoading && !isError && configured && !loadFailed;

  const buildPdfFilterLines = useCallback((): string[] => {
    const lines: string[] = [];

    if (activeFiltroSalvo) {
      lines.push(`Filtro salvo: ${activeFiltroSalvo.nome}`);
    }

    if (periodFrom || periodTo) {
      const de = periodFrom ? formatIsoDateInputBr(periodFrom) : '—';
      const ate = periodTo ? formatIsoDateInputBr(periodTo) : '—';
      lines.push(`Período de compensação: de ${de} até ${ate}`);
    }

    if (hasSearchQuery) {
      lines.push(`Busca: "${searchQuery.trim()}"`);
    }

    for (const campo of filtrosDesmarcados) {
      const qtd = campo.desmarcados.length;
      const lista = campo.desmarcados.join(' · ');
      lines.push(
        `${campo.campo} (${qtd} excluído${qtd !== 1 ? 's' : ''}): ${lista}`
      );
    }

    if (
      !periodFrom &&
      !periodTo &&
      !hasSearchQuery &&
      filtrosDesmarcados.length === 0 &&
      !hasMultiselectFilters
    ) {
      lines.push('Todos os itens marcados nos filtros de lista (sem restrição por campo).');
    }

    lines.push(`Movimentações no recorte: ${filteredItems.length.toLocaleString('pt-BR')}`);

    return lines;
  }, [
    activeFiltroSalvo,
    periodFrom,
    periodTo,
    hasSearchQuery,
    searchQuery,
    filtrosDesmarcados,
    hasMultiselectFilters,
    filteredItems.length
  ]);

  const buildDemonstrativoPdfFilterLines = useCallback((): string[] => {
    const lines: string[] = [
      'Indicadores de categoria: data de compensação, centro de custo, polo e tipo de operação.',
      'Saídas, entradas, saldo líquido e resumos: todos os filtros aplicados.'
    ];

    if (periodFrom || periodTo) {
      const de = periodFrom ? formatIsoDateInputBr(periodFrom) : '—';
      const ate = periodTo ? formatIsoDateInputBr(periodTo) : '—';
      lines.push(`Período de compensação: de ${de} até ${ate}`);
    } else {
      lines.push('Período: todos os lançamentos disponíveis.');
    }

    for (const campo of filtrosDesmarcados) {
      if (
        campo.campo !== 'Centro de custo' &&
        campo.campo !== 'Polo' &&
        campo.campo !== 'Tipo de operação'
      ) {
        continue;
      }
      const qtd = campo.desmarcados.length;
      const lista = campo.desmarcados.join(' · ');
      lines.push(
        `${campo.campo} (${qtd} excluído${qtd !== 1 ? 's' : ''}): ${lista}`
      );
    }

    lines.push(
      `Movimentações (fluxo): ${filteredItems.length.toLocaleString('pt-BR')}`
    );
    lines.push(
      `Movimentações (categorias): ${demonstrativoItems.length.toLocaleString('pt-BR')}`
    );

    return lines;
  }, [periodFrom, periodTo, filtrosDesmarcados, filteredItems.length, demonstrativoItems.length]);

  const handleExportDemonstrativoPdf = useCallback(async () => {
    setExportingDemonstrativoPdf(true);
    try {
      await exportDemonstrativoFinanceiroPdf({
        subtitle: pageSubtitle,
        stats: {
          totalEntrada: extratoStats.totalEntrada,
          totalSaida: extratoStats.totalSaida,
          saldoLiquido: extratoStats.saldoLiquido,
          qtdEntrada: extratoStats.qtdEntrada,
          qtdSaida: extratoStats.qtdSaida
        },
        movimentacoesFiltradas: filteredItems.length,
        filterLines: buildDemonstrativoPdfFilterLines(),
        roi: demonstrativoRoi,
        roiLabel:
          'ROI = ((Ganho Obtido − Investimento) ÷ Investimento) × 100 — período selecionado',
        cards: [
          {
            title: 'Gastos com Pessoal',
            qtd: demonstrativoGastosPessoal.qtd,
            total: demonstrativoGastosPessoal.total,
            kind: 'expense'
          },
          {
            title: 'Receita Líquida',
            qtd: demonstrativoReceitaLiquida.qtd,
            total: demonstrativoReceitaLiquida.total,
            kind: 'income'
          },
          {
            title: 'Gastos com Assessoria Externa',
            qtd: demonstrativoGastosAssessoriaExterna.qtd,
            total: demonstrativoGastosAssessoriaExterna.total,
            kind: 'expense'
          },
          {
            title: 'Aporte de Capital dos Socios',
            qtd: demonstrativoAporteCapitalSocios.qtd,
            total: demonstrativoAporteCapitalSocios.total,
            kind: 'income'
          },
          {
            title: 'Gastos com Empreitas',
            qtd: demonstrativoGastosEmpreitas.qtd,
            total: demonstrativoGastosEmpreitas.total,
            kind: 'expense'
          },
          {
            title: 'Distribuição de Lucro',
            qtd: demonstrativoDistribuicaoLucro.qtd,
            total: demonstrativoDistribuicaoLucro.total,
            kind: 'expense'
          },
          {
            title: 'Gastos com Materiais',
            qtd: demonstrativoGastosMateriais.qtd,
            total: demonstrativoGastosMateriais.total,
            kind: 'expense'
          }
        ],
        categories: [
          {
            sectionTitle: 'Gastos com Pessoal — por natureza',
            items: demonstrativoGastosPessoalItems
          },
          {
            sectionTitle: 'Receita Líquida — por natureza',
            items: demonstrativoReceitaLiquidaItems
          },
          {
            sectionTitle: 'Gastos com Assessoria Externa — por natureza',
            items: demonstrativoGastosAssessoriaExternaItems
          },
          {
            sectionTitle: 'Aporte de Capital dos Socios — por natureza',
            items: demonstrativoAporteCapitalSociosItems
          },
          {
            sectionTitle: 'Gastos com Empreitas — por natureza',
            items: demonstrativoGastosEmpreitasItems
          },
          {
            sectionTitle: 'Distribuição de Lucro — por natureza',
            items: demonstrativoDistribuicaoLucroItems
          },
          {
            sectionTitle: 'Gastos com Materiais — por natureza',
            items: demonstrativoGastosMateriaisItems
          },
          {
            sectionTitle: 'Entradas — por natureza',
            items: demonstrativoEntradasItems
          }
        ],
        resumos: {
          mensal: extratoResumoMensal,
          polo: extratoResumoPolo,
          centroCusto: extratoResumoCentroCusto
        },
        ajustesManuais: demonstrativoAjustesManuaisPdf
      });

      toast.success('PDF exportado com sucesso.');
    } catch {
      toast.error('Erro ao gerar o PDF. Tente novamente.');
    } finally {
      setExportingDemonstrativoPdf(false);
    }
  }, [
    pageSubtitle,
    buildDemonstrativoPdfFilterLines,
    extratoStats,
    filteredItems.length,
    demonstrativoRoi,
    demonstrativoGastosPessoal,
    demonstrativoReceitaLiquida,
    demonstrativoGastosAssessoriaExterna,
    demonstrativoAporteCapitalSocios,
    demonstrativoGastosEmpreitas,
    demonstrativoDistribuicaoLucro,
    demonstrativoGastosMateriais,
    demonstrativoGastosPessoalItems,
    demonstrativoReceitaLiquidaItems,
    demonstrativoGastosAssessoriaExternaItems,
    demonstrativoAporteCapitalSociosItems,
    demonstrativoGastosEmpreitasItems,
    demonstrativoDistribuicaoLucroItems,
    demonstrativoGastosMateriaisItems,
    demonstrativoEntradasItems,
    extratoResumoMensal,
    extratoResumoPolo,
    extratoResumoCentroCusto,
    demonstrativoAjustesManuaisPdf
  ]);

  const handleExportPdf = useCallback(
    async (mode: ExtratoPdfNatureMode) => {
      setExportingPdf(true);
      try {
        const includeAllNature = mode === 'all';
        const natureRows = includeAllNature
          ? extratoResumoNatureza
          : pickResumoRowsForPdf(extratoResumoNatureza, false, EXTRATO_RESUMO_TOP_SAIDA);

        await exportExtratoCaixaPdf({
          title: 'Balanço Financeiro',
          subtitle: pageSubtitle,
          stats: {
            totalEntrada: extratoStats.totalEntrada,
            totalSaida: extratoStats.totalSaida,
            saldoLiquido: extratoStats.saldoLiquido,
            qtdEntrada: extratoStats.qtdEntrada,
            qtdSaida: extratoStats.qtdSaida
          },
          movimentacoesFiltradas: filteredItems.length,
          filterLines: buildPdfFilterLines(),
          ajustesManuais: ajustesManuaisPdf,
          sections: [
            {
              title: 'Resumo por mês',
              rowLabelHeader: 'Mês',
              rows: extratoResumoMensal,
              totalRowLabel: 'Total',
              preserveRowOrder: true
            },
            {
              title: 'Resumo por polo',
              rowLabelHeader: 'Polo',
              rows: extratoResumoPolo,
              totalRowLabel: 'Total',
              preserveRowOrder: true
            },
            {
              title: 'Resumo por centro de custo',
              rowLabelHeader: 'Centro de custo',
              rows: extratoResumoCentroCusto,
              totalRowLabel: 'Total'
            },
            {
              title: 'Resumo por natureza financeira',
              rowLabelHeader: 'Natureza financeira',
              rows: natureRows,
              totalRowLabel: 'Total exibido',
              preserveRowOrder: !includeAllNature,
              footnote: includeAllNature
                ? 'Todas as naturezas'
                : `Top ${EXTRATO_RESUMO_TOP_SAIDA} maiores saídas`
            }
          ]
        });

        toast.success('PDF exportado com sucesso.');
        setExportPdfModalOpen(false);
      } catch {
        toast.error('Erro ao gerar o PDF. Tente novamente.');
      } finally {
        setExportingPdf(false);
      }
    },
    [
      buildPdfFilterLines,
      ajustesManuaisPdf,
      extratoResumoMensal,
      extratoResumoCentroCusto,
      extratoResumoPolo,
      extratoResumoNatureza,
      extratoStats,
      filteredItems.length,
      pageSubtitle
    ]
  );

  if (permissionsLoading) {
    return <Loading message="Verificando permissões..." fullScreen size="lg" />;
  }

  if (!canAccess) {
    return (
      <MainLayout userRole="EMPLOYEE" userName={user?.name ?? ''}>
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-1 h-6 w-6 flex-shrink-0 text-red-600 dark:text-red-400" />
              <div>
                <h3 className="mb-2 text-lg font-semibold text-red-800 dark:text-red-200">
                  Acesso Negado
                </h3>
                <p className="text-sm text-red-700 dark:text-red-300">
                  Você não tem permissão para acessar esta página. Apenas administradores e
                  membros do departamento financeiro podem acessar.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  return (
    <ProtectedRoute route="/ponto/financeiro/analise-extrato">
      <MainLayout userRole="EMPLOYEE" userName={user?.name ?? ''}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100">
              {pageTitle}
            </h1>
            <p className="mt-2 text-sm text-gray-600 sm:text-base dark:text-gray-400">
              {pageSubtitle}
            </p>
          </div>

          <BalancoFinanceiroTabNav activeTab={activeBalancoTab} onTabChange={setActiveBalancoTab} />

          {activeBalancoTab === 'extrato' ? (
            <>
          {canAccess ? (
            <ExtratoCaixaAjustesPanel
              enabled={canAccess}
              sourceItems={rmItems}
              ajustesVisiveis={ajustesVisiveis}
              totalAjustesCadastrados={ajustes.length}
            />
          ) : null}

          {configured && !loadFailed ? (
            <div className="space-y-3">
              <ExtratoSearchFilterBar
                searchQuery={searchQuery}
                onSearchQueryChange={setSearchQuery}
                searchInputRef={searchInputRef}
                onOpenFilters={() => setIsFiltersModalOpen(true)}
                hasActiveFilters={hasActiveFilters}
                disabled={isLoading || isFetching}
                exportAction={
                  showDashboards ? (
                    <button
                      type="button"
                      onClick={() => setExportPdfModalOpen(true)}
                      className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                      <Download className="h-4 w-4 shrink-0" aria-hidden />
                      <span>Exportar PDF</span>
                    </button>
                  ) : null
                }
              />
              {filtrosDesmarcados.length > 0 ? (
                <ExtratoFiltrosDesmarcadosResumo
                  camposDesmarcados={filtrosDesmarcados}
                />
              ) : null}
            </div>
          ) : null}

          {pathFailures.length > 0 ? (
            <Card className="border-amber-200 dark:border-amber-800">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                  <div className="min-w-0 text-sm text-amber-800 dark:text-amber-200">
                    <p className="font-medium">
                      Algumas consultas do balanço no TOTVS RM não retornaram dados.
                    </p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-amber-700 dark:text-amber-300">
                      {pathFailures.map((f) => (
                        <li key={f.path} className="break-all">
                          <span className="font-mono text-xs">{f.path}</span>
                          {f.error ? ` — ${f.error}` : null}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-amber-700 dark:text-amber-300">
                      O ano pode aparecer no filtro mesmo sem movimentações se a consulta falhou.
                      Verifique no RM se a consulta SQL EXTRATOCX2026 existe e está publicada.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {showDashboards ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                        <ArrowUpRight className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                      </div>
                      <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                        <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                          Saídas{' '}
                          <span className="text-gray-400 dark:text-gray-500">
                            ({extratoStats.qtdSaida})
                          </span>
                        </p>
                        <p className="mt-1 truncate text-lg font-bold text-red-700 dark:text-red-300 sm:text-2xl">
                          {formatCurrency(extratoStats.totalSaida)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 rounded-lg bg-green-100 p-2 sm:p-3 dark:bg-green-900/30">
                        <ArrowDownLeft className="h-5 w-5 text-green-600 dark:text-green-400 sm:h-6 sm:w-6" />
                      </div>
                      <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                        <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                          Entradas{' '}
                          <span className="text-gray-400 dark:text-gray-500">
                            ({extratoStats.qtdEntrada})
                          </span>
                        </p>
                        <p className="mt-1 truncate text-lg font-bold text-green-700 dark:text-green-300 sm:text-2xl">
                          {formatCurrency(extratoStats.totalEntrada)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4 sm:p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 rounded-lg bg-yellow-100 p-2 sm:p-3 dark:bg-yellow-900/30">
                        <Wallet className="h-5 w-5 text-yellow-600 dark:text-yellow-400 sm:h-6 sm:w-6" />
                      </div>
                      <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                        <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                          Saldo Liquido
                        </p>
                        <p
                          className={`mt-1 truncate text-lg font-bold sm:text-2xl ${
                            extratoStats.saldoLiquido >= 0
                              ? 'text-gray-900 dark:text-gray-100'
                              : 'text-red-600 dark:text-red-400'
                          }`}
                        >
                          {formatCurrency(extratoStats.saldoLiquido)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <ExtratoResumoTable
                title="Resumo por mês"
                subtitle="Totais de entrada, saída e valor agrupados pela data de compensação."
                icon={CalendarDays}
                rowLabelHeader="Mês"
                countLabel="meses"
                rows={extratoResumoMensal}
                detailItems={filteredItems}
                getItemGroupKey={itemCompensacaoMonthKey}
                rowSort="month-desc"
              />

              <ExtratoResumoTable
                title="Resumo por polo"
                subtitle="Totais de entrada, saída e valor agrupados por polo, conforme o centro de custo da movimentação."
                icon={Building2}
                rowLabelHeader="Polo"
                countLabel="polos"
                rows={extratoResumoPolo}
                detailItems={filteredItems}
                getItemGroupKey={poloGroupKey}
              />

              <ExtratoResumoTable
                title="Resumo por centro de custo"
                subtitle="Totais de entrada, saída e valor agrupados por centro de custo."
                icon={ListPlus}
                rowLabelHeader="Centro de custo"
                countLabel="centros de custo"
                rows={extratoResumoCentroCusto}
                detailItems={filteredItems}
                getItemGroupKey={ccGroupKey}
              />

              <ExtratoResumoTable
                title="Resumo por natureza financeira"
                subtitle="Totais de entrada, saída e valor agrupados por natureza financeira."
                icon={BookOpen}
                rowLabelHeader="Natureza financeira"
                countLabel="naturezas"
                rows={extratoResumoNatureza}
                detailItems={filteredItems}
                getItemGroupKey={natureGroupKey}
              />

              <ExtratoResumoTable
                title="Resumo por fornecedor"
                subtitle="Totais de entrada, saída e valor agrupados por fornecedor."
                icon={Building2}
                rowLabelHeader="Fornecedor"
                countLabel="fornecedores"
                rows={extratoResumoFornecedor}
                detailItems={filteredItems}
                getItemGroupKey={fornecedorGroupKey}
              />
            </div>
          ) : null}

          {isLoading ? (
            <ExtratoCaixaLoadingSkeleton />
          ) : isError ? (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
                <p className="text-gray-600 dark:text-gray-400">Erro ao carregar balanço financeiro</p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                  {(error as Error)?.message || 'Tente novamente.'}
                </p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-4 text-sm font-medium text-red-600 underline dark:text-red-400"
                >
                  Tentar novamente
                </button>
              </CardContent>
            </Card>
          ) : !configured ? (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-400" />
                <p className="text-gray-600 dark:text-gray-400">
                  {apiMessage || 'Integração TOTVS RM não configurada no servidor.'}
                </p>
              </CardContent>
            </Card>
          ) : loadFailed ? (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
                <p className="text-gray-600 dark:text-gray-400">Falha ao consultar o TOTVS RM</p>
                <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">{apiMessage}</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="mt-4 text-sm font-medium text-red-600 underline dark:text-red-400"
                >
                  Tentar novamente
                </button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {isFetching ? <ExtratoCaixaRefetchBar /> : null}
              <ExtratoItemsList
                items={filteredItems}
                emptyMessage={
                  hasListRefinement
                    ? 'Nenhuma movimentação encontrada com os filtros ou termo de busca aplicados.'
                    : 'Nenhuma movimentação encontrada no balanço.'
                }
              />
            </div>
          )}
            </>
          ) : (
            <div className="space-y-6" role="tabpanel" aria-label="Demonstrativo Financeiro">
              {canAccess ? (
                <ExtratoCaixaAjustesPanel
              enabled={canAccess}
              sourceItems={rmItems}
              ajustesVisiveis={ajustesVisiveis}
              totalAjustesCadastrados={ajustes.length}
            />
              ) : null}

              {configured && !loadFailed ? (
                <div className="space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className={DEMONSTRATIVO_FILTRO_HINT_CLASS}>
                      <Filter className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      <span>
                        Os cards de categoria consideram{' '}
                        <span className="font-medium text-gray-600 dark:text-gray-300">
                          data de compensação
                        </span>
                        ,{' '}
                        <span className="font-medium text-gray-600 dark:text-gray-300">
                          centro de custo
                        </span>{' '}
                        e{' '}
                        <span className="font-medium text-gray-600 dark:text-gray-300">polo</span>
                        {' e '}
                        <span className="font-medium text-gray-600 dark:text-gray-300">
                          tipo de operação
                        </span>
                        .
                        Saídas, entradas, saldo líquido e resumos seguem{' '}
                        <span className="font-medium text-gray-600 dark:text-gray-300">
                          todos os filtros
                        </span>{' '}
                        aplicados.
                        {hasPeriodFilter ? (
                          <>
                            {' '}
                            Período:{' '}
                            {periodFrom ? formatIsoDateInputBr(periodFrom) : '—'} até{' '}
                            {periodTo ? formatIsoDateInputBr(periodTo) : '—'}.
                          </>
                        ) : null}
                      </span>
                    </p>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                      {showDashboards ? (
                        <button
                          type="button"
                          onClick={() => void handleExportDemonstrativoPdf()}
                          disabled={isLoading || isFetching || exportingDemonstrativoPdf}
                          className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                        >
                          {exportingDemonstrativoPdf ? (
                            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                          ) : (
                            <Download className="h-4 w-4 shrink-0" aria-hidden />
                          )}
                          <span>
                            {exportingDemonstrativoPdf ? 'Gerando PDF…' : 'Exportar PDF'}
                          </span>
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setIsFiltersModalOpen(true)}
                        disabled={isLoading || isFetching}
                        className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          hasActiveFilters
                            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                      >
                        <Filter className="h-4 w-4" aria-hidden />
                        Filtros
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {pathFailures.length > 0 ? (
                <Card className="border-amber-200 dark:border-amber-800">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="min-w-0 text-sm text-amber-800 dark:text-amber-200">
                        <p className="font-medium">
                          Algumas consultas do balanço no TOTVS RM não retornaram dados.
                        </p>
                        <ul className="mt-2 list-inside list-disc space-y-1 text-amber-700 dark:text-amber-300">
                          {pathFailures.map((f) => (
                            <li key={f.path} className="break-all">
                              <span className="font-mono text-xs">{f.path}</span>
                              {f.error ? ` — ${f.error}` : null}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}

              {isLoading ? (
                <ExtratoCaixaLoadingSkeleton />
              ) : isError ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
                    <p className="text-gray-600 dark:text-gray-400">
                      Erro ao carregar balanço financeiro
                    </p>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">
                      {(error as Error)?.message || 'Tente novamente.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="mt-4 text-sm font-medium text-red-600 underline dark:text-red-400"
                    >
                      Tentar novamente
                    </button>
                  </CardContent>
                </Card>
              ) : !configured ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <AlertCircle className="mx-auto mb-4 h-12 w-12 text-amber-400" />
                    <p className="text-gray-600 dark:text-gray-400">
                      {apiMessage || 'Integração TOTVS RM não configurada no servidor.'}
                    </p>
                  </CardContent>
                </Card>
              ) : loadFailed ? (
                <Card>
                  <CardContent className="py-8 text-center">
                    <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-400" />
                    <p className="text-gray-600 dark:text-gray-400">Falha ao consultar o TOTVS RM</p>
                    <p className="mt-2 text-sm text-gray-500 dark:text-gray-500">{apiMessage}</p>
                    <button
                      type="button"
                      onClick={() => refetch()}
                      className="mt-4 text-sm font-medium text-red-600 underline dark:text-red-400"
                    >
                      Tentar novamente
                    </button>
                  </CardContent>
                </Card>
              ) : showDashboards ? (
                <div className="space-y-6">
                  {isFetching ? <ExtratoCaixaRefetchBar /> : null}

                  <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 sm:gap-6">
                    <Card
                      padding="none"
                      className={`${DEMONSTRATIVO_RECORTE_CARD_CLASS} border-rose-200 dark:border-rose-800/60 ${DEMONSTRATIVO_CARD_CLICKABLE_CLASS}`}
                    >
                      <button
                        type="button"
                        className={DEMONSTRATIVO_RECORTE_CARD_BUTTON_CLASS}
                        onClick={() => setDemonstrativoDetalhe('gastos-pessoal')}
                        aria-label="Ver detalhes de Gastos com Pessoal"
                      >
                        <CardContent className={DEMONSTRATIVO_RECORTE_CARD_CONTENT_CLASS}>
                          <div className={DEMONSTRATIVO_RECORTE_CARD_BODY_CLASS}>
                            <div className="flex-shrink-0 rounded-lg bg-rose-100 p-2 sm:p-3 dark:bg-rose-900/30">
                              <Users className="h-5 w-5 text-rose-600 dark:text-rose-400 sm:h-6 sm:w-6" />
                            </div>
                            <div className={DEMONSTRATIVO_RECORTE_CARD_TEXT_CLASS}>
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                                Gastos com Pessoal{' '}
                                <span className="text-gray-400 dark:text-gray-500">
                                  ({demonstrativoGastosPessoal.qtd})
                                </span>
                              </p>
                              <p className="mt-1 truncate text-lg font-bold text-red-700 dark:text-red-300 sm:text-2xl">
                                {formatCurrency(demonstrativoGastosPessoal.total)}
                              </p>
                              <p className={DEMONSTRATIVO_RECORTE_CARD_DESC_CLASS}>
                                Soma das saídas com naturezas de folha, benefícios, encargos e
                                despesas de pessoal no recorte atual.
                              </p>
                              <p className="mt-2 text-xs font-medium text-rose-600/90 dark:text-rose-400/90">
                                Clique para ver detalhes
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </button>
                    </Card>

                    <Card
                      padding="none"
                      className={`${DEMONSTRATIVO_RECORTE_CARD_CLASS} border-emerald-200 dark:border-emerald-800/60 ${DEMONSTRATIVO_CARD_CLICKABLE_CLASS}`}
                    >
                      <button
                        type="button"
                        className={DEMONSTRATIVO_RECORTE_CARD_BUTTON_CLASS}
                        onClick={() => setDemonstrativoDetalhe('receita-liquida')}
                        aria-label="Ver detalhes da Receita Líquida"
                      >
                        <CardContent className={DEMONSTRATIVO_RECORTE_CARD_CONTENT_CLASS}>
                          <div className={DEMONSTRATIVO_RECORTE_CARD_BODY_CLASS}>
                            <div className="flex-shrink-0 rounded-lg bg-emerald-100 p-2 sm:p-3 dark:bg-emerald-900/30">
                              <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400 sm:h-6 sm:w-6" />
                            </div>
                            <div className={DEMONSTRATIVO_RECORTE_CARD_TEXT_CLASS}>
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                                Receita Líquida{' '}
                                <span className="text-gray-400 dark:text-gray-500">
                                  ({demonstrativoReceitaLiquida.qtd})
                                </span>
                              </p>
                              <p
                                className={`mt-1 truncate text-lg font-bold sm:text-2xl ${
                                  demonstrativoReceitaLiquida.total >= 0
                                    ? 'text-emerald-700 dark:text-emerald-300'
                                    : 'text-red-600 dark:text-red-400'
                                }`}
                              >
                                {formatCurrency(demonstrativoReceitaLiquida.total)}
                              </p>
                              <p className={DEMONSTRATIVO_RECORTE_CARD_DESC_CLASS}>
                                Lançamentos e ajustes manuais com natureza &quot;RECEITA -
                                MANUTENCAO&quot; ou &quot;RECEITA - TERCEIRIZACAO MAO DE OBRA&quot;, no
                                período e busca do recorte.
                              </p>
                              <p className="mt-2 text-xs font-medium text-emerald-600/90 dark:text-emerald-400/90">
                                Clique para ver detalhes
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </button>
                    </Card>

                    <Card
                      padding="none"
                      className={`${DEMONSTRATIVO_RECORTE_CARD_CLASS} border-violet-200 dark:border-violet-800/60 ${DEMONSTRATIVO_CARD_CLICKABLE_CLASS}`}
                    >
                      <button
                        type="button"
                        className={DEMONSTRATIVO_RECORTE_CARD_BUTTON_CLASS}
                        onClick={() => setDemonstrativoDetalhe('gastos-assessoria-externa')}
                        aria-label="Ver detalhes de Gastos com Assessoria Externa"
                      >
                        <CardContent className={DEMONSTRATIVO_RECORTE_CARD_CONTENT_CLASS}>
                          <div className={DEMONSTRATIVO_RECORTE_CARD_BODY_CLASS}>
                            <div className="flex-shrink-0 rounded-lg bg-violet-100 p-2 sm:p-3 dark:bg-violet-900/30">
                              <Briefcase className="h-5 w-5 text-violet-600 dark:text-violet-400 sm:h-6 sm:w-6" />
                            </div>
                            <div className={DEMONSTRATIVO_RECORTE_CARD_TEXT_CLASS}>
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                                Gastos com Assessoria Externa{' '}
                                <span className="text-gray-400 dark:text-gray-500">
                                  ({demonstrativoGastosAssessoriaExterna.qtd})
                                </span>
                              </p>
                              <p className="mt-1 truncate text-lg font-bold text-red-700 dark:text-red-300 sm:text-2xl">
                                {formatCurrency(demonstrativoGastosAssessoriaExterna.total)}
                              </p>
                              <p className={DEMONSTRATIVO_RECORTE_CARD_DESC_CLASS}>
                                Soma das saídas com naturezas de assessoria jurídica, contabilidade
                                e assessoria gerencial no recorte atual.
                              </p>
                              <p className="mt-2 text-xs font-medium text-violet-600/90 dark:text-violet-400/90">
                                Clique para ver detalhes
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </button>
                    </Card>

                    <Card
                      padding="none"
                      className={`${DEMONSTRATIVO_RECORTE_CARD_CLASS} border-sky-200 dark:border-sky-800/60 ${DEMONSTRATIVO_CARD_CLICKABLE_CLASS}`}
                    >
                      <button
                        type="button"
                        className={DEMONSTRATIVO_RECORTE_CARD_BUTTON_CLASS}
                        onClick={() => setDemonstrativoDetalhe('aporte-capital-socios')}
                        aria-label="Ver detalhes de Aporte de Capital dos Socios"
                      >
                        <CardContent className={DEMONSTRATIVO_RECORTE_CARD_CONTENT_CLASS}>
                          <div className={DEMONSTRATIVO_RECORTE_CARD_BODY_CLASS}>
                            <div className="flex-shrink-0 rounded-lg bg-sky-100 p-2 sm:p-3 dark:bg-sky-900/30">
                              <Landmark className="h-5 w-5 text-sky-600 dark:text-sky-400 sm:h-6 sm:w-6" />
                            </div>
                            <div className={DEMONSTRATIVO_RECORTE_CARD_TEXT_CLASS}>
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                                Aporte de Capital dos Socios{' '}
                                <span className="text-gray-400 dark:text-gray-500">
                                  ({demonstrativoAporteCapitalSocios.qtd})
                                </span>
                              </p>
                              <p
                                className={`mt-1 truncate text-lg font-bold sm:text-2xl ${
                                  demonstrativoAporteCapitalSocios.total >= 0
                                    ? 'text-sky-700 dark:text-sky-300'
                                    : 'text-red-600 dark:text-red-400'
                                }`}
                              >
                                {formatCurrency(demonstrativoAporteCapitalSocios.total)}
                              </p>
                              <p className={DEMONSTRATIVO_RECORTE_CARD_DESC_CLASS}>
                                Soma das entradas com natureza &quot;APORTE DE CAPITAL DE
                                SOCIOS&quot; ou &quot;EMPRESTIMO DE SOCIOS - ENTRADA&quot; no recorte
                                atual.
                              </p>
                              <p className="mt-2 text-xs font-medium text-sky-600/90 dark:text-sky-400/90">
                                Clique para ver detalhes
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </button>
                    </Card>

                    <Card
                      padding="none"
                      className={`${DEMONSTRATIVO_RECORTE_CARD_CLASS} border-amber-200 dark:border-amber-800/60 ${DEMONSTRATIVO_CARD_CLICKABLE_CLASS}`}
                    >
                      <button
                        type="button"
                        className={DEMONSTRATIVO_RECORTE_CARD_BUTTON_CLASS}
                        onClick={() => setDemonstrativoDetalhe('gastos-empreitas')}
                        aria-label="Ver detalhes de Gastos com Empreitas"
                      >
                        <CardContent className={DEMONSTRATIVO_RECORTE_CARD_CONTENT_CLASS}>
                          <div className={DEMONSTRATIVO_RECORTE_CARD_BODY_CLASS}>
                            <div className="flex-shrink-0 rounded-lg bg-amber-100 p-2 sm:p-3 dark:bg-amber-900/30">
                              <HardHat className="h-5 w-5 text-amber-600 dark:text-amber-400 sm:h-6 sm:w-6" />
                            </div>
                            <div className={DEMONSTRATIVO_RECORTE_CARD_TEXT_CLASS}>
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                                Gastos com Empreitas{' '}
                                <span className="text-gray-400 dark:text-gray-500">
                                  ({demonstrativoGastosEmpreitas.qtd})
                                </span>
                              </p>
                              <p className="mt-1 truncate text-lg font-bold text-red-700 dark:text-red-300 sm:text-2xl">
                                {formatCurrency(demonstrativoGastosEmpreitas.total)}
                              </p>
                              <p className={DEMONSTRATIVO_RECORTE_CARD_DESC_CLASS}>
                                Soma das saídas com naturezas de projetos, serviços terceirizados,
                                engenharia especializada e outros serviços tomados no recorte atual.
                              </p>
                              <p className="mt-2 text-xs font-medium text-amber-600/90 dark:text-amber-400/90">
                                Clique para ver detalhes
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </button>
                    </Card>

                    <Card
                      padding="none"
                      className={`${DEMONSTRATIVO_RECORTE_CARD_CLASS} border-fuchsia-200 dark:border-fuchsia-800/60 ${DEMONSTRATIVO_CARD_CLICKABLE_CLASS}`}
                    >
                      <button
                        type="button"
                        className={DEMONSTRATIVO_RECORTE_CARD_BUTTON_CLASS}
                        onClick={() => setDemonstrativoDetalhe('distribuicao-lucro')}
                        aria-label="Ver detalhes de Distribuição de Lucro"
                      >
                        <CardContent className={DEMONSTRATIVO_RECORTE_CARD_CONTENT_CLASS}>
                          <div className={DEMONSTRATIVO_RECORTE_CARD_BODY_CLASS}>
                            <div className="flex-shrink-0 rounded-lg bg-fuchsia-100 p-2 sm:p-3 dark:bg-fuchsia-900/30">
                              <PieChart className="h-5 w-5 text-fuchsia-600 dark:text-fuchsia-400 sm:h-6 sm:w-6" />
                            </div>
                            <div className={DEMONSTRATIVO_RECORTE_CARD_TEXT_CLASS}>
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                                Distribuição de Lucro{' '}
                                <span className="text-gray-400 dark:text-gray-500">
                                  ({demonstrativoDistribuicaoLucro.qtd})
                                </span>
                              </p>
                              <p className="mt-1 truncate text-lg font-bold text-red-700 dark:text-red-300 sm:text-2xl">
                                {formatCurrency(demonstrativoDistribuicaoLucro.total)}
                              </p>
                              <p className={DEMONSTRATIVO_RECORTE_CARD_DESC_CLASS}>
                                Soma das saídas com natureza &quot;DISTRIBUICAO DE LUCROS&quot; ou
                                &quot;REPASSES A DEMANDAS DA DIRETORIA - SV&quot; no recorte atual.
                              </p>
                              <p className="mt-2 text-xs font-medium text-fuchsia-600/90 dark:text-fuchsia-400/90">
                                Clique para ver detalhes
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </button>
                    </Card>

                    <Card
                      padding="none"
                      className={`${DEMONSTRATIVO_RECORTE_CARD_CLASS} border-orange-200 dark:border-orange-800/60 ${DEMONSTRATIVO_CARD_CLICKABLE_CLASS}`}
                    >
                      <button
                        type="button"
                        className={DEMONSTRATIVO_RECORTE_CARD_BUTTON_CLASS}
                        onClick={() => setDemonstrativoDetalhe('gastos-materiais')}
                        aria-label="Ver detalhes de Gastos com Materiais"
                      >
                        <CardContent className={DEMONSTRATIVO_RECORTE_CARD_CONTENT_CLASS}>
                          <div className={DEMONSTRATIVO_RECORTE_CARD_BODY_CLASS}>
                            <div className="flex-shrink-0 rounded-lg bg-orange-100 p-2 sm:p-3 dark:bg-orange-900/30">
                              <Package className="h-5 w-5 text-orange-600 dark:text-orange-400 sm:h-6 sm:w-6" />
                            </div>
                            <div className={DEMONSTRATIVO_RECORTE_CARD_TEXT_CLASS}>
                              <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                                Gastos com Materiais{' '}
                                <span className="text-gray-400 dark:text-gray-500">
                                  ({demonstrativoGastosMateriais.qtd})
                                </span>
                              </p>
                              <p className="mt-1 truncate text-lg font-bold text-red-700 dark:text-red-300 sm:text-2xl">
                                {formatCurrency(demonstrativoGastosMateriais.total)}
                              </p>
                              <p className={DEMONSTRATIVO_RECORTE_CARD_DESC_CLASS}>
                                Soma das saídas com naturezas de insumos, materiais de construção,
                                ferramentas e demais itens de material no recorte atual.
                              </p>
                              <p className="mt-2 text-xs font-medium text-orange-600/90 dark:text-orange-400/90">
                                Clique para ver detalhes
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </button>
                    </Card>

                    <Card
                      padding="none"
                      className={`${DEMONSTRATIVO_RECORTE_CARD_CLASS} border-teal-200 dark:border-teal-800/60`}
                    >
                      <CardContent className={DEMONSTRATIVO_RECORTE_CARD_CONTENT_CLASS}>
                        <div className={DEMONSTRATIVO_RECORTE_CARD_BODY_CLASS}>
                          <div className="flex-shrink-0 rounded-lg bg-teal-100 p-2 sm:p-3 dark:bg-teal-900/30">
                            <Percent className="h-5 w-5 text-teal-600 dark:text-teal-400 sm:h-6 sm:w-6" />
                          </div>
                          <div className={DEMONSTRATIVO_RECORTE_CARD_TEXT_CLASS}>
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                              ROI
                            </p>
                            <p
                              className={`mt-1 truncate text-lg font-bold sm:text-2xl ${
                                demonstrativoRoi == null
                                  ? 'text-gray-500 dark:text-gray-400'
                                  : demonstrativoRoi >= 0
                                    ? 'text-teal-700 dark:text-teal-300'
                                    : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {demonstrativoRoi == null ? '—' : formatPercent(demonstrativoRoi)}
                            </p>
                            <p className={DEMONSTRATIVO_RECORTE_CARD_DESC_CLASS}>
                              ROI = ((Ganho Obtido − Investimento) ÷ Investimento) × 100
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-3">
                    <Card padding="none" className={DEMONSTRATIVO_CARD_CLICKABLE_CLASS}>
                      <button
                        type="button"
                        className="h-full w-full text-left"
                        onClick={() => setDemonstrativoDetalhe('saidas')}
                        aria-label="Ver detalhes das Saídas"
                      >
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                              <ArrowUpRight className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                            </div>
                            <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                              <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                                Saídas{' '}
                                <span className="text-gray-400 dark:text-gray-500">
                                  ({extratoStats.qtdSaida})
                                </span>
                              </p>
                              <p className="mt-1 truncate text-lg font-bold text-red-700 dark:text-red-300 sm:text-2xl">
                                {formatCurrency(extratoStats.totalSaida)}
                              </p>
                              <p className="mt-1 text-xs font-medium text-red-600/90 dark:text-red-400/90">
                                Clique para ver detalhes
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </button>
                    </Card>

                    <Card padding="none" className={DEMONSTRATIVO_CARD_CLICKABLE_CLASS}>
                      <button
                        type="button"
                        className="h-full w-full text-left"
                        onClick={() => setDemonstrativoDetalhe('entradas')}
                        aria-label="Ver detalhes das Entradas"
                      >
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 rounded-lg bg-green-100 p-2 sm:p-3 dark:bg-green-900/30">
                              <ArrowDownLeft className="h-5 w-5 text-green-600 dark:text-green-400 sm:h-6 sm:w-6" />
                            </div>
                            <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                              <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                                Entradas{' '}
                                <span className="text-gray-400 dark:text-gray-500">
                                  ({extratoStats.qtdEntrada})
                                </span>
                              </p>
                              <p className="mt-1 truncate text-lg font-bold text-green-700 dark:text-green-300 sm:text-2xl">
                                {formatCurrency(extratoStats.totalEntrada)}
                              </p>
                              <p className="mt-1 text-xs font-medium text-green-600/90 dark:text-green-400/90">
                                Clique para ver detalhes
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </button>
                    </Card>

                    <Card padding="none" className={DEMONSTRATIVO_CARD_CLICKABLE_CLASS}>
                      <button
                        type="button"
                        className="h-full w-full text-left"
                        onClick={() => setDemonstrativoDetalhe('saldo-liquido')}
                        aria-label="Ver detalhes do Saldo Líquido"
                      >
                        <CardContent className="p-4 sm:p-6">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 rounded-lg bg-yellow-100 p-2 sm:p-3 dark:bg-yellow-900/30">
                              <Wallet className="h-5 w-5 text-yellow-600 dark:text-yellow-400 sm:h-6 sm:w-6" />
                            </div>
                            <div className="ml-3 min-w-0 flex-1 sm:ml-4">
                              <p className="whitespace-normal text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
                                Saldo Liquido
                              </p>
                              <p
                                className={`mt-1 truncate text-lg font-bold sm:text-2xl ${
                                  extratoStats.saldoLiquido >= 0
                                    ? 'text-gray-900 dark:text-gray-100'
                                    : 'text-red-600 dark:text-red-400'
                                }`}
                              >
                                {formatCurrency(extratoStats.saldoLiquido)}
                              </p>
                              <p className="mt-1 text-xs font-medium text-yellow-600/90 dark:text-yellow-400/90">
                                Clique para ver detalhes
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </button>
                    </Card>
                  </div>

                  <ExtratoResumoTable
                    title="Resumo por mês"
                    subtitle="Totais de entrada, saída e valor agrupados pela data de compensação."
                    icon={CalendarDays}
                    rowLabelHeader="Mês"
                    countLabel="meses"
                    rows={extratoResumoMensal}
                    detailItems={filteredItems}
                    getItemGroupKey={itemCompensacaoMonthKey}
                    rowSort="month-desc"
                  />

                  <ExtratoResumoTable
                    title="Resumo por polo"
                    subtitle="Totais de entrada, saída e valor agrupados por polo, conforme o centro de custo da movimentação."
                    icon={Building2}
                    rowLabelHeader="Polo"
                    countLabel="polos"
                    rows={extratoResumoPolo}
                    detailItems={filteredItems}
                    getItemGroupKey={poloGroupKey}
                  />

                  <ExtratoResumoTable
                    title="Resumo por centro de custo"
                    subtitle="Totais de entrada, saída e valor agrupados por centro de custo."
                    icon={ListPlus}
                    rowLabelHeader="Centro de custo"
                    countLabel="centros de custo"
                    rows={extratoResumoCentroCusto}
                    detailItems={filteredItems}
                    getItemGroupKey={ccGroupKey}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>

        <ExtratoDemonstrativoDetalheModal
          kind={demonstrativoDetalhe}
          onClose={() => setDemonstrativoDetalhe(null)}
          chartItems={
            isDemonstrativoFluxoKind(demonstrativoDetalhe) ? filteredItems : undefined
          }
          items={
            demonstrativoDetalhe === 'receita-liquida'
              ? demonstrativoReceitaLiquidaItems
              : demonstrativoDetalhe === 'gastos-pessoal'
                ? demonstrativoGastosPessoalItems
                : demonstrativoDetalhe === 'gastos-assessoria-externa'
                  ? demonstrativoGastosAssessoriaExternaItems
                  : demonstrativoDetalhe === 'gastos-empreitas'
                    ? demonstrativoGastosEmpreitasItems
                    : demonstrativoDetalhe === 'gastos-materiais'
                      ? demonstrativoGastosMateriaisItems
                      : demonstrativoDetalhe === 'aporte-capital-socios'
                      ? demonstrativoAporteCapitalSociosItems
                      : demonstrativoDetalhe === 'distribuicao-lucro'
                        ? demonstrativoDistribuicaoLucroItems
                        : demonstrativoDetalhe === 'entradas'
                    ? demonstrativoEntradasItems
                    : demonstrativoDetalhe === 'saidas'
                      ? demonstrativoSaidasItems
                      : demonstrativoDetalhe === 'saldo-liquido'
                        ? filteredItems
                    : []
          }
        />

        <ExtratoExportPdfModal
          isOpen={exportPdfModalOpen}
          onClose={() => setExportPdfModalOpen(false)}
          onConfirm={handleExportPdf}
          exporting={exportingPdf}
          natureCount={extratoResumoNatureza.length}
          topLimit={EXTRATO_RESUMO_TOP_SAIDA}
        />

        <ExtratoFiltrosModal
          isOpen={isFiltersModalOpen}
          onClose={() => setIsFiltersModalOpen(false)}
          onApply={(draft) => {
            setCcFilterCodes(draft.ccFilterCodes);
            setNatureFilterCodes(draft.natureFilterCodes);
            setPoloFilterIds(draft.poloFilterIds);
            setFornecedorFilterValues(draft.fornecedorFilterValues);
            setHistoricoFilterValues(draft.historicoFilterValues);
            setTipoOperacaoFilterValues(draft.tipoOperacaoFilterValues);
            setMovimentoTipoFilter(draft.movimentoTipoFilter);
            setPeriodFrom(draft.periodFrom);
            setPeriodTo(draft.periodTo);
            setIsFiltersModalOpen(false);
          }}
          applied={appliedFiltroPayload}
          allValues={filtroAllValues}
          buildDefaults={buildDefaultFilters}
          disabled={isLoading}
          options={{
            polo: poloFilterOptions,
            cc: ccFilterOptions,
            nature: natureFilterOptions,
            fornecedor: fornecedorFilterOptions,
            historico: historicoFilterOptions,
            tipoOperacao: tipoOperacaoFilterOptions
          }}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
