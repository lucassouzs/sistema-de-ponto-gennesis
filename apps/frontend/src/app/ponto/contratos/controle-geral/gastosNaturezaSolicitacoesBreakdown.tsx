'use client';

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import type { GastosNaturezaAggRow } from './buildQueryGastosRows';
import { gastosNaturezaTotalContribution } from './gastosOperacionaisAllowedNaturezas';

export type GastosNaturezaSolicitacaoLancamentoRow = {
  linhaId: string;
  valor: number;
  dataISO: string | null;
  detalhes: Record<string, string>;
};

export type GastosNaturezaSolicitacaoRow = {
  linhaId: string;
  natureza: string;
  valor: number;
  dataISO: string | null;
  dataISOFim?: string | null;
  titulo: string;
  detalhes: Record<string, string>;
  quantidadeLancamentos?: number;
  lancamentosAgrupados?: GastosNaturezaSolicitacaoLancamentoRow[];
};

const SOLICITACAO_TITULO_FIELD_HINTS = [
  'historico',
  'histórico',
  'complemento',
  'observacao',
  'observação',
  'descricao',
  'descrição',
  'fornecedor',
  'numerodocumento',
  'numero documento',
  'documento'
] as const;

function normalizeSolicitacaoFieldKey(key: string): string {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function resolveGastosNaturezaSolicitacaoTitulo(solicitacao: GastosNaturezaSolicitacaoRow): string {
  const titulo = solicitacao.titulo.trim();
  if (titulo && titulo !== 'Solicitação' && !/^solicita[cç][aã]o$/i.test(titulo)) {
    return titulo;
  }

  for (const [key, value] of Object.entries(solicitacao.detalhes)) {
    const normalizedKey = normalizeSolicitacaoFieldKey(key);
    if (!SOLICITACAO_TITULO_FIELD_HINTS.some((hint) => normalizedKey.includes(hint))) continue;
    const text = value.trim();
    if (!text) continue;
    return text.length > 120 ? `${text.slice(0, 117)}...` : text;
  }

  const firstDetail = Object.values(solicitacao.detalhes).map((value) => value.trim()).find(Boolean);
  if (firstDetail) return firstDetail.length > 120 ? `${firstDetail.slice(0, 117)}...` : firstDetail;

  return titulo || 'Solicitação';
}

function parseGastosPeriodYmd(ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

function paymentDateIntersectsGastosPeriod(
  dataISO: string | null,
  periodFrom: string,
  periodTo: string
): boolean {
  if (!periodFrom && !periodTo) return true;
  if (!dataISO) return false;
  const paymentDate = parseGastosPeriodYmd(dataISO);
  if (!paymentDate) return false;
  const from = periodFrom ? parseGastosPeriodYmd(periodFrom) : null;
  const to = periodTo ? parseGastosPeriodYmd(periodTo) : null;
  if ((periodFrom && !from) || (periodTo && !to)) return true;
  const rangeStart = from ?? paymentDate;
  const rangeEnd = to ?? paymentDate;
  if (rangeStart > rangeEnd) return false;
  return paymentDate >= rangeStart && paymentDate <= rangeEnd;
}

function filterGastosNaturezaSolicitacoesByPeriod(
  rows: GastosNaturezaSolicitacaoRow[],
  periodFrom: string,
  periodTo: string
): GastosNaturezaSolicitacaoRow[] {
  return rows
    .map((row) => {
      if (!row.lancamentosAgrupados?.length) {
        return paymentDateIntersectsGastosPeriod(row.dataISO, periodFrom, periodTo) ? row : null;
      }

      const lancamentos = row.lancamentosAgrupados.filter((item) =>
        paymentDateIntersectsGastosPeriod(item.dataISO, periodFrom, periodTo)
      );
      if (lancamentos.length === 0) return null;
      if (lancamentos.length === 1) {
        const [lancamento] = lancamentos;
        return {
          ...row,
          linhaId: lancamento.linhaId,
          valor: lancamento.valor,
          dataISO: lancamento.dataISO,
          dataISOFim: undefined,
          quantidadeLancamentos: undefined,
          lancamentosAgrupados: undefined,
          detalhes: lancamento.detalhes
        };
      }

      const valor = lancamentos.reduce((sum, item) => sum + item.valor, 0);
      const dates = lancamentos
        .map((item) => item.dataISO)
        .filter((date): date is string => Boolean(date))
        .sort();

      return {
        ...row,
        valor,
        dataISO: dates.length ? dates[dates.length - 1] : null,
        dataISOFim: dates.length > 1 ? dates[0] : null,
        quantidadeLancamentos: lancamentos.length,
        lancamentosAgrupados: lancamentos,
        detalhes: {
          ...lancamentos[0].detalhes,
          'Lançamentos agrupados': String(lancamentos.length)
        }
      };
    })
    .filter((row): row is GastosNaturezaSolicitacaoRow => row != null);
}

function normalizeSolicitacaoGroupKey(titulo: string): string {
  return titulo.trim().toUpperCase().replace(/\s+/g, ' ');
}

export function aggregateGastosNaturezaSolicitacoesByTitulo(
  rows: GastosNaturezaSolicitacaoRow[]
): GastosNaturezaSolicitacaoRow[] {
  const groups = new Map<string, GastosNaturezaSolicitacaoRow[]>();

  for (const row of rows) {
    const titulo = resolveGastosNaturezaSolicitacaoTitulo(row);
    const key = `${row.natureza}::${normalizeSolicitacaoGroupKey(titulo)}`;
    const bucket = groups.get(key) ?? [];
    bucket.push({ ...row, titulo });
    groups.set(key, bucket);
  }

  const aggregated: GastosNaturezaSolicitacaoRow[] = [];

  for (const items of Array.from(groups.values())) {
    if (items.length === 1) {
      aggregated.push(items[0]);
      continue;
    }

    const titulo = items[0].titulo;
    const natureza = items[0].natureza;
    const valor = items.reduce((sum, item) => sum + item.valor, 0);
    const dates = items
      .map((item) => item.dataISO)
      .filter((date): date is string => Boolean(date))
      .sort();
    const dataISO = dates.length ? dates[dates.length - 1] : null;
    const dataISOFim = dates.length > 1 ? dates[0] : null;
    const lancamentosAgrupados = [...items]
      .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor))
      .map((item) => ({
        linhaId: item.linhaId,
        valor: item.valor,
        dataISO: item.dataISO,
        detalhes: item.detalhes
      }));

    aggregated.push({
      linhaId: `agg:${normalizeSolicitacaoGroupKey(`${natureza}::${titulo}`)}`,
      natureza,
      valor,
      dataISO,
      dataISOFim,
      titulo,
      quantidadeLancamentos: items.length,
      lancamentosAgrupados,
      detalhes: {
        ...items[0].detalhes,
        'Lançamentos agrupados': String(items.length)
      }
    });
  }

  return aggregated;
}

export function formatGastosNaturezaSolicitacaoDataLabel(
  solicitacao: Pick<GastosNaturezaSolicitacaoRow, 'dataISO' | 'dataISOFim' | 'quantidadeLancamentos'>,
  formatDate: (iso: string) => string
): string {
  const count = solicitacao.quantidadeLancamentos ?? 0;
  if (count > 1) {
    const inicio = solicitacao.dataISOFim ? formatDate(solicitacao.dataISOFim) : null;
    const fim = solicitacao.dataISO ? formatDate(solicitacao.dataISO) : null;
    if (inicio && fim && inicio !== fim) {
      return `${count} lançamentos · ${inicio} a ${fim}`;
    }
    return `${count} lançamentos`;
  }
  return solicitacao.dataISO ? formatDate(solicitacao.dataISO) : '—';
}

type GastosNaturezaSolicitacoesBreakdownProps = {
  row: GastosNaturezaAggRow;
  contract: string;
  periodFrom: string;
  periodTo: string;
  paddingLeft: number;
  valueClassName: string;
  formatCurrency: (value: number) => string;
  formatDate: (iso: string) => string;
  onOpenSolicitacao: (solicitacao: GastosNaturezaSolicitacaoRow) => void;
};

export function GastosNaturezaSolicitacoesBreakdown({
  row,
  contract,
  periodFrom,
  periodTo,
  paddingLeft,
  valueClassName,
  formatCurrency,
  formatDate,
  onOpenSolicitacao
}: GastosNaturezaSolicitacoesBreakdownProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'gastos-operacionais-natureza-solicitacoes',
      contract,
      row.natureza,
      periodFrom,
      periodTo
    ],
    queryFn: async () => {
      const res = await api.get<{
        success: boolean;
        message?: string;
        data?: { solicitacoes?: GastosNaturezaSolicitacaoRow[] };
      }>('/contracts/gastos-operacionais/natureza-solicitacoes', {
        params: {
          contract,
          natureza: row.natureza,
          periodFrom,
          periodTo
        },
        timeout: 120_000
      });

      if (res.data?.success === false) {
        throw new Error(res.data.message ?? 'Não foi possível carregar as solicitações.');
      }

      return res.data?.data?.solicitacoes ?? [];
    },
    staleTime: 60_000
  });

  if (isLoading) {
    return (
      <tr className="bg-gray-50/60 dark:bg-gray-800/20">
        <td colSpan={2} className="px-4 py-3" style={{ paddingLeft: paddingLeft + 20 }}>
          <span className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            Carregando solicitações…
          </span>
        </td>
      </tr>
    );
  }

  if (isError) {
    return (
      <tr className="bg-gray-50/60 dark:bg-gray-800/20">
        <td colSpan={2} className="px-4 py-3 text-xs text-red-600 dark:text-red-400" style={{ paddingLeft: paddingLeft + 20 }}>
          {(error as Error)?.message ?? 'Erro ao carregar solicitações.'}
        </td>
      </tr>
    );
  }

  const solicitacoes = aggregateGastosNaturezaSolicitacoesByTitulo(
    filterGastosNaturezaSolicitacoesByPeriod(data ?? [], periodFrom, periodTo)
  ).sort((a, b) => {
    const byValor = Math.abs(b.valor) - Math.abs(a.valor);
    if (byValor !== 0) return byValor;
    const ta = a.dataISO ? new Date(`${a.dataISO}T12:00:00`).getTime() : 0;
    const tb = b.dataISO ? new Date(`${b.dataISO}T12:00:00`).getTime() : 0;
    return tb - ta;
  });

  if (solicitacoes.length === 0) {
    return (
      <tr className="bg-gray-50/60 dark:bg-gray-800/20">
        <td colSpan={2} className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400" style={{ paddingLeft: paddingLeft + 20 }}>
          Nenhuma solicitação encontrada no RM para esta natureza no período.
        </td>
      </tr>
    );
  }

  return (
    <>
      {solicitacoes.map((solicitacao) => {
        const signedValor = gastosNaturezaTotalContribution(solicitacao.natureza, solicitacao.valor);
        const signedClass =
          signedValor > 0
            ? 'text-green-600 dark:text-green-400'
            : signedValor < 0
              ? 'text-red-600 dark:text-red-400'
              : valueClassName;
        return (
        <tr
          key={solicitacao.linhaId}
          className="cursor-pointer bg-gray-50/60 hover:bg-gray-100/80 dark:bg-gray-800/20 dark:hover:bg-gray-800/40"
          onClick={() => onOpenSolicitacao(solicitacao)}
        >
          <td className="px-4 py-1.5 text-xs text-gray-700 dark:text-gray-300" style={{ paddingLeft: paddingLeft + 20 }}>
            <span className="block font-medium">{resolveGastosNaturezaSolicitacaoTitulo(solicitacao)}</span>
            <span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">
              {formatGastosNaturezaSolicitacaoDataLabel(solicitacao, formatDate)}
              {solicitacao.natureza !== row.natureza ? ` · ${solicitacao.natureza}` : ''}
            </span>
          </td>
          <td className={`px-4 py-1.5 text-right text-xs tabular-nums whitespace-nowrap ${signedClass}`}>
            {formatCurrency(signedValor)}
          </td>
        </tr>
        );
      })}
    </>
  );
}
