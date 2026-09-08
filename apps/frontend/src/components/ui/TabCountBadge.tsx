'use client';

type TabCountBadgeProps = {
  count: number;
  active?: boolean;
  tone?: 'red' | 'blue';
};

export function TabCountBadge({ count, active = false, tone = 'red' }: TabCountBadgeProps) {
  const toneClass = active
    ? tone === 'blue'
      ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
      : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';

  const label = count > 99 ? '99+' : String(count);
  const isSingleDigit = label.length === 1;

  return (
    <span
      aria-hidden
      className={`inline-flex h-5 shrink-0 items-center justify-center rounded-full text-xs font-bold leading-none tabular-nums ${isSingleDigit ? 'w-5' : 'min-w-5 px-1.5'} ${toneClass}`}
    >
      <span className="translate-y-px">{label}</span>
    </span>
  );
}
