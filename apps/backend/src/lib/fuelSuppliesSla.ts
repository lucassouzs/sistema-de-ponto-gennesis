import { prisma } from './prisma';

const DEFAULT_SLA_HOURS = 24;

export async function getFuelSuppliesSlaHours(): Promise<number> {
  const settings = await prisma.companySettings.findFirst({
    select: { fuelSuppliesSlaHours: true },
    orderBy: { createdAt: 'asc' },
  });
  const hours = settings?.fuelSuppliesSlaHours;
  return typeof hours === 'number' && hours > 0 ? hours : DEFAULT_SLA_HOURS;
}

export function formatFuelSuppliesSlaMessage(slaHours: number): string {
  if (slaHours < 24) {
    return slaHours === 1
      ? 'Sua solicitação será atendida em até 1 hora.'
      : `Sua solicitação será atendida em até ${slaHours} horas.`;
  }
  const days = Math.round(slaHours / 24);
  if (days === 1) {
    return 'Sua solicitação será atendida em até 1 dia útil.';
  }
  return `Sua solicitação será atendida em até ${days} dias úteis.`;
}

export function formatRefuelDeadlineLabel(amount: number, unit: 'HOURS' | 'DAYS'): string {
  if (unit === 'HOURS') {
    return amount === 1 ? '1 hora' : `${amount} horas`;
  }
  return amount === 1 ? '1 dia' : `${amount} dias`;
}

export function computeRefuelDeadlineAt(amount: number, unit: 'HOURS' | 'DAYS'): Date {
  const deadline = new Date();
  if (unit === 'HOURS') {
    deadline.setHours(deadline.getHours() + amount);
    return deadline;
  }
  deadline.setDate(deadline.getDate() + amount);
  return deadline;
}

export function formatBrDateTime(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${d}/${m}/${y} às ${h}:${min}`;
}
