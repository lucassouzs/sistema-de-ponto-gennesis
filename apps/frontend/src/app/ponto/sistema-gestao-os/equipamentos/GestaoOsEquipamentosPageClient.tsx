'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { AlertCircle, Boxes, Layers, Plus, Search, Wrench, X } from 'lucide-react';
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
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { GestaoOsAttachmentsField } from '@/components/gestao-os/GestaoOsAttachmentsField';
import {
  DOCUMENT_KIND_LABELS,
  type GestaoOsAttachment,
  type GestaoOsDocumentKind
} from '@/app/ponto/sistema-gestao-os/gestaoOsTypes';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

type EquipmentTab = 'equipamentos' | 'grupos' | 'subgrupos';

const TABS: ReadonlyArray<{ id: EquipmentTab; label: string }> = [
  { id: 'equipamentos', label: 'Equipamentos' },
  { id: 'subgrupos', label: 'Subgrupos' },
  { id: 'grupos', label: 'Grupos' }
];

const EMPTY_EQUIPMENT_FORM = {
  groupId: '',
  subgroupId: '',
  name: '',
  manufacturer: '',
  model: '',
  defaultSlaHours: '',
  expectedLifeYears: '',
  notes: '',
  attachments: [] as GestaoOsAttachment[]
};

const SLA_OPTIONS = labeledToSelectOptions([
  { value: '1', label: '1 hora' },
  { value: '2', label: '2 horas' },
  { value: '4', label: '4 horas' },
  { value: '8', label: '8 horas' },
  { value: '24', label: '24 horas' },
  { value: '48', label: '48 horas' },
  { value: '72', label: '72 horas' },
  { value: '120', label: '5 dias' },
  { value: '168', label: '7 dias' },
  { value: '360', label: '15 dias' },
  { value: '720', label: '30 dias' }
]);

const EQUIPMENT_DOC_KIND_OPTIONS = labeledToSelectOptions([
  { value: 'MANUAL', label: DOCUMENT_KIND_LABELS.MANUAL },
  { value: 'WARRANTY', label: DOCUMENT_KIND_LABELS.WARRANTY },
  { value: 'LAUDO', label: DOCUMENT_KIND_LABELS.LAUDO },
  { value: 'OTHER', label: DOCUMENT_KIND_LABELS.OTHER }
]);

const SLA_LABEL_BY_HOURS: Record<string, string> = Object.fromEntries(
  SLA_OPTIONS.map((opt) => [opt.value, opt.label])
);

function formatSlaHours(hours: number | null | undefined) {
  if (hours == null) return 'Nenhum';
  return SLA_LABEL_BY_HOURS[String(hours)] || `${hours} h`;
}

function parseEquipmentAttachments(value: unknown): GestaoOsAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    const url = String(row.url ?? '').trim();
    if (!url) return [];
    const kindRaw = String(row.kind ?? '').toUpperCase();
    const kind: GestaoOsDocumentKind | undefined =
      kindRaw === 'MANUAL' || kindRaw === 'WARRANTY' || kindRaw === 'LAUDO' || kindRaw === 'OTHER'
        ? kindRaw
        : undefined;
    return [
      {
        url,
        name: String(row.name ?? 'anexo').trim() || 'anexo',
        mimeType: row.mimeType ? String(row.mimeType) : undefined,
        kind
      }
    ];
  });
}

type CatalogEquipment = {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  defaultSlaHours: number | null;
  expectedLifeYears: number | null;
  notes: string | null;
  attachments: GestaoOsAttachment[] | null;
  isActive: boolean;
};

type CatalogSubgroup = {
  id: string;
  name: string;
  isActive: boolean;
  groupId: string;
  equipments: CatalogEquipment[];
};

type CatalogGroup = {
  id: string;
  name: string;
  isActive: boolean;
  subgroups: CatalogSubgroup[];
};

type GroupRow = { id: string; name: string; isActive: boolean };
type SubgroupRow = {
  id: string;
  name: string;
  isActive: boolean;
  groupId: string;
  groupName: string;
};
type EquipmentRow = {
  id: string;
  name: string;
  manufacturer: string | null;
  model: string | null;
  defaultSlaHours: number | null;
  expectedLifeYears: number | null;
  notes: string | null;
  attachments: GestaoOsAttachment[];
  isActive: boolean;
  subgroupId: string;
  subgroupName: string;
  groupId: string;
  groupName: string;
};

function flattenCatalog(tree: CatalogGroup[]) {
  const groups: GroupRow[] = [];
  const subgroups: SubgroupRow[] = [];
  const equipments: EquipmentRow[] = [];
  for (const group of tree) {
    groups.push({ id: group.id, name: group.name, isActive: group.isActive });
    for (const subgroup of group.subgroups ?? []) {
      subgroups.push({
        id: subgroup.id,
        name: subgroup.name,
        isActive: subgroup.isActive,
        groupId: group.id,
        groupName: group.name
      });
      for (const equipment of subgroup.equipments ?? []) {
        equipments.push({
          id: equipment.id,
          name: equipment.name,
          manufacturer: equipment.manufacturer,
          model: equipment.model,
          defaultSlaHours: equipment.defaultSlaHours ?? null,
          expectedLifeYears: equipment.expectedLifeYears ?? null,
          notes: equipment.notes ?? null,
          attachments: parseEquipmentAttachments(equipment.attachments),
          isActive: equipment.isActive,
          subgroupId: subgroup.id,
          subgroupName: subgroup.name,
          groupId: group.id,
          groupName: group.name
        });
      }
    }
  }
  return { groups, subgroups, equipments };
}

export default function GestaoOsEquipamentosPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<EquipmentTab>('equipamentos');
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<
    | { kind: 'grupos'; row: GroupRow }
    | { kind: 'subgrupos'; row: SubgroupRow }
    | { kind: 'equipamentos'; row: EquipmentRow }
    | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: EquipmentTab;
    id: string;
    name: string;
  } | null>(null);

  const [groupForm, setGroupForm] = useState({ name: '' });
  const [subgroupForm, setSubgroupForm] = useState({ groupId: '', name: '' });
  const [equipmentForm, setEquipmentForm] = useState(EMPTY_EQUIPMENT_FORM);
  const [attachmentKind, setAttachmentKind] = useState<GestaoOsDocumentKind>('MANUAL');
  const [uploadingAttachments, setUploadingAttachments] = useState(false);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
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

  const {
    data: catalog = [],
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: ['gestao-os-cadastros', 'equipments'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: CatalogGroup[] }>(
        '/gestao-os/cadastros/equipments'
      );
      return res.data?.data ?? [];
    }
  });

  const { groups, subgroups, equipments } = useMemo(() => flattenCatalog(catalog), [catalog]);

  const groupOptions = useMemo(
    () => labeledToSelectOptions(groups.map((g) => ({ value: g.id, label: g.name }))),
    [groups]
  );

  const subgroupsForForm = useMemo(
    () => subgroups.filter((s) => !equipmentForm.groupId || s.groupId === equipmentForm.groupId),
    [subgroups, equipmentForm.groupId]
  );

  const subgroupOptions = useMemo(
    () =>
      labeledToSelectOptions(subgroupsForForm.map((s) => ({ value: s.id, label: s.name }))),
    [subgroupsForForm]
  );

  const q = searchTerm.trim().toLowerCase();
  const groupRows = useMemo(
    () => (q ? groups.filter((g) => g.name.toLowerCase().includes(q)) : groups),
    [groups, q]
  );
  const subgroupRows = useMemo(
    () =>
      q
        ? subgroups.filter((s) =>
            [s.name, s.groupName].join(' ').toLowerCase().includes(q)
          )
        : subgroups,
    [subgroups, q]
  );
  const equipmentRows = useMemo(
    () =>
      q
        ? equipments.filter((e) =>
            [e.name, e.groupName, e.subgroupName, e.manufacturer, e.model]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(q)
          )
        : equipments,
    [equipments, q]
  );

  const menuRows =
    tab === 'grupos' ? groupRows : tab === 'subgrupos' ? subgroupRows : equipmentRows;

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(menuRows);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['gestao-os-cadastros', 'equipments'] });
  };

  const resetForms = () => {
    setGroupForm({ name: '' });
    setSubgroupForm({ groupId: '', name: '' });
    setEquipmentForm(EMPTY_EQUIPMENT_FORM);
    setAttachmentKind('MANUAL');
  };

  const openCreate = () => {
    setEditingId(null);
    resetForms();
    setShowForm(true);
  };

  const openEditGroup = (row: GroupRow) => {
    setEditingId(row.id);
    setGroupForm({ name: row.name });
    setShowForm(true);
  };

  const openEditSubgroup = (row: SubgroupRow) => {
    setEditingId(row.id);
    setSubgroupForm({ groupId: row.groupId, name: row.name });
    setShowForm(true);
  };

  const openEditEquipment = (row: EquipmentRow) => {
    setEditingId(row.id);
    setEquipmentForm({
      groupId: row.groupId,
      subgroupId: row.subgroupId,
      name: row.name,
      manufacturer: row.manufacturer || '',
      model: row.model || '',
      defaultSlaHours: row.defaultSlaHours != null ? String(row.defaultSlaHours) : '',
      expectedLifeYears: row.expectedLifeYears != null ? String(row.expectedLifeYears) : '',
      notes: row.notes || '',
      attachments: row.attachments ?? []
    });
    setAttachmentKind('MANUAL');
    setShowForm(true);
  };

  const createGroup = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/equipment-groups', { name: groupForm.name });
    },
    onSuccess: () => {
      toast.success('Grupo cadastrado.');
      resetForms();
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao salvar grupo.');
    }
  });

  const updateGroup = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/gestao-os/cadastros/equipment-groups/${id}`, { name: groupForm.name });
    },
    onSuccess: () => {
      toast.success('Grupo atualizado.');
      resetForms();
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar grupo.');
    }
  });

  const createSubgroup = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/equipment-subgroups', subgroupForm);
    },
    onSuccess: () => {
      toast.success('Subgrupo cadastrado.');
      resetForms();
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao salvar subgrupo.');
    }
  });

  const updateSubgroup = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/gestao-os/cadastros/equipment-subgroups/${id}`, {
        name: subgroupForm.name
      });
    },
    onSuccess: () => {
      toast.success('Subgrupo atualizado.');
      resetForms();
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar subgrupo.');
    }
  });

  const createEquipment = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/equipments', {
        subgroupId: equipmentForm.subgroupId,
        name: equipmentForm.name,
        manufacturer: equipmentForm.manufacturer || null,
        model: equipmentForm.model || null,
        defaultSlaHours: equipmentForm.defaultSlaHours || null,
        expectedLifeYears: equipmentForm.expectedLifeYears || null,
        notes: equipmentForm.notes || null,
        attachments: equipmentForm.attachments
      });
    },
    onSuccess: () => {
      toast.success('Equipamento cadastrado.');
      resetForms();
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao salvar equipamento.');
    }
  });

  const updateEquipment = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/gestao-os/cadastros/equipments/${id}`, {
        name: equipmentForm.name,
        manufacturer: equipmentForm.manufacturer || null,
        model: equipmentForm.model || null,
        defaultSlaHours: equipmentForm.defaultSlaHours || null,
        expectedLifeYears: equipmentForm.expectedLifeYears || null,
        notes: equipmentForm.notes || null,
        attachments: equipmentForm.attachments
      });
    },
    onSuccess: () => {
      toast.success('Equipamento atualizado.');
      resetForms();
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar equipamento.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (target: { kind: EquipmentTab; id: string }) => {
      const path =
        target.kind === 'grupos'
          ? `/gestao-os/cadastros/equipment-groups/${target.id}`
          : target.kind === 'subgrupos'
            ? `/gestao-os/cadastros/equipment-subgroups/${target.id}`
            : `/gestao-os/cadastros/equipments/${target.id}`;
      await api.delete(path);
    },
    onSuccess: () => {
      toast.success('Registro excluído.');
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao excluir.');
    }
  });

  const uploadEquipmentFiles = async (files: File[]) => {
    if (!files.length) return;
    setUploadingAttachments(true);
    try {
      const uploaded: GestaoOsAttachment[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const res = await api.post('/gestao-os/upload-attachment', form, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        const data = res.data?.data;
        if (data?.url) {
          uploaded.push({
            url: data.url,
            name: data.name || file.name,
            mimeType: data.mimeType || file.type,
            kind: attachmentKind
          });
        }
      }
      setEquipmentForm((s) => ({ ...s, attachments: [...s.attachments, ...uploaded] }));
      toast.success(`${uploaded.length} anexo(s) enviado(s)`);
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'Falha no upload');
    } finally {
      setUploadingAttachments(false);
    }
  };

  const save = () => {
    if (tab === 'grupos') {
      if (!groupForm.name.trim()) return toast.error('Nome do grupo é obrigatório.');
      if (editingId) return updateGroup.mutate(editingId);
      return createGroup.mutate();
    }
    if (tab === 'subgrupos') {
      if (!subgroupForm.groupId) return toast.error('Selecione o grupo.');
      if (!subgroupForm.name.trim()) return toast.error('Nome do subgrupo é obrigatório.');
      if (editingId) return updateSubgroup.mutate(editingId);
      return createSubgroup.mutate();
    }
    if (!equipmentForm.groupId) return toast.error('Selecione o grupo.');
    if (!equipmentForm.subgroupId) return toast.error('Selecione o subgrupo.');
    if (!equipmentForm.name.trim()) return toast.error('Nome do equipamento é obrigatório.');
    if (editingId) return updateEquipment.mutate(editingId);
    return createEquipment.mutate();
  };

  const isSaving =
    createGroup.isPending ||
    updateGroup.isPending ||
    createSubgroup.isPending ||
    updateSubgroup.isPending ||
    createEquipment.isPending ||
    updateEquipment.isPending;

  const tabMeta = TABS.find((item) => item.id === tab)!;
  const TabIcon = tab === 'grupos' ? Layers : tab === 'subgrupos' ? Boxes : Wrench;
  const novoLabel =
    tab === 'grupos'
      ? 'Novo Grupo'
      : tab === 'subgrupos'
        ? 'Novo Subgrupo'
        : 'Novo Equipamento';
  const formTitle = editingId
    ? tab === 'grupos'
      ? 'Editar Grupo'
      : tab === 'subgrupos'
        ? 'Editar Subgrupo'
        : 'Editar Equipamento'
    : novoLabel;
  const countLabel =
    tab === 'grupos'
      ? `${groupRows.length} grupo(s)`
      : tab === 'subgrupos'
        ? `${subgroupRows.length} subgrupo(s)`
        : `${equipmentRows.length} equipamento(s)`;
  const loadError =
    (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
    (error as Error)?.message ||
    'Não foi possível carregar os equipamentos.';
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/sistema-gestao-os/equipamentos">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Equipamentos
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Grupo, subgrupo e equipamento para classificação dos chamados.
            </p>
          </div>

          <AppUnderlineTabList aria-label="Seções de equipamentos">
            {TABS.map((item) => {
              const active = tab === item.id;
              return (
                <AppUnderlineTabButton
                  key={item.id}
                  active={active}
                  onClick={() => {
                    setTab(item.id);
                    setSearchTerm('');
                    closeRowActionMenu();
                  }}
                  className="whitespace-nowrap px-2 py-2.5 text-xs sm:px-3 sm:text-sm"
                >
                  {item.label}
                </AppUnderlineTabButton>
              );
            })}
          </AppUnderlineTabList>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <TabIcon className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {tabMeta.label}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isError ? 'Erro ao carregar.' : countLabel}
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
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    {novoLabel}
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isError ? (
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <AlertCircle className="h-10 w-10 text-red-500" />
                  <p className="max-w-md text-sm text-gray-700 dark:text-gray-300">{loadError}</p>
                </div>
              ) : isLoading ? (
                <CadastroListLoading message="Carregando..." />
              ) : menuRows.length === 0 ? (
                <CadastroListEmpty
                  icon={TabIcon}
                  title={
                    tab === 'grupos'
                      ? 'Nenhum grupo encontrado'
                      : tab === 'subgrupos'
                        ? 'Nenhum subgrupo encontrado'
                        : 'Nenhum equipamento encontrado'
                  }
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : `Use “${novoLabel}” para cadastrar`
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={1}
                    endItem={menuRows.length}
                    total={menuRows.length}
                    itemLabel="registro"
                    itemLabelPlural="registros"
                  />
                  <div className="table-scroll">
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={`${cadastroListClasses.th} w-14 whitespace-nowrap !px-2 sm:!px-3`}>
                            ID
                          </th>
                          {tab === 'grupos' ? (
                            <>
                              <th className={`${cadastroListClasses.th} !pl-2 sm:!pl-3`}>Nome</th>
                              <th className={cadastroListClasses.thRight}>Ação</th>
                            </>
                          ) : null}
                          {tab === 'subgrupos' ? (
                            <>
                              <th className={`${cadastroListClasses.th} !pl-2 sm:!pl-3`}>Nome</th>
                              <th className={cadastroListClasses.thCenter}>Grupo</th>
                              <th className={cadastroListClasses.thRight}>Ação</th>
                            </>
                          ) : null}
                          {tab === 'equipamentos' ? (
                            <>
                              <th className={`${cadastroListClasses.th} !pl-2 sm:!pl-3`}>Nome</th>
                              <th className={cadastroListClasses.thCenter}>Subgrupo</th>
                              <th className={cadastroListClasses.thCenter}>Grupo</th>
                              <th className={cadastroListClasses.thRight}>Ação</th>
                            </>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {tab === 'grupos'
                          ? groupRows.map((row, index) => (
                              <tr
                                key={row.id}
                                role="button"
                                tabIndex={0}
                                className={listTableRowClasses.trNavigable}
                                onClick={() => setViewing({ kind: 'grupos', row })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setViewing({ kind: 'grupos', row });
                                  }
                                }}
                              >
                                <td className={`${cadastroListClasses.tdMono} w-14 !px-2 sm:!px-3`}>
                                  {formatCadastroListId(null, index + 1)}
                                </td>
                                <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                                  <ListRowNavigableLabel className="block truncate">
                                    {row.name}
                                  </ListRowNavigableLabel>
                                </td>
                                <RowActionMenuCell
                                  isOpen={isRowMenuOpen(row.id)}
                                  onToggle={(e) =>
                                    toggleRowActionMenu(
                                      row.id,
                                      e.currentTarget as HTMLButtonElement
                                    )
                                  }
                                />
                              </tr>
                            ))
                          : null}
                        {tab === 'subgrupos'
                          ? subgroupRows.map((row, index) => (
                              <tr
                                key={row.id}
                                role="button"
                                tabIndex={0}
                                className={listTableRowClasses.trNavigable}
                                onClick={() => setViewing({ kind: 'subgrupos', row })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setViewing({ kind: 'subgrupos', row });
                                  }
                                }}
                              >
                                <td className={`${cadastroListClasses.tdMono} w-14 !px-2 sm:!px-3`}>
                                  {formatCadastroListId(null, index + 1)}
                                </td>
                                <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                                  <ListRowNavigableLabel className="block truncate">
                                    {row.name}
                                  </ListRowNavigableLabel>
                                </td>
                                <td className={cadastroListClasses.tdCenter}>{row.groupName}</td>
                                <RowActionMenuCell
                                  isOpen={isRowMenuOpen(row.id)}
                                  onToggle={(e) =>
                                    toggleRowActionMenu(
                                      row.id,
                                      e.currentTarget as HTMLButtonElement
                                    )
                                  }
                                />
                              </tr>
                            ))
                          : null}
                        {tab === 'equipamentos'
                          ? equipmentRows.map((row, index) => (
                              <tr
                                key={row.id}
                                role="button"
                                tabIndex={0}
                                className={listTableRowClasses.trNavigable}
                                onClick={() => setViewing({ kind: 'equipamentos', row })}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setViewing({ kind: 'equipamentos', row });
                                  }
                                }}
                              >
                                <td className={`${cadastroListClasses.tdMono} w-14 !px-2 sm:!px-3`}>
                                  {formatCadastroListId(null, index + 1)}
                                </td>
                                <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                                  <ListRowNavigableLabel className="block truncate">
                                    {row.name}
                                  </ListRowNavigableLabel>
                                </td>
                                <td className={cadastroListClasses.tdCenter}>{row.subgroupName}</td>
                                <td className={cadastroListClasses.tdCenter}>{row.groupName}</td>
                                <RowActionMenuCell
                                  isOpen={isRowMenuOpen(row.id)}
                                  onToggle={(e) =>
                                    toggleRowActionMenu(
                                      row.id,
                                      e.currentTarget as HTMLButtonElement
                                    )
                                  }
                                />
                              </tr>
                            ))
                          : null}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {rowActionMenu && rowForActionMenu ? (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={() => {
                    if (tab === 'grupos') {
                      const row = groupRows.find((x) => x.id === rowForActionMenu.id);
                      if (row) openEditGroup(row);
                    } else if (tab === 'subgrupos') {
                      const row = subgroupRows.find((x) => x.id === rowForActionMenu.id);
                      if (row) openEditSubgroup(row);
                    } else {
                      const row = equipmentRows.find((x) => x.id === rowForActionMenu.id);
                      if (row) openEditEquipment(row);
                    }
                  }}
                  onDelete={() =>
                    setDeleteTarget({
                      kind: tab,
                      id: rowForActionMenu.id,
                      name:
                        'name' in rowForActionMenu
                          ? String((rowForActionMenu as { name?: string }).name ?? '')
                          : ''
                    })
                  }
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {showForm ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => requestCloseForm()} />
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formTitle}
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
                className="space-y-4 p-6"
                onSubmit={(e) => {
                  e.preventDefault();
                  save();
                }}
              >
                {tab === 'grupos' ? (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Nome *
                    </label>
                    <input
                      value={groupForm.name}
                      onChange={(e) => setGroupForm({ name: e.target.value })}
                      placeholder="Ex.: CIVIL"
                      className={FORM_FIELD_INPUT_CLS}
                      required
                    />
                  </div>
                ) : null}

                {tab === 'subgrupos' ? (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Grupo *
                      </label>
                      <StringSingleSelectDropdown
                        value={subgroupForm.groupId}
                        onChange={(v) => setSubgroupForm((s) => ({ ...s, groupId: v }))}
                        options={groupOptions}
                        placeholder="Selecione o grupo"
                        emptyOptionLabel="Selecione o grupo"
                        allowEmpty
                        disabled={Boolean(editingId)}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Nome *
                      </label>
                      <input
                        value={subgroupForm.name}
                        onChange={(e) =>
                          setSubgroupForm((s) => ({ ...s, name: e.target.value }))
                        }
                        placeholder="Ex.: ÁREAS EXTERNAS"
                        className={FORM_FIELD_INPUT_CLS}
                        required
                      />
                    </div>
                  </>
                ) : null}

                {tab === 'equipamentos' ? (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Grupo *
                      </label>
                      <StringSingleSelectDropdown
                        value={equipmentForm.groupId}
                        onChange={(v) =>
                          setEquipmentForm((s) => ({ ...s, groupId: v, subgroupId: '' }))
                        }
                        options={groupOptions}
                        placeholder="Selecione o grupo"
                        emptyOptionLabel="Selecione o grupo"
                        allowEmpty
                        disabled={Boolean(editingId)}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Subgrupo *
                      </label>
                      <StringSingleSelectDropdown
                        value={equipmentForm.subgroupId}
                        onChange={(v) => setEquipmentForm((s) => ({ ...s, subgroupId: v }))}
                        options={subgroupOptions}
                        placeholder={
                          !equipmentForm.groupId
                            ? 'Selecione o grupo primeiro'
                            : subgroupsForForm.length === 0
                              ? 'Nenhum subgrupo cadastrado'
                              : 'Selecione o subgrupo'
                        }
                        emptyOptionLabel="Selecione o subgrupo"
                        allowEmpty
                        disabled={!equipmentForm.groupId || Boolean(editingId)}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Nome *
                      </label>
                      <input
                        value={equipmentForm.name}
                        onChange={(e) =>
                          setEquipmentForm((s) => ({ ...s, name: e.target.value }))
                        }
                        placeholder="Ex.: Portão de acesso"
                        className={FORM_FIELD_INPUT_CLS}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Fabricante
                      </label>
                      <input
                        value={equipmentForm.manufacturer}
                        onChange={(e) =>
                          setEquipmentForm((s) => ({ ...s, manufacturer: e.target.value }))
                        }
                        placeholder=""
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Modelo
                      </label>
                      <input
                        value={equipmentForm.model}
                        onChange={(e) =>
                          setEquipmentForm((s) => ({ ...s, model: e.target.value }))
                        }
                        placeholder=""
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        SLA Padrão
                      </label>
                      <StringSingleSelectDropdown
                        value={equipmentForm.defaultSlaHours}
                        onChange={(v) =>
                          setEquipmentForm((s) => ({ ...s, defaultSlaHours: v }))
                        }
                        options={SLA_OPTIONS}
                        placeholder="Nenhum"
                        emptyOptionLabel="Nenhum"
                        allowEmpty
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Expectativa vida útil
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={equipmentForm.expectedLifeYears}
                          onChange={(e) =>
                            setEquipmentForm((s) => ({
                              ...s,
                              expectedLifeYears: e.target.value.replace(/\D/g, '')
                            }))
                          }
                          placeholder=""
                          className={`${FORM_FIELD_INPUT_CLS} pr-14`}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-500 dark:text-gray-400">
                          anos
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Observações
                      </label>
                      <textarea
                        value={equipmentForm.notes}
                        onChange={(e) =>
                          setEquipmentForm((s) => ({ ...s, notes: e.target.value }))
                        }
                        rows={3}
                        className={FORM_FIELD_TEXTAREA_CLS}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Anexos
                      </label>
                      <StringSingleSelectDropdown
                        value={attachmentKind}
                        onChange={(v) => setAttachmentKind((v || 'MANUAL') as GestaoOsDocumentKind)}
                        options={EQUIPMENT_DOC_KIND_OPTIONS}
                        placeholder="Tipo do documento"
                        allowEmpty={false}
                        disableSearch
                      />
                      <GestaoOsAttachmentsField
                        files={equipmentForm.attachments}
                        uploading={uploadingAttachments}
                        onFilesSelect={uploadEquipmentFiles}
                        onRemove={(url) =>
                          setEquipmentForm((s) => ({
                            ...s,
                            attachments: s.attachments.filter((file) => file.url !== url)
                          }))
                        }
                        label="Clique ou arraste os arquivos"
                        hint="PDF, PNG ou JPG — manual, garantia, laudo, etc."
                      />
                    </div>
                  </>
                ) : null}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => requestCloseForm()}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving || uploadingAttachments}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {isSaving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            </div>
          </AppModalOverlay>
        ) : null}

        {formConfirmUi}

        {viewing ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setViewing(null)} />
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {viewing.kind === 'grupos'
                    ? 'Detalhes do Grupo'
                    : viewing.kind === 'subgrupos'
                      ? 'Detalhes do Subgrupo'
                      : 'Detalhes do Equipamento'}
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
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Nome
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">{viewing.row.name}</p>
                </div>
                {viewing.kind === 'subgrupos' ? (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Grupo
                    </p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {viewing.row.groupName}
                    </p>
                  </div>
                ) : null}
                {viewing.kind === 'equipamentos' ? (
                  <>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Subgrupo
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {viewing.row.subgroupName}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Grupo
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {viewing.row.groupName}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Fabricante
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {viewing.row.manufacturer || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Modelo
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {viewing.row.model || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        SLA Padrão
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {formatSlaHours(viewing.row.defaultSlaHours)}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Expectativa vida útil
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {viewing.row.expectedLifeYears != null
                          ? `${viewing.row.expectedLifeYears} anos`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Observações
                      </p>
                      <p className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100">
                        {viewing.row.notes || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Anexos
                      </p>
                      {viewing.row.attachments.length > 0 ? (
                        <ul className="space-y-1.5">
                          {viewing.row.attachments.map((file) => {
                            const href = resolveApiMediaUrl(file.url);
                            return (
                              <li key={file.url}>
                                {href ? (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                                  >
                                    {file.kind && DOCUMENT_KIND_LABELS[file.kind]
                                      ? `${DOCUMENT_KIND_LABELS[file.kind]} · ${file.name}`
                                      : file.name}
                                  </a>
                                ) : (
                                  <span className="text-sm text-gray-900 dark:text-gray-100">
                                    {file.name}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <p className="text-sm text-gray-900 dark:text-gray-100">—</p>
                      )}
                    </div>
                  </>
                ) : null}
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
          </AppModalOverlay>
        ) : null}

        {deleteTarget ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir {deleteTarget.name}?
              </h3>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                {deleteTarget.kind === 'grupos'
                  ? 'Subgrupos e equipamentos vinculados também serão removidos.'
                  : deleteTarget.kind === 'subgrupos'
                    ? 'Equipamentos vinculados também serão removidos.'
                    : 'Esta ação não pode ser desfeita.'}
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
                  onClick={() => deleteMutation.mutate(deleteTarget)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}
      </MainLayout>
    </ProtectedRoute>
  );
}
