'use client';

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calculator,
  Upload,
  FileSpreadsheet,
  Plus,
  Trash2,
  Search,
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  Building2,
  FileDown,
  Download,
  CheckCircle,
  FileText,
  Table2,
  ClipboardList,
  Pencil,
  ArrowLeft,
  ListPlus,
  MoreVertical,
  Eye,
  ChevronLeft,
  ChevronRight,
  DownloadCloud
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { useCostCenters } from '@/hooks/useCostCenters';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { OrcamentoMedicaoPainel } from './OrcamentoMedicaoPainel';
import {
  gradeTableCls,
  gradeTableRowTrCls,
  inputGradeCls,
  inputGradeMoedaCls,
  moedaGradeFieldWrapperCls,
  selectGradeSemSetaCls
} from './orcamentoGradeCellClasses';
import { calcV, calcularQuantidadeLinha, inferirTipoUnidadePorDimensao } from './orcamentoMedicaoCalc';
import type { LinhaMedicao, DimensoesItem, TipoUnidadeFormula } from './orcamentoMedicaoTypes';
export type { LinhaMedicao, TipoUnidadeFormula, DimensoesItem } from './orcamentoMedicaoTypes';

export type OrcamentoPageProps = {
  /** Centro de custo fixo (ex.: página dentro do contrato). */
  lockedCostCenterId?: string | null;
  /** Contrato para permissão `ProtectedRoute` e link “voltar”. */
  embeddedContractId?: string | null;
  /** Id do orçamento na URL (`/contratos/:id/orcamento/:orcamentoId`); lista quando omitido. */
  embeddedOrcamentoIdFromRoute?: string | null;
};

// Tipos
export interface ComposicaoItem {
  codigo: string;
  banco: string;
  chave: string;
  descricao: string;
  unidade?: string;
  precoUnitario: number;
  maoDeObraUnitario?: number;
  materialUnitario?: number;
  analiticoLinhas?: LinhaAnaliticoComposicao[];
}

type CategoriaAnalitico = 'MATERIAL' | 'MÃO DE OBRA';

export interface LinhaAnaliticoComposicao {
  categoria: CategoriaAnalitico;
  descricao: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
  total: number;
  /** Preenchidos só no analítico fixo da caçamba 4m³ */
  codigo?: string;
  banco?: string;
  tipoLabel?: string;
}

export interface AnaliticoComposicao {
  total: number;
  linhas: LinhaAnaliticoComposicao[];
}

// ─── Tipos da API Orçafascio ──────────────────────────────────────────────────

export interface OrcafascioComposicaoListItem {
  id: string;
  code: string;
  second_code: string | null;
  description: string;
  type: string;
  unit: string;
  is_sicro: boolean;
  created_at: string;
  /** Preenchido quando a listagem vem do modo «todas as bases». */
  __orcafascio_base?: string;
}

export interface OrcafascioComposicaoItem {
  banco: string;
  code: string;
  description: string;
  type: string;
  unit: string;
  unitary_pnd: number;
  unitary_pd: number;
  coefficient: number;
  pnd: number;
  pd: number;
  is_resource: boolean;
}

export interface OrcafascioComposicaoDetalhe {
  id: string;
  code: string;
  second_code: string | null;
  description: string;
  /** Base de referência da composição (ex.: SINAPI, ORSE, SEINFRA). */
  base?: string;
  type: string;
  unit: string;
  is_sicro: boolean;
  labor: boolean;
  calculation_method: { type: number; description: string };
  prices: { pnd: number; pd: number };
  items: OrcafascioComposicaoItem[];
  created_at: string;
}

export interface OrcafascioOrcamentoItem {
  id: string;
  description?: string;
  code?: string;
  created_at?: string;
  updated_at?: string;
  department_id?: string;
  company_id?: string;
  [key: string]: unknown;
}

export interface OrcafascioOrcamentosResponse {
  budgets: OrcafascioOrcamentoItem[];
  total?: number;
  current_page?: number;
  per_page?: number;
}

/** Descrição em linhas de relatório Orçafascio (`descr` vs `desc` conforme endpoint). */
function textoDescricaoOrcafascio(row: Record<string, unknown>): string {
  const raw =
    row.descr ??
    row.Descr ??
    row.desc ??
    row.text ??
    row.Text ??
    row.label ??
    row.description ??
    row.Description ??
    row.descricao ??
    row.Descricao ??
    row.note ??
    row.name ??
    '';
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim() || '';
  return String(raw);
}

/** Converte texto numérico da API (BR ou float) ou número para um valor finito ou null */
function valorNumericoOrcafascio(val: unknown): number | null {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'boolean') return null;
  if (typeof val === 'string') {
    const t = val.trim().replace(/\s+/g, '');
    if (!t) return null;
    if (/^-?\d+([.,]\d+)?$/.test(t)) {
      let s = t;
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      if (lastComma !== -1 && lastDot !== -1) {
        const decSep = lastComma > lastDot ? ',' : '.';
        if (decSep === ',') s = s.replace(/\./g, '').replace(',', '.');
      } else if (lastComma !== -1 && /^-?\d{1,3}(\.\d{3})*,\d+$/.test(s.replace(/^-/, ''))) {
        s = s.replace(/\./g, '').replace(',', '.');
      } else if (/^-?\d+,\d{2}$/.test(s)) {
        s = s.replace(',', '.');
      }
      const n = parseFloat(s);
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(t.replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Primeiro campo numérico não nulo dentro de objeto (exceto só zeros se houver outros) */
function extrairValorDeObjPrecos(obj: Record<string, unknown>): number | null {
  const prefs = [
    'plus_bdi',
    'Plus_bdi',
    'plus_bi',
    'price_plus_bdi',
    'with_bdi',
    'unit_price_with_bdi',
    'without_bdi',
    'without',
    'bdi',
    'unit_price',
    'pd',
    'pnd',
    'valor',
    'value',
    'total',
  ];
  let bestNonZero: number | null = null;
  let bestZero: number | null = null;
  for (const k of prefs) {
    if (!(k in obj)) continue;
    const n = valorNumericoOrcafascio(obj[k]);
    if (n == null || !Number.isFinite(n)) continue;
    if (n !== 0) {
      bestNonZero = n;
      break;
    }
    if (bestZero === null) bestZero = n;
  }
  if (bestNonZero != null) return bestNonZero;
  if (bestZero !== null && bestZero === 0) {
    // Varre o restante (nomes diferentes na API)
    for (const [, v] of Object.entries(obj)) {
      const n =
        typeof v === 'object' && v !== null && !Array.isArray(v)
          ? extrairValorDeObjPrecos(v as Record<string, unknown>)
          : valorNumericoOrcafascio(v);
      if (n != null && n !== 0) return n;
    }
  }
  return bestZero;
}

/** Preço unitário visível na aba analítica (prioriza valores != 0 dentro de prices). */
function precoOrcafascioAnalitico(row: Record<string, unknown>): number | null {
  const direto =
    valorNumericoOrcafascio(row.unit_price_with_bdi) ??
    valorNumericoOrcafascio(row.unit_price) ??
    valorNumericoOrcafascio(row.price) ??
    valorNumericoOrcafascio(row.total_price);
  if (direto != null && direto !== 0) return direto;
  const p = row.prices;
  if (p && typeof p === 'object' && !Array.isArray(p)) {
    const n = extrairValorDeObjPrecos(p as Record<string, unknown>);
    if (n != null) return n;
  }
  if (direto != null) return direto;
  return valorNumericoOrcafascio(row.total_price);
}

/** Id enviado aos endpoints /orcamentos/:id (lista pode trazer só `_id` ou `budget_id`). */
function idOrcamentoOrcafascioParaApi(item: OrcafascioOrcamentoItem): string {
  const o = item as Record<string, unknown>;
  const raw = item.id ?? o._id ?? o.budget_id;
  return raw != null ? String(raw).trim() : '';
}

/** Código para buscar a composição no catálogo a partir de uma linha sintético/analítico do orçamento. */
function codigoCatalogoLinhaOrcamentoOrcafascio(row: Record<string, unknown>): string | null {
  const raw =
    row.code ??
    row.Code ??
    row.composition_code ??
    row.Composition_code ??
    row.reference_code ??
    row.catalog_code ??
    row.service_code ??
    row.composition_number ??
    row.codigo ??
    row.Código ??
    row.Codigo ??
    row.number ??
    row.numero ??
    row.second_code ??
    row.secondCode;
  const code = raw != null ? String(raw).trim() : '';
  if (!code || code === '—') return null;
  const kind = String(row.kind ?? row.type ?? '').toLowerCase();
  if (kind && /^(group|chapter|divider|titulo|etapa|cabeça|cabeca|stage)$/.test(kind)) return null;
  return code;
}

function variantesCodigoOrcafascio(code: string): string[] {
  const base = String(code ?? '').trim();
  if (!base) return [];
  const out: string[] = [];
  const add = (v?: string | null) => {
    const t = typeof v === 'string' ? v.trim() : '';
    if (!t || out.includes(t)) return;
    out.push(t);
  };
  const semPrefixo = base.replace(/^(os|orc|orcamento|orçamento)\s+/i, '');
  const semEspacos = semPrefixo.replace(/\s+/g, '');
  const apenasDigitos = semPrefixo.replace(/[^\d]/g, '');
  add(base);
  add(semPrefixo);
  add(semEspacos);
  if (apenasDigitos.length >= 5) {
    add(apenasDigitos);
    const semZeros = apenasDigitos.replace(/^0+/, '') || '0';
    if (semZeros !== apenasDigitos) add(semZeros);
  }
  return out;
}

function normalizarCodigoOrcamentoMatchNorm(raw: string): string {
  return String(raw ?? '').replace(/[^\dA-Za-z]/g, '').toLowerCase();
}

/** Código na linha do analítico (campos variam por endpoint). */
function codigoLinhaRelatorioAnaliticoOrcamento(aa: Record<string, unknown>): string {
  const raw =
    aa.code ??
    aa.Code ??
    aa.composition_code ??
    aa.service_code ??
    aa.reference_code ??
    aa.catalog_code ??
    aa.composition_number ??
    aa.codigo ??
    aa.number ??
    aa.numero;
  return raw != null ? String(raw).trim() : '';
}

/**
 * Cruza linha do sintético com o analítico do orçamento fixo.
 * Trata: build_item_id, zeros à esquerda no código, base vazia no analítico vs base preenchida no sintético.
 */
function encontrarLinhaAnaliticoParaComposicaoOrcamentoFixo(
  row: Record<string, unknown>,
  analitico: Record<string, unknown>[]
): Record<string, unknown> | undefined {
  const lista = analitico?.length ? analitico : [];
  const code = codigoCatalogoLinhaOrcamentoOrcafascio(row) ?? '';
  const buildItemIdRaw = row.build_item_id != null ? String(row.build_item_id).trim() : '';
  const rowBase = String(row.base ?? '').trim().toLowerCase();

  const variantesBuildItemId = (() => {
    const raw = String(buildItemIdRaw || '').trim();
    if (!raw) return [] as string[];
    const out = new Set<string>();
    out.add(raw);
    out.add(raw.replace(/[^\d]/g, ''));
    out.add(raw.replace(/\.0+$/, ''));
    return Array.from(out).filter(Boolean);
  })();

  const variantesCode = variantesCodigoOrcafascio(code);
  const codeNormSet = new Set(
    variantesCode.map((v) => normalizarCodigoOrcamentoMatchNorm(v)).filter(Boolean)
  );

  if (buildItemIdRaw) {
    const porId = lista.find((a) => {
      const aa = a as Record<string, unknown>;
      const candidatos = [aa.id, aa.build_item_id, aa.buildId, aa.build_id, aa.item_id, aa.itemId]
        .map((x) => String(x ?? '').trim())
        .filter(Boolean);
      if (candidatos.length === 0) return false;
      return candidatos.some((cand) => {
        const candDigits = cand.replace(/[^\d]/g, '');
        return variantesBuildItemId.some((v) => v === cand || (Boolean(candDigits) && v === candDigits));
      });
    });
    if (porId) return porId as Record<string, unknown>;
  }

  if (codeNormSet.size === 0) return undefined;

  const candidatos = lista.filter((a) => {
    const aCodeNorm = normalizarCodigoOrcamentoMatchNorm(codigoLinhaRelatorioAnaliticoOrcamento(a as Record<string, unknown>));
    return !!aCodeNorm && codeNormSet.has(aCodeNorm);
  });

  if (candidatos.length === 0) return undefined;

  if (rowBase) {
    const mesmoBase = candidatos.filter((a) => {
      const aBase = String((a as Record<string, unknown>).base ?? '').trim().toLowerCase();
      return aBase === rowBase;
    });
    if (mesmoBase.length > 0) return mesmoBase[0] as Record<string, unknown>;

    const baseAnaliticoVazia = candidatos.filter((a) => {
      const aBase = String((a as Record<string, unknown>).base ?? '').trim().toLowerCase();
      return !aBase;
    });
    if (baseAnaliticoVazia.length > 0) return baseAnaliticoVazia[0] as Record<string, unknown>;
  }

  // Fallback por descrição quando o código existe em mais de uma base/linha.
  const rowDesc = normalizarTextoBusca(textoDescricaoOrcafascio(row));
  if (rowDesc) {
    const porDescricao = candidatos.filter((a) => {
      const desc = normalizarTextoBusca(textoDescricaoOrcafascio(a as Record<string, unknown>));
      return !!desc && (desc === rowDesc || desc.includes(rowDesc) || rowDesc.includes(desc));
    });
    if (porDescricao.length === 1) return porDescricao[0] as Record<string, unknown>;
  }

  if (candidatos.length === 1) return candidatos[0] as Record<string, unknown>;

  return undefined;
}

/** Todas as listas de linhas no mesmo objeto (espelha o backend `coletarArraysRelatorio`). */
function colecionarArraysOrcamentoNoObjeto(o: Record<string, unknown>): Record<string, unknown>[] {
  const chaves = [
    'records',
    'items',
    'rows',
    'list',
    'compositions',
    'services',
    'budget_items',
    'budget_items_services',
    'budget_lines',
    'synthetic',
    'lines',
    'budget_services',
    'analytical',
    'analytical_with_unit_price',
    'results',
    'children',
    'chapters',
    'works',
  ];
  const out: Record<string, unknown>[] = [];
  for (const k of chaves) {
    const v = o[k];
    if (!Array.isArray(v) || v.length === 0) continue;
    const first = v[0];
    if (first !== null && typeof first === 'object' && !Array.isArray(first))
      out.push(...(v as Record<string, unknown>[]));
  }
  return out;
}

/** Primeira lista de objetos “linha de orçamento” dentro de payloads aninhados da API Orçafascio */
function extrairPrimeiroArrayOrcamento(body: unknown, depth = 0): Record<string, unknown>[] {
  if (body == null || depth > 8) return [];
  if (Array.isArray(body)) {
    return body.filter(x => x !== null && typeof x === 'object' && !Array.isArray(x)) as Record<string, unknown>[];
  }
  if (typeof body !== 'object') return [];
  const o = body as Record<string, unknown>;

  const mergedTop = colecionarArraysOrcamentoNoObjeto(o);
  if (mergedTop.length > 0) return mergedTop;

  const nestedData = o.data;
  if (nestedData !== undefined && nestedData !== null) {
    const inner = extrairPrimeiroArrayOrcamento(nestedData, depth + 1);
    if (inner.length > 0) return inner;
  }
  for (const v of Object.values(o)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const inner = extrairPrimeiroArrayOrcamento(v, depth + 1);
      if (inner.length > 0) return inner;
    }
  }
  let best: Record<string, unknown>[] = [];
  for (const v of Object.values(o)) {
    if (!Array.isArray(v) || v.length === 0) continue;
    const first = v[0];
    if (first !== null && typeof first === 'object' && !Array.isArray(first) && v.length > best.length) {
      best = v as Record<string, unknown>[];
    }
  }
  return best;
}

/** Lista vinda dos endpoints sintético/analítico ou do detalhe (array ou objeto envelopado). */
function normalizarListaApiOrcamento(body: unknown): Record<string, unknown>[] {
  return extrairPrimeiroArrayOrcamento(body);
}

function textoItemizacaoOrcafascio(row: Record<string, unknown>): string {
  const raw = row.itemization ?? row.original_itemization ?? row.order ?? row.sequence;
  if (raw == null) return '—';
  const s = String(raw).trim();
  return s || '—';
}

function textoKindOrcafascio(row: Record<string, unknown>): string {
  const raw = row.kind ?? row.type ?? row.category;
  if (raw == null) return '—';
  const s = String(raw).trim();
  return s || '—';
}

function textoVersaoBaseOrcafascio(row: Record<string, unknown>): string {
  const raw = row.base_version ?? row.version ?? row.versoin;
  if (raw == null) return '—';
  const s = String(raw).trim();
  return s || '—';
}

/** Filhos da composição no JSON analítico: objeto ou array (API variável). */
function colecionarObjetosSubitensAnaliticoOrcamento(row: Record<string, unknown>): Record<string, unknown>[] {
  const chaves = ['subitems', 'sub_items', 'items', 'children', 'insumos'] as const;
  for (const key of chaves) {
    const sub = row[key];
    if (sub == null) continue;
    if (Array.isArray(sub)) {
      const objs = sub.filter(
        (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
      ) as Record<string, unknown>[];
      if (objs.length > 0) return objs;
      continue;
    }
    if (typeof sub === 'object') {
      const objs = Object.values(sub as Record<string, unknown>).filter(
        (x) => x !== null && typeof x === 'object' && !Array.isArray(x)
      ) as Record<string, unknown>[];
      if (objs.length > 0) return objs;
    }
  }
  return [];
}

function detalheCatalogoAPartirAnaliticoOrcamento(row: Record<string, unknown>): OrcafascioComposicaoDetalhe {
  const itemsRaw = colecionarObjetosSubitensAnaliticoOrcamento(row);
  const items = itemsRaw.map((it) => {
    const s = it as Record<string, unknown>;
    const prices =
      s.prices && typeof s.prices === 'object' && !Array.isArray(s.prices)
        ? (s.prices as Record<string, unknown>)
        : {};
    const p = valorNumericoOrcafascio(prices.plus_ls ?? prices.plus_ls_qty ?? prices.type_mat ?? prices.type_mdo);
    return {
      banco: String(s.base ?? row.base ?? '—'),
      code: String(s.code ?? '—'),
      description: textoDescricaoOrcafascio(s),
      type: String(s.type ?? ''),
      unit: String(s.unity ?? s.unit ?? '—'),
      unitary_pnd: p ?? 0,
      unitary_pd: p ?? 0,
      coefficient: valorNumericoOrcafascio(s.qty ?? 0) ?? 0,
      pnd: p ?? 0,
      pd: p ?? 0,
      is_resource: String(s.kind ?? '').toLowerCase() === 'resource',
    };
  });
  return {
    id: String(row.id ?? ''),
    code: String(row.code ?? '—'),
    second_code: (row.code_2 as string) ?? null,
    description: textoDescricaoOrcafascio(row),
    base: String(row.base ?? row.base_name ?? row.reference_base ?? '').trim() || undefined,
    type: String(row.type ?? ''),
    unit: String(row.unity ?? row.unit ?? '—'),
    is_sicro: false,
    labor: Boolean(row.mdo),
    calculation_method: { type: 0, description: '' },
    prices: { pnd: precoOrcafascioAnalitico(row) ?? 0, pd: precoOrcafascioAnalitico(row) ?? 0 },
    items,
    created_at: '',
  };
}

/** Preferir linhas que tenham código de composição no catálogo; senão manter todas (evita zerar a lista). */
function priorizarLinhasComposicaoDoOrcamento(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  if (rows.length === 0) return rows;
  const comCodigo = rows.filter((r) => !!codigoCatalogoLinhaOrcamentoOrcafascio(r));
  if (comCodigo.length > 0) return comCodigo;
  return rows;
}

/** Junta todas as listas candidatas do endpoint de detalhe (`_items`, `budget`, raiz…). */
function colecionarListasOrcamentoDetalheResposta(body: unknown): Record<string, unknown>[] {
  const acc: Record<string, unknown>[] = [];
  acc.push(...normalizarListaApiOrcamento(body));
  if (body && typeof body === 'object') {
    const o = body as Record<string, unknown>;
    if ('_items' in o && o._items !== undefined) acc.push(...normalizarListaApiOrcamento(o._items));
    const bud = o.budget;
    if (bud !== null && typeof bud === 'object') acc.push(...normalizarListaApiOrcamento(bud));
    const comps = o.compositions ?? o.services;
    if (comps !== undefined) acc.push(...normalizarListaApiOrcamento(comps));
  }
  return acc;
}

export interface OrcafascioListResponse<T> {
  total: number;
  per_page: number;
  current_page: number;
  records: T[];
  _aggregated?: boolean;
  _bases?: Array<{ segment: string; total: number }>;
  /** Modo agregado: última página útil (max entre bases). */
  _aggregated_page_limit?: number;
  /** Segmento REST efetivo da última listagem (slug ou ID Mongo). */
  _orcafascio_segment?: string;
  /** True quando caiu no catálogo genérico (mybase etc.) — mistura várias tabelas no mesmo total. */
  _orcafascio_mix_fallback?: boolean;
  /** REST não expôs /orse — lista veio do agregado após 404 nos slugs. */
  _orcafascio_rest_orse_404?: boolean;
}

/**
 * Infere banco/tabela de referência (a API GET não envia o campo). Ordem: is_sicro → texto na descrição
 * (incl. REF. SINAPI) → código numérico oficial → prefixos de código (CONFEA, SENAC, MP…).
 */
function inferirBancoOrcafascio(
  comp: Pick<OrcafascioComposicaoListItem, 'code' | 'description' | 'is_sicro' | 'second_code'>
): string {
  const desc = comp.description ?? '';
  const code = (comp.code ?? '').trim();
  const sec = (comp.second_code ?? '').trim();
  const texto = `${desc} ${sec}`;
  const du = texto.toUpperCase();

  if (comp.is_sicro) {
    if (/SICRO\s*3|SICRO3/i.test(texto)) return 'SICRO3';
    return 'SICRO';
  }

  const copiaDa = du.match(/COPIA\s+DA\s+(SINAPI|SICRO\S*)/);
  if (copiaDa) return copiaDa[1].replace(/\s+/g, '');

  if (/\bSICRO\s*3\b|\bSICRO3\b/i.test(texto)) return 'SICRO3';
  if (/\bSINAPI\b/i.test(texto)) return 'SINAPI';
  if (/\bSICRO\b/i.test(texto)) return 'SICRO';

  if (/REF\.?\s*SINAPI/i.test(desc)) return 'SINAPI';
  if (/CAT[AÁ]LOGO\s+SINAPI/i.test(du)) return 'SINAPI';
  if (/\bORSE\b/i.test(texto)) return 'ORSE';

  // Código só dígitos longos (tabelas oficiais no site Orçafascio)
  if (/^\d{5,}$/.test(code)) return 'SINAPI';

  /* Sem menção explícita à tabela: usar prefixo do código como origem do cadastro */
  if (/^CONFEA-/i.test(code)) return 'CONFEA';
  if (/^COMP\.?\s*SENAC\b/i.test(code)) return 'SENAC';
  if (/^COMP\.?\s*MP\b/i.test(code)) return 'MP';
  if (/^COMS\d/i.test(code)) return 'COMS';

  return '—';
}

/** Rotula o segmento `/v1/base/{segment}/…` na tabela (IDs Mongo longos). */
function rotuloSegmentoOrcafascioApi(seg: string | undefined): string {
  if (!seg) return '—';
  if (seg.length <= 22) return seg;
  return `${seg.slice(0, 10)}…${seg.slice(-8)}`;
}

/** Formata a data de criação como MM/YYYY. */
function formatDataOrcafascio(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  } catch { return '—'; }
}

/** Extrai apenas o mês (01–12) de uma data Orçafascio. */
function formatMesOrcafascio(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return String(d.getMonth() + 1).padStart(2, '0');
  } catch { return '—'; }
}

/** Extrai apenas o ano de uma data Orçafascio. */
function formatAnoOrcafascio(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return String(d.getFullYear());
  } catch { return '—'; }
}

/** Converte um item da composição Orçafascio na categoria analítica correta. */
function categoriaOrcafascioItem(item: OrcafascioComposicaoItem): 'MATERIAL' | 'MÃO DE OBRA' {
  // Itens que são sub-composições (serviços) → Mão de Obra
  if (!item.is_resource) return 'MÃO DE OBRA';
  // Insumos com type numérico: 3 = Mão de Obra no SINAPI
  const typeNum = Number(item.type);
  if (!isNaN(typeNum) && typeNum === 3) return 'MÃO DE OBRA';
  return 'MATERIAL';
}

const TIPO_INSUMO_LABEL_POR_CODIGO: Record<number, string> = {
  0: 'Mão de obra',
  1: 'Equipamento',
  2: 'Equipamento para Aquisição Permanente',
  3: 'Mão de obra',
  4: 'Material',
  5: 'Serviços',
  6: 'Taxas',
  7: 'Outros',
  8: 'Franquia',
  9: 'Administração',
  10: 'Aluguel',
  11: 'Verba',
  12: 'Consultoria',
  13: 'Transporte',
  14: 'Despesas Complementares',
};

function tipoInsumoCodigoParaDescricao(tipo: unknown): string {
  if (tipo == null) return '—';
  const s = String(tipo).trim();
  if (!s) return '—';
  if (/^\d+(\.0+)?$/.test(s)) {
    const codigo = Math.trunc(Number(s));
    return TIPO_INSUMO_LABEL_POR_CODIGO[codigo] || s;
  }
  return s;
}

/** Converte a resposta detalhada do Orçafascio para o formato ComposicaoItem do sistema. */
function orcafascioToComposicaoItem(comp: OrcafascioComposicaoDetalhe): ComposicaoItem {
  const analiticoLinhas: LinhaAnaliticoComposicao[] = comp.items.map(item => ({
    categoria: categoriaOrcafascioItem(item),
    descricao: item.description,
    unidade: item.unit,
    quantidade: item.coefficient,
    precoUnitario: item.unitary_pnd,
    total: item.pnd,
    codigo: item.code,
    banco: item.banco,
    tipoLabel: tipoInsumoCodigoParaDescricao(item.type),
  }));

  const maoDeObraUnitario = analiticoLinhas
    .filter(l => l.categoria === 'MÃO DE OBRA')
    .reduce((s, l) => s + (l.total ?? 0), 0);

  const materialUnitario = analiticoLinhas
    .filter(l => l.categoria === 'MATERIAL')
    .reduce((s, l) => s + (l.total ?? 0), 0);

  const banco = String(comp.base ?? '').trim() || 'Orçafascio';
  return {
    codigo: comp.code,
    banco,
    chave: normalizarChave(String(comp.code ?? ''), banco),
    descricao: comp.description,
    unidade: comp.unit,
    precoUnitario: comp.prices?.pnd ?? 0,
    maoDeObraUnitario: maoDeObraUnitario || undefined,
    materialUnitario: materialUnitario || undefined,
    analiticoLinhas,
  };
}

type InsumoAnaliticoManual = {
  id: string;
  parentKey: string;
  tipo: string;
  codigo: string;
  banco: string;
  descricao: string;
  und: string;
  quant: string;
  quantidadeReal: string;
  quantidadeOrcada: string;
  valorUnit: string;
};

export interface ItemServico {
  chave: string;
  codigo: string;
  banco: string;
  descricao: string;
  precoUnitario?: number;
  maoDeObraUnitario?: number;
  materialUnitario?: number;
  /** Unidade da composição (ex. Orçafascio); persiste com a linha. */
  unidade?: string;
  /** Analítico gravado na linha ao incluir a composição — sobrevive ao F5 sem depender do catálogo global. */
  analiticoLinhas?: LinhaAnaliticoComposicao[];
  /** Só leitura na importação da planilha; removido antes de persistir. */
  quantidadePlanilha?: number;
}

export interface Subtitulo {
  id: string;
  nome: string;
  itens: ItemServico[];
}

export interface ServicoPadrao {
  id: string;
  nome: string;
  subtitulos: Subtitulo[];
}

/** Remove campo temporário da importação antes de gravar no servidor. */
function servicosSemQuantidadePlanilha(servicos: ServicoPadrao[]): ServicoPadrao[] {
  return servicos.map(svc => ({
    ...svc,
    subtitulos: svc.subtitulos.map(sub => ({
      ...sub,
      itens: sub.itens.map(({ quantidadePlanilha: _qp, ...rest }) => rest)
    }))
  }));
}

/** Só campos persistíveis — remove propriedades extras que inflam o JSON no localStorage. */
function servicosParaLocalStorage(servicos: ServicoPadrao[]): ServicoPadrao[] {
  return servicos.map((svc) => ({
    id: String(svc.id ?? ''),
    nome: String(svc.nome ?? ''),
    subtitulos: (svc.subtitulos ?? []).map((sub) => ({
      id: String(sub.id ?? ''),
      nome: String(sub.nome ?? ''),
      itens: (sub.itens ?? []).map((it) => {
        const row: ItemServico = {
          chave: String(it.chave ?? ''),
          codigo: String(it.codigo ?? ''),
          banco: String(it.banco ?? ''),
          descricao: String(it.descricao ?? '')
        };
        if (it.precoUnitario != null) row.precoUnitario = it.precoUnitario;
        if (it.maoDeObraUnitario != null) row.maoDeObraUnitario = it.maoDeObraUnitario;
        if (it.materialUnitario != null) row.materialUnitario = it.materialUnitario;
        const u = it.unidade != null ? String(it.unidade).trim() : '';
        if (u) row.unidade = u;
        if (Array.isArray(it.analiticoLinhas) && it.analiticoLinhas.length > 0) {
          row.analiticoLinhas = it.analiticoLinhas.map((ln) => ({
            categoria: ln.categoria === 'MÃO DE OBRA' ? 'MÃO DE OBRA' : 'MATERIAL',
            descricao: String(ln.descricao ?? ''),
            unidade: String(ln.unidade ?? ''),
            quantidade: Number(ln.quantidade) || 0,
            precoUnitario: Number(ln.precoUnitario) || 0,
            total: Number(ln.total) || 0,
            ...(ln.codigo != null && String(ln.codigo).trim() ? { codigo: String(ln.codigo).trim() } : {}),
            ...(ln.banco != null && String(ln.banco).trim() ? { banco: String(ln.banco).trim() } : {}),
            ...(ln.tipoLabel != null ? { tipoLabel: ln.tipoLabel } : {})
          }));
        }
        return row;
      })
    }))
  }));
}

/**
 * Snapshot já grava `servicos` — omitir `servicosDocumento` evita duplicar a árvore inteira (planilha importada).
 * Recuperação usa `snapshot.servicos` com `setServicos`.
 */
function sessaoOrcamentoParaSnapshot(sessao: SessaoOrcamentoPersist): SessaoOrcamentoPersist {
  const { servicosDocumento: _dup, ...rest } = sessao;
  return rest;
}

const STORAGE_PREFIX = 'orcamento';
const STORAGE_IMPORTS = 'orcamento-imports';
/** Histórico local de recuperação: cada entrada repete serviços + sessão — manter poucos para não estourar quota. */
const ORCAMENTO_SNAPSHOT_MAX = 4;

/** `orcamentoId` só para dados do orçamento (serviços, imports, sessão); composições não usam. */
function storageKey(centroCustoId: string, base: string, orcamentoId?: string | null) {
  const suffix = orcamentoId ? `-${orcamentoId}` : '';
  return `${STORAGE_PREFIX}-${base}-${centroCustoId}${suffix}`;
}

function isLocalStorageQuotaError(err: unknown): boolean {
  return (
    (typeof DOMException !== 'undefined' &&
      err instanceof DOMException &&
      (err.name === 'QuotaExceededError' || err.code === 22)) ||
    (err instanceof Error && err.name === 'QuotaExceededError')
  );
}

/** Libera espaço para rascunho: nível 1 = snapshots; 2 = + cortar histórico de imports; 3 = + cache de composições locais. */
function evictOrcamentoDraftStorage(centroCustoId: string, level: 1 | 2 | 3): void {
  if (typeof window === 'undefined') return;
  const snapPrefix = `${STORAGE_PREFIX}-snapshots-${centroCustoId}-`;
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(snapPrefix)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));

  if (level >= 2) {
    try {
      const ik = storageKey(centroCustoId, 'imports');
      const raw = localStorage.getItem(ik);
      if (raw) {
        const list = JSON.parse(raw) as unknown;
        if (Array.isArray(list) && list.length > 5) {
          localStorage.setItem(ik, JSON.stringify(list.slice(0, 5)));
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (level >= 3) {
    try {
      localStorage.removeItem(storageKey(centroCustoId, 'composicoes'));
    } catch {
      /* ignore */
    }
  }
}

let servicosLocalStorageQuotaWarnAt = 0;

export interface ImportRecord {
  id: string;
  fileName: string;
  date: string;
  tipo: 'orçamento' | 'composições';
  origem?: 'orcamento-perfeito' | 'orcamento-documento' | 'composicoes';
  servicosCount?: number;
  itensCount?: number;
}

type OrcamentoMeta = {
  osNumeroPasta: string;
  dataAbertura: string; // yyyy-mm-dd
  dataEnvio: string; // yyyy-mm-dd (atualiza ao salvar)
  prazoExecucaoDias: string; // mantém como string p/ input
  responsavelOrcamento: string;
  descricao: string;
  orcamentoRealizadoPor: string;
  descontoPercentual: string; // ex.: "25,01"
  bdiPercentual: string; // ex.: "28,35"
  reajustes: Array<{ nome: string; percentual: string }>; // percentual em %
  revisaoCount: number; // 0 = sem revisão; ao salvar vira 1 => R01
  /** Orçamento criado pela importação da planilha: quantidades vêm da planilha; memória de cálculo oculta. */
  importadoPlanilha?: boolean;
};

const ORCAMENTO_REAJUSTES_PADRAO: Array<{ nome: string; percentual: string }> = [
  { nome: '1º reajuste IPCA', percentual: '3,93583' },
  { nome: '2º reajuste IPCA', percentual: '3,92595' },
  { nome: '3º reajuste IPCA', percentual: '5,31964' }
];

function metaNovoOrcamentoPadrao(): OrcamentoMeta {
  return {
    ...sessaoVazia().meta!,
    descontoPercentual: '0',
    bdiPercentual: '0',
    reajustes: [],
    dataAbertura: todayInputDate()
  };
}

function todayInputDate(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Igualdade do título do serviço na tabela (evita repetir o cabeçalho vermelho quando o nome é o mesmo). */
function normalizarNomeServicoOrcamento(nome: string): string {
  return nome.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Marca subtítulo sem composições na seleção do dropdown (valor sintético da chave). */
const DROPDOWN_BLOCO_SEM_ITENS = '__bloco_sem_itens__';
const ORCAFASCIO_ORCAMENTO_FIXO_ID = '69f264ca90dfe2e71e80a328';

/** Caixa do ícone em estados vazios e cabeçalhos (fundo vermelho suave + anel leve). */
const ORCAMENTO_ICON_SOFT_BOX =
  'flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-red-600/[0.12] dark:bg-red-500/15 ring-1 ring-red-600/20 dark:ring-red-500/25';
const ORCAMENTO_ICON_SOFT_GLYPH = 'h-7 w-7 shrink-0 text-red-600 dark:text-red-400';

/** Cartão de estado vazio (Memória de cálculo, Orçamento sem itens, etc.). */
const ORCAMENTO_SECAO_VAZIA_SHELL =
  'flex flex-col items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-5 py-12 sm:py-14 text-center';

function buildItemKeyOrcamento(blocoKey: string, chave: string) {
  return `${blocoKey}|${chave}`;
}

/** Parse `servicoId|subtituloId|chave` (chave pode conter `|` em teoria; ids vêm de UUID). */
function parseItemKeyOrcamento(itemKey: string): { blocoKey: string; chave: string } | null {
  const parts = itemKey.split('|');
  if (parts.length < 3) return null;
  const chave = parts[parts.length - 1]!;
  const subtituloId = parts[parts.length - 2]!;
  const servicoId = parts.slice(0, -2).join('|');
  return { blocoKey: `${servicoId}|${subtituloId}`, chave };
}

function parseBlocoKeyOrcamento(blocoKey: string): { servicoId: string; subtituloId: string } | null {
  const i = blocoKey.lastIndexOf('|');
  if (i <= 0 || i >= blocoKey.length - 1) return null;
  return { servicoId: blocoKey.slice(0, i), subtituloId: blocoKey.slice(i + 1) };
}

function findSubtituloPorBlocoKey(list: ServicoPadrao[], blocoKey: string): Subtitulo | null {
  for (const s of list) {
    for (const sub of s.subtitulos) {
      if (`${s.id}|${sub.id}` === blocoKey) return sub;
    }
  }
  return null;
}

/** Assinatura do item para cruzar catálogo do contrato × importação (UUIDs diferentes). */
function itemSigParaOrcamento(it: ItemServico): string {
  const k = String(it.chave || '').trim();
  if (k) return k;
  return normalizarChave(String(it.codigo || ''), String(it.banco || ''));
}

function coletarAssinaturasItensServicos(list: ServicoPadrao[]): Set<string> {
  const s = new Set<string>();
  for (const svc of list) {
    for (const sub of svc.subtitulos) {
      for (const it of sub.itens) s.add(itemSigParaOrcamento(it));
    }
  }
  return s;
}

/** Catálogo completo do contrato + grupos só da planilha importada (itens fora do catálogo). */
function mergeServicosPadraoComDocumentoImportado(padrao: ServicoPadrao[], doc: ServicoPadrao[]): ServicoPadrao[] {
  if (padrao.length === 0) return doc;
  const sigPad = coletarAssinaturasItensServicos(padrao);
  const extras = doc.filter(svc =>
    svc.subtitulos.some(sub => sub.itens.some(it => !sigPad.has(itemSigParaOrcamento(it))))
  );
  try {
    return [...structuredClone(padrao), ...extras];
  } catch {
    return [...(JSON.parse(JSON.stringify(padrao)) as ServicoPadrao[]), ...extras];
  }
}

/** Garante serviço/subtítulo do catálogo no estado persistido do orçamento ao adicionar pelo dropdown. */
function incorporarNovosBlocosNoEstadoServicos(
  atual: ServicoPadrao[],
  novosBlocosKeys: string[],
  fonte: ServicoPadrao[]
): ServicoPadrao[] {
  if (novosBlocosKeys.length === 0) return atual;
  const blocosPresentes = new Set(atual.flatMap(s => s.subtitulos.map(sub => `${s.id}|${sub.id}`)));
  const next: ServicoPadrao[] = atual.map(s => ({
    ...s,
    subtitulos: s.subtitulos.map(sub => ({
      ...sub,
      itens: sub.itens.map(it => ({ ...it }))
    }))
  }));
  for (const bk of novosBlocosKeys) {
    if (blocosPresentes.has(bk)) continue;
    const sep = bk.lastIndexOf('|');
    if (sep <= 0) continue;
    const servicoId = bk.slice(0, sep);
    const subtituloId = bk.slice(sep + 1);
    const svcFonte = fonte.find(s => s.id === servicoId);
    const subFonte = svcFonte?.subtitulos.find(sb => sb.id === subtituloId);
    if (!svcFonte || !subFonte) continue;
    const subCopy: Subtitulo = {
      ...subFonte,
      itens: subFonte.itens.map(it => ({ ...it }))
    };
    const idxSvc = next.findIndex(s => s.id === servicoId);
    if (idxSvc < 0) {
      next.push({ id: svcFonte.id, nome: svcFonte.nome, subtitulos: [subCopy] });
    } else {
      const svc = next[idxSvc]!;
      if (!svc.subtitulos.some(sb => sb.id === subtituloId)) {
        next[idxSvc] = { ...svc, subtitulos: [...svc.subtitulos, subCopy] };
      }
    }
    blocosPresentes.add(bk);
  }
  return next;
}

/** Parse número no formato brasileiro (ex.: 1.416,00) para campos da planilha analítica. */
function parsePlanilhaPtBr(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const normalized = t.replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Interpreta número digitado (aceita "=8*10" e decimal com vírgula). */
function parseCalcOrNumber(raw: string): number | null {
  const r = evalSimpleExpr(raw);
  if (r !== null) return r;
  const rawSemIgual = String(raw || '').trim().replace(/^=/, '').replace(/,/g, '.');
  if (!rawSemIgual) return null;
  const n = Number(rawSemIgual);
  return Number.isFinite(n) ? n : null;
}

/** Interpreta número da planilha (pt-BR), também aceitando fórmula com "=". */
function parsePlanilhaCalcOrPtBr(raw: string): number | null {
  const r = evalSimpleExpr(raw);
  if (r !== null) return r;
  return parsePlanilhaPtBr(raw);
}

/**
 * Parse ao sair do campo (blur) na memória de cálculo / dimensões: evita que decimais com ponto
 * (ex.: "1.3" vindos de `String(número)` ou digitação en-US) sejam lidos como milhar pt-BR
 * (`parsePlanilhaPtBr` removeria o ponto e viraria "13").
 */
function parseMedicaoBlurNumber(raw: string): number | null {
  const r = evalSimpleExpr(raw);
  if (r !== null) return r;
  const t = String(raw ?? '')
    .trim()
    .replace(/^=/, '')
    .trim();
  if (!t) return null;
  if (t.includes(',')) {
    return parsePlanilhaPtBr(t);
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    const normalized = t.replace(/\./g, '');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Converte campo percentual (ex.: "25,01") para decimal (0.2501). */
function parsePercentualMeta(raw: string | undefined): number {
  if (!raw) return 0;
  const limpo = String(raw).replace('%', '').trim();
  if (!limpo) return 0;
  const n = parsePlanilhaPtBr(limpo);
  if (n === null || !Number.isFinite(n)) return 0;
  return n / 100;
}

function tipoPlanilhaInsumo(categoria: string): string {
  const u = categoria.toUpperCase();
  if (u.includes('MÃO') || u.includes('OBRA')) return 'MO';
  return 'MA';
}

/** Migra sessões antigas que gravavam MAT → MA. */
function normalizarPlanilhaTipoInsumo(
  raw: Record<string, unknown> | undefined | null
): Record<string, 'MO' | 'MA' | 'LO'> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, 'MO' | 'MA' | 'LO'> = {};
  for (const [k, v] of Object.entries(raw)) {
    const s = String(v ?? '');
    if (s === 'MAT' || s === 'MA') out[k] = 'MA';
    else if (s === 'MO' || s === 'LO') out[k] = s;
  }
  return out;
}

/** Exibição na ficha/export (compatível com legado MAT). */
function tipoFichaDemandaLabel(tipo: string | undefined): string {
  if (!tipo) return '—';
  return tipo === 'MAT' ? 'MA' : tipo;
}

/** Formatação condicional col. Levantamento (%): faixas amarelo e vermelho com o mesmo padrão (claro: 50 + 900; escuro: 500/15 + 200). */
function classeLevantamentoCondicional(lev: number): string {
  if (!Number.isFinite(lev)) return '';
  if (lev < 50) {
    return 'bg-green-50 text-green-950 dark:bg-green-950/35 dark:text-green-100';
  }
  if (lev >= 50 && lev < 80.99) {
    return 'font-medium bg-yellow-50 text-yellow-900 dark:bg-yellow-500/15 dark:text-yellow-200';
  }
  if (lev >= 80.99 && lev <= 120) {
    return 'font-medium bg-red-50 text-red-900 dark:bg-red-500/15 dark:text-red-200';
  }
  return '';
}

/** Formatação condicional col. % Valor total. */
function classeValorTotalCondicional(valorPct: number): string {
  if (!Number.isFinite(valorPct)) return '';
  if (valorPct >= 0 && valorPct <= 49) {
    return 'bg-green-50 text-green-950 dark:bg-green-950/35 dark:text-green-100';
  }
  if (valorPct >= 50 && valorPct <= 60) {
    return 'font-medium bg-yellow-50 text-yellow-900 dark:bg-yellow-500/15 dark:text-yellow-200';
  }
  if (valorPct >= 61 && valorPct <= 100) {
    return 'font-medium bg-red-50 text-red-900 dark:bg-red-500/15 dark:text-red-200';
  }
  return '';
}

type EmployeeOption = {
  id: string;
  name: string;
};

/** Estado da montagem do orçamento (persistido por contrato). */
interface SessaoOrcamentoPersist {
  subtitulosNoOrcamento: string[];
  quantidadesPorItem: Record<string, number>;
  dimensoesPorItem: Record<string, DimensoesItem>;
  /** Planilha analítica: chaves = linha analítica (composição ou insumo). */
  planilhaQuantidadeCompra: Record<string, number>;
  planilhaValorUnitCompraReal: Record<string, number>;
  planilhaTipoInsumo: Record<string, 'MO' | 'MA' | 'LO'>;
  showDetalhesFinanceiros: boolean;
  meta?: OrcamentoMeta;
  /**
   * Chaves `servicoId|subtituloId|chave` ocultas na montagem (removidas pelo usuário).
   * Não apagamos do catálogo `servicos` para poder restaurar sem reimportar.
   */
  itensOcultosNoOrcamento?: string[];
  /**
   * Só em orçamentos `meta.importadoPlanilha`: árvore de serviços deste documento (importação + blocos adicionados).
   * O catálogo da planilha perfeita do contrato continua em `servicos-padrao.json` e vem em GET `servicos`.
   */
  servicosDocumento?: ServicoPadrao[];
}

interface OrcamentoRecoverySnapshot {
  createdAt: string;
  servicos: ServicoPadrao[];
  imports: ImportRecord[];
  sessaoOrcamento: SessaoOrcamentoPersist;
}

function sessaoVazia(): SessaoOrcamentoPersist {
  return {
    subtitulosNoOrcamento: [],
    quantidadesPorItem: {},
    dimensoesPorItem: {},
    planilhaQuantidadeCompra: {},
    planilhaValorUnitCompraReal: {},
    planilhaTipoInsumo: {},
    showDetalhesFinanceiros: false,
    itensOcultosNoOrcamento: [],
    meta: {
      osNumeroPasta: '',
      dataAbertura: '',
      dataEnvio: '',
      prazoExecucaoDias: '',
      responsavelOrcamento: '',
      descricao: '',
      orcamentoRealizadoPor: '',
      descontoPercentual: '25,01',
      bdiPercentual: '28,35',
      reajustes: ORCAMENTO_REAJUSTES_PADRAO.map((r) => ({ ...r })),
      revisaoCount: 0
    }
  };
}

function loadSessaoOrcamento(centroCustoId: string | null, orcamentoId: string | null): SessaoOrcamentoPersist | null {
  if (typeof window === 'undefined' || !centroCustoId || !orcamentoId) return null;
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'sessao', orcamentoId));
    if (!s) return null;
    const p = JSON.parse(s) as Partial<SessaoOrcamentoPersist>;
    if (!p || typeof p !== 'object') return null;
    const metaRaw = (p as any).meta;
    const hasMeta = metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw);
    const meta: OrcamentoMeta = hasMeta
      ? {
          osNumeroPasta: typeof metaRaw.osNumeroPasta === 'string' ? metaRaw.osNumeroPasta : '',
          dataAbertura: typeof metaRaw.dataAbertura === 'string' ? metaRaw.dataAbertura : '',
          dataEnvio: typeof metaRaw.dataEnvio === 'string' ? metaRaw.dataEnvio : '',
          prazoExecucaoDias: typeof metaRaw.prazoExecucaoDias === 'string' ? metaRaw.prazoExecucaoDias : '',
          responsavelOrcamento: typeof metaRaw.responsavelOrcamento === 'string' ? metaRaw.responsavelOrcamento : '',
          descricao: typeof metaRaw.descricao === 'string' ? metaRaw.descricao : '',
          orcamentoRealizadoPor: typeof metaRaw.orcamentoRealizadoPor === 'string' ? metaRaw.orcamentoRealizadoPor : '',
          descontoPercentual:
            typeof metaRaw.descontoPercentual === 'string' ? metaRaw.descontoPercentual : '25,01',
          bdiPercentual: typeof metaRaw.bdiPercentual === 'string' ? metaRaw.bdiPercentual : '28,35',
          reajustes: Array.isArray(metaRaw.reajustes)
            ? metaRaw.reajustes.map((r: any, idx: number) => ({
                nome: typeof r?.nome === 'string' && r.nome.trim()
                  ? r.nome
                  : `Reajuste ${idx + 1}`,
                percentual: typeof r?.percentual === 'string' ? r.percentual : ''
              }))
            : ORCAMENTO_REAJUSTES_PADRAO.map((r) => ({ ...r })),
          revisaoCount:
            typeof metaRaw.revisaoCount === 'number' && isFinite(metaRaw.revisaoCount) ? metaRaw.revisaoCount : 0,
          importadoPlanilha: metaRaw.importadoPlanilha === true
        }
      : sessaoVazia().meta!;
    return {
      subtitulosNoOrcamento: Array.isArray(p.subtitulosNoOrcamento) ? p.subtitulosNoOrcamento : [],
      quantidadesPorItem: p.quantidadesPorItem && typeof p.quantidadesPorItem === 'object' ? p.quantidadesPorItem : {},
      dimensoesPorItem: p.dimensoesPorItem && typeof p.dimensoesPorItem === 'object' ? p.dimensoesPorItem : {},
      planilhaQuantidadeCompra:
        p.planilhaQuantidadeCompra && typeof p.planilhaQuantidadeCompra === 'object' ? p.planilhaQuantidadeCompra : {},
      planilhaValorUnitCompraReal:
        p.planilhaValorUnitCompraReal && typeof p.planilhaValorUnitCompraReal === 'object'
          ? p.planilhaValorUnitCompraReal
          : {},
      planilhaTipoInsumo:
        p.planilhaTipoInsumo && typeof p.planilhaTipoInsumo === 'object'
          ? normalizarPlanilhaTipoInsumo(p.planilhaTipoInsumo as Record<string, unknown>)
          : {},
      showDetalhesFinanceiros: Boolean(p.showDetalhesFinanceiros),
      itensOcultosNoOrcamento: Array.isArray(p.itensOcultosNoOrcamento) ? p.itensOcultosNoOrcamento : [],
      meta,
      ...(Array.isArray(p.servicosDocumento) ? { servicosDocumento: p.servicosDocumento as ServicoPadrao[] } : {})
    };
  } catch {
    return null;
  }
}

function sessaoTemDados(s: SessaoOrcamentoPersist | null | undefined): boolean {
  if (!s) return false;
  return (
    s.subtitulosNoOrcamento.length > 0 ||
    (s.itensOcultosNoOrcamento ?? []).length > 0 ||
    Object.keys(s.quantidadesPorItem).length > 0 ||
    Object.keys(s.dimensoesPorItem).length > 0 ||
    Object.keys(s.planilhaQuantidadeCompra ?? {}).length > 0 ||
    Object.keys(s.planilhaValorUnitCompraReal ?? {}).length > 0 ||
    Object.keys(s.planilhaTipoInsumo ?? {}).length > 0
  );
}

/** Evita tratar o catálogo do contrato como árvore do documento importado após reload. */
function arvoreServicosPareceCatalogoContrato(
  arvore: ServicoPadrao[],
  catalogo: ServicoPadrao[]
): boolean {
  if (arvore.length === 0 || catalogo.length === 0) return false;
  try {
    return JSON.stringify(arvore) === JSON.stringify(catalogo);
  } catch {
    return false;
  }
}

function loadOrcamentoSnapshots(centroCustoId: string | null, orcamentoId: string | null): OrcamentoRecoverySnapshot[] {
  if (typeof window === 'undefined' || !centroCustoId || !orcamentoId) return [];
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'snapshots', orcamentoId));
    const parsed = s ? JSON.parse(s) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOrcamentoSnapshot(
  centroCustoId: string | null,
  orcamentoId: string | null,
  payload: { servicos: ServicoPadrao[]; imports: ImportRecord[]; sessaoOrcamento: SessaoOrcamentoPersist }
) {
  if (typeof window === 'undefined' || !centroCustoId || !orcamentoId) return;
  try {
    const current = loadOrcamentoSnapshots(centroCustoId, orcamentoId);
    const next: OrcamentoRecoverySnapshot[] = [
      ...current,
      {
        createdAt: new Date().toISOString(),
        servicos: servicosParaLocalStorage(servicosSemQuantidadePlanilha(payload.servicos)),
        imports: payload.imports,
        sessaoOrcamento: sessaoOrcamentoParaSnapshot(payload.sessaoOrcamento)
      }
    ];
    const limited = next.slice(-ORCAMENTO_SNAPSHOT_MAX);
    localStorage.setItem(storageKey(centroCustoId, 'snapshots', orcamentoId), JSON.stringify(limited));
  } catch {
    /* quota */
  }
}

function getLatestUsefulSnapshot(
  centroCustoId: string | null,
  orcamentoId: string | null
): OrcamentoRecoverySnapshot | null {
  const snapshots = loadOrcamentoSnapshots(centroCustoId, orcamentoId);
  for (let i = snapshots.length - 1; i >= 0; i--) {
    const sn = snapshots[i];
    if (!sn) continue;
    const hasData =
      Array.isArray(sn.servicos) && sn.servicos.length > 0 ||
      Array.isArray(sn.imports) && sn.imports.length > 0 ||
      sessaoTemDados(sn.sessaoOrcamento);
    if (hasData) return sn;
  }
  return null;
}

function loadComposicoes(centroCustoId: string | null): ComposicaoItem[] {
  if (typeof window === 'undefined' || !centroCustoId) return [];
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'composicoes'));
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function saveComposicoes(centroCustoId: string, items: ComposicaoItem[]) {
  localStorage.setItem(storageKey(centroCustoId, 'composicoes'), JSON.stringify(items));
}

/** Serviços padrão e imports são compartilhados por todos os orçamentos do contrato. */
function loadServicos(centroCustoId: string | null): ServicoPadrao[] {
  if (typeof window === 'undefined' || !centroCustoId) return [];
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'servicos'));
    const parsed: any[] = s ? JSON.parse(s) : [];
    return parsed.map(svc => {
      if (svc.subtitulos && Array.isArray(svc.subtitulos)) return svc;
      const itens = svc.itens || [];
      return {
        ...svc,
        subtitulos: itens.length
          ? [{ id: crypto.randomUUID(), nome: svc.nome, itens }]
          : []
      };
    });
  } catch {
    return [];
  }
}

function saveServicos(centroCustoId: string, servicos: ServicoPadrao[]) {
  if (typeof window === 'undefined') return;
  const key = storageKey(centroCustoId, 'servicos');
  const payload = servicosParaLocalStorage(servicosSemQuantidadePlanilha(servicos));
  const tryWrite = () => localStorage.setItem(key, JSON.stringify(payload));

  try {
    tryWrite();
    return;
  } catch (err) {
    if (!isLocalStorageQuotaError(err)) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('Não foi possível salvar serviços no armazenamento local:', err);
      }
      return;
    }
  }

  for (const level of [1, 2, 3] as const) {
    evictOrcamentoDraftStorage(centroCustoId, level);
    try {
      tryWrite();
      return;
    } catch {
      /* tenta nível seguinte */
    }
  }

  const now = Date.now();
  if (now - servicosLocalStorageQuotaWarnAt > 60_000) {
    servicosLocalStorageQuotaWarnAt = now;
    console.warn(
      'Armazenamento local cheio: rascunho dos serviços não coube. Os snapshots de recuperação e parte do cache local foram limpos; use Salvar no servidor para não perder dados. Se o aviso voltar, limpe dados do site ou reduza o tamanho do orçamento.'
    );
  }
}

function loadImports(centroCustoId: string | null): ImportRecord[] {
  if (typeof window === 'undefined' || !centroCustoId) return [];
  try {
    const s = localStorage.getItem(storageKey(centroCustoId, 'imports'));
    return s ? JSON.parse(s) : [];
  } catch {
    return [];
  }
}

function addImport(centroCustoId: string, record: Omit<ImportRecord, 'id'>) {
  const list = loadImports(centroCustoId);
  list.unshift({
    ...record,
    id: crypto.randomUUID()
  } as ImportRecord);
  if (list.length > 20) list.pop();
  try {
    localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(list));
  } catch (err) {
    console.warn('Não foi possível salvar histórico de importações no armazenamento local:', err);
  }
}

async function fetchOrcamentosLista(centroCustoId: string): Promise<{
  orcamentos: { id: string; nome: string; updatedAt: string }[];
  ultimoOrcamentoId: string | null;
}> {
  const res = await api.get(`/orcamento/${centroCustoId}`);
  const d = res.data;
  return {
    orcamentos: Array.isArray(d?.orcamentos) ? d.orcamentos : [],
    ultimoOrcamentoId: d?.ultimoOrcamentoId ?? null
  };
}

async function fetchOrcamentoDetail(centroCustoId: string, orcamentoId: string): Promise<{
  servicos: ServicoPadrao[];
  imports: ImportRecord[];
  sessaoOrcamento: SessaoOrcamentoPersist | null;
} | null> {
  try {
    const res = await api.get(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`);
    const d = res.data;
    if (!d || typeof d !== 'object') return null;
    const hasSessaoKey =
      'sessaoOrcamento' in d && d.sessaoOrcamento != null && typeof d.sessaoOrcamento === 'object';
    const so = d.sessaoOrcamento as Partial<SessaoOrcamentoPersist> | undefined;
    const metaRaw = (so as any)?.meta;
    const hasMeta = metaRaw && typeof metaRaw === 'object' && !Array.isArray(metaRaw);
    const meta: OrcamentoMeta = hasMeta
      ? {
          osNumeroPasta: typeof metaRaw.osNumeroPasta === 'string' ? metaRaw.osNumeroPasta : '',
          dataAbertura: typeof metaRaw.dataAbertura === 'string' ? metaRaw.dataAbertura : '',
          dataEnvio: typeof metaRaw.dataEnvio === 'string' ? metaRaw.dataEnvio : '',
          prazoExecucaoDias: typeof metaRaw.prazoExecucaoDias === 'string' ? metaRaw.prazoExecucaoDias : '',
          responsavelOrcamento: typeof metaRaw.responsavelOrcamento === 'string' ? metaRaw.responsavelOrcamento : '',
          descricao: typeof metaRaw.descricao === 'string' ? metaRaw.descricao : '',
          orcamentoRealizadoPor: typeof metaRaw.orcamentoRealizadoPor === 'string' ? metaRaw.orcamentoRealizadoPor : '',
          descontoPercentual:
            typeof metaRaw.descontoPercentual === 'string' ? metaRaw.descontoPercentual : '25,01',
          bdiPercentual: typeof metaRaw.bdiPercentual === 'string' ? metaRaw.bdiPercentual : '28,35',
          reajustes: Array.isArray(metaRaw.reajustes)
            ? metaRaw.reajustes.map((r: any, idx: number) => ({
                nome: typeof r?.nome === 'string' && r.nome.trim()
                  ? r.nome
                  : `Reajuste ${idx + 1}`,
                percentual: typeof r?.percentual === 'string' ? r.percentual : ''
              }))
            : ORCAMENTO_REAJUSTES_PADRAO.map((r) => ({ ...r })),
          revisaoCount:
            typeof metaRaw.revisaoCount === 'number' && isFinite(metaRaw.revisaoCount) ? metaRaw.revisaoCount : 0,
          importadoPlanilha: metaRaw.importadoPlanilha === true
        }
      : sessaoVazia().meta!;
    const sessaoOrcamento: SessaoOrcamentoPersist | null =
      hasSessaoKey && so
        ? {
            subtitulosNoOrcamento: Array.isArray(so.subtitulosNoOrcamento) ? so.subtitulosNoOrcamento : [],
            quantidadesPorItem:
              so.quantidadesPorItem && typeof so.quantidadesPorItem === 'object' ? so.quantidadesPorItem : {},
            dimensoesPorItem:
              so.dimensoesPorItem && typeof so.dimensoesPorItem === 'object' ? so.dimensoesPorItem : {},
            planilhaQuantidadeCompra:
              so.planilhaQuantidadeCompra && typeof so.planilhaQuantidadeCompra === 'object'
                ? so.planilhaQuantidadeCompra
                : {},
            planilhaValorUnitCompraReal:
              so.planilhaValorUnitCompraReal && typeof so.planilhaValorUnitCompraReal === 'object'
                ? so.planilhaValorUnitCompraReal
                : {},
            planilhaTipoInsumo:
              so.planilhaTipoInsumo && typeof so.planilhaTipoInsumo === 'object'
                ? normalizarPlanilhaTipoInsumo(so.planilhaTipoInsumo as Record<string, unknown>)
                : {},
            showDetalhesFinanceiros: Boolean(so.showDetalhesFinanceiros),
            itensOcultosNoOrcamento: Array.isArray(so.itensOcultosNoOrcamento) ? so.itensOcultosNoOrcamento : [],
            meta,
            ...(Array.isArray(so.servicosDocumento) ? { servicosDocumento: so.servicosDocumento as ServicoPadrao[] } : {})
          }
        : null;
    return {
      servicos: Array.isArray(d.servicos) ? d.servicos : [],
      imports: Array.isArray(d.imports) ? d.imports : [],
      sessaoOrcamento
    };
  } catch {
    return null;
  }
}

/**
 * Monta o body do PUT. Orçamentos importados enviam `servicos` só no **arquivo deste orçamento**
 * (espelho de `servicosDocumento`), para `getOrcamento` não preencher `servicos` com o catálogo
 * do contrato quando a chave root não existia — caso em que o F5 mostrava a base e “sumiam” as composições.
 */
function montarPayloadSalvarOrcamento(
  servicos: ServicoPadrao[],
  imports: ImportRecord[],
  sessao: SessaoOrcamentoPersist
): {
  servicos?: ServicoPadrao[];
  imports?: ImportRecord[];
  sessaoOrcamento?: SessaoOrcamentoPersist | null;
} {
  if (sessao.meta?.importadoPlanilha === true) {
    const doc = servicosSemQuantidadePlanilha(servicos);
    return {
      imports,
      servicos: doc,
      sessaoOrcamento: {
        ...sessao,
        servicosDocumento: doc
      }
    };
  }
  const { servicosDocumento: _doc, ...sessaoSemDoc } = sessao;
  return {
    servicos,
    imports,
    sessaoOrcamento: sessaoSemDoc
  };
}

async function saveOrcamentoToApi(
  centroCustoId: string,
  orcamentoId: string,
  data: {
    servicos?: ServicoPadrao[];
    imports?: ImportRecord[];
    sessaoOrcamento?: SessaoOrcamentoPersist | null;
  }
): Promise<void> {
  await api.put(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`, data);
}

async function criarOrcamentoApi(
  centroCustoId: string,
  nome?: string
): Promise<{ id: string; nome: string; updatedAt: string }> {
  const res = await api.post(`/orcamento/${centroCustoId}/orcamentos`, { nome });
  return res.data;
}

async function excluirOrcamentoApi(centroCustoId: string, orcamentoId: string): Promise<void> {
  await api.delete(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`);
}

async function renomearOrcamentoApi(centroCustoId: string, orcamentoId: string, nome: string): Promise<void> {
  await api.patch(`/orcamento/${centroCustoId}/orcamentos/${orcamentoId}`, { nome });
}

async function saveServicosPadraoToApi(
  centroCustoId: string,
  data: { servicos: ServicoPadrao[]; imports: ImportRecord[] }
): Promise<void> {
  await api.put(`/orcamento/${centroCustoId}/servicos-padrao`, data);
}

async function fetchServicosPadraoFromApi(
  centroCustoId: string
): Promise<{ servicos: ServicoPadrao[]; imports: ImportRecord[] } | null> {
  try {
    const res = await api.get(`/orcamento/${centroCustoId}/servicos-padrao`);
    const root = res?.data;
    const d = root?.data && typeof root.data === 'object' ? root.data : root;
    return {
      servicos: Array.isArray(d?.servicos) ? d.servicos : [],
      imports: Array.isArray(d?.imports) ? d.imports : []
    };
  } catch {
    return null;
  }
}

async function fetchComposicoesGeral(): Promise<ComposicaoItem[]> {
  try {
    const res = await api.get('/orcamento/composicoes/geral');
    return Array.isArray(res.data) ? res.data : [];
  } catch {
    return [];
  }
}

async function saveComposicoesGeralToApi(items: ComposicaoItem[]) {
  try {
    await api.put('/orcamento/composicoes/geral', { items });
  } catch (err) {
    console.warn('Erro ao salvar composições no S3:', err);
  }
}

function parsePreco(val: any): number {
  if (val == null || val === '') return 0;
  if (typeof val === 'number' && !isNaN(val)) return val;
  let s = String(val).replace(/[^\d,.-]/g, '').trim();
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    s = s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Avalia expressão matemática no padrão Excel (=10*8). Aceita vírgula como decimal. */
function evalSimpleExpr(str: string): number | null {
  const raw = String(str || '').trim();
  if (!raw.startsWith('=')) return null;
  const s = raw.slice(1).trim().replace(/,/g, '.');
  if (!s) return null;
  if (!/^[\d\s+\-*/.()]+$/.test(s)) return null;
  try {
    const result = new Function(`return (${s})`)();
    return typeof result === 'number' && isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function normalizarTextoBusca(val: string): string {
  return String(val || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

/** Mesmo capítulo repetido no subtítulo (ex.: "PINTURAS" e "PINTURAS EM TETO" com ITEM nível 1 nas duas). */
function descricaoPareceSubtituloDoBloco(descricao: string, nomeTopico: string): boolean {
  const d = normalizarTextoBusca(descricao);
  const t = normalizarTextoBusca(nomeTopico);
  if (!d || !t || t.length < 4) return false;
  if (d === t) return true;
  if (d.startsWith(`${t} `)) return true;
  if (d.startsWith(`${t}-`) || d.startsWith(`${t}—`)) return true;
  if (d.startsWith(t) && d.length > t.length) {
    const next = d.charAt(t.length);
    if (next === ' ' || next === '-' || next === '—' || next === ':' || next === '.') return true;
  }
  return false;
}

/** Cabeçalhos alinhados ao export detalhado; colunas de importação: ITEM, CÓDIGO, BANCO, DESCRIÇÃO, MAT + M.O., MÃO DE OBRA, MATERIAL (use "MÃO DE OBRA", não "M.O." — o importador não reconhece "M.O." sozinho). */
const MODELO_ORCAMENTO_PERFEITO_COLS = [
  'ITEM',
  'CÓDIGO',
  'BANCO',
  'CHAVE',
  'DESCRIÇÃO',
  'UNIDADE',
  'QUANTIDADE',
  'MÃO DE OBRA',
  'MATERIAL',
  'MAT + M.O',
  'SUB MÃO DE OBRA',
  'SUB MATERIAL',
  'SUB MAT + M.O',
  'PESO %'
] as const;

/** Planilha modelo compatível com `handleImportOrcamentoPerfeito` (cabeçalho na linha 11). */
function baixarModeloOrcamentoPerfeitoXlsx() {
  const nCol = MODELO_ORCAMENTO_PERFEITO_COLS.length;
  const pad = (cells: (string | number)[]) => {
    const row = [...cells];
    while (row.length < nCol) row.push('');
    return row;
  };

  const linhas: (string | number)[][] = [
    pad(['MODELO – ORÇAMENTO PERFEITO (mesmas colunas do export “Orçamento detalhado”)']),
    pad(['']),
    pad(['Instruções:']),
    pad([
      '• Linha 11: cabeçalhos abaixo (não renomeie as colunas usadas pelo sistema: ITEM, CÓDIGO, BANCO, DESCRIÇÃO, MAT + M.O, MÃO DE OBRA, MATERIAL).'
    ]),
    pad([
      '• ITEM: 1 = serviço; 1.1 = subtítulo; 1.1.1 = composição (com CÓDIGO e BANCO). Linhas só com DESCRIÇÃO definem nome do serviço ou subtítulo.'
    ]),
    pad([
      '• CHAVE, UNIDADE, QUANTIDADE, SUB… e PESO % são opcionais na importação (o sistema lê preços unitários em MÃO DE OBRA, MATERIAL e MAT + M.O).'
    ]),
    pad(['• Pode apagar estas linhas de texto, mantendo a linha 11 como cabeçalho.']),
    pad(['']),
    pad(['']),
    pad([...MODELO_ORCAMENTO_PERFEITO_COLS]),
    pad(['1', '', '', '', 'EXEMPLO — NOME DO SERVIÇO (substitua)', '', '', '', '', '', '', '', '', '']),
    pad(['1.1', '', '', '', 'EXEMPLO — NOME DO SUBTÍTULO (substitua)', '', '', '', '', '', '', '', '', '']),
    pad([
      '1.1.1',
      '00000',
      'SINAPI',
      '',
      'EXEMPLO — DESCRIÇÃO DA COMPOSIÇÃO (substitua)',
      'M3',
      '1',
      '40,00',
      '60,00',
      '100,00',
      '',
      '',
      '',
      ''
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(linhas);
  ws['!ref'] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: linhas.length - 1, c: nCol - 1 }
  });
  ws['!cols'] = [
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 14 },
    { wch: 48 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 16 },
    { wch: 10 }
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Orçamento');
  XLSX.writeFile(wb, `modelo-orcamento-perfeito-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Insumos com descrição de caixinha não entram nos totais do rodapé da ficha. */
function insumoExcluirCaixinhaRodape(descricao: string): boolean {
  return normalizarTextoBusca(descricao || '').includes('caixinha');
}

/** MA = material, MO = mão de obra, LO = locação (por categoria/descrição). */
function grupoPrecoCompraInsumoRodape(categoria: string, descricao: string): 'MA' | 'MO' | 'LO' {
  const d = normalizarTextoBusca(descricao || '');
  const c = (categoria || '').toUpperCase();
  if (d.includes('locacao') || d.includes('locação') || d.includes('aluguel') || c.includes('LOCA')) return 'LO';
  if (c.includes('MÃO') || c.includes('OBRA') || d.includes('mao de obra')) return 'MO';
  return 'MA';
}

/** Agrupa preço de compra real no rodapé: prioriza o tipo escolhido na planilha (MO/MA/LO). */
function grupoPrecoCompraInsumoPlanilha(
  key: string,
  categoria: string,
  descricao: string,
  planilhaTipo: Record<string, 'MO' | 'MA' | 'LO'>
): 'MA' | 'MO' | 'LO' {
  const raw = planilhaTipo[key];
  const t = String(raw ?? '') === 'MAT' ? 'MA' : raw;
  if (t === 'MO' || t === 'MA' || t === 'LO') return t;
  return grupoPrecoCompraInsumoRodape(categoria, descricao);
}

function normalizarCabecalhoColuna(val: string): string {
  // Remove pontuação para casar cabeçalhos como "M. O." e "MAT."
  return normalizarTextoBusca(val).replace(/[^a-z0-9+]/g, '');
}

function normalizarChave(codigo: string, banco: string): string {
  const c = String(codigo || '').trim();
  const b = String(banco || '').trim();
  return `${c}${b}`.replace(/\s+/g, '');
}

type ParsePlanilhaOrcamentoPerfeitoResult =
  | { ok: true; servicos: ServicoPadrao[]; composicoesAnaliticas: ComposicaoItem[] }
  | { ok: false; message: string };

/** Índices de coluna após normalizar cabeçalhos (NFD, minúsculas). */
function indicesColunasOrcamentoPerfeito(header: string[]) {
  const itemIdx = header.findIndex(
    h => h === 'item' || h === 'itens' || h.startsWith('item ') || h.startsWith('item.')
  );
  const codigoIdx = header.findIndex(h => h.includes('codigo'));
  const bancoIdx = header.findIndex(h => h === 'banco' || h.startsWith('banco') || /\bbanco\b/.test(h));
  const descIdx = header.findIndex(h => {
    if (!h.includes('descri')) return false;
    if (/^sub\s/.test(h)) return false;
    return true;
  });
  const matMoIdx = header.findIndex(h => {
    if (h.includes('sub mat') || /^sub\s/.test(h)) return false;
    return (
      (h.includes('mat') && (h.includes('m.o') || h.includes('m. o') || h.includes('mo'))) ||
      h === 'mat + m.o' ||
      h === 'mat+m.o' ||
      h.includes('mat+mo')
    );
  });
  const maoIdx = header.findIndex(h => {
    if (h.includes('sub mao') || /^sub\s/.test(h)) return false;
    return (
      (h.includes('mao') && h.includes('obra')) ||
      h === 'mo' ||
      h === 'm.o' ||
      h.startsWith('m.o')
    );
  });
  const materialIdx = header.findIndex(h => {
    if (h.includes('sub material') || /^sub\s/.test(h)) return false;
    return h === 'material' || h === 'mat' || h.includes(' material');
  });
  const quantidadeIdx = header.findIndex(h => {
    if (/^sub\s/.test(h)) return false;
    if (h.includes('quantidade real') || h.includes('qtd real')) return false;
    if (h === 'quantidade' || h === 'qtde' || h === 'qtd') return true;
    const semPonto = h.replace(/\./g, '');
    if (semPonto === 'quant' || semPonto.startsWith('quant ')) return true;
    return h.startsWith('quant') && !h.includes('real');
  });
  return {
    itemIdx,
    codigoIdx,
    bancoIdx,
    descIdx,
    matMoIdx,
    maoIdx,
    materialIdx,
    quantidadeIdx
  };
}

/** Localiza a linha do cabeçalho: planilhas exportadas (linha 1), títulos acima, ou modelo (linha 11). ITEM e BANCO são opcionais. */
function encontrarLinhaCabecalhoOrcamentoPerfeito(rows: any[][]): number | null {
  const maxScan = Math.min(rows.length, 60);
  for (let r = 0; r < maxScan; r++) {
    const header = (rows[r] || []).map((h: any) => normalizarTextoBusca(String(h || '')));
    const { codigoIdx, descIdx } = indicesColunasOrcamentoPerfeito(header);
    if (codigoIdx >= 0 && descIdx >= 0) {
      return r;
    }
  }
  if (rows.length > 10) {
    const header = (rows[10] || []).map((h: any) => normalizarTextoBusca(String(h || '')));
    const { codigoIdx, descIdx } = indicesColunasOrcamentoPerfeito(header);
    if (codigoIdx >= 0 && descIdx >= 0) {
      return 10;
    }
  }
  return null;
}

/** Primeira aba que contém cabeçalho de orçamento (CÓDIGO + DESCRIÇÃO). */
function encontrarPrimeiraPlanilhaOrcamentoNoArquivo(workbook: {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}): { rows: any[][]; headerRow: number } | null {
  for (let si = 0; si < workbook.SheetNames.length; si++) {
    const sheet = workbook.Sheets[workbook.SheetNames[si]];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];
    if (rows.length < 2) continue;
    const headerRow = encontrarLinhaCabecalhoOrcamentoPerfeito(rows);
    if (headerRow !== null) return { rows, headerRow };
  }
  return null;
}

/** Detecta cabeçalho de aba analítica (CÓDIGO/BANCO/DESCRIÇÃO/TIPO/UND...). */
function encontrarLinhaCabecalhoAnalitico(rows: any[][]): number | null {
  const maxScan = Math.min(rows.length, 80);
  for (let r = 0; r < maxScan; r++) {
    const header = (rows[r] || []).map((h: any) => normalizarCabecalhoColuna(String(h || '')));
    const temCodigo = header.some((h: string) => h.includes('codigo'));
    const temDescricao = header.some((h: string) => h.includes('descri'));
    const temTipo = header.some((h: string) => h === 'tipo');
    const temUnd = header.some((h: string) => h === 'und' || h === 'un' || h.includes('unidade'));
    if (temCodigo && temDescricao && (temTipo || temUnd)) return r;
  }
  return null;
}

/** Lê a 2ª aba (analítico) e associa insumos às composições; ignora coluna "Porcent." quando existir. */
function parseComposicoesAnaliticasDaSegundaAba(workbook: {
  SheetNames: string[];
  Sheets: Record<string, unknown>;
}, servicosImportados: ServicoPadrao[]): ComposicaoItem[] {
  if (workbook.SheetNames.length < 2) return [];
  const secondSheet = workbook.Sheets[workbook.SheetNames[1]];
  if (!secondSheet) return [];
  // raw:false preserva o valor formatado (evita Excel converter códigos em número e "comer" pontos/zeros).
  const rows = XLSX.utils.sheet_to_json(secondSheet, { header: 1, defval: '', raw: false }) as any[][];
  if (rows.length < 2) return [];

  const headerRow = encontrarLinhaCabecalhoAnalitico(rows);
  if (headerRow === null) return [];
  const header = (rows[headerRow] || []).map((h: any) => normalizarCabecalhoColuna(String(h || '')));

  const itemIdx = header.findIndex(h => h === 'item' || h === 'itens');
  const codigoIdx = header.findIndex(h => h.includes('codigo'));
  const codigoBancoIdx = header.findIndex(h => h.includes('codigobanco'));
  const bancoIdx = header.findIndex(h => h === 'banco');
  const descIdx = header.findIndex(h => h === 'descricao' || h.includes('descri'));
  const tipoIdx = header.findIndex(h => h === 'tipo'); // coluna "Tipo" da planilha (será ignorada no mapeamento do sistema)
  const undIdx = header.findIndex(h => h === 'und' || h === 'un' || h.includes('unidade'));
  const quantIdx = header.findIndex(h => h.includes('quant'));
  const valorUnitIdx = header.findIndex(h => h.includes('valorunit') || h === 'valoruni');
  const totalIdx = header.findIndex(h => h === 'total');

  // "Tipo" do sistema vem da 1ª coluna de linha (Composição/Insumo/Auxiliar...),
  // não da coluna "Tipo" da planilha (Conservação, Material, Equipamento...).
  const detectarColunaTipoLinha = (): number => {
    const candidates = new Map<number, number>();
    const start = Math.max(0, headerRow + 1);
    const end = Math.min(rows.length, start + 150);
    for (let r = start; r < end; r++) {
      const row = rows[r] || [];
      for (let c = 0; c < Math.min(row.length, 8); c++) {
        const v = normalizarTextoBusca(String(row[c] ?? ''));
        if (!v) continue;
        if (v.includes('composicao') || v.includes('insumo') || v.includes('auxiliar')) {
          candidates.set(c, (candidates.get(c) ?? 0) + 1);
        }
      }
    }
    let bestIdx = -1;
    let bestScore = -1;
    candidates.forEach((score, idx) => {
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
    });
    // fallback: normalmente fica à esquerda de "Código"
    if (bestIdx < 0 && codigoIdx > 0) return codigoIdx - 1;
    return bestIdx;
  };
  const tipoLinhaIdx = detectarColunaTipoLinha();

  const detectarTipoLinhaPorRow = (row: any[]): string => {
    // Busca "Composição/Insumo/Auxiliar" nas primeiras colunas da linha,
    // porque em alguns blocos do Excel essa coluna muda de posição.
    const maxCols = Math.min(row.length, 6);
    for (let c = 0; c < maxCols; c++) {
      const raw = String(row[c] ?? '').trim();
      const n = normalizarTextoBusca(raw);
      if (!n) continue;
      if (n.includes('composicao') || n.includes('insumo') || n.includes('auxiliar')) {
        return n;
      }
    }
    const fallback = String((tipoLinhaIdx >= 0 ? row[tipoLinhaIdx] : '') || '').trim();
    return normalizarTextoBusca(fallback);
  };

  const refsByCodigo = new Map<string, Array<{ codigo: string; banco: string; chave: string }>>();
  for (const svc of servicosImportados) {
    for (const sub of svc.subtitulos) {
      for (const it of sub.itens) {
        const codigoNorm = String(it.codigo || '').replace(/[\s.]+/g, '').toUpperCase();
        if (!codigoNorm) continue;
        const arr = refsByCodigo.get(codigoNorm) ?? [];
        arr.push({
          codigo: String(it.codigo || '').trim(),
          banco: String(it.banco || '').trim(),
          chave: String(it.chave || normalizarChave(it.codigo, it.banco))
        });
        refsByCodigo.set(codigoNorm, arr);
      }
    }
  }

  const compMap = new Map<string, ComposicaoItem>();
  let composicaoAtualKey: string | null = null;

  const isTextoEstrutural = (val: string) => {
    const n = normalizarTextoBusca(val);
    return (
      n === 'composicao' ||
      n === 'insumo' ||
      n === 'item' ||
      n === 'auxiliar' ||
      n.includes('codigo') ||
      n.includes('banco') ||
      n.includes('descricao') ||
      n.includes('tipo')
    );
  };

  const limparTextoCelula = (val: unknown): string =>
    String(val ?? '')
      .replace(/\s+/g, ' ')
      .replace(/\s*\/\s*/g, '/')
      .trim();

  const ehBancoProvavel = (val: string) => /^[A-Za-z]{2,12}(?:\/[A-Za-z]{1,12})*$/.test(val);
  const extrairBancoDeTexto = (val: string): string => {
    const t = limparTextoCelula(val);
    if (!t) return '';
    if (ehBancoProvavel(t)) return t;
    // Ex.: "CPOS/CH U" ou "CPOS/CH\nU" → pega só o token que parece banco.
    const tokens = t.split(' ').filter(Boolean);
    for (const tok of tokens) {
      if (ehBancoProvavel(tok)) return tok;
    }
    return '';
  };

  const parseCodigoBancoRow = (row: any[]): { codigo: string; banco: string } => {
    let codigo = codigoIdx >= 0 ? limparTextoCelula(row[codigoIdx]) : '';
    let banco = bancoIdx >= 0 ? extrairBancoDeTexto(limparTextoCelula(row[bancoIdx])) : '';

    // Em alguns arquivos, o código vem quebrado entre as colunas "Código" e "Banco" (ex.: "S" + "04 000 2672").
    if (codigo && banco && !/[0-9]/.test(codigo) && /[0-9]/.test(banco) && !isTextoEstrutural(banco)) {
      codigo = `${codigo} ${banco}`.trim();
      const bancoProximo = String(row[bancoIdx + 1] ?? '').trim();
      if (ehBancoProvavel(bancoProximo) && !isTextoEstrutural(bancoProximo)) banco = bancoProximo;
      else banco = '';
    }

    if ((!codigo || !banco) && codigoBancoIdx >= 0) {
      const codigoBancoRaw = limparTextoCelula(row[codigoBancoIdx]);
      if (codigoBancoRaw) {
        const parts = codigoBancoRaw.split(/\s+/).filter(Boolean);
        if (!codigo && parts.length >= 1) codigo = parts[0] ?? '';
        if (!banco && parts.length >= 2) banco = extrairBancoDeTexto(parts.slice(1).join(' '));
      }
      if (!banco) {
        const maybeBancoNext = limparTextoCelula(row[codigoBancoIdx + 1]);
        const b = extrairBancoDeTexto(maybeBancoNext);
        if (b && !isTextoEstrutural(b)) banco = b;
      }
    }

    // Heurística para layout com cabeçalhos mesclados: busca código/banco nas primeiras colunas úteis.
    const inicio = Math.max(0, Math.min(
      ...[itemIdx, codigoIdx, codigoBancoIdx, bancoIdx].filter((v) => v >= 0)
    ));
    const fim = Math.min(row.length - 1, Math.max(inicio + 6, descIdx >= 0 ? descIdx : inicio + 6));

    if (!codigo || isTextoEstrutural(codigo)) {
      for (let c = inicio; c <= fim; c++) {
        const val = limparTextoCelula(row[c]);
        if (!val || isTextoEstrutural(val)) continue;
        // Código costuma conter dígitos e pode ter pontos.
        if (/[0-9]/.test(val)) {
          codigo = val;
          break;
        }
      }
    }

    if (!banco || isTextoEstrutural(banco)) {
      for (let c = inicio; c <= fim; c++) {
        const val = limparTextoCelula(row[c]);
        if (!val || isTextoEstrutural(val)) continue;
        // Banco normalmente é sigla textual (FDE, SINAPI, ORSE, CPOS/CH, etc).
        const b = extrairBancoDeTexto(val);
        if (b) {
          banco = b;
          break;
        }
      }
    }

    // Fallback para linhas onde o código vem repartido, ex.: "S" + "04 000 2672".
    if (!codigo && bancoIdx > 0) {
      const codigoPrefixo = limparTextoCelula(row[bancoIdx - 1]);
      const codigoNumero = limparTextoCelula(row[bancoIdx]);
      if (/^[A-Za-z]{1,3}$/.test(codigoPrefixo) && /[0-9]/.test(codigoNumero)) {
        codigo = `${codigoPrefixo} ${codigoNumero}`.trim();
      }
      if (!banco) {
        const maybeBancoNext = limparTextoCelula(row[bancoIdx + 1]);
        if (ehBancoProvavel(maybeBancoNext) && !isTextoEstrutural(maybeBancoNext)) banco = maybeBancoNext;
      }
    }

    if (isTextoEstrutural(codigo)) codigo = '';
    if (banco && !ehBancoProvavel(banco)) banco = extrairBancoDeTexto(banco);
    if (isTextoEstrutural(banco)) banco = '';
    return { codigo, banco };
  };

  for (let i = headerRow + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const parsedCodigoBanco = parseCodigoBancoRow(row);
    const codigo = parsedCodigoBanco.codigo;
    const banco = parsedCodigoBanco.banco;
    const descricao = descIdx >= 0 ? String(row[descIdx] ?? '').trim() : '';
    if (!descricao) continue;

    const chave = normalizarChave(codigo, banco);
    const tipoLinhaNorm = detectarTipoLinhaPorRow(row);
    const ehComposicaoAuxiliar = tipoLinhaNorm.includes('composicao') && tipoLinhaNorm.includes('auxiliar');
    const tipoLinhaRaw = tipoLinhaNorm
      ? (ehComposicaoAuxiliar
          ? 'Composição auxiliar'
          : tipoLinhaNorm.includes('composicao')
            ? 'Composição'
            : tipoLinhaNorm.includes('auxiliar')
              ? 'Auxiliar'
              : 'Insumo')
      : '';
    const ehComposicao = tipoLinhaNorm.includes('composicao') && !ehComposicaoAuxiliar;
    const ehInsumo = tipoLinhaNorm.includes('insumo') || tipoLinhaNorm.includes('auxiliar');
    if (!ehComposicao && !ehInsumo) continue;

    const codigoNormLinha = String(codigo || '').replace(/[\s.]+/g, '').toUpperCase();
    const ehComposicaoPrincipalDoOrcamento = codigoNormLinha ? refsByCodigo.has(codigoNormLinha) : false;
    const composicaoAninhada =
      ehComposicao &&
      !ehComposicaoPrincipalDoOrcamento &&
      !!composicaoAtualKey;

    if (ehComposicao && (codigo || banco || chave) && !composicaoAninhada) {
      const unidade = undIdx >= 0 ? String(row[undIdx] ?? '').trim() || undefined : undefined;
      const quantidade = quantIdx >= 0 ? parsePreco(row[quantIdx]) : 0;
      const total = totalIdx >= 0 ? parsePreco(row[totalIdx]) : 0;
      const precoUnitario = valorUnitIdx >= 0
        ? parsePreco(row[valorUnitIdx])
        : (quantidade > 0 ? total / quantidade : 0);
      const comp: ComposicaoItem = {
        codigo,
        banco,
        chave,
        descricao,
        unidade,
        precoUnitario,
        maoDeObraUnitario: 0,
        materialUnitario: 0,
        analiticoLinhas: compMap.get(chave)?.analiticoLinhas || []
      };
      compMap.set(chave, comp);
      composicaoAtualKey = chave;
      continue;
    }

    if (ehInsumo || composicaoAninhada) {
      const destinoKey = (chave && compMap.has(chave)) ? chave : composicaoAtualKey;
      if (!destinoKey) continue;
      const comp = compMap.get(destinoKey);
      if (!comp) continue;

      const unidade = undIdx >= 0 ? String(row[undIdx] ?? '').trim() || 'un' : 'un';
      const quantidade = quantIdx >= 0 ? parsePreco(row[quantIdx]) : 0;
      const precoUnitario = valorUnitIdx >= 0 ? parsePreco(row[valorUnitIdx]) : 0;
      const totalInsumo = totalIdx >= 0 ? parsePreco(row[totalIdx]) : (quantidade * precoUnitario);
      const tipoPlanilhaTexto = normalizarTextoBusca(String((tipoIdx >= 0 ? row[tipoIdx] : '') || ''));
      const categoria: CategoriaAnalitico =
        composicaoAninhada
          ? 'MATERIAL'
          : (tipoPlanilhaTexto.includes('mao de obra') || normalizarTextoBusca(descricao).includes('servente'))
          ? 'MÃO DE OBRA'
          : 'MATERIAL';
      // Composição aninhada: espelha a primeira coluna da planilha ("Composição" vs "Composição auxiliar").
      const tipoLabel = composicaoAninhada ? (tipoLinhaRaw || 'Composição') : (tipoLinhaRaw || 'Insumo');

      comp.analiticoLinhas = [
        ...(comp.analiticoLinhas || []),
        {
          categoria,
          descricao,
          unidade,
          quantidade,
          precoUnitario,
          total: totalInsumo,
          codigo: codigo || undefined,
          banco: banco || undefined,
          tipoLabel
        }
      ];
      compMap.set(destinoKey, comp);
    }
  }

  return Array.from(compMap.values())
    .filter(c => c.analiticoLinhas && c.analiticoLinhas.length > 0)
    .map((c) => {
      const codigoNorm = String(c.codigo || '').replace(/[\s.]+/g, '').toUpperCase();
      const refs = refsByCodigo.get(codigoNorm) ?? [];
      if (refs.length === 1) {
        const ref = refs[0]!;
        return {
          ...c,
          codigo: c.codigo || ref.codigo,
          banco: c.banco || ref.banco,
          chave: c.chave || ref.chave
        };
      }
      return {
        ...c,
        chave: c.chave || normalizarChave(c.codigo, c.banco)
      };
    });
}

/** Lê planilha no formato orçamento perfeito; cabeçalho detectado automaticamente ou linha 11 (modelo). Sem efeitos colaterais. */
async function parsePlanilhaOrcamentoPerfeito(file: File): Promise<ParsePlanilhaOrcamentoPerfeitoResult> {
  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const aba = encontrarPrimeiraPlanilhaOrcamentoNoArquivo(workbook);
    if (!aba) {
      return {
        ok: false,
        message:
          'Não foi possível localizar o cabeçalho em nenhuma aba. É necessário CÓDIGO e DESCRIÇÃO (ITEM e BANCO recomendados, como no modelo).'
      };
    }
    const { rows, headerRow: HEADER_ROW } = aba;
    const header = (rows[HEADER_ROW] || []).map((h: any) => normalizarTextoBusca(String(h || '')));
    const { itemIdx, codigoIdx, bancoIdx, descIdx, matMoIdx, maoIdx, materialIdx, quantidadeIdx } =
      indicesColunasOrcamentoPerfeito(header);
    if (codigoIdx < 0 || descIdx < 0) {
      return {
        ok: false,
        message:
          'Cabeçalho não reconhecido. Inclua CÓDIGO e DESCRIÇÃO (ITEM e BANCO recomendados).'
      };
    }

    type ServicoImport = { nome: string; subtitulos: Map<string, ItemServico[]> };
    const servicosMap = new Map<string, ServicoImport>();

    let topicoAtual = '';
    let subdivisaoAtual = '';
    let lastRowWasItem = false;

    for (let i = HEADER_ROW + 1; i < rows.length; i++) {
      const row = rows[i] || [];
      const itemVal = itemIdx >= 0 ? String(row[itemIdx] ?? '').trim() : '';
      const codigo = String(row[codigoIdx] ?? '').trim();
      const banco = bancoIdx >= 0 ? String(row[bancoIdx] ?? '').trim() : '';
      const descricao = String(row[descIdx] ?? '').trim();
      const chave = normalizarChave(codigo, banco);
      const precoUnitario = matMoIdx >= 0 ? parsePreco(row[matMoIdx]) : 0;
      const maoDeObraUnitario = maoIdx >= 0 ? parsePreco(row[maoIdx]) : 0;
      const materialUnitario = materialIdx >= 0 ? parsePreco(row[materialIdx]) : 0;

      const semItemOuVazio = itemIdx < 0 || !itemVal;
      const partes = itemVal ? String(itemVal).split('.').filter(Boolean) : [];
      let nivel = partes.length;

      if (descricao && !codigo && !banco) {
        if (semItemOuVazio) {
          if (!topicoAtual || lastRowWasItem) {
            topicoAtual = descricao;
            subdivisaoAtual = '';
          } else if (!subdivisaoAtual) {
            subdivisaoAtual = descricao;
          } else if (topicoAtual && descricaoPareceSubtituloDoBloco(descricao, topicoAtual)) {
            subdivisaoAtual = descricao;
          } else {
            topicoAtual = descricao;
            subdivisaoAtual = '';
          }
          lastRowWasItem = false;
        } else {
          if (nivel === 1) {
            if (topicoAtual && descricaoPareceSubtituloDoBloco(descricao, topicoAtual)) {
              subdivisaoAtual = descricao;
            } else {
              topicoAtual = descricao;
              subdivisaoAtual = '';
            }
          } else if (nivel === 2) {
            subdivisaoAtual = descricao;
          } else if (nivel >= 3 && topicoAtual && descricaoPareceSubtituloDoBloco(descricao, topicoAtual)) {
            subdivisaoAtual = descricao;
          }
          lastRowWasItem = false;
        }
        continue;
      }

      if (semItemOuVazio && (codigo || banco) && descricao) {
        nivel = subdivisaoAtual ? 3 : 2;
      }

      if (!topicoAtual && (codigo || banco) && descricao) {
        topicoAtual = 'Serviços';
        subdivisaoAtual = '';
      }

      const ehItem = (codigo || banco) && descricao && nivel >= 2;
      if (ehItem && topicoAtual) {
        const nomeSubtitulo = subdivisaoAtual || topicoAtual;
        let quantidadePlanilha: number | undefined;
        if (quantidadeIdx >= 0) {
          const qv = parsePreco(row[quantidadeIdx]);
          if (qv > 0 && Number.isFinite(qv)) quantidadePlanilha = qv;
        }
        const item: ItemServico = {
          chave,
          codigo,
          banco,
          descricao,
          precoUnitario,
          maoDeObraUnitario,
          materialUnitario,
          ...(quantidadePlanilha != null ? { quantidadePlanilha } : {})
        };
        let servico = servicosMap.get(topicoAtual);
        if (!servico) {
          servico = { nome: topicoAtual, subtitulos: new Map() };
          servicosMap.set(topicoAtual, servico);
        }
        let itensSub = servico.subtitulos.get(nomeSubtitulo) || [];
        const jaExiste = itensSub.some(x => x.chave === item.chave || (x.codigo === item.codigo && x.banco === item.banco));
        if (!jaExiste) {
          itensSub = [...itensSub, item];
          servico.subtitulos.set(nomeSubtitulo, itensSub);
        }
        lastRowWasItem = true;
      }
    }

    const servicosImportados: ServicoPadrao[] = Array.from(servicosMap.entries())
      .filter(([, v]) => v.subtitulos.size > 0)
      .map(([nome, v]) => ({
        id: crypto.randomUUID(),
        nome,
        subtitulos: Array.from(v.subtitulos.entries())
          .filter(([, itens]) => itens.length > 0)
          .map(([nomSub, itens]) => ({
            id: crypto.randomUUID(),
            nome: nomSub,
            itens
          }))
      }));

    if (servicosImportados.length === 0) {
      return {
        ok: false,
        message:
          'Nenhum serviço encontrado. Confira se há linhas de itens com ITEM (ex.: 1.1.1), CÓDIGO ou BANCO e DESCRIÇÃO, e títulos de serviço (nível 1 e 2) sem código.'
      };
    }
    const composicoesAnaliticas = parseComposicoesAnaliticasDaSegundaAba(workbook, servicosImportados);
    return { ok: true, servicos: servicosImportados, composicoesAnaliticas };
  } catch (err) {
    const detalhe = err instanceof Error ? err.message.trim() : '';
    if (detalhe) {
      console.error('Falha ao ler planilha de orçamento perfeito:', err);
      return {
        ok: false,
        message: `Não foi possível ler a planilha (${detalhe}). Verifique se o arquivo não está corrompido/protegido e se está em .xlsx, .xls ou .csv.`
      };
    }
    return {
      ok: false,
      message: 'Erro ao processar o arquivo. Verifique se a planilha está válida e em .xlsx, .xls ou .csv.'
    };
  }
}

function chavesParaBusca(codigo: string, banco: string, chave: string): string[] {
  const c = String(codigo || '').trim();
  const b = String(banco || '').trim();
  const k = String(chave || '').trim();
  const codigoNorm = c.replace(/[\s.]+/g, '').toUpperCase();
  const bancoBase = b.split('/')[0]?.trim() || '';
  const bancoBaseNorm = bancoBase.replace(/[\s.]+/g, '').toUpperCase();
  const nk = normalizarChave(c, b);
  const uniq = new Set<string>();
  // `codigo+banco` primeiro: evita casar só o número com outra base no mapa (analítico trocado após F5).
  uniq.add(nk);
  const kNorm = k.replace(/[\s.]+/g, '').toUpperCase();
  const chaveLegadaSoCodigo = Boolean(k && codigoNorm && kNorm === codigoNorm);
  if (k && k !== nk && !chaveLegadaSoCodigo) uniq.add(k);
  uniq.add(`${c}${b}`.replace(/[\s.]+/g, '')); // sem pontos/espaços (ex: 1680097FDE)
  uniq.add(`${c}_${b}`);
  uniq.add(`${c}-${b}`);
  if (c && bancoBase && bancoBase !== b) {
    uniq.add(normalizarChave(c, bancoBase));
    uniq.add(`${c}${bancoBase}`.replace(/[\s.]+/g, ''));
    uniq.add(`${c}_${bancoBase}`);
    uniq.add(`${c}-${bancoBase}`);
  }
  if (codigoNorm && bancoBaseNorm) {
    uniq.add(`${codigoNorm}${bancoBaseNorm}`);
  }
  if (codigoNorm && !b) {
    uniq.add(codigoNorm);
  }
  return Array.from(uniq);
}

function contagemAnaliticoComposicao(c: ComposicaoItem): number {
  return c.analiticoLinhas?.length ?? 0;
}

/** Evita que alias genéricos (ex.: só dígitos) troquem a composição certa por outra sem analítico. */
function escolherComposicaoParaChaveMapa(prev: ComposicaoItem, next: ComposicaoItem): ComposicaoItem {
  const np = contagemAnaliticoComposicao(prev);
  const nn = contagemAnaliticoComposicao(next);
  if (nn > np) return next;
  if (nn < np) return prev;
  return prev;
}

/** Catálogo global ou snapshot gravado na linha do orçamento (prioridade ao snapshot). */
function composicaoResolvidaDoItemServico(
  item: ItemServico,
  mapa: Record<string, ComposicaoItem>
): ComposicaoItem | null {
  if (item.analiticoLinhas && item.analiticoLinhas.length > 0) {
    return {
      codigo: item.codigo,
      banco: item.banco,
      chave: item.chave,
      descricao: item.descricao,
      precoUnitario: item.precoUnitario ?? 0,
      maoDeObraUnitario: item.maoDeObraUnitario,
      materialUnitario: item.materialUnitario,
      unidade: item.unidade,
      analiticoLinhas: item.analiticoLinhas
    };
  }
  const chaves = chavesParaBusca(item.codigo, item.banco, item.chave);
  for (const k of chaves) {
    const c = mapa[k];
    if (c) return c;
  }
  return null;
}

/** Converte UND da planilha (M, M², M2, M³, M3, M^3, M**3, UN, …) para TipoUnidadeFormula */
function parseUnidadeComposicao(und: string | undefined): TipoUnidadeFormula | null {
  if (!und || !String(und).trim()) return null;
  let u = String(und).toUpperCase().replace(/\s/g, '').replace(/²/g, '2').replace(/³/g, '3');
  u = u.replace(/\^/g, '').replace(/\*+/g, '');
  if (u === 'M3' || u.includes('CUBIC')) return 'm3';
  if (u === 'M2' || u.includes('QUADRAD')) return 'm2';
  if (u === 'M' || u === 'MT' || u === 'METRO' || u === 'METROS') return 'm';
  if (u === 'UN' || u === 'UND' || u === 'UNID' || u.includes('UNIDADE')) return 'un';
  return null;
}

/** Exibe unidade como m³ / m² / m / UN (igual à memória e à carga; M^3 do cadastro vira m³). */
function unidadeComposicaoParaExibicao(und: string | undefined, tipoFallback: TipoUnidadeFormula): string {
  const parsed = parseUnidadeComposicao(und);
  const t = parsed ?? (tipoFallback !== 'un' ? tipoFallback : null);
  if (t === 'm3') return 'm³';
  if (t === 'm2') return 'm²';
  if (t === 'm') return 'm';
  if (t === 'un') return 'UN';
  const raw = und?.trim();
  if (raw) return raw;
  return tipoFallback === 'm3' ? 'm³' : tipoFallback === 'm2' ? 'm²' : tipoFallback === 'm' ? 'm' : 'UN';
}

/** Verifica se a descrição indica item de demolição, remoção, retirada ou escavação (vai para carga manual de entulho). */
function ehItemDemolicaoOuRemocao(descricao: string | undefined): boolean {
  if (!descricao) return false;
  const d = normalizarTextoBusca(descricao);
  return (
    d.includes('demolicao') || d.includes('demolicoes') ||
    d.includes('remocao') || d.includes('remocoes') ||
    d.includes('retirada') || d.includes('retiradas') ||
    d.includes('escavacao') || d.includes('escavacoes')
  );
}

/** Verifica se a descrição indica composição de Carga Manual de Entulho */
function ehComposicaoCargaEntulho(descricao: string | undefined): boolean {
  if (!descricao) return false;
  const d = normalizarTextoBusca(descricao);
  return d.includes('carga') && d.includes('entulho') && (d.includes('caminhao') || d.includes('basculante'));
}

/** Verifica se a descrição indica composição de caçamba de 4m³ para entulho */
function ehComposicaoCacamba4m3(descricao: string | undefined): boolean {
  if (!descricao) return false;
  const d = normalizarTextoBusca(descricao).replace(/\s/g, '');
  return d.includes('cacamba') && d.includes('entulho') && (d.includes('4m3') || d.includes('4m³'));
}

type AppendComposicaoAoSubtituloResult =
  | { ok: true; next: ServicoPadrao[] }
  | { ok: false; reason: 'no-subtitle' | 'duplicate' };

/** Uma etapa de inclusão no subtítulo; encadear com o estado mais recente ao adicionar vários itens de uma vez. */
function appendComposicaoItemAoSubtitulo(
  servicos: ServicoPadrao[],
  servicoId: string,
  subtituloId: string,
  item: ComposicaoItem,
  catalogoComposicoes: ComposicaoItem[]
): AppendComposicaoAoSubtituloResult {
  const svc = servicos.find(s => s.id === servicoId);
  const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);
  if (!sub) return { ok: false, reason: 'no-subtitle' };
  const existe = sub.itens.some(
    i => i.chave === item.chave || (i.codigo === item.codigo && i.banco === item.banco)
  );
  if (existe) return { ok: false, reason: 'duplicate' };

  const novoItem: ItemServico = {
    chave: item.chave || normalizarChave(item.codigo, item.banco),
    codigo: item.codigo,
    banco: item.banco,
    descricao: item.descricao
  };
  if (item.precoUnitario != null && Number.isFinite(item.precoUnitario)) {
    novoItem.precoUnitario = item.precoUnitario;
  }
  if (item.maoDeObraUnitario != null && Number.isFinite(item.maoDeObraUnitario)) {
    novoItem.maoDeObraUnitario = item.maoDeObraUnitario;
  }
  if (item.materialUnitario != null && Number.isFinite(item.materialUnitario)) {
    novoItem.materialUnitario = item.materialUnitario;
  }
  const und = item.unidade != null ? String(item.unidade).trim() : '';
  if (und) novoItem.unidade = und;
  if (item.analiticoLinhas && item.analiticoLinhas.length > 0) {
    novoItem.analiticoLinhas = item.analiticoLinhas;
  }
  let updated = servicos.map(s => {
    if (s.id !== servicoId) return s;
    return {
      ...s,
      subtitulos: s.subtitulos.map(sb =>
        sb.id === subtituloId ? { ...sb, itens: [...sb.itens, novoItem] } : sb
      )
    };
  });
  if (ehItemDemolicaoOuRemocao(item.descricao)) {
    const cargaEntulho = catalogoComposicoes.find(c => ehComposicaoCargaEntulho(c.descricao));
    if (cargaEntulho) {
      const subAtualizado = updated.find(s => s.id === servicoId)?.subtitulos.find(sb => sb.id === subtituloId);
      const cargaJaExiste = subAtualizado?.itens.some(
        i =>
          i.chave === cargaEntulho.chave ||
          (i.codigo === cargaEntulho.codigo && i.banco === cargaEntulho.banco)
      );
      if (!cargaJaExiste) {
        const itemCarga: ItemServico = {
          chave: cargaEntulho.chave || normalizarChave(cargaEntulho.codigo, cargaEntulho.banco),
          codigo: cargaEntulho.codigo,
          banco: cargaEntulho.banco,
          descricao: cargaEntulho.descricao
        };
        updated = updated.map(s => {
          if (s.id !== servicoId) return s;
          return {
            ...s,
            subtitulos: s.subtitulos.map(sb =>
              sb.id === subtituloId ? { ...sb, itens: [...sb.itens, itemCarga] } : sb
            )
          };
        });
      }
    }
  }
  return { ok: true, next: updated };
}

/** Fator (40%) aplicado ao valor unit. estimado e ao custo estimado na planilha analítica. */
const PLANILHA_FATOR_CUSTO_ESTIMADO = 0.4;

/** Largura estável para colunas «R$ + valor» (planilha «Valor unit. real», analítico insumo manual). */
const GRADE_COL_MOEDA_UNIT =
  'w-[7.5rem] min-w-[7.5rem] max-w-[8rem] whitespace-nowrap';

/** Textos de ajuda (title): como cada campo da planilha analítica é obtido ou calculado. */
const PLANILHA_ANALITICA_TOOLTIP = {
  item: 'Numeração hierárquica do item no orçamento (estrutura em níveis do serviço).',
  codigo: 'Código do item na tabela de preços ou na composição.',
  banco: 'Origem do banco de preços (ex.: FDE, SEINFRA).',
  servico: 'Descrição do serviço ou do insumo.',
  un: 'Unidade de medida do item.',
  quantidadeComp:
    'Quantidade da composição no orçamento (quantidade de serviço a executar / medir).',
  quantidadeInsumo:
    'Quantidade total no orçamento do insumo: quantidade da composição × consumo unitário do insumo na composição analítica.',
  valorUnitOrcComp:
    'Valor unitário médio da composição: total de orçamento da linha ÷ quantidade da composição (quando aplicável).',
  valorUnitOrcInsumo: 'Valor unitário de referência do insumo no orçamento (composição analítica / banco).',
  totalOrcComp: 'Total de orçamento da composição: quantidade × valor unitário (total da linha no orçamento).',
  totalOrcInsumo: 'Total no orçamento: quantidade × valor unitário de orçamento.',
  qtdCompraComp:
    'Na composição, a quantidade de compra é informada por insumo nas linhas abaixo; esta célula fica vazia.',
  qtdCompraInsumo:
    'Quantidade comprada ou solicitada para o insumo (valor digitado e salvo por linha; base para custos e %).',
  qtdSobraComp:
    'Na composição, a sobra é calculada por insumo nas linhas abaixo; esta célula fica vazia.',
  qtdSobraInsumo:
    'Diferença entre quantidade do orçamento e quantidade comprada/solicitada (quantidade orçamento - quantidade compra).',
  valorUnitEstComp:
    'Na composição não há um único valor unitário estimado; o custo estimado é a soma nos insumos.',
  valorUnitEstInsumo: `Valor unitário estimado: valor unitário orçamento × ${PLANILHA_FATOR_CUSTO_ESTIMADO * 100}% (referência de custo).`,
  custoEstComp: `Custo estimado agregado: soma nos insumos de (quantidade compra × valor unit. orçamento × ${PLANILHA_FATOR_CUSTO_ESTIMADO * 100}%), onde houver quantidade compra.`,
  custoEstInsumo: `Custo estimado: quantidade compra × valor unitário orçamento × ${PLANILHA_FATOR_CUSTO_ESTIMADO * 100}%.`,
  vlCompraRealComp:
    'Soma simples dos valores unitários de compra real informados nos insumos (referência na linha da composição).',
  vlCompraRealInsumo: 'Valor unitário efetivo da compra (valor digitado por linha).',
  custoCompraRealComp:
    'Soma dos custos reais dos insumos: para cada insumo com qtd e valor unitário real, quantidade compra × valor unitário compra real.',
  custoCompraRealInsumo: 'Custo real: quantidade compra × valor unitário compra real.',
  pctLevComp:
    'Composição: (Σ quantidade compra dos insumos ÷ Σ quantidade orçamento dos insumos) × 100. Indica o quanto da quantidade orçada foi coberta pela compra.',
  pctLevInsumo: 'Insumo: (quantidade compra ÷ quantidade orçamento) × 100.',
  pctPuComp:
    'Composição: média ponderada — Σ(qtd compra × vl compra real) ÷ Σ(qtd compra × vl orçamento) × 100 (onde houver dados).',
  pctPuInsumo: 'Insumo: (valor unitário compra real ÷ valor unitário orçamento) × 100.',
  pctFatComp:
    'Composição: (preço compra real total ÷ valor total orçamento) × 100, sendo valor total orçamento a soma dos (qtd compra × vl orçamento) nos insumos.',
  pctFatInsumo:
    'Insumo: (preço compra real ÷ valor total orçamento) × 100, com valor total orçamento = quantidade compra × valor unitário orçamento.',
  pctCvpComp:
    'Composição: (preço compra real ÷ faturamento da composição em R$) × 100, sendo faturamento = quantidade da composição × valor unitário médio.',
  pctCvpInsumo:
    'Insumo: (preço compra real do insumo ÷ faturamento da composição pai em R$) × 100. Mostra a participação do custo pago no faturamento da composição.',
  tipo: 'Classificação do insumo (MA, MO, LO etc.) conforme categoria do item.',
  tipoCompLinha:
    'Linha de composição: não há tipo MA/MO/LO nesta linha (o tipo é exibido em cada insumo abaixo).',
  tituloServico: 'Título do serviço no orçamento (agrupa blocos abaixo).',
  subtituloBloco: 'Subtítulo / bloco de itens dentro do serviço.',
  exportPlanilha: 'Exporta esta planilha para Excel com as mesmas colunas e fórmulas exibidas.',
  theadQuantidade:
    'Composição: quantidade do serviço no orçamento. Insumo: quantidade total = qtd. da composição × consumo unitário do insumo na composição.',
  theadValorUnitOrc:
    'Composição: valor unitário médio (total ÷ quantidade). Insumo: valor unitário de referência do insumo no orçamento.',
  theadTotalOrc:
    'Composição: total de orçamento da linha. Insumo: quantidade × valor unitário de orçamento.',
  theadQtdCompra:
    'Coluna à esquerda do valor unitário real. Composição: preencha a quantidade em cada insumo abaixo. Insumo: quantidade comprada ou solicitada (editável).',
  theadSobra:
    'Diferença entre quantidade do orçamento e quantidade compra. Valor negativo indica compra acima do orçamento.',
  theadValorUnitEst:
    'Composição: sem valor unitário único. Insumo: valor unitário orçamento × 40%.',
  theadCustoEst:
    'Composição: soma nos insumos de (qtd compra × vl orçamento × 40%). Insumo: qtd compra × vl orçamento × 40%.',
  theadVlCompraReal:
    'Composição: soma simples dos valores unitários reais dos insumos. Insumo: valor unitário de compra real (editável).',
  theadCustoCompraReal:
    'Composição: soma dos (qtd compra × vl real) dos insumos. Insumo: qtd compra × vl compra real.',
  theadPctLev:
    'Composição: (Σ qtd compra ÷ Σ qtd orçamento) × 100 nos insumos. Insumo: (qtd compra ÷ qtd orçamento) × 100.',
  theadPctPu:
    'Composição: Σ(qtd×vl real) ÷ Σ(qtd×vl orçamento) × 100. Insumo: (vl compra real ÷ vl orçamento) × 100.',
  theadPctFat:
    'Composição: (preço compra real total ÷ valor total orçamento) × 100. Insumo: (preço compra real ÷ valor total orçamento) × 100.',
  theadPctCvp:
    'Composição: (preço compra real ÷ faturamento da composição) × 100. Insumo: (preço compra real ÷ faturamento da composição pai) × 100.'
} as const;

function roundTo(n: number, decimals: number) {
  const d = Math.pow(10, decimals);
  return Math.round(n * d) / d;
}

function fmtCalcNumero(n: number, casas = 2) {
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

function fmtCalcMoeda(n: number) {
  return `R$ ${fmtCalcNumero(n, 2)}`;
}

type DetalheInsumoOrcSecao = {
  item: string;
  key: string;
  qtdOrc: number;
  valorUnitOrc: number;
  custoOrc: number;
  custoEst: number;
  qtdCompra: number | undefined;
  valorUnitReal: number | undefined;
  custoReal: number;
};

/** Totais agregados por subtítulo (1.x) ou por composição (1.x.y) para tooltips de linha de título/subtítulo. */
type DetalheAggSecao = {
  item: string;
  custoOrc: number;
  custoEst: number;
  custoReal: number;
  insumoKeys: string[];
  /** Chaves das linhas composição — realce nas colunas de custo orçamento / estimado / real (totais por linha). */
  composicaoKeys: string[];
};

function compararChaveItemNumero(a: string, b: string): number {
  const pa = a.split('.').map((x) => parseInt(x, 10) || 0);
  const pb = b.split('.').map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/** Realça a célula «Custo orçamento» de cada composição (ou insumo) cujo valor entra na soma. */
function hoverIdsAggCustoOrc(lista: DetalheAggSecao[]): string[] {
  return lista.flatMap((a) => {
    const keys = a.composicaoKeys.length > 0 ? a.composicaoKeys : a.insumoKeys;
    return keys.map((k) => `custo-orc-${k}`);
  });
}

function hoverIdsAggCustoEst(lista: DetalheAggSecao[]): string[] {
  return lista.flatMap((a) => {
    const keys = a.composicaoKeys.length > 0 ? a.composicaoKeys : a.insumoKeys;
    return keys.map((k) => `custo-est-${k}`);
  });
}

/** Mesma lógica de `hoverIdsAggCustoOrc`: realça a coluna «Custo real» de cada composição/insumo da soma. */
function hoverIdsAggCustoReal(lista: DetalheAggSecao[]): string[] {
  return lista.flatMap((a) => {
    const keys = a.composicaoKeys.length > 0 ? a.composicaoKeys : a.insumoKeys;
    return keys.map((k) => `custo-real-${k}`);
  });
}

const CLASSE_CELULA_HOVER_FONTE =
  'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400';

/**
 * Tooltip da linha do serviço (item 1): realça só as células de total de cada subtítulo (1.1, 1.2…),
 * não as composições (1.1.1…) abaixo.
 */
function hoverIdsTituloServicoPorBloco(
  lista: DetalheAggSecao[],
  col: 'orc' | 'est' | 'real'
): string[] {
  return lista.map((a) => {
    const partes = a.item.split('.');
    if (partes.length >= 2) {
      const m = partes[0];
      const s = partes[1];
      if (col === 'orc') return `custo-orc-bloco-${m}-${s}`;
      if (col === 'est') return `custo-est-bloco-${m}-${s}`;
      return `custo-real-bloco-${m}-${s}`;
    }
    const safe = String(a.item).replace(/\./g, '-');
    if (col === 'orc') return `custo-orc-bloco-${safe}`;
    if (col === 'est') return `custo-est-bloco-${safe}`;
    return `custo-real-bloco-${safe}`;
  });
}

/** Exibição em planilha exportada (pt-BR). */
function formatarBRLExport(n: number) {
  return `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatarPesoPctExport(n: number) {
  return `${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** Estado vazio das abas derivadas do orçamento (sem itens na montagem). */
function OrcamentoSecaoVazia({
  titulo,
  texto,
  Icon,
  onIrOrcamento
}: {
  titulo: string;
  texto: string;
  Icon: React.ComponentType<{ className?: string }>;
  onIrOrcamento: () => void;
}) {
  return (
    <div role="status" className={ORCAMENTO_SECAO_VAZIA_SHELL}>
      <div className={`mb-5 ${ORCAMENTO_ICON_SOFT_BOX}`}>
        <Icon className={ORCAMENTO_ICON_SOFT_GLYPH} aria-hidden />
      </div>
      <h3 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-50">{titulo}</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">{texto}</p>
      <button
        type="button"
        onClick={onIrOrcamento}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-900/15 transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
      >
        <ListPlus className="h-4 w-4 shrink-0" aria-hidden />
        Ir para a aba Orçamento
      </button>
    </div>
  );
}

/** Colunas em R$: símbolo à esquerda e valor numérico à direita na mesma célula. */
function MoedaCelula({
  valor,
  className,
  valorClassName,
  simboloClassName
}: {
  valor: number;
  className?: string;
  valorClassName?: string;
  simboloClassName?: string;
}) {
  const formatted = Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const titulo = `R$ ${formatted}`;
  return (
    <div
      className={`flex w-full min-w-0 max-w-full items-baseline justify-between gap-1.5 overflow-hidden tabular-nums ${className ?? ''}`}
      title={titulo}
    >
      <span className={`shrink-0 ${simboloClassName ?? ''}`}>R$</span>
      <span className={`min-w-0 flex-1 truncate text-right ${valorClassName ?? ''}`}>{formatted}</span>
    </div>
  );
}

/** Realce de células relacionadas ao passar o mouse (sem popup de tooltip). */
function CalcHoverBridge({
  children,
  hoverSourceIds,
  onHoverSourcesChange
}: {
  children: React.ReactNode;
  hoverSourceIds?: string[];
  onHoverSourcesChange?: (ids: string[]) => void;
}) {
  if (!hoverSourceIds?.length || !onHoverSourcesChange) return <>{children}</>;
  return (
    <span
      className="block w-full min-w-0 max-w-full"
      onMouseEnter={() => onHoverSourcesChange(hoverSourceIds)}
      onMouseLeave={() => onHoverSourcesChange([])}
    >
      {children}
    </span>
  );
}

function hashStringToInt(s: string): number {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function gerarAnaliticoComposicaoUnit(materialTotal: number, maoTotal: number, seedKey: string): AnaliticoComposicao {
  const total = (materialTotal || 0) + (maoTotal || 0);
  if (total <= 0) return { total: 0, linhas: [] };

  const seed = hashStringToInt(seedKey);
  const rnd = (offset: number) => ((seed + offset * 997) % 1000) / 1000; // 0..1

  const materiais = ['Cimento', 'Areia', 'Brita', 'Aço CA-50', 'Argamassa', 'Tijolos', 'Concreto', 'Aditivo', 'Impermeabilizante', 'Forma'];
  const maos = ['Pedreiro', 'Servente', 'Armador', 'Carpinteiro', 'Encarregado', 'Ajudante', 'Montador'];

  const materialLinesCount = 1 + (seed % 3); // 1..3
  const maoLinesCount = 1 + ((seed >> 2) % 3); // 1..3

  const makeLines = (categoria: CategoriaAnalitico, totalCategoria: number, names: string[], count: number, unidadeFallback: string, offsetBase: number) => {
    if (totalCategoria <= 0) return [];
    const weights = Array.from({ length: count }).map((_, i) => 0.2 + rnd(offsetBase + i));
    const sumW = weights.reduce((a, b) => a + b, 0) || 1;

    // Quantidades "de tela": só para dar leitura ao analítico.
    const unidades = Array.from({ length: count }).map((_, i) => {
      const v = rnd(offsetBase + 100 + i);
      return unidadeFallback || (v > 0.6 ? 'un' : 'm²');
    });

    const lines: LinhaAnaliticoComposicao[] = [];
    let acumulado = 0;
    for (let i = 0; i < count; i++) {
      const peso = weights[i] / sumW;
      const linhaTotal = i === count - 1 ? (totalCategoria - acumulado) : totalCategoria * peso;
      acumulado += linhaTotal;

      const qtdMin = categoria === 'MÃO DE OBRA' ? 1 : 0.5;
      const qtdMax = categoria === 'MÃO DE OBRA' ? 40 : 25;
      const quantidade = roundTo(qtdMin + rnd(offsetBase + 200 + i) * (qtdMax - qtdMin), 2);
      const precoUnitario = quantidade > 0 ? linhaTotal / quantidade : 0;

      lines.push({
        categoria,
        descricao: names[(seed + i + offsetBase) % names.length],
        unidade: unidades[i],
        quantidade,
        precoUnitario,
        total: linhaTotal
      });
    }
    return lines;
  };

  const materialLines = makeLines('MATERIAL', materialTotal, materiais, materialLinesCount, 'un', 1);
  const maoLines = makeLines('MÃO DE OBRA', maoTotal, maos, maoLinesCount, 'h', 2);
  const linhas = [...materialLines, ...maoLines];

  const somaLinhas = linhas.reduce((acc, l) => acc + l.total, 0);
  const diff = total - somaLinhas;
  if (linhas.length > 0 && Math.abs(diff) > 0.00001) {
    linhas[linhas.length - 1].total += diff;
    const last = linhas[linhas.length - 1];
    if (last.quantidade > 0) last.precoUnitario = last.total / last.quantidade;
  }

  return { total, linhas };
}

/**
 * Apenas para composição caçamba 4m³ entulho: 2 insumos (servente + aluguel), com valores do próprio orçamento (MO/Material).
 * Ordem: SERVENTE (12 h) → ALUGUEL CAÇAMBA (1 m).
 */
function gerarAnaliticoCacamba4m3(materialUnit: number, maoUnit: number): AnaliticoComposicao {
  const mat = Number(materialUnit) || 0;
  const mo = Number(maoUnit) || 0;
  const total = mat + mo;
  if (total <= 0) return { total: 0, linhas: [] };

  const precoH = mo > 0 ? mo / 12 : 0;

  const linhas: LinhaAnaliticoComposicao[] = [
    {
      categoria: 'MÃO DE OBRA',
      codigo: '1.01.46',
      banco: 'FDE',
      tipoLabel: 'Mão de obra',
      descricao: 'SERVENTE',
      unidade: 'H',
      quantidade: 12,
      precoUnitario: precoH,
      total: mo
    },
    {
      categoria: 'MATERIAL',
      codigo: '8.01.02',
      banco: 'FDE',
      tipoLabel: 'Material',
      descricao: 'ALUGUEL CAÇAMBA 4M3',
      unidade: 'M',
      quantidade: 1,
      precoUnitario: mat,
      total: mat
    }
  ];

  return { total, linhas };
}

/** Checkbox do dropdown de serviços: caixa 20px, tema vermelho, suporta indeterminado. */
function ServicosDropdownCheckbox({
  id,
  checked,
  indeterminate,
  disabled,
  onChange,
  children,
  compact
}: {
  id?: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  children?: React.ReactNode;
  /** Linhas aninhadas (composições): padding menor */
  compact?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = Boolean(indeterminate);
  }, [indeterminate]);

  const filled = checked || Boolean(indeterminate);

  return (
    <label
      className={`group flex items-start gap-3 rounded-lg cursor-pointer transition-colors ${
        compact ? 'py-2 min-h-[2.5rem] px-2 -mx-2' : 'py-2.5 px-2 -mx-2'
      } hover:bg-gray-100/95 dark:hover:bg-gray-600/50 ${
        disabled ? 'opacity-45 cursor-not-allowed hover:bg-transparent' : ''
      }`}
    >
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all shadow-sm outline-none group-focus-within:ring-2 group-focus-within:ring-red-500/80 group-focus-within:ring-offset-2 ring-offset-white dark:ring-offset-gray-800 ${
          filled
            ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
            : 'border-gray-300 bg-white group-hover:border-red-400 dark:border-gray-500 dark:bg-gray-800 dark:group-hover:border-red-400/70'
        }`}
        aria-hidden
      >
        {checked && !indeterminate && (
          <svg className="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
        {indeterminate && (
          <svg className="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14" />
          </svg>
        )}
      </span>
      {children}
    </label>
  );
}

const ORCAMENTO_LISTA_MENU_WIDTH_PX = 224;

export function OrcamentoPageView({
  lockedCostCenterId = null,
  embeddedContractId = null,
  embeddedOrcamentoIdFromRoute = null
}: OrcamentoPageProps = {}) {
  const router = useRouter();
  const { costCenters, isLoading: loadingCentros } = useCostCenters();
  const [centroCustoId, setCentroCustoId] = useState<string | null>(() => lockedCostCenterId ?? null);
  const [activeTab, setActiveTab] = useState<'importacoes' | 'orcamento'>('orcamento');
  const [composicoes, setComposicoes] = useState<ComposicaoItem[]>([]);
  const [servicos, setServicos] = useState<ServicoPadrao[]>([]);
  /** Evita falha em lote no Strict Mode: o updater de setServicos pode rodar 2× com o mesmo prev e marcar duplicata. */
  const servicosRef = useRef<ServicoPadrao[]>(servicos);
  servicosRef.current = servicos;
  /** Catálogo base do contrato (API); usado para listar todos os serviços no dropdown quando o doc. é importado. */
  const [servicosPadraoContrato, setServicosPadraoContrato] = useState<ServicoPadrao[]>([]);
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  /** Chaves `servicoId|subtituloId|chave` (ou `…|${DROPDOWN_BLOCO_SEM_ITENS}`) escolhidas no dropdown. */
  const [linhasSelecionadasDropdown, setLinhasSelecionadasDropdown] = useState<Set<string>>(new Set());
  const [subtitulosNoOrcamento, setSubtitulosNoOrcamento] = useState<string[]>([]);
  const [itensOcultosNoOrcamento, setItensOcultosNoOrcamento] = useState<string[]>([]);
  const [quantidadesPorItem, setQuantidadesPorItem] = useState<Record<string, number>>({});
  const [dimensoesPorItem, setDimensoesPorItem] = useState<Record<string, DimensoesItem>>({});
  const [planilhaQuantidadeCompra, setPlanilhaQuantidadeCompra] = useState<Record<string, number>>({});
  const [planilhaValorUnitCompraReal, setPlanilhaValorUnitCompraReal] = useState<Record<string, number>>({});
  const [planilhaTipoInsumo, setPlanilhaTipoInsumo] = useState<Record<string, 'MO' | 'MA' | 'LO'>>({});
  const [planilhaCompraDraft, setPlanilhaCompraDraft] = useState<Record<string, string>>({});
  const [fichaDemandaObservacoes, setFichaDemandaObservacoes] = useState<Record<string, string>>({});
  const [novoServicoNome, setNovoServicoNome] = useState('');
  const [showAddServico, setShowAddServico] = useState(false);
  const [isImportandoOrcamento, setIsImportandoOrcamento] = useState(false);
  const [servicosExpandidos, setServicosExpandidos] = useState<Set<string>>(new Set());
  const [loadingFromApi, setLoadingFromApi] = useState(false);

  // ── Orçafascio API ──────────────────────────────────────────────────────────
  const [orcafascioModalOpen, setOrcafascioModalOpen] = useState(false);
  const [orcafascioModalTab, setOrcafascioModalTab] = useState<'composicoes' | 'orcamentos'>('composicoes');
  const [orcafascioModalOrcamentosSearch, setOrcafascioModalOrcamentosSearch] = useState('');
  const [orcafascioOrcamentos, setOrcafascioOrcamentos] = useState<OrcafascioOrcamentoItem[] | null>(null);
  const [orcafascioOrcamentosLoading, setOrcafascioOrcamentosLoading] = useState(false);
  const [orcafascioOrcamentosPage, setOrcafascioOrcamentosPage] = useState(1);
  const [orcafascioOrcamentosTotal, setOrcafascioOrcamentosTotal] = useState<number | null>(null);
  const [orcafascioOrcamentoDetalhe, setOrcafascioOrcamentoDetalhe] = useState<OrcafascioOrcamentoItem | null>(null);
  /** Linhas de composição do orçamento (sintético com fallback para detalhe). */
  const [orcafascioOrcamentoComposicoes, setOrcafascioOrcamentoComposicoes] =
    useState<Record<string, unknown>[] | null>(null);
  const [orcafascioOrcamentoComposicoesLoading, setOrcafascioOrcamentoComposicoesLoading] = useState(false);
  /** Linhas do relatório analítico do orçamento. */
  const [orcafascioOrcamentoAnalitico, setOrcafascioOrcamentoAnalitico] =
    useState<Record<string, unknown>[] | null>(null);
  const [orcafascioOrcamentoAnaliticoLoading, setOrcafascioOrcamentoAnaliticoLoading] = useState(false);
  /** Ao clicar numa linha da lista: detalhe de composição do catálogo (insumos/serviços). */
  const [orcafascioOrcamentoLinhaCatalogo, setOrcafascioOrcamentoLinhaCatalogo] =
    useState<OrcafascioComposicaoDetalhe | null>(null);
  const [orcafascioOrcamentoLinhaCatalogoLoading, setOrcafascioOrcamentoLinhaCatalogoLoading] =
    useState(false);
  const [orcafascioOrcamentoLinhaChave, setOrcafascioOrcamentoLinhaChave] = useState<string | null>(null);
  const [orcafascioAddCompModalOpen, setOrcafascioAddCompModalOpen] = useState(false);
  const [orcafascioAddCompTargetBlocoKey, setOrcafascioAddCompTargetBlocoKey] = useState<string | null>(null);
  const [orcafascioAddCompSearch, setOrcafascioAddCompSearch] = useState('');
  const [orcafascioAddCompLoading, setOrcafascioAddCompLoading] = useState(false);
  const [orcafascioAddCompComposicoes, setOrcafascioAddCompComposicoes] = useState<Record<string, unknown>[]>([]);
  const [orcafascioAddCompAnalitico, setOrcafascioAddCompAnalitico] = useState<Record<string, unknown>[]>([]);
  const [orcafascioAddCompAddingKey, setOrcafascioAddCompAddingKey] = useState<string | null>(null);
  const [orcafascioAddCompSelecionadas, setOrcafascioAddCompSelecionadas] = useState<Set<string>>(new Set());
  const [novoBlocoModalOpen, setNovoBlocoModalOpen] = useState(false);
  const [novoBlocoModalMode, setNovoBlocoModalMode] = useState<'titulo' | 'subtitulo'>('titulo');
  const [novoBlocoModalServicoId, setNovoBlocoModalServicoId] = useState<string | null>(null);
  const [novoBlocoTituloNome, setNovoBlocoTituloNome] = useState('');
  const [novoBlocoSubtituloNome, setNovoBlocoSubtituloNome] = useState('');
  const [orcafascioSearch, setOrcafascioSearch] = useState('');
  const [orcafascioPage, setOrcafascioPage] = useState(1);
  const [orcafascioLoading, setOrcafascioLoading] = useState(false);
  const [orcafascioResultados, setOrcafascioResultados] = useState<OrcafascioListResponse<OrcafascioComposicaoListItem> | null>(null);
  const [orcafascioDetalhe, setOrcafascioDetalhe] = useState<OrcafascioComposicaoDetalhe | null>(null);
  /** Subpainel dentro do detalhe da composição: cartões ou tabela analítica (mesmos itens da API). */
  const [orcafascioComposicaoDetalheTab, setOrcafascioComposicaoDetalheTab] =
    useState<'itens' | 'analitico'>('itens');
  const [orcafascioDetalheLoading, setOrcafascioDetalheLoading] = useState(false);
  /** UF Sergipe — catálogo ORSE (find_by_code no backend usa SE por padrão). */
  const orcafascioUfOrse = 'SE';
  const [showServicosDropdown, setShowServicosDropdown] = useState(false);
  const [showContratoDropdown, setShowContratoDropdown] = useState(false);
  const [servicosSearch, setServicosSearch] = useState('');
  const [contratoSearch, setContratoSearch] = useState('');
  const [showDetalhesFinanceiros, setShowDetalhesFinanceiros] = useState(false);
  const servicosDropdownRef = useRef<HTMLDivElement | null>(null);
  const contratoDropdownRef = useRef<HTMLDivElement | null>(null);
  const contratoSearchInputRef = useRef<HTMLInputElement | null>(null);
  /** Tabela da aba Orçamento (montagem): listener nativo de contexto para vencer menu do browser em inputs/células. */
  const montagemOrcamentoTableRef = useRef<HTMLDivElement | null>(null);
  /** Input file na aba Importações (orçamento perfeito). */
  const importOrcamentoTabFileInputRef = useRef<HTMLInputElement | null>(null);
  const [importOrcamentoModalOpen, setImportOrcamentoModalOpen] = useState(false);
  const [importOrcamentoModalFile, setImportOrcamentoModalFile] = useState<File | null>(null);
  const [importOrcamentoModalDragging, setImportOrcamentoModalDragging] = useState(false);

  const filteredCostCenters = useMemo(() => {
    const q = contratoSearch.trim().toLowerCase();
    const list = costCenters ?? [];
    if (!q) return list;
    return list.filter((cc: { code?: string; name?: string }) => {
      const code = (cc.code ?? '').toLowerCase();
      const name = (cc.name ?? '').toLowerCase();
      return code.includes(q) || name.includes(q) || `${code} ${name}`.includes(q);
    });
  }, [costCenters, contratoSearch]);

  // Analítico (detalhamento) da composição para visualização/exportação.
  const [orcamentoViewTab, setOrcamentoViewTab] = useState<
    'dados' | 'montagem' | 'analitico' | 'memorial' | 'planilhaAnalitica'
  >('montagem');
  const [memorialItemKey, setMemorialItemKey] = useState<string | null>(null);
  // Cache do analítico por composição (por item) para não recalcular a cada clique.
  const [analiticoCache, setAnaliticoCache] = useState<Record<string, AnaliticoComposicao>>({});
  // Draft para campos que aceitam cálculos (2+3, 10/2, etc) - avalia no blur
  const [draftCalc, setDraftCalc] = useState<Record<string, string>>({});
  const [calcHoverSourceIds, setCalcHoverSourceIds] = useState<string[]>([]);
  const [insumosAnaliticoManuais, setInsumosAnaliticoManuais] = useState<Record<string, InsumoAnaliticoManual[]>>({});
  /** Menu botão direito — composição/insumo catálogo (adicionar manual + excluir composição) ou insumo manual (abaixo + excluir linha). */
  const [menuCtxAnalitico, setMenuCtxAnalitico] = useState<
    | { kind: 'composicao'; left: number; top: number; composicaoKey: string }
    | { kind: 'manual'; left: number; top: number; parentKey: string; insumoId: string; idx: number }
    | null
  >(null);
  /** Menu botão direito — aba Orçamento (montagem): apagar título do serviço, subtítulo ou composição. */
  const [menuCtxMontagem, setMenuCtxMontagem] = useState<
    | { kind: 'tituloServico'; left: number; top: number; servicoId: string }
    | { kind: 'subtitulo'; left: number; top: number; blocoKey: string }
    | { kind: 'composicao'; left: number; top: number; composicaoKey: string }
    | null
  >(null);
  const [orcamentoAtivoId, setOrcamentoAtivoId] = useState<string | null>(() =>
    embeddedContractId ? embeddedOrcamentoIdFromRoute ?? null : null
  );
  const [listaOrcamentos, setListaOrcamentos] = useState<{ id: string; nome: string; updatedAt: string }[]>([]);
  /** Com contrato fixo na rota, começa em “carregando” para não restaurar URL com lista ainda vazia no 1º efeito. */
  const [carregandoListaOrcamentos, setCarregandoListaOrcamentos] = useState(() => Boolean(lockedCostCenterId));
  const [nomeOrcamentoRascunho, setNomeOrcamentoRascunho] = useState('');
  const [orcamentosSearch, setOrcamentosSearch] = useState('');
  const [isCreatingOrcamento, setIsCreatingOrcamento] = useState(false);
  const [orcamentoListaActionMenu, setOrcamentoListaActionMenu] = useState<{
    orcamentoId: string;
    nome: string;
    top: number;
    left: number;
  } | null>(null);
  const [editarDadosOpen, setEditarDadosOpen] = useState(false);
  const [editarDadosDraft, setEditarDadosDraft] = useState<
    OrcamentoMeta & { nomeOrcamento: string }
  >({
    ...sessaoVazia().meta!,
    nomeOrcamento: ''
  });
  const sessaoRef = useRef<SessaoOrcamentoPersist>(sessaoVazia());
  const servicosImportsRef = useRef<{ servicos: ServicoPadrao[]; imports: ImportRecord[] }>({
    servicos: [],
    imports: []
  });
  const orcamentoAutosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveBaselineRef = useRef<{ orcamentoId: string | null; hadData: boolean }>({
    orcamentoId: null,
    hadData: false
  });
  const autosaveProtecaoAvisadaRef = useRef<string | null>(null);

  const embeddedOrcamentoBasePath = embeddedContractId
    ? `/ponto/contratos/${embeddedContractId}/orcamento`
    : null;

  const navigateEmbeddedOrcamentoPath = useCallback(
    (orcamentoId: string | null) => {
      if (!embeddedOrcamentoBasePath) return;
      const target = orcamentoId ? `${embeddedOrcamentoBasePath}/${orcamentoId}` : embeddedOrcamentoBasePath;
      router.replace(target, { scroll: false });
    },
    [embeddedOrcamentoBasePath, router]
  );

  useEffect(() => {
    if (!embeddedContractId || !centroCustoId) return;
    setOrcamentoAtivoId(embeddedOrcamentoIdFromRoute ?? null);
  }, [embeddedContractId, embeddedOrcamentoIdFromRoute, centroCustoId]);

  const filteredListaOrcamentos = useMemo(() => {
    const q = orcamentosSearch.trim().toLowerCase();
    if (!q) return listaOrcamentos;
    return listaOrcamentos.filter((o) => (o.nome || '').toLowerCase().includes(q));
  }, [listaOrcamentos, orcamentosSearch]);

  const historicoOrcamentoPerfeito = useMemo(
    () => imports.filter((imp) => imp.origem === 'orcamento-perfeito'),
    [imports]
  );

  useEffect(() => {
    if (!centroCustoId) return;
    const importsLimpos = imports.filter((imp) => imp.origem === 'orcamento-perfeito');
    if (importsLimpos.length === imports.length) return;
    setImports(importsLimpos);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(importsLimpos));
    }
    void saveServicosPadraoToApi(centroCustoId, { servicos: servicosPadraoContrato, imports: importsLimpos }).catch(() => {
      // Falha silenciosa: a limpeza local já evita a mistura na UI; sincroniza no próximo save bem-sucedido.
    });
  }, [centroCustoId, imports, servicosPadraoContrato]);

  /** Nome do contrato (centro de custo) selecionado — só o nome, sem código. */
  const rotuloContratoListaOrcamentos = useMemo(() => {
    if (!centroCustoId || !costCenters?.length) return null;
    const cc = costCenters.find((c: { id?: string }) => c.id === centroCustoId) as
      | { name?: string }
      | undefined;
    if (!cc) return null;
    const name = String(cc.name ?? '').trim();
    return name || null;
  }, [centroCustoId, costCenters]);

  const [meta, setMeta] = useState<OrcamentoMeta>(sessaoVazia().meta!);
  const [novoOrcamentoMetaOpen, setNovoOrcamentoMetaOpen] = useState(false);
  const [novoOrcamentoStep, setNovoOrcamentoStep] = useState<1 | 2 | 3>(1);
  const [novoOrcamentoMetaDraft, setNovoOrcamentoMetaDraft] = useState<OrcamentoMeta & { nomeOrcamento: string }>(
    () => ({ ...metaNovoOrcamentoPadrao(), nomeOrcamento: '' })
  );
  const [employeeOptions, setEmployeeOptions] = useState<EmployeeOption[]>([]);
  const [loadingEmployeeOptions, setLoadingEmployeeOptions] = useState(false);
  const [currentUserName, setCurrentUserName] = useState('');

  /**
   * Estrutura mesclada (catálogo + grupos só do documento) para resolver nomes de blocos,
   * labels e limpeza de chaves — não usar como lista do seletor “Adicionar serviços”.
   */
  const servicosParaDropdown = useMemo(() => {
    if (meta.importadoPlanilha) {
      return servicos;
    }
    if (servicosPadraoContrato.length > 0) {
      return mergeServicosPadraoComDocumentoImportado(servicosPadraoContrato, servicos);
    }
    return servicos;
  }, [meta.importadoPlanilha, servicosPadraoContrato, servicos]);

  /**
   * Só o catálogo do contrato (GET servicos-padrao). Nunca usar `servicos` do documento aqui:
   * senão títulos/subtítulos criados na montagem aparecem no seletor. Sem catálogo na API, lista fica vazia.
   * Só há “base” de orçamento perfeito com histórico (`origem: orcamento-perfeito`); serviços órfãos no JSON
   * sem import registrado não devem aparecer aqui (alinha com a aba Importações).
   */
  const servicosCatalogoDropdown = useMemo(() => {
    if (meta.importadoPlanilha) {
      return servicos;
    }
    if (historicoOrcamentoPerfeito.length === 0) {
      return [];
    }
    return servicosPadraoContrato;
  }, [meta.importadoPlanilha, servicosPadraoContrato, servicos, historicoOrcamentoPerfeito]);

  useEffect(() => {
    if (!orcamentoListaActionMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOrcamentoListaActionMenu(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [orcamentoListaActionMenu]);

  useEffect(() => {
    if (lockedCostCenterId) {
      setCentroCustoId(lockedCostCenterId);
      return;
    }
    if (costCenters?.length && !centroCustoId) {
      const first = costCenters.find((c: { id?: string }) => c.id);
      if (first?.id) setCentroCustoId(first.id);
    }
  }, [costCenters, centroCustoId, lockedCostCenterId]);

  useEffect(() => {
    let cancelled = false;
    const loadMetaFormOptions = async () => {
      setLoadingEmployeeOptions(true);
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();
        const [meRes, employeesRes] = await Promise.all([
          api.get('/auth/me'),
          api.get(`/payroll/employees?month=${month}&year=${year}&page=1&limit=500`)
        ]);
        if (cancelled) return;
        const userName = meRes?.data?.data?.name ? String(meRes.data.data.name) : '';
        setCurrentUserName(userName);
        const employees = Array.isArray(employeesRes?.data?.data?.employees)
          ? employeesRes.data.data.employees
          : [];
        const options = employees
          .map((e: any) => ({
            id: String(e?.id ?? ''),
            name: String(e?.name ?? '').trim()
          }))
          .filter((e: EmployeeOption) => e.id && e.name);
        const uniqueMap = new Map<string, EmployeeOption>();
        for (const e of options) {
          if (!uniqueMap.has(e.id)) uniqueMap.set(e.id, e);
        }
        setEmployeeOptions(
          Array.from(uniqueMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
        );
      } catch {
        if (!cancelled) {
          setEmployeeOptions([]);
        }
      } finally {
        if (!cancelled) setLoadingEmployeeOptions(false);
      }
    };
    void loadMetaFormOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Catálogo global (S3): depende do contrato e re-roda ao trocar orçamento.
   * Antes rodava só no mount — após F5 a API podia responder antes da sessão ou fora de ordem e o mapa ficava sem analítico.
   */
  useEffect(() => {
    if (!centroCustoId) return;
    let cancelled = false;
    fetchComposicoesGeral().then((items) => {
      if (cancelled) return;
      setComposicoes(Array.isArray(items) ? items : []);
    });
    return () => {
      cancelled = true;
    };
  }, [centroCustoId, orcamentoAtivoId]);

  useEffect(() => {
    if (!centroCustoId) {
      setListaOrcamentos([]);
      setOrcamentoAtivoId(null);
      setServicos([]);
      setImports([]);
      return;
    }
    if (!embeddedContractId) {
      setOrcamentoAtivoId(null);
    }
    setServicos([]);
    setImports(loadImports(centroCustoId));
    let cancelled = false;
    setCarregandoListaOrcamentos(true);
    fetchOrcamentosLista(centroCustoId)
      .then(data => {
        if (cancelled) return;
        setListaOrcamentos(data.orcamentos);
      })
      .catch(() => {
        if (!cancelled) toast.error('Não foi possível carregar a lista de orçamentos.');
      })
      .finally(() => {
        if (!cancelled) setCarregandoListaOrcamentos(false);
      });
    return () => {
      cancelled = true;
    };
  }, [centroCustoId, embeddedContractId]);

  useEffect(() => {
    if (!orcamentoAtivoId || !embeddedContractId) return;
    const meta = listaOrcamentos.find(o => o.id === orcamentoAtivoId);
    if (meta?.nome) setNomeOrcamentoRascunho(meta.nome);
  }, [orcamentoAtivoId, listaOrcamentos, embeddedContractId]);

  /** Com contrato selecionado e sem orçamento aberto: lista de documentos vem do armazenamento compartilhado (API + local). */
  useEffect(() => {
    if (!centroCustoId || orcamentoAtivoId) return;
    let cancelled = false;
    fetchServicosPadraoFromApi(centroCustoId).then(padrao => {
      if (cancelled || !padrao) return;
      setImports(padrao.imports);
      try {
        localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(padrao.imports));
      } catch {
        /* quota */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [centroCustoId, orcamentoAtivoId]);

  useEffect(() => {
    if (!centroCustoId || !orcamentoAtivoId) return;
    let cancelled = false;
    setLoadingFromApi(true);
    setServicos([]);
    setImports([]);
    setSubtitulosNoOrcamento([]);
    setItensOcultosNoOrcamento([]);
    setLinhasSelecionadasDropdown(new Set());
    setQuantidadesPorItem({});
    setDimensoesPorItem({});
    setPlanilhaQuantidadeCompra({});
    setPlanilhaValorUnitCompraReal({});
    setPlanilhaTipoInsumo({});
    setPlanilhaCompraDraft({});
    setShowDetalhesFinanceiros(false);
    setServicosPadraoContrato([]);

    const aplicarSessao = (s: SessaoOrcamentoPersist | null) => {
      if (!s) return;
      setSubtitulosNoOrcamento(s.subtitulosNoOrcamento);
      setItensOcultosNoOrcamento(
        Array.isArray(s.itensOcultosNoOrcamento) ? s.itensOcultosNoOrcamento : []
      );
      setQuantidadesPorItem(s.quantidadesPorItem);
      setDimensoesPorItem(s.dimensoesPorItem);
      setPlanilhaQuantidadeCompra(s.planilhaQuantidadeCompra ?? {});
      setPlanilhaValorUnitCompraReal(s.planilhaValorUnitCompraReal ?? {});
      setPlanilhaTipoInsumo(normalizarPlanilhaTipoInsumo(s.planilhaTipoInsumo as Record<string, unknown>));
      setPlanilhaCompraDraft({});
      setShowDetalhesFinanceiros(s.showDetalhesFinanceiros);
      setMeta(s.meta ? s.meta : sessaoVazia().meta!);
    };

    const oid = orcamentoAtivoId;

    fetchOrcamentoDetail(centroCustoId, oid).then(async (apiData) => {
      if (cancelled) return;
      if (apiData) {
        const servicosDoOrcamento = Array.isArray(apiData.servicos) ? apiData.servicos : [];
        const importsDoOrcamento = Array.isArray(apiData.imports) ? apiData.imports : [];
        const sessaoApi = apiData.sessaoOrcamento ?? loadSessaoOrcamento(centroCustoId, oid);
        const importado = sessaoApi?.meta?.importadoPlanilha === true;

        if (importado) {
          const padraoContrato = await fetchServicosPadraoFromApi(centroCustoId);
          if (cancelled) return;
          const catalogoContrato =
            Array.isArray(padraoContrato?.servicos) && padraoContrato.servicos.length > 0
              ? padraoContrato.servicos
              : servicosDoOrcamento;
          setServicosPadraoContrato(catalogoContrato);
          const doc = sessaoApi?.servicosDocumento;
          const rootDoc =
            servicosDoOrcamento.length > 0 &&
            !arvoreServicosPareceCatalogoContrato(servicosDoOrcamento, catalogoContrato)
              ? servicosDoOrcamento
              : null;
          if (Array.isArray(doc) && doc.length > 0) {
            setServicos(doc);
            saveServicos(centroCustoId, doc);
            setServicosExpandidos(new Set([doc[0].id]));
          } else if (rootDoc) {
            setServicos(rootDoc);
            saveServicos(centroCustoId, rootDoc);
            setServicosExpandidos(new Set([rootDoc[0].id]));
          } else {
            const local = loadServicos(centroCustoId);
            if (local.length > 0) {
              setServicos(local);
              setServicosExpandidos(new Set([local[0].id]));
            } else {
              const padrao = await fetchServicosPadraoFromApi(centroCustoId);
              if (cancelled) return;
              if (padrao?.servicos?.length) {
                setServicos(padrao.servicos);
                saveServicos(centroCustoId, padrao.servicos);
                setServicosExpandidos(new Set([padrao.servicos[0].id]));
              } else {
                setServicos([]);
              }
            }
          }
        } else {
          const padraoContrato = await fetchServicosPadraoFromApi(centroCustoId);
          if (cancelled) return;
          setServicosPadraoContrato(
            Array.isArray(padraoContrato?.servicos) && padraoContrato.servicos.length > 0
              ? padraoContrato.servicos
              : []
          );
          if (servicosDoOrcamento.length > 0) {
            setServicos(servicosDoOrcamento);
            saveServicos(centroCustoId, servicosDoOrcamento);
            setServicosExpandidos(new Set([servicosDoOrcamento[0].id]));
          } else {
            setServicos([]);
            setServicosExpandidos(new Set());
          }
        }

        setImports(importsDoOrcamento);
        localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(importsDoOrcamento));
        aplicarSessao(sessaoApi);
        let sessaoFinal: SessaoOrcamentoPersist | null = sessaoApi;
        const docLen = Array.isArray(sessaoApi?.servicosDocumento) ? sessaoApi!.servicosDocumento!.length : 0;
        const carregadoTemDados =
          servicosDoOrcamento.length > 0 ||
          importsDoOrcamento.length > 0 ||
          sessaoTemDados(sessaoApi) ||
          (importado && docLen > 0);
        let recuperadoDoSnapshot = false;
        if (!carregadoTemDados) {
          const snapshot = getLatestUsefulSnapshot(centroCustoId, oid);
          if (snapshot) {
            setServicos(Array.isArray(snapshot.servicos) ? snapshot.servicos : []);
            setImports(Array.isArray(snapshot.imports) ? snapshot.imports : []);
            aplicarSessao(snapshot.sessaoOrcamento ?? null);
            sessaoFinal = snapshot.sessaoOrcamento ?? null;
            recuperadoDoSnapshot = true;
            const padSnap = await fetchServicosPadraoFromApi(centroCustoId);
            if (!cancelled && padSnap?.servicos?.length) setServicosPadraoContrato(padSnap.servicos);
            toast.error(
              `Recuperação automática aplicada a partir do backup local de ${new Date(snapshot.createdAt).toLocaleString('pt-BR')}.`
            );
          }
        }
        autosaveBaselineRef.current = {
          orcamentoId: oid,
          hadData: carregadoTemDados || recuperadoDoSnapshot
        };
        autosaveProtecaoAvisadaRef.current = null;
      } else {
        const sessaoLocal = loadSessaoOrcamento(centroCustoId, oid);
        const importadoLocal = sessaoLocal?.meta?.importadoPlanilha === true;
        const svcs = importadoLocal ? loadServicos(centroCustoId) : [];
        setServicos(svcs);
        setImports(loadImports(centroCustoId));
        if (svcs.length > 0) setServicosExpandidos(new Set([svcs[0].id]));
        aplicarSessao(sessaoLocal);
        let sessaoFinal: SessaoOrcamentoPersist | null = sessaoLocal;
        const padOffline = await fetchServicosPadraoFromApi(centroCustoId);
        if (!cancelled && padOffline?.servicos?.length) {
          setServicosPadraoContrato(padOffline.servicos);
        } else if (!cancelled) {
          setServicosPadraoContrato([]);
        }
        const docLoc = Array.isArray(sessaoLocal?.servicosDocumento) ? sessaoLocal!.servicosDocumento!.length : 0;
        const carregadoTemDados = svcs.length > 0 || sessaoTemDados(sessaoLocal) || (importadoLocal && docLoc > 0);
        let recuperadoDoSnapshot = false;
        if (!carregadoTemDados) {
          const snapshot = getLatestUsefulSnapshot(centroCustoId, oid);
          if (snapshot) {
            setServicos(Array.isArray(snapshot.servicos) ? snapshot.servicos : []);
            setImports(Array.isArray(snapshot.imports) ? snapshot.imports : []);
            aplicarSessao(snapshot.sessaoOrcamento ?? null);
            sessaoFinal = snapshot.sessaoOrcamento ?? null;
            recuperadoDoSnapshot = true;
            const padSnap2 = await fetchServicosPadraoFromApi(centroCustoId);
            if (!cancelled && padSnap2?.servicos?.length) setServicosPadraoContrato(padSnap2.servicos);
            toast.error(
              `Recuperação automática aplicada a partir do backup local de ${new Date(snapshot.createdAt).toLocaleString('pt-BR')}.`
            );
          }
        }
        autosaveBaselineRef.current = {
          orcamentoId: oid,
          hadData: carregadoTemDados || recuperadoDoSnapshot
        };
        autosaveProtecaoAvisadaRef.current = null;
      }
      setLoadingFromApi(false);
    });
    return () => {
      cancelled = true;
      setLoadingFromApi(false);
    };
  }, [centroCustoId, orcamentoAtivoId]);

  useEffect(() => {
    sessaoRef.current = {
      subtitulosNoOrcamento,
      quantidadesPorItem,
      dimensoesPorItem,
      planilhaQuantidadeCompra,
      planilhaValorUnitCompraReal,
      planilhaTipoInsumo,
      showDetalhesFinanceiros,
      meta,
      itensOcultosNoOrcamento
    };
    servicosImportsRef.current = { servicos, imports };
    if (centroCustoId && orcamentoAtivoId) {
      try {
        localStorage.setItem(storageKey(centroCustoId, 'sessao', orcamentoAtivoId), JSON.stringify(sessaoRef.current));
      } catch {
        /* quota */
      }
    }
  }, [
    centroCustoId,
    orcamentoAtivoId,
    subtitulosNoOrcamento,
    quantidadesPorItem,
    dimensoesPorItem,
    planilhaQuantidadeCompra,
    planilhaValorUnitCompraReal,
    planilhaTipoInsumo,
    showDetalhesFinanceiros,
    meta,
    itensOcultosNoOrcamento,
    servicos,
    imports
  ]);

  /** Salva montagem + planilha analítica no servidor após pausa na edição (sem alterar revisão/data de envio). */
  useEffect(() => {
    const ORCAMENTO_AUTOSAVE_MS = 900;
    if (!centroCustoId || !orcamentoAtivoId || loadingFromApi) return;

    if (orcamentoAutosaveTimerRef.current) clearTimeout(orcamentoAutosaveTimerRef.current);
    orcamentoAutosaveTimerRef.current = setTimeout(() => {
      orcamentoAutosaveTimerRef.current = null;
      const { servicos: s, imports: i } = servicosImportsRef.current;
      const sessaoAtual = sessaoRef.current;
      const atualTemDados =
        s.length > 0 ||
        i.length > 0 ||
        sessaoAtual.subtitulosNoOrcamento.length > 0 ||
        (sessaoAtual.itensOcultosNoOrcamento ?? []).length > 0 ||
        Object.keys(sessaoAtual.quantidadesPorItem).length > 0 ||
        Object.keys(sessaoAtual.dimensoesPorItem).length > 0 ||
        Object.keys(sessaoAtual.planilhaQuantidadeCompra ?? {}).length > 0 ||
        Object.keys(sessaoAtual.planilhaValorUnitCompraReal ?? {}).length > 0;

      const baseline = autosaveBaselineRef.current;
      const bloquearSobrescritaVazia =
        baseline.orcamentoId === orcamentoAtivoId &&
        baseline.hadData &&
        !atualTemDados;

      if (bloquearSobrescritaVazia) {
        if (autosaveProtecaoAvisadaRef.current !== orcamentoAtivoId) {
          autosaveProtecaoAvisadaRef.current = orcamentoAtivoId;
          toast.error('Proteção ativada: salvamento automático bloqueado para evitar sobrescrever orçamento com dados vazios.');
        }
        console.warn('Autosave bloqueado para evitar sobrescrita vazia do orçamento.', {
          orcamentoId: orcamentoAtivoId
        });
        return;
      }

      if (baseline.orcamentoId === orcamentoAtivoId && atualTemDados) {
        autosaveBaselineRef.current = { ...baseline, hadData: true };
        const snapPayload = montarPayloadSalvarOrcamento(s, i, sessaoAtual);
        saveOrcamentoSnapshot(centroCustoId, orcamentoAtivoId, {
          servicos: s,
          imports: i,
          sessaoOrcamento: (snapPayload.sessaoOrcamento ?? sessaoAtual) as SessaoOrcamentoPersist
        });
      }
      saveOrcamentoToApi(
        centroCustoId,
        orcamentoAtivoId,
        montarPayloadSalvarOrcamento(s, i, sessaoRef.current)
      ).catch(err => console.warn('Erro ao salvar orçamento no servidor:', err));
    }, ORCAMENTO_AUTOSAVE_MS);

    return () => {
      if (orcamentoAutosaveTimerRef.current) {
        clearTimeout(orcamentoAutosaveTimerRef.current);
        orcamentoAutosaveTimerRef.current = null;
      }
    };
  }, [
    centroCustoId,
    orcamentoAtivoId,
    loadingFromApi,
    subtitulosNoOrcamento,
    quantidadesPorItem,
    dimensoesPorItem,
    planilhaQuantidadeCompra,
    planilhaValorUnitCompraReal,
    planilhaTipoInsumo,
    showDetalhesFinanceiros,
    meta,
    itensOcultosNoOrcamento,
    servicos,
    imports
  ]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (servicosDropdownRef.current && !servicosDropdownRef.current.contains(e.target as Node)) {
        setShowServicosDropdown(false);
      }
      if (contratoDropdownRef.current && !contratoDropdownRef.current.contains(e.target as Node)) {
        setShowContratoDropdown(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  useEffect(() => {
    if (!showContratoDropdown) return;
    setContratoSearch('');
    const t = window.setTimeout(() => {
      contratoSearchInputRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [showContratoDropdown]);

  const refreshListaOrcamentos = async () => {
    if (!centroCustoId) return;
    try {
      const d = await fetchOrcamentosLista(centroCustoId);
      setListaOrcamentos(d.orcamentos);
    } catch {
      /* ignora */
    }
  };

  const persistToApi = (
    s: ServicoPadrao[],
    i: ImportRecord[],
    sessaoOverride?: SessaoOrcamentoPersist | null
  ) => {
    if (!centroCustoId || !orcamentoAtivoId) return;
    const sessao =
      (sessaoOverride !== undefined ? sessaoOverride : sessaoRef.current) ?? sessaoVazia();
    saveOrcamentoToApi(centroCustoId, orcamentoAtivoId, montarPayloadSalvarOrcamento(s, i, sessao)).catch(err => {
      console.warn('Erro ao salvar orçamento no servidor:', err);
      toast.error('Não foi possível salvar o orçamento no servidor. Verifique a conexão e tente de novo.');
    });
  };

  /** Remove um registro do histórico de importações (lista de documentos do contrato). */
  const removerImportDoHistorico = async (importId: string) => {
    if (!centroCustoId) return;
    if (!confirm('Remover este documento da lista de importações?')) return;
    const prev = imports;
    const next = imports.filter(i => i.id !== importId);
    setImports(next);
    try {
      localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(next));
    } catch {
      /* quota */
    }
    try {
      const atual = await fetchServicosPadraoFromApi(centroCustoId);
      const servicosPadraoBase =
        Array.isArray(atual?.servicos)
          ? atual!.servicos
          : (servicosPadraoContrato.length > 0 ? servicosPadraoContrato : servicos);
      const servicosPadrao = next.length === 0 ? [] : servicosPadraoBase;
      await saveServicosPadraoToApi(centroCustoId, { servicos: servicosPadrao, imports: next });
      if (orcamentoAtivoId) {
        persistToApi(servicos, next);
      }
      toast.success('Documento removido da lista.');
    } catch {
      setImports(prev);
      try {
        localStorage.setItem(storageKey(centroCustoId, 'imports'), JSON.stringify(prev));
      } catch {
        /* quota */
      }
      toast.error('Não foi possível remover no servidor. Tente novamente.');
    }
  };

  const voltarParaListaOrcamentos = () => {
    navigateEmbeddedOrcamentoPath(null);
    setOrcamentoAtivoId(null);
    setOrcamentoViewTab('montagem');
    setNomeOrcamentoRascunho('');
    setServicosPadraoContrato([]);
    refreshListaOrcamentos();
  };

  const criarNovoOrcamento = async () => {
    if (!centroCustoId) return;
    setNovoOrcamentoMetaDraft({ ...metaNovoOrcamentoPadrao(), nomeOrcamento: '' });
    setNovoOrcamentoStep(1);
    setNovoOrcamentoMetaOpen(true);
  };

  const confirmarCriacaoNovoOrcamento = async () => {
    if (!centroCustoId || isCreatingOrcamento) return;
    const nomeTrim = novoOrcamentoMetaDraft.nomeOrcamento.trim();
    if (!nomeTrim) {
      toast.error('Informe o nome do orçamento.');
      return;
    }
    const { nomeOrcamento: _omitNome, ...metaRest } = novoOrcamentoMetaDraft;
    const d = {
      ...metaRest,
      osNumeroPasta: novoOrcamentoMetaDraft.osNumeroPasta.trim(),
      responsavelOrcamento: novoOrcamentoMetaDraft.responsavelOrcamento.trim(),
      descricao: novoOrcamentoMetaDraft.descricao.trim(),
      orcamentoRealizadoPor: currentUserName || novoOrcamentoMetaDraft.orcamentoRealizadoPor.trim(),
      prazoExecucaoDias: novoOrcamentoMetaDraft.prazoExecucaoDias.trim(),
      descontoPercentual: novoOrcamentoMetaDraft.descontoPercentual.trim(),
      bdiPercentual: novoOrcamentoMetaDraft.bdiPercentual.trim(),
      reajustes: (novoOrcamentoMetaDraft.reajustes ?? []).map((r, idx) => ({
        nome: (r.nome || '').trim() || `${idx + 1}º reajuste`,
        percentual: (r.percentual || '').trim()
      })),
      dataAbertura: novoOrcamentoMetaDraft.dataAbertura || todayInputDate(),
      dataEnvio: ''
    };
    if (!d.osNumeroPasta || !d.descricao) {
      toast.error('Preencha OS/Nº da pasta e descrição.');
      return;
    }
    try {
      setIsCreatingOrcamento(true);
      const entry = await criarOrcamentoApi(centroCustoId, nomeTrim);
      setListaOrcamentos(prev => [entry, ...prev.filter(o => o.id !== entry.id)]);
      setNomeOrcamentoRascunho(entry.nome);
      setOrcamentoAtivoId(entry.id);
      navigateEmbeddedOrcamentoPath(entry.id);
      setActiveTab('orcamento');
      setMeta({ ...d, revisaoCount: 0 });
      // salva imediatamente os metadados (a revisão continua "Sem revisão" até o primeiro salvar)
      await saveOrcamentoToApi(centroCustoId, entry.id, {
        servicos: [],
        imports: [],
        sessaoOrcamento: {
          ...sessaoVazia(),
          meta: { ...d, revisaoCount: 0 }
        }
      });
      setNovoOrcamentoMetaOpen(false);
      setNovoOrcamentoStep(1);
      toast.success('Novo orçamento criado. Preencha os serviços e clique em salvar para gerar a revisão R01.');
    } catch {
      toast.error('Não foi possível criar o orçamento.');
    } finally {
      setIsCreatingOrcamento(false);
    }
  };

  const podeAvancarNovoOrcamento = (step: 1 | 2 | 3) => {
    if (step === 1) {
      return (
        novoOrcamentoMetaDraft.nomeOrcamento.trim().length > 0 &&
        novoOrcamentoMetaDraft.osNumeroPasta.trim().length > 0 &&
        (novoOrcamentoMetaDraft.dataAbertura || '').trim().length > 0
      );
    }
    if (step === 2) {
      return true;
    }
    return true;
  };

  const abrirOrcamentoDaLista = (id: string) => {
    const meta = listaOrcamentos.find(o => o.id === id);
    setOrcamentoViewTab('montagem');
    setNomeOrcamentoRascunho(meta?.nome ?? '');
    setOrcamentoAtivoId(id);
    navigateEmbeddedOrcamentoPath(id);
    setActiveTab('orcamento');
  };

  const excluirOrcamentoDaLista = async (id: string, nome: string) => {
    if (!centroCustoId) return;
    if (!confirm(`Excluir o orçamento "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await excluirOrcamentoApi(centroCustoId, id);
      localStorage.removeItem(storageKey(centroCustoId, 'sessao', id));
      setListaOrcamentos(prev => prev.filter(o => o.id !== id));
      if (orcamentoAtivoId === id) {
        navigateEmbeddedOrcamentoPath(null);
        setOrcamentoAtivoId(null);
        setNomeOrcamentoRascunho('');
        setServicos([]);
        setImports([]);
      }
      toast.success('Orçamento excluído.');
    } catch {
      toast.error('Não foi possível excluir o orçamento.');
    }
  };

  const salvarNomeOrcamento = async () => {
    if (!centroCustoId || !orcamentoAtivoId) return;
    const n = nomeOrcamentoRascunho.trim();
    if (!n) {
      toast.error('Informe um nome.');
      return;
    }
    try {
      await renomearOrcamentoApi(centroCustoId, orcamentoAtivoId, n);
      setListaOrcamentos(prev =>
        prev.map(o => (o.id === orcamentoAtivoId ? { ...o, nome: n } : o))
      );
      toast.success('Nome atualizado.');
    } catch {
      toast.error('Não foi possível renomear.');
    }
  };

  const abrirEdicaoDados = () => {
    setEditarDadosDraft({
      ...meta,
      nomeOrcamento: nomeOrcamentoRascunho || ''
    });
    setEditarDadosOpen(true);
  };

  const salvarEdicaoDados = async () => {
    if (!centroCustoId || !orcamentoAtivoId) return;
    const nome = editarDadosDraft.nomeOrcamento.trim();
    if (!nome) {
      toast.error('Informe o nome do orçamento.');
      return;
    }

    const nextMeta: OrcamentoMeta = {
      ...meta,
      ...editarDadosDraft,
      osNumeroPasta: editarDadosDraft.osNumeroPasta.trim(),
      prazoExecucaoDias: editarDadosDraft.prazoExecucaoDias.trim(),
      responsavelOrcamento: editarDadosDraft.responsavelOrcamento.trim(),
      descricao: editarDadosDraft.descricao.trim(),
      orcamentoRealizadoPor: editarDadosDraft.orcamentoRealizadoPor.trim(),
      descontoPercentual: editarDadosDraft.descontoPercentual.trim(),
      bdiPercentual: editarDadosDraft.bdiPercentual.trim(),
      reajustes: (editarDadosDraft.reajustes ?? []).map((r, idx) => ({
        nome: (r.nome || '').trim() || `${idx + 1}º reajuste`,
        percentual: (r.percentual || '').trim()
      }))
    };

    try {
      if (nome !== nomeOrcamentoRascunho.trim()) {
        await renomearOrcamentoApi(centroCustoId, orcamentoAtivoId, nome);
        setNomeOrcamentoRascunho(nome);
        setListaOrcamentos(prev =>
          prev.map(o => (o.id === orcamentoAtivoId ? { ...o, nome } : o))
        );
      }

      setMeta(nextMeta);
      const nextSessao: SessaoOrcamentoPersist = {
        ...sessaoRef.current,
        meta: nextMeta
      };
      persistToApi(servicos, imports, nextSessao);
      setEditarDadosOpen(false);
      toast.success('Dados do orçamento atualizados.');
    } catch {
      toast.error('Não foi possível atualizar os dados.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleFileUploadComposicoes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }) as any[][];
      if (rows.length < 2) {
        toast.error('Planilha vazia ou sem dados');
        return;
      }
      // Detecta automaticamente a linha de cabeçalho (algumas planilhas trazem linhas acima do header).
      const detectarLinhaCabecalho = () => {
        const limite = Math.min(rows.length, 30);
        for (let r = 0; r < limite; r++) {
          const h = (rows[r] || []).map((x: any) => normalizarTextoBusca(String(x || '')));
          const hk = h.map((x: string) => normalizarCabecalhoColuna(x));
          const temCodigo = hk.some((c: string) => c.includes('codigo'));
          const temBanco = hk.some((c: string) => c === 'banco');
          const temDescricao = hk.some((c: string) => c.includes('descri'));
          const temMatMo = hk.some((c: string) =>
            c.includes('mat+mo') ||
            c === 'matmo' ||
            c === 'matm.o'
          );
          if ((temCodigo && temDescricao) || (temBanco && temDescricao) || (temCodigo && temMatMo)) {
            return r;
          }
        }
        return 0;
      };

      const headerRowIdx = detectarLinhaCabecalho();
      const header = (rows[headerRowIdx] || []).map((h: any) => normalizarTextoBusca(String(h || '')));
      const headerKey = header.map(h => normalizarCabecalhoColuna(h));
      const chaveIdx = headerKey.findIndex(h => h === 'chave');
      const codigoIdx = headerKey.findIndex(h => h.includes('codigo'));
      const bancoIdx = headerKey.findIndex(h => h === 'banco');
      const descIdx = headerKey.findIndex(h => h === 'descricao' || h.includes('descri'));
      const tipoIdx = headerKey.findIndex(h => h === 'tipo');
      const undIdx = headerKey.findIndex(h => h === 'und' || h === 'un' || h.includes('unidade'));
      const quantIdx = headerKey.findIndex(h => h.includes('quant'));
      const valorUnitIdx = headerKey.findIndex(h => h.includes('valorunit') || h === 'valorunit' || h === 'valoruni');
      const totalIdx = headerKey.findIndex(h => h === 'total');
      const matMoIdx = headerKey.findIndex(h =>
        h === 'mat+mo' ||
        h === 'matm.o' ||
        h === 'matmo' ||
        h === 'mat+m.o' ||
        h.includes('mat+mo')
      );
      const maoIdx = headerKey.findIndex(h =>
        h === 'mo' ||
        h === 'mao' ||
        h === 'maodeobra' ||
        h.includes('maodeobra')
      );
      const materialIdx = headerKey.findIndex(h =>
        h === 'mat' ||
        h === 'material' ||
        (h.includes('material') && !h.includes('submaterial'))
      );
      const itemsMap = new Map<string, ComposicaoItem>();
      let composicaoAtualKey: string | null = null;
      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i] || [];
        const codigo = String(row[codigoIdx] ?? row[1] ?? '').trim();
        const banco = String(row[bancoIdx] ?? row[2] ?? '').trim();
        const chave = String(row[chaveIdx] ?? '').trim() || normalizarChave(codigo, banco);
        const descricao = String(row[descIdx] ?? row[4] ?? '').trim();
        const tipoRaw = normalizarTextoBusca(String(row[tipoIdx] ?? ''));
        const preco = matMoIdx >= 0 ? parsePreco(row[matMoIdx]) : parsePreco(row[6] ?? row[7]);
        // Valores fixos: vêm exclusivamente da planilha.
        const mao = maoIdx >= 0 ? parsePreco(row[maoIdx]) : 0;
        const material = materialIdx >= 0 ? parsePreco(row[materialIdx]) : 0;

        const ehComposicao = tipoRaw.includes('composicao') || (!tipoRaw && (codigo || banco) && !!descricao);
        const ehInsumo = tipoRaw.includes('insumo') || tipoRaw.includes('mao de obra') || tipoRaw.includes('material');

        if (ehComposicao && (codigo || banco || chave || descricao)) {
          const unidade = String(row[undIdx] ?? '').trim() || undefined;
          const comp: ComposicaoItem = {
            codigo,
            banco,
            chave,
            descricao,
            unidade,
            precoUnitario: preco,
            maoDeObraUnitario: mao,
            materialUnitario: material,
            analiticoLinhas: itemsMap.get(chave)?.analiticoLinhas || []
          };
          itemsMap.set(chave, comp);
          composicaoAtualKey = chave;
          continue;
        }

        if (ehInsumo) {
          const destinoKey = (chave && itemsMap.has(chave)) ? chave : composicaoAtualKey;
          if (!destinoKey) continue;
          const comp = itemsMap.get(destinoKey);
          if (!comp) continue;

          const categoria: CategoriaAnalitico = tipoRaw.includes('mao de obra') ? 'MÃO DE OBRA' : 'MATERIAL';
          const unidade = String(row[undIdx] ?? '').trim() || 'un';
          const quantidade = quantIdx >= 0 ? parsePreco(row[quantIdx]) : 0;
          const precoUnitario = valorUnitIdx >= 0 ? parsePreco(row[valorUnitIdx]) : 0;
          const totalInsumo = totalIdx >= 0 ? parsePreco(row[totalIdx]) : (quantidade * precoUnitario);

          if (descricao) {
            comp.analiticoLinhas = [
              ...(comp.analiticoLinhas || []),
              {
                categoria,
                descricao,
                unidade,
                quantidade,
                precoUnitario,
                total: totalInsumo
              }
            ];
            itemsMap.set(destinoKey, comp);
          }
        }
      }
      const items = Array.from(itemsMap.values());
      setComposicoes(items);
      await saveComposicoesGeralToApi(items);
      toast.success(`${items.length} composições importadas e salvas no S3.`);
    } catch (err) {
      toast.error('Erro ao processar o arquivo. Verifique o formato.');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  // ── Funções Orçafascio API ──────────────────────────────────────────────────

  const buscarComposicoesOrcafascio = async (page = 1) => {
    setOrcafascioLoading(true);
    setOrcafascioDetalhe(null);
    const q = orcafascioSearch.trim();
    try {
      // Código só dígitos (ex.: SINAPI 88418): listagem ignora — usar find_by_code
      if (/^\d+$/.test(q)) {
        const res = await api.get<OrcafascioComposicaoDetalhe>(
          '/orcafascio/composicoes/by-code',
          {
            params: { code: q, state: orcafascioUfOrse },
            timeout: 90000,
          }
        );
        const d = res.data;
        setOrcafascioResultados({
          total: 1,
          per_page: 1,
          current_page: 1,
          records: [
            {
              id: d.id,
              code: d.code,
              second_code: d.second_code,
              description: d.description,
              type: d.type,
              unit: d.unit,
              is_sicro: d.is_sicro,
              created_at: d.created_at,
            },
          ],
        });
        setOrcafascioPage(1);
        return;
      }

      const params: Record<string, unknown> = { page };
      if (q) params.search = q;
      const res = await api.get<OrcafascioListResponse<OrcafascioComposicaoListItem>>(
        '/orcafascio/composicoes',
        { params, timeout: 240000 }
      );
      setOrcafascioResultados(res.data);
      setOrcafascioPage(page);
    } catch (err: any) {
      const status = err?.response?.status;
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Erro ao buscar composições';
      if (/^\d+$/.test(q) && (status === 404 || String(msg).includes('404'))) {
        toast.error(`Orçafascio: nenhuma composição com o código "${q}" neste estado.`);
      } else {
        toast.error(`Orçafascio: ${msg}`);
      }
      if (/^\d+$/.test(q)) setOrcafascioResultados(null);
    } finally {
      setOrcafascioLoading(false);
    }
  };

  const buscarOrcamentosOrcafascio = async (page = 1) => {
    setOrcafascioOrcamentosLoading(true);
    const q = orcafascioModalOrcamentosSearch.trim();
    try {
      const res = await api.get<OrcafascioOrcamentosResponse>(
        '/orcafascio/orcamentos',
        { params: { page, ...(q ? { search: q } : {}) }, timeout: 60000 }
      );
      const data = res.data;
      setOrcafascioOrcamentos(data.budgets ?? []);
      setOrcafascioOrcamentosTotal(data.total ?? null);
      setOrcafascioOrcamentosPage(page);
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Erro ao buscar orçamentos';
      toast.error(`Orçafascio: ${msg}`);
    } finally {
      setOrcafascioOrcamentosLoading(false);
    }
  };

  const verDetalheOrcamentoOrcafascio = async (orcamento: OrcafascioOrcamentoItem) => {
    const bid = idOrcamentoOrcafascioParaApi(orcamento);
    const detalheAtualId = orcafascioOrcamentoDetalhe ? idOrcamentoOrcafascioParaApi(orcafascioOrcamentoDetalhe) : '';
    if (!bid) {
      toast.error('Este orçamento não tem id para consulta na API.');
      return;
    }
    if (detalheAtualId === bid) {
      setOrcafascioOrcamentoDetalhe(null);
      setOrcafascioOrcamentoComposicoes(null);
      setOrcafascioOrcamentoAnalitico(null);
      setOrcafascioOrcamentoLinhaCatalogo(null);
      setOrcafascioOrcamentoLinhaChave(null);
      return;
    }
    setOrcafascioOrcamentoDetalhe(orcamento);
    setOrcafascioOrcamentoComposicoes(null);
    setOrcafascioOrcamentoAnalitico(null);
    setOrcafascioOrcamentoLinhaCatalogo(null);
    setOrcafascioOrcamentoLinhaChave(null);
    setOrcafascioOrcamentoComposicoesLoading(true);
    setOrcafascioOrcamentoAnaliticoLoading(true);
    const enc = encodeURIComponent(bid);
    try {
      let listComp: Record<string, unknown>[] = [];
      try {
        const sint = await api.get(`/orcafascio/orcamentos/${enc}/sintetico`, { timeout: 120000 });
        listComp = normalizarListaApiOrcamento(sint.data);
      } catch {
        listComp = [];
      }
      if (listComp.length === 0) {
        try {
          const det = await api.get(`/orcafascio/orcamentos/${enc}`, { timeout: 120000 });
          listComp = colecionarListasOrcamentoDetalheResposta(det.data);
        } catch {
          /* só tentativa extra */
        }
      }
      setOrcafascioOrcamentoComposicoes(listComp);
      setOrcafascioOrcamentoComposicoesLoading(false);

      try {
        const ana = await api.get(`/orcafascio/orcamentos/${enc}/analitico`, { timeout: 120000 });
        setOrcafascioOrcamentoAnalitico(normalizarListaApiOrcamento(ana.data));
      } catch {
        setOrcafascioOrcamentoAnalitico([]);
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        'Erro ao carregar composições do orçamento';
      toast.error(`Orçafascio: ${msg}`);
      setOrcafascioOrcamentoComposicoes([]);
      setOrcafascioOrcamentoAnalitico([]);
    } finally {
      setOrcafascioOrcamentoComposicoesLoading(false);
      setOrcafascioOrcamentoAnaliticoLoading(false);
    }
  };

  /** Clica na linha do orçamento: abre o analítico da composição no catálogo Orçafascio (mesma API da aba Composições). */
  const abrirCatalogoPorLinhaOrcamento = async (
    row: Record<string, unknown>,
    linhaIdx: number,
    scope: 'orcamento-composicoes'
  ) => {
    const code = codigoCatalogoLinhaOrcamentoOrcafascio(row) ?? '';
    const bid = orcafascioOrcamentoDetalhe ? idOrcamentoOrcafascioParaApi(orcafascioOrcamentoDetalhe) : '';
    const buildItemIdRaw = row.build_item_id != null ? String(row.build_item_id).trim() : '';
    const linhaKeyBase = buildItemIdRaw || code || String(row.id ?? linhaIdx);
    const linhaKey = `${scope}-${bid}-${linhaIdx}-${linhaKeyBase}`;
    if (orcafascioOrcamentoLinhaChave === linhaKey && orcafascioOrcamentoLinhaCatalogo) {
      setOrcafascioOrcamentoLinhaCatalogo(null);
      setOrcafascioOrcamentoLinhaChave(null);
      return;
    }
    setOrcafascioOrcamentoLinhaChave(linhaKey);
    setOrcafascioOrcamentoLinhaCatalogoLoading(true);
    setOrcafascioOrcamentoLinhaCatalogo(null);
    try {
      const analiticoRows = orcafascioOrcamentoAnalitico ?? [];
      const analiticoMatch = encontrarLinhaAnaliticoParaComposicaoOrcamentoFixo(row, analiticoRows);

      if (analiticoMatch) {
        setOrcafascioOrcamentoLinhaCatalogo(
          detalheCatalogoAPartirAnaliticoOrcamento(analiticoMatch as Record<string, unknown>)
        );
        return;
      }
      toast.error('Não foi possível vincular esta composição ao analítico do orçamento (build_item_id/id).');
    } finally {
      setOrcafascioOrcamentoLinhaCatalogoLoading(false);
    }
  };

  const carregarComposicoesOrcamentoFixoOrcafascio = useCallback(async () => {
    setOrcafascioAddCompLoading(true);
    try {
      const enc = encodeURIComponent(ORCAFASCIO_ORCAMENTO_FIXO_ID);
      let listComp: Record<string, unknown>[] = [];
      try {
        const sint = await api.get(`/orcafascio/orcamentos/${enc}/sintetico`, { timeout: 120000 });
        listComp = normalizarListaApiOrcamento(sint.data);
      } catch {
        listComp = [];
      }
      if (listComp.length === 0) {
        try {
          const det = await api.get(`/orcafascio/orcamentos/${enc}`, { timeout: 120000 });
          listComp = colecionarListasOrcamentoDetalheResposta(det.data);
        } catch {
          /* tentativa extra */
        }
      }
      let listAna: Record<string, unknown>[] = [];
      try {
        const ana = await api.get(`/orcafascio/orcamentos/${enc}/analitico`, { timeout: 120000 });
        listAna = normalizarListaApiOrcamento(ana.data);
      } catch {
        listAna = [];
      }
      setOrcafascioAddCompComposicoes(listComp);
      setOrcafascioAddCompAnalitico(listAna);
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Erro ao carregar orçamento fixo do Orçafascio';
      toast.error(`Orçafascio: ${msg}`);
      setOrcafascioAddCompComposicoes([]);
      setOrcafascioAddCompAnalitico([]);
    } finally {
      setOrcafascioAddCompLoading(false);
    }
  }, []);

  const abrirModalAdicionarComposicaoOrcafascioNoBloco = useCallback((blocoKey: string) => {
    if (!blocoKey || blocoKey.lastIndexOf('|') <= 0) {
      toast.error('Não foi possível identificar o subtítulo para adicionar a composição.');
      return;
    }
    setOrcafascioAddCompTargetBlocoKey(blocoKey);
    setOrcafascioAddCompSearch('');
    setOrcafascioAddCompSelecionadas(new Set());
    setOrcafascioAddCompModalOpen(true);
    void carregarComposicoesOrcamentoFixoOrcafascio();
  }, [carregarComposicoesOrcamentoFixoOrcafascio]);

  const abrirModalAdicionarComposicaoOrcafascio = useCallback((composicaoKey: string) => {
    const parsed = parseItemKeyOrcamento(composicaoKey);
    if (!parsed) {
      toast.error('Não foi possível identificar o subtítulo para adicionar a composição.');
      return;
    }
    abrirModalAdicionarComposicaoOrcafascioNoBloco(parsed.blocoKey);
  }, [abrirModalAdicionarComposicaoOrcafascioNoBloco]);

  const chaveLinhaAdicionarComp = useCallback((row: Record<string, unknown>, idx: number): string => {
    const code = codigoCatalogoLinhaOrcamentoOrcafascio(row) ?? '';
    const buildItemIdRaw = row.build_item_id != null ? String(row.build_item_id).trim() : '';
    return `add-fixo-${idx}-${buildItemIdRaw || code || String(row.id ?? '')}`;
  }, []);

  type AddComposicaoNoBlocoResult =
    | { ok: true; codigo: string }
    | { ok: false; codigo: string; reason: 'invalid-target' | 'not-found-analitico' | 'duplicate' };

  async function adicionarComposicaoOrcafascioNoBloco(
    row: Record<string, unknown>,
    idx: number,
    options?: { emLote?: boolean }
  ): Promise<AddComposicaoNoBlocoResult> {
    const emLote = options?.emLote ?? false;
    const blocoKey = orcafascioAddCompTargetBlocoKey;
    const code = codigoCatalogoLinhaOrcamentoOrcafascio(row) ?? '';
    if (!blocoKey) return { ok: false, codigo: code, reason: 'invalid-target' };
    const parsedBloco = parseBlocoKeyOrcamento(blocoKey);
    if (!parsedBloco) {
      toast.error('Subtítulo de destino inválido.');
      return { ok: false, codigo: code, reason: 'invalid-target' };
    }
    const { servicoId, subtituloId } = parsedBloco;
    const rowBase = String(row.base ?? '').trim();
    const analiticoMatch = encontrarLinhaAnaliticoParaComposicaoOrcamentoFixo(row, orcafascioAddCompAnalitico ?? []);
    if (!analiticoMatch) {
      const baseMsg = rowBase ? ` · base ${rowBase}` : '';
      if (!emLote) {
        toast.error(
          `Esta composição não foi encontrada no analítico do orçamento fixo (código ${code || '—'}${baseMsg}).`
        );
      }
      return { ok: false, codigo: code, reason: 'not-found-analitico' };
    }
    const detalhe = detalheCatalogoAPartirAnaliticoOrcamento(analiticoMatch as Record<string, unknown>);
    const novaComp = orcafascioToComposicaoItem(detalhe);
    const rowKey = chaveLinhaAdicionarComp(row, idx);
    if (!emLote) setOrcafascioAddCompAddingKey(rowKey);
    try {
      let precisaSalvarCatalogo = false;
      let catalogSnapshot: ComposicaoItem[] = composicoes;
      setComposicoes((prev) => {
        precisaSalvarCatalogo = false;
        const idxExistente = prev.findIndex((c) => c.codigo === novaComp.codigo && c.banco === novaComp.banco);
        if (idxExistente >= 0) {
          const atual = prev[idxExistente];
          const atualTemAnalitico = !!atual?.analiticoLinhas?.length;
          const novoTemAnalitico = !!novaComp.analiticoLinhas?.length;
          if (!novoTemAnalitico) {
            catalogSnapshot = prev;
            return prev;
          }
          const next = [...prev];
          next[idxExistente] = novaComp;
          catalogSnapshot = next;
          precisaSalvarCatalogo =
            !atualTemAnalitico ||
            JSON.stringify(atual.analiticoLinhas ?? []) !== JSON.stringify(novaComp.analiticoLinhas ?? []);
          return next;
        }
        precisaSalvarCatalogo = true;
        catalogSnapshot = [...prev, novaComp];
        return catalogSnapshot;
      });
      if (precisaSalvarCatalogo) {
        await saveComposicoesGeralToApi(catalogSnapshot);
      }
      const addResult = addItemToServico(servicoId, subtituloId, novaComp, catalogSnapshot);
      if (!addResult.ok) {
        if (addResult.reason === 'duplicate' && !emLote) {
          toast.error('Este item já está no subtítulo');
        }
        return { ok: false, codigo: code || novaComp.codigo, reason: 'duplicate' };
      }
      if (!emLote) {
        toast.success(`Composição ${novaComp.codigo} adicionada ao orçamento.`);
      }
      return { ok: true, codigo: code || novaComp.codigo };
    } finally {
      if (!emLote) setOrcafascioAddCompAddingKey(null);
    }
  }

  const orcafascioAddCompFiltradas = useMemo(() => {
    const somenteComposicoes = orcafascioAddCompComposicoes.filter((row) => {
      const r = row as Record<string, unknown>;
      const codeRaw = codigoCatalogoLinhaOrcamentoOrcafascio(r);
      const code = String(codeRaw ?? '').trim();
      return !!code && code !== '-' && code !== '—';
    });
    const q = orcafascioAddCompSearch.trim().toLowerCase();
    if (!q) return somenteComposicoes;
    return somenteComposicoes.filter((row) => {
      const r = row as Record<string, unknown>;
      const code = String(codigoCatalogoLinhaOrcamentoOrcafascio(r) ?? '').toLowerCase();
      const desc = textoDescricaoOrcafascio(r).toLowerCase();
      return `${code} ${desc}`.includes(q);
    });
  }, [orcafascioAddCompComposicoes, orcafascioAddCompSearch]);

  const orcafascioAddCompDestinoLabel = useMemo(() => {
    const bk = orcafascioAddCompTargetBlocoKey;
    if (!bk) return 'Subtítulo';
    const p = parseBlocoKeyOrcamento(bk);
    if (!p) return bk;
    const svc = servicos.find((s) => s.id === p.servicoId) ?? servicosParaDropdown.find((s) => s.id === p.servicoId);
    const sub = svc?.subtitulos.find((sb) => sb.id === p.subtituloId);
    if (!svc || !sub) return bk;
    return `${svc.nome} > ${sub.nome}`;
  }, [orcafascioAddCompTargetBlocoKey, servicos, servicosParaDropdown]);

  const toggleSelecaoAdicionarComp = useCallback((key: string) => {
    setOrcafascioAddCompSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  async function adicionarComposicoesOrcafascioSelecionadas() {
    if (orcafascioAddCompSelecionadas.size === 0) {
      toast('Selecione ao menos uma composição.');
      return;
    }
    const rowsSelecionadas = orcafascioAddCompFiltradas
      .map((row, idx) => ({ row, idx, key: chaveLinhaAdicionarComp(row, idx) }))
      .filter((x) => orcafascioAddCompSelecionadas.has(x.key));
    if (rowsSelecionadas.length === 0) {
      toast('Nenhuma composição selecionada nesta lista filtrada.');
      return;
    }
    setOrcafascioAddCompAddingKey('batch');
    let ok = 0;
    let falhasNaoEncontrado = 0;
    let falhasDuplicado = 0;
    let falhasDestino = 0;
    try {
      for (const x of rowsSelecionadas) {
        try {
          const result = await adicionarComposicaoOrcafascioNoBloco(x.row as Record<string, unknown>, x.idx, {
            emLote: true,
          });
          if (result.ok) {
            ok += 1;
          } else if (result.reason === 'not-found-analitico') {
            falhasNaoEncontrado += 1;
          } else if (result.reason === 'duplicate') {
            falhasDuplicado += 1;
          } else {
            falhasDestino += 1;
          }
        } catch {
          // Continua lote mesmo se alguma falhar.
        }
      }
      if (ok > 0) {
        const extras: string[] = [];
        if (falhasNaoEncontrado > 0) extras.push(`${falhasNaoEncontrado} sem vínculo no analítico`);
        if (falhasDuplicado > 0) extras.push(`${falhasDuplicado} duplicada(s)`);
        if (falhasDestino > 0) extras.push(`${falhasDestino} com destino inválido`);
        toast.success(
          `${ok} composição(ões) adicionada(s) ao orçamento.${extras.length ? ` (${extras.join(' | ')})` : ''}`
        );
      } else {
        toast.error(
          `Nenhuma composição foi adicionada.${falhasNaoEncontrado > 0 ? ` ${falhasNaoEncontrado} não foram encontradas no analítico.` : ''}${falhasDuplicado > 0 ? ` ${falhasDuplicado} já estavam no subtítulo.` : ''}`
        );
      }
    } finally {
      setOrcafascioAddCompAddingKey(null);
      setOrcafascioAddCompSelecionadas(new Set());
    }
  }

  const verDetalheComposicaoOrcafascio = async (comp: OrcafascioComposicaoListItem) => {
    setOrcafascioComposicaoDetalheTab('itens');
    setOrcafascioDetalheLoading(true);
    try {
      const res = await api.get<OrcafascioComposicaoDetalhe>(
        `/orcafascio/composicoes/by-code`,
        { params: { code: comp.code, state: orcafascioUfOrse }, timeout: 90000 }
      );
      setOrcafascioDetalhe(res.data);
    } catch {
      // fallback: busca por ID
      try {
        const baseSeg = comp.__orcafascio_base;
        const res = await api.get<OrcafascioComposicaoDetalhe>(
          `/orcafascio/composicoes/${comp.id}`,
          {
            params: baseSeg ? { base: baseSeg } : undefined,
            timeout: 90000,
          }
        );
        setOrcafascioDetalhe(res.data);
      } catch (err: any) {
        toast.error('Erro ao carregar detalhes da composição');
      }
    } finally {
      setOrcafascioDetalheLoading(false);
    }
  };

  const importarComposicaoOrcafascio = async (detalhe: OrcafascioComposicaoDetalhe) => {
    const novaComp = orcafascioToComposicaoItem(detalhe);
    const existe = composicoes.findIndex(c => c.codigo === novaComp.codigo);
    let novas: ComposicaoItem[];
    if (existe >= 0) {
      if (!confirm(`A composição "${novaComp.codigo}" já existe no catálogo. Substituir?`)) return;
      novas = composicoes.map((c, i) => (i === existe ? novaComp : c));
    } else {
      novas = [...composicoes, novaComp];
    }
    setComposicoes(novas);
    try {
      await saveComposicoesGeralToApi(novas);
      toast.success(`Composição ${novaComp.codigo} importada com sucesso!`);
      setOrcafascioModalOpen(false);
      setOrcafascioDetalhe(null);
    } catch {
      toast.error('Erro ao salvar composição importada');
    }
  };

  const apagarPlanilhaComposicoes = async () => {
    if (composicoes.length === 0) {
      toast('Não há composições carregadas para apagar.');
      return;
    }
    if (!confirm('Tem certeza que deseja apagar a planilha de composições carregada?')) return;
    try {
      setComposicoes([]);
      await saveComposicoesGeralToApi([]);
      toast.success('Planilha de composições apagada com sucesso.');
    } catch {
      toast.error('Erro ao apagar composições.');
    }
  };

  const addServico = () => {
    if (!novoServicoNome.trim()) {
      toast.error('Informe o nome do serviço');
      return;
    }
    const novo: ServicoPadrao = {
      id: crypto.randomUUID(),
      nome: novoServicoNome.trim(),
      subtitulos: [{ id: crypto.randomUUID(), nome: 'Novo subtítulo', itens: [] }]
    };
    const updated = [...servicos, novo];
    setServicos(updated);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    setNovoServicoNome('');
    setShowAddServico(false);
    toast.success('Serviço criado. Na aba Importações, importe o orçamento perfeito para preencher a estrutura.');
  };

  const adicionarTituloNoOrcamentoViaMenu = (tituloRaw: string, subtituloRaw: string) => {
    const titulo = tituloRaw.trim();
    if (!titulo) return;
    const subtituloInicial = subtituloRaw.trim();
    if (!subtituloInicial) return;
    const novoServicoId = crypto.randomUUID();
    const novoSubId = crypto.randomUUID();
    const novo: ServicoPadrao = {
      id: novoServicoId,
      nome: titulo,
      subtitulos: [{ id: novoSubId, nome: subtituloInicial, itens: [] }]
    };
    const updated = [...servicos, novo];
    setServicos(updated);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    setSubtitulosNoOrcamento((prev) => {
      const bk = `${novoServicoId}|${novoSubId}`;
      if (prev.includes(bk)) return prev;
      return [...prev, bk];
    });
    toast.success(`Serviço "${titulo}" adicionado.`);
  };

  const adicionarSubtituloNoOrcamentoViaMenu = (servicoId: string, subtituloNomeRaw: string) => {
    const subtituloNome = subtituloNomeRaw.trim();
    if (!subtituloNome) return;
    const novoSubId = crypto.randomUUID();
    const updated = servicos.map((s) =>
      s.id === servicoId
        ? { ...s, subtitulos: [...s.subtitulos, { id: novoSubId, nome: subtituloNome, itens: [] }] }
        : s
    );
    setServicos(updated);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    setSubtitulosNoOrcamento((prev) => {
      const bk = `${servicoId}|${novoSubId}`;
      if (prev.includes(bk)) return prev;
      return [...prev, bk];
    });
    toast.success(`Subtítulo "${subtituloNome}" adicionado.`);
  };

  const abrirModalNovoTituloViaMenu = () => {
    setNovoBlocoModalMode('titulo');
    setNovoBlocoModalServicoId(null);
    setNovoBlocoTituloNome('');
    setNovoBlocoSubtituloNome('');
    setNovoBlocoModalOpen(true);
  };

  const abrirModalNovoSubtituloViaMenu = (servicoId: string) => {
    setNovoBlocoModalMode('subtitulo');
    setNovoBlocoModalServicoId(servicoId);
    setNovoBlocoSubtituloNome('');
    setNovoBlocoModalOpen(true);
  };

  const confirmarNovoBlocoModal = () => {
    if (novoBlocoModalMode === 'titulo') {
      if (!novoBlocoTituloNome.trim()) {
        toast.error('Informe o nome do serviço.');
        return;
      }
      if (!novoBlocoSubtituloNome.trim()) {
        toast.error('Informe o subtítulo do serviço.');
        return;
      }
      adicionarTituloNoOrcamentoViaMenu(novoBlocoTituloNome, novoBlocoSubtituloNome);
      setNovoBlocoModalOpen(false);
      return;
    }
    if (!novoBlocoModalServicoId) {
      toast.error('Não foi possível identificar o título para incluir o subtítulo.');
      return;
    }
    if (!novoBlocoSubtituloNome.trim()) {
      toast.error('Informe o nome do subtítulo.');
      return;
    }
    adicionarSubtituloNoOrcamentoViaMenu(novoBlocoModalServicoId, novoBlocoSubtituloNome);
    setNovoBlocoModalOpen(false);
  };

  const removeServico = (id: string) => {
    const updated = servicos.filter(s => s.id !== id);
    setServicos(updated);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, updated);
      persistToApi(updated, imports);
    }
    const prefix = id + '|';
    setSubtitulosNoOrcamento(prev => prev.filter(k => !k.startsWith(prefix)));
    setLinhasSelecionadasDropdown(prev => new Set(Array.from(prev).filter(k => !k.startsWith(prefix))));
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => { if (k.startsWith(prefix)) delete next[k]; });
      return next;
    });
  };

  const addItemToServico = (
    servicoId: string,
    subtituloId: string,
    item: ComposicaoItem,
    catalogoComposicoes: ComposicaoItem[]
  ): AppendComposicaoAoSubtituloResult => {
    const r = appendComposicaoItemAoSubtitulo(
      servicosRef.current,
      servicoId,
      subtituloId,
      item,
      catalogoComposicoes
    );
    if (!r.ok) return r;
    servicosRef.current = r.next;
    setServicos(r.next);
    if (centroCustoId && orcamentoAtivoId) {
      saveServicos(centroCustoId, r.next);
      persistToApi(r.next, imports);
    }
    return r;
  };

  /** Orçamento perfeito na aba Importações: atualiza base do contrato (e o orçamento aberto, se houver). */
  const processarImportOrcamentoPerfeitoArquivo = async (file: File): Promise<boolean> => {
    if (!centroCustoId) {
      toast.error('Selecione um contrato (centro de custo) antes de importar.');
      return false;
    }
    setIsImportandoOrcamento(true);
    try {
      const parsed = await parsePlanilhaOrcamentoPerfeito(file);
      if (!parsed.ok) {
        toast.error(parsed.message);
        return false;
      }
      const servicosImportados = parsed.servicos;
      if (parsed.composicoesAnaliticas.length > 0) {
        setComposicoes(parsed.composicoesAnaliticas);
        await saveComposicoesGeralToApi(parsed.composicoesAnaliticas);
      }

      setServicos(servicosImportados);
      saveServicos(centroCustoId, servicosImportados);
      addImport(centroCustoId, {
        fileName: file.name,
        date: new Date().toISOString(),
        tipo: 'orçamento',
        origem: 'orcamento-perfeito',
        servicosCount: servicosImportados.length
      });
      const importsAtualizados = loadImports(centroCustoId);
      setImports(importsAtualizados);
      if (orcamentoAtivoId) {
        persistToApi(servicosImportados, importsAtualizados);
      } else {
        await saveServicosPadraoToApi(centroCustoId, {
          servicos: servicosImportados,
          imports: importsAtualizados
        });
      }
      toast.success(
        `${servicosImportados.length} serviço(s) importados na base do contrato (orçamento perfeito). ` +
          (orcamentoAtivoId
            ? 'Sincronizado com o orçamento aberto.'
            : 'Novos orçamentos podem usar essa base; a ficha de demanda fica ao editar cada documento.')
      );
      setActiveTab('orcamento');
      return true;
    } catch (err) {
      const status = (err as { response?: { status?: number } } | null)?.response?.status;
      const code = (err as { code?: string } | null)?.code;
      const detail = err instanceof Error ? err.message : '';
      if (code === 'ECONNABORTED') {
        toast.error('A planilha foi lida, mas o servidor demorou para salvar (timeout). Tente novamente.');
      } else if (status === 404) {
        toast.error('A planilha foi lida, mas a rota de salvamento não foi encontrada (404).');
      } else if (status && status >= 500) {
        toast.error('A planilha foi lida, mas ocorreu erro no servidor ao salvar.');
      } else if (detail) {
        toast.error(`Falha ao importar orçamento perfeito: ${detail}`);
      } else {
        toast.error('Erro ao processar o arquivo. Verifique o formato.');
      }
      return false;
    } finally {
      setIsImportandoOrcamento(false);
    }
  };

  /**
   * Lista de orçamentos: planilha feita fora do sistema vira um novo documento completo (com abas),
   * sem alterar a base do contrato; abre direto na aba Orçamento (montagem).
   */
  const importarPlanilhaComoNovoOrcamento = async (file: File): Promise<boolean> => {
    if (!centroCustoId) {
      toast.error('Selecione um contrato (centro de custo) antes de importar.');
      return false;
    }
    setIsImportandoOrcamento(true);
    try {
      const parsed = await parsePlanilhaOrcamentoPerfeito(file);
      if (!parsed.ok) {
        toast.error(parsed.message);
        return false;
      }
      const servicosImportados = parsed.servicos;
      if (parsed.composicoesAnaliticas.length > 0) {
        setComposicoes(parsed.composicoesAnaliticas);
        await saveComposicoesGeralToApi(parsed.composicoesAnaliticas);
      }
      const nomeBase = (file.name.replace(/\.[^/.]+$/, '') || 'Planilha').trim().slice(0, 100);
      const nomeLista = (`Importado — ${nomeBase}`).slice(0, 120);

      const entry = await criarOrcamentoApi(centroCustoId);
      const subtitulosNoOrcamento: string[] = [];
      const quantidadesPorItem: Record<string, number> = {};
      for (const s of servicosImportados) {
        for (const sub of s.subtitulos) {
          subtitulosNoOrcamento.push(`${s.id}|${sub.id}`);
          for (const it of sub.itens) {
            const itemKey = `${s.id}|${sub.id}|${it.chave}`;
            const q = it.quantidadePlanilha;
            if (q != null && q > 0 && Number.isFinite(q)) quantidadesPorItem[itemKey] = q;
          }
        }
      }

      const base = sessaoVazia();
      const meta: OrcamentoMeta = {
        ...(base.meta as OrcamentoMeta),
        dataAbertura: todayInputDate(),
        descricao: `Orçamento importado da planilha ${file.name}. Revise OS, valores e as abas de orçamento.`,
        osNumeroPasta: nomeBase.slice(0, 60) || 'Importação',
        orcamentoRealizadoPor: currentUserName || '',
        importadoPlanilha: true
      };

      const servicosParaApi = servicosSemQuantidadePlanilha(servicosImportados);
      const padraoContrato = await fetchServicosPadraoFromApi(centroCustoId);
      const importsMesclados: ImportRecord[] = Array.isArray(padraoContrato?.imports) ? padraoContrato.imports : [];

      await saveOrcamentoToApi(centroCustoId, entry.id, {
        imports: importsMesclados,
        servicos: servicosParaApi,
        sessaoOrcamento: {
          ...base,
          subtitulosNoOrcamento,
          quantidadesPorItem,
          meta,
          servicosDocumento: servicosParaApi
        }
      });

      await renomearOrcamentoApi(centroCustoId, entry.id, nomeLista);
      const entryAtualizado = { ...entry, nome: nomeLista };
      setListaOrcamentos(prev => [entryAtualizado, ...prev.filter(o => o.id !== entry.id)]);
      setNomeOrcamentoRascunho(nomeLista);
      setOrcamentoAtivoId(entry.id);
      navigateEmbeddedOrcamentoPath(entry.id);
      setActiveTab('orcamento');
      setOrcamentoViewTab('montagem');
      toast.success(
        `Novo orçamento criado com ${servicosImportados.length} serviço(s). Você já pode revisar o orçamento e as demais abas.`
      );
      return true;
    } catch {
      toast.error('Não foi possível criar o orçamento a partir da planilha.');
      return false;
    } finally {
      setIsImportandoOrcamento(false);
    }
  };

  const handleImportOrcamentoPerfeito = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await processarImportOrcamentoPerfeitoArquivo(file);
  };

  const confirmarImportOrcamentoModal = async () => {
    if (!importOrcamentoModalFile) {
      toast.error('Selecione um arquivo Excel ou CSV.');
      return;
    }
    const ok = await importarPlanilhaComoNovoOrcamento(importOrcamentoModalFile);
    if (ok) {
      setImportOrcamentoModalOpen(false);
      setImportOrcamentoModalFile(null);
    }
  };

  function removeSubtituloDoOrcamento(key: string) {
    setSubtitulosNoOrcamento(prev => prev.filter(k => k !== key));
    setItensOcultosNoOrcamento(prev => prev.filter(k => !k.startsWith(`${key}|`)));
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(key + '|')) delete next[k];
      });
      return next;
    });
    setDimensoesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(key + '|')) delete next[k];
      });
      return next;
    });
  }

  const removeItemFromServico = (servicoId: string, subtituloId: string, chave: string) => {
    const itemKey = `${servicoId}|${subtituloId}|${chave}`;
    const blocoKey = `${servicoId}|${subtituloId}`;
    const svc = servicos.find(s => s.id === servicoId);
    const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);

    const nextOcultos = itensOcultosNoOrcamento.includes(itemKey)
      ? itensOcultosNoOrcamento
      : [...itensOcultosNoOrcamento, itemKey];
    const allHidden =
      !!sub &&
      sub.itens.length > 0 &&
      sub.itens.every(i => nextOcultos.includes(`${blocoKey}|${i.chave}`));

    if (allHidden) {
      removeSubtituloDoOrcamento(blocoKey);
      toast.success('Última composição removida; subtítulo retirado do orçamento');
      return;
    }

    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
    setDimensoesPorItem(prev => {
      const next = { ...prev };
      delete next[itemKey];
      return next;
    });
    setItensOcultosNoOrcamento(prev => (prev.includes(itemKey) ? prev : [...prev, itemKey]));
    const baseOcultos = sessaoRef.current.itensOcultosNoOrcamento ?? [];
    const nextOcultosPersist = baseOcultos.includes(itemKey) ? baseOcultos : [...baseOcultos, itemKey];
    if (centroCustoId && orcamentoAtivoId) {
      persistToApi(servicos, imports, { ...sessaoRef.current, itensOcultosNoOrcamento: nextOcultosPersist });
    }
    toast.success('Item removido');
  };

  /** `itemKey` = `servicoId|subtituloId|chave` — remove a composição da lista do serviço (definitivo). */
  const removerItemComposicaoDoOrcamento = (itemKey: string) => {
    const parts = itemKey.split('|');
    if (parts.length < 3) {
      toast.error('Não foi possível identificar o item.');
      return;
    }
    const chave = parts[parts.length - 1]!;
    const subtituloId = parts[parts.length - 2]!;
    const servicoId = parts.slice(0, -2).join('|');
    removeItemFromServico(servicoId, subtituloId, chave);
  };


  const subtitulosAdicionados = useMemo(() => {
    return subtitulosNoOrcamento
      .map(key => {
        const sep = key.lastIndexOf('|');
        if (sep <= 0) return null;
        const servicoId = key.slice(0, sep);
        const subtituloId = key.slice(sep + 1);
        const svc = servicos.find(s => s.id === servicoId) ?? servicosParaDropdown.find(s => s.id === servicoId);
        const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);
        return sub ? { key, servicoNome: svc!.nome, subtituloNome: sub.nome, itens: sub.itens } : null;
      })
      .filter(Boolean) as { key: string; servicoNome: string; subtituloNome: string; itens: ItemServico[] }[];
  }, [subtitulosNoOrcamento, servicos, servicosParaDropdown]);

  const assinaturasItensVisiveisNoOrcamento = useMemo(() => {
    const s = new Set<string>();
    const ocultos = new Set(itensOcultosNoOrcamento);
    for (const bloco of subtitulosAdicionados) {
      for (const it of bloco.itens) {
        const ik = `${bloco.key}|${it.chave}`;
        if (!ocultos.has(ik)) s.add(itemSigParaOrcamento(it));
      }
    }
    return s;
  }, [subtitulosAdicionados, itensOcultosNoOrcamento]);

  /** Retira do orçamento blocos já sem nenhuma composição visível (ex.: tudo em itens ocultos ou subtítulo órfão). */
  useEffect(() => {
    if (loadingFromApi || servicos.length === 0) return;
    const keysToRemove = subtitulosNoOrcamento.filter(blocoKey => {
      const sep = blocoKey.lastIndexOf('|');
      if (sep <= 0) return true;
      const servicoId = blocoKey.slice(0, sep);
      const subtituloId = blocoKey.slice(sep + 1);
      const svc = servicos.find(s => s.id === servicoId) ?? servicosParaDropdown.find(s => s.id === servicoId);
      const sub = svc?.subtitulos.find(sb => sb.id === subtituloId);
      // Mantém subtítulos vazios/criados manualmente; remove apenas referências órfãs.
      return !sub;
    });
    if (keysToRemove.length === 0) return;
    setSubtitulosNoOrcamento(prev => prev.filter(k => !keysToRemove.includes(k)));
    setItensOcultosNoOrcamento(prev =>
      prev.filter(k => !keysToRemove.some(bk => k.startsWith(`${bk}|`)))
    );
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      keysToRemove.forEach(bk => {
        Object.keys(next).forEach(k => {
          if (k.startsWith(`${bk}|`)) delete next[k];
        });
      });
      return next;
    });
    setDimensoesPorItem(prev => {
      const next = { ...prev };
      keysToRemove.forEach(bk => {
        Object.keys(next).forEach(k => {
          if (k.startsWith(`${bk}|`)) delete next[k];
        });
      });
      return next;
    });
  }, [loadingFromApi, subtitulosNoOrcamento, itensOcultosNoOrcamento, servicos, servicosParaDropdown]);

  useLayoutEffect(() => {
    const el = montagemOrcamentoTableRef.current;
    if (!el) return;
    const onContextMenuNative = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      const tr = target.closest('tr[data-orc-ctx-montagem]');
      if (!tr || !el.contains(tr)) return;
      e.preventDefault();
      e.stopPropagation();
      const kind = tr.getAttribute('data-orc-ctx-montagem');
      const mw = 224;
      const mh = 188;
      let left = e.clientX;
      let top = e.clientY;
      left = Math.min(left, window.innerWidth - mw - 8);
      top = Math.min(top, window.innerHeight - mh - 8);
      if (kind === 'tituloServico') {
        const servicoId = tr.getAttribute('data-servico-id');
        if (servicoId) setMenuCtxMontagem({ kind: 'tituloServico', left, top, servicoId });
      } else if (kind === 'subtitulo') {
        const blocoKey = tr.getAttribute('data-bloco-key');
        if (blocoKey) setMenuCtxMontagem({ kind: 'subtitulo', left, top, blocoKey });
      } else if (kind === 'composicao') {
        const composicaoKey = tr.getAttribute('data-item-key');
        if (composicaoKey) setMenuCtxMontagem({ kind: 'composicao', left, top, composicaoKey });
      }
    };
    el.addEventListener('contextmenu', onContextMenuNative, { capture: true });
    return () => el.removeEventListener('contextmenu', onContextMenuNative, { capture: true });
  }, [subtitulosAdicionados.length, orcamentoViewTab]);

  const todosSubtitulos = useMemo(() => {
    const list: { key: string; servicoNome: string; subtituloNome: string; itens: ItemServico[] }[] = [];
    servicosCatalogoDropdown.forEach(s =>
      s.subtitulos.forEach(sub =>
        list.push({
          key: `${s.id}|${sub.id}`,
          servicoNome: s.nome,
          subtituloNome: sub.nome,
          itens: sub.itens
        })
      )
    );
    return list;
  }, [servicosCatalogoDropdown]);

  const todosSubtitulosFiltradosPesquisa = useMemo(() => {
    const q = servicosSearch.trim().toLowerCase();
    if (!q) return todosSubtitulos;
    return todosSubtitulos.filter(t => {
      const label = `${t.servicoNome} › ${t.subtituloNome}`.toLowerCase();
      if (label.includes(q)) return true;
      return t.itens.some(
        i =>
          (i.codigo || '').toLowerCase().includes(q) ||
          (i.descricao || '').toLowerCase().includes(q)
      );
    });
  }, [todosSubtitulos, servicosSearch]);

  const linhasDisponiveisDropdown = useMemo(() => {
    const keys = new Set<string>();
    const ocultosSet = new Set(itensOcultosNoOrcamento);
    const visiveis = assinaturasItensVisiveisNoOrcamento;
    for (const t of todosSubtitulos) {
      const blocoPorKey = subtitulosNoOrcamento.includes(t.key);
      if (t.itens.length === 0) {
        if (!blocoPorKey) keys.add(buildItemKeyOrcamento(t.key, DROPDOWN_BLOCO_SEM_ITENS));
        continue;
      }
      for (const i of t.itens) {
        const ik = buildItemKeyOrcamento(t.key, i.chave);
        const jaVisivel = visiveis.has(itemSigParaOrcamento(i));
        if (!jaVisivel) keys.add(ik);
        else if (blocoPorKey && ocultosSet.has(ik)) keys.add(ik);
      }
    }
    return keys;
  }, [
    todosSubtitulos,
    subtitulosNoOrcamento,
    itensOcultosNoOrcamento,
    assinaturasItensVisiveisNoOrcamento
  ]);

  const toggleLinhaDropdown = (itemKey: string) => {
    setLinhasSelecionadasDropdown(prev => {
      const next = new Set(prev);
      if (next.has(itemKey)) next.delete(itemKey);
      else next.add(itemKey);
      return next;
    });
  };

  /** Marca/desmarca todas as linhas ainda selecionáveis (novo bloco ou linhas ocultas de bloco já no orçamento). */
  const toggleSubtituloTodasLinhas = (t: { key: string; itens: ItemServico[] }) => {
    const blocoPorKey = subtitulosNoOrcamento.includes(t.key);
    const visiveis = assinaturasItensVisiveisNoOrcamento;
    const keys =
      t.itens.length === 0
        ? blocoPorKey
          ? []
          : [buildItemKeyOrcamento(t.key, DROPDOWN_BLOCO_SEM_ITENS)]
        : t.itens
            .filter(i => {
              const ik = buildItemKeyOrcamento(t.key, i.chave);
              const jaVisivel = visiveis.has(itemSigParaOrcamento(i));
              if (!jaVisivel) return true;
              return blocoPorKey && itensOcultosNoOrcamento.includes(ik);
            })
            .map(i => buildItemKeyOrcamento(t.key, i.chave));
    if (keys.length === 0) return;
    setLinhasSelecionadasDropdown(prev => {
      const next = new Set(prev);
      const allOn = keys.every(k => next.has(k));
      if (allOn) {
        keys.forEach(k => next.delete(k));
      } else {
        keys.forEach(k => next.add(k));
      }
      return next;
    });
  };

  const selecionarTodosSubtitulos = () => {
    setLinhasSelecionadasDropdown(new Set(Array.from(linhasDisponiveisDropdown)));
  };

  const desmarcarTodosSubtitulos = () => {
    setLinhasSelecionadasDropdown(new Set());
  };

  const addSubtitulosSelecionadosAoOrcamento = () => {
    const selected = Array.from(linhasSelecionadasDropdown);
    if (selected.length === 0) {
      toast.error('Selecione ao menos uma linha ou um serviço.');
      return;
    }
    const restaurarKeys = selected.filter(ik => {
      const p = parseItemKeyOrcamento(ik);
      if (!p) return false;
      return subtitulosNoOrcamento.includes(p.blocoKey) && itensOcultosNoOrcamento.includes(ik);
    });
    const porBlocoNovo = new Map<string, Set<string>>();
    for (const ik of selected) {
      const p = parseItemKeyOrcamento(ik);
      if (!p) continue;
      const { blocoKey, chave } = p;
      if (subtitulosNoOrcamento.includes(blocoKey)) continue;
      if (!porBlocoNovo.has(blocoKey)) porBlocoNovo.set(blocoKey, new Set());
      porBlocoNovo.get(blocoKey)!.add(chave);
    }
    const novosBlocos = Array.from(porBlocoNovo.keys()).filter(bk => !subtitulosNoOrcamento.includes(bk));
    if (restaurarKeys.length === 0 && novosBlocos.length === 0) {
      toast.error('Nada para aplicar. Selecione linhas disponíveis ou linhas removidas que possam voltar.');
      return;
    }
    const servicosParaSalvar =
      novosBlocos.length > 0
        ? incorporarNovosBlocosNoEstadoServicos(servicos, novosBlocos, servicosCatalogoDropdown)
        : servicos;
    if (novosBlocos.length > 0) {
      setServicos(servicosParaSalvar);
      if (centroCustoId) saveServicos(centroCustoId, servicosParaSalvar);
    }
    setItensOcultosNoOrcamento(prev => {
      let next = prev.filter(k => !restaurarKeys.includes(k));
      for (const blocoKey of novosBlocos) {
        const chavesSel = porBlocoNovo.get(blocoKey);
        const sub = findSubtituloPorBlocoKey(servicosCatalogoDropdown, blocoKey);
        next = next.filter(k => !k.startsWith(`${blocoKey}|`));
        if (!sub || sub.itens.length === 0) continue;
        if (chavesSel?.has(DROPDOWN_BLOCO_SEM_ITENS)) continue;
        for (const i of sub.itens) {
          const full = buildItemKeyOrcamento(blocoKey, i.chave);
          if (!chavesSel?.has(i.chave) && !next.includes(full)) next.push(full);
        }
      }
      return next;
    });
    if (novosBlocos.length > 0) {
      setSubtitulosNoOrcamento(prev => [...prev, ...novosBlocos]);
    }
    const nextOcultosPersist = (() => {
      let n = [...(sessaoRef.current.itensOcultosNoOrcamento ?? [])];
      n = n.filter(k => !restaurarKeys.includes(k));
      for (const blocoKey of novosBlocos) {
        const chavesSel = porBlocoNovo.get(blocoKey);
        const sub = findSubtituloPorBlocoKey(servicosCatalogoDropdown, blocoKey);
        n = n.filter(k => !k.startsWith(`${blocoKey}|`));
        if (!sub || sub.itens.length === 0) continue;
        if (chavesSel?.has(DROPDOWN_BLOCO_SEM_ITENS)) continue;
        for (const i of sub.itens) {
          const full = buildItemKeyOrcamento(blocoKey, i.chave);
          if (!chavesSel?.has(i.chave) && !n.includes(full)) n.push(full);
        }
      }
      return n;
    })();
    if (centroCustoId && orcamentoAtivoId) {
      persistToApi(servicosParaSalvar, imports, { ...sessaoRef.current, itensOcultosNoOrcamento: nextOcultosPersist });
    }
    setLinhasSelecionadasDropdown(new Set());
    const msgs: string[] = [];
    if (restaurarKeys.length === 1) msgs.push('1 linha readicionada ao orçamento');
    else if (restaurarKeys.length > 1) msgs.push(`${restaurarKeys.length} linhas readicionadas ao orçamento`);
    if (novosBlocos.length === 1) msgs.push('1 serviço adicionado (linhas selecionadas)');
    else if (novosBlocos.length > 1) msgs.push(`${novosBlocos.length} serviços adicionados (linhas selecionadas)`);
    if (msgs.length > 0) toast.success(msgs.join('. ') + '.');
  };

  /** Remove do orçamento todos os subtítulos/itens daquele serviço (linha vermelha de título). */
  const removerTituloServicoDoOrcamento = (servicoId: string) => {
    const prefix = `${servicoId}|`;
    setSubtitulosNoOrcamento(prev => prev.filter(k => !k.startsWith(prefix)));
    setItensOcultosNoOrcamento(prev => prev.filter(k => !k.startsWith(prefix)));
    setLinhasSelecionadasDropdown(prev => new Set(Array.from(prev).filter(k => !k.startsWith(prefix))));
    setQuantidadesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(prefix)) delete next[k];
      });
      return next;
    });
    setDimensoesPorItem(prev => {
      const next = { ...prev };
      Object.keys(next).forEach(k => {
        if (k.startsWith(prefix)) delete next[k];
      });
      return next;
    });
    toast.success('Serviço removido do orçamento');
  };

  const mapaComposicoes = useMemo(() => {
    const m: Record<string, ComposicaoItem> = {};
    composicoes.forEach((c) => {
      const chaves = chavesParaBusca(c.codigo, c.banco, c.chave);
      chaves.forEach((k) => {
        if (!k) return;
        const prev = m[k];
        m[k] = prev ? escolherComposicaoParaChaveMapa(prev, c) : c;
      });
    });
    return m;
  }, [composicoes]);

  const { itensCalculados, total } = useMemo(() => {
    const lista: {
      key: string;
      blocoKey: string;
      servicoNome: string;
      subtituloNome: string;
      item: ItemServico;
      precoUnitario: number;
      maoDeObraUnitario: number;
      materialUnitario: number;
      subMaoDeObra: number;
      subMaterial: number;
      subMatMaisMo: number;
      quantidade: number;
      total: number;
      dimensoes?: DimensoesItem;
      tipoUnidade: TipoUnidadeFormula;
      unidadeComposicao?: string;
    }[] = [];
    const ocultosSet = new Set(itensOcultosNoOrcamento);
    for (const bloco of subtitulosAdicionados) {
      for (const i of bloco.itens) {
        const itemKey = `${bloco.key}|${i.chave}`;
        if (ocultosSet.has(itemKey)) continue;
        const composicao = composicaoResolvidaDoItemServico(i, mapaComposicoes);
        const preco = i.precoUnitario ?? composicao?.precoUnitario ?? 0;
        const maoDeObraUnitario = i.maoDeObraUnitario ?? composicao?.maoDeObraUnitario ?? 0;
        const materialUnitario = i.materialUnitario ?? composicao?.materialUnitario ?? 0;
        const dim = dimensoesPorItem[itemKey];
        const tipoAuto = inferirTipoUnidadePorDimensao(dim?.linhas);
        const tipoDaComp = parseUnidadeComposicao(composicao?.unidade ?? i.unidade);
        const tipoUnidade: TipoUnidadeFormula = (tipoDaComp && tipoDaComp !== 'un') ? tipoDaComp : tipoAuto;
        let qtd = 0;
        if (tipoUnidade === 'un') {
          qtd = Math.max(0, quantidadesPorItem[itemKey] ?? 0);
        } else if (dim?.linhas?.length) {
          qtd = dim.linhas.reduce(
            (s, ln) => (ln.cabecalhoSecao ? s : s + calcularQuantidadeLinha(ln, tipoUnidade)),
            0
          );
        } else {
          qtd = Math.max(0, quantidadesPorItem[itemKey] ?? 0);
        }
        const subMaoDeObra = maoDeObraUnitario * qtd;
        const subMaterial = materialUnitario * qtd;
        const subMatMaisMo = subMaoDeObra + subMaterial;
        const totalItem = subMatMaisMo;
        lista.push({
          key: itemKey,
          blocoKey: bloco.key,
          servicoNome: bloco.servicoNome,
          subtituloNome: bloco.subtituloNome,
          item: i,
          precoUnitario: preco,
          maoDeObraUnitario,
          materialUnitario,
          subMaoDeObra,
          subMaterial,
          subMatMaisMo,
          quantidade: qtd,
          total: totalItem,
          dimensoes: dim,
          tipoUnidade,
          unidadeComposicao: composicao?.unidade
        });
      }
    }
    // Regra: quantidade da caçamba 4m³ = quantidade da Carga Manual de Entulho / 4 (mesmo subtítulo).
    const cargaPorBloco = new Map<string, number>();
    for (const row of lista) {
      if (ehComposicaoCargaEntulho(row.item.descricao)) {
        cargaPorBloco.set(row.blocoKey, row.quantidade);
      }
    }

    const listaComCacamba = lista.map(row => {
      if (!ehComposicaoCacamba4m3(row.item.descricao)) return row;
      const qtdCarga = cargaPorBloco.get(row.blocoKey) ?? 0;
      const qtdCacamba = Math.ceil(qtdCarga / 4);
      const subMaoDeObra = row.maoDeObraUnitario * qtdCacamba;
      const subMaterial = row.materialUnitario * qtdCacamba;
      const subMatMaisMo = subMaoDeObra + subMaterial;
      return {
        ...row,
        quantidade: qtdCacamba,
        subMaoDeObra,
        subMaterial,
        subMatMaisMo,
        total: subMatMaisMo
      };
    });

    const soma = listaComCacamba.reduce((acc, x) => acc + x.total, 0);
    return { itensCalculados: listaComCacamba, total: soma };
  }, [subtitulosAdicionados, quantidadesPorItem, dimensoesPorItem, mapaComposicoes, itensOcultosNoOrcamento]);

  /** Todos os itens do orçamento na ordem da memória de cálculo (inclui UN e medições dimensionais). */
  const itensMemoriaCalculoLista = useMemo(() => itensCalculados, [itensCalculados]);

  const linhasAnaliticoOrcamento = useMemo(() => {
    type Linha =
      | {
          kind: 'tituloServico';
          key: string;
          main: number;
          servicoNome: string;
        }
      | {
          kind: 'subtituloBloco';
          key: string;
          main: number;
          subIdx: number;
          texto: string;
        }
      | {
          kind: 'composicao';
          key: string;
          item: string;
          servicoNome: string;
          subtituloNome: string;
          codigo: string;
          banco: string;
          descricao: string;
          tipo: string;
          und: string;
          quant: number;
          quantidadeReal: number;
          quantidadeOrcada: number;
          valorUnit: number;
          total: number;
        }
      | {
          kind: 'insumo';
          key: string;
          parentKey: string;
          item: string;
          codigo: string;
          banco: string;
          tipo: string;
          categoria: string;
          descricao: string;
          und: string;
          quant: number;
          quantidadeReal: number;
          quantidadeOrcada: number;
          valorUnit: number;
          total: number;
        };

    const out: Linha[] = [];
    if (subtitulosAdicionados.length === 0) return out;

    const servicoNumero = new Map<string, number>();
    let nextMain = 0;
    for (const b of subtitulosAdicionados) {
      if (!servicoNumero.has(b.servicoNome)) {
        servicoNumero.set(b.servicoNome, ++nextMain);
      }
    }

    for (let blocoIndex = 0; blocoIndex < subtitulosAdicionados.length; blocoIndex++) {
      const bloco = subtitulosAdicionados[blocoIndex];
      const rowsDoBloco = itensCalculados.filter(
        r => r.servicoNome === bloco.servicoNome && r.subtituloNome === bloco.subtituloNome
      );
      const main = servicoNumero.get(bloco.servicoNome) ?? 0;
      const subIdx = subtitulosAdicionados
        .slice(0, blocoIndex + 1)
        .filter(b => b.servicoNome === bloco.servicoNome).length;

      const blocoAnterior = blocoIndex > 0 ? subtitulosAdicionados[blocoIndex - 1] : null;
      const primeiroSubtituloDesteServico =
        !blocoAnterior ||
        normalizarNomeServicoOrcamento(blocoAnterior.servicoNome) !==
          normalizarNomeServicoOrcamento(bloco.servicoNome);

      if (primeiroSubtituloDesteServico) {
        out.push({
          kind: 'tituloServico',
          key: `titulo|main-${main}`,
          main,
          servicoNome: bloco.servicoNome
        });
      }
      out.push({
        kind: 'subtituloBloco',
        key: `sub|${bloco.key}`,
        main,
        subIdx,
        /** Sempre exibir o rótulo do bloco; se serviço = subtítulo (ex.: Canteiro), ainda assim aparece na aba Orçamento. */
        texto: (bloco.subtituloNome && bloco.subtituloNome.trim()) || bloco.servicoNome
      });

      for (let compIdx = 0; compIdx < rowsDoBloco.length; compIdx++) {
        const row = rowsDoBloco[compIdx];
        const itemComp = `${main}.${subIdx}.${compIdx + 1}`;
        const comp = composicaoResolvidaDoItemServico(row.item, mapaComposicoes);
        const und = (row.unidadeComposicao || comp?.unidade || row.item.unidade || '').trim() || '—';
        const key = row.key;
        const valorUnit = row.quantidade > 0 ? row.total / row.quantidade : (row.precoUnitario ?? 0);
        out.push({
          kind: 'composicao',
          key,
          item: itemComp,
          servicoNome: row.servicoNome,
          subtituloNome: row.subtituloNome,
          codigo: row.item.codigo,
          banco: row.item.banco,
          descricao: row.item.descricao || '',
          tipo: 'Composição',
          und,
          quant: row.quantidade,
          quantidadeReal: row.quantidade,
          quantidadeOrcada: row.quantidade,
          valorUnit,
          total: row.total
        });

        const seedKey = `${row.item.codigo}|${row.item.banco}|${row.item.chave || ''}`;
        const ehCacamba = ehComposicaoCacamba4m3(row.item.descricao);
        const unitAnalitico = ehCacamba
          ? gerarAnaliticoCacamba4m3(row.materialUnitario, row.maoDeObraUnitario)
          : comp?.analiticoLinhas?.length
            ? {
                total: comp.analiticoLinhas.reduce((acc, l) => acc + (l.total || 0), 0),
                linhas: comp.analiticoLinhas
              }
            : gerarAnaliticoComposicaoUnit(row.materialUnitario, row.maoDeObraUnitario, seedKey);

        for (let i = 0; i < unitAnalitico.linhas.length; i++) {
          const ln = unitAnalitico.linhas[i];
          const quantBase = ln.quantidade || 0;
          const qtd = quantBase * (row.quantidade || 0);
          const valorUnitInsumo = ln.precoUnitario || 0;
          const totalInsumo = qtd * valorUnitInsumo;
          out.push({
            kind: 'insumo',
            key: `${key}|insumo|${i}`,
            parentKey: key,
            item: `${itemComp}.${i + 1}`,
            codigo: ln.codigo ?? '',
            banco: ln.banco ?? row.item.banco ?? '',
            tipo: ln.tipoLabel ? tipoInsumoCodigoParaDescricao(ln.tipoLabel) : 'Insumo',
            categoria: ln.categoria,
            descricao: ln.descricao,
            und: ln.unidade,
            quant: quantBase,
            quantidadeReal: qtd,
            quantidadeOrcada: qtd,
            valorUnit: valorUnitInsumo,
            total: totalInsumo
          });
        }
      }
    }
    return out;
  }, [subtitulosAdicionados, itensCalculados, mapaComposicoes]);

  /** Número do item como na planilha analítica (ex. 1.2.3) — memória de cálculo. */
  const rotuloItemComposicaoPorKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind === 'composicao') m.set(l.key, l.item);
    }
    return m;
  }, [linhasAnaliticoOrcamento]);

  /** Ficha de demanda: só composições e insumos (sem faixas de título/subtítulo). */
  const linhasFichaDemanda = useMemo(() => {
    const composicaoPorKey = new Map(
      linhasAnaliticoOrcamento
        .filter((r) => r.kind === 'composicao')
        .map((r) => [r.key, r] as const)
    );
    const totalInsumosBasePorComposicao = new Map<string, number>();
    for (const row of linhasAnaliticoOrcamento) {
      if (row.kind === 'insumo') {
        totalInsumosBasePorComposicao.set(
          row.parentKey,
          (totalInsumosBasePorComposicao.get(row.parentKey) ?? 0) + 1
        );
      }
    }
    const linhasAnaliticoFicha: typeof linhasAnaliticoOrcamento = [];
    for (let i = 0; i < linhasAnaliticoOrcamento.length; i++) {
      const row = linhasAnaliticoOrcamento[i];
      if (row.kind !== 'composicao' && row.kind !== 'insumo') continue;
      linhasAnaliticoFicha.push(row);

      if (row.kind === 'composicao') {
        const prox = linhasAnaliticoOrcamento[i + 1];
        const composicaoSemInsumoBase =
          !prox || prox.kind !== 'insumo' || prox.parentKey !== row.key;
        if (composicaoSemInsumoBase) {
          const manuais = insumosAnaliticoManuais[row.key] ?? [];
          const base = totalInsumosBasePorComposicao.get(row.key) ?? 0;
          for (let idx = 0; idx < manuais.length; idx++) {
            const ins = manuais[idx];
            const quantUnit = parsePlanilhaCalcOrPtBr(ins.quant);
            const qtdComp = Number(row.quantidadeReal) || 0;
            const qtdReal =
              quantUnit !== null
                ? quantUnit * qtdComp
                : (parsePlanilhaCalcOrPtBr(ins.quantidadeReal) ?? 0);
            const qtdOrc = qtdReal;
            const valorUnit = parsePlanilhaCalcOrPtBr(ins.valorUnit) ?? 0;
            linhasAnaliticoFicha.push({
              kind: 'insumo',
              key: `manual|${ins.id}`,
              parentKey: row.key,
              item: `${row.item}.${base + idx + 1}`,
              codigo: ins.codigo || '',
              banco: ins.banco || '',
              tipo: 'Insumo',
              categoria: 'MATERIAL',
              descricao: ins.descricao || '',
              und: ins.und || '',
              quant: parsePlanilhaCalcOrPtBr(ins.quant) ?? 0,
              quantidadeReal: qtdReal,
              quantidadeOrcada: qtdOrc,
              valorUnit,
              total: qtdOrc * valorUnit
            });
          }
        }
      }

      if (row.kind === 'insumo') {
        const prox = linhasAnaliticoOrcamento[i + 1];
        const ultimoInsumoDaComposicao =
          !prox || prox.kind !== 'insumo' || prox.parentKey !== row.parentKey;
        if (ultimoInsumoDaComposicao) {
          const manuais = insumosAnaliticoManuais[row.parentKey] ?? [];
          const comp = composicaoPorKey.get(row.parentKey);
          const base = totalInsumosBasePorComposicao.get(row.parentKey) ?? 0;
          for (let idx = 0; idx < manuais.length; idx++) {
            const ins = manuais[idx];
            const quantUnit = parsePlanilhaCalcOrPtBr(ins.quant);
            const qtdComp = comp && comp.kind === 'composicao' ? Number(comp.quantidadeReal) || 0 : 0;
            const qtdReal =
              quantUnit !== null
                ? quantUnit * qtdComp
                : (parsePlanilhaCalcOrPtBr(ins.quantidadeReal) ?? 0);
            const qtdOrc = qtdReal;
            const valorUnit = parsePlanilhaCalcOrPtBr(ins.valorUnit) ?? 0;
            linhasAnaliticoFicha.push({
              kind: 'insumo',
              key: `manual|${ins.id}`,
              parentKey: row.parentKey,
              item: comp ? `${comp.item}.${base + idx + 1}` : `${base + idx + 1}`,
              codigo: ins.codigo || '',
              banco: ins.banco || '',
              tipo: 'Insumo',
              categoria: 'MATERIAL',
              descricao: ins.descricao || '',
              und: ins.und || '',
              quant: parsePlanilhaCalcOrPtBr(ins.quant) ?? 0,
              quantidadeReal: qtdReal,
              quantidadeOrcada: qtdOrc,
              valorUnit,
              total: qtdOrc * valorUnit
            });
          }
        }
      }
    }

    const insumosPorComposicao = new Map<
      string,
      Array<{ key: string; valorUnit: number; quantOrc: number }>
    >();
    for (const row of linhasAnaliticoFicha) {
      if (row.kind === 'insumo') {
        const arr = insumosPorComposicao.get(row.parentKey) ?? [];
        arr.push({ key: row.key, valorUnit: row.valorUnit, quantOrc: row.quantidadeReal });
        insumosPorComposicao.set(row.parentKey, arr);
      }
    }

    /** Faturamento (R$) da composição = quant × valor unit. orç. — usado no % custo/valor pago dos insumos. */
    const faturamentoMonetarioPorComposicao = new Map<string, number>();
    for (const row of linhasAnaliticoFicha) {
      if (row.kind === 'composicao') {
        const q = Number(row.quant);
        const v = Number(row.valorUnit);
        if (Number.isFinite(q) && Number.isFinite(v)) {
          faturamentoMonetarioPorComposicao.set(row.key, q * v);
        }
      }
    }

    /** Σ (qtd compra × custo unit. orçamento) dos insumos — linha composição. */
    const valorTotalOrcamentoAgregado = (parentKey: string): number | undefined => {
      const filhos = insumosPorComposicao.get(parentKey) ?? [];
      let sum = 0;
      let temAlgum = false;
      for (const ins of filhos) {
        const qC = planilhaQuantidadeCompra[ins.key];
        if (qC !== undefined && Number.isFinite(qC)) {
          temAlgum = true;
          sum += qC * ins.valorUnit;
        }
      }
      return temAlgum ? sum : undefined;
    };

    /** Mesma coluna "Custo compra real" da planilha analítica: qtd compra × valor unit. compra real; composição = Σ insumos. */
    const precoCompraRealAgregado = (parentKey: string): number | undefined => {
      const filhos = insumosPorComposicao.get(parentKey) ?? [];
      let sumCustoReal = 0;
      let sumQtdCompraComVlReal = 0;
      for (const ins of filhos) {
        const qC = planilhaQuantidadeCompra[ins.key];
        const vReal = planilhaValorUnitCompraReal[ins.key];
        if (qC !== undefined && Number.isFinite(qC) && vReal !== undefined && Number.isFinite(vReal)) {
          sumCustoReal += qC * vReal;
          sumQtdCompraComVlReal += qC;
        }
      }
      return sumQtdCompraComVlReal > 0 ? sumCustoReal : undefined;
    };

    /** Σ qtd compra / Σ qtd orçamento — % levantamento na composição. */
    const levantamentoPctAgregado = (parentKey: string): number | undefined => {
      const filhos = insumosPorComposicao.get(parentKey) ?? [];
      let sumQC = 0;
      let sumQO = 0;
      let temQtdCompraInformadaMaiorZero = false;
      for (const ins of filhos) {
        const qO = ins.quantOrc;
        if (!Number.isFinite(qO)) continue;
        sumQO += qO;
        const qC = planilhaQuantidadeCompra[ins.key];
        if (qC !== undefined && Number.isFinite(qC)) {
          sumQC += qC;
          if (qC > 0) temQtdCompraInformadaMaiorZero = true;
        }
      }
      if (!temQtdCompraInformadaMaiorZero || sumQO <= 0) return undefined;
      return (sumQC / sumQO) * 100;
    };

    /** Média ponderada (vl compra real / vl orçamento) — % preço unitário na composição. */
    const precoUnitarioPctAgregado = (parentKey: string): number | undefined => {
      const filhos = insumosPorComposicao.get(parentKey) ?? [];
      let sumQcvR = 0;
      let sumQcvO = 0;
      for (const ins of filhos) {
        const qC = planilhaQuantidadeCompra[ins.key];
        const vR = planilhaValorUnitCompraReal[ins.key];
        if (
          qC !== undefined &&
          Number.isFinite(qC) &&
          vR !== undefined &&
          Number.isFinite(vR) &&
          Number.isFinite(ins.valorUnit) &&
          ins.valorUnit !== 0
        ) {
          sumQcvR += qC * vR;
          sumQcvO += qC * ins.valorUnit;
        }
      }
      return sumQcvO > 0 ? (sumQcvR / sumQcvO) * 100 : undefined;
    };

    const out: {
      kind: 'composicao' | 'insumo';
      key: string;
      item: string;
      codigo: string;
      banco: string;
      servico: string;
      un: string;
      /** Mesma coluna "Tipo" da planilha (MO/MA); composição: vazio. */
      tipo: string;
      /** Mesma coluna "Quantidade" da planilha analítica (quantidade total no orçamento; insumo = coef. × qtd composição). */
      quantidadeOrcamento: number;
      /** Mesma chave que na planilha: `planilhaQuantidadeCompra[key]` (só insumos costumam ter valor). */
      quantidadeCompra: number | undefined;
      /** Coluna "Valor unit. orçamento" da planilha (`valorUnit`). */
      custoUnitarioOrcamento: number;
      /** Insumo: `planilhaValorUnitCompraReal[key]`; composição: sem valor na ficha (só insumos). */
      custoUnitarioCompraReal: number | undefined;
      /** qtd compra × custo unit. orçamento; na composição, soma dos insumos. */
      valorTotalOrcamento: number | undefined;
      /** valor total orçamento × 0,4 (composição = total agregado × 0,4). */
      precoCompraEstimado60: number | undefined;
      /** Igual planilha "Custo compra real": qtd compra × vl. unit. compra real; composição = Σ. */
      precoCompraReal: number | undefined;
      /** qtd compra / qtd orçamento × 100. */
      levantamentoPct: number | undefined;
      /** custo unit. compra real / custo unit. orçamento × 100. */
      precoUnitarioRelPct: number | undefined;
      /** preço compra real / valor total orçamento × 100. */
      faturamentoPct: number | undefined;
      /** preço compra real ÷ Faturamento (R$) × 100 — insumo: Faturamento da composição pai. */
      pctCustoValorPago: number | undefined;
    }[] = [];
    for (const l of linhasAnaliticoFicha) {
      if (l.kind !== 'composicao' && l.kind !== 'insumo') continue;
      const qCompra = planilhaQuantidadeCompra[l.key];
      const vReal =
        l.kind === 'insumo' ? planilhaValorUnitCompraReal[l.key] : undefined;
      const custoCompraReal =
        l.kind === 'composicao'
          ? undefined
          : vReal !== undefined && Number.isFinite(vReal)
            ? vReal
            : undefined;
      const valorTotalOrcamento =
        l.kind === 'composicao'
          ? valorTotalOrcamentoAgregado(l.key)
          : qCompra !== undefined && Number.isFinite(qCompra)
            ? qCompra * l.valorUnit
            : undefined;
      const precoCompraEstimado60 =
        valorTotalOrcamento !== undefined ? valorTotalOrcamento * PLANILHA_FATOR_CUSTO_ESTIMADO : undefined;
      const precoCompraReal =
        l.kind === 'composicao'
          ? precoCompraRealAgregado(l.key)
          : qCompra !== undefined &&
              vReal !== undefined &&
              Number.isFinite(qCompra) &&
              Number.isFinite(vReal)
            ? qCompra * vReal
            : undefined;
      const qOrcNum = Number(l.quantidadeReal);
      const qCompraNum =
        qCompra !== undefined && Number.isFinite(Number(qCompra)) ? Number(qCompra) : undefined;
      const vOrcNum = Number(l.valorUnit);
      const levantamentoPct =
        l.kind === 'composicao'
          ? levantamentoPctAgregado(l.key)
          : qCompraNum !== undefined &&
              Number.isFinite(qCompraNum) &&
              qCompraNum > 0 &&
              Number.isFinite(qOrcNum) &&
              qOrcNum !== 0
            ? (qCompraNum / qOrcNum) * 100
            : undefined;
      const precoUnitarioRelPct =
        l.kind === 'composicao'
          ? precoUnitarioPctAgregado(l.key)
          : custoCompraReal !== undefined &&
              Number.isFinite(custoCompraReal) &&
              Number.isFinite(vOrcNum) &&
              vOrcNum !== 0
            ? (custoCompraReal / vOrcNum) * 100
            : undefined;
      const faturamentoPct =
        precoCompraReal !== undefined &&
        valorTotalOrcamento !== undefined &&
        valorTotalOrcamento !== 0
          ? (precoCompraReal / valorTotalOrcamento) * 100
          : undefined;
      const valorFaturamentoMonetario =
        l.kind === 'composicao'
          ? Number.isFinite(qOrcNum) && Number.isFinite(vOrcNum)
            ? qOrcNum * vOrcNum
            : undefined
          : l.kind === 'insumo'
            ? faturamentoMonetarioPorComposicao.get(l.parentKey)
            : undefined;
      const pctCustoValorPago =
        precoCompraReal !== undefined &&
        valorFaturamentoMonetario !== undefined &&
        valorFaturamentoMonetario !== 0 &&
        Number.isFinite(precoCompraReal) &&
        Number.isFinite(valorFaturamentoMonetario)
          ? (precoCompraReal / valorFaturamentoMonetario) * 100
          : undefined;
      out.push({
        kind: l.kind,
        key: l.key,
        item: l.item,
        codigo: (l.codigo && String(l.codigo).trim()) || '—',
        banco: (l.banco && String(l.banco).trim()) || '—',
        servico: l.descricao,
        un: (l.und && String(l.und).trim()) || '—',
        tipo:
          l.kind === 'insumo'
            ? planilhaTipoInsumo[l.key] ?? tipoPlanilhaInsumo(l.categoria || '')
            : '',
        quantidadeOrcamento: l.quantidadeReal,
        quantidadeCompra: qCompra !== undefined && Number.isFinite(qCompra) ? qCompra : undefined,
        custoUnitarioOrcamento: l.valorUnit,
        custoUnitarioCompraReal: custoCompraReal,
        valorTotalOrcamento,
        precoCompraEstimado60,
        precoCompraReal,
        levantamentoPct,
        precoUnitarioRelPct,
        faturamentoPct,
        pctCustoValorPago
      });
    }
    return out;
  }, [linhasAnaliticoOrcamento, insumosAnaliticoManuais, planilhaQuantidadeCompra, planilhaValorUnitCompraReal, planilhaTipoInsumo]);

  const linhasAnaliticoComManuais = useMemo(() => {
    const out: typeof linhasAnaliticoOrcamento = [];
    const totalInsumosBasePorComposicao = new Map<string, number>();
    for (const row of linhasAnaliticoOrcamento) {
      if (row.kind === 'insumo') {
        totalInsumosBasePorComposicao.set(
          row.parentKey,
          (totalInsumosBasePorComposicao.get(row.parentKey) ?? 0) + 1
        );
      }
    }
    for (let i = 0; i < linhasAnaliticoOrcamento.length; i++) {
      const row = linhasAnaliticoOrcamento[i];
      out.push(row);
      if (row.kind === 'insumo') {
        const prox = linhasAnaliticoOrcamento[i + 1];
        const ultimoInsumoDaComposicao =
          !prox || prox.kind !== 'insumo' || prox.parentKey !== row.parentKey;
        if (ultimoInsumoDaComposicao) {
          const manuais = insumosAnaliticoManuais[row.parentKey] ?? [];
          const comp = linhasAnaliticoOrcamento.find(
            (linha) => linha.kind === 'composicao' && linha.key === row.parentKey
          );
          const base = totalInsumosBasePorComposicao.get(row.parentKey) ?? 0;
          for (let idx = 0; idx < manuais.length; idx++) {
            const ins = manuais[idx];
            const quantUnit = parsePlanilhaCalcOrPtBr(ins.quant);
            const qtdComp = comp && comp.kind === 'composicao' ? Number(comp.quantidadeReal) || 0 : 0;
            const qtdReal =
              quantUnit !== null
                ? quantUnit * qtdComp
                : (parsePlanilhaCalcOrPtBr(ins.quantidadeReal) ?? 0);
            const qtdOrc = qtdReal;
            const valorUnit = parsePlanilhaCalcOrPtBr(ins.valorUnit) ?? 0;
            out.push({
              kind: 'insumo',
              key: `manual|${ins.id}`,
              parentKey: row.parentKey,
              item: comp && comp.kind === 'composicao' ? `${comp.item}.${base + idx + 1}` : `${base + idx + 1}`,
              codigo: ins.codigo || '',
              banco: ins.banco || '',
              tipo: 'Insumo',
              categoria: 'MATERIAL',
              descricao: ins.descricao || '',
              und: ins.und || '',
              quant: parsePlanilhaCalcOrPtBr(ins.quant) ?? 0,
              quantidadeReal: qtdReal,
              quantidadeOrcada: qtdOrc,
              valorUnit,
              total: qtdOrc * valorUnit
            });
          }
        }
      }
      if (row.kind === 'composicao') {
        const prox = linhasAnaliticoOrcamento[i + 1];
        const composicaoSemInsumoBase =
          !prox || prox.kind !== 'insumo' || prox.parentKey !== row.key;
        if (composicaoSemInsumoBase) {
          const manuais = insumosAnaliticoManuais[row.key] ?? [];
          const base = totalInsumosBasePorComposicao.get(row.key) ?? 0;
          for (let idx = 0; idx < manuais.length; idx++) {
            const ins = manuais[idx];
            const quantUnit = parsePlanilhaCalcOrPtBr(ins.quant);
            const qtdComp = Number(row.quantidadeReal) || 0;
            const qtdReal =
              quantUnit !== null
                ? quantUnit * qtdComp
                : (parsePlanilhaCalcOrPtBr(ins.quantidadeReal) ?? 0);
            const qtdOrc = qtdReal;
            const valorUnit = parsePlanilhaCalcOrPtBr(ins.valorUnit) ?? 0;
            out.push({
              kind: 'insumo',
              key: `manual|${ins.id}`,
              parentKey: row.key,
              item: `${row.item}.${base + idx + 1}`,
              codigo: ins.codigo || '',
              banco: ins.banco || '',
              tipo: 'Insumo',
              categoria: 'MATERIAL',
              descricao: ins.descricao || '',
              und: ins.und || '',
              quant: parsePlanilhaCalcOrPtBr(ins.quant) ?? 0,
              quantidadeReal: qtdReal,
              quantidadeOrcada: qtdOrc,
              valorUnit,
              total: qtdOrc * valorUnit
            });
          }
        }
      }
    }
    return out;
  }, [linhasAnaliticoOrcamento, insumosAnaliticoManuais]);

  const resumoSecoesFicha = useMemo(() => {
    type AccAgg = {
      custoOrc: number;
      custoEst: number;
      custoReal: number;
      insumoKeys: Set<string>;
      composicaoKeys: Set<string>;
    };
    const porTitulo = new Map<string, { custoOrc: number; custoEst: number; custoReal: number }>();
    const porSubtitulo = new Map<string, { custoOrc: number; custoEst: number; custoReal: number }>();
    const detalheInsPorTitulo = new Map<string, DetalheInsumoOrcSecao[]>();
    const detalheInsPorSubtitulo = new Map<string, DetalheInsumoOrcSecao[]>();
    /** Título (ex. 1) → cada subtítulo (1.1, 1.2…) com totais agregados dos insumos. */
    const aggTituloPorSubtitulo = new Map<string, Map<string, AccAgg>>();
    /** Subtítulo (ex. 1.1) → cada composição (1.1.1, 1.1.2…) com totais agregados dos insumos. */
    const aggSubtituloPorComp = new Map<string, Map<string, AccAgg>>();
    const bumpAgg = (
      outer: Map<string, Map<string, AccAgg>>,
      outerKey: string,
      innerKey: string,
      custoOrc: number,
      custoEst: number,
      custoReal: number,
      insumoKey: string,
      composicaoKey: string
    ) => {
      let inner = outer.get(outerKey);
      if (!inner) {
        inner = new Map();
        outer.set(outerKey, inner);
      }
      let cur = inner.get(innerKey);
      if (!cur) {
        cur = {
          custoOrc: 0,
          custoEst: 0,
          custoReal: 0,
          insumoKeys: new Set(),
          composicaoKeys: new Set()
        };
        inner.set(innerKey, cur);
      }
      cur.custoOrc += custoOrc;
      cur.custoEst += custoEst;
      cur.custoReal += custoReal;
      cur.insumoKeys.add(insumoKey);
      cur.composicaoKeys.add(composicaoKey);
    };
    const innerAggToLista = (inner: Map<string, AccAgg>): DetalheAggSecao[] =>
      Array.from(inner.entries())
        .map(([item, v]) => ({
          item,
          custoOrc: v.custoOrc,
          custoEst: v.custoEst,
          custoReal: v.custoReal,
          insumoKeys: Array.from(v.insumoKeys),
          composicaoKeys: Array.from(v.composicaoKeys)
        }))
        .sort((a, b) => compararChaveItemNumero(a.item, b.item));
    for (const row of linhasAnaliticoComManuais) {
      if (row.kind !== 'insumo') continue;
      const partes = String(row.item || '').split('.');
      if (partes.length < 3) continue;
      const chaveTitulo = partes[0];
      const chaveSubtitulo = `${partes[0]}.${partes[1]}`;
      const chaveComp = `${partes[0]}.${partes[1]}.${partes[2]}`;
      const custoOrc = Number(row.total) || 0;
      const custoEst = custoOrc * PLANILHA_FATOR_CUSTO_ESTIMADO;
      const qtdOrc = Number(row.quantidadeReal) || 0;
      const valorUnitOrc = Number(row.valorUnit) || 0;
      const qC = planilhaQuantidadeCompra[row.key];
      const vReal = planilhaValorUnitCompraReal[row.key];
      const qtdCompraNum =
        qC !== undefined && Number.isFinite(qC) ? qC : undefined;
      const valorUnitRealNum =
        vReal !== undefined && Number.isFinite(vReal) ? vReal : undefined;
      const custoReal =
        qtdCompraNum !== undefined &&
        valorUnitRealNum !== undefined &&
        Number.isFinite(qtdCompraNum) &&
        Number.isFinite(valorUnitRealNum)
          ? qtdCompraNum * valorUnitRealNum
          : 0;

      const entry: DetalheInsumoOrcSecao = {
        item: String(row.item),
        key: row.key,
        qtdOrc,
        valorUnitOrc,
        custoOrc,
        custoEst,
        qtdCompra: qtdCompraNum,
        valorUnitReal: valorUnitRealNum,
        custoReal
      };
      const arrT = detalheInsPorTitulo.get(chaveTitulo) ?? [];
      arrT.push(entry);
      detalheInsPorTitulo.set(chaveTitulo, arrT);
      const arrS = detalheInsPorSubtitulo.get(chaveSubtitulo) ?? [];
      arrS.push(entry);
      detalheInsPorSubtitulo.set(chaveSubtitulo, arrS);

      bumpAgg(
        aggTituloPorSubtitulo,
        chaveTitulo,
        chaveSubtitulo,
        custoOrc,
        custoEst,
        custoReal,
        row.key,
        row.parentKey
      );
      bumpAgg(
        aggSubtituloPorComp,
        chaveSubtitulo,
        chaveComp,
        custoOrc,
        custoEst,
        custoReal,
        row.key,
        row.parentKey
      );

      const atualTit = porTitulo.get(chaveTitulo) ?? { custoOrc: 0, custoEst: 0, custoReal: 0 };
      atualTit.custoOrc += custoOrc;
      atualTit.custoEst += custoEst;
      atualTit.custoReal += custoReal;
      porTitulo.set(chaveTitulo, atualTit);

      const atualSub = porSubtitulo.get(chaveSubtitulo) ?? { custoOrc: 0, custoEst: 0, custoReal: 0 };
      atualSub.custoOrc += custoOrc;
      atualSub.custoEst += custoEst;
      atualSub.custoReal += custoReal;
      porSubtitulo.set(chaveSubtitulo, atualSub);
    }
    const aggPorTituloParaTooltip = new Map<string, DetalheAggSecao[]>();
    aggTituloPorSubtitulo.forEach((inner, k) => {
      aggPorTituloParaTooltip.set(k, innerAggToLista(inner));
    });
    const aggPorSubtituloParaTooltip = new Map<string, DetalheAggSecao[]>();
    aggSubtituloPorComp.forEach((inner, k) => {
      aggPorSubtituloParaTooltip.set(k, innerAggToLista(inner));
    });
    return {
      porTitulo,
      porSubtitulo,
      detalheInsPorTitulo,
      detalheInsPorSubtitulo,
      aggPorTituloParaTooltip,
      aggPorSubtituloParaTooltip
    };
  }, [linhasAnaliticoComManuais, planilhaQuantidadeCompra, planilhaValorUnitCompraReal]);

  /** Indicadores % iguais à Ficha de demanda (levantamento, preço unit. rel., faturamento) por chave de linha. */
  const pctFichaDemandaPorKey = useMemo(() => {
    const m = new Map<
      string,
      {
        levantamentoPct: number | undefined;
        precoUnitarioRelPct: number | undefined;
        faturamentoPct: number | undefined;
        pctCustoValorPago: number | undefined;
      }
    >();
    for (const r of linhasFichaDemanda) {
      m.set(r.key, {
        levantamentoPct: r.levantamentoPct,
        precoUnitarioRelPct: r.precoUnitarioRelPct,
        faturamentoPct: r.faturamentoPct,
        pctCustoValorPago: r.pctCustoValorPago
      });
    }
    return m;
  }, [linhasFichaDemanda]);

  /** Insumos da planilha agrupados por composição (parentKey = key da linha composição). */
  const insumosPlanilhaPorComposicao = useMemo(() => {
    const m = new Map<string, Array<{ key: string; valorUnit: number }>>();
    for (const row of linhasAnaliticoOrcamento) {
      if (row.kind === 'insumo') {
        const arr = m.get(row.parentKey) ?? [];
        arr.push({ key: row.key, valorUnit: row.valorUnit });
        m.set(row.parentKey, arr);
      }
    }
    return m;
  }, [linhasAnaliticoOrcamento]);

  const resumoFinanceiro = useMemo(() => {
    const descontoPct = parsePercentualMeta(meta.descontoPercentual);
    const bdiPct = parsePercentualMeta(meta.bdiPercentual);

    const totalBase = total;
    const valorDesconto = totalBase * descontoPct;
    const totalComDesconto = totalBase - valorDesconto;
    const totalComDescontoEBdi = totalComDesconto * (1 + bdiPct);
    const reajustes = (meta.reajustes ?? []).map((r, idx) => ({
      idx,
      nome: (r.nome || '').trim() || `${idx + 1}º reajuste`,
      percentualPct: parsePercentualMeta(r.percentual)
    }));

    let acumulado = totalComDescontoEBdi;
    const reajustesAplicados = reajustes.map((r) => {
      acumulado = acumulado * (1 + r.percentualPct);
      return {
        ...r,
        valor: acumulado
      };
    });
    const valorFinal = reajustesAplicados.length > 0
      ? reajustesAplicados[reajustesAplicados.length - 1]!.valor
      : totalComDescontoEBdi;

    return {
      descontoPct,
      bdiPct,
      totalBase,
      valorDesconto,
      totalComDesconto,
      totalComDescontoEBdi,
      reajustesAplicados,
      valorFinal
    };
  }, [meta.bdiPercentual, meta.descontoPercentual, meta.reajustes, total]);

  /** Rodapé da Ficha de demanda: totais por MA/MO/LO e painel de faturamento vs orçamento. */
  const resumoRodapeFichaDemanda = useMemo(() => {
    let precoMa = 0;
    let precoMo = 0;
    let precoLo = 0;
    let temMa = false;
    let temMo = false;
    let temLo = false;

    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind !== 'insumo') continue;
      if (insumoExcluirCaixinhaRodape(l.descricao)) continue;
      const qC = planilhaQuantidadeCompra[l.key];
      const vReal = planilhaValorUnitCompraReal[l.key];
      if (qC === undefined || !Number.isFinite(qC) || vReal === undefined || !Number.isFinite(vReal)) continue;
      const val = qC * vReal;
      const g = grupoPrecoCompraInsumoPlanilha(l.key, l.categoria || '', l.descricao || '', planilhaTipoInsumo);
      if (g === 'MA') {
        precoMa += val;
        temMa = true;
      } else if (g === 'MO') {
        precoMo += val;
        temMo = true;
      } else {
        precoLo += val;
        temLo = true;
      }
    }

    let totalFaturado = 0;
    let sumEst = 0;
    let sumReal = 0;
    let temEst = false;
    let temReal = false;
    for (const r of linhasFichaDemanda) {
      if (r.kind !== 'composicao') continue;
      totalFaturado += r.quantidadeOrcamento * r.custoUnitarioOrcamento;
      if (r.precoCompraEstimado60 !== undefined && Number.isFinite(r.precoCompraEstimado60)) {
        sumEst += r.precoCompraEstimado60;
        temEst = true;
      }
      if (r.precoCompraReal !== undefined && Number.isFinite(r.precoCompraReal)) {
        sumReal += r.precoCompraReal;
        temReal = true;
      }
    }

    const valorFinalOrc = resumoFinanceiro.valorFinal;
    const relEst =
      valorFinalOrc > 0 && temEst ? (sumEst / valorFinalOrc) * 100 : null;
    const relReal =
      valorFinalOrc > 0 && temReal ? (sumReal / valorFinalOrc) * 100 : null;

    return {
      precoMa: temMa ? precoMa : null,
      precoMo: temMo ? precoMo : null,
      precoLo: temLo ? precoLo : null,
      totalFaturadoMatMoLoc: totalFaturado,
      precoCompraEstimadoTotal: temEst ? sumEst : null,
      precoCompraRealTotal: temReal ? sumReal : null,
      valorTotalOrcamentoFinal: valorFinalOrc,
      relacaoEstimadoOrcamentoPct: relEst,
      relacaoRealOrcamentoPct: relReal
    };
  }, [
    linhasAnaliticoOrcamento,
    planilhaQuantidadeCompra,
    planilhaValorUnitCompraReal,
    planilhaTipoInsumo,
    linhasFichaDemanda,
    resumoFinanceiro.valorFinal
  ]);

  // Sincroniza linhas de itens de demolição/remoção para a composição Carga de Entulho
  useEffect(() => {
    const cargaRow = itensCalculados.find(r => ehComposicaoCargaEntulho(r.item.descricao));
    if (!cargaRow) return;
    const cargaKey = cargaRow.key;
    const linhasCargaAtuais = dimensoesPorItem[cargaKey]?.linhas ?? [];
    const linhasAgregadas: LinhaMedicao[] = [];
    for (const row of itensCalculados) {
      if (row.key === cargaKey) continue;
      if (!ehItemDemolicaoOuRemocao(row.item.descricao)) continue;
      const dim = dimensoesPorItem[row.key];
      if (dim?.linhas?.length) {
        const detalhes = dim.linhas.filter(ln => !ln.cabecalhoSecao);
        if (detalhes.length === 0) continue;
        const tipoOrigem =
          row.tipoUnidade ?? inferirTipoUnidadePorDimensao(dim.linhas);
        let somaSubtotal = 0;
        let somaVolumeBruto = 0;
        let somaCComposicao = 0;
        let somaLComposicao = 0;
        let somaCM3 = 0;
        let somaLM3 = 0;
        let somaHM3 = 0;
        for (const ln of detalhes) {
          somaSubtotal += calcularQuantidadeLinha(ln, tipoOrigem);
          somaVolumeBruto += calcV(ln, tipoOrigem);
          if (tipoOrigem === 'm2') {
            const n = ln.N && ln.N > 0 ? ln.N : 1;
            somaCComposicao += (ln.C || 0) * n;
            somaLComposicao += (ln.L || 0) * n;
          }
          if (tipoOrigem === 'm3') {
            const n = ln.N && ln.N > 0 ? ln.N : 1;
            somaCM3 += (ln.C || 0) * n;
            somaLM3 += (ln.L || 0) * n;
            somaHM3 += (ln.H || 0) * n;
          }
        }
        const origemLinhaId = `${row.key}|agg`;
        const nomeComp = `${row.item.descricao || ''}`.trim().slice(0, 120);
        const rotuloOrigem = rotuloItemComposicaoPorKey.get(row.key)?.trim() ?? '';
        const existenteAgg = linhasCargaAtuais.find(x => x.origemLinhaId === origemLinhaId);
        const origemM2 = tipoOrigem === 'm2';
        const origemM = tipoOrigem === 'm';
        const origemM3 = tipoOrigem === 'm3';
        linhasAgregadas.push({
          linhaAgregadaCarga: true,
          tipoOrigemMedicao: tipoOrigem,
          origemLinhaId,
          origemComposicaoRotulo: rotuloOrigem,
          origemComposicaoDescricao: row.item.descricao || '',
          descricao: nomeComp || 'Composição',
          // M²: C/L = Σ(C×N), Σ(L×N). M: C = subtotal agregado. M³: C/L/H = Σ(C×N), Σ(L×N), Σ(H×N) (leitura na carga; V e subtotal vêm de volumeM3BrutoSomado / valorManual).
          C: origemM2 ? somaCComposicao : (origemM ? somaSubtotal : origemM3 ? somaCM3 : 0),
          L: origemM2 ? somaLComposicao : (origemM ? (existenteAgg?.L ?? 0) : origemM3 ? somaLM3 : 0),
          H: origemM2 || origemM ? (existenteAgg?.H ?? 0) : origemM3 ? somaHM3 : 0,
          N: 1,
          empolamento: existenteAgg?.empolamento ?? 1,
          ...(origemM2 || origemM ? {} : { valorManual: somaSubtotal }),
          volumeM3BrutoSomado: somaVolumeBruto,
          editavelC: false,
          editavelL: origemM,
          editavelH: origemM2 || origemM
        });
      }
    }
    const atualCarga = dimensoesPorItem[cargaKey];
    const atualLinhas = atualCarga?.linhas ?? [];
    if (linhasAgregadas.length === 0 && atualLinhas.length === 0) return;
    if (JSON.stringify(linhasAgregadas.map(l => ({ ...l }))) === JSON.stringify(atualLinhas.map(l => ({ ...l })))) return;
    setDimensoesPorItem(prev => ({
      ...prev,
      [cargaKey]: {
        ...(atualCarga ?? { tipoUnidade: 'm3' as const, linhas: [] }),
        tipoUnidade: 'm3' as const,
        linhas: linhasAgregadas
      }
    }));
  }, [itensCalculados, dimensoesPorItem, rotuloItemComposicaoPorKey]);

  const setQuantidadeItem = (itemKey: string, valor: number) => {
    setQuantidadesPorItem(prev => ({ ...prev, [itemKey]: Math.max(0, valor) }));
  };

  const setDimensoesItem = (itemKey: string, d: DimensoesItem | null) => {
    if (!d) {
      setDimensoesPorItem(prev => { const n = { ...prev }; delete n[itemKey]; return n; });
      return;
    }
    setDimensoesPorItem(prev => ({ ...prev, [itemKey]: d }));
  };

  const addLinhaMedicao = (itemKey: string, inserirAposIdx?: number) => {
    const rowTipo = itensCalculados.find(r => r.key === itemKey)?.tipoUnidade;
    const atual =
      dimensoesPorItem[itemKey] || { tipoUnidade: rowTipo && rowTipo !== 'un' ? rowTipo : 'm3', linhas: [] };
    const novaLinha = { descricao: '', C: 0, L: 0, H: 0, N: 1, empolamento: 1 };
    const linhas = [...atual.linhas];
    if (
      inserirAposIdx !== undefined &&
      inserirAposIdx >= 0 &&
      inserirAposIdx < linhas.length
    ) {
      linhas.splice(inserirAposIdx + 1, 0, novaLinha);
    } else {
      linhas.push(novaLinha);
    }
    setDimensoesPorItem(prev => ({
      ...prev,
      [itemKey]: {
        ...atual,
        linhas
      }
    }));
  };

  const addLinhaCabecalhoSecaoMedicao = (itemKey: string, inserirAposIdx?: number) => {
    const rowTipo = itensCalculados.find(r => r.key === itemKey)?.tipoUnidade;
    const atual =
      dimensoesPorItem[itemKey] || { tipoUnidade: rowTipo && rowTipo !== 'un' ? rowTipo : 'm3', linhas: [] };
    const novaLinha: LinhaMedicao = {
      cabecalhoSecao: true,
      descricao: 'DESCRIÇÃO: ',
      C: 0,
      L: 0,
      H: 0,
      N: 1,
      empolamento: 1
    };
    const linhas = [...atual.linhas];
    if (
      inserirAposIdx !== undefined &&
      inserirAposIdx >= 0 &&
      inserirAposIdx < linhas.length
    ) {
      linhas.splice(inserirAposIdx + 1, 0, novaLinha);
    } else {
      linhas.push(novaLinha);
    }
    setDimensoesPorItem(prev => ({
      ...prev,
      [itemKey]: {
        ...atual,
        linhas
      }
    }));
  };

  const updateLinhaMedicao = (itemKey: string, idx: number, campo: keyof LinhaMedicao, valor: number | string) => {
    const atual = dimensoesPorItem[itemKey];
    if (!atual?.linhas?.[idx]) return;
    const novaLinhas = [...atual.linhas];
    const v = campo === 'descricao' ? valor : (typeof valor === 'number' ? valor : parseFloat(String(valor)) || 0);
    const updated: LinhaMedicao = { ...novaLinhas[idx], [campo]: v } as LinhaMedicao;
    if (campo === 'C' || campo === 'L' || campo === 'H' || campo === 'N') {
      updated.valorManual = undefined;
    }
    novaLinhas[idx] = updated;
    setDimensoesPorItem(prev => ({ ...prev, [itemKey]: { ...atual, linhas: novaLinhas } }));
  };

  const updateRotuloColunaMedicao = (
    itemKey: string,
    campo: 'descricao' | 'C' | 'L' | 'H' | 'N' | 'pct',
    rotulo: string
  ) => {
    const rowTipo = itensCalculados.find(r => r.key === itemKey)?.tipoUnidade;
    const atual =
      dimensoesPorItem[itemKey] ||
      ({ tipoUnidade: rowTipo && rowTipo !== 'un' ? rowTipo : 'm3', linhas: [] } as DimensoesItem);
    setDimensoesPorItem(prev => ({
      ...prev,
      [itemKey]: {
        ...atual,
        rotulosColunas: {
          ...(atual.rotulosColunas ?? {}),
          [campo]: rotulo
        }
      }
    }));
  };

  const handleCalcBlur = (draftKey: string, raw: string, onCommit: (n: number) => void) => {
    const n = parseMedicaoBlurNumber(raw);
    onCommit(n ?? 0);
    setDraftCalc(p => { const n = { ...p }; delete n[draftKey]; return n; });
  };

  const handleCalcChange = (draftKey: string, raw: string, onCommit: (n: number) => void) => {
    setDraftCalc(p => ({ ...p, [draftKey]: raw }));
    const n = parseCalcOrNumber(raw);
    if (n !== null) onCommit(n);
  };

  const commitPlanilhaQtdCompra = (lineKey: string, raw: string) => {
    const n = parsePlanilhaCalcOrPtBr(raw);
    setPlanilhaQuantidadeCompra(prev => {
      const next = { ...prev };
      if (n === null) delete next[lineKey];
      else next[lineKey] = Math.max(0, n);
      return next;
    });
    setPlanilhaCompraDraft(p => {
      const x = { ...p };
      delete x[`q|${lineKey}`];
      return x;
    });
  };

  const commitPlanilhaVlCompraReal = (lineKey: string, raw: string) => {
    const n = parsePlanilhaCalcOrPtBr(raw);
    setPlanilhaValorUnitCompraReal(prev => {
      const next = { ...prev };
      if (n === null) delete next[lineKey];
      else next[lineKey] = Math.max(0, n);
      return next;
    });
    setPlanilhaCompraDraft(p => {
      const x = { ...p };
      delete x[`v|${lineKey}`];
      return x;
    });
  };

  const handlePlanilhaQtdCompraChange = (lineKey: string, raw: string) => {
    setPlanilhaCompraDraft((p) => ({ ...p, [`q|${lineKey}`]: raw }));
    const n = parsePlanilhaCalcOrPtBr(raw);
    if (String(raw || '').trim() === '') {
      setPlanilhaQuantidadeCompra((prev) => {
        const next = { ...prev };
        delete next[lineKey];
        return next;
      });
      return;
    }
    if (n !== null) {
      setPlanilhaQuantidadeCompra((prev) => ({ ...prev, [lineKey]: Math.max(0, n) }));
    }
  };

  const handlePlanilhaVlCompraRealChange = (lineKey: string, raw: string) => {
    setPlanilhaCompraDraft((p) => ({ ...p, [`v|${lineKey}`]: raw }));
    const n = parsePlanilhaCalcOrPtBr(raw);
    if (String(raw || '').trim() === '') {
      setPlanilhaValorUnitCompraReal((prev) => {
        const next = { ...prev };
        delete next[lineKey];
        return next;
      });
      return;
    }
    if (n !== null) {
      setPlanilhaValorUnitCompraReal((prev) => ({ ...prev, [lineKey]: Math.max(0, n) }));
    }
  };

  const novoInsumoManualAnaliticoVazio = (parentKey: string): InsumoAnaliticoManual => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parentKey,
    tipo: 'Insumo',
    codigo: '',
    banco: '',
    descricao: '',
    und: '',
    quant: '',
    quantidadeReal: '',
    quantidadeOrcada: '',
    valorUnit: ''
  });

  const addInsumoManualAnalitico = (parentKey: string) => {
    const novo = novoInsumoManualAnaliticoVazio(parentKey);
    setInsumosAnaliticoManuais((prev) => ({
      ...prev,
      [parentKey]: [...(prev[parentKey] ?? []), novo]
    }));
  };

  const addInsumoManualAnaliticoApos = (parentKey: string, inserirAposIdx: number) => {
    const novo = novoInsumoManualAnaliticoVazio(parentKey);
    setInsumosAnaliticoManuais((prev) => {
      const lista = [...(prev[parentKey] ?? [])];
      const pos = Math.min(Math.max(0, inserirAposIdx + 1), lista.length);
      lista.splice(pos, 0, novo);
      return { ...prev, [parentKey]: lista };
    });
  };

  const updateInsumoManualAnalitico = (
    parentKey: string,
    id: string,
    campo: keyof Omit<InsumoAnaliticoManual, 'id' | 'parentKey'>,
    valor: string
  ) => {
    setInsumosAnaliticoManuais((prev) => ({
      ...prev,
      [parentKey]: (prev[parentKey] ?? []).map((ins) => (ins.id === id ? { ...ins, [campo]: valor } : ins))
    }));
  };

  const removerInsumoManualAnalitico = (parentKey: string, id: string) => {
    setInsumosAnaliticoManuais((prev) => ({
      ...prev,
      [parentKey]: (prev[parentKey] ?? []).filter((ins) => ins.id !== id)
    }));
  };

  const normalizarNumeroManualAnalitico = (
    parentKey: string,
    id: string,
    campo: 'quant' | 'quantidadeReal' | 'quantidadeOrcada' | 'valorUnit',
    casas = 2
  ) => {
    const atual = (insumosAnaliticoManuais[parentKey] ?? []).find((ins) => ins.id === id);
    if (!atual) return;
    const raw = atual[campo];
    const n = parseCalcOrNumber(raw);
    if (n === null) return;
    updateInsumoManualAnalitico(
      parentKey,
      id,
      campo,
      n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
    );
  };

  const removeLinhaMedicao = (itemKey: string, idx: number) => {
    const atual = dimensoesPorItem[itemKey];
    if (!atual?.linhas?.length) return;
    const novaLinhas = atual.linhas.filter((_, i) => i !== idx);
    if (novaLinhas.length === 0) {
      setDimensoesPorItem(prev => { const n = { ...prev }; delete n[itemKey]; return n; });
    } else {
      setDimensoesPorItem(prev => ({ ...prev, [itemKey]: { ...atual, linhas: novaLinhas } }));
    }
  };

  const exportarMemoriaCalculo = () => {
    if (itensCalculados.length === 0) {
      toast.error('Não há itens no orçamento para exportar.');
      return;
    }
    const nomeContrato = costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.name || costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.code || centroCustoId || 'Contrato';
    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['Gennesis Engenharia e Consultoria LTDA | CNPJ 17.851.596/0001-36 | gennesis.sedes@gmail.com | SHIS QI 15, Sobreloja 55, Lago Sul - Brasília/DF'],
      [''],
      ['PROJETO/SETOR:', nomeContrato, '', '', 'STATUS:', 'ORÇADO'],
      ['DESCRIÇÃO:', '', '', '', 'DS/Nº da Pasta:', ''],
      ['DATA DE ENVIO:', dataEmissao],
      [''],
      ['MEMÓRIA DE CÁLCULO DOS QUANTITATIVOS'],
      [''],
      [
        'LEGENDA: C= Comprimento | L= Largura | H= Altura | A= Área | V= Volume | % Empolamento= fator 1,10/1,20/1,30 | M= Metro | UN= quantidade nas colunas N e Subtotal'
      ],
      [''],
      ['DISCRIMINAÇÃO DOS SERVIÇOS'],
      ['CÓDIGO', 'DESCRIÇÃO', 'UN', 'C', 'L', 'H', '%', 'N', 'A', 'V', 'SUBTOTAL']
    ];

    const unidadeLabel = (t: TipoUnidadeFormula) => ({ m3: 'M³', m2: 'M²', m: 'M', un: 'UN' }[t] || 'UN');
    const totalMemoriaExport = itensCalculados.reduce((acc, r) => acc + r.total, 0);
    let idxServico = 0;
    const formulaCells: { cell: string; formula: string }[] = [];

    for (const row of itensCalculados) {
      const codigo = `${Math.floor(idxServico / 10) + 1}.${(idxServico % 10) + 1}`;
      const descricaoBase = `${row.item.codigo} ${row.item.banco} - ${row.item.descricao || ''}`;
      const tipoAuto = row.tipoUnidade ?? inferirTipoUnidadePorDimensao(row.dimensoes?.linhas);
      const un = row.unidadeComposicao?.trim() || unidadeLabel(tipoAuto);
      /** Itens em unidade (peça/UN): mesma ordem do orçamento; quantidade em N e Subtotal. */
      if (row.tipoUnidade === 'un') {
        rows.push([
          codigo,
          descricaoBase,
          un,
          '',
          '',
          '',
          '',
          row.quantidade,
          '',
          '',
          row.quantidade
        ]);
        idxServico++;
        continue;
      }

      if (row.dimensoes?.linhas?.length) {
        /** Linha só do nome da composição: medidas (C…Subtotal) em branco. */
        rows.push([codigo, descricaoBase, un, '', '', '', '', '', '', '', '']);
        for (let i = 0; i < row.dimensoes.linhas.length; i++) {
          const ln = row.dimensoes.linhas[i];
          const descBase = ln.descricao?.trim() || `Medição ${i + 1}`;
          const descLinha = ln.origemComposicaoRotulo?.trim()
            ? `${ln.origemComposicaoRotulo.trim()} ${descBase}`.trim()
            : descBase;
          const unLinha =
            ln.linhaAgregadaCarga && ln.tipoOrigemMedicao
              ? unidadeLabel(ln.tipoOrigemMedicao)
              : un;
          if (ln.cabecalhoSecao) {
            rows.push(['', descLinha, unLinha, '', '', '', '', '', '', '', '']);
            continue;
          }
          const empolRaw = ln.empolamento ?? ((ln as unknown as { percPerda?: number }).percPerda != null ? 1 + (ln as unknown as { percPerda: number }).percPerda / 100 : 0);
          const empol = (empolRaw != null && empolRaw > 0) ? empolRaw : 1;
          rows.push([
            '',
            descLinha,
            unLinha,
            ln.C ?? '',
            ln.L ?? '',
            ln.H ?? '',
            empol,
            ln.N ?? 1,
            '',
            '',
            ''
          ]);
          const r = rows.length;
          const col = (c: number) => String.fromCharCode(64 + c);
          const D = col(4); const E = col(5); const F = col(6); const G = col(7); const H = col(8); const I = col(9); const J = col(10); const K = col(11);
          const tipo = tipoAuto;
          if (ln.linhaAgregadaCarga) {
            const vol = calcV(ln, tipo);
            const sub = calcularQuantidadeLinha(ln, tipo);
            rows[r - 1][8] = ln.tipoOrigemMedicao === 'm2' ? (ln.volumeM3BrutoSomado ?? 0) : '';
            rows[r - 1][9] = vol;
            rows[r - 1][10] = sub;
            continue;
          }
          if (tipo === 'm3') {
            formulaCells.push({ cell: `${I}${r}`, formula: `=${D}${r}*${E}${r}*${H}${r}` });
            formulaCells.push({ cell: `${J}${r}`, formula: `=${I}${r}*${F}${r}` });
            formulaCells.push({ cell: `${K}${r}`, formula: `=${J}${r}*${G}${r}` });
          } else if (tipo === 'm2') {
            formulaCells.push({ cell: `${I}${r}`, formula: `=${D}${r}*${E}${r}*${H}${r}` });
            formulaCells.push({ cell: `${J}${r}`, formula: `=${I}${r}` });
            formulaCells.push({ cell: `${K}${r}`, formula: `=${I}${r}*${G}${r}` });
          } else if (tipo === 'm') {
            formulaCells.push({ cell: `${I}${r}`, formula: '' });
            formulaCells.push({ cell: `${J}${r}`, formula: `=${D}${r}*${H}${r}` });
            formulaCells.push({ cell: `${K}${r}`, formula: `=${J}${r}*${G}${r}` });
          } else {
            const qtd = calcularQuantidadeLinha(ln, tipo);
            rows[rows.length - 1][8] = qtd; rows[rows.length - 1][9] = qtd; rows[rows.length - 1][10] = qtd;
          }
        }
      } else {
        rows.push([codigo, descricaoBase, un, '', '', '', '', '', row.quantidade, row.quantidade, row.quantidade]);
      }
      idxServico++;
    }

    rows.push(['']);
    rows.push(['', '', '', '', '', '', '', '', '', 'TOTAL GERAL', totalMemoriaExport]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    formulaCells.forEach(({ cell, formula }) => {
      if (formula) {
        if (!ws[cell]) ws[cell] = {};
        ws[cell].f = formula;
        ws[cell].t = 'n';
      }
    });
    ws['!cols'] = [
      { wch: 8 }, { wch: 50 }, { wch: 6 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 6 },
      { wch: 10 }, { wch: 10 }, { wch: 12 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Memória de Cálculo');
    const nomeArquivo = `Memoria_Calculo_Quantitativos_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Memória de cálculo exportada com sucesso.');
  };

  const exportarOrcamentoDetalhado = () => {
    if (itensCalculados.length === 0) {
      toast.error('Não há itens no orçamento para exportar.');
      return;
    }

    const nomeContrato =
      costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.name ||
      costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.code ||
      centroCustoId ||
      'Contrato';

    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const numeracaoExport: { servicoNum: number; subNum: number }[] = [];
    let lastServicoNome = '';
    let servicoNumExport = 0;
    let subNumExport = 0;
    for (const b of subtitulosAdicionados) {
      if (b.servicoNome !== lastServicoNome) {
        servicoNumExport++;
        subNumExport = 0;
        lastServicoNome = b.servicoNome;
      }
      subNumExport++;
      numeracaoExport.push({ servicoNum: servicoNumExport, subNum: subNumExport });
    }

    const linhaVaziaOrcExport = () =>
      ['', '', '', '', '', '', '', '', '', '', '', '', '', ''] as (string | number)[];

    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['ORÇAMENTO DETALHADO'],
      ['CONTRATO', nomeContrato],
      ['DATA', dataEmissao],
      [''],
      [
        'ITEM',
        'CÓDIGO',
        'BANCO',
        'CHAVE',
        'DESCRIÇÃO',
        'UNIDADE',
        'QUANTIDADE',
        'MÃO DE OBRA',
        'MATERIAL',
        'MAT + M.O',
        'SUB MÃO DE OBRA',
        'SUB MATERIAL',
        'SUB MAT + M.O',
        'PESO %'
      ]
    ];

    let prevServicoExport = '';
    subtitulosAdicionados.forEach((bloco, blocoIdx) => {
      const { servicoNum, subNum } = numeracaoExport[blocoIdx] ?? { servicoNum: blocoIdx + 1, subNum: 1 };
      const mesmoTituloSubtitulo =
        bloco.servicoNome.trim().toLowerCase() === bloco.subtituloNome.trim().toLowerCase();

      if (bloco.servicoNome !== prevServicoExport) {
        const linhaTitulo = linhaVaziaOrcExport();
        linhaTitulo[0] = servicoNum;
        linhaTitulo[4] = String(bloco.servicoNome || '').toUpperCase();
        rows.push(linhaTitulo);
        prevServicoExport = bloco.servicoNome;
      }

      if (!mesmoTituloSubtitulo) {
        const linhaSub = linhaVaziaOrcExport();
        linhaSub[0] = `${servicoNum}.${subNum}`;
        linhaSub[4] = String(bloco.subtituloNome || '').toUpperCase();
        rows.push(linhaSub);
      }

      const rowsDoBloco = itensCalculados.filter(
        r => r.servicoNome === bloco.servicoNome && r.subtituloNome === bloco.subtituloNome
      );

      rowsDoBloco.forEach((row, rowIdx) => {
        const itemN = mesmoTituloSubtitulo
          ? `${servicoNum}.${rowIdx + 1}`
          : `${servicoNum}.${subNum}.${rowIdx + 1}`;
        const chaveItem = row.item.chave || normalizarChave(row.item.codigo, row.item.banco);
        rows.push([
          itemN,
          row.item.codigo,
          row.item.banco,
          chaveItem,
          row.item.descricao || '',
          row.unidadeComposicao || '',
          roundTo(row.quantidade, 4),
          formatarBRLExport(row.maoDeObraUnitario),
          formatarBRLExport(row.materialUnitario),
          formatarBRLExport(row.precoUnitario),
          formatarBRLExport(row.subMaoDeObra),
          formatarBRLExport(row.subMaterial),
          formatarBRLExport(row.total),
          formatarPesoPctExport(total > 0 ? (row.total / total) * 100 : 0)
        ]);
      });
    });

    const rf = resumoFinanceiro;
    const pctLabel2 = (p: number) =>
      (p * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pctLabel5 = (p: number) =>
      (p * 100).toLocaleString('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 });

    const pushLinhaResumo = (rotulo: string, valor: number) => {
      const r = linhaVaziaOrcExport();
      r[11] = rotulo;
      r[12] = formatarBRLExport(valor);
      rows.push(r);
    };

    rows.push(linhaVaziaOrcExport());
    pushLinhaResumo('TOTAL', rf.totalBase);
    pushLinhaResumo(`DESCONTO (${pctLabel2(rf.descontoPct)}%)`, rf.valorDesconto);
    pushLinhaResumo('TOTAL COM DESCONTO', rf.totalComDesconto);
    pushLinhaResumo(`TOTAL GERAL COM DESCONTO E BDI (${pctLabel2(rf.bdiPct)}%)`, rf.totalComDescontoEBdi);
    rf.reajustesAplicados.forEach((r) => {
      pushLinhaResumo(`${r.nome.toUpperCase()} (${pctLabel5(r.percentualPct)}%)`, r.valor);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 },
      { wch: 12 },
      { wch: 10 },
      { wch: 14 },
      { wch: 48 },
      { wch: 9 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 16 },
      { wch: 16 },
      { wch: 16 },
      { wch: 12 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Orçamento Detalhado');
    const nomeArquivo = `Orcamento_Detalhado_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Orçamento detalhado exportado com sucesso.');
  };

  const resolverAnaliticoComposicao = useCallback(
    (
      linha: any
    ): {
      info: { codigo: string; banco: string; descricao: string };
      data: AnaliticoComposicao;
      seedKeyParaCache: string | null;
    } | null => {
      const item: ItemServico = linha?.item;
      if (!item) return null;

      const composicaoDaLinha = composicaoResolvidaDoItemServico(item, mapaComposicoes);

      const info = {
        codigo: item.codigo,
        banco: item.banco,
        descricao: item.descricao || ''
      };

      const materialUnitario = Number(linha?.materialUnitario ?? 0);
      const maoDeObraUnitario = Number(linha?.maoDeObraUnitario ?? 0);

      if (ehComposicaoCacamba4m3(item.descricao)) {
        return {
          info,
          data: gerarAnaliticoCacamba4m3(materialUnitario, maoDeObraUnitario),
          seedKeyParaCache: null
        };
      }

      if (composicaoDaLinha?.analiticoLinhas?.length) {
        const totalAnalitico = composicaoDaLinha.analiticoLinhas.reduce((acc, l) => acc + (l.total || 0), 0);
        return {
          info,
          data: {
            total: totalAnalitico,
            linhas: composicaoDaLinha.analiticoLinhas
          },
          seedKeyParaCache: null
        };
      }

      const seedKey = `${item.codigo}|${item.banco}|${item.chave || ''}`;
      const unitAnalitico = analiticoCache[seedKey] ?? gerarAnaliticoComposicaoUnit(materialUnitario, maoDeObraUnitario, seedKey);
      return {
        info,
        data: unitAnalitico,
        seedKeyParaCache: analiticoCache[seedKey] ? null : seedKey
      };
    },
    [mapaComposicoes, analiticoCache]
  );

  useEffect(() => {
    if (orcamentoViewTab !== 'memorial' || meta?.importadoPlanilha) return;
    if (itensMemoriaCalculoLista.length === 0) {
      setMemorialItemKey(null);
      return;
    }
    const existe = memorialItemKey && itensMemoriaCalculoLista.some(r => r.key === memorialItemKey);
    if (!existe) {
      setMemorialItemKey(itensMemoriaCalculoLista[0].key);
    }
  }, [orcamentoViewTab, itensMemoriaCalculoLista, memorialItemKey, meta?.importadoPlanilha]);

  useEffect(() => {
    if (orcamentoViewTab !== 'memorial' || !memorialItemKey || meta?.importadoPlanilha) return;
    const el = document.getElementById(`memorial-medicoes-${memorialItemKey}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [orcamentoViewTab, memorialItemKey, meta?.importadoPlanilha]);

  const exportarAnalitico = () => {
    if (itensCalculados.length === 0) {
      toast.error('Não há itens no orçamento para gerar o analítico.');
      return;
    }

    const nomeContrato =
      costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.name ||
      costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.code ||
      centroCustoId ||
      'Contrato';

    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['Gennesis Engenharia e Consultoria LTDA | CNPJ 17.851.596/0001-36 | gennesis.sedes@gmail.com | SHIS QI 15, Sobreloja 55, Lago Sul - Brasília/DF'],
      [''],
      ['PROJETO/SETOR:', nomeContrato, '', '', 'STATUS:', 'ORÇADO'],
      ['DATA DE ENVIO:', dataEmissao],
      [''],
      ['ANALÍTICO DO ORÇAMENTO (COMPOSIÇÕES)'],
      [''],
      ['SERVIÇO', 'SUBTÍTULO', 'CÓDIGO', 'BANCO', 'DESCRIÇÃO', 'CATEGORIA', 'DESCRIÇÃO INSUMO', 'UN', 'QUANTIDADE', 'Preço Unit.', 'TOTAL (R$)']
    ];

    let totalGeral = 0;
    for (const linha of itensCalculados) {
      totalGeral += linha.total;
      const item = linha.item;
      const quantidadeItem = Number(linha.quantidade ?? 0);

      const materialUnitario = Number(linha.materialUnitario ?? 0);
      const maoDeObraUnitario = Number(linha.maoDeObraUnitario ?? 0);
      const seedKey = `${item.codigo}|${item.banco}|${item.chave || ''}`;
      const composicaoDaLinha = composicaoResolvidaDoItemServico(item, mapaComposicoes);

      const unitAnalitico = ehComposicaoCacamba4m3(item.descricao)
        ? gerarAnaliticoCacamba4m3(materialUnitario, maoDeObraUnitario)
        : composicaoDaLinha?.analiticoLinhas?.length
          ? {
              total: composicaoDaLinha.analiticoLinhas.reduce((acc, l) => acc + (l.total || 0), 0),
              linhas: composicaoDaLinha.analiticoLinhas
            }
          : analiticoCache[seedKey] ?? gerarAnaliticoComposicaoUnit(materialUnitario, maoDeObraUnitario, seedKey);

      for (const l of unitAnalitico.linhas) {
        rows.push([
          linha.servicoNome,
          linha.subtituloNome,
          item.codigo,
          item.banco,
          item.descricao || '',
          l.tipoLabel ? tipoInsumoCodigoParaDescricao(l.tipoLabel) : l.categoria,
          l.descricao,
          l.unidade,
          roundTo(l.quantidade * quantidadeItem, 4),
          l.precoUnitario,
          roundTo(l.total * quantidadeItem, 2)
        ]);
      }
    }

    rows.push(['TOTAL GERAL', '', '', '', '', '', '', '', '', '', roundTo(totalGeral, 2)]);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 26 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 44 },
      { wch: 16 }, { wch: 30 }, { wch: 8 }, { wch: 14 }, { wch: 12 }, { wch: 14 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analítico');
    const nomeArquivo = `Analitico_Composicoes_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Analítico exportado com sucesso.');
  };

  const nomeContratoExport = () =>
    costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.name ||
    costCenters?.find((cc: { id?: string }) => cc.id === centroCustoId)?.code ||
    centroCustoId ||
    'Contrato';

  /** Exporta a grade da aba Orçamento analítico (mesmas colunas da tela). */
  const exportarOrcamentoAnaliticoTabela = () => {
    if (linhasAnaliticoOrcamento.length === 0) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['ORÇAMENTO ANALÍTICO'],
      ['CONTRATO', nomeContrato],
      ['DATA', dataEmissao],
      [''],
      [
        'Item',
        'Tipo',
        'Código',
        'Banco',
        'Descrição',
        'Und',
        'Quant.',
        'Quantidade real',
        'Quantidade orçada',
        'Valor unit.',
        'Total'
      ]
    ];
    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind === 'tituloServico') {
        rows.push([l.main, '', '', '', l.servicoNome, '', '', '', '', '', '']);
        continue;
      }
      if (l.kind === 'subtituloBloco') {
        rows.push([`${l.main}.${l.subIdx}`, '', '', '', l.texto, '', '', '', '', '', '']);
        continue;
      }
      if (l.kind === 'composicao') {
        rows.push([
          l.item,
          l.tipo,
          l.codigo,
          l.banco,
          l.descricao,
          l.und,
          l.quantidadeReal,
          l.quantidadeReal,
          l.quantidadeOrcada,
          l.valorUnit,
          l.total
        ]);
        continue;
      }
      rows.push([
        l.item,
        l.tipo,
        l.codigo || '—',
        l.banco || '—',
        l.descricao,
        l.und,
        l.quantidadeReal,
        l.quantidadeReal,
        l.quantidadeOrcada,
        l.valorUnit,
        l.total
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 48 },
      { wch: 8 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 14 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Analítico');
    const nomeArquivo = `Orcamento_Analitico_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Orçamento analítico exportado com sucesso.');
  };

  /** Planilha analítica (compras e custos) — alinhado à grade da aba. */
  const exportarPlanilhaAnalitica = () => {
    if (linhasAnaliticoOrcamento.length === 0) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
    const dataEmissao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const pctExportMap = new Map<
      string,
      {
        levantamentoPct?: number;
        precoUnitarioRelPct?: number;
        faturamentoPct?: number;
        pctCustoValorPago?: number;
      }
    >();
    for (const r of linhasFichaDemanda) {
      pctExportMap.set(r.key, {
        levantamentoPct: r.levantamentoPct,
        precoUnitarioRelPct: r.precoUnitarioRelPct,
        faturamentoPct: r.faturamentoPct,
        pctCustoValorPago: r.pctCustoValorPago
      });
    }
    const fmtPctPlanilhaExport = (p: number | undefined) =>
      p !== undefined && Number.isFinite(p)
        ? `${p.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
        : '';
    const rows: (string | number)[][] = [
      ['GENNESIS ENGENHARIA E CONSULTORIA'],
      ['PLANILHA ANALÍTICA'],
      ['CONTRATO', nomeContrato],
      ['DATA', dataEmissao],
      [''],
      [
        'Item',
        'Código',
        'Banco',
        'Serviço',
        'Tipo',
        'UN',
        'Quantidade',
        'Valor unit. orçamento',
        'Total orçamento',
        'Valor unit. estimado',
        'Custo estimado',
        'Quantidade compra',
        'Valor unit. compra real',
        'Custo compra real',
        '% Qtd. solicitada',
        '% Valor total',
        '% Custo / valor pago',
        'Observação'
      ]
    ];
    for (const l of linhasAnaliticoOrcamento) {
      if (l.kind === 'tituloServico') {
        rows.push([l.main, '', '', l.servicoNome, '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        continue;
      }
      if (l.kind === 'subtituloBloco') {
        rows.push([`${l.main}.${l.subIdx}`, '', '', l.texto, '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
        continue;
      }
      if (l.kind === 'composicao') {
        const filhos = insumosPlanilhaPorComposicao.get(l.key) ?? [];
        let sumQtdCompra = 0;
        const sumCustoEst = l.total * PLANILHA_FATOR_CUSTO_ESTIMADO;
        let sumCustoReal = 0;
        let sumQtdCompraComVlReal = 0;
        let temQtdCompra = false;
        let somaVlUnitCompraRealInsumos = 0;
        let temAlgumVlUnitCompraReal = false;
        for (const ins of filhos) {
          const qC = planilhaQuantidadeCompra[ins.key];
          const vReal = planilhaValorUnitCompraReal[ins.key];
          const vOrc = ins.valorUnit;
          if (vReal !== undefined && Number.isFinite(vReal)) {
            somaVlUnitCompraRealInsumos += vReal;
            temAlgumVlUnitCompraReal = true;
          }
          if (qC !== undefined && Number.isFinite(qC)) {
            temQtdCompra = true;
            sumQtdCompra += qC;
            if (vReal !== undefined && Number.isFinite(vReal)) {
              sumCustoReal += qC * vReal;
              sumQtdCompraComVlReal += qC;
            }
          }
        }
        const vlUnitCompraRealAgreg = temAlgumVlUnitCompraReal ? somaVlUnitCompraRealInsumos : null;
        const pe = pctExportMap.get(l.key);
        rows.push([
          l.item,
          l.codigo,
          l.banco,
          l.descricao,
          '',
          l.und,
          l.quantidadeReal,
          l.valorUnit,
          l.total,
          '',
          roundTo(sumCustoEst, 2),
          temQtdCompra ? sumQtdCompra : '',
          vlUnitCompraRealAgreg !== null ? roundTo(vlUnitCompraRealAgreg, 2) : '',
          sumQtdCompraComVlReal > 0 ? roundTo(sumCustoReal, 2) : '',
          fmtPctPlanilhaExport(pe?.levantamentoPct),
          fmtPctPlanilhaExport(pe?.faturamentoPct),
          fmtPctPlanilhaExport(pe?.pctCustoValorPago),
          ''
        ]);
        continue;
      }
      const qC = planilhaQuantidadeCompra[l.key];
      const vReal = planilhaValorUnitCompraReal[l.key];
      const vOrc = l.valorUnit;
      const custoEst = l.total * PLANILHA_FATOR_CUSTO_ESTIMADO;
      const custoCompraR =
        qC !== undefined && vReal !== undefined && Number.isFinite(qC) && Number.isFinite(vReal)
          ? qC * vReal
          : null;
      const pi = pctExportMap.get(l.key);
      rows.push([
        l.item,
        l.codigo || '—',
        l.banco || '—',
        l.descricao,
        planilhaTipoInsumo[l.key] ?? tipoPlanilhaInsumo(l.categoria || ''),
        l.und || '—',
        l.quantidadeReal,
        l.valorUnit,
        l.total,
        roundTo(vOrc * PLANILHA_FATOR_CUSTO_ESTIMADO, 2),
        roundTo(custoEst, 2),
        qC !== undefined && Number.isFinite(qC) ? qC : '',
        vReal !== undefined && Number.isFinite(vReal) ? roundTo(vReal, 2) : '',
        custoCompraR !== null ? roundTo(custoCompraR, 2) : '',
        fmtPctPlanilhaExport(pi?.levantamentoPct),
        fmtPctPlanilhaExport(pi?.faturamentoPct),
        fmtPctPlanilhaExport(pi?.pctCustoValorPago),
        fichaDemandaObservacoes[l.key] ?? ''
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 44 }, { wch: 12 }, { wch: 6 },
      { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 18 }, { wch: 16 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 28 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planilha analítica');
    const nomeArquivo = `Planilha_Analitica_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, nomeArquivo);
    toast.success('Planilha analítica exportada com sucesso.');
  };

  const exportarFichaDemandaPdf = () => {
    if (linhasFichaDemanda.length === 0) {
      toast.error('Não há dados para exportar.');
      return;
    }
    const nomeContrato = nomeContratoExport();
    const pdf = new jsPDF('l', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 10;
    let y = margin;
    const trunc = (s: string, n: number) => {
      const t = String(s ?? '');
      return t.length > n ? `${t.slice(0, n - 1)}…` : t;
    };
    pdf.setFontSize(11);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Ficha de demanda', margin, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.text(`Contrato: ${trunc(nomeContrato, 100)}`, margin, y);
    y += 4;
    pdf.text(
      `Emitido em: ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
      margin,
      y
    );
    y += 7;

    const headers = [
      'Item',
      'Cod.',
      'Banco',
      'Servico',
      'UN',
      'Lev.',
      'P.unit',
      'Fat.',
      'Q.orc',
      'Q.comp',
      'Sobra',
      'CU orc',
      'CU real',
      'V.tot',
      'Est.40%',
      'P.real',
      '%C/V',
      'Tipo',
      'Obs.'
    ];
    const colW = [11, 10, 10, 32, 7, 9, 9, 9, 9, 9, 9, 11, 11, 11, 11, 11, 9, 8, 16];
    const sumW = colW.reduce((a, b) => a + b, 0);
    const scale = (pageW - 2 * margin) / sumW;
    const cw = colW.map(w => w * scale);
    const rowH = 4.2;
    pdf.setFontSize(5.5);
    pdf.setFont('helvetica', 'bold');
    let x = margin;
    headers.forEach((h, i) => {
      pdf.text(trunc(h, 18), x + 0.5, y + 3);
      x += cw[i];
    });
    y += rowH;
    pdf.setDrawColor(200, 200, 200);
    pdf.line(margin, y - 1, pageW - margin, y - 1);
    pdf.setFont('helvetica', 'normal');

    const fmtPct = (n: number | undefined) =>
      n !== undefined && Number.isFinite(n) ? `${n.toFixed(2)}%` : '—';
    const fmtN = (n: number | undefined) =>
      n !== undefined && Number.isFinite(n) ? n.toLocaleString('pt-BR', { maximumFractionDigits: 4 }) : '—';
    const fmtBRL = (n: number | undefined) =>
      n !== undefined && Number.isFinite(n)
        ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '—';

    const drawRow = (cells: string[]) => {
      if (y + rowH > pageH - margin) {
        pdf.addPage();
        y = margin;
      }
      x = margin;
      cells.forEach((cell, i) => {
        pdf.text(trunc(cell, 26), x + 0.5, y + 3);
        x += cw[i];
      });
      y += rowH;
    };

    for (const r of linhasFichaDemanda) {
      const ehComp = r.kind === 'composicao';
      const qCompraOk =
        !ehComp && r.quantidadeCompra !== undefined && Number.isFinite(r.quantidadeCompra);
      const sobra =
        qCompraOk ? r.quantidadeOrcamento - r.quantidadeCompra! : null;
      const levantStr = ehComp
        ? fmtN(r.quantidadeOrcamento)
        : r.levantamentoPct !== undefined && Number.isFinite(r.levantamentoPct)
          ? fmtPct(r.levantamentoPct)
          : '—';
      const pUnitStr = ehComp
        ? fmtBRL(r.custoUnitarioOrcamento)
        : r.precoUnitarioRelPct !== undefined && Number.isFinite(r.precoUnitarioRelPct)
          ? fmtPct(r.precoUnitarioRelPct)
          : '—';
      const fatStr = ehComp
        ? fmtBRL(
            Number.isFinite(r.quantidadeOrcamento) && Number.isFinite(r.custoUnitarioOrcamento)
              ? r.quantidadeOrcamento * r.custoUnitarioOrcamento
              : undefined
          )
        : r.faturamentoPct !== undefined && Number.isFinite(r.faturamentoPct)
          ? fmtPct(r.faturamentoPct)
          : '—';

      drawRow([
        trunc(r.item, 20),
        trunc(String(r.codigo), 12),
        trunc(String(r.banco), 12),
        trunc(r.servico, 40),
        trunc(r.un, 6),
        levantStr,
        pUnitStr,
        fatStr,
        ehComp ? '—' : fmtN(r.quantidadeOrcamento),
        ehComp ? '—' : fmtN(r.quantidadeCompra),
        ehComp ? '—' : sobra !== null ? fmtN(sobra) : '—',
        ehComp ? '—' : fmtBRL(r.custoUnitarioOrcamento),
        ehComp ? '—' : fmtBRL(r.custoUnitarioCompraReal),
        fmtBRL(r.valorTotalOrcamento),
        fmtBRL(r.precoCompraEstimado60),
        fmtBRL(r.precoCompraReal),
        r.pctCustoValorPago !== undefined && Number.isFinite(r.pctCustoValorPago)
          ? fmtPct(r.pctCustoValorPago)
          : '—',
        trunc(tipoFichaDemandaLabel(r.tipo), 8),
        trunc(fichaDemandaObservacoes[r.key] ?? '', 40)
      ]);
    }

    y += 4;
    if (y + 24 > pageH - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.text('Resumos', margin, y);
    y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    const resumoLinhas = [
      ['Preço compra MA', resumoRodapeFichaDemanda.precoMa],
      ['Preço compra MO', resumoRodapeFichaDemanda.precoMo],
      ['Preço compra LO', resumoRodapeFichaDemanda.precoLo],
      ['Relação estimado × orçamento', resumoRodapeFichaDemanda.relacaoEstimadoOrcamentoPct],
      ['Relação real × orçamento', resumoRodapeFichaDemanda.relacaoRealOrcamentoPct],
      ['Total faturado', resumoRodapeFichaDemanda.totalFaturadoMatMoLoc],
      ['Preço de compra estimado', resumoRodapeFichaDemanda.precoCompraEstimadoTotal],
      ['Preço de compra real', resumoRodapeFichaDemanda.precoCompraRealTotal],
      ['Valor total do orçamento', resumoRodapeFichaDemanda.valorTotalOrcamentoFinal]
    ];
    for (const [lab, val] of resumoLinhas) {
      const label = String(lab);
      let v: string;
      if (val === null || val === undefined) {
        v = '—';
      } else if (typeof val === 'number') {
        const br = val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        v = label.includes('Relação') ? `${br}%` : `R$ ${br}`;
      } else {
        v = String(val);
      }
      pdf.text(`${label}: ${v}`, margin, y);
      y += 4;
    }

    const nomeArquivo = `Ficha_Demanda_${nomeContrato.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    pdf.save(nomeArquivo);
    toast.success('Ficha de demanda exportada (PDF).');
  };

  const protectedRoute = embeddedContractId
    ? ({ route: '/ponto/orcamento' as const, contractId: embeddedContractId })
    : ({ route: '/ponto/orcamento' as const, contractId: undefined as string | undefined });

  return (
    <ProtectedRoute route={protectedRoute.route} contractId={protectedRoute.contractId}>
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
        <div className="space-y-6">
          <div className={embeddedContractId ? '' : 'text-center'}>
            {embeddedContractId ? (
              <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
                <Link
                  href={`/ponto/contratos/${embeddedContractId}`}
                  aria-label="Voltar ao contrato"
                  className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                >
                  <ArrowLeft className="h-4 w-4 shrink-0" />
                  Voltar
                </Link>
                <div className="w-full max-w-3xl px-14 text-center sm:px-20">
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl break-words">
                    {rotuloContratoListaOrcamentos ?? 'Orçamento'}
                  </h1>
                  <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
                    Orçamentos
                  </p>
                </div>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl break-words">
                  {rotuloContratoListaOrcamentos ?? 'Orçamento'}
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                  Orçamentos
                </p>
              </>
            )}
          </div>

          {/* Seletor de Contrato (Centro de Custo) — oculto quando o orçamento está dentro do contrato */}
          {!lockedCostCenterId && (
          <Card>
            <CardContent className="py-5">
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/40 p-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">
                    <Building2 className="w-4 h-4" />
                    Contrato (Centro de Custo)
                  </label>
                  <div ref={contratoDropdownRef} className="relative">
                    <button
                      type="button"
                      disabled={loadingCentros}
                      onClick={e => {
                        e.stopPropagation();
                        setShowContratoDropdown(v => !v);
                      }}
                      className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-left flex items-center justify-between gap-2 disabled:opacity-50 outline-none focus:ring-2 focus:ring-red-500/80 dark:focus:ring-red-500/70 focus:border-red-500 dark:focus:border-red-500"
                    >
                      <span className="truncate min-w-0">
                        {loadingCentros
                          ? 'Carregando...'
                          : (() => {
                              if (!centroCustoId) return 'Selecione o contrato';
                              const cc = costCenters?.find((c: { id?: string }) => c.id === centroCustoId);
                              if (!cc) return 'Selecione o contrato';
                              return `${cc.code || ''} — ${cc.name || cc.code || 'Sem nome'}`;
                            })()}
                      </span>
                      {showContratoDropdown ? (
                        <ChevronUp className="w-4 h-4 shrink-0 opacity-60" />
                      ) : (
                        <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />
                      )}
                    </button>
                    {showContratoDropdown && !loadingCentros && (
                      <div
                        className="absolute z-[100] mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg max-h-64 overflow-y-auto py-1"
                        onClick={e => e.stopPropagation()}
                      >
                        <div className="sticky top-0 z-10 bg-white dark:bg-gray-800 px-3 pt-2 pb-2 border-b border-gray-100 dark:border-gray-700">
                          <div className="relative">
                            <Search className="w-4 h-4 text-gray-400 dark:text-gray-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                              ref={contratoSearchInputRef}
                              value={contratoSearch}
                              onChange={(e) => setContratoSearch(e.target.value)}
                              placeholder="Pesquisar contrato..."
                              className="w-full pl-9 pr-3 py-2 rounded-md border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/40 text-sm text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-red-500/70 focus:border-red-500 dark:focus:border-red-500"
                            />
                          </div>
                        </div>
                        {contratoSearch.trim() === '' && (
                          <button
                            type="button"
                            className={`w-full px-4 py-2.5 text-left text-sm ${
                              !centroCustoId
                                ? 'bg-red-600 text-white'
                                : 'text-gray-900 dark:text-gray-100 hover:bg-red-600 hover:text-white'
                            }`}
                            onClick={() => {
                              setCentroCustoId(null);
                              setShowContratoDropdown(false);
                            }}
                          >
                            {!centroCustoId ? 'Selecione o contrato' : 'Limpar seleção'}
                          </button>
                        )}
                        {filteredCostCenters.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                            Nenhum contrato encontrado.
                          </div>
                        ) : (
                          filteredCostCenters.map((cc: { id?: string; code?: string; name?: string }) => (
                            <button
                              key={cc.id}
                              type="button"
                              className={`w-full px-4 py-2.5 text-left text-sm ${
                                centroCustoId === cc.id
                                  ? 'bg-red-600 text-white'
                                  : 'text-gray-900 dark:text-gray-100 hover:bg-red-600 hover:text-white'
                              }`}
                              onClick={() => {
                                setCentroCustoId(cc.id || null);
                                setShowContratoDropdown(false);
                              }}
                            >
                              {cc.code || ''} — {cc.name || cc.code || 'Sem nome'}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
              </div>
            </CardContent>
          </Card>
          )}

          {/* Tabs */}
          <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
            {[
              { id: 'orcamento', label: 'Orçamentos', icon: Calculator },
              { id: 'importacoes', label: 'Importações', icon: Upload }
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as typeof activeTab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-t-lg font-medium transition-colors ${
                  activeTab === t.id
                    ? 'bg-red-600 text-white dark:bg-red-600'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab: Novo Orçamento */}
          {activeTab === 'orcamento' && (
            !centroCustoId ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500 dark:text-gray-400">
                  Selecione um contrato acima para criar orçamentos.
                </CardContent>
              </Card>
            ) : !orcamentoAtivoId ? (
              <Card className="w-full shadow-none">
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center space-x-3">
                      <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                        <Calculator className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Orçamentos</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Gestão de orçamentos do contrato e histórico de importações.
                        </p>
                      </div>
                    </div>
                    <div className="flex w-full flex-shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
                      {!carregandoListaOrcamentos && listaOrcamentos.length > 0 && (
                        <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                          <input
                            type="text"
                            value={orcamentosSearch}
                            onChange={(e) => setOrcamentosSearch(e.target.value)}
                            placeholder="Buscar orçamento..."
                            className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          />
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={criarNovoOrcamento}
                        disabled={carregandoListaOrcamentos}
                        className="inline-flex h-10 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
                      >
                        {carregandoListaOrcamentos ? (
                          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <Plus className="h-4 w-4 shrink-0" aria-hidden />
                        )}
                        Novo orçamento
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {carregandoListaOrcamentos ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-600 dark:text-gray-400">
                      <Loader2 className="h-8 w-8 shrink-0 animate-spin text-red-600 dark:text-red-400" aria-hidden />
                      <span className="text-sm font-medium">Carregando orçamentos…</span>
                    </div>
                  ) : listaOrcamentos.length === 0 ? (
                    <div className="py-8 text-center">
                      <Calculator className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" aria-hidden />
                      <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">Nenhum orçamento ainda.</p>
                      <p className="mx-auto mt-2 max-w-md text-sm text-gray-600 dark:text-gray-400">
                        Importe uma planilha para começar com dados prontos ou crie um orçamento em branco para montar do zero.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                        <span>
                          Mostrando {filteredListaOrcamentos.length > 0 ? 1 : 0} a {filteredListaOrcamentos.length} de{' '}
                          {filteredListaOrcamentos.length} {filteredListaOrcamentos.length === 1 ? 'orçamento' : 'orçamentos'}
                        </span>
                        <span>Página 1 de 1</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className={`w-full border-collapse text-sm ${gradeTableCls}`}>
                          <thead className="border-b border-gray-200 dark:border-gray-700">
                            <tr className={gradeTableRowTrCls}>
                              <th className="px-3 sm:px-6 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Orçamento
                              </th>
                              <th className="px-3 sm:px-6 py-2.5 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Atualizado
                              </th>
                              <th className="px-3 sm:px-6 py-2.5 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Ação
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                            {filteredListaOrcamentos.length === 0 ? (
                              <tr>
                                <td colSpan={3} className="px-6 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                  Nenhum orçamento encontrado para essa busca.
                                </td>
                              </tr>
                            ) : (
                              filteredListaOrcamentos.map((o) => (
                                <tr
                                  key={o.id}
                                  className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${gradeTableRowTrCls}`}
                                >
                                  <td className="max-w-[min(100%,24rem)] whitespace-nowrap px-3 py-2.5 align-middle sm:px-6">
                                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                      {o.nome}
                                    </span>
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2.5 align-middle text-left text-sm text-gray-700 dark:text-gray-300 tabular-nums sm:px-6">
                                    {o.updatedAt ? new Date(o.updatedAt).toLocaleString('pt-BR') : '—'}
                                  </td>
                                  <td className="whitespace-nowrap px-3 py-2.5 text-right align-middle sm:px-6">
                                    <div className="flex justify-end">
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                          setOrcamentoListaActionMenu((prev) => {
                                            if (prev?.orcamentoId === o.id) return null;
                                            let left = r.right - ORCAMENTO_LISTA_MENU_WIDTH_PX;
                                            left = Math.max(
                                              8,
                                              Math.min(left, window.innerWidth - ORCAMENTO_LISTA_MENU_WIDTH_PX - 8)
                                            );
                                            return { orcamentoId: o.id, nome: o.nome, top: r.bottom + 4, left };
                                          });
                                        }}
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                                        aria-label="Menu de ações"
                                        aria-expanded={orcamentoListaActionMenu?.orcamentoId === o.id}
                                        aria-haspopup="menu"
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                      {orcamentoListaActionMenu &&
                        typeof document !== 'undefined' &&
                        createPortal(
                          <>
                            <div
                              className="fixed inset-0 z-[200]"
                              aria-hidden
                              onClick={() => setOrcamentoListaActionMenu(null)}
                            />
                            <div
                              role="menu"
                              className="fixed z-[201] w-56 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 overflow-hidden"
                              style={{
                                top: orcamentoListaActionMenu.top,
                                left: orcamentoListaActionMenu.left
                              }}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const id = orcamentoListaActionMenu.orcamentoId;
                                  setOrcamentoListaActionMenu(null);
                                  abrirOrcamentoDaLista(id);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                              >
                                <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                                <span>Ver detalhes</span>
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const { orcamentoId, nome } = orcamentoListaActionMenu;
                                  setOrcamentoListaActionMenu(null);
                                  excluirOrcamentoDaLista(orcamentoId, nome);
                                }}
                                className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                              >
                                <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                                <span>Excluir</span>
                              </button>
                            </div>
                          </>,
                          document.body
                        )}
                    </>
                  )}
                </CardContent>
              </Card>
            ) : (
            <Card className="shadow-none">
              <CardHeader className="!border-b-0">
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={voltarParaListaOrcamentos}
                    className="inline-flex items-center gap-2 px-0 py-1 text-sm font-medium text-gray-800 transition-colors hover:text-red-600 dark:text-gray-200 dark:hover:text-red-400"
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
                    Voltar à lista
                  </button>

                  <div className="flex justify-center">
                    <div className="inline-flex flex-wrap items-center justify-center gap-1 p-1.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100/80 dark:bg-gray-800/70 max-w-full">
                      <button
                        type="button"
                        onClick={() => setOrcamentoViewTab('dados')}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
                          orcamentoViewTab === 'dados'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                        }`}
                      >
                        Dados
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrcamentoViewTab('montagem')}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
                          orcamentoViewTab === 'montagem'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                        }`}
                      >
                        Orçamento
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrcamentoViewTab('memorial')}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
                          orcamentoViewTab === 'memorial'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                        }`}
                      >
                        Memória de cálculo
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrcamentoViewTab('analitico')}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
                          orcamentoViewTab === 'analitico'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                        }`}
                      >
                        Orçamento analítico
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrcamentoViewTab('planilhaAnalitica')}
                        className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all outline-none ring-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
                          orcamentoViewTab === 'planilhaAnalitica'
                            ? 'bg-red-600 text-white shadow-sm'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                        }`}
                      >
                        Ficha de demanda
                      </button>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingFromApi && (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-8 sm:py-10">
                    <div className="flex flex-col items-center justify-center text-center gap-3">
                      <Loader2 className="w-7 h-7 animate-spin text-red-600 dark:text-red-400" />
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Carregando orçamento...
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Buscando dados salvos no S3. Isso pode levar alguns segundos.
                      </p>
                    </div>
                  </div>
                )}
                {!loadingFromApi && orcamentoViewTab === 'dados' && (
                  <section className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden">
                    <div className="px-4 sm:px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 break-words">
                            {nomeOrcamentoRascunho || 'Orçamento sem nome'}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={abrirEdicaoDados}
                          className="inline-flex items-center p-1.5 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                          aria-label="Editar dados"
                          title="Editar dados"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="px-4 sm:px-5 py-4 grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 mb-2.5">Identificação</p>
                        <div className="space-y-2">
                          {[
                            ['OS/Nº da pasta', meta.osNumeroPasta || '—'],
                            ['Prazo de execução (dias)', meta.prazoExecucaoDias || '—']
                          ].map(([label, value]) => (
                            <div key={label} className="grid grid-cols-[10.5rem_1fr] gap-3">
                              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 mb-2.5">Datas</p>
                        <div className="space-y-2">
                          {[
                            ['Data de abertura', meta.dataAbertura || '—'],
                            ['Data de envio', meta.dataEnvio || '—']
                          ].map(([label, value]) => (
                            <div key={label} className="grid grid-cols-[10.5rem_1fr] gap-3">
                              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 mb-2.5">Responsáveis</p>
                        <div className="space-y-2">
                          {[
                            ['Responsável pelo orçamento', meta.responsavelOrcamento || '—'],
                            ['Orçamento realizado por', meta.orcamentoRealizadoPor || '—']
                          ].map(([label, value]) => (
                            <div key={label} className="grid grid-cols-[10.5rem_1fr] gap-3">
                              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 mb-2.5">Percentuais</p>
                        <div className="space-y-2">
                          {[
                            ['Desconto (%)', meta.descontoPercentual || '0'],
                            ['BDI (%)', meta.bdiPercentual || '0']
                          ].map(([label, value]) => (
                            <div key={label} className="grid grid-cols-[10.5rem_1fr] gap-3">
                              <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="px-4 sm:px-5 py-4 border-t border-gray-200 dark:border-gray-700 grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 mb-2.5">Descrição</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                          {meta.descricao || '—'}
                        </p>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 mb-2.5">Reajustes (%)</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-words">
                          {(meta.reajustes ?? []).length > 0
                            ? meta.reajustes.map((r, idx) => `${r.nome || `Reajuste ${idx + 1}`}: ${r.percentual || '0'}%`).join(' | ')
                            : '—'}
                        </p>
                      </div>
                    </div>
                  </section>
                )}

                {!loadingFromApi && orcamentoViewTab === 'analitico' && (
                  <div className="space-y-3">
                    {linhasAnaliticoOrcamento.length === 0 ? (
                      <OrcamentoSecaoVazia
                        titulo="Orçamento analítico vazio"
                        texto="Monte serviços e itens na aba Orçamento para visualizar composições, insumos e quantidades com valores."
                        Icon={Table2}
                        onIrOrcamento={() => setOrcamentoViewTab('montagem')}
                      />
                    ) : (
                    <>
                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                      <table className={`min-w-full border-collapse ${gradeTableCls}`}>
                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
                          <tr className={gradeTableRowTrCls}>
                            <th className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Item</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Tipo</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Código</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Banco</th>
                            <th className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Descrição</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Und</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Quant.</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Quantidade real</th>
                            <th className="px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Quantidade orçada</th>
                            <th className={`${GRADE_COL_MOEDA_UNIT} px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600`}>Valor unit</th>
                            <th className="px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700">
                          {linhasAnaliticoOrcamento.map((l, idxLinha) => {
                            if (l.kind === 'tituloServico') {
                              return (
                                <tr key={l.key} className={`bg-red-600 dark:bg-red-950/90 ${gradeTableRowTrCls}`}>
                                  <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm font-bold tabular-nums text-white">
                                    {l.main}
                                  </td>
                                  <td
                                    colSpan={10}
                                    className="px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-left text-white align-middle"
                                  >
                                    {l.servicoNome}
                                  </td>
                                </tr>
                              );
                            }
                            if (l.kind === 'subtituloBloco') {
                              return (
                                <tr
                                  key={l.key}
                                  className={`border-b border-gray-200/90 bg-slate-200/90 dark:border-gray-800 dark:bg-gray-900 ${gradeTableRowTrCls}`}
                                >
                                  <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                                    {`${l.main}.${l.subIdx}`}
                                  </td>
                                  <td colSpan={10} className="px-3 py-2.5 align-middle">
                                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200 sm:text-xs">
                                      {l.texto}
                                    </span>
                                  </td>
                                </tr>
                              );
                            }
                            if (l.kind === 'composicao') {
                              return (
                                <React.Fragment key={l.key}>
                                  <tr
                                    className={`bg-slate-100/90 dark:bg-gray-800 border-b border-gray-200/80 dark:border-gray-700 ${gradeTableRowTrCls}`}
                                    onContextMenuCapture={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const mw = 280;
                                      const mh = 120;
                                      let left = e.clientX;
                                      let top = e.clientY;
                                      left = Math.min(left, window.innerWidth - mw - 8);
                                      top = Math.min(top, window.innerHeight - mh - 8);
                                      setMenuCtxAnalitico({
                                        kind: 'composicao',
                                        left,
                                        top,
                                        composicaoKey: l.key
                                      });
                                    }}
                                  >
                                    <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                                      {l.item}
                                    </td>
                                    <td className="px-3 py-2.5 text-center text-sm font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700">{tipoInsumoCodigoParaDescricao(l.tipo)}</td>
                                    <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center">{l.codigo}</td>
                                    <td className="px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center">{l.banco}</td>
                                    <td className="px-3 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700">
                                      <div className="truncate max-w-[min(520px,55vw)]" title={l.descricao}>
                                        {l.descricao}
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-center text-sm font-medium text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700">{l.und}</td>
                                    <td className="px-3 py-2.5 text-sm text-center font-medium text-gray-900 dark:text-gray-100 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                    <td className="px-3 py-2.5 text-sm text-center font-medium text-gray-900 dark:text-gray-100 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                    <td className="px-3 py-2.5 text-sm text-center font-medium text-gray-900 dark:text-gray-100 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeOrcada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                    <td className="px-3 py-2.5 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                      <MoedaCelula
                                        valor={l.valorUnit}
                                        className="font-medium text-gray-900 dark:text-gray-100"
                                      />
                                    </td>
                                    <td className="px-3 py-2.5 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                      <MoedaCelula
                                        valor={l.total}
                                        className="font-semibold text-gray-900 dark:text-gray-50"
                                        valorClassName="font-semibold"
                                      />
                                    </td>
                                  </tr>
                                </React.Fragment>
                              );
                            }
                            const proximaLinha = linhasAnaliticoOrcamento[idxLinha + 1];
                            const ultimoInsumoDaComposicao =
                              !proximaLinha ||
                              proximaLinha.kind !== 'insumo' ||
                              proximaLinha.parentKey !== l.parentKey;
                            const manuais = insumosAnaliticoManuais[l.parentKey] ?? [];
                            const composicaoPai = linhasAnaliticoOrcamento.find(
                              (linha) => linha.kind === 'composicao' && linha.key === l.parentKey
                            );
                            const baseInsumos = linhasAnaliticoOrcamento.filter(
                              (linha) => linha.kind === 'insumo' && linha.parentKey === l.parentKey
                            ).length;
                            return (
                              <React.Fragment key={l.key}>
                              <tr
                                className={`bg-white dark:bg-gray-900 hover:bg-gray-50/80 dark:hover:bg-gray-800 ${gradeTableRowTrCls}`}
                                onContextMenuCapture={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const mw = 280;
                                  const mh = 120;
                                  let left = e.clientX;
                                  let top = e.clientY;
                                  left = Math.min(left, window.innerWidth - mw - 8);
                                  top = Math.min(top, window.innerHeight - mh - 8);
                                  setMenuCtxAnalitico({
                                    kind: 'composicao',
                                    left,
                                    top,
                                    composicaoKey: l.parentKey
                                  });
                                }}
                              >
                                <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                                  {l.item}
                                </td>
                                <td className="px-3 py-2.5 text-center text-sm text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">{tipoInsumoCodigoParaDescricao(l.tipo)}</td>
                                <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center">{l.codigo || '---'}</td>
                                <td className="px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center">{l.banco || '---'}</td>
                                <td className="px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700"><div className="truncate max-w-[min(520px,55vw)]">{l.descricao}</div></td>
                                <td className="px-3 py-2.5 text-center text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700">{l.und || '---'}</td>
                                <td className="px-3 py-2.5 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quant.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                <td className="px-3 py-2.5 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                <td className="px-3 py-2.5 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">{l.quantidadeOrcada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                                <td className="px-3 py-2.5 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                  <MoedaCelula valor={l.valorUnit} className="text-gray-700 dark:text-gray-300" />
                                </td>
                                <td className="px-3 py-2.5 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700">
                                  <MoedaCelula valor={l.total} className="text-gray-900 dark:text-gray-100" />
                                </td>
                              </tr>
                              {ultimoInsumoDaComposicao && manuais.map((ins, idx) => {
                                const itemManual =
                                  composicaoPai && composicaoPai.kind === 'composicao'
                                    ? `${composicaoPai.item}.${baseInsumos + idx + 1}`
                                    : `${baseInsumos + idx + 1}`;
                                const quantUnitNum = parsePlanilhaCalcOrPtBr(ins.quant);
                                const qtdComp =
                                  composicaoPai && composicaoPai.kind === 'composicao'
                                    ? Number(composicaoPai.quantidadeReal) || 0
                                    : 0;
                                const qtdRealNum = quantUnitNum !== null ? quantUnitNum * qtdComp : null;
                                const vUnitNum = parsePlanilhaCalcOrPtBr(ins.valorUnit);
                                const totalManual =
                                  qtdRealNum !== null && vUnitNum !== null ? qtdRealNum * vUnitNum : null;
                                return (
                                  <tr
                                    key={ins.id}
                                    className={`bg-white dark:bg-gray-900 hover:bg-gray-50/80 dark:hover:bg-gray-800 border-b border-gray-200/80 dark:border-gray-700 ${gradeTableRowTrCls}`}
                                    onContextMenuCapture={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const mw = 220;
                                      const mh = 104;
                                      let left = e.clientX;
                                      let top = e.clientY;
                                      left = Math.min(left, window.innerWidth - mw - 8);
                                      top = Math.min(top, window.innerHeight - mh - 8);
                                      setMenuCtxAnalitico({
                                        kind: 'manual',
                                        left,
                                        top,
                                        parentKey: l.parentKey,
                                        insumoId: ins.id,
                                        idx
                                      });
                                    }}
                                  >
                                    <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm tabular-nums text-gray-700 dark:text-gray-300">
                                      {itemManual}
                                    </td>
                                    <td className="px-3 py-2.5 text-center text-sm text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700">
                                      Insumo
                                    </td>
                                    <td className="p-0 border-l border-gray-200 dark:border-gray-700">
                                      <input type="text" value={ins.codigo} onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'codigo', e.target.value)} className={`${inputGradeCls} text-center`} placeholder="Código" />
                                    </td>
                                    <td className="p-0 border-l border-gray-200 dark:border-gray-700">
                                      <input type="text" value={ins.banco} onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'banco', e.target.value)} className={`${inputGradeCls} text-center`} placeholder="Banco" />
                                    </td>
                                    <td className="p-0 border-l border-gray-200 dark:border-gray-700">
                                      <input
                                        type="text"
                                        value={ins.descricao}
                                        onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'descricao', e.target.value)}
                                        className={`${inputGradeCls} text-left`}
                                        placeholder="Descrição do insumo"
                                      />
                                    </td>
                                    <td className="p-0 border-l border-gray-200 dark:border-gray-700">
                                      <select
                                        value={ins.und}
                                        onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'und', e.target.value)}
                                        className={selectGradeSemSetaCls}
                                        title="Unidade (UND)"
                                      >
                                        <option value="">UND</option>
                                        <option value="UN">UN</option>
                                        <option value="M">M</option>
                                        <option value="M²">M²</option>
                                        <option value="M³">M³</option>
                                        <option value="H">H</option>
                                        <option value="DIA">DIA</option>
                                        <option value="KG">KG</option>
                                        <option value="L">L</option>
                                        <option value="CJ">CJ</option>
                                        <option value="VB">VB</option>
                                      </select>
                                    </td>
                                    <td className="p-0 border-l border-gray-200 dark:border-gray-700">
                                      <input type="text" inputMode="decimal" value={ins.quant} onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'quant', e.target.value)} onBlur={() => normalizarNumeroManualAnalitico(l.parentKey, ins.id, 'quant', 2)} className={`${inputGradeCls} text-center tabular-nums`} placeholder="0,00" />
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">
                                      {qtdRealNum !== null
                                        ? qtdRealNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        : '—'}
                                    </td>
                                    <td className="px-3 py-2.5 text-sm text-center text-gray-700 dark:text-gray-300 tabular-nums border-l border-gray-200 dark:border-gray-700">
                                      {qtdRealNum !== null
                                        ? qtdRealNum.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        : '—'}
                                    </td>
                                    <td className={`p-0 border-l border-gray-200 dark:border-gray-700 ${GRADE_COL_MOEDA_UNIT}`}>
                                      <div className={moedaGradeFieldWrapperCls}>
                                        <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                          R$
                                        </span>
                                        <input type="text" inputMode="decimal" value={ins.valorUnit} onChange={(e) => updateInsumoManualAnalitico(l.parentKey, ins.id, 'valorUnit', e.target.value)} onBlur={() => normalizarNumeroManualAnalitico(l.parentKey, ins.id, 'valorUnit', 2)} className={`${inputGradeMoedaCls} text-right`} placeholder="0,00" />
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 text-right text-gray-900 dark:text-gray-100">
                                      {totalManual !== null ? (
                                        <MoedaCelula valor={totalManual} className="w-full text-sm text-gray-900 dark:text-gray-100" />
                                      ) : (
                                        '—'
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={exportarOrcamentoAnaliticoTabela}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                        title="Exporta a grade do orçamento analítico em Excel"
                      >
                        <FileSpreadsheet className="w-5 h-5 shrink-0" />
                        Exportar orçamento analítico (.xlsx)
                      </button>
                    </div>
                    {menuCtxAnalitico &&
                      typeof document !== 'undefined' &&
                      createPortal(
                        <>
                          <div
                            className="fixed inset-0 z-[200]"
                            aria-hidden
                            onClick={() => setMenuCtxAnalitico(null)}
                          />
                          <div
                            role="menu"
                            className="fixed z-[201] min-w-[17rem] max-w-[min(100vw-1rem,22rem)] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                            style={{ left: menuCtxAnalitico.left, top: menuCtxAnalitico.top }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {menuCtxAnalitico.kind === 'composicao' ? (
                              <>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/80"
                                  onClick={() => {
                                    addInsumoManualAnalitico(menuCtxAnalitico.composicaoKey);
                                    setMenuCtxAnalitico(null);
                                  }}
                                >
                                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                                  Adicionar insumo manual
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-950/40"
                                  onClick={() => {
                                    if (
                                      typeof window !== 'undefined' &&
                                      !window.confirm(
                                        'Remover esta composição inteira do orçamento? Os insumos manuais ligados a ela também serão desconsiderados na próxima montagem da lista.'
                                      )
                                    ) {
                                      setMenuCtxAnalitico(null);
                                      return;
                                    }
                                    removerItemComposicaoDoOrcamento(menuCtxAnalitico.composicaoKey);
                                    setMenuCtxAnalitico(null);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                                  Excluir composição do orçamento
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/80"
                                  onClick={() => {
                                    addInsumoManualAnaliticoApos(
                                      menuCtxAnalitico.parentKey,
                                      menuCtxAnalitico.idx
                                    );
                                    setMenuCtxAnalitico(null);
                                  }}
                                >
                                  <Plus className="h-4 w-4 shrink-0" aria-hidden />
                                  Adicionar insumo abaixo
                                </button>
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="flex w-full items-center gap-2 border-t border-gray-200 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 dark:border-gray-700 dark:text-red-400 dark:hover:bg-red-950/40"
                                  onClick={() => {
                                    removerInsumoManualAnalitico(
                                      menuCtxAnalitico.parentKey,
                                      menuCtxAnalitico.insumoId
                                    );
                                    setMenuCtxAnalitico(null);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                                  Excluir insumo
                                </button>
                              </>
                            )}
                          </div>
                        </>,
                        document.body
                      )}
                    </>
                    )}
                  </div>
                )}

                {!loadingFromApi && orcamentoViewTab === 'planilhaAnalitica' && (
                  <div className="space-y-3">
                    {linhasAnaliticoOrcamento.length === 0 ? (
                      <OrcamentoSecaoVazia
                        titulo="Ficha de demanda vazia"
                        texto="Adicione itens na aba Orçamento para acompanhar custos estimados, compras e valores unitários."
                        Icon={FileSpreadsheet}
                        onIrOrcamento={() => setOrcamentoViewTab('montagem')}
                      />
                    ) : (
                        <>
                        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                          <table className={`min-w-full border-collapse ${gradeTableCls}`}>
                            <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
                              <tr className={gradeTableRowTrCls}>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.item}
                                  className="cursor-help w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide"
                                >
                                  Item
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.codigo}
                                  className="cursor-help px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  Código
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.banco}
                                  className="cursor-help px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  Banco
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.servico}
                                  className="cursor-help min-w-[220px] px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Serviço
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.tipo}
                                  className="cursor-help w-14 px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  Tipo
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.un}
                                  className="cursor-help w-14 px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600"
                                >
                                  UN
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadQuantidade}
                                  className="cursor-help w-[108px] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  Quantidade
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadValorUnitOrc}
                                  className="cursor-help w-[120px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  Valor unit. orçamento
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadTotalOrc}
                                  className="cursor-help w-[120px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  Custo orçamento
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadValorUnitEst}
                                  className="cursor-help w-[120px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  Valor unit. estimado (40%)
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadCustoEst}
                                  className="cursor-help w-[120px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  Custo estimado (40%)
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadQtdCompra}
                                  className="cursor-help w-[120px] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  Quantidade compra
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadSobra}
                                  className="cursor-help w-[120px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  Sobra
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadVlCompraReal}
                                  className={`cursor-help ${GRADE_COL_MOEDA_UNIT} px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600`}
                                >
                                  Valor unit. real
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadCustoCompraReal}
                                  className="cursor-help w-[120px] px-3 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  Custo real
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadPctLev}
                                  className="cursor-help w-[100px] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  % Qtd. solicitada
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadPctFat}
                                  className="cursor-help w-[100px] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  % Valor total
                                </th>
                                <th
                                  title={PLANILHA_ANALITICA_TOOLTIP.theadPctCvp}
                                  className="cursor-help min-w-[10rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600"
                                >
                                  % Custo / valor pago
                                </th>
                                <th className="min-w-[15rem] px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">
                                  Observação
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700">
                              {linhasAnaliticoComManuais.map((l) => {
                                const itemW =
                                  'w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm tabular-nums';
                                if (l.kind === 'tituloServico') {
                                  const resumo = resumoSecoesFicha.porTitulo.get(String(l.main)) ?? {
                                    custoOrc: 0,
                                    custoEst: 0,
                                    custoReal: 0
                                  };
                                  const listaAggTit =
                                    resumoSecoesFicha.aggPorTituloParaTooltip.get(String(l.main)) ?? [];
                                  return (
                                    <tr key={l.key} className={`bg-red-600 dark:bg-red-950/90 ${gradeTableRowTrCls}`}>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.item}
                                        className={`${itemW} cursor-help font-bold text-white`}
                                      >
                                        {l.main}
                                      </td>
                                      <td title={PLANILHA_ANALITICA_TOOLTIP.tituloServico} colSpan={7} className="cursor-help px-3 py-2.5 text-xs font-bold uppercase tracking-wide text-left text-white align-middle">
                                        {l.servicoNome}
                                      </td>
                                      <td className="px-3 py-2.5 text-sm tabular-nums border-l border-red-400/50 dark:border-red-800">
                                        <CalcHoverBridge
                                          hoverSourceIds={hoverIdsTituloServicoPorBloco(listaAggTit, 'orc')}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <MoedaCelula valor={resumo.custoOrc} className="text-white font-bold" valorClassName="font-bold" />
                                        </CalcHoverBridge>
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 text-sm tabular-nums border-l border-red-400/50 dark:border-red-800">
                                        <CalcHoverBridge
                                          hoverSourceIds={hoverIdsTituloServicoPorBloco(listaAggTit, 'est')}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <MoedaCelula valor={resumo.custoEst} className="text-white font-bold" valorClassName="font-bold" />
                                        </CalcHoverBridge>
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 text-sm tabular-nums border-l border-red-400/50 dark:border-red-800">
                                        <CalcHoverBridge
                                          hoverSourceIds={hoverIdsTituloServicoPorBloco(listaAggTit, 'real')}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <MoedaCelula valor={resumo.custoReal} className="text-white font-bold" valorClassName="font-bold" />
                                        </CalcHoverBridge>
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                      <td className="px-3 py-2.5 border-l border-red-400/50 dark:border-red-800" />
                                    </tr>
                                  );
                                }
                                if (l.kind === 'subtituloBloco') {
                                  const resumo = resumoSecoesFicha.porSubtitulo.get(`${l.main}.${l.subIdx}`) ?? {
                                    custoOrc: 0,
                                    custoEst: 0,
                                    custoReal: 0
                                  };
                                  const listaAggSub =
                                    resumoSecoesFicha.aggPorSubtituloParaTooltip.get(`${l.main}.${l.subIdx}`) ?? [];
                                  return (
                                    <tr
                                      key={l.key}
                                      className={`border-b border-gray-200/90 bg-slate-200/90 dark:border-gray-800 dark:bg-gray-900 ${gradeTableRowTrCls}`}
                                    >
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.item}
                                        className={`${itemW} cursor-help text-xs font-semibold text-gray-800 dark:text-gray-200`}
                                      >
                                        {`${l.main}.${l.subIdx}`}
                                      </td>
                                      <td title={PLANILHA_ANALITICA_TOOLTIP.subtituloBloco} colSpan={7} className="cursor-help px-3 py-2.5 align-middle">
                                        {l.texto ? (
                                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200 sm:text-xs">
                                            {l.texto}
                                          </span>
                                        ) : null}
                                      </td>
                                      <td
                                        className={`px-3 py-2.5 text-sm tabular-nums border-l border-gray-300 dark:border-gray-700 ${
                                          calcHoverSourceIds.includes(`custo-orc-bloco-${l.main}-${l.subIdx}`)
                                            ? CLASSE_CELULA_HOVER_FONTE
                                            : ''
                                        }`}
                                      >
                                        <CalcHoverBridge
                                          hoverSourceIds={hoverIdsAggCustoOrc(listaAggSub)}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <MoedaCelula valor={resumo.custoOrc} className="font-semibold text-gray-900 dark:text-gray-100" valorClassName="font-semibold" />
                                        </CalcHoverBridge>
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td
                                        className={`px-3 py-2.5 text-sm tabular-nums border-l border-gray-300 dark:border-gray-700 ${
                                          calcHoverSourceIds.includes(`custo-est-bloco-${l.main}-${l.subIdx}`)
                                            ? CLASSE_CELULA_HOVER_FONTE
                                            : ''
                                        }`}
                                      >
                                        <CalcHoverBridge
                                          hoverSourceIds={hoverIdsAggCustoEst(listaAggSub)}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <MoedaCelula valor={resumo.custoEst} className="font-semibold text-gray-900 dark:text-gray-100" valorClassName="font-semibold" />
                                        </CalcHoverBridge>
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td
                                        className={`px-3 py-2.5 text-sm tabular-nums border-l border-gray-300 dark:border-gray-700 ${
                                          calcHoverSourceIds.includes(`custo-real-bloco-${l.main}-${l.subIdx}`)
                                            ? CLASSE_CELULA_HOVER_FONTE
                                            : ''
                                        }`}
                                      >
                                        <CalcHoverBridge
                                          hoverSourceIds={hoverIdsAggCustoReal(listaAggSub)}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <MoedaCelula valor={resumo.custoReal} className="font-semibold text-gray-900 dark:text-gray-100" valorClassName="font-semibold" />
                                        </CalcHoverBridge>
                                      </td>
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                      <td className="px-3 py-2.5 border-l border-gray-300 dark:border-gray-700" />
                                    </tr>
                                  );
                                }
                                if (l.kind === 'composicao') {
                                  const filhos = insumosPlanilhaPorComposicao.get(l.key) ?? [];
                                  let sumQtdCompra = 0;
                                  const sumCustoEst = l.total * PLANILHA_FATOR_CUSTO_ESTIMADO;
                                  let sumCustoReal = 0;
                                  let sumQtdCompraComVlReal = 0;
                                  let temQtdCompra = false;
                                  /** Soma dos vl. unit. compra real dos insumos (col. "Valor unit. compra real" na linha da composição). */
                                  let somaVlUnitCompraRealInsumos = 0;
                                  let temAlgumVlUnitCompraReal = false;
                                  for (const ins of filhos) {
                                    const qC = planilhaQuantidadeCompra[ins.key];
                                    const vReal = planilhaValorUnitCompraReal[ins.key];
                                    const vOrc = ins.valorUnit;
                                    if (vReal !== undefined && Number.isFinite(vReal)) {
                                      somaVlUnitCompraRealInsumos += vReal;
                                      temAlgumVlUnitCompraReal = true;
                                    }
                                    if (qC !== undefined && Number.isFinite(qC)) {
                                      temQtdCompra = true;
                                      sumQtdCompra += qC;
                                      if (vReal !== undefined && Number.isFinite(vReal)) {
                                        sumCustoReal += qC * vReal;
                                        sumQtdCompraComVlReal += qC;
                                      }
                                    }
                                  }
                                  const vlUnitCompraRealAgreg =
                                    temAlgumVlUnitCompraReal ? somaVlUnitCompraRealInsumos : null;
                                  const pctRow = pctFichaDemandaPorKey.get(l.key);
                                  const pctLev = pctRow?.levantamentoPct;
                                  const pctFat = pctRow?.faturamentoPct;
                                  const pctCvp = pctRow?.pctCustoValorPago;
                                  const custoEstCompCalc = l.total * PLANILHA_FATOR_CUSTO_ESTIMADO;
                                  const levantamentoCondComp =
                                    pctLev !== undefined && Number.isFinite(pctLev)
                                      ? classeLevantamentoCondicional(pctLev)
                                      : '';
                                  const valorTotalCondComp =
                                    pctFat !== undefined && Number.isFinite(pctFat)
                                      ? classeValorTotalCondicional(pctFat)
                                      : '';
                                  return (
                                    <tr
                                      key={l.key}
                                      className={`bg-slate-100/90 dark:bg-gray-800 border-b border-gray-200/80 dark:border-gray-700 ${gradeTableRowTrCls}`}
                                    >
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.item}
                                        className={`${itemW} cursor-help font-semibold text-gray-900 dark:text-gray-50`}
                                      >
                                        {l.item}
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.codigo}
                                        className="cursor-help px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center"
                                      >
                                        {l.codigo}
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.banco}
                                        className="cursor-help px-3 py-2.5 text-sm font-medium text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 text-center"
                                      >
                                        {l.banco}
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.servico}
                                        className="cursor-help min-w-[220px] px-3 py-2.5 text-sm font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700"
                                      >
                                        <div className="truncate max-w-[min(520px,55vw)]" title={l.descricao}>
                                          {l.descricao}
                                        </div>
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.tipoCompLinha}
                                        className="cursor-help px-3 py-2.5 text-sm text-center text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700"
                                      />
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.un}
                                        className="cursor-help px-3 py-2.5 text-center text-sm font-medium text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700"
                                      >
                                        {l.und}
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.quantidadeComp}
                                        className={`cursor-help px-3 py-2.5 text-center text-sm tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 ${
                                          calcHoverSourceIds.includes(`qtd-orc-${l.key}`)
                                            ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                            : ''
                                        }`}
                                      >
                                        {l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.valorUnitOrcComp}
                                        className={`cursor-help px-3 py-2.5 text-sm tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 ${
                                          calcHoverSourceIds.includes(`vl-orc-${l.key}`)
                                            ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                            : ''
                                        }`}
                                      >
                                        <MoedaCelula valor={l.valorUnit} />
                                      </td>
                                      <td
                                        className={`cursor-help px-3 py-2.5 text-sm tabular-nums text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700 ${
                                          calcHoverSourceIds.includes(`custo-orc-${l.key}`)
                                            ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                            : ''
                                        }`}
                                      >
                                        <CalcHoverBridge
                                          hoverSourceIds={[`qtd-orc-${l.key}`, `vl-orc-${l.key}`]}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <MoedaCelula valor={l.total} className="font-semibold" valorClassName="font-semibold" />
                                        </CalcHoverBridge>
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.valorUnitEstComp}
                                        className="cursor-help px-3 py-2.5 text-sm text-right tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700"
                                      >
                                        <CalcHoverBridge
                                          hoverSourceIds={[`vl-orc-${l.key}`]}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <MoedaCelula valor={l.valorUnit * PLANILHA_FATOR_CUSTO_ESTIMADO} />
                                        </CalcHoverBridge>
                                      </td>
                                      <td
                                        className={`cursor-help px-3 py-2.5 text-sm tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700 ${
                                          calcHoverSourceIds.includes(`custo-est-${l.key}`)
                                            ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                            : ''
                                        }`}
                                      >
                                        <CalcHoverBridge
                                          hoverSourceIds={[`custo-est-${l.key}`]}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <MoedaCelula valor={custoEstCompCalc} />
                                        </CalcHoverBridge>
                                      </td>
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.qtdCompraComp}
                                        className="cursor-help px-3 py-2.5 text-center text-sm tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700"
                                      />
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.qtdSobraComp}
                                        className="cursor-help px-3 py-2.5 text-sm text-right tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700"
                                      />
                                      <td
                                        title={PLANILHA_ANALITICA_TOOLTIP.vlCompraRealComp}
                                        className={`cursor-help px-2 py-2.5 text-sm tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700 ${GRADE_COL_MOEDA_UNIT}`}
                                      >
                                        {vlUnitCompraRealAgreg !== null ? <MoedaCelula valor={vlUnitCompraRealAgreg} /> : null}
                                      </td>
                                      <td
                                        className={`cursor-help px-3 py-2.5 text-sm tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700 ${
                                          calcHoverSourceIds.includes(`custo-real-${l.key}`)
                                            ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                            : ''
                                        }`}
                                      >
                                        {sumQtdCompraComVlReal > 0 ? (
                                          <CalcHoverBridge
                                            hoverSourceIds={[`custo-real-${l.key}`]}
                                            onHoverSourcesChange={setCalcHoverSourceIds}
                                          >
                                            <MoedaCelula valor={sumCustoReal} />
                                          </CalcHoverBridge>
                                        ) : null}
                                      </td>
                                      <td
                                        className={`cursor-help px-3 py-2.5 text-sm text-center tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                          levantamentoCondComp || 'text-gray-800 dark:text-gray-200'
                                        }`}
                                      >
                                        {pctLev !== undefined && Number.isFinite(pctLev)
                                          ? `${pctLev.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                                          : (
                                              <span className="text-gray-500 dark:text-gray-400">—</span>
                                            )}
                                      </td>
                                      <td
                                        className={`cursor-help px-3 py-2.5 text-sm text-center tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                          valorTotalCondComp || 'text-gray-800 dark:text-gray-200'
                                        }`}
                                      >
                                        {pctFat !== undefined && Number.isFinite(pctFat)
                                          ? `${pctFat.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                                          : (
                                              <span className="text-gray-500 dark:text-gray-400">—</span>
                                            )}
                                      </td>
                                      <td
                                        className="cursor-help px-3 py-2.5 text-sm text-center tabular-nums text-gray-800 dark:text-gray-200 border-l border-gray-200 dark:border-gray-700"
                                      >
                                        {pctCvp !== undefined && Number.isFinite(pctCvp) ? (
                                          <CalcHoverBridge
                                            hoverSourceIds={[`custo-real-${l.key}`, `custo-orc-${l.key}`]}
                                            onHoverSourcesChange={setCalcHoverSourceIds}
                                          >
                                            <span>{`${pctCvp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</span>
                                          </CalcHoverBridge>
                                        ) : (
                                          <span className="text-gray-500 dark:text-gray-400">—</span>
                                        )}
                                      </td>
                                      <td className="border-l border-gray-200 dark:border-gray-700 p-0">
                                        <span className="block px-3 py-2.5 text-sm text-gray-400 dark:text-gray-600">—</span>
                                      </td>
                                    </tr>
                                  );
                                }
                                const qC = planilhaQuantidadeCompra[l.key];
                                const vReal = planilhaValorUnitCompraReal[l.key];
                                const vOrc = l.valorUnit;
                                const valorUnitEstimado = vOrc * PLANILHA_FATOR_CUSTO_ESTIMADO;
                                const custoEst = l.total * PLANILHA_FATOR_CUSTO_ESTIMADO;
                                const custoCompraR =
                                  qC !== undefined &&
                                  vReal !== undefined &&
                                  Number.isFinite(qC) &&
                                  Number.isFinite(vReal)
                                    ? qC * vReal
                                    : null;
                                const pctInsumo = pctFichaDemandaPorKey.get(l.key);
                                const pctLevIn = pctInsumo?.levantamentoPct;
                                const pctFatIn = pctInsumo?.faturamentoPct;
                                const pctCvpIn = pctInsumo?.pctCustoValorPago;
                                const composicaoPaiParaPct = linhasAnaliticoComManuais.find(
                                  (x) => x.kind === 'composicao' && x.key === l.parentKey
                                );
                                const faturamentoComposicaoPai =
                                  composicaoPaiParaPct && composicaoPaiParaPct.kind === 'composicao'
                                    ? composicaoPaiParaPct.quantidadeReal * composicaoPaiParaPct.valorUnit
                                    : 0;
                                const valorTotalCondIn =
                                  pctFatIn !== undefined && Number.isFinite(pctFatIn)
                                    ? classeValorTotalCondicional(pctFatIn)
                                    : '';
                                const sobraInsumo =
                                  qC !== undefined && Number.isFinite(qC) ? l.quantidadeReal - qC : null;
                                const levantamentoCondIn =
                                  pctLevIn !== undefined && Number.isFinite(pctLevIn)
                                    ? classeLevantamentoCondicional(pctLevIn)
                                    : '';
                                return (
                                  <tr key={l.key} className={`bg-white dark:bg-gray-900 hover:bg-gray-50/80 dark:hover:bg-gray-800 ${gradeTableRowTrCls}`}>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.item}
                                      className={`${itemW} cursor-help text-gray-700 dark:text-gray-300`}
                                    >
                                      {l.item}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.codigo}
                                      className="cursor-help px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center"
                                    >
                                      {l.codigo || '—'}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.banco}
                                      className="cursor-help px-3 py-2.5 text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700 text-center"
                                    >
                                      {l.banco || '—'}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.servico}
                                      className="cursor-help min-w-[220px] px-3 py-2.5 text-sm text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700"
                                    >
                                      <div className="truncate max-w-[min(520px,55vw)]" title={l.descricao}>
                                        {l.descricao}
                                      </div>
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.tipo}
                                      className="cursor-help p-0 text-sm text-center font-medium text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700"
                                    >
                                      <select
                                        value={
                                          (String(planilhaTipoInsumo[l.key] ?? '') === 'MAT'
                                            ? 'MA'
                                            : planilhaTipoInsumo[l.key]) ?? tipoPlanilhaInsumo(l.categoria)
                                        }
                                        onChange={(e) =>
                                          setPlanilhaTipoInsumo((prev) => ({
                                            ...prev,
                                            [l.key]: e.target.value as 'MO' | 'MA' | 'LO'
                                          }))
                                        }
                                        className={selectGradeSemSetaCls}
                                        title="Selecione o tipo do insumo"
                                      >
                                        <option value="MO">MO</option>
                                        <option value="MA">MA</option>
                                        <option value="LO">LO</option>
                                      </select>
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.un}
                                      className="cursor-help px-3 py-2.5 text-center text-sm text-gray-500 dark:text-gray-400 border-l border-gray-200 dark:border-gray-700"
                                    >
                                      {l.und || '—'}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.quantidadeInsumo}
                                      className={`cursor-help px-3 py-2.5 text-center text-sm tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700 ${
                                        calcHoverSourceIds.includes(`qtd-orc-${l.key}`)
                                          ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                          : ''
                                      }`}
                                    >
                                      {l.quantidadeReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.valorUnitOrcInsumo}
                                      className={`cursor-help px-3 py-2.5 text-sm tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700 ${
                                        calcHoverSourceIds.includes(`vl-orc-${l.key}`)
                                          ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                          : ''
                                      }`}
                                    >
                                      <MoedaCelula valor={l.valorUnit} />
                                    </td>
                                    <td
                                      className={`cursor-help px-3 py-2.5 text-sm tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 ${
                                        calcHoverSourceIds.includes(`custo-orc-${l.key}`)
                                          ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                          : ''
                                      }`}
                                    >
                                      <CalcHoverBridge
                                        hoverSourceIds={[`qtd-orc-${l.key}`, `vl-orc-${l.key}`]}
                                        onHoverSourcesChange={setCalcHoverSourceIds}
                                      >
                                        <MoedaCelula valor={l.total} />
                                      </CalcHoverBridge>
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.valorUnitEstInsumo}
                                      className="cursor-help px-3 py-2.5 text-sm tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700"
                                    >
                                      <CalcHoverBridge
                                        hoverSourceIds={[`vl-orc-${l.key}`]}
                                        onHoverSourcesChange={setCalcHoverSourceIds}
                                      >
                                        <MoedaCelula valor={valorUnitEstimado} />
                                      </CalcHoverBridge>
                                    </td>
                                    <td
                                      className={`cursor-help px-3 py-2.5 text-sm tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700 ${
                                        calcHoverSourceIds.includes(`custo-est-${l.key}`)
                                          ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                          : ''
                                      }`}
                                    >
                                      <CalcHoverBridge
                                        hoverSourceIds={[`custo-est-${l.key}`]}
                                        onHoverSourcesChange={setCalcHoverSourceIds}
                                      >
                                        <MoedaCelula valor={custoEst} />
                                      </CalcHoverBridge>
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.qtdCompraInsumo}
                                      className={`cursor-help p-0 border-l border-gray-200 dark:border-gray-700 ${
                                        calcHoverSourceIds.includes(`qtd-compra-${l.key}`)
                                          ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                          : ''
                                      }`}
                                    >
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        placeholder="0"
                                        title={PLANILHA_ANALITICA_TOOLTIP.qtdCompraInsumo}
                                        className={`${inputGradeCls} text-center tabular-nums`}
                                        value={
                                          planilhaCompraDraft[`q|${l.key}`] ??
                                          (qC !== undefined
                                            ? qC.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
                                            : '')
                                        }
                                        onChange={(e) => handlePlanilhaQtdCompraChange(l.key, e.target.value)}
                                        onBlur={(e) => commitPlanilhaQtdCompra(l.key, e.target.value)}
                                      />
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.qtdSobraInsumo}
                                      className={`cursor-help px-3 py-2.5 text-center text-sm tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                        sobraInsumo !== null && sobraInsumo < 0
                                          ? 'font-semibold bg-red-50 text-red-900 dark:bg-red-500/15 dark:text-red-200'
                                          : 'text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      {sobraInsumo !== null ? (
                                        <CalcHoverBridge
                                          hoverSourceIds={[`qtd-orc-${l.key}`, `qtd-compra-${l.key}`]}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <span>{sobraInsumo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                        </CalcHoverBridge>
                                      ) : '—'}
                                    </td>
                                    <td
                                      title={PLANILHA_ANALITICA_TOOLTIP.vlCompraRealInsumo}
                                      className={`cursor-help p-0 align-middle border-l border-gray-200 dark:border-gray-700 ${GRADE_COL_MOEDA_UNIT} ${
                                        calcHoverSourceIds.includes(`vl-real-${l.key}`)
                                          ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                          : ''
                                      }`}
                                    >
                                      <div className={moedaGradeFieldWrapperCls}>
                                        <span className="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400">
                                          R$
                                        </span>
                                        <input
                                          type="text"
                                          inputMode="decimal"
                                          placeholder="0,00"
                                          title={PLANILHA_ANALITICA_TOOLTIP.vlCompraRealInsumo}
                                          className={`${inputGradeMoedaCls} text-right`}
                                          value={
                                            planilhaCompraDraft[`v|${l.key}`] ??
                                            (vReal !== undefined
                                              ? vReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                              : '')
                                          }
                                          onChange={(e) => handlePlanilhaVlCompraRealChange(l.key, e.target.value)}
                                          onBlur={(e) => commitPlanilhaVlCompraReal(l.key, e.target.value)}
                                        />
                                      </div>
                                    </td>
                                    <td
                                      className={`cursor-help px-3 py-2.5 text-sm tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700 ${
                                        calcHoverSourceIds.includes(`custo-real-${l.key}`)
                                          ? 'bg-blue-50 ring-2 ring-inset ring-blue-500 dark:bg-blue-950/35 dark:ring-blue-400'
                                          : ''
                                      }`}
                                    >
                                      {custoCompraR !== null ? (
                                        <CalcHoverBridge
                                          hoverSourceIds={[`qtd-compra-${l.key}`, `vl-real-${l.key}`]}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <MoedaCelula valor={custoCompraR} />
                                        </CalcHoverBridge>
                                      ) : '—'}
                                    </td>
                                    <td
                                      className={`cursor-help px-3 py-2.5 text-sm text-center tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                        levantamentoCondIn ||
                                        'text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      {pctLevIn !== undefined && Number.isFinite(pctLevIn) ? (
                                        <CalcHoverBridge
                                          hoverSourceIds={[`qtd-compra-${l.key}`, `qtd-orc-${l.key}`]}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <span>{`${pctLevIn.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</span>
                                        </CalcHoverBridge>
                                      ) : (
                                        <span className="text-gray-500 dark:text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td
                                      className={`cursor-help px-3 py-2.5 text-sm text-center tabular-nums border-l border-gray-200 dark:border-gray-700 ${
                                        valorTotalCondIn || 'text-gray-700 dark:text-gray-300'
                                      }`}
                                    >
                                      {pctFatIn !== undefined && Number.isFinite(pctFatIn) ? (
                                        <CalcHoverBridge
                                          hoverSourceIds={[`custo-real-${l.key}`, `custo-orc-${l.key}`]}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <span>{`${pctFatIn.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</span>
                                        </CalcHoverBridge>
                                      ) : (
                                        <span className="text-gray-500 dark:text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td
                                      className="cursor-help px-3 py-2.5 text-sm text-center tabular-nums text-gray-700 dark:text-gray-300 border-l border-gray-200 dark:border-gray-700"
                                    >
                                      {pctCvpIn !== undefined && Number.isFinite(pctCvpIn) ? (
                                        <CalcHoverBridge
                                          hoverSourceIds={[`custo-real-${l.key}`, `custo-orc-${l.parentKey}`]}
                                          onHoverSourcesChange={setCalcHoverSourceIds}
                                        >
                                          <span>{`${pctCvpIn.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`}</span>
                                        </CalcHoverBridge>
                                      ) : (
                                        <span className="text-gray-500 dark:text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="border-l border-gray-200 dark:border-gray-700 p-0">
                                      <input
                                        type="text"
                                        value={fichaDemandaObservacoes[l.key] ?? ''}
                                        onChange={(e) =>
                                          setFichaDemandaObservacoes((prev) => ({
                                            ...prev,
                                            [l.key]: e.target.value
                                          }))
                                        }
                                        placeholder="Adicionar observação..."
                                        className={`${inputGradeCls} text-left`}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="mt-6 flex flex-col gap-4">
                          <div className="space-y-4">
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/30 px-4 py-4 sm:px-5">
                              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                                Preço de compra por grupo
                              </h4>
                              <dl className="divide-y divide-gray-200/90 dark:divide-gray-700/90">
                                {(
                                  [
                                    ['Preço compra MA', resumoRodapeFichaDemanda.precoMa],
                                    ['Preço compra MO', resumoRodapeFichaDemanda.precoMo],
                                    ['Preço compra LO', resumoRodapeFichaDemanda.precoLo]
                                  ] as const
                                ).map(([label, val]) => (
                                  <div
                                    key={label}
                                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0"
                                  >
                                    <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                      {label}
                                    </dt>
                                    <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                      {val !== null && val !== undefined
                                        ? `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : '—'}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/30 px-4 py-4 sm:px-5">
                              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                                Relações com o orçamento
                              </h4>
                              <dl className="divide-y divide-gray-200/90 dark:divide-gray-700/90">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0">
                                  <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                    Relação de preço estimado × orçamento
                                  </dt>
                                  <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                    {resumoRodapeFichaDemanda.relacaoEstimadoOrcamentoPct !== null
                                      ? `${resumoRodapeFichaDemanda.relacaoEstimadoOrcamentoPct.toLocaleString('pt-BR', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2
                                        })}%`
                                      : '—'}
                                  </dd>
                                </div>
                                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                                  <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                    Relação de preço de compra real × orçamento
                                  </dt>
                                  <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                    {resumoRodapeFichaDemanda.relacaoRealOrcamentoPct !== null
                                      ? `${resumoRodapeFichaDemanda.relacaoRealOrcamentoPct.toLocaleString('pt-BR', {
                                          minimumFractionDigits: 2,
                                          maximumFractionDigits: 2
                                        })}%`
                                      : '—'}
                                  </dd>
                                </div>
                              </dl>
                            </div>
                          </div>

                          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/30 px-4 py-4 sm:px-5">
                            <dl className="divide-y divide-gray-200/90 dark:divide-gray-700/90">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0">
                                <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                  Total faturado (material / mão de obra / locação)
                                </dt>
                                <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                  {`R$ ${resumoRodapeFichaDemanda.totalFaturadoMatMoLoc.toLocaleString('pt-BR', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2
                                  })}`}
                                </dd>
                              </div>
                              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                                <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                  Preço de compra estimado
                                </dt>
                                <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                  {resumoRodapeFichaDemanda.precoCompraEstimadoTotal !== null
                                    ? `R$ ${resumoRodapeFichaDemanda.precoCompraEstimadoTotal.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      })}`
                                    : '—'}
                                </dd>
                              </div>
                              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                                <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                                  Preço de compra real
                                </dt>
                                <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                                  {resumoRodapeFichaDemanda.precoCompraRealTotal !== null
                                    ? `R$ ${resumoRodapeFichaDemanda.precoCompraRealTotal.toLocaleString('pt-BR', {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2
                                      })}`
                                    : '—'}
                                </dd>
                              </div>
                            </dl>
                            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-gray-300/80 dark:border-gray-600 pt-4">
                              <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                                Valor total do orçamento
                              </span>
                              <span className="shrink-0 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-50 text-right">
                                {`R$ ${resumoRodapeFichaDemanda.valorTotalOrcamentoFinal.toLocaleString('pt-BR', {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2
                                })}`}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <button
                            type="button"
                            onClick={exportarPlanilhaAnalitica}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                            title={PLANILHA_ANALITICA_TOOLTIP.exportPlanilha}
                          >
                            <FileSpreadsheet className="w-5 h-5 shrink-0" />
                            Exportar ficha de demanda (.xlsx)
                          </button>
                          <button
                            type="button"
                            onClick={exportarFichaDemandaPdf}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                            title="Exporta a ficha de demanda em PDF"
                          >
                            <FileDown className="w-5 h-5 shrink-0" />
                            Exportar ficha de demanda (.pdf)
                          </button>
                        </div>
                        </>
                    )}
                  </div>
                )}


                {!loadingFromApi && orcamentoViewTab === 'memorial' && meta.importadoPlanilha && (
                  <OrcamentoSecaoVazia
                    titulo="Memória de cálculo não disponível"
                    texto="Este orçamento veio de uma planilha: as quantidades já estão na importação e não há levantamento por dimensões nesta aba. Para editar a grade, use Orçamento; para custos e compras, Orçamento analítico e Ficha de demanda."
                    Icon={Calculator}
                    onIrOrcamento={() => setOrcamentoViewTab('montagem')}
                  />
                )}

                {!loadingFromApi && orcamentoViewTab === 'memorial' && !meta.importadoPlanilha && (
                  <div className="space-y-5">
                    {itensCalculados.length === 0 ? (
                      <OrcamentoSecaoVazia
                        titulo="Memória de cálculo vazia"
                        texto="Adicione itens na aba Orçamento para editar medições por dimensão e exportar a memória em planilha."
                        Icon={Calculator}
                        onIrOrcamento={() => setOrcamentoViewTab('montagem')}
                      />
                    ) : (
                      <div className="space-y-8">
                        {itensMemoriaCalculoLista.map((row, rowIdx) => (
                          <section key={row.key} id={`memorial-medicoes-${row.key}`} className="scroll-mt-6">
                            <OrcamentoMedicaoPainel
                              rowKey={row.key}
                              tipoUnidade={row.tipoUnidade}
                              itemRotulo={
                                rotuloItemComposicaoPorKey.get(row.key) ?? String(rowIdx + 1)
                              }
                              itemDescricao={row.item.descricao || ''}
                              unidadeMedida={unidadeComposicaoParaExibicao(row.unidadeComposicao, row.tipoUnidade)}
                              quantidadeUn={row.quantidade}
                              quantidadeUnReadOnly={ehComposicaoCacamba4m3(row.item.descricao)}
                              onQuantidadeUnChange={n => setQuantidadeItem(row.key, n)}
                              dim={
                                dimensoesPorItem[row.key] ?? {
                                  tipoUnidade: row.tipoUnidade,
                                  linhas: []
                                }
                              }
                              ehCargaEntulho={ehComposicaoCargaEntulho(row.item.descricao)}
                              draftCalc={draftCalc}
                              setDraftCalc={setDraftCalc}
                              handleCalcChange={handleCalcChange}
                              handleCalcBlur={handleCalcBlur}
                              updateLinhaMedicao={updateLinhaMedicao}
                              updateRotuloColunaMedicao={(campo, rotulo) =>
                                updateRotuloColunaMedicao(row.key, campo, rotulo)
                              }
                              addLinhaMedicao={addLinhaMedicao}
                              addLinhaCabecalhoSecaoMedicao={addLinhaCabecalhoSecaoMedicao}
                              removeLinhaMedicao={removeLinhaMedicao}
                            />
                          </section>
                        ))}
                      </div>
                    )}
                    {itensCalculados.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <button
                        type="button"
                        onClick={exportarMemoriaCalculo}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                        title="Exporta medições dimensionais e itens em unidade (UN), na ordem do orçamento"
                      >
                        <FileSpreadsheet className="w-5 h-5 shrink-0" />
                        Exportar memória de cálculo (.xlsx)
                      </button>
                    </div>
                    )}
                  </div>
                )}

                <div className={!loadingFromApi && orcamentoViewTab === 'montagem' ? 'space-y-6' : 'hidden'}>
                {!meta.importadoPlanilha && (
                <>
                <div className="flex gap-2 items-end flex-wrap">
                  <div
                    ref={servicosDropdownRef}
                    className={`relative flex-1 min-w-[200px] ${showServicosDropdown ? 'z-[200]' : ''}`}
                  >
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Adicionar serviços ao orçamento
                    </label>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowServicosDropdown(v => !v); }}
                      className="w-full h-10 pl-10 pr-11 text-left rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent relative"
                    >
                      <ListPlus className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                      <span className="block pr-6 truncate">
                        {linhasSelecionadasDropdown.size === 0
                          ? (todosSubtitulos.length === 0 ? 'Nenhum serviço disponível' : 'Selecione linhas ou serviços')
                          : linhasDisponiveisDropdown.size > 0 &&
                              Array.from(linhasDisponiveisDropdown).every(k => linhasSelecionadasDropdown.has(k))
                            ? 'Todas as linhas disponíveis selecionadas'
                            : `${linhasSelecionadasDropdown.size} linha(s) selecionada(s)`}
                      </span>
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none">
                        {showServicosDropdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </span>
                    </button>
                  {showServicosDropdown && (
                    <div className="absolute left-0 right-0 top-full z-[201] mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-xl ring-1 ring-black/5 dark:ring-white/10 p-2 sm:p-3 max-h-[min(28rem,75vh)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        placeholder="Pesquisar..."
                        value={servicosSearch}
                        onChange={(e) => setServicosSearch(e.target.value)}
                        className="mb-3 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50 px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500/80 dark:focus:ring-red-400/80"
                      />
                      {todosSubtitulosFiltradosPesquisa.length > 0 && (
                        <div className="mb-2">
                          {(() => {
                            const allKeys = Array.from(linhasDisponiveisDropdown);
                            const allChecked =
                              allKeys.length > 0 && allKeys.every(k => linhasSelecionadasDropdown.has(k));
                            const someChecked = allKeys.some(k => linhasSelecionadasDropdown.has(k));
                            const partial = someChecked && !allChecked;
                            return (
                              <ServicosDropdownCheckbox
                                id="select-all-servicos"
                                checked={allChecked}
                                indeterminate={partial}
                                onChange={e => (e.target.checked ? selecionarTodosSubtitulos() : desmarcarTodosSubtitulos())}
                              >
                                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 pt-0.5">
                                  Selecionar tudo
                                </span>
                              </ServicosDropdownCheckbox>
                            );
                          })()}
                        </div>
                      )}
                      <div>
                        {todosSubtitulos.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                            Nenhum serviço disponível. Importe o orçamento perfeito na aba Importações.
                          </p>
                        ) : todosSubtitulosFiltradosPesquisa.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 py-4 text-center">
                            Nenhum resultado encontrado para esta pesquisa.
                          </p>
                        ) : (
                          todosSubtitulosFiltradosPesquisa.map(t => {
                              const blocoPorKey = subtitulosNoOrcamento.includes(t.key);
                              const blocoTemItensNoOrcamento =
                                t.itens.length > 0
                                  ? t.itens.some(i =>
                                      assinaturasItensVisiveisNoOrcamento.has(itemSigParaOrcamento(i))
                                    )
                                  : blocoPorKey;
                              const q = servicosSearch.trim().toLowerCase();
                              const label = `${t.servicoNome} › ${t.subtituloNome}`.toLowerCase();
                              const parentMatches = !q || label.includes(q);
                              const itensVisiveis =
                                !q || parentMatches
                                  ? t.itens
                                  : t.itens.filter(
                                      i =>
                                        (i.codigo || '').toLowerCase().includes(q) ||
                                        (i.descricao || '').toLowerCase().includes(q)
                                    );
                              const keysSelecionaveis =
                                t.itens.length === 0
                                  ? blocoPorKey
                                    ? []
                                    : [buildItemKeyOrcamento(t.key, DROPDOWN_BLOCO_SEM_ITENS)]
                                  : t.itens
                                      .filter(i => {
                                        const ik = buildItemKeyOrcamento(t.key, i.chave);
                                        const jaVisivel = assinaturasItensVisiveisNoOrcamento.has(
                                          itemSigParaOrcamento(i)
                                        );
                                        if (!jaVisivel) return true;
                                        return blocoPorKey && itensOcultosNoOrcamento.includes(ik);
                                      })
                                      .map(i => buildItemKeyOrcamento(t.key, i.chave));
                              const allOn =
                                keysSelecionaveis.length > 0 &&
                                keysSelecionaveis.every(k => linhasSelecionadasDropdown.has(k));
                              const someOn = keysSelecionaveis.some(k => linhasSelecionadasDropdown.has(k));
                              const partialPai = someOn && !allOn;
                              const paiDesabilitado = keysSelecionaveis.length === 0;
                              return (
                                <div
                                  key={t.key}
                                  className="border-b border-gray-200/90 dark:border-gray-600/80 pb-3 mb-3 last:border-0 last:pb-0 last:mb-0"
                                >
                                  <ServicosDropdownCheckbox
                                    checked={allOn}
                                    indeterminate={Boolean(!paiDesabilitado && partialPai && !allOn)}
                                    disabled={paiDesabilitado}
                                    onChange={() => {
                                      if (!paiDesabilitado) toggleSubtituloTodasLinhas(t);
                                    }}
                                  >
                                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug">
                                      {t.servicoNome} › {t.subtituloNome}
                                      {blocoTemItensNoOrcamento && (
                                        <span className="font-normal text-gray-500 dark:text-gray-400">
                                          {' '}
                                          (grupo no orçamento)
                                        </span>
                                      )}
                                    </span>
                                  </ServicosDropdownCheckbox>
                                  {t.itens.length > 0 && (
                                    <div className="mt-2 ml-2 pl-3 border-l-2 border-red-500/35 dark:border-red-400/30 space-y-1">
                                      {itensVisiveis.map(i => {
                                        const ik = buildItemKeyOrcamento(t.key, i.chave);
                                        const linhaJaNoOrcamento = assinaturasItensVisiveisNoOrcamento.has(
                                          itemSigParaOrcamento(i)
                                        );
                                        return (
                                          <ServicosDropdownCheckbox
                                            key={ik}
                                            compact
                                            checked={
                                              linhaJaNoOrcamento ? true : linhasSelecionadasDropdown.has(ik)
                                            }
                                            disabled={linhaJaNoOrcamento}
                                            onChange={() => {
                                              if (!linhaJaNoOrcamento) toggleLinhaDropdown(ik);
                                            }}
                                          >
                                            <span
                                              className={`text-xs leading-snug pt-0.5 ${
                                                linhaJaNoOrcamento
                                                  ? 'text-gray-500 dark:text-gray-400'
                                                  : 'text-gray-700 dark:text-gray-300'
                                              }`}
                                            >
                                              <span className="font-mono text-[11px] text-gray-500 dark:text-gray-400">
                                                {i.codigo}
                                              </span>
                                              <span className="text-gray-400 dark:text-gray-500"> · </span>
                                              <span className="text-[13px]">{i.descricao}</span>
                                              {linhaJaNoOrcamento && (
                                                <span className="ml-1.5 text-[10px] font-medium text-gray-400 dark:text-gray-500">
                                                  (já no orçamento)
                                                </span>
                                              )}
                                            </span>
                                          </ServicosDropdownCheckbox>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                  <button
                    type="button"
                    onClick={() => { addSubtitulosSelecionadosAoOrcamento(); setShowServicosDropdown(false); }}
                    className="h-10 px-4 bg-red-600 text-white rounded-md hover:bg-red-700 inline-flex items-center gap-2 font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Adicionar ({linhasSelecionadasDropdown.size})
                  </button>
                </div>

                {linhasSelecionadasDropdown.size > 0 && subtitulosAdicionados.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 py-2">
                    {linhasSelecionadasDropdown.size} linha(s) selecionada(s). Use o checkbox do grupo para marcar todas
                    as composições ou escolha linhas específicas. Depois clique em <strong>Adicionar</strong>.
                  </p>
                )}
                </>
                )}

                {subtitulosAdicionados.length === 0 && !loadingFromApi && (
                  <div role="status" className={ORCAMENTO_SECAO_VAZIA_SHELL}>
                    <div className={`mb-5 ${ORCAMENTO_ICON_SOFT_BOX}`}>
                      <ClipboardList className={ORCAMENTO_ICON_SOFT_GLYPH} aria-hidden />
                    </div>
                    <h3 className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                      Orçamento ainda sem itens
                    </h3>
                    <p className="mt-2 max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                      {!meta.importadoPlanilha && todosSubtitulos.length > 0
                        ? 'Comece criando um serviço e um subtítulo em branco, ou selecione linhas no campo acima para trazer do catálogo.'
                        : !meta.importadoPlanilha && todosSubtitulos.length === 0
                          ? 'Não há serviços no catálogo ainda. Importe o orçamento perfeito na aba Importações ou crie a estrutura manualmente aqui.'
                          : 'Crie o primeiro serviço e subtítulo para montar o orçamento; depois adicione composições pelo menu da linha ou importe dados quando precisar.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => abrirModalNovoTituloViaMenu()}
                      className="mt-6 inline-flex items-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-red-900/15 transition hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900"
                    >
                      <Plus className="h-4 w-4 shrink-0" aria-hidden />
                      Criar primeiro serviço
                    </button>
                  </div>
                )}

                {subtitulosAdicionados.length > 0 && (
                  <>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => setShowDetalhesFinanceiros(v => !v)}
                        className="text-xs px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        {showDetalhesFinanceiros ? 'Ocultar detalhes financeiros' : 'Ver detalhes financeiros'}
                      </button>
                    </div>
                    <div
                      ref={montagemOrcamentoTableRef}
                      className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900"
                    >
                      <table className={`min-w-[1210px] w-full border-collapse text-sm ${gradeTableCls}`}>
                        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10 border-b border-gray-200 dark:border-gray-700">
                          <tr className={gradeTableRowTrCls}>
                            <th className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide">
                              Item
                            </th>
                            <th className="w-[88px] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Código</th>
                            <th className="w-[88px] px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Banco</th>
                            <th className="min-w-[260px] px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Descrição</th>
                            <th className="w-14 px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Un.</th>
                            <th className="w-[104px] px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Qtd.</th>
                            <th className="w-[104px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">MÃO DE OBRA</th>
                            <th className="w-[104px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">MATERIAL</th>
                            <th className="w-[104px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Custo dir.</th>
                            {showDetalhesFinanceiros && (
                              <>
                                <th className="w-[108px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Sub M.O.</th>
                                <th className="w-[108px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Sub mat.</th>
                              </>
                            )}
                            <th className="w-[112px] px-2 py-2.5 text-right text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide whitespace-nowrap border-l border-gray-300 dark:border-gray-600">Total</th>
                            <th className="w-[72px] px-2 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600">Peso %</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700">
                          {(() => {
                            const colunasTotais = 11 + (showDetalhesFinanceiros ? 2 : 0);
                            const servicoNumero = new Map<string, number>();
                            let nextMain = 0;
                            for (const b of subtitulosAdicionados) {
                              if (!servicoNumero.has(b.servicoNome)) {
                                servicoNumero.set(b.servicoNome, ++nextMain);
                              }
                            }
                            return subtitulosAdicionados.map((bloco, blocoIndex) => {
                        const rowsDoBloco = itensCalculados.filter(r => r.servicoNome === bloco.servicoNome && r.subtituloNome === bloco.subtituloNome);
                        const mesmoTituloSubtitulo =
                          bloco.servicoNome.trim().toLowerCase() === bloco.subtituloNome.trim().toLowerCase();
                        const main = servicoNumero.get(bloco.servicoNome) ?? 0;
                        const subIdx = subtitulosAdicionados
                          .slice(0, blocoIndex + 1)
                          .filter(b => b.servicoNome === bloco.servicoNome).length;
                        const blocoAnt = blocoIndex > 0 ? subtitulosAdicionados[blocoIndex - 1] : null;
                        const mostrarTituloServico =
                          !blocoAnt ||
                          normalizarNomeServicoOrcamento(blocoAnt.servicoNome) !==
                            normalizarNomeServicoOrcamento(bloco.servicoNome);
                        return (
                          <React.Fragment key={bloco.key}>
                            {mostrarTituloServico && (
                            <tr
                              className={`bg-red-600 dark:bg-red-950/90 ${gradeTableRowTrCls}`}
                              data-orc-ctx-montagem="tituloServico"
                              data-servico-id={bloco.key.split('|')[0] ?? ''}
                              title="Clique com o botão direito para apagar este serviço do orçamento"
                            >
                              <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-sm font-bold tabular-nums text-white">
                                {main}
                              </td>
                              <td colSpan={colunasTotais - 1} className="px-3 py-2.5">
                                <span className="text-xs font-bold uppercase tracking-wide text-left text-white">
                                  {bloco.servicoNome}
                                </span>
                              </td>
                            </tr>
                            )}
                            <tr
                              className={`border-b border-gray-200/90 bg-slate-200/90 dark:border-gray-800 dark:bg-gray-900 ${gradeTableRowTrCls}`}
                              data-orc-ctx-montagem="subtitulo"
                              data-bloco-key={bloco.key}
                            >
                              <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-xs font-semibold tabular-nums text-gray-800 dark:text-gray-200">
                                {`${main}.${subIdx}`}
                              </td>
                              <td colSpan={colunasTotais - 1} className="px-3 py-2.5">
                                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200 sm:text-xs">
                                  {mesmoTituloSubtitulo ? bloco.servicoNome : bloco.subtituloNome}
                                </span>
                              </td>
                            </tr>
                                  {rowsDoBloco.map((row, itemIdx) => {
                                    const usaDimensoes = !!row.dimensoes?.linhas?.length;
                                    const dim = dimensoesPorItem[row.key] || { tipoUnidade: 'm3' as const, linhas: [] };
                                    const tipoAuto = inferirTipoUnidadePorDimensao(dim.linhas);
                                    const ehCacamba4m3 = ehComposicaoCacamba4m3(row.item.descricao);
                                    const pesoPctOrcamento = total > 0 ? (row.total / total) * 100 : 0;
                                    return (
                                    <React.Fragment key={row.key}>
                                    <tr
                                      className={`border-b border-gray-100/90 bg-white hover:bg-gray-50/90 dark:border-gray-700/90 dark:bg-gray-800 dark:hover:bg-gray-800/95 ${gradeTableRowTrCls}`}
                                      data-orc-ctx-montagem="composicao"
                                      data-item-key={row.key}
                                    >
                                      <td className="w-[6.5rem] min-w-[6.5rem] max-w-[6.5rem] px-3 py-2.5 align-middle text-center text-xs font-medium tabular-nums text-gray-700 dark:text-gray-300">
                                        {`${main}.${subIdx}.${itemIdx + 1}`}
                                      </td>
                                      <td className="px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 align-middle text-center border-l border-gray-200 dark:border-gray-700">{row.item.codigo}</td>
                                      <td className="px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 align-middle text-center border-l border-gray-200 dark:border-gray-700">{row.item.banco}</td>
                                      <td className="min-w-[260px] px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 align-middle max-w-md border-l border-gray-200 dark:border-gray-700"><div className="truncate" title={row.item.descricao}>{row.item.descricao}</div></td>
                                      <td className="px-2 py-2.5 text-center align-middle border-l border-gray-200 dark:border-gray-700">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                                          {unidadeComposicaoParaExibicao(
                                            row.unidadeComposicao,
                                            usaDimensoes ? tipoAuto : 'un'
                                          )}
                                        </span>
                                      </td>
                                      <td className={`text-center align-middle tabular-nums border-l border-gray-200 dark:border-gray-700 ${row.tipoUnidade !== 'un' || ehCacamba4m3 ? 'px-2 py-2.5' : 'p-0'}`}>
                                        {row.tipoUnidade !== 'un' || ehCacamba4m3 ? (
                                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{row.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</span>
                                        ) : (
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={
                                              draftCalc[`qtd|${row.key}`] ??
                                              (row.quantidade === 0
                                                ? ''
                                                : row.quantidade.toLocaleString('pt-BR', {
                                                    minimumFractionDigits: 2,
                                                    maximumFractionDigits: 4
                                                  }))
                                            }
                                            onChange={e => handleCalcChange(`qtd|${row.key}`, e.target.value, n => setQuantidadeItem(row.key, Math.max(0, n)))}
                                            onBlur={e => handleCalcBlur(`qtd|${row.key}`, draftCalc[`qtd|${row.key}`] ?? e.target.value, n => setQuantidadeItem(row.key, Math.max(0, n)))}
                                            placeholder="0"
                                            className={`${inputGradeCls} text-center tabular-nums`}
                                          />
                                        )}
                                      </td>
                                      <td className="px-2 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.maoDeObraUnitario} className="text-sm" />
                                      </td>
                                      <td className="px-2 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.materialUnitario} className="text-sm" />
                                      </td>
                                      <td className="px-2 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.precoUnitario} className="text-sm" />
                                      </td>
                                      {showDetalhesFinanceiros && (
                                        <>
                                          <td className="px-2 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                            <MoedaCelula valor={row.subMaoDeObra} className="text-sm" />
                                          </td>
                                          <td className="px-2 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-700">
                                            <MoedaCelula valor={row.subMaterial} className="text-sm" />
                                          </td>
                                        </>
                                      )}
                                      <td className="px-2 py-2.5 text-sm align-middle whitespace-nowrap tabular-nums font-semibold text-gray-900 dark:text-gray-50 border-l border-gray-200 dark:border-gray-700">
                                        <MoedaCelula valor={row.total} className="text-sm font-semibold" valorClassName="font-semibold" />
                                      </td>
                                      <td className="px-2 py-2.5 text-sm text-center align-middle text-gray-700 dark:text-gray-300 tabular-nums whitespace-nowrap border-l border-gray-200 dark:border-gray-700">
                                        {pesoPctOrcamento.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%
                                      </td>
                                    </tr>
                                    </React.Fragment>
                                    );
                                  })}
                          </React.Fragment>
                        );
                      });
                          })()}
                        </tbody>
                      </table>
                    </div>

                    {menuCtxMontagem &&
                      typeof document !== 'undefined' &&
                      createPortal(
                        <>
                          <div
                            className="fixed inset-0 z-[200]"
                            aria-hidden
                            onClick={() => setMenuCtxMontagem(null)}
                          />
                          <div
                            role="menu"
                            className="fixed z-[201] w-56 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
                            style={{ left: menuCtxMontagem.left, top: menuCtxMontagem.top }}
                            onClick={e => e.stopPropagation()}
                          >
                            {menuCtxMontagem.kind === 'composicao' && (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60"
                                onClick={() => {
                                  setMenuCtxMontagem(null);
                                  abrirModalNovoTituloViaMenu();
                                }}
                              >
                                <Plus className="h-4 w-4 shrink-0" aria-hidden />
                                Adicionar título
                              </button>
                            )}
                            {menuCtxMontagem.kind === 'composicao' && (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60"
                                onClick={() => {
                                  const parsedItem = parseItemKeyOrcamento(menuCtxMontagem.composicaoKey);
                                  const parsedBloco = parsedItem ? parseBlocoKeyOrcamento(parsedItem.blocoKey) : null;
                                  const servicoId = parsedBloco?.servicoId ?? null;
                                  setMenuCtxMontagem(null);
                                  if (!servicoId) {
                                    toast.error('Não foi possível identificar o título para incluir o subtítulo.');
                                    return;
                                  }
                                  abrirModalNovoSubtituloViaMenu(servicoId);
                                }}
                              >
                                <ListPlus className="h-4 w-4 shrink-0" aria-hidden />
                                Adicionar subtítulo
                              </button>
                            )}
                            {(menuCtxMontagem.kind === 'subtitulo' || menuCtxMontagem.kind === 'composicao') && (
                              <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/30"
                                onClick={() => {
                                  if (menuCtxMontagem.kind === 'subtitulo') {
                                    const blocoKey = menuCtxMontagem.blocoKey;
                                    setMenuCtxMontagem(null);
                                    abrirModalAdicionarComposicaoOrcafascioNoBloco(blocoKey);
                                    return;
                                  }
                                  const key = menuCtxMontagem.composicaoKey;
                                  setMenuCtxMontagem(null);
                                  abrirModalAdicionarComposicaoOrcafascio(key);
                                }}
                              >
                                <ListPlus className="h-4 w-4 shrink-0" aria-hidden />
                                Adicionar composição Orçafascio
                              </button>
                            )}
                            <button
                              type="button"
                              role="menuitem"
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                              onClick={() => {
                                if (menuCtxMontagem.kind === 'tituloServico') {
                                  if (
                                    typeof window !== 'undefined' &&
                                    !window.confirm(
                                      'Remover este serviço inteiro do orçamento? Todos os subtítulos e composições dele serão retirados.'
                                    )
                                  ) {
                                    setMenuCtxMontagem(null);
                                    return;
                                  }
                                  removerTituloServicoDoOrcamento(menuCtxMontagem.servicoId);
                                } else if (menuCtxMontagem.kind === 'subtitulo') {
                                  removeSubtituloDoOrcamento(menuCtxMontagem.blocoKey);
                                } else {
                                  removerItemComposicaoDoOrcamento(menuCtxMontagem.composicaoKey);
                                }
                                setMenuCtxMontagem(null);
                              }}
                            >
                              <Trash2 className="h-4 w-4 shrink-0" aria-hidden />
                              Apagar
                            </button>
                          </div>
                        </>,
                        document.body
                      )}

                    <div className="mt-6 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/40 dark:bg-gray-900/30 px-4 py-4 sm:px-5">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
                        Fechamento financeiro
                      </h4>
                      <dl className="divide-y divide-gray-200/90 dark:divide-gray-700/90">
                        {[
                          ['TOTAL', resumoFinanceiro.totalBase],
                          [`Desconto (${(resumoFinanceiro.descontoPct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`, resumoFinanceiro.valorDesconto],
                          ['Total com desconto', resumoFinanceiro.totalComDesconto],
                          [`Total geral com desconto e BDI (${(resumoFinanceiro.bdiPct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%)`, resumoFinanceiro.totalComDescontoEBdi],
                          ...resumoFinanceiro.reajustesAplicados.map((r) => [
                            `${r.nome} (${(r.percentualPct * 100).toLocaleString('pt-BR', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}%)`,
                            r.valor
                          ] as [string, number])
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0"
                          >
                            <dt className="min-w-0 flex-1 text-sm text-gray-600 dark:text-gray-400 leading-snug">
                              {label}
                            </dt>
                            <dd className="shrink-0 text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 text-right">
                              R$ {Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </dd>
                          </div>
                        ))}
                      </dl>
                      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-2 border-t border-gray-300/80 dark:border-gray-600 pt-4">
                        <span className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                          Valor final
                        </span>
                        <span className="shrink-0 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-50 text-right">
                          R$ {resumoFinanceiro.valorFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={exportarOrcamentoDetalhado}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
                        title="Exporta o orçamento"
                      >
                        <FileSpreadsheet className="w-5 h-5 shrink-0" />
                        Exportar Orçamento
                      </button>
                    </div>

                  </>
                )}
                </div>
              </CardContent>
            </Card>
            )
          )}

          {/* Tab: Importações (planilhas, orçamento perfeito, histórico de documentos) */}
          {activeTab === 'importacoes' && (
            <Card className="overflow-hidden border-gray-200/90 dark:border-gray-700/90 shadow-none">
              <CardHeader className="!border-gray-100 dark:!border-gray-800/80">
                <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                  Importações do contrato
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-3xl">
                  Planilhas enviadas ficam ligadas a este centro de custo e aparecem na montagem em{' '}
                  <span className="font-medium text-gray-700 dark:text-gray-300">Orçamentos</span>.
                </p>
              </CardHeader>
              <CardContent className="pt-6 space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Orçamento perfeito */}
                  <div className="flex flex-col rounded-2xl border border-emerald-200/80 dark:border-emerald-900/50 bg-emerald-50/40 dark:bg-emerald-950/20 p-5 min-h-[11rem]">
                    <div className="flex gap-3 mb-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                        <Upload className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          Orçamento perfeito
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                          Estrutura de serviços e itens (planilha padrão do contrato).
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto">
                      <label
                        className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 cursor-pointer transition-colors ${
                          !centroCustoId || isImportandoOrcamento || isUploading || carregandoListaOrcamentos
                            ? 'opacity-50 pointer-events-none'
                            : ''
                        }`}
                        title={!centroCustoId ? 'Selecione um contrato antes' : undefined}
                      >
                        {isImportandoOrcamento ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        <span>{isImportandoOrcamento ? 'Importando…' : 'Escolher arquivo (.xlsx, .xls, .csv)'}</span>
                        <input
                          ref={importOrcamentoTabFileInputRef}
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={(e) => void handleImportOrcamentoPerfeito(e)}
                          disabled={isImportandoOrcamento || isUploading || carregandoListaOrcamentos}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Catálogo de composições */}
                  <div className="flex flex-col rounded-2xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/30 p-5 min-h-[11rem]">
                    <div className="flex gap-3 mb-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-600 dark:bg-slate-500 text-white shadow-sm">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                          Catálogo de composições
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5 leading-relaxed">
                          Itens SINAPI: código, banco, chave, descrição, unidade e custos.
                        </p>
                      </div>
                    </div>
                    <div className="mt-auto space-y-2">
                      <label
                        className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium bg-slate-700 text-white shadow-sm hover:bg-slate-800 dark:bg-slate-600 dark:hover:bg-slate-500 cursor-pointer transition-colors ${
                          isImportandoOrcamento || isUploading || carregandoListaOrcamentos
                            ? 'opacity-50 pointer-events-none'
                            : ''
                        }`}
                      >
                        {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        <span>{isUploading ? 'Processando…' : 'Escolher planilha de composições'}</span>
                        <input
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={handleFileUploadComposicoes}
                          disabled={isImportandoOrcamento || isUploading || carregandoListaOrcamentos}
                          className="hidden"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setOrcafascioModalOpen(true);
                          setOrcafascioModalTab('composicoes');
                          setOrcafascioModalOrcamentosSearch('');
                          setOrcafascioResultados(null);
                          setOrcafascioDetalhe(null);
                          setOrcafascioSearch('');
                        }}
                        disabled={isImportandoOrcamento || isUploading || carregandoListaOrcamentos}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium bg-violet-600 text-white shadow-sm hover:bg-violet-700 transition-colors ${
                          isImportandoOrcamento || isUploading || carregandoListaOrcamentos
                            ? 'opacity-50 pointer-events-none'
                            : ''
                        }`}
                      >
                        <DownloadCloud className="w-4 h-4" />
                        <span>Buscar no Orçafascio</span>
                      </button>
                      <button
                        type="button"
                        onClick={apagarPlanilhaComposicoes}
                        disabled={composicoes.length === 0}
                        className="w-full text-center text-xs font-medium py-1.5 transition-colors text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-40 disabled:pointer-events-none disabled:hover:text-slate-500"
                        title="Apagar o catálogo de composições importado (planilha)"
                      >
                        Limpar catálogo de composições
                      </button>
                    </div>
                  </div>
                </div>

                {centroCustoId && (
                  <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <FileDown className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {loadingFromApi ? 'Carregando do S3…' : `Histórico de arquivos (${historicoOrcamentoPerfeito.length})`}
                      </p>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Registros de importação de Orçamento perfeito neste contrato.
                    </p>
                    {historicoOrcamentoPerfeito.length > 0 ? (
                      <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200/80 dark:border-gray-600/80 bg-white/60 dark:bg-gray-950/30 divide-y divide-gray-100 dark:divide-gray-800">
                        {historicoOrcamentoPerfeito.map(imp => (
                          <div
                            key={imp.id}
                            className="flex items-start gap-2 px-3 py-2.5 text-xs text-gray-600 dark:text-gray-400 hover:bg-gray-50/80 dark:hover:bg-gray-800/50"
                          >
                            <div className="min-w-0 flex-1 leading-snug">
                              <span className="block break-words">
                                <span className="font-medium text-gray-800 dark:text-gray-200">{imp.fileName}</span>
                                {' · '}
                                {imp.tipo}
                                {imp.date ? ` · ${new Date(imp.date).toLocaleString('pt-BR')}` : ''}
                                {imp.servicosCount != null && ` · ${imp.servicosCount} serv.`}
                                {imp.itensCount != null && ` · ${imp.itensCount} itens`}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => removerImportDoHistorico(imp.id)}
                              className="shrink-0 rounded-md p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                              title="Remover da lista"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 dark:text-gray-500 py-6 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
                        Nenhum arquivo registrado ainda.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

        </div>
      </MainLayout>

      {/* ── Modal Orçafascio ─────────────────────────────────────────────── */}
      {orcafascioModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-6xl max-h-[92vh] flex flex-col rounded-2xl bg-white dark:bg-gray-900 shadow-2xl overflow-hidden">

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-600 text-white">
                  <DownloadCloud className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    {orcafascioModalTab === 'orcamentos' ? 'Orçamentos' : 'Importar do Orçafascio'}
                  </h2>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {orcafascioModalTab === 'orcamentos'
                      ? 'Lista de orçamentos salvos neste sistema'
                      : 'Catálogo ORSE (Sergipe) — busca por código ou descrição'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setOrcafascioModalOpen(false); setOrcafascioDetalhe(null); }}
                className="rounded-lg p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Abas */}
            <div className="flex gap-0 border-b border-gray-200 dark:border-gray-700 shrink-0 px-6">
              <button
                type="button"
                onClick={() => setOrcafascioModalTab('composicoes')}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  orcafascioModalTab === 'composicoes'
                    ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Composições
              </button>
              <button
                type="button"
                onClick={() => setOrcafascioModalTab('orcamentos')}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  orcafascioModalTab === 'orcamentos'
                    ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Orçamentos
              </button>
            </div>

            {/* ── Aba Orçamentos (API Orçafascio) ────────────────────────────── */}
            {orcafascioModalTab === 'orcamentos' && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                {/* Barra superior: filtro + botão buscar */}
                <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0 flex flex-wrap gap-3 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5">
                      <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <input
                        type="text"
                        placeholder="Filtrar por descrição ou código…"
                        value={orcafascioModalOrcamentosSearch}
                        onChange={e => setOrcafascioModalOrcamentosSearch(e.target.value)}
                        className="flex-1 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      buscarOrcamentosOrcafascio(1);
                      setOrcafascioOrcamentoDetalhe(null);
                      setOrcafascioOrcamentoComposicoes(null);
                      setOrcafascioOrcamentoAnalitico(null);
                      setOrcafascioOrcamentoLinhaCatalogo(null);
                      setOrcafascioOrcamentoLinhaChave(null);
                    }}
                    disabled={orcafascioOrcamentosLoading}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {orcafascioOrcamentosLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                    Buscar
                  </button>
                </div>

                {/* Fluxo em telas: Lista -> Composições -> Insumos */}
                <div className="flex flex-1 min-h-0 overflow-hidden">
                  {!orcafascioOrcamentoDetalhe && (
                    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                      <div className="flex-1 overflow-auto">
                        {orcafascioOrcamentosLoading && (
                          <div className="flex items-center justify-center py-12 text-gray-400">
                            <Loader2 className="w-6 h-6 animate-spin mr-2" />
                            <span className="text-sm">Carregando orçamentos…</span>
                          </div>
                        )}
                        {!orcafascioOrcamentosLoading && orcafascioOrcamentos === null && (
                          <div className="flex flex-col items-center justify-center py-12 text-gray-400 px-6 text-center">
                            <DownloadCloud className="w-10 h-10 mb-2 opacity-40" />
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              Clique em <strong className="font-medium text-gray-600 dark:text-gray-300">Buscar</strong> para carregar os orçamentos do Orçafascio.
                            </p>
                          </div>
                        )}
                        {!orcafascioOrcamentosLoading && orcafascioOrcamentos !== null && (() => {
                          if (orcafascioOrcamentos.length === 0) {
                            return (
                              <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
                                <p className="text-sm text-gray-400">
                                  {orcafascioModalOrcamentosSearch.trim()
                                    ? `Nenhum resultado para «${orcafascioModalOrcamentosSearch}».`
                                    : 'Nenhum orçamento encontrado na API.'}
                                </p>
                              </div>
                            );
                          }
                          return (
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="bg-gray-50 dark:bg-gray-800/70 sticky top-0 z-10">
                                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700">Código</th>
                                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700">Descrição</th>
                                  <th className="text-left px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-gray-700">Atualizado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {orcafascioOrcamentos.map(o => (
                                  <tr
                                    key={o.id}
                                    onClick={() => verDetalheOrcamentoOrcafascio(o)}
                                    className="cursor-pointer border-b border-gray-50 dark:border-gray-800/60 transition-colors hover:bg-violet-50 dark:hover:bg-violet-950/20"
                                  >
                                    <td className="px-3 py-2 font-mono font-semibold text-gray-800 dark:text-gray-200 text-[11px] whitespace-nowrap">
                                      {o.code || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[360px]">
                                      <span className="line-clamp-2 leading-snug">{o.description || '—'}</span>
                                    </td>
                                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap tabular-nums text-[11px]">
                                      {o.updated_at ? new Date(o.updated_at as string).toLocaleDateString('pt-BR') : '—'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          );
                        })()}
                      </div>
                      {orcafascioOrcamentos !== null && !orcafascioOrcamentosLoading && (
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 dark:border-gray-800 shrink-0 gap-2 flex-wrap">
                          <span className="text-xs text-gray-400">
                            Pág. {orcafascioOrcamentosPage}
                            {orcafascioOrcamentosTotal != null && <> · {orcafascioOrcamentosTotal.toLocaleString('pt-BR')} total</>}
                            {' · '}{orcafascioOrcamentos.length} nesta página
                          </span>
                          <div className="flex gap-1 shrink-0">
                            <button
                              disabled={orcafascioOrcamentosPage <= 1}
                              onClick={() => buscarOrcamentosOrcafascio(orcafascioOrcamentosPage - 1)}
                              className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                              disabled={
                                orcafascioOrcamentos.length === 0 ||
                                (orcafascioOrcamentosTotal != null &&
                                  orcafascioOrcamentosPage * (orcafascioOrcamentos.length || 1) >= orcafascioOrcamentosTotal)
                              }
                              onClick={() => buscarOrcamentosOrcafascio(orcafascioOrcamentosPage + 1)}
                              className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {orcafascioOrcamentoDetalhe && !orcafascioOrcamentoLinhaCatalogo && (
                    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Orçamento selecionado</p>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug">
                            {(orcafascioOrcamentoDetalhe.description as string) || 'Orçamento'}
                          </p>
                          <p className="text-[10px] text-gray-500 mt-1">
                            {(orcafascioOrcamentoDetalhe.code as string) || '—'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setOrcafascioOrcamentoDetalhe(null);
                            setOrcafascioOrcamentoComposicoes(null);
                            setOrcafascioOrcamentoAnalitico(null);
                            setOrcafascioOrcamentoLinhaCatalogo(null);
                            setOrcafascioOrcamentoLinhaChave(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/40"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          Voltar para lista
                        </button>
                      </div>
                      <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/30 text-[10px] text-gray-500">
                        Composições: {(orcafascioOrcamentoComposicoes?.length ?? 0).toLocaleString('pt-BR')} · Analíticos disponíveis: {(orcafascioOrcamentoAnalitico?.length ?? 0).toLocaleString('pt-BR')}
                      </div>
                      <div className="flex-1 overflow-auto min-h-0">
                        {orcafascioOrcamentoComposicoesLoading && (
                          <div className="flex items-center justify-center py-10 text-gray-400">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            <span className="text-sm">Carregando composições…</span>
                          </div>
                        )}
                        {!orcafascioOrcamentoComposicoesLoading && orcafascioOrcamentoComposicoes !== null && (
                          orcafascioOrcamentoComposicoes.length === 0 ? (
                            <p className="text-xs text-gray-400 py-8 text-center px-4">
                              Nenhuma composição encontrada neste orçamento.
                            </p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[980px] text-xs border-collapse">
                                <thead>
                                  <tr className="bg-gray-50 dark:bg-gray-800/70 sticky top-0 z-10">
                                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Item</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Tipo</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Base</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Código</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700">Descrição</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Un.</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Versão</th>
                                    <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Qtd</th>
                                    <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Unit.</th>
                                    <th className="text-right px-3 py-2 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {orcafascioOrcamentoComposicoes.map((item, idx) => {
                                    const row = item as Record<string, unknown>;
                                    const descr = textoDescricaoOrcafascio(row);
                                    const qty = valorNumericoOrcafascio(row.qty ?? row.quantity ?? null);
                                    const total = valorNumericoOrcafascio(
                                      row.total_price_plus_bdi ?? row.total_price ?? row.total ?? row.total_price_synthetic
                                    );
                                    const precUni = valorNumericoOrcafascio(
                                      row.price_plus_bdi ?? row.price_of_bdi ?? row.price ?? row.unit_price
                                    ) ?? precoOrcafascioAnalitico(row);
                                    const bid = idOrcamentoOrcafascioParaApi(orcafascioOrcamentoDetalhe);
                                    const cc = codigoCatalogoLinhaOrcamentoOrcafascio(row);
                                    const linhaKey = cc ? `orcamento-composicoes-${bid}-${idx}-${cc}` : '';
                                    const sel = cc && orcafascioOrcamentoLinhaChave === linhaKey;
                                    return (
                                      <tr
                                        key={(row.id as string) ?? idx}
                                        onClick={() => void abrirCatalogoPorLinhaOrcamento(row, idx, 'orcamento-composicoes')}
                                        className={`border-b border-gray-50 dark:border-gray-800/60 transition-colors ${
                                          cc ? 'cursor-pointer hover:bg-violet-50/60 dark:hover:bg-violet-950/10' : 'cursor-default opacity-90'
                                        } ${sel ? 'bg-violet-50 dark:bg-violet-950/30' : ''}`}
                                      >
                                        <td className="px-3 py-2 whitespace-nowrap text-gray-600 dark:text-gray-300 font-mono text-[11px]">{textoItemizacaoOrcafascio(row)}</td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          <span className="inline-flex items-center rounded bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-gray-700 dark:text-gray-300">
                                            {textoKindOrcafascio(row)}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 whitespace-nowrap">
                                          <span className="inline-flex items-center rounded bg-violet-100 dark:bg-violet-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                                            {`${(row.base as string) || '—'}${row.base_locals ? `/${String(row.base_locals)}` : ''}`}
                                          </span>
                                        </td>
                                        <td className="px-3 py-2 font-mono font-semibold text-gray-800 dark:text-gray-200 text-[11px] whitespace-nowrap">{(row.code as string) || '—'}</td>
                                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-[320px]"><span className="line-clamp-2 leading-snug">{descr || '—'}</span></td>
                                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-[11px]">{(row.unity as string) || (row.unit as string) || '—'}</td>
                                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-[11px]">{textoVersaoBaseOrcafascio(row)}</td>
                                        <td className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 whitespace-nowrap tabular-nums text-[11px]">{qty != null ? qty.toLocaleString('pt-BR') : '—'}</td>
                                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 font-semibold whitespace-nowrap tabular-nums text-[11px]">
                                          {precUni != null && precUni !== 0 ? precUni.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : precUni === 0 ? 'R$ 0,00' : '—'}
                                        </td>
                                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300 font-semibold whitespace-nowrap tabular-nums text-[11px]">
                                          {total != null && total !== 0 ? total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : total === 0 ? 'R$ 0,00' : '—'}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {orcafascioOrcamentoDetalhe && orcafascioOrcamentoLinhaCatalogo && (
                    <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mb-1">Analítico da composição</p>
                          <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug">
                            {orcafascioOrcamentoLinhaCatalogo.code} · {orcafascioOrcamentoLinhaCatalogo.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => { setOrcafascioOrcamentoLinhaCatalogo(null); setOrcafascioOrcamentoLinhaChave(null); }}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-violet-700 dark:text-violet-300 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-950/40"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                          Voltar para composições
                        </button>
                      </div>
                      <div className="flex-1 overflow-auto min-h-0 px-4 py-3">
                        {orcafascioOrcamentoLinhaCatalogoLoading && (
                          <div className="flex items-center justify-center py-8 text-gray-500">
                            <Loader2 className="w-5 h-5 animate-spin mr-2" />
                            <span className="text-sm">Carregando insumos…</span>
                          </div>
                        )}
                        {!orcafascioOrcamentoLinhaCatalogoLoading && (
                          orcafascioOrcamentoLinhaCatalogo.items.length === 0 ? (
                            <p className="text-xs text-gray-400 py-6 text-center">Sem insumos/serviços nesta composição.</p>
                          ) : (
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[900px] text-xs border-collapse">
                                <thead>
                                  <tr className="bg-gray-50 dark:bg-gray-800/70 sticky top-0 z-10">
                                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700">Tipo</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700">Base</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700">Código</th>
                                    <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700">Descrição</th>
                                    <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700">Coef.</th>
                                    <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700">Deson.</th>
                                    <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700">Oner.</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {orcafascioOrcamentoLinhaCatalogo.items.map((it, j) => (
                                    <tr key={j} className="border-b border-gray-100 dark:border-gray-800/80">
                                      <td className="px-3 py-2 whitespace-nowrap">{it.is_resource ? 'Insumo' : 'Serviço'}</td>
                                      <td className="px-3 py-2 whitespace-nowrap font-semibold text-violet-700 dark:text-violet-300">{it.banco}</td>
                                      <td className="px-3 py-2 font-mono">{it.code}</td>
                                      <td className="px-3 py-2 max-w-[520px]"><span className="line-clamp-2">{it.description}</span></td>
                                      <td className="px-3 py-2 text-right tabular-nums">{it.coefficient != null ? it.coefficient.toLocaleString('pt-BR') : '—'}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{it.pnd != null ? it.pnd.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td>
                                      <td className="px-3 py-2 text-right tabular-nums">{it.pd != null ? it.pd.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Aba Composições ────────────────────────────────────────────── */}
            {orcafascioModalTab === 'composicoes' && <>

            {/* Busca (somente ORSE no backend) */}
            <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0 flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1 block">
                  Código ou descrição
                </label>
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5">
                  <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Vazio = listar catálogo (1ª página); ou código / trecho da descrição…"
                    value={orcafascioSearch}
                    onChange={e => setOrcafascioSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && buscarComposicoesOrcafascio(1)}
                    className="flex-1 text-sm bg-transparent outline-none text-gray-800 dark:text-gray-200 placeholder-gray-400"
                  />
                </div>
              </div>

              <div className="self-end flex flex-col items-end gap-1">
                <button
                  type="button"
                  onClick={() => buscarComposicoesOrcafascio(1)}
                  disabled={orcafascioLoading}
                  title="Campo vazio ou só espaços: primeira página do catálogo; texto ou código refinam a lista."
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {orcafascioLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Buscar
                </button>
              </div>
            </div>

            {orcafascioResultados?._orcafascio_mix_fallback && (
              <div className="px-6 py-2 border-b border-amber-200/80 dark:border-amber-900/50 bg-amber-50/90 dark:bg-amber-950/40 shrink-0">
                <p className="text-xs text-amber-900 dark:text-amber-100 leading-snug">
                  {orcafascioResultados._orcafascio_rest_orse_404 ? (
                    <>
                      <strong className="font-semibold">A API REST não tem rota para «orse».</strong> O backend recebeu{' '}
                      <strong>404</strong> em <code className="font-mono text-[11px]">/v1/base/orse/compositions</code> — o site usa{' '}
                      <code className="font-mono text-[11px]">app.orcafascio.com/banco/orse/…</code>, que não é o mesmo caminho da REST.
                      Por isso esta lista veio do segmento{' '}
                      <code className="rounded bg-amber-100/90 dark:bg-amber-900/60 px-1 py-0.5 font-mono text-[11px]">
                        {orcafascioResultados._orcafascio_segment ?? '—'}
                      </code>{' '}
                      (catálogo agregado ~{orcafascioResultados.total.toLocaleString('pt-BR')} itens). Para só ORSE (~9.883), obtenha o{' '}
                      <strong>ID Mongo</strong> da base em ORCAFASCIO_ORSE_SEGMENT (diagnóstico:{' '}
                      <code className="font-mono text-[11px]">GET /api/orcafascio/diagnostico</code>) ou suporte Orçafascio.
                      Para não usar este fallback: <code className="font-mono text-[11px]">ORCAFASCIO_ORSE_FALLBACK_MYBASE_ON_404=0</code> no .env.
                    </>
                  ) : (
                    <>
                      <strong className="font-semibold">Catálogo misto.</strong> Esta resposta veio do segmento{' '}
                      <code className="rounded bg-amber-100/90 dark:bg-amber-900/60 px-1 py-0.5 font-mono text-[11px]">
                        {orcafascioResultados._orcafascio_segment ?? '—'}
                      </code>{' '}
                      (oficiais agregados), por isso o total e a coluna «Banco» misturam várias tabelas. Defina{' '}
                      <code className="font-mono text-[11px]">ORCAFASCIO_ORSE_SEGMENT</code> com o ID correto da base ORSE na REST.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Corpo */}
            <div className="flex flex-1 min-h-0 overflow-hidden">

              {/* Tabela de composições */}
              <div className={`flex flex-col flex-1 min-w-0 overflow-hidden ${orcafascioDetalhe ? 'border-r border-gray-100 dark:border-gray-800' : ''}`}>

                {orcafascioLoading && (
                  <div className="flex items-center justify-center py-12 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mr-2" />
                    <span className="text-sm">Carregando…</span>
                  </div>
                )}

                {!orcafascioLoading && !orcafascioResultados && (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400 px-6 text-center">
                    <DownloadCloud className="w-10 h-10 mb-2 opacity-40" />
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Clique em <strong className="font-medium text-gray-600 dark:text-gray-300">Buscar</strong> para carregar o catálogo.
                    </p>
                  </div>
                )}

                {!orcafascioLoading && orcafascioResultados && (() => {
                  const qRaw = orcafascioSearch.trim();
                  const qLc = qRaw.toLowerCase();
                  const listagemPorTexto = qRaw.length > 0 && !/^\d+$/.test(qRaw);
                  const correspondeTextoLocal = (c: OrcafascioComposicaoListItem) => {
                    if (!listagemPorTexto) return true;
                    const hay = `${c.code} ${c.second_code ?? ''} ${c.description}`.toLowerCase();
                    return hay.includes(qLc);
                  };
                  const filtradas = orcafascioResultados.records.filter(c => correspondeTextoLocal(c));

                  const totalCatalogo = orcafascioResultados.total;
                  const nPag = orcafascioResultados.records.length;
                  const textoSemMatchNestaPag =
                    listagemPorTexto &&
                    nPag > 0 &&
                    filtradas.length === 0 &&
                    orcafascioResultados.records.every(c => !correspondeTextoLocal(c));

                  const showSegmentoApiCol =
                    !!orcafascioResultados._aggregated ||
                    orcafascioResultados.records.some(c => !!c.__orcafascio_base);

                  return filtradas.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 px-6 text-center max-w-lg mx-auto">
                      {orcafascioResultados.records.length === 0 ? (
                        <p className="text-sm text-gray-400">Esta página veio vazia da API.</p>
                      ) : textoSemMatchNestaPag ? (
                        <>
                          <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
                            Nenhuma das {nPag} composição(ões) desta página contém «{qRaw}».
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
                            O catálogo desta base tem cerca de {totalCatalogo.toLocaleString('pt-BR')} itens, mas a API envia só alguns por página (sem filtrar pelo texto).
                            Use as <strong className="text-gray-600 dark:text-gray-300">setas</strong> para outras páginas — o termo pode aparecer lá.
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-400">Nenhuma composição encontrada.</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 overflow-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-gray-50 dark:bg-gray-800/70 sticky top-0 z-10">
                            {showSegmentoApiCol && (
                              <th className="text-left px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-gray-700 max-w-[140px]">
                                Segmento API
                              </th>
                            )}
                            <th className="text-left px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-gray-700">Banco</th>
                            <th className="text-left px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-gray-700">Data</th>
                            <th className="text-left px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-gray-700">Código</th>
                            <th className="text-left px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] border-b border-gray-200 dark:border-gray-700">Descrição</th>
                            <th className="text-left px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-gray-700">Tipo</th>
                            <th className="text-left px-3 py-2.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[10px] whitespace-nowrap border-b border-gray-200 dark:border-gray-700">UN</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtradas.map(comp => (
                            <tr
                              key={comp.__orcafascio_base ? `${comp.__orcafascio_base}:${comp.id}` : comp.id}
                              onClick={() => verDetalheComposicaoOrcafascio(comp)}
                              className={`cursor-pointer border-b border-gray-50 dark:border-gray-800/60 transition-colors hover:bg-violet-50 dark:hover:bg-violet-950/20 ${
                                orcafascioDetalhe?.id === comp.id ? 'bg-violet-50 dark:bg-violet-950/30' : ''
                              }`}
                            >
                              {showSegmentoApiCol && (
                                <td
                                  className="px-3 py-2 whitespace-nowrap max-w-[140px]"
                                  title={comp.__orcafascio_base ?? ''}
                                >
                                  <span className="inline-flex items-center rounded bg-slate-100 dark:bg-slate-800/80 px-1.5 py-0.5 text-[9px] font-mono text-slate-600 dark:text-slate-300 truncate block max-w-[132px]">
                                    {rotuloSegmentoOrcafascioApi(comp.__orcafascio_base)}
                                  </span>
                                </td>
                              )}
                              <td className="px-3 py-2 whitespace-nowrap">
                                <span className="inline-flex items-center rounded bg-violet-100 dark:bg-violet-900/50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                                  {inferirBancoOrcafascio(comp)}
                                </span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400 font-mono text-[11px]">
                                {formatDataOrcafascio(comp.created_at)}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap font-mono font-semibold text-gray-800 dark:text-gray-200 text-[11px]">
                                {comp.code}
                                {comp.is_sicro && <span className="ml-1 text-[9px] text-blue-500 font-normal">SICRO</span>}
                              </td>
                              <td className="px-3 py-2 text-gray-700 dark:text-gray-300 max-w-xs">
                                <span className="line-clamp-2 leading-snug">{comp.description}</span>
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400 text-[11px]">{comp.type}</td>
                              <td className="px-3 py-2 whitespace-nowrap text-gray-500 dark:text-gray-400 font-mono text-[11px]">{comp.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Paginação: total da API = catálogo na base (listagem GET na doc não filtra por texto no servidor). */}
                {orcafascioResultados && (() => {
                  const qRaw = orcafascioSearch.trim();
                  const listagemPorTexto = qRaw.length > 0 && !/^\d+$/.test(qRaw);
                  const rawLen = orcafascioResultados.records.length;
                  const agg = !!orcafascioResultados._aggregated;
                  const aggLimit = orcafascioResultados._aggregated_page_limit;
                  const matchLocal = listagemPorTexto
                    ? orcafascioResultados.records.filter(c => {
                        const hay = `${c.code} ${c.second_code ?? ''} ${c.description}`.toLowerCase();
                        return hay.includes(qRaw.toLowerCase());
                      }).length
                    : rawLen;
                  const showPagination = agg
                    ? ((aggLimit ?? 1) > 1 || orcafascioPage > 1)
                    : orcafascioResultados.total > orcafascioResultados.per_page;
                  let disableNext = orcafascioLoading;
                  if (!disableNext) {
                    if (agg && aggLimit != null) {
                      disableNext = orcafascioPage >= aggLimit;
                    } else if (!agg) {
                      disableNext =
                        orcafascioPage * orcafascioResultados.per_page >= orcafascioResultados.total;
                    }
                  }
                  return (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0 gap-2 flex-wrap">
                    <div className="text-xs text-gray-400 min-w-0 flex-1">
                      <span>
                        Pág. {orcafascioResultados.current_page}
                        {agg && aggLimit != null ? (
                          <>
                            {' · '}
                            <span className="opacity-90">
                              até página {aggLimit.toLocaleString('pt-BR')} (por base)
                            </span>
                          </>
                        ) : null}
                        {' · '}
                        {listagemPorTexto ? (
                          <>
                            <strong className="text-gray-600 dark:text-gray-300">{matchLocal}</strong>
                            {' '}
                            com «{qRaw}» nesta página ({rawLen} carregados)
                            {' · '}
                            <span className="opacity-90">
                              total no catálogo (API): {orcafascioResultados.total.toLocaleString('pt-BR')}
                            </span>
                          </>
                        ) : (
                          <>
                            {orcafascioResultados.total.toLocaleString('pt-BR')} composições
                            {orcafascioResultados._orcafascio_mix_fallback
                              ? ' (catálogo agregado — várias tabelas)'
                              : ' no catálogo ORSE'}
                            {orcafascioResultados._orcafascio_segment ? (
                              <span className="opacity-80">
                                {' · '}
                                segmento API:{' '}
                                <code className="text-[10px] font-mono">
                                  {orcafascioResultados._orcafascio_segment.length > 36
                                    ? `${orcafascioResultados._orcafascio_segment.slice(0, 18)}…`
                                    : orcafascioResultados._orcafascio_segment}
                                </code>
                              </span>
                            ) : null}
                          </>
                        )}
                      </span>
                      {agg && orcafascioResultados._bases && orcafascioResultados._bases.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {orcafascioResultados._bases.map(b => (
                            <span
                              key={b.segment}
                              title={b.segment}
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-mono bg-gray-100 dark:bg-gray-800/90 text-gray-500 dark:text-gray-400 max-w-[min(100%,240px)] truncate"
                            >
                              {rotuloSegmentoOrcafascioApi(b.segment)}: {b.total.toLocaleString('pt-BR')}
                            </span>
                          ))}
                        </div>
                      )}
                      <span className="block text-[10px] text-gray-400/80 mt-0.5">
                        {listagemPorTexto
                          ? 'O número grande é o catálogo completo ORSE: a API costuma não filtrar o texto no servidor — refinamos só entre os itens desta página.'
                          : agg
                            ? 'Modo «todas as bases»: só entram bases que o token consegue ler no GET /compositions; cada página usa o mesmo número de página em todas elas.'
                            : orcafascioResultados._orcafascio_mix_fallback
                              ? 'Coluna «Banco» é inferida pelo texto — em catálogo misto aparecem várias origens. Configure ORCAFASCIO_ORSE_SEGMENT para listar só ORSE.'
                              : 'Listagem no segmento ORSE dedicado (Sergipe).'}
                      </span>
                    </div>
                    {showPagination && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          disabled={orcafascioPage <= 1 || orcafascioLoading}
                          onClick={() => buscarComposicoesOrcafascio(orcafascioPage - 1)}
                          className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          disabled={disableNext}
                          onClick={() => buscarComposicoesOrcafascio(orcafascioPage + 1)}
                          className="rounded-md p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })()}
              </div>

              {/* Painel de detalhe da composição (itens em cartões ou visão analítica em tabela) */}
              {orcafascioDetalhe && (
                <div className="w-[min(100%,32rem)] max-w-[100vw] shrink-0 flex flex-col min-h-0 overflow-hidden border-l border-gray-100 dark:border-gray-800">
                  {orcafascioDetalheLoading ? (
                    <div className="flex items-center justify-center py-12 text-gray-400">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      <span className="text-sm">Carregando detalhes…</span>
                    </div>
                  ) : (
                    <>
                      {/* Cabeçalho do detalhe */}
                      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 shrink-0">
                        <span className="inline-flex items-center rounded bg-violet-100 dark:bg-violet-900/60 px-2 py-0.5 text-xs font-mono font-semibold text-violet-700 dark:text-violet-300 mb-1">
                          {orcafascioDetalhe.code}
                        </span>
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-snug mt-1">
                          {orcafascioDetalhe.description}
                        </p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                          <span><span className="font-medium">Un.:</span> {orcafascioDetalhe.unit}</span>
                          <span><span className="font-medium">Tipo:</span> {orcafascioDetalhe.type}</span>
                          {orcafascioDetalhe.is_sicro && <span className="text-blue-500 font-medium">SICRO</span>}
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-100 dark:border-green-900/40 px-3 py-2 text-center">
                            <p className="text-[10px] text-green-600 dark:text-green-400 font-medium uppercase tracking-wide">Valor Onerado</p>
                            <p className="text-sm font-semibold text-green-800 dark:text-green-200 mt-0.5">
                              {orcafascioDetalhe.prices?.pd != null
                                ? orcafascioDetalhe.prices.pd.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                : '—'}
                            </p>
                          </div>
                          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40 px-3 py-2 text-center">
                            <p className="text-[10px] text-blue-600 dark:text-blue-400 font-medium uppercase tracking-wide">Val. Desonerado</p>
                            <p className="text-sm font-semibold text-blue-800 dark:text-blue-200 mt-0.5">
                              {orcafascioDetalhe.prices?.pnd != null
                                ? orcafascioDetalhe.prices.pnd.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                : '—'}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Sub-abas: conteúdo da composição */}
                      <div className="flex border-b border-gray-100 dark:border-gray-800 shrink-0 px-2">
                        <button
                          type="button"
                          onClick={() => setOrcafascioComposicaoDetalheTab('itens')}
                          className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                            orcafascioComposicaoDetalheTab === 'itens'
                              ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                          }`}
                        >
                          Itens
                        </button>
                        <button
                          type="button"
                          onClick={() => setOrcafascioComposicaoDetalheTab('analitico')}
                          className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px ${
                            orcafascioComposicaoDetalheTab === 'analitico'
                              ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                          }`}
                          title="Mesmos insumos e serviços da composição em formato de tabela (visão analítica)"
                        >
                          Analítico
                        </button>
                      </div>

                      <div className="flex-1 min-h-0 overflow-y-auto">
                        {orcafascioComposicaoDetalheTab === 'itens' && (
                          <div className="px-4 py-3">
                            <p className="text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                              Itens ({orcafascioDetalhe.items.length})
                            </p>
                            {orcafascioDetalhe.items.length === 0 ? (
                              <p className="text-xs text-gray-400">Sem itens cadastrados.</p>
                            ) : (
                              <div className="space-y-1.5">
                                {orcafascioDetalhe.items.map((item, idx) => (
                                  <div
                                    key={idx}
                                    className={`rounded-lg px-3 py-2 text-xs ${
                                      item.is_resource
                                        ? 'bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40'
                                        : 'bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <span className={`text-[10px] font-semibold uppercase mr-1.5 ${item.is_resource ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}`}>
                                          {item.is_resource ? 'INSUMO' : 'SERVIÇO'}
                                        </span>
                                        <span className="font-mono text-[10px] text-gray-500">[{item.banco}·{item.code}]</span>
                                        <p className="text-gray-700 dark:text-gray-300 mt-0.5 leading-snug">{item.description}</p>
                                      </div>
                                      <div className="shrink-0 text-right text-[10px] text-gray-500 dark:text-gray-400">
                                        <p>{item.unit}</p>
                                        <p>×{item.coefficient}</p>
                                        <p className="font-semibold text-gray-700 dark:text-gray-300">
                                          {item.pnd?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {orcafascioComposicaoDetalheTab === 'analitico' && (
                          <div className="px-2 py-2">
                            <p className="text-[10px] text-gray-500 dark:text-gray-400 px-2 pb-2 leading-snug">
                              Analítico da composição: insumos e serviços com preço unitário (origem catálogo Orçafascio).
                            </p>
                            {orcafascioDetalhe.items.length === 0 ? (
                              <p className="text-xs text-gray-400 px-2">Sem linhas analíticas.</p>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-[11px] border-collapse min-w-[280px]">
                                  <thead>
                                    <tr className="bg-gray-50 dark:bg-gray-800/70 sticky top-0 z-10">
                                      <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[9px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Tipo</th>
                                      <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[9px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Base</th>
                                      <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[9px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Cód.</th>
                                      <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[9px] border-b border-gray-200 dark:border-gray-700">Descrição</th>
                                      <th className="text-left px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[9px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Un.</th>
                                      <th className="text-right px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[9px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Coef.</th>
                                      <th className="text-right px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[9px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Deson.</th>
                                      <th className="text-right px-2 py-1.5 font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide text-[9px] border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">Oner.</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {orcafascioDetalhe.items.map((item, idx) => (
                                      <tr
                                        key={idx}
                                        className={`border-b border-gray-50 dark:border-gray-800/60 ${
                                          item.is_resource
                                            ? 'bg-amber-50/50 dark:bg-amber-950/10'
                                            : 'bg-blue-50/40 dark:bg-blue-950/10'
                                        }`}
                                      >
                                        <td className="px-2 py-1.5 whitespace-nowrap text-[9px] font-semibold uppercase text-gray-600 dark:text-gray-300">
                                          {item.is_resource ? 'Ins.' : 'Serv.'}
                                        </td>
                                        <td className="px-2 py-1.5 whitespace-nowrap">
                                          <span className="inline-flex rounded bg-violet-100 dark:bg-violet-900/50 px-1 py-0.5 text-[9px] font-semibold text-violet-700 dark:text-violet-300">
                                            {item.banco}
                                          </span>
                                        </td>
                                        <td className="px-2 py-1.5 font-mono text-[10px] text-gray-800 dark:text-gray-200 whitespace-nowrap">
                                          {item.code}
                                        </td>
                                        <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 max-w-[140px]">
                                          <span className="line-clamp-2 leading-snug">{item.description}</span>
                                        </td>
                                        <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">{item.unit}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-600 dark:text-gray-300">{item.coefficient}</td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200 font-medium">
                                          {item.pnd != null
                                            ? item.pnd.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                            : '—'}
                                        </td>
                                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-700 dark:text-gray-200 font-medium">
                                          {item.pd != null
                                            ? item.pd.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                                            : '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Botão importar */}
                      <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 shrink-0">
                        <button
                          type="button"
                          onClick={() => importarComposicaoOrcafascio(orcafascioDetalhe)}
                          className="w-full flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-700 transition-colors shadow-sm"
                        >
                          <DownloadCloud className="w-4 h-4" />
                          Importar esta composição
                        </button>
                        <p className="text-[10px] text-center text-gray-400 mt-2">
                          Será adicionada ao catálogo de composições do sistema
                        </p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            </>}
          </div>
        </div>
      )}

      {importOrcamentoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div
            className="absolute inset-0"
            onClick={() => {
              if (!isImportandoOrcamento) {
                setImportOrcamentoModalOpen(false);
                setImportOrcamentoModalFile(null);
              }
            }}
            aria-hidden
          />
          <div className="relative mx-4 max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Importar planilha</h3>
              <button
                type="button"
                onClick={() => {
                  if (!isImportandoOrcamento) {
                    setImportOrcamentoModalOpen(false);
                    setImportOrcamentoModalFile(null);
                  }
                }}
                disabled={isImportandoOrcamento}
                className="rounded p-2 text-gray-600 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-6 p-6">
              <div className="flex items-center justify-between gap-4 border-b border-gray-200 pb-4 dark:border-gray-700">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Importação de planilha de orçamento vinculada ao contrato selecionado.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => baixarModeloOrcamentoPerfeitoXlsx()}
                  className="flex shrink-0 items-center space-x-2 rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
                >
                  <Download className="h-4 w-4" />
                  <span>Baixar Modelo</span>
                </button>
              </div>

              <div>
                <input
                  id="import-orcamento-modal-file"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
                      toast.error('Apenas arquivos .xlsx, .xls ou .csv');
                      return;
                    }
                    setImportOrcamentoModalFile(f);
                  }}
                />

                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setImportOrcamentoModalDragging(true);
                  }}
                  onDragLeave={e => {
                    e.preventDefault();
                    setImportOrcamentoModalDragging(false);
                  }}
                  onDrop={e => {
                    e.preventDefault();
                    setImportOrcamentoModalDragging(false);
                    const f = e.dataTransfer.files[0];
                    if (f && /\.(xlsx|xls|csv)$/i.test(f.name)) setImportOrcamentoModalFile(f);
                    else toast.error('Apenas arquivos .xlsx, .xls ou .csv');
                  }}
                  className={`
                relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200
                ${
                  importOrcamentoModalDragging
                    ? 'border-red-500 bg-red-50 dark:border-red-500 dark:bg-red-950/30'
                    : 'border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500'
                }
                ${importOrcamentoModalFile ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}
              `}
                >
                  {importOrcamentoModalFile ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-center">
                        <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/30">
                          <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          {importOrcamentoModalFile.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {(importOrcamentoModalFile.size / 1024).toFixed(2)} KB
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setImportOrcamentoModalFile(null)}
                        className="text-xs text-red-600 underline hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Remover arquivo
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-center">
                        <div
                          className={`rounded-full p-4 transition-colors ${
                            importOrcamentoModalDragging
                              ? 'bg-red-100 dark:bg-red-900/40'
                              : 'bg-gray-100 dark:bg-gray-700'
                          }`}
                        >
                          <Upload
                            className={`h-10 w-10 ${
                              importOrcamentoModalDragging
                                ? 'text-red-600 dark:text-red-400'
                                : 'text-gray-400 dark:text-gray-500'
                            }`}
                          />
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {importOrcamentoModalDragging
                            ? 'Solte o arquivo aqui'
                            : 'Arraste e solte o arquivo Excel aqui'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">ou</p>
                      </div>
                      <label
                        htmlFor="import-orcamento-modal-file"
                        className="inline-flex cursor-pointer items-center rounded-lg bg-red-600 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all duration-200 hover:bg-red-700 hover:shadow-md dark:bg-red-700 dark:hover:bg-red-800"
                      >
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Escolher arquivo
                      </label>
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Formatos aceitos: .xlsx, .xls ou .csv
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex space-x-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    if (!isImportandoOrcamento) {
                      setImportOrcamentoModalOpen(false);
                      setImportOrcamentoModalFile(null);
                    }
                  }}
                  disabled={isImportandoOrcamento}
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void confirmarImportOrcamentoModal()}
                  disabled={isImportandoOrcamento || !importOrcamentoModalFile}
                  className="flex flex-1 items-center justify-center space-x-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-green-700 dark:hover:bg-green-800"
                >
                  {isImportandoOrcamento ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Importando...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      <span>Importar planilha</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={orcafascioAddCompModalOpen}
        onClose={() => {
          if (orcafascioAddCompAddingKey) return;
          setOrcafascioAddCompModalOpen(false);
          setOrcafascioAddCompSelecionadas(new Set());
        }}
        title={`Adicionar composição (${orcafascioAddCompDestinoLabel})`}
        size="xl"
        closeOnOverlayClick={!orcafascioAddCompAddingKey}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2">
              <input
                type="text"
                value={orcafascioAddCompSearch}
                onChange={(e) => setOrcafascioAddCompSearch(e.target.value)}
                placeholder="Filtrar por código ou descrição..."
                className="w-full bg-transparent text-sm outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
            </div>
            <button
              type="button"
              onClick={() => void carregarComposicoesOrcamentoFixoOrcafascio()}
              disabled={orcafascioAddCompLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {orcafascioAddCompLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Atualizar
            </button>
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {orcafascioAddCompComposicoes.length.toLocaleString('pt-BR')} composições carregadas ·{' '}
            {(orcafascioAddCompAnalitico?.length ?? 0).toLocaleString('pt-BR')} analíticos disponíveis ·{' '}
            {orcafascioAddCompSelecionadas.size.toLocaleString('pt-BR')} selecionada(s)
          </div>
          {!orcafascioAddCompLoading && orcafascioAddCompFiltradas.length > 0 && (
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setOrcafascioAddCompSelecionadas(new Set(orcafascioAddCompFiltradas.map((r, i) => chaveLinhaAdicionarComp(r as Record<string, unknown>, i))))}
                disabled={!!orcafascioAddCompAddingKey}
                className="text-xs rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
              >
                Selecionar todos (filtro)
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOrcafascioAddCompSelecionadas(new Set())}
                  disabled={!!orcafascioAddCompAddingKey}
                  className="text-xs rounded-md border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  Limpar seleção
                </button>
                <button
                  type="button"
                  onClick={() => void adicionarComposicoesOrcafascioSelecionadas()}
                  disabled={!!orcafascioAddCompAddingKey || orcafascioAddCompSelecionadas.size === 0}
                  className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {orcafascioAddCompAddingKey === 'batch' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListPlus className="h-3.5 w-3.5" />}
                  Adicionar selecionadas
                </button>
              </div>
            </div>
          )}
          <div className="max-h-[55vh] overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
            {orcafascioAddCompLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando composições...
              </div>
            ) : orcafascioAddCompFiltradas.length === 0 ? (
              <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhuma composição encontrada para o filtro informado.
              </div>
            ) : (
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800/80">
                    <th className="w-10 px-2 py-2 text-center font-semibold text-gray-600 dark:text-gray-300 uppercase">Sel.</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 uppercase">Código</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 uppercase">Descrição</th>
                    <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 uppercase">Base</th>
                    <th className="px-3 py-2 text-right font-semibold text-gray-600 dark:text-gray-300 uppercase">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {orcafascioAddCompFiltradas.map((row, idx) => {
                    const r = row as Record<string, unknown>;
                    const code = codigoCatalogoLinhaOrcamentoOrcafascio(r) ?? '—';
                    const desc = textoDescricaoOrcafascio(r) || '—';
                    const base = String(r.base ?? '—');
                    const key = chaveLinhaAdicionarComp(r, idx);
                    const adding = orcafascioAddCompAddingKey === key;
                    const selected = orcafascioAddCompSelecionadas.has(key);
                    return (
                      <tr key={key} className="border-t border-gray-100 dark:border-gray-800">
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleSelecaoAdicionarComp(key)}
                            disabled={!!orcafascioAddCompAddingKey}
                            className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-[11px] text-gray-800 dark:text-gray-200">{code}</td>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{desc}</td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400">{base}</td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => void adicionarComposicaoOrcafascioNoBloco(r, idx)}
                            disabled={!!orcafascioAddCompAddingKey}
                            className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                          >
                            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                            Adicionar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={novoBlocoModalOpen}
        onClose={() => setNovoBlocoModalOpen(false)}
        title={novoBlocoModalMode === 'titulo' ? 'Adicionar serviço' : 'Adicionar novo subtítulo'}
        size="md"
        closeOnOverlayClick
      >
        <div className="space-y-4">
          {novoBlocoModalMode === 'titulo' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nome do serviço
              </label>
              <input
                value={novoBlocoTituloNome}
                onChange={(e) => setNovoBlocoTituloNome(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-500/35 dark:focus:border-red-500 dark:focus:ring-red-500/30"
                placeholder="Ex.: CANTEIRO DE OBRAS"
                autoFocus
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Subtítulo do serviço
            </label>
            <input
              value={novoBlocoSubtituloNome}
              onChange={(e) => setNovoBlocoSubtituloNome(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 outline-none focus:border-red-600 focus:ring-2 focus:ring-red-500/35 dark:focus:border-red-500 dark:focus:ring-red-500/30"
              placeholder="Ex.: SERVIÇOS PRELIMINARES"
              autoFocus={novoBlocoModalMode === 'subtitulo'}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setNovoBlocoModalOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmarNovoBlocoModal}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium"
            >
              Adicionar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={editarDadosOpen}
        onClose={() => setEditarDadosOpen(false)}
        title="Editar dados do orçamento"
        size="lg"
        closeOnOverlayClick
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nome do orçamento *</label>
              <input
                value={editarDadosDraft.nomeOrcamento}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, nomeOrcamento: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                placeholder="Ex: Orçamento 1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">OS/Nº da pasta</label>
              <input
                value={editarDadosDraft.osNumeroPasta}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, osNumeroPasta: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prazo de execução (dias)</label>
              <input
                value={editarDadosDraft.prazoExecucaoDias}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, prazoExecucaoDias: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                inputMode="numeric"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de abertura</label>
              <input
                type="date"
                value={editarDadosDraft.dataAbertura}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, dataAbertura: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data de envio</label>
              <input
                type="date"
                value={editarDadosDraft.dataEnvio}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, dataEnvio: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Responsável pelo orçamento</label>
              <input
                value={editarDadosDraft.responsavelOrcamento}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, responsavelOrcamento: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Orçamento realizado por</label>
              <input
                value={editarDadosDraft.orcamentoRealizadoPor}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, orcamentoRealizadoPor: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Desconto (%)</label>
              <input
                value={editarDadosDraft.descontoPercentual}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, descontoPercentual: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                placeholder="Ex: 25,01"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">BDI (%)</label>
              <input
                value={editarDadosDraft.bdiPercentual}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, bdiPercentual: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                placeholder="Ex: 28,35"
              />
            </div>
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reajustes (%)</label>
                <button
                  type="button"
                  onClick={() =>
                    setEditarDadosDraft((p) => ({
                      ...p,
                      reajustes: [...(p.reajustes ?? []), { nome: `${(p.reajustes?.length ?? 0) + 1}º reajuste`, percentual: '' }]
                    }))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-600 px-2 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  + Adicionar reajuste
                </button>
              </div>
              <div className="space-y-2">
                {(editarDadosDraft.reajustes ?? []).map((r, idx) => (
                  <div key={`edit-reajuste-${idx}`} className="grid grid-cols-1 sm:grid-cols-[1fr_11rem_auto] gap-2">
                    <input
                      value={r.nome}
                      onChange={(e) =>
                        setEditarDadosDraft((p) => ({
                          ...p,
                          reajustes: (p.reajustes ?? []).map((rr, i) => (i === idx ? { ...rr, nome: e.target.value } : rr))
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                      placeholder={`Reajuste ${idx + 1}`}
                    />
                    <input
                      value={r.percentual}
                      onChange={(e) =>
                        setEditarDadosDraft((p) => ({
                          ...p,
                          reajustes: (p.reajustes ?? []).map((rr, i) => (i === idx ? { ...rr, percentual: e.target.value } : rr))
                        }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
                      placeholder="%"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditarDadosDraft((p) => ({
                          ...p,
                          reajustes: (p.reajustes ?? []).filter((_, i) => i !== idx)
                        }))
                      }
                      className="px-3 py-2 rounded-lg border border-red-300 dark:border-red-700 text-red-600 dark:text-red-300 hover:bg-red-50/60 dark:hover:bg-red-950/30 text-xs font-medium"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Descrição</label>
              <input
                value={editarDadosDraft.descricao}
                onChange={(e) => setEditarDadosDraft((p) => ({ ...p, descricao: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditarDadosOpen(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={salvarEdicaoDados}
              className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 text-sm font-medium"
            >
              Salvar dados
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={novoOrcamentoMetaOpen}
        onClose={() => {
          if (!isCreatingOrcamento) {
            setNovoOrcamentoMetaOpen(false);
            setNovoOrcamentoStep(1);
          }
        }}
        title="Criar novo orçamento"
        size="xl"
        closeOnOverlayClick={!isCreatingOrcamento}
      >
        <div className="space-y-4">
          <div className="px-1 py-1">
            <div className="flex items-center justify-between">
              {[
                { id: 1 as const, label: 'Dados básicos', icon: FileText },
                { id: 2 as const, label: 'Financeiro', icon: Calculator },
                { id: 3 as const, label: 'Descrição', icon: ClipboardList }
              ].map((s, index, arr) => {
                const isActive = novoOrcamentoStep === s.id;
                const isCompleted = novoOrcamentoStep > s.id;
                const Icon = s.icon;
                return (
                  <React.Fragment key={s.id}>
                    <div className="flex items-center">
                      <div className="flex flex-col items-center transition-all duration-200">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                            isActive
                              ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500 text-white shadow-sm'
                              : isCompleted
                              ? 'bg-green-500 dark:bg-green-600 border-green-500 dark:border-green-600 text-white'
                              : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {isCompleted ? <CheckCircle className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                        </div>
                        <span
                          className={`mt-1.5 text-xs font-medium transition-colors duration-200 ${
                            isActive
                              ? 'text-red-600 dark:text-red-400'
                              : isCompleted
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}
                        >
                          {s.label}
                        </span>
                      </div>
                    </div>
                    {index < arr.length - 1 && (
                      <div
                        className={`flex-1 h-px mx-3 transition-all duration-200 ${
                          isCompleted
                            ? 'bg-green-500/90 dark:bg-green-400/90'
                            : 'bg-gray-200 dark:bg-gray-700'
                        }`}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {novoOrcamentoStep === 1 && (
            <div className="space-y-6">
              <div className="border-l-4 border-red-500 dark:border-red-400 pl-4">
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Dados básicos</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Informações iniciais do orçamento</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nome do orçamento *
                </label>
                <input
                  value={novoOrcamentoMetaDraft.nomeOrcamento}
                  onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, nomeOrcamento: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Ex: Orçamento reforma bloco A"
                  disabled={isCreatingOrcamento}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">OS/Nº da pasta *</label>
                <input
                  value={novoOrcamentoMetaDraft.osNumeroPasta}
                  onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, osNumeroPasta: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Ex: XX/2025 - Nº241"
                  disabled={isCreatingOrcamento}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Prazo de execução (dias)</label>
                <input
                  value={novoOrcamentoMetaDraft.prazoExecucaoDias}
                  onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, prazoExecucaoDias: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Ex: 150"
                  inputMode="numeric"
                  disabled={isCreatingOrcamento}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Data de abertura *</label>
                <input
                  type="date"
                  value={novoOrcamentoMetaDraft.dataAbertura}
                  onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, dataAbertura: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  disabled={isCreatingOrcamento}
                />
              </div>
            </div>
            </div>
          )}

          {novoOrcamentoStep === 2 && (
            <div className="space-y-6">
              <div className="border-l-4 border-red-500 dark:border-red-400 pl-4">
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Financeiro</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Responsável, percentuais e reajustes</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Responsável pelo orçamento</label>
                  <select
                    value={novoOrcamentoMetaDraft.responsavelOrcamento}
                    onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, responsavelOrcamento: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    disabled={loadingEmployeeOptions || isCreatingOrcamento}
                  >
                    <option value="">
                      {loadingEmployeeOptions ? 'Carregando funcionários...' : 'Selecione o responsável'}
                    </option>
                    {employeeOptions.map((employee) => (
                      <option key={employee.id} value={employee.name}>
                        {employee.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Desconto (%)</label>
                  <input
                    value={novoOrcamentoMetaDraft.descontoPercentual}
                    onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, descontoPercentual: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Ex: 25,01"
                    disabled={isCreatingOrcamento}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">BDI (%)</label>
                  <input
                    value={novoOrcamentoMetaDraft.bdiPercentual}
                    onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, bdiPercentual: e.target.value }))}
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Ex: 28,35"
                    disabled={isCreatingOrcamento}
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200/80 bg-white/90 px-4 py-4 dark:border-gray-700 dark:bg-gray-800/60">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Reajustes (%)</label>
                  <button
                    type="button"
                    onClick={() =>
                      setNovoOrcamentoMetaDraft((p) => ({
                        ...p,
                        reajustes: [...(p.reajustes ?? []), { nome: `${(p.reajustes?.length ?? 0) + 1}º reajuste`, percentual: '' }]
                      }))
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60"
                    disabled={isCreatingOrcamento}
                  >
                    + Adicionar reajuste
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {(novoOrcamentoMetaDraft.reajustes ?? []).map((r, idx) => (
                    <div key={`new-reajuste-${idx}`} className="grid grid-cols-1 sm:grid-cols-[1fr_11rem_auto] gap-2">
                      <input
                        value={r.nome}
                        onChange={(e) =>
                          setNovoOrcamentoMetaDraft((p) => ({
                            ...p,
                            reajustes: (p.reajustes ?? []).map((rr, i) => (i === idx ? { ...rr, nome: e.target.value } : rr))
                          }))
                        }
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        placeholder={`Reajuste ${idx + 1}`}
                        disabled={isCreatingOrcamento}
                      />
                      <input
                        value={r.percentual}
                        onChange={(e) =>
                          setNovoOrcamentoMetaDraft((p) => ({
                            ...p,
                            reajustes: (p.reajustes ?? []).map((rr, i) => (i === idx ? { ...rr, percentual: e.target.value } : rr))
                          }))
                        }
                        className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                        placeholder="%"
                        disabled={isCreatingOrcamento}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setNovoOrcamentoMetaDraft((p) => ({
                            ...p,
                            reajustes: (p.reajustes ?? []).filter((_, i) => i !== idx)
                          }))
                        }
                        className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/30"
                        disabled={isCreatingOrcamento}
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {novoOrcamentoStep === 3 && (
            <div className="space-y-6">
              <div className="border-l-4 border-red-500 dark:border-red-400 pl-4">
                <h4 className="text-xl font-bold text-gray-900 dark:text-gray-100">Descrição</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Detalhes complementares do orçamento</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Descrição *</label>
                <input
                  value={novoOrcamentoMetaDraft.descricao}
                  onChange={(e) => setNovoOrcamentoMetaDraft((p) => ({ ...p, descricao: e.target.value }))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm transition placeholder:text-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  placeholder="Ex: Manutenção geral da unidade"
                  disabled={isCreatingOrcamento}
                />
              </div>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-700 dark:text-gray-200">
                <p><strong>Nome:</strong> {novoOrcamentoMetaDraft.nomeOrcamento.trim() || '—'}</p>
                <p><strong>OS/Nº da pasta:</strong> {novoOrcamentoMetaDraft.osNumeroPasta || '—'}</p>
                <p><strong>Data de abertura:</strong> {novoOrcamentoMetaDraft.dataAbertura || '—'}</p>
                <p><strong>Responsável:</strong> {novoOrcamentoMetaDraft.responsavelOrcamento || '—'}</p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setNovoOrcamentoMetaOpen(false);
                setNovoOrcamentoStep(1);
              }}
              disabled={isCreatingOrcamento}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60"
            >
              Cancelar
            </button>
            {novoOrcamentoStep > 1 && (
              <button
                type="button"
                onClick={() => setNovoOrcamentoStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
                disabled={isCreatingOrcamento}
                className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60"
              >
                Anterior
              </button>
            )}
            {novoOrcamentoStep < 3 ? (
              <button
                type="button"
                onClick={() => setNovoOrcamentoStep((s) => (s < 3 ? ((s + 1) as 1 | 2 | 3) : s))}
                disabled={isCreatingOrcamento || !podeAvancarNovoOrcamento(novoOrcamentoStep)}
                className="rounded-xl bg-green-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                Próximo
              </button>
            ) : (
              <button
                type="button"
                onClick={confirmarCriacaoNovoOrcamento}
                disabled={isCreatingOrcamento}
                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                <span className="inline-flex items-center gap-2">
                  {isCreatingOrcamento ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span>{isCreatingOrcamento ? 'Criando...' : 'Criar orçamento'}</span>
                </span>
              </button>
            )}
          </div>
        </div>
      </Modal>
    </ProtectedRoute>
  );
}
