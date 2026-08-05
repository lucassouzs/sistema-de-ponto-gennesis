'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, formatDistanceToNow, isAfter, startOfDay, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { Plus, Filter, RotateCcw, Search, Trash2, Workflow, X } from 'lucide-react';
import { createFlowDiagram, deleteFlowDiagram, fetchFlowDiagrams } from '@/lib/flow';
import type { FlowDiagramSummary } from '@/lib/flowTypes';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Loading } from '@/components/ui/Loading';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';

type Props = {
  onOpen: (id: string) => void;
};

type SortOption = 'updated-desc' | 'updated-asc' | 'created-desc' | 'created-asc' | 'name-asc' | 'name-desc';
type DateFilter = 'all' | 'today' | '7days' | '30days';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'updated-desc', label: 'Atualização (mais recente)' },
  { value: 'updated-asc', label: 'Atualização (mais antiga)' },
  { value: 'created-desc', label: 'Criação (mais recente)' },
  { value: 'created-asc', label: 'Criação (mais antiga)' },
  { value: 'name-asc', label: 'Nome (A → Z)' },
  { value: 'name-desc', label: 'Nome (Z → A)' },
];

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: 'all', label: 'Qualquer data' },
  { value: 'today', label: 'Hoje' },
  { value: '7days', label: 'Últimos 7 dias' },
  { value: '30days', label: 'Últimos 30 dias' },
];

const dateFilterSelectOptions = DATE_FILTER_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

const sortSelectOptions = SORT_OPTIONS.map((option) => ({
  value: option.value,
  label: option.label,
}));

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function matchesDateFilter(item: FlowDiagramSummary, filter: DateFilter): boolean {
  if (filter === 'all') return true;

  const updated = new Date(item.updatedAt);
  const now = new Date();

  if (filter === 'today') {
    return isAfter(updated, startOfDay(now));
  }
  if (filter === '7days') {
    return isAfter(updated, subDays(now, 7));
  }
  return isAfter(updated, subDays(now, 30));
}

function sortDiagrams(items: FlowDiagramSummary[], sort: SortOption): FlowDiagramSummary[] {
  const list = [...items];
  list.sort((a, b) => {
    switch (sort) {
      case 'updated-asc':
        return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      case 'created-desc':
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      case 'created-asc':
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      case 'name-asc':
        return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
      case 'name-desc':
        return b.name.localeCompare(a.name, 'pt-BR', { sensitivity: 'base' });
      case 'updated-desc':
      default:
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    }
  });
  return list;
}

function filterDiagrams(
  items: FlowDiagramSummary[],
  query: string,
  dateFilter: DateFilter,
): FlowDiagramSummary[] {
  const term = normalizeSearch(query);

  return items.filter((item) => {
    if (!matchesDateFilter(item, dateFilter)) return false;
    if (!term) return true;

    const name = item.name.toLowerCase();
    const description = (item.description ?? '').toLowerCase();
    const updatedLabel = format(new Date(item.updatedAt), 'dd/MM/yyyy HH:mm');
    const createdLabel = format(new Date(item.createdAt), 'dd/MM/yyyy HH:mm');

    return (
      name.includes(term) ||
      description.includes(term) ||
      updatedLabel.includes(term) ||
      createdLabel.includes(term)
    );
  });
}

export function FlowDiagramList({ onOpen }: Props) {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('updated-desc');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [isFiltersModalOpen, setIsFiltersModalOpen] = useState(false);

  const { data: diagrams = [], isLoading } = useQuery({
    queryKey: ['flow-diagrams'],
    queryFn: fetchFlowDiagrams,
  });

  const filteredDiagrams = useMemo(() => {
    const filtered = filterDiagrams(diagrams, searchQuery, dateFilter);
    return sortDiagrams(filtered, sortBy);
  }, [diagrams, searchQuery, dateFilter, sortBy]);

  const hasAdvancedFilters = dateFilter !== 'all' || sortBy !== 'updated-desc';

  const clearFilters = () => {
    setSearchQuery('');
    setDateFilter('all');
    setSortBy('updated-desc');
  };

  const createMutation = useMutation({
    mutationFn: () => createFlowDiagram({ name: 'Novo fluxo' }),
    onSuccess: (diagram) => {
      queryClient.invalidateQueries({ queryKey: ['flow-diagrams'] });
      onOpen(diagram.id);
    },
    onError: () => toast.error('Não foi possível criar o fluxograma'),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFlowDiagram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flow-diagrams'] });
      toast.success('Fluxograma excluído');
    },
    onError: () => toast.error('Erro ao excluir'),
  });

  if (isLoading) {
    return <Loading message="Carregando fluxogramas..." size="lg" />;
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">Flow</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
          Crie e edite fluxogramas BPMN
        </p>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          onClick={() => createMutation.mutate()}
          loading={createMutation.isPending}
          icon={<Plus className="h-4 w-4" />}
        >
          Criar do zero
        </Button>
      </div>

      <Card>
        <CardHeader className="border-b border-gray-200 px-6 py-4 dark:border-gray-700">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                <Workflow className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Meus fluxogramas</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {diagrams.length === 0
                    ? 'Nenhum fluxograma criado ainda'
                    : filteredDiagrams.length === diagrams.length
                      ? `${diagrams.length} fluxograma${diagrams.length === 1 ? '' : 's'} salvo${diagrams.length === 1 ? '' : 's'}`
                      : `${filteredDiagrams.length} de ${diagrams.length} fluxograma${diagrams.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>

            {diagrams.length > 0 && (
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar fluxograma..."
                    aria-label="Pesquisar fluxogramas"
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsFiltersModalOpen(true)}
                  className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 ${
                    hasAdvancedFilters
                      ? 'border-red-400 dark:border-red-600'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  aria-label="Abrir filtro"
                  title="Filtro"
                >
                  <Filter className="h-4 w-4" />
                  {hasAdvancedFilters && (
                    <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </button>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4 p-6">
          {diagrams.length === 0 ? (
            <div className="py-10 text-center">
              <Workflow className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
              <p className="text-gray-600 dark:text-gray-400">
                Nenhum fluxograma ainda. Clique em Criar do zero para começar.
              </p>
            </div>
          ) : filteredDiagrams.length === 0 ? (
            <div className="py-10 text-center">
              <Search className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
              <p className="text-gray-600 dark:text-gray-400">
                Nenhum fluxograma encontrado com os filtros atuais.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={clearFilters}
              >
                Limpar filtros
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDiagrams.map((item) => (
                <DiagramCard
                  key={item.id}
                  item={item}
                  onOpen={() => onOpen(item.id)}
                  onDelete={() => deleteMutation.mutate(item.id)}
                  deleting={deleteMutation.isPending}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {isFiltersModalOpen && (
        <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setIsFiltersModalOpen(false)} />
          <div className="relative mx-4 w-full max-w-lg rounded-xl bg-white shadow-2xl dark:bg-gray-800">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                aria-label="Fechar filtros"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Período
                  </label>
                  <StringSingleSelectDropdown
                    value={dateFilter}
                    onChange={(value) => setDateFilter(value as DateFilter)}
                    options={dateFilterSelectOptions}
                    allowEmpty={false}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Ordenar por
                  </label>
                  <StringSingleSelectDropdown
                    value={sortBy}
                    onChange={(value) => setSortBy(value as SortOption)}
                    options={sortSelectOptions}
                    allowEmpty={false}
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
              >
                <RotateCcw className="h-4 w-4" />
                Limpar filtros
              </button>
              <button
                type="button"
                onClick={() => setIsFiltersModalOpen(false)}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DiagramCard({
  item,
  onOpen,
  onDelete,
  deleting,
}: {
  item: FlowDiagramSummary;
  onOpen: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <div className="group rounded-lg border border-gray-200 p-4 transition-shadow hover:shadow-md dark:border-gray-700">
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="mb-3 flex items-start gap-3">
          <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30">
            <Workflow className="h-5 w-5 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-gray-900 dark:text-gray-100">{item.name}</p>
            {item.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-gray-500 dark:text-gray-400">{item.description}</p>
            ) : null}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Atualizado{' '}
              {formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true, locale: ptBR })}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Criado em {format(new Date(item.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </p>
          </div>
        </div>
      </button>
      <div className="flex justify-end border-t border-gray-100 pt-3 dark:border-gray-700/80">
        <Button
          size="sm"
          variant="outline"
          disabled={deleting}
          onClick={(e) => {
            e.stopPropagation();
            if (confirm('Excluir este fluxograma?')) onDelete();
          }}
          className="text-red-600 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
          icon={<Trash2 className="h-4 w-4" />}
        >
          Excluir
        </Button>
      </div>
    </div>
  );
}
