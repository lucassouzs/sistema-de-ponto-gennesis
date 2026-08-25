'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Filter, Fuel, Plus, Search, Upload, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { SpreadsheetImportModal } from '@/components/ui/SpreadsheetImportModal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { ListPagination } from '@/components/ui/ListPagination';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import {
  MultiSelectSearchDropdown,
  type MultiSelectSearchOption,
} from '@/components/ui/MultiSelectSearchDropdown';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import api from '@/lib/api';
import {
  cadastroListClasses,
  ListRowNavigableLabel,
  RowActionMenuCell,
  RowActionMenuPortal,
  getListTableRowClassName,
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import {
  FUEL_STATION_IMPORT_COLUMNS,
  downloadFuelStationImportTemplate,
  parseFuelStationsFromFile,
} from '@/lib/fuelGasStationImport';

type FuelStateCode = 'DF' | 'GO';

type SatelliteCity = {
  code: string;
  stateCode: FuelStateCode;
  name: string;
};

type StationContract = {
  id: string;
  name: string;
  number: string;
};

type GasStation = {
  id: string;
  displayNumber: number;
  cityCode: string;
  name: string;
  address?: string | null;
  sortOrder: number;
  isActive: boolean;
  city?: SatelliteCity | null;
  contracts?: StationContract[];
  _count?: { requests: number };
};

type StationFormState = {
  cityCode: string;
  name: string;
  address: string;
  isActive: boolean;
  contractIds: string[];
};

const EMPTY_STATION_FORM = (cityCode = ''): StationFormState => ({
  cityCode,
  name: '',
  address: '',
  isActive: true,
  contractIds: [],
});

const ITEMS_PER_PAGE = 20;

export default function RegioesPostosCombustivelPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stateFilter, setStateFilter] = useState<FuelStateCode>('DF');
  const [cityFilter, setCityFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [showStationForm, setShowStationForm] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [formStateCode, setFormStateCode] = useState<FuelStateCode>('DF');
  const [editingStation, setEditingStation] = useState<GasStation | null>(null);
  const [detailStation, setDetailStation] = useState<GasStation | null>(null);
  const [deleteStationId, setDeleteStationId] = useState<string | null>(null);
  const [stationForm, setStationForm] = useState<StationFormState>(EMPTY_STATION_FORM());

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });

  const { data: cities = [] } = useQuery({
    queryKey: ['fuel-satellite-cities', stateFilter],
    queryFn: async () => {
      const res = await api.get('/fuel-gas-stations/satellite-cities', {
        params: { stateCode: stateFilter },
      });
      return (res.data?.data || []) as SatelliteCity[];
    },
    enabled: !loadingUser,
  });

  const { data: formCities = [] } = useQuery({
    queryKey: ['fuel-satellite-cities-form', formStateCode],
    queryFn: async () => {
      const res = await api.get('/fuel-gas-stations/satellite-cities', {
        params: { stateCode: formStateCode },
      });
      return (res.data?.data || []) as SatelliteCity[];
    },
    enabled: !loadingUser && showStationForm && !editingStation,
  });

  const { data: stations = [], isLoading } = useQuery({
    queryKey: ['fuel-gas-stations', stateFilter, cityFilter],
    queryFn: async () => {
      const res = await api.get('/fuel-gas-stations', {
        params: {
          stateCode: stateFilter,
          ...(cityFilter ? { cityCode: cityFilter } : {}),
          includeInactive: 'true',
        },
      });
      return (res.data?.data || []) as GasStation[];
    },
    enabled: !loadingUser,
  });

  const { data: contractsRes } = useQuery({
    queryKey: ['contracts-for-fuel-stations'],
    queryFn: async () =>
      (await api.get('/contracts', { params: { limit: 500, page: 1 } })).data,
    enabled: showStationForm && !loadingUser,
  });

  const contractOptions = useMemo((): MultiSelectSearchOption[] => {
    const list = (contractsRes?.data ?? []) as Array<{
      id: string;
      name: string;
      number?: string;
    }>;
    return list
      .map((c) => ({
        value: c.id,
        label: c.name,
        searchText: `${c.name} ${c.number ?? ''}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [contractsRes]);

  const cityFilterOptions = useMemo((): MultiSelectSearchOption[] => {
    return cities.map((city) => ({
      value: city.code,
      label: city.name,
      searchText: city.name,
    }));
  }, [cities]);

  const formCityOptions = useMemo((): MultiSelectSearchOption[] => {
    return formCities.map((city) => ({
      value: city.code,
      label: city.name,
      searchText: city.name,
    }));
  }, [formCities]);

  const filteredStations = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return stations;
    return stations.filter(
      (station) =>
        String(station.displayNumber).includes(term) ||
        station.name.toLowerCase().includes(term) ||
        (station.address ?? '').toLowerCase().includes(term) ||
        (station.city?.name ?? '').toLowerCase().includes(term) ||
        (station.contracts ?? []).some(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            c.number.toLowerCase().includes(term),
        ),
    );
  }, [stations, searchTerm]);

  const totalFiltered = filteredStations.length;
  const listRange = getCadastroListRange(currentPage, ITEMS_PER_PAGE, totalFiltered);
  const paginatedStations = filteredStations.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );
  const hasActiveFilter = Boolean(cityFilter) || stateFilter !== 'DF';
  const isListEmpty = !isLoading && totalFiltered === 0;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, stateFilter, cityFilter]);

  useEffect(() => {
    if (cityFilter && !cities.some((city) => city.code === cityFilter)) {
      setCityFilter('');
    }
  }, [cities, cityFilter]);

  useEffect(() => {
    if (!showStationForm || editingStation) return;
    if (!formCities.length) {
      setStationForm((current) => ({ ...current, cityCode: '' }));
      return;
    }
    if (!formCities.some((city) => city.code === stationForm.cityCode)) {
      setStationForm((current) => ({ ...current, cityCode: formCities[0].code }));
    }
  }, [formStateCode, formCities, showStationForm, editingStation, stationForm.cityCode]);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
    setRowActionMenu,
  } = useRowActionMenu(paginatedStations);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['fuel-gas-stations'] });
  };

  const saveStationMutation = useMutation({
    mutationFn: async () => {
      if (editingStation) {
        return api.put(`/fuel-gas-stations/${editingStation.id}`, {
          name: stationForm.name.trim(),
          address: stationForm.address.trim() || null,
          isActive: stationForm.isActive,
          contractIds: stationForm.contractIds,
        });
      }
      return api.post('/fuel-gas-stations', {
        cityCode: stationForm.cityCode.trim().toUpperCase(),
        name: stationForm.name.trim(),
        address: stationForm.address.trim() || null,
        isActive: stationForm.isActive,
        contractIds: stationForm.contractIds,
      });
    },
    onSuccess: () => {
      toast.success(editingStation ? 'Posto atualizado.' : 'Posto cadastrado.');
      setShowStationForm(false);
      setEditingStation(null);
      setStationForm(EMPTY_STATION_FORM(cityFilter));
      invalidate();
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Erro ao salvar posto');
    },
  });

  const deleteStationMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/fuel-gas-stations/${id}`),
    onSuccess: () => {
      toast.success('Posto excluído.');
      setDeleteStationId(null);
      setRowActionMenu(null);
      invalidate();
    },
    onError: (err: { response?: { data?: { error?: string; message?: string } } }) => {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Erro ao excluir posto');
    },
  });

  const stationPendingDelete = useMemo(
    () => filteredStations.find((station) => station.id === deleteStationId) ?? null,
    [filteredStations, deleteStationId],
  );

  const openCreateStation = () => {
    setEditingStation(null);
    setFormStateCode(stateFilter);
    const defaultCity =
      cityFilter && cities.some((city) => city.code === cityFilter)
        ? cityFilter
        : cities.find((city) => city.stateCode === stateFilter)?.code || '';
    setStationForm(EMPTY_STATION_FORM(defaultCity));
    setShowStationForm(true);
  };

  const openEditStation = (station: GasStation) => {
    setEditingStation(station);
    setStationForm({
      cityCode: station.cityCode,
      name: station.name,
      address: station.address || '',
      isActive: station.isActive,
      contractIds: (station.contracts ?? []).map((c) => c.id),
    });
    setShowStationForm(true);
  };

  const clearFilters = () => {
    setStateFilter('DF');
    setCityFilter('');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/regioes-postos-combustivel">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Postos de Combustível
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Gerencie os postos credenciados para abastecimento.
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <Fuel className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                      Postos credenciados
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {isLoading
                        ? 'Carregando...'
                        : totalFiltered === 1
                          ? '1 posto cadastrado'
                          : `${totalFiltered} postos cadastrados`}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Buscar código, posto ou cidade..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsFiltersOpen(true)}
                    className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                      hasActiveFilter
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                    }`}
                    aria-label="Abrir filtro"
                    title={hasActiveFilter ? 'Filtro (ativo)' : 'Filtro'}
                  >
                    <Filter className="h-4 w-4" />
                    {hasActiveFilter ? (
                      <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                    ) : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowImportModal(true)}
                    className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                  >
                    <Upload className="h-4 w-4 shrink-0" />
                    <span>Importar</span>
                  </button>
                  <button
                    type="button"
                    onClick={openCreateStation}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Novo posto</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando postos..." />
              ) : isListEmpty ? (
                <CadastroListEmpty
                  icon={Fuel}
                  title="Nenhum posto encontrado"
                  hint={
                    searchTerm.trim() || hasActiveFilter
                      ? 'Tente ajustar a busca ou os filtros'
                      : 'Cadastre um novo posto para começar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={listRange.startItem}
                    endItem={listRange.endItem}
                    total={totalFiltered}
                    itemLabel="posto"
                    itemLabelPlural="postos"
                    currentPage={currentPage}
                    totalPages={listRange.totalPages}
                  />
                  <div className="table-scroll">
                    <table className={cadastroListClasses.table}>
                      <colgroup>
                        <col className="w-[4.5rem]" />
                        <col />
                        <col className="w-[16rem] sm:w-[20rem]" />
                        <col className="w-[12rem] sm:w-[14rem]" />
                        <col className="w-[7.5rem]" />
                        <col className="w-[4.5rem]" />
                      </colgroup>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th scope="col" className={`${cadastroListClasses.thCenter} font-mono`}>
                            ID
                          </th>
                          <th scope="col" className={`${cadastroListClasses.th} min-w-[12rem]`}>
                            Nome
                          </th>
                          <th scope="col" className={`${cadastroListClasses.th} min-w-[14rem]`}>
                            Endereço
                          </th>
                          <th scope="col" className={`${cadastroListClasses.thCenter} min-w-[12rem]`}>
                            Cidade
                          </th>
                          <th scope="col" className={`${cadastroListClasses.thCenter} w-[7.5rem]`}>
                            Status
                          </th>
                          <th scope="col" className={cadastroListClasses.thRight}>
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {paginatedStations.map((station) => (
                          <tr
                            key={station.id}
                            className={getListTableRowClassName(true)}
                            onClick={() => setDetailStation(station)}
                          >
                            <td className={`${cadastroListClasses.tdCenter} font-mono tabular-nums`}>
                              <ListRowNavigableLabel className="font-mono tabular-nums">
                                {station.displayNumber}
                              </ListRowNavigableLabel>
                            </td>
                            <td className={`${cadastroListClasses.tdTruncate} min-w-[12rem]`}>
                              <span className="block whitespace-normal break-words text-sm font-medium text-gray-900 dark:text-gray-100">
                                {station.name}
                              </span>
                            </td>
                            <td className={`${cadastroListClasses.tdTruncate} min-w-[14rem]`}>
                              <span className="block whitespace-normal break-words text-sm text-gray-900 dark:text-gray-100">
                                {station.address || '—'}
                              </span>
                            </td>
                            <td className={`${cadastroListClasses.tdTruncate} text-center`}>
                              <span
                                className="block whitespace-normal break-words text-sm text-gray-900 dark:text-gray-100"
                                title={station.city?.name ?? station.cityCode}
                              >
                                {station.city?.name ?? station.cityCode}
                              </span>
                            </td>
                            <td className={`${cadastroListClasses.tdCenter} w-[7.5rem]`}>
                              <span
                                className={`inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${
                                  station.isActive
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                                }`}
                              >
                                {station.isActive ? 'Ativo' : 'Inativo'}
                              </span>
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(station.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(station.id, e.currentTarget)
                              }
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <ListPagination
                    currentPage={currentPage}
                    totalPages={listRange.totalPages}
                    onPageChange={setCurrentPage}
                  />

                  {rowActionMenu && rowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onEdit={() => openEditStation(rowForActionMenu as GasStation)}
                      onDelete={() => setDeleteStationId((rowForActionMenu as GasStation).id)}
                      deleteDisabled={((rowForActionMenu as GasStation)._count?.requests ?? 0) > 0}
                      deleteDisabledTitle="Posto com solicitações vinculadas"
                    />
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Modal
          isOpen={!!detailStation}
          onClose={() => setDetailStation(null)}
          confirmBeforeClose={false}
          title={
            detailStation
              ? `Posto ${detailStation.displayNumber}`
              : 'Detalhes do posto'
          }
        >
          {detailStation ? (
            <div className="space-y-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">ID</span>
                  <p className="font-mono tabular-nums text-gray-900 dark:text-gray-100">
                    {detailStation.displayNumber}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Status</span>
                  <p className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        detailStation.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {detailStation.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <span className="font-medium text-gray-500 dark:text-gray-400">Nome</span>
                  <p className="text-gray-900 dark:text-gray-100">{detailStation.name}</p>
                </div>
                <div className="sm:col-span-2">
                  <span className="font-medium text-gray-500 dark:text-gray-400">Endereço</span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {detailStation.address?.trim() || '—'}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">Cidade</span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {detailStation.city?.name ?? detailStation.cityCode}
                    {detailStation.city?.stateCode
                      ? ` (${detailStation.city.stateCode})`
                      : ''}
                  </p>
                </div>
                <div>
                  <span className="font-medium text-gray-500 dark:text-gray-400">
                    Solicitações vinculadas
                  </span>
                  <p className="text-gray-900 dark:text-gray-100">
                    {detailStation._count?.requests ?? 0}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <span className="font-medium text-gray-500 dark:text-gray-400">Contratos</span>
                  {(detailStation.contracts ?? []).length ? (
                    <ul className="mt-1 list-inside list-disc space-y-0.5 text-gray-900 dark:text-gray-100">
                      {(detailStation.contracts ?? []).map((contract) => (
                        <li key={contract.id}>{contract.name}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-gray-900 dark:text-gray-100">—</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                <Button type="button" variant="outline" onClick={() => setDetailStation(null)}>
                  Fechar
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    const station = detailStation;
                    setDetailStation(null);
                    openEditStation(station);
                  }}
                >
                  Editar
                </Button>
              </div>
            </div>
          ) : null}
        </Modal>

        <Modal
          isOpen={!!deleteStationId}
          onClose={() => setDeleteStationId(null)}
          confirmBeforeClose={false}
      title="Excluir posto"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Tem certeza que deseja excluir{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {stationPendingDelete
                  ? `${stationPendingDelete.displayNumber} — ${stationPendingDelete.name}`
                  : 'este posto'}
              </span>
              ? Esta ação não pode ser desfeita.
            </p>
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <Button type="button" variant="outline" onClick={() => setDeleteStationId(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="error"
                onClick={() => deleteStationId && deleteStationMutation.mutate(deleteStationId)}
                disabled={deleteStationMutation.isPending}
              >
                {deleteStationMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={isFiltersOpen}
          onClose={() => setIsFiltersOpen(false)}
          title="Filtros — Postos de Combustível"
          size="md"
        >
          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Estado
              </label>
              <div className="flex gap-2">
                {(['DF', 'GO'] as FuelStateCode[]).map((state) => (
                  <ButtonSeg
                    key={state}
                    active={stateFilter === state}
                    onClick={() => {
                      setStateFilter(state);
                      setCityFilter('');
                    }}
                    label={state}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Cidade satélite
              </label>
              <StringSingleSelectDropdown
                value={cityFilter}
                onChange={setCityFilter}
                options={cityFilterOptions}
                allowEmpty
                emptyOptionLabel="Todas as cidades"
                placeholder="Todas as cidades"
                className="w-full"
              />
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <Button type="button" variant="outline" onClick={clearFilters}>
                Limpar filtros
              </Button>
              <Button type="button" onClick={() => setIsFiltersOpen(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </Modal>

        <Modal
          isOpen={showStationForm}
          onClose={() => {
            setShowStationForm(false);
            setEditingStation(null);
          }}
          title={editingStation ? `Editar posto ${editingStation.displayNumber}` : 'Novo posto'}
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!stationForm.cityCode.trim() || !stationForm.name.trim()) {
                return toast.error('Selecione a cidade e informe o nome do posto');
              }
              saveStationMutation.mutate();
            }}
          >
            {editingStation ? (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Código: <span className="font-semibold">{editingStation.displayNumber}</span>
              </p>
            ) : null}
            {!editingStation ? (
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-800 dark:text-gray-200">
                  Estado
                </label>
                <div className="flex gap-2">
                  {(['DF', 'GO'] as FuelStateCode[]).map((state) => (
                    <ButtonSeg
                      key={state}
                      active={formStateCode === state}
                      onClick={() => setFormStateCode(state)}
                      label={state}
                    />
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Cidade satélite *
              </label>
              {editingStation ? (
                <p className="text-sm text-gray-900 dark:text-gray-100">
                  {editingStation.city?.name ?? editingStation.cityCode}
                </p>
              ) : (
                <StringSingleSelectDropdown
                  value={stationForm.cityCode}
                  onChange={(cityCode) => setStationForm((current) => ({ ...current, cityCode }))}
                  options={formCityOptions}
                  allowEmpty={false}
                  placeholder="Selecionar cidade..."
                  className="w-full"
                />
              )}
            </div>
            <Input
              label="Nome do posto *"
              value={stationForm.name}
              onChange={(e) => setStationForm((c) => ({ ...c, name: e.target.value }))}
              placeholder="Ex.: Posto credenciado — Taguatinga Norte"
              required
            />
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Contratos
              </label>
              <MultiSelectSearchDropdown
                options={contractOptions}
                selected={stationForm.contractIds}
                onChange={(contractIds) =>
                  setStationForm((current) => ({ ...current, contractIds }))
                }
                placeholder="Selecionar um ou mais contratos..."
                searchPlaceholder="Pesquisar contrato..."
                emptyOptionsMessage="Nenhum contrato encontrado."
                className="w-full"
              />
            </div>
            <Input
              label="Endereço"
              value={stationForm.address}
              onChange={(e) => setStationForm((c) => ({ ...c, address: e.target.value }))}
              placeholder="Opcional"
            />
            <label className="group flex cursor-pointer items-center space-x-3">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={stationForm.isActive}
                  onChange={(e) =>
                    setStationForm((c) => ({ ...c, isActive: e.target.checked }))
                  }
                  className="sr-only"
                />
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-200 ${
                    stationForm.isActive
                      ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
                      : 'border-gray-300 bg-white group-hover:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400'
                  }`}
                >
                  {stationForm.isActive ? (
                    <svg
                      className="h-3 w-3 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  ) : null}
                </div>
              </div>
              <span className="text-sm font-medium text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-gray-100">
                Posto ativo
              </span>
            </label>
            <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
              <Button type="button" variant="outline" onClick={() => setShowStationForm(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveStationMutation.isPending}>
                {saveStationMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </Modal>

        <SpreadsheetImportModal
          isOpen={showImportModal}
          onClose={() => setShowImportModal(false)}
          title="Importar postos de combustível"
          templateHint="Baixe o modelo (abas Postos e Cidades). Preencha Estado (DF/GO), Cidade, Nome do posto… O código do posto é gerado automaticamente."
          columns={FUEL_STATION_IMPORT_COLUMNS}
          bodyKey="stations"
          importPath="/fuel-gas-stations/import"
          downloadTemplate={downloadFuelStationImportTemplate}
          parseFile={async (file) => {
            const report = await parseFuelStationsFromFile(file);
            return {
              items: report.stations,
              skipped: report.skipped,
              totalRows: report.totalRows,
            };
          }}
          onImported={() => {
            void queryClient.invalidateQueries({ queryKey: ['fuel-gas-stations'] });
          }}
        />
      </MainLayout>
    </ProtectedRoute>
  );
}
