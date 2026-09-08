'use client';

type Props = {
  progress: number;
  label?: string;
  hint?: string;
};

/** Barra de progresso de importação (mesmo padrão do Tasks/Kanban). */
export function ImportProgressPanel({
  progress,
  label = 'Importando…',
  hint = 'Aguarde, não feche esta página.',
}: Props) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)));
  return (
    <div className="space-y-5 py-6">
      <p className="text-center text-sm font-medium text-gray-800 dark:text-gray-200">{label}</p>
      <div className="w-full space-y-2">
        <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
          <span>Progresso</span>
          <span className="tabular-nums font-semibold text-gray-800 dark:text-gray-100">{pct}%</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full rounded-full bg-red-600 transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <p className="text-center text-xs text-gray-500 dark:text-gray-400">{hint}</p>
    </div>
  );
}
