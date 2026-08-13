'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, RotateCcw, Truck, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PaymentConditionSelect, type PaymentConditionRow } from '@/components/oc/PaymentConditionSelect';
import { OC_PIX_KEY_TYPE_OPTIONS } from '@/components/oc/OcPurchaseOrderFormFields';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import {
  FinancialControlAttachmentsField,
  uploadNamedAttachments,
} from '@/components/financeiro/FinancialControlAttachmentsField';
import { MultiSelectSearchDropdown } from '@/components/ui/MultiSelectSearchDropdown';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { getListTableRowClassName } from '@/components/ui/listTableUi';
import { maskCurrencyInputBrOrEmpty, parseCurrencyInputBr } from '@/lib/maskCurrencyBr';
import {
  materialItemLabel,
  rmContractDisplay,
  rmOsDisplay,
  rmSolicitante,
} from '../gerenciar-materiais/_lib/display';
import { formatRmListDisplayId } from '../gerenciar-materiais/_lib/rmListDisplay';
import type { MaterialRequest as MaterialRequestBase } from '../gerenciar-materiais/_lib/types';
import {
  getCoveredRmItemIdsFromOrders,
  getOpenRmItemIds,
  rmHasOpenItemsForProcurement,
} from '@/lib/rmProcurementCoverage';

type MaterialRequestItem = {
  id: string;
  quantity: number;
  unit: string;
  observation?: string;
  notes?: string;
  /** Referência da RM (quanto deveria pagar) — só exibição no mapa, não vai pra OC. */
  unitPrice?: number | null;
  totalPrice?: number | null;
  avgPaidUnitPrice?: number | null;
  material: {
    id: string;
    name?: string | null;
    code?: string;
    sinapiCode?: string | null;
    description?: string;
    avgPaidUnitPrice?: number | null;
  };
};

function itemAvgPaidUnitPrice(item: MaterialRequestItem): number | null {
  const raw = item.avgPaidUnitPrice ?? item.material?.avgPaidUnitPrice ?? null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Valor unitário de referência da RM (média como padrão; pode ter sido alterado na solicitação). */
function itemReferenceUnitPrice(item: MaterialRequestItem): number | null {
  if (item.unitPrice != null && item.unitPrice !== undefined) {
    const fromRm = Number(item.unitPrice);
    if (Number.isFinite(fromRm) && fromRm >= 0) return Math.round(fromRm * 100) / 100;
  }
  return itemAvgPaidUnitPrice(item);
}

type MaterialRequest = MaterialRequestBase & {
  status: 'APPROVED' | string;
  items: MaterialRequestItem[];
};

type PurchaseOrderLite = {
  status?: string;
  materialRequestId?: string;
  materialRequest?: { id?: string };
  supplierId?: string;
  supplier?: { id?: string };
  items?: Array<{ materialRequestItemId?: string | null }>;
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

function parseMapUnitPrice(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  const fromMask = parseCurrencyInputBr(t);
  if (fromMask !== null) return fromMask;
  return parseCurrencyBR(t);
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

const mapFieldCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums text-gray-900 placeholder:text-gray-400 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';

const mapClickDisplayCls =
  'mx-auto inline-flex h-8 min-w-[4.5rem] max-w-[8rem] items-center justify-center rounded-lg px-2 text-center text-sm font-medium tabular-nums text-gray-900 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:text-gray-100 dark:hover:bg-gray-700/60';

const mapClickInputCls = `${mapFieldCls} mx-auto block max-w-[8rem] text-center`;

function MapFreightCell({
  value,
  onChange,
  ariaLabel,
  borderClassName = '',
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  borderClassName?: string;
}) {
  const amount = parseMapUnitPrice(value);
  const isEmpty = amount == null;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const showInput = isEmpty || editing;

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = (next = draft) => {
    onChange(next);
    setEditing(false);
  };

  const fillCls =
    'absolute inset-0 flex flex-col items-center justify-center px-2 bg-transparent';

  return (
    <td className={`relative h-px p-0 align-middle ${borderClassName}`}>
      {showInput ? (
        <div className={fillCls}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            aria-label={ariaLabel}
            value={draft}
            placeholder="R$ 0,00"
            onChange={(e) => setDraft(maskCurrencyInputBrOrEmpty(e.target.value))}
            onBlur={() => commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(value);
                setEditing(false);
              }
            }}
            className={mapClickInputCls}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`${fillCls} text-sm font-medium tabular-nums text-gray-900 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500 dark:text-gray-100 dark:hover:bg-gray-700/40`}
          aria-label={ariaLabel}
          title="Clique para editar"
        >
          {formatCurrencyBR(amount!)}
        </button>
      )}
    </td>
  );
}

function MapSupplierPriceCell({
  value,
  onChange,
  ariaLabel,
  isWinner,
  quantity,
  borderClassName = '',
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  isWinner: boolean;
  quantity: number;
  borderClassName?: string;
}) {
  const unitPrice = parseMapUnitPrice(value);
  const isEmpty = unitPrice == null;
  const itemTotal = unitPrice == null ? null : unitPrice * quantity;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const showInput = isEmpty || editing;

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (!showInput) return;
    if (!editing && isEmpty) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing, showInput, isEmpty]);

  const commit = (next = draft) => {
    onChange(next);
    setEditing(false);
  };

  const totalCls = isWinner
    ? 'text-xs font-medium tabular-nums text-emerald-600 dark:text-emerald-400/90'
    : 'text-xs tabular-nums text-gray-500 dark:text-gray-400';
  const unitCls = isWinner
    ? 'text-sm font-medium tabular-nums text-green-700 dark:text-green-300'
    : 'text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100';
  const fillCls = `absolute inset-0 flex flex-col items-center justify-center gap-1 px-2 ${
    isWinner ? 'bg-green-50 dark:bg-green-950/35' : 'bg-transparent'
  }`;

  return (
    <td
      className={`relative h-px p-0 align-middle ${borderClassName} ${
        isWinner ? 'bg-green-50 dark:bg-green-950/35' : ''
      }`}
    >
      {showInput ? (
        <div className={fillCls}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            aria-label={ariaLabel}
            value={draft}
            placeholder="R$ 0,00"
            onChange={(e) => setDraft(maskCurrencyInputBrOrEmpty(e.target.value))}
            onBlur={() => commit()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setDraft(value);
                setEditing(false);
              }
            }}
            className={`${mapClickInputCls} ${
              isWinner
                ? 'border-green-300 text-green-800 dark:border-green-700 dark:text-green-200'
                : ''
            }`}
          />
          {(() => {
            const draftPrice = parseMapUnitPrice(draft);
            if (draftPrice == null) return null;
            return (
              <p className={totalCls}>{formatCurrencyBR(draftPrice * quantity)}</p>
            );
          })()}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className={`${fillCls} transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-500 ${
            isWinner
              ? 'hover:bg-green-100/60 dark:hover:bg-green-900/40'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700/40'
          }`}
          aria-label={ariaLabel}
          title="Clique para editar"
        >
          <span className={unitCls}>
            {unitPrice == null ? '—' : formatCurrencyBR(unitPrice)}
          </span>
          <span className={totalCls}>
            {itemTotal == null ? '—' : formatCurrencyBR(itemTotal)}
          </span>
        </button>
      )}
    </td>
  );
}

function MapClickToEditNumber({
  value,
  min,
  max,
  onChange,
  ariaLabel,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
  ariaLabel: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  const commit = () => {
    const n = parseFloat(draft.replace(',', '.'));
    if (!Number.isNaN(n)) {
      onChange(Math.min(Math.max(n, min), max));
    }
    setEditing(false);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={mapClickDisplayCls}
        aria-label={ariaLabel}
        title="Clique para editar"
      >
        {value}
      </button>
    );
  }

  return (
    <input
      ref={inputRef}
      type="number"
      min={min}
      max={max}
      step="any"
      aria-label={ariaLabel}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(String(value));
          setEditing(false);
        }
      }}
      className={`${mapClickInputCls} [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
    />
  );
}

const mapPaymentSegmentCls = (active: boolean) =>
  `w-full rounded-lg border px-3 py-2.5 text-center text-sm font-medium transition-colors focus:outline-none ${
    active
      ? 'border-red-600 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950/40 dark:text-red-200'
      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/80'
  }`;

const mapLabelCls = 'mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300';

const OC_TYPE_AVISTA = 'AVISTA';
const OC_TYPE_BOLETO = 'BOLETO';

function paymentConditionDefault(paymentType: string): string {
  if (paymentType === OC_TYPE_AVISTA) return 'AVISTA';
  return 'BOLETO_30';
}

function maskCpfInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  return digits
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskCnpjInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

/** Celular BR: (DD) 9XXXX-XXXX */
function maskCelularInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 7) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function maskPixKeyByType(pixKeyType: string, raw: string): string {
  const type = pixKeyType.trim().toUpperCase();
  if (type === 'CPF') return maskCpfInput(raw);
  if (type === 'CNPJ') return maskCnpjInput(raw);
  if (type === 'CELULAR') return maskCelularInput(raw);
  return raw;
}

function pixKeyInputPlaceholder(pixKeyType: string): string {
  const type = pixKeyType.trim().toUpperCase();
  if (type === 'CPF') return '000.000.000-00';
  if (type === 'CNPJ') return '00.000.000/0001-00';
  if (type === 'CELULAR') return '(00) 90000-0000';
  return 'Informe a chave PIX';
}

function pixKeyInputMaxLength(pixKeyType: string): number | undefined {
  const type = pixKeyType.trim().toUpperCase();
  if (type === 'CPF') return 14;
  if (type === 'CNPJ') return 18;
  if (type === 'CELULAR') return 15;
  return undefined;
}

function emptyPaymentDraft() {
  return {
    paymentType: OC_TYPE_AVISTA,
    paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
    paymentDetails: '',
    pixKeyType: '',
    pixKey: '',
    observations: '',
    amountToPayStr: '',
    attachments: [] as Array<{ url: string; name: string }>,
  };
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
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<Set<string>>(new Set());
  const [freightBySupplier, setFreightBySupplier] = useState<Record<string, string>>({});
  const [unitPriceBySupplierItem, setUnitPriceBySupplierItem] = useState<Record<string, string>>({});

  const [quoteMapId, setQuoteMapId] = useState<string>('');

  const [ocModalSupplierId, setOcModalSupplierId] = useState<string | null>(null);
  /** Fornecedores cuja OC acabou de ser gerada nesta sessão (antes do refetch das OCs) */
  const [generatedOcSupplierIds, setGeneratedOcSupplierIds] = useState<Set<string>>(new Set());

  /** Quantidade a comprar na OC por item da SC (≤ solicitado na SC). Afeta totais e vencedor. */
  const [ocItemQtyByItemId, setOcItemQtyByItemId] = useState<Record<string, number>>({});

  /** Nome/detalhe do item para o fornecedor (`supplierId:itemId`). Vai para notes do item da OC. */
  const [supplierItemDetailByKey, setSupplierItemDetailByKey] = useState<Record<string, string>>({});

  const [paymentDraftBySupplier, setPaymentDraftBySupplier] = useState<
    Record<
      string,
      {
        paymentType: string;
        paymentCondition: string;
        paymentDetails: string;
        pixKeyType: string;
        pixKey: string;
        observations: string;
        amountToPayStr: string;
        attachments: Array<{ url: string; name: string }>;
      }
    >
  >({});
  const [uploadingOcAttachments, setUploadingOcAttachments] = useState(false);

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
      const res = await api.get('/material-requests', {
        params: { status: 'APPROVED', limit: 200, summary: '1' },
      });
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: ordersData } = useQuery({
    queryKey: ['purchase-orders', 'list-summary'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500, summary: '1' } });
      return res.data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const { data: boletoPaymentConditions } = useQuery({
    queryKey: ['payment-conditions', 'BOLETO'],
    queryFn: async () => {
      const res = await api.get('/payment-conditions', {
        params: { paymentType: 'BOLETO', activeOnly: 'true' }
      });
      return (res.data?.data || []) as PaymentConditionRow[];
    }
  });

  const allOrders: PurchaseOrderLite[] = ordersData?.data || [];

  const rawApprovedRequestsForCoverage: MaterialRequest[] =
    requestsData?.data?.requests || requestsData?.data || [];

  /** RMs cujos itens já estão todos cobertos por OC ativa (não entram no seletor). */
  const materialRequestIdsFullyCovered = useMemo(() => {
    const ordersByRm = new Map<string, PurchaseOrderLite[]>();
    for (const o of allOrders) {
      const mid = o.materialRequestId ?? o.materialRequest?.id;
      if (!mid) continue;
      const list = ordersByRm.get(mid) ?? [];
      list.push(o);
      ordersByRm.set(mid, list);
    }
    const s = new Set<string>();
    for (const r of rawApprovedRequestsForCoverage) {
      if (r.status !== 'APPROVED') continue;
      const orders = ordersByRm.get(r.id) ?? [];
      if (orders.length === 0) continue;
      if (!rmHasOpenItemsForProcurement(r, orders)) s.add(r.id);
    }
    return s;
  }, [allOrders, rawApprovedRequestsForCoverage]);

  const rawApprovedRequests: MaterialRequest[] = rawApprovedRequestsForCoverage;

  /**
   * Lista elegível: RMs aprovadas com itens ainda sem OC ativa.
   * Mantém a RM selecionada mesmo após a 1ª OC, para permitir gerar OC dos demais fornecedores vencedores.
   */
  const approvedRequests = useMemo(
    () =>
      rawApprovedRequests.filter(
        (r) =>
          r.status === 'APPROVED' &&
          (r.id === selectedRequestId || !materialRequestIdsFullyCovered.has(r.id))
      ),
    [rawApprovedRequests, materialRequestIdsFullyCovered, selectedRequestId]
  );

  const materialRequestOptions = useMemo(() => {
    const ordersByRm = new Map<string, PurchaseOrderLite[]>();
    for (const o of allOrders) {
      const mid = o.materialRequestId ?? o.materialRequest?.id;
      if (!mid) continue;
      const list = ordersByRm.get(mid) ?? [];
      list.push(o);
      ordersByRm.set(mid, list);
    }

    return approvedRequests.map((r) => {
      const rm = formatRmListDisplayId(r.requestNumber) || r.id.slice(0, 8);
      const os = rmOsDisplay(r);
      const contract = rmContractDisplay(r);
      const solicitante = rmSolicitante(r)?.name?.trim() || '';
      const costCenter = r.costCenter?.name?.trim() || '';
      const date = r.createdAt ? formatDateTimeBR(r.createdAt) : '';
      const orders = ordersByRm.get(r.id) ?? [];
      const summaryItemCount = (r as unknown as { _count?: { items?: number } })._count?.items;

      const totalCount =
        Array.isArray(r.items) && r.items.length > 0
          ? r.items.length
          : typeof summaryItemCount === 'number'
            ? summaryItemCount
            : null;

      let pendingCount: number | null = null;
      if (Array.isArray(r.items) && r.items.length > 0) {
        pendingCount = getOpenRmItemIds(r, orders).length;
      } else if (typeof summaryItemCount === 'number') {
        const covered = getCoveredRmItemIdsFromOrders(orders).size;
        pendingCount = Math.max(0, summaryItemCount - covered);
      }

      let qtyText: string | null = null;
      if (totalCount != null && pendingCount != null) {
        qtyText = `${totalCount} ${totalCount === 1 ? 'item' : 'itens'} · ${pendingCount} pendente${
          pendingCount === 1 ? '' : 's'
        }`;
      } else if (pendingCount != null) {
        qtyText = `${pendingCount} ${pendingCount === 1 ? 'item pendente' : 'itens pendentes'}`;
      } else if (totalCount != null) {
        qtyText = `${totalCount} ${totalCount === 1 ? 'item' : 'itens'}`;
      }
      const peopleDateLine = [solicitante || null, date || null]
        .filter(Boolean)
        .join(' - ');

      return {
        value: r.id,
        label: contract !== '—' ? `RM ${rm} - ${contract}` : `RM ${rm}`,
        description:
          [qtyText, peopleDateLine || null].filter(Boolean).join('\n') || undefined,
        searchText: [
          rm,
          os,
          contract,
          solicitante,
          costCenter,
          date,
          r.description,
          r.id,
        ]
          .filter(Boolean)
          .join(' '),
      };
    });
  }, [approvedRequests, allOrders]);

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-map'],
    queryFn: async () => {
      const res = await api.get('/suppliers', { params: { limit: 500 } });
      return res.data;
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const suppliers: Supplier[] = useMemo(
    () => (suppliersData?.data || []).filter((s: Supplier) => s.isActive),
    [suppliersData?.data]
  );

  const supplierOptions = useMemo(
    () =>
      suppliers.map((s) => ({
        value: s.id,
        label: s.code ? `${s.code} - ${s.name}` : s.name,
        searchText: `${s.code ?? ''} ${s.name}`,
      })),
    [suppliers]
  );

  const { data: selectedRequestFull, isLoading: loadingSelectedRequest } = useQuery({
    queryKey: ['material-request-detail', selectedRequestId],
    queryFn: async () => {
      const res = await api.get(`/material-requests/${selectedRequestId}`);
      return (res.data?.data ?? res.data) as MaterialRequest;
    },
    enabled: !!selectedRequestId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const selectedRequestRaw =
    selectedRequestFull?.id === selectedRequestId ? selectedRequestFull : null;

  const coveredItemIdsForSelected = useMemo(() => {
    if (!selectedRequestId) return new Set<string>();
    return getCoveredRmItemIdsFromOrders(
      allOrders.filter(
        (o) => (o.materialRequestId ?? o.materialRequest?.id) === selectedRequestId
      )
    );
  }, [allOrders, selectedRequestId]);

  /** Itens ainda sem OC ativa — mapa de cotação só trabalha com estes. */
  const selectedRequest = useMemo(() => {
    if (!selectedRequestRaw) return null;
    const openItems = (selectedRequestRaw.items ?? []).filter(
      (i) => !coveredItemIdsForSelected.has(i.id)
    );
    return { ...selectedRequestRaw, items: openItems };
  }, [selectedRequestRaw, coveredItemIdsForSelected]);

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
      Object.fromEntries((selectedRequest.items ?? []).map((i) => [i.id, Number(i.quantity)]))
    );
  }, [selectedRequest?.id]);

  // Só ao trocar a requisição (não incluir `suppliers` aqui: o array era recriado a cada render e limpava a seleção a cada clique).
  useEffect(() => {
    if (!selectedRequestId) return;
    setSelectedSupplierIds(new Set());
    setFreightBySupplier({});
    setUnitPriceBySupplierItem({});
    setSupplierItemDetailByKey({});
    setPaymentDraftBySupplier({});
    setOcModalSupplierId(null);
    setGeneratedOcSupplierIds(new Set());
  }, [selectedRequestId]);

  /** Se a cobertura mudou (ex.: item devolvido à RM), libera gerar OC de novo para o fornecedor. */
  const openItemIdsKey = useMemo(
    () =>
      (selectedRequest?.items ?? [])
        .map((i) => i.id)
        .sort()
        .join(','),
    [selectedRequest?.items]
  );

  useEffect(() => {
    setGeneratedOcSupplierIds(new Set());
  }, [openItemIdsKey]);

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
        const unitPrice = parseMapUnitPrice(unitPriceBySupplierItem[key] ?? '');
        const freight = parseMapUnitPrice(freightBySupplier[supplierId] ?? '') ?? 0;

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
      const freight = parseMapUnitPrice(freightBySupplier[supplierId] ?? '') ?? 0;
      const items = wonItemsBySupplier[supplierId] ?? [];
      let itemsTotal = 0;
      for (const item of items) {
        const key = `${supplierId}:${item.id}`;
        const unitPrice = parseMapUnitPrice(unitPriceBySupplierItem[key] ?? '');
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
    mutationFn: async (supplierId: string) => {
      if (!selectedRequest) throw new Error('Selecione uma requisição na fase RMs Aprovadas.');
      if (generatedOcSupplierIds.has(supplierId)) {
        throw new Error(
          'OC já gerada para este fornecedor neste mapa. Se devolveu um item à RM, recarregue ou monte a cotação de novo.'
        );
      }
      if ((wonItemsBySupplier[supplierId] ?? []).length === 0) {
        throw new Error('Este fornecedor não venceu nenhum item da cotação.');
      }
      const suppliersToGenerate = [supplierId];
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
        for (const sid of selectedSupplierIdsArr) {
          const rawFrete = freightBySupplier[sid] ?? '';
          const parsed = parseMapUnitPrice(rawFrete);
          // Campo vazio = sem frete (0), igual ao resumo exibido na tela
          const f = rawFrete.trim() === '' ? 0 : parsed;
          if (f == null || f < 0) {
            const nome = suppliers.find((s) => s.id === sid)?.name ?? 'fornecedor selecionado';
            throw new Error(
              `Frete inválido para "${nome}". Use um valor numérico válido (ex.: 0,00 ou 8,00).`
            );
          }
          freightBySupplierPayload[sid] = f;
        }

        const unitPricesPayload: Array<{
          supplierId: string;
          materialRequestItemId: string;
          unitPrice: number;
        }> = [];

        for (const sid of selectedSupplierIdsArr) {
          for (const item of selectedRequest.items) {
            const key = `${sid}:${item.id}`;
            const u = parseMapUnitPrice(unitPriceBySupplierItem[key] ?? '');
            if (u == null || u < 0) continue; // se vazio, não conta para vitória
            unitPricesPayload.push({
              supplierId: sid,
              materialRequestItemId: item.id,
              unitPrice: u,
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
          itemQuantities: itemQuantitiesForSave,
        });

        // 3) Preparar pagamento do fornecedor da modal
        const totals = computedSupplierTotals[supplierId];
        const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? 'fornecedor';
        const fallbackDraft = {
          paymentType: OC_TYPE_AVISTA,
          paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
          paymentDetails: '',
          pixKeyType: '',
          pixKey: '',
          observations: '',
          amountToPayStr: totals ? String(totals.amountToPay) : '',
          attachments: [],
        };

        const draft = paymentDraftBySupplier[supplierId] ?? fallbackDraft;
        const paymentType = draft.paymentType ?? OC_TYPE_AVISTA;
        const paymentCondition = draft.paymentCondition ?? paymentConditionDefault(paymentType);

        if (paymentType === OC_TYPE_AVISTA) {
          if (!draft.paymentDetails?.trim()) {
            throw new Error(`Informe os dados do pagamento para "${supplierName}".`);
          }
          if (!draft.pixKeyType?.trim()) {
            throw new Error(`Informe o tipo de chave PIX para "${supplierName}".`);
          }
          const pixKey = (draft.pixKey || '').trim();
          if (!pixKey) {
            throw new Error(`Informe a chave PIX para "${supplierName}".`);
          }
          const pixDigits = pixKey.replace(/\D/g, '');
          const pixType = draft.pixKeyType.trim().toUpperCase();
          if (pixType === 'CPF' && pixDigits.length !== 11) {
            throw new Error(
              `Chave PIX (CPF) inválida para "${supplierName}". Informe os 11 dígitos.`
            );
          }
          if (pixType === 'CNPJ' && pixDigits.length !== 14) {
            throw new Error(
              `Chave PIX (CNPJ) inválida para "${supplierName}". Informe os 14 dígitos.`
            );
          }
        }

        const paymentBySupplierPayload = [
          {
            supplierId,
            paymentType,
            paymentCondition,
            paymentDetails: draft.paymentDetails?.trim() || undefined,
            pixKeyType: paymentType === OC_TYPE_AVISTA ? draft.pixKeyType?.trim() || undefined : undefined,
            pixKey: paymentType === OC_TYPE_AVISTA ? draft.pixKey?.trim() || undefined : undefined,
            observations: draft.observations?.trim() || undefined,
            amountToPay: totals?.amountToPay,
            attachments: draft.attachments?.length ? draft.attachments : undefined,
          },
        ];

        // 4) Gerar a OC no backend
        const itemNotesBySupplierItem: Record<string, string> = {};
        const won = wonItemsBySupplier[supplierId] ?? [];
        for (const item of won) {
          const key = `${supplierId}:${item.id}`;
          const detail = (supplierItemDetailByKey[key] ?? '').trim();
          if (detail) itemNotesBySupplierItem[key] = detail;
        }

        const result = await api.post(`/quote-maps/${mapId}/generate`, {
          generateSupplierIds: suppliersToGenerate,
          paymentBySupplier: paymentBySupplierPayload,
          itemQuantities: itemQuantitiesForSave,
          itemNotesBySupplierItem,
        });

        return result.data;
      } finally {
        setIsGenerating(false);
      }
    },
    onSuccess: (_data, supplierId) => {
      setOcModalSupplierId(null);
      setGeneratedOcSupplierIds((prev) => {
        const next = new Set(prev);
        next.add(supplierId);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['material-requests-approved-map'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['material-request-detail'], refetchType: 'all' });
      toast.success('OC gerada com sucesso!');
    },
    onError: (error: any) => {
      const apiMsg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message;
      toast.error(apiMsg || 'Erro ao gerar OC', { duration: 8000 });
    },
  });

  if (loadingUser || loadingRequests) {
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
              Compare preços entre fornecedores e gere ordens de compra por vencedor.
            </p>
          </div>

          <Card>
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex-shrink-0 rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-950/40">
                    <Truck className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      RM's Aprovadas
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Escolha a requisição e os fornecedores para montar o mapa
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRequestId('');
                      setQuoteMapId('');
                      setSelectedSupplierIds(new Set());
                      setOcModalSupplierId(null);
                      setFreightBySupplier({});
                      setUnitPriceBySupplierItem({});
                      setSupplierItemDetailByKey({});
                      setPaymentDraftBySupplier({});
                    }}
                    title="Limpar"
                    aria-label="Limpar seleção"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-4">
              {approvedRequests.length === 0 ? (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/80 px-6 py-12 text-center dark:border-gray-600 dark:bg-gray-900/30">
                  <Truck className="mx-auto mb-3 h-10 w-10 text-gray-400 dark:text-gray-500" />
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nenhuma requisição em RMs Aprovadas aguardando cotação
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
                  <div className="min-w-0">
                    <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Requisição de Material *
                    </label>
                    <SingleSelectSearchDropdown
                      value={selectedRequestId}
                      onChange={setSelectedRequestId}
                      options={materialRequestOptions}
                      allowEmpty={false}
                      placeholder="Selecione uma requisição (RMs Aprovadas)"
                      searchPlaceholder="Pesquisar..."
                      emptyOptionsMessage="Nenhuma requisição disponível."
                      emptySearchMessage="Nenhuma requisição encontrada."
                      listMaxHeight={320}
                      noFocusRing
                      hideFocus
                    />
                  </div>
                  <div className="min-w-0">
                    <MultiSelectSearchDropdown
                      label="Fornecedores"
                      options={supplierOptions}
                      selected={Array.from(selectedSupplierIds)}
                      onChange={(ids) => setSelectedSupplierIds(new Set(ids))}
                      placeholder="Selecione fornecedores para comparar..."
                      searchPlaceholder="Pesquisar..."
                      emptyOptionsMessage="Nenhum fornecedor cadastrado."
                      emptySearchMessage="Nenhum fornecedor encontrado."
                      listMaxHeight={280}
                      noFocusRing
                      hideFocus
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

              <Card className={cadastroListClasses.card}>
                <CardHeader className={cadastroListClasses.cardHeader}>
                  <div className={cadastroListClasses.cardHeaderRow}>
                    <div className={cadastroListClasses.cardHeaderIconRow}>
                      <div className="flex-shrink-0 rounded-lg bg-green-100 p-2 sm:p-3 dark:bg-green-900/30">
                        <FileSpreadsheet className="h-5 w-5 text-green-700 sm:h-6 sm:w-6 dark:text-green-400" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Cotações
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Preços, quantidades e vencedor por item da SC
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {!selectedRequestId ? (
                    <div className="py-8 text-center">
                      <FileSpreadsheet className="mx-auto mb-4 h-12 w-12 text-gray-400 dark:text-gray-500" />
                      <p className="text-gray-500 dark:text-gray-400">Lista de cotações vazia</p>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Escolha uma requisição de Material acima para ver os itens.
                      </p>
                    </div>
                  ) : loadingSelectedRequest || !selectedRequest ? (
                    <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-500 dark:text-gray-400">
                      <Loading message="Carregando itens da RM..." size="sm" />
                    </div>
                  ) : (
                    <>
                  <div className="table-scroll">
                          <table className={`${cadastroListClasses.table} min-w-[40rem] !table-auto text-sm`}>
                            <thead className="border-b border-gray-200 dark:border-gray-700">
                              <tr>
                                <th className={`${cadastroListClasses.thCenter} w-12`}>Item</th>
                                <th className={cadastroListClasses.th}>Material</th>
                                <th className={cadastroListClasses.thCenter}>Unidade</th>
                                <th className={cadastroListClasses.thCenter}>Qtd. RM</th>
                                <th className={cadastroListClasses.thCenter}>Qtd. OC</th>
                                <th
                                  className={cadastroListClasses.thCenter}
                                  title="Referência da RM — não entra na OC"
                                >
                                  Valor referência
                                </th>
                                {Array.from(selectedSupplierIds).map((supplierId, supplierIndex, supplierIds) => {
                                  const sup = suppliers.find((x) => x.id === supplierId);
                                  return (
                                    <th
                                      key={supplierId}
                                      className={`${cadastroListClasses.thCenter} min-w-[8.5rem] normal-case tracking-normal border-l border-gray-200 dark:border-gray-700 ${
                                        supplierIndex === supplierIds.length - 1
                                          ? 'border-r border-gray-200 dark:border-gray-700'
                                          : ''
                                      }`}
                                      title={sup?.name ?? supplierId}
                                    >
                                      <span className="block truncate text-gray-800 dark:text-gray-200">
                                        {sup ? (sup.code ? `${sup.code} - ${sup.name}` : sup.name) : supplierId}
                                      </span>
                                    </th>
                                  );
                                })}
                                <th className={cadastroListClasses.thCenter}>Vencedor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                              {ocItems.map((item, itemIndex) => {
                                const winner = winnersByItem.find((w) => w.itemId === item.id) || null;
                                const winnerSupplier = suppliers.find((s) => s.id === winner?.winnerSupplierId);
                                const unitLabel = item.unit || '-';
                                const maxQty = Number(item.quantity);
                                const qty = ocItemQtyByItemId[item.id] ?? maxQty;
                                const refUnit = itemReferenceUnitPrice(item);
                                const winnerUnit =
                                  winner?.winnerSupplierId != null
                                    ? parseMapUnitPrice(
                                        unitPriceBySupplierItem[`${winner.winnerSupplierId}:${item.id}`] ?? ''
                                      )
                                    : null;
                                const winnerTotal =
                                  winnerUnit == null ? null : winnerUnit * qty;

                                return (
                                  <tr
                                    key={item.id}
                                    className={getListTableRowClassName(false)}
                                  >
                                    <td className={`${cadastroListClasses.tdCenter} tabular-nums font-medium text-gray-800 dark:text-gray-200`}>
                                      {itemIndex + 1}
                                    </td>
                                    <td className={cadastroListClasses.td}>
                                      <p className="font-medium text-gray-900 dark:text-gray-100">
                                        {materialItemLabel(item)}
                                      </p>
                                    </td>
                                    <td className={cadastroListClasses.tdCenter}>{unitLabel}</td>
                                    <td className={`${cadastroListClasses.tdCenter} tabular-nums font-medium`}>
                                      {maxQty}
                                    </td>
                                    <td className={cadastroListClasses.tdCenter}>
                                      <MapClickToEditNumber
                                        value={qty}
                                        min={0.0001}
                                        max={maxQty}
                                        ariaLabel="Quantidade na OC"
                                        onChange={(q) =>
                                          setOcItemQtyByItemId((prev) => ({ ...prev, [item.id]: q }))
                                        }
                                      />
                                    </td>
                                    <td
                                      className={`${cadastroListClasses.tdCenter} tabular-nums text-gray-600 dark:text-gray-300`}
                                    >
                                      {refUnit == null ? '—' : formatCurrencyBR(refUnit)}
                                    </td>

                                    {Array.from(selectedSupplierIds).map((supplierId, supplierIndex, supplierIds) => {
                                      const key = `${supplierId}:${item.id}`;
                                      const isWinner = winner?.winnerSupplierId === supplierId;
                                      const borderCls = `border-l border-gray-200 dark:border-gray-700 ${
                                        supplierIndex === supplierIds.length - 1
                                          ? 'border-r border-gray-200 dark:border-gray-700'
                                          : ''
                                      }`;

                                      return (
                                        <MapSupplierPriceCell
                                          key={supplierId}
                                          value={unitPriceBySupplierItem[key] ?? ''}
                                          quantity={qty}
                                          isWinner={isWinner}
                                          borderClassName={borderCls}
                                          ariaLabel={`Valor unitário ${suppliers.find((x) => x.id === supplierId)?.name ?? supplierId}`}
                                          onChange={(next) => {
                                            setUnitPriceBySupplierItem((prev) => ({
                                              ...prev,
                                              [key]: next,
                                            }));
                                          }}
                                        />
                                      );
                                    })}

                                    <td className={cadastroListClasses.tdCenter}>
                                      {winnerSupplier && winner ? (
                                        <div className="flex min-w-0 flex-col items-center gap-0.5">
                                          <span className="max-w-full truncate text-xs font-semibold text-green-700 dark:text-green-300">
                                            {winnerSupplier.name}
                                          </span>
                                          <span className="text-sm font-medium tabular-nums text-green-700 dark:text-green-300">
                                            {winnerUnit == null
                                              ? '—'
                                              : formatCurrencyBR(winnerUnit)}
                                          </span>
                                          <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400/90">
                                            {winnerTotal == null
                                              ? '—'
                                              : formatCurrencyBR(winnerTotal)}
                                          </span>
                                          {winner.technicalTie ? (
                                            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                              Empate técnico
                                            </span>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 dark:text-gray-500">—</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                              {selectedSupplierIds.size > 0 ? (
                                <tr className="border-t border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
                                  <td
                                    colSpan={6}
                                    className={`${cadastroListClasses.td} text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400`}
                                  >
                                    Frete
                                  </td>
                                  {Array.from(selectedSupplierIds).map((supplierId, supplierIndex, supplierIds) => {
                                    const sup = suppliers.find((x) => x.id === supplierId);
                                    const borderCls = `border-l border-gray-200 dark:border-gray-700 ${
                                      supplierIndex === supplierIds.length - 1
                                        ? 'border-r border-gray-200 dark:border-gray-700'
                                        : ''
                                    }`;
                                    return (
                                      <MapFreightCell
                                        key={`frete-${supplierId}`}
                                        value={freightBySupplier[supplierId] ?? ''}
                                        borderClassName={borderCls}
                                        ariaLabel={`Frete ${sup?.name ?? supplierId}`}
                                        onChange={(next) => {
                                          setFreightBySupplier((prev) => ({
                                            ...prev,
                                            [supplierId]: next,
                                          }));
                                        }}
                                      />
                                    );
                                  })}
                                  <td className={cadastroListClasses.tdCenter} />
                                </tr>
                              ) : null}
                              {selectedSupplierIds.size > 0 ? (
                                <tr className="border-t border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
                                  <td
                                    colSpan={6}
                                    className={`${cadastroListClasses.td} text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400`}
                                  >
                                    Valor total
                                  </td>
                                  {Array.from(selectedSupplierIds).map((supplierId, supplierIndex, supplierIds) => {
                                    const wonCount = (wonItemsBySupplier[supplierId] ?? []).length;
                                    const totals = computedSupplierTotals[supplierId];
                                    const borderCls = `border-l border-gray-200 dark:border-gray-700 ${
                                      supplierIndex === supplierIds.length - 1
                                        ? 'border-r border-gray-200 dark:border-gray-700'
                                        : ''
                                    }`;
                                    return (
                                      <td
                                        key={`total-${supplierId}`}
                                        className={`${cadastroListClasses.tdCenter} ${borderCls}`}
                                      >
                                        {wonCount > 0 && totals ? (
                                          <span className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                            {formatCurrencyBR(totals.amountToPay)}
                                          </span>
                                        ) : (
                                          <span className="text-gray-400 dark:text-gray-500">—</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className={cadastroListClasses.tdCenter} />
                                </tr>
                              ) : null}
                              {selectedSupplierIds.size > 0 ? (
                                <tr className="border-t border-gray-200 dark:border-gray-700">
                                  <td
                                    colSpan={6}
                                    className={`${cadastroListClasses.td} text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400`}
                                  >
                                    Ordem de compra
                                  </td>
                                  {Array.from(selectedSupplierIds).map((supplierId, supplierIndex, supplierIds) => {
                                    const wonCount = (wonItemsBySupplier[supplierId] ?? []).length;
                                    const totals = computedSupplierTotals[supplierId];
                                    const alreadyHasOc = generatedOcSupplierIds.has(supplierId);
                                    const borderCls = `border-l border-gray-200 dark:border-gray-700 ${
                                      supplierIndex === supplierIds.length - 1
                                        ? 'border-r border-gray-200 dark:border-gray-700'
                                        : ''
                                    }`;
                                    return (
                                      <td
                                        key={`gerar-oc-${supplierId}`}
                                        className={`${cadastroListClasses.tdCenter} ${borderCls}`}
                                      >
                                        {alreadyHasOc ? (
                                          <span className="inline-flex h-8 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300">
                                            OC gerada
                                          </span>
                                        ) : wonCount > 0 ? (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setPaymentDraftBySupplier((prev) => {
                                                if (prev[supplierId]) return prev;
                                                const suggested = totals
                                                  ? formatCurrencyBR(totals.amountToPay)
                                                  : '';
                                                return {
                                                  ...prev,
                                                  [supplierId]: {
                                                    ...emptyPaymentDraft(),
                                                    amountToPayStr: suggested,
                                                  },
                                                };
                                              });
                                              setOcModalSupplierId(supplierId);
                                            }}
                                            className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                                          >
                                            Gerar OC
                                          </button>
                                        ) : (
                                          <span className="text-gray-400 dark:text-gray-500">—</span>
                                        )}
                                      </td>
                                    );
                                  })}
                                  <td className={cadastroListClasses.tdCenter} />
                                </tr>
                              ) : null}
                            </tbody>
                          </table>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
        </div>

        {(() => {
          const sid = ocModalSupplierId;
          if (!sid) return null;
          const sup = suppliers.find((s) => s.id === sid);
          const totals = computedSupplierTotals[sid];
          const itemsWon = wonItemsBySupplier[sid] ?? [];
          const payType = paymentDraftBySupplier[sid]?.paymentType ?? OC_TYPE_AVISTA;
          const paymentConditionValue =
            paymentDraftBySupplier[sid]?.paymentCondition ?? paymentConditionDefault(payType);
          const closeOcModal = () => {
            if (isGenerating) return;
            setOcModalSupplierId(null);
          };

          return (
            <Modal
              isOpen={Boolean(ocModalSupplierId)}
              onClose={closeOcModal}
              title={
                <div className="min-w-0">
                  <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {`Gerar OC - ${sup?.name ?? 'Fornecedor'}`}
                  </h3>
                  {totals ? (
                    <p className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                      <span>
                        Frete:{' '}
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {formatCurrencyBR(totals.freight)}
                        </span>
                      </span>
                      <span>
                        Itens:{' '}
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {formatCurrencyBR(totals.itemsTotal)}
                        </span>
                      </span>
                      <span>
                        Total OC:{' '}
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {formatCurrencyBR(totals.amountToPay)}
                        </span>
                      </span>
                    </p>
                  ) : null}
                </div>
              }
              size="xl"
              contentOverflowVisible
            >
              <div className="space-y-5">
                <div>
                  <h4 className="mb-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Itens da OC
                  </h4>
                  <div className="table-scroll rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className={`${cadastroListClasses.table} !table-auto text-sm`}>
                      <thead className="border-b border-gray-200 bg-gray-50/80 dark:border-gray-700 dark:bg-gray-900/40">
                        <tr>
                          <th className={`${cadastroListClasses.thCenter} w-12`}>Item</th>
                          <th className={cadastroListClasses.th}>Material</th>
                          <th className={`${cadastroListClasses.th} min-w-[12rem]`}>Detalhamento</th>
                          <th className={cadastroListClasses.thCenter}>Unidade</th>
                          <th className={cadastroListClasses.thCenter}>Qtd. OC</th>
                          <th className={cadastroListClasses.thNumeric}>Valor unit.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {itemsWon.map((item) => {
                          const itemNo = ocItems.findIndex((i) => i.id === item.id) + 1;
                          const unitLabel = item.unit || '-';
                          const maxQty = Number(item.quantity);
                          const qty = ocItemQtyByItemId[item.id] ?? maxQty;
                          const priceKey = `${sid}:${item.id}`;
                          const unitParsed = parseMapUnitPrice(
                            unitPriceBySupplierItem[priceKey] ?? ''
                          );
                          const detailKey = `${sid}:${item.id}`;
                          return (
                            <tr key={item.id} className={getListTableRowClassName(false)}>
                              <td
                                className={`${cadastroListClasses.tdCenter} tabular-nums font-medium text-gray-800 dark:text-gray-200`}
                              >
                                {itemNo > 0 ? itemNo : '—'}
                              </td>
                              <td className={cadastroListClasses.td}>
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {materialItemLabel(item)}
                                </p>
                              </td>
                              <td className={cadastroListClasses.td}>
                                <input
                                  type="text"
                                  value={supplierItemDetailByKey[detailKey] ?? ''}
                                  onChange={(e) => {
                                    const next = e.target.value;
                                    setSupplierItemDetailByKey((prev) => ({
                                      ...prev,
                                      [detailKey]: next,
                                    }));
                                  }}
                                  placeholder="Opcional"
                                  className={`${mapFieldCls} min-w-[10rem]`}
                                  aria-label={`Detalhamento do item para ${sup?.name ?? 'fornecedor'}`}
                                />
                              </td>
                              <td className={cadastroListClasses.tdCenter}>{unitLabel}</td>
                              <td
                                className={`${cadastroListClasses.tdCenter} tabular-nums font-medium`}
                              >
                                {qty}
                              </td>
                              <td
                                className={`${cadastroListClasses.tdNumeric} tabular-nums font-medium text-gray-900 dark:text-gray-100`}
                              >
                                {unitParsed == null ? '—' : formatCurrencyBR(unitParsed)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h4 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">
                    Pagamento
                  </h4>
                  <div className="space-y-4">
                <div>
                  <span className={mapLabelCls}>Tipo de pagamento *</span>
                  <div
                    role="radiogroup"
                    aria-label="Tipo de pagamento"
                    className="grid max-w-md grid-cols-2 gap-2"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={payType === OC_TYPE_AVISTA}
                      onClick={() => {
                        setPaymentDraftBySupplier((prev) => ({
                          ...prev,
                          [sid]: {
                            ...(prev[sid] ?? emptyPaymentDraft()),
                            paymentType: OC_TYPE_AVISTA,
                            paymentCondition: paymentConditionDefault(OC_TYPE_AVISTA),
                          },
                        }));
                      }}
                      className={mapPaymentSegmentCls(payType === OC_TYPE_AVISTA)}
                    >
                      À vista
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={payType === OC_TYPE_BOLETO}
                      onClick={() => {
                        setPaymentDraftBySupplier((prev) => ({
                          ...prev,
                          [sid]: {
                            ...(prev[sid] ?? emptyPaymentDraft()),
                            paymentType: OC_TYPE_BOLETO,
                            paymentCondition: paymentConditionDefault(OC_TYPE_BOLETO),
                            pixKeyType: '',
                            pixKey: '',
                          },
                        }));
                      }}
                      className={mapPaymentSegmentCls(payType === OC_TYPE_BOLETO)}
                    >
                      Boleto
                    </button>
                  </div>
                </div>

                {payType !== OC_TYPE_AVISTA ? (
                  <div>
                    <label htmlFor={`pc-modal-${sid}`} className={mapLabelCls}>
                      Condição de pagamento *
                    </label>
                    <PaymentConditionSelect
                      id={`pc-modal-${sid}`}
                      key={`pc-modal-${sid}-${payType}`}
                      paymentType="BOLETO"
                      value={paymentConditionValue}
                      onChange={(v) => {
                        setPaymentDraftBySupplier((prev) => ({
                          ...prev,
                          [sid]: {
                            ...(prev[sid] ?? emptyPaymentDraft()),
                            paymentCondition: v,
                          },
                        }));
                      }}
                      hideFocus
                    />
                  </div>
                ) : null}

                <div>
                  <label htmlFor={`amount-modal-${sid}`} className={mapLabelCls}>
                    Valor total (R$) *
                  </label>
                  <input
                    id={`amount-modal-${sid}`}
                    type="text"
                    inputMode="decimal"
                    value={(() => {
                      const s = paymentDraftBySupplier[sid]?.amountToPayStr;
                      if (s !== undefined && s !== '') return s;
                      return totals ? formatCurrencyBR(totals.amountToPay) : '';
                    })()}
                    onChange={(e) => {
                      setPaymentDraftBySupplier((prev) => ({
                        ...prev,
                        [sid]: {
                          ...(prev[sid] ?? emptyPaymentDraft()),
                          amountToPayStr: e.target.value,
                        },
                      }));
                    }}
                    onBlur={() => {
                      const raw =
                        paymentDraftBySupplier[sid]?.amountToPayStr ??
                        (totals ? String(totals.amountToPay) : '');
                      const formatted = formatCurrencyInputValue(raw);
                      setPaymentDraftBySupplier((prev) => ({
                        ...prev,
                        [sid]: {
                          ...(prev[sid] ?? emptyPaymentDraft()),
                          amountToPayStr: formatted,
                        },
                      }));
                    }}
                    placeholder="0,00"
                    className={mapFieldCls}
                  />
                </div>

                <div>
                  <label htmlFor={`pay-details-modal-${sid}`} className={mapLabelCls}>
                    Dados do pagamento{payType === OC_TYPE_AVISTA ? ' *' : ''}
                  </label>
                  <textarea
                    id={`pay-details-modal-${sid}`}
                    value={paymentDraftBySupplier[sid]?.paymentDetails ?? ''}
                    onChange={(e) => {
                      setPaymentDraftBySupplier((prev) => ({
                        ...prev,
                        [sid]: {
                          ...(prev[sid] ?? emptyPaymentDraft()),
                          paymentDetails: e.target.value,
                        },
                      }));
                    }}
                    rows={3}
                    placeholder={
                      payType === OC_TYPE_AVISTA
                        ? 'Conta, agência, favorecido, etc.'
                        : 'Conta, PIX, agência, favorecido, etc.'
                    }
                    className={`${mapFieldCls} min-h-[5rem] resize-y`}
                  />
                </div>

                {payType === OC_TYPE_AVISTA ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(10rem,1fr)_minmax(0,2.2fr)]">
                    <div>
                      <label htmlFor={`pix-type-modal-${sid}`} className={mapLabelCls}>
                        Tipo de Chave Pix *
                      </label>
                      <SingleSelectSearchDropdown
                        value={paymentDraftBySupplier[sid]?.pixKeyType ?? ''}
                        onChange={(v) => {
                          setPaymentDraftBySupplier((prev) => {
                            const current = prev[sid] ?? emptyPaymentDraft();
                            return {
                              ...prev,
                              [sid]: {
                                ...current,
                                pixKeyType: v,
                                pixKey: maskPixKeyByType(v, current.pixKey),
                              },
                            };
                          });
                        }}
                        options={OC_PIX_KEY_TYPE_OPTIONS}
                        allowEmpty
                        placeholder="Selecione..."
                        searchPlaceholder="Pesquisar..."
                        noFocusRing
                        hideFocus
                      />
                    </div>
                    <div>
                      <label htmlFor={`pix-key-modal-${sid}`} className={mapLabelCls}>
                        Chave Pix *
                      </label>
                      <input
                        id={`pix-key-modal-${sid}`}
                        type="text"
                        value={paymentDraftBySupplier[sid]?.pixKey ?? ''}
                        onChange={(e) => {
                          const pixType = paymentDraftBySupplier[sid]?.pixKeyType ?? '';
                          const next = maskPixKeyByType(pixType, e.target.value);
                          setPaymentDraftBySupplier((prev) => ({
                            ...prev,
                            [sid]: {
                              ...(prev[sid] ?? emptyPaymentDraft()),
                              pixKey: next,
                            },
                          }));
                        }}
                        placeholder={pixKeyInputPlaceholder(
                          paymentDraftBySupplier[sid]?.pixKeyType ?? ''
                        )}
                        maxLength={pixKeyInputMaxLength(
                          paymentDraftBySupplier[sid]?.pixKeyType ?? ''
                        )}
                        className={mapFieldCls}
                      />
                    </div>
                  </div>
                ) : null}

                <div>
                  <label htmlFor={`obs-modal-${sid}`} className={mapLabelCls}>
                    Observações
                  </label>
                  <textarea
                    id={`obs-modal-${sid}`}
                    value={paymentDraftBySupplier[sid]?.observations ?? ''}
                    onChange={(e) => {
                      setPaymentDraftBySupplier((prev) => ({
                        ...prev,
                        [sid]: {
                          ...(prev[sid] ?? emptyPaymentDraft()),
                          observations: e.target.value,
                        },
                      }));
                    }}
                    rows={2}
                    placeholder="Observações gerais da OC"
                    className={`${mapFieldCls} min-h-[4rem] resize-y`}
                  />
                </div>

                <div>
                  <span className={mapLabelCls}>Anexar arquivos</span>
                  <FinancialControlAttachmentsField
                    files={paymentDraftBySupplier[sid]?.attachments ?? []}
                    uploading={uploadingOcAttachments}
                    disabled={isGenerating}
                    onFilesSelect={async (files) => {
                      if (!files.length) return;
                      setUploadingOcAttachments(true);
                      try {
                        const uploaded = await uploadNamedAttachments(
                          '/purchase-orders/upload-attachment',
                          files
                        );
                        setPaymentDraftBySupplier((prev) => {
                          const current = prev[sid] ?? emptyPaymentDraft();
                          return {
                            ...prev,
                            [sid]: {
                              ...current,
                              attachments: [...(current.attachments || []), ...uploaded],
                            },
                          };
                        });
                        toast.success(
                          uploaded.length > 1
                            ? `${uploaded.length} arquivos enviados`
                            : 'Arquivo enviado'
                        );
                      } catch (e: unknown) {
                        const err = e as { response?: { data?: { message?: string } }; message?: string };
                        toast.error(
                          err.response?.data?.message || err.message || 'Não foi possível enviar o arquivo'
                        );
                      } finally {
                        setUploadingOcAttachments(false);
                      }
                    }}
                    onRemove={(index) => {
                      setPaymentDraftBySupplier((prev) => {
                        const current = prev[sid] ?? emptyPaymentDraft();
                        return {
                          ...prev,
                          [sid]: {
                            ...current,
                            attachments: (current.attachments || []).filter((_, i) => i !== index),
                          },
                        };
                      });
                    }}
                  />
                </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={closeOcModal}
                    disabled={isGenerating}
                    className="inline-flex h-10 items-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => generateOrdersMutation.mutate(sid)}
                    className="inline-flex h-10 items-center rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    {isGenerating ? 'Gerando…' : 'Gerar OC'}
                  </button>
                </div>
              </div>
            </Modal>
          );
        })()}
      </MainLayout>
    </ProtectedRoute>
  );
}

