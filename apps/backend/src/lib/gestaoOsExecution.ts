import { GestaoOsStatus } from '@prisma/client';

export function isExecutionRunningStatus(status: GestaoOsStatus | string): boolean {
  return status === 'IN_PROGRESS';
}

export function applyExecutionClock(input: {
  currentStatus: GestaoOsStatus | string;
  nextStatus: GestaoOsStatus | string;
  now: Date;
  startedAt: Date | string | null | undefined;
  executionMs: number | null | undefined;
  lastExecutionResumeAt: Date | string | null | undefined;
}): {
  startedAt: Date | null;
  executionMs: number;
  lastExecutionResumeAt: Date | null;
} {
  const now = input.now;
  let executionMs = Math.max(0, Math.round(Number(input.executionMs) || 0));
  const startedAt = toDate(input.startedAt);
  let lastResume = toDate(input.lastExecutionResumeAt);
  const wasRunning = isExecutionRunningStatus(input.currentStatus);
  const willRun = isExecutionRunningStatus(input.nextStatus);

  if (wasRunning && lastResume) {
    executionMs += Math.max(0, now.getTime() - lastResume.getTime());
    lastResume = null;
  } else if (wasRunning && !lastResume && startedAt && executionMs === 0) {
    executionMs += Math.max(0, now.getTime() - startedAt.getTime());
  }

  if (willRun) {
    lastResume = now;
  }

  return {
    startedAt: startedAt ?? (willRun ? now : null),
    executionMs,
    lastExecutionResumeAt: lastResume
  };
}

export function liveExecutionMs(input: {
  status: GestaoOsStatus | string;
  executionMs?: number | null;
  lastExecutionResumeAt?: Date | string | null;
  startedAt?: Date | string | null;
  completedAt?: Date | string | null;
  now?: Date;
}): number {
  const stored = Math.max(0, Math.round(Number(input.executionMs) || 0));
  const now = input.now ?? new Date();
  if (isExecutionRunningStatus(input.status) && input.lastExecutionResumeAt) {
    const resume = toDate(input.lastExecutionResumeAt);
    if (resume) return stored + Math.max(0, now.getTime() - resume.getTime());
  }
  if (stored > 0) return stored;
  const started = toDate(input.startedAt);
  const ended = toDate(input.completedAt);
  if (started && ended && ended.getTime() > started.getTime()) {
    return ended.getTime() - started.getTime();
  }
  return stored;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
