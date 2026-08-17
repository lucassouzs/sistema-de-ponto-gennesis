'use client';

import type { FluxTab, GerenciarStats } from '../_lib/types';
import { TabCountBadge } from '@/components/ui/TabCountBadge';
import { AppTabButton } from '@/components/ui/AppTabButton';

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

const TAB_CLS =
  'flex items-center gap-2 whitespace-nowrap px-2 py-2 text-xs font-medium sm:px-3 sm:text-sm';

export function FluxTabsNav({
  fluxTab,
  onFluxTab,
  stats,
  ocTabCounts,
  embeddedInCard = false,
  searchActive = false,
  rmSearchCounts,
  ocSearchCounts
}: {
  fluxTab: FluxTab;
  onFluxTab: (t: FluxTab) => void;
  stats: GerenciarStats;
  ocTabCounts: OcTabCounts;
  /** Abas coladas ao card da lista (sem cantos/ espaço extras). */
  embeddedInCard?: boolean;
  /** Quando há busca, exibe quantos itens batem em cada fase. */
  searchActive?: boolean;
  rmSearchCounts?: { pending: number; inReview: number; approved: number; cancelled: number };
  ocSearchCounts?: OcTabCounts;
}) {
  const rmPending = searchActive && rmSearchCounts ? rmSearchCounts.pending : stats.pending;
  const rmInReview = searchActive && rmSearchCounts ? rmSearchCounts.inReview : stats.inReview;
  const rmApproved = searchActive && rmSearchCounts ? rmSearchCounts.approved : stats.approved;
  const rmCancelled = searchActive && rmSearchCounts ? rmSearchCounts.cancelled : stats.cancelled;
  const ocCounts = searchActive && ocSearchCounts ? ocSearchCounts : ocTabCounts;
  return (
    <div id="secao-fluxo-tabs" className={embeddedInCard ? '' : 'scroll-mt-4'}>
      {!embeddedInCard && (
        <p className="mb-3 text-center text-sm font-medium text-gray-800 dark:text-gray-200">
          Requisições de materiais e fases de OC
        </p>
      )}
      <div className="bg-transparent px-2">
        <nav className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-x-auto py-3 sm:gap-x-2">
          {(
            [
              { id: 'rm_PENDING' as const, label: 'Pendentes', count: rmPending },
              { id: 'rm_IN_REVIEW' as const, label: 'Correção RM', count: rmInReview },
              { id: 'rm_APPROVED' as const, label: 'RMs Aprovadas', count: rmApproved }
            ] as const
          ).map((tab) => (
            <AppTabButton
              key={tab.id}
              active={fluxTab === tab.id}
              onClick={() => onFluxTab(tab.id)}
              className={TAB_CLS}
            >
              {tab.label}
              <span className="app-tab__badge">
                <TabCountBadge count={tab.count} active={fluxTab === tab.id} tone="red" />
              </span>
            </AppTabButton>
          ))}
          <span
            className="mx-1 hidden min-h-[2rem] w-px shrink-0 self-center bg-gray-300 dark:bg-gray-600 sm:inline-flex"
            aria-hidden
          />
          {(
            [
              { id: 'oc_compras' as const, label: 'Aprovação Compras', count: ocCounts.compras },
              { id: 'oc_gestor' as const, label: 'Aprovação Gestor', count: ocCounts.gestor },
              { id: 'oc_diretoria' as const, label: 'Aprovação Diretoria', count: ocCounts.diretoria },
              { id: 'oc_IN_REVIEW' as const, label: 'Correção', count: ocCounts.IN_REVIEW },
              {
                id: 'oc_ATTACH_BOLETO' as const,
                label: 'Anexar Boleto',
                count: ocCounts.ATTACH_BOLETO
              },
              { id: 'oc_APPROVED' as const, label: 'Pagamento', count: ocCounts.APPROVED },
              {
                id: 'oc_PROOF_VALIDATION' as const,
                label: 'Validação Comprovante',
                count: ocCounts.PROOF_VALIDATION
              },
              {
                id: 'oc_PROOF_CORRECTION' as const,
                label: 'Correção Comprovante',
                count: ocCounts.PROOF_CORRECTION
              },
              { id: 'oc_ATTACH_NF' as const, label: 'Anexar NF', count: ocCounts.ATTACH_NF },
              {
                id: 'oc_FINALIZADAS' as const,
                label: 'Finalizadas',
                count: ocCounts.FINALIZADAS
              }
            ] as const
          ).map((tab) => (
            <AppTabButton
              key={tab.id}
              active={fluxTab === tab.id}
              onClick={() => onFluxTab(tab.id)}
              className={TAB_CLS}
            >
              {tab.label}
              <span className="app-tab__badge">
                <TabCountBadge count={tab.count} active={fluxTab === tab.id} tone="red" />
              </span>
            </AppTabButton>
          ))}
          <span
            className="mx-1 hidden min-h-[2rem] w-px shrink-0 self-center bg-gray-300 dark:bg-gray-600 sm:inline-flex"
            aria-hidden
          />
          <AppTabButton
            active={fluxTab === 'rm_CANCELLED'}
            onClick={() => onFluxTab('rm_CANCELLED')}
            className={TAB_CLS}
          >
            Canceladas
            <span className="app-tab__badge">
              <TabCountBadge count={rmCancelled} active={fluxTab === 'rm_CANCELLED'} tone="red" />
            </span>
          </AppTabButton>
        </nav>
      </div>
    </div>
  );
}
