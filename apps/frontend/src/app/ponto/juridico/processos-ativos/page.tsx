'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  Briefcase,
  FileCheck2,
  Filter,
  Gavel,
  LayoutGrid,
  Paperclip,
  PauseCircle,
  Plus,
  Scale,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { Modal } from '@/components/ui/Modal';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
} from '@/components/ui/CadastroListSummary';
import {
  cadastroListClasses,
  RowActionMenuCell,
  RowActionMenuPortal,
} from '@/components/ui/RowActionMenu';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  getListTableRowClassName,
  listTableRowClasses,
  ListRowNavigableLabel,
  rowActionMenuButtonClass,
} from '@/components/ui/listTableUi';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { JuridicoImportModal } from '@/components/juridico/JuridicoImportModal';
import {
  JuridicoImportMenu,
  type JuridicoImportAction,
} from '@/components/juridico/JuridicoImportMenu';
import {
  JuridicoLinkPendingFilesModal,
  type JuridicoLinkPendingKind,
} from '@/components/juridico/JuridicoLinkPendingFilesModal';
import { JuridicoProcessoAnexosModal } from '@/components/juridico/JuridicoProcessoAnexosModal';
import { JuridicoProcessoEditModal } from '@/components/juridico/JuridicoProcessoEditModal';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import api from '@/lib/api';
import { normalizeSearchText } from '@/lib/normalizeSearchText';
import { resolveContratoNome } from '@/data/juridico-contratos';
import {
  cellText,
  formatProcessoStatus,
  statusBadgeClass,
  statusCardLabel,
  statusListTitle,
  statusStatIconClasses,
  type JuridicoProcesso,
} from '@/data/juridico-processos-ativos';

const ITEMS_PER_PAGE = 20;

type ListFilters = {
  empresa: string;
  contrato: string;
  polo: string;
  arquivos: '' | 'pendentes' | 'vinculados';
};

const EMPTY_LIST_FILTERS: ListFilters = {
  empresa: '',
  contrato: '',
  polo: '',
  arquivos: '',
};

type ListColumn = {
  key: keyof JuridicoProcesso;
  label: string;
  badge?: boolean;
  align?: 'left' | 'center';
};

const COLUMNS: ListColumn[] = [
  { key: 'reclamante', label: 'Reclamante' },
  { key: 'numeroProcesso', label: 'Nº Processo' },
  { key: 'tribunal', label: 'Tribunal', align: 'center' },
  { key: 'dataAudiencia', label: 'Data Audiência', align: 'center' },
  { key: 'status', label: 'Status', badge: true, align: 'center' },
  { key: 'contrato', label: 'Contrato', align: 'center' },
  { key: 'empresa', label: 'Empresa', align: 'center' },
];

function cellValue(row: JuridicoProcesso, col: ListColumn): string {
  if (col.key === 'contrato') return resolveContratoNome(row.contrato) || '—';
  if (col.key === 'status') return formatProcessoStatus(row.status, row.statusProcesso);
  const value = row[col.key];
  if (typeof value === 'object' && value !== null) return '—';
  return cellText(value);
}

function matchesSearch(row: JuridicoProcesso, term: string): boolean {
  const haystack = [
    row.reclamante,
    row.numeroProcesso,
    row.tribunal,
    row.vara,
    row.empresa,
    row.polo,
    row.objeto,
    row.funcao,
    row.status,
    row.statusProcesso,
    row.representanteAutor,
    row.contrato,
    resolveContratoNome(row.contrato),
  ]
    .map((value) => normalizeSearchText(String(value ?? '')))
    .join(' | ');
  return term.split(/\s+/).every((piece) => haystack.includes(piece));
}

function arquivosCount(row: JuridicoProcesso): number {
  return (
    (row._count?.anexos ?? row.anexos?.length ?? 0) +
    (row._count?.comprovantes ?? row.comprovantes?.length ?? 0)
  );
}

function arquivosPendentesCount(row: JuridicoProcesso): number {
  return (row.anexosPendentes ?? 0) + (row.comprovantesPendentes ?? 0);
}

function statusStatIcon(status?: string | null): LucideIcon {
  const s = (status || '').toUpperCase();
  if (!status || status === 'all') return LayoutGrid;
  if (s.includes('ARQUIV')) return Archive;
  if (s.includes('ANDAMENTO')) return Scale;
  if (s.includes('SUSPENS')) return PauseCircle;
  if (s.includes('ACORDO')) return FileCheck2;
  if (s.includes('INSTRU') || s.includes('AUDIEN')) return Gavel;
  return Briefcase;
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function ProcessosAtivosPage() {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [listFilters, setListFilters] = useState<ListFilters>(EMPTY_LIST_FILTERS);
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [importAction, setImportAction] = useState<JuridicoImportAction | null>(null);
  const [anexosModal, setAnexosModal] = useState<{
    id: string;
    label: string;
    numeroProcesso?: string;
  } | null>(null);
  const [editProcessoId, setEditProcessoId] = useState<string | null>(null);
  const [showCreateProcesso, setShowCreateProcesso] = useState(false);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['juridico-processos', statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const qs = params.toString();
      const res = await api.get(`/juridico-processos${qs ? `?${qs}` : ''}`);
      return {
        rows: (res.data?.data || []) as JuridicoProcesso[],
        statusCount: (res.data?.meta?.statusCount || {}) as Record<string, number>,
        total: Number(res.data?.meta?.total || 0),
      };
    },
  });

  const statusCount = data?.statusCount || {};
  const filterOptions = useMemo(() => {
    const all = data?.rows || [];
    const empresas = new Set<string>();
    const polos = new Set<string>();
    const contratos = new Map<string, string>();
    for (const row of all) {
      const empresa = (row.empresa || '').trim();
      if (empresa) empresas.add(empresa);
      const polo = (row.polo || '').trim();
      if (polo) polos.add(polo);
      const contrato = (row.contrato || '').trim();
      if (contrato && !contratos.has(contrato)) {
        contratos.set(contrato, resolveContratoNome(contrato) || contrato);
      }
    }
    return {
      empresas: [...empresas].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      polos: [...polos].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      contratos: [...contratos.entries()]
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    };
  }, [data?.rows]);

  const rows = useMemo(() => {
    let next = data?.rows || [];
    if (listFilters.empresa) {
      next = next.filter((row) => (row.empresa || '').trim() === listFilters.empresa);
    }
    if (listFilters.contrato) {
      next = next.filter((row) => (row.contrato || '').trim() === listFilters.contrato);
    }
    if (listFilters.polo) {
      next = next.filter((row) => (row.polo || '').trim() === listFilters.polo);
    }
    if (listFilters.arquivos === 'pendentes') {
      next = next.filter((row) => arquivosPendentesCount(row) > 0);
    } else if (listFilters.arquivos === 'vinculados') {
      next = next.filter((row) => {
        const total = arquivosCount(row);
        return total > 0 && arquivosPendentesCount(row) === 0;
      });
    }
    const term = normalizeSearchText(searchTerm.trim());
    if (term) next = next.filter((row) => matchesSearch(row, term));
    return next;
  }, [data?.rows, listFilters, searchTerm]);

  const filtersActive = Object.values(listFilters).some((value) => value !== '');
  const totalFiltered = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedRows = rows.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(startIndex + ITEMS_PER_PAGE, totalFiltered);

  const {
    rowActionMenu,
    rowForActionMenu,
    isRowMenuOpen,
    toggleRowActionMenu,
    closeRowActionMenu,
  } = useRowActionMenu(rows);

  const setListFilter = (key: keyof ListFilters) => (value: string) => {
    setListFilters((prev) => ({ ...prev, [key]: value }));
    setCurrentPage(1);
  };

  const statusCards = useMemo(() => {
    const entries = Object.entries(statusCount).sort((a, b) => b[1] - a[1]);
    return [
      {
        key: 'all',
        label: 'Todos',
        count: Object.values(statusCount).reduce((a, b) => a + b, 0),
        icon: statusStatIcon('all'),
        ...statusStatIconClasses('all'),
      },
      ...entries.map(([key, count]) => ({
        key,
        label: statusCardLabel(key),
        count,
        icon: statusStatIcon(key),
        ...statusStatIconClasses(key),
      })),
    ];
  }, [statusCount]);

  const activeStatusVisual = useMemo(() => {
    const card = statusCards.find((item) => item.key === statusFilter);
    if (card) {
      return { icon: card.icon, iconBg: card.iconBg, iconColor: card.iconColor };
    }
    return {
      icon: statusStatIcon(statusFilter),
      ...statusStatIconClasses(statusFilter),
    };
  }, [statusCards, statusFilter]);

  const listTitle = statusListTitle(statusFilter);
  const ListHeaderIcon = activeStatusVisual.icon;

  const linkPendingKind: JuridicoLinkPendingKind | null =
    importAction === 'link-anexos'
      ? 'anexos'
      : importAction === 'link-comprovantes'
        ? 'comprovantes'
        : null;

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  const loadError =
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
    (error as Error)?.message ||
    'Erro ao carregar processos';

  return (
    <ProtectedRoute route="/ponto/juridico/processos-ativos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Processos Ativos
            </h1>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Acompanhe os processos jurídicos ativos
            </p>
          </div>

          {statusCards.length > 1 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3 2xl:grid-cols-5">
              {statusCards.slice(0, 5).map((card) => (
                <FilterStatCard
                  key={card.key}
                  label={card.label}
                  count={card.count}
                  icon={card.icon}
                  iconBg={card.iconBg}
                  iconColor={card.iconColor}
                  isActive={statusFilter === card.key}
                  loading={isLoading}
                  onClick={() => {
                    setStatusFilter((prev) => (prev === card.key ? 'all' : card.key));
                    setCurrentPage(1);
                  }}
                />
              ))}
            </div>
          ) : null}

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div
                    className={`shrink-0 rounded-lg p-2 sm:p-3 ${activeStatusVisual.iconBg}`}
                  >
                    <ListHeaderIcon
                      className={`h-5 w-5 sm:h-6 sm:w-6 ${activeStatusVisual.iconColor}`}
                      aria-hidden
                    />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
                      {listTitle}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Consulte e gerencie os processos cadastrados
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className={cadastroListClasses.searchFilterGroup}>
                    <div className={cadastroListClasses.searchFieldInGroup}>
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => {
                          setSearchTerm(e.target.value);
                          setCurrentPage(1);
                        }}
                        placeholder="Buscar por reclamante, processo, empresa…"
                        className="box-border h-full w-full rounded-lg border border-gray-300 bg-white py-0 pl-9 pr-3 text-sm font-medium leading-10 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                    </div>
                    <div className={cadastroListClasses.filterIconButtonWrap}>
                      <button
                        type="button"
                        onClick={() => setIsFiltersModalOpen(true)}
                        className={`${cadastroListClasses.filterIconButton} transition-colors ${
                          filtersActive
                            ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                        }`}
                        aria-label="Abrir filtros"
                        title={filtersActive ? 'Filtros ativos' : 'Filtros'}
                      >
                        <Filter className="h-4 w-4" />
                        {filtersActive ? (
                          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                        ) : null}
                      </button>
                    </div>
                  </div>
                  <JuridicoImportMenu onAction={setImportAction} />
                  <button
                    type="button"
                    onClick={() => setShowCreateProcesso(true)}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Novo processo</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isError ? (
                <div className="px-6 py-10 text-center text-sm text-gray-700 dark:text-gray-300">
                  {loadError}
                </div>
              ) : isLoading ? (
                <CadastroListLoading message="Carregando processos..." />
              ) : totalFiltered === 0 ? (
                <CadastroListEmpty
                  icon={Briefcase}
                  title="Nenhum processo ativo encontrado"
                  hint={
                    searchTerm.trim() || statusFilter !== 'all' || filtersActive
                      ? 'Tente ajustar a busca ou os filtros'
                      : 'Importe a planilha ou cadastre um novo processo'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={startItem}
                    endItem={endItem}
                    total={totalFiltered}
                    itemLabel="processo"
                    itemLabelPlural="processos"
                    currentPage={currentPage}
                    totalPages={totalPages}
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          {COLUMNS.map((col) => (
                            <th
                              key={col.key}
                              className={`${
                                col.align === 'center'
                                  ? cadastroListClasses.thCenter
                                  : cadastroListClasses.th
                              } whitespace-nowrap`}
                            >
                              {col.label}
                            </th>
                          ))}
                          <th
                            className={`${listTableRowClasses.actionTh} text-center`}
                          >
                            Anexos
                          </th>
                          <th className={listTableRowClasses.actionTh}>Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {paginatedRows.map((row) => {
                          const filesTotal = arquivosCount(row);
                          const pendentes = arquivosPendentesCount(row);
                          return (
                            <tr
                              key={row.id}
                              className={getListTableRowClassName(true)}
                              onClick={() =>
                                router.push(`/ponto/juridico/processos-ativos/${row.id}`)
                              }
                            >
                              {COLUMNS.map((col) => {
                                const text = cellValue(row, col);
                                const isName = col.key === 'reclamante';
                                return (
                                  <td
                                    key={col.key}
                                    className={`${
                                      col.align === 'center'
                                        ? cadastroListClasses.tdCenter
                                        : cadastroListClasses.td
                                    } max-w-[240px] truncate whitespace-nowrap`}
                                    title={text}
                                  >
                                    {isName ? (
                                      <ListRowNavigableLabel>{text}</ListRowNavigableLabel>
                                    ) : col.badge ? (
                                      <span
                                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(
                                          String(row.status || row.statusProcesso || ''),
                                        )}`}
                                      >
                                        {text}
                                      </span>
                                    ) : (
                                      text
                                    )}
                                  </td>
                                );
                              })}
                              <td
                                className={`${listTableRowClasses.actionTd} text-center`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex justify-center">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAnexosModal({
                                        id: row.id,
                                        label: row.reclamante || row.numeroProcesso,
                                        numeroProcesso: row.numeroProcesso,
                                      });
                                    }}
                                    className={`relative ${rowActionMenuButtonClass(
                                      anexosModal?.id === row.id,
                                    )}`}
                                    title={
                                      pendentes > 0
                                        ? `Ver anexos (${filesTotal}) · ${pendentes} não vinculado(s)`
                                        : `Ver anexos e comprovantes (${filesTotal})`
                                    }
                                    aria-label={`Ver anexos de ${row.reclamante || row.numeroProcesso}`}
                                  >
                                    <Paperclip className="h-4 w-4" />
                                    {pendentes > 0 ? (
                                      <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-gray-900">
                                        {pendentes}
                                      </span>
                                    ) : null}
                                  </button>
                                </div>
                              </td>
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(row.id)}
                                onToggle={(e) => toggleRowActionMenu(row.id, e.currentTarget)}
                              />
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {rowActionMenu && rowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      hideDelete
                      onEdit={() => setEditProcessoId(rowForActionMenu.id)}
                    />
                  ) : null}
                  <ListPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={isFiltersModalOpen}
          onClose={() => setIsFiltersModalOpen(false)}
          title="Filtros"
          size="md"
        >
          <div className="space-y-4">
            <FilterField label="Empresa">
              <StringSingleSelectDropdown
                value={listFilters.empresa}
                onChange={setListFilter('empresa')}
                options={filterOptions.empresas}
                placeholder="Todas"
                emptyOptionLabel="Todas"
                matchTriggerWidth
              />
            </FilterField>
            <FilterField label="Contrato">
              <StringSingleSelectDropdown
                value={listFilters.contrato}
                onChange={setListFilter('contrato')}
                options={filterOptions.contratos}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                matchTriggerWidth
              />
            </FilterField>
            <FilterField label="Polo">
              <StringSingleSelectDropdown
                value={listFilters.polo}
                onChange={setListFilter('polo')}
                options={filterOptions.polos}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                matchTriggerWidth
              />
            </FilterField>
            <FilterField label="Arquivos">
              <StringSingleSelectDropdown
                value={listFilters.arquivos}
                onChange={(value) =>
                  setListFilter('arquivos')(value as ListFilters['arquivos'])
                }
                options={[
                  { value: 'pendentes', label: 'Com arquivos não vinculados' },
                  { value: 'vinculados', label: 'Todos os arquivos vinculados' },
                ]}
                placeholder="Todos"
                emptyOptionLabel="Todos"
                disableSearch
                matchTriggerWidth
              />
            </FilterField>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setListFilters(EMPTY_LIST_FILTERS);
                  setCurrentPage(1);
                }}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Limpar
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Aplicar
              </button>
            </div>
          </div>
        </Modal>

        {importAction === 'full' ? (
          <JuridicoImportModal
            isOpen
            onClose={() => setImportAction(null)}
            onImported={() => {
              void refetch();
            }}
          />
        ) : null}

        {linkPendingKind ? (
          <JuridicoLinkPendingFilesModal
            isOpen
            kind={linkPendingKind}
            onClose={() => setImportAction(null)}
            onLinked={() => {
              void refetch();
            }}
          />
        ) : null}

        <JuridicoProcessoAnexosModal
          isOpen={!!anexosModal}
          processoId={anexosModal?.id || null}
          processoLabel={anexosModal?.label}
          numeroProcesso={anexosModal?.numeroProcesso}
          onClose={() => setAnexosModal(null)}
          onChanged={() => {
            void refetch();
          }}
        />

        <JuridicoProcessoEditModal
          isOpen={showCreateProcesso || !!editProcessoId}
          mode={showCreateProcesso ? 'create' : 'edit'}
          processoId={editProcessoId}
          onClose={() => {
            setShowCreateProcesso(false);
            setEditProcessoId(null);
          }}
          onSaved={() => {
            void refetch();
          }}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
