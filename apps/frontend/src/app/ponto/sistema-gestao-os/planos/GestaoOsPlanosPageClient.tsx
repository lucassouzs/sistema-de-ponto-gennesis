'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AlertCircle, CalendarClock, Plus, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
  listTableRowClasses
} from '@/components/ui/RowActionMenu';
import { ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import api from '@/lib/api';
import {
  GestaoOsLocationTree,
  GestaoOsMaintenancePlan,
  GestaoOsPlanType,
  PLAN_TYPE_LABELS
} from '../gestaoOsTypes';
import { useGestaoOsCompany } from '../useGestaoOsCompany';

type Technician = { id: string; name: string };
type CatalogEquipment = { id: string; name: string; isActive?: boolean };
type CatalogSubgroup = {
  id: string;
  name: string;
  isActive?: boolean;
  equipments: CatalogEquipment[];
};
type CatalogGroup = {
  id: string;
  name: string;
  isActive?: boolean;
  subgroups: CatalogSubgroup[];
};

function RequiredMark() {
  return <span className="ml-0.5 text-red-600 dark:text-red-400">*</span>;
}

type PlanForm = {
  name: string;
  buildingId: string;
  sectorId: string;
  placeId: string;
  groupId: string;
  subgroupId: string;
  equipmentId: string;
  specifyAsset: boolean;
  assetId: string;
  planType: GestaoOsPlanType;
  intervalDays: string;
  nextDueAt: string;
  assigneeId: string;
};

function emptyForm(): PlanForm {
  return {
    name: '',
    buildingId: '',
    sectorId: '',
    placeId: '',
    groupId: '',
    subgroupId: '',
    equipmentId: '',
    specifyAsset: false,
    assetId: '',
    planType: 'PREVENTIVE',
    intervalDays: '30',
    nextDueAt: '',
    assigneeId: ''
  };
}

function isoToYmd(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function findAssetPath(tree: GestaoOsLocationTree, assetId: string) {
  for (const building of tree) {
    for (const sector of building.sectors ?? []) {
      for (const place of sector.places ?? []) {
        if ((place.assets ?? []).some((asset) => asset.id === assetId)) {
          return { buildingId: building.id, sectorId: sector.id, placeId: place.id };
        }
      }
    }
  }
  return null;
}

export default function GestaoOsPlanosPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isManager, isLoading: loadingCompany } = useGestaoOsCompany();

  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<GestaoOsMaintenancePlan | null>(null);
  const [viewing, setViewing] = useState<GestaoOsMaintenancePlan | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GestaoOsMaintenancePlan | null>(null);
  const [form, setForm] = useState<PlanForm>(emptyForm);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
  }, []);

  const { requestClose: requestCloseForm, confirmUi: formConfirmUi } = useModalCloseConfirm(
    closeForm,
    { isParentOpen: showForm }
  );

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
    }
  });
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const { data: plans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ['gestao-os-plans'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsMaintenancePlan[] }>(
        '/gestao-os/plans'
      );
      return res.data?.data ?? [];
    }
  });

  const { data: locationTree = [] } = useQuery({
    queryKey: ['gestao-os-locations'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsLocationTree }>(
        '/gestao-os/locations'
      );
      return res.data?.data ?? [];
    }
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['gestao-os-cadastros', 'equipments'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: CatalogGroup[] }>(
        '/gestao-os/cadastros/equipments'
      );
      return res.data?.data ?? [];
    }
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['gestao-os-technicians'],
    enabled: !loadingCompany,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Technician[] }>('/gestao-os/technicians');
      return res.data?.data ?? [];
    }
  });

  const buildings = locationTree;
  const sectors = useMemo(
    () => buildings.find((b) => b.id === form.buildingId)?.sectors ?? [],
    [buildings, form.buildingId]
  );
  const places = useMemo(
    () => sectors.find((s) => s.id === form.sectorId)?.places ?? [],
    [sectors, form.sectorId]
  );
  const assets = useMemo(
    () => places.find((p) => p.id === form.placeId)?.assets ?? [],
    [places, form.placeId]
  );
  const activeCatalog = useMemo(
    () =>
      catalog
        .filter((group) => group.isActive !== false)
        .map((group) => ({
          ...group,
          subgroups: (group.subgroups ?? [])
            .filter((subgroup) => subgroup.isActive !== false)
            .map((subgroup) => ({
              ...subgroup,
              equipments: (subgroup.equipments ?? []).filter((eq) => eq.isActive !== false)
            }))
        })),
    [catalog]
  );
  const subgroups = useMemo(
    () => activeCatalog.find((g) => g.id === form.groupId)?.subgroups ?? [],
    [activeCatalog, form.groupId]
  );
  const equipments = useMemo(
    () => subgroups.find((s) => s.id === form.subgroupId)?.equipments ?? [],
    [subgroups, form.subgroupId]
  );

  const buildingOptions = useMemo(
    () => labeledToSelectOptions(buildings.map((b) => ({ value: b.id, label: b.name }))),
    [buildings]
  );
  const sectorOptions = useMemo(
    () => labeledToSelectOptions(sectors.map((s) => ({ value: s.id, label: s.name }))),
    [sectors]
  );
  const placeOptions = useMemo(
    () => labeledToSelectOptions(places.map((p) => ({ value: p.id, label: p.name }))),
    [places]
  );
  const groupOptions = useMemo(
    () => labeledToSelectOptions(activeCatalog.map((g) => ({ value: g.id, label: g.name }))),
    [activeCatalog]
  );
  const subgroupOptions = useMemo(
    () => labeledToSelectOptions(subgroups.map((s) => ({ value: s.id, label: s.name }))),
    [subgroups]
  );
  const equipmentOptions = useMemo(
    () => labeledToSelectOptions(equipments.map((e) => ({ value: e.id, label: e.name }))),
    [equipments]
  );
  const assetOptions = useMemo(
    () => labeledToSelectOptions(assets.map((a) => ({ value: a.id, label: a.name }))),
    [assets]
  );
  const typeOptions = useMemo(
    () =>
      labeledToSelectOptions(
        (Object.keys(PLAN_TYPE_LABELS) as GestaoOsPlanType[]).map((key) => ({
          value: key,
          label: PLAN_TYPE_LABELS[key]
        }))
      ),
    []
  );
  const technicianOptions = useMemo(
    () => labeledToSelectOptions(technicians.map((t) => ({ value: t.id, label: t.name }))),
    [technicians]
  );

  const q = searchTerm.trim().toLowerCase();
  const rows = useMemo(() => {
    if (!q) return plans;
    return plans.filter((plan) =>
      [plan.name, PLAN_TYPE_LABELS[plan.planType], plan.building?.name, plan.asset?.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [plans, q]);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(rows);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['gestao-os-plans'] });
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (plan: GestaoOsMaintenancePlan) => {
    const path = plan.assetId ? findAssetPath(locationTree, plan.assetId) : null;
    setEditing(plan);
    setForm({
      name: plan.name,
      buildingId: path?.buildingId || plan.buildingId || '',
      sectorId: path?.sectorId || '',
      placeId: path?.placeId || '',
      groupId: '',
      subgroupId: '',
      equipmentId: '',
      specifyAsset: Boolean(plan.assetId),
      assetId: plan.assetId || '',
      planType: plan.planType,
      intervalDays: String(plan.intervalDays || 30),
      nextDueAt: isoToYmd(plan.nextDueAt),
      assigneeId: plan.assigneeId || ''
    });
    setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/gestao-os/plans', {
        name: form.name.trim(),
        planType: form.planType,
        intervalDays: Number(form.intervalDays) || 30,
        nextDueAt: form.nextDueAt
          ? new Date(`${form.nextDueAt}T12:00:00`).toISOString()
          : new Date().toISOString(),
        buildingId: form.buildingId || null,
        assetId: form.specifyAsset ? form.assetId || null : null,
        assigneeId: form.assigneeId || null
      });
      return res.data?.data;
    },
    onSuccess: () => {
      toast.success('Plano cadastrado.');
      closeForm();
      invalidate();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message ?? 'Não foi possível criar o plano');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/gestao-os/plans/${id}`, {
        name: form.name.trim(),
        planType: form.planType,
        intervalDays: Number(form.intervalDays) || 30,
        nextDueAt: form.nextDueAt
          ? new Date(`${form.nextDueAt}T12:00:00`).toISOString()
          : undefined,
        buildingId: form.buildingId || null,
        assetId: form.specifyAsset ? form.assetId || null : null,
        assigneeId: form.assigneeId || null
      });
    },
    onSuccess: () => {
      toast.success('Plano atualizado.');
      closeForm();
      invalidate();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message ?? 'Não foi possível atualizar o plano');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/gestao-os/plans/${id}`);
    },
    onSuccess: () => {
      toast.success('Plano excluído.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message ?? 'Não foi possível excluir o plano');
    }
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/gestao-os/plans/generate-due', {});
      return res.data?.data as { generated: number };
    },
    onSuccess: (data) => {
      toast.success(`${data?.generated ?? 0} OS gerada(s) a partir de planos vencidos`);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-list'] });
    },
    onError: (err: { response?: { data?: { message?: string } } }) => {
      toast.error(err?.response?.data?.message ?? 'Falha ao gerar OS');
    }
  });

  const save = () => {
    if (!form.name.trim()) return toast.error('Informe o nome do plano.');
    if (!form.nextDueAt) return toast.error('Informe a data base.');
    if (form.specifyAsset && !form.assetId) return toast.error('Selecione o ativo.');
    if (editing) return updateMutation.mutate(editing.id);
    return createMutation.mutate();
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  if (loadingUser || loadingCompany) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/sistema-gestao-os/planos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Planos de Manutenção
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Preventiva, PMOC e segurança — gere OS automaticamente quando vencerem.
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <CalendarClock className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Planos
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {rows.length} plano{rows.length === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className={cadastroListClasses.searchField}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label="Limpar busca"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  {isManager ? (
                    <>
                      <button
                        type="button"
                        disabled={generateMutation.isPending}
                        onClick={() => generateMutation.mutate()}
                        className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        Gerar OS vencidas
                      </button>
                      <button
                        type="button"
                        onClick={openCreate}
                        className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        Novo plano
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {loadingPlans ? (
                <CadastroListLoading message="Carregando planos..." />
              ) : rows.length === 0 ? (
                <CadastroListEmpty
                  icon={CalendarClock}
                  title="Nenhum plano encontrado"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Use “Novo plano” para cadastrar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={1}
                    endItem={rows.length}
                    total={rows.length}
                    itemLabel="plano"
                    itemLabelPlural="planos"
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={`${cadastroListClasses.th} w-14 whitespace-nowrap !px-2 sm:!px-3`}>
                            ID
                          </th>
                          <th className={`${cadastroListClasses.th} !pl-2 sm:!pl-3`}>Nome</th>
                          <th className={cadastroListClasses.thCenter}>Tipo</th>
                          <th className={cadastroListClasses.thCenter}>Intervalo</th>
                          <th className={cadastroListClasses.thCenter}>Data base</th>
                          <th className={cadastroListClasses.th}>Local</th>
                          <th className={cadastroListClasses.thRight}>Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {rows.map((plan, index) => (
                          <tr
                            key={plan.id}
                            role="button"
                            tabIndex={0}
                            className={listTableRowClasses.trNavigable}
                            onClick={() => setViewing(plan)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setViewing(plan);
                              }
                            }}
                          >
                            <td className={`${cadastroListClasses.tdMono} w-14 !px-2 sm:!px-3`}>
                              {formatCadastroListId(null, index + 1)}
                            </td>
                            <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                              <ListRowNavigableLabel className="block truncate">
                                {plan.name}
                              </ListRowNavigableLabel>
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {PLAN_TYPE_LABELS[plan.planType]}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {plan.intervalDays} dias
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {formatDate(plan.nextDueAt)}
                            </td>
                            <td className={cadastroListClasses.tdTruncate}>
                              {[plan.building?.name, plan.asset?.name].filter(Boolean).join(' · ') ||
                                '—'}
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(plan.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(plan.id, e.currentTarget as HTMLButtonElement)
                              }
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {rowActionMenu && rowForActionMenu ? (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={isManager ? () => openEdit(rowForActionMenu) : undefined}
                  onDelete={isManager ? () => setDeleteTarget(rowForActionMenu) : undefined}
                  hideDelete={!isManager}
                  hideDefaultActions={!isManager}
                  extraItems={[
                    {
                      label: 'Ver detalhes',
                      onClick: () => setViewing(rowForActionMenu)
                    }
                  ]}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {showForm ? (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => requestCloseForm()} />
            <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editing ? 'Editar plano' : 'Novo plano'}
                </h2>
                <button
                  type="button"
                  onClick={() => requestCloseForm()}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form
                className="p-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Nome
                      <RequiredMark />
                    </label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                      placeholder="Nome do plano"
                      className={FORM_FIELD_INPUT_CLS}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Prédio
                    </label>
                    <StringSingleSelectDropdown
                      value={form.buildingId}
                      onChange={(v) =>
                        setForm((s) => ({
                          ...s,
                          buildingId: v,
                          sectorId: '',
                          placeId: '',
                          assetId: ''
                        }))
                      }
                      options={buildingOptions}
                      placeholder="Selecione o prédio"
                      emptyOptionLabel="Selecione o prédio"
                      allowEmpty
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Andar
                    </label>
                    <StringSingleSelectDropdown
                      value={form.sectorId}
                      onChange={(v) =>
                        setForm((s) => ({ ...s, sectorId: v, placeId: '', assetId: '' }))
                      }
                      options={sectorOptions}
                      placeholder={
                        !form.buildingId ? 'Selecione o prédio primeiro' : 'Selecione o andar'
                      }
                      emptyOptionLabel="Selecione o andar"
                      allowEmpty
                      disabled={!form.buildingId}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Local
                    </label>
                    <StringSingleSelectDropdown
                      value={form.placeId}
                      onChange={(v) => setForm((s) => ({ ...s, placeId: v, assetId: '' }))}
                      options={placeOptions}
                      placeholder={
                        !form.sectorId ? 'Selecione o andar primeiro' : 'Selecione o local'
                      }
                      emptyOptionLabel="Selecione o local"
                      allowEmpty
                      disabled={!form.sectorId}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Grupo Equipamento
                    </label>
                    <StringSingleSelectDropdown
                      value={form.groupId}
                      onChange={(v) =>
                        setForm((s) => ({ ...s, groupId: v, subgroupId: '', equipmentId: '' }))
                      }
                      options={groupOptions}
                      placeholder="Selecione o grupo"
                      emptyOptionLabel="Selecione o grupo"
                      allowEmpty
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Subgrupo Equipamento
                    </label>
                    <StringSingleSelectDropdown
                      value={form.subgroupId}
                      onChange={(v) => setForm((s) => ({ ...s, subgroupId: v, equipmentId: '' }))}
                      options={subgroupOptions}
                      placeholder={
                        !form.groupId ? 'Selecione o grupo primeiro' : 'Selecione o subgrupo'
                      }
                      emptyOptionLabel="Selecione o subgrupo"
                      allowEmpty
                      disabled={!form.groupId}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Equipamento
                    </label>
                    <StringSingleSelectDropdown
                      value={form.equipmentId}
                      onChange={(v) => setForm((s) => ({ ...s, equipmentId: v }))}
                      options={equipmentOptions}
                      placeholder={
                        !form.subgroupId
                          ? 'Selecione o subgrupo primeiro'
                          : 'Selecione o equipamento'
                      }
                      emptyOptionLabel="Selecione o equipamento"
                      allowEmpty
                      disabled={!form.subgroupId}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                      Especificar ativo?
                    </p>
                    <div className="flex gap-5">
                      <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="radio"
                          checked={form.specifyAsset}
                          onChange={() => setForm((s) => ({ ...s, specifyAsset: true }))}
                        />
                        Sim
                      </label>
                      <label className="inline-flex items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                        <input
                          type="radio"
                          checked={!form.specifyAsset}
                          onChange={() =>
                            setForm((s) => ({ ...s, specifyAsset: false, assetId: '' }))
                          }
                        />
                        Não
                      </label>
                    </div>
                    {!form.specifyAsset ? (
                      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        O cadastro vale para todos os ativos desse equipamento.
                      </p>
                    ) : null}
                  </div>
                  {form.specifyAsset ? (
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Ativo
                        <RequiredMark />
                      </label>
                      <StringSingleSelectDropdown
                        value={form.assetId}
                        onChange={(v) => setForm((s) => ({ ...s, assetId: v }))}
                        options={assetOptions}
                        placeholder={
                          !form.placeId ? 'Selecione o local primeiro' : 'Selecione o ativo'
                        }
                        emptyOptionLabel="Selecione o ativo"
                        allowEmpty
                        disabled={!form.placeId}
                      />
                    </div>
                  ) : null}
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Tipo
                      <RequiredMark />
                    </label>
                    <StringSingleSelectDropdown
                      value={form.planType}
                      onChange={(v) =>
                        setForm((s) => ({
                          ...s,
                          planType: (v as GestaoOsPlanType) || 'PREVENTIVE'
                        }))
                      }
                      options={typeOptions}
                      placeholder="Selecione o tipo"
                      allowEmpty={false}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Intervalo (dias)
                      <RequiredMark />
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.intervalDays}
                      onChange={(e) => setForm((s) => ({ ...s, intervalDays: e.target.value }))}
                      className={FORM_FIELD_INPUT_CLS}
                      required
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Data base
                      <RequiredMark />
                    </label>
                    <DatePickerField
                      value={form.nextDueAt}
                      onChange={(v) => setForm((s) => ({ ...s, nextDueAt: v }))}
                      noFocusRing
                      aria-label="Data base"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Técnico
                    </label>
                    <StringSingleSelectDropdown
                      value={form.assigneeId}
                      onChange={(v) => setForm((s) => ({ ...s, assigneeId: v }))}
                      options={technicianOptions}
                      placeholder="Selecione o técnico"
                      emptyOptionLabel="Selecione o técnico"
                      allowEmpty
                    />
                  </div>
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {isSaving ? 'Salvando...' : 'Salvar plano'}
                  </button>
                  <button
                    type="button"
                    onClick={() => requestCloseForm()}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {formConfirmUi}

        {viewing ? (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setViewing(null)} />
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Detalhes do plano
                </h2>
                <button
                  type="button"
                  onClick={() => setViewing(null)}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-4 p-6">
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Nome
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{viewing.name}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Tipo
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {PLAN_TYPE_LABELS[viewing.planType]}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Intervalo
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {viewing.intervalDays} dias
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Data base
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {formatDate(viewing.nextDueAt)}
                  </p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">
                    Local
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {[viewing.building?.name, viewing.asset?.name].filter(Boolean).join(' · ') ||
                      '—'}
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setViewing(null)}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {deleteTarget ? (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir {deleteTarget.name}?
              </h3>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(deleteTarget.id)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </MainLayout>
    </ProtectedRoute>
  );
}
