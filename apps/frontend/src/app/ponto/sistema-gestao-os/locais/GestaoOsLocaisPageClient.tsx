'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Building2,
  Layers,
  MapPin,
  Plus,
  Printer,
  QrCode,
  Search,
  Wrench,
  X
} from 'lucide-react';
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
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { GestaoOsAssetQrLabel } from '@/components/gestao-os/GestaoOsAssetQrLabel';
import { GestaoOsAssetQrLabelsPickerModal } from '@/components/gestao-os/GestaoOsAssetQrLabelsPickerModal';
import { useBrandingLogo } from '@/hooks/useBrandingLogo';
import { downloadGestaoOsAssetQrLabelsPdf } from '@/lib/printGestaoOsAssetQrLabels';
import type { GestaoOsAssetQr } from '../gestaoOsTypes';

type LocationAdminTree = Array<{
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  sectors: Array<{
    id: string;
    name: string;
    code: string | null;
    isActive: boolean;
    places: Array<{
      id: string;
      name: string;
      code: string | null;
      isActive: boolean;
      assets: Array<{
        id: string;
        name: string;
        code: string | null;
        category: string | null;
        qrToken: string;
        isActive: boolean;
        warrantyEndsAt?: string | null;
      }>;
    }>;
  }>;
}>;

type LocaisTab = 'predios' | 'setores' | 'locais' | 'ativos';

const TABS: ReadonlyArray<{ id: LocaisTab; label: string }> = [
  { id: 'ativos', label: 'Ativos' },
  { id: 'predios', label: 'Prédios' },
  { id: 'setores', label: 'Andar' },
  { id: 'locais', label: 'Locais' }
];

type BuildingRow = { id: string; name: string; code: string | null; isActive: boolean };
type SectorRow = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  buildingId: string;
  buildingName: string;
};
type PlaceRow = {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  sectorId: string;
  sectorName: string;
  buildingName: string;
};
type AssetRow = {
  id: string;
  name: string;
  code: string | null;
  category: string | null;
  isActive: boolean;
  placeId: string;
  placeName: string;
  sectorName: string;
  buildingName: string;
  warrantyEndsAt?: string | null;
};

function flattenTree(tree: LocationAdminTree) {
  const buildings: BuildingRow[] = [];
  const sectors: SectorRow[] = [];
  const places: PlaceRow[] = [];
  const assets: AssetRow[] = [];
  for (const b of tree) {
    buildings.push({ id: b.id, name: b.name, code: b.code, isActive: b.isActive });
    for (const s of b.sectors ?? []) {
      sectors.push({
        id: s.id,
        name: s.name,
        code: s.code,
        isActive: s.isActive,
        buildingId: b.id,
        buildingName: b.name
      });
      for (const p of s.places ?? []) {
        places.push({
          id: p.id,
          name: p.name,
          code: p.code,
          isActive: p.isActive,
          sectorId: s.id,
          sectorName: s.name,
          buildingName: b.name
        });
        for (const a of p.assets ?? []) {
          assets.push({
            id: a.id,
            name: a.name,
            code: a.code,
            category: a.category,
            isActive: a.isActive,
            placeId: p.id,
            placeName: p.name,
            sectorName: s.name,
            buildingName: b.name,
            warrantyEndsAt: a.warrantyEndsAt ?? null
          });
        }
      }
    }
  }
  return { buildings, sectors, places, assets };
}

export default function GestaoOsLocaisPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { logoAlt, useUnbBranding } = useBrandingLogo();
  const printLogoSrc = useUnbBranding ? '/predialpreto.png' : '/logopv.png';
  const [tab, setTab] = useState<LocaisTab>('ativos');
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [buildingForm, setBuildingForm] = useState({ name: '', code: '' });
  const [sectorForm, setSectorForm] = useState({ buildingId: '', name: '', code: '' });
  const [placeForm, setPlaceForm] = useState({ sectorId: '', name: '', code: '' });
  const [assetForm, setAssetForm] = useState({
    placeId: '',
    name: '',
    code: '',
    category: '',
    warrantyEndsAt: ''
  });
  const [qrPreview, setQrPreview] = useState<GestaoOsAssetQr | null>(null);
  const [printingLabels, setPrintingLabels] = useState(false);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [labelPickerInitialIds, setLabelPickerInitialIds] = useState<string[]>([]);
  const [qrPreviewQty, setQrPreviewQty] = useState(1);
  const [viewing, setViewing] = useState<
    | { kind: 'predios'; row: BuildingRow }
    | { kind: 'setores'; row: SectorRow }
    | { kind: 'locais'; row: PlaceRow }
    | { kind: 'ativos'; row: AssetRow }
    | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
    kind: LocaisTab;
  } | null>(null);

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
    data: locations = [],
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: ['gestao-os-cadastros', 'locations'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: LocationAdminTree }>(
        '/gestao-os/cadastros/locations'
      );
      return res.data?.data ?? [];
    }
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['gestao-os-cadastros', 'locations'] });
    void queryClient.invalidateQueries({ queryKey: ['gestao-os-locations'] });
  };

  const { buildings, sectors, places, assets } = useMemo(
    () => flattenTree(locations),
    [locations]
  );

  const filterText = (parts: Array<string | null | undefined>) => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return parts
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(q);
  };

  const buildingRows = useMemo(
    () => buildings.filter((r) => filterText([r.name, r.code])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildings, searchTerm]
  );
  const sectorRows = useMemo(
    () => sectors.filter((r) => filterText([r.name, r.code, r.buildingName])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sectors, searchTerm]
  );
  const placeRows = useMemo(
    () => places.filter((r) => filterText([r.name, r.code, r.sectorName, r.buildingName])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [places, searchTerm]
  );
  const assetRows = useMemo(
    () =>
      assets.filter((r) =>
        filterText([r.name, r.code, r.category, r.placeName, r.sectorName, r.buildingName])
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [assets, searchTerm]
  );

  const menuRows =
    tab === 'predios'
      ? buildingRows
      : tab === 'setores'
        ? sectorRows
        : tab === 'locais'
          ? placeRows
          : assetRows;

  const buildingSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        buildings.map((b) => ({ value: b.id, label: b.name, searchText: `${b.name} ${b.code ?? ''}` }))
      ),
    [buildings]
  );

  const sectorSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        sectors.map((s) => ({
          value: s.id,
          label: `${s.buildingName} › ${s.name}`,
          searchText: `${s.buildingName} ${s.name} ${s.code ?? ''}`
        }))
      ),
    [sectors]
  );

  const placeSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        places.map((p) => ({
          value: p.id,
          label: `${p.buildingName} › ${p.sectorName} › ${p.name}`,
          searchText: `${p.buildingName} ${p.sectorName} ${p.name} ${p.code ?? ''}`
        }))
      ),
    [places]
  );

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(menuRows);

  const createBuilding = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/buildings', {
        name: buildingForm.name.trim(),
        code: buildingForm.code.trim() || null,
        companyId: null,
        branchId: null
      });
    },
    onSuccess: () => {
      toast.success('Prédio cadastrado.');
      setBuildingForm({ name: '', code: '' });
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao salvar prédio.');
    }
  });

  const updateBuilding = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/gestao-os/cadastros/buildings/${id}`, {
        name: buildingForm.name.trim(),
        code: buildingForm.code.trim() || null
      });
    },
    onSuccess: () => {
      toast.success('Prédio atualizado.');
      setBuildingForm({ name: '', code: '' });
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar prédio.');
    }
  });

  const createSector = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/sectors', {
        buildingId: sectorForm.buildingId,
        name: sectorForm.name.trim(),
        code: sectorForm.code.trim() || null
      });
    },
    onSuccess: () => {
      toast.success('Andar cadastrado.');
      setSectorForm({ buildingId: '', name: '', code: '' });
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao salvar andar.');
    }
  });

  const updateSector = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/gestao-os/cadastros/sectors/${id}`, {
        name: sectorForm.name.trim(),
        code: sectorForm.code.trim() || null
      });
    },
    onSuccess: () => {
      toast.success('Andar atualizado.');
      setSectorForm({ buildingId: '', name: '', code: '' });
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar andar.');
    }
  });

  const createPlace = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/places', {
        sectorId: placeForm.sectorId,
        name: placeForm.name.trim(),
        code: placeForm.code.trim() || null
      });
    },
    onSuccess: () => {
      toast.success('Local cadastrado.');
      setPlaceForm({ sectorId: '', name: '', code: '' });
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao salvar local.');
    }
  });

  const updatePlace = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/gestao-os/cadastros/places/${id}`, {
        name: placeForm.name.trim(),
        code: placeForm.code.trim() || null
      });
    },
    onSuccess: () => {
      toast.success('Local atualizado.');
      setPlaceForm({ sectorId: '', name: '', code: '' });
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar local.');
    }
  });

  const createAsset = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/assets', {
        placeId: assetForm.placeId,
        name: assetForm.name.trim(),
        code: assetForm.code.trim() || null,
        category: assetForm.category.trim() || null,
        warrantyEndsAt: assetForm.warrantyEndsAt || null
      });
    },
    onSuccess: () => {
      toast.success('Ativo cadastrado (QR gerado).');
      setAssetForm({ placeId: '', name: '', code: '', category: '', warrantyEndsAt: '' });
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao salvar ativo.');
    }
  });

  const updateAsset = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/gestao-os/cadastros/assets/${id}`, {
        name: assetForm.name.trim(),
        code: assetForm.code.trim() || null,
        category: assetForm.category.trim() || null,
        warrantyEndsAt: assetForm.warrantyEndsAt || null
      });
    },
    onSuccess: () => {
      toast.success('Ativo atualizado.');
      setAssetForm({ placeId: '', name: '', code: '', category: '', warrantyEndsAt: '' });
      closeForm();
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar ativo.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (target: { id: string; kind: LocaisTab }) => {
      const path =
        target.kind === 'predios'
          ? `/gestao-os/cadastros/buildings/${target.id}`
          : target.kind === 'setores'
            ? `/gestao-os/cadastros/sectors/${target.id}`
            : target.kind === 'locais'
              ? `/gestao-os/cadastros/places/${target.id}`
              : `/gestao-os/cadastros/assets/${target.id}`;
      await api.delete(path);
    },
    onSuccess: () => {
      toast.success('Registro excluído.');
      setDeleteTarget(null);
      setViewing(null);
      invalidate();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao excluir.');
    }
  });

  const downloadLabelsPdf = async (
    picks: Array<{ id: string; quantity: number }>
  ) => {
    const ids = picks.map((pick) => pick.id).filter(Boolean).slice(0, 120);
    if (!ids.length) {
      toast.error('Selecione ao menos um ativo.');
      return;
    }
    const quantities = Object.fromEntries(
      picks.map((pick) => [pick.id, Math.min(20, Math.max(1, pick.quantity || 1))])
    );
    setPrintingLabels(true);
    try {
      const res = await api.post<{ success: boolean; data: GestaoOsAssetQr[] }>(
        '/gestao-os/cadastros/assets/qr-labels',
        { ids }
      );
      const labels = res.data?.data ?? [];
      if (!labels.length) {
        toast.error('Não foi possível gerar as etiquetas.');
        return;
      }
      const count = await downloadGestaoOsAssetQrLabelsPdf(labels, {
        companyName: logoAlt,
        forceUnbBranding: useUnbBranding,
        quantities
      });
      toast.success(`${count} etiqueta(s) no PDF.`);
      setLabelPickerOpen(false);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Erro ao gerar o PDF.'
      );
    } finally {
      setPrintingLabels(false);
    }
  };

  const openLabelPicker = (initialIds: string[] = []) => {
    setLabelPickerInitialIds(initialIds);
    setLabelPickerOpen(true);
  };

  const downloadSingleLabelPdf = async (label: GestaoOsAssetQr, quantity = 1) => {
    setPrintingLabels(true);
    try {
      const count = await downloadGestaoOsAssetQrLabelsPdf([label], {
        companyName: logoAlt,
        forceUnbBranding: useUnbBranding,
        quantities: { [label.assetId]: quantity }
      });
      toast.success(`${count} etiqueta(s) no PDF.`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erro ao gerar o PDF.');
    } finally {
      setPrintingLabels(false);
    }
  };

  const openQr = async (assetId: string) => {
    try {
      const res = await api.get<{ success: boolean; data: GestaoOsAssetQr }>(
        `/gestao-os/cadastros/assets/${assetId}/qr`
      );
      setQrPreview(res.data?.data ?? null);
      setQrPreviewQty(1);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Erro ao carregar QR Code.'
      );
    }
  };

  const regenerateQr = async (assetId: string) => {
    try {
      await api.patch(`/gestao-os/cadastros/assets/${assetId}`, { regenerateQr: true });
      toast.success('QR regenerado.');
      invalidate();
      await openQr(assetId);
    } catch (err: unknown) {
      toast.error(
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Erro ao regenerar QR.'
      );
    }
  };

  const openNew = () => {
    setEditingId(null);
    if (tab === 'predios') setBuildingForm({ name: '', code: '' });
    if (tab === 'setores') setSectorForm({ buildingId: '', name: '', code: '' });
    if (tab === 'locais') setPlaceForm({ sectorId: '', name: '', code: '' });
    if (tab === 'ativos')
      setAssetForm({ placeId: '', name: '', code: '', category: '', warrantyEndsAt: '' });
    setShowForm(true);
  };

  const openViewBuilding = (r: BuildingRow) => setViewing({ kind: 'predios', row: r });
  const openViewSector = (r: SectorRow) => setViewing({ kind: 'setores', row: r });
  const openViewPlace = (r: PlaceRow) => setViewing({ kind: 'locais', row: r });
  const openViewAsset = (r: AssetRow) => setViewing({ kind: 'ativos', row: r });

  const openEditBuilding = (r: BuildingRow) => {
    setViewing(null);
    setEditingId(r.id);
    setBuildingForm({ name: r.name, code: r.code ?? '' });
    setShowForm(true);
  };

  const openEditSector = (r: SectorRow) => {
    setViewing(null);
    setEditingId(r.id);
    setSectorForm({ buildingId: r.buildingId, name: r.name, code: r.code ?? '' });
    setShowForm(true);
  };

  const openEditPlace = (r: PlaceRow) => {
    setViewing(null);
    setEditingId(r.id);
    setPlaceForm({ sectorId: r.sectorId, name: r.name, code: r.code ?? '' });
    setShowForm(true);
  };

  const openEditAsset = (r: AssetRow) => {
    setViewing(null);
    setEditingId(r.id);
    setAssetForm({
      placeId: r.placeId,
      name: r.name,
      code: r.code ?? '',
      category: r.category ?? '',
      warrantyEndsAt: r.warrantyEndsAt ? String(r.warrantyEndsAt).slice(0, 10) : ''
    });
    setShowForm(true);
  };

  const openDeleteForRow = (id: string, name: string) => {
    setDeleteTarget({ id, name, kind: tab });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'predios') {
      if (!buildingForm.name.trim()) return toast.error('Nome do prédio é obrigatório.');
      if (editingId) updateBuilding.mutate(editingId);
      else createBuilding.mutate();
      return;
    }
    if (tab === 'setores') {
      if (!sectorForm.buildingId) return toast.error('Selecione o prédio.');
      if (!sectorForm.name.trim()) return toast.error('Nome do andar é obrigatório.');
      if (editingId) updateSector.mutate(editingId);
      else createSector.mutate();
      return;
    }
    if (tab === 'locais') {
      if (!placeForm.sectorId) return toast.error('Selecione o andar.');
      if (!placeForm.name.trim()) return toast.error('Nome do local é obrigatório.');
      if (editingId) updatePlace.mutate(editingId);
      else createPlace.mutate();
      return;
    }
    if (!assetForm.placeId) return toast.error('Selecione o local.');
    if (!assetForm.name.trim()) return toast.error('Nome do ativo é obrigatório.');
    if (editingId) updateAsset.mutate(editingId);
    else createAsset.mutate();
  };

  const loadError =
    isError &&
    ((error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (error as Error)?.message ||
      'Não foi possível carregar os locais.');

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const tabMeta = TABS.find((t) => t.id === tab)!;
  const TabIcon =
    tab === 'predios'
      ? Building2
      : tab === 'setores'
        ? Layers
        : tab === 'locais'
          ? MapPin
          : Wrench;

  const novoLabel =
    tab === 'predios'
      ? 'Novo Prédio'
      : tab === 'setores'
        ? 'Novo Andar'
        : tab === 'locais'
          ? 'Novo Local'
          : 'Novo Ativo';

  const formTitle = editingId
    ? tab === 'predios'
      ? 'Editar Prédio'
      : tab === 'setores'
        ? 'Editar Andar'
        : tab === 'locais'
          ? 'Editar Local'
          : 'Editar Ativo'
    : novoLabel;

  const isSaving =
    createBuilding.isPending ||
    updateBuilding.isPending ||
    createSector.isPending ||
    updateSector.isPending ||
    createPlace.isPending ||
    updatePlace.isPending ||
    createAsset.isPending ||
    updateAsset.isPending;

  const countLabel =
    tab === 'predios'
      ? `${buildingRows.length} prédio(s)`
      : tab === 'setores'
        ? `${sectorRows.length} andar(es)`
        : tab === 'locais'
          ? `${placeRows.length} local(is)`
          : `${assetRows.length} ativo(s)`;

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/sistema-gestao-os/locais">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Locais e Ativos
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Hierarquia prédio › andar › local e ativos com QR Code para a Central de Chamados.
            </p>
          </div>

          <AppUnderlineTabList aria-label="Seções de locais e ativos">
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
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
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
                  {tab === 'ativos' && assetRows.length > 0 ? (
                    <button
                      type="button"
                      disabled={printingLabels}
                      onClick={() => openLabelPicker()}
                      className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      title="Baixar etiquetas PDF"
                      aria-label="Baixar etiquetas PDF"
                    >
                      <Printer className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={openNew}
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
                    tab === 'predios'
                      ? 'Nenhum prédio encontrado'
                      : tab === 'setores'
                        ? 'Nenhum andar encontrado'
                        : tab === 'locais'
                          ? 'Nenhum local encontrado'
                          : 'Nenhum ativo encontrado'
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
                          {tab === 'predios' ? (
                            <>
                              <th className={`${cadastroListClasses.th} !pl-2 sm:!pl-3`}>Nome</th>
                              <th className={`${cadastroListClasses.thCenter} w-28`}>Código</th>
                              <th className={cadastroListClasses.thRight}>Ação</th>
                            </>
                          ) : null}
                          {tab === 'setores' ? (
                            <>
                              <th className={`${cadastroListClasses.th} !pl-2 sm:!pl-3`}>Nome</th>
                              <th className={`${cadastroListClasses.thCenter} w-28`}>Código</th>
                              <th className={cadastroListClasses.thCenter}>Prédio</th>
                              <th className={cadastroListClasses.thRight}>Ação</th>
                            </>
                          ) : null}
                          {tab === 'locais' ? (
                            <>
                              <th className={`${cadastroListClasses.th} !pl-2 sm:!pl-3`}>Nome</th>
                              <th className={`${cadastroListClasses.thCenter} w-28`}>Código</th>
                              <th className={cadastroListClasses.thCenter}>Andar</th>
                              <th className={cadastroListClasses.thCenter}>Prédio</th>
                              <th className={cadastroListClasses.thRight}>Ação</th>
                            </>
                          ) : null}
                          {tab === 'ativos' ? (
                            <>
                              <th className={`${cadastroListClasses.th} !pl-2 sm:!pl-3`}>Ativo</th>
                              <th className={`${cadastroListClasses.thCenter} w-28`}>Código</th>
                              <th className={`${cadastroListClasses.thCenter} w-36`}>Categoria</th>
                              <th className={cadastroListClasses.th}>Local</th>
                              <th className={cadastroListClasses.thRight}>Ação</th>
                            </>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {tab === 'predios'
                          ? buildingRows.map((r, index) => (
                              <tr
                                key={r.id}
                                role="button"
                                tabIndex={0}
                                className={listTableRowClasses.trNavigable}
                                onClick={() => openViewBuilding(r)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openViewBuilding(r);
                                  }
                                }}
                              >
                                <td className={`${cadastroListClasses.tdMono} w-14 !px-2 sm:!px-3`}>
                                  {formatCadastroListId(null, index + 1)}
                                </td>
                                <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                                  <ListRowNavigableLabel className="block truncate">
                                    {r.name}
                                  </ListRowNavigableLabel>
                                </td>
                                <td className={cadastroListClasses.tdCenter}>{r.code || '—'}</td>
                                <RowActionMenuCell
                                  isOpen={isRowMenuOpen(r.id)}
                                  onToggle={(e) =>
                                    toggleRowActionMenu(r.id, e.currentTarget as HTMLButtonElement)
                                  }
                                />
                              </tr>
                            ))
                          : null}
                        {tab === 'setores'
                          ? sectorRows.map((r, index) => (
                              <tr
                                key={r.id}
                                role="button"
                                tabIndex={0}
                                className={listTableRowClasses.trNavigable}
                                onClick={() => openViewSector(r)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openViewSector(r);
                                  }
                                }}
                              >
                                <td className={`${cadastroListClasses.tdMono} w-14 !px-2 sm:!px-3`}>
                                  {formatCadastroListId(null, index + 1)}
                                </td>
                                <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                                  <ListRowNavigableLabel className="block truncate">
                                    {r.name}
                                  </ListRowNavigableLabel>
                                </td>
                                <td className={cadastroListClasses.tdCenter}>{r.code || '—'}</td>
                                <td className={cadastroListClasses.tdCenter}>
                                  <span className="block truncate">{r.buildingName}</span>
                                </td>
                                <RowActionMenuCell
                                  isOpen={isRowMenuOpen(r.id)}
                                  onToggle={(e) =>
                                    toggleRowActionMenu(r.id, e.currentTarget as HTMLButtonElement)
                                  }
                                />
                              </tr>
                            ))
                          : null}
                        {tab === 'locais'
                          ? placeRows.map((r, index) => (
                              <tr
                                key={r.id}
                                role="button"
                                tabIndex={0}
                                className={listTableRowClasses.trNavigable}
                                onClick={() => openViewPlace(r)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openViewPlace(r);
                                  }
                                }}
                              >
                                <td className={`${cadastroListClasses.tdMono} w-14 !px-2 sm:!px-3`}>
                                  {formatCadastroListId(null, index + 1)}
                                </td>
                                <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                                  <ListRowNavigableLabel className="block truncate">
                                    {r.name}
                                  </ListRowNavigableLabel>
                                </td>
                                <td className={cadastroListClasses.tdCenter}>{r.code || '—'}</td>
                                <td className={cadastroListClasses.tdCenter}>
                                  <span className="block truncate">{r.sectorName}</span>
                                </td>
                                <td className={cadastroListClasses.tdCenter}>
                                  <span className="block truncate">{r.buildingName}</span>
                                </td>
                                <RowActionMenuCell
                                  isOpen={isRowMenuOpen(r.id)}
                                  onToggle={(e) =>
                                    toggleRowActionMenu(r.id, e.currentTarget as HTMLButtonElement)
                                  }
                                />
                              </tr>
                            ))
                          : null}
                        {tab === 'ativos'
                          ? assetRows.map((r, index) => (
                              <tr
                                key={r.id}
                                role="button"
                                tabIndex={0}
                                className={listTableRowClasses.trNavigable}
                                onClick={() => openViewAsset(r)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openViewAsset(r);
                                  }
                                }}
                              >
                                <td className={`${cadastroListClasses.tdMono} w-14 !px-2 sm:!px-3`}>
                                  {formatCadastroListId(null, index + 1)}
                                </td>
                                <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                                  <ListRowNavigableLabel className="block truncate">
                                    {r.name}
                                  </ListRowNavigableLabel>
                                </td>
                                <td className={cadastroListClasses.tdCenter}>{r.code || '—'}</td>
                                <td className={cadastroListClasses.tdCenter}>{r.category || '—'}</td>
                                <td className={cadastroListClasses.tdTruncate}>
                                  <span className="block truncate text-sm text-gray-600 dark:text-gray-400">
                                    {r.buildingName} › {r.sectorName} › {r.placeName}
                                  </span>
                                </td>
                                <RowActionMenuCell
                                  isOpen={isRowMenuOpen(r.id)}
                                  onToggle={(e) =>
                                    toggleRowActionMenu(r.id, e.currentTarget as HTMLButtonElement)
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
                    if (tab === 'predios') {
                      const row = buildingRows.find((x) => x.id === rowForActionMenu.id);
                      if (row) openEditBuilding(row);
                    } else if (tab === 'setores') {
                      const row = sectorRows.find((x) => x.id === rowForActionMenu.id);
                      if (row) openEditSector(row);
                    } else if (tab === 'locais') {
                      const row = placeRows.find((x) => x.id === rowForActionMenu.id);
                      if (row) openEditPlace(row);
                    } else {
                      const row = assetRows.find((x) => x.id === rowForActionMenu.id);
                      if (row) openEditAsset(row);
                    }
                  }}
                  onDelete={() =>
                    openDeleteForRow(
                      rowForActionMenu.id,
                      'name' in rowForActionMenu
                        ? String((rowForActionMenu as { name?: string }).name ?? '')
                        : ''
                    )
                  }
                  extraItems={
                    tab === 'ativos'
                      ? [
                          {
                            label: 'Ver QR / etiqueta',
                            icon: <QrCode className="h-4 w-4" />,
                            onClick: () => {
                              void openQr(rowForActionMenu.id);
                              closeRowActionMenu();
                            }
                          },
                          {
                            label: 'Baixar etiqueta PDF',
                            icon: <Printer className="h-4 w-4" />,
                            onClick: () => {
                              openLabelPicker([rowForActionMenu.id]);
                              closeRowActionMenu();
                            }
                          }
                        ]
                      : []
                  }
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {showForm ? (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={requestCloseForm} />
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {formTitle}
                </h2>
                <button
                  type="button"
                  onClick={requestCloseForm}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 p-6">
                {tab === 'predios' ? (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Nome *
                      </label>
                      <input
                        value={buildingForm.name}
                        onChange={(e) =>
                          setBuildingForm((s) => ({ ...s, name: e.target.value }))
                        }
                        placeholder="Ex.: Sede Administrativa"
                        className={FORM_FIELD_INPUT_CLS}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Código
                      </label>
                      <input
                        value={buildingForm.code}
                        onChange={(e) =>
                          setBuildingForm((s) => ({ ...s, code: e.target.value }))
                        }
                        placeholder="Ex.: SEDE"
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                  </>
                ) : null}

                {tab === 'setores' ? (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Prédio *
                      </label>
                      <StringSingleSelectDropdown
                        value={sectorForm.buildingId}
                        onChange={(v) => setSectorForm((s) => ({ ...s, buildingId: v }))}
                        options={buildingSelectOptions}
                        placeholder="Selecione o prédio"
                        emptyOptionLabel="Selecione o prédio"
                        allowEmpty
                        disabled={Boolean(editingId)}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Nome *
                      </label>
                      <input
                        value={sectorForm.name}
                        onChange={(e) => setSectorForm((s) => ({ ...s, name: e.target.value }))}
                        placeholder="Ex.: Manutenção"
                        className={FORM_FIELD_INPUT_CLS}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Código
                      </label>
                      <input
                        value={sectorForm.code}
                        onChange={(e) => setSectorForm((s) => ({ ...s, code: e.target.value }))}
                        placeholder="Ex.: MAN"
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                  </>
                ) : null}

                {tab === 'locais' ? (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Andar *
                      </label>
                      <StringSingleSelectDropdown
                        value={placeForm.sectorId}
                        onChange={(v) => setPlaceForm((s) => ({ ...s, sectorId: v }))}
                        options={sectorSelectOptions}
                        placeholder="Selecione o andar"
                        emptyOptionLabel="Selecione o andar"
                        allowEmpty
                        disabled={Boolean(editingId)}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Nome *
                      </label>
                      <input
                        value={placeForm.name}
                        onChange={(e) => setPlaceForm((s) => ({ ...s, name: e.target.value }))}
                        placeholder="Ex.: Casa de bombas"
                        className={FORM_FIELD_INPUT_CLS}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Código
                      </label>
                      <input
                        value={placeForm.code}
                        onChange={(e) => setPlaceForm((s) => ({ ...s, code: e.target.value }))}
                        placeholder="Ex.: CB-01"
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                  </>
                ) : null}

                {tab === 'ativos' ? (
                  <>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Local *
                      </label>
                      <StringSingleSelectDropdown
                        value={assetForm.placeId}
                        onChange={(v) => setAssetForm((s) => ({ ...s, placeId: v }))}
                        options={placeSelectOptions}
                        placeholder="Selecione o local"
                        emptyOptionLabel="Selecione o local"
                        allowEmpty
                        disabled={Boolean(editingId)}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Nome *
                      </label>
                      <input
                        value={assetForm.name}
                        onChange={(e) => setAssetForm((s) => ({ ...s, name: e.target.value }))}
                        placeholder="Ex.: Ar-condicionado receptivo"
                        className={FORM_FIELD_INPUT_CLS}
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Código / patrimônio
                      </label>
                      <input
                        value={assetForm.code}
                        onChange={(e) => setAssetForm((s) => ({ ...s, code: e.target.value }))}
                        placeholder="Ex.: PAT-00123"
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Categoria
                      </label>
                      <input
                        value={assetForm.category}
                        onChange={(e) =>
                          setAssetForm((s) => ({ ...s, category: e.target.value }))
                        }
                        placeholder="Ex.: Climatização"
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Fim da garantia
                      </label>
                      <input
                        type="date"
                        value={assetForm.warrantyEndsAt}
                        onChange={(e) =>
                          setAssetForm((s) => ({ ...s, warrantyEndsAt: e.target.value }))
                        }
                        className={FORM_FIELD_INPUT_CLS}
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        O sino avisa 30 dias antes e quando vencer.
                      </p>
                    </div>
                  </>
                ) : null}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={requestCloseForm}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    Salvar
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {viewing ? (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setViewing(null)} />
            <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {viewing.kind === 'predios'
                    ? 'Detalhes do Prédio'
                    : viewing.kind === 'setores'
                      ? 'Detalhes do Andar'
                      : viewing.kind === 'locais'
                        ? 'Detalhes do Local'
                        : 'Detalhes do Ativo'}
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
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Código
                  </p>
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {viewing.row.code || '—'}
                  </p>
                </div>
                {viewing.kind === 'setores' ? (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Prédio
                    </p>
                    <p className="text-sm text-gray-900 dark:text-gray-100">
                      {viewing.row.buildingName}
                    </p>
                  </div>
                ) : null}
                {viewing.kind === 'locais' ? (
                  <>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Andar
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {viewing.row.sectorName}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Prédio
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {viewing.row.buildingName}
                      </p>
                    </div>
                  </>
                ) : null}
                {viewing.kind === 'ativos' ? (
                  <>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Categoria
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {viewing.row.category || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Garantia
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {viewing.row.warrantyEndsAt
                          ? new Date(viewing.row.warrantyEndsAt).toLocaleDateString('pt-BR')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Local
                      </p>
                      <p className="text-sm text-gray-900 dark:text-gray-100">
                        {viewing.row.buildingName} › {viewing.row.sectorName} ›{' '}
                        {viewing.row.placeName}
                      </p>
                    </div>
                  </>
                ) : null}
                <div className="flex justify-end gap-2 pt-2">
                  {viewing.kind === 'ativos' ? (
                    <button
                      type="button"
                      onClick={() => {
                        const id = viewing.row.id;
                        setViewing(null);
                        void openQr(id);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <QrCode className="h-4 w-4" />
                      QR / etiqueta
                    </button>
                  ) : null}
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
                {deleteTarget.kind === 'predios'
                  ? 'Andares, locais e ativos vinculados também serão removidos.'
                  : deleteTarget.kind === 'setores'
                    ? 'Locais e ativos vinculados também serão removidos.'
                    : deleteTarget.kind === 'locais'
                      ? 'Ativos vinculados também serão removidos.'
                      : 'Esta ação não pode ser desfeita.'}
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(deleteTarget)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {formConfirmUi}

        <GestaoOsAssetQrLabelsPickerModal
          isOpen={labelPickerOpen}
          onClose={() => setLabelPickerOpen(false)}
          assets={assetRows}
          initialSelectedIds={labelPickerInitialIds}
          downloading={printingLabels}
          onConfirm={(picks) => void downloadLabelsPdf(picks)}
        />

        <Modal
          isOpen={Boolean(qrPreview)}
          onClose={() => setQrPreview(null)}
          title={qrPreview ? `Etiqueta — ${qrPreview.name}` : 'Etiqueta QR'}
        >
          {qrPreview ? (
            <div className="space-y-4">
              <p className="text-center text-sm text-gray-600 dark:text-gray-300">
                Modelo para imprimir e colar no ativo. O QR abre o chamado em Meus Chamados.
              </p>
              <GestaoOsAssetQrLabel
                label={qrPreview}
                companyName={logoAlt}
                logoSrc={printLogoSrc}
              />
              <div className="flex flex-wrap justify-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                  Qtd
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={qrPreviewQty}
                    onChange={(e) =>
                      setQrPreviewQty(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
                    }
                    className={`${FORM_FIELD_INPUT_CLS} h-10 w-16 px-2 text-center tabular-nums`}
                  />
                </label>
                <button
                  type="button"
                  disabled={printingLabels}
                  onClick={() => void downloadSingleLabelPdf(qrPreview, qrPreviewQty)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" />
                  {printingLabels ? 'Gerando PDF…' : 'Baixar PDF'}
                </button>
                <a
                  href={qrPreview.dataUrl}
                  download={`qr-${qrPreview.name.replace(/\s+/g, '-').toLowerCase()}.png`}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium dark:border-gray-600"
                >
                  Baixar PNG
                </a>
                <button
                  type="button"
                  onClick={() => void regenerateQr(qrPreview.assetId)}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium dark:border-gray-600"
                >
                  Regenerar QR
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
