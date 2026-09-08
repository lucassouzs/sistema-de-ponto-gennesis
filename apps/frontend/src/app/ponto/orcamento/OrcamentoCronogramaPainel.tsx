'use client';

import React, { useEffect, useRef, useMemo, useState } from 'react';
import {
  Calendar,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { estimarPrazosCronograma, gerarSubServicosCronograma } from './orcamentoCronogramaApi';
import toast from 'react-hot-toast';
import { isAxiosError } from 'axios';
import {
  calcularDesvioTimeline,
  calcularMarcadorHojeTimeline,
  calcularResumoCronograma,
  calcularTimelineRange,
  calcularTimelineRangeVisivel,
  copiarDatasPlanParaRealCronograma,
  distribuirPrazoGeralCronograma,
  montarPayloadEstimativaPrazoCronograma,
  formatDesvioDiasCurto,
  formatDesvioDiasLabel,
  montarLinhasTimeline,
  posicaoBarraTimeline,
  type CronogramaTimelineLinha,
  type CronogramaTimelineZoom
} from './orcamentoCronogramaCalc';
import { CronogramaCurvaSPanel } from './orcamentoCronogramaCurvaS';
import {
  TimelineDesvioVisual,
  TimelineEtapaEditor,
  TimelineZoomControls,
  TIMELINE_ROW_HEIGHT_PX,
  type TimelineEtapaEditorTarget
} from './orcamentoCronogramaTimelineUi';
import {
  CRONOGRAMA_STATUS_CLASS,
  CRONOGRAMA_STATUS_LABEL,
  agruparSubServicosPorBloco,
  calcularStatusCronograma,
  criarSubServicoManual,
  cronogramaUsaHierarquiaSubtitulos,
  diasEntre,
  filtrarSubServicosOperacionaisCronograma,
  formatDataBr,
  etapaCronogramaEhSintetica,
  listarEtapasCronogramaBloco,
  listarSubServicos,
  listarSubtitulosVisiveisCronograma,
  novoSubServicoId,
  ordenarSubServicosSequenciaObra,
  parseDataIso,
  resolverDadosCronogramaBloco,
  resolverDadosCronogramaComposicao,
  resolverDadosCronogramaServicoParaLinha,
  resolverDadosCronogramaSubServico,
  type CronogramaItemData,
  type CronogramaLinhaServico,
  type CronogramaLinhaSubtitulo,
  type CronogramaPersist,
  type CronogramaSubServico
} from './orcamentoCronogramaTypes';
import { gradeTableCls, gradeTableRowTrCls, tdGradeDateCls } from './orcamentoGradeCellClasses';
import { DatePickerField } from '@/components/ui/DatePickerField';

type Props = {
  linhas: CronogramaLinhaServico[];
  cronograma: CronogramaPersist;
  onChange: (next: CronogramaPersist) => void;
  centroCustoId?: string | null;
  orcamentoId?: string | null;
  /** Datas do orçamento (meta.dataAbertura / dataEnvio). */
  dataInicioObra?: string;
  dataFimObra?: string;
};

const sectionShellCls =
  'rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden';
const sectionHeaderCls =
  'px-4 sm:px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/40';
const thCls =
  'px-3 py-2.5 text-center text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l border-gray-300 dark:border-gray-600 first:border-l-0';
const tdCls =
  'px-3 py-2.5 text-sm text-gray-900 dark:text-gray-100 border-l border-gray-200 dark:border-gray-600 align-middle';
const tdServicoColCls =
  'min-w-[9rem] w-max px-3 py-0 text-sm border-l-0 align-middle whitespace-nowrap';
const thServicoColCls =
  'min-w-[9rem] w-max px-3 py-2.5 text-left text-[11px] font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wide border-l-0 whitespace-nowrap';
const tdPctColCls = `${tdCls} text-center min-w-[4.75rem] w-[4.75rem] px-1 whitespace-nowrap`;
const thPctColCls = `${thCls} min-w-[4.75rem] w-[4.75rem] px-1 whitespace-nowrap`;
const inputPctCls =
  'w-full rounded-md border border-gray-300 bg-white px-1 py-1 text-center text-xs tabular-nums text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]';
const statusBarCls = (status: keyof typeof CRONOGRAMA_STATUS_CLASS) =>
  status === 'concluido'
    ? 'bg-green-500'
    : status === 'atrasado'
      ? 'bg-red-500'
      : status === 'em_andamento'
        ? 'bg-sky-500'
        : 'bg-gray-400 dark:bg-gray-500';
const statusSpanCls = (status: keyof typeof CRONOGRAMA_STATUS_CLASS) =>
  `inline-flex items-center text-sm font-semibold ${CRONOGRAMA_STATUS_CLASS[status]}`;
const timelineLabelColCls =
  'shrink-0 pr-4 py-2 text-xs text-gray-800 dark:text-gray-200 whitespace-nowrap';
const TIMELINE_LABEL_MIN_W_PX = 360;

function calcularLarguraColunaServicoTimeline(
  linhas: { label: string; indentLevel?: 0 | 1 | 2 }[]
): number {
  const longest = linhas.reduce((max, row) => Math.max(max, row.label.length), 0);
  const maxIndent = linhas.reduce((max, row) => Math.max(max, row.indentLevel ?? (row as { isSub?: boolean }).isSub ? 1 : 0), 0);
  const indentExtra = maxIndent * 16;
  return Math.min(720, Math.max(TIMELINE_LABEL_MIN_W_PX, longest * 7 + indentExtra + 40));
}

function paddingServicoColCls(indentLevel: 0 | 1 | 2 = 0): string {
  if (indentLevel >= 2) return 'pl-9';
  if (indentLevel === 1) return 'pl-6';
  return 'pl-4';
}

function formatPct(v: number) {
  return `${v.toFixed(1).replace('.', ',')}%`;
}

function SubServicoNomeCell({
  sub,
  onPatch,
  onRemove
}: {
  sub: CronogramaSubServico;
  onPatch: (nome: string) => void;
  onRemove: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState(sub.nome);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editando) setDraft(sub.nome);
  }, [sub.nome, editando]);

  useEffect(() => {
    if (editando) inputRef.current?.focus();
  }, [editando]);

  const commit = () => {
    const nome = draft.trim() || sub.nome;
    onPatch(nome);
    setDraft(nome);
    setEditando(false);
  };

  return (
    <div className="flex min-h-[2.75rem] items-center gap-2 min-w-0">
      {editando ? (
        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') {
              setDraft(sub.nome);
              setEditando(false);
            }
          }}
          className="min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 min-w-[12rem]"
          aria-label={`Editar subserviço — ${sub.nome}`}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditando(true)}
          className="flex-1 py-1.5 pl-1 pr-0.5 text-left text-xs font-normal text-gray-800 dark:text-gray-200 cursor-pointer whitespace-nowrap"
        >
          {sub.nome}
        </button>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-gray-400 opacity-0 transition-opacity group-hover/subrow:opacity-100 focus:opacity-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
        aria-label={`Excluir subserviço ${sub.nome}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function ComposicaoResumoNomeCell({ nome }: { nome: string }) {
  return (
    <div className="flex min-h-[2.75rem] items-center gap-2 min-w-0">
      <span
        className="flex-1 py-1.5 pl-1 pr-0.5 text-left text-xs font-normal text-gray-800 dark:text-gray-200 whitespace-nowrap"
        title={nome}
      >
        {nome}
      </span>
    </div>
  );
}

function CelulasEtapaCronograma({
  resolvido,
  status,
  readOnly,
  ariaPrefix,
  onPatch
}: {
  resolvido: CronogramaItemData;
  status: ReturnType<typeof calcularStatusCronograma>;
  readOnly: boolean;
  ariaPrefix: string;
  onPatch: (patch: Partial<CronogramaItemData>) => void;
}) {
  const observacao = resolvido.observacao?.trim() || '';

  return (
    <>
      <td className={tdGradeDateCls}>
        <DatePickerField
          size="table"
          appearance="inline"
          value={resolvido.dataInicio ?? ''}
          onChange={(v) => onPatch({ dataInicio: v })}
          placeholder="dd/mm/aaaa"
          aria-label={`Início plan. — ${ariaPrefix}`}
          disabled={readOnly}
        />
      </td>
      <td className={tdGradeDateCls}>
        <DatePickerField
          size="table"
          appearance="inline"
          value={resolvido.dataFim ?? ''}
          onChange={(v) => onPatch({ dataFim: v })}
          placeholder="dd/mm/aaaa"
          aria-label={`Fim plan. — ${ariaPrefix}`}
          disabled={readOnly}
        />
      </td>
      <td className={tdGradeDateCls}>
        <DatePickerField
          size="table"
          appearance="inline"
          value={resolvido.dataInicioReal ?? ''}
          onChange={(v) => onPatch({ dataInicioReal: v })}
          placeholder="dd/mm/aaaa"
          aria-label={`Início real — ${ariaPrefix}`}
          disabled={readOnly}
        />
      </td>
      <td className={tdGradeDateCls}>
        <DatePickerField
          size="table"
          appearance="inline"
          value={resolvido.dataFimReal ?? ''}
          onChange={(v) => onPatch({ dataFimReal: v })}
          placeholder="dd/mm/aaaa"
          aria-label={`Fim real — ${ariaPrefix}`}
          disabled={readOnly}
        />
      </td>
      <td className={`${tdCls} text-center tabular-nums text-xs`}>
        {diasEntre(resolvido.dataInicio, resolvido.dataFim) ?? '—'}
      </td>
      <td className={tdPctColCls}>
        <PercentualExecCell
          value={resolvido.percentualExecutado}
          readOnly={readOnly}
          onChange={
            readOnly
              ? undefined
              : (v) => onPatch({ percentualExecutado: v })
          }
          ariaLabel={`% executado — ${ariaPrefix}`}
        />
      </td>
      <td className={`${tdCls} text-center`}>
        <span
          className={`${statusSpanCls(status)}${observacao ? ' cursor-help' : ''}`}
          title={observacao || undefined}
        >
          {CRONOGRAMA_STATUS_LABEL[status]}
        </span>
      </td>
    </>
  );
}

function PercentualExecCell({
  value,
  onChange,
  ariaLabel,
  readOnly = false
}: {
  value: number | undefined;
  onChange?: (v: number | undefined) => void;
  ariaLabel: string;
  readOnly?: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editando) {
      setDraft(value != null && Number.isFinite(value) ? String(Math.round(value)) : '');
    }
  }, [value, editando]);

  useEffect(() => {
    if (editando) inputRef.current?.focus();
  }, [editando]);

  const commit = () => {
    if (readOnly || !onChange) {
      setEditando(false);
      return;
    }
    if (draft.trim() === '') {
      onChange(undefined);
    } else {
      const n = Number(draft);
      onChange(Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : undefined);
    }
    setEditando(false);
  };

  const exibir =
    value != null && Number.isFinite(value) ? `${Math.round(value)}%` : '0%';

  if (readOnly) {
    return (
      <span
        className="block w-full py-1 text-center text-xs tabular-nums text-gray-800 dark:text-gray-200"
        aria-label={ariaLabel}
        title="Calculado automaticamente a partir das etapas"
      >
        {exibir}
      </span>
    );
  }

  if (editando) {
    return (
      <input
        ref={inputRef}
        type="number"
        min={0}
        max={100}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            setDraft(value != null && Number.isFinite(value) ? String(Math.round(value)) : '');
            setEditando(false);
          }
        }}
        className={inputPctCls}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditando(true)}
      className="w-full py-1 text-center text-xs tabular-nums text-gray-800 dark:text-gray-200 cursor-pointer"
      aria-label={ariaLabel}
    >
      {exibir}
    </button>
  );
}

export function OrcamentoCronogramaPainel({
  linhas,
  cronograma,
  onChange,
  centroCustoId,
  orcamentoId,
  dataInicioObra = '',
  dataFimObra = ''
}: Props) {
  const [viewMode, setViewMode] = useState<'tabela' | 'timeline'>('tabela');
  const [mostrarPlanejamentoTimeline, setMostrarPlanejamentoTimeline] = useState(true);
  const [timelineZoom, setTimelineZoom] = useState<CronogramaTimelineZoom>('obra');
  const [timelinePanOffset, setTimelinePanOffset] = useState(0);
  const [editorTarget, setEditorTarget] = useState<TimelineEtapaEditorTarget | null>(null);
  const [gerandoServicoKey, setGerandoServicoKey] = useState<string | null>(null);
  const [gerandoBlocoKey, setGerandoBlocoKey] = useState<string | null>(null);
  const [distribuindoPrazo, setDistribuindoPrazo] = useState(false);
  const cronogramaRef = useRef(cronograma);
  const autoGeradoRef = useRef<Set<string>>(new Set());
  cronogramaRef.current = cronograma;

  const resumo = useMemo(() => calcularResumoCronograma(linhas, cronograma), [linhas, cronograma]);

  const linhasTimeline = useMemo(() => montarLinhasTimeline(linhas, cronograma), [linhas, cronograma]);

  const timelineLabelWidthPx = useMemo(
    () => calcularLarguraColunaServicoTimeline(linhasTimeline),
    [linhasTimeline]
  );

  const timelineRangeObra = useMemo(
    () => calcularTimelineRange(linhas, cronograma),
    [linhas, cronograma]
  );

  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const id = window.setInterval(() => setAgora(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const timelineRange = useMemo(
    () =>
      timelineRangeObra
        ? calcularTimelineRangeVisivel(timelineRangeObra, timelineZoom, agora, timelinePanOffset)
        : null,
    [timelineRangeObra, timelineZoom, agora, timelinePanOffset]
  );

  const hojeMarcador = useMemo(
    () =>
      timelineRange
        ? calcularMarcadorHojeTimeline(timelineRange.inicio, timelineRange.fim, agora)
        : null,
    [timelineRange, agora]
  );

  const timelineGridCols = useMemo(() => {
    if (!timelineRange) return null;
    return {
      linha: `${timelineLabelWidthPx}px minmax(0, 1fr)`,
      dias: `repeat(${timelineRange.colunas.length}, minmax(0, 1fr))`
    };
  }, [timelineRange, timelineLabelWidthPx]);

  const patchServico = (servicoKey: string, patch: Partial<CronogramaItemData>) => {
    const prev = cronograma.porServico[servicoKey] ?? {};
    onChange({
      ...cronograma,
      porServico: {
        ...cronograma.porServico,
        [servicoKey]: { ...prev, ...patch }
      }
    });
  };

  const patchComposicaoEtapa = (
    blocoKey: string,
    composicaoChave: string,
    patch: Partial<CronogramaItemData>
  ) => {
    const itemKey = `${blocoKey}|${composicaoChave}`;
    const prev = cronograma.porItem?.[itemKey] ?? {};
    onChange({
      ...cronograma,
      porItem: {
        ...(cronograma.porItem ?? {}),
        [itemKey]: { ...prev, ...patch }
      }
    });
  };

  const applySubServicos = (servicoKey: string, lista: CronogramaSubServico[]) => {
    const next: CronogramaPersist = {
      ...cronogramaRef.current,
      subServicosPorServico: {
        ...cronogramaRef.current.subServicosPorServico,
        [servicoKey]: lista
      }
    };
    cronogramaRef.current = next;
    onChange(next);
  };

  const setSubServicos = applySubServicos;

  const patchSubServico = (
    servicoKey: string,
    subId: string,
    patch: Partial<CronogramaSubServico>
  ) => {
    const lista = listarSubServicos(cronograma, servicoKey).map((s) =>
      s.id === subId ? { ...s, ...patch } : s
    );
    setSubServicos(servicoKey, lista);
  };

  const adicionarSubServico = (servicoKey: string, subtituloBlocoKey?: string) => {
    const novo = criarSubServicoManual();
    const sub: CronogramaSubServico = subtituloBlocoKey
      ? { ...novo, subtituloBlocoKey }
      : novo;
    const lista = [...listarSubServicos(cronograma, servicoKey)];
    if (subtituloBlocoKey) {
      let insertAt = lista.length;
      for (let i = lista.length - 1; i >= 0; i--) {
        if (lista[i].subtituloBlocoKey === subtituloBlocoKey) {
          insertAt = i + 1;
          break;
        }
      }
      lista.splice(insertAt, 0, sub);
    } else {
      lista.push(sub);
    }
    setSubServicos(servicoKey, lista);
  };

  const removerSubServico = (servicoKey: string, subId: string) => {
    const lista = listarSubServicos(cronograma, servicoKey).filter((s) => s.id !== subId);
    setSubServicos(servicoKey, lista);
  };

  const distribuirPrazoGeral = async () => {
    if (!dataInicioObra || !dataFimObra || distribuindoPrazo) return;
    setDistribuindoPrazo(true);
    try {
      let pesosPorEtapa: Record<string, number> | undefined;
      let origem: 'ia' | 'heuristica' | 'valor' = 'valor';

      if (centroCustoId && orcamentoId) {
        const etapas = montarPayloadEstimativaPrazoCronograma(linhas, cronograma);
        if (etapas.length > 0) {
          const result = await estimarPrazosCronograma(centroCustoId, orcamentoId, {
            dataInicioObra,
            dataFimObra,
            etapas
          });
          pesosPorEtapa = {};
          for (const e of result.etapas) {
            if (e.etapaKey && e.diasEstimados > 0) {
              pesosPorEtapa[e.etapaKey] = e.diasEstimados;
            }
          }
          origem = result.origem;
        }
      }

      const next = distribuirPrazoGeralCronograma(
        linhas,
        cronograma,
        dataInicioObra,
        dataFimObra,
        pesosPorEtapa
      );
      if (!next) return;
      onChange(next);
      if (origem === 'ia') {
        toast.success('Prazos distribuídos com estimativa de IA por etapa.');
      } else if (origem === 'heuristica') {
        toast.success('Prazos distribuídos com estimativa por quantidade e tipo de serviço.');
      }
    } catch (err) {
      const next = distribuirPrazoGeralCronograma(linhas, cronograma, dataInicioObra, dataFimObra);
      if (!next) return;
      onChange(next);
      if (isAxiosError(err) && err.code === 'ECONNABORTED') {
        toast.error('A estimativa demorou demais — prazos distribuídos pelo valor.');
      } else if (isAxiosError(err) && !err.response) {
        toast.error('Falha na conexão com o servidor — prazos distribuídos pelo valor.');
      } else {
        toast.error('Não foi possível estimar com IA — prazos distribuídos pelo valor.');
      }
    } finally {
      setDistribuindoPrazo(false);
    }
  };

  const copiarPlanParaReal = () => {
    onChange(copiarDatasPlanParaRealCronograma(linhas, cronograma));
  };

  const patchEtapaDados = (row: CronogramaTimelineLinha, patch: Partial<CronogramaItemData>) => {
    if (row.subId) {
      patchSubServico(row.servicoKey, row.subId, patch);
      return;
    }
    if (row.composicaoChave && row.blocoKey) {
      patchComposicaoEtapa(row.blocoKey, row.composicaoChave, patch);
      return;
    }
    patchServico(row.servicoKey, patch);
  };

  const abrirEditorEtapa = (row: CronogramaTimelineLinha, e: React.MouseEvent) => {
    if (!row.editavel || row.isCabecalhoServico || row.isCabecalhoSubtitulo) return;
    e.stopPropagation();
    setEditorTarget({ row, anchorEl: e.currentTarget as HTMLElement });
  };

  const gerarSubServicosBloco = async (
    linha: CronogramaLinhaServico,
    st: CronogramaLinhaSubtitulo
  ): Promise<CronogramaSubServico[]> => {
    const cfg = cronogramaRef.current.config;
    const result = await gerarSubServicosCronograma(centroCustoId!, orcamentoId!, {
      servicoId: linha.servicoKey,
      servicoNome: linha.servicoNome,
      subtituloNome: st.subtituloNome,
      dataInicioObra: dataInicioObra || cfg?.dataInicioObra,
      dataFimObra: dataFimObra || cfg?.dataFimObra,
      composicoes: st.composicoes
    });
    return result.subServicos.map((s) => ({
      id: novoSubServicoId(),
      nome: s.nome,
      origem: 'ia' as const,
      composicaoChave: s.composicaoChave,
      subtituloBlocoKey: st.blocoKey
    }));
  };

  const gerarTodosSubServicos = async (
    linha: CronogramaLinhaServico
  ): Promise<CronogramaSubServico[]> => {
    const cfg = cronogramaRef.current.config;
    const subtitulosVisiveis = listarSubtitulosVisiveisCronograma(linha);

    if (subtitulosVisiveis.length > 0) {
      const todos: CronogramaSubServico[] = [];
      for (const st of subtitulosVisiveis) {
        todos.push(...(await gerarSubServicosBloco(linha, st)));
      }
      return todos;
    }

    const result = await gerarSubServicosCronograma(centroCustoId!, orcamentoId!, {
      servicoId: linha.servicoKey,
      servicoNome: linha.servicoNome,
      dataInicioObra: dataInicioObra || cfg?.dataInicioObra,
      dataFimObra: dataFimObra || cfg?.dataFimObra,
      composicoes: linha.composicoes
    });
    return result.subServicos.map((s) => ({
      id: novoSubServicoId(),
      nome: s.nome,
      origem: 'ia' as const,
      composicaoChave: s.composicaoChave
    }));
  };

  const gerarSubServicosParaLinha = async (linha: CronogramaLinhaServico): Promise<boolean> => {
    if (!centroCustoId || !orcamentoId) return false;
    if (listarSubServicos(cronogramaRef.current, linha.servicoKey).length > 0) return false;

    setGerandoServicoKey(linha.servicoKey);
    try {
      const novos = await gerarTodosSubServicos(linha);
      applySubServicos(linha.servicoKey, novos);
      return true;
    } catch {
      return false;
    } finally {
      setGerandoServicoKey((k) => (k === linha.servicoKey ? null : k));
    }
  };

  const regerarSubServicosBloco = async (
    linha: CronogramaLinhaServico,
    st: CronogramaLinhaSubtitulo
  ) => {
    if (!centroCustoId || !orcamentoId) return;
    setGerandoBlocoKey(st.blocoKey);
    try {
      const novosBloco = await gerarSubServicosBloco(linha, st);
      const atuais = listarSubServicos(cronogramaRef.current, linha.servicoKey);
      const porBloco = agruparSubServicosPorBloco(linha, atuais);
      const mantidos: CronogramaSubServico[] = [];
      for (const [blocoKey, subsBloco] of Array.from(porBloco.entries())) {
        if (blocoKey !== st.blocoKey) mantidos.push(...subsBloco);
      }
      applySubServicos(linha.servicoKey, [...mantidos, ...novosBloco]);
    } catch {
      /* mantém etapas atuais */
    } finally {
      setGerandoBlocoKey((k) => (k === st.blocoKey ? null : k));
    }
  };

  useEffect(() => {
    if (!centroCustoId || !orcamentoId || linhas.length === 0) return;

    let cancelled = false;

    (async () => {
      for (const linha of linhas) {
        if (cancelled) return;
        if (listarSubServicos(cronogramaRef.current, linha.servicoKey).length > 0) continue;
        if (autoGeradoRef.current.has(linha.servicoKey)) continue;
        autoGeradoRef.current.add(linha.servicoKey);

        const ok = await gerarSubServicosParaLinha(linha);
        if (!ok && !cancelled) autoGeradoRef.current.delete(linha.servicoKey);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [linhas, centroCustoId, orcamentoId, cronograma.subServicosPorServico]);

  if (linhas.length === 0) {
    return null;
  }

  return (
    <div>
      <section className={sectionShellCls}>
        <div className={`${sectionHeaderCls} space-y-3`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Serviços do cronograma</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-100/80 dark:bg-gray-800/70">
                <button
                  type="button"
                  onClick={() => setViewMode('tabela')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all outline-none ${
                    viewMode === 'tabela'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                  }`}
                >
                  Planilha
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('timeline')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all outline-none ${
                    viewMode === 'timeline'
                      ? 'bg-red-600 text-white shadow-sm'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700'
                  }`}
                >
                  Linha do tempo
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-gray-200/80 pt-3 text-xs text-gray-600 dark:border-gray-700/80 dark:text-gray-400">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                className="tabular-nums"
                title={`${resumo.valorExecutado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de ${resumo.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`}
              >
                <strong className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatPct(resumo.progressoFisico)}
                </strong>{' '}
                físico
              </span>
              <span className="text-gray-300 dark:text-gray-600" aria-hidden>
                ·
              </span>
              <span className="tabular-nums">
                <strong className="font-semibold text-gray-900 dark:text-gray-100">
                  {resumo.porStatus.concluido}/{resumo.totalEtapas}
                </strong>{' '}
                concluídos
              </span>
              <span className="text-gray-300 dark:text-gray-600" aria-hidden>
                ·
              </span>
              <span className="tabular-nums">
                <strong
                  className={`font-semibold ${resumo.porStatus.atrasado > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}
                >
                  {resumo.porStatus.atrasado}
                </strong>{' '}
                atrasados
              </span>
              <span className="text-gray-300 dark:text-gray-600" aria-hidden>
                ·
              </span>
              <span className="tabular-nums">
                <strong className="font-semibold text-gray-900 dark:text-gray-100">{resumo.servicosComDatas}</strong>{' '}
                c/ prazo
              </span>
            </div>

            {dataInicioObra || dataFimObra ? (
              <span className="shrink-0 tabular-nums text-gray-700 dark:text-gray-300">
                {formatDataBr(dataInicioObra) || '—'}
                <span className="mx-1.5 text-gray-400 dark:text-gray-500" aria-hidden>
                  →
                </span>
                {formatDataBr(dataFimObra) || '—'}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 border-t-[0.5px] border-gray-200/80 pt-3 dark:border-gray-700/80 sm:flex-row sm:items-center sm:justify-between">
            {resumo.etapasSemDatasReais > 0 ? (
              <p className="text-xs leading-relaxed text-amber-700 dark:text-amber-300/90">
                {resumo.etapasSemDatasReais} etapa(s) sem datas reais — preencha na planilha ou use{' '}
                <strong className="font-semibold">Copiar plan → real</strong> para ver a execução na linha do tempo.
              </p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Resumo considera {resumo.totalEtapas} etapa(s) (subserviços quando existirem).
              </p>
            )}
            <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
              <button
                type="button"
                onClick={distribuirPrazoGeral}
                disabled={!dataInicioObra || !dataFimObra || distribuindoPrazo}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                title="Estima a duração de cada etapa (IA quando disponível) e distribui o prazo da obra em sequência"
              >
                {distribuindoPrazo ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Calendar className="h-3.5 w-3.5" aria-hidden />
                )}
                {distribuindoPrazo ? 'Estimando prazos…' : 'Distribuir prazo geral'}
              </button>
              <button
                type="button"
                onClick={copiarPlanParaReal}
                disabled={resumo.servicosComDatas === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                title="Copia início/fim plan. para início/fim real de cada etapa"
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Copiar plan → real
              </button>
            </div>
          </div>
        </div>

        <CronogramaCurvaSPanel
          linhas={linhas}
          cronograma={cronograma}
          dataInicioObra={dataInicioObra}
          dataFimObra={dataFimObra}
          hoje={agora}
        />

        {viewMode === 'timeline' && timelineRange && timelineGridCols && (
          <div className="w-full">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-gray-200 bg-gray-50/50 px-4 py-2 text-[10px] text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-3 rounded-sm bg-gray-400" /> Pendente
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-3 rounded-sm bg-sky-500" /> Em andamento
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-3 rounded-sm bg-green-500" /> Concluído
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-3 rounded-sm bg-red-500" /> Atrasado
                  </span>
                  {mostrarPlanejamentoTimeline ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="h-2 w-3 rounded-sm border border-dashed border-gray-400 bg-transparent dark:border-gray-500" />{' '}
                      Planejamento
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-3 rounded-sm bg-sky-500/80" /> Execução (real)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-0.5 w-3 rounded-sm bg-red-500/70" aria-hidden /> Desvio (atraso)
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-0.5 w-3 rounded-sm bg-green-500/70" aria-hidden /> Desvio (adiant.)
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <TimelineZoomControls
                    zoom={timelineZoom}
                    panOffset={timelinePanOffset}
                    onZoomChange={(z) => {
                      setTimelineZoom(z);
                      setTimelinePanOffset(0);
                    }}
                    onPanChange={(d) => setTimelinePanOffset((p) => p + d)}
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPlanejamentoTimeline((v) => !v)}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-pressed={mostrarPlanejamentoTimeline}
                  >
                    {mostrarPlanejamentoTimeline ? (
                      <EyeOff className="h-3 w-3" aria-hidden />
                    ) : (
                      <Eye className="h-3 w-3" aria-hidden />
                    )}
                    {mostrarPlanejamentoTimeline ? 'Ocultar planejamento' : 'Mostrar planejamento'}
                  </button>
                </div>
              </div>

              <div className="relative w-full">
                {hojeMarcador ? (
                  <div
                    className="pointer-events-none absolute z-[5]"
                    style={{
                      left: timelineLabelWidthPx,
                      right: 0,
                      top: 0,
                      bottom: 0
                    }}
                    aria-hidden
                  >
                    <div
                      className="absolute top-0 bottom-0 w-px bg-red-500/85"
                      style={{ left: `${hojeMarcador.leftPct}%` }}
                    />
                  </div>
                ) : null}

              <div
                className="grid sticky top-0 z-10 w-full bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700"
                style={{ gridTemplateColumns: timelineGridCols.linha }}
              >
                <div
                  className={`${timelineLabelColCls} pl-4 flex items-center text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300 border-r border-gray-200/70 dark:border-gray-700/70`}
                >
                  Serviço
                </div>
                <div className="flex min-w-0 w-full flex-col">
                  <div
                    className="grid w-full border-b border-gray-200/70 dark:border-gray-700/70"
                    style={{ gridTemplateColumns: timelineGridCols.dias }}
                  >
                    {timelineRange.meses.map((mes) => (
                      <div
                        key={mes.key}
                        className="text-center text-[10px] font-semibold uppercase text-gray-500 dark:text-gray-400 truncate border-l border-gray-200/70 dark:border-gray-700/70 first:border-l-0 py-1"
                        style={{ gridColumn: `span ${mes.span}` }}
                      >
                        {mes.label}
                      </div>
                    ))}
                  </div>
                  <div
                    className="grid w-full"
                    style={{ gridTemplateColumns: timelineGridCols.dias }}
                  >
                    {timelineRange.colunas.map((col) => {
                      const isHoje = hojeMarcador?.colIndex === col.index;
                      return (
                      <div
                        key={col.key}
                        className={`border-l border-gray-200/70 py-1 text-center text-[10px] font-semibold tabular-nums first:border-l-0 dark:border-gray-700/70 ${
                          isHoje
                            ? 'bg-red-500/10 text-red-600 dark:bg-red-500/15 dark:text-red-400'
                            : 'text-gray-600 dark:text-gray-300'
                        }`}
                      >
                        {col.label}
                      </div>
                    );
                    })}
                  </div>
                </div>
              </div>

              <div className="relative w-full">
              {linhasTimeline.map((row) => {
                const status = calcularStatusCronograma(row.dados);
                const iniPlan = parseDataIso(row.dados.dataInicio);
                const fimPlan = parseDataIso(row.dados.dataFim);
                const iniReal = parseDataIso(row.dados.dataInicioReal);
                const fimReal = parseDataIso(row.dados.dataFimReal);
                const barPlan =
                  row.showBar && iniPlan && fimPlan
                    ? posicaoBarraTimeline(timelineRange.inicio, timelineRange.fim, iniPlan, fimPlan)
                    : null;
                const barReal =
                  row.showBar && iniReal && fimReal
                    ? posicaoBarraTimeline(timelineRange.inicio, timelineRange.fim, iniReal, fimReal)
                    : null;
                const pct = Math.min(100, Math.max(0, Math.round(row.dados.percentualExecutado ?? 0)));
                const desvio = calcularDesvioTimeline(row.dados);
                const mostrarBarraPlan =
                  barPlan &&
                  barPlan.widthPct > 0 &&
                  (mostrarPlanejamentoTimeline ||
                    (barReal && barReal.widthPct > 0 && desvio.temDesvio));
                const planSomenteDesvio = Boolean(
                  mostrarBarraPlan && !mostrarPlanejamentoTimeline && desvio.temDesvio
                );
                const desvioFimLabel = formatDesvioDiasCurto(desvio.desvioFimDias);

                return (
                  <div
                    key={row.key}
                    className={`group/tlrow grid border-b border-gray-100 dark:border-gray-800 ${
                      row.isCabecalhoServico
                        ? 'bg-gray-50/80 dark:bg-gray-800/40'
                        : row.isCabecalhoSubtitulo
                          ? 'bg-slate-100/90 dark:bg-gray-900/70'
                          : 'bg-white dark:bg-gray-900/80'
                    }`}
                    style={{
                      gridTemplateColumns: timelineGridCols.linha,
                      height: TIMELINE_ROW_HEIGHT_PX
                    }}
                  >
                    <div
                      className={`${timelineLabelColCls} flex flex-col justify-center border-r border-gray-200/70 dark:border-gray-700/70 ${paddingServicoColCls(row.indentLevel ?? (row.isSub ? 1 : 0))}`}
                    >
                      <div
                        className={`flex items-center min-w-0 gap-1 ${
                          row.isCabecalhoServico || row.isCabecalhoSubtitulo || row.showBar
                            ? 'justify-between'
                            : ''
                        }`}
                      >
                        <span
                          className={`min-w-0 truncate leading-snug ${
                            row.isCabecalhoServico
                              ? 'font-semibold text-gray-900 dark:text-gray-100'
                              : row.isCabecalhoSubtitulo
                                ? 'text-[11px] font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200'
                                : row.isSub
                                  ? 'font-normal text-gray-700 dark:text-gray-300'
                                  : 'font-semibold text-gray-900 dark:text-gray-100'
                          }`}
                          title={row.label}
                        >
                          {row.label}
                        </span>
                        {row.isCabecalhoServico || row.isCabecalhoSubtitulo || row.showBar ? (
                          <span className="flex shrink-0 items-center gap-1">
                            {desvioFimLabel ? (
                              <span
                                className={`text-[9px] font-bold tabular-nums leading-none ${
                                  (desvio.desvioFimDias ?? 0) > 0
                                    ? 'text-red-500 dark:text-red-400'
                                    : 'text-green-600 dark:text-green-400'
                                }`}
                                title={formatDesvioDiasLabel(desvio.desvioFimDias) ?? undefined}
                              >
                                {desvioFimLabel}
                              </span>
                            ) : null}
                            <span
                              className={`text-xs tabular-nums font-semibold ${
                                row.isSub
                                  ? 'font-normal text-gray-500 dark:text-gray-400'
                                  : 'text-gray-600 dark:text-gray-300'
                              }`}
                            >
                              {pct}%
                            </span>
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {row.isCabecalhoServico || row.isCabecalhoSubtitulo ? (
                      <div className="min-w-0" />
                    ) : (
                      <div
                        className="relative min-w-0 w-full grid"
                        style={{ gridTemplateColumns: timelineGridCols.dias }}
                      >
                        {timelineRange.colunas.map((col) => (
                          <div
                            key={`${row.key}-${col.key}`}
                            className="border-l border-gray-100 dark:border-gray-800 first:border-l-0 h-full"
                            style={{ height: TIMELINE_ROW_HEIGHT_PX }}
                          />
                        ))}
                        {mostrarBarraPlan ? (
                          <button
                            type="button"
                            disabled={!row.editavel}
                            onClick={(e) => abrirEditorEtapa(row, e)}
                            className={`absolute top-1 bottom-1 overflow-visible rounded-sm ${
                              row.editavel && !(barReal && barReal.widthPct > 0)
                                ? 'cursor-pointer transition-[filter] duration-150 hover:brightness-110'
                                : 'pointer-events-none'
                            } ${planSomenteDesvio ? 'opacity-50' : ''}`}
                            style={{
                              left: `calc(${barPlan!.leftPct}% + 2px)`,
                              width: `calc(${Math.max(barPlan!.widthPct, 0.4)}% - 4px)`
                            }}
                            title={`Planejado: ${formatDataBr(row.dados.dataInicio)} → ${formatDataBr(row.dados.dataFim)}${
                              desvio.temDesvio ? ` · ${formatDesvioDiasLabel(desvio.desvioFimDias) ?? ''}` : ''
                            }`}
                          >
                            <div className="h-full rounded-sm border border-dashed border-gray-400/70 bg-gray-400/[0.06] dark:border-gray-500/60 dark:bg-gray-500/10" />
                          </button>
                        ) : null}
                        {barPlan && barReal && barPlan.widthPct > 0 && barReal.widthPct > 0 && desvio.temDesvio ? (
                          <TimelineDesvioVisual
                            barPlan={barPlan}
                            barReal={barReal}
                            desvio={desvio}
                            rowHeightPx={TIMELINE_ROW_HEIGHT_PX}
                          />
                        ) : null}
                        {barReal && barReal.widthPct > 0 ? (
                          <button
                            type="button"
                            disabled={!row.editavel}
                            onClick={(e) => abrirEditorEtapa(row, e)}
                            className={`absolute z-[2] rounded overflow-visible text-left transition-[filter] duration-150 ${
                              row.editavel
                                ? 'cursor-pointer hover:brightness-110 dark:hover:brightness-125'
                                : 'pointer-events-none'
                            } ${mostrarBarraPlan ? 'top-2 bottom-2' : 'top-1 bottom-1'}`}
                            style={{
                              left: `calc(${barReal.leftPct}% + 2px)`,
                              width: `calc(${Math.max(barReal.widthPct, 0.4)}% - 4px)`
                            }}
                            title={`Real: ${formatDataBr(row.dados.dataInicioReal)} → ${formatDataBr(row.dados.dataFimReal)} · ${pct}%${
                              desvio.temDesvio ? ` · desvio fim: ${formatDesvioDiasLabel(desvio.desvioFimDias) ?? '—'}` : ''
                            }`}
                          >
                            <div className="relative h-full overflow-visible rounded-sm ring-1 ring-inset ring-gray-900/10 dark:ring-white/10">
                              <div
                                className={`absolute inset-0 rounded-sm ${statusBarCls(status)} opacity-20 dark:opacity-25`}
                              />
                              <div
                                className={`absolute inset-y-0 left-0 rounded-sm ${statusBarCls(status)}`}
                                style={{ width: `${pct}%`, minWidth: pct > 0 ? 3 : undefined }}
                              />
                              {pct > 0 ? (
                                <span className="pointer-events-none absolute left-1 top-1/2 z-[1] -translate-y-1/2 whitespace-nowrap text-[9px] font-semibold tabular-nums leading-none text-white drop-shadow-[0_0_3px_rgba(0,0,0,0.85)]">
                                  {pct}%
                                </span>
                              ) : null}
                            </div>
                          </button>
                        ) : row.editavel && row.showBar ? (
                          <button
                            type="button"
                            onClick={(e) => abrirEditorEtapa(row, e)}
                            className="absolute inset-0 z-[1] cursor-pointer opacity-0"
                            title="Clique para definir datas e progresso"
                            aria-label={`Editar etapa — ${row.label}`}
                          />
                        ) : null}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>
              </div>
            {editorTarget ? (
              <TimelineEtapaEditor
                target={{
                  ...editorTarget,
                  row: linhasTimeline.find((r) => r.key === editorTarget.row.key) ?? editorTarget.row
                }}
                onClose={() => setEditorTarget(null)}
                onPatchDados={patchEtapaDados}
              />
            ) : null}
          </div>
        )}

        {viewMode === 'timeline' && !timelineRange && (
          <p className="px-4 sm:px-5 py-8 text-sm text-center text-gray-500 dark:text-gray-400">
            Defina datas reais (ou planejadas) nos serviços ou no prazo geral da obra para visualizar a linha do tempo.
          </p>
        )}

        {viewMode === 'tabela' && (
          <div className="table-scroll">
            <table className={`w-max min-w-full border-collapse table-auto ${gradeTableCls}`}>
              <thead className="sticky top-0 z-10 border-t-[0.5px] border-b border-gray-200/80 bg-gray-50 dark:border-gray-700/80 dark:bg-gray-800">
                <tr className={gradeTableRowTrCls}>
                  <th className={thServicoColCls}>Serviço</th>
                  <th className={`${thCls} min-w-[9rem]`}>Início Plan.</th>
                  <th className={`${thCls} min-w-[9rem]`}>Fim Plan.</th>
                  <th className={`${thCls} min-w-[9rem]`}>Início Real</th>
                  <th className={`${thCls} min-w-[9rem]`}>Fim Real</th>
                  <th className={`${thCls} min-w-[4rem]`}>Dias</th>
                  <th className={thPctColCls}>% Exec.</th>
                  <th className={`${thCls} min-w-[7rem]`}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200/80 dark:divide-gray-700">
                {linhas.flatMap((linha) => {
                  const resolvido = resolverDadosCronogramaServicoParaLinha(cronograma, linha);
                  const status = calcularStatusCronograma(resolvido);
                  const subs = filtrarSubServicosOperacionaisCronograma(
                    linha,
                    listarSubServicos(cronograma, linha.servicoKey)
                  );
                  const gerando = gerandoServicoKey === linha.servicoKey;
                  const usaHierarquia = cronogramaUsaHierarquiaSubtitulos(linha);
                  const subtitulosVisiveis = listarSubtitulosVisiveisCronograma(linha);
                  const subsPorBloco = agruparSubServicosPorBloco(linha, subs);
                  const servicoComFilhas = subs.length > 0;

                  const linhaServico = (
                    <tr
                      key={linha.servicoKey}
                      className={`bg-white dark:bg-gray-900/80 border-b border-gray-200/80 dark:border-gray-700 ${gradeTableRowTrCls}`}
                    >
                      <td className={`${tdServicoColCls} text-left pl-4`}>
                        <div className="flex min-h-[2.75rem] items-center gap-1">
                          <div className="flex-1">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 block leading-normal whitespace-nowrap">
                              {linha.servicoNome}
                            </span>
                            {gerando ? (
                              <span className="mt-0.5 flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                                <Loader2 className="h-3 w-3 animate-spin text-violet-500" aria-hidden />
                                Gerando etapas…
                              </span>
                            ) : null}
                          </div>
                          {!gerando && !usaHierarquia ? (
                            <button
                              type="button"
                              onClick={() => adicionarSubServico(linha.servicoKey)}
                              className="shrink-0 rounded p-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                              title="Adicionar subserviço"
                              aria-label={`Adicionar subserviço — ${linha.servicoNome}`}
                            >
                              <Plus className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <CelulasEtapaCronograma
                        resolvido={resolvido}
                        status={status}
                        readOnly={servicoComFilhas}
                        ariaPrefix={linha.servicoNome}
                        onPatch={(patch) => patchServico(linha.servicoKey, patch)}
                      />
                    </tr>
                  );

                  const renderLinhaSub = (
                    sub: CronogramaSubServico,
                    idx: number,
                    total: number,
                    indentLevel: 0 | 1 | 2,
                    blocoKey?: string
                  ) => {
                    const sintetica = etapaCronogramaEhSintetica(sub);
                    const subResolvido = (() => {
                      if (sintetica && blocoKey && sub.composicaoChave) {
                        const porItem = resolverDadosCronogramaComposicao(cronograma, blocoKey, {
                          chave: sub.composicaoChave,
                          codigo: '',
                          descricao: sub.nome,
                          subtituloNome: '',
                          quantidade: 0
                        });
                        if (porItem.dataInicio && porItem.dataFim) return porItem;
                      }
                      return resolverDadosCronogramaSubServico(
                        cronograma,
                        linha.servicoKey,
                        sub,
                        idx,
                        total
                      );
                    })();
                    const subStatus = calcularStatusCronograma(subResolvido);
                    return (
                      <tr
                        key={`${linha.servicoKey}-${sub.id}`}
                        className="group/subrow bg-gray-50/80 dark:bg-gray-800/40 border-b border-gray-200/60 dark:border-gray-700/80"
                      >
                        <td className={`${tdServicoColCls} text-left ${paddingServicoColCls(indentLevel)}`}>
                          {sintetica ? (
                            <ComposicaoResumoNomeCell nome={sub.nome} />
                          ) : (
                            <SubServicoNomeCell
                              sub={sub}
                              onPatch={(nome) => patchSubServico(linha.servicoKey, sub.id, { nome })}
                              onRemove={() => removerSubServico(linha.servicoKey, sub.id)}
                            />
                          )}
                        </td>
                        <CelulasEtapaCronograma
                          resolvido={subResolvido}
                          status={subStatus}
                          readOnly={false}
                          ariaPrefix={sub.nome}
                          onPatch={(patch) => {
                            if (sintetica && blocoKey && sub.composicaoChave) {
                              patchComposicaoEtapa(blocoKey, sub.composicaoChave, patch);
                              return;
                            }
                            patchSubServico(linha.servicoKey, sub.id, patch);
                          }}
                        />
                      </tr>
                    );
                  };

                  if (!usaHierarquia) {
                    if (subs.length === 0) return [linhaServico];
                    const subsOrdenados = ordenarSubServicosSequenciaObra(subs);
                    return [
                      linhaServico,
                      ...subsOrdenados.map((sub, idx) =>
                        renderLinhaSub(sub, idx, subsOrdenados.length, 1)
                      )
                    ];
                  }

                  const rows: React.ReactElement[] = [linhaServico];

                  for (const st of subtitulosVisiveis) {
                    const subsDoBloco = ordenarSubServicosSequenciaObra(
                      subsPorBloco.get(st.blocoKey) ?? []
                    );
                    const etapasBloco = listarEtapasCronogramaBloco(st, subsDoBloco);
                    const blocoResolvido = resolverDadosCronogramaBloco(
                      cronograma,
                      st.blocoKey,
                      etapasBloco,
                      linha.servicoKey
                    );
                    const blocoStatus = calcularStatusCronograma(blocoResolvido);
                    const blocoComFilhas = etapasBloco.length > 0;

                    rows.push(
                      <tr
                        key={`${st.blocoKey}::cabecalho`}
                        className="border-b border-gray-200/90 bg-slate-200/90 dark:border-gray-800 dark:bg-gray-900"
                      >
                        <td className={`${tdServicoColCls} text-left pl-6`}>
                          <div className="flex min-h-[2rem] items-center gap-1">
                            <span className="flex-1 text-xs font-semibold uppercase tracking-wide text-gray-800 dark:text-gray-200 whitespace-nowrap">
                              {st.subtituloNome}
                            </span>
                            {gerandoBlocoKey === st.blocoKey ? (
                              <Loader2
                                className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-500"
                                aria-hidden
                              />
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={() => adicionarSubServico(linha.servicoKey, st.blocoKey)}
                                  className="shrink-0 rounded p-1 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400"
                                  title="Adicionar subserviço neste subtítulo"
                                  aria-label={`Adicionar subserviço — ${st.subtituloNome}`}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => regerarSubServicosBloco(linha, st)}
                                  className="shrink-0 rounded p-1 text-gray-500 hover:text-violet-600 dark:text-gray-400 dark:hover:text-violet-400"
                                  title="Regenerar etapas com IA"
                                  aria-label={`Regenerar etapas — ${st.subtituloNome}`}
                                >
                                  <RefreshCw className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                        <CelulasEtapaCronograma
                          resolvido={blocoResolvido}
                          status={blocoStatus}
                          readOnly={blocoComFilhas}
                          ariaPrefix={st.subtituloNome}
                          onPatch={() => {}}
                        />
                      </tr>
                    );

                    etapasBloco.forEach((sub, idx) => {
                      rows.push(renderLinhaSub(sub, idx, etapasBloco.length, 2, st.blocoKey));
                    });
                  }

                  return rows;
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
