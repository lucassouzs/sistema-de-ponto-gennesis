'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
  ArrowLeftRight,
  History,
  Box,
  Filter,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Download,
  Eye,
  MoreVertical,
  Search,
  X
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { ButtonSeg } from '../solicitacoes-dp/DpSolicitacaoTypeFields';
import api from '@/lib/api';
import {
  constructionMaterialIdFromSinapiCode,
  resolveConstructionMaterialsByNames,
} from '@/lib/fetchAllConstructionMaterials';
import { normalizeCostCentersResponse } from '@/lib/costCenters';
import { getListTableRowClassName, listTableRowClasses, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import {
  buildLinkedOcStockDocuments,
  buildStockPaymentSlipsForOrder,
  mergeStockPaymentSlipsWithLinked,
  orderBoletoDocumentsFingerprint
} from '@/lib/ocStockDocuments';
import { isOcBoletoPaymentType } from '@/components/oc/ocUploadBoleto';
import {
  formatMoneyDisplay,
  parseOrderTotalAmount,
  redistributeInstallmentAmounts,
  validateInstallmentAmountsSum,
  type RowDraft
} from '@/components/oc/boletoParcelasUtils';
import { maskCurrencyInputBrOrEmpty } from '@/lib/maskCurrencyBr';
import { resolveLockedUnbCostCenterId } from '@/lib/unbBranding';
import { usePermissions } from '@/hooks/usePermissions';
import toast from 'react-hot-toast';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { CheckboxIndicator } from '@/components/ui/Checkbox';

interface Material {
  id: string;
  name: string;
  description?: string;
  unit: string;
  category?: string;
}

interface StockMovement {
  id: string;
  material: Material;
  costCenter?: { id?: string; code: string; name: string };
  type: 'IN' | 'OUT';
  quantity: number;
  notes?: string;
  user: { name: string };
  createdAt: string;
}

interface StockBalance {
  material: Material;
  costCenter?: { id: string; code: string; name: string } | null;
  balance: number;
}

interface GroupedStockBalance {
  material: Material;
  lines: Array<{
    costCenter?: { id: string; code: string; name: string } | null;
    balance: number;
  }>;
}

interface MaterialBalanceGroup {
  material: Material;
  lines: Array<{ costCenter: StockBalance['costCenter']; balance: number }>;
  totalBalance: number;
}

interface MovementFormData {
  costCenterId: string;
  type: '' | 'IN' | 'OUT';
  ocNumber: string;
  movementSplit: '' | 'TOTAL' | 'PARCIAL';
  notes: string;
}

interface MovementPayload {
  materialId: string;
  costCenterId: string;
  type: 'IN' | 'OUT';
  quantity: number;
  notes: string;
}

interface UploadedInvoice {
  url: string;
  originalName: string;
}

interface PaymentSlipAttachment {
  id: string;
  url: string;
  originalName: string;
  amount: string;
  dueDate: string;
}

function paymentSlipsToRowDrafts(slips: PaymentSlipAttachment[]): RowDraft[] {
  return slips.map((slip) => ({
    amount: slip.amount,
    dueDate: slip.dueDate,
    boletoUrl: slip.url || null,
    boletoName: slip.originalName || null,
    uploading: false
  }));
}

function mergeRowDraftsIntoPaymentSlips(
  slips: PaymentSlipAttachment[],
  drafts: RowDraft[]
): PaymentSlipAttachment[] {
  return slips.map((slip, index) => ({
    ...slip,
    amount: drafts[index]?.amount ?? slip.amount,
    dueDate: drafts[index]?.dueDate ?? slip.dueDate
  }));
}

const parseCurrencyBrlToNumber = (value: string) => {
  const normalized = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : NaN;
};

const formatCurrencyInputBrl = (value: string) => {
  const digits = value.replace(/\D/g, '');
  const amount = Number(digits || '0') / 100;
  return amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

interface PurchaseOrderOption {
  id: string;
  orderNumber: string;
  amountToPay?: number | string | null;
  freightAmount?: number | string | null;
  paymentType?: string | null;
  paymentParcelCount?: number | null;
  supplier?: {
    name?: string | null;
  } | null;
  materialRequest?: {
    costCenter?: {
      id?: string | null;
      code?: string | null;
      name?: string | null;
    } | null;
  } | null;
  items?: Array<{
    materialId?: string;
    quantity?: number | string | null;
    totalPrice?: number | string | null;
  }>;
}

interface PurchaseOrderDetailItem {
  materialId: string;
  quantity: number;
  unit?: string;
  material?: {
    name?: string | null;
    sinapiCode?: string | null;
  };
}

interface PurchaseOrderDetail {
  id: string;
  items: PurchaseOrderDetailItem[];
  orderDate?: string;
  amountToPay?: number | string | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentParcelCount?: number;
  paymentParcelDueDays?: number[];
  nfAttachments?: unknown;
  paymentBoletoUrl?: string | null;
  paymentBoletoName?: string | null;
  boletoAttachmentUrl?: string | null;
  boletoAttachmentName?: string | null;
  paymentBoletoInstallments?: unknown;
  materialRequest?: {
    costCenter?: {
      id: string;
      code?: string | null;
      name?: string | null;
    } | null;
  } | null;
}

interface OcMovementItemState {
  key: string;
  materialId: string;
  unresolvedMaterialId: boolean;
  materialName: string;
  unit: string;
  originalQuantity: number;
  quantity: string;
  checked: boolean;
}

const normalizeMaterialName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const EMPTY_STOCK_MOVEMENTS: StockMovement[] = [];

function getAlreadyMovedQuantityForOcMaterial(
  movements: StockMovement[],
  ocNumber: string,
  type: 'IN' | 'OUT',
  materialId: string
): number {
  if (!materialId || !ocNumber.trim()) return 0;
  const ocLower = ocNumber.trim().toLowerCase();
  return movements.reduce((sum, mov) => {
    if (mov.type !== type || mov.material?.id !== materialId) return sum;
    const notes = mov.notes || '';
    const ocMatch = notes.match(/Nº OC:\s*([^\n|]+)/i);
    if (!ocMatch?.[1] || ocMatch[1].trim().toLowerCase() !== ocLower) return sum;
    return sum + (Number(mov.quantity) || 0);
  }, 0);
}

function getOcMaterialMovementAvailability(
  movements: StockMovement[],
  ocNumber: string,
  movementType: 'IN' | 'OUT',
  materialId: string,
  orderedQuantity: number
): {
  referenceQuantity: number;
  remaining: number;
} {
  const qtyIn = getAlreadyMovedQuantityForOcMaterial(movements, ocNumber, 'IN', materialId);
  const qtyOut = getAlreadyMovedQuantityForOcMaterial(movements, ocNumber, 'OUT', materialId);

  if (movementType === 'OUT') {
    return {
      referenceQuantity: qtyIn,
      remaining: Math.max(0, qtyIn - qtyOut),
    };
  }

  return {
    referenceQuantity: orderedQuantity,
    remaining: Math.max(0, orderedQuantity - qtyIn),
  };
}

function formatOcShortNumber(orderNumber: string): string {
  const trimmed = orderNumber.trim();
  const match = trimmed.match(/(\d+)$/);
  if (!match) return trimmed;
  const num = parseInt(match[1], 10);
  return Number.isNaN(num) ? trimmed : String(num);
}

function maskOcMovementQuantityInput(raw: string): string {
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

function parseOcMovementQuantityInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  const parsed = parseFloat(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed * 100) / 100;
}

function formatOcMovementQuantityInput(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '';
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false });
}

function clampOcMovementQuantityInput(raw: string, maxQuantity: number): string {
  const masked = maskOcMovementQuantityInput(raw);
  if (!Number.isFinite(maxQuantity) || maxQuantity < 0) return masked;

  const parsed = parseOcMovementQuantityInput(masked);
  if (parsed == null) return masked;

  if (parsed > maxQuantity + 0.0001) {
    return formatOcMovementQuantityInput(maxQuantity);
  }
  return masked;
}

function hasTotalOcMovementOfType(
  movements: StockMovement[],
  ocNumber: string,
  type: 'IN' | 'OUT'
): boolean {
  const ocLower = ocNumber.trim().toLowerCase();
  return movements.some((movement) => {
    if (movement.type !== type || !movement.notes) return false;
    const ocMatch = movement.notes.match(/Nº OC:\s*([^\n|]+)/i);
    const splitMatch = movement.notes.match(/Tipo:\s*(TOTAL|PARCIAL)/i);
    if (!ocMatch?.[1] || ocMatch[1].trim().toLowerCase() !== ocLower) return false;
    return splitMatch?.[1]?.toUpperCase() === 'TOTAL';
  });
}

function ocHasAnyMovementOfType(
  movements: StockMovement[],
  ocNumber: string,
  type: 'IN' | 'OUT'
): boolean {
  const ocLower = ocNumber.trim().toLowerCase();
  return movements.some((movement) => {
    if (movement.type !== type) return false;
    const notes = movement.notes || '';
    const ocMatch = notes.match(/Nº OC:\s*([^\n|]+)/i);
    return ocMatch?.[1]?.trim().toLowerCase() === ocLower;
  });
}

function isOcInboundComplete(
  movements: StockMovement[],
  ocNumber: string,
  items?: Array<{ materialId?: string; quantity?: number | string | null }>
): boolean {
  if (hasTotalOcMovementOfType(movements, ocNumber, 'IN')) return true;
  if (!items?.length) return false;
  return items.every((item) => {
    const materialId = item.materialId || '';
    if (!materialId) return false;
    const orderedQuantity = Number(item.quantity) || 0;
    if (orderedQuantity <= 0) return true;
    const moved = getAlreadyMovedQuantityForOcMaterial(movements, ocNumber, 'IN', materialId);
    return moved >= orderedQuantity - 0.0001;
  });
}

/** Entrada/saída por material vinculadas à OC (pelas próprias movimentações). */
function getOcInOutQuantitiesByMaterial(
  movements: StockMovement[],
  ocNumber: string
): Map<string, { qtyIn: number; qtyOut: number }> {
  const map = new Map<string, { qtyIn: number; qtyOut: number }>();
  const ocLower = ocNumber.trim().toLowerCase();
  for (const movement of movements) {
    if (movement.type !== 'IN' && movement.type !== 'OUT') continue;
    const materialId = movement.material?.id;
    if (!materialId) continue;
    const notes = movement.notes || '';
    const ocMatch = notes.match(/Nº OC:\s*([^\n|]+)/i);
    if (!ocMatch?.[1] || ocMatch[1].trim().toLowerCase() !== ocLower) continue;
    const entry = map.get(materialId) || { qtyIn: 0, qtyOut: 0 };
    const qty = Number(movement.quantity) || 0;
    if (movement.type === 'IN') entry.qtyIn += qty;
    else entry.qtyOut += qty;
    map.set(materialId, entry);
  }
  return map;
}

function isOcOutboundComplete(
  movements: StockMovement[],
  ocNumber: string,
  items?: Array<{ materialId?: string; quantity?: number | string | null }>
): boolean {
  // Sem nenhuma saída registrada, nunca está concluída.
  if (!ocHasAnyMovementOfType(movements, ocNumber, 'OUT')) return false;
  if (hasTotalOcMovementOfType(movements, ocNumber, 'OUT')) return true;

  // Preferir confronto entrada×saída pelas movimentações (IDs batem com o estoque).
  const byMaterial = getOcInOutQuantitiesByMaterial(movements, ocNumber);
  let hasInbound = false;
  let allCovered = true;
  for (const { qtyIn, qtyOut } of byMaterial.values()) {
    if (qtyIn <= 0) continue;
    hasInbound = true;
    if (qtyOut < qtyIn - 0.0001) allCovered = false;
  }
  if (hasInbound) return allCovered;

  // Fallback: itens da OC (só se houver materialId com entrada real).
  if (!items?.length) return false;
  let tracked = 0;
  for (const item of items) {
    const materialId = item.materialId || '';
    if (!materialId) continue;
    const qtyIn = getAlreadyMovedQuantityForOcMaterial(movements, ocNumber, 'IN', materialId);
    if (qtyIn <= 0) continue;
    tracked += 1;
    const qtyOut = getAlreadyMovedQuantityForOcMaterial(movements, ocNumber, 'OUT', materialId);
    if (qtyOut < qtyIn - 0.0001) return false;
  }
  return tracked > 0;
}

type OcMovementStatusTone = 'complete' | 'partial' | 'pending';

type OcMovementDropdownStatus = {
  label: string;
  labelClassName: string;
  description?: string;
  statusSegments: Array<{ text: string; className: string }>;
};

const OC_STATUS_TONE_CLASS: Record<OcMovementStatusTone, string> = {
  // Completa e pendente em vermelho; parcial em amarelo (pedido do fluxo de estoque).
  complete: 'text-red-600 dark:text-red-400',
  partial: 'text-amber-500 dark:text-amber-400',
  pending: 'text-red-600 dark:text-red-400',
};

function getOcInboundStatusTone(
  movements: StockMovement[],
  ocNumber: string,
  items?: Array<{ materialId?: string; quantity?: number | string | null }>
): OcMovementStatusTone {
  const hasIn = ocHasAnyMovementOfType(movements, ocNumber, 'IN');
  if (!hasIn) return 'pending';
  if (isOcInboundComplete(movements, ocNumber, items)) return 'complete';
  return 'partial';
}

function getOcOutboundStatusTone(
  movements: StockMovement[],
  ocNumber: string,
  items?: Array<{ materialId?: string; quantity?: number | string | null }>
): OcMovementStatusTone {
  const hasIn = ocHasAnyMovementOfType(movements, ocNumber, 'IN');
  const hasOut = ocHasAnyMovementOfType(movements, ocNumber, 'OUT');
  if (!hasIn || !hasOut) return 'pending';
  if (isOcOutboundComplete(movements, ocNumber, items)) return 'complete';
  return 'partial';
}

function formatOcPaymentTypeLabel(
  paymentType?: string | null,
  paymentParcelCount?: number | null
): string {
  if (paymentType === 'BOLETO') {
    const parcels = Number(paymentParcelCount) || 0;
    return parcels > 1 ? `Boleto (${parcels}x)` : 'Boleto';
  }
  if (paymentType === 'AVISTA') return 'À vista';
  if (paymentType?.trim()) return paymentType.trim();
  return 'Pagamento não informado';
}

function getOcInboundStatusText(
  movements: StockMovement[],
  ocNumber: string,
  items?: Array<{ materialId?: string; quantity?: number | string | null }>
): string {
  const hasIn = ocHasAnyMovementOfType(movements, ocNumber, 'IN');
  if (!hasIn) return 'Entrada pendente';
  if (isOcInboundComplete(movements, ocNumber, items)) return 'Entrada concluída';
  return 'Entrada parcial';
}

function getOcOutboundStatusText(
  movements: StockMovement[],
  ocNumber: string,
  items?: Array<{ materialId?: string; quantity?: number | string | null }>
): string {
  const hasIn = ocHasAnyMovementOfType(movements, ocNumber, 'IN');
  const hasOut = ocHasAnyMovementOfType(movements, ocNumber, 'OUT');
  if (!hasIn || !hasOut) return 'Saída pendente';
  if (isOcOutboundComplete(movements, ocNumber, items)) return 'Saída concluída';
  return 'Saída parcial';
}

function getOcMovementDropdownStatus(
  movements: StockMovement[],
  ocNumber: string,
  _movementType: '' | 'IN' | 'OUT',
  items?: Array<{ materialId?: string; quantity?: number | string | null }>,
  meta?: {
    contractLabel?: string | null;
    itemCount?: number;
    paymentType?: string | null;
    paymentParcelCount?: number | null;
    supplierName?: string | null;
  }
): OcMovementDropdownStatus {
  const inboundText = getOcInboundStatusText(movements, ocNumber, items);
  const outboundText = getOcOutboundStatusText(movements, ocNumber, items);
  const inboundTone = getOcInboundStatusTone(movements, ocNumber, items);
  const outboundTone = getOcOutboundStatusTone(movements, ocNumber, items);

  const itemCount = meta?.itemCount ?? items?.length ?? 0;
  const itemLabel = itemCount === 1 ? '1 item' : `${itemCount} itens`;
  const contractLabel = (meta?.contractLabel || '').trim() || 'Sem contrato';
  const paymentLabel = formatOcPaymentTypeLabel(meta?.paymentType, meta?.paymentParcelCount);
  const supplierLabel = (meta?.supplierName || '').trim();

  const detailParts = [contractLabel, itemLabel, paymentLabel];
  if (supplierLabel) detailParts.push(supplierLabel);

  return {
    label: `${inboundText} · ${outboundText}`,
    labelClassName: OC_STATUS_TONE_CLASS[inboundTone],
    description: detailParts.join('  ·  '),
    statusSegments: [
      { text: inboundText, className: OC_STATUS_TONE_CLASS[inboundTone] },
      { text: outboundText, className: OC_STATUS_TONE_CLASS[outboundTone] },
    ],
  };
}

function ocMovementItemsEqual(a: OcMovementItemState[], b: OcMovementItemState[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((item, i) => {
    const next = b[i];
    return (
      item.key === next.key &&
      item.materialId === next.materialId &&
      item.unresolvedMaterialId === next.unresolvedMaterialId &&
      item.materialName === next.materialName &&
      item.unit === next.unit &&
      item.originalQuantity === next.originalQuantity &&
      item.quantity === next.quantity &&
      item.checked === next.checked
    );
  });
}

const extractFirstUrl = (text: string) => {
  const match = text.match(/https?:\/\/[^\s]+|\/uploads\/[^\s]+/i);
  return match?.[0] || '';
};

const extractOcNumberFromNotes = (notes?: string | null) => {
  if (!notes) return '';
  const ocMatch = notes.match(/Nº OC:\s*([^\n|]+)/i);
  return ocMatch?.[1]?.trim() || '';
};

function MovementSegButton({
  active,
  onClick,
  label,
  icon: Icon,
  variant
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  variant: 'in' | 'out';
}) {
  const activeCls =
    variant === 'in'
      ? 'border-green-600 bg-green-50 text-green-800 dark:border-green-500 dark:bg-green-950/40 dark:text-green-200'
      : 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200';
  const inactiveCls =
    'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 ${
        active ? activeCls : inactiveCls
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

export default function EstoquePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { isUnbUser, unbCostCenterIds } = usePermissions();
  const [activeTab, setActiveTab] = useState<'balance' | 'movements'>('balance');
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [filtersCostCenterId, setFiltersCostCenterId] = useState('');
  const [filtersCategory, setFiltersCategory] = useState('');
  const [filtersMonth, setFiltersMonth] = useState('');
  const [filtersYear, setFiltersYear] = useState(new Date().getFullYear().toString());
  const [filtersSearch, setFiltersSearch] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [isBalanceFiltersModalOpen, setIsBalanceFiltersModalOpen] = useState(false);
  const [isHistoryFiltersModalOpen, setIsHistoryFiltersModalOpen] = useState(false);
  const [balanceCurrentPage, setBalanceCurrentPage] = useState(1);
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyDetail, setHistoryDetail] = useState<StockMovement | null>(null);
  const [balanceDetail, setBalanceDetail] = useState<GroupedStockBalance | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const BALANCE_ITEMS_PER_PAGE = 12;
  const HISTORY_ITEMS_PER_PAGE = 12;
  const [ocMovementItems, setOcMovementItems] = useState<OcMovementItemState[]>([]);
  const [invoiceFile, setInvoiceFile] = useState<UploadedInvoice | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [isUploadingInvoice, setIsUploadingInvoice] = useState(false);
  const [withdrawalSheetFile, setWithdrawalSheetFile] = useState<UploadedInvoice | null>(null);
  const [isUploadingWithdrawalSheet, setIsUploadingWithdrawalSheet] = useState(false);
  const [paymentSlips, setPaymentSlips] = useState<PaymentSlipAttachment[]>([]);
  const paymentSlipsSeedRef = useRef('');
  const [uploadingPaymentSlipId, setUploadingPaymentSlipId] = useState<string | null>(null);
  const [materialBalanceDetail, setMaterialBalanceDetail] = useState<MaterialBalanceGroup | null>(null);

  const [formData, setFormData] = useState<MovementFormData>({
    costCenterId: '',
    type: '',
    ocNumber: '',
    movementSplit: '',
    notes: ''
  });

  const categories = [
    'ACABAMENTO',
    'ADMINISTRATIVO',
    'ALVENARIA',
    'COBERTURA',
    'COMUNICAÇÃO VISUAL',
    'ELÉTRICA',
    'EPI',
    'FERRAMENTAS',
    'GASES MEDICINAIS',
    'HIDRÁULICA',
    'IMPERMEABILIZAÇÃO',
    'INCÊNDIO',
    'MARCENARIA',
    'MARMORARIA',
    'MATERIAL DE EXPEDIENTE',
    'PAISAGISMO',
    'PINTURA',
    'REFRIGERAÇÃO',
    'SERRALHERIA',
    'TELECOMUNICAÇÕES',
    'VIDRAÇARIA'
  ];

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

  const { data: costCentersData, isLoading: loadingCostCenters } = useQuery({
    queryKey: ['cost-centers', 'stock-page'],
    queryFn: async () => {
      const res = await api.get('/cost-centers', {
        params: { page: 1, limit: 2000, isActive: 'true' }
      });
      return res.data;
    }
  });

  const costCenters = normalizeCostCentersResponse(costCentersData) as Array<{
    id: string;
    code: string;
    name: string;
  }>;

  const lockedUnbCostCenterId = useMemo(() => {
    if (!isUnbUser) return null;
    return resolveLockedUnbCostCenterId(costCenters, unbCostCenterIds);
  }, [isUnbUser, costCenters, unbCostCenterIds]);

  useEffect(() => {
    if (!lockedUnbCostCenterId) return;
    setFiltersCostCenterId(lockedUnbCostCenterId);
  }, [lockedUnbCostCenterId]);

  const { data: balanceData, isLoading: loadingBalance } = useQuery({
    queryKey: ['stock-balance', filtersCostCenterId, filtersCategory, filtersSearch],
    queryFn: async () => {
      const res = await api.get('/stock/balance', {
        params: {
          costCenterId: filtersCostCenterId || undefined,
          category: filtersCategory || undefined,
          search: filtersSearch || undefined
        }
      });
      return res.data;
    },
    enabled: activeTab === 'balance' || activeTab === 'movements'
  });

  const { data: movementsData, isLoading: loadingMovements } = useQuery({
    queryKey: ['stock-movements', filtersCostCenterId, filtersMonth, filtersYear, filtersCategory],
    queryFn: async () => {
      const res = await api.get('/stock/movements', {
        params: {
          costCenterId: filtersCostCenterId || undefined,
          month: filtersMonth || undefined,
          year: filtersYear || undefined,
          category: filtersCategory || undefined,
          limit: 500
        }
      });
      return res.data;
    },
    enabled: activeTab === 'movements'
  });

  const { data: movementOcData } = useQuery({
    queryKey: ['stock-movements-oc-options'],
    queryFn: async () => {
      const res = await api.get('/stock/movements', { params: { limit: 1000 } });
      return res.data;
    },
    enabled: isMovementModalOpen
  });

  const { data: purchaseOrdersData, isLoading: loadingPurchaseOrders } = useQuery({
    queryKey: ['purchase-orders-oc-options'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders', { params: { limit: 500 } });
      return res.data;
    },
    enabled: isMovementModalOpen
  });

  const selectedPurchaseOrder = useMemo(
    () =>
      ((purchaseOrdersData?.data || []) as PurchaseOrderOption[]).find(
        (order) => order.orderNumber === formData.ocNumber
      ) || null,
    [purchaseOrdersData, formData.ocNumber]
  );

  const { data: selectedPurchaseOrderData, isLoading: loadingSelectedPurchaseOrder, isFetching: fetchingSelectedPurchaseOrder } = useQuery({
    queryKey: ['purchase-order-detail-for-stock', selectedPurchaseOrder?.id],
    queryFn: async () => {
      const res = await api.get(`/purchase-orders/${selectedPurchaseOrder?.id}`);
      return res.data;
    },
    enabled: isMovementModalOpen && !!selectedPurchaseOrder?.id,
    staleTime: 0,
    refetchOnMount: 'always'
  });

  const resetMovementForm = () => {
    setFormData({
      costCenterId: lockedUnbCostCenterId || '',
      type: '',
      ocNumber: '',
      movementSplit: '',
      notes: ''
    });
    setInvoiceFile(null);
    setInvoiceNumber('');
    setWithdrawalSheetFile(null);
    setPaymentSlips([]);
    setOcMovementItems([]);
    paymentSlipsSeedRef.current = '';
  };

  const closeMovementModal = () => {
    setIsMovementModalOpen(false);
    resetMovementForm();
  };

  const createMovementMutation = useMutation({
    mutationFn: async (data: MovementPayload[]) => {
      const responses = await Promise.all(data.map((payload) => api.post('/stock/movements', payload)));
      return responses.map((res) => res.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements-oc-options'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements-oc-tags'] });
      queryClient.invalidateQueries({ queryKey: ['stock-shortfalls-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      queryClient.invalidateQueries({ queryKey: ['purchase-order-detail'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests'], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'], refetchType: 'all' });
      setFormData({
        costCenterId: '',
        type: '',
        ocNumber: '',
        movementSplit: '',
        notes: ''
      });
      setInvoiceFile(null);
      setInvoiceNumber('');
      setWithdrawalSheetFile(null);
      setPaymentSlips([]);
      setOcMovementItems([]);
      setActiveTab('balance');
      closeMovementModal();
      toast.success('Movimentação registrada com sucesso!');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || error?.message || 'Erro ao registrar movimentação';
      toast.error(msg);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedOcNumber = formData.ocNumber.trim();
    const trimmedNotes = formData.notes.trim();
    const selectedItems = ocMovementItems.filter((item) => item.checked);
    const totalMovementAlreadyDoneForSameType = movementsForOc.some((movement) => {
      if (!movement.notes) return false;
      const ocMatch = movement.notes.match(/Nº OC:\s*([^\n|]+)/i);
      const splitMatch = movement.notes.match(/Tipo:\s*(TOTAL|PARCIAL)/i);
      if (!ocMatch?.[1] || !splitMatch?.[1]) return false;
      return (
        ocMatch[1].trim().toLowerCase() === trimmedOcNumber.toLowerCase() &&
        movement.type === formData.type &&
        splitMatch[1].toUpperCase() === 'TOTAL'
      );
    });

    if (!trimmedOcNumber || !formData.type || !formData.movementSplit || selectedItems.length === 0) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }
    if (!formData.costCenterId) {
      toast.error('Selecione o contrato');
      return;
    }
    if (totalMovementAlreadyDoneForSameType) {
      toast.error('Movimento já realizado');
      return;
    }

    if (
      formData.type === 'IN' &&
      isOcInboundComplete(
        movementsForOc,
        trimmedOcNumber,
        selectedOrderDetail?.items || selectedPurchaseOrder?.items
      )
    ) {
      toast.error('Entrada já concluída para esta OC. Use apenas saída.');
      return;
    }

    if (formData.type === 'OUT' && !withdrawalSheetFile) {
      toast.error('Anexe a ficha de retirada para movimentos de saída');
      return;
    }
    if (formData.type === 'IN') {
      const linkedInvoice = linkedOcStockDocuments.invoices[0];
      const effectiveInvoice =
        invoiceFile ??
        (linkedInvoice ? { url: linkedInvoice.url, originalName: linkedInvoice.name } : null);
      if (!effectiveInvoice) {
        toast.error('Anexe a nota fiscal para movimentos de entrada');
        return;
      }
      const effectiveNfNumber =
        invoiceNumber.trim() || String(linkedInvoice?.number || '').trim();
      if (!effectiveNfNumber) {
        toast.error('Informe o número da nota fiscal');
        return;
      }
      const parcelCount =
        selectedOrderDetail && isOcBoletoPaymentType(selectedOrderDetail.paymentType)
          ? selectedOrderDetail.paymentParcelCount ?? 1
          : 0;
      const effectiveSlips = mergeStockPaymentSlipsWithLinked(
        paymentSlips,
        linkedOcStockDocuments.boletos
      );
      if (parcelCount > 1) {
        const firstSlip = effectiveSlips[0];
        if (!(firstSlip?.url || '').trim()) {
          toast.error('Anexe o arquivo do boleto da parcela I');
          return;
        }
        const firstAmount = parseCurrencyBrlToNumber(firstSlip.amount);
        if (Number.isNaN(firstAmount) || firstAmount <= 0) {
          toast.error('Informe um valor válido para o boleto da parcela I');
          return;
        }
        if (!firstSlip.dueDate) {
          toast.error('Informe a data de vencimento do boleto da parcela I');
          return;
        }
        if (!paymentSlipAmountValidation.valid) {
          toast.error(
            paymentSlipAmountValidation.message ||
              'A soma dos boletos deve ser igual ao total da OC.'
          );
          return;
        }
        for (let i = 1; i < parcelCount; i += 1) {
          const slip = effectiveSlips[i];
          if (!(slip?.url || '').trim()) continue;
          const amount = parseCurrencyBrlToNumber(slip.amount);
          if (Number.isNaN(amount) || amount <= 0) {
            toast.error(`Informe um valor válido para o boleto da parcela ${i + 1}`);
            return;
          }
          if (!slip.dueDate) {
            toast.error(
              `Informe a data de vencimento do boleto da parcela ${i + 1}`
            );
            return;
          }
        }
      } else {
        for (let i = 0; i < paymentSlips.length; i += 1) {
          const slip = effectiveSlips[i] ?? paymentSlips[i];
          if (!(slip.url || '').trim() && !slip.amount.trim() && !slip.dueDate.trim()) continue;
          if (!slip.url) {
            toast.error(`Anexe o arquivo do boleto ${i + 1}`);
            return;
          }
          const amount = parseCurrencyBrlToNumber(slip.amount);
          if (Number.isNaN(amount) || amount <= 0) {
            toast.error(`Informe um valor válido para o boleto ${i + 1}`);
            return;
          }
          if (!slip.dueDate) {
            toast.error(`Informe a data de vencimento do boleto ${i + 1}`);
            return;
          }
        }
      }
    }

    const linkedInvoiceForSubmit =
      formData.type === 'IN'
        ? (() => {
            const linked = linkedOcStockDocuments.invoices[0];
            const file =
              invoiceFile ??
              (linked
                ? { url: linked.url, originalName: linked.name }
                : null);
            if (!file) return null;
            const number = invoiceNumber.trim() || String(linked?.number || '').trim();
            return { ...file, number };
          })()
        : null;

    const effectivePaymentSlips =
      formData.type === 'IN'
        ? mergeStockPaymentSlipsWithLinked(paymentSlips, linkedOcStockDocuments.boletos).filter(
            (slip) => (slip.url || '').trim()
          )
        : [];

    const paymentSlipNotes =
      formData.type === 'IN' && effectivePaymentSlips.length > 0
        ? `Boletos:\n${effectivePaymentSlips
            .map((slip, index) => {
              const amount = parseCurrencyBrlToNumber(slip.amount);
              const amountLabel = Number.isFinite(amount)
                ? amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                : slip.amount || '—';
              const dueDateLabel = slip.dueDate
                ? new Date(`${slip.dueDate}T00:00:00`).toLocaleDateString('pt-BR')
                : '—';
              return `${index + 1}) ${slip.originalName} | Valor: ${amountLabel} | Vencimento: ${dueDateLabel} | URL: ${slip.url}`;
            })
            .join('\n')}`
        : '';

    const metadataNotes = [
      `Nº OC: ${trimmedOcNumber}`,
      formData.movementSplit ? `Tipo: ${formData.movementSplit}` : '',
      withdrawalSheetFile
        ? `Ficha de Retirada: ${withdrawalSheetFile.originalName} | URL: ${withdrawalSheetFile.url}`
        : '',
      linkedInvoiceForSubmit
        ? `NF: ${linkedInvoiceForSubmit.originalName} | Número: ${linkedInvoiceForSubmit.number} | URL: ${linkedInvoiceForSubmit.url}`
        : '',
      paymentSlipNotes
    ]
      .filter(Boolean)
      .join(' | ');

    const combinedNotes = [metadataNotes, trimmedNotes].filter(Boolean).join('\n');
    const payloads: MovementPayload[] = [];

    for (const item of selectedItems) {
      const parsedQuantity = parseOcMovementQuantityInput(item.quantity);
      if (parsedQuantity == null || parsedQuantity <= 0) {
        toast.error(`Quantidade inválida para ${item.materialName}`);
        return;
      }
      if (!item.materialId) {
        toast.error(`Material "${item.materialName}" não encontrado no estoque`);
        return;
      }

      if (formData.type) {
        const orderedQuantity = item.originalQuantity;
        const { remaining } = getOcMaterialMovementAvailability(
          movementsForOc,
          trimmedOcNumber,
          formData.type,
          item.materialId,
          orderedQuantity
        );
        if (parsedQuantity > remaining) {
          const limitLabel =
            formData.type === 'OUT' ? 'disponível para saída' : 'restante da OC';
          toast.error(
            `Quantidade maior que o ${limitLabel} (${remaining} ${item.unit}) para ${item.materialName}`
          );
          return;
        }
      }

      payloads.push({
        materialId: item.materialId,
        costCenterId: formData.costCenterId,
        type: formData.type,
        quantity: parsedQuantity,
        notes: combinedNotes
      });
    }

    createMovementMutation.mutate(payloads);
  };

  const costCenterFilterOptions = useMemo(() => {
    const lockedOptions = lockedUnbCostCenterId
      ? costCenters
          .filter((cc) => cc.id === lockedUnbCostCenterId)
          .map((cc) => ({
            value: cc.id,
            label: cc.name,
            searchText: cc.name,
          }))
      : null;
    if (lockedOptions && lockedOptions.length > 0) return lockedOptions;

    return [
      { value: '', label: 'Todos', searchText: 'Todos' },
      ...costCenters.map((cc) => ({
        value: cc.id,
        label: cc.name,
        searchText: cc.name,
      })),
    ];
  }, [costCenters, lockedUnbCostCenterId]);

  const categoryFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todas', searchText: 'Todas' },
      ...categories.map((cat) => ({ value: cat, label: cat, searchText: cat })),
    ],
    [categories]
  );

  const stockMonthFilterOptions = useMemo(
    () =>
      labeledToSelectOptions([
        { value: '', label: 'Todos' },
        ...Array.from({ length: 12 }, (_, i) => {
          const month = i + 1;
          return {
            value: String(month),
            label: new Date(0, i).toLocaleString('pt-BR', { month: 'long' }),
          };
        }),
      ]),
    []
  );

  const stockYearFilterOptions = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map((year) => ({
        value: String(year),
        label: String(year),
      })),
    []
  );

  const balances: StockBalance[] = balanceData?.data || [];
  const groupedBalances = useMemo(() => {
    const byMaterial = new Map<string, GroupedStockBalance>();
    for (const row of balances) {
      const existing = byMaterial.get(row.material.id);
      if (existing) {
        existing.lines.push({ costCenter: row.costCenter, balance: row.balance });
      } else {
        byMaterial.set(row.material.id, {
          material: row.material,
          lines: [{ costCenter: row.costCenter, balance: row.balance }]
        });
      }
    }
    return Array.from(byMaterial.values())
      .map((group) => ({
        ...group,
        lines: [...group.lines].sort((a, b) =>
          (a.costCenter?.name || 'Não informado').localeCompare(
            b.costCenter?.name || 'Não informado',
            'pt-BR'
          )
        )
      }))
      .sort((a, b) => a.material.name.localeCompare(b.material.name, 'pt-BR'));
  }, [balances]);
  const balanceTotal = groupedBalances.length;
  const balanceTotalPages = Math.max(1, Math.ceil(balanceTotal / BALANCE_ITEMS_PER_PAGE));
  const balanceStartIndex = (balanceCurrentPage - 1) * BALANCE_ITEMS_PER_PAGE;
  const balanceEndIndex = balanceStartIndex + BALANCE_ITEMS_PER_PAGE;
  const paginatedGroupedBalances = groupedBalances.slice(balanceStartIndex, balanceEndIndex);
  const balanceStartItem = balanceTotal === 0 ? 0 : balanceStartIndex + 1;
  const balanceEndItem = Math.min(balanceEndIndex, balanceTotal);
  const balancesByMaterial = useMemo(() => {
    const map = new Map<string, MaterialBalanceGroup>();
    balances.forEach((balance) => {
      const id = balance.material.id;
      let group = map.get(id);
      if (!group) {
        group = { material: balance.material, lines: [], totalBalance: 0 };
        map.set(id, group);
      }
      group.lines.push({ costCenter: balance.costCenter, balance: balance.balance });
      group.totalBalance += balance.balance;
    });
    return Array.from(map.values()).sort((a, b) =>
      a.material.name.localeCompare(b.material.name, 'pt-BR', { sensitivity: 'base' })
    );
  }, [balances]);
  const movements: StockMovement[] = movementsData?.data ?? EMPTY_STOCK_MOVEMENTS;

  const clearBalanceFilters = () => {
    setFiltersCostCenterId(lockedUnbCostCenterId || '');
    setFiltersCategory('');
    setFiltersSearch('');
    setBalanceCurrentPage(1);
  };

  const clearHistoryFilters = () => {
    setFiltersCostCenterId(lockedUnbCostCenterId || '');
    setFiltersCategory('');
    setFiltersMonth('');
    setFiltersYear(String(new Date().getFullYear()));
    setHistorySearch('');
    setHistoryCurrentPage(1);
  };

  const movementsForOc: StockMovement[] = movementOcData?.data ?? EMPTY_STOCK_MOVEMENTS;
  const purchaseOrders: PurchaseOrderOption[] = purchaseOrdersData?.data || [];
  const balanceByMaterialAndCostCenter = useMemo(() => {
    const map = new Map<string, number>();
    balances.forEach((balance) => {
      const key = `${balance.material.id}:${balance.costCenter?.id || 'no-cost-center'}`;
      map.set(key, balance.balance);
    });
    return map;
  }, [balances]);
  const filteredMovements = useMemo(() => {
    const term = historySearch.trim().toLowerCase();
    const list = [...movements].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    if (!term) return list;
    return list.filter((mov) => {
      const oc = extractOcNumberFromNotes(mov.notes).toLowerCase();
      const material = mov.material.name.toLowerCase();
      const user = mov.user.name.toLowerCase();
      const cc = (mov.costCenter?.name || mov.costCenter?.code || '').toLowerCase();
      return oc.includes(term) || material.includes(term) || user.includes(term) || cc.includes(term);
    });
  }, [movements, historySearch]);

  const historyTotal = filteredMovements.length;
  const historyTotalPages = Math.max(1, Math.ceil(historyTotal / HISTORY_ITEMS_PER_PAGE));
  const historyStartIndex = (historyCurrentPage - 1) * HISTORY_ITEMS_PER_PAGE;
  const historyEndIndex = historyStartIndex + HISTORY_ITEMS_PER_PAGE;
  const paginatedMovements = filteredMovements.slice(historyStartIndex, historyEndIndex);
  const historyStartItem = historyTotal === 0 ? 0 : historyStartIndex + 1;
  const historyEndItem = Math.min(historyEndIndex, historyTotal);

  useEffect(() => {
    setBalanceCurrentPage(1);
  }, [filtersCostCenterId, filtersCategory, filtersSearch]);

  useEffect(() => {
    setHistoryCurrentPage(1);
  }, [filtersCostCenterId, filtersCategory, filtersMonth, filtersYear, historySearch]);

  useEffect(() => {
    if (balanceCurrentPage > balanceTotalPages) {
      setBalanceCurrentPage(balanceTotalPages);
    }
  }, [balanceCurrentPage, balanceTotalPages]);

  useEffect(() => {
    if (historyCurrentPage > historyTotalPages) {
      setHistoryCurrentPage(historyTotalPages);
    }
  }, [historyCurrentPage, historyTotalPages]);

  useEffect(() => {
    if (!historyDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHistoryDetail(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [historyDetail]);

  useEffect(() => {
    if (!balanceDetail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBalanceDetail(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [balanceDetail]);

  useEffect(() => {
    if (!isMovementModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMovementModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMovementModalOpen]);

  const selectedOrderDetail: PurchaseOrderDetail | null = selectedPurchaseOrderData?.data || null;

  const selectedOcInboundComplete = useMemo(() => {
    if (!formData.ocNumber.trim()) return false;
    const items = selectedOrderDetail?.items || selectedPurchaseOrder?.items;
    return isOcInboundComplete(movementsForOc, formData.ocNumber, items);
  }, [
    formData.ocNumber,
    movementsForOc,
    selectedOrderDetail?.items,
    selectedPurchaseOrder?.items,
  ]);

  useEffect(() => {
    if (!selectedOcInboundComplete) return;
    if (formData.type === 'OUT') return;
    setFormData((prev) => ({ ...prev, type: 'OUT' }));
    setInvoiceFile(null);
    setInvoiceNumber('');
    setPaymentSlips([]);
  }, [selectedOcInboundComplete, formData.type]);

  const linkedOcStockDocuments = useMemo(
    () =>
      buildLinkedOcStockDocuments(
        selectedOrderDetail,
        movementsForOc,
        formData.ocNumber
      ),
    [selectedOrderDetail, movementsForOc, formData.ocNumber]
  );

  const expectedBoletoParcelCount = useMemo(() => {
    if (!selectedOrderDetail || !isOcBoletoPaymentType(selectedOrderDetail.paymentType)) return 0;
    return selectedOrderDetail.paymentParcelCount ?? 1;
  }, [selectedOrderDetail]);

  const selectedOrderTotal = useMemo(() => {
    if (!selectedOrderDetail) return 0;
    return parseOrderTotalAmount(selectedOrderDetail);
  }, [selectedOrderDetail]);

  const paymentSlipAmountValidation = useMemo(() => {
    if (expectedBoletoParcelCount <= 1 || selectedOrderTotal <= 0 || paymentSlips.length === 0) {
      return { valid: true as const };
    }
    return validateInstallmentAmountsSum(paymentSlipsToRowDrafts(paymentSlips), selectedOrderTotal);
  }, [expectedBoletoParcelCount, selectedOrderTotal, paymentSlips]);

  useEffect(() => {
    if (formData.type !== 'IN') {
      paymentSlipsSeedRef.current = '';
      return;
    }
    const order = selectedPurchaseOrderData?.data as PurchaseOrderDetail | null | undefined;
    if (!order?.id || loadingSelectedPurchaseOrder || fetchingSelectedPurchaseOrder) return;

    const seedKey = orderBoletoDocumentsFingerprint(order);
    if (paymentSlipsSeedRef.current === seedKey) return;

    const seeded = buildStockPaymentSlipsForOrder(order, formData.ocNumber, movementsForOc);
    paymentSlipsSeedRef.current = seedKey;
    setPaymentSlips(seeded.length > 0 ? seeded : []);
  }, [
    formData.type,
    formData.ocNumber,
    selectedPurchaseOrderData,
    movementsForOc,
    loadingSelectedPurchaseOrder,
    fetchingSelectedPurchaseOrder
  ]);

  useEffect(() => {
    if (formData.type !== 'IN' || paymentSlips.length === 0) return;
    if (linkedOcStockDocuments.boletos.length === 0) return;
    setPaymentSlips((prev) => {
      const merged = mergeStockPaymentSlipsWithLinked(prev, linkedOcStockDocuments.boletos);
      const changed = merged.some(
        (slip, i) =>
          slip.url !== prev[i]?.url ||
          slip.originalName !== prev[i]?.originalName ||
          slip.amount !== prev[i]?.amount ||
          slip.dueDate !== prev[i]?.dueDate
      );
      return changed ? merged : prev;
    });
  }, [formData.type, linkedOcStockDocuments.boletos, paymentSlips.length]);

  const unresolvedOcMaterialNames = useMemo(() => {
    if (!selectedOrderDetail?.items?.length) return [];
    const names: string[] = [];
    for (const item of selectedOrderDetail.items) {
      if (constructionMaterialIdFromSinapiCode(item.material?.sinapiCode)) continue;
      const name = item.material?.name?.trim();
      if (name) names.push(name);
    }
    return Array.from(new Set(names));
  }, [selectedOrderDetail]);

  const unresolvedOcMaterialNamesKey = unresolvedOcMaterialNames.slice().sort().join('\0');

  const { data: resolvedMaterialsByName = [] } = useQuery({
    queryKey: ['construction-materials-resolve-by-names', unresolvedOcMaterialNamesKey],
    queryFn: () => resolveConstructionMaterialsByNames(unresolvedOcMaterialNames),
    enabled: isMovementModalOpen && unresolvedOcMaterialNames.length > 0,
    staleTime: 60_000,
  });

  const constructionMaterialIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const material of resolvedMaterialsByName) {
      map.set(normalizeMaterialName(material.name), material.id);
    }
    return map;
  }, [resolvedMaterialsByName]);

  const availableOcOptions = useMemo(() => {
    return purchaseOrders
      .filter((order) => Boolean(order.orderNumber))
      .filter((order, index, arr) => arr.findIndex((x) => x.orderNumber === order.orderNumber) === index)
      .filter((order) => {
        const inboundComplete = isOcInboundComplete(
          movementsForOc,
          order.orderNumber,
          order.items
        );
        const outboundComplete = isOcOutboundComplete(
          movementsForOc,
          order.orderNumber,
          order.items
        );
        // Entrada + saída totais → some da lista do estoque
        return !(inboundComplete && outboundComplete);
      })
      .sort((a, b) => b.orderNumber.localeCompare(a.orderNumber, 'pt-BR'));
  }, [movementsForOc, purchaseOrders]);
  const contractDropdownOptions = useMemo(() => {
    const byId = new Map<string, { value: string; label: string }>();
    for (const order of availableOcOptions) {
      const cc = order.materialRequest?.costCenter;
      if (!cc?.id) continue;
      if (!byId.has(cc.id)) {
        const fromCatalog = costCenters.find((item) => item.id === cc.id);
        byId.set(cc.id, {
          value: cc.id,
          label: fromCatalog?.name || cc.name || cc.code || cc.id,
        });
      }
    }
    const options = Array.from(byId.values()).sort((a, b) =>
      a.label.localeCompare(b.label, 'pt-BR')
    );
    if (!lockedUnbCostCenterId) return options;

    const locked = options.find((opt) => opt.value === lockedUnbCostCenterId);
    if (locked) return [locked];

    const fromCatalog = costCenters.find((item) => item.id === lockedUnbCostCenterId);
    return [
      {
        value: lockedUnbCostCenterId,
        label: fromCatalog?.name || fromCatalog?.code || 'UNB',
      },
    ];
  }, [availableOcOptions, costCenters, lockedUnbCostCenterId]);

  const ocOptionsForSelectedContract = useMemo(() => {
    if (!formData.costCenterId) return [];
    return availableOcOptions.filter(
      (order) => order.materialRequest?.costCenter?.id === formData.costCenterId
    );
  }, [availableOcOptions, formData.costCenterId]);

  const ocDropdownOptions = useMemo(
    () =>
      ocOptionsForSelectedContract.map((order) => {
        const cc = order.materialRequest?.costCenter;
        const fromCatalog = cc?.id
          ? costCenters.find((item) => item.id === cc.id)
          : undefined;
        const contractLabel =
          fromCatalog?.name || cc?.name || cc?.code || '';
        const status = getOcMovementDropdownStatus(
          movementsForOc,
          order.orderNumber,
          '',
          order.items,
          {
            contractLabel,
            itemCount: order.items?.length ?? 0,
            paymentType: order.paymentType,
            paymentParcelCount: order.paymentParcelCount,
            supplierName: order.supplier?.name,
          }
        );
        const shortNumber = formatOcShortNumber(order.orderNumber);
        return {
          value: order.orderNumber,
          label: `OC ${shortNumber}`,
          triggerLabel: `OC ${shortNumber} · ${status.label}`,
          description: status.description,
          statusSegments: status.statusSegments,
          searchText: [
            order.orderNumber,
            shortNumber,
            status.label,
            status.description,
            order.supplier?.name,
            order.paymentType,
          ]
            .filter(Boolean)
            .join(' '),
        };
      }),
    [ocOptionsForSelectedContract, movementsForOc, costCenters]
  );

  const handleContractChange = (costCenterId: string) => {
    setFormData((prev) => {
      const ocStillValid = availableOcOptions.some(
        (order) =>
          order.orderNumber === prev.ocNumber &&
          order.materialRequest?.costCenter?.id === costCenterId
      );
      return {
        ...prev,
        costCenterId,
        ocNumber: ocStillValid ? prev.ocNumber : '',
      };
    });
    if (
      formData.ocNumber &&
      !availableOcOptions.some(
        (order) =>
          order.orderNumber === formData.ocNumber &&
          order.materialRequest?.costCenter?.id === costCenterId
      )
    ) {
      setOcMovementItems([]);
    }
  };

  const handleOcNumberChange = (ocNumber: string) => {
    paymentSlipsSeedRef.current = '';
    setPaymentSlips([]);
    const order = purchaseOrders.find((item) => item.orderNumber === ocNumber);
    const inboundComplete = order
      ? isOcInboundComplete(movementsForOc, ocNumber, order.items)
      : false;
    if (inboundComplete) {
      setInvoiceFile(null);
      setInvoiceNumber('');
    }
    setFormData((prev) => ({
      ...prev,
      ocNumber,
      ...(inboundComplete ? { type: 'OUT' as const } : {}),
    }));
  };

  const selectedOrderDetailId = selectedOrderDetail?.id ?? null;
  const movementSplit = formData.movementSplit;

  useEffect(() => {
    if (!selectedOrderDetailId || !movementSplit || !formData.type || !formData.ocNumber.trim()) {
      setOcMovementItems((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const detail = selectedPurchaseOrderData?.data as PurchaseOrderDetail | null | undefined;
    if (!detail?.items?.length) {
      setOcMovementItems((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    const ocNumber = formData.ocNumber.trim();
    const movementType = formData.type;

    setOcMovementItems((prev) => {
      const nextItems = detail.items.map((item, index) => {
        const key = `${item.materialId}-${index}`;
        const prevRow = prev.find((row) => row.key === key);
        const orderedQuantity = Number(item.quantity || 0);
        const materialName = item.material?.name || `Material ${index + 1}`;
        const resolvedMaterialId =
          constructionMaterialIdFromSinapiCode(item.material?.sinapiCode) ||
          constructionMaterialIdByName.get(normalizeMaterialName(materialName)) ||
          '';
        const { referenceQuantity, remaining } = resolvedMaterialId
          ? getOcMaterialMovementAvailability(
              movementsForOc,
              ocNumber,
              movementType,
              resolvedMaterialId,
              orderedQuantity
            )
          : { referenceQuantity: orderedQuantity, remaining: 0 };
        const defaultQuantity = String(remaining > 0 ? remaining : movementType === 'OUT' ? 0 : referenceQuantity);
        const preservePartialEdits =
          movementSplit === 'PARCIAL' &&
          prevRow &&
          prev.length === detail.items.length;
        const preservedQuantity =
          preservePartialEdits && prevRow.checked ? prevRow.quantity : defaultQuantity;
        const clampedQuantity =
          movementSplit === 'PARCIAL' && remaining > 0
            ? clampOcMovementQuantityInput(preservedQuantity, remaining)
            : preservedQuantity;

        return {
          key,
          materialId: resolvedMaterialId,
          unresolvedMaterialId: !resolvedMaterialId,
          materialName,
          unit: item.unit || '-',
          originalQuantity: referenceQuantity,
          quantity: clampedQuantity,
          checked:
            movementSplit === 'TOTAL'
              ? remaining > 0
              : preservePartialEdits
                ? prevRow.checked
                : false,
        };
      });

      return ocMovementItemsEqual(prev, nextItems) ? prev : nextItems;
    });
  }, [
    selectedOrderDetailId,
    movementSplit,
    formData.type,
    formData.ocNumber,
    constructionMaterialIdByName,
    selectedPurchaseOrderData?.data,
    movementsForOc,
  ]);

  const exportRows = balances.map((b) => ({
    material: b.material.name,
    categoria: b.material.category || '-',
    centroDeCusto: b.costCenter?.name || 'Nao informado',
    quantidade: b.balance,
    unidadeDeMedida: b.material.unit
  }));

  const buildExportFilename = (ext: 'xlsx' | 'pdf') => {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `saldo-atual-estoque-${yyyy}-${mm}-${dd}-${hh}${min}.${ext}`;
  };

  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const XLSX = await import('xlsx');
      const worksheet = XLSX.utils.json_to_sheet(
        exportRows.map((row) => ({
          Material: row.material,
          Categoria: row.categoria,
          Contrato: row.centroDeCusto,
          Quantidade: row.quantidade,
          'Unidade de Medida': row.unidadeDeMedida
        }))
      );
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Lista de estoque');
      XLSX.writeFile(workbook, buildExportFilename('xlsx'));
      toast.success('Saldo atual exportado para Excel');
    } catch (error) {
      toast.error('Erro ao exportar para Excel');
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

      doc.setFontSize(14);
      doc.text('Lista de estoque', 40, 40);
      doc.setFontSize(9);
      doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 40, 58);

      const headers = ['Material', 'Categoria', 'Contrato', 'Quantidade', 'Unidade de Medida'];
      const xPositions = [40, 230, 360, 620, 700];
      let y = 90;

      doc.setFontSize(10);
      headers.forEach((header, index) => {
        doc.text(header, xPositions[index], y);
      });
      y += 16;
      doc.line(40, y, 800, y);
      y += 14;

      exportRows.forEach((row) => {
        if (y > 560) {
          doc.addPage();
          y = 50;
        }
        doc.text(String(row.material), xPositions[0], y);
        doc.text(String(row.categoria), xPositions[1], y);
        doc.text(String(row.centroDeCusto), xPositions[2], y);
        doc.text(String(row.quantidade), xPositions[3], y, { align: 'right' });
        doc.text(String(row.unidadeDeMedida), xPositions[4], y);
        y += 14;
      });

      doc.save(buildExportFilename('pdf'));
      toast.success('Saldo atual exportado para PDF');
    } catch (error) {
      toast.error('Erro ao exportar para PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const handleInvoiceUpload = async (file: File | null) => {
    if (!file) return;
    setIsUploadingInvoice(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/stock/upload-invoice', fd);
      const data = res.data?.data as UploadedInvoice | undefined;
      if (!data?.url) {
        throw new Error('Resposta inválida do servidor');
      }
      setInvoiceFile({
        url: data.url,
        originalName: data.originalName || file.name
      });
      toast.success('Nota fiscal anexada');
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Não foi possível anexar a nota fiscal';
      toast.error(message);
    } finally {
      setIsUploadingInvoice(false);
    }
  };

  const handleWithdrawalSheetUpload = async (file: File | null) => {
    if (!file) return;
    setIsUploadingWithdrawalSheet(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/stock/upload-withdrawal-sheet', fd);
      const data = res.data?.data as UploadedInvoice | undefined;
      if (!data?.url) {
        throw new Error('Resposta inválida do servidor');
      }
      setWithdrawalSheetFile({
        url: data.url,
        originalName: data.originalName || file.name
      });
      toast.success('Ficha de retirada anexada');
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Não foi possível anexar a ficha de retirada';
      toast.error(message);
    } finally {
      setIsUploadingWithdrawalSheet(false);
    }
  };

  const handleAddPaymentSlip = () => {
    const nextId = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setPaymentSlips((prev) => [...prev, { id: nextId, url: '', originalName: '', amount: '', dueDate: '' }]);
  };

  const handleRemovePaymentSlip = (id: string) => {
    setPaymentSlips((prev) => prev.filter((item) => item.id !== id));
  };

  const handlePaymentSlipFieldChange = (id: string, field: 'amount' | 'dueDate', value: string) => {
    setPaymentSlips((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]: field === 'amount' ? formatCurrencyInputBrl(value) : value
            }
          : item
      )
    );
  };

  const handlePaymentSlipAmountChange = (slipIndex: number, rawValue: string) => {
    const orderTotal = selectedOrderDetail ? parseOrderTotalAmount(selectedOrderDetail) : 0;
    if (expectedBoletoParcelCount > 1 && orderTotal > 0) {
      setPaymentSlips((prev) => {
        const drafts = paymentSlipsToRowDrafts(prev);
        const masked = maskCurrencyInputBrOrEmpty(rawValue);
        const { rows, wasCapped } = redistributeInstallmentAmounts(
          drafts,
          slipIndex,
          masked,
          orderTotal,
          prev.map(() => false)
        );
        if (wasCapped) {
          toast.error(
            `O valor não pode ultrapassar o total da OC (${formatMoneyDisplay(orderTotal)}).`
          );
        }
        return mergeRowDraftsIntoPaymentSlips(prev, rows);
      });
      return;
    }
    const slip = paymentSlips[slipIndex];
    if (slip) handlePaymentSlipFieldChange(slip.id, 'amount', rawValue);
  };

  const handlePaymentSlipUpload = async (id: string, file: File | null) => {
    if (!file) return;
    setUploadingPaymentSlipId(id);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/stock/upload-payment-slip', fd);
      const data = res.data?.data as UploadedInvoice | undefined;
      if (!data?.url) {
        throw new Error('Resposta inválida do servidor');
      }
      setPaymentSlips((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                url: data.url,
                originalName: data.originalName || file.name
              }
            : item
        )
      );
      toast.success('Boleto anexado');
    } catch (error: any) {
      const message = error?.response?.data?.message || 'Não foi possível anexar o boleto';
      toast.error(message);
    } finally {
      setUploadingPaymentSlipId(null);
    }
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/estoque">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Estoque</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Gerencie entradas, saídas e consulte saldos
            </p>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('balance')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'balance'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
                }`}
              >
                <Box className="w-4 h-4" />
                Lista de estoque
              </button>
              <button
                onClick={() => setActiveTab('movements')}
                className={`flex items-center gap-2 py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'movements'
                    ? 'border-red-600 text-red-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
                }`}
              >
                <History className="w-4 h-4" />
                Histórico
              </button>
            </nav>
          </div>

          {activeTab === 'balance' && (
            <Card className="w-full">
              <CardHeader className="border-b-0 pb-1">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <Box className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Lista de estoque</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Consulte materiais e quantidades em estoque por contrato
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        value={filtersSearch}
                        onChange={(e) => setFiltersSearch(e.target.value)}
                        placeholder="Pesquisar material..."
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      {filtersSearch && (
                        <button
                          type="button"
                          onClick={() => setFiltersSearch('')}
                          aria-label="Limpar busca"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsBalanceFiltersModalOpen(true)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      aria-label="Abrir filtro"
                      title="Filtro"
                    >
                      <Filter className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleExportExcel}
                      disabled={isExporting || balances.length === 0}
                      className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      <span>Exportar Excel</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportPdf}
                      disabled={isExporting || balances.length === 0}
                      className="flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                    >
                      <Download className="h-4 w-4 shrink-0" />
                      <span>Exportar PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (lockedUnbCostCenterId) {
                          setFormData((prev) => ({
                            ...prev,
                            costCenterId: lockedUnbCostCenterId,
                          }));
                        }
                        setIsMovementModalOpen(true);
                      }}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <ArrowLeftRight className="h-4 w-4 shrink-0" />
                      <span>Nova Movimentação</span>
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingBalance ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 dark:text-gray-400">Carregando saldo...</p>
                  </div>
                ) : groupedBalances.length === 0 ? (
                  <div className="text-center py-8">
                    <Box className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">Nenhum material em estoque</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                      Ajuste os filtros ou cadastre materiais para exibir o saldo
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                      <span>
                        Mostrando {balanceStartItem} a {balanceEndItem} de {balanceTotal} materiais
                      </span>
                      <span>
                        Página {balanceCurrentPage} de {balanceTotalPages}
                      </span>
                    </div>
                    <div className="table-scroll">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="w-36 px-3 sm:px-4 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Detalhes
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Material
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Categoria
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Quantidade total
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Unidade
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {paginatedGroupedBalances.map((group) => {
                            const totalBalance = group.lines.reduce((sum, line) => sum + line.balance, 0);
                            const costCenterCount = group.lines.length;
                            return (
                            <tr
                              key={group.material.id}
                              className={listTableRowClasses.tr}
                            >
                              <td className="px-3 sm:px-4 py-3">
                                <button
                                  type="button"
                                  onClick={() => setBalanceDetail(group)}
                                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-gray-200"
                                  title="Ver saldo por contrato"
                                >
                                  <Eye className="h-3.5 w-3.5 shrink-0 opacity-70" />
                                  <span className="whitespace-nowrap">
                                    {costCenterCount === 1 ? '1 contrato' : `${costCenterCount} contratos`}
                                  </span>
                                </button>
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                                <span className="text-sm text-gray-900 dark:text-gray-100">{group.material.name}</span>
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                                {group.material.category || '—'}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-right font-semibold text-gray-900 dark:text-gray-100">
                                {totalBalance.toLocaleString('pt-BR')}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-right text-gray-700 dark:text-gray-300">
                                {group.material.unit}
                              </td>
                            </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {balanceTotalPages > 1 && (
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setBalanceCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={balanceCurrentPage === 1}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() => setBalanceCurrentPage((prev) => Math.min(prev + 1, balanceTotalPages))}
                          disabled={balanceCurrentPage === balanceTotalPages}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Próxima
                        </button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>

              {isBalanceFiltersModalOpen && (
                <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => setIsBalanceFiltersModalOpen(false)}
                  />
                  <div className="relative mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
                    <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                      <button
                        type="button"
                        onClick={() => setIsBalanceFiltersModalOpen(false)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                        aria-label="Fechar filtros"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="px-5 py-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Contrato
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersCostCenterId}
                            onChange={setFiltersCostCenterId}
                            options={costCenterFilterOptions}
                            allowEmpty={false}
                            disabled={Boolean(lockedUnbCostCenterId)}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Categoria
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersCategory}
                            onChange={setFiltersCategory}
                            options={categoryFilterOptions}
                            allowEmpty={false}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={clearBalanceFilters}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Limpar filtros
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsBalanceFiltersModalOpen(false)}
                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {activeTab === 'movements' && (
            <Card className="w-full">
              <CardHeader className="border-b-0 pb-1">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center space-x-3">
                    <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                      <History className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Histórico de Movimentações
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Consulte entradas e saídas registradas no estoque
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                    <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Pesquisar OC, material..."
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      {historySearch && (
                        <button
                          type="button"
                          onClick={() => setHistorySearch('')}
                          aria-label="Limpar busca"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsHistoryFiltersModalOpen(true)}
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      aria-label="Abrir filtro"
                      title="Filtro"
                    >
                      <Filter className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingMovements ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600 dark:text-gray-400">Carregando histórico...</p>
                  </div>
                ) : filteredMovements.length === 0 ? (
                  <div className="text-center py-8">
                    <History className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">Nenhuma movimentação encontrada</p>
                    <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
                      Ajuste os filtros ou registre uma nova movimentação
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                      <span>
                        Mostrando {historyStartItem} a {historyEndItem} de {historyTotal} movimentações
                      </span>
                      <span>
                        Página {historyCurrentPage} de {historyTotalPages}
                      </span>
                    </div>
                    <div className="table-scroll">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Data
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              OC
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Material
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Movimento
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Quantidade
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Contrato
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Registrado por
                            </th>
                            <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Ação
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {paginatedMovements.map((mov) => {
                            const ocRaw = extractOcNumberFromNotes(mov.notes);
                            const ocNumber = ocRaw ? formatOcShortNumber(ocRaw) : '—';
                            return (
                              <tr
                                key={mov.id}
                                onClick={() => setHistoryDetail(mov)}
                                className={getListTableRowClassName(true)}
                              >
                                <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                  {new Date(mov.createdAt).toLocaleString('pt-BR')}
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm">
                                  <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">{ocNumber}</span>
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                                  <ListRowNavigableLabel className="font-medium">{mov.material.name}</ListRowNavigableLabel>
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-center">
                                  <span
                                    className={`inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                                      mov.type === 'IN'
                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                    }`}
                                  >
                                    {mov.type === 'IN' ? (
                                      <ArrowDownCircle className="h-3.5 w-3.5 shrink-0" />
                                    ) : (
                                      <ArrowUpCircle className="h-3.5 w-3.5 shrink-0" />
                                    )}
                                    {mov.type === 'IN' ? 'Entrada' : 'Saída'}
                                  </span>
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm text-right font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                  {mov.quantity.toLocaleString('pt-BR')} {mov.material.unit}
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                                  {mov.costCenter?.name || '—'}
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300">
                                  {mov.user.name}
                                </td>
                                <td className="px-3 sm:px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => setHistoryDetail(mov)}
                                    className={rowActionMenuButtonClass(false)}
                                    aria-label="Ver detalhes"
                                  >
                                    <MoreVertical className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {historyTotalPages > 1 && (
                      <div className="mt-4 flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setHistoryCurrentPage((prev) => Math.max(prev - 1, 1))}
                          disabled={historyCurrentPage === 1}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Anterior
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistoryCurrentPage((prev) => Math.min(prev + 1, historyTotalPages))}
                          disabled={historyCurrentPage === historyTotalPages}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Próxima
                        </button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>

              {isHistoryFiltersModalOpen && (
                <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
                  <div
                    className="absolute inset-0 bg-black/40"
                    onClick={() => setIsHistoryFiltersModalOpen(false)}
                  />
                  <div className="relative mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
                    <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                      <button
                        type="button"
                        onClick={() => setIsHistoryFiltersModalOpen(false)}
                        className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                        aria-label="Fechar filtros"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="px-5 py-4">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Contrato
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersCostCenterId}
                            onChange={setFiltersCostCenterId}
                            options={costCenterFilterOptions}
                            allowEmpty={false}
                            disabled={Boolean(lockedUnbCostCenterId)}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Categoria
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersCategory}
                            onChange={setFiltersCategory}
                            options={categoryFilterOptions}
                            allowEmpty={false}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Mês
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersMonth}
                            onChange={setFiltersMonth}
                            options={stockMonthFilterOptions}
                            allowEmpty={false}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Ano
                          </label>
                          <StringSingleSelectDropdown
                            value={filtersYear}
                            onChange={setFiltersYear}
                            options={stockYearFilterOptions}
                            allowEmpty={false}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={clearHistoryFilters}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Limpar filtros
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsHistoryFiltersModalOpen(false)}
                        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                      >
                        Fechar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {balanceDetail && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setBalanceDetail(null)}
                aria-hidden
              />
              <div
                className="relative z-10 w-full max-w-lg max-h-[min(90vh,32rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
                role="dialog"
                aria-modal="true"
                aria-labelledby="balance-detail-modal-title"
              >
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                  <h2
                    id="balance-detail-modal-title"
                    className="text-base font-semibold text-gray-900 dark:text-gray-100 pr-2"
                  >
                    Saldo por contrato
                  </h2>
                  <button
                    type="button"
                    onClick={() => setBalanceDetail(null)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                    aria-label="Fechar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Material</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {balanceDetail.material.name}
                      </span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Categoria</span>
                      <span className="text-gray-800 dark:text-gray-200">
                        {balanceDetail.material.category || '—'}
                      </span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Quantidade total</span>
                      <span className="font-semibold text-gray-900 dark:text-gray-100">
                        {balanceDetail.lines
                          .reduce((sum, line) => sum + line.balance, 0)
                          .toLocaleString('pt-BR')}
                      </span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Unidade de medida</span>
                      <span className="text-gray-800 dark:text-gray-200">{balanceDetail.material.unit}</span>
                    </p>
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Contratos</span>
                      <span className="text-gray-800 dark:text-gray-200">{balanceDetail.lines.length}</span>
                    </p>
                  </div>
                  <div className="table-scroll rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/80">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Contrato
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Quantidade
                          </th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                            Unidade de medida
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {balanceDetail.lines.map((line, index) => (
                          <tr key={line.costCenter?.id || `sem-cc-${index}`}>
                            <td className="px-4 py-2.5 text-gray-800 dark:text-gray-200">
                              {line.costCenter?.name || 'Não informado'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900 dark:text-gray-100">
                              {line.balance.toLocaleString('pt-BR')}
                            </td>
                            <td className="px-4 py-2.5 text-right text-gray-700 dark:text-gray-300">
                              {balanceDetail.material.unit}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {historyDetail && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-black/40"
                onClick={() => setHistoryDetail(null)}
                aria-hidden
              />
              <div className="relative z-10 w-full max-w-lg max-h-[min(90vh,32rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 pr-2">
                    Detalhe da movimentação
                  </h2>
                  <button
                    type="button"
                    onClick={() => setHistoryDetail(null)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="p-4 space-y-3 text-sm text-gray-800 dark:text-gray-200">
                  <p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">Material</span>
                    <span className="font-medium">{historyDetail.material.name}</span>
                  </p>
                  <p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">OC</span>
                    <span>
                      {formatOcShortNumber(extractOcNumberFromNotes(historyDetail.notes) || '') || '—'}
                    </span>
                  </p>
                  <p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">Movimento</span>
                    <span>{historyDetail.type === 'IN' ? 'Entrada' : 'Saída'} — {historyDetail.quantity}{' '}
                      {historyDetail.material.unit}</span>
                  </p>
                  {historyDetail.costCenter && (
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Contrato</span>
                      <span>{historyDetail.costCenter.name || historyDetail.costCenter.code}</span>
                    </p>
                  )}
                  <p>
                    <span className="text-xs text-gray-500 dark:text-gray-400 block">Saldo atual (contrato)</span>
                    <span>
                      {(() => {
                        const key = `${historyDetail.material.id}:${historyDetail.costCenter?.id || 'no-cost-center'}`;
                        const currentBalance = balanceByMaterialAndCostCenter.get(key);
                        if (currentBalance === undefined) return `0 ${historyDetail.material.unit}`;
                        return `${currentBalance.toLocaleString('pt-BR')} ${historyDetail.material.unit}`;
                      })()}
                    </span>
                  </p>
                  {historyDetail.notes && (
                    <p>
                      <span className="text-xs text-gray-500 dark:text-gray-400 block">Observações</span>
                      <span className="whitespace-pre-line">{historyDetail.notes}</span>
                    </p>
                  )}
                  {historyDetail.notes && extractFirstUrl(historyDetail.notes) && (
                    <a
                      href={absoluteUploadUrl(extractFirstUrl(historyDetail.notes))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline inline-block"
                    >
                      Abrir anexo
                    </a>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {new Date(historyDetail.createdAt).toLocaleString('pt-BR')} — {historyDetail.user.name}
                  </p>
                </div>
              </div>
            </div>
          )}

          {isMovementModalOpen && (
            <div className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={closeMovementModal} aria-hidden />
              <div
                className="relative flex max-h-[min(92vh,900px)] w-full max-w-4xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
                role="dialog"
                aria-modal="true"
                aria-labelledby="movement-modal-title"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                  <h3 id="movement-modal-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Nova Movimentação
                  </h3>
                  <button
                    type="button"
                    onClick={closeMovementModal}
                    className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-0 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    aria-label="Fechar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="overflow-y-auto px-5 py-4 [&_*:focus]:outline-none [&_*:focus]:ring-0 [&_*:focus-visible]:outline-none [&_*:focus-visible]:ring-0">
                  <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Contrato
                  </label>
                  <SingleSelectSearchDropdown
                    value={formData.costCenterId}
                    onChange={handleContractChange}
                    options={contractDropdownOptions}
                    disabled={
                      Boolean(lockedUnbCostCenterId) ||
                      loadingPurchaseOrders ||
                      loadingCostCenters
                    }
                    allowEmpty={false}
                    placeholder={
                      loadingPurchaseOrders || loadingCostCenters
                        ? 'Carregando contratos...'
                        : 'Selecionar contrato...'
                    }
                    emptyOptionsMessage="Nenhum contrato com OC disponível para movimentação."
                    noFocusRing
                  />
                  {!loadingPurchaseOrders && contractDropdownOptions.length === 0 && (
                    <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">
                      Nenhum contrato com OC disponível. Todas já tiveram entrada e saída
                      concluídas ou não há OCs cadastradas.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    OC
                  </label>
                  <SingleSelectSearchDropdown
                    value={formData.ocNumber}
                    onChange={handleOcNumberChange}
                    options={ocDropdownOptions}
                    disabled={loadingPurchaseOrders || !formData.costCenterId}
                    allowEmpty={false}
                    placeholder={
                      !formData.costCenterId
                        ? 'Selecione um contrato'
                        : loadingPurchaseOrders
                          ? 'Carregando OCs...'
                          : 'Selecionar OC...'
                    }
                    emptyOptionsMessage="Nenhuma OC disponível para este contrato."
                    noFocusRing
                  />
                  {formData.costCenterId &&
                    !loadingPurchaseOrders &&
                    ocOptionsForSelectedContract.length === 0 && (
                      <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-500">
                        Nenhuma OC disponível para este contrato.
                      </p>
                    )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Movimento *
                </label>
                <div className="flex gap-2">
                  {!selectedOcInboundComplete ? (
                    <MovementSegButton
                      active={formData.type === 'IN'}
                      variant="in"
                      icon={ArrowDownCircle}
                      onClick={() => {
                        setFormData((prev) => ({ ...prev, type: 'IN' }));
                        setWithdrawalSheetFile(null);
                      }}
                      label="Entrada"
                    />
                  ) : null}
                  <MovementSegButton
                    active={formData.type === 'OUT'}
                    variant="out"
                    icon={ArrowUpCircle}
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, type: 'OUT' }));
                      setInvoiceFile(null);
                      setInvoiceNumber('');
                      setPaymentSlips([]);
                    }}
                    label="Saída"
                  />
                </div>
                {selectedOcInboundComplete ? (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Entrada já concluída — disponível apenas saída.
                  </p>
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tipo da Movimentação *
                </label>
                <div className="flex gap-2">
                  <ButtonSeg
                    active={formData.movementSplit === 'TOTAL'}
                    onClick={() => setFormData((prev) => ({ ...prev, movementSplit: 'TOTAL' }))}
                    label="Total"
                  />
                  <ButtonSeg
                    active={formData.movementSplit === 'PARCIAL'}
                    onClick={() => setFormData((prev) => ({ ...prev, movementSplit: 'PARCIAL' }))}
                    label="Parcial"
                  />
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Itens da OC *
                </label>
                {loadingSelectedPurchaseOrder ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Carregando itens da OC...</p>
                ) : !formData.ocNumber ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Selecione uma OC para exibir os itens.
                  </p>
                ) : ocMovementItems.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Selecione o tipo da movimentação (Total ou Parcial).
                  </p>
                ) : (
                  <div className="table-scroll rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className={`${cadastroListClasses.table} min-w-[36rem] !table-auto`}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          {formData.movementSplit !== 'TOTAL' ? (
                            <th className={`${cadastroListClasses.thCenter} w-14`}>Sel.</th>
                          ) : null}
                          <th className={`${cadastroListClasses.thCenter} w-14`}>Item</th>
                          <th className={cadastroListClasses.th}>Material</th>
                          <th className={`${cadastroListClasses.thCenter} w-16`}>Un.</th>
                          <th className={`${cadastroListClasses.thCenter} w-28`}>Restante</th>
                          <th className={`${cadastroListClasses.thCenter} w-28`}>
                            {formData.type === 'OUT' ? 'Saída' : 'Entrada'}
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {ocMovementItems.map((item, itemIndex) => {
                          const isTotalSplit = formData.movementSplit === 'TOTAL';
                          const itemDisabled = isTotalSplit;
                          const { referenceQuantity, remaining } =
                            item.materialId && formData.type
                              ? getOcMaterialMovementAvailability(
                                  movementsForOc,
                                  formData.ocNumber.trim(),
                                  formData.type,
                                  item.materialId,
                                  item.originalQuantity
                                )
                              : { referenceQuantity: item.originalQuantity, remaining: 0 };
                          const itemFullyMoved = remaining <= 0;
                          const checkboxDisabled =
                            itemDisabled || itemFullyMoved || item.unresolvedMaterialId;
                          const remainingLabel = item.unresolvedMaterialId
                            ? '—'
                            : itemFullyMoved
                              ? '0'
                              : Math.abs(remaining - referenceQuantity) < 0.0001
                                ? String(remaining)
                                : `${remaining} (de ${referenceQuantity})`;
                          return (
                            <tr key={item.key} className={getListTableRowClassName(false)}>
                              {!isTotalSplit ? (
                                <td className={cadastroListClasses.tdCenter}>
                                  <label
                                    className={`inline-flex items-center justify-center ${
                                      checkboxDisabled
                                        ? 'cursor-default opacity-70'
                                        : 'cursor-pointer'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={item.checked}
                                      disabled={checkboxDisabled}
                                      onChange={(e) =>
                                        setOcMovementItems((prev) =>
                                          prev.map((row) =>
                                            row.key === item.key
                                              ? { ...row, checked: e.target.checked }
                                              : row
                                          )
                                        )
                                      }
                                      className="sr-only"
                                    />
                                    <CheckboxIndicator checked={item.checked} />
                                  </label>
                                </td>
                              ) : null}
                              <td
                                className={`${cadastroListClasses.tdCenter} tabular-nums font-medium text-gray-800 dark:text-gray-200`}
                              >
                                {itemIndex + 1}
                              </td>
                              <td className={cadastroListClasses.td}>
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {item.materialName}
                                </p>
                                {item.unresolvedMaterialId && (
                                  <p className="mt-0.5 text-xs text-red-500 dark:text-red-400">
                                    Não encontrado no estoque
                                  </p>
                                )}
                              </td>
                              <td className={cadastroListClasses.tdCenter}>{item.unit}</td>
                              <td
                                className={`${cadastroListClasses.tdCenter} tabular-nums ${
                                  itemFullyMoved && !item.unresolvedMaterialId
                                    ? 'text-red-600 dark:text-red-400'
                                    : 'text-gray-700 dark:text-gray-300'
                                }`}
                                title={
                                  itemFullyMoved && !item.unresolvedMaterialId
                                    ? formData.type === 'OUT'
                                      ? 'Toda a entrada desta OC já foi retirada'
                                      : 'Quantidade desta OC já movimentada'
                                    : undefined
                                }
                              >
                                {remainingLabel}
                              </td>
                              <td
                                className={`${cadastroListClasses.tdCenter} tabular-nums font-medium text-gray-900 dark:text-gray-100`}
                              >
                                {isTotalSplit || checkboxDisabled || !item.checked ? (
                                  item.quantity || '—'
                                ) : (
                                  <input
                                    type="text"
                                    inputMode="decimal"
                                    value={item.quantity}
                                    onChange={(e) => {
                                      const nextQuantity = clampOcMovementQuantityInput(
                                        e.target.value,
                                        remaining
                                      );
                                      setOcMovementItems((prev) =>
                                        prev.map((row) =>
                                          row.key === item.key
                                            ? { ...row, quantity: nextQuantity }
                                            : row
                                        )
                                      );
                                    }}
                                    onBlur={() => {
                                      setOcMovementItems((prev) =>
                                        prev.map((row) => {
                                          if (row.key !== item.key) return row;
                                          const parsed = parseOcMovementQuantityInput(row.quantity);
                                          if (parsed == null) return row;
                                          if (parsed > remaining + 0.0001) {
                                            return {
                                              ...row,
                                              quantity: formatOcMovementQuantityInput(remaining),
                                            };
                                          }
                                          return row;
                                        })
                                      );
                                    }}
                                    className="mx-auto w-full max-w-[6.5rem] rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-center text-sm tabular-nums text-gray-900 transition-colors focus:border-red-500 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:focus:border-red-400"
                                  />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Observações
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  placeholder="Observações sobre a movimentação..."
                />
              </div>
              {formData.type === 'OUT' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Ficha de Retirada *
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 text-sm">
                      {isUploadingWithdrawalSheet ? 'Enviando...' : 'Escolher arquivo'}
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,image/*"
                        disabled={isUploadingWithdrawalSheet}
                        onChange={(e) => {
                          const selectedFile = e.target.files?.[0] || null;
                          void handleWithdrawalSheetUpload(selectedFile);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {withdrawalSheetFile && (
                      <>
                        <a
                          href={absoluteUploadUrl(withdrawalSheetFile.url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {withdrawalSheetFile.originalName}
                        </a>
                        <button
                          type="button"
                          onClick={() => setWithdrawalSheetFile(null)}
                          className="text-sm text-red-600 dark:text-red-400 hover:underline"
                        >
                          Remover
                        </button>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Obrigatório para saída. Formatos aceitos: PDF, PNG, JPG e WEBP (até 15MB).
                  </p>
                </div>
              )}
              {formData.type === 'IN' && (
                <div className="space-y-5 rounded-lg border border-gray-200 p-3 dark:border-gray-700 sm:p-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Nota fiscal{linkedOcStockDocuments.invoices.length === 0 ? ' *' : ''}
                    </label>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                        Número da nota fiscal *
                      </label>
                      <input
                        type="text"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        placeholder={
                          linkedOcStockDocuments.invoices[0]?.number
                            ? `Ex.: ${linkedOcStockDocuments.invoices[0].number}`
                            : 'Ex.: 123456'
                        }
                        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                      />
                      {!invoiceNumber.trim() && linkedOcStockDocuments.invoices[0]?.number ? (
                        <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">
                          Se vazio, usa o nº já vinculado: {linkedOcStockDocuments.invoices[0].number}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
                        {isUploadingInvoice ? 'Enviando...' : 'Escolher arquivo'}
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.xml,image/*"
                          disabled={isUploadingInvoice}
                          onChange={(e) => {
                            const selectedFile = e.target.files?.[0] || null;
                            void handleInvoiceUpload(selectedFile);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                      {invoiceFile && (
                        <>
                          <a
                            href={absoluteUploadUrl(invoiceFile.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {invoiceFile.originalName}
                          </a>
                          <button
                            type="button"
                            onClick={() => setInvoiceFile(null)}
                            className="text-sm text-red-600 hover:underline dark:text-red-400"
                          >
                            Remover
                          </button>
                        </>
                      )}
                      {!invoiceFile && linkedOcStockDocuments.invoices[0] && (
                        <span className="text-sm text-emerald-700 dark:text-emerald-300">
                          Usando NF já vinculada: {linkedOcStockDocuments.invoices[0].name}
                          {linkedOcStockDocuments.invoices[0].number
                            ? ` (nº ${linkedOcStockDocuments.invoices[0].number})`
                            : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Formatos: PDF, XML, PNG, JPG e WEBP (até 15MB).
                    </p>
                  </div>

                  {isOcBoletoPaymentType(selectedOrderDetail?.paymentType) && (
                  <div className="space-y-2 border-t border-gray-200 pt-5 dark:border-gray-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Boletos para pagamento
                        {expectedBoletoParcelCount > 1
                          ? ` (${expectedBoletoParcelCount} parcelas)`
                          : ''}
                      </label>
                      {expectedBoletoParcelCount <= 1 ? (
                        <button
                          type="button"
                          onClick={handleAddPaymentSlip}
                          className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                        >
                          + Adicionar boleto
                        </button>
                      ) : null}
                    </div>
                    {!paymentSlipAmountValidation.valid && paymentSlipAmountValidation.message ? (
                      <p className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                        {paymentSlipAmountValidation.message}
                      </p>
                    ) : null}
                    {paymentSlips.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {linkedOcStockDocuments.boletos.length > 0
                          ? 'Boletos já vinculados serão reutilizados automaticamente. Adicione apenas se precisar incluir novos.'
                          : 'Adicione quantos boletos forem necessários.'}
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {paymentSlips.map((slip, index) => {
                          const parcelNumber = index + 1;
                          const parcelLabel =
                            expectedBoletoParcelCount > 1
                              ? `${parcelNumber}${index === 0 ? ' *' : ''}`
                              : String(parcelNumber);
                          return (
                            <div
                              key={slip.id}
                              className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-600 dark:bg-gray-900/30 sm:p-3.5"
                            >
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                  Parcela {parcelLabel}
                                </p>
                                {expectedBoletoParcelCount <= 1 ? (
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePaymentSlip(slip.id)}
                                    className="text-xs text-red-600 hover:underline dark:text-red-400"
                                  >
                                    Remover
                                  </button>
                                ) : null}
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
                                <div className="sm:col-span-4">
                                  <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                                    Arquivo
                                  </span>
                                  {slip.url ? (
                                    <div className="flex min-w-0 flex-col gap-1">
                                      <a
                                        href={absoluteUploadUrl(slip.url)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
                                      >
                                        {slip.originalName || `Boleto parcela ${parcelNumber}`}
                                      </a>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                                          Vinculado
                                        </span>
                                        <label className="cursor-pointer text-[11px] text-gray-500 underline hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                                          {uploadingPaymentSlipId === slip.id
                                            ? 'Enviando...'
                                            : 'Substituir'}
                                          <input
                                            type="file"
                                            className="hidden"
                                            accept=".pdf,image/*"
                                            disabled={uploadingPaymentSlipId === slip.id}
                                            onChange={(e) => {
                                              const selectedFile = e.target.files?.[0] || null;
                                              void handlePaymentSlipUpload(slip.id, selectedFile);
                                              e.currentTarget.value = '';
                                            }}
                                          />
                                        </label>
                                      </div>
                                    </div>
                                  ) : (
                                    <label className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700">
                                      {uploadingPaymentSlipId === slip.id
                                        ? 'Enviando...'
                                        : 'Escolher arquivo'}
                                      <input
                                        type="file"
                                        className="hidden"
                                        accept=".pdf,image/*"
                                        disabled={uploadingPaymentSlipId === slip.id}
                                        onChange={(e) => {
                                          const selectedFile = e.target.files?.[0] || null;
                                          void handlePaymentSlipUpload(slip.id, selectedFile);
                                          e.currentTarget.value = '';
                                        }}
                                      />
                                    </label>
                                  )}
                                </div>
                                <div className="sm:col-span-4">
                                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                                    Valor
                                  </label>
                                  <input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="R$ 0,00"
                                    value={slip.amount}
                                    onChange={(e) =>
                                      expectedBoletoParcelCount > 1
                                        ? handlePaymentSlipAmountChange(index, e.target.value)
                                        : handlePaymentSlipFieldChange(
                                            slip.id,
                                            'amount',
                                            e.target.value
                                          )
                                    }
                                    className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm tabular-nums text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                  />
                                </div>
                                <div className="sm:col-span-4">
                                  <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
                                    Vencimento
                                  </label>
                                  <input
                                    type="date"
                                    value={slip.dueDate}
                                    onChange={(e) =>
                                      handlePaymentSlipFieldChange(
                                        slip.id,
                                        'dueDate',
                                        e.target.value
                                      )
                                    }
                                    className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  )}
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={closeMovementModal}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createMovementMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {createMovementMutation.isPending ? 'Registrando...' : 'Registrar Movimentação'}
                </button>
              </div>
            </form>
                </div>
              </div>
            </div>
          )}

        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
