/**
 * Timeline de solicitações DP: prioriza `statusHistory` (uma linha por mudança de status),
 * com nota e nome de quem registrou quando existirem no JSON.
 */

export type DpTimelineStep = {
  key: string;
  title: string;
  from: number;
  to: number;
  done?: boolean;
  isOngoing?: boolean;
  leadTime: string;
  note?: string;
  actorName?: string;
};

type StatusHistoryEntry = {
  at: string;
  status: string;
  note?: string;
  actorUserId?: string;
  actorName?: string;
};

function parseStatusHistory(raw: unknown): StatusHistoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (e): e is StatusHistoryEntry =>
      e != null &&
      typeof e === 'object' &&
      typeof (e as StatusHistoryEntry).at === 'string' &&
      typeof (e as StatusHistoryEntry).status === 'string'
  );
}

/** Título do período em que a solicitação permaneceu em `prevStatus` (antes da próxima mudança). */
function phaseTitleForStatus(prevStatus: string, statusLabels: Record<string, string>): string {
  if (prevStatus === 'WAITING_MANAGER') {
    return 'Aguardando aprovação do gestor';
  }
  return statusLabels[prevStatus] ?? prevStatus;
}

type TimelineRequest = {
  createdAt: string;
  status: string;
  managerApprovedAt?: string | null;
  dpConcludedAt?: string | null;
  statusHistory?: unknown;
};

/** Registros antigos sem `statusHistory`: mesma lógica resumida de antes. */
function buildLegacyTimeline(
  r: TimelineRequest,
  statusLabels: Record<string, string>,
  formatDuration: (ms: number) => string,
  now: number,
  created: number,
  mapLead: (from: number, to: number) => string
): DpTimelineStep[] {
  const managerApproved = r.managerApprovedAt ? new Date(r.managerApprovedAt).getTime() : null;
  const concludedAt = r.dpConcludedAt ? new Date(r.dpConcludedAt).getTime() : null;
  const isTerminal = r.status === 'CONCLUDED' || r.status === 'CANCELLED';
  const tramEnd = concludedAt ?? now;

  const steps: DpTimelineStep[] = [
    {
      key: 'created',
      title: 'Criação da solicitação',
      from: created,
      to: created,
      done: true,
      isOngoing: false,
      leadTime: mapLead(created, created),
    },
    {
      key: 'manager',
      title: 'Aprovação',
      from: created,
      to: managerApproved ?? now,
      done: !!managerApproved || r.status === 'CANCELLED',
      isOngoing: !managerApproved && r.status === 'WAITING_MANAGER',
      leadTime: mapLead(created, managerApproved ?? now),
    },
  ];

  if (managerApproved) {
    if (r.status === 'CONCLUDED' && concludedAt != null && !Number.isNaN(concludedAt)) {
      steps.push({
        key: 'tramitacao',
        title: statusLabels[r.status] ?? r.status,
        from: concludedAt,
        to: concludedAt,
        done: true,
        isOngoing: false,
        leadTime: mapLead(concludedAt, concludedAt),
      });
    } else {
      const to = isTerminal && concludedAt ? concludedAt : tramEnd;
      steps.push({
        key: 'tramitacao',
        title: statusLabels[r.status] ?? r.status,
        from: managerApproved,
        to,
        done: isTerminal || !!concludedAt,
        isOngoing:
          !!managerApproved && !isTerminal && r.status !== 'WAITING_MANAGER' && r.status !== 'CONCLUDED',
        leadTime: mapLead(managerApproved, to),
      });
    }
  }

  return steps;
}

export function buildDpRequestTimeline(
  r: TimelineRequest,
  statusLabels: Record<string, string>,
  formatDuration: (ms: number) => string
): DpTimelineStep[] {
  const now = Date.now();
  const history = parseStatusHistory(r.statusHistory);
  const mapLead = (from: number, to: number) => formatDuration(Math.max(0, to - from));
  const created = new Date(r.createdAt).getTime();

  if (history.length === 0) {
    return buildLegacyTimeline(r, statusLabels, formatDuration, now, created, mapLead);
  }

  const steps: DpTimelineStep[] = [];
  const h0 = history[0];
  const t0 = new Date(h0.at).getTime();

  steps.push({
    key: 'created',
    title: 'Criação da solicitação',
    from: t0,
    to: t0,
    done: true,
    isOngoing: false,
    leadTime: mapLead(t0, t0),
    note: h0.note,
    actorName: h0.actorName,
  });

  if (history.length === 1) {
    if (r.status === 'WAITING_MANAGER') {
      steps.push({
        key: 'ongoing-wait-manager',
        title: phaseTitleForStatus('WAITING_MANAGER', statusLabels),
        from: t0,
        to: now,
        done: false,
        isOngoing: true,
        leadTime: mapLead(t0, now),
      });
    }
    return steps;
  }

  /**
   * Entre history[i-1].at e history[i].at a solicitação permaneceu em `prev.status`;
   * em history[i].at passou para `cur.status`. Mensagem e responsável vêm do evento `cur`.
   */
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const cur = history[i];
    const tPrev = new Date(prev.at).getTime();
    const tCur = new Date(cur.at).getTime();
    const isLast = i === history.length - 1;

    const titleInPrevStatus = phaseTitleForStatus(prev.status, statusLabels);

    if (cur.status === 'CONCLUDED') {
      steps.push({
        key: `st-${i}-phase-${prev.status}-${prev.at}`,
        title: titleInPrevStatus,
        from: tPrev,
        to: tCur,
        done: true,
        isOngoing: false,
        leadTime: mapLead(tPrev, tCur),
        note: cur.note,
        actorName: cur.actorName,
      });
      const concludedMs = r.dpConcludedAt ? new Date(r.dpConcludedAt).getTime() : tCur;
      const at = Number.isNaN(concludedMs) ? tCur : concludedMs;
      steps.push({
        key: `st-${i}-CONCLUDED-${cur.at}`,
        title: statusLabels.CONCLUDED ?? 'Concluída',
        from: at,
        to: at,
        done: true,
        isOngoing: false,
        leadTime: mapLead(at, at),
      });
      continue;
    }

    if (cur.status === 'CANCELLED') {
      steps.push({
        key: `st-${i}-phase-${prev.status}-${prev.at}`,
        title: titleInPrevStatus,
        from: tPrev,
        to: tCur,
        done: true,
        isOngoing: false,
        leadTime: mapLead(tPrev, tCur),
        note: cur.note,
        actorName: cur.actorName,
      });
      steps.push({
        key: `st-${i}-CANCELLED-${cur.at}`,
        title: statusLabels.CANCELLED ?? 'Cancelada',
        from: tCur,
        to: tCur,
        done: true,
        isOngoing: false,
        leadTime: mapLead(tCur, tCur),
      });
      continue;
    }

    steps.push({
      key: `st-${i}-phase-${prev.status}-${prev.at}`,
      title: titleInPrevStatus,
      from: tPrev,
      to: tCur,
      done: true,
      isOngoing: false,
      leadTime: mapLead(tPrev, tCur),
      note: cur.note,
      actorName: cur.actorName,
    });

    if (isLast && r.status === cur.status) {
      steps.push({
        key: `st-${i}-ongoing-${cur.status}`,
        title: statusLabels[cur.status] ?? cur.status,
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
