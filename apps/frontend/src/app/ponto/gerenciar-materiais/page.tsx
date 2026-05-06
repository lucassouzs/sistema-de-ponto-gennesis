'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import toast from 'react-hot-toast';
import { OcPurchaseOrdersPanel, type PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import { PaymentConditionSelect } from '@/components/oc/PaymentConditionSelect';
import type { FluxTab, MaterialRequest } from './_lib/types';
import { fluxTabToOcTab, orderNeedsFinanceBoleto } from './_lib/flux';
import { getStatusInfo, materialItemLabel, materialItemSubtitle, rmSolicitante } from './_lib/display';
import {
  formatCurrencyBR,
  numericUnitPriceFromInput,
  OC_TYPE_AVISTA,
  OC_TYPE_BOLETO,
  parseCurrencyBR
} from './_lib/ocAmounts';
import { GerenciarMateriaisStats } from './_components/GerenciarMateriaisStats';
import { MaterialsSearchFilter } from './_components/MaterialsSearchFilter';
import { FluxTabsNav } from './_components/FluxTabsNav';
import { MaterialRequestsRmList } from './_components/MaterialRequestsRmList';

export default function GerenciarMateriaisPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  
  const [selectedRequest, setSelectedRequest] = useState<MaterialRequest | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showCreateOCModal, setShowCreateOCModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [ocSupplierId, setOcSupplierId] = useState('');
  const [ocPaymentType, setOcPaymentType] = useState<string>(OC_TYPE_AVISTA);
  const [ocPaymentCondition, setOcPaymentCondition] = useState<string>('AVISTA');
  const [ocPaymentDetails, setOcPaymentDetails] = useState('');
  const [ocObservations, setOcObservations] = useState('');
  const [ocFreteStr, setOcFreteStr] = useState('');
  const [ocSelectedItemIds, setOcSelectedItemIds] = useState<Set<string>>(new Set());
  /** Quantidade a comprar na OC por item da SC (≤ quantidade solicitada). */
  const [ocQuantityByItemId, setOcQuantityByItemId] = useState<Record<string, number>>({});
  /** Valor unitário na OC por item (texto livre: pode ficar vazio enquanto digita). */
  const [ocUnitPriceStrByItemId, setOcUnitPriceStrByItemId] = useState<Record<string, string>>({});

  useEffect(() => {
    if (ocPaymentType === OC_TYPE_AVISTA) {
      setOcPaymentCondition('AVISTA');
    } else {
      setOcPaymentCondition((prev) => (prev === 'AVISTA' ? 'BOLETO_30' : prev));
    }
  }, [ocPaymentType]);

  const resetOcForm = () => {
    setOcSupplierId('');
    setOcPaymentType(OC_TYPE_AVISTA);
    setOcPaymentCondition('AVISTA');
    setOcPaymentDetails('');
    setOcObservations('');
    setOcFreteStr('');
    setOcSelectedItemIds(new Set());
    setOcQuantityByItemId({});
    setOcUnitPriceStrByItemId({});
  };

  // Quando abrir o modal de OC, preenche com TODOS os itens da SC (o comprador pode desmarcar).
  useEffect(() => {
    if (showCreateOCModal && selectedRequest) {
      setOcSelectedItemIds(new Set(selectedRequest.items.map((i) => i.id)));
      setOcQuantityByItemId(
        Object.fromEntries(selectedRequest.items.map((i) => [i.id, Number(i.quantity)]))
      );
      setOcUnitPriceStrByItemId(
        Object.fromEntries(selectedRequest.items.map((i) => [i.id, '0']))
      );
    }
  }, [showCreateOCModal, selectedRequest]);

  const ocSelectedItems =
    selectedRequest?.items.filter((i) => ocSelectedItemIds.has(i.id)) ?? [];

  const ocSubtotalItens = useMemo(() => {
    if (!selectedRequest) return 0;
    let s = 0;
    for (const item of selectedRequest.items) {
      if (!ocSelectedItemIds.has(item.id)) continue;
      const q = ocQuantityByItemId[item.id] ?? Number(item.quantity);
      const unit = numericUnitPriceFromInput(ocUnitPriceStrByItemId[item.id] ?? '');
      s += q * unit;
    }
    return Math.round(s * 100) / 100;
  }, [selectedRequest, ocSelectedItemIds, ocQuantityByItemId, ocUnitPriceStrByItemId]);

  const ocFreteParsed =
    ocFreteStr.trim() === '' ? 0 : parseCurrencyBR(ocFreteStr);
  const ocFreteInvalid = ocFreteStr.trim() !== '' && ocFreteParsed === null;
  const ocAmountToPayComputed =
    ocFreteInvalid || ocFreteParsed === null
      ? null
      : Math.round((ocSubtotalItens + ocFreteParsed) * 100) / 100;

  const toggleOcItem = (itemId: string) => {
    setOcSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectAllOcItems = () => {
    if (!selectedRequest) return;
    setOcSelectedItemIds(new Set(selectedRequest.items.map((i) => i.id)));
    setOcQuantityByItemId((prev) => {
      const next = { ...prev };
      for (const it of selectedRequest.items) {
        if (next[it.id] === undefined) next[it.id] = Number(it.quantity);
      }
      return next;
    });
    setOcUnitPriceStrByItemId((prev) => {
      const next = { ...prev };
      for (const it of selectedRequest.items) {
        if (next[it.id] === undefined) next[it.id] = '0';
      }
      return next;
    });
  };

  const clearOcItems = () => {
    setOcSelectedItemIds(new Set());
  };
  const [fluxTab, setFluxTab] = useState<FluxTab>('rm_PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const prevFluxGroupRef = useRef<'rm' | 'oc' | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  // Buscar requisições de materiais
  const { data: requestsData, isLoading: loadingRequests, refetch } = useQuery({
    queryKey: ['material-requests-manage'],
    queryFn: async () => {
      const res = await api.get('/material-requests', { params: { limit: 500 } });
      return res.data;
    }
  });

  const { data: ordersData } = useQuery({
    queryKey: ['purchase-orders', 'list-full'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500 } });
      return res.data;
    }
  });

  // Aprovar requisição
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, {
        status: 'APPROVED'
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      setShowApprovalModal(false);
      setSelectedRequest(null);
      toast.success('Requisição aprovada.');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Erro ao aprovar');
    }
  });

  // Buscar fornecedores para criar OC
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { limit: 500 } });
      return res.data;
    },
    enabled: showCreateOCModal
  });

  // Criar Ordem de Compra
  const createOCMutation = useMutation({
    mutationFn: async ({
      request,
      supplierId,
      paymentType,
      paymentCondition,
      paymentDetails,
      observations,
      freightAmount,
      selectedItemIds,
      quantityByItemId,
      unitPriceByItemId
    }: {
      request: MaterialRequest;
      supplierId: string;
      paymentType: string;
      paymentCondition: string;
      paymentDetails: string;
      observations: string;
      freightAmount: number;
      selectedItemIds: string[];
      quantityByItemId: Record<string, number>;
      unitPriceByItemId: Record<string, number>;
    }) => {
      const selectedSet = new Set(selectedItemIds);
      const selectedItems = request.items.filter((it) => selectedSet.has(it.id));
      if (!selectedItems.length) {
        throw new Error('Selecione pelo menos 1 item para a OC');
      }

      const items = selectedItems.map((item) => {
        const maxQ = Number(item.quantity);
        const q = quantityByItemId[item.id] ?? maxQ;
        if (!(q > 0) || q > maxQ) {
          throw new Error(
            `Quantidade inválida para "${item.material?.description || item.material?.name || 'item'}". Use entre 0 e ${maxQ}.`
          );
        }
        return {
          materialRequestItemId: item.id,
          materialId: item.material.id,
          quantity: q,
          unit: item.unit,
          unitPrice: unitPriceByItemId[item.id] ?? 0,
          notes: item.observation ?? item.notes
        };
      });
      const res = await api.post('/purchase-orders', {
        materialRequestId: request.id,
        supplierId,
        items,
        paymentType,
        paymentCondition,
        paymentDetails: paymentDetails.trim() || undefined,
        notes: observations.trim() || undefined,
        freightAmount
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      setShowCreateOCModal(false);
      setSelectedRequest(null);
      resetOcForm();
      toast.success('Ordem de compra criada com sucesso!');
    },
    onError: (error: any) => {
      toast.error(
        (typeof error?.message === 'string' && error.message) ||
          error.response?.data?.message ||
          'Erro ao criar OC'
      );
    }
  });

  const correctionMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const res = await api.patch(`/material-requests/${id}/status`, {
        status: 'IN_REVIEW'
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      setShowCorrectionModal(false);
      setSelectedRequest(null);
      toast.success('Requisição enviada para Correção RM.');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Erro ao enviar para correção');
    }
  });

  const cancelByApproverMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'CANCELLED' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      setShowCancelModal(false);
      setSelectedRequest(null);
      toast.success('Requisição cancelada.');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Erro ao cancelar');
    }
  });

  const allRequests = requestsData?.data?.requests || requestsData?.data || [];

  // Calcular estatísticas
  const normalizedRequests = allRequests.map((r: MaterialRequest) =>
    r.status === 'REJECTED' ? ({ ...r, status: 'CANCELLED' as const }) : r
  );

  const allOrders: PurchaseOrder[] = ordersData?.data || [];

  /** Requisições que já têm pelo menos uma OC — saem da fila "RMs aprovadas" e seguem só no fluxo OC */
  const materialRequestIdsWithOc = useMemo(() => {
    const s = new Set<string>();
    for (const o of allOrders) {
      const mid = o.materialRequestId ?? o.materialRequest?.id;
      if (mid) s.add(mid);
    }
    return s;
  }, [allOrders]);

  /** OCs vinculadas por requisição (mapa de cotação pode gerar várias por RM). */
  const ordersByMaterialRequestId = useMemo(() => {
    const map = new Map<string, PurchaseOrder[]>();
    for (const o of allOrders) {
      const mid = o.materialRequestId ?? o.materialRequest?.id;
      if (!mid) continue;
      if (!map.has(mid)) map.set(mid, []);
      map.get(mid)!.push(o);
    }
    map.forEach((list) => {
      list.sort((a, b) => (a.orderNumber || '').localeCompare(b.orderNumber || '', 'pt-BR', { numeric: true }));
    });
    return map;
  }, [allOrders]);

  const stats = {
    total: normalizedRequests.length,
    pending: normalizedRequests.filter((r: MaterialRequest) => r.status === 'PENDING').length,
    approved: normalizedRequests.filter(
      (r: MaterialRequest) => r.status === 'APPROVED' && !materialRequestIdsWithOc.has(r.id)
    ).length,
    cancelled: normalizedRequests.filter((r: MaterialRequest) => r.status === 'CANCELLED').length,
    inReview: normalizedRequests.filter((r: MaterialRequest) => r.status === 'IN_REVIEW').length
  };

  const ocTabCounts = useMemo(() => {
    const compras = allOrders.filter((o) => o.status === 'PENDING_COMPRAS' || o.status === 'DRAFT').length;
    const gestor = allOrders.filter((o) => o.status === 'PENDING').length;
    const diretoria = allOrders.filter((o) => o.status === 'PENDING_DIRETORIA').length;
    const emCorrecao = allOrders.filter((o) => o.status === 'IN_REVIEW').length;
    const attachBoleto = allOrders.filter((o) => orderNeedsFinanceBoleto(o)).length;
    const aprovadas = allOrders.filter(
      (o) => o.status === 'APPROVED' && !orderNeedsFinanceBoleto(o)
    ).length;
    const proofValidation = allOrders.filter((o) => o.status === 'PENDING_PROOF_VALIDATION').length;
    const proofCorrection = allOrders.filter((o) => o.status === 'PENDING_PROOF_CORRECTION').length;
    const attachNf = allOrders.filter((o) => o.status === 'PENDING_NF_ATTACHMENT').length;
    const finalizadas = allOrders.filter((o) => o.status === 'FINALIZED' || o.status === 'SENT').length;
    return {
      compras,
      gestor,
      diretoria,
      IN_REVIEW: emCorrecao,
      APPROVED: aprovadas,
      ATTACH_BOLETO: attachBoleto,
      PROOF_VALIDATION: proofValidation,
      PROOF_CORRECTION: proofCorrection,
      ATTACH_NF: attachNf,
      FINALIZADAS: finalizadas
    };
  }, [allOrders]);

  // Filtrar requisições (somente quando uma fase SC/RM está ativa)
  const filteredRequests = useMemo(() => {
    if (!fluxTab.startsWith('rm_')) return [];
    const rmKey = fluxTab.replace(/^rm_/, '') as MaterialRequest['status'];
    return normalizedRequests.filter((request: MaterialRequest) => {
      if (request.status !== rmKey) return false;

      if (
        rmKey === 'APPROVED' &&
        request.status === 'APPROVED' &&
        materialRequestIdsWithOc.has(request.id)
      ) {
        return false;
      }

      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesName = rmSolicitante(request)?.name?.toLowerCase().includes(searchLower) ?? false;
        const matchesDescription = request.description?.toLowerCase().includes(searchLower) || false;
        const matchesCostCenter = request.costCenter?.name?.toLowerCase().includes(searchLower) ?? false;
        if (!matchesName && !matchesDescription && !matchesCostCenter) return false;
      }

      return true;
    });
  }, [normalizedRequests, fluxTab, searchTerm, materialRequestIdsWithOc]);

  useEffect(() => {
    const group = fluxTab.startsWith('oc_') ? 'oc' : 'rm';
    if (prevFluxGroupRef.current === null) {
      prevFluxGroupRef.current = group;
      return;
    }
    if (prevFluxGroupRef.current !== group) {
      prevFluxGroupRef.current = group;
      if (group === 'oc') {
        document.getElementById('fluxo-oc')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        document.getElementById('secao-fluxo-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }, [fluxTab]);

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <Loading 
        message="Carregando..."
        fullScreen
        size="lg"
      />
    );
  }

  const handleApprove = () => {
    if (selectedRequest) {
      approveMutation.mutate(selectedRequest.id);
    }
  };

  return (
    <ProtectedRoute route="/ponto/gerenciar-materiais">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-10">
          <div id="secao-sc-rm" className="space-y-6 scroll-mt-4">
          {/* Cabeçalho */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Solicitações de materiais e ordens de compra
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Fluxo completo na mesma tela: <strong>SC / RM</strong> (aprovação e correção) → <strong>OC</strong> (compras, gestor e diretoria).
            </p>
          </div>

          <GerenciarMateriaisStats stats={stats} />

          <MaterialsSearchFilter searchTerm={searchTerm} onSearchChange={setSearchTerm} />

          <FluxTabsNav
            fluxTab={fluxTab}
            onFluxTab={setFluxTab}
            stats={stats}
            ocTabCounts={ocTabCounts}
          />

          {fluxTab.startsWith('rm_') && (
            <MaterialRequestsRmList
              loadingRequests={loadingRequests}
              filteredRequests={filteredRequests}
              ordersByMaterialRequestId={ordersByMaterialRequestId}
              currentUserId={userData?.data?.id}
              onCreateOc={(request) => {
                setSelectedRequest(request);
                resetOcForm();
                setShowCreateOCModal(true);
              }}
              onApprove={(request) => {
                setSelectedRequest(request);
                setShowApprovalModal(true);
              }}
              onCorrection={(request) => {
                setSelectedRequest(request);
                setShowCorrectionModal(true);
              }}
              onCancel={(request) => {
                setSelectedRequest(request);
                setShowCancelModal(true);
              }}
              onDetails={(request) => {
                setSelectedRequest(request);
                setShowDetailsModal(true);
              }}
            />
          )}
          </div>

          {fluxTab.startsWith('oc_') && (
            <OcPurchaseOrdersPanel embedded hideTabs activeTab={fluxTabToOcTab(fluxTab)} />
          )}
        </div>

        {/* Modal Detalhes */}
        {showDetailsModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => { setShowDetailsModal(false); setSelectedRequest(null); }} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Detalhes da Requisição
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Número</p>
                  <p className="font-medium text-gray-900 dark:text-gray-100">{selectedRequest.requestNumber || `#${selectedRequest.id.slice(0, 8)}`}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Status</p>
                  <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getStatusInfo(selectedRequest.status).color}`}>
                    {getStatusInfo(selectedRequest.status).label}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Solicitante</p>
                  <p className="text-gray-900 dark:text-gray-100">{rmSolicitante(selectedRequest)?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Centro de Custo</p>
                  <p className="text-gray-900 dark:text-gray-100">{selectedRequest.costCenter?.name}</p>
                </div>
                {selectedRequest.project && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Projeto</p>
                    <p className="text-gray-900 dark:text-gray-100">{selectedRequest.project.name}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Descrição</p>
                  <p className="text-gray-900 dark:text-gray-100">{selectedRequest.description || 'Sem descrição'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Itens</p>
                  <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                          <th className="text-left p-2">Material</th>
                          <th className="text-right p-2">Qtd</th>
                          <th className="text-right p-2">Unidade</th>
                          <th className="text-left p-2">Anexo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedRequest.items?.map((item: any) => (
                          <tr key={item.id} className="border-t border-gray-200 dark:border-gray-600">
                            <td className="p-2 text-gray-900 dark:text-gray-100">{item.material?.description || item.material?.name || '-'}</td>
                            <td className="p-2 text-right">{item.quantity}</td>
                            <td className="p-2 text-right">{item.unit || '-'}</td>
                            <td className="p-2 text-left">
                              {item.attachmentUrl ? (
                                <a
                                  href={absoluteUploadUrl(item.attachmentUrl)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 dark:text-blue-400 hover:underline text-xs"
                                >
                                  {item.attachmentName || 'Ver anexo'}
                                </a>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2 flex-wrap">
                  {selectedRequest.status === 'IN_REVIEW' &&
                    userData?.data?.id === rmSolicitante(selectedRequest)?.id && (
                      <Link
                        href={`/ponto/solicitar-materiais?editRm=${selectedRequest.id}`}
                        onClick={() => {
                          setShowDetailsModal(false);
                          setSelectedRequest(null);
                        }}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors text-sm font-medium"
                      >
                        <Pencil className="w-4 h-4" />
                        Editar RM
                      </Link>
                    )}
                  <button
                    type="button"
                    onClick={() => { setShowDetailsModal(false); setSelectedRequest(null); }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Aprovação */}
        {showApprovalModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowApprovalModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Aprovar Requisição
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                Tem certeza que deseja aprovar esta requisição de material?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowApprovalModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="px-4 py-2 bg-green-600 dark:bg-green-700 text-white rounded-lg hover:bg-green-700 dark:hover:bg-green-800 disabled:opacity-50"
                >
                  {approveMutation.isPending ? 'Aprovando...' : 'Aprovar'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Criar OC */}
        {showCreateOCModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => {
                setShowCreateOCModal(false);
                resetOcForm();
              }}
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
                Criar Ordem de Compra (OC)
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                SC: {selectedRequest.requestNumber || selectedRequest.id.slice(0, 8)}
              </p>

              {/* Lista de itens (primeiro na tela) */}
              <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Itens da SC:</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Selecione quais itens serão inseridos nesta OC.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectAllOcItems}
                      className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                    >
                      Selecionar todos
                    </button>
                    <button
                      type="button"
                      onClick={clearOcItems}
                      className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                      disabled={ocSelectedItems.length === 0}
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                  <ul className="divide-y divide-gray-200 dark:divide-gray-600">
                    {selectedRequest.items.map((item) => {
                      const materialSubtitle = materialItemSubtitle(item);
                      return (
                      <li key={item.id} className="px-3 py-2 flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={ocSelectedItemIds.has(item.id)}
                          onChange={() => toggleOcItem(item.id)}
                          className="mt-1"
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                            {materialItemLabel(item)}
                          </p>
                          {materialSubtitle ? (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                              {materialSubtitle}
                            </p>
                          ) : null}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                            <span>
                              Solicitado na SC: {item.quantity} {item.unit}
                            </span>
                            <span className="text-gray-400">|</span>
                            <label className="inline-flex items-center gap-1.5">
                              <span className="whitespace-nowrap">Qtd. na OC:</span>
                              <input
                                type="number"
                                min={0.0001}
                                step="any"
                                max={Number(item.quantity)}
                                disabled={!ocSelectedItemIds.has(item.id)}
                                value={ocQuantityByItemId[item.id] ?? Number(item.quantity)}
                                onChange={(e) => {
                                  const n = parseFloat(e.target.value);
                                  if (Number.isNaN(n)) return;
                                  const max = Number(item.quantity);
                                  const q = Math.min(Math.max(n, 0.0001), max);
                                  setOcQuantityByItemId((prev) => ({ ...prev, [item.id]: q }));
                                }}
                                className="w-24 px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                              />
                              <span>{item.unit}</span>
                            </label>
                            <span className="text-gray-400">|</span>
                            <label className="inline-flex items-center gap-1.5">
                              <span className="whitespace-nowrap">Valor unit. (R$):</span>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="0,00"
                                disabled={!ocSelectedItemIds.has(item.id)}
                                value={ocUnitPriceStrByItemId[item.id] ?? ''}
                                onChange={(e) => {
                                  setOcUnitPriceStrByItemId((prev) => ({
                                    ...prev,
                                    [item.id]: e.target.value
                                  }));
                                }}
                                className="w-28 px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-50"
                              />
                            </label>
                          </div>
                          {item.attachmentUrl && (
                            <a
                              href={absoluteUploadUrl(item.attachmentUrl)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-0.5 inline-block"
                            >
                              Anexo: {item.attachmentName || 'abrir'}
                            </a>
                          )}
                        </div>
                      </li>
                    );
                    })}
                  </ul>
                </div>

                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  Selecionados: {ocSelectedItems.length} de {selectedRequest.items.length}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Fornecedor *
                </label>
                <select
                  value={ocSupplierId}
                  onChange={(e) => setOcSupplierId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione o fornecedor</option>
                  {(suppliersData?.data || []).filter((s: { isActive?: boolean }) => s.isActive).map((s: { id: string; code: string; name: string }) => (
                    <option key={s.id} value={s.id}>{s.code} - {s.name}</option>
                  ))}
                </select>
                {(suppliersData?.data || []).length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Cadastre fornecedores em Suprimentos → Fornecedores
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Tipo de pagamento *
                  </span>
                  <div className="flex flex-wrap gap-4">
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="ocPaymentType"
                        checked={ocPaymentType === OC_TYPE_AVISTA}
                        onChange={() => setOcPaymentType(OC_TYPE_AVISTA)}
                        className="rounded-full border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      À vista
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="radio"
                        name="ocPaymentType"
                        checked={ocPaymentType === OC_TYPE_BOLETO}
                        onChange={() => setOcPaymentType(OC_TYPE_BOLETO)}
                        className="rounded-full border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      Boleto
                    </label>
                  </div>
                </div>
                <div>
                  <label htmlFor="ocPaymentCondition" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Condição de pagamento *
                  </label>
                  <PaymentConditionSelect
                    id="ocPaymentCondition"
                    paymentType={ocPaymentType === OC_TYPE_AVISTA ? 'AVISTA' : 'BOLETO'}
                    value={ocPaymentCondition}
                    onChange={setOcPaymentCondition}
                    disabled={ocPaymentType === OC_TYPE_AVISTA}
                  />
                </div>
              </div>

              <div className="mb-4">
                <label htmlFor="ocFrete" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Frete (R$)
                </label>
                <input
                  id="ocFrete"
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={ocFreteStr}
                  onChange={(e) => setOcFreteStr(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {ocFreteInvalid && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">Informe um valor de frete válido ou deixe em branco.</p>
                )}
              </div>

              <div className="mb-4">
                <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Valor a ser pago (R$) *
                </span>
                <div
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900/50 text-gray-900 dark:text-gray-100"
                  aria-live="polite"
                >
                  {ocAmountToPayComputed !== null
                    ? `R$ ${formatCurrencyBR(ocAmountToPayComputed)}`
                    : '—'}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Soma dos itens (quantidade × valor unitário) + frete.
                </p>
              </div>

              <div className="mb-4">
                <label htmlFor="ocPaymentDetails" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Dados do pagamento
                </label>
                <textarea
                  id="ocPaymentDetails"
                  value={ocPaymentDetails}
                  onChange={(e) => setOcPaymentDetails(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Conta, PIX, agência, favorecido, etc."
                />
              </div>

              <div className="mb-4">
                <label htmlFor="ocObservations" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Observações
                </label>
                <textarea
                  id="ocObservations"
                  value={ocObservations}
                  onChange={(e) => setOcObservations(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Observações gerais da OC"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateOCModal(false);
                    resetOcForm();
                  }}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!selectedRequest || !ocSupplierId) {
                      toast.error('Selecione o fornecedor.');
                      return;
                    }
                    if (ocAmountToPayComputed === null || ocAmountToPayComputed < 0) {
                      toast.error('Corrija o frete ou os valores unitários para obter um total válido.');
                      return;
                    }
                    const unitPriceByItemId = Object.fromEntries(
                      Array.from(ocSelectedItemIds).map((id) => [
                        id,
                        numericUnitPriceFromInput(ocUnitPriceStrByItemId[id] ?? '')
                      ])
                    );
                    createOCMutation.mutate({
                      request: selectedRequest,
                      supplierId: ocSupplierId,
                      paymentType: ocPaymentType,
                      paymentCondition: ocPaymentCondition,
                      paymentDetails: ocPaymentDetails,
                      observations: ocObservations,
                      freightAmount: ocFreteParsed ?? 0,
                      selectedItemIds: Array.from(ocSelectedItemIds),
                      quantityByItemId: ocQuantityByItemId,
                      unitPriceByItemId
                    });
                  }}
                  disabled={
                    !ocSupplierId ||
                    createOCMutation.isPending ||
                    ocSelectedItems.length === 0 ||
                    ocAmountToPayComputed === null ||
                    ocAmountToPayComputed < 0
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {createOCMutation.isPending ? 'Criando...' : 'Criar OC'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Cancelar (compras) */}
        {showCancelModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowCancelModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Cancelar requisição
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                A RM ficará como <strong>Cancelada</strong> e sairá do fluxo de análise. Confirma?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={() => selectedRequest && cancelByApproverMutation.mutate(selectedRequest.id)}
                  disabled={cancelByApproverMutation.isPending}
                  className="px-4 py-2 bg-gray-700 dark:bg-gray-600 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {cancelByApproverMutation.isPending ? 'Cancelando...' : 'Confirmar cancelamento'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Enviar para Correção RM */}
        {showCorrectionModal && selectedRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowCorrectionModal(false)} />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Enviar para Correção RM
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                O solicitante poderá ajustar a requisição e reenviá-la para análise.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCorrectionModal(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => selectedRequest && correctionMutation.mutate({ id: selectedRequest.id })}
                  disabled={correctionMutation.isPending}
                  className="px-4 py-2 bg-amber-600 dark:bg-amber-700 text-white rounded-lg hover:bg-amber-700 dark:hover:bg-amber-800 disabled:opacity-50"
                >
                  {correctionMutation.isPending ? 'Enviando...' : 'Enviar para correção'}
                </button>
              </div>
            </div>
          </div>
        )}

      </MainLayout>
    </ProtectedRoute>
  );
}
