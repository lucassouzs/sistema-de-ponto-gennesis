'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Percent, Plus, Search, X, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { CadastroListEmpty, CadastroListLoading, CadastroListSummary, formatCadastroListId } from '@/components/ui/CadastroListSummary';
import { RowActionMenuCell, RowActionMenuPortal, cadastroListClasses, listTableRowClasses } from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useEspelhoNfBootstrap } from '@/hooks/useEspelhoNfBootstrap';
import {
  EspelhoNfTaxCodeContractFields,
  DEFAULT_CADASTRO_FEDERAL_TAX_CONTEXT_ENABLED,
  emptyTaxCodeFormState,
  INITIAL_FEDERAL_TAX_RATES,
  mergeFederalTaxStateFromApi,
  validateTaxCodeContractForm,
  wireTaxCodeSavePayload,
  type FederalTaxContextEnabled,
  type FederalTaxRates,
  type FederalTaxRatesByContext,
  type TaxCodeFormState
} from '@/components/espelho-nf/EspelhoNfTaxCodeContractFields';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';

/** Cópia nova da matriz federal vazia (evita mutar referências exportadas). */
function emptyFederalTaxRatesByContext(): FederalTaxRatesByContext {
  return {
    gdfObra: { ...INITIAL_FEDERAL_TAX_RATES },
    gdfManutencaoReforma: { ...INITIAL_FEDERAL_TAX_RATES },
    gdfMaoObraSemMaterial: { ...INITIAL_FEDERAL_TAX_RATES },
    foraGdfObra: { ...INITIAL_FEDERAL_TAX_RATES },
    foraGdfManutencaoReforma: { ...INITIAL_FEDERAL_TAX_RATES },
    foraGdfMaoObraSemMaterial: { ...INITIAL_FEDERAL_TAX_RATES }
  };
}

type TaxCodeApiBody = ReturnType<typeof wireTaxCodeSavePayload>;

interface TaxCodeRow {
  id: string;
  /** API bootstrap mapeia `name` do Prisma para `cityName`; aceitamos os dois. */
  cityName?: string;
  name?: string;
  abatesMaterial: boolean;
  hasComplementaryWarranty?: boolean;
  garantiaRetidaNaNota?: boolean | null;
  garantiaAliquota?: string;
  issRate: string;
  cofins?: { collectionType?: string };
  csll?: { collectionType?: string };
  inss?: { collectionType?: string };
  irpj?: { collectionType?: string };
  pis?: { collectionType?: string };
  iss?: { collectionType?: string };
  inssMaterialLimit?: string;
  issMaterialLimit?: string;
  federalRatesByContext?: unknown;
  federalTaxContextEnabled?: unknown;
}

function normCol(v: unknown): 'RETIDO' | 'RECOLHIDO' {
  const s = String(v ?? '').toUpperCase();
  return s === 'RECOLHIDO' ? 'RECOLHIDO' : 'RETIDO';
}

/** Garante formato estável vindo do bootstrap (objeto cru ou já mapeado). */
function normalizeTaxCodeRow(raw: unknown): TaxCodeRow {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    id: String(r.id ?? ''),
    cityName: String(r.cityName ?? r.name ?? '').trim(),
    abatesMaterial: Boolean(r.abatesMaterial),
    hasComplementaryWarranty: Boolean(r.hasComplementaryWarranty),
    garantiaRetidaNaNota:
      r.garantiaRetidaNaNota === true || r.garantiaRetidaNaNota === false ? r.garantiaRetidaNaNota : null,
    garantiaAliquota: r.garantiaAliquota != null ? String(r.garantiaAliquota) : undefined,
    issRate: String(r.issRate ?? ''),
    cofins:
      r.cofins && typeof r.cofins === 'object'
        ? { collectionType: String((r.cofins as { collectionType?: string }).collectionType ?? '') }
        : undefined,
    csll:
      r.csll && typeof r.csll === 'object'
        ? { collectionType: String((r.csll as { collectionType?: string }).collectionType ?? '') }
        : undefined,
    inss:
      r.inss && typeof r.inss === 'object'
        ? { collectionType: String((r.inss as { collectionType?: string }).collectionType ?? '') }
        : undefined,
    irpj:
      r.irpj && typeof r.irpj === 'object'
        ? { collectionType: String((r.irpj as { collectionType?: string }).collectionType ?? '') }
        : undefined,
    pis:
      r.pis && typeof r.pis === 'object'
        ? { collectionType: String((r.pis as { collectionType?: string }).collectionType ?? '') }
        : undefined,
    iss:
      r.iss && typeof r.iss === 'object'
        ? { collectionType: String((r.iss as { collectionType?: string }).collectionType ?? '') }
        : undefined,
    inssMaterialLimit: r.inssMaterialLimit != null ? String(r.inssMaterialLimit) : undefined,
    issMaterialLimit: r.issMaterialLimit != null ? String(r.issMaterialLimit) : undefined,
    federalRatesByContext: r.federalRatesByContext,
    federalTaxContextEnabled: r.federalTaxContextEnabled
  };
}

function rowToTaxCodeFormState(t: TaxCodeRow): TaxCodeFormState {
  const cityName = String(t.cityName ?? t.name ?? '').trim();
  const hasW = Boolean(t.hasComplementaryWarranty);
  const gr = t.garantiaRetidaNaNota;
  return {
    cityName,
    abatesMaterial: Boolean(t.abatesMaterial),
    hasComplementaryWarranty: hasW,
    garantiaRetidaNaNota: hasW && (gr === true || gr === false) ? gr : null,
    garantiaAliquota: hasW ? String(t.garantiaAliquota ?? '') : '',
    issRate: String(t.issRate ?? ''),
    cofins: { collectionType: normCol(t.cofins?.collectionType) },
    csll: { collectionType: normCol(t.csll?.collectionType) },
    inss: { collectionType: normCol(t.inss?.collectionType) },
    irpj: { collectionType: normCol(t.irpj?.collectionType) },
    pis: { collectionType: normCol(t.pis?.collectionType) },
    iss: { collectionType: normCol(t.iss?.collectionType) },
    inssMaterialLimit: String(t.inssMaterialLimit ?? ''),
    issMaterialLimit: String(t.issMaterialLimit ?? '')
  };
}

export default function CodigosTributariosEspelhoNfPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TaxCodeRow | null>(null);
  const [taxCodeForm, setTaxCodeForm] = useState<TaxCodeFormState>(() => emptyTaxCodeFormState());
  const [federalTaxRatesByContext, setFederalTaxRatesByContext] = useState<FederalTaxRatesByContext>(() =>
    emptyFederalTaxRatesByContext()
  );
  const [federalTaxContextEnabled, setFederalTaxContextEnabled] = useState<FederalTaxContextEnabled>(
    () => ({ ...DEFAULT_CADASTRO_FEDERAL_TAX_CONTEXT_ENABLED })
  );
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);

  const closeTaxCodeForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
  }, []);

  const { requestClose: requestCloseTaxCodeForm, confirmUi: taxCodeFormConfirmUi } =
    useModalCloseConfirm(closeTaxCodeForm, { isParentOpen: showForm });

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

  const { data: bootstrap, isLoading, isError, error } = useEspelhoNfBootstrap();

  const rows = useMemo(() => {
    const raw = bootstrap?.taxCodes ?? [];
    const list = raw.map((item) => normalizeTaxCodeRow(item));
    const q = searchTerm.trim().toLowerCase();
    if (!q) return list;
    return list.filter((t) =>
      [t.cityName, t.issRate, String(t.abatesMaterial)].join(' ').toLowerCase().includes(q)
    );
  }, [bootstrap?.taxCodes, searchTerm]);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(rows);

  const createMutation = useMutation({
    mutationFn: async (body: TaxCodeApiBody) => {
      const res = await api.post('/espelho-nf/tax-codes', body);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['espelho-nf-bootstrap'] });
      setShowForm(false);
      setTaxCodeForm(emptyTaxCodeFormState());
      setFederalTaxRatesByContext(emptyFederalTaxRatesByContext());
      setFederalTaxContextEnabled({ ...DEFAULT_CADASTRO_FEDERAL_TAX_CONTEXT_ENABLED });
      toast.success('Código tributário cadastrado.');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao cadastrar.');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TaxCodeApiBody }) => {
      const res = await api.patch(`/espelho-nf/tax-codes/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['espelho-nf-bootstrap'] });
      setShowForm(false);
      setEditing(null);
      setTaxCodeForm(emptyTaxCodeFormState());
      setFederalTaxRatesByContext(emptyFederalTaxRatesByContext());
      setFederalTaxContextEnabled({ ...DEFAULT_CADASTRO_FEDERAL_TAX_CONTEXT_ENABLED });
      toast.success('Código atualizado.');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/espelho-nf/tax-codes/${id}`);
      return res.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['espelho-nf-bootstrap'] });
      setShowDeleteModal(null);
      toast.success('Código excluído.');
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao excluir.');
    }
  });

  const openEdit = (t: TaxCodeRow) => {
    const row = normalizeTaxCodeRow(t);
    setEditing(row);
    setTaxCodeForm(rowToTaxCodeFormState(row));
    const fed = mergeFederalTaxStateFromApi(row.federalRatesByContext, row.federalTaxContextEnabled);
    setFederalTaxRatesByContext(fed.federalRatesByContext);
    setFederalTaxContextEnabled(fed.federalTaxContextEnabled);
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateTaxCodeContractForm(taxCodeForm);
    if (err) {
      toast.error(err);
      return;
    }
    const wirePayload = wireTaxCodeSavePayload(taxCodeForm, federalTaxRatesByContext, federalTaxContextEnabled);
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: wirePayload });
    } else {
      createMutation.mutate(wirePayload);
    }
  };

  const loadError =
    isError &&
    ((error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (error as Error)?.message ||
      'Não foi possível carregar os códigos.');
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/codigos-tributarios">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Códigos Tributários
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Parâmetros por município ou regime usados em Tomadores de Serviço e espelhos.
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Percent className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Códigos Tributários</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isError ? 'Erro ao carregar.' : `${rows.length} registro(s)`}
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
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(null);
                      setTaxCodeForm(emptyTaxCodeFormState());
                      setFederalTaxRatesByContext(emptyFederalTaxRatesByContext());
                      setFederalTaxContextEnabled({ ...DEFAULT_CADASTRO_FEDERAL_TAX_CONTEXT_ENABLED });
                      setShowForm(true);
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    Novo Código Tributário
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
                <CadastroListLoading message="Carregando códigos..." />
              ) : rows.length === 0 ? (
                <CadastroListEmpty
                  icon={Percent}
                  title="Nenhum código tributário encontrado"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre um novo código para começar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={1}
                    endItem={rows.length}
                    total={rows.length}
                    itemLabel="código tributário"
                    itemLabelPlural="códigos tributários"
                  />
                <div className="table-scroll">
                  <table className={cadastroListClasses.table}>
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className={cadastroListClasses.th}>ID</th>
                        <th className={cadastroListClasses.th}>Nome / Município</th>
                        <th className={cadastroListClasses.thNumeric}>Alíquota ISS</th>
                        <th className={cadastroListClasses.thCenter}>Abate Material</th>
                        <th className={cadastroListClasses.thCenter}>Garantia Complementar</th>
                        <th className={cadastroListClasses.thRight}>Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {rows.map((t, index) => (
                          <tr key={t.id} className={listTableRowClasses.tr}>
                            <td className={cadastroListClasses.tdMono}>
                              {formatCadastroListId(null, index + 1)}
                            </td>
                            <td className="min-w-0 px-3 py-4 sm:px-6">
                              <span className="text-sm text-gray-900 dark:text-gray-100 block truncate">
                                {t.cityName}
                              </span>
                            </td>
                            <td className={cadastroListClasses.tdNumeric}>
                              {t.issRate || '—'}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {t.abatesMaterial ? (
                                <span className="text-green-700 dark:text-green-400">Sim</span>
                              ) : (
                                <span className="text-gray-500">Não</span>
                              )}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {t.hasComplementaryWarranty ? (
                                <span className="text-green-700 dark:text-green-400">Sim</span>
                              ) : (
                                <span className="text-gray-500">Não</span>
                              )}
                            </td>
                            <RowActionMenuCell
                              isOpen={isRowMenuOpen(t.id)}
                              onToggle={(e) =>
                                toggleRowActionMenu(t.id, e.currentTarget as HTMLButtonElement)
                              }
                            />
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
              {rowActionMenu && rowForActionMenu && (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={() => openEdit(rowForActionMenu)}
                  onDelete={() => setShowDeleteModal(rowForActionMenu.id)}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {showForm ? (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={requestCloseTaxCodeForm}
            />
            <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editing ? 'Editar Código Tributário' : 'Novo Código Tributário'}
                </h2>
                <button
                  type="button"
                  onClick={requestCloseTaxCodeForm}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 p-6">
                <EspelhoNfTaxCodeContractFields
                  key={editing?.id ?? 'novo'}
                  variant="cadastro"
                  taxCodeForm={taxCodeForm}
                  setTaxCodeForm={setTaxCodeForm}
                  federalRatesByContext={federalTaxRatesByContext}
                  setFederalRatesByContext={setFederalTaxRatesByContext}
                  federalTaxContextEnabled={federalTaxContextEnabled}
                  setFederalTaxContextEnabled={setFederalTaxContextEnabled}
                />
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {createMutation.isPending || updateMutation.isPending ? 'Salvando...' : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    onClick={requestCloseTaxCodeForm}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        ) : null}

        {taxCodeFormConfirmUi}

        {showDeleteModal ? (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteModal(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir Código Tributário?
              </h3>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Não é possível excluir se estiver em uso por Tomador de Serviço ou espelho de nota fiscal.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(showDeleteModal)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
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
