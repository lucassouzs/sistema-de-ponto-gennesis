'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  CheckCircle,
  ClipboardList,
  Clock,
  Eye,
  MoreVertical,
  Pencil,
  Search,
  ShoppingCart,
  X,
  XCircle
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { getListTableRowClassName, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { ListPagination } from '@/components/ui/ListPagination';
import { Loading } from '@/components/ui/Loading';
import type { PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import type { MaterialRequest } from '../_lib/types';
import type { RmCardFilter } from '../_lib/rmCardFilter';
import {
  getPriorityInfo,
  getStatusInfo,
  rmContractDisplay,
  rmSolicitante,
  rmTitulo
} from '../_lib/display';
import { getMaterialRequestDisplayStatus, isMaterialRequestEffectivelyCancelled } from '../_lib/search';
import { formatRmListDisplayId } from '../_lib/rmListDisplay';
import {
  materialRequestOcListRows,
} from '@/components/oc/materialRequestOcListRows';
import { getRmItemCoverageCounts } from '@/lib/rmProcurementCoverage';
import { formatRmItemProductKinds } from '@/lib/rmItemProductKinds';
import {
  Z_ACTION_MENU,
} from '@/lib/zIndex';
const cellPad = 'px-2 sm:px-3 py-3';
const cellPadTh = 'px-2 sm:px-3 py-4';
const rmColCls = 'w-[4%] min-w-[3rem] max-w-[4.5rem]';
const itensColCls = 'w-[7%] min-w-[4.5rem]';
const tipoColCls = 'w-[9%] min-w-[5.5rem]';
const ocColCls = 'w-[5%] min-w-[3.5rem]';
const actionColCls = 'w-[4%] min-w-[3rem] max-w-[4.5rem]';
const thTextCls = `${cellPadTh} text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`;
const thCenterCls = `${cellPadTh} text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap`;
const rmThCls = `${thCenterCls} ${rmColCls} !pl-2 sm:!pl-3 !pr-1`;
const rmTdCls = `${cadastroListClasses.tdMono} ${rmColCls} text-center !pl-2 sm:!pl-3 !pr-1`;
const itensThCls = `${thCenterCls} ${itensColCls}`;
const itensTdCls = `${cellPad} ${itensColCls} text-center align-middle`;
const tipoThCls = `${thCenterCls} ${tipoColCls}`;
const tipoTdCls = `${cellPad} ${tipoColCls} text-center align-middle`;
const ocThCls = `${thCenterCls} ${ocColCls}`;
const ocTdCls = `${cadastroListClasses.tdMono} ${ocColCls} text-center align-middle !px-2 sm:!px-3`;
const tdTextCls = `${cellPad} text-left text-sm text-gray-700 dark:text-gray-300 min-w-0`;
const tdCenterCls = `${cellPad} text-center text-sm min-w-0`;

const LIST_ITEMS_PER_PAGE = 12;
const RM_ACTION_MENU_WIDTH_PX = 224;
const actionThCls = `${cadastroListClasses.thRight} ${actionColCls} !pl-1 !pr-2 sm:!pr-3`;
const actionTdCls = `${actionColCls} !pl-1 !pr-2 sm:!pr-3 py-3 align-middle`;

const MENU_ITEM_CLASS =
  'w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700';
const MENU_ITEM_BORDER_CLASS = `${MENU_ITEM_CLASS} border-t border-gray-200 dark:border-gray-700`;

const RM_CARD_LIST_CONFIG: Record<
  RmCardFilter,
  { title: string; subtitle: string; iconBg: string; iconColor: string; Icon: typeof ClipboardList }
> = {
  all: {
    title: 'Todas as requisições',
    subtitle: 'Visão geral das solicitações de materiais.',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: ClipboardList
  },
  pending: {
    title: 'Requisições pendentes',
    subtitle: 'Aprove, envie para correção ou cancele a solicitação.',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock
  },
  approved: {
    title: 'Requisições aprovadas',
    subtitle: 'Solicitações aprovadas, com ou sem ordem de compra gerada.',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle
  },
  awaitingOc: {
    title: 'Aguardando OC',
    subtitle: 'Requisições aprovadas sem ordem de compra — prontas para mapa de cotação.',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    Icon: ShoppingCart
  },
  cancelled: {
    title: 'Requisições canceladas',
    subtitle: 'Histórico de solicitações canceladas.',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle
  }
};

export function MaterialRequestsRmList({
  cardFilter,
  searchTerm,
  onSearchChange,
  loadingRequests,
  filteredRequests,
  ordersByMaterialRequestId,
  currentUserId,
  onDetails,
  flushInCard = false,
  hideSearch = false
}: {
  cardFilter: RmCardFilter;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  hideSearch?: boolean;
  flushInCard?: boolean;
  loadingRequests: boolean;
  filteredRequests: MaterialRequest[];
  ordersByMaterialRequestId: Map<string, PurchaseOrder[]>;
  currentUserId?: string;
  onDetails: (r: MaterialRequest) => void;
}) {
  const [listCurrentPage, setListCurrentPage] = useState(1);
  const [actionMenu, setActionMenu] = useState<{
    requestId: string;
    top: number;
    left: number;
  } | null>(null);

  const meta = RM_CARD_LIST_CONFIG[cardFilter];
  const ListHeaderIcon = meta.Icon;
  const showStatusColumn = cardFilter === 'all';

  const listTotal = filteredRequests.length;
  const listTotalPages = Math.max(1, Math.ceil(listTotal / LIST_ITEMS_PER_PAGE));
  const listStartIndex = (listCurrentPage - 1) * LIST_ITEMS_PER_PAGE;
  const paginatedRequests = filteredRequests.slice(
    listStartIndex,
    listStartIndex + LIST_ITEMS_PER_PAGE
  );
  const listStartItem = listTotal === 0 ? 0 : listStartIndex + 1;
  const listEndItem = Math.min(listStartIndex + LIST_ITEMS_PER_PAGE, listTotal);

  const requestForMenu = useMemo(() => {
    if (!actionMenu) return null;
    return (
      paginatedRequests.find((r) => r.id === actionMenu.requestId) ??
      filteredRequests.find((r) => r.id === actionMenu.requestId) ??
      null
    );
  }, [actionMenu, paginatedRequests, filteredRequests]);

  useEffect(() => {
    setListCurrentPage(1);
  }, [cardFilter, searchTerm, listTotal]);

  useEffect(() => {
    if (listCurrentPage > listTotalPages) {
      setListCurrentPage(listTotalPages);
    }
  }, [listCurrentPage, listTotalPages]);

  useEffect(() => {
    if (actionMenu && !requestForMenu) {
      setActionMenu(null);
    }
  }, [actionMenu, requestForMenu]);

  return (
    <Card
      className={`w-full ${flushInCard ? 'rounded-none border-0 border-t-0 shadow-none' : ''}`}
    >
      <CardHeader className={`border-b-0 pb-1 ${flushInCard ? 'pt-4' : ''}`}>
        <div
          className={
            hideSearch
              ? 'flex items-center space-x-3'
              : 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4'
          }
        >
          <div className="flex items-center space-x-3">
            <div className={`p-2 sm:p-3 rounded-lg flex-shrink-0 ${meta.iconBg}`}>
              <ListHeaderIcon className={`w-5 h-5 sm:w-6 sm:h-6 ${meta.iconColor}`} />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{meta.title}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">{meta.subtitle}</p>
            </div>
          </div>
          {!hideSearch ? (
            <div className="relative min-w-[240px] flex-1 sm:w-[300px] sm:flex-none sm:max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                inputMode="search"
                autoComplete="off"
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Buscar por nome, OS ou contrato..."
                className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              {searchTerm ? (
                <button
                  type="button"
                  onClick={() => onSearchChange('')}
                  aria-label="Limpar busca"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {loadingRequests ? (
          <div className="text-center py-8">
            <Loading message="Carregando requisições..." />
          </div>
        ) : listTotal === 0 ? (
          <div className="text-center py-8">
            <ClipboardList className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">
              {searchTerm.trim()
                ? 'Nenhuma requisição corresponde à busca neste filtro'
                : cardFilter === 'all'
                  ? 'Nenhuma requisição encontrada'
                  : 'Nenhuma requisição neste filtro'}
            </p>
            {searchTerm.trim() ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Limpar busca
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
              <span>
                Mostrando {listStartItem} a {listEndItem} de {listTotal} requisição(ões)
              </span>
              <span>
                Página {listCurrentPage} de {listTotalPages}
              </span>
            </div>
            <div className="table-scroll">
              <table className={`${cadastroListClasses.table} text-sm`}>
                <colgroup>
                  <col className="w-[4%]" />
                  <col className={showStatusColumn ? 'w-[12%]' : 'w-[14%]'} />
                  <col className={showStatusColumn ? 'w-[10%]' : 'w-[12%]'} />
                  <col className={showStatusColumn ? 'w-[14%]' : 'w-[16%]'} />
                  <col className={showStatusColumn ? 'w-[8%]' : 'w-[10%]'} />
                  {showStatusColumn ? <col className="w-[8%]" /> : null}
                  <col className={itensColCls} />
                  <col className={tipoColCls} />
                  <col className={ocColCls} />
                  <col className={showStatusColumn ? 'w-[11%]' : 'w-[13%]'} />
                  <col className="w-[4%]" />
                </colgroup>
                <thead className="border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th scope="col" className={rmThCls}>
                      RM
                    </th>
                    <th className={thTextCls}>Solicitante</th>
                    <th className={thCenterCls}>OS</th>
                    <th className={thCenterCls}>Contrato</th>
                    <th className={thCenterCls}>Prioridade</th>
                    {showStatusColumn && <th className={thCenterCls}>Status</th>}
                    <th className={itensThCls}>Itens</th>
                    <th className={tipoThCls}>Tipo</th>
                    <th className={ocThCls}>OC</th>
                    <th className={thCenterCls}>Status OC</th>
                    <th
                      scope="col"
                      className={actionThCls}
                    >
                      Ação
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {paginatedRequests.map((request) => {
                    const priorityInfo = getPriorityInfo(request.priority);
                    const ocs = ordersByMaterialRequestId.get(request.id) ?? [];
                    const ocRows = materialRequestOcListRows(request, ocs);
                    const displayStatus = getMaterialRequestDisplayStatus(request, ocs);
                    const statusInfo = getStatusInfo(displayStatus);
                    const { total: itemTotal, pending: itemPending } = getRmItemCoverageCounts(
                      request,
                      ocs
                    );
                    const showPendingLine =
                      request.status === 'APPROVED' &&
                      !isMaterialRequestEffectivelyCancelled(request, ocs) &&
                      itemPending != null &&
                      itemPending > 0;
                    const tipoLabel = formatRmItemProductKinds(request.itemProductKinds);

                    return (
                      <tr
                        key={request.id}
                        onClick={() => onDetails(request)}
                        className={getListTableRowClassName(true)}
                      >
                        <td
                          className={rmTdCls}
                          title={request.requestNumber || undefined}
                        >
                          <ListRowNavigableLabel className="font-medium">
                            {formatRmListDisplayId(request.requestNumber)}
                          </ListRowNavigableLabel>
                        </td>
                        <td className={tdTextCls}>
                          <span className="block truncate">{rmSolicitante(request)?.name || '—'}</span>
                        </td>
                        <td className={tdCenterCls} title={rmTitulo(request)}>
                          <span className="line-clamp-2">{rmTitulo(request)}</span>
                        </td>
                        <td className={tdCenterCls} title={rmContractDisplay(request)}>
                          <span className="line-clamp-2">{rmContractDisplay(request)}</span>
                        </td>
                        <td className={tdCenterCls}>
                          <span className={`text-xs font-medium whitespace-nowrap ${priorityInfo.color}`}>
                            {priorityInfo.label}
                          </span>
                        </td>
                        {showStatusColumn && (
                          <td className={tdCenterCls}>
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${statusInfo.color}`}
                            >
                              {statusInfo.label}
                            </span>
                          </td>
                        )}
                        <td className={itensTdCls}>
                          {itemTotal == null ? (
                            <span className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">—</span>
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-0.5 leading-tight">
                              <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                                {itemTotal}
                              </span>
                              {showPendingLine ? (
                                <span
                                  className="text-[11px] font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap"
                                  title={`${itemPending} item(ns) ainda sem ordem de compra`}
                                >
                                  {itemPending} pendente{itemPending === 1 ? '' : 's'}
                                </span>
                              ) : null}
                            </div>
                          )}
                        </td>
                        <td className={tipoTdCls} title={tipoLabel === '—' ? undefined : tipoLabel}>
                          {tipoLabel === '—' ? (
                            <span className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">—</span>
                          ) : (
                            <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                              {tipoLabel}
                            </span>
                          )}
                        </td>
                        <td className={ocTdCls}>
                          {ocRows.length === 0 ? (
                            <span className="block text-center text-xs sm:text-sm text-gray-400 dark:text-gray-500">—</span>
                          ) : (
                            <div className="mx-auto flex w-full flex-col items-center justify-center gap-0.5 text-xs sm:text-sm">
                              {ocRows.map((row) => (
                                <span
                                  key={row.key}
                                  className="block w-full text-center font-medium whitespace-nowrap"
                                  title={row.idTitle}
                                >
                                  {row.id}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className={`${tdCenterCls} align-middle`}>
                          {ocRows.length === 0 ? (
                            <span className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">—</span>
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-1">
                              {ocRows.map((row) => (
                                <span
                                  key={row.key}
                                  className={row.statusBadgeClassName}
                                  title={row.status}
                                >
                                  {row.status}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className={actionTdCls} onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActionMenu((prev) => {
                                  if (prev?.requestId === request.id) return null;
                                  let left = rect.right - RM_ACTION_MENU_WIDTH_PX;
                                  left = Math.max(
                                    8,
                                    Math.min(left, window.innerWidth - RM_ACTION_MENU_WIDTH_PX - 8)
                                  );
                                  return { requestId: request.id, top: rect.bottom + 4, left };
                                });
                              }}
                              className={rowActionMenuButtonClass(actionMenu?.requestId === request.id)}
                              aria-label="Menu de ações"
                              aria-expanded={actionMenu?.requestId === request.id}
                              aria-haspopup="menu"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ListPagination
              currentPage={listCurrentPage}
              totalPages={listTotalPages}
              onPageChange={setListCurrentPage}
            />
          </>
        )}
      </CardContent>

      {actionMenu &&
        requestForMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0"
            style={{ zIndex: Z_ACTION_MENU }}
            onClick={() => setActionMenu(null)}
          >
            <div
              role="menu"
              className="absolute w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
              style={{
                top: actionMenu.top,
                left: actionMenu.left,
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setActionMenu(null);
                  onDetails(requestForMenu);
                }}
                className={MENU_ITEM_CLASS}
              >
                <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>Ver detalhes</span>
              </button>
              {requestForMenu.status === 'IN_REVIEW' &&
                currentUserId === rmSolicitante(requestForMenu)?.id && (
                  <Link
                    href={`/ponto/solicitar-materiais?editRm=${requestForMenu.id}`}
                    role="menuitem"
                    onClick={() => setActionMenu(null)}
                    className={MENU_ITEM_BORDER_CLASS}
                  >
                    <Pencil className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                    <span>Editar RM</span>
                  </Link>
                )}
            </div>
          </div>,
          document.body
        )}
    </Card>
  );
}
