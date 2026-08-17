'use client';

import React from 'react';
import { Paperclip, X } from 'lucide-react';
import { CheckboxIndicator } from '@/components/ui/Checkbox';
import { useModalRequestClose } from '@/components/ui/Modal';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { OcAttachmentActions } from '@/components/oc/OcAttachmentActions';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { DpRequestHistoryTimeline } from '@/lib/dpRequestHistoryModal';
import type { DpTimelineStep } from '@/lib/dpRequestTimeline';
import {
  type GestaoOsAttachment,
  type GestaoOsChecklistResponseItem,
  type GestaoOsPriority,
  type GestaoOsWorkOrder,
  PRIORITY_LABELS,
  MAINTENANCE_TYPE_LABELS,
  STATUS_LABELS,
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
  pending = false
}: {
  label: string;
  subtitle?: string;
  url?: string | null;
  fileName?: string | null;
  pending?: boolean;
}) {
  const trimmedUrl = (url || '').trim();
  const isPending = pending || !trimmedUrl;

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

  if (files.length === 0 && !hasSignatures && !hasSafetyPhoto) {
    return <GestaoOsEmptyTab>Nenhum documento neste chamado.</GestaoOsEmptyTab>;
  }

  return (
    <div className="space-y-4">
      {files.length > 0 ? (
        <GestaoOsDocSection title="Anexos">
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
      ) : null}

      {hasSafetyPhoto ? (
        <GestaoOsDocSection title="Segurança do Trabalho">
          <GestaoOsDocumentItem
            label="Foto de EPIs"
            subtitle="Equipamentos de proteção"
            url={detail.safetyPhotoUrl ?? undefined}
            fileName="foto-epis.jpg"
          />
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

export function GestaoOsHistoryList({
  events,
  status,
  formatDateTime
}: {
  events: NonNullable<GestaoOsWorkOrder['events']>;
  status: GestaoOsWorkOrder['status'];
  formatDateTime: (value: string | null | undefined) => string;
}) {
  return (
    <DpRequestHistoryTimeline
      steps={buildGestaoOsTimeline(events, status)}
      formatDateTime={(iso) => formatDateTime(iso)}
    />
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
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(tab.id)}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'border-red-500 text-red-600 dark:border-red-400 dark:text-red-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.label}
              </button>
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

export function GestaoOsChamadoResumo({
  detail,
  formatDateTime,
  showRequester = true
}: {
  detail: GestaoOsWorkOrder;
  formatDateTime: (value: string | null | undefined) => string;
  showRequester?: boolean;
}) {
  const dueMs = detail.dueAt ? new Date(detail.dueAt).getTime() : NaN;
  const overdue =
    Number.isFinite(dueMs) &&
    dueMs < Date.now() &&
    detail.status !== 'CLOSED' &&
    detail.status !== 'CANCELLED';

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

  if (detail.dueAt) {
    infoRows.push({
      label: 'Prazo',
      value: (
        <span className={overdue ? 'text-rose-700 dark:text-rose-300' : undefined}>
          {formatDateTime(detail.dueAt)}
          {overdue ? ' · Atrasada' : ''}
        </span>
      )
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
