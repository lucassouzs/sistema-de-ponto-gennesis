'use client';

import React, { useState } from 'react';
import { Activity, AlertTriangle, CalendarCheck, ClipboardList, Download, Eye, Loader2, Paperclip, Timer, Wrench, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { exportGestaoOsPdf, gestaoOsPdfFileName, openGestaoOsPdf } from '@/lib/exportGestaoOsPdf';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import { AppModalTabButton } from '@/components/ui/AppTabButton';
import { useModalRequestClose } from '@/components/ui/Modal';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { OcAttachmentActions } from '@/components/oc/OcAttachmentActions';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import type { DpTimelineStep } from '@/lib/dpRequestTimeline';
import {
  type GestaoOsAttachment,
  type GestaoOsChecklistResponseItem,
  type GestaoOsMaintenanceType,
  type GestaoOsPriority,
  type GestaoOsStatus,
  type GestaoOsWorkOrder,
  GESTAO_OS_SLA_BADGE,
  GESTAO_OS_SLA_LABEL,
  PRIORITY_LABELS,
  MAINTENANCE_TYPE_LABELS,
  STATUS_LABELS,
  formatGestaoOsLabel,
  formatGestaoOsDuration,
  liveGestaoOsExecutionMs,
  warrantyState,
  gestaoOsSlaState,
  gestaoOsStatusBadgeClass
} from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';

export const GESTAO_OS_FORM_LABEL_CLS =
  'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300';

export type GestaoOsTechnicianOption = {
  id: string;
  name: string;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
};

function formatGestaoOsCpf(cpf?: string | null) {
  const digits = (cpf || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf?.trim() || '—';
}

export function gestaoOsTechnicianSelectOptions(
  technicians: GestaoOsTechnicianOption[]
): MultiSelectSearchOption[] {
  return technicians.map((tech) => {
    const initials = tech.name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const cpfLabel = formatGestaoOsCpf(tech.cpf);
    return {
      value: tech.id,
      label: tech.name,
      description: cpfLabel,
      searchText: `${tech.name} ${tech.cpf || ''} ${cpfLabel}`,
      avatarUrl: resolveApiMediaUrl(tech.profilePhotoUrl ?? null),
      avatarFallback: initials || '?'
    };
  });
}

export const PRIORITY_TEXT_CLS: Record<GestaoOsPriority, string> = {
  LOW: 'text-slate-600 dark:text-slate-300',
  MEDIUM: 'text-sky-700 dark:text-sky-300',
  HIGH: 'text-orange-700 dark:text-orange-300',
  URGENT: 'text-rose-700 font-semibold dark:text-rose-300'
};

export function GestaoOsRequiredMark() {
  return <span className="ml-0.5 text-red-600 dark:text-red-400">*</span>;
}

export function GestaoOsDetailSection({
  title,
  description,
  children
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
        <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
          {title}
        </h3>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function GestaoOsInfoList({
  rows
}: {
  rows: Array<{ label: string; value: React.ReactNode; stacked?: boolean }>;
}) {
  return (
    <dl className="divide-y divide-gray-200 dark:divide-gray-700">
      {rows.map((row) => (
        <div
          key={row.label}
          className={
            row.stacked
              ? 'flex flex-col gap-1.5 py-3'
              : 'flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6'
          }
        >
          <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
            {row.label}
          </dt>
          <dd
            className={
              row.stacked
                ? 'min-w-0 text-left text-sm text-gray-900 dark:text-gray-100'
                : 'min-w-0 text-sm text-gray-900 dark:text-gray-100 sm:text-right'
            }
          >
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function GestaoOsChecklistField({
  items,
  onToggle,
  readOnly = false
}: {
  items: GestaoOsChecklistResponseItem[];
  onToggle?: (index: number, checked: boolean) => void;
  readOnly?: boolean;
}) {
  const done = items.filter((item) => item.checked).length;
  const locked = readOnly || !onToggle;

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        {done} de {items.length} {items.length === 1 ? 'item' : 'itens'}{' '}
        {done === 1 ? 'concluído' : 'concluídos'}
      </p>
      <ul className="space-y-2">
        {items.map((item, idx) => (
          <li
            key={item.id || `${item.label}-${idx}`}
            className="rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900/40"
          >
            <label
              className={`group flex items-start gap-3 ${
                locked ? 'cursor-default' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={!!item.checked}
                disabled={locked}
                onChange={(e) => onToggle?.(idx, e.target.checked)}
              />
              <CheckboxIndicator
                checked={!!item.checked}
                disabled={locked}
                className="mt-0.5"
              />
              <span className="min-w-0 text-sm leading-snug text-gray-800 dark:text-gray-200">
                {item.label}
                {item.required ? (
                  <span className="ml-1 text-xs font-semibold text-red-600 dark:text-red-400">
                    *
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function GestaoOsAttachmentPills({ files }: { files: GestaoOsAttachment[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file) => (
        <a
          key={file.url}
          href={resolveApiMediaUrl(file.url) ?? '#'}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-red-300 hover:text-red-700 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-200 dark:hover:border-red-800 dark:hover:text-red-300"
        >
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{file.name}</span>
        </a>
      ))}
    </div>
  );
}

function GestaoOsDocSection({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-0 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="border-b border-gray-200 pb-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
          {title}
        </h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">{children}</div>
    </section>
  );
}

function GestaoOsDocumentItem({
  label,
  subtitle,
  url,
  fileName,
  pending = false,
  onView,
  onDownload,
}: {
  label: string;
  subtitle?: string;
  url?: string | null;
  fileName?: string | null;
  pending?: boolean;
  onView?: () => void | Promise<void>;
  onDownload?: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState<'view' | 'download' | null>(null);
  const trimmedUrl = (url || '').trim();
  const hasGeneratedActions = Boolean(onView || onDownload);
  const isPending = pending || (!hasGeneratedActions && !trimmedUrl);
  const actionBtnCls =
    'inline-flex items-center justify-center rounded-md p-1.5 text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300';

  const runAction = async (kind: 'view' | 'download', action?: () => void | Promise<void>) => {
    if (!action) return;
    setBusy(kind);
    try {
      await action();
    } catch {
      toast.error(kind === 'view' ? 'Não foi possível abrir o PDF.' : 'Não foi possível baixar o PDF.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-3 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isPending ? (
          <span className="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            Pendente
          </span>
        ) : hasGeneratedActions ? (
          <>
            {onView ? (
              <button
                type="button"
                onClick={() => void runAction('view', onView)}
                disabled={busy != null}
                title="Ver"
                aria-label={`Ver ${fileName || label}`}
                className={actionBtnCls}
              >
                {busy === 'view' ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <Eye className="h-5 w-5 shrink-0" />
                )}
              </button>
            ) : null}
            {onDownload ? (
              <button
                type="button"
                onClick={() => void runAction('download', onDownload)}
                disabled={busy != null}
                title="Baixar"
                aria-label={`Baixar ${fileName || label}`}
                className={actionBtnCls}
              >
                {busy === 'download' ? (
                  <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
                ) : (
                  <Download className="h-5 w-5 shrink-0" />
                )}
              </button>
            ) : null}
          </>
        ) : (
          <OcAttachmentActions
            url={trimmedUrl}
            fileName={fileName || label}
            variant="buttons"
          />
        )}
      </div>
    </div>
  );
}

export function GestaoOsDocumentsTab({ detail }: { detail: GestaoOsWorkOrder }) {
  const files = Array.isArray(detail.attachments) ? detail.attachments : [];
  const hasSignatures = Boolean(detail.signatureRequesterUrl || detail.signatureTechnicianUrl);
  const hasSafetyPhoto = Boolean(detail.safetyPhotoUrl);
  const hasStartPhoto = Boolean(detail.startPhotoUrl);
  const hasEndPhoto = Boolean(detail.endPhotoUrl);
  const pdfName = gestaoOsPdfFileName(detail);

  return (
    <div className="space-y-4">
      <GestaoOsDocSection title="Anexos">
        <GestaoOsDocumentItem
          label="PDF"
          subtitle={pdfName}
          fileName={pdfName}
          onView={() => openGestaoOsPdf(detail)}
          onDownload={() => exportGestaoOsPdf(detail)}
        />
        {files.map((file, index) => (
          <GestaoOsDocumentItem
            key={file.url}
            label={files.length > 1 ? `Arquivo ${index + 1}` : 'Arquivo'}
            subtitle={file.name || 'Anexo'}
            url={file.url}
            fileName={file.name}
          />
        ))}
      </GestaoOsDocSection>

      {hasSafetyPhoto || hasStartPhoto || hasEndPhoto ? (
        <GestaoOsDocSection title="Registros fotográficos">
          {hasSafetyPhoto ? (
            <GestaoOsDocumentItem
              label="Foto de EPIs"
              subtitle="Equipamentos de proteção"
              url={detail.safetyPhotoUrl ?? undefined}
              fileName="foto-epis.jpg"
            />
          ) : null}
          {hasStartPhoto ? (
            <GestaoOsDocumentItem
              label="Início da execução"
              subtitle="Foto de campo"
              url={detail.startPhotoUrl ?? undefined}
              fileName="foto-inicio.jpg"
            />
          ) : null}
          {hasEndPhoto ? (
            <GestaoOsDocumentItem
              label="Conclusão"
              subtitle="Foto de campo"
              url={detail.endPhotoUrl ?? undefined}
              fileName="foto-conclusao.jpg"
            />
          ) : null}
        </GestaoOsDocSection>
      ) : null}

      {hasSignatures ? (
        <GestaoOsDocSection title="Assinaturas">
          {detail.signatureRequesterUrl ? (
            <GestaoOsDocumentItem
              label="Solicitante"
              subtitle="Assinatura"
              url={detail.signatureRequesterUrl}
              fileName="assinatura-solicitante.png"
            />
          ) : null}
          {detail.signatureTechnicianUrl ? (
            <GestaoOsDocumentItem
              label="Técnico"
              subtitle="Assinatura"
              url={detail.signatureTechnicianUrl}
              fileName="assinatura-tecnico.png"
            />
          ) : null}
        </GestaoOsDocSection>
      ) : null}
    </div>
  );
}

const GESTAO_OS_TERMINAL = new Set(['CLOSED', 'CANCELLED']);

function formatGestaoOsLeadTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0 min';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}min`);
  return parts.join(' ');
}

function gestaoOsEventNote(note?: string | null): string | undefined {
  const text = note?.trim();
  if (!text || text === 'Chamado aberto') return undefined;
  return text;
}

function buildGestaoOsTimeline(
  events: NonNullable<GestaoOsWorkOrder['events']>,
  status: GestaoOsWorkOrder['status']
): DpTimelineStep[] {
  const now = Date.now();
  const mapLead = (from: number, to: number) => formatGestaoOsLeadTime(Math.max(0, to - from));
  if (events.length === 0) return [];

  const steps: DpTimelineStep[] = [];
  const first = events[0];
  const t0 = new Date(first.createdAt).getTime();

  steps.push({
    key: `ev-${first.id}-created`,
    title: 'Abertura do chamado',
    from: t0,
    to: t0,
    done: true,
    isOngoing: false,
    leadTime: mapLead(t0, t0),
    note: gestaoOsEventNote(first.note),
    actorName: first.actor?.name
  });

  if (events.length === 1) {
    if (!GESTAO_OS_TERMINAL.has(status)) {
      steps.push({
        key: `ongoing-${status}`,
        title: STATUS_LABELS[status] ?? status,
        from: t0,
        to: now,
        done: false,
        isOngoing: true,
        leadTime: mapLead(t0, now)
      });
    }
    return steps;
  }

  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const cur = events[i];
    const tPrev = new Date(prev.createdAt).getTime();
    const tCur = new Date(cur.createdAt).getTime();
    const isLast = i === events.length - 1;

    steps.push({
      key: `ev-${cur.id}-phase-${prev.toStatus}`,
      title: STATUS_LABELS[prev.toStatus] ?? prev.toStatus,
      from: tPrev,
      to: tCur,
      done: true,
      isOngoing: false,
      leadTime: mapLead(tPrev, tCur),
      note: gestaoOsEventNote(cur.note),
      actorName: cur.actor?.name
    });

    if (GESTAO_OS_TERMINAL.has(cur.toStatus)) {
      steps.push({
        key: `ev-${cur.id}-terminal-${cur.toStatus}`,
        title: STATUS_LABELS[cur.toStatus] ?? cur.toStatus,
        from: tCur,
        to: tCur,
        done: true,
        isOngoing: false,
        leadTime: mapLead(tCur, tCur)
      });
      continue;
    }

    if (isLast) {
      steps.push({
        key: `ongoing-${cur.toStatus}`,
        title: STATUS_LABELS[cur.toStatus] ?? cur.toStatus,
        from: tCur,
        to: now,
        done: false,
        isOngoing: true,
        leadTime: mapLead(tCur, now)
      });
    }
  }

  return steps;
}

function stripResponsibleFromNote(note: string) {
  return note
    .split(/\r?\n/)
    .filter((line) => !/^\s*respons[aá]vel\s*:/i.test(line))
    .join('\n')
    .trim();
}

function GestaoOsTimelineField({
  label,
  children
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100 sm:text-right">
        {children}
      </dd>
    </div>
  );
}

export function GestaoOsHistoryList({
  events,
  status,
  formatDateTime
}: {
  events: NonNullable<GestaoOsWorkOrder['events']>;
  status: GestaoOsWorkOrder['status'];
  formatDateTime: (value: string | null | undefined) => string;
}) {
  const steps = buildGestaoOsTimeline(events, status);
  const badgeBase =
    'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap';

  return (
    <div className="space-y-4">
      {steps.map((step) => {
        const note = stripResponsibleFromNote(step.note || '');
        const sameInstant = step.from === step.to;
        const badge = step.isOngoing
          ? `${badgeBase} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200`
          : sameInstant
            ? null
            : `${badgeBase} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300`;
        const badgeLabel = step.isOngoing ? 'Em andamento' : step.leadTime;

        return (
          <section
            key={step.key}
            className="rounded-xl border border-gray-200 p-4 dark:border-gray-700"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
                {step.title}
              </h3>
              {badge ? (
                <span className={badge} title={badgeLabel}>
                  {badgeLabel}
                </span>
              ) : null}
            </div>
            <dl className="divide-y divide-gray-200 dark:divide-gray-700">
              {sameInstant ? (
                <GestaoOsTimelineField label="Data">
                  {formatDateTime(new Date(step.from).toISOString())}
                </GestaoOsTimelineField>
              ) : (
                <>
                  <GestaoOsTimelineField label="Início">
                    {formatDateTime(new Date(step.from).toISOString())}
                  </GestaoOsTimelineField>
                  <GestaoOsTimelineField label="Término">
                    {step.isOngoing
                      ? 'Em andamento'
                      : formatDateTime(new Date(step.to).toISOString())}
                  </GestaoOsTimelineField>
                </>
              )}
              {step.actorName ? (
                <GestaoOsTimelineField label="Responsável">{step.actorName}</GestaoOsTimelineField>
              ) : null}
              {note ? <GestaoOsTimelineField label="Obs.">{note}</GestaoOsTimelineField> : null}
            </dl>
          </section>
        );
      })}
    </div>
  );
}

export function GestaoOsModalFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-6 -mb-6 mt-6 flex items-center justify-end gap-2 border-t border-gray-200 px-6 py-4 dark:border-gray-700">
      {children}
    </div>
  );
}

export function GestaoOsEmptyTab({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">{children}</p>
  );
}

export type GestaoOsAssetHistory = {
  asset: {
    id: string;
    name: string;
    category: string | null;
    code: string | null;
    warrantyEndsAt?: string | null;
  };
  totalOrders: number;
  recurrence90dCount?: number;
  correctiveCount: number;
  preventiveCount: number;
  openCount: number;
  mtbfHours: number | null;
  lastPreventive: {
    id: string;
    displayNumber: number;
    osNumber: number | null;
    openedAt: string;
    completedAt: string | null;
  } | null;
  recent?: Array<{
    id: string;
    displayNumber: number;
    osNumber: number | null;
    status: GestaoOsStatus;
    maintenanceType: GestaoOsMaintenanceType | null;
    category: string;
    openedAt: string;
  }>;
};

function formatMtbf(hours: number | null) {
  if (hours == null) {
    return { value: '—', hint: 'Com 2+ corretivas' };
  }
  if (hours >= 48) {
    const days = Math.round((hours / 24) * 10) / 10;
    return {
      value: `${String(days).replace('.', ',')} d`,
      hint: 'Tempo médio entre falhas'
    };
  }
  return {
    value: `${String(hours).replace('.', ',')} h`,
    hint: 'Tempo médio entre falhas'
  };
}

function formatHistoryDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatHistoryAgo(value: string | null | undefined) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const days = Math.max(0, Math.round((Date.now() - d.getTime()) / 86_400_000));
  if (days === 0) return 'hoje';
  if (days === 1) return 'há 1 dia';
  if (days < 30) return `há ${days} dias`;
  const months = Math.max(1, Math.round(days / 30));
  if (months < 12) return months === 1 ? 'há 1 mês' : `há ${months} meses`;
  const years = Math.max(1, Math.round(days / 365));
  return years === 1 ? 'há 1 ano' : `há ${years} anos`;
}

export function GestaoOsAssetHistoryCard({
  history,
  currentId,
  onOpenWorkOrder
}: {
  history: GestaoOsAssetHistory;
  currentId?: string | null;
  onOpenWorkOrder?: (id: string) => void;
}) {
  const mtbf = formatMtbf(history.mtbfHours);
  const lastPrevAt = history.lastPreventive
    ? history.lastPreventive.completedAt ?? history.lastPreventive.openedAt
    : null;
  const mixTotal = history.correctiveCount + history.preventiveCount;
  const corrPct = mixTotal > 0 ? (history.correctiveCount / mixTotal) * 100 : 0;
  const prevPct = mixTotal > 0 ? (history.preventiveCount / mixTotal) * 100 : 0;
  const recent = (history.recent || []).slice(0, 4);
  const subtitle = [history.asset.name, history.asset.code, history.asset.category]
    .filter(Boolean)
    .join(' · ');
  const warranty = warrantyState(history.asset.warrantyEndsAt);
  const warrantyLabel = history.asset.warrantyEndsAt
    ? new Date(history.asset.warrantyEndsAt).toLocaleDateString('pt-BR')
    : null;

  return (
    <Card className={cadastroListClasses.card}>
      <CardHeader className={cadastroListClasses.cardHeader}>
        <div className={cadastroListClasses.cardHeaderRow}>
          <div className={cadastroListClasses.cardHeaderIconRow}>
            <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
              <Activity className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Histórico do ativo
              </h3>
              <p className="truncate text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
              {warranty && warrantyLabel ? (
                <p
                  className={`mt-0.5 text-xs font-medium ${
                    warranty === 'expired'
                      ? 'text-rose-700 dark:text-rose-300'
                      : warranty === 'expiring'
                        ? 'text-amber-700 dark:text-amber-300'
                        : 'text-emerald-700 dark:text-emerald-300'
                  }`}
                >
                  Garantia {warranty === 'expired' ? 'vencida em' : 'até'} {warrantyLabel}
                </p>
              ) : null}
            </div>
          </div>
          {history.openCount > 0 ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              {history.openCount} aberta{history.openCount === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              Sem OS aberta
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className={cadastroListClasses.cardContent}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FilterStatCard
            label="MTBF"
            count={mtbf.value}
            subtitle={mtbf.hint}
            icon={Timer}
            iconBg="bg-sky-100 dark:bg-sky-900/30"
            iconColor="text-sky-600 dark:text-sky-400"
            size="sm"
          />
          <FilterStatCard
            label="Últ. preventiva"
            count={lastPrevAt ? formatHistoryDate(lastPrevAt) : 'Nunca'}
            subtitle={
              lastPrevAt ? formatHistoryAgo(lastPrevAt) ?? undefined : 'Nenhuma preventiva neste ativo'
            }
            icon={CalendarCheck}
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            iconColor="text-emerald-600 dark:text-emerald-400"
            size="sm"
          />
          <FilterStatCard
            label="Total de OS"
            count={history.totalOrders}
            subtitle={
              history.openCount > 0
                ? `${history.openCount} em andamento`
                : 'Nenhuma em andamento'
            }
            icon={ClipboardList}
            iconBg="bg-red-100 dark:bg-red-900/30"
            iconColor="text-red-600 dark:text-red-400"
            size="sm"
          />
          <FilterStatCard
            label="Corretivas / prev."
            count={`${history.correctiveCount} / ${history.preventiveCount}`}
            subtitle={mixTotal === 0 ? 'Ainda sem mix' : `${Math.round(corrPct)}% corretivas`}
            icon={Wrench}
            iconBg="bg-orange-100 dark:bg-orange-900/30"
            iconColor="text-orange-600 dark:text-orange-400"
            size="sm"
          />
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
            <span>Mix de manutenção</span>
            <span>
              {history.correctiveCount} corret. · {history.preventiveCount} prev.
            </span>
          </div>
          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
            {mixTotal === 0 ? (
              <span className="h-full w-full bg-gray-200 dark:bg-gray-600" />
            ) : (
              <>
                {corrPct > 0 ? (
                  <span
                    className="h-full bg-red-500/80 dark:bg-red-400/80"
                    style={{ width: `${corrPct}%` }}
                  />
                ) : null}
                {prevPct > 0 ? (
                  <span
                    className="h-full bg-emerald-500/80 dark:bg-emerald-400/70"
                    style={{ width: `${prevPct}%` }}
                  />
                ) : null}
              </>
            )}
          </div>
        </div>

        {recent.length > 0 ? (
          <ul className="mt-4 divide-y divide-gray-200 dark:divide-gray-700">
            {recent.map((row) => {
              const current = row.id === currentId;
              const typeLabel = row.maintenanceType
                ? MAINTENANCE_TYPE_LABELS[row.maintenanceType]
                : null;
              const content = (
                <>
                  <span className="min-w-0 truncate font-medium text-gray-800 dark:text-gray-100">
                    {formatGestaoOsLabel(row)}
                    {typeLabel ? (
                      <span className="font-normal text-gray-500 dark:text-gray-400">
                        {' '}
                        · {typeLabel}
                      </span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-gray-500 dark:text-gray-400">
                    <span>{STATUS_LABELS[row.status]}</span>
                    <span className="tabular-nums text-gray-400 dark:text-gray-500">
                      {formatHistoryDate(row.openedAt)}
                    </span>
                  </span>
                </>
              );
              if (!onOpenWorkOrder || current) {
                return (
                  <li
                    key={row.id}
                    className={`flex items-center justify-between gap-3 py-2.5 text-xs ${
                      current ? 'rounded-md bg-red-50/70 px-2 dark:bg-red-950/20' : ''
                    }`}
                  >
                    {content}
                  </li>
                );
              }
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onOpenWorkOrder(row.id)}
                    className="-mx-1 flex w-[calc(100%+0.5rem)] items-center justify-between gap-3 rounded-md px-1 py-2.5 text-left text-xs transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/70"
                  >
                    {content}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function GestaoOsSignaturesBlock({
  requesterUrl,
  technicianUrl
}: {
  requesterUrl?: string | null;
  technicianUrl?: string | null;
}) {
  if (!requesterUrl && !technicianUrl) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {requesterUrl ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Solicitante</p>
          <img
            src={resolveApiMediaUrl(requesterUrl) ?? undefined}
            alt="Assinatura do solicitante"
            className="max-h-28 rounded-lg border border-gray-200 bg-white object-contain dark:border-gray-700"
          />
        </div>
      ) : null}
      {technicianUrl ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">Técnico</p>
          <img
            src={resolveApiMediaUrl(technicianUrl) ?? undefined}
            alt="Assinatura do técnico"
            className="max-h-28 rounded-lg border border-gray-200 bg-white object-contain dark:border-gray-700"
          />
        </div>
      ) : null}
    </div>
  );
}

export function GestaoOsDetailModalChrome({
  title,
  tabs,
  activeTab,
  onTabChange,
  onClose,
  fillBody = false,
  children
}: {
  title: React.ReactNode;
  tabs: Array<{ id: string; label: string }>;
  activeTab: string;
  onTabChange: (id: string) => void;
  onClose: () => void;
  fillBody?: boolean;
  children: React.ReactNode;
}) {
  const requestCloseFromModal = useModalRequestClose();
  const handleClose = requestCloseFromModal ?? onClose;

  return (
    <div
      className={
        fillBody
          ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'
          : 'flex min-h-0 flex-col overflow-hidden'
      }
    >
      <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h2>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
          aria-label="Fechar"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="shrink-0 border-b border-gray-200 px-5 dark:border-gray-700"
        role="tablist"
        aria-label="Seções do chamado"
      >
        <div className="table-scroll -mb-px flex gap-1">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <AppModalTabButton
                key={tab.id}
                active={active}
                onClick={() => onTabChange(tab.id)}
                className="shrink-0 px-3 py-2.5 text-sm"
              >
                {tab.label}
              </AppModalTabButton>
            );
          })}
        </div>
      </div>

      <div
        className={
          fillBody
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-5 pt-4 pb-4'
            : 'min-h-0 flex-1 overflow-y-auto px-5 py-4'
        }
      >
        {children}
      </div>
    </div>
  );
}

export function GestaoOsRecurrenceBanner({
  count,
  predicted
}: {
  count?: number | null;
  predicted?: boolean;
}) {
  const n = Number(count) || 0;
  if (n < 3) return null;
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>
        <span className="font-semibold">
          {predicted ? `Esta será a ${n}ª OS` : `${n}ª OS`} neste ativo em 90 dias.
        </span>{' '}
        Recorrência alta — vale checar causa raiz e o histórico.
      </p>
    </div>
  );
}

export function GestaoOsChamadoResumo({
  detail,
  formatDateTime,
  showRequester = true
}: {
  detail: GestaoOsWorkOrder;
  formatDateTime: (value: string | null | undefined) => string;
  showRequester?: boolean;
}) {
  const slaState = gestaoOsSlaState(detail);

  const infoRows: Array<{ label: string; value: React.ReactNode; stacked?: boolean }> = [
    { label: 'Chamado', value: `#${detail.displayNumber}` },
    {
      label: 'OS',
      value:
        detail.osNumber != null ? (
          `#${detail.osNumber}`
        ) : (
          <span className="text-gray-500 dark:text-gray-400">Ainda não gerada</span>
        )
    },
    {
      label: 'Status',
      value: (
        <span className={gestaoOsStatusBadgeClass(detail.status)}>
          {STATUS_LABELS[detail.status]}
        </span>
      )
    },
    {
      label: 'Prioridade',
      value: (
        <span className={PRIORITY_TEXT_CLS[detail.priority]}>
          {PRIORITY_LABELS[detail.priority]}
        </span>
      )
    },
    { label: 'Categoria', value: detail.category || '—' }
  ];

  if (detail.maintenanceType) {
    infoRows.push({
      label: 'Tipo',
      value: MAINTENANCE_TYPE_LABELS[detail.maintenanceType]
    });
  }

  if (showRequester) {
    infoRows.push({
      label: 'Solicitante',
      value: detail.requester?.name || '—'
    });
  }

  infoRows.push(
    { label: 'Abertura', value: formatDateTime(detail.openedAt) },
    {
      label: 'Responsável',
      value: detail.assignee?.name || (
        <span className="text-gray-500 dark:text-gray-400">Não atribuído</span>
      )
    }
  );

  if (detail.dueAt || slaState || detail.slaHoursApplied != null) {
    infoRows.push({
      label: 'Prazo (SLA)',
      value: (
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
          {detail.dueAt ? <span>{formatDateTime(detail.dueAt)}</span> : null}
          {slaState ? (
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${GESTAO_OS_SLA_BADGE[slaState]}`}
            >
              {GESTAO_OS_SLA_LABEL[slaState]}
            </span>
          ) : null}
          {detail.slaHoursApplied != null ? (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              SLA {detail.slaHoursApplied}h
            </span>
          ) : null}
        </span>
      )
    });
  }

  const executionMs = liveGestaoOsExecutionMs(detail);
  if (executionMs > 0 || detail.startedAt) {
    infoRows.push({
      label: 'Tempo de execução',
      value: (
        <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
          <span>{formatGestaoOsDuration(executionMs)}</span>
          {detail.startedAt ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              início {formatDateTime(detail.startedAt)}
            </span>
          ) : null}
        </span>
      )
    });
  }

  if (detail.relatedWorkOrderId) {
    infoRows.push({
      label: 'OS relacionada',
      value: (
        <span className="font-mono text-xs text-gray-700 dark:text-gray-300">
          {detail.relatedWorkOrderId}
        </span>
      )
    });
  }

  if (detail.parts && detail.parts.length > 0) {
    infoRows.push({
      label: 'Peças',
      value: `${detail.parts.length} item(ns) · ${(
        detail.partsTotalCost ?? 0
      ).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
    });
  }

  if (detail.description?.trim()) {
    infoRows.push({
      label: 'Descrição',
      value: (
        <span className="whitespace-pre-wrap leading-relaxed">{detail.description}</span>
      ),
      stacked: true
    });
  }

  return (
    <div className="space-y-4 text-sm">
      <GestaoOsRecurrenceBanner count={detail.recurrence90dCount} />
      <div className="overflow-hidden">
        <div className="border-b border-gray-200 pb-4 pt-1 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Local / Ativo</p>
          <p className="mt-1 break-words text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-50">
            {detail.locationLabel || '—'}
          </p>
        </div>
        <GestaoOsInfoList rows={infoRows} />
      </div>
    </div>
  );
}
