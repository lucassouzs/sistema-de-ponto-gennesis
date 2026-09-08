'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import {
  type CronogramaDesvioTimeline,
  type CronogramaTimelineLinha,
  type CronogramaTimelineZoom
} from './orcamentoCronogramaCalc';
import {
  calcularStatusCronograma,
  type CronogramaItemData
} from './orcamentoCronogramaTypes';
import { DatePickerField } from '@/components/ui/DatePickerField';

export const TIMELINE_ROW_HEIGHT_PX = 40;

const EDITOR_PANEL_W = 304;
const EDITOR_PANEL_MAX_H = 420;

export type TimelineEtapaEditorTarget = {
  row: CronogramaTimelineLinha;
  anchorEl: HTMLElement;
};

type TimelineEtapaEditorProps = {
  target: TimelineEtapaEditorTarget;
  onClose: () => void;
  onPatchDados: (row: CronogramaTimelineLinha, patch: Partial<CronogramaItemData>) => void;
};

export function TimelineEtapaEditor({
  target,
  onClose,
  onPatchDados
}: TimelineEtapaEditorProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { row, anchorEl } = target;
  const status = calcularStatusCronograma(row.dados);
  const [coords, setCoords] = useState({ left: 0, top: 0 });

  const updatePosition = useCallback(() => {
    if (!anchorEl.isConnected) {
      onClose();
      return;
    }
    const rect = anchorEl.getBoundingClientRect();
    const gap = 8;
    let left = rect.right + gap;
    if (left + EDITOR_PANEL_W > window.innerWidth - 8) {
      left = rect.left - EDITOR_PANEL_W - gap;
    }
    if (left < 8) {
      left = Math.max(8, Math.min(rect.left, window.innerWidth - EDITOR_PANEL_W - 8));
    }

    let top = rect.top;
    if (top + EDITOR_PANEL_MAX_H > window.innerHeight - 8) {
      top = Math.max(8, window.innerHeight - EDITOR_PANEL_MAX_H - 8);
    }
    top = Math.max(8, top);
    setCoords({ left, top });
  }, [anchorEl, onClose]);

  useEffect(() => {
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [updatePosition]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorEl.contains(t)) return;
      if (t instanceof Element && t.closest('[role="dialog"][aria-label="Calendário"]')) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [onClose, anchorEl]);

  const panel = (
    <div
      ref={panelRef}
      className="fixed z-[200] w-[19rem] rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-900"
      style={{ left: coords.left, top: coords.top }}
      role="dialog"
      aria-label={`Editar etapa — ${row.label}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-gray-900 dark:text-gray-100">{row.label}</p>
          <p className="text-[10px] text-gray-500 dark:text-gray-400">Clique na barra para editar execução</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-200"
          aria-label="Fechar"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-500 dark:text-gray-400">
              Início plan.
            </span>
            <DatePickerField
              size="table"
              value={row.dados.dataInicio ?? ''}
              onChange={(v) => onPatchDados(row, { dataInicio: v })}
              placeholder="dd/mm/aaaa"
              aria-label={`Início plan. — ${row.label}`}
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-500 dark:text-gray-400">
              Fim plan.
            </span>
            <DatePickerField
              size="table"
              value={row.dados.dataFim ?? ''}
              onChange={(v) => onPatchDados(row, { dataFim: v })}
              placeholder="dd/mm/aaaa"
              aria-label={`Fim plan. — ${row.label}`}
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-500 dark:text-gray-400">
              Início real
            </span>
            <DatePickerField
              size="table"
              value={row.dados.dataInicioReal ?? ''}
              onChange={(v) => onPatchDados(row, { dataInicioReal: v })}
              placeholder="dd/mm/aaaa"
              aria-label={`Início real — ${row.label}`}
            />
          </label>
          <label className="block">
            <span className="mb-0.5 block text-[10px] font-medium text-gray-500 dark:text-gray-400">
              Fim real
            </span>
            <DatePickerField
              size="table"
              value={row.dados.dataFimReal ?? ''}
              onChange={(v) => onPatchDados(row, { dataFimReal: v })}
              placeholder="dd/mm/aaaa"
              aria-label={`Fim real — ${row.label}`}
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-0.5 block text-[10px] font-medium text-gray-500 dark:text-gray-400">
            % executado
          </span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={row.dados.percentualExecutado ?? ''}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw.trim() === '') {
                onPatchDados(row, { percentualExecutado: undefined });
                return;
              }
              const n = Number(raw);
              if (Number.isFinite(n)) {
                onPatchDados(row, { percentualExecutado: Math.min(100, Math.max(0, Math.round(n))) });
              }
            }}
            className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs tabular-nums text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>

        <label className="block">
          <span className="mb-0.5 block text-[10px] font-medium text-gray-500 dark:text-gray-400">
            Observação {status === 'atrasado' ? '(motivo do atraso)' : ''}
          </span>
          <textarea
            value={row.dados.observacao ?? ''}
            onChange={(e) => onPatchDados(row, { observacao: e.target.value })}
            rows={2}
            placeholder={status === 'atrasado' ? 'Ex.: chuva, falta de material…' : 'Comentário da etapa…'}
            className="w-full resize-y rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </label>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(panel, document.body);
}

export function TimelineZoomControls({
  zoom,
  panOffset,
  onZoomChange,
  onPanChange
}: {
  zoom: CronogramaTimelineZoom;
  panOffset: number;
  onZoomChange: (z: CronogramaTimelineZoom) => void;
  onPanChange: (delta: number) => void;
}) {
  const btnCls = (active: boolean) =>
    `px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
      active
        ? 'bg-red-600 text-white'
        : 'text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700'
    }`;

  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-100/80 p-0.5 dark:border-gray-600 dark:bg-gray-800/70">
      <button type="button" className={btnCls(zoom === 'semana')} onClick={() => onZoomChange('semana')}>
        Semana
      </button>
      <button type="button" className={btnCls(zoom === 'mes')} onClick={() => onZoomChange('mes')}>
        Mês
      </button>
      <button type="button" className={btnCls(zoom === 'obra')} onClick={() => onZoomChange('obra')}>
        Obra
      </button>
      {zoom !== 'obra' ? (
        <>
          <span className="mx-0.5 h-4 w-px bg-gray-300 dark:bg-gray-600" aria-hidden />
          <button
            type="button"
            onClick={() => onPanChange(-1)}
            className="rounded-md px-1.5 py-1 text-[10px] font-semibold text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700"
            title={zoom === 'semana' ? 'Semana anterior' : 'Mês anterior'}
          >
            ←
          </button>
          <button
            type="button"
            onClick={() => onPanChange(1)}
            className="rounded-md px-1.5 py-1 text-[10px] font-semibold text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700"
            title={zoom === 'semana' ? 'Próxima semana' : 'Próximo mês'}
          >
            →
          </button>
          {panOffset !== 0 ? (
            <button
              type="button"
              onClick={() => onPanChange(-panOffset)}
              className="rounded-md px-1.5 py-1 text-[10px] text-gray-500 hover:bg-white dark:text-gray-400 dark:hover:bg-gray-700"
              title="Voltar ao período atual"
            >
              Hoje
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

type BarraPos = { leftPct: number; widthPct: number };

export function TimelineDesvioVisual({
  barPlan,
  barReal,
  desvio,
  rowHeightPx = TIMELINE_ROW_HEIGHT_PX
}: {
  barPlan: BarraPos;
  barReal: BarraPos;
  desvio: CronogramaDesvioTimeline;
  rowHeightPx?: number;
}) {
  if (!desvio.temDesvio) return null;

  const planLeft = barPlan.leftPct;
  const planRight = barPlan.leftPct + barPlan.widthPct;
  const realLeft = barReal.leftPct;
  const realRight = barReal.leftPct + barReal.widthPct;
  const yTrilho = rowHeightPx * 0.72;
  const yFaixa = rowHeightPx - 5;

  const fimAtraso = (desvio.desvioFimDias ?? 0) > 0;
  const iniAtraso = (desvio.desvioInicioDias ?? 0) > 0;

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1]"
      viewBox={`0 0 100 ${rowHeightPx}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      {desvio.desvioFimDias !== null && desvio.desvioFimDias !== 0 && Math.abs(planRight - realRight) > 0.15 ? (
        <>
          <rect
            x={Math.min(planRight, realRight)}
            y={yFaixa - 2}
            width={Math.abs(realRight - planRight)}
            height={3.5}
            rx={0.8}
            className={fimAtraso ? 'fill-red-500/35 dark:fill-red-400/40' : 'fill-green-500/35 dark:fill-green-400/40'}
          />
          <line
            x1={planRight}
            y1={yTrilho}
            x2={realRight}
            y2={yTrilho}
            vectorEffect="non-scaling-stroke"
            strokeWidth={1.25}
            className={fimAtraso ? 'stroke-red-500/75 dark:stroke-red-400/85' : 'stroke-green-500/75 dark:stroke-green-400/85'}
          />
        </>
      ) : null}
      {desvio.desvioInicioDias !== null &&
      desvio.desvioInicioDias !== 0 &&
      Math.abs(planLeft - realLeft) > 0.15 ? (
        <>
          <rect
            x={Math.min(planLeft, realLeft)}
            y={yFaixa - 2}
            width={Math.abs(realLeft - planLeft)}
            height={3.5}
            rx={0.8}
            className={iniAtraso ? 'fill-amber-500/30 dark:fill-amber-400/35' : 'fill-green-500/30 dark:fill-green-400/35'}
          />
          <line
            x1={planLeft}
            y1={yTrilho - 4}
            x2={realLeft}
            y2={yTrilho - 4}
            vectorEffect="non-scaling-stroke"
            strokeWidth={1.25}
            className={iniAtraso ? 'stroke-amber-500/70 dark:stroke-amber-400/80' : 'stroke-green-500/70 dark:stroke-green-400/80'}
          />
        </>
      ) : null}
    </svg>
  );
}
