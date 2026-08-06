import type { DpTimelineStep } from '@/lib/dpRequestTimeline';
import {
  TOOL_RENTAL_STATUS_LABELS,
  type ToolRentalRequestStatus,
} from '@/lib/toolRentalLabels';

export type ToolRentalTimelineEvent = {
  id: string;
  fromStatus?: ToolRentalRequestStatus | null;
  toStatus: ToolRentalRequestStatus;
  note?: string | null;
  createdAt: string;
  actor?: { id: string; name: string } | null;
};

type TimelineRequest = {
  status: ToolRentalRequestStatus | string;
  createdAt?: string;
  updatedAt?: string;
  suppliesApprovedAt?: string | null;
  suppliesApprovalComment?: string | null;
  suppliesRejectionReason?: string | null;
  events?: ToolRentalTimelineEvent[] | null;
  createdBy?: { id: string; name: string } | null;
  suppliesApprovedBy?: { id: string; name: string } | null;
};

const TERMINAL: ReadonlySet<string> = new Set(['COMPLETED', 'REJECTED', 'CANCELLED']);

export function formatToolRentalDuration(ms: number): string {
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

function statusLabel(status: string): string {
  return TOOL_RENTAL_STATUS_LABELS[status as ToolRentalRequestStatus] ?? status;
}

function noteForInferredTransition(r: TimelineRequest): string | undefined {
  if (r.status === 'REJECTED') {
    return r.suppliesRejectionReason || 'Solicitação rejeitada';
  }
  if (r.status === 'SUPPLIER_RELATION') {
    return r.suppliesApprovalComment || 'Encaminhada para Relação com o Fornecedor';
  }
  if (r.status === 'AWAITING_PAYMENT') {
    return 'Espelho da OC anexado — aguardando pagamento';
  }
  if (r.status === 'COMPLETED') {
    return 'Comprovante de pagamento anexado — solicitação finalizada';
  }
  if (r.status === 'CANCELLED') {
    return 'Solicitação cancelada';
  }
  return undefined;
}

function inferredTransitionAt(r: TimelineRequest, fallbackFrom: number, now: number): number {
  const candidates = [r.suppliesApprovedAt, r.updatedAt]
    .filter(Boolean)
    .map((v) => new Date(v as string).getTime())
    .filter((t) => Number.isFinite(t) && t >= fallbackFrom);
  if (candidates.length > 0) return Math.min(...candidates);
  return now;
}

/**
 * Se o status atual está à frente do último evento (histórico incompleto),
 * sintetiza a transição faltante para a timeline não ficar presa em "Aberta".
 */
function withInferredCurrentStatus(
  r: TimelineRequest,
  events: ToolRentalTimelineEvent[],
  now: number
): ToolRentalTimelineEvent[] {
  if (events.length === 0) return events;
  const last = events[events.length - 1];
  if (last.toStatus === r.status) return events;

  const fromMs = new Date(last.createdAt).getTime();
  const atMs = inferredTransitionAt(r, fromMs, now);
  const inferred: ToolRentalTimelineEvent = {
    id: `inferred-${last.id}-${r.status}`,
    fromStatus: last.toStatus as ToolRentalRequestStatus,
    toStatus: r.status as ToolRentalRequestStatus,
    note: noteForInferredTransition(r) ?? null,
    createdAt: new Date(atMs).toISOString(),
    actor: r.suppliesApprovedBy || r.createdBy || null,
  };
  return [...events, inferred];
}

function buildLegacyTimeline(
  r: TimelineRequest,
  now: number,
  mapLead: (from: number, to: number) => string
): DpTimelineStep[] {
  const created = r.createdAt ? new Date(r.createdAt).getTime() : now;
  const isTerminal = TERMINAL.has(r.status);
  const transitionAt = inferredTransitionAt(r, created, now);

  const steps: DpTimelineStep[] = [
    {
      key: 'created',
      title: 'Criação da solicitação',
      from: created,
      to: created,
      done: true,
      isOngoing: false,
      leadTime: mapLead(created, created),
      actorName: r.createdBy?.name,
    },
  ];

  if (r.status === 'OPEN') {
    steps.push({
      key: `ongoing-OPEN`,
      title: statusLabel('OPEN'),
      from: created,
      to: now,
      done: false,
      isOngoing: true,
      leadTime: mapLead(created, now),
    });
    return steps;
  }

  steps.push({
    key: `phase-OPEN`,
    title: statusLabel('OPEN'),
    from: created,
    to: transitionAt,
    done: true,
    isOngoing: false,
    leadTime: mapLead(created, transitionAt),
    note: noteForInferredTransition(r),
    actorName: r.suppliesApprovedBy?.name || r.createdBy?.name,
  });

  if (isTerminal) {
    steps.push({
      key: `status-${r.status}`,
      title: statusLabel(r.status),
      from: transitionAt,
      to: transitionAt,
      done: true,
      isOngoing: false,
      leadTime: mapLead(transitionAt, transitionAt),
    });
    return steps;
  }

  steps.push({
    key: `ongoing-${r.status}`,
    title: statusLabel(r.status),
    from: transitionAt,
    to: now,
    done: false,
    isOngoing: true,
    leadTime: mapLead(transitionAt, now),
  });
  return steps;
}

/**
 * Timeline a partir de `events` (uma linha por mudança de status),
 * com tempo em cada etapa, responsável e observação.
 */
export function buildToolRentalTimeline(r: TimelineRequest): DpTimelineStep[] {
  const now = Date.now();
  const mapLead = (from: number, to: number) => formatToolRentalDuration(Math.max(0, to - from));
  const rawEvents = Array.isArray(r.events) ? r.events : [];

  if (rawEvents.length === 0) {
    return buildLegacyTimeline(r, now, mapLead);
  }

  const events = withInferredCurrentStatus(r, rawEvents, now);
  const steps: DpTimelineStep[] = [];
  const first = events[0];
  const t0 = new Date(first.createdAt).getTime();

  steps.push({
    key: `ev-${first.id}-created`,
    title: 'Criação da solicitação',
    from: t0,
    to: t0,
    done: true,
    isOngoing: false,
    leadTime: mapLead(t0, t0),
    note: first.note || undefined,
    actorName: first.actor?.name || r.createdBy?.name,
  });

  if (events.length === 1) {
    if (!TERMINAL.has(r.status)) {
      steps.push({
        key: `ongoing-${r.status}`,
        title: statusLabel(r.status),
        from: t0,
        to: now,
        done: false,
        isOngoing: true,
        leadTime: mapLead(t0, now),
      });
    } else if (first.toStatus !== 'OPEN') {
      steps.push({
        key: `ev-${first.id}-terminal`,
        title: statusLabel(first.toStatus),
        from: t0,
        to: t0,
        done: true,
        isOngoing: false,
        leadTime: mapLead(t0, t0),
        note: first.note || undefined,
        actorName: first.actor?.name,
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
      title: statusLabel(prev.toStatus),
      from: tPrev,
      to: tCur,
      done: true,
      isOngoing: false,
      leadTime: mapLead(tPrev, tCur),
      note: cur.note || undefined,
      actorName: cur.actor?.name,
    });

    if (TERMINAL.has(cur.toStatus)) {
      steps.push({
        key: `ev-${cur.id}-terminal-${cur.toStatus}`,
        title: statusLabel(cur.toStatus),
        from: tCur,
        to: tCur,
        done: true,
        isOngoing: false,
        leadTime: mapLead(tCur, tCur),
      });
      continue;
    }

    if (isLast && r.status === cur.toStatus) {
      steps.push({
        key: `ongoing-${cur.toStatus}`,
        title: statusLabel(cur.toStatus),
        from: tCur,
        to: now,
        done: false,
        isOngoing: true,
        leadTime: mapLead(tCur, now),
      });
    }
  }

  return steps;
}
