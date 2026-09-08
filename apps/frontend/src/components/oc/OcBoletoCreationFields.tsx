'use client';

import { OcBoletoCreationField } from '@/components/oc/OcBoletoCreationField';

export type OcBoletoCreationSlot = {
  url: string;
  name: string;
  /** YYYY-MM-DD — vencimento editável (padrão: dias da condição de pagamento). */
  dueDate?: string;
};

function ymdAddDays(base: Date, days: number): string {
  const d = new Date(base);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function defaultBoletoDueDate(
  parcelDueDays: number[],
  parcelIndex: number,
  baseDate: Date = new Date()
): string {
  const days = parcelDueDays[parcelIndex] ?? parcelDueDays[parcelDueDays.length - 1] ?? 30;
  return ymdAddDays(baseDate, days);
}

type Props = {
  parcelCount: number;
  parcelDueDays?: number[];
  slots: OcBoletoCreationSlot[];
  onChange: (slots: OcBoletoCreationSlot[]) => void;
  disabled?: boolean;
  idPrefix?: string;
  labelClassName?: string;
  /** Data base para calcular vencimento padrão (ex.: data da OC). */
  baseDate?: Date;
};

function emptySlots(count: number, parcelDueDays: number[] = [], baseDate = new Date()): OcBoletoCreationSlot[] {
  return Array.from({ length: count }, (_, i) => ({
    url: '',
    name: '',
    dueDate: defaultBoletoDueDate(parcelDueDays, i, baseDate),
  }));
}

function resolveSlotDueDate(
  slot: OcBoletoCreationSlot,
  parcelIndex: number,
  parcelDueDays: number[],
  baseDate: Date
): string {
  const raw = (slot.dueDate || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return defaultBoletoDueDate(parcelDueDays, parcelIndex, baseDate);
}

function DueDateField({
  value,
  onChange,
  disabled,
  inputId,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  inputId: string;
}) {
  return (
    <div className="mt-3">
      <label
        htmlFor={inputId}
        className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1"
      >
        Vencimento
      </label>
      <input
        id={inputId}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full max-w-[11rem] rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 disabled:opacity-50"
      />
    </div>
  );
}

export function OcBoletoCreationFields({
  parcelCount,
  parcelDueDays = [],
  slots,
  onChange,
  disabled,
  idPrefix = 'oc-boleto',
  labelClassName = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2',
  baseDate = new Date(),
}: Props) {
  const count = Math.max(1, parcelCount);

  const patchSlot = (index: number, patch: Partial<OcBoletoCreationSlot>) => {
    const next = Array.from({ length: count }, (_, j) => {
      const cur = slots[j] ?? { url: '', name: '' };
      if (j !== index) {
        return {
          ...cur,
          dueDate: resolveSlotDueDate(cur, j, parcelDueDays, baseDate),
        };
      }
      return {
        ...cur,
        ...patch,
        dueDate: patch.dueDate ?? resolveSlotDueDate({ ...cur, ...patch }, j, parcelDueDays, baseDate),
      };
    });
    onChange(next);
  };

  if (count <= 1) {
    const slot = slots[0] ?? { url: '', name: '' };
    const dueDate = resolveSlotDueDate(slot, 0, parcelDueDays, baseDate);
    return (
      <div>
        <OcBoletoCreationField
          inputId={`${idPrefix}-0`}
          url={slot.url}
          name={slot.name}
          disabled={disabled}
          labelClassName={labelClassName}
          onChange={({ url, name }) => patchSlot(0, { url, name })}
        />
        <DueDateField
          inputId={`${idPrefix}-due-0`}
          value={dueDate}
          disabled={disabled}
          onChange={(dueDate) => patchSlot(0, { dueDate })}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <span className={labelClassName}>
        Anexar boletos * ({count} parcelas)
      </span>
      {Array.from({ length: count }, (_, i) => {
        const slot = slots[i] ?? { url: '', name: '' };
        const days = parcelDueDays[i] ?? parcelDueDays[parcelDueDays.length - 1];
        const parcelLabel =
          days != null && Number.isFinite(days)
            ? `Parcela ${i + 1} (${days} dia${days === 1 ? '' : 's'})`
            : `Parcela ${i + 1}`;
        return (
          <div
            key={i}
            className="rounded-lg border border-violet-200/80 bg-violet-50/40 px-3 py-3 dark:border-violet-900/50 dark:bg-violet-950/20"
          >
            <OcBoletoCreationField
              inputId={`${idPrefix}-${i}`}
              url={slot.url}
              name={slot.name}
              disabled={disabled}
              labelClassName="block text-xs font-semibold uppercase tracking-wide text-violet-800 dark:text-violet-200 mb-2"
              fieldLabel={`Boleto — ${parcelLabel}`}
              onChange={({ url, name }) => patchSlot(i, { url, name })}
            />
            <DueDateField
              inputId={`${idPrefix}-due-${i}`}
              value={resolveSlotDueDate(slot, i, parcelDueDays, baseDate)}
              disabled={disabled}
              onChange={(dueDate) => patchSlot(i, { dueDate })}
            />
          </div>
        );
      })}
    </div>
  );
}

export { emptySlots as emptyOcBoletoCreationSlots };

export function resizeOcBoletoCreationSlots(
  count: number,
  prev: OcBoletoCreationSlot[] = [],
  parcelDueDays: number[] = [],
  baseDate: Date = new Date()
): OcBoletoCreationSlot[] {
  const n = Math.max(1, count);
  return Array.from({ length: n }, (_, i) => {
    const existing = prev[i];
    if (existing) {
      return {
        ...existing,
        dueDate: resolveSlotDueDate(existing, i, parcelDueDays, baseDate),
      };
    }
    return {
      url: '',
      name: '',
      dueDate: defaultBoletoDueDate(parcelDueDays, i, baseDate),
    };
  });
}
