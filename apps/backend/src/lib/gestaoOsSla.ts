import { GestaoOsPriority, GestaoOsStatus } from '@prisma/client';
import { prisma } from './prisma';

/** SLA padrão por prioridade quando não há SLA de equipamento. */
export const PRIORITY_SLA_HOURS: Record<GestaoOsPriority, number> = {
  URGENT: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72
};

/** SLA de plantão / fora do expediente (America/Sao_Paulo). */
export const PLANTAO_SLA_HOURS = 4;

/** Aviso quando resta ≤ 25% do prazo ou ≤ 2h (o que for maior entre os critérios). */
export const SLA_WARNING_RATIO = 0.25;
export const SLA_WARNING_MIN_HOURS = 2;

export type GestaoOsSlaMeta = {
  slaHoursApplied: number | null;
  dueAt: string | null;
  overdue: boolean;
  warning: boolean;
  remainingMs: number | null;
};

const OPEN_STATUSES: GestaoOsStatus[] = [
  'OPEN',
  'UNDER_REVIEW',
  'APPROVED',
  'SAFETY_CHECK',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'REWORK'
];

export function isOpenGestaoOsStatus(status: GestaoOsStatus | string): boolean {
  return OPEN_STATUSES.includes(status as GestaoOsStatus);
}

export function computeDueAtFromHours(from: Date, hours: number): Date {
  return new Date(from.getTime() + hours * 60 * 60 * 1000);
}

export function computeSlaMeta(input: {
  dueAt?: Date | string | null;
  slaHoursApplied?: number | null;
  status: GestaoOsStatus | string;
  now?: Date;
}): GestaoOsSlaMeta {
  const now = input.now ?? new Date();
  const due =
    input.dueAt == null
      ? null
      : input.dueAt instanceof Date
        ? input.dueAt
        : new Date(input.dueAt);
  const dueValid = due && !Number.isNaN(due.getTime()) ? due : null;
  const open = isOpenGestaoOsStatus(input.status);
  const remainingMs = dueValid ? dueValid.getTime() - now.getTime() : null;
  const overdue = Boolean(open && remainingMs != null && remainingMs < 0);

  let warning = false;
  if (open && dueValid && remainingMs != null && remainingMs >= 0) {
    const windowMs =
      input.slaHoursApplied && input.slaHoursApplied > 0
        ? input.slaHoursApplied * 60 * 60 * 1000
        : null;
    const ratioThreshold = windowMs != null ? windowMs * SLA_WARNING_RATIO : null;
    const minThreshold = SLA_WARNING_MIN_HOURS * 60 * 60 * 1000;
    const threshold =
      ratioThreshold != null ? Math.max(ratioThreshold, minThreshold) : minThreshold;
    warning = remainingMs <= threshold;
  }

  return {
    slaHoursApplied: input.slaHoursApplied ?? null,
    dueAt: dueValid ? dueValid.toISOString() : null,
    overdue,
    warning,
    remainingMs
  };
}

/** Expediente: seg–sex 07:00–18:00 no fuso de Brasília. */
export function isGestaoOsAfterHours(from: Date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit'
  }).formatToParts(from);
  const weekday = parts.find((p) => p.type === 'weekday')?.value || '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 12);
  const weekend = weekday === 'Sat' || weekday === 'Sun';
  return weekend || hour < 7 || hour >= 18;
}

/**
 * Resolve horas de SLA: plantão/fora do expediente → equipamento → prioridade.
 */
export async function resolveSlaHours(input: {
  priority: GestaoOsPriority;
  assetId?: string | null;
  assetCategory?: string | null;
  assetName?: string | null;
  origin?: string | null;
  from?: Date;
}): Promise<{ hours: number; source: 'equipment' | 'priority' | 'plantao' }> {
  const origin = String(input.origin || '').toUpperCase();
  if (origin === 'PLANTAO' || isGestaoOsAfterHours(input.from ?? new Date())) {
    const priorityHours = PRIORITY_SLA_HOURS[input.priority] ?? PRIORITY_SLA_HOURS.MEDIUM;
    return { hours: Math.min(priorityHours, PLANTAO_SLA_HOURS), source: 'plantao' };
  }
  const priorityHours = PRIORITY_SLA_HOURS[input.priority] ?? PRIORITY_SLA_HOURS.MEDIUM;

  let category = input.assetCategory?.trim() || null;
  let name = input.assetName?.trim() || null;

  if (input.assetId && (!category || !name)) {
    const asset = await prisma.gestaoOsAsset.findUnique({
      where: { id: input.assetId },
      select: { name: true, category: true }
    });
    if (asset) {
      category = category || asset.category;
      name = name || asset.name;
    }
  }

  if (name || category) {
    const needles = [name, category].filter(Boolean).map((s) => String(s).trim().toLowerCase());
    const equipments = await prisma.gestaoOsEquipment.findMany({
      where: { isActive: true, defaultSlaHours: { not: null } },
      select: { name: true, defaultSlaHours: true },
      take: 500
    });
    for (const eq of equipments) {
      if (eq.defaultSlaHours == null || eq.defaultSlaHours <= 0) continue;
      const eqName = eq.name.trim().toLowerCase();
      if (needles.some((n) => eqName.includes(n) || n.includes(eqName))) {
        return { hours: eq.defaultSlaHours, source: 'equipment' };
      }
    }
  }

  return { hours: priorityHours, source: 'priority' };
}

export async function resolveSlaDueAt(input: {
  priority: GestaoOsPriority;
  assetId?: string | null;
  from?: Date;
  explicitDueAt?: Date | string | null;
  origin?: string | null;
}): Promise<{
  dueAt: Date;
  slaHoursApplied: number;
  source: 'explicit' | 'equipment' | 'priority' | 'plantao';
}> {
  if (input.explicitDueAt) {
    const d =
      input.explicitDueAt instanceof Date
        ? input.explicitDueAt
        : new Date(input.explicitDueAt);
    if (!Number.isNaN(d.getTime())) {
      const { hours } = await resolveSlaHours({
        priority: input.priority,
        assetId: input.assetId,
        origin: input.origin,
        from: input.from
      });
      return { dueAt: d, slaHoursApplied: hours, source: 'explicit' };
    }
  }
  const from = input.from ?? new Date();
  const resolved = await resolveSlaHours({
    priority: input.priority,
    assetId: input.assetId,
    origin: input.origin,
    from
  });
  return {
    dueAt: computeDueAtFromHours(from, resolved.hours),
    slaHoursApplied: resolved.hours,
    source: resolved.source
  };
}
