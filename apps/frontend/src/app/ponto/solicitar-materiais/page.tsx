'use client';

import React, { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart,
  Plus,
  X,
  AlertCircle,
  Send,
  Pencil,
  Loader2,
  Search,
  Filter,
  Eye,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  ClipboardList,
  Clock,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { fixMojibakeFileName } from '@/lib/fixMojibakeFileName';
import toast from 'react-hot-toast';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { RowActionMenuCell, RowActionMenuPortal, cadastroListClasses } from '@/components/ui/RowActionMenu';
import { ListPagination } from '@/components/ui/ListPagination';
import { ModalCloseConfirm } from '@/components/ui/ModalCloseConfirm';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { formatRmListDisplayId } from '@/app/ponto/gerenciar-materiais/_lib/rmListDisplay';
import {
  materialRequestOcListRows,
  type MaterialRequestOcListPurchaseOrder,
} from '@/components/oc/materialRequestOcListRows';
import { useCostCenters } from '@/hooks/useCostCenters';
import { usePermissions } from '@/hooks/usePermissions';
import {
  useServiceOrdersByContract,
} from '@/hooks/useServiceOrdersByCostCenter';
import { ServiceOrderSearchSelect } from '@/components/suprimentos/ServiceOrderSearchSelect';
import { AsyncSearchSelectDropdown } from '@/components/ui/AsyncSearchSelectDropdown';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { getRmMaterialLabel, searchRmMaterials, type RmMaterialListItem } from '@/lib/searchRmMaterials';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { isExactUnbCostCenterLabel, isUnbRelatedLabel, resolveLockedUnbCostCenterId } from '@/lib/unbBranding';
import {
  purchaseOrderPhaseLabel,
  OC_STATUS_LABELS_PT,
} from '@/components/oc/ocStatusLabels';
import type { PurchaseOrder } from '@/components/oc/OcPurchaseOrdersPanel';
import { OcAttachmentActions } from '@/components/oc/OcAttachmentActions';
import { formatOcListDisplayId } from '@/components/oc/ocListDisplay';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { getActiveOcForRmItem, getRmItemCoverageCounts } from '@/lib/rmProcurementCoverage';
import { formatRmItemProductKinds } from '@/lib/rmItemProductKinds';
import type { MaterialRequest } from '@/app/ponto/gerenciar-materiais/_lib/types';
import { isMaterialRequestEffectivelyCancelled } from '@/app/ponto/gerenciar-materiais/_lib/search';
import {
  getPriorityInfo,
  getStatusInfo
} from '@/app/ponto/gerenciar-materiais/_lib/display';
import {
  DEFAULT_RM_CARD_FILTER,
  isMaterialRequestAwaitingOc,
  matchesRmCardFilter,
  type RmCardFilter
} from '@/app/ponto/gerenciar-materiais/_lib/rmCardFilter';
import { RmDetailOcTab } from '@/app/ponto/gerenciar-materiais/_components/RmDetailOcTab';

type SolicitacaoDetailTab = 'resumo' | 'materiais' | 'ocs' | 'documentos';

const SOLICITACAO_DETAIL_TABS: { id: SolicitacaoDetailTab; label: string }[] = [
  { id: 'resumo', label: 'Resumo' },
  { id: 'materiais', label: 'Materiais' },
  { id: 'ocs', label: 'Ordens de compra' },
  { id: 'documentos', label: 'Documentos' }
];

function SolicitacaoDetailDocSection({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-0 rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="border-b border-gray-200 pb-3 dark:border-gray-700">
        <h3 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
          {title}
        </h3>
      </div>
      <div className="divide-y divide-gray-200 dark:divide-gray-700">{children}</div>
    </section>
  );
}

function SolicitacaoDetailDocumentItem({
  label,
  subtitle,
  url,
  fileName,
  pending = false
}: {
  label: string;
  subtitle?: string;
  url?: string | null;
  fileName?: string | null;
  pending?: boolean;
}) {
  const trimmedUrl = (url || '').trim();
  const isPending = pending || !trimmedUrl;

  return (
    <div className="flex items-center justify-between gap-3 py-3 first:pt-3 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{label}</p>
        {subtitle ? (
          <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isPending ? (
          <span className="inline-flex whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            Pendente
          </span>
        ) : (
          <OcAttachmentActions
            url={trimmedUrl}
            fileName={fileName || label}
            variant="buttons"
          />
        )}
      </div>
    </div>
  );
}

function RmFormSection({
  title,
  description,
  headerRight,
  children
}: {
  title: string;
  description?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2 border-b border-gray-200 pb-3 dark:border-gray-700">
        <div className="min-w-0">
          <h4 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-gray-50">
            {title}
          </h4>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {description}
            </p>
          ) : null}
        </div>
        {headerRight}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

const RM_FORM_LABEL_CLS =
  'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400';
const RM_FORM_FIELD_LABEL_CLS =
  'mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400';
const RM_ADD_FILE_BTN_CLS =
  'inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:border-gray-500 dark:hover:bg-gray-700/80 dark:hover:text-gray-100';
const RM_ADD_ITEM_BTN_CLS =
  'inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-red-300 bg-red-50/50 px-4 py-2.5 text-sm font-medium text-red-700 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-800 dark:border-red-800/60 dark:bg-red-950/25 dark:text-red-300 dark:hover:border-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-200';

const RM_STAT_CARDS: {
  filter: RmCardFilter;
  label: string;
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  countKey: keyof { total: number; pending: number; approved: number; awaitingOc: number; cancelled: number };
}[] = [
  {
    filter: 'all',
    label: 'Total',
    iconBg: 'bg-blue-100 dark:bg-blue-900/30',
    iconColor: 'text-blue-600 dark:text-blue-400',
    Icon: ClipboardList,
    countKey: 'total'
  },
  {
    filter: 'pending',
    label: 'Pendentes',
    iconBg: 'bg-yellow-100 dark:bg-yellow-900/30',
    iconColor: 'text-yellow-600 dark:text-yellow-400',
    Icon: Clock,
    countKey: 'pending'
  },
  {
    filter: 'approved',
    label: 'Aprovadas',
    iconBg: 'bg-green-100 dark:bg-green-900/30',
    iconColor: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle,
    countKey: 'approved'
  },
  {
    filter: 'awaitingOc',
    label: 'Aguardando OC',
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
    Icon: ShoppingCart,
    countKey: 'awaitingOc'
  },
  {
    filter: 'cancelled',
    label: 'Canceladas',
    iconBg: 'bg-red-100 dark:bg-red-900/30',
    iconColor: 'text-red-600 dark:text-red-400',
    Icon: XCircle,
    countKey: 'cancelled'
  }
];

function rmStatusLabelPt(status: string): string {
  const m: Record<string, string> = {
    PENDING: 'Pendente',
    IN_REVIEW: 'Correção RM',
    APPROVED: 'Aprovada',
    PARTIALLY_FULFILLED: 'Parcialmente atendida',
    FULFILLED: 'Atendida',
    REJECTED: 'Rejeitada',
    CANCELLED: 'Cancelada'
  };
  return m[status] || status;
}

function rmStatusBadgeClass(status: string): string {
  const base = 'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold';
  if (status === 'APPROVED')
    return `${base} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200`;
  if (status === 'PENDING')
    return `${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`;
  if (status === 'IN_REVIEW')
    return `${base} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200`;
  if (status === 'REJECTED')
    return `${base} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200`;
  if (status === 'CANCELLED')
    return `${base} bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300`;
  if (status === 'PARTIALLY_FULFILLED' || status === 'FULFILLED')
    return `${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200`;
  return `${base} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300`;
}

function materialRequestRmFaseAtual(request: {
  status?: string;
}): { text: string; badgeClassName: string } {
  const rm = String(request.status || '');
  return {
    text: rmStatusLabelPt(rm),
    badgeClassName: rmStatusBadgeClass(rm)
  };
}

const RM_FASE_FILTER_ORDER = [
  'PENDING',
  'IN_REVIEW',
  'APPROVED',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'REJECTED',
  'CANCELLED'
] as const;

const OC_FASE_FILTER_ORDER = [
  'DRAFT',
  'PENDING_COMPRAS',
  'PENDING',
  'PENDING_DIRETORIA',
  'IN_REVIEW',
  'APPROVED',
  'PENDING_PROOF_VALIDATION',
  'PENDING_PROOF_CORRECTION',
  'PENDING_NF_ATTACHMENT',
  'SENT',
  'FINALIZED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'REJECTED',
  'CANCELLED'
] as const;

const RM_PRIORITY_OPTIONS = [
  { value: 'LOW', label: 'Baixa' },
  { value: 'MEDIUM', label: 'Média' },
  { value: 'HIGH', label: 'Alta' },
  { value: 'URGENT', label: 'Urgente' },
];

/** Filtro "Fase atual": `rm:STATUS` = fase da SC; `oc:STATUS` = alguma OC com esse status. */
function requestMatchesFaseAtualFilter(
  request: { status?: string; purchaseOrders?: MaterialRequestOcListPurchaseOrder[] },
  filterKey: string
): boolean {
  if (!filterKey) return true;
  const pos = Array.isArray(request.purchaseOrders) ? request.purchaseOrders : [];
  if (filterKey.startsWith('rm:')) {
    const s = filterKey.slice(3);
    return String(request.status || '') === s;
  }
  if (filterKey.startsWith('oc:')) {
    const s = filterKey.slice(3);
    return pos.some((po) => po.status === s);
  }
  return true;
}

function rmOsLine(req: { serviceOrder?: string | null; project?: { code?: string | null; name?: string | null } | null; projectId?: string | null }) {
  if (req.serviceOrder?.trim()) return req.serviceOrder.trim();
  if (req.project?.code || req.project?.name) {
    return String(req.project?.code || req.project?.name || '').trim() || '—';
  }
  if (req.projectId && String(req.projectId).length === 25) return '—';
  if (req.projectId) return String(req.projectId);
  return '—';
}

function rmCostCenterLine(req: {
  costCenter?: { code?: string | null; name?: string | null } | null;
  costCenterId?: string | null;
}) {
  const cc = req.costCenter;
  if (cc?.code && cc?.name) return `${cc.code} — ${cc.name}`;
  if (cc?.code) return String(cc.code);
  if (cc?.name) return String(cc.name);
  if (req.costCenterId) return String(req.costCenterId);
  return '—';
}

function rmCostCenterName(req: {
  costCenter?: { code?: string | null; name?: string | null } | null;
  costCenterId?: string | null;
}) {
  const cc = req.costCenter;
  if (cc?.name) return String(cc.name);
  if (cc?.code) return String(cc.code);
  return '—';
}

function rmContractName(req: {
  costCenter?: { code?: string | null; name?: string | null } | null;
  costCenterId?: string | null;
  service_orders?: {
    pleitos?: Array<{
      updatedContract?: { name?: string | null; number?: string | null } | null;
    } | null>;
  } | null;
}) {
  const pleitos = req.service_orders?.pleitos ?? [];
  const src = pleitos.find((p) => p?.updatedContract) ?? pleitos[0];
  const contract = src?.updatedContract;
  if (contract?.name?.trim()) return contract.name.trim();
  if (contract?.number?.trim()) return contract.number.trim();
  return rmCostCenterName(req);
}

const LIST_ITEMS_PER_PAGE = 12;

/** YYYY-MM-DD no fuso local (para comparar com input type="date"). */
function toYmdLocal(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const EMPTY_REQUEST_LIST: unknown[] = [];

type FdAttachment = { url: string; name: string };

function parseFdAttachments(r: {
  demandSheetAttachments?: unknown;
  demandSheetAttachmentUrl?: string | null;
  demandSheetAttachmentName?: string | null;
}): FdAttachment[] {
  const raw = r.demandSheetAttachments;
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const url = String((item as { url?: unknown }).url || '').trim();
        if (!url) return null;
        const name =
          fixMojibakeFileName(String((item as { name?: unknown }).name || '').trim()) ||
          'Arquivo anexado';
        return { url, name };
      })
      .filter((item): item is FdAttachment => Boolean(item));
  }
  const url = String(r.demandSheetAttachmentUrl || '').trim();
  if (!url) return [];
  return [
    {
      url,
      name: fixMojibakeFileName(String(r.demandSheetAttachmentName || '').trim()) || 'Arquivo anexado',
    },
  ];
}

const emptyRmFormItem = () => ({
  materialId: '',
  quantity: 1,
  unit: '',
  /** Referência do que o comprador deveria pagar (padrão = média das últimas compras). */
  unitPrice: 0,
  observation: '',
  attachmentUrl: '',
  attachmentName: ''
});

const emptyNewFormData = () => ({
  contractId: '',
  costCenterId: '',
  serviceOrderId: '',
  serviceOrder: '',
  obra: '',
  description: '',
  priority: 'MEDIUM',
  demandSheet: '',
  demandSheetAttachments: [] as FdAttachment[],
  items: [emptyRmFormItem()]
});

type NewMaterialRequestFormData = ReturnType<typeof emptyNewFormData>;
type RmFormItem = NewMaterialRequestFormData['items'][number];

function formatRmAvgPaid(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return '—';
  return formatCurrencyInputBrFromNumber(n);
}

function rmItemLineTotal(item: Pick<RmFormItem, 'quantity' | 'unitPrice'>): number {
  const q = Number(item.quantity);
  const u = Number(item.unitPrice);
  if (!Number.isFinite(q) || !Number.isFinite(u)) return 0;
  return Math.round(q * u * 100) / 100;
}

function rmRequestItemsTotal(items: Pick<RmFormItem, 'quantity' | 'unitPrice'>[]): number {
  return Math.round(items.reduce((sum, item) => sum + rmItemLineTotal(item), 0) * 100) / 100;
}

const RM_UNIT_PRICE_HELP =
  'Padrão: média das últimas 10 compras deste material. Você pode alterar para o valor que quiser.';

function RmUnitPriceInfoIcon() {
  return (
    <span className="group/rm-unit-help absolute inset-y-0 right-0 z-10 flex items-center pr-2.5">
      <button
        type="button"
        className="inline-flex text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        aria-label={RM_UNIT_PRICE_HELP}
        title={RM_UNIT_PRICE_HELP}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full right-0 z-30 mb-1.5 w-max max-w-[16rem] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-normal leading-relaxed text-gray-700 opacity-0 shadow-lg transition-opacity duration-150 invisible group-hover/rm-unit-help:visible group-hover/rm-unit-help:opacity-100 group-focus-within/rm-unit-help:visible group-focus-within/rm-unit-help:opacity-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
      >
        {RM_UNIT_PRICE_HELP}
      </span>
    </span>
  );
}

/** Valor unitário padrão ao selecionar material: média paga → mediana → 0. */
function defaultUnitPriceFromMaterial(material: RmMaterialListItem): number {
  const avg = material.avgPaidUnitPrice;
  if (avg != null && Number.isFinite(Number(avg)) && Number(avg) >= 0) {
    return Math.round(Number(avg) * 100) / 100;
  }
  const median = material.medianPrice;
  if (median != null && Number.isFinite(Number(median)) && Number(median) >= 0) {
    return Math.round(Number(median) * 100) / 100;
  }
  return 0;
}

type RmContractOption = {
  id: string;
  number: string;
  name: string;
  costCenterId: string;
  costCenter?: { id: string; code?: string | null; name?: string | null } | null;
};

function formatRmContractLabel(contract: Pick<RmContractOption, 'number' | 'name'>): string {
  const name = String(contract.name ?? '').trim();
  if (name) return name;
  const number = String(contract.number ?? '').trim();
  return number || 'Contrato';
}

function isUnbCostCenterOption(costCenter: {
  name?: string | null;
  code?: string | null;
  label?: string | null;
} | null | undefined): boolean {
  if (!costCenter) return false;
  return (
    isUnbRelatedLabel(costCenter.name) ||
    isUnbRelatedLabel(costCenter.code) ||
    isUnbRelatedLabel(costCenter.label)
  );
}

function resolveLockedUnbContractId(
  contracts: RmContractOption[],
  lockedCostCenterId: string | null
): string | null {
  if (!contracts.length) return null;

  const matchesCostCenter = lockedCostCenterId
    ? contracts.filter(
        (contract) =>
          contract.costCenterId === lockedCostCenterId ||
          contract.costCenter?.id === lockedCostCenterId
      )
    : [];

  const unbRelated = contracts.filter(
    (contract) =>
      isUnbCostCenterOption(contract.costCenter) ||
      isUnbRelatedLabel(contract.name) ||
      isUnbRelatedLabel(contract.number)
  );

  const pool = matchesCostCenter.length > 0 ? matchesCostCenter : unbRelated;
  if (pool.length === 0) return null;

  const exactName = pool.find((contract) => isExactUnbCostCenterLabel(contract.name));
  if (exactName) return exactName.id;

  const exactCc = pool.find(
    (contract) =>
      isExactUnbCostCenterLabel(contract.costCenter?.name) ||
      isExactUnbCostCenterLabel(contract.costCenter?.code)
  );
  return exactCc?.id ?? pool[0].id;
}

function validateNewMaterialRequestForm(
  formData: NewMaterialRequestFormData,
  options?: { demandSheetOptional?: boolean }
): string | null {
  if (!formData.contractId.trim()) return 'Selecione o contrato.';
  if (!formData.costCenterId.trim()) return 'Contrato sem centro de custo vinculado.';
  if (!formData.serviceOrderId.trim()) return 'Selecione a ordem de serviço.';
  if (!options?.demandSheetOptional) {
    if (!formData.demandSheet.trim()) return 'Informe a ficha de demanda.';
    if (formData.demandSheetAttachments.length === 0) return 'Anexe ao menos um arquivo.';
  }

  const validItems = formData.items.filter((item) => item.materialId);
  if (validItems.length === 0) return 'Inclua ao menos um material.';

  for (let index = 0; index < formData.items.length; index += 1) {
    const item = formData.items[index];
    if (!item.materialId.trim()) {
      return `Selecione o material do item ${index + 1}.`;
    }
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return `Informe a quantidade do item ${index + 1}.`;
    }
  }

  return null;
}

const rmNumberInputClass =
  'min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 tabular-nums outline-none dark:text-gray-100';

const rmNumberInputClassSm =
  'min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-gray-900 tabular-nums outline-none dark:text-gray-100';

function formatQuantityInputBr(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
}

function maskQuantityInputBr(raw: string): string {
  const cleaned = raw.replace(/[^\d,]/g, '');
  const commaPos = cleaned.indexOf(',');
  if (commaPos < 0) return cleaned;

  const intPart = cleaned.slice(0, commaPos);
  const decPart = cleaned.slice(commaPos + 1).replace(/,/g, '').slice(0, 2);
  if (raw.includes(',') && decPart.length === 0) {
    return `${intPart},`;
  }
  return decPart.length > 0 ? `${intPart},${decPart}` : intPart;
}

function parseQuantityInputBr(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function RmQuantityInput({
  value,
  onChange,
  unit,
  required = false,
  size = 'md'
}: {
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  required?: boolean;
  size?: 'md' | 'sm';
}) {
  const [text, setText] = useState(() => formatQuantityInputBr(value));

  useEffect(() => {
    setText(formatQuantityInputBr(value));
  }, [value]);

  const shellClass =
    size === 'sm'
      ? 'flex overflow-hidden rounded border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
      : 'flex overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800';
  const stepBtnClass =
    'flex flex-1 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200';
  const unitClass =
    size === 'sm'
      ? 'flex shrink-0 items-center border-l border-gray-300 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-600 dark:text-gray-400'
      : 'flex shrink-0 items-center border-l border-gray-300 px-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-600 dark:text-gray-400';

  const commitValue = (parsed: number | null) => {
    if (parsed != null && parsed > 0) {
      onChange(parsed);
      setText(formatQuantityInputBr(parsed));
      return;
    }
    onChange(0);
    setText('');
  };

  const bump = (delta: number) => {
    const current = parseQuantityInputBr(text);
    const base =
      current != null && current > 0
        ? current
        : Number.isFinite(value) && value > 0
          ? value
          : 0;
    const next = Math.round((base + delta) * 100) / 100;
    if (next <= 0) {
      onChange(0);
      setText('');
      return;
    }
    onChange(next);
    setText(formatQuantityInputBr(next));
  };

  return (
    <div className={shellClass}>
      <input
        type="text"
        inputMode="decimal"
        required={required}
        value={text}
        placeholder="0"
        onChange={(e) => setText(maskQuantityInputBr(e.target.value))}
        onBlur={() => commitValue(parseQuantityInputBr(text))}
        className={size === 'sm' ? rmNumberInputClassSm : rmNumberInputClass}
      />
      <span className={unitClass}>{unit?.trim() || '—'}</span>
      <div className="flex w-8 shrink-0 flex-col border-l border-gray-300 dark:border-gray-600">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Aumentar quantidade"
          onClick={() => bump(1)}
          className={`${stepBtnClass} border-b border-gray-300 dark:border-gray-600`}
        >
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Diminuir quantidade"
          onClick={() => bump(-1)}
          className={stepBtnClass}
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

type RmCostCenterOption = {
  id?: string;
  code: string;
  name?: string;
  description?: string;
  label: string;
  value: string;
  polo?: string;
  isActive?: boolean;
};

function getCostCenterLabel(costCenter?: RmCostCenterOption | null) {
  if (!costCenter) return '';
  return String(costCenter.name ?? costCenter.label ?? '').trim();
}

const RM_ATTACHMENT_ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx';

function RmAttachmentField({
  fileUrl,
  fileName,
  uploading,
  disabled = false,
  onFileSelect,
  onRemove,
  chooseLabel = 'Adicionar anexo'
}: {
  fileUrl?: string;
  fileName?: string;
  uploading?: boolean;
  disabled?: boolean;
  onFileSelect: (file: File) => void;
  onRemove: () => void;
  chooseLabel?: string;
  size?: 'sm' | 'md';
}) {
  const addButton = (
    <label
      className={`${RM_ADD_FILE_BTN_CLS} ${
        disabled || uploading ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      <span>{uploading ? 'Enviando...' : fileUrl ? 'Trocar arquivo' : chooseLabel}</span>
      <input
        type="file"
        className="hidden"
        disabled={disabled || uploading}
        accept={RM_ATTACHMENT_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFileSelect(file);
          e.currentTarget.value = '';
        }}
      />
    </label>
  );

  if (!fileUrl) {
    return addButton;
  }

  const displayName = fileName?.trim() || 'Arquivo anexado';

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100" title={displayName}>
            {displayName}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Anexo do item</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <OcAttachmentActions url={fileUrl} fileName={displayName} variant="buttons" />
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled || uploading}
            aria-label="Remover anexo"
            className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
      {addButton}
    </div>
  );
}

function RmDemandSheetAttachmentsField({
  files,
  uploading,
  disabled = false,
  onFilesSelect,
  onRemove,
  chooseLabel = 'Adicionar arquivo',
  addLabel = 'Adicionar arquivo',
}: {
  files: FdAttachment[];
  uploading?: boolean;
  disabled?: boolean;
  onFilesSelect: (files: File[]) => void;
  onRemove: (index: number) => void;
  chooseLabel?: string;
  addLabel?: string;
  size?: 'sm' | 'md';
}) {
  const pickFiles = (list: FileList | null) => {
    if (!list?.length) return;
    onFilesSelect(Array.from(list));
  };

  const addButton = (
    <label
      className={`${RM_ADD_FILE_BTN_CLS} ${
        disabled || uploading ? 'pointer-events-none opacity-50' : ''
      }`}
    >
      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      <span>{uploading ? 'Enviando...' : files.length === 0 ? chooseLabel : addLabel}</span>
      <input
        type="file"
        multiple
        className="hidden"
        disabled={disabled || uploading}
        accept={RM_ATTACHMENT_ACCEPT}
        onChange={(e) => {
          pickFiles(e.target.files);
          e.currentTarget.value = '';
        }}
      />
    </label>
  );

  if (files.length === 0) {
    return addButton;
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-gray-200 dark:divide-gray-700">
        {files.map((file, index) => {
          const displayName = fixMojibakeFileName(file.name) || 'Arquivo anexado';
          return (
            <li
              key={`${file.url}-${index}`}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100" title={displayName}>
                  {displayName}
                </p>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Anexo</p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <OcAttachmentActions
                  url={file.url}
                  fileName={displayName}
                  variant="buttons"
                />
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  disabled={disabled || uploading}
                  aria-label="Remover anexo"
                  className="rounded-md p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      {addButton}
    </div>
  );
}

function SolicitarMateriaisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [showCloseNewRequestConfirm, setShowCloseNewRequestConfirm] = useState(false);
  const [showCloseDetailConfirm, setShowCloseDetailConfirm] = useState(false);
  const [formData, setFormData] = useState(emptyNewFormData);

  const [correctionEditId, setCorrectionEditId] = useState<string | null>(null);
  const [detailViewId, setDetailViewId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<SolicitacaoDetailTab>('resumo');
  const [editFormData, setEditFormData] = useState({
    contractId: '',
    costCenterId: '',
    serviceOrderId: '',
    serviceOrder: '',
    obra: '',
    description: '',
    priority: 'MEDIUM',
    demandSheet: '',
    demandSheetAttachments: [] as FdAttachment[],
    items: [emptyRmFormItem()]
  });

  const [uploadingAttachment, setUploadingAttachment] = useState<{ form: 'new' | 'edit'; index: number } | null>(
    null
  );
  const [uploadingDemandSheetAttachment, setUploadingDemandSheetAttachment] = useState<'new' | 'edit' | null>(null);
  const [newItemMaterialLabels, setNewItemMaterialLabels] = useState<string[]>(['']);
  const [editItemMaterialLabels, setEditItemMaterialLabels] = useState<string[]>(['']);

  const [rmListSearch, setRmListSearch] = useState('');
  /** '' | `rm:PENDING` | `oc:APPROVED` … — fase da SC ou de alguma OC */
  const [rmListFaseAtual, setRmListFaseAtual] = useState<string>('');
  const [rmListObra, setRmListObra] = useState<string>('');
  const [rmListCostCenterId, setRmListCostCenterId] = useState('');
  const [rmListDateFrom, setRmListDateFrom] = useState('');
  const [rmListDateTo, setRmListDateTo] = useState('');
  const [isListFiltersModalOpen, setIsListFiltersModalOpen] = useState(false);
  const [listCurrentPage, setListCurrentPage] = useState(1);
  const [rmCardFilter, setRmCardFilter] = useState<RmCardFilter>(DEFAULT_RM_CARD_FILTER);

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

  const { costCenters, isLoading: loadingCostCenters } = useCostCenters();
  const { isUnbUser, unbCostCenterIds } = usePermissions();

  const lockedUnbCostCenterId = useMemo(() => {
    if (!isUnbUser) return null;
    const centersWithId = costCenters.filter(
      (cc): cc is typeof cc & { id: string } => Boolean(cc.id)
    );
    return resolveLockedUnbCostCenterId(centersWithId, unbCostCenterIds);
  }, [isUnbUser, costCenters, unbCostCenterIds]);

  const { data: contractOptionsData, isLoading: loadingContracts } = useQuery({
    queryKey: ['service-order-contract-options'],
    queryFn: async () => {
      const res = await api.get('/service-orders/contract-options');
      return (res.data?.data || []) as RmContractOption[];
    },
    staleTime: 60_000,
  });

  const contractOptions = useMemo(
    () => (Array.isArray(contractOptionsData) ? contractOptionsData : []).filter((c) => c.id),
    [contractOptionsData]
  );

  const lockedUnbContractId = useMemo(() => {
    if (!isUnbUser) return null;
    return resolveLockedUnbContractId(contractOptions, lockedUnbCostCenterId);
  }, [isUnbUser, contractOptions, lockedUnbCostCenterId]);

  const { serviceOrders: newFormServiceOrders, isLoading: loadingNewFormServiceOrders } =
    useServiceOrdersByContract(formData.contractId);
  const { serviceOrders: editFormServiceOrders, isLoading: loadingEditFormServiceOrders } =
    useServiceOrdersByContract(editFormData.contractId);

  const isNewFormUnbCostCenter = useMemo(() => {
    if (isUnbUser) return true;
    const contract = contractOptions.find((c) => c.id === formData.contractId);
    return isUnbCostCenterOption(contract?.costCenter);
  }, [isUnbUser, contractOptions, formData.contractId]);

  useEffect(() => {
    if (!isNewRequestModalOpen || !lockedUnbContractId) return;
    const contract = contractOptions.find((c) => c.id === lockedUnbContractId);
    if (!contract) return;
    setFormData((prev) => {
      const nextCostCenterId = contract.costCenterId || contract.costCenter?.id || '';
      if (prev.contractId === lockedUnbContractId && prev.costCenterId === nextCostCenterId) {
        return prev;
      }
      return {
        ...prev,
        contractId: lockedUnbContractId,
        costCenterId: nextCostCenterId,
      };
    });
  }, [isNewRequestModalOpen, lockedUnbContractId, contractOptions]);

  const handleNewContractChange = (contractId: string) => {
    const contract = contractOptions.find((c) => c.id === contractId);
    setFormData((prev) => ({
      ...prev,
      contractId,
      costCenterId: contract?.costCenterId || contract?.costCenter?.id || '',
      serviceOrderId: '',
      serviceOrder: ''
    }));
  };

  const handleEditContractChange = (contractId: string) => {
    const contract = contractOptions.find((c) => c.id === contractId);
    setEditFormData((prev) => ({
      ...prev,
      contractId,
      costCenterId: contract?.costCenterId || contract?.costCenter?.id || '',
      serviceOrderId: '',
      serviceOrder: ''
    }));
  };

  const handleNewServiceOrderSelect = (serviceOrderId: string, serviceOrder: string) => {
    const os = newFormServiceOrders.find((o) => o.id === serviceOrderId);
    setFormData((prev) => ({
      ...prev,
      serviceOrderId,
      serviceOrder,
      costCenterId: os?.costCenterId || prev.costCenterId,
    }));
  };

  const handleNewServiceOrderClear = () => {
    setFormData((prev) => ({ ...prev, serviceOrderId: '', serviceOrder: '' }));
  };

  const handleEditServiceOrderSelect = (serviceOrderId: string, serviceOrder: string) => {
    const os = editFormServiceOrders.find((o) => o.id === serviceOrderId);
    setEditFormData((prev) => ({
      ...prev,
      serviceOrderId,
      serviceOrder,
      costCenterId: os?.costCenterId || prev.costCenterId,
    }));
  };

  const handleEditServiceOrderClear = () => {
    setEditFormData((prev) => ({ ...prev, serviceOrderId: '', serviceOrder: '' }));
  };

  // Buscar requisições do usuário
  const userId = userData?.data?.id as string | undefined;
  const { data: requestsData, isLoading: loadingRequests, isError: hasRequestsError, error: requestsError } = useQuery({
    queryKey: ['material-requests', userId],
    queryFn: async () => {
      const res = await api.get('/material-requests', {
        params: { requestedBy: userId, limit: 200, summary: '1' }
      });
      return res.data;
    },
    enabled: !!userId,
    refetchOnWindowFocus: true,
  });

  const { data: detailRmData, isLoading: loadingDetailRm } = useQuery({
    queryKey: ['material-request-detail', detailViewId],
    queryFn: async () => {
      const res = await api.get(`/material-requests/${detailViewId}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!detailViewId && !!userData?.data?.id
  });

  const detailRmDisplayNo = useMemo(() => {
    const fromDetail = formatRmListDisplayId(
      (detailRmData as { requestNumber?: string } | undefined)?.requestNumber
    );
    if (fromDetail && fromDetail !== '—') return fromDetail;
    const list = (requestsData?.data || []) as Array<{ id?: string; requestNumber?: string }>;
    const fromList = list.find((r) => r.id === detailViewId);
    return formatRmListDisplayId(fromList?.requestNumber) || '—';
  }, [detailRmData, detailViewId, requestsData]);

  const { data: correctionRmDetail } = useQuery({
    queryKey: ['material-request', correctionEditId],
    queryFn: async () => {
      const res = await api.get(`/material-requests/${correctionEditId}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!correctionEditId && !!userData?.data?.id
  });

  const resubmitAfterCorrectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'PENDING' });
      return res.data;
    },
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['material-requests'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['material-requests-manage'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] }),
      ]);
      toast.success('Requisição reenviada para análise.');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Não foi possível reenviar');
    }
  });

  type EditFormShape = typeof editFormData;

  const updateCorrectionMutation = useMutation({
    mutationFn: async ({
      id,
      submitForApproval,
      form
    }: {
      id: string;
      submitForApproval: boolean;
      form: EditFormShape;
    }) => {
      const res = await api.patch(`/material-requests/${id}`, {
        costCenterId: form.costCenterId,
        serviceOrderId: form.serviceOrderId || undefined,
        serviceOrder: form.serviceOrder || undefined,
        obra: form.obra || undefined,
        description: form.description,
        priority: form.priority,
        demandSheet: form.demandSheet || undefined,
        demandSheetAttachments: form.demandSheetAttachments,
        demandSheetAttachmentUrl: form.demandSheetAttachments[0]?.url || undefined,
        demandSheetAttachmentName: form.demandSheetAttachments[0]?.name || undefined,
        items: form.items.map((item) => ({
          materialId: item.materialId,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice) || 0,
          observation: item.observation,
          attachmentUrl: item.attachmentUrl || undefined,
          attachmentName: item.attachmentName || undefined
        })),
        submitForApproval
      });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['material-requests'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['material-requests-manage'], refetchType: 'all' }),
        ...(variables.submitForApproval
          ? [queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] })]
          : []),
      ]);
      setCorrectionEditId(null);
      toast.success(
        variables.submitForApproval
          ? 'Alterações salvas e requisição reenviada para aprovação.'
          : 'Alterações salvas. Você pode continuar editando ou reenviar quando estiver pronto.'
      );
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Não foi possível salvar');
    }
  });

  const closeNewRequestModal = () => {
    setShowCloseNewRequestConfirm(false);
    setIsNewRequestModalOpen(false);
    setFormData(emptyNewFormData());
    setNewItemMaterialLabels(['']);
    setUploadingAttachment(null);
    setUploadingDemandSheetAttachment(null);
  };

  const requestCloseNewRequestModal = () => {
    setShowCloseNewRequestConfirm(true);
  };

  const closeDetailModal = () => {
    setShowCloseDetailConfirm(false);
    setDetailViewId(null);
    setDetailTab('resumo');
  };

  const requestCloseDetailModal = () => {
    setShowCloseDetailConfirm(true);
  };

  // Criar requisição
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/material-requests', data);
      return res.data;
    },
    onSuccess: () => {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ['material-requests'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['material-requests-manage'], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['approval-notification-counts'] }),
      ]);
      setActiveTab('list');
      setFormData(emptyNewFormData());
      closeNewRequestModal();
      toast.success('Solicitação criada com sucesso!');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(
        error.response?.data?.message || error.response?.data?.error || 'Erro ao criar solicitação'
      );
    }
  });

  const requests = useMemo(() => {
    const raw = requestsData?.data?.requests ?? requestsData?.data ?? EMPTY_REQUEST_LIST;
    const list = Array.isArray(raw) ? raw : EMPTY_REQUEST_LIST;
    // Usuário UNB: só RMs de centros de custo UNB (reforço do filtro do backend).
    if (!isUnbUser) return list;
    if (unbCostCenterIds.length === 0) return EMPTY_REQUEST_LIST;
    const allowed = new Set(unbCostCenterIds);
    return list.filter((r: { costCenterId?: string; costCenter?: { id?: string } | null }) => {
      const id = r.costCenterId || r.costCenter?.id;
      return !!id && allowed.has(id);
    });
  }, [requestsData, isUnbUser, unbCostCenterIds]);

  const correctionNoteFromCompras = useMemo(() => {
    if (!correctionEditId) return '';
    const fromDetail = String(
      (correctionRmDetail as { rejectionReason?: string | null } | undefined)?.rejectionReason || ''
    ).trim();
    if (fromDetail) return fromDetail;
    const fromList = requests.find((x: { id: string }) => x.id === correctionEditId) as
      | { rejectionReason?: string | null }
      | undefined;
    return String(fromList?.rejectionReason || '').trim();
  }, [correctionEditId, correctionRmDetail, requests]);

  const normalizedRequests = useMemo(
    () => (Array.isArray(requests) ? requests : []) as MaterialRequest[],
    [requests]
  );

  const ordersByMaterialRequestId = useMemo(() => {
    const map = new Map<string, PurchaseOrder[]>();
    for (const request of normalizedRequests) {
      const embedded = (request as MaterialRequest & { purchaseOrders?: PurchaseOrder[] }).purchaseOrders;
      const orders = Array.isArray(embedded) ? [...embedded] : [];
      orders.sort((a, b) =>
        (b.orderNumber || '').localeCompare(a.orderNumber || '', 'pt-BR', { numeric: true })
      );
      map.set(request.id, orders);
    }
    return map;
  }, [normalizedRequests]);

  const materialRequestIdsWithOc = useMemo(() => {
    const ids = new Set<string>();
    for (const [id, orders] of Array.from(ordersByMaterialRequestId)) {
      if (orders.length > 0) ids.add(id);
    }
    return ids;
  }, [ordersByMaterialRequestId]);

  const rmStats = useMemo(
    () => ({
      total: normalizedRequests.length,
      pending: normalizedRequests.filter((r) => r.status === 'PENDING').length,
      approved: normalizedRequests.filter(
        (r) =>
          r.status === 'APPROVED' &&
          !isMaterialRequestEffectivelyCancelled(r, ordersByMaterialRequestId.get(r.id) ?? [])
      ).length,
      cancelled: normalizedRequests.filter((r) =>
        isMaterialRequestEffectivelyCancelled(r, ordersByMaterialRequestId.get(r.id) ?? [])
      ).length,
      awaitingOc: normalizedRequests.filter((r) =>
        isMaterialRequestAwaitingOc(r, ordersByMaterialRequestId.get(r.id) ?? [])
      ).length
    }),
    [normalizedRequests, ordersByMaterialRequestId]
  );

  const obraOptionsFromRequests = useMemo(() => {
    const set = new Set<string>();
    for (const r of Array.isArray(requests) ? requests : []) {
      const o = String((r as { obra?: string | null }).obra ?? '').trim();
      if (o) set.add(o);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [requests]);

  const costCenterSelectOptions = useMemo(
    () =>
      costCenters
        .filter((cc): cc is RmCostCenterOption & { id: string } => Boolean(cc.id))
        .map((cc) => ({
          value: cc.id,
          label: getCostCenterLabel(cc),
          searchText: [cc.name, cc.label, cc.code, cc.description]
            .map((part) => String(part ?? '').trim())
            .filter(Boolean)
            .join(' '),
        })),
    [costCenters]
  );

  const contractSelectOptions = useMemo(() => {
    let list = contractOptions;
    if (isUnbUser) {
      list = lockedUnbContractId
        ? list.filter((contract) => contract.id === lockedUnbContractId)
        : list.filter(
            (contract) =>
              isUnbCostCenterOption(contract.costCenter) ||
              isUnbRelatedLabel(contract.name) ||
              isUnbRelatedLabel(contract.number)
          );
    }
    return list.map((contract) => {
      const label = formatRmContractLabel(contract);
      return {
        value: contract.id,
        label,
        searchText: [contract.number, contract.name, contract.costCenter?.code, contract.costCenter?.name]
          .map((part) => String(part ?? '').trim())
          .filter(Boolean)
          .join(' '),
      };
    });
  }, [contractOptions, isUnbUser, lockedUnbContractId]);

  const rmListFaseOptions = useMemo(() => {
    const options: { value: string; label: string; searchText?: string }[] = [{ value: '', label: 'Todas' }];
    for (const st of RM_FASE_FILTER_ORDER) {
      const label = rmStatusLabelPt(st);
      options.push({ value: `rm:${st}`, label, searchText: `RM ${label}` });
    }
    for (const st of OC_FASE_FILTER_ORDER) {
      if (!(st in OC_STATUS_LABELS_PT)) continue;
      const label = purchaseOrderPhaseLabel(st);
      options.push({ value: `oc:${st}`, label, searchText: `OC ${label}` });
    }
    return options;
  }, []);

  const rmListObraOptions = useMemo(
    () => [{ value: '', label: 'Todas' }, ...obraOptionsFromRequests.map((obra) => ({ value: obra, label: obra }))],
    [obraOptionsFromRequests]
  );

  const rmListCostCenterOptions = useMemo(
    () => [{ value: '', label: 'Todos' }, ...costCenterSelectOptions],
    [costCenterSelectOptions]
  );

  const filteredRequests = useMemo(() => {
    let list = Array.isArray(requests) ? [...requests] : [];
    if (rmListFaseAtual) {
      list = list.filter((r: { status?: string; purchaseOrders?: MaterialRequestOcListPurchaseOrder[] }) =>
        requestMatchesFaseAtualFilter(r, rmListFaseAtual)
      );
    }
    if (rmListObra) {
      list = list.filter((r: { obra?: string | null }) => String(r.obra ?? '').trim() === rmListObra);
    }
    if (rmListCostCenterId) {
      list = list.filter((r: { costCenterId?: string; costCenter?: { id?: string } | null }) => {
        const id = r.costCenterId || r.costCenter?.id;
        return id === rmListCostCenterId;
      });
    }
    if (rmListDateFrom || rmListDateTo) {
      list = list.filter((r: { requestedAt?: string }) => {
        const ymd = toYmdLocal(r.requestedAt);
        if (!ymd) return false;
        if (rmListDateFrom && ymd < rmListDateFrom) return false;
        if (rmListDateTo && ymd > rmListDateTo) return false;
        return true;
      });
    }
    if (rmCardFilter !== 'all') {
      list = list.filter((r: { id: string; status?: string }) => {
        const orders = ordersByMaterialRequestId.get(r.id) ?? [];
        return matchesRmCardFilter(
          r as MaterialRequest,
          rmCardFilter,
          materialRequestIdsWithOc,
          orders
        );
      });
    }
    const q = rmListSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((req: Record<string, unknown>) => {
        const rn = String(req.requestNumber ?? '').toLowerCase();
        const os = rmOsLine(req as Parameters<typeof rmOsLine>[0]).toLowerCase();
        const obra = String(req.obra ?? '').toLowerCase();
        const desc = String(req.description ?? '').toLowerCase();
        const ccLine = rmCostCenterLine(req as Parameters<typeof rmCostCenterLine>[0]).toLowerCase();
        return (
          rn.includes(q) || os.includes(q) || obra.includes(q) || desc.includes(q) || ccLine.includes(q)
        );
      });
    }
    list.sort((a: { requestedAt?: string }, b: { requestedAt?: string }) => {
      const ta = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const tb = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return tb - ta;
    });
    return list;
  }, [
    requests,
    rmListSearch,
    rmListFaseAtual,
    rmListObra,
    rmListCostCenterId,
    rmListDateFrom,
    rmListDateTo,
    rmCardFilter,
    ordersByMaterialRequestId,
    materialRequestIdsWithOc
  ]);

  const listTotal = filteredRequests.length;
  const listTotalPages = Math.max(1, Math.ceil(listTotal / LIST_ITEMS_PER_PAGE));
  const listStartIndex = (listCurrentPage - 1) * LIST_ITEMS_PER_PAGE;
  const paginatedRequests = filteredRequests.slice(listStartIndex, listStartIndex + LIST_ITEMS_PER_PAGE);
  const listStartItem = listTotal === 0 ? 0 : listStartIndex + 1;
  const listEndItem = Math.min(listStartIndex + LIST_ITEMS_PER_PAGE, listTotal);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(
    paginatedRequests as Array<{ id: string; status?: string }>
  );

  const clearListFilters = () => {
    setRmListFaseAtual('');
    setRmListObra('');
    setRmListCostCenterId('');
    setRmListDateFrom('');
    setRmListDateTo('');
    setRmCardFilter(DEFAULT_RM_CARD_FILTER);
    setListCurrentPage(1);
  };

  useEffect(() => {
    setListCurrentPage(1);
  }, [
    rmListSearch,
    rmListFaseAtual,
    rmListObra,
    rmListCostCenterId,
    rmListDateFrom,
    rmListDateTo,
    rmCardFilter
  ]);

  useEffect(() => {
    if (listCurrentPage > listTotalPages) {
      setListCurrentPage(listTotalPages);
    }
  }, [listCurrentPage, listTotalPages]);

  useEffect(() => {
    const id = searchParams?.get('editRm') ?? null;
    if (!id) return;
    setCorrectionEditId(id);
    router.replace('/ponto/solicitar-materiais', { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    if (!correctionEditId) return;
    const fromList = requests.find((x: { id: string }) => x.id === correctionEditId);
    const r = (correctionRmDetail as typeof fromList | undefined) || fromList;
    if (!r) return;
    const itemsFromApi = Array.isArray(r.items) ? r.items : [];
    const rmServiceOrderId = String((r as { serviceOrderId?: string }).serviceOrderId || '').trim();
    const rmServiceOrderText =
      (r as { serviceOrder?: string }).serviceOrder?.trim()
        ? String((r as { serviceOrder?: string }).serviceOrder)
        : (r as { projectId?: string }).projectId && (r as { project?: { code?: string; name?: string } }).project
          ? String(
              (r as { project?: { code?: string; name?: string } }).project?.code ||
                (r as { project?: { code?: string; name?: string } }).project?.name ||
                ''
            )
          : '';
    setEditFormData({
      contractId: '',
      costCenterId: (r as { costCenterId?: string }).costCenterId || (r as { costCenter?: { id?: string } }).costCenter?.id || '',
      serviceOrderId: rmServiceOrderId,
      serviceOrder: rmServiceOrderText,
      obra: String((r as { obra?: string }).obra || ''),
      description: (r.description as string) || '',
      priority: (r.priority as string) || 'MEDIUM',
      demandSheet: String((r as { demandSheet?: string }).demandSheet || ''),
      demandSheetAttachments: parseFdAttachments(r as Parameters<typeof parseFdAttachments>[0]),
      items:
        itemsFromApi.length > 0
          ? itemsFromApi.map(
              (it: {
                materialId?: string;
                material?: { id?: string; unit?: string; name?: string; description?: string };
                quantity?: unknown;
                unit?: string;
                unitPrice?: unknown;
                notes?: string | null;
                attachmentUrl?: string | null;
                attachmentName?: string | null;
              }) => ({
                materialId: it.materialId || it.material?.id || '',
                quantity: (() => {
                  const q = Number(it.quantity);
                  return Number.isFinite(q) && q > 0 ? q : 1;
                })(),
                unit: it.unit || it.material?.unit || '',
                unitPrice: (() => {
                  const p = Number(it.unitPrice);
                  return Number.isFinite(p) && p >= 0 ? Math.round(p * 100) / 100 : 0;
                })(),
                observation: it.notes || '',
                attachmentUrl: it.attachmentUrl || '',
                attachmentName: it.attachmentName || ''
              })
            )
          : [emptyRmFormItem()]
    });
    setEditItemMaterialLabels(
      itemsFromApi.length > 0
        ? itemsFromApi.map(
            (it: { material?: { name?: string; description?: string } }) =>
              it.material?.name?.trim() || it.material?.description?.trim() || ''
          )
        : ['']
    );
  }, [correctionEditId, correctionRmDetail, requests]);

  useEffect(() => {
    if (!correctionEditId || editFormData.serviceOrderId) return;
    const text = editFormData.serviceOrder.trim();
    if (!text || editFormServiceOrders.length === 0) return;
    const match = editFormServiceOrders.find((o) => o.label.trim() === text);
    if (match) {
      setEditFormData((prev) => ({ ...prev, serviceOrderId: match.id }));
    }
  }, [correctionEditId, editFormData.serviceOrder, editFormData.serviceOrderId, editFormServiceOrders]);

  const { data: linkedContractForEdit } = useQuery({
    queryKey: ['service-order-linked-contract', editFormData.serviceOrderId],
    queryFn: async () => {
      const res = await api.get('/service-orders/linked-contract', {
        params: { serviceOrderId: editFormData.serviceOrderId },
      });
      return res.data?.data as { contractId: string; costCenterId: string } | null;
    },
    enabled: !!correctionEditId && !!editFormData.serviceOrderId.trim() && !editFormData.contractId.trim(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!linkedContractForEdit?.contractId) return;
    setEditFormData((prev) => {
      if (prev.contractId) return prev;
      return {
        ...prev,
        contractId: linkedContractForEdit.contractId,
        costCenterId: linkedContractForEdit.costCenterId || prev.costCenterId,
      };
    });
  }, [linkedContractForEdit]);

  useEffect(() => {
    if (!correctionEditId || editFormData.contractId || !editFormData.costCenterId) return;
    if (editFormData.serviceOrderId) return;
    const matches = contractOptions.filter((c) => c.costCenterId === editFormData.costCenterId);
    if (matches.length === 1) {
      setEditFormData((prev) => ({ ...prev, contractId: matches[0].id }));
    }
  }, [
    correctionEditId,
    editFormData.contractId,
    editFormData.costCenterId,
    editFormData.serviceOrderId,
    contractOptions,
  ]);

  useEffect(() => {
    if (!isNewRequestModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCloseNewRequestConfirm) {
          setShowCloseNewRequestConfirm(false);
          return;
        }
        requestCloseNewRequestModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNewRequestModalOpen, showCloseNewRequestConfirm]);

  useEffect(() => {
    if (!detailViewId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showCloseDetailConfirm) {
          setShowCloseDetailConfirm(false);
          return;
        }
        requestCloseDetailModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailViewId, showCloseDetailConfirm]);


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

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [...formData.items, emptyRmFormItem()]
    });
    setNewItemMaterialLabels((prev) => [...prev, '']);
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
    setNewItemMaterialLabels((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: unknown) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    setFormData({ ...formData, items: newItems });
  };

  const handleNewItemMaterialSelect = (index: number, material: RmMaterialListItem) => {
    const newItems = [...formData.items];
    newItems[index] = {
      ...newItems[index],
      materialId: material.id,
      unit: material.unit || '',
      unitPrice: defaultUnitPriceFromMaterial(material),
    };
    setFormData({ ...formData, items: newItems });
    setNewItemMaterialLabels((prev) => {
      const next = [...prev];
      next[index] = getRmMaterialLabel(material);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateNewMaterialRequestForm(formData, {
      demandSheetOptional: isNewFormUnbCostCenter
    });
    if (validationError) {
      toast.error(validationError);
      return;
    }
    createMutation.mutate({
      costCenterId: formData.costCenterId,
      serviceOrderId: formData.serviceOrderId,
      serviceOrder: formData.serviceOrder || undefined,
      obra: formData.obra.trim() || undefined,
      description: formData.description,
      priority: formData.priority,
      demandSheet: formData.demandSheet.trim(),
      demandSheetAttachments: formData.demandSheetAttachments,
      demandSheetAttachmentUrl: formData.demandSheetAttachments[0]?.url || undefined,
      demandSheetAttachmentName: formData.demandSheetAttachments[0]?.name || undefined,
      items: formData.items
        .filter((item) => item.materialId)
        .map((item) => ({
        materialId: item.materialId,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice) || 0,
        observation: item.observation.trim() || undefined,
        attachmentUrl: item.attachmentUrl?.trim() || undefined,
        attachmentName: item.attachmentName?.trim() || undefined
      }))
    });
  };

  const handleEditAddItem = () => {
    setEditFormData((prev) => ({
      ...prev,
      items: [...prev.items, emptyRmFormItem()]
    }));
    setEditItemMaterialLabels((prev) => [...prev, '']);
  };

  const handleItemAttachmentFile = async (form: 'new' | 'edit', index: number, file: File | null) => {
    if (!file) return;
    setUploadingAttachment({ form, index });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/material-requests/upload-item-attachment', fd);
      const d = res.data?.data as { url?: string; originalName?: string } | undefined;
      if (!d?.url) throw new Error('Resposta inválida do servidor');
      if (form === 'new') {
        setFormData((prev) => {
          const next = [...prev.items];
          next[index] = {
            ...next[index],
            attachmentUrl: d.url!,
            attachmentName: fixMojibakeFileName(d.originalName || file.name) || ''
          };
          return { ...prev, items: next };
        });
      } else {
        setEditFormData((prev) => {
          const next = [...prev.items];
          next[index] = {
            ...next[index],
            attachmentUrl: d.url!,
            attachmentName: fixMojibakeFileName(d.originalName || file.name) || ''
          };
          return { ...prev, items: next };
        });
      }
      toast.success('Anexo enviado');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Não foi possível enviar o anexo');
    } finally {
      setUploadingAttachment(null);
    }
  };

  const clearItemAttachment = (form: 'new' | 'edit', index: number) => {
    if (form === 'new') {
      setFormData((prev) => {
        const next = [...prev.items];
        next[index] = { ...next[index], attachmentUrl: '', attachmentName: '' };
        return { ...prev, items: next };
      });
    } else {
      setEditFormData((prev) => {
        const next = [...prev.items];
        next[index] = { ...next[index], attachmentUrl: '', attachmentName: '' };
        return { ...prev, items: next };
      });
    }
  };

  const handleDemandSheetAttachmentFiles = async (form: 'new' | 'edit', files: File[]) => {
    if (!files.length) return;
    setUploadingDemandSheetAttachment(form);
    try {
      const uploaded: FdAttachment[] = [];
      for (const file of files) {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post('/material-requests/upload-item-attachment', fd);
        const d = res.data?.data as { url?: string; originalName?: string } | undefined;
        if (!d?.url) throw new Error('Resposta inválida do servidor');
        uploaded.push({
          url: d.url,
          name: fixMojibakeFileName(d.originalName || file.name) || 'Arquivo anexado',
        });
      }
      if (form === 'new') {
        setFormData((prev) => ({
          ...prev,
          demandSheetAttachments: [...prev.demandSheetAttachments, ...uploaded],
        }));
      } else {
        setEditFormData((prev) => ({
          ...prev,
          demandSheetAttachments: [...prev.demandSheetAttachments, ...uploaded],
        }));
      }
      toast.success(
        uploaded.length > 1 ? `${uploaded.length} arquivos enviados` : 'Arquivo enviado'
      );
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Não foi possível enviar o arquivo');
    } finally {
      setUploadingDemandSheetAttachment(null);
    }
  };

  const removeDemandSheetAttachment = (form: 'new' | 'edit', index: number) => {
    if (form === 'new') {
      setFormData((prev) => ({
        ...prev,
        demandSheetAttachments: prev.demandSheetAttachments.filter((_, i) => i !== index),
      }));
    } else {
      setEditFormData((prev) => ({
        ...prev,
        demandSheetAttachments: prev.demandSheetAttachments.filter((_, i) => i !== index),
      }));
    }
  };

  const handleEditRemoveItem = (index: number) => {
    setEditFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
    setEditItemMaterialLabels((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditItemChange = (index: number, field: string, value: unknown) => {
    setEditFormData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      return { ...prev, items: newItems };
    });
  };

  const handleEditItemMaterialSelect = (index: number, material: RmMaterialListItem) => {
    setEditFormData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = {
        ...newItems[index],
        materialId: material.id,
        unit: material.unit || '',
        unitPrice: defaultUnitPriceFromMaterial(material),
      };
      return { ...prev, items: newItems };
    });
    setEditItemMaterialLabels((prev) => {
      const next = [...prev];
      next[index] = getRmMaterialLabel(material);
      return next;
    });
  };

  const submitCorrectionEdit = (submitForApproval: boolean) => {
    if (!correctionEditId) return;
    if (!editFormData.contractId) {
      toast.error('Selecione o contrato.');
      return;
    }
    if (!editFormData.costCenterId) {
      toast.error('Contrato sem centro de custo vinculado.');
      return;
    }
    if (!editFormData.serviceOrderId) {
      toast.error('Selecione a ordem de serviço.');
      return;
    }
    const validItems = editFormData.items.filter((i) => i.materialId);
    if (validItems.length === 0) {
      toast.error('Inclua ao menos um material.');
      return;
    }
    updateCorrectionMutation.mutate({
      id: correctionEditId,
      submitForApproval,
      form: editFormData
    });
  };

  return (
    <ProtectedRoute route="/ponto/solicitar-materiais">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Cabeçalho */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Solicitação de Materiais</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Solicite materiais para seus projetos</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
            {RM_STAT_CARDS.map((card) => (
              <FilterStatCard
                key={card.filter}
                label={card.label}
                count={rmStats[card.countKey]}
                icon={card.Icon}
                iconBg={card.iconBg}
                iconColor={card.iconColor}
                isActive={rmCardFilter === card.filter}
                loading={loadingRequests}
                onClick={() => setRmCardFilter(card.filter)}
              />
            ))}
          </div>

          <Card>
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0">
                    <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Minhas Solicitações</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Visualize suas solicitações de materiais
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      value={rmListSearch}
                      onChange={(e) => setRmListSearch(e.target.value)}
                      placeholder="RM, OS, obra, contrato..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {rmListSearch && (
                      <button
                        type="button"
                        onClick={() => setRmListSearch('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsListFiltersModalOpen(true)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-label="Abrir filtro"
                    title="Filtro"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNewRequestModalOpen(true)}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova Solicitação</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingRequests ? (
                <div className="text-center py-8">
                  <Loading message="Carregando solicitações..." />
                </div>
              ) : hasRequestsError ? (
                <div className="text-center py-8">
                  <p className="text-red-600 dark:text-red-400">
                    Não foi possível carregar suas solicitações.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {(requestsError as any)?.response?.data?.message ||
                      'Verifique se as migrations do backend foram aplicadas e tente novamente.'}
                  </p>
                </div>
              ) : requests.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingCart className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">Nenhuma solicitação encontrada</p>
                </div>
              ) : listTotal === 0 ? (
                <div className="text-center py-8 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Nenhuma solicitação corresponde aos filtros.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setRmListSearch('');
                      clearListFilters();
                    }}
                    className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Limpar filtros
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {listStartItem} a {listEndItem} de {listTotal} solicitação(ões)
                    </span>
                    <span>
                      Página {listCurrentPage} de {listTotalPages}
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="w-[4%] min-w-[3rem] max-w-[4.5rem] px-2 sm:px-3 py-4 !pl-2 sm:!pl-3 !pr-1 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            RM
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            Data
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Contrato
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            OS
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            Obra
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap min-w-[100px]">
                            Status
                          </th>
                          <th className="w-[7%] min-w-[4.5rem] px-2 sm:px-3 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            Itens
                          </th>
                          <th className="w-[9%] min-w-[5.5rem] px-2 sm:px-3 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            Tipo
                          </th>
                          <th className="w-[4%] min-w-[3rem] max-w-[4.5rem] px-2 sm:px-3 py-4 !pl-2 sm:!pl-3 !pr-1 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            OC
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap min-w-[120px]">
                            Status OC
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedRequests.map(
                          (
                            request: Record<string, unknown> & {
                              id: string;
                              status?: string;
                              items?: Array<{ id: string }>;
                              _count?: { items?: number };
                              itemProductKinds?: string[];
                              purchaseOrders?: MaterialRequestOcListPurchaseOrder[];
                            }
                          ) => {
                            const rmFase = materialRequestRmFaseAtual(request);
                            const pos = Array.isArray(request.purchaseOrders)
                              ? request.purchaseOrders
                              : [];
                            const ocRows = materialRequestOcListRows(request, pos);
                            const { total: itemTotal, pending: itemPending } =
                              getRmItemCoverageCounts(
                                {
                                  id: request.id,
                                  status: String(request.status || ''),
                                  items: request.items,
                                  _count: request._count,
                                  purchaseOrders: pos
                                },
                                pos
                              );
                            const showPendingLine =
                              request.status === 'APPROVED' &&
                              !isMaterialRequestEffectivelyCancelled(
                                { status: String(request.status || '') } as MaterialRequest,
                                pos as Parameters<typeof isMaterialRequestEffectivelyCancelled>[1]
                              ) &&
                              itemPending != null &&
                              itemPending > 0;
                            const tipoLabel = formatRmItemProductKinds(request.itemProductKinds);
                            return (
                            <tr
                              key={request.id}
                              onClick={() => {
                                setDetailTab('resumo');
                                setDetailViewId(request.id);
                              }}
                              className={getListTableRowClassName(true)}
                            >
                              <td
                                className={`${cadastroListClasses.tdMono} w-[4%] min-w-[3rem] max-w-[4.5rem] text-center !pl-2 sm:!pl-3 !pr-1 py-3`}
                                title={request.requestNumber ? String(request.requestNumber) : undefined}
                              >
                                <ListRowNavigableLabel className="font-medium">
                                  {formatRmListDisplayId(
                                    request.requestNumber ? String(request.requestNumber) : null
                                  )}
                                </ListRowNavigableLabel>
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-center text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {request.requestedAt
                                  ? new Date(String(request.requestedAt)).toLocaleDateString('pt-BR')
                                  : '—'}
                              </td>
                              <td
                                className="px-3 sm:px-6 py-3 text-center text-sm text-gray-700 dark:text-gray-300 max-w-[200px]"
                                title={rmContractName(request as Parameters<typeof rmContractName>[0])}
                              >
                                <span className="line-clamp-2">
                                  {rmContractName(request as Parameters<typeof rmContractName>[0])}
                                </span>
                              </td>
                              <td
                                className="px-3 sm:px-6 py-3 text-center text-sm text-gray-700 dark:text-gray-300 max-w-[120px] truncate"
                                title={rmOsLine(request as Parameters<typeof rmOsLine>[0])}
                              >
                                {rmOsLine(request as Parameters<typeof rmOsLine>[0])}
                              </td>
                              <td
                                className="px-3 sm:px-6 py-3 text-center text-sm text-gray-700 dark:text-gray-300 max-w-[120px] truncate"
                                title={String(request.obra || '')}
                              >
                                {request.obra ? String(request.obra) : '—'}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-center align-middle">
                                <span className={rmFase.badgeClassName} title={rmFase.text}>
                                  {rmFase.text}
                                </span>
                              </td>
                              <td className="w-[7%] min-w-[4.5rem] px-2 sm:px-3 py-3 text-center align-middle">
                                {itemTotal == null ? (
                                  <span className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">
                                    —
                                  </span>
                                ) : (
                                  <div className="flex flex-col items-center justify-center gap-0.5 leading-tight">
                                    <span className="text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                                      {itemTotal}
                                    </span>
                                    {showPendingLine ? (
                                      <span
                                        className="text-[11px] font-medium text-amber-700 dark:text-amber-300 whitespace-nowrap"
                                        title={`${itemPending} item(ns) ainda sem ordem de compra`}
                                      >
                                        {itemPending} pendente{itemPending === 1 ? '' : 's'}
                                      </span>
                                    ) : null}
                                  </div>
                                )}
                              </td>
                              <td
                                className="w-[9%] min-w-[5.5rem] px-2 sm:px-3 py-3 text-center align-middle"
                                title={tipoLabel === '—' ? undefined : tipoLabel}
                              >
                                {tipoLabel === '—' ? (
                                  <span className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">
                                    —
                                  </span>
                                ) : (
                                  <span className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-200 whitespace-nowrap">
                                    {tipoLabel}
                                  </span>
                                )}
                              </td>
                              <td className={`${cadastroListClasses.tdMono} w-[4%] min-w-[3rem] max-w-[4.5rem] text-center !pl-2 sm:!pl-3 !pr-1 py-3 align-middle`}>
                                {ocRows.length === 0 ? (
                                  <span className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">—</span>
                                ) : (
                                  <div className="flex flex-col items-center justify-center gap-0.5 text-xs sm:text-sm">
                                    {ocRows.map((row) => (
                                      <span
                                        key={row.key}
                                        className="font-medium whitespace-nowrap"
                                        title={row.idTitle}
                                      >
                                        {row.id}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-center align-middle">
                                {ocRows.length === 0 ? (
                                  <span className="text-xs sm:text-sm text-gray-400 dark:text-gray-500">—</span>
                                ) : (
                                  <div className="flex flex-col items-center justify-center gap-1">
                                    {ocRows.map((row) => (
                                      <span
                                        key={row.key}
                                        className={row.statusBadgeClassName}
                                        title={row.status}
                                      >
                                        {row.status}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </td>
                              <RowActionMenuCell
                                align="center"
                                isOpen={isRowMenuOpen(request.id)}
                                onToggle={(e) =>
                                  toggleRowActionMenu(request.id, e.currentTarget as HTMLButtonElement)
                                }
                              />
                            </tr>
                            );
                          }
                        )}
                      </tbody>
                    </table>
                  </div>
                  {rowActionMenu && rowForActionMenu ? (
                    <RowActionMenuPortal
                      menu={rowActionMenu}
                      onClose={closeRowActionMenu}
                      onEdit={() => {}}
                      onDelete={() => {}}
                      hideDefaultActions
                      extraItems={[
                        {
                          label: 'Ver detalhes',
                          onClick: () => {
                            setDetailTab('resumo');
                            setDetailViewId(rowForActionMenu.id);
                          },
                          icon: <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        },
                        ...(rowForActionMenu.status === 'IN_REVIEW'
                          ? [
                              {
                                label: 'Editar correção',
                                onClick: () => setCorrectionEditId(rowForActionMenu.id),
                                icon: (
                                  <Pencil className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
                                )
                              },
                              {
                                label: 'Reenviar',
                                onClick: () => resubmitAfterCorrectionMutation.mutate(rowForActionMenu.id),
                                disabled: resubmitAfterCorrectionMutation.isPending,
                                disabledTitle: 'Enviando...',
                                icon: <Send className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                              }
                            ]
                          : [])
                      ]}
                    />
                  ) : null}
                  <ListPagination
                    currentPage={listCurrentPage}
                    totalPages={listTotalPages}
                    onPageChange={setListCurrentPage}
                  />
                </>
              )}
            </CardContent>
          </Card>

          {isListFiltersModalOpen && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setIsListFiltersModalOpen(false)} aria-hidden />
              <div className="relative mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                  <button
                    type="button"
                    onClick={() => setIsListFiltersModalOpen(false)}
                    className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    aria-label="Fechar filtros"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Fase atual
                      </label>
                      <SingleSelectSearchDropdown
                        value={rmListFaseAtual}
                        onChange={setRmListFaseAtual}
                        options={rmListFaseOptions}
                        allowEmpty={false}
                        placeholder="Todas"
                        searchPlaceholder="Pesquisar fase..."
                        emptyOptionLabel="Todas"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Obra</label>
                      <SingleSelectSearchDropdown
                        value={rmListObra}
                        onChange={setRmListObra}
                        options={rmListObraOptions}
                        allowEmpty={false}
                        placeholder="Todas"
                        searchPlaceholder="Pesquisar obra..."
                        emptyOptionLabel="Todas"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Contrato
                      </label>
                      {loadingCostCenters ? (
                        <div className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800">
                          Carregando...
                        </div>
                      ) : (
                        <SingleSelectSearchDropdown
                          value={rmListCostCenterId}
                          onChange={setRmListCostCenterId}
                          options={rmListCostCenterOptions}
                          allowEmpty={false}
                          placeholder="Todos"
                          searchPlaceholder="Pesquisar contrato..."
                          emptyOptionLabel="Todos"
                          emptyOptionsMessage="Nenhum contrato disponível."
                        />
                      )}
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Data inicial
                      </label>
                      <input
                        type="date"
                        value={rmListDateFrom}
                        onChange={(e) => setRmListDateFrom(e.target.value)}
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Data final
                      </label>
                      <input
                        type="date"
                        value={rmListDateTo}
                        onChange={(e) => setRmListDateTo(e.target.value)}
                        className={FORM_FIELD_INPUT_CLS}
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 sm:col-span-2">
                      Período pela data da solicitação (fuso local).
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={clearListFilters}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Limpar filtros
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsListFiltersModalOpen(false)}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}

          {isNewRequestModalOpen && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto p-4">
              <div
                className="absolute inset-0 bg-black/50"
                onClick={requestCloseNewRequestModal}
                aria-hidden
              />
              <div
                className="relative my-auto flex max-h-[min(92dvh,calc(100dvh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800"
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-request-modal-title"
              >
                <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
                  <h3
                    id="new-request-modal-title"
                    className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Nova Solicitação de Material
                  </h3>
                  <button
                    type="button"
                    onClick={requestCloseNewRequestModal}
                    className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    aria-label="Fechar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form
                  onSubmit={handleSubmit}
                  className="flex min-h-0 flex-1 flex-col [&_*:focus]:outline-none [&_*:focus]:ring-0 [&_*:focus-visible]:outline-none [&_*:focus-visible]:ring-0"
                >
                  <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                    <RmFormSection title="Dados da solicitação">
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                          <label className={RM_FORM_LABEL_CLS}>Contrato *</label>
                          {loadingContracts ? (
                            <SingleSelectSearchDropdown
                              value=""
                              onChange={() => undefined}
                              options={[]}
                              disabled
                              placeholder="Carregando contratos..."
                              allowEmpty={false}
                            />
                          ) : (
                            <>
                              <SingleSelectSearchDropdown
                                value={formData.contractId}
                                onChange={handleNewContractChange}
                                options={contractSelectOptions}
                                allowEmpty={false}
                                disabled={Boolean(lockedUnbContractId)}
                                placeholder="Digite para buscar contrato..."
                                searchPlaceholder="Pesquisar contrato..."
                                emptyOptionsMessage="Nenhum contrato disponível."
                                emptySearchMessage="Nenhum contrato encontrado para esta busca."
                              />
                              <input type="hidden" required value={formData.contractId} readOnly />
                            </>
                          )}
                          {!loadingContracts && contractOptions.length === 0 && (
                            <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                              Nenhum contrato disponível. Cadastre contratos em Contratos.
                            </p>
                          )}
                        </div>
                        <div>
                          <label className={RM_FORM_LABEL_CLS}>Ordem de Serviço *</label>
                          <ServiceOrderSearchSelect
                            contractId={formData.contractId}
                            serviceOrders={newFormServiceOrders}
                            loading={loadingNewFormServiceOrders}
                            serviceOrderId={formData.serviceOrderId}
                            serviceOrderLabel={formData.serviceOrder}
                            onSelect={handleNewServiceOrderSelect}
                            onClear={handleNewServiceOrderClear}
                            required
                          />
                          <input type="hidden" required value={formData.serviceOrderId} readOnly />
                        </div>
                        <div>
                          <label className={RM_FORM_LABEL_CLS}>Obra</label>
                          <input
                            type="text"
                            value={formData.obra}
                            onChange={(e) => setFormData({ ...formData, obra: e.target.value })}
                            className={FORM_FIELD_INPUT_CLS}
                            placeholder="Identificação da obra (opcional)"
                          />
                        </div>
                        <div>
                          <label className={RM_FORM_LABEL_CLS}>Prioridade *</label>
                          <SingleSelectSearchDropdown
                            value={formData.priority}
                            onChange={(priority) => setFormData({ ...formData, priority })}
                            options={RM_PRIORITY_OPTIONS}
                            allowEmpty={false}
                            placeholder="Selecionar prioridade..."
                            searchPlaceholder="Pesquisar prioridade..."
                          />
                        </div>
                      </div>
                      <div>
                        <label className={RM_FORM_LABEL_CLS}>Descrição</label>
                        <textarea
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          rows={3}
                          className={FORM_FIELD_TEXTAREA_CLS}
                          placeholder="Descreva a necessidade dos materiais..."
                        />
                      </div>
                    </RmFormSection>

                    <RmFormSection
                      title="Ficha de demanda"
                      description={
                        isNewFormUnbCostCenter
                          ? 'Número opcional para este contrato.'
                          : 'Informe o número ou referência da FD.'
                      }
                    >
                      <div>
                        <label className={RM_FORM_LABEL_CLS}>
                          Número da FD{isNewFormUnbCostCenter ? '' : ' *'}
                        </label>
                        <input
                          type="text"
                          required={!isNewFormUnbCostCenter}
                          value={formData.demandSheet}
                          onChange={(e) => setFormData({ ...formData, demandSheet: e.target.value })}
                          className={FORM_FIELD_INPUT_CLS}
                          placeholder={
                            isNewFormUnbCostCenter
                              ? 'Número ou referência da FD (opcional)'
                              : 'Número ou referência da FD'
                          }
                        />
                      </div>
                    </RmFormSection>

                    <RmFormSection
                      title="Documentos"
                      description={
                        isNewFormUnbCostCenter
                          ? 'Anexe arquivos da solicitação, se houver (opcional).'
                          : 'Anexe os documentos da solicitação (FD, orçamento, etc.). Obrigatório.'
                      }
                    >
                      <RmDemandSheetAttachmentsField
                        files={formData.demandSheetAttachments}
                        uploading={uploadingDemandSheetAttachment === 'new'}
                        disabled={!!uploadingDemandSheetAttachment}
                        onFilesSelect={(files) => void handleDemandSheetAttachmentFiles('new', files)}
                        onRemove={(index) => removeDemandSheetAttachment('new', index)}
                        chooseLabel="Adicionar arquivo"
                        addLabel="Adicionar arquivo"
                      />
                      {!isNewFormUnbCostCenter ? (
                        <input
                          type="hidden"
                          required
                          value={formData.demandSheetAttachments[0]?.url || ''}
                          readOnly
                        />
                      ) : null}
                    </RmFormSection>

                    <RmFormSection title={`Itens (${formData.items.length})`}>
                      <div className="space-y-3">
                        {formData.items.map((item, index) => (
                          <div
                            key={index}
                            className="rounded-xl border border-gray-200 p-3.5 dark:border-gray-700"
                          >
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Item {index + 1}
                              </span>
                              {formData.items.length > 1 ? (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(index)}
                                  className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                  aria-label={`Remover item ${index + 1}`}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                            <div className="space-y-3">
                              <div>
                                <label className={RM_FORM_FIELD_LABEL_CLS}>Material *</label>
                                <AsyncSearchSelectDropdown<RmMaterialListItem>
                                  value={item.materialId}
                                  selectedLabel={newItemMaterialLabels[index]}
                                  onChange={(material) => handleNewItemMaterialSelect(index, material)}
                                  searchFn={searchRmMaterials}
                                  getOptionId={(m) => m.id}
                                  getOptionLabel={getRmMaterialLabel}
                                  placeholder="Digite para buscar material..."
                                  noFocusRing
                                  queryKeyPrefix="rm-materials-search"
                                />
                                <input type="hidden" required value={item.materialId} readOnly />
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                                <div className="sm:col-span-1">
                                  <label className={RM_FORM_FIELD_LABEL_CLS}>Qtd *</label>
                                  <RmQuantityInput
                                    required
                                    value={item.quantity}
                                    unit={item.unit}
                                    onChange={(quantity) =>
                                      handleItemChange(index, 'quantity', quantity)
                                    }
                                  />
                                </div>
                                <div className="sm:col-span-3">
                                  <label className={RM_FORM_FIELD_LABEL_CLS}>Observação</label>
                                  <input
                                    type="text"
                                    value={item.observation}
                                    onChange={(e) =>
                                      handleItemChange(index, 'observation', e.target.value)
                                    }
                                    className={FORM_FIELD_INPUT_CLS}
                                    placeholder="Opcional"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                  <label className={RM_FORM_FIELD_LABEL_CLS}>Valor referência</label>
                                  <div className="relative">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={formatCurrencyInputBrFromNumber(item.unitPrice)}
                                      onChange={(e) => {
                                        const masked = maskCurrencyInputBrOrEmpty(e.target.value);
                                        handleItemChange(
                                          index,
                                          'unitPrice',
                                          parseCurrencyInputBr(masked) ?? 0
                                        );
                                      }}
                                      className={`${FORM_FIELD_INPUT_CLS} pr-9`}
                                      placeholder="R$ 0,00"
                                    />
                                    <RmUnitPriceInfoIcon />
                                  </div>
                                </div>
                                <div>
                                  <label className={RM_FORM_FIELD_LABEL_CLS}>Valor total</label>
                                  <input
                                    type="text"
                                    readOnly
                                    tabIndex={-1}
                                    value={formatCurrencyInputBrFromNumber(rmItemLineTotal(item))}
                                    className={`${FORM_FIELD_INPUT_CLS} cursor-default bg-gray-50 dark:bg-gray-800/80`}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className={RM_FORM_FIELD_LABEL_CLS}>Anexo</label>
                                <RmAttachmentField
                                  fileUrl={item.attachmentUrl}
                                  fileName={item.attachmentName}
                                  uploading={
                                    uploadingAttachment?.form === 'new' &&
                                    uploadingAttachment.index === index
                                  }
                                  disabled={!!uploadingAttachment}
                                  onFileSelect={(file) =>
                                    void handleItemAttachmentFile('new', index, file)
                                  }
                                  onRemove={() => clearItemAttachment('new', index)}
                                  chooseLabel="Adicionar anexo"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={handleAddItem}
                          className={RM_ADD_ITEM_BTN_CLS}
                        >
                          <Plus className="h-4 w-4" />
                          Adicionar item
                        </button>
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Total da solicitação
                          </span>
                          <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {formatCurrencyInputBrFromNumber(rmRequestItemsTotal(formData.items))}
                          </span>
                        </div>
                      </div>
                    </RmFormSection>

                    {createMutation.isError ? (
                      <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
                        <p className="text-sm text-red-700 dark:text-red-300">
                          {(createMutation.error as any)?.response?.data?.message ||
                            'Erro ao criar solicitação'}
                        </p>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={requestCloseNewRequestModal}
                      className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
                    >
                      {createMutation.isPending ? 'Criando...' : 'Criar Solicitação'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>

        {detailViewId && (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto p-4">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={requestCloseDetailModal}
              aria-hidden
            />
            <div
              className="relative my-auto flex max-h-[min(92dvh,calc(100dvh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800"
              role="dialog"
              aria-modal="true"
              aria-labelledby="rm-detail-modal-title"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
                <div className="min-w-0">
                  <h3
                    id="rm-detail-modal-title"
                    className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Requisição de Material No. {detailRmDisplayNo}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={requestCloseDetailModal}
                  className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {!loadingDetailRm && detailRmData ? (
                <div
                  className="shrink-0 border-b border-gray-200 px-5 dark:border-gray-700"
                  role="tablist"
                  aria-label="Seções da solicitação"
                >
                  <div className="table-scroll -mb-px flex gap-1">
                    {SOLICITACAO_DETAIL_TABS.map((tab) => {
                      const active = detailTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => setDetailTab(tab.id)}
                          className={`shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                            active
                              ? 'border-red-500 text-red-600 dark:border-red-400 dark:text-red-400'
                              : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
                {loadingDetailRm ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
                  </div>
                ) : detailRmData ? (
                  (() => {
                    const d = detailRmData as Record<string, unknown> & {
                      requestNumber?: string;
                      requestedAt?: string;
                      createdAt?: string;
                      status?: string;
                      description?: string;
                      obra?: string;
                      serviceOrder?: string;
                      priority?: string;
                      demandSheet?: string;
                      costCenter?: { code?: string; name?: string };
                      items?: Array<{
                        id?: string;
                        quantity?: unknown;
                        unit?: string;
                        notes?: string | null;
                        observation?: string | null;
                        attachmentUrl?: string | null;
                        attachmentName?: string | null;
                        material?: {
                          description?: string | null;
                          name?: string | null;
                          sinapiCode?: string | null;
                        };
                      }>;
                      purchaseOrders?: PurchaseOrder[];
                    };
                    const pos = Array.isArray(d.purchaseOrders) ? d.purchaseOrders : [];
                    const dateRaw = d.requestedAt || d.createdAt;
                    const requestedDate = dateRaw ? new Date(String(dateRaw)) : null;
                    const statusKey = d.status ? String(d.status) : '';
                    const statusInfo = getStatusInfo(statusKey || 'PENDING');
                    const priorityInfo = getPriorityInfo(String(d.priority || 'MEDIUM'));
                    const fdAttachments = parseFdAttachments(d as Parameters<typeof parseFdAttachments>[0]);

                    const infoRows: { label: string; value: React.ReactNode; stacked?: boolean }[] = [
                      {
                        label: 'Status',
                        value: (
                          <span
                            className={`inline-block rounded px-2 py-1 text-xs font-medium ${statusInfo.color}`}
                          >
                            {statusInfo.label}
                          </span>
                        )
                      },
                      {
                        label: 'Prioridade',
                        value: <span className={priorityInfo.color}>{priorityInfo.label}</span>
                      },
                      {
                        label: 'Contrato',
                        value: rmContractName(d as Parameters<typeof rmContractName>[0])
                      },
                      {
                        label: 'Ordem de serviço',
                        value: rmOsLine(d as Parameters<typeof rmOsLine>[0])
                      },
                      {
                        label: 'Centro de custo',
                        value: d.costCenter?.name?.trim() || '—'
                      }
                    ];
                    if (d.obra) {
                      infoRows.push({ label: 'Obra', value: String(d.obra) });
                    }
                    if (requestedDate && !Number.isNaN(requestedDate.getTime())) {
                      infoRows.push({
                        label: 'Data',
                        value: requestedDate.toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      });
                    }
                    if (d.demandSheet) {
                      infoRows.push({ label: 'Ficha de Demanda', value: String(d.demandSheet) });
                    }
                    if (d.description?.trim()) {
                      infoRows.push({
                        label: 'Descrição',
                        stacked: true,
                        value: (
                          <span className="whitespace-pre-wrap leading-relaxed">
                            {String(d.description)}
                          </span>
                        )
                      });
                    }

                    return (
                      <div className="space-y-5 text-sm">
                        {detailTab === 'resumo' ? (
                          <div className="space-y-4">
                            <dl className="divide-y divide-gray-200 dark:divide-gray-700">
                              {infoRows.map((row) => (
                                <div
                                  key={row.label}
                                  className={
                                    row.stacked
                                      ? 'flex flex-col gap-1.5 py-3'
                                      : 'flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6'
                                  }
                                >
                                  <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
                                    {row.label}
                                  </dt>
                                  <dd
                                    className={
                                      row.stacked
                                        ? 'min-w-0 text-left text-sm text-gray-900 dark:text-gray-100'
                                        : 'min-w-0 text-sm text-gray-900 dark:text-gray-100 sm:text-right'
                                    }

                                  >
                                    {row.value}
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ) : null}

                        {detailTab === 'materiais' ? (
                          d.items && d.items.length > 0 ? (
                            <div className="table-scroll">
                              <table className="w-full text-xs sm:text-sm">
                                <thead>
                                  <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                                    <th className="w-12 whitespace-nowrap pb-3 pr-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                                      Item
                                    </th>
                                    <th className="px-2 pb-3 text-xs font-medium text-gray-500 dark:text-gray-400">
                                      Material
                                    </th>
                                    <th className="whitespace-nowrap px-2 pb-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                                      Qtd
                                    </th>
                                    <th className="whitespace-nowrap px-2 pb-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                                      Un.
                                    </th>
                                    <th className="whitespace-nowrap px-2 pb-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400">
                                      Valor referência
                                    </th>
                                    <th className="whitespace-nowrap pb-3 pl-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400">
                                      Situação
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                  {d.items.map((item, idx) => {
                                    const mat = item.material;
                                    const line =
                                      mat?.description?.trim() ||
                                      mat?.name?.trim() ||
                                      mat?.sinapiCode ||
                                      'Material';
                                    const note = (item.notes || item.observation)?.trim();
                                    const unitPrice =
                                      (item as { unitPrice?: number | null }).unitPrice ?? null;
                                    const activeOc = item.id
                                      ? getActiveOcForRmItem(item.id, pos)
                                      : null;
                                    const pendingOc =
                                      !activeOc &&
                                      statusKey === 'APPROVED' &&
                                      !isMaterialRequestEffectivelyCancelled(
                                        { status: statusKey } as MaterialRequest,
                                        pos
                                      );
                                    return (
                                      <tr
                                        key={item.id || idx}
                                        className="text-gray-900 dark:text-gray-100"
                                      >
                                        <td className="py-3 pr-2 text-center align-top font-medium tabular-nums text-gray-500 dark:text-gray-400">
                                          {idx + 1}
                                        </td>
                                        <td className="max-w-[220px] px-2 py-3 align-top sm:max-w-none">
                                          {line}
                                          {note ? (
                                            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                                              {note}
                                            </p>
                                          ) : null}
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-3 text-right align-top tabular-nums">
                                          {Number(item.quantity)}
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-3 text-center align-top">
                                          {item.unit || '—'}
                                        </td>
                                        <td className="whitespace-nowrap px-2 py-3 text-right align-top tabular-nums">
                                          {formatRmAvgPaid(unitPrice)}
                                        </td>
                                        <td className="whitespace-nowrap py-3 pl-2 text-center align-top">
                                          {activeOc ? (
                                            <span
                                              className="inline-flex rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                                              title={
                                                activeOc.orderNumber
                                                  ? `Vinculado à OC ${activeOc.orderNumber}`
                                                  : 'Item em ordem de compra'
                                              }
                                            >
                                              {activeOc.orderNumber
                                                ? `OC ${formatOcListDisplayId(activeOc.orderNumber)}`
                                                : 'Em OC'}
                                            </span>
                                          ) : pendingOc ? (
                                            <span
                                              className="inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                              title="Aguardando mapa de cotação / nova OC"
                                            >
                                              Pendente
                                            </span>
                                          ) : (
                                            <span className="text-xs text-gray-400 dark:text-gray-500">
                                              —
                                            </span>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p className="py-10 text-center text-sm text-gray-400">
                              Nenhum material nesta solicitação.
                            </p>
                          )
                        ) : null}

                        {detailTab === 'ocs' ? (
                          <RmDetailOcTab
                            materialRequestStatus={statusKey}
                            orders={pos}
                            enabled={detailTab === 'ocs'}
                          />
                        ) : null}

                        {detailTab === 'documentos' ? (
                          <div className="space-y-4">
                            <SolicitacaoDetailDocSection title="Documentos">
                              {fdAttachments.length === 0 ? (
                                <SolicitacaoDetailDocumentItem
                                  label="Arquivo"
                                  subtitle="Não anexado"
                                  pending
                                />
                              ) : (
                                fdAttachments.map((file, index) => (
                                  <SolicitacaoDetailDocumentItem
                                    key={`${file.url}-${index}`}
                                    label={
                                      fdAttachments.length > 1
                                        ? `Arquivo ${index + 1}`
                                        : 'Arquivo'
                                    }
                                    subtitle={file.name || 'Anexo'}
                                    url={file.url}
                                    fileName={file.name}
                                  />
                                ))
                              )}
                            </SolicitacaoDetailDocSection>

                            {(() => {
                              const itemsWithAttachments = (d.items ?? [])
                                .map((item, idx) => ({ item, idx }))
                                .filter(({ item }) => Boolean(item.attachmentUrl?.trim()));
                              if (itemsWithAttachments.length === 0) return null;
                              return (
                                <SolicitacaoDetailDocSection title="Anexos dos materiais">
                                  {itemsWithAttachments.map(({ item, idx }) => {
                                    const mat = item.material;
                                    const line =
                                      mat?.description?.trim() ||
                                      mat?.name?.trim() ||
                                      mat?.sinapiCode ||
                                      'Material';
                                    return (
                                      <SolicitacaoDetailDocumentItem
                                        key={item.id || idx}
                                        label={`Item ${idx + 1} · ${line}`}
                                        subtitle={item.attachmentName || 'Anexo'}
                                        url={item.attachmentUrl}
                                        fileName={item.attachmentName}
                                      />
                                    );
                                  })}
                                </SolicitacaoDetailDocSection>
                              );
                            })()}
                          </div>
                        ) : null}
                      </div>
                    );
                  })()
                ) : (
                  <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">
                    Não foi possível carregar os detalhes.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        <ModalCloseConfirm
          isOpen={showCloseNewRequestConfirm}
          onCancel={() => setShowCloseNewRequestConfirm(false)}
          onConfirm={closeNewRequestModal}
          message="Tem certeza que deseja fechar a solicitação? Os dados preenchidos serão perdidos."
        />

        <ModalCloseConfirm
          isOpen={showCloseDetailConfirm}
          onCancel={() => setShowCloseDetailConfirm(false)}
          onConfirm={closeDetailModal}
          message="Tem certeza que deseja fechar os detalhes da solicitação?"
        />

        {correctionEditId && (
          <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => !updateCorrectionMutation.isPending && setCorrectionEditId(null)}
              aria-hidden
            />
            <div
              className="relative my-auto flex max-h-[min(92dvh,calc(100dvh-2rem))] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl dark:bg-gray-800"
              role="dialog"
              aria-modal="true"
              aria-labelledby="correction-request-modal-title"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-4 pb-2">
                <div className="min-w-0">
                  <h2
                    id="correction-request-modal-title"
                    className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Editar requisição (Correção RM)
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                    Ajuste os dados e salve. Use &quot;Salvar e reenviar&quot; para voltar à fila de aprovação.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => setCorrectionEditId(null)}
                  className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-700"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
                {correctionNoteFromCompras ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
                    <p className="font-medium">Observação do compras</p>
                    <p className="mt-1 whitespace-pre-wrap">{correctionNoteFromCompras}</p>
                  </div>
                ) : null}
                <RmFormSection title="Dados da solicitação">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className={RM_FORM_LABEL_CLS}>Contrato *</label>
                      <SingleSelectSearchDropdown
                        value={editFormData.contractId}
                        onChange={handleEditContractChange}
                        options={contractSelectOptions}
                        allowEmpty={false}
                        disabled={Boolean(lockedUnbContractId)}
                        placeholder="Digite para buscar contrato..."
                        searchPlaceholder="Pesquisar contrato..."
                        emptyOptionsMessage="Nenhum contrato disponível."
                        emptySearchMessage="Nenhum contrato encontrado para esta busca."
                      />
                      <input type="hidden" value={editFormData.contractId} readOnly />
                    </div>
                    <div>
                      <label className={RM_FORM_LABEL_CLS}>Ordem de Serviço *</label>
                      <ServiceOrderSearchSelect
                        contractId={editFormData.contractId}
                        serviceOrders={editFormServiceOrders}
                        loading={loadingEditFormServiceOrders}
                        serviceOrderId={editFormData.serviceOrderId}
                        serviceOrderLabel={editFormData.serviceOrder}
                        onSelect={handleEditServiceOrderSelect}
                        onClear={handleEditServiceOrderClear}
                        inputSize="sm"
                        emptyContractHint="Selecione o contrato"
                        required
                      />
                      <input type="hidden" required value={editFormData.serviceOrderId} readOnly />
                      {editFormData.serviceOrder &&
                      !editFormData.serviceOrderId &&
                      editFormServiceOrders.length > 0 ? (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Valor anterior: {editFormData.serviceOrder}. Selecione a OS correspondente
                          na lista, se existir.
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <label className={RM_FORM_LABEL_CLS}>Obra</label>
                      <input
                        type="text"
                        value={editFormData.obra}
                        onChange={(e) => setEditFormData({ ...editFormData, obra: e.target.value })}
                        className={FORM_FIELD_INPUT_CLS}
                        placeholder="Identificação da obra (opcional)"
                      />
                    </div>
                    <div>
                      <label className={RM_FORM_LABEL_CLS}>Prioridade</label>
                      <SingleSelectSearchDropdown
                        value={editFormData.priority}
                        onChange={(priority) => setEditFormData({ ...editFormData, priority })}
                        options={RM_PRIORITY_OPTIONS}
                        allowEmpty={false}
                        placeholder="Selecionar prioridade..."
                        searchPlaceholder="Pesquisar prioridade..."
                      />
                    </div>
                  </div>
                  <div>
                    <label className={RM_FORM_LABEL_CLS}>Descrição</label>
                    <textarea
                      value={editFormData.description}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, description: e.target.value })
                      }
                      rows={3}
                      className={FORM_FIELD_TEXTAREA_CLS}
                    />
                  </div>
                </RmFormSection>

                <RmFormSection
                  title="Ficha de demanda"
                  description="Número ou referência da FD (opcional)."
                >
                  <div>
                    <label className={RM_FORM_LABEL_CLS}>Número da FD</label>
                    <input
                      type="text"
                      value={editFormData.demandSheet}
                      onChange={(e) =>
                        setEditFormData({ ...editFormData, demandSheet: e.target.value })
                      }
                      className={FORM_FIELD_INPUT_CLS}
                      placeholder="Número ou referência da FD (opcional)"
                    />
                  </div>
                </RmFormSection>

                <RmFormSection
                  title="Documentos"
                  description="Anexe documentos da solicitação (FD, orçamento, etc.)."
                >
                  <RmDemandSheetAttachmentsField
                    files={editFormData.demandSheetAttachments}
                    uploading={uploadingDemandSheetAttachment === 'edit'}
                    disabled={!!uploadingDemandSheetAttachment}
                    onFilesSelect={(files) => void handleDemandSheetAttachmentFiles('edit', files)}
                    onRemove={(index) => removeDemandSheetAttachment('edit', index)}
                    chooseLabel="Adicionar arquivo"
                    addLabel="Adicionar arquivo"
                  />
                </RmFormSection>

                <RmFormSection title={`Itens (${editFormData.items.length})`}>
                  <div className="space-y-3">
                    {editFormData.items.map((item, index) => (
                      <div
                        key={index}
                        className="rounded-xl border border-gray-200 p-3.5 dark:border-gray-700"
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            Item {index + 1}
                          </span>
                          {editFormData.items.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => handleEditRemoveItem(index)}
                              className="rounded-md p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              aria-label={`Remover item ${index + 1}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                        <div className="space-y-3">
                          <div>
                            <label className={RM_FORM_FIELD_LABEL_CLS}>Material *</label>
                            <AsyncSearchSelectDropdown<RmMaterialListItem>
                              value={item.materialId}
                              selectedLabel={editItemMaterialLabels[index]}
                              onChange={(material) => handleEditItemMaterialSelect(index, material)}
                              searchFn={searchRmMaterials}
                              getOptionId={(m) => m.id}
                              getOptionLabel={getRmMaterialLabel}
                              placeholder="Digite para buscar material..."
                              noFocusRing
                              queryKeyPrefix="rm-materials-search"
                            />
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                            <div className="sm:col-span-1">
                              <label className={RM_FORM_FIELD_LABEL_CLS}>Qtd *</label>
                              <RmQuantityInput
                                size="sm"
                                value={item.quantity}
                                unit={item.unit}
                                onChange={(quantity) =>
                                  handleEditItemChange(index, 'quantity', quantity)
                                }
                              />
                            </div>
                            <div className="sm:col-span-3">
                              <label className={RM_FORM_FIELD_LABEL_CLS}>Observação</label>
                              <input
                                type="text"
                                value={item.observation}
                                onChange={(e) =>
                                  handleEditItemChange(index, 'observation', e.target.value)
                                }
                                className={FORM_FIELD_INPUT_CLS}
                                placeholder="Opcional"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className={RM_FORM_FIELD_LABEL_CLS}>Valor referência</label>
                              <div className="relative">
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={formatCurrencyInputBrFromNumber(item.unitPrice)}
                                  onChange={(e) => {
                                    const masked = maskCurrencyInputBrOrEmpty(e.target.value);
                                    handleEditItemChange(
                                      index,
                                      'unitPrice',
                                      parseCurrencyInputBr(masked) ?? 0
                                    );
                                  }}
                                  className={`${FORM_FIELD_INPUT_CLS} pr-9`}
                                  placeholder="R$ 0,00"
                                />
                                <RmUnitPriceInfoIcon />
                              </div>
                            </div>
                            <div>
                              <label className={RM_FORM_FIELD_LABEL_CLS}>Valor total</label>
                              <input
                                type="text"
                                readOnly
                                tabIndex={-1}
                                value={formatCurrencyInputBrFromNumber(rmItemLineTotal(item))}
                                className={`${FORM_FIELD_INPUT_CLS} cursor-default bg-gray-50 dark:bg-gray-800/80`}
                              />
                            </div>
                          </div>
                          <div>
                            <label className={RM_FORM_FIELD_LABEL_CLS}>Anexo</label>
                            <RmAttachmentField
                              fileUrl={item.attachmentUrl}
                              fileName={item.attachmentName}
                              uploading={
                                uploadingAttachment?.form === 'edit' &&
                                uploadingAttachment.index === index
                              }
                              disabled={!!uploadingAttachment}
                              onFileSelect={(file) =>
                                void handleItemAttachmentFile('edit', index, file)
                              }
                              onRemove={() => clearItemAttachment('edit', index)}
                              chooseLabel="Adicionar anexo"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleEditAddItem}
                      className={RM_ADD_ITEM_BTN_CLS}
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar item
                    </button>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-3 dark:border-gray-700 dark:bg-gray-800/50">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Total da solicitação
                      </span>
                      <span className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {formatCurrencyInputBrFromNumber(rmRequestItemsTotal(editFormData.items))}
                      </span>
                    </div>
                  </div>
                </RmFormSection>
              </div>

              <div className="flex shrink-0 flex-col-reverse flex-wrap gap-2 border-t border-gray-200 px-5 py-3 sm:flex-row sm:justify-end dark:border-gray-700">
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => setCorrectionEditId(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => submitCorrectionEdit(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-100 dark:hover:bg-gray-700"
                >
                  {updateCorrectionMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => submitCorrectionEdit(true)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
                >
                  {updateCorrectionMutation.isPending
                    ? 'Enviando...'
                    : 'Salvar e reenviar para aprovação'}
                </button>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

/** Next.js exige Suspense em volta de `useSearchParams` na geração estática. */
export default function SolicitarMateriaisPageWithSuspense() {
  return (
    <Suspense fallback={<Loading />}>
      <SolicitarMateriaisPage />
    </Suspense>
  );
}
