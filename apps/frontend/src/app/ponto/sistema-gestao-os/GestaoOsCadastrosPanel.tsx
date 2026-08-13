'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, QrCode, Plus, RefreshCw, Settings2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import api from '@/lib/api';
import {
  GestaoOsAssetQr,
  GestaoOsCompany,
  GestaoOsMembership,
  GestaoOsProfile,
  GestaoOsProvider,
  GestaoOsServiceCategory,
  PROFILE_LABELS
} from './gestaoOsTypes';

type CadastroTab = 'empresas' | 'locais' | 'prestadores' | 'categorias' | 'usuarios' | 'numeracao';

type LocationAdminTree = Array<{
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  companyId: string | null;
  branchId: string | null;
  company?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
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
      }>;
    }>;
  }>;
}>;

type SystemUser = { id: string; name: string; email?: string; role?: string };

function fieldClassName() {
  return 'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
}

const TABS: ReadonlyArray<{ id: CadastroTab; label: string }> = [
  { id: 'empresas', label: 'Empresas / Filiais' },
  { id: 'locais', label: 'Locais / Ativos' },
  { id: 'prestadores', label: 'Prestadores' },
  { id: 'categorias', label: 'Tipos de Serviço' },
  { id: 'usuarios', label: 'Usuários / Perfis' },
  { id: 'numeracao', label: 'Numeração de OS' }
];

export function GestaoOsCadastrosPanel() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<CadastroTab>('empresas');
  const [companyFilter, setCompanyFilter] = useState('');
  const [qrPreview, setQrPreview] = useState<GestaoOsAssetQr | null>(null);

  const [companyForm, setCompanyForm] = useState({ name: '', tradeName: '', document: '', code: '' });
  const [branchForm, setBranchForm] = useState({
    companyId: '',
    name: '',
    code: '',
    address: ''
  });
  const [buildingForm, setBuildingForm] = useState({
    name: '',
    code: '',
    companyId: '',
    branchId: ''
  });
  const [sectorForm, setSectorForm] = useState({ buildingId: '', name: '', code: '' });
  const [placeForm, setPlaceForm] = useState({ sectorId: '', name: '', code: '' });
  const [assetForm, setAssetForm] = useState({
    placeId: '',
    name: '',
    code: '',
    category: ''
  });
  const [providerForm, setProviderForm] = useState({
    companyId: '',
    name: '',
    document: '',
    specialty: '',
    contactName: '',
    phone: '',
    email: ''
  });
  const [categoryForm, setCategoryForm] = useState({
    companyId: '',
    name: '',
    code: '',
    description: ''
  });
  const [memberForm, setMemberForm] = useState({
    companyId: '',
    userId: '',
    profile: 'REQUESTER' as GestaoOsProfile
  });
  const [nextOsNumberInput, setNextOsNumberInput] = useState('');

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['gestao-os-cadastros'] });
    void queryClient.invalidateQueries({ queryKey: ['gestao-os-locations'] });
    void queryClient.invalidateQueries({ queryKey: ['gestao-os-categories'] });
  };

  const { data: companies = [], isFetching: fetchingCompanies } = useQuery({
    queryKey: ['gestao-os-cadastros', 'companies'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsCompany[] }>(
        '/gestao-os/cadastros/companies'
      );
      return res.data?.data ?? [];
    }
  });

  const { data: locations = [], isFetching: fetchingLocations } = useQuery({
    queryKey: ['gestao-os-cadastros', 'locations', companyFilter],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: LocationAdminTree }>(
        '/gestao-os/cadastros/locations',
        { params: { companyId: companyFilter || undefined } }
      );
      return res.data?.data ?? [];
    },
    enabled: tab === 'locais'
  });

  const { data: providers = [] } = useQuery({
    queryKey: ['gestao-os-cadastros', 'providers', companyFilter],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsProvider[] }>(
        '/gestao-os/cadastros/providers',
        { params: { companyId: companyFilter || undefined } }
      );
      return res.data?.data ?? [];
    },
    enabled: tab === 'prestadores'
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['gestao-os-cadastros', 'categories', companyFilter],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsServiceCategory[] }>(
        '/gestao-os/cadastros/categories',
        { params: { companyId: companyFilter || undefined } }
      );
      return res.data?.data ?? [];
    },
    enabled: tab === 'categorias'
  });

  const { data: memberships = [] } = useQuery({
    queryKey: ['gestao-os-cadastros', 'memberships', companyFilter],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: GestaoOsMembership[] }>(
        '/gestao-os/cadastros/memberships',
        { params: { companyId: companyFilter || undefined } }
      );
      return res.data?.data ?? [];
    },
    enabled: tab === 'usuarios'
  });

  const { data: users = [] } = useQuery({
    queryKey: ['gestao-os-cadastros', 'users'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: SystemUser[] }>(
        '/gestao-os/cadastros/users'
      );
      return res.data?.data ?? [];
    },
    enabled: tab === 'usuarios'
  });

  type OsSettings = {
    id: string;
    nextOsNumber: number;
    maxExistingDisplayNumber: number;
    suggestedNext: number;
  };

  const { data: osSettings } = useQuery({
    queryKey: ['gestao-os-cadastros', 'settings'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: OsSettings }>(
        '/gestao-os/cadastros/settings'
      );
      return res.data?.data;
    },
    enabled: tab === 'numeracao'
  });

  React.useEffect(() => {
    if (!osSettings) return;
    setNextOsNumberInput(String(osSettings.nextOsNumber));
  }, [osSettings]);

  const branchesForCompany = useMemo(() => {
    const companyId = buildingForm.companyId || companyFilter;
    const company = companies.find((c) => c.id === companyId);
    return company?.branches ?? [];
  }, [buildingForm.companyId, companyFilter, companies]);

  const createCompany = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/companies', companyForm);
    },
    onSuccess: () => {
      toast.success('Empresa cadastrada');
      setCompanyForm({ name: '', tradeName: '', document: '', code: '' });
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao salvar empresa')
  });

  const createBranch = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/branches', branchForm);
    },
    onSuccess: () => {
      toast.success('Filial cadastrada');
      setBranchForm({ companyId: '', name: '', code: '', address: '' });
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao salvar filial')
  });

  const createBuilding = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/buildings', {
        ...buildingForm,
        companyId: buildingForm.companyId || null,
        branchId: buildingForm.branchId || null
      });
    },
    onSuccess: () => {
      toast.success('Prédio cadastrado');
      setBuildingForm({ name: '', code: '', companyId: '', branchId: '' });
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao salvar prédio')
  });

  const createSector = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/sectors', sectorForm);
    },
    onSuccess: () => {
      toast.success('Andar/setor cadastrado');
      setSectorForm({ buildingId: '', name: '', code: '' });
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao salvar setor')
  });

  const createPlace = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/places', placeForm);
    },
    onSuccess: () => {
      toast.success('Sala/local cadastrado');
      setPlaceForm({ sectorId: '', name: '', code: '' });
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao salvar local')
  });

  const createAsset = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/assets', assetForm);
    },
    onSuccess: () => {
      toast.success('Ativo cadastrado (QR gerado)');
      setAssetForm({ placeId: '', name: '', code: '', category: '' });
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao salvar ativo')
  });

  const createProvider = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/providers', {
        ...providerForm,
        companyId: providerForm.companyId || null
      });
    },
    onSuccess: () => {
      toast.success('Prestador cadastrado');
      setProviderForm({
        companyId: '',
        name: '',
        document: '',
        specialty: '',
        contactName: '',
        phone: '',
        email: ''
      });
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao salvar prestador')
  });

  const createCategory = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/categories', {
        ...categoryForm,
        companyId: categoryForm.companyId || null
      });
    },
    onSuccess: () => {
      toast.success('Categoria cadastrada');
      setCategoryForm({ companyId: '', name: '', code: '', description: '' });
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao salvar categoria')
  });

  const upsertMembership = useMutation({
    mutationFn: async () => {
      await api.post('/gestao-os/cadastros/memberships', memberForm);
    },
    onSuccess: () => {
      toast.success('Perfil vinculado');
      setMemberForm({ companyId: '', userId: '', profile: 'REQUESTER' });
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao vincular usuário')
  });

  const saveOsNumber = useMutation({
    mutationFn: async () => {
      const res = await api.patch<{ success: boolean; data: OsSettings }>(
        '/gestao-os/cadastros/settings',
        { nextOsNumber: Number(nextOsNumberInput) }
      );
      return res.data?.data;
    },
    onSuccess: (data) => {
      toast.success(`Próxima OS será a #${data?.nextOsNumber ?? nextOsNumberInput}`);
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-cadastros', 'settings'] });
    },
    onError: (err: any) =>
      toast.error(err?.response?.data?.message || 'Erro ao salvar numeração')
  });

  const toggleActive = useMutation({
    mutationFn: async (args: { path: string; isActive: boolean }) => {
      await api.patch(args.path, { isActive: args.isActive });
    },
    onSuccess: () => {
      toast.success('Atualizado');
      invalidate();
    },
    onError: (err: any) => toast.error(err?.response?.data?.message || 'Erro ao atualizar')
  });

  const openQr = async (assetId: string) => {
    try {
      const res = await api.get<{ success: boolean; data: GestaoOsAssetQr }>(
        `/gestao-os/cadastros/assets/${assetId}/qr`
      );
      setQrPreview(res.data?.data ?? null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao gerar QR Code');
    }
  };

  const regenerateQr = async (assetId: string) => {
    try {
      await api.patch(`/gestao-os/cadastros/assets/${assetId}`, { regenerateQr: true });
      toast.success('QR regenerado');
      invalidate();
      await openQr(assetId);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Erro ao regenerar QR');
    }
  };

  const companySelect = (
    value: string,
    onChange: (v: string) => void,
    optional = true
  ) => (
    <select className={fieldClassName()} value={value} onChange={(e) => onChange(e.target.value)}>
      {optional ? <option value="">Empresa (opcional / global)</option> : <option value="">Selecione a empresa</option>}
      {companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      <div className="scroll-mt-4">
        <nav className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-x-auto py-1 sm:gap-x-2">
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-2 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                  active
                    ? 'border-red-500 text-red-600 dark:border-red-400 dark:text-red-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <Card className={cadastroListClasses.card}>
        <CardHeader className={cadastroListClasses.cardHeader}>
          <div className={cadastroListClasses.cardHeaderRow}>
            <div className={cadastroListClasses.cardHeaderIconRow}>
              <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                <Settings2 className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {TABS.find((t) => t.id === tab)?.label}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Cadastros básicos da Gestão de OS
                </p>
              </div>
            </div>
            {tab !== 'empresas' && tab !== 'numeracao' ? (
              <div className="min-w-0 w-full sm:w-[260px] sm:flex-none">
                {companySelect(companyFilter, setCompanyFilter)}
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className={`${cadastroListClasses.cardContent} space-y-4`}>

      {tab === 'empresas' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Building2 className="h-4 w-4" /> Nova empresa
            </h3>
            <div className="space-y-2">
              <input
                className={fieldClassName()}
                placeholder="Razão social / nome *"
                value={companyForm.name}
                onChange={(e) => setCompanyForm((s) => ({ ...s, name: e.target.value }))}
              />
              <input
                className={fieldClassName()}
                placeholder="Nome fantasia"
                value={companyForm.tradeName}
                onChange={(e) => setCompanyForm((s) => ({ ...s, tradeName: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className={fieldClassName()}
                  placeholder="CNPJ"
                  value={companyForm.document}
                  onChange={(e) => setCompanyForm((s) => ({ ...s, document: e.target.value }))}
                />
                <input
                  className={fieldClassName()}
                  placeholder="Código"
                  value={companyForm.code}
                  onChange={(e) => setCompanyForm((s) => ({ ...s, code: e.target.value }))}
                />
              </div>
              <button
                type="button"
                disabled={createCompany.isPending}
                onClick={() => createCompany.mutate()}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                <Plus className="h-4 w-4" /> Salvar empresa
              </button>
            </div>

            <h3 className="mb-3 mt-6 text-sm font-semibold text-gray-900 dark:text-gray-100">
              Nova filial
            </h3>
            <div className="space-y-2">
              {companySelect(branchForm.companyId, (v) => setBranchForm((s) => ({ ...s, companyId: v })), false)}
              <input
                className={fieldClassName()}
                placeholder="Nome da filial *"
                value={branchForm.name}
                onChange={(e) => setBranchForm((s) => ({ ...s, name: e.target.value }))}
              />
              <input
                className={fieldClassName()}
                placeholder="Código"
                value={branchForm.code}
                onChange={(e) => setBranchForm((s) => ({ ...s, code: e.target.value }))}
              />
              <input
                className={fieldClassName()}
                placeholder="Endereço"
                value={branchForm.address}
                onChange={(e) => setBranchForm((s) => ({ ...s, address: e.target.value }))}
              />
              <button
                type="button"
                disabled={createBranch.isPending}
                onClick={() => createBranch.mutate()}
                className="inline-flex items-center gap-2 rounded-lg border border-red-600 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 dark:text-red-300"
              >
                <Plus className="h-4 w-4" /> Salvar filial
              </button>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Empresas</h3>
              {fetchingCompanies ? <RefreshCw className="h-4 w-4 animate-spin text-gray-400" /> : null}
            </div>
            {companies.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhuma empresa cadastrada ainda.</p>
            ) : (
              <ul className="space-y-3">
                {companies.map((company) => (
                  <li
                    key={company.id}
                    className="rounded-lg border border-gray-100 p-3 dark:border-gray-800"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">{company.name}</p>
                        <p className="text-xs text-gray-500">
                          {company.document || 'Sem CNPJ'}
                          {company.code ? ` · ${company.code}` : ''}
                          {company._count
                            ? ` · ${company._count.buildings} prédios · ${company._count.members} usuários`
                            : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="text-xs text-gray-500 underline"
                        onClick={() =>
                          toggleActive.mutate({
                            path: `/gestao-os/cadastros/companies/${company.id}`,
                            isActive: !company.isActive
                          })
                        }
                      >
                        {company.isActive ? 'Desativar' : 'Ativar'}
                      </button>
                    </div>
                    {company.branches.length > 0 ? (
                      <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 text-xs text-gray-600 dark:border-gray-800 dark:text-gray-300">
                        {company.branches.map((b) => (
                          <li key={b.id}>
                            Filial: {b.name}
                            {b.address ? ` — ${b.address}` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'locais' ? (
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Prédio</p>
              <input
                className={fieldClassName()}
                placeholder="Nome *"
                value={buildingForm.name}
                onChange={(e) => setBuildingForm((s) => ({ ...s, name: e.target.value }))}
              />
              <input
                className={fieldClassName()}
                placeholder="Código"
                value={buildingForm.code}
                onChange={(e) => setBuildingForm((s) => ({ ...s, code: e.target.value }))}
              />
              {companySelect(buildingForm.companyId, (v) =>
                setBuildingForm((s) => ({ ...s, companyId: v, branchId: '' }))
              )}
              <select
                className={fieldClassName()}
                value={buildingForm.branchId}
                onChange={(e) => setBuildingForm((s) => ({ ...s, branchId: e.target.value }))}
              >
                <option value="">Filial (opcional)</option>
                {branchesForCompany.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => createBuilding.mutate()}
                className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
              >
                + Prédio
              </button>
            </div>

            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Andar / Setor
              </p>
              <select
                className={fieldClassName()}
                value={sectorForm.buildingId}
                onChange={(e) => setSectorForm((s) => ({ ...s, buildingId: e.target.value }))}
              >
                <option value="">Prédio *</option>
                {locations.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input
                className={fieldClassName()}
                placeholder="Nome *"
                value={sectorForm.name}
                onChange={(e) => setSectorForm((s) => ({ ...s, name: e.target.value }))}
              />
              <input
                className={fieldClassName()}
                placeholder="Código"
                value={sectorForm.code}
                onChange={(e) => setSectorForm((s) => ({ ...s, code: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => createSector.mutate()}
                className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
              >
                + Andar/Setor
              </button>
            </div>

            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sala / Local
              </p>
              <select
                className={fieldClassName()}
                value={placeForm.sectorId}
                onChange={(e) => setPlaceForm((s) => ({ ...s, sectorId: e.target.value }))}
              >
                <option value="">Andar/Setor *</option>
                {locations.flatMap((b) =>
                  b.sectors.map((s) => (
                    <option key={s.id} value={s.id}>
                      {b.name} › {s.name}
                    </option>
                  ))
                )}
              </select>
              <input
                className={fieldClassName()}
                placeholder="Nome *"
                value={placeForm.name}
                onChange={(e) => setPlaceForm((s) => ({ ...s, name: e.target.value }))}
              />
              <input
                className={fieldClassName()}
                placeholder="Código"
                value={placeForm.code}
                onChange={(e) => setPlaceForm((s) => ({ ...s, code: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => createPlace.mutate()}
                className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
              >
                + Sala/Local
              </button>
            </div>

            <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-700 dark:bg-gray-800/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ativo + QR</p>
              <select
                className={fieldClassName()}
                value={assetForm.placeId}
                onChange={(e) => setAssetForm((s) => ({ ...s, placeId: e.target.value }))}
              >
                <option value="">Sala/Local *</option>
                {locations.flatMap((b) =>
                  b.sectors.flatMap((s) =>
                    s.places.map((p) => (
                      <option key={p.id} value={p.id}>
                        {b.name} › {s.name} › {p.name}
                      </option>
                    ))
                  )
                )}
              </select>
              <input
                className={fieldClassName()}
                placeholder="Nome do ativo *"
                value={assetForm.name}
                onChange={(e) => setAssetForm((s) => ({ ...s, name: e.target.value }))}
              />
              <input
                className={fieldClassName()}
                placeholder="Código / patrimônio"
                value={assetForm.code}
                onChange={(e) => setAssetForm((s) => ({ ...s, code: e.target.value }))}
              />
              <input
                className={fieldClassName()}
                placeholder="Categoria (ex: ar-condicionado)"
                value={assetForm.category}
                onChange={(e) => setAssetForm((s) => ({ ...s, category: e.target.value }))}
              />
              <button
                type="button"
                onClick={() => createAsset.mutate()}
                className="w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
              >
                + Ativo (gera QR)
              </button>
            </div>
          </div>

          <section className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                Hierarquia: Prédio › Andar/Setor › Sala/Local › Ativo
              </h3>
              {fetchingLocations ? <RefreshCw className="h-4 w-4 animate-spin text-gray-400" /> : null}
            </div>
            {locations.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum local cadastrado.</p>
            ) : (
              <div className="space-y-4">
                {locations.map((building) => (
                  <div key={building.id} className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {building.name}
                      {building.company ? (
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          ({building.company.name}
                          {building.branch ? ` / ${building.branch.name}` : ''})
                        </span>
                      ) : null}
                    </p>
                    {building.sectors.map((sector) => (
                      <div key={sector.id} className="ml-3 mt-2 border-l border-gray-200 pl-3 dark:border-gray-700">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                          Andar/Setor: {sector.name}
                        </p>
                        {sector.places.map((place) => (
                          <div key={place.id} className="ml-3 mt-2">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                              Sala/Local: {place.name}
                            </p>
                            <ul className="mt-1 space-y-1">
                              {place.assets.map((asset) => (
                                <li
                                  key={asset.id}
                                  className="flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-sm dark:bg-gray-800/60"
                                >
                                  <span>
                                    Ativo: {asset.name}
                                    {asset.category ? (
                                      <span className="text-xs text-gray-500"> · {asset.category}</span>
                                    ) : null}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => void openQr(asset.id)}
                                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-medium hover:bg-white dark:border-gray-600"
                                  >
                                    <QrCode className="h-3.5 w-3.5" /> QR Code
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'prestadores' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <h3 className="text-sm font-semibold">Novo prestador / fornecedor</h3>
            {companySelect(providerForm.companyId, (v) =>
              setProviderForm((s) => ({ ...s, companyId: v }))
            )}
            <input
              className={fieldClassName()}
              placeholder="Nome *"
              value={providerForm.name}
              onChange={(e) => setProviderForm((s) => ({ ...s, name: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className={fieldClassName()}
                placeholder="CNPJ"
                value={providerForm.document}
                onChange={(e) => setProviderForm((s) => ({ ...s, document: e.target.value }))}
              />
              <input
                className={fieldClassName()}
                placeholder="Especialidade"
                value={providerForm.specialty}
                onChange={(e) => setProviderForm((s) => ({ ...s, specialty: e.target.value }))}
              />
            </div>
            <input
              className={fieldClassName()}
              placeholder="Contato"
              value={providerForm.contactName}
              onChange={(e) => setProviderForm((s) => ({ ...s, contactName: e.target.value }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                className={fieldClassName()}
                placeholder="Telefone"
                value={providerForm.phone}
                onChange={(e) => setProviderForm((s) => ({ ...s, phone: e.target.value }))}
              />
              <input
                className={fieldClassName()}
                placeholder="E-mail"
                value={providerForm.email}
                onChange={(e) => setProviderForm((s) => ({ ...s, email: e.target.value }))}
              />
            </div>
            <button
              type="button"
              onClick={() => createProvider.mutate()}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Salvar prestador
            </button>
          </section>
          <section className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <h3 className="mb-3 text-sm font-semibold">Lista</h3>
            <ul className="space-y-2">
              {providers.map((p) => (
                <li key={p.id} className="rounded-lg border border-gray-100 p-3 text-sm dark:border-gray-800">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-gray-500">
                    {[p.document, p.specialty, p.contactName, p.phone, p.email]
                      .filter(Boolean)
                      .join(' · ') || 'Sem detalhes'}
                  </p>
                </li>
              ))}
              {providers.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum prestador cadastrado.</p>
              ) : null}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === 'categorias' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <h3 className="text-sm font-semibold">Nova categoria / tipo de serviço</h3>
            {companySelect(categoryForm.companyId, (v) =>
              setCategoryForm((s) => ({ ...s, companyId: v }))
            )}
            <input
              className={fieldClassName()}
              placeholder="Nome * (ex: Elétrica)"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm((s) => ({ ...s, name: e.target.value }))}
            />
            <input
              className={fieldClassName()}
              placeholder="Código"
              value={categoryForm.code}
              onChange={(e) => setCategoryForm((s) => ({ ...s, code: e.target.value }))}
            />
            <input
              className={fieldClassName()}
              placeholder="Descrição"
              value={categoryForm.description}
              onChange={(e) => setCategoryForm((s) => ({ ...s, description: e.target.value }))}
            />
            <button
              type="button"
              onClick={() => createCategory.mutate()}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Salvar categoria
            </button>
          </section>
          <section className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <h3 className="mb-3 text-sm font-semibold">Categorias</h3>
            <ul className="space-y-2">
              {categories.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800"
                >
                  <span>
                    {c.name}
                    {c.code ? <span className="text-xs text-gray-500"> · {c.code}</span> : null}
                  </span>
                  <button
                    type="button"
                    className="text-xs text-gray-500 underline"
                    onClick={() =>
                      toggleActive.mutate({
                        path: `/gestao-os/cadastros/categories/${c.id}`,
                        isActive: !c.isActive
                      })
                    }
                  >
                    {c.isActive ? 'Desativar' : 'Ativar'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}

      {tab === 'usuarios' ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            O cadastro de pessoas é feito no módulo{' '}
            <span className="font-medium text-gray-800 dark:text-gray-200">
              Funcionários e Externos
            </span>{' '}
            (Departamento Pessoal). Aqui você apenas vincula pessoas já cadastradas à empresa e ao
            perfil de acesso da Gestão de OS.
          </p>
          <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-2 rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              <Users className="h-4 w-4" /> Vincular funcionário/externo à empresa
            </h3>
            {companySelect(
              memberForm.companyId,
              (v) => setMemberForm((s) => ({ ...s, companyId: v })),
              false
            )}
            <select
              className={fieldClassName()}
              value={memberForm.userId}
              onChange={(e) => setMemberForm((s) => ({ ...s, userId: e.target.value }))}
            >
              <option value="">Funcionário / Externo *</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                  {u.email ? ` (${u.email})` : ''}
                </option>
              ))}
            </select>
            <select
              className={fieldClassName()}
              value={memberForm.profile}
              onChange={(e) =>
                setMemberForm((s) => ({ ...s, profile: e.target.value as GestaoOsProfile }))
              }
            >
              {(Object.keys(PROFILE_LABELS) as GestaoOsProfile[]).map((key) => (
                <option key={key} value={key}>
                  {PROFILE_LABELS[key]}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => upsertMembership.mutate()}
              className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
            >
              Salvar vínculo
            </button>
          </section>
          <section className="rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
            <h3 className="mb-3 text-sm font-semibold">Vínculos por empresa</h3>
            <ul className="space-y-2">
              {memberships.map((m) => (
                <li
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-800"
                >
                  <div>
                    <p className="font-medium">{m.user.name}</p>
                    <p className="text-xs text-gray-500">
                      {m.company.name} · {PROFILE_LABELS[m.profile]}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-gray-500 underline"
                    onClick={() =>
                      toggleActive.mutate({
                        path: `/gestao-os/cadastros/memberships/${m.id}`,
                        isActive: !m.isActive
                      })
                    }
                  >
                    {m.isActive ? 'Desativar' : 'Ativar'}
                  </button>
                </li>
              ))}
              {memberships.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhum vínculo cadastrado.</p>
              ) : null}
            </ul>
          </section>
          </div>
        </div>
      ) : null}

      {tab === 'numeracao' ? (
        <section className="mx-auto max-w-xl space-y-4 rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-700 dark:bg-gray-800/40">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Numeração das ordens de serviço
            </h3>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Esta numeração vale só para a OS, gerada na primeira análise do chamado (Aberta → Em
              Análise). O número do chamado é outra sequência (1, 2, 3…) e não usa este valor.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-900">
            <p className="text-gray-600 dark:text-gray-400">
              Última OS gerada:{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {osSettings?.maxExistingDisplayNumber
                  ? `#${osSettings.maxExistingDisplayNumber}`
                  : 'nenhuma'}
              </span>
            </p>
            <p className="mt-1 text-gray-600 dark:text-gray-400">
              Próxima OS sugerida:{' '}
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                #{osSettings?.suggestedNext ?? '—'}
              </span>
            </p>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block font-medium text-gray-700 dark:text-gray-300">
              Próximo número de OS
            </span>
            <input
              type="number"
              min={1}
              step={1}
              className={fieldClassName()}
              value={nextOsNumberInput}
              onChange={(e) => setNextOsNumberInput(e.target.value)}
              placeholder="Ex.: 150"
            />
          </label>
          <button
            type="button"
            disabled={saveOsNumber.isPending || !nextOsNumberInput.trim()}
            onClick={() => saveOsNumber.mutate()}
            className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saveOsNumber.isPending ? 'Salvando...' : 'Salvar numeração'}
          </button>
        </section>
      ) : null}

        </CardContent>
      </Card>

      <Modal
        isOpen={Boolean(qrPreview)}
        onClose={() => setQrPreview(null)}
        title={qrPreview ? `QR — ${qrPreview.name}` : 'QR Code'}
      >
        {qrPreview ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-300">{qrPreview.locationLabel}</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrPreview.dataUrl}
              alt={`QR Code ${qrPreview.name}`}
              className="mx-auto h-64 w-64 rounded-lg border border-gray-200 bg-white p-2"
            />
            <p className="break-all text-xs text-gray-500">{qrPreview.payloadUrl}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <a
                href={qrPreview.dataUrl}
                download={`qr-${qrPreview.name.replace(/\s+/g, '-').toLowerCase()}.png`}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white"
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
    </div>
  );
}
