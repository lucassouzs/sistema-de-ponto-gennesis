import type { FluxTab, GerenciarStats } from '../_lib/types';

type OcTabCounts = {
  compras: number;
  gestor: number;
  diretoria: number;
  IN_REVIEW: number;
  APPROVED: number;
  ATTACH_BOLETO: number;
  PROOF_VALIDATION: number;
  PROOF_CORRECTION: number;
  ATTACH_NF: number;
  FINALIZADAS: number;
};

export function FluxTabsNav({
  fluxTab,
  onFluxTab,
  stats,
  ocTabCounts
}: {
  fluxTab: FluxTab;
  onFluxTab: (t: FluxTab) => void;
  stats: GerenciarStats;
  ocTabCounts: OcTabCounts;
}) {
  return (
    <div id="secao-fluxo-tabs" className="scroll-mt-4">
      <p className="text-center text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
        Requisições de materiais e fases de OC
      </p>
      <div className="border-b border-gray-200 dark:border-gray-700 rounded-t-lg bg-gray-50/80 dark:bg-gray-900/40 px-2">
        <nav className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 sm:gap-x-2 overflow-x-auto py-3">
          {(
            [
              { id: 'rm_PENDING' as const, label: 'Pendentes', count: stats.pending },
              { id: 'rm_IN_REVIEW' as const, label: 'Correção RM', count: stats.inReview },
              { id: 'rm_APPROVED' as const, label: 'RMs aprovadas', count: stats.approved }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onFluxTab(tab.id)}
              className={`flex items-center gap-2 py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap rounded-t-lg transition-colors ${
                fluxTab === tab.id
                  ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  fluxTab === tab.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
          <span
            className="hidden sm:inline-flex w-px min-h-[2rem] bg-gray-300 dark:bg-gray-600 self-center mx-1 shrink-0"
            aria-hidden
          />
          {(
            [
              { id: 'oc_compras' as const, label: 'OC - Aprovação Compras', count: ocTabCounts.compras },
              { id: 'oc_gestor' as const, label: 'OC - Aprovação Gestor', count: ocTabCounts.gestor },
              { id: 'oc_diretoria' as const, label: 'OC - Aprovação Diretoria', count: ocTabCounts.diretoria },
              { id: 'oc_IN_REVIEW' as const, label: 'Correção OC', count: ocTabCounts.IN_REVIEW },
              {
                id: 'oc_ATTACH_BOLETO' as const,
                label: 'Anexar Boleto',
                count: ocTabCounts.ATTACH_BOLETO
              },
              { id: 'oc_APPROVED' as const, label: 'Pagamento', count: ocTabCounts.APPROVED },
              {
                id: 'oc_PROOF_VALIDATION' as const,
                label: 'Validação Comprovante',
                count: ocTabCounts.PROOF_VALIDATION
              },
              {
                id: 'oc_PROOF_CORRECTION' as const,
                label: 'Correção Comprovante',
                count: ocTabCounts.PROOF_CORRECTION
              },
              { id: 'oc_ATTACH_NF' as const, label: 'Anexar NF', count: ocTabCounts.ATTACH_NF },
              {
                id: 'oc_FINALIZADAS' as const,
                label: 'OC - Finalizadas',
                count: ocTabCounts.FINALIZADAS
              }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onFluxTab(tab.id)}
              className={`flex items-center gap-2 py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap rounded-t-lg transition-colors ${
                fluxTab === tab.id
                  ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  fluxTab === tab.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
          <span
            className="hidden sm:inline-flex w-px min-h-[2rem] bg-gray-300 dark:bg-gray-600 self-center mx-1 shrink-0"
            aria-hidden
          />
          <button
            type="button"
            onClick={() => onFluxTab('rm_CANCELLED')}
            className={`flex items-center gap-2 py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap rounded-t-lg transition-colors ${
              fluxTab === 'rm_CANCELLED'
                ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Canceladas
            <span
              className={`px-2 py-0.5 rounded-full text-xs ${
                fluxTab === 'rm_CANCELLED'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {stats.cancelled}
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
}
