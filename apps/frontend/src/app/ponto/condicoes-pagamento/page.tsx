'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CreditCard, Plus, Search, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { CadastroListEmpty, CadastroListLoading, CadastroListSummary, formatCadastroListId } from '@/components/ui/CadastroListSummary';
import { RowActionMenuCell, RowActionMenuPortal, cadastroListClasses, listTableRowClasses } from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';

const ITEMS_PER_PAGE = 20;
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { deletePaymentCondition } from '@/lib/paymentConditions';
import {
  type PaymentConditionRow,
  formatParcelSummary,
  normalizeParcelDueDaysClient
} from '@/components/oc/PaymentConditionSelect';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';

const PAYMENT_TYPE_OPTIONS = labeledToSelectOptions([
  { value: 'AVISTA', label: 'À vista' },
  { value: 'BOLETO', label: 'Boleto' },
]);

export default function CondicoesPagamentoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PaymentConditionRow | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formPaymentType, setFormPaymentType] = useState<'AVISTA' | 'BOLETO'>('BOLETO');
  const [formSortOrder, setFormSortOrder] = useState(100);
  const [formActive, setFormActive] = useState(true);
  const [formParcelCount, setFormParcelCount] = useState(1);
  const [formParcelDayStrs, setFormParcelDayStrs] = useState<string[]>(['30']);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const syncDayStrsLength = (n: number, prev: string[]) => {
    const next = [...prev];
    while (next.length < n) next.push(next[next.length - 1] ?? '30');
    while (next.length > n) next.pop();
    return next;
  };

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

  const { data: listData, isLoading } = useQuery({
    queryKey: ['payment-conditions', 'admin'],
    queryFn: async () => {
      const res = await api.get('/payment-conditions', { params: { activeOnly: 'false' } });
      return (res.data?.data || []) as PaymentConditionRow[];
    }
  });

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return (listData || []).filter((r) => {
      if (!q) return true;
      return r.label.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
    });
  }, [listData, searchTerm]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / ITEMS_PER_PAGE));
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedRows = filtered.slice(startIndex, endIndex);
  const startItem = totalFiltered === 0 ? 0 : startIndex + 1;
  const endItem = Math.min(endIndex, totalFiltered);
  const isListEmpty = !isLoading && totalFiltered === 0;

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
    setRowActionMenu
  } = useRowActionMenu(filtered);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const modalOpen = showForm || deleteId != null;

  useEffect(() => {
    if (!modalOpen) return;
    document.body.classList.add('modal-open');
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [modalOpen]);

  const createMutation = useMutation({
    mutationFn: async (body: {
      label: string;
      paymentType: string;
      parcelCount: number;
      parcelDueDays: number[];
    }) => {
      const res = await api.post('/payment-conditions', body);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-conditions'] });
      setShowForm(false);
      resetForm();
      toast.success('Condição criada');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao criar')
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      data
    }: {
      id: string;
      data: Partial<{
        label: string;
        sortOrder: number;
        isActive: boolean;
        parcelCount: number;
        parcelDueDays: number[];
      }>;
    }) => {
      const res = await api.patch(`/payment-conditions/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-conditions'] });
      setEditing(null);
      resetForm();
      toast.success('Condição atualizada');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao atualizar')
  });

  const deleteMutation = useMutation({
    mutationFn: deletePaymentCondition,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-conditions'] });
      setDeleteId(null);
      setRowActionMenu(null);
      toast.success('Condição excluída');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir')
  });

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const resetForm = () => {
    setFormLabel('');
    setFormPaymentType('BOLETO');
    setFormSortOrder(100);
    setFormActive(true);
    setFormParcelCount(1);
    setFormParcelDayStrs(['30']);
  };

  const closePaymentForm = useCallback(() => {
    setShowForm(false);
    setEditing(null);
    resetForm();
  }, []);

  const { requestClose: requestClosePaymentForm, confirmUi: paymentFormConfirmUi } =
    useModalCloseConfirm(closePaymentForm, { isParentOpen: showForm });

  const openEdit = (r: PaymentConditionRow) => {
    setEditing(r);
    setFormLabel(r.label);
    setFormPaymentType(r.paymentType as 'AVISTA' | 'BOLETO');
    setFormSortOrder(r.sortOrder);
    setFormActive(r.isActive);
    const n = r.parcelCount ?? 1;
    let raw = normalizeParcelDueDaysClient(r.parcelDueDays).map(String);
    raw = syncDayStrsLength(n, raw.length ? raw : r.paymentType === 'AVISTA' ? ['0'] : ['30']);
    setFormParcelCount(n);
    setFormParcelDayStrs(raw);
    setShowForm(true);
  };

  const parseDaysFromForm = (): number[] | null => {
    const days = formParcelDayStrs.map((s) => {
      const t = s.trim().replace(',', '.');
      const v = Number(t);
      if (!Number.isFinite(v) || v < 0) return NaN;
      return Math.round(v);
    });
    if (days.some((x) => Number.isNaN(x))) return null;
    return days;
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/condicoes-pagamento">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Condições de Pagamento
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Cadastro usado na criação e edição de ordens de compra (à vista e boleto).
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <CreditCard className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Condições de pagamento
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Gerencie condições à vista e boleto para ordens de compra
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      placeholder="Buscar por nome ou ID..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
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
                    onClick={() => {
                      setEditing(null);
                      resetForm();
                      setShowForm(true);
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova condição</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando condições..." />
              ) : isListEmpty ? (
                <CadastroListEmpty
                  icon={CreditCard}
                  title="Nenhuma condição de pagamento encontrada"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre uma nova condição para começar'
                  }
                />
              ) : (
              <>
                <CadastroListSummary
                  startItem={startItem}
                  endItem={endItem}
                  total={totalFiltered}
                  itemLabel="condição"
                  itemLabelPlural="condições"
                  currentPage={currentPage}
                  totalPages={totalPages}
                />
                <div className="table-scroll">
                  <table className={cadastroListClasses.table}>
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className={cadastroListClasses.th}>ID</th>
                        <th className={cadastroListClasses.th}>Nome</th>
                        <th className={cadastroListClasses.th}>Parcelas / prazos</th>
                        <th className={cadastroListClasses.th}>Tipo</th>
                        <th className={cadastroListClasses.thNumeric}>Ordem</th>
                        <th className={cadastroListClasses.thCenter}>Ativo</th>
                        <th className={cadastroListClasses.thCenter}>Sistema</th>
                        <th className={cadastroListClasses.thRight}>Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                      {paginatedRows.map((r, index) => (
                        <tr
                          key={r.id}
                          className={listTableRowClasses.tr}
                        >
                          <td className={cadastroListClasses.tdMono}>
                            {formatCadastroListId(r.code, startIndex + index + 1)}
                          </td>
                          <td className="px-3 py-4 sm:px-6">
                            <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">{r.label}</span>
                          </td>
                          <td className="max-w-[14rem] px-3 py-4 text-xs text-gray-600 dark:text-gray-400 sm:px-6">
                            {formatParcelSummary(r.parcelCount ?? 1, r.parcelDueDays) || '—'}
                          </td>
                          <td className={cadastroListClasses.td}>
                            {r.paymentType === 'AVISTA' ? 'À vista' : 'Boleto'}
                          </td>
                          <td className={cadastroListClasses.tdNumeric}>{r.sortOrder}</td>
                          <td className={cadastroListClasses.tdCenter}>
                            {r.isActive ? 'Sim' : 'Não'}
                          </td>
                          <td className={cadastroListClasses.tdCenter}>
                            {r.isSystem ? 'Sim' : 'Não'}
                          </td>
                          <RowActionMenuCell
                            isOpen={isRowMenuOpen(r.id)}
                            onToggle={(e) =>
                              toggleRowActionMenu(r.id, e.currentTarget as HTMLButtonElement)
                            }
                          />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className={cadastroListClasses.pagination}>
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                    >
                      Anterior
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNumber = i + 1;
                      const isActive = pageNumber === currentPage;
                      return (
                        <button
                          key={pageNumber}
                          type="button"
                          onClick={() => setCurrentPage(pageNumber)}
                          className={`rounded-md px-3 py-2 text-sm font-medium ${
                            isActive
                              ? 'bg-red-600 text-white'
                              : 'border border-gray-300 bg-white text-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                          }`}
                        >
                          {pageNumber}
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600"
                    >
                      Próxima
                    </button>
                  </div>
                )}

                {rowActionMenu && rowForActionMenu && (
                  <RowActionMenuPortal
                    menu={rowActionMenu}
                    onClose={closeRowActionMenu}
                    onEdit={() => openEdit(rowForActionMenu)}
                    onDelete={() => {
                      if (rowForActionMenu.isSystem) {
                        toast.error('Condição padrão do sistema não pode ser excluída.');
                        return;
                      }
                      setDeleteId(rowForActionMenu.id);
                    }}
                    deleteDisabled={rowForActionMenu.isSystem}
                    deleteDisabledTitle="Condição do sistema não pode ser excluída"
                  />
                )}
              </>
              )}
            </CardContent>
          </Card>

          {showForm && (
            <div className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/50"
                aria-hidden
                onClick={requestClosePaymentForm}
              />
              <div className="relative z-[1101] max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  {editing ? 'Editar condição' : 'Nova condição'}
                </h3>
                {!editing && (
                  <>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de pagamento</label>
                    <StringSingleSelectDropdown
                      value={formPaymentType}
                      onChange={(t) => {
                        const paymentType = t as 'AVISTA' | 'BOLETO';
                        setFormPaymentType(paymentType);
                        if (paymentType === 'AVISTA') {
                          setFormParcelCount(1);
                          setFormParcelDayStrs(['0']);
                        } else {
                          setFormParcelCount(1);
                          setFormParcelDayStrs(['30']);
                        }
                      }}
                      options={PAYMENT_TYPE_OPTIONS}
                      allowEmpty={false}
                      className="w-full mb-4"
                    />
                  </>
                )}
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Nome</label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={(e) => setFormLabel(e.target.value)}
                  className="w-full mb-4 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                />

                {(editing ? formPaymentType === 'BOLETO' : formPaymentType === 'BOLETO') && (
                  <div className="space-y-3 mb-4 border-t border-gray-200 dark:border-gray-600 pt-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Número de parcelas</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={formParcelCount}
                      onChange={(e) => {
                        const n = Math.max(1, Math.min(60, Math.floor(Number(e.target.value)) || 1));
                        setFormParcelCount(n);
                        setFormParcelDayStrs((prev) => syncDayStrsLength(n, prev));
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Prazo em dias para cada parcela (ex.: 30, 60 e 90 para 3 parcelas).
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {formParcelDayStrs.map((d, idx) => (
                        <div key={idx}>
                          <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Parcela {idx + 1} (dias)</label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={d}
                            onChange={(e) => {
                              const v = e.target.value;
                              setFormParcelDayStrs((prev) => {
                                const copy = [...prev];
                                copy[idx] = v;
                                return copy;
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(editing ? formPaymentType === 'AVISTA' : formPaymentType === 'AVISTA') && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                    À vista: uma única parcela com prazo 0 dias (pagamento imediato).
                  </p>
                )}

                {editing && (
                  <>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ordem</label>
                    <input
                      type="number"
                      value={formSortOrder}
                      onChange={(e) => setFormSortOrder(Number(e.target.value))}
                      className="w-full mb-4 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                    />
                    <label className="inline-flex items-center gap-2 mb-4 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={formActive}
                        onChange={(e) => setFormActive(e.target.checked)}
                      />
                      Ativa
                    </label>
                  </>
                )}
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button"
                    onClick={requestClosePaymentForm}
                    className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg"
                  >
                    Cancelar
                  </button>
                  {editing ? (
                    <button
                      type="button"
                      disabled={!formLabel.trim() || updateMutation.isPending}
                      onClick={() => {
                        const days = parseDaysFromForm();
                        if (formPaymentType === 'BOLETO') {
                          if (!days || days.length !== formParcelCount) {
                            toast.error('Preencha um prazo (dias) válido para cada parcela.');
                            return;
                          }
                          updateMutation.mutate({
                            id: editing.id,
                            data: {
                              label: formLabel.trim(),
                              sortOrder: formSortOrder,
                              isActive: formActive,
                              parcelCount: formParcelCount,
                              parcelDueDays: days
                            }
                          });
                        } else {
                          updateMutation.mutate({
                            id: editing.id,
                            data: {
                              label: formLabel.trim(),
                              sortOrder: formSortOrder,
                              isActive: formActive,
                              parcelCount: 1,
                              parcelDueDays: [0]
                            }
                          });
                        }
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                    >
                      Salvar
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!formLabel.trim() || createMutation.isPending}
                      onClick={() => {
                        if (formPaymentType === 'AVISTA') {
                          createMutation.mutate({
                            label: formLabel.trim(),
                            paymentType: 'AVISTA',
                            parcelCount: 1,
                            parcelDueDays: [0]
                          });
                          return;
                        }
                        const days = parseDaysFromForm();
                        if (!days || days.length !== formParcelCount) {
                          toast.error('Preencha um prazo (dias) válido para cada parcela.');
                          return;
                        }
                        createMutation.mutate({
                          label: formLabel.trim(),
                          paymentType: 'BOLETO',
                          parcelCount: formParcelCount,
                          parcelDueDays: days
                        });
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:opacity-50"
                    >
                      Criar
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {paymentFormConfirmUi}

          {deleteId && (
            <div className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50" aria-hidden onClick={() => setDeleteId(null)} />
              <div className="relative z-[1101] w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
                <p className="mb-4 text-gray-900 dark:text-gray-100">Excluir esta condição de pagamento?</p>
                <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                  Esta ação não pode ser desfeita.
                </p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setDeleteId(null)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteId && handleDelete(deleteId)}
                    disabled={deleteMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
