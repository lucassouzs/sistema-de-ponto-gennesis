'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, FileText, Plus, Search, Truck, Upload, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PaymentConditionSelect } from '@/components/oc/PaymentConditionSelect';
import { materialItemLabel, materialItemSubtitle } from '../gerenciar-materiais/_lib/display';

type MaterialRequestItem = {
  id: string;
  quantity: number;
  unit: string;
  observation?: string;
  notes?: string;
  material: {
    id: string;
    name?: string | null;
    code?: string;
    sinapiCode?: string | null;
    description?: string;
  };
};

type MaterialRequest = {
  id: string;
  requestNumber?: string;
  createdAt: string;
  status: 'APPROVED' | string;
  items: MaterialRequestItem[];
};

type PurchaseOrderLite = {
  materialRequestId?: string;
  materialRequest?: { id?: string };
};

type Supplier = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

type PurchaseOrderCreateInput = {
  materialRequestId: string;
  supplierId: string;
  items: Array<{
    materialRequestItemId?: string | null;
    materialId: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    notes?: string | null;
  }>;
  paymentType: string;
  paymentCondition: string;
  paymentDetails: string | undefined;
  notes: string | undefined;
  amountToPay: number;
  boletoAttachmentUrl?: string;
  boletoAttachmentName?: string;
};

function parseCurrencyBR(input: string): number | null {
  const t = input.trim().replace(/\s/g, '');
  if (!t) return null;

  // Aceita formatos:
  // - BR: 1.234,56 (ponto milhar + vírgula decimal)
  // - ou número puro: 1234,56
  // - ou padrão americano: 1234.56 (ponto decimal)
  const hasComma = t.includes(',');
  const hasDot = t.includes('.');

  let normalized = t;
  if (hasComma && hasDot) {
    // Ex: 1.234,56
    normalized = t.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    // Ex: 1234,56
    normalized = t.replace(',', '.');
  } else if (hasDot) {
    const parts = t.split('.');
    // Ex: 1234.56 (1 ponto e até 2 casas decimais) => ponto é decimal
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = t;
    } else {
      // Ex: 1.234.567 (pontos como milhar)
      normalized = t.replace(/\./g, '');
    }
  }

  // remove qualquer caractere estranho e garante formato numérico
  normalized = normalized.replace(/[^0-9.-]/g, '');

  const n = parseFloat(normalized);
  return Number.isFinite(n) ? n : null;
}

function formatCurrencyBR(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function formatDateTimeBR(dateString: string) {
  return new Date(dateString).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
}

const OC_TYPE_AVISTA = 'AVISTA';
const OC_TYPE_BOLETO = 'BOLETO';

function paymentConditionDefault(paymentType: string): string {
  if (paymentType === OC_TYPE_AVISTA) return 'AVISTA';
  return 'BOLETO_30';
}

function scoreItem(params: {
  unitPrice: number;
  quantity: number;
  freight: number;
}): number {
  const { unitPrice, quantity, freight } = params;
  return unitPrice * quantity + freight;
}

export default function MapaCotacaoPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedRequestId, setSelectedRequestId] = useState<string>('');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set());
  const [freightBySupplier, setFreightBySupplier] = useState<Record<string, string>>({});
  const [unitPriceBySupplierItem, setUnitPriceBySupplierItem] = useState<Record<string, string>>({});

  const [quoteMapId, setQuoteMapId] = useState<string>('');

  const [generateSupplierIds, setGenerateSupplierIds] = useState<Set<string>>(new Set());

  /** Quantidade a comprar na OC por item da SC (≤ solicitado na SC). Afeta totais e vencedor. */
  const [ocItemQtyByItemId, setOcItemQtyByItemId] = useState<Record<string, number>>({});

  const [paymentDraftBySupplier, setPaymentDraftBySupplier] = useState<
    Record<
      string,
      {
        paymentType: string;
        paymentCondition: string;
        paymentDetails: string;
        observations: string;
        amountToPayStr: string;
      }
    >
  >({});

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: requestsData, isLoading: loadingRequests } = useQuery({
    queryKey: ['material-requests-approved-map'],
    queryFn: async () => {
      const res = await api.get('/material-requests', { params: { status: 'APPROVED', limit: 500 } });
      return res.data;
    }
  });

  const { data: ordersData, isLoading: loadingOrders } = useQuery({
    queryKey: ['purchase-orders', 'list-full'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500 } });
      return res.data;
    }
  });

  const allOrders: PurchaseOrderLite[] = ordersData?.data || [];

  /** Mesma regra da aba "RMs aprovadas" em Gerenciar materiais: aprovadas e ainda sem OC */
  const materialRequestIdsWithOc = useMemo(() => {
    const s = new Set<string>();
    for (const o of allOrders) {
      const mid = o.materialRequestId ?? o.materialRequest?.id;
      if (mid) s.add(mid);
    }
    return s;
  }, [allOrders]);

  const rawApprovedRequests: MaterialRequest[] = requestsData?.data?.requests || requestsData?.data || [];

  const approvedRequests = useMemo(
    () =>
      rawApprovedRequests.filter(
        (r) => r.status === 'APPROVED' && !materialRequestIdsWithOc.has(r.id)
      ),
    [rawApprovedRequests, materialRequestIdsWithOc]
  );

  const { data: suppliersData, isLoading: loadingSuppliers } = useQuery({
    queryKey: ['suppliers-map'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { limit: 500 } });
      return res.data;
    }
  });

  const suppliers: Supplier[] = useMemo(
    () => (suppliersData?.data || []).filter((s: Supplier) => s.isActive),
    [suppliersData?.data]
  );

  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.code && s.code.toLowerCase().includes(q))
    );
  }, [suppliers, supplierSearch]);

  const selectedSuppliersOrdered = useMemo(() => {
    return suppliers
      .filter((s) => selectedSupplierIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [suppliers, selectedSupplierIds]);

  const selectedRequest = approvedRequests.find((r) => r.id === selectedRequestId) || null;

  useEffect(() => {
    if (!selectedRequestId) return;
    if (!approvedRequests.some((r) => r.id === selectedRequestId)) {
      setSelectedRequestId('');
    }
  }, [approvedRequests, selectedRequestId]);

  useEffect(() => {
    // Trocar a requisição cria um mapa diferente
    setQuoteMapId('');
  }, [selectedRequestId]);

  useEffect(() => {
    if (!selectedRequest) {
      setOcItemQtyByItemId({});
      return;
    }
    setOcItemQtyByItemId(
      Object.fromEntries(selectedRequest.items.map((i) => [i.id, Number(i.quantity)]))
    );
  }, [selectedRequest?.id]);

  // Só ao trocar a requisição (não incluir `suppliers` aqui: o array era recriado a cada render e limpava a seleção a cada clique).
  useEffect(() => {
    if (!selectedRequestId) return;
    setSelectedSupplierIds(new Set());
    setGenerateSupplierIds(new Set());
    setFreightBySupplier({});
    setUnitPriceBySupplierItem({});
    setPaymentDraftBySupplier({});
    setSupplierSearch('');
  }, [selectedRequestId]);

  useEffect(() => {
    if (!selectedRequest) return;
    if (selectedSupplierIds.size === 0) return;

    // inicializa fretes e preços unitários como vazio (não sobrescreve se já existir)
    setFreightBySupplier((prev) => {
      const next = { ...prev };
      for (const supId of Array.from(selectedSupplierIds)) {
        if (next[supId] === undefined) next[supId] = '';
      }
      return next;
    });

    setUnitPriceBySupplierItem((prev) => {
      const next = { ...prev };
      for (const item of selectedRequest.items) {
        for (const supId of Array.from(selectedSupplierIds)) {
          const key = `${supId}:${item.id}`;
          if (next[key] === undefined) next[key] = '';
        }
      }
      return next;
    });
  }, [selectedRequest, selectedSupplierIds]);

  const formatCurrencyInputValue = (raw: string): string => {
    const n = parseCurrencyBR(raw);
    if (n == null) return raw;
    return formatCurrencyBR(n);
  };

  const ocItems = selectedRequest?.items ?? [];

  const winnersByItem = useMemo(() => {
    if (!selectedRequest) return [];
    const list: Array<{
      itemId: string;
      winnerSupplierId: string;
      winnerScore: number;
      winnerUnitPrice: number;
      /** Dois ou mais fornecedores com o mesmo preço unitário (centavos) neste item. */
      technicalTie: boolean;
      itemUnit: string;
      itemQuantity: number;
      perSupplier: Array<{
        supplierId: string;
        unitPrice: number | null;
        itemTotal: number | null;
        freight: number;
        score: number | null;
      }>;
    }> = [];

    for (const item of selectedRequest.items) {
      const perSupplier = [];
      let best: {
        supplierId: string;
        score: number;
        unitPrice: number;
      } | null = null;

      const quantity = ocItemQtyByItemId[item.id] ?? Number(item.quantity);

      for (const supplierId of Array.from(selectedSupplierIds)) {
        const key = `${supplierId}:${item.id}`;
        const unitPrice = parseCurrencyBR(unitPriceBySupplierItem[key] ?? '');
        const freight = parseCurrencyBR(freightBySupplier[supplierId] ?? '') ?? 0;

        const itemTotal = unitPrice == null ? null : unitPrice * quantity;
        const score = unitPrice == null ? null : scoreItem({ unitPrice, quantity, freight });
        perSupplier.push({
          supplierId,
          unitPrice,
          itemTotal,
          freight,
          score
        });

        if (score != null) {
          if (!best || score < best.score) {
            best = { supplierId, score, unitPrice: unitPrice! };
          } else if (score === best.score) {
            // tie-break: menor unitPrice
            if (unitPrice! < best.unitPrice) {
              best = { supplierId, score, unitPrice: unitPrice! };
            }
          }
        }
      }

      if (!best) continue;

      const unitPriceCounts = new Map<number, number>();
      for (const p of perSupplier) {
        if (p.unitPrice == null) continue;
        const cents = Math.round(p.unitPrice * 100);
        unitPriceCounts.set(cents, (unitPriceCounts.get(cents) ?? 0) + 1);
      }
      let technicalTie = false;
      unitPriceCounts.forEach((count) => {
        if (count >= 2) technicalTie = true;
      });

      list.push({
        itemId: item.id,
        winnerSupplierId: best.supplierId,
        winnerScore: best.score,
        winnerUnitPrice: best.unitPrice,
        technicalTie,
        itemUnit: item.unit,
        itemQuantity: quantity,
        perSupplier
      });
    }

    return list;
  }, [selectedRequest, selectedSupplierIds, freightBySupplier, unitPriceBySupplierItem, ocItemQtyByItemId]);

  useEffect(() => {
    // quando winners mudarem, a seleção de geração "default" acompanha (apenas se ainda estiver vazia)
    if (!selectedRequest) return;
    if (!winnersByItem || winnersByItem.length === 0) return;
    const anySelected = generateSupplierIds.size > 0;
    if (anySelected) return;

    const winnerSuppliers = new Set<string>();
    for (const w of winnersByItem) winnerSuppliers.add(w.winnerSupplierId);
    setGenerateSupplierIds(winnerSuppliers);
  }, [selectedRequest, winnersByItem, unitPriceBySupplierItem]); // eslint-disable-line react-hooks/exhaustive-deps

  const wonItemsBySupplier = useMemo(() => {
    const map: Record<string, typeof ocItems> = {};
    for (const s of Array.from(selectedSupplierIds)) map[s] = [];

    for (const w of winnersByItem) {
      const item = ocItems.find((i) => i.id === w.itemId);
      if (!item) continue;
      map[w.winnerSupplierId] = map[w.winnerSupplierId] || [];
      map[w.winnerSupplierId].push(item);
    }

    return map;
  }, [winnersByItem, ocItems, selectedSupplierIds]);

  const computedSupplierTotals = useMemo(() => {
    const out: Record<string, { itemsTotal: number; freight: number; amountToPay: number }> = {};
    for (const supplierId of Array.from(selectedSupplierIds)) {
      const freight = parseCurrencyBR(freightBySupplier[supplierId] ?? '') ?? 0;
      const items = wonItemsBySupplier[supplierId] ?? [];
      let itemsTotal = 0;
      for (const item of items) {
        const key = `${supplierId}:${item.id}`;
        const unitPrice = parseCurrencyBR(unitPriceBySupplierItem[key] ?? '');
        if (unitPrice == null) continue;
        const q = ocItemQtyByItemId[item.id] ?? Number(item.quantity);
        itemsTotal += unitPrice * q;
      }
      out[supplierId] = { itemsTotal, freight, amountToPay: itemsTotal + freight };
    }
    return out;
  }, [selectedSupplierIds, wonItemsBySupplier, freightBySupplier, unitPriceBySupplierItem, ocItemQtyByItemId]);

  const [isGenerating, setIsGenerating] = useState(false);

  const generateOrdersMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequest) throw new Error('Selecione uma requisição na fase RMs aprovadas.');
      if (generateSupplierIds.size === 0) throw new Error('Selecione ao menos um fornecedor vencedor.');
      setIsGenerating(true);

      try {
        // 1) Garantir que existe um mapa no banco
        let mapId = quoteMapId;
        if (!mapId) {
          const created = await api.post('/quote-maps', { materialRequestId: selectedRequest.id });
          mapId = created.data?.data?.id;
          if (!mapId) throw new Error('Falha ao criar mapa de cotação');
          setQuoteMapId(mapId);
        }

        // 2) Salvar cotações + frete no banco (isso recalcula vencedor por item no backend)
        const selectedSupplierIdsArr = Array.from(selectedSupplierIds);
        const freightBySupplierPayload: Record<string, number> = {};
        for (const supplierId of selectedSupplierIdsArr) {
          const f = parseCurrencyBR(freightBySupplier[supplierId] ?? '');
          if (f == null || f < 0) throw new Error(`Frete inválido para o fornecedor ${supplierId}`);
          freightBySupplierPayload[supplierId] = f;
        }

        const unitPricesPayload: Array<{
          supplierId: string;
          materialRequestItemId: string;
          unitPrice: number;
        }> = [];

        for (const supplierId of selectedSupplierIdsArr) {
          for (const item of selectedRequest.items) {
            const key = `${supplierId}:${item.id}`;
            const u = parseCurrencyBR(unitPriceBySupplierItem[key] ?? '');
            if (u == null || u < 0) continue; // se vazio, não conta para vitória
            unitPricesPayload.push({
              supplierId,
              materialRequestItemId: item.id,
              unitPrice: u
            });
          }
        }

        const itemQuantitiesForSave: Record<string, number> = {};
        for (const it of selectedRequest.items) {
          const maxQ = Number(it.quantity);
          const q = ocItemQtyByItemId[it.id] ?? maxQ;
          itemQuantitiesForSave[it.id] = Math.min(Math.max(q, 0.0001), maxQ);
        }

        await api.put(`/quote-maps/${mapId}/quotes`, {
          supplierIds: selectedSupplierIdsArr,
          freightBySupplier: freightBySupplierPayload,
          unitPrices: unitPricesPayload,
          itemQuantities: itemQuantitiesForSave
        });

        // 3) Preparar pagamento somente para fornecedores marcados para gerar OC
        const paymentBySupplierPayload: Array<{
          supplierId: string;
          paymentType: string;
          paymentCondition: string;
          paymentDetails?: string;
          observations?: string;
          amountToPay?: number;
        }> = [];

        for (const supplierId of Array.from(generateSupplierIds)) {
          const totals = computedSupplierTotals[supplierId];
          const fallbackDraft = {
            paymentType: OC_TYPE_AVISTA,
            paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
            paymentDetails: '',
            observations: '',
            amountToPayStr: totals ? String(totals.amountToPay) : ''
          };

          const draft = paymentDraftBySupplier[supplierId] ?? fallbackDraft;
          const paymentType = draft.paymentType ?? OC_TYPE_AVISTA;
          const paymentCondition = draft.paymentCondition ?? paymentConditionDefault(paymentType);

          paymentBySupplierPayload.push({
            supplierId,
            paymentType,
            paymentCondition,
            paymentDetails: draft.paymentDetails?.trim() || undefined,
            observations: draft.observations?.trim() || undefined,
            amountToPay: totals?.amountToPay
          });
        }

        // 4) Gerar as OCs no backend
        const result = await api.post(`/quote-maps/${mapId}/generate`, {
          generateSupplierIds: Array.from(generateSupplierIds),
          paymentBySupplier: paymentBySupplierPayload,
          itemQuantities: itemQuantitiesForSave
        });

        return result.data;
      } finally {
        setIsGenerating(false);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      toast.success('Mapa gerado e OCs criadas com sucesso!');
      router.push('/ponto/ordem-de-compra');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error?.message || 'Erro ao gerar OCs');
    }
  });

  if (loadingUser || loadingRequests || loadingSuppliers || loadingOrders) {
    return (
      <Loading
        message="Carregando mapa de cotação..."
        fullScreen
        size="lg"
      />
    );
  }

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  return (
    <ProtectedRoute route="/ponto/mapa-cotacao">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Mapa de Cotação
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Compare preços por item entre fornecedores e gere OCs por vencedor.
            </p>
          </div>

          <Card>
            <CardHeader className="border-b-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <Truck className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">RMs aprovadas</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Selecione uma requisição na fase RMs aprovadas para montar o mapa.
                    </p>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Requisição de Material *
                  </label>
                  <select
                    value={selectedRequestId}
                    onChange={(e) => setSelectedRequestId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Selecione uma requisição (RMs aprovadas)</option>
                    {approvedRequests.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.requestNumber || r.id.slice(0, 8)} ({formatDateTimeBR(r.createdAt)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Fornecedores (comparação) *
                  </label>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="min-w-0 flex flex-col gap-2">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
                        <input
                          type="search"
                          value={supplierSearch}
                          onChange={(e) => setSupplierSearch(e.target.value)}
                          placeholder="Buscar por nome ou código..."
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoComplete="off"
                        />
                      </div>
                      <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 max-h-[260px] overflow-y-auto">
                        {suppliers.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum fornecedor cadastrado.</p>
                        ) : filteredSuppliers.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Nenhum fornecedor encontrado para &quot;{supplierSearch.trim()}&quot;.
                          </p>
                        ) : (
                          filteredSuppliers.map((s) => (
                            <label
                              key={s.id}
                              className="flex items-start gap-2 py-1.5 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 shrink-0 rounded border-gray-300 dark:border-gray-600"
                                checked={selectedSupplierIds.has(s.id)}
                                onChange={() => {
                                  setSelectedSupplierIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(s.id)) next.delete(s.id);
                                    else next.add(s.id);
                                    return next;
                                  });
                                }}
                              />
                              <span className="min-w-0">
                                <span className="block truncate font-medium">{s.name}</span>
                                {s.code ? (
                                  <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                                    Cód. {s.code}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="min-w-0 flex flex-col gap-2">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Selecionados{' '}
                        <span className="font-normal text-gray-500 dark:text-gray-400">
                          ({selectedSuppliersOrdered.length})
                        </span>
                      </p>
                      <div className="border border-gray-200 dark:border-gray-600 rounded-lg p-3 max-h-[304px] overflow-y-auto bg-gray-50/50 dark:bg-gray-900/30">
                        {selectedSuppliersOrdered.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Nenhum fornecedor selecionado. Marque na lista ao lado.
                          </p>
                        ) : (
                          <ul className="space-y-2">
                            {selectedSuppliersOrdered.map((s) => (
                              <li
                                key={s.id}
                                className="flex items-start justify-between gap-2 rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1.5 text-sm"
                              >
                                <span className="min-w-0">
                                  <span className="block text-gray-900 dark:text-gray-100 truncate">{s.name}</span>
                                  {s.code ? (
                                    <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">
                                      {s.code}
                                    </span>
                                  ) : null}
                                </span>
                                <button
                                  type="button"
                                  title="Remover da comparação"
                                  className="shrink-0 p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                                  onClick={() => {
                                    setSelectedSupplierIds((prev) => {
                                      const next = new Set(prev);
                                      next.delete(s.id);
                                      return next;
                                    });
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {!selectedRequest && (
                <div className="p-4 pt-0">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Escolha uma requisição na fase RMs aprovadas para liberar a tela de cotação.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {selectedRequest && (
            <>
              <Card>
                <CardHeader className="border-b-0">
                  <div className="flex items-center gap-3">
                    <div className="p-2 sm:p-3 bg-green-100 dark:bg-green-900/30 rounded-lg flex-shrink-0">
                      <FileText className="w-6 h-6 text-green-700 dark:text-green-400" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cotações por item</h2>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Informe o preço unitário por fornecedor. Ajuste a quantidade a comprar por item (não pode exceder o solicitado na SC). O total e o vencedor são recalculados automaticamente.
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {selectedSupplierIds.size === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">Selecione pelo menos um fornecedor.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr className="text-left">
                              <th className="p-2 whitespace-nowrap">Item (SC)</th>
                              {Array.from(selectedSupplierIds).map((supplierId) => {
                                const sup = suppliers.find((x) => x.id === supplierId);
                                return (
                                  <th key={supplierId} className="p-2 whitespace-nowrap">
                                    <div className="font-medium text-gray-900 dark:text-gray-100">
                                      {sup ? sup.name : supplierId}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      Frete:
                                    </div>
                                    <input
                                      type="text"
                                      value={freightBySupplier[supplierId] ?? ''}
                                      onChange={(e) => {
                                        setFreightBySupplier((prev) => ({ ...prev, [supplierId]: e.target.value }));
                                      }}
                                      onBlur={() => {
                                        const raw = freightBySupplier[supplierId] ?? '';
                                        const formatted = formatCurrencyInputValue(raw);
                                        setFreightBySupplier((prev) => ({ ...prev, [supplierId]: formatted }));
                                      }}
                                      placeholder="0,00"
                                      className="mt-1 w-24 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                  </th>
                                );
                              })}
                              <th className="p-2 whitespace-nowrap">Vencedor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
                            {ocItems.map((item) => {
                              const winner = winnersByItem.find((w) => w.itemId === item.id) || null;
                              const winnerSupplier = suppliers.find((s) => s.id === winner?.winnerSupplierId);

                              const unitLabel = item.unit || '-';
                              const maxQty = Number(item.quantity);
                              const qty = ocItemQtyByItemId[item.id] ?? maxQty;
                              const matSub = materialItemSubtitle(item);

                              return (
                                <tr key={item.id} className="align-top">
                                  <td className="p-2 min-w-[260px]">
                                    <div className="font-medium text-gray-900 dark:text-gray-100">
                                      {materialItemLabel(item)}
                                    </div>
                                    {matSub ? (
                                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                        {matSub}
                                      </div>
                                    ) : null}
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                      <span>
                                        Solicitado na SC: {maxQty} {unitLabel}
                                      </span>
                                      <span className="text-gray-500">|</span>
                                      <label className="inline-flex items-center gap-1">
                                        <span className="whitespace-nowrap">Qtd. na OC:</span>
                                        <input
                                          type="number"
                                          min={0.0001}
                                          step="any"
                                          max={maxQty}
                                          value={qty}
                                          onChange={(e) => {
                                            const n = parseFloat(e.target.value);
                                            if (Number.isNaN(n)) return;
                                            const q = Math.min(Math.max(n, 0.0001), maxQty);
                                            setOcItemQtyByItemId((prev) => ({ ...prev, [item.id]: q }));
                                          }}
                                          className="w-20 px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                        />
                                        <span>{unitLabel}</span>
                                      </label>
                                    </div>
                                  </td>

                                  {Array.from(selectedSupplierIds).map((supplierId) => {
                                    const key = `${supplierId}:${item.id}`;
                                    const unitPriceStr = unitPriceBySupplierItem[key] ?? '';
                                    const unitPrice = parseCurrencyBR(unitPriceStr);
                                    const freightRaw = freightBySupplier[supplierId] ?? '';
                                    const freightParsed = parseCurrencyBR(freightRaw);
                                    const freight = freightParsed ?? 0;
                                    const itemTotal = unitPrice == null ? null : unitPrice * qty;
                                    const score = unitPrice == null ? null : itemTotal! + freight;
                                    const isWinner = winner?.winnerSupplierId === supplierId;

                                    return (
                                      <td key={supplierId} className="p-2 whitespace-nowrap">
                                        <input
                                          type="text"
                                          value={unitPriceStr}
                                          onChange={(e) => {
                                            setUnitPriceBySupplierItem((prev) => ({
                                              ...prev,
                                              [key]: e.target.value
                                            }));
                                          }}
                                          onBlur={() => {
                                            const raw = unitPriceBySupplierItem[key] ?? '';
                                            const formatted = formatCurrencyInputValue(raw);
                                            setUnitPriceBySupplierItem((prev) => ({ ...prev, [key]: formatted }));
                                          }}
                                          placeholder="0,00"
                                          className={`w-28 px-2 py-1 border rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                            isWinner
                                              ? 'border-green-500 ring-1 ring-green-200 dark:ring-green-400'
                                              : 'border-gray-300 dark:border-gray-600'
                                          }`}
                                        />
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                                          Total do item: {itemTotal == null ? '-' : formatCurrencyBR(itemTotal)}
                                        </div>
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                          Frete (fornecedor): {freightParsed == null ? '-' : formatCurrencyBR(freight)}
                                        </div>
                                        <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                          Custo p/ vencer: {score == null ? '-' : formatCurrencyBR(score)}
                                        </div>
                                      </td>
                                    );
                                  })}

                                  <td className="p-2 whitespace-nowrap align-top">
                                    {winnerSupplier && winner ? (
                                      <div className="flex flex-col gap-1 items-start">
                                        <span className="inline-flex items-center gap-2 px-2 py-1 rounded bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs font-medium">
                                          {winnerSupplier.name} (ganhou)
                                        </span>
                                        {winner.technicalTie ? (
                                          <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                            Empate Técnico
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="mt-4">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                          Fornecedores vencedores (para gerar OC)
                        </h3>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          {Array.from(selectedSupplierIds)
                            .filter((sid) => (wonItemsBySupplier[sid] ?? []).length > 0)
                            .map((sid) => {
                              const sup = suppliers.find((s) => s.id === sid);
                              const itemsWon = wonItemsBySupplier[sid] ?? [];
                              const totals = computedSupplierTotals[sid];

                              return (
                                <div key={sid} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                        {sup ? sup.name : sid}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        Frete: {totals ? formatCurrencyBR(totals.freight) : '—'} | Total itens: {totals ? formatCurrencyBR(totals.itemsTotal) : '—'}
                                      </p>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                      <input
                                        type="checkbox"
                                        checked={generateSupplierIds.has(sid)}
                                        onChange={() => {
                                          setGenerateSupplierIds((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(sid)) next.delete(sid);
                                            else next.add(sid);
                                            return next;
                                          });
                                        }}
                                      />
                                      Gerar OC
                                    </label>
                                  </div>

                                  <div className="mt-3">
                                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                                      Itens da SC (nesta OC):
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                      Mesmo formato da criação manual de OC: quantidade e valor unitário valem também na
                                      tabela acima.
                                    </p>
                                    <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                                      <ul className="divide-y divide-gray-200 dark:divide-gray-600">
                                        {itemsWon.map((item) => {
                                          const unitLabel = item.unit || '-';
                                          const maxQty = Number(item.quantity);
                                          const qty = ocItemQtyByItemId[item.id] ?? maxQty;
                                          const priceKey = `${sid}:${item.id}`;
                                          const unitPriceStr = unitPriceBySupplierItem[priceKey] ?? '';
                                          const sub = materialItemSubtitle(item);
                                          return (
                                            <li key={item.id} className="px-3 py-2 flex items-start gap-3">
                                              <div className="min-w-0 flex-1">
                                                <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                                                  {materialItemLabel(item)}
                                                </p>
                                                {sub ? (
                                                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                                                    {sub}
                                                  </p>
                                                ) : null}
                                                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                                                  <span>
                                                    Solicitado na SC: {maxQty} {unitLabel}
                                                  </span>
                                                  <span className="text-gray-400">|</span>
                                                  <label className="inline-flex items-center gap-1.5">
                                                    <span className="whitespace-nowrap">Qtd. na OC:</span>
                                                    <input
                                                      type="number"
                                                      min={0.0001}
                                                      step="any"
                                                      max={maxQty}
                                                      value={qty}
                                                      onChange={(e) => {
                                                        const n = parseFloat(e.target.value);
                                                        if (Number.isNaN(n)) return;
                                                        const q = Math.min(Math.max(n, 0.0001), maxQty);
                                                        setOcItemQtyByItemId((prev) => ({ ...prev, [item.id]: q }));
                                                      }}
                                                      className="w-24 px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                    />
                                                    <span>{unitLabel}</span>
                                                  </label>
                                                  <span className="text-gray-400">|</span>
                                                  <label className="inline-flex items-center gap-1.5">
                                                    <span className="whitespace-nowrap">Valor unit. (R$):</span>
                                                    <input
                                                      type="text"
                                                      inputMode="decimal"
                                                      placeholder="0,00"
                                                      value={unitPriceStr}
                                                      onChange={(e) => {
                                                        setUnitPriceBySupplierItem((prev) => ({
                                                          ...prev,
                                                          [priceKey]: e.target.value
                                                        }));
                                                      }}
                                                      onBlur={() => {
                                                        const raw = unitPriceBySupplierItem[priceKey] ?? '';
                                                        const formatted = formatCurrencyInputValue(raw);
                                                        setUnitPriceBySupplierItem((prev) => ({
                                                          ...prev,
                                                          [priceKey]: formatted
                                                        }));
                                                      }}
                                                      className="w-28 px-2 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                                    />
                                                  </label>
                                                </div>
                                              </div>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    </div>
                                  </div>

                                  {generateSupplierIds.has(sid) && (
                                    <div className="mt-4 border-t border-gray-200 dark:border-gray-600 pt-4 space-y-3">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div>
                                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo de pagamento</p>
                                          <div className="flex flex-wrap gap-4">
                                            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`payType-${sid}`}
                                                checked={(paymentDraftBySupplier[sid]?.paymentType ?? OC_TYPE_AVISTA) === OC_TYPE_AVISTA}
                                                onChange={() => {
                                                  setPaymentDraftBySupplier((prev) => ({
                                                    ...prev,
                                                    [sid]: {
                                                      ...(prev[sid] ?? {}),
                                                      paymentType: OC_TYPE_AVISTA,
                                                      paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA)
                                                    }
                                                  }));
                                                }}
                                              />
                                              À vista
                                            </label>
                                            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                              <input
                                                type="radio"
                                                name={`payType-${sid}`}
                                                checked={(paymentDraftBySupplier[sid]?.paymentType ?? OC_TYPE_AVISTA) === OC_TYPE_BOLETO}
                                                onChange={() => {
                                                  setPaymentDraftBySupplier((prev) => ({
                                                    ...prev,
                                                    [sid]: {
                                                      ...(prev[sid] ?? {}),
                                                      paymentType: OC_TYPE_BOLETO,
                                                      paymentCondition: paymentConditionDefault(OC_TYPE_BOLETO)
                                                    }
                                                  }));
                                                }}
                                              />
                                              Boleto
                                            </label>
                                          </div>
                                        </div>

                                        <div>
                                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Condição</p>
                                          <PaymentConditionSelect
                                            key={`pc-${sid}-${paymentDraftBySupplier[sid]?.paymentType ?? OC_TYPE_AVISTA}`}
                                            paymentType={
                                              (paymentDraftBySupplier[sid]?.paymentType ?? OC_TYPE_AVISTA) === OC_TYPE_AVISTA
                                                ? 'AVISTA'
                                                : 'BOLETO'
                                            }
                                            value={
                                              paymentDraftBySupplier[sid]?.paymentCondition ??
                                              paymentConditionDefault(paymentDraftBySupplier[sid]?.paymentType ?? OC_TYPE_AVISTA)
                                            }
                                            onChange={(v) => {
                                              setPaymentDraftBySupplier((prev) => ({
                                                ...prev,
                                                [sid]: {
                                                  ...(prev[sid] ?? {
                                                    paymentType: OC_TYPE_AVISTA,
                                                    paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
                                                    paymentDetails: '',
                                                    observations: '',
                                                    amountToPayStr: ''
                                                  }),
                                                  paymentCondition: v
                                                }
                                              }));
                                            }}
                                            disabled={(paymentDraftBySupplier[sid]?.paymentType ?? OC_TYPE_AVISTA) === OC_TYPE_AVISTA}
                                          />
                                        </div>
                                      </div>

                                      <div>
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                          Valor total (R$)
                                        </p>
                                        <input
                                          type="text"
                                          value={(() => {
                                            const s = paymentDraftBySupplier[sid]?.amountToPayStr;
                                            if (s !== undefined && s !== '') return s;
                                            return totals ? formatCurrencyBR(totals.amountToPay) : '';
                                          })()}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setPaymentDraftBySupplier((prev) => ({
                                              ...prev,
                                              [sid]: {
                                                ...(prev[sid] ?? {
                                                  paymentType: OC_TYPE_AVISTA,
                                                  paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
                                                  paymentDetails: '',
                                                  observations: '',
                                                  amountToPayStr: ''
                                                }),
                                                amountToPayStr: v
                                              }
                                            }));
                                          }}
                                          onBlur={() => {
                                            const raw = paymentDraftBySupplier[sid]?.amountToPayStr ?? (totals ? String(totals.amountToPay) : '');
                                            const formatted = formatCurrencyInputValue(raw);
                                            setPaymentDraftBySupplier((prev) => ({
                                              ...prev,
                                              [sid]: {
                                                ...(prev[sid] ?? {
                                                  paymentType: OC_TYPE_AVISTA,
                                                  paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
                                                  paymentDetails: '',
                                                  observations: '',
                                                  amountToPayStr: ''
                                                }),
                                                amountToPayStr: formatted
                                              }
                                            }));
                                          }}
                                          placeholder="0,00"
                                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        />
                                      </div>

                                      <div>
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                          Dados do pagamento
                                        </p>
                                        <textarea
                                          value={paymentDraftBySupplier[sid]?.paymentDetails ?? ''}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setPaymentDraftBySupplier((prev) => ({
                                              ...prev,
                                              [sid]: {
                                                ...(prev[sid] ?? {
                                                  paymentType: OC_TYPE_AVISTA,
                                                  paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
                                                  paymentDetails: '',
                                                  observations: '',
                                                  amountToPayStr: ''
                                                }),
                                                paymentDetails: v
                                              }
                                            }));
                                          }}
                                          rows={3}
                                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          placeholder="Conta, PIX, agência, favorecido, etc."
                                        />
                                      </div>

                                      <div>
                                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                          Observações
                                        </p>
                                        <textarea
                                          value={paymentDraftBySupplier[sid]?.observations ?? ''}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setPaymentDraftBySupplier((prev) => ({
                                              ...prev,
                                              [sid]: {
                                                ...(prev[sid] ?? {
                                                  paymentType: OC_TYPE_AVISTA,
                                                  paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
                                                  paymentDetails: '',
                                                  observations: '',
                                                  amountToPayStr: ''
                                                }),
                                                observations: v
                                              }
                                            }));
                                          }}
                                          rows={2}
                                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                          placeholder="Observações gerais da OC"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>

                      <div className="flex justify-end gap-3 mt-6">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRequestId('');
                            setQuoteMapId('');
                            setSupplierSearch('');
                            setSelectedSupplierIds(new Set());
                            setGenerateSupplierIds(new Set());
                            setFreightBySupplier({});
                            setUnitPriceBySupplierItem({});
                            setPaymentDraftBySupplier({});
                          }}
                          className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                        >
                          Limpar
                        </button>
                        <button
                          type="button"
                          disabled={generateSupplierIds.size === 0 || isGenerating}
                          onClick={() => generateOrdersMutation.mutate()}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                        >
                          {isGenerating ? 'Gerando...' : 'Gerar OCs vencedoras'}
                        </button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}

