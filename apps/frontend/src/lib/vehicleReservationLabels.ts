export type VehicleReservationStatus =
  | 'PENDING_SUPPLIES'
  | 'APPROVED'
  | 'COMPLETED'
  | 'INSPECTED'
  | 'REJECTED'
  | 'CANCELLED';

export const VEHICLE_RESERVATION_STATUS_LABELS: Record<VehicleReservationStatus, string> = {
  PENDING_SUPPLIES: 'Aguardando',
  APPROVED: 'Em uso',
  COMPLETED: 'Aguardando vistoria',
  INSPECTED: 'Vistoriada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada'
};

export const VEHICLE_RESERVATION_STATUS_BADGE: Record<VehicleReservationStatus, string> = {
  PENDING_SUPPLIES:
    'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  APPROVED:
    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  COMPLETED:
    'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  INSPECTED:
    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  REJECTED:
    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  CANCELLED:
    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
};

export const PERIODO_USO_LABELS: Record<string, string> = {
  INTEGRAL: 'Integral',
  MATUTINO: 'Matutino',
  VESPERTINO: 'Vespertino',
  NOTURNO: 'Noturno'
};

export const PERIODO_USO_OPTIONS = (
  ['INTEGRAL', 'MATUTINO', 'VESPERTINO', 'NOTURNO'] as const
).map((value) => ({
  value,
  label: PERIODO_USO_LABELS[value],
  searchText: PERIODO_USO_LABELS[value]
}));

export function formatVehicleReservationStatus(status: string): string {
  return (
    VEHICLE_RESERVATION_STATUS_LABELS[status as VehicleReservationStatus] || status || '—'
  );
}

export function vehicleReservationStatusBadgeClass(status: string): string {
  return (
    VEHICLE_RESERVATION_STATUS_BADGE[status as VehicleReservationStatus] ||
    VEHICLE_RESERVATION_STATUS_BADGE.PENDING_SUPPLIES
  );
}

export function formatPeriodoUso(values: string[] | null | undefined): string {
  if (!values?.length) return '—';
  return values.map((value) => PERIODO_USO_LABELS[value] || value).join(', ');
}

function nowDatetimeLocalValue(): string {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function defaultReturnDatetimeLocalValue(): string {
  return nowDatetimeLocalValue();
}

/** Valor padrão `yyyy-MM-ddTHH:mm` para data/hora de uso. */
export function defaultUsoDatetimeLocalValue(hour = 8, minute = 0): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}
