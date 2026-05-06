'use client';

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { CreditCard, Plus, Edit, Trash2, Search } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  type PaymentConditionRow,
  formatParcelSummary,
  normalizeParcelDueDaysClient
} from '@/components/oc/PaymentConditionSelect';

export default function CondicoesPagamentoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
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

  const filtered = (listData || []).filter((r) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.toLowerCase();
    return r.label.toLowerCase().includes(q) || r.code.toLowerCase().includes(q);
  });

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
    mutationFn: async (id: string) => {
      await api.delete(`/payment-conditions/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-conditions'] });
      setDeleteId(null);
      toast.success('Condição excluída');
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Erro ao excluir')
  });

  const resetForm = () => {
    setFormLabel('');
    setFormPaymentType('BOLETO');
    setFormSortOrder(100);
    setFormActive(true);
    setFormParcelCount(1);
    setFormParcelDayStrs(['30']);
  };

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
        <div className="space-y-6 max-w-5xl mx-auto">
          <div className="text-center sm:text-left">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 flex items-center justify-center sm:justify-start gap-3">
              <CreditCard className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              Condições de Pagamento
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Cadastro usado na criação e edição de ordens de compra (à vista e boleto).
            </p>
          </div>

          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="search"
                  placeholder="Buscar por nome ou código..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  resetForm();
                  setShowForm(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Nova condição
              </button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Loading message="Carregando condições..." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-600 dark:text-gray-400">
                        <th className="py-3 pr-4">Nome</th>
                        <th className="py-3 pr-4">Parcelas / prazos</th>
                        <th className="py-3 pr-4">Código</th>
                        <th className="py-3 pr-4">Tipo</th>
                        <th className="py-3 pr-4">Ordem</th>
                        <th className="py-3 pr-4">Ativo</th>
                        <th className="py-3 pr-4">Sistema</th>
                        <th className="py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r) => (
                        <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800/80">
                          <td className="py-3 pr-4 text-gray-900 dark:text-gray-100 font-medium">{r.label}</td>
                          <td className="py-3 pr-4 text-gray-600 dark:text-gray-400 text-xs max-w-[14rem]">
                            {formatParcelSummary(r.parcelCount ?? 1, r.parcelDueDays) || '—'}
                          </td>
                          <td className="py-3 pr-4 text-gray-600 dark:text-gray-400 font-mono text-xs">{r.code}</td>
                          <td className="py-3 pr-4">{r.paymentType === 'AVISTA' ? 'À vista' : 'Boleto'}</td>
                          <td className="py-3 pr-4">{r.sortOrder}</td>
                          <td className="py-3 pr-4">{r.isActive ? 'Sim' : 'Não'}</td>
                          <td className="py-3 pr-4">{r.isSystem ? 'Sim' : 'Não'}</td>
                          <td className="py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg"
                              title="Editar"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            {!r.isSystem && (
                              <button
                                type="button"
                                onClick={() => setDeleteId(r.id)}
                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <p className="text-center text-gray-500 py-8">Nenhuma condição encontrada.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {showForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50" onClick={() => setShowForm(false)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                  {editing ? 'Editar condição' : 'Nova condição'}
                </h3>
                {!editing && (
                  <>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de pagamento</label>
                    <select
                      value={formPaymentType}
                      onChange={(e) => {
                        const t = e.target.value as 'AVISTA' | 'BOLETO';
                        setFormPaymentType(t);
                        if (t === 'AVISTA') {
                          setFormParcelCount(1);
                          setFormParcelDayStrs(['0']);
                        } else {
                          setFormParcelCount(1);
                          setFormParcelDayStrs(['30']);
                        }
                      }}
                      className="w-full mb-4 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                    >
                      <option value="AVISTA">À vista</option>
                      <option value="BOLETO">Boleto</option>
                    </select>
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
                    onClick={() => {
                      setShowForm(false);
                      setEditing(null);
                      resetForm();
                    }}
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

          {deleteId && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteId(null)} />
              <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-sm w-full p-6">
                <p className="text-gray-900 dark:text-gray-100 mb-4">Excluir esta condição?</p>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setDeleteId(null)} className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(deleteId)}
                    disabled={deleteMutation.isPending}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg"
                  >
                    Excluir
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
