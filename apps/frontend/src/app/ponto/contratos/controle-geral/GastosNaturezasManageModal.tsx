'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Link2, Sparkles, Unlink } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { ModalCloseConfirm } from '@/components/ui/ModalCloseConfirm';
import { Button } from '@/components/ui/Button';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { normalizeGastosOperacionaisNaturezaKey } from './gastosOperacionaisDfcBlocks';
import { gastosNaturezaTotalContribution } from './gastosOperacionaisAllowedNaturezas';
import {
  fetchGastosNaturezasConfigFromServer,
  pushGastosNaturezasConfigToServer
} from './gastosOperacionaisNaturezasConfigApi';
import {
  acknowledgeAllNewTotvsNaturezas,
  acknowledgeTotvsNatureza,
  buildConfiguredNaturezaCatalog,
  buildTotvsNaturezaItems,
  collectNaturezaKeysInUse,
  getCanonicalOptionsForBlock,
  getDfcBlockSelectOptions,
  loadGastosNaturezasConfigStore,
  mapTotvsNaturezaToBlock,
  unlinkConfiguredNatureza,
  type GastosConfiguredNaturezaItem,
  type GastosTotvsNaturezaItem
} from './gastosOperacionaisNaturezasStore';

export type GastosTotvsNaturezaCatalogRow = {
  label: string;
  /** Soma líquida com sinal do TOTVS. */
  total: number;
  totalAbs: number;
  isConfigured: boolean;
  byContract?: Array<{ contract: string; total: number }>;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  totvsNaturezas: readonly GastosTotvsNaturezaCatalogRow[];
  onConfigChanged: () => void;
  /** Após persistir no servidor: refetch dos gastos nos módulos. */
  onTotalsShouldRefresh?: () => void;
};

type MappingDraft = {
  totvsLabel: string;
  blockId: string;
  targetCanonicalLabel: string;
  asAlias: boolean;
  newCanonicalLabel: string;
  sumAsPositiveCredit: boolean;
};

type NaturezaMovementSummary = {
  total: number;
  byContract: Array<{ contract: string; total: number }>;
};

const EMPTY_DRAFT: MappingDraft = {
  totvsLabel: '',
  blockId: '',
  targetCanonicalLabel: '',
  asAlias: false,
  newCanonicalLabel: '',
  sumAsPositiveCredit: false
};

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Valor absoluto neutro — sem classificar entrada/saída (lista fora do catálogo). */
function formatNeutralMovement(total: number): string {
  return formatCurrency(Math.abs(total));
}

function formatSignedMovement(total: number): { text: string; className: string; hint: string } {
  if (total > 0) {
    return {
      text: formatCurrency(total),
      className: 'text-emerald-700 dark:text-emerald-300',
      hint: 'Crédito / entrada'
    };
  }
  if (total < 0) {
    return {
      text: formatCurrency(total),
      className: 'text-red-700 dark:text-red-300',
      hint: 'Despesa / saída'
    };
  }
  return {
    text: formatCurrency(0),
    className: 'text-gray-500 dark:text-gray-400',
    hint: 'Zerado'
  };
}

function toModuleSignedTotal(natureza: string, rawTotal: number): number {
  return gastosNaturezaTotalContribution(natureza, rawTotal);
}

/**
 * Sugere "entrada/crédito" pelo nome (ex.: DESBLOQUEIO, ESTORNO, ENTRADA).
 * O usuário confirma no vínculo — a lista fora do catálogo não assume sinal.
 */
function suggestSumAsPositiveCredit(label: string): boolean {
  const key = normalizeGastosOperacionaisNaturezaKey(label);
  if (!key) return false;
  return (
    /\b(DESBLOQUEIO|DESBLOQUEIOS|ESTORNO|ESTORNOS|DEVOLUCAO|DEVOLUCOES|CREDITO|CREDITOS|ENTRADA|ENTRADAS|RESSARCIMENTO|RESSARCIMENTOS|REEMBOLSO|REEMBOLSOS|RECEBIMENTO|RECEBIMENTOS)\b/.test(
      key
    ) || /-\s*ENTRADA\b/.test(key)
  );
}

function aggregateMovementForConfigured(
  item: GastosConfiguredNaturezaItem,
  totvsByKey: Map<string, GastosTotvsNaturezaItem>
): NaturezaMovementSummary {
  const keys = new Set<string>([
    item.key,
    normalizeGastosOperacionaisNaturezaKey(item.label),
    ...item.aliases.map((alias) => normalizeGastosOperacionaisNaturezaKey(alias))
  ]);
  keys.delete('');

  let total = 0;
  const contractMap = new Map<string, number>();

  for (const key of keys) {
    const row = totvsByKey.get(key);
    if (!row) continue;
    total += toModuleSignedTotal(row.label, row.total);
    for (const entry of row.byContract) {
      const signed = toModuleSignedTotal(row.label, entry.total);
      contractMap.set(entry.contract, (contractMap.get(entry.contract) ?? 0) + signed);
    }
  }

  return {
    total,
    byContract: Array.from(contractMap.entries())
      .map(([contract, contractTotal]) => ({ contract, total: contractTotal }))
      .filter((entry) => entry.total !== 0)
      .sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  };
}

function groupConfiguredByBlock(items: GastosConfiguredNaturezaItem[]) {
  const groups = new Map<string, GastosConfiguredNaturezaItem[]>();
  for (const item of items) {
    const list = groups.get(item.blockPath) ?? [];
    list.push(item);
    groups.set(item.blockPath, list);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
}

export function GastosNaturezasManageModal({
  isOpen,
  onClose,
  totvsNaturezas,
  onConfigChanged,
  onTotalsShouldRefresh
}: Props) {
  const [storeVersion, setStoreVersion] = useState(0);
  const [activeTab, setActiveTab] = useState<'configured' | 'new'>('configured');
  const [mappingDraft, setMappingDraft] = useState<MappingDraft | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<GastosConfiguredNaturezaItem | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [isSyncingConfig, setIsSyncingConfig] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('configured');
    setMappingDraft(null);
    setUnlinkTarget(null);
    setExpandedKeys(new Set());

    let cancelled = false;
    setIsSyncingConfig(true);
    void fetchGastosNaturezasConfigFromServer()
      .then(() => {
        if (cancelled) return;
        setStoreVersion((value) => value + 1);
        onConfigChanged();
      })
      .catch(() => {
        // Mantém config local se o servidor estiver indisponível.
      })
      .finally(() => {
        if (!cancelled) setIsSyncingConfig(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, onConfigChanged]);

  const persistAndRefreshTotals = async () => {
    try {
      await pushGastosNaturezasConfigToServer();
      onTotalsShouldRefresh?.();
    } catch {
      toast.error('Configuração salva neste navegador, mas falhou ao sincronizar com o servidor.');
    }
  };

  const refresh = () => {
    setStoreVersion((value) => value + 1);
    onConfigChanged();
  };

  const store = useMemo(() => loadGastosNaturezasConfigStore(), [storeVersion, isOpen]);

  const configuredCatalog = useMemo(
    () => buildConfiguredNaturezaCatalog(store),
    [store]
  );

  const totvsItems = useMemo(
    () => buildTotvsNaturezaItems(totvsNaturezas, store),
    [totvsNaturezas, store]
  );

  const totvsByKey = useMemo(() => {
    const map = new Map<string, GastosTotvsNaturezaItem>();
    for (const item of totvsItems) {
      map.set(item.key, item);
    }
    return map;
  }, [totvsItems]);

  const configuredMovementByRowKey = useMemo(() => {
    const map = new Map<string, NaturezaMovementSummary>();
    for (const item of configuredCatalog) {
      const rowKey = `${item.blockId}-${item.key}-${item.customMappingId ?? 'built-in'}`;
      map.set(rowKey, aggregateMovementForConfigured(item, totvsByKey));
    }
    return map;
  }, [configuredCatalog, totvsByKey]);

  const toggleExpanded = (rowKey: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) next.delete(rowKey);
      else next.add(rowKey);
      return next;
    });
  };

  const inUseKeys = useMemo(
    () => collectNaturezaKeysInUse(totvsNaturezas, configuredCatalog),
    [totvsNaturezas, configuredCatalog]
  );

  const unmappedItems = useMemo(
    () =>
      [...totvsItems.filter((item) => item.isNew)].sort((a, b) => {
        if (a.isAcknowledged !== b.isAcknowledged) {
          return a.isAcknowledged ? 1 : -1;
        }
        return a.label.localeCompare(b.label, 'pt-BR');
      }),
    [totvsItems]
  );

  const unseenUnmappedCount = useMemo(
    () => unmappedItems.filter((item) => !item.isAcknowledged).length,
    [unmappedItems]
  );

  const configuredGroups = useMemo(
    () => groupConfiguredByBlock(configuredCatalog),
    [configuredCatalog]
  );

  const blockOptions = useMemo(() => getDfcBlockSelectOptions(), []);
  const canonicalOptions = useMemo(
    () => (mappingDraft?.blockId ? getCanonicalOptionsForBlock(mappingDraft.blockId, store) : []),
    [mappingDraft?.blockId, store]
  );

  const handleStartMapping = (item: GastosTotvsNaturezaItem) => {
    const blockId = blockOptions[0]?.value ?? '';
    setMappingDraft({
      ...EMPTY_DRAFT,
      totvsLabel: item.label,
      blockId,
      newCanonicalLabel: item.label,
      sumAsPositiveCredit: suggestSumAsPositiveCredit(item.label),
      targetCanonicalLabel: blockId
        ? getCanonicalOptionsForBlock(blockId, loadGastosNaturezasConfigStore())[0]?.value ?? ''
        : ''
    });
    setActiveTab('new');
  };

  const handleSaveMapping = () => {
    if (!mappingDraft) return;

    try {
      const targetCanonicalLabel = mappingDraft.asAlias
        ? mappingDraft.targetCanonicalLabel
        : mappingDraft.newCanonicalLabel;

      mapTotvsNaturezaToBlock({
        totvsLabel: mappingDraft.totvsLabel,
        blockId: mappingDraft.blockId,
        targetCanonicalLabel,
        asAlias: mappingDraft.asAlias,
        sumAsPositiveCredit: mappingDraft.sumAsPositiveCredit
      });

      setMappingDraft(null);
      refresh();
      void persistAndRefreshTotals();
      toast.success('Natureza vinculada ao catálogo.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível vincular a natureza.');
    }
  };

  const handleAcknowledge = (item: GastosTotvsNaturezaItem) => {
    acknowledgeTotvsNatureza(item.label);
    refresh();
    void persistAndRefreshTotals();
  };

  const handleAcknowledgeAll = () => {
    acknowledgeAllNewTotvsNaturezas(totvsNaturezas);
    refresh();
    void persistAndRefreshTotals();
    toast.success('Novas naturezas marcadas como visualizadas.');
  };

  const handleUnlinkConfigured = (item: GastosConfiguredNaturezaItem) => {
    setUnlinkTarget(item);
  };

  const handleConfirmUnlink = () => {
    if (!unlinkTarget) return;

    try {
      unlinkConfiguredNatureza(unlinkTarget);
      setUnlinkTarget(null);
      refresh();
      void persistAndRefreshTotals();
      toast.success('Natureza desvinculada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível desvincular.');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Naturezas de gastos operacionais" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Catálogo configurado para os totais do módulo. Naturezas do TOTVS que ainda não estão no
          catálogo aparecem na aba <strong>Fora do catálogo</strong>. O selo{' '}
          <strong>Nova</strong> marca só o que você ainda não visualizou.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('configured')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'configured'
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Configuradas ({configuredCatalog.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('new')}
            className={`relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              activeTab === 'new'
                ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
            }`}
          >
            Fora do catálogo ({unmappedItems.length})
            {unseenUnmappedCount > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white dark:ring-gray-900">
                {unseenUnmappedCount > 9 ? '9+' : unseenUnmappedCount}
              </span>
            ) : null}
          </button>
        </div>

        {activeTab === 'configured' ? (
          <div className="max-h-[min(58vh,28rem)] space-y-4 overflow-y-auto pr-1">
            {configuredGroups.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                Nenhuma natureza configurada.
              </p>
            ) : (
              configuredGroups.map(([blockPath, items]) => (
                <div key={blockPath} className="rounded-xl border border-gray-200 dark:border-gray-700">
                  <div className="border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-300">
                    {blockPath}
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {items.map((item) => {
                      const rowKey = `${item.blockId}-${item.key}-${item.customMappingId ?? 'built-in'}`;
                      const movement = configuredMovementByRowKey.get(rowKey) ?? {
                        total: 0,
                        byContract: []
                      };
                      const isInUse = movement.byContract.length > 0 || inUseKeys.has(item.key);
                      const signed = formatSignedMovement(movement.total);
                      const isExpanded = expandedKeys.has(rowKey);
                      const canExpand = movement.byContract.length > 0;

                      return (
                        <div
                          key={rowKey}
                          className="px-3 py-2.5"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                {canExpand ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleExpanded(rowKey)}
                                    className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                                    aria-label={isExpanded ? 'Recolher centros de custo' : 'Ver centros de custo'}
                                    title={isExpanded ? 'Recolher' : 'Ver centros de custo'}
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                  </button>
                                ) : (
                                  <span className="inline-flex h-6 w-6 shrink-0" />
                                )}
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                  {item.label}
                                </p>
                                {isInUse ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                                    <Check className="h-3 w-3" />
                                    Em uso
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                    Sem movimento
                                  </span>
                                )}
                              </div>
                              {(() => {
                                const visibleAliases = item.aliases.filter(
                                  (alias) =>
                                    alias.trim().toLocaleUpperCase('pt-BR') !==
                                    item.label.trim().toLocaleUpperCase('pt-BR')
                                );
                                if (visibleAliases.length === 0) return null;
                                return (
                                  <p className="mt-1 pl-8 text-xs text-gray-500 dark:text-gray-400">
                                    {visibleAliases.join(' · ')}
                                  </p>
                                );
                              })()}
                            </div>

                            <div className="flex shrink-0 items-center gap-2 pl-8 sm:pl-0">
                              <span
                                className={`text-sm font-semibold tabular-nums ${signed.className}`}
                                title={signed.hint}
                              >
                                {signed.text}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUnlinkConfigured(item)}
                                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                title="Desvincular do catálogo"
                                aria-label={`Desvincular ${item.label}`}
                              >
                                <Unlink className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>

                          {isExpanded && canExpand ? (
                            <div className="mt-2 ml-8 space-y-1 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/40">
                              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                Centros de custo ({movement.byContract.length})
                              </p>
                              {movement.byContract.map((entry) => {
                                const entrySigned = formatSignedMovement(entry.total);
                                return (
                                  <div
                                    key={entry.contract}
                                    className="flex items-start justify-between gap-3 text-xs"
                                  >
                                    <span className="min-w-0 flex-1 text-gray-700 dark:text-gray-300">
                                      {entry.contract}
                                    </span>
                                    <span
                                      className={`shrink-0 font-semibold tabular-nums ${entrySigned.className}`}
                                    >
                                      {entrySigned.text}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {unmappedItems.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {unmappedItems.length} natureza(s) fora do catálogo
                  {unseenUnmappedCount > 0
                    ? ` · ${unseenUnmappedCount} nova(s) ainda não visualizada(s)`
                    : ''}
                  .
                </p>
                {unseenUnmappedCount > 0 ? (
                  <Button type="button" size="sm" variant="secondary" onClick={handleAcknowledgeAll}>
                    Marcar todas como visualizadas
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="max-h-[min(50vh,24rem)] space-y-2 overflow-y-auto pr-1">
              {unmappedItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                  Nenhuma natureza fora do catálogo no TOTVS RM.
                </p>
              ) : (
                unmappedItems.map((item) => {
                  const movementAbs =
                    Number.isFinite(item.totalAbs) && item.totalAbs > 0
                      ? item.totalAbs
                      : Math.abs(item.total);
                  const showNovaBadge = !item.isAcknowledged;
                  const expandKey = `unmapped-${item.key}`;
                  const isExpanded = expandedKeys.has(expandKey);
                  const contractsByAbs = item.byContract
                    .map((entry) => ({
                      contract: entry.contract,
                      totalAbs: Math.abs(entry.total)
                    }))
                    .filter((entry) => entry.totalAbs !== 0)
                    .sort((a, b) => b.totalAbs - a.totalAbs);
                  const canExpand = contractsByAbs.length > 0;
                  return (
                  <div
                    key={item.key}
                    className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {canExpand ? (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(expandKey)}
                              className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                              aria-label={isExpanded ? 'Recolher centros de custo' : 'Ver centros de custo'}
                              title={isExpanded ? 'Recolher' : 'Ver centros de custo'}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex h-6 w-6 shrink-0" />
                          )}
                          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                            {item.label}
                          </p>
                          {showNovaBadge ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-300">
                              <Sparkles className="h-3 w-3" />
                              Nova
                            </span>
                          ) : null}
                        </div>
                        <p
                          className="pl-8 text-xs text-gray-600 dark:text-gray-400"
                          title="Volume no TOTVS (sem classificar gasto ou entrada)"
                        >
                          Movimento: {formatNeutralMovement(movementAbs)}
                        </p>
                      </div>

                      <div className="flex shrink-0 flex-wrap items-center gap-1.5 pl-8 sm:pl-0">
                        <button
                          type="button"
                          onClick={() => handleStartMapping(item)}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          title="Vincular"
                          aria-label={`Vincular ${item.label}`}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </button>
                        {showNovaBadge ? (
                          <button
                            type="button"
                            onClick={() => handleAcknowledge(item)}
                            className="rounded-lg px-2 py-1 text-xs font-medium text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            Marcar vista
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {isExpanded && canExpand ? (
                      <div className="mt-2 ml-8 space-y-1 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/40">
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          Centros de custo ({contractsByAbs.length})
                        </p>
                        {contractsByAbs.map((entry) => (
                          <div
                            key={entry.contract}
                            className="flex items-start justify-between gap-3 text-xs"
                          >
                            <span className="min-w-0 flex-1 text-gray-700 dark:text-gray-300">
                              {entry.contract}
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-gray-700 dark:text-gray-300">
                              {formatNeutralMovement(entry.totalAbs)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500 dark:text-gray-400">
          Vínculos ficam salvos no servidor e atualizam os totais de Gastos Operacionais, Controle
          Geral, contratos e sócios após sincronizar.
          {isSyncingConfig ? ' Sincronizando configuração…' : ''}
        </p>

        <div className="flex justify-end">
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>

      <Modal
        isOpen={Boolean(mappingDraft)}
        onClose={() => setMappingDraft(null)}
        title="Vincular natureza"
        size="md"
        elevated
        confirmBeforeClose
        contentOverflowVisible
      >
        {mappingDraft ? (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Natureza do TOTVS:{' '}
              <span className="font-medium text-amber-800 dark:text-amber-300">
                {mappingDraft.totvsLabel}
              </span>
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Bloco DFC
                </label>
                <StringSingleSelectDropdown
                  options={blockOptions}
                  value={mappingDraft.blockId}
                  onChange={(blockId) =>
                    setMappingDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            blockId,
                            targetCanonicalLabel:
                              getCanonicalOptionsForBlock(blockId, store)[0]?.value ?? ''
                          }
                        : prev
                    )
                  }
                  placeholder="Selecione o bloco"
                  allowEmpty={false}
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                  Tipo de vínculo
                </label>
                <StringSingleSelectDropdown
                  options={[
                    { value: 'new', label: 'Nova natureza no bloco' },
                    { value: 'alias', label: 'Alias de natureza existente' }
                  ]}
                  value={mappingDraft.asAlias ? 'alias' : 'new'}
                  onChange={(value) =>
                    setMappingDraft((prev) => {
                      if (!prev) return prev;
                      const asAlias = value === 'alias';
                      return {
                        ...prev,
                        asAlias,
                        newCanonicalLabel:
                          !asAlias && !prev.newCanonicalLabel.trim()
                            ? prev.totvsLabel
                            : prev.newCanonicalLabel,
                        targetCanonicalLabel:
                          asAlias && !prev.targetCanonicalLabel
                            ? getCanonicalOptionsForBlock(prev.blockId, store)[0]?.value ?? ''
                            : prev.targetCanonicalLabel
                      };
                    })
                  }
                  placeholder="Tipo"
                  allowEmpty={false}
                  disableSearch
                />
              </div>

              {mappingDraft.asAlias ? (
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                    Natureza canônica
                  </label>
                  <StringSingleSelectDropdown
                    options={canonicalOptions}
                    value={mappingDraft.targetCanonicalLabel}
                    onChange={(targetCanonicalLabel) =>
                      setMappingDraft((prev) => (prev ? { ...prev, targetCanonicalLabel } : prev))
                    }
                    placeholder="Selecione a natureza"
                    allowEmpty={false}
                  />
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    O efeito no total (gasto ou entrada) herda da natureza canônica.
                  </p>
                </div>
              ) : (
                <>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Nome da nova natureza
                    </label>
                    <input
                      type="text"
                      value={mappingDraft.newCanonicalLabel}
                      onChange={(e) =>
                        setMappingDraft((prev) =>
                          prev ? { ...prev, newCanonicalLabel: e.target.value } : prev
                        )
                      }
                      placeholder="Ex.: NOVA DESPESA OPERACIONAL"
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                      Efeito no total do módulo
                    </label>
                    <StringSingleSelectDropdown
                      options={[
                        { value: 'expense', label: 'Gasto (reduz o total)' },
                        { value: 'credit', label: 'Entrada / crédito (aumenta o total)' }
                      ]}
                      value={mappingDraft.sumAsPositiveCredit ? 'credit' : 'expense'}
                      onChange={(value) =>
                        setMappingDraft((prev) =>
                          prev
                            ? { ...prev, sumAsPositiveCredit: value === 'credit' }
                            : prev
                        )
                      }
                      placeholder="Selecione"
                      allowEmpty={false}
                      disableSearch
                    />
                    <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {suggestSumAsPositiveCredit(mappingDraft.totvsLabel)
                        ? 'Sugestão automática pelo nome: entrada/crédito — confirme ou ajuste.'
                        : 'Sugestão automática pelo nome: gasto — confirme ou ajuste.'}
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setMappingDraft(null)}>
                Cancelar
              </Button>
              <Button type="button" onClick={handleSaveMapping}>
                Salvar vínculo
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ModalCloseConfirm
        isOpen={Boolean(unlinkTarget)}
        onCancel={() => setUnlinkTarget(null)}
        onConfirm={handleConfirmUnlink}
        title="Desvincular natureza?"
        message={
          unlinkTarget
            ? `Desvincular "${unlinkTarget.label}" do catálogo? Ela sai de Configuradas. Se ainda existir no TOTVS, aparece em Fora do catálogo.`
            : ''
        }
        confirmLabel="Desvincular"
      />
    </Modal>
  );
}
