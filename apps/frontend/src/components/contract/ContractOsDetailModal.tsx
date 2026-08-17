'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { AppTabButton } from '@/components/ui/AppTabButton';
import { OsDetailOcTab, sumOsPurchaseOrdersTotal, useOsPurchaseOrders } from '@/components/contract/OsDetailOcTab';
import { formatOsSePasta } from '@/lib/formatOsSePasta';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import {
  billingAndamentoBadgeClass,
  buildDisplayIdMap,
  formatDisplayId,
  formatHistoricoCurrency,
  getBillingAndamentoStatus,
  getHistoricoEtiqueta,
  getOsLinkedBillings,
  getOsLinkedPleitos,
  getPleitoBillableTotal,
  getPleitoBilledAmount,
  getPleitoRemainingBalance,
  historicoEtiquetaBadgeClass,
  parseBudgetToNumberSafe,
  type ContractBillingHistorico,
  type ContractPleitoHistorico,
} from '@/lib/contractHistoricoPleitos';

export type OsDetailModalTab = 'resumo' | 'pleitos' | 'ocs' | 'faturamento';

const OS_DETAIL_MODAL_TABS: { id: OsDetailModalTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'pleitos', label: 'Pleitos' },
  { id: 'ocs', label: 'Ordens de compra' },
  { id: 'faturamento', label: 'Faturamento' },
];

export type ContractOsDetailPleito = ContractPleitoHistorico & {
  serviceOrderId?: string | null;
  lot?: string | null;
  location?: string | null;
  unit?: string | null;
  budgetAmount1?: number | null;
  budgetAmount2?: number | null;
  budgetAmount3?: number | null;
  budgetAmount4?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  engineer?: string | null;
  supervisor?: string | null;
  pv?: string | null;
  ipi?: string | null;
};

type InfoRow = { label: string; value: React.ReactNode; stacked?: boolean };

function formatOsCurrency(value: number) {
  return formatHistoricoCurrency(value);
}

function formatOsDate(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR');
}

function OsDetailCardField({
  label,
  children,
  stacked = false,
}: {
  label: string;
  children: React.ReactNode;
  stacked?: boolean;
}) {
  return (
    <div
      className={
        stacked
          ? 'flex flex-col gap-1.5 py-2.5'
          : 'flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6'
      }
    >
      <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">{label}</dt>
      <dd
        className={
          stacked
            ? 'min-w-0 text-left text-sm text-gray-900 dark:text-gray-100'
            : 'min-w-0 text-sm text-gray-900 dark:text-gray-100 sm:text-right'
        }
      >
        {children}
      </dd>
    </div>
  );
}

function OsDetailAmountTile({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 px-2.5 py-2.5 dark:border-gray-700">
      <p
        className={`text-[11px] font-medium ${
          emphasize
            ? 'text-red-600/80 dark:text-red-400/90'
            : 'text-gray-500 dark:text-gray-400'
        }`}
      >
        {label}
      </p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          emphasize
            ? 'text-red-700 dark:text-red-300'
            : 'text-gray-900 dark:text-gray-100'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function OsPleitoCard({
  pleito,
  displayId,
  billings,
}: {
  pleito: ContractPleitoHistorico;
  displayId: string;
  billings: ContractBillingHistorico[];
}) {
  const valorPleito = getPleitoBillableTotal(pleito);
  const faturado = getPleitoBilledAmount(pleito, billings);
  const restante = getPleitoRemainingBalance(pleito, billings);
  const etiqueta = getHistoricoEtiqueta(pleito, billings);
  const createdLabel = formatOsDate(pleito.createdAt as string | undefined);
  const monthYear =
    pleito.creationMonth && pleito.creationYear
      ? `${String(pleito.creationMonth).padStart(2, '0')}/${pleito.creationYear}`
      : null;
  const description = (pleito.serviceDescription || '').trim();

  return (
    <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
            Pleito {displayId}
          </h3>
          {description ? (
            <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">{description}</p>
          ) : null}
        </div>
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${historicoEtiquetaBadgeClass(etiqueta)}`}
          title={etiqueta}
        >
          {etiqueta}
        </span>
      </div>

      <dl className="divide-y divide-gray-200 dark:divide-gray-700">
        {monthYear ? (
          <OsDetailCardField label="Mês/ano">{monthYear}</OsDetailCardField>
        ) : null}
        {createdLabel ? (
          <OsDetailCardField label="Criado em">{createdLabel}</OsDetailCardField>
        ) : null}
        {pleito.invoiceNumber?.trim() ? (
          <OsDetailCardField label="Nº NF">{pleito.invoiceNumber.trim()}</OsDetailCardField>
        ) : null}
      </dl>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <OsDetailAmountTile label="Pleiteado" value={formatOsCurrency(valorPleito)} />
        <OsDetailAmountTile label="Faturado" value={formatOsCurrency(faturado)} />
        <OsDetailAmountTile label="Restante" value={formatOsCurrency(restante)} emphasize />
      </div>
    </section>
  );
}

function OsBillingCard({
  billing,
  displayId,
  pleitoDisplayId,
}: {
  billing: ContractBillingHistorico;
  displayId: string;
  pleitoDisplayId: string | null;
}) {
  const fatStatus = getBillingAndamentoStatus(billing);
  const liquidoMissing = fatStatus === 'Líquido pendente';
  const issueLabel = formatOsDate(billing.issueDate);
  const nf = (billing.invoiceNumber || '').trim();
  const bruto = Number(billing.grossValue || 0);
  const liquido = Number(billing.netValue);

  return (
    <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
            Faturamento {displayId}
          </h3>
          {nf ? (
            <p className="mt-1 truncate text-xs text-gray-500 dark:text-gray-400">NF {nf}</p>
          ) : null}
        </div>
        <span className={billingAndamentoBadgeClass(fatStatus)} title={fatStatus}>
          {fatStatus}
        </span>
      </div>

      <dl className="divide-y divide-gray-200 dark:divide-gray-700">
        {pleitoDisplayId ? (
          <OsDetailCardField label="Pleito">{pleitoDisplayId}</OsDetailCardField>
        ) : null}
        {issueLabel ? (
          <OsDetailCardField label="Data emissão">{issueLabel}</OsDetailCardField>
        ) : null}
        {nf ? <OsDetailCardField label="Nº NF">{nf}</OsDetailCardField> : null}
      </dl>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <OsDetailAmountTile label="Valor bruto" value={formatOsCurrency(bruto)} />
        <OsDetailAmountTile
          label="Valor líquido"
          value={liquidoMissing ? '—' : formatOsCurrency(liquido)}
          emphasize
        />
      </div>
    </section>
  );
}

export function ContractOsDetailModal({
  isOpen,
  onClose,
  loading = false,
  pleito,
  contract,
  allPleitos,
  billings,
  headerActions,
  formatReportsBilling,
}: {
  isOpen: boolean;
  onClose: () => void;
  loading?: boolean;
  pleito: ContractOsDetailPleito | null | undefined;
  contract?: { name?: string; number?: string } | null;
  allPleitos: ContractPleitoHistorico[];
  billings: ContractBillingHistorico[];
  headerActions?: React.ReactNode;
  formatReportsBilling?: (value: string | null | undefined) => string | null;
}) {
  const [activeTab, setActiveTab] = useState<OsDetailModalTab>('resumo');

  useEffect(() => {
    if (isOpen) setActiveTab('resumo');
  }, [isOpen, pleito?.id]);

  const linkedPleitos = useMemo(
    () => (pleito ? getOsLinkedPleitos(allPleitos, pleito.divSe) : []),
    [allPleitos, pleito]
  );

  const linkedBillings = useMemo(
    () => (pleito ? getOsLinkedBillings(billings, allPleitos, pleito.divSe) : []),
    [allPleitos, billings, pleito]
  );

  const { data: osPurchaseOrders } = useOsPurchaseOrders(
    pleito?.serviceOrderId,
    pleito?.divSe,
    isOpen && !!pleito
  );

  const ocTotalVinculado = useMemo(
    () => sumOsPurchaseOrdersTotal(osPurchaseOrders ?? []),
    [osPurchaseOrders]
  );

  const pleitoDisplayIds = useMemo(() => buildDisplayIdMap(allPleitos), [allPleitos]);
  const billingDisplayIds = useMemo(() => buildDisplayIdMap(billings), [billings]);

  if (!isOpen) return null;

  const osLabel = pleito
    ? formatOsSePasta(pleito.divSe, pleito.folderNumber) || pleito.divSe || '—'
    : '—';

  const orcamento = pleito ? parseBudgetToNumberSafe(pleito.budget) : 0;
  const acumuladoFaturado = linkedBillings.reduce((sum, b) => sum + Number(b.grossValue || 0), 0);
  const statusFaturamentoPct = orcamento > 0 ? (acumuladoFaturado / orcamento) * 100 : null;
  const pendenteFaturamento = Math.max(0, orcamento - acumuladoFaturado);
  const ocOrcamentoPct = orcamento > 0 ? (ocTotalVinculado / orcamento) * 100 : null;

  const reportsValue = formatReportsBilling
    ? formatReportsBilling(pleito?.reportsBilling)
    : pleito?.reportsBilling;

  const infoRows: InfoRow[] = [];
  if (contract?.name || contract?.number) {
    infoRows.push({
      label: 'Contrato',
      value: `${contract.name?.trim() || '—'} - nº ${contract.number?.trim() || '—'}`,
    });
  }
  if (pleito) {
    const push = (label: string, value: React.ReactNode | null | undefined, stacked?: boolean) => {
      if (value == null || value === '') return;
      infoRows.push({ label, value, stacked });
    };

    push('OS / SE', osLabel);
    push('Descrição do serviço', pleito.serviceDescription, true);
    push('Lote', pleito.lot);
    push('Local', pleito.location);
    push('Unidade', pleito.unit);
    push('Status orçamento', pleito.budgetStatus);
    push('Status execução', pleito.executionStatus);
    push('Orçamento', pleito.budget ? formatOsCurrency(orcamento) : null);
    push(
      '% OCs / Orçamento',
      ocOrcamentoPct != null ? `${ocOrcamentoPct.toFixed(1)}%` : null
    );
    push(
      'Orçamento R01',
      pleito.budgetAmount1 != null ? formatOsCurrency(Number(pleito.budgetAmount1)) : null
    );
    push(
      'Orçamento R02',
      pleito.budgetAmount2 != null ? formatOsCurrency(Number(pleito.budgetAmount2)) : null
    );
    push(
      'Orçamento R03',
      pleito.budgetAmount3 != null ? formatOsCurrency(Number(pleito.budgetAmount3)) : null
    );
    push(
      'Orçamento R04',
      pleito.budgetAmount4 != null ? formatOsCurrency(Number(pleito.budgetAmount4)) : null
    );
    push('Acumulado faturado', formatOsCurrency(acumuladoFaturado));
    push(
      'Status faturamento (%)',
      statusFaturamentoPct != null ? `${statusFaturamentoPct.toFixed(1)}%` : null
    );
    push('Pendente faturamento', formatOsCurrency(pendenteFaturamento));
    push('Data início', formatOsDate(pleito.startDate));
    push('Data término', formatOsDate(pleito.endDate));
    push(
      'Mês/ano criação',
      pleito.creationMonth && pleito.creationYear
        ? `${String(pleito.creationMonth).padStart(2, '0')}/${pleito.creationYear}`
        : null
    );
    push('Engenheiro', pleito.engineer);
    push('Encarregado', pleito.supervisor);
    push('RVI', pleito.pv);
    push('RVF', pleito.ipi);
    push('Feedback relatórios', reportsValue, true);
    if (pleito.createdAt) {
      push('Preenchimento', formatDateTimeBr(pleito.createdAt));
    }
  }

  return (
    <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        className="relative my-auto flex w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800 max-h-[min(92dvh,calc(100dvh-2rem))]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="os-details-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
          <div className="min-w-0">
            <h2
              id="os-details-modal-title"
              className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100"
            >
              Ordem de Serviço {osLabel !== '—' ? `No. ${osLabel}` : ''}
            </h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div
          className="shrink-0 border-b border-gray-200 px-5 dark:border-gray-700"
          role="tablist"
          aria-label="Seções da OS"
        >
          <div className="table-scroll -mb-px flex gap-1">
            {OS_DETAIL_MODAL_TABS.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <AppTabButton
                  key={tab.id}
                  active={active}
                  onClick={() => setActiveTab(tab.id)}
                  className="shrink-0 px-3 py-2.5 text-sm font-medium"
                >
                  {tab.label}
                </AppTabButton>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">Carregando...</div>
          ) : !pleito ? (
            <div className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Ordem de serviço não encontrada.
            </div>
          ) : (
            <div className="space-y-5 text-sm">
              {activeTab === 'resumo' ? (
                <div className="space-y-4">
                  <dl className="divide-y divide-gray-200 dark:divide-gray-700">
                    {infoRows.map((row) => (
                      <div
                        key={row.label}
                        className={
                          row.stacked
                            ? 'flex flex-col gap-1.5 py-3'
                            : 'flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6'
                        }
                      >
                        <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                          {row.label}
                        </dt>
                        <dd
                          className={
                            row.stacked
                              ? 'min-w-0 text-left text-sm text-gray-900 dark:text-gray-100'
                              : 'min-w-0 text-sm text-gray-900 dark:text-gray-100 sm:text-right'
                          }
                        >
                          {row.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ) : null}

              {activeTab === 'pleitos' ? (
                linkedPleitos.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                    Nenhum pleito vinculado a esta OS.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {linkedPleitos.map((p) => (
                      <OsPleitoCard
                        key={p.id}
                        pleito={p}
                        displayId={formatDisplayId(pleitoDisplayIds, p.id)}
                        billings={billings}
                      />
                    ))}
                  </div>
                )
              ) : null}

              {activeTab === 'ocs' ? (
                <OsDetailOcTab
                  serviceOrderId={pleito.serviceOrderId}
                  serviceOrderText={pleito.divSe}
                  enabled={activeTab === 'ocs'}
                  budgetTotal={orcamento > 0 ? orcamento : null}
                />
              ) : null}

              {activeTab === 'faturamento' ? (
                linkedBillings.length === 0 ? (
                  <p className="py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                    Nenhum faturamento vinculado a esta OS.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {linkedBillings.map((b) => (
                      <OsBillingCard
                        key={b.id}
                        billing={b}
                        displayId={formatDisplayId(billingDisplayIds, b.id)}
                        pleitoDisplayId={
                          b.pleitoId ? formatDisplayId(pleitoDisplayIds, b.pleitoId) : null
                        }
                      />
                    ))}
                  </div>
                )
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
