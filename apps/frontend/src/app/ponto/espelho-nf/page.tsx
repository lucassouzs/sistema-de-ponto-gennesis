'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Pencil,
  Plus,
  Search,
  Trash2,
  MoreVertical,
  X
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import { getListTableRowClassName, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import toast from 'react-hot-toast';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import {
  buildEspelhoDetailRows,
  computeEspelhoBasesCalculoInssIss,
  computeEspelhoMaterialLimits,
  computeEspelhoReforcoGarantiaRetidoRs,
  espelhoMirrorForExport,
  exportEspelhoNfPdf,
  fmtEspelhoBrl,
  parseEspelhoBrCurrencyToNumber,
  parseEspelhoPercentToNumber,
  round2
} from '@/lib/exportEspelhoNfLayout';
import { maskCurrencyInputBr } from '@/lib/maskCurrencyBr';
import {
  ESPELHO_APPROVAL_STATUS_LABELS,
  type EspelhoApprovalStatus,
  removeEspelhoApprovalStatus,
  resolveEspelhoApprovalStatus,
  updateEspelhoApprovalStatus
} from '@/lib/espelhoNfApproval';
import { useCostCenters } from '@/hooks/useCostCenters';
import {
  EspelhoNfTaxCodeContractFields,
  emptyTaxCodeFormState,
  INITIAL_FEDERAL_TAX_CONTEXT_ENABLED,
  INITIAL_FEDERAL_TAX_RATES,
  INITIAL_FEDERAL_TAX_RATES_BY_CONTEXT,
  mergeFederalTaxStateFromApi,
  normalizeEspelhoPercentBlur,
  type FederalTaxContextEnabled,
  type FederalTaxContextKey,
  type FederalTaxRates,
  type FederalTaxRatesByContext,
  type TaxCodeFormState,
  type TaxRule
} from '@/components/espelho-nf/EspelhoNfTaxCodeContractFields';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

/** Campos opcionais que o usuário escolhe exibir no formulário (Constar na nota fiscal). */
type NfConstarNaNotaFields = {
  obraCno: boolean;
  garantiaComplementar: boolean;
  processNumber: boolean;
  empenhoNumber: boolean;
  serviceOrder: boolean;
  buildingUnit: boolean;
  observations: boolean;
};

const DEFAULT_NF_CONSTAR_NA_NOTA: NfConstarNaNotaFields = {
  obraCno: false,
  garantiaComplementar: false,
  processNumber: false,
  empenhoNumber: false,
  serviceOrder: false,
  buildingUnit: false,
  observations: false
};

const NF_CONSTAR_FIELD_LABELS: Record<keyof NfConstarNaNotaFields, string> = {
  obraCno: 'Número da nscrição da Obra / CNO',
  garantiaComplementar: 'Garantia complementar',
  processNumber: 'Número do Processo',
  empenhoNumber: 'Número do Empenho',
  serviceOrder: 'Ordem de Serviço',
  buildingUnit: 'Unidade Predial',
  observations: 'Observações'
};

function parseNfConstarNaNota(raw: unknown): NfConstarNaNotaFields {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_NF_CONSTAR_NA_NOTA };
  const o = raw as Record<string, unknown>;
  return {
    obraCno: Boolean(o.obraCno),
    garantiaComplementar: Boolean(o.garantiaComplementar),
    processNumber: Boolean(o.processNumber),
    empenhoNumber: Boolean(o.empenhoNumber),
    serviceOrder: Boolean(o.serviceOrder),
    buildingUnit: Boolean(o.buildingUnit),
    observations: Boolean(o.observations)
  };
}

/** Máscara CNO: xx.xxx.xxxxx/xx (12 dígitos). */
function maskCnoObraInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 10)}/${digits.slice(10, 12)}`;
}

type MirrorDraft = {
  measurementRef: string;
  costCenterId: string;
  dueDate: string;
  municipality: string;
  cnae: string;
  serviceIssqn: string;
  empenhoNumber: string;
  processNumber: string;
  serviceOrder: string;
  measurementStartDate: string;
  measurementEndDate: string;
  buildingUnit: string;
  /** CNO — formato xx.xxx.xxxxx/xx */
  obraCno: string;
  /** Garantia complementar (texto livre) */
  garantiaComplementar: string;
  observations: string;
  notes: string;
  measurementAmount: string;
  laborAmount: string;
  materialAmount: string;
  providerId: string;
  providerName: string;
  takerId: string;
  takerName: string;
  bankAccountId: string;
  bankAccountName: string;
  taxCodeId: string;
  taxCodeCityName: string;
  nfConstarNaNota: NfConstarNaNotaFields;
  /** Obrigatório: confirma que revisou “constar na nota fiscal” antes de salvar. */
  nfConstarNaNotaAcknowledged: boolean;
};

type MirrorAttachment = {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

type SavedMirror = MirrorDraft & {
  id: string;
  /** ISO — momento em que o espelho foi salvo pela primeira vez */
  createdAt?: string;
  approvalStatus?: EspelhoApprovalStatus;
  nfAttachment?: MirrorAttachment;
  xmlAttachment?: MirrorAttachment;
};

function newSavedMirrorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeMirrorAttachment(raw: unknown): MirrorAttachment | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? '').trim();
  const dataUrl = String(o.dataUrl ?? '').trim();
  if (!name || !dataUrl) return undefined;
  return {
    name,
    mimeType: String(o.mimeType ?? 'application/octet-stream'),
    size: Number.isFinite(Number(o.size)) ? Math.max(0, Number(o.size)) : 0,
    dataUrl
  };
}

function normalizeSavedMirrorsFromStorage(raw: unknown): SavedMirror[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const createdRaw = o.createdAt;
    const normalizedId = String(o.id || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
    return {
      id: normalizedId,
      createdAt:
        createdRaw != null && String(createdRaw).trim() !== '' ? String(createdRaw) : undefined,
      nfAttachment: normalizeMirrorAttachment(o.nfAttachment),
      xmlAttachment: normalizeMirrorAttachment(o.xmlAttachment),
      measurementRef: String(o.measurementRef ?? ''),
      costCenterId: String(o.costCenterId ?? ''),
      dueDate: String(o.dueDate ?? ''),
      municipality: String(o.municipality ?? ''),
      cnae: String(o.cnae ?? '41.20-4-00'),
      serviceIssqn: String(o.serviceIssqn ?? ''),
      empenhoNumber: String(o.empenhoNumber ?? ''),
      processNumber: String(o.processNumber ?? ''),
      serviceOrder: String(o.serviceOrder ?? ''),
      measurementStartDate: String(o.measurementStartDate ?? ''),
      measurementEndDate: String(o.measurementEndDate ?? ''),
      buildingUnit: String(o.buildingUnit ?? ''),
      obraCno: String(o.obraCno ?? ''),
      garantiaComplementar: String(
        o.garantiaComplementar ?? o.garantiaComplementarPct ?? ''
      ),
      observations: String(o.observations ?? ''),
      notes: String(o.notes ?? ''),
      measurementAmount: String(o.measurementAmount ?? ''),
      laborAmount: String(o.laborAmount ?? ''),
      materialAmount: String(o.materialAmount ?? ''),
      providerId: String(o.providerId ?? ''),
      providerName: String(o.providerName ?? ''),
      takerId: String(o.takerId ?? ''),
      takerName: String(o.takerName ?? ''),
      bankAccountId: String(o.bankAccountId ?? ''),
      bankAccountName: String(o.bankAccountName ?? ''),
      taxCodeId: String(o.taxCodeId ?? ''),
      taxCodeCityName: String(o.taxCodeCityName ?? ''),
      nfConstarNaNota: parseNfConstarNaNota(o.nfConstarNaNota),
      nfConstarNaNotaAcknowledged: Boolean(o.nfConstarNaNotaAcknowledged),
      approvalStatus: resolveEspelhoApprovalStatus(normalizedId, String(o.approvalStatus ?? ''))
    };
  });
}

type ServiceProvider = {
  id: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  tradeName: string;
  address: string;
  city: string;
  state: string;
  email: string;
};

type ServiceTaker = {
  id: string;
  name: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  costCenterId: string;
  taxCodeId: string;
  bankAccountId: string;
  address: string;
  municipality: string;
  city: string;
  state: string;
  contractRef: string;
  serviceDescription: string;
};

type BankAccount = {
  id: string;
  name: string;
  bank: string;
  agency: string;
  account: string;
};

type TaxCode = {
  id: string;
  cityName: string;
  abatesMaterial: boolean;
  /** Possui garantia complementar */
  hasComplementaryWarranty: boolean;
  /** Se possui garantia: retida na nota (null = não se aplica) */
  garantiaRetidaNaNota: boolean | null;
  /** Alíquota da garantia (%), pt-BR; vazio se não houver garantia complementar */
  garantiaAliquota: string;
  issRate: string;
  cofins: TaxRule;
  csll: TaxRule;
  inss: TaxRule;
  irpj: TaxRule;
  pis: TaxRule;
  iss: TaxRule;
  inssMaterialLimit: string;
  issMaterialLimit: string;
  /** Alíquotas federais persistidas (GET bootstrap / PUT bootstrap / API tax-codes). */
  federalRatesByContext?: FederalTaxRatesByContext | null;
  federalTaxContextEnabled?: FederalTaxContextEnabled | null;
};

const ESPELHO_ISSQN_OPTIONS = labeledToSelectOptions([
  { value: '07.02 - Obra', label: '07.02 - Obra' },
  { value: '07.05 - Manutenção', label: '07.05 - Manutenção' },
]);

const ESPELHO_SAVED_MONTH_FILTER_OPTIONS = labeledToSelectOptions([
  { value: '', label: 'Todos' },
  { value: '1', label: 'Janeiro' },
  { value: '2', label: 'Fevereiro' },
  { value: '3', label: 'Março' },
  { value: '4', label: 'Abril' },
  { value: '5', label: 'Maio' },
  { value: '6', label: 'Junho' },
  { value: '7', label: 'Julho' },
  { value: '8', label: 'Agosto' },
  { value: '9', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' },
]);

const INITIAL_DRAFT: MirrorDraft = {
  measurementRef: '',
  costCenterId: '',
  dueDate: '',
  municipality: '',
  cnae: '41.20-4-00',
  serviceIssqn: '',
  empenhoNumber: '',
  processNumber: '',
  serviceOrder: '',
  measurementStartDate: '',
  measurementEndDate: '',
  buildingUnit: '',
  obraCno: '',
  garantiaComplementar: '',
  observations: '',
  notes: '',
  measurementAmount: '',
  laborAmount: '',
  materialAmount: '',
  providerId: '',
  providerName: '',
  takerId: '',
  takerName: '',
  bankAccountId: '',
  bankAccountName: '',
  taxCodeId: '',
  taxCodeCityName: '',
  nfConstarNaNota: { ...DEFAULT_NF_CONSTAR_NA_NOTA },
  nfConstarNaNotaAcknowledged: false
};

function normalizeEspelhoMoneyBlurToBrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const n = parseEspelhoBrCurrencyToNumber(t);
  if (n === null || !Number.isFinite(n)) return '';
  return fmtEspelhoBrl(Math.max(0, n));
}

function formatEspelhoDraftMoneyFields(d: MirrorDraft): MirrorDraft {
  return {
    ...d,
    measurementAmount: normalizeEspelhoMoneyBlurToBrl(d.measurementAmount),
    laborAmount: normalizeEspelhoMoneyBlurToBrl(d.laborAmount),
    materialAmount: normalizeEspelhoMoneyBlurToBrl(d.materialAmount)
  };
}

function round2EspelhoMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Diferença máxima aceita (R$) entre medição e mão de obra + material — ajuste fino de até 1 centavo. */
const ESPELHO_MONEY_TRIPLET_TOLERANCE_RS = 0.01;

type EspelhoMoneyTripletField = 'measurementAmount' | 'laborAmount' | 'materialAmount';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** `null` se válido ou nenhum valor informado; senão mensagem para etiqueta / toast. */
function espelhoSavedCalendarPartsFromIso(iso: string): { y: number; m: number } | null {
  const t = iso.trim();
  if (!t) return null;
  const d = new Date(t.length === 10 ? `${t}T12:00:00` : t);
  if (Number.isNaN(d.getTime())) return null;
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function espelhoSavedCreatedParts(item: SavedMirror): { y: number; m: number } | null {
  return item.createdAt ? espelhoSavedCalendarPartsFromIso(item.createdAt) : null;
}

function normalizeEspelhoPickerSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function getEspelhoMoneyTripletMessage(d: MirrorDraft): string | null {
  const touched =
    d.measurementAmount.trim() !== '' ||
    d.laborAmount.trim() !== '' ||
    d.materialAmount.trim() !== '';
  if (!touched) return null;
  const m = parseEspelhoBrCurrencyToNumber(d.measurementAmount);
  const l = parseEspelhoBrCurrencyToNumber(d.laborAmount);
  const mat = parseEspelhoBrCurrencyToNumber(d.materialAmount);
  if (m === null) return 'Informe um valor válido para a medição.';
  if (m < 0) return 'O valor da medição não pode ser negativo.';
  if (l === null || mat === null) {
    return 'Informe valores válidos para mão de obra e material (a soma deve fechar o valor da medição).';
  }
  if (l < 0 || mat < 0) return 'Mão de obra e material não podem ser negativos.';
  const sum = round2EspelhoMoney(l + mat);
  const med = round2EspelhoMoney(m);
  const diffAbs = Math.abs(sum - med);
  if (diffAbs <= ESPELHO_MONEY_TRIPLET_TOLERANCE_RS + 1e-9) return null;
  if (sum > med) {
    return 'A soma de mão de obra e material é maior que o valor da medição. Ajuste os valores para que fechem a medição.';
  }
  return 'A soma de mão de obra e material é menor que o valor da medição. Ajuste os valores para que fechem a medição.';
}

const INITIAL_PROVIDER_FORM: Omit<ServiceProvider, 'id'> = {
  cnpj: '',
  municipalRegistration: '',
  stateRegistration: '',
  corporateName: '',
  tradeName: '',
  address: '',
  city: '',
  state: '',
  email: ''
};

const PROVIDERS_STORAGE_KEY = 'espelho-nf-service-providers';
const TAKERS_STORAGE_KEY = 'espelho-nf-service-takers';
const BANK_ACCOUNTS_STORAGE_KEY = 'espelho-nf-bank-accounts';
const TAX_CODES_STORAGE_KEY = 'espelho-nf-tax-codes';
const FEDERAL_TAX_RATES_STORAGE_KEY = 'espelho-nf-federal-tax-rates';
const FEDERAL_TAX_CONTEXT_ENABLED_STORAGE_KEY = 'espelho-nf-federal-tax-context-enabled';
const SAVED_MIRRORS_STORAGE_KEY = 'espelho-nf-saved-mirrors';
const MIRROR_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const MIRROR_ACTION_MENU_WIDTH_PX = 224;
const ESPELHO_APPROVAL_BADGE_CLASS: Record<EspelhoApprovalStatus, string> = {
  PENDING_APPROVAL:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800',
  APPROVED:
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800',
  SENT_FOR_CORRECTION:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800',
  CANCELLED:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800'
};

const INITIAL_TAKER_FORM: Omit<ServiceTaker, 'id'> = {
  name: '',
  cnpj: '',
  municipalRegistration: '',
  stateRegistration: '',
  corporateName: '',
  costCenterId: '',
  taxCodeId: '',
  bankAccountId: '',
  address: '',
  municipality: '',
  city: '',
  state: '',
  contractRef: '',
  serviceDescription: ''
};

const INITIAL_BANK_ACCOUNT_FORM: Omit<BankAccount, 'id'> = {
  name: '',
  bank: '',
  agency: '',
  account: ''
};

function EspelhoCentStepperMoneyInput({
  label,
  value,
  onChange,
  onBlur,
  showStepper = true,
  canStepDown,
  onStepUp,
  onStepDown
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  showStepper?: boolean;
  canStepDown: boolean;
  onStepUp: () => void;
  onStepDown: () => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden focus-within:ring-0">
        <input
          type="text"
          inputMode="numeric"
          placeholder="R$ 0,00"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          className="flex-1 min-w-0 border-0 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100 text-right tabular-nums outline-none ring-0 focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
        <div
          className="flex flex-col border-l border-gray-300 dark:border-gray-600 shrink-0 w-9"
          role={showStepper ? 'group' : undefined}
          aria-label={showStepper ? `Ajuste fino por centavo: ${label}` : undefined}
          aria-hidden={showStepper ? undefined : true}
        >
          <button
            type="button"
            onClick={showStepper ? onStepUp : undefined}
            disabled={!showStepper}
            className={`flex flex-1 items-center justify-center min-h-[28px] transition-colors ${
              showStepper
                ? 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/80'
                : 'text-transparent pointer-events-none'
            }`}
            title={showStepper ? 'Somar R$ 0,01' : undefined}
            aria-label={showStepper ? 'Somar um centavo' : undefined}
          >
            <ChevronUp className="w-4 h-4" strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            onClick={showStepper ? onStepDown : undefined}
            disabled={showStepper ? !canStepDown : true}
            className={`flex flex-1 items-center justify-center min-h-[28px] border-t border-gray-300 dark:border-gray-600 transition-colors ${
              showStepper
                ? 'text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700/80 dark:disabled:hover:bg-transparent'
                : 'text-transparent pointer-events-none'
            }`}
            title={showStepper ? 'Subtrair R$ 0,01' : undefined}
            aria-label={showStepper ? 'Subtrair um centavo' : undefined}
          >
            <ChevronDown className="w-4 h-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EspelhoNfPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showEspelhoForm, setShowEspelhoForm] = useState(false);
  const [draft, setDraft] = useState<MirrorDraft>(INITIAL_DRAFT);
  const [savedDrafts, setSavedDrafts] = useState<SavedMirror[]>([]);
  const [savedMirrorsHydrated, setSavedMirrorsHydrated] = useState(false);
  const [espelhoDbHydrated, setEspelhoDbHydrated] = useState(false);
  const [editingSavedMirrorId, setEditingSavedMirrorId] = useState<string | null>(null);
  const [detailMirror, setDetailMirror] = useState<SavedMirror | null>(null);
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([]);
  const [serviceTakers, setServiceTakers] = useState<ServiceTaker[]>([]);
  const [providerForm, setProviderForm] = useState(INITIAL_PROVIDER_FORM);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [takerForm, setTakerForm] = useState(INITIAL_TAKER_FORM);
  const [editingTakerId, setEditingTakerId] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankAccountForm, setBankAccountForm] = useState(INITIAL_BANK_ACCOUNT_FORM);
  const [editingBankAccountId, setEditingBankAccountId] = useState<string | null>(null);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [taxCodeForm, setTaxCodeForm] = useState<TaxCodeFormState>(() => emptyTaxCodeFormState());
  const [editingTaxCodeId, setEditingTaxCodeId] = useState<string | null>(null);
  const [federalTaxRatesByContext, setFederalTaxRatesByContext] = useState<FederalTaxRatesByContext>(
    INITIAL_FEDERAL_TAX_RATES_BY_CONTEXT
  );
  const [federalTaxContextEnabled, setFederalTaxContextEnabled] = useState<FederalTaxContextEnabled>(
    INITIAL_FEDERAL_TAX_CONTEXT_ENABLED
  );
  const [espelhoSavedFilterCostCenter, setEspelhoSavedFilterCostCenter] = useState('');
  const [espelhoSavedFilterTaker, setEspelhoSavedFilterTaker] = useState('');
  const [espelhoSavedFilterMonth, setEspelhoSavedFilterMonth] = useState('');
  const [espelhoSavedFilterYear, setEspelhoSavedFilterYear] = useState('');
  const [espelhoSavedFiltersModalOpen, setEspelhoSavedFiltersModalOpen] = useState(false);
  const [nfConstarMenuOpen, setNfConstarMenuOpen] = useState(false);
  const [openEspelhoPicker, setOpenEspelhoPicker] = useState<null | 'prestador' | 'tomador'>(null);
  const [espelhoPrestadorPickerQuery, setEspelhoPrestadorPickerQuery] = useState('');
  const [espelhoTomadorPickerQuery, setEspelhoTomadorPickerQuery] = useState('');
  const prestadorPickerRef = useRef<HTMLDivElement>(null);
  const tomadorPickerRef = useRef<HTMLDivElement>(null);
  const espelhoPickerPopoverRef = useRef<HTMLDivElement>(null);

  type EspelhoPickerPanelGeo = { left: number; top: number; width: number; maxHeight: number };
  const [espelhoPickerPanelGeo, setEspelhoPickerPanelGeo] = useState<EspelhoPickerPanelGeo | null>(null);
  const nfConstarMenuRef = useRef<HTMLDivElement>(null);
  const nfConstarBarRef = useRef<HTMLDivElement>(null);
  const nfConstarPopoverRef = useRef<HTMLDivElement>(null);
  const [nfConstarPanelGeo, setNfConstarPanelGeo] = useState<EspelhoPickerPanelGeo | null>(null);
  const [mirrorActionMenu, setMirrorActionMenu] = useState<{
    mirrorId: string;
    top: number;
    left: number;
  } | null>(null);

  const { costCenters: costCentersHook, isLoading: loadingCostCenters } = useCostCenters();

  const nfConstarSelectedCount = useMemo(
    () => Object.values(draft.nfConstarNaNota).filter(Boolean).length,
    [draft.nfConstarNaNota]
  );

  const toggleNfConstarField = (key: keyof NfConstarNaNotaFields) => {
    setDraft((prev) => {
      const nextVal = !prev.nfConstarNaNota[key];
      return {
        ...prev,
        nfConstarNaNota: { ...prev.nfConstarNaNota, [key]: nextVal },
        ...(key === 'obraCno' && !nextVal ? { obraCno: '' } : {})
      };
    });
  };

  useEffect(() => {
    if (!nfConstarMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (nfConstarMenuRef.current?.contains(n)) return;
      if (nfConstarPopoverRef.current?.contains(n)) return;
      setNfConstarMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [nfConstarMenuOpen]);

  useLayoutEffect(() => {
    if (!nfConstarMenuOpen) {
      setNfConstarPanelGeo(null);
      return;
    }
    const measure = () => {
      const bar = nfConstarBarRef.current;
      if (!bar) {
        requestAnimationFrame(measure);
        return;
      }
      const rect = bar.getBoundingClientRect();
      const gap = 6;
      const pad = 8;
      const maxDesired = Math.min(window.innerHeight * 0.88, 560);
      const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
      const spaceAbove = rect.top - gap - pad;
      const preferBelow = spaceBelow >= 160 || spaceBelow >= spaceAbove;
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 2 * pad);
      const left = Math.max(pad, Math.min(rect.left, window.innerWidth - width - pad));
      if (preferBelow) {
        const maxHeight = Math.max(280, Math.min(maxDesired, spaceBelow));
        setNfConstarPanelGeo({
          left,
          top: rect.bottom + gap,
          width,
          maxHeight
        });
      } else {
        const maxHeight = Math.max(280, Math.min(maxDesired, spaceAbove));
        const top = Math.max(pad, rect.top - gap - maxHeight);
        setNfConstarPanelGeo({
          left,
          top,
          width,
          maxHeight
        });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [nfConstarMenuOpen]);

  const selectedFederalTaxContextKey = useMemo(
    () =>
      (Object.keys(federalTaxContextEnabled) as FederalTaxContextKey[]).find(
        (k) => federalTaxContextEnabled[k]
      ) ?? null,
    [federalTaxContextEnabled]
  );

  const federalTaxRates = useMemo(
    () =>
      selectedFederalTaxContextKey
        ? federalTaxRatesByContext[selectedFederalTaxContextKey]
        : INITIAL_FEDERAL_TAX_RATES,
    [federalTaxRatesByContext, selectedFederalTaxContextKey]
  );

  const costCentersForEspelho = useMemo(
    () =>
      costCentersHook.map((cc) => ({
        id: cc.id,
        code: cc.code,
        name: cc.name
      })),
    [costCentersHook]
  );

  const espelhoSavedYearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    const fromDrafts = new Set<number>();
    savedDrafts.forEach((s) => {
      const p = espelhoSavedCreatedParts(s);
      if (p) fromDrafts.add(p.y);
    });
    for (let i = 0; i <= 5; i++) fromDrafts.add(y - i);
    fromDrafts.add(y + 1);
    return Array.from(fromDrafts).sort((a, b) => b - a);
  }, [savedDrafts]);

  const filteredSavedDrafts = useMemo(() => {
    return savedDrafts.filter((item) => {
      if (espelhoSavedFilterCostCenter && item.costCenterId !== espelhoSavedFilterCostCenter) {
        return false;
      }
      if (espelhoSavedFilterTaker && item.takerId !== espelhoSavedFilterTaker) {
        return false;
      }
      const needDate = espelhoSavedFilterMonth !== '' || espelhoSavedFilterYear !== '';
      if (needDate) {
        const parts = espelhoSavedCreatedParts(item);
        if (!parts) return false;
        if (espelhoSavedFilterMonth !== '' && parts.m !== Number(espelhoSavedFilterMonth)) {
          return false;
        }
        if (espelhoSavedFilterYear !== '' && parts.y !== Number(espelhoSavedFilterYear)) {
          return false;
        }
      }
      return true;
    });
  }, [
    savedDrafts,
    espelhoSavedFilterCostCenter,
    espelhoSavedFilterTaker,
    espelhoSavedFilterMonth,
    espelhoSavedFilterYear
  ]);

  const hasActiveEspelhoSavedFilters = useMemo(
    () =>
      Boolean(
        espelhoSavedFilterCostCenter ||
          espelhoSavedFilterTaker ||
          espelhoSavedFilterMonth ||
          espelhoSavedFilterYear
      ),
    [
      espelhoSavedFilterCostCenter,
      espelhoSavedFilterTaker,
      espelhoSavedFilterMonth,
      espelhoSavedFilterYear
    ]
  );

  const mirrorMenuItem = useMemo(() => {
    if (!mirrorActionMenu) return null;
    return savedDrafts.find((m) => m.id === mirrorActionMenu.mirrorId) ?? null;
  }, [mirrorActionMenu, savedDrafts]);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const espelhoMoneyTripletError = useMemo(() => getEspelhoMoneyTripletMessage(draft), [draft]);

  const canSave = useMemo(
    () =>
      Boolean(
        draft.measurementRef.trim() &&
          draft.costCenterId &&
          draft.providerId &&
          draft.takerId &&
          draft.bankAccountId &&
          draft.taxCodeId &&
          draft.measurementStartDate &&
          draft.measurementEndDate &&
          draft.nfConstarNaNotaAcknowledged &&
          !espelhoMoneyTripletError
      ),
    [draft, espelhoMoneyTripletError]
  );

  const sortedEspelhoProviders = useMemo(
    () =>
      [...serviceProviders].sort((a, b) =>
        a.corporateName.localeCompare(b.corporateName, 'pt-BR', { sensitivity: 'base' })
      ),
    [serviceProviders]
  );

  const sortedEspelhoTakers = useMemo(
    () =>
      [...serviceTakers].sort((a, b) =>
        (a.corporateName || a.name).localeCompare(b.corporateName || b.name, 'pt-BR', {
          sensitivity: 'base'
        })
      ),
    [serviceTakers]
  );

  const espelhoSavedCostCenterFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todos', searchText: 'Todos' },
      ...costCentersForEspelho
        .filter((cc): cc is typeof cc & { id: string } => Boolean(cc.id))
        .map((cc) => {
          const label = [cc.code, cc.name].filter(Boolean).join(' — ') || cc.name || '—';
          return { value: cc.id, label, searchText: label };
        }),
    ],
    [costCentersForEspelho]
  );

  const espelhoSavedTakerFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todos', searchText: 'Todos' },
      ...sortedEspelhoTakers.map((t) => {
        const label = t.corporateName || t.name;
        return { value: t.id, label, searchText: label };
      }),
    ],
    [sortedEspelhoTakers]
  );

  const espelhoSavedYearFilterOptions = useMemo(
    () => [
      { value: '', label: 'Todos', searchText: 'Todos' },
      ...espelhoSavedYearOptions.map((yr) => ({
        value: String(yr),
        label: String(yr),
      })),
    ],
    [espelhoSavedYearOptions]
  );

  const filteredPrestadorPickerList = useMemo(() => {
    const q = normalizeEspelhoPickerSearch(espelhoPrestadorPickerQuery.trim());
    if (!q) return sortedEspelhoProviders;
    return sortedEspelhoProviders.filter((p) =>
      normalizeEspelhoPickerSearch(
        `${p.corporateName} ${p.tradeName} ${p.cnpj} ${p.city} ${p.state}`
      ).includes(q)
    );
  }, [sortedEspelhoProviders, espelhoPrestadorPickerQuery]);

  const filteredTomadorPickerList = useMemo(() => {
    const q = normalizeEspelhoPickerSearch(espelhoTomadorPickerQuery.trim());
    if (!q) return sortedEspelhoTakers;
    return sortedEspelhoTakers.filter((t) =>
      normalizeEspelhoPickerSearch(
        `${t.name} ${t.corporateName} ${t.cnpj} ${t.contractRef} ${t.city} ${t.state}`
      ).includes(q)
    );
  }, [sortedEspelhoTakers, espelhoTomadorPickerQuery]);

  const espelhoPrestadorPickerLabel = useMemo(() => {
    if (!draft.providerId) return '';
    const p = sortedEspelhoProviders.find((x) => x.id === draft.providerId);
    return p
      ? `${p.corporateName} (${p.cnpj}) — ${p.city}/${p.state}`
      : draft.providerName || '';
  }, [draft.providerId, draft.providerName, sortedEspelhoProviders]);

  const espelhoTomadorPickerLabel = useMemo(() => {
    if (!draft.takerId) return '';
    const t = sortedEspelhoTakers.find((x) => x.id === draft.takerId);
    return t ? `${t.name} — ${t.corporateName} (${t.cnpj})` : draft.takerName || '';
  }, [draft.takerId, draft.takerName, sortedEspelhoTakers]);

  useEffect(() => {
    if (!openEspelhoPicker) return;
    const onDown = (e: MouseEvent) => {
      const n = e.target as Node;
      if (openEspelhoPicker === 'prestador' && prestadorPickerRef.current?.contains(n)) return;
      if (openEspelhoPicker === 'tomador' && tomadorPickerRef.current?.contains(n)) return;
      if (espelhoPickerPopoverRef.current?.contains(n)) return;
      setOpenEspelhoPicker(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [openEspelhoPicker]);

  useLayoutEffect(() => {
    if (!openEspelhoPicker) {
      setEspelhoPickerPanelGeo(null);
      return;
    }
    const measure = () => {
      const wrap =
        openEspelhoPicker === 'prestador' ? prestadorPickerRef.current : tomadorPickerRef.current;
      const btn = wrap?.querySelector<HTMLButtonElement>('button[aria-haspopup="listbox"]');
      if (!btn) {
        requestAnimationFrame(measure);
        return;
      }
      const rect = btn.getBoundingClientRect();
      const gap = 6;
      const pad = 8;
      const maxDesired = Math.min(window.innerHeight * 0.55, 22 * 16);
      const spaceBelow = window.innerHeight - rect.bottom - gap - pad;
      const spaceAbove = rect.top - gap - pad;
      const preferBelow = spaceBelow >= 140 || spaceBelow >= spaceAbove;
      if (preferBelow) {
        const maxHeight = Math.max(120, Math.min(maxDesired, spaceBelow));
        setEspelhoPickerPanelGeo({
          left: rect.left,
          top: rect.bottom + gap,
          width: rect.width,
          maxHeight
        });
      } else {
        const maxHeight = Math.max(120, Math.min(maxDesired, spaceAbove));
        const top = Math.max(pad, rect.top - gap - maxHeight);
        setEspelhoPickerPanelGeo({
          left: rect.left,
          top,
          width: rect.width,
          maxHeight
        });
      }
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [openEspelhoPicker]);

  useEffect(() => {
    if (!showEspelhoForm) {
      setNfConstarMenuOpen(false);
      return;
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showEspelhoForm]);

  const draftTaxCode = useMemo(
    () => taxCodes.find((t) => t.id === draft.taxCodeId) ?? null,
    [taxCodes, draft.taxCodeId]
  );

  /** Quando o código tributário do espelho tem JSON federal no estado (API/local), alinha a UI às alíquotas do cadastro. */
  const lastAppliedEspelhoTaxFederalSigRef = useRef<string>('');
  useEffect(() => {
    const id = draft.taxCodeId;
    if (!id) {
      lastAppliedEspelhoTaxFederalSigRef.current = '';
      return;
    }
    const tc = taxCodes.find((t) => t.id === id);
    if (!tc) return;
    if (tc.federalRatesByContext == null && tc.federalTaxContextEnabled == null) return;
    const sig = `${id}:${JSON.stringify(tc.federalRatesByContext)}:${JSON.stringify(tc.federalTaxContextEnabled)}`;
    if (sig === lastAppliedEspelhoTaxFederalSigRef.current) return;
    lastAppliedEspelhoTaxFederalSigRef.current = sig;
    const fed = mergeFederalTaxStateFromApi(tc.federalRatesByContext, tc.federalTaxContextEnabled);
    setFederalTaxRatesByContext(fed.federalRatesByContext);
    setFederalTaxContextEnabled(fed.federalTaxContextEnabled);
  }, [draft.taxCodeId, taxCodes]);
  const draftTakerUf = useMemo(
    () => (serviceTakers.find((t) => t.id === draft.takerId)?.state ?? '').trim().toUpperCase(),
    [serviceTakers, draft.takerId]
  );
  const draftMunicipalityWithUf = useMemo(() => {
    const mun = draft.municipality.trim();
    if (!mun) return '—';
    return draftTakerUf ? `${mun} (${draftTakerUf})` : mun;
  }, [draft.municipality, draftTakerUf]);

  const espelhoIssRetidoPeloTomadorLabel = useMemo(() => {
    if (!draftTaxCode) return '—';
    if (draftTaxCode.iss.collectionType === 'RETIDO') return 'Sim';
    if (draftTaxCode.iss.collectionType === 'RECOLHIDO') return 'Não';
    return '—';
  }, [draftTaxCode]);

  const draftCostCenterLabel = useMemo(() => {
    const cc = costCentersForEspelho.find((row) => row.id === draft.costCenterId);
    if (!cc) return '';
    return [cc.code, cc.name].filter(Boolean).join(' — ') || cc.name || '';
  }, [costCentersForEspelho, draft.costCenterId]);

  const espelhoMaterialLimits = useMemo(
    () =>
      computeEspelhoMaterialLimits(
        draft.measurementAmount,
        draftTaxCode?.inssMaterialLimit,
        draftTaxCode?.issMaterialLimit
      ),
    [draft.measurementAmount, draftTaxCode]
  );

  const espelhoBasesCalculo = useMemo(
    () =>
      computeEspelhoBasesCalculoInssIss(
        draft.measurementAmount,
        draft.materialAmount,
        draftTaxCode?.inssMaterialLimit,
        draftTaxCode?.issMaterialLimit
      ),
    [draft.measurementAmount, draft.materialAmount, draftTaxCode]
  );

  const limitMaterialPctHint = (raw: string | undefined): string | null => {
    const t = (raw ?? '').trim();
    if (!t) return null;
    return t.endsWith('%') ? t : `${t}%`;
  };

  const espelhoImpostos = useMemo(() => {
    const med = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
    const baseInss = parseEspelhoBrCurrencyToNumber(espelhoBasesCalculo.baseInss);
    const baseIss = parseEspelhoBrCurrencyToNumber(espelhoBasesCalculo.baseIss);
    const zero = fmtEspelhoBrl(0);

    const buildTaxLine = (
      base: number | null,
      aliquotaRaw: string | undefined,
      collectionType: 'RETIDO' | 'RECOLHIDO' | undefined
    ) => {
      const aliquota = parseEspelhoPercentToNumber(aliquotaRaw);
      if (base === null || aliquota === null) {
        return { value: '—', recolher: null as string | null };
      }
      const calculado = fmtEspelhoBrl((base * aliquota) / 100);
      if (collectionType === 'RECOLHIDO') {
        return { value: zero, recolher: `Recolher ${calculado}` };
      }
      return { value: calculado, recolher: null as string | null };
    };

    return {
      cofins: buildTaxLine(med, federalTaxRates.cofins, draftTaxCode?.cofins.collectionType),
      csll: buildTaxLine(med, federalTaxRates.csll, draftTaxCode?.csll.collectionType),
      irpj: buildTaxLine(med, federalTaxRates.irpj, draftTaxCode?.irpj.collectionType),
      pis: buildTaxLine(med, federalTaxRates.pis, draftTaxCode?.pis.collectionType),
      inss: buildTaxLine(baseInss, federalTaxRates.inss, draftTaxCode?.inss.collectionType),
      iss: buildTaxLine(baseIss, draftTaxCode?.issRate, draftTaxCode?.iss.collectionType)
    };
  }, [draft.measurementAmount, espelhoBasesCalculo.baseInss, espelhoBasesCalculo.baseIss, federalTaxRates, draftTaxCode]);

  const espelhoValorLiquidoMeta = useMemo(() => {
    const med = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
    if (med === null) return { display: '—', saldoNegativo: false };
    const retidos = [
      espelhoImpostos.cofins.value,
      espelhoImpostos.csll.value,
      espelhoImpostos.irpj.value,
      espelhoImpostos.pis.value,
      espelhoImpostos.inss.value,
      espelhoImpostos.iss.value
    ].reduce((acc, raw) => acc + (parseEspelhoBrCurrencyToNumber(raw) ?? 0), 0);
    const reforcoGarantiaRetido = computeEspelhoReforcoGarantiaRetidoRs(draft, draftTaxCode);
    const liquid = round2(med - retidos - reforcoGarantiaRetido);
    return {
      display: fmtEspelhoBrl(liquid),
      saldoNegativo: liquid < 0
    };
  }, [draft, draftTaxCode, espelhoImpostos]);

  const garantiaComplementarAuto = Boolean(
    draftTaxCode?.hasComplementaryWarranty === true &&
      draftTaxCode.garantiaRetidaNaNota !== null &&
      (draftTaxCode.garantiaAliquota ?? '').trim() !== ''
  );

  const garantiaComplementarMessage = useMemo(() => {
    if (!garantiaComplementarAuto || !draftTaxCode) return '';

    const ptNumeroExtenso = (n: number): string => {
      const ones: Record<number, string> = {
        0: 'zero',
        1: 'um',
        2: 'dois',
        3: 'três',
        4: 'quatro',
        5: 'cinco',
        6: 'seis',
        7: 'sete',
        8: 'oito',
        9: 'nove',
        10: 'dez',
        11: 'onze',
        12: 'doze',
        13: 'treze',
        14: 'quatorze',
        15: 'quinze',
        16: 'dezesseis',
        17: 'dezessete',
        18: 'dezoito',
        19: 'dezenove'
      };
      const tens: Record<number, string> = {
        20: 'vinte',
        30: 'trinta',
        40: 'quarenta',
        50: 'cinquenta',
        60: 'sessenta',
        70: 'setenta',
        80: 'oitenta',
        90: 'noventa'
      };
      const round = Math.max(0, Math.min(100, Math.round(n)));
      if (round === 100) return 'cem';
      if (round < 20) return ones[round] ?? String(round);
      const t = Math.floor(round / 10) * 10;
      const u = round % 10;
      if (u === 0) return tens[t] ?? String(round);
      return `${tens[t] ?? ''} e ${ones[u] ?? ''}`.trim();
    };

    const med = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
    const aliquotaNum = parseEspelhoPercentToNumber(draftTaxCode.garantiaAliquota);
    if (med === null || aliquotaNum === null) return '—';

    const aliquotaInt = Math.round(aliquotaNum);
    const aliquotaPctDisplay = `${draftTaxCode.garantiaAliquota}%`;
    const porExtenso = `${ptNumeroExtenso(aliquotaInt)} por cento`;

    const x =
      draftTaxCode.garantiaRetidaNaNota === true
        ? med * (aliquotaNum / 100)
        : med * (aliquotaNum / (100 - aliquotaNum));

    const xDisplay = Number.isFinite(x) ? fmtEspelhoBrl(round2EspelhoMoney(x)) : '—';

    if (draftTaxCode.garantiaRetidaNaNota === true) {
      return `Como Reforço de Garantia será Retido ${aliquotaPctDisplay} (${porExtenso}) sobre o valor da NF igual a: ${xDisplay}`;
    }
    return `Como Reforço de Garantia foi Retido ${aliquotaPctDisplay} (${porExtenso}) da Parcela na Medição no Valor de: ${xDisplay}`;
  }, [garantiaComplementarAuto, draftTaxCode, draft.measurementAmount]);

  const onEspelhoMoneyChange =
    (field: EspelhoMoneyTripletField) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraft((prev) => ({ ...prev, [field]: maskCurrencyInputBr(e.target.value) }));
    };

  const onEspelhoMoneyBlur =
    (field: EspelhoMoneyTripletField) => () => {
      setDraft((prev) => ({
        ...prev,
        [field]: normalizeEspelhoMoneyBlurToBrl(prev[field])
      }));
    };

  const nudgeEspelhoMoneyFieldCent =
    (field: EspelhoMoneyTripletField, deltaCents: 1 | -1) => () => {
      setDraft((prev) => {
        const parsed = parseEspelhoBrCurrencyToNumber(prev[field]);
        const currentCents = Math.round((parsed ?? 0) * 100);
        const nextCents = Math.max(0, currentCents + deltaCents);
        return {
          ...prev,
          [field]: maskCurrencyInputBr(String(nextCents))
        };
      });
    };

  const measurementCentCount = useMemo(() => {
    const n = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
    return Math.round((n ?? 0) * 100);
  }, [draft.measurementAmount]);

  const laborCentCount = useMemo(() => {
    const n = parseEspelhoBrCurrencyToNumber(draft.laborAmount);
    return Math.round((n ?? 0) * 100);
  }, [draft.laborAmount]);

  const materialCentCount = useMemo(() => {
    const n = parseEspelhoBrCurrencyToNumber(draft.materialAmount);
    return Math.round((n ?? 0) * 100);
  }, [draft.materialAmount]);

  useEffect(() => {
    const raw = localStorage.getItem(PROVIDERS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as ServiceProvider[];
      if (Array.isArray(parsed)) {
        setServiceProviders(parsed);
      }
    } catch {
      localStorage.removeItem(PROVIDERS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(serviceProviders));
  }, [serviceProviders]);

  useEffect(() => {
    const raw = localStorage.getItem(TAKERS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<ServiceTaker>[];
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((item) => ({
          id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          name: String(item.name || item.corporateName || ''),
          cnpj: String(item.cnpj || ''),
          municipalRegistration: String(item.municipalRegistration || ''),
          stateRegistration: String(item.stateRegistration || ''),
          corporateName: String(item.corporateName || ''),
          costCenterId: String(item.costCenterId || ''),
          taxCodeId: String(item.taxCodeId || ''),
          bankAccountId: String(item.bankAccountId || ''),
          address: String(item.address || ''),
          municipality: String(item.municipality || item.city || ''),
          city: String(item.city || ''),
          state: String(item.state || ''),
          contractRef: String(item.contractRef || ''),
          serviceDescription: String(item.serviceDescription || '')
        }));
        setServiceTakers(normalized);
      }
    } catch {
      localStorage.removeItem(TAKERS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(TAKERS_STORAGE_KEY, JSON.stringify(serviceTakers));
  }, [serviceTakers]);

  useEffect(() => {
    const raw = localStorage.getItem(BANK_ACCOUNTS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<BankAccount>[];
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((item) => ({
          id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          name: String(item.name || ''),
          bank: String(item.bank || ''),
          agency: String(item.agency || ''),
          account: String(item.account || '')
        }));
        setBankAccounts(normalized);
      }
    } catch {
      localStorage.removeItem(BANK_ACCOUNTS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(BANK_ACCOUNTS_STORAGE_KEY, JSON.stringify(bankAccounts));
  }, [bankAccounts]);

  useEffect(() => {
    const raw = localStorage.getItem(TAX_CODES_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<TaxCode>[];
      if (Array.isArray(parsed)) {
        const normalizeRule = (rule?: Partial<TaxRule>, forceRetido = false): TaxRule => ({
          collectionType: forceRetido ? 'RETIDO' : rule?.collectionType === 'RECOLHIDO' ? 'RECOLHIDO' : 'RETIDO'
        });
        const normalized = parsed.map((item) => {
          const hasWarranty = Boolean(item.hasComplementaryWarranty);
          const gr = item.garantiaRetidaNaNota;
          return {
          id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          cityName: String(item.cityName || ''),
          abatesMaterial: Boolean(item.abatesMaterial),
          hasComplementaryWarranty: hasWarranty,
          garantiaRetidaNaNota:
            hasWarranty && (gr === true || gr === false) ? gr : null,
          garantiaAliquota: hasWarranty ? String(item.garantiaAliquota ?? '') : '',
          issRate: String(item.issRate || ''),
          cofins: normalizeRule(item.cofins, true),
          csll: normalizeRule(item.csll, true),
          inss: normalizeRule(item.inss, true),
          irpj: normalizeRule(item.irpj, true),
          pis: normalizeRule(item.pis, true),
          iss: normalizeRule(item.iss),
          inssMaterialLimit: String(item.inssMaterialLimit || ''),
          issMaterialLimit: String(item.issMaterialLimit || ''),
          ...(typeof (item as Partial<TaxCode>).federalRatesByContext !== 'undefined'
            ? { federalRatesByContext: (item as Partial<TaxCode>).federalRatesByContext }
            : {}),
          ...(typeof (item as Partial<TaxCode>).federalTaxContextEnabled !== 'undefined'
            ? { federalTaxContextEnabled: (item as Partial<TaxCode>).federalTaxContextEnabled }
            : {})
        };
        });
        setTaxCodes(normalized);
      }
    } catch {
      localStorage.removeItem(TAX_CODES_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(TAX_CODES_STORAGE_KEY, JSON.stringify(taxCodes));
  }, [taxCodes]);

  useEffect(() => {
    const raw = localStorage.getItem(FEDERAL_TAX_RATES_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<FederalTaxRatesByContext> & Partial<FederalTaxRates>;
      const looksLikeLegacy =
        typeof parsed?.cofins !== 'undefined' ||
        typeof parsed?.csll !== 'undefined' ||
        typeof parsed?.inss !== 'undefined' ||
        typeof parsed?.irpj !== 'undefined' ||
        typeof parsed?.pis !== 'undefined';
      if (looksLikeLegacy) {
        const legacy: FederalTaxRates = {
          cofins: String(parsed?.cofins || ''),
          csll: String(parsed?.csll || ''),
          inss: String(parsed?.inss || ''),
          irpj: String(parsed?.irpj || ''),
          pis: String(parsed?.pis || '')
        };
        setFederalTaxRatesByContext({
          gdfObra: { ...legacy },
          gdfManutencaoReforma: { ...legacy },
          gdfMaoObraSemMaterial: { ...legacy },
          foraGdfObra: { ...legacy },
          foraGdfManutencaoReforma: { ...legacy },
          foraGdfMaoObraSemMaterial: { ...legacy }
        });
        return;
      }
      const normalizeRates = (v: unknown): FederalTaxRates => {
        const o = v && typeof v === 'object' ? (v as Partial<FederalTaxRates>) : {};
        return {
          cofins: String(o.cofins || ''),
          csll: String(o.csll || ''),
          inss: String(o.inss || ''),
          irpj: String(o.irpj || ''),
          pis: String(o.pis || '')
        };
      };
      setFederalTaxRatesByContext({
        gdfObra: normalizeRates(parsed?.gdfObra),
        gdfManutencaoReforma: normalizeRates(parsed?.gdfManutencaoReforma),
        gdfMaoObraSemMaterial: normalizeRates(parsed?.gdfMaoObraSemMaterial),
        foraGdfObra: normalizeRates(parsed?.foraGdfObra),
        foraGdfManutencaoReforma: normalizeRates(parsed?.foraGdfManutencaoReforma),
        foraGdfMaoObraSemMaterial: normalizeRates(parsed?.foraGdfMaoObraSemMaterial)
      });
    } catch {
      localStorage.removeItem(FEDERAL_TAX_RATES_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FEDERAL_TAX_RATES_STORAGE_KEY, JSON.stringify(federalTaxRatesByContext));
  }, [federalTaxRatesByContext]);

  useEffect(() => {
    const raw = localStorage.getItem(FEDERAL_TAX_CONTEXT_ENABLED_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<FederalTaxContextEnabled>;
      setFederalTaxContextEnabled({
        gdfObra: Boolean(parsed?.gdfObra),
        gdfManutencaoReforma: Boolean(parsed?.gdfManutencaoReforma),
        gdfMaoObraSemMaterial: Boolean(parsed?.gdfMaoObraSemMaterial),
        foraGdfObra: Boolean(parsed?.foraGdfObra),
        foraGdfManutencaoReforma: Boolean(parsed?.foraGdfManutencaoReforma),
        foraGdfMaoObraSemMaterial: Boolean(parsed?.foraGdfMaoObraSemMaterial)
      });
    } catch {
      localStorage.removeItem(FEDERAL_TAX_CONTEXT_ENABLED_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FEDERAL_TAX_CONTEXT_ENABLED_STORAGE_KEY, JSON.stringify(federalTaxContextEnabled));
  }, [federalTaxContextEnabled]);

  useEffect(() => {
    const raw = localStorage.getItem(SAVED_MIRRORS_STORAGE_KEY);
    if (!raw) {
      setSavedMirrorsHydrated(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      setSavedDrafts(normalizeSavedMirrorsFromStorage(parsed));
    } catch {
      localStorage.removeItem(SAVED_MIRRORS_STORAGE_KEY);
    } finally {
      setSavedMirrorsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!savedMirrorsHydrated) return;
    localStorage.setItem(SAVED_MIRRORS_STORAGE_KEY, JSON.stringify(savedDrafts));
  }, [savedDrafts, savedMirrorsHydrated]);

  useEffect(() => {
    let cancelled = false;
    const loadFromDb = async () => {
      try {
        const res = await api.get('/espelho-nf/bootstrap');
        const data = res?.data?.data || {};
        const providers = Array.isArray(data.providers) ? (data.providers as ServiceProvider[]) : [];
        const takers = Array.isArray(data.takers) ? (data.takers as ServiceTaker[]) : [];
        const banks = Array.isArray(data.bankAccounts) ? (data.bankAccounts as BankAccount[]) : [];
        const codes = Array.isArray(data.taxCodes) ? (data.taxCodes as TaxCode[]) : [];
        const mirrors = Array.isArray(data.mirrors) ? (data.mirrors as SavedMirror[]) : [];
        if (cancelled) return;
        setServiceProviders(providers);
        setServiceTakers(takers);
        setBankAccounts(banks);
        setTaxCodes(
          codes.map((c) => {
            const t = c as TaxCode & { garantiaRetidaNaNota?: boolean | null };
            const hasWarranty = Boolean(t.hasComplementaryWarranty);
            const gr = t.garantiaRetidaNaNota;
            return {
              ...t,
              hasComplementaryWarranty: hasWarranty,
              garantiaRetidaNaNota:
                hasWarranty && (gr === true || gr === false) ? gr : null,
              garantiaAliquota: hasWarranty ? String(t.garantiaAliquota ?? '') : ''
            };
          })
        );
        const providerById = new Map(providers.map((p) => [p.id, p]));
        const takerById = new Map(takers.map((t) => [t.id, t]));
        const bankById = new Map(banks.map((b) => [b.id, b]));
        const taxById = new Map(codes.map((t) => [t.id, t]));
        setSavedDrafts(
          mirrors.map((m) => ({
            ...m,
            measurementStartDate: String(m.measurementStartDate ?? ''),
            measurementEndDate: String(m.measurementEndDate ?? ''),
            approvalStatus: resolveEspelhoApprovalStatus(m.id, m.approvalStatus),
            providerName: m.providerName || providerById.get(m.providerId)?.corporateName || '',
            takerName: m.takerName || takerById.get(m.takerId)?.corporateName || '',
            bankAccountName: m.bankAccountName || bankById.get(m.bankAccountId)?.name || '',
            taxCodeCityName: m.taxCodeCityName || taxById.get(m.taxCodeId)?.cityName || '',
            obraCno: String((m as unknown as Record<string, unknown>).obraCno ?? ''),
            garantiaComplementar: String(
              (m as unknown as Record<string, unknown>).garantiaComplementar ??
                (m as unknown as Record<string, unknown>).garantiaComplementarPct ??
                ''
            ),
            nfConstarNaNota: parseNfConstarNaNota(
              (m as unknown as Record<string, unknown>).nfConstarNaNota
            ),
            nfConstarNaNotaAcknowledged: Boolean(
              (m as unknown as Record<string, unknown>).nfConstarNaNotaAcknowledged
            )
          }))
        );
      } catch {
        // Mantém fallback local para não bloquear a operação.
      } finally {
        if (!cancelled) setEspelhoDbHydrated(true);
      }
    };
    loadFromDb();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!espelhoDbHydrated) return;
    const timer = setTimeout(() => {
      const tid = draft.taxCodeId.trim();
      const payloadTaxCodes =
        tid === ''
          ? taxCodes
          : taxCodes.map((tc) =>
              tc.id === tid
                ? {
                    ...tc,
                    federalRatesByContext: JSON.parse(
                      JSON.stringify(federalTaxRatesByContext)
                    ) as FederalTaxRatesByContext,
                    federalTaxContextEnabled: JSON.parse(
                      JSON.stringify(federalTaxContextEnabled)
                    ) as FederalTaxContextEnabled
                  }
                : tc
            );
      void api
        .put('/espelho-nf/bootstrap', {
          providers: serviceProviders,
          takers: serviceTakers,
          bankAccounts,
          taxCodes: payloadTaxCodes,
          mirrors: savedDrafts
        })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ['espelho-nf-bootstrap'] });
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [
    espelhoDbHydrated,
    serviceProviders,
    serviceTakers,
    bankAccounts,
    taxCodes,
    savedDrafts,
    draft.taxCodeId,
    federalTaxRatesByContext,
    federalTaxContextEnabled,
    queryClient
  ]);

  const canSaveProvider = useMemo(
    () =>
      Boolean(
        providerForm.cnpj.trim() &&
          providerForm.municipalRegistration.trim() &&
          providerForm.stateRegistration.trim() &&
          providerForm.corporateName.trim() &&
          providerForm.tradeName.trim() &&
          providerForm.address.trim() &&
          providerForm.state.trim()
      ),
    [providerForm]
  );

  const handleCreateOrUpdateProvider = () => {
    if (!canSaveProvider) {
      toast.error('Preencha os campos obrigatórios do prestador de serviço.');
      return;
    }
    if (editingProviderId) {
      setServiceProviders((prev) =>
        prev.map((provider) =>
          provider.id === editingProviderId
            ? {
                ...provider,
                cnpj: providerForm.cnpj.trim(),
                municipalRegistration: providerForm.municipalRegistration.trim(),
                stateRegistration: providerForm.stateRegistration.trim(),
                corporateName: providerForm.corporateName.trim(),
                tradeName: providerForm.tradeName.trim(),
                address: providerForm.address.trim(),
                city: providerForm.city.trim(),
                state: providerForm.state.trim().toUpperCase(),
                email: providerForm.email.trim()
              }
            : provider
        )
      );
      setEditingProviderId(null);
      setProviderForm(INITIAL_PROVIDER_FORM);
      toast.success('Prestador de serviço atualizado.');
      return;
    }
    const newProvider: ServiceProvider = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cnpj: providerForm.cnpj.trim(),
      municipalRegistration: providerForm.municipalRegistration.trim(),
      stateRegistration: providerForm.stateRegistration.trim(),
      corporateName: providerForm.corporateName.trim(),
      tradeName: providerForm.tradeName.trim(),
      address: providerForm.address.trim(),
      city: providerForm.city.trim(),
      state: providerForm.state.trim().toUpperCase(),
      email: providerForm.email.trim()
    };
    setServiceProviders((prev) => [newProvider, ...prev]);
    setProviderForm(INITIAL_PROVIDER_FORM);
    toast.success('Prestador de serviço cadastrado.');
  };

  const handleEditProvider = (provider: ServiceProvider) => {
    setEditingProviderId(provider.id);
    setProviderForm({
      cnpj: provider.cnpj,
      municipalRegistration: provider.municipalRegistration,
      stateRegistration: provider.stateRegistration,
      corporateName: provider.corporateName,
      tradeName: provider.tradeName,
      address: provider.address,
      city: provider.city,
      state: provider.state,
      email: provider.email
    });
    router.push('/ponto/prestadores-servico');
  };

  const handleDeleteProvider = (providerId: string) => {
    setServiceProviders((prev) => prev.filter((provider) => provider.id !== providerId));
    setDraft((prev) =>
      prev.providerId === providerId ? { ...prev, providerId: '', providerName: '' } : prev
    );
    if (editingProviderId === providerId) {
      setEditingProviderId(null);
      setProviderForm(INITIAL_PROVIDER_FORM);
    }
    toast.success('Prestador de serviço excluído.');
  };

  const canSaveTaker = useMemo(
    () =>
      Boolean(
        takerForm.cnpj.trim() &&
          takerForm.name.trim() &&
          takerForm.municipalRegistration.trim() &&
          takerForm.stateRegistration.trim() &&
          takerForm.corporateName.trim() &&
          takerForm.costCenterId.trim() &&
          takerForm.taxCodeId.trim() &&
          takerForm.bankAccountId.trim() &&
          takerForm.address.trim() &&
          takerForm.municipality.trim() &&
          takerForm.state.trim() &&
          takerForm.contractRef.trim() &&
          takerForm.serviceDescription.trim()
      ),
    [takerForm]
  );

  const handleCreateOrUpdateTaker = () => {
    if (!canSaveTaker) {
      toast.error('Preencha os campos obrigatórios do tomador de serviço.');
      return;
    }
    if (editingTakerId) {
      setServiceTakers((prev) =>
        prev.map((taker) =>
          taker.id === editingTakerId
            ? {
                ...taker,
                name: takerForm.name.trim(),
                cnpj: takerForm.cnpj.trim(),
                municipalRegistration: takerForm.municipalRegistration.trim(),
                stateRegistration: takerForm.stateRegistration.trim(),
                corporateName: takerForm.corporateName.trim(),
                costCenterId: takerForm.costCenterId.trim(),
                taxCodeId: takerForm.taxCodeId.trim(),
                bankAccountId: takerForm.bankAccountId.trim(),
                address: takerForm.address.trim(),
                municipality: takerForm.municipality.trim(),
                city: takerForm.city.trim(),
                state: takerForm.state.trim().toUpperCase(),
                contractRef: takerForm.contractRef.trim(),
                serviceDescription: takerForm.serviceDescription.trim()
              }
            : taker
        )
      );
      setEditingTakerId(null);
      setTakerForm(INITIAL_TAKER_FORM);
      toast.success('Tomador de serviço atualizado.');
      return;
    }

    const newTaker: ServiceTaker = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: takerForm.name.trim(),
      cnpj: takerForm.cnpj.trim(),
      municipalRegistration: takerForm.municipalRegistration.trim(),
      stateRegistration: takerForm.stateRegistration.trim(),
      corporateName: takerForm.corporateName.trim(),
      costCenterId: takerForm.costCenterId.trim(),
      taxCodeId: takerForm.taxCodeId.trim(),
      bankAccountId: takerForm.bankAccountId.trim(),
      address: takerForm.address.trim(),
      municipality: takerForm.municipality.trim(),
      city: takerForm.city.trim(),
      state: takerForm.state.trim().toUpperCase(),
      contractRef: takerForm.contractRef.trim(),
      serviceDescription: takerForm.serviceDescription.trim()
    };
    setServiceTakers((prev) => [newTaker, ...prev]);
    setTakerForm(INITIAL_TAKER_FORM);
    toast.success('Tomador de serviço cadastrado.');
  };

  const handleEditTaker = (taker: ServiceTaker) => {
    setEditingTakerId(taker.id);
    setTakerForm({
      name: taker.name || taker.corporateName || '',
      cnpj: taker.cnpj,
      municipalRegistration: taker.municipalRegistration,
      stateRegistration: taker.stateRegistration,
      corporateName: taker.corporateName,
      costCenterId: taker.costCenterId,
      taxCodeId: taker.taxCodeId,
      bankAccountId: taker.bankAccountId,
      address: taker.address,
      municipality: taker.municipality || taker.city || '',
      city: taker.city,
      state: taker.state,
      contractRef: taker.contractRef,
      serviceDescription: taker.serviceDescription
    });
    router.push('/ponto/tomadores-servico');
  };

  const handleDeleteTaker = (takerId: string) => {
    setServiceTakers((prev) => prev.filter((taker) => taker.id !== takerId));
    setDraft((prev) =>
      prev.takerId === takerId ? { ...prev, takerId: '', takerName: '', municipality: '' } : prev
    );
    if (editingTakerId === takerId) {
      setEditingTakerId(null);
      setTakerForm(INITIAL_TAKER_FORM);
    }
    toast.success('Tomador de serviço excluído.');
  };

  const canSaveBankAccount = useMemo(
    () =>
      Boolean(
        bankAccountForm.name.trim() &&
          bankAccountForm.bank.trim() &&
          bankAccountForm.agency.trim() &&
          bankAccountForm.account.trim()
      ),
    [bankAccountForm]
  );

  const handleCreateOrUpdateBankAccount = () => {
    if (!canSaveBankAccount) {
      toast.error('Preencha os campos obrigatórios da conta bancária.');
      return;
    }

    if (editingBankAccountId) {
      setBankAccounts((prev) =>
        prev.map((account) =>
          account.id === editingBankAccountId
            ? {
                ...account,
                name: bankAccountForm.name.trim(),
                bank: bankAccountForm.bank.trim(),
                agency: bankAccountForm.agency.trim(),
                account: bankAccountForm.account.trim()
              }
            : account
        )
      );
      setEditingBankAccountId(null);
      setBankAccountForm(INITIAL_BANK_ACCOUNT_FORM);
      toast.success('Conta bancária atualizada.');
      return;
    }

    const newAccount: BankAccount = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: bankAccountForm.name.trim(),
      bank: bankAccountForm.bank.trim(),
      agency: bankAccountForm.agency.trim(),
      account: bankAccountForm.account.trim()
    };
    setBankAccounts((prev) => [newAccount, ...prev]);
    setBankAccountForm(INITIAL_BANK_ACCOUNT_FORM);
    toast.success('Conta bancária cadastrada.');
  };

  const handleEditBankAccount = (account: BankAccount) => {
    setEditingBankAccountId(account.id);
    setBankAccountForm({
      name: account.name,
      bank: account.bank,
      agency: account.agency,
      account: account.account
    });
    router.push('/ponto/contas-bancarias');
  };

  const handleDeleteBankAccount = (accountId: string) => {
    setBankAccounts((prev) => prev.filter((account) => account.id !== accountId));
    setDraft((prev) =>
      prev.bankAccountId === accountId
        ? { ...prev, bankAccountId: '', bankAccountName: '' }
        : prev
    );
    if (editingBankAccountId === accountId) {
      setEditingBankAccountId(null);
      setBankAccountForm(INITIAL_BANK_ACCOUNT_FORM);
    }
    toast.success('Conta bancária excluída.');
  };

  const canSaveTaxCode = useMemo(
    () =>
      Boolean(
        taxCodeForm.cityName.trim() &&
          taxCodeForm.issRate.trim() &&
          taxCodeForm.abatesMaterial !== null &&
          taxCodeForm.hasComplementaryWarranty !== null &&
          (taxCodeForm.hasComplementaryWarranty !== true ||
            (normalizeEspelhoPercentBlur(taxCodeForm.garantiaAliquota.trim()) !== '' &&
              taxCodeForm.garantiaRetidaNaNota !== null)) &&
          (taxCodeForm.abatesMaterial !== true ||
            (taxCodeForm.inssMaterialLimit.trim() && taxCodeForm.issMaterialLimit.trim()))
      ),
    [taxCodeForm]
  );

  const handleCreateOrUpdateTaxCode = () => {
    if (!canSaveTaxCode) {
      if (taxCodeForm.abatesMaterial === null) {
        toast.error('Indique se deduz material (obrigatório).');
        return;
      }
      if (taxCodeForm.hasComplementaryWarranty === null) {
        toast.error('Indique se possui garantia complementar (obrigatório).');
        return;
      }
      if (
        taxCodeForm.hasComplementaryWarranty === true &&
        normalizeEspelhoPercentBlur(taxCodeForm.garantiaAliquota.trim()) === ''
      ) {
        toast.error('Informe a alíquota da garantia (obrigatório quando há garantia complementar).');
        return;
      }
      if (taxCodeForm.hasComplementaryWarranty === true && taxCodeForm.garantiaRetidaNaNota === null) {
        toast.error('Informe se a garantia complementar é retida na nota.');
        return;
      }
      toast.error('Preencha todos os campos obrigatórios do código tributário.');
      return;
    }
    const normalizedIssRate = normalizeEspelhoPercentBlur(taxCodeForm.issRate.trim());
    const normalizedGarantiaAliquota =
      taxCodeForm.hasComplementaryWarranty === true
        ? normalizeEspelhoPercentBlur(taxCodeForm.garantiaAliquota.trim())
        : '';
    const normalizedInssLimit = taxCodeForm.abatesMaterial === true
      ? normalizeEspelhoPercentBlur(taxCodeForm.inssMaterialLimit.trim())
      : '0';
    const normalizedIssLimit = taxCodeForm.abatesMaterial === true
      ? normalizeEspelhoPercentBlur(taxCodeForm.issMaterialLimit.trim())
      : '0';
    if (editingTaxCodeId) {
      const fedRates = JSON.parse(JSON.stringify(federalTaxRatesByContext)) as FederalTaxRatesByContext;
      const fedEn = JSON.parse(JSON.stringify(federalTaxContextEnabled)) as FederalTaxContextEnabled;
      setTaxCodes((prev) =>
        prev.map((taxCode) =>
          taxCode.id === editingTaxCodeId
            ? {
                ...taxCode,
                cityName: taxCodeForm.cityName.trim(),
                abatesMaterial: taxCodeForm.abatesMaterial === true,
                hasComplementaryWarranty: taxCodeForm.hasComplementaryWarranty === true,
                garantiaRetidaNaNota:
                  taxCodeForm.hasComplementaryWarranty === true
                    ? taxCodeForm.garantiaRetidaNaNota
                    : null,
                garantiaAliquota: normalizedGarantiaAliquota,
                issRate: normalizedIssRate,
                cofins: { ...taxCodeForm.cofins },
                csll: { ...taxCodeForm.csll },
                inss: { ...taxCodeForm.inss },
                irpj: { ...taxCodeForm.irpj },
                pis: { ...taxCodeForm.pis },
                iss: { ...taxCodeForm.iss },
                inssMaterialLimit: normalizedInssLimit,
                issMaterialLimit: normalizedIssLimit,
                federalRatesByContext: fedRates,
                federalTaxContextEnabled: fedEn
              }
            : taxCode
        )
      );
      setEditingTaxCodeId(null);
      setTaxCodeForm(emptyTaxCodeFormState());
      toast.success('Código tributário atualizado.');
      return;
    }

    const fedRatesNew = JSON.parse(JSON.stringify(federalTaxRatesByContext)) as FederalTaxRatesByContext;
    const fedEnNew = JSON.parse(JSON.stringify(federalTaxContextEnabled)) as FederalTaxContextEnabled;
    const newTaxCode: TaxCode = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cityName: taxCodeForm.cityName.trim(),
      abatesMaterial: taxCodeForm.abatesMaterial === true,
      hasComplementaryWarranty: taxCodeForm.hasComplementaryWarranty === true,
      garantiaRetidaNaNota:
        taxCodeForm.hasComplementaryWarranty === true ? taxCodeForm.garantiaRetidaNaNota : null,
      garantiaAliquota: normalizedGarantiaAliquota,
      issRate: normalizedIssRate,
      cofins: { ...taxCodeForm.cofins },
      csll: { ...taxCodeForm.csll },
      inss: { ...taxCodeForm.inss },
      irpj: { ...taxCodeForm.irpj },
      pis: { ...taxCodeForm.pis },
      iss: { ...taxCodeForm.iss },
      inssMaterialLimit: normalizedInssLimit,
      issMaterialLimit: normalizedIssLimit,
      federalRatesByContext: fedRatesNew,
      federalTaxContextEnabled: fedEnNew
    };
    setTaxCodes((prev) => [newTaxCode, ...prev]);
    setTaxCodeForm(emptyTaxCodeFormState());
    toast.success('Código tributário cadastrado.');
  };

  const handleEditTaxCode = (taxCode: TaxCode) => {
    setEditingTaxCodeId(taxCode.id);
    setTaxCodeForm({
      cityName: taxCode.cityName,
      abatesMaterial: taxCode.abatesMaterial ? true : false,
      hasComplementaryWarranty: taxCode.hasComplementaryWarranty ? true : false,
      garantiaRetidaNaNota: taxCode.hasComplementaryWarranty
        ? taxCode.garantiaRetidaNaNota === true || taxCode.garantiaRetidaNaNota === false
          ? taxCode.garantiaRetidaNaNota
          : null
        : null,
      garantiaAliquota: taxCode.hasComplementaryWarranty ? taxCode.garantiaAliquota || '' : '',
      issRate: taxCode.issRate,
      cofins: { ...taxCode.cofins },
      csll: { ...taxCode.csll },
      inss: { ...taxCode.inss },
      irpj: { ...taxCode.irpj },
      pis: { ...taxCode.pis },
      iss: { ...taxCode.iss },
      inssMaterialLimit: taxCode.inssMaterialLimit,
      issMaterialLimit: taxCode.issMaterialLimit
    });
    const fed = mergeFederalTaxStateFromApi(
      taxCode.federalRatesByContext,
      taxCode.federalTaxContextEnabled
    );
    setFederalTaxRatesByContext(fed.federalRatesByContext);
    setFederalTaxContextEnabled(fed.federalTaxContextEnabled);
    router.push('/ponto/codigos-tributarios');
  };

  const handleDeleteTaxCode = (taxCodeId: string) => {
    setTaxCodes((prev) => prev.filter((taxCode) => taxCode.id !== taxCodeId));
    setDraft((prev) =>
      prev.taxCodeId === taxCodeId
        ? { ...prev, taxCodeId: '', taxCodeCityName: '' }
        : prev
    );
    if (editingTaxCodeId === taxCodeId) {
      setEditingTaxCodeId(null);
      setTaxCodeForm(emptyTaxCodeFormState());
    }
    toast.success('Código tributário excluído.');
  };

  const handleSaveDraft = () => {
    if (espelhoMoneyTripletError) {
      toast.error(espelhoMoneyTripletError);
      return;
    }
    if (!canSave) {
      const espelhoOkExcetoConfirmacao = Boolean(
        draft.measurementRef.trim() &&
          draft.costCenterId &&
          draft.providerId &&
          draft.takerId &&
          draft.bankAccountId &&
          draft.taxCodeId &&
          draft.measurementStartDate &&
          draft.measurementEndDate &&
          !espelhoMoneyTripletError
      );
      if (espelhoOkExcetoConfirmacao && !draft.nfConstarNaNotaAcknowledged) {
        toast.error(
          'Marque a confirmação obrigatória em «Constar na nota fiscal» (declaração de que conferiu os campos da NF) antes de salvar.'
        );
        return;
      }
      toast.error(
        'Preencha a referência da medição, as datas de início/fim da medição, e selecione centro de custo, prestador, tomador, conta bancária e código tributário. Quando tudo estiver preenchido, marque também a confirmação em «Constar na nota fiscal».'
      );
      return;
    }
    const snapshot = formatEspelhoDraftMoneyFields(draft);
    if (editingSavedMirrorId) {
      updateEspelhoApprovalStatus(editingSavedMirrorId, 'PENDING_APPROVAL');
      setSavedDrafts((prev) =>
        prev.map((s) =>
          s.id === editingSavedMirrorId
            ? {
                ...snapshot,
                id: editingSavedMirrorId,
                createdAt: s.createdAt ?? new Date().toISOString(),
                approvalStatus: 'PENDING_APPROVAL',
                nfAttachment: s.nfAttachment,
                xmlAttachment: s.xmlAttachment
              }
            : s
        )
      );
      setEditingSavedMirrorId(null);
      setDraft(INITIAL_DRAFT);
      setShowEspelhoForm(false);
      toast.success('Espelho atualizado.');
      return;
    }
    const newId = newSavedMirrorId();
    updateEspelhoApprovalStatus(newId, 'PENDING_APPROVAL');
    setSavedDrafts((prev) => [
      {
        ...snapshot,
        id: newId,
        createdAt: new Date().toISOString(),
        approvalStatus: 'PENDING_APPROVAL'
      },
      ...prev
    ]);
    setDraft(INITIAL_DRAFT);
    setShowEspelhoForm(false);
    toast.success('Espelho salvo.');
  };

  const handleExportDraftPdf = () => {
    if (espelhoMoneyTripletError) {
      toast.error(espelhoMoneyTripletError);
      return;
    }
    if (!canSave) {
      const espelhoOkExcetoConfirmacao = Boolean(
        draft.measurementRef.trim() &&
          draft.costCenterId &&
          draft.providerId &&
          draft.takerId &&
          draft.bankAccountId &&
          draft.taxCodeId &&
          draft.measurementStartDate &&
          draft.measurementEndDate &&
          !espelhoMoneyTripletError
      );
      if (espelhoOkExcetoConfirmacao && !draft.nfConstarNaNotaAcknowledged) {
        toast.error(
          'Marque a confirmação obrigatória em «Constar na nota fiscal» antes de exportar o PDF.'
        );
      } else {
        toast.error(
          'Preencha o formulário para exportar o espelho em elaboração (e a confirmação em «Constar na nota fiscal» quando aplicável).'
        );
      }
      return;
    }
    exportEspelhoNfPdf(
      espelhoMirrorForExport(draft, costCentersForEspelho),
      serviceProviders,
      serviceTakers,
      bankAccounts,
      taxCodes,
      federalTaxRates
    );
    toast.success('Arquivo PDF gerado.');
  };

  const handleEditSavedMirror = (saved: SavedMirror) => {
    const {
      id,
      createdAt: _createdAt,
      nfAttachment: _nfAttachment,
      xmlAttachment: _xmlAttachment,
      ...rest
    } = saved;
    setDraft(formatEspelhoDraftMoneyFields(rest));
    setEditingSavedMirrorId(id);
    setShowEspelhoForm(true);
    toast.success('Altere os campos e clique em Salvar para concluir a edição.');
  };

  const handleAttachDetailFile = async (kind: 'nfAttachment' | 'xmlAttachment', file: File | null) => {
    if (!detailMirror || !file) return;
    if (file.size > MIRROR_ATTACHMENT_MAX_BYTES) {
      toast.error('Arquivo muito grande. Limite de 10 MB.');
      return;
    }
    try {
      const attachment: MirrorAttachment = {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: await fileToDataUrl(file)
      };
      const mirrorId = detailMirror.id;
      setSavedDrafts((prev) =>
        prev.map((m) => (m.id === mirrorId ? { ...m, [kind]: attachment } : m))
      );
      setDetailMirror((prev) => (prev && prev.id === mirrorId ? { ...prev, [kind]: attachment } : prev));
      toast.success(kind === 'nfAttachment' ? 'Nota fiscal anexada.' : 'XML anexado.');
    } catch {
      toast.error('Não foi possível anexar o arquivo.');
    }
  };

  const handleRemoveDetailAttachment = (kind: 'nfAttachment' | 'xmlAttachment') => {
    if (!detailMirror) return;
    const mirrorId = detailMirror.id;
    setSavedDrafts((prev) => prev.map((m) => (m.id === mirrorId ? { ...m, [kind]: undefined } : m)));
    setDetailMirror((prev) => (prev && prev.id === mirrorId ? { ...prev, [kind]: undefined } : prev));
    toast.success('Anexo removido.');
  };

  const handleDownloadAttachment = (attachment: MirrorAttachment) => {
    const anchor = document.createElement('a');
    anchor.href = attachment.dataUrl;
    anchor.download = attachment.name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleDeleteSavedMirror = (id: string) => {
    removeEspelhoApprovalStatus(id);
    setSavedDrafts((prev) => prev.filter((s) => s.id !== id));
    if (editingSavedMirrorId === id) {
      setEditingSavedMirrorId(null);
      setDraft(INITIAL_DRAFT);
    }
    toast.success('Espelho excluído.');
  };

  const handleCancelSavedMirrorEdit = () => {
    setEditingSavedMirrorId(null);
    setDraft(INITIAL_DRAFT);
    setShowEspelhoForm(false);
    setOpenEspelhoPicker(null);
    setEspelhoPrestadorPickerQuery('');
    setEspelhoTomadorPickerQuery('');
    setNfConstarMenuOpen(false);
    setEspelhoSavedFiltersModalOpen(false);
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/espelho-nf">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/espelho-nf">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
              Espelho da Nota Fiscal
            </h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Base para emissão de nota fiscal com regras tributárias (em evolução).
            </p>
          </div>


          {showEspelhoForm && (
            <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex min-h-0 items-center justify-center overflow-hidden p-2 sm:p-4">
              <div className="absolute inset-0 bg-black/50" aria-hidden />
              <div className="relative flex max-h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 [&_button:focus]:outline-none [&_button:focus]:ring-0 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-0 [&_input:not(.sr-only):focus]:outline-none [&_input:not(.sr-only):focus]:ring-0 [&_input:not(.sr-only):focus-visible]:outline-none [&_input:not(.sr-only):focus-visible]:ring-0 [&_select:focus]:outline-none [&_select:focus]:ring-0 [&_select:focus-visible]:outline-none [&_select:focus-visible]:ring-0 [&_textarea:focus]:outline-none [&_textarea:focus]:ring-0 [&_textarea:focus-visible]:outline-none [&_textarea:focus-visible]:ring-0">
                <div className="z-10 flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 py-4 dark:border-gray-700 dark:bg-gray-800">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 pr-2">
                    {editingSavedMirrorId ? 'Editar espelho da nota fiscal' : 'Novo espelho da nota fiscal'}
                  </h2>
                  <button
                    type="button"
                    onClick={() => { setShowEspelhoForm(false); handleCancelSavedMirrorEdit(); }}
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                    aria-label="Fechar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-5 sm:p-6 [scrollbar-gutter:stable]">
                <div className="space-y-4">
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50/60 dark:border-gray-600 dark:bg-gray-700/20 p-4">
                    <label className="mb-1 block text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Prestador de serviço
                    </label>
                    <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                      Escolha o prestador vinculado a esta nota.
                    </p>
                    <div ref={prestadorPickerRef} className="relative">
                      <button
                        type="button"
                        aria-expanded={openEspelhoPicker === 'prestador'}
                        aria-haspopup="listbox"
                        onClick={() => {
                          setOpenEspelhoPicker((k) => (k === 'prestador' ? null : 'prestador'));
                          setEspelhoPrestadorPickerQuery('');
                        }}
                        className="relative flex w-full items-center rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-11 text-left text-sm shadow-sm transition-colors hover:border-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 dark:focus:border-gray-600"
                      >
                        <span
                          className={`min-w-0 flex-1 truncate ${!espelhoPrestadorPickerLabel ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}
                        >
                          {espelhoPrestadorPickerLabel || 'Selecione um prestador...'}
                        </span>
                        <ChevronDown
                          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-gray-500 transition-transform dark:text-gray-400 ${openEspelhoPicker === 'prestador' ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </button>
                    </div>
                    {serviceProviders.length === 0 ? (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Nenhum prestador cadastrado. Inclua prestadores pelo cadastro do sistema.
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50/60 dark:border-gray-600 dark:bg-gray-700/20 p-4">
                    <label className="mb-1 block text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Tomador de serviço
                    </label>
                    <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    Escolha o Tomador vinculado a esta nota.
                    </p>
                    <div ref={tomadorPickerRef} className="relative">
                      <button
                        type="button"
                        aria-expanded={openEspelhoPicker === 'tomador'}
                        aria-haspopup="listbox"
                        onClick={() => {
                          setOpenEspelhoPicker((k) => (k === 'tomador' ? null : 'tomador'));
                          setEspelhoTomadorPickerQuery('');
                        }}
                        className="relative flex w-full items-center rounded-lg border border-gray-300 bg-white py-2.5 pl-3 pr-11 text-left text-sm shadow-sm transition-colors hover:border-gray-400 focus:border-gray-400 focus:outline-none focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:border-gray-500 dark:focus:border-gray-600"
                      >
                        <span
                          className={`min-w-0 flex-1 truncate ${!espelhoTomadorPickerLabel ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}
                        >
                          {espelhoTomadorPickerLabel || 'Selecione um tomador...'}
                        </span>
                        <ChevronDown
                          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 shrink-0 -translate-y-1/2 text-gray-500 transition-transform dark:text-gray-400 ${openEspelhoPicker === 'tomador' ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </button>
                    </div>
                    {serviceTakers.length === 0 ? (
                      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Nenhum tomador cadastrado. Inclua tomadores pelo cadastro do sistema.
                      </p>
                    ) : null}
                  </div>
                {draft.takerId ? (
                  <>
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                      Dados do tomador
                    </p>
                    <div className="rounded-lg border border-gray-200/90 bg-gray-50/70 px-3 py-3 dark:border-gray-600 dark:bg-gray-700/30 sm:px-4">
                      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-12 lg:gap-y-2.5">
                        <div className="min-w-0 sm:col-span-2 lg:col-span-6">
                          <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                            Centro de custo
                          </dt>
                          <dd
                            className="mt-0.5 text-sm leading-snug text-gray-900 dark:text-gray-100"
                            title={draftCostCenterLabel || undefined}
                          >
                            {draftCostCenterLabel || '—'}
                          </dd>
                        </div>
                        <div className="min-w-0 sm:col-span-1 lg:col-span-3">
                          <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                            Cód. tributário
                          </dt>
                          <dd
                            className="mt-0.5 text-sm leading-snug text-gray-900 dark:text-gray-100"
                            title={draft.taxCodeCityName || undefined}
                          >
                            {draft.taxCodeCityName || '—'}
                          </dd>
                        </div>
                        <div className="min-w-0 sm:col-span-1 lg:col-span-3">
                          <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                            Município
                          </dt>
                          <dd className="mt-0.5 text-sm leading-snug text-gray-900 dark:text-gray-100">
                            {draft.municipality || '—'}
                          </dd>
                        </div>
                        <div className="min-w-0 sm:col-span-2 lg:col-span-12 lg:border-t lg:border-gray-200/80 lg:pt-2.5 dark:lg:border-gray-700/80">
                          <dt className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                            Conta bancária
                          </dt>
                          <dd
                            className="mt-0.5 text-sm leading-snug text-gray-900 dark:text-gray-100"
                            title={draft.bankAccountName || undefined}
                          >
                            {draft.bankAccountName || '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                    <div className="space-y-1">
                      <label
                        htmlFor="espelho-draft-cnae"
                        className="text-xs font-medium text-gray-600 dark:text-gray-400"
                      >
                        CNAE
                      </label>
                      <input
                        id="espelho-draft-cnae"
                        type="text"
                        value={draft.cnae}
                        onChange={(e) => setDraft((prev) => ({ ...prev, cnae: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="espelho-draft-issqn"
                        className="text-xs font-medium text-gray-600 dark:text-gray-400"
                      >
                        Lista de Serviços - ISSQN
                      </label>
                      <StringSingleSelectDropdown
                        value={draft.serviceIssqn}
                        onChange={(serviceIssqn) => setDraft((prev) => ({ ...prev, serviceIssqn }))}
                        options={ESPELHO_ISSQN_OPTIONS}
                        placeholder="Selecione..."
                        emptyOptionLabel="Selecione..."
                      />
                    </div>
                  </div>
                  </>
                ) : null}
                </div>

                <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="md:col-span-2 relative" ref={nfConstarMenuRef}>
                    <div
                      ref={nfConstarBarRef}
                      className="flex flex-col gap-3 rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/90 dark:bg-gray-700/35 p-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Constar na nota fiscal
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {nfConstarSelectedCount === 0
                            ? 'Nenhum campo opcional visível. Use o botão para escolher o que deseja preencher.'
                            : `${nfConstarSelectedCount} campo(s) opcional(is) visível(is).`}
                        </p>
                      </div>
                      <label className="group inline-flex max-w-md shrink-0 cursor-pointer items-center gap-3 rounded-lg border border-gray-200 bg-white px-2.5 py-2 dark:border-gray-600 dark:bg-gray-800">
                        <div className="relative shrink-0">
                          <input
                            type="checkbox"
                            checked={draft.nfConstarNaNotaAcknowledged}
                            onChange={(e) =>
                              setDraft((prev) => ({
                                ...prev,
                                nfConstarNaNotaAcknowledged: e.target.checked
                              }))
                            }
                            className="sr-only"
                            aria-required="true"
                            aria-label="Checagem de campos — obrigatório para salvar"
                          />
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-200 ${
                              draft.nfConstarNaNotaAcknowledged
                                ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
                                : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800 group-hover:border-red-500 dark:group-hover:border-red-400'
                            }`}
                            aria-hidden
                          >
                            {draft.nfConstarNaNotaAcknowledged ? (
                              <svg
                                className="h-3 w-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            ) : null}
                          </div>
                        </div>
                        <span className="text-xs font-medium leading-snug text-gray-800 dark:text-gray-200">
                          Checagem de campos
                        </span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setNfConstarMenuOpen((o) => !o)}
                        className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-0 lg:self-center"
                        aria-expanded={nfConstarMenuOpen}
                        aria-haspopup="true"
                      >
                        Escolher campos
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${nfConstarMenuOpen ? 'rotate-180' : ''}`}
                          aria-hidden
                        />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label
                      htmlFor="espelho-draft-measurement-ref"
                      className="mb-1.5 block text-sm font-semibold text-gray-900 dark:text-gray-100"
                    >
                      Referência da medição
                    </label>
                    <input
                      id="espelho-draft-measurement-ref"
                      type="text"
                      placeholder="Ex.: Medição 87 - Abril/2026"
                      value={draft.measurementRef}
                      onChange={(e) => setDraft((prev) => ({ ...prev, measurementRef: e.target.value }))}
                      className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
                    />
                  </div>
                  {draft.nfConstarNaNota.obraCno ? (
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Número da Inscrição da Obra / CNO
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="xx.xxx.xxxxx/xx"
                        value={draft.obraCno}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, obraCno: maskCnoObraInput(e.target.value) }))
                        }
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-mono tracking-wide text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-0"
                      />
                    </div>
                  ) : null}
                  {draft.nfConstarNaNota.processNumber && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Número do Processo</label>
                      <input
                        type="text"
                        value={draft.processNumber}
                        onChange={(e) => setDraft((prev) => ({ ...prev, processNumber: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-0"
                      />
                    </div>
                  )}
                  {draft.nfConstarNaNota.empenhoNumber && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Número do Empenho</label>
                      <input
                        type="text"
                        value={draft.empenhoNumber}
                        onChange={(e) => setDraft((prev) => ({ ...prev, empenhoNumber: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-0"
                      />
                    </div>
                  )}
                  {draft.nfConstarNaNota.serviceOrder && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Ordem de Serviço</label>
                      <input
                        type="text"
                        value={draft.serviceOrder}
                        onChange={(e) => setDraft((prev) => ({ ...prev, serviceOrder: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-0"
                      />
                    </div>
                  )}
                  {draft.nfConstarNaNota.buildingUnit && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Unidade Predial</label>
                      <input
                        type="text"
                        value={draft.buildingUnit}
                        onChange={(e) => setDraft((prev) => ({ ...prev, buildingUnit: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-0"
                      />
                    </div>
                  )}
                  {(draft.nfConstarNaNota.garantiaComplementar ||
                    draftTaxCode?.hasComplementaryWarranty === true) && (
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Garantia Complementar
                      </label>
                      <textarea
                        rows={2}
                        placeholder="Informe os dados da garantia complementar…"
                        value={
                          garantiaComplementarAuto ? garantiaComplementarMessage : draft.garantiaComplementar
                        }
                        readOnly={garantiaComplementarAuto}
                        onChange={(e) => {
                          if (garantiaComplementarAuto) return;
                          setDraft((prev) => ({ ...prev, garantiaComplementar: e.target.value }));
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-y min-h-[3rem] focus:outline-none focus:ring-0"
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 md:col-span-2">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Vencimento</label>
                      <input
                        type="date"
                        value={draft.dueDate}
                        onChange={(e) => setDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Início da medição
                      </label>
                      <input
                        type="date"
                        value={draft.measurementStartDate}
                        onChange={(e) => setDraft((prev) => ({ ...prev, measurementStartDate: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-0"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Fim da medição
                      </label>
                      <input
                        type="date"
                        value={draft.measurementEndDate}
                        onChange={(e) => setDraft((prev) => ({ ...prev, measurementEndDate: e.target.value }))}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 focus:outline-none focus:ring-0"
                        required
                      />
                    </div>
                  </div>
                  {draft.nfConstarNaNota.observations && (
                    <div className="space-y-1 md:col-span-2">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Observações</label>
                      <textarea
                        rows={3}
                        placeholder="Observações sobre este espelho..."
                        value={draft.observations}
                        onChange={(e) => setDraft((prev) => ({ ...prev, observations: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-y min-h-[4.5rem] focus:outline-none focus:ring-0"
                      />
                    </div>
                  )}
                </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <EspelhoCentStepperMoneyInput
                      label="Medição (R$)"
                      value={draft.measurementAmount}
                      onChange={onEspelhoMoneyChange('measurementAmount')}
                      onBlur={onEspelhoMoneyBlur('measurementAmount')}
                      canStepDown={measurementCentCount >= 1}
                      onStepUp={nudgeEspelhoMoneyFieldCent('measurementAmount', 1)}
                      onStepDown={nudgeEspelhoMoneyFieldCent('measurementAmount', -1)}
                    />
                    <EspelhoCentStepperMoneyInput
                      label="Mão de obra (R$)"
                      value={draft.laborAmount}
                      onChange={onEspelhoMoneyChange('laborAmount')}
                      onBlur={onEspelhoMoneyBlur('laborAmount')}
                      canStepDown={laborCentCount >= 1}
                      onStepUp={nudgeEspelhoMoneyFieldCent('laborAmount', 1)}
                      onStepDown={nudgeEspelhoMoneyFieldCent('laborAmount', -1)}
                    />
                    <EspelhoCentStepperMoneyInput
                      label="Material (R$)"
                      value={draft.materialAmount}
                      onChange={onEspelhoMoneyChange('materialAmount')}
                      onBlur={onEspelhoMoneyBlur('materialAmount')}
                      canStepDown={materialCentCount >= 1}
                      onStepUp={nudgeEspelhoMoneyFieldCent('materialAmount', 1)}
                      onStepDown={nudgeEspelhoMoneyFieldCent('materialAmount', -1)}
                    />
                  </div>
                  {espelhoMoneyTripletError && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                      {espelhoMoneyTripletError}
                    </p>
                  )}
                  <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/50 p-4 sm:p-5 dark:bg-gray-700/25">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        Material, bases e retenções
                      </h3>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Valores somente leitura, conforme o código tributário do tomador e os valores de medição e
                        material informados acima.
                      </p>
                    </div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-700/40">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            Limite Material INSS
                          </label>
                          <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                            Percentual: {limitMaterialPctHint(draftTaxCode?.inssMaterialLimit) ?? '—'}
                          </p>
                          <input
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={espelhoMaterialLimits.inssBrl}
                            className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            Base de cálculo INSS
                          </label>
                          <input
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={espelhoBasesCalculo.baseInss}
                            className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100"
                          />
                        </div>
                      </div>
                      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-700/40">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            Limite Material ISS
                          </label>
                          <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                            Percentual: {limitMaterialPctHint(draftTaxCode?.issMaterialLimit) ?? '—'}
                          </p>
                          <input
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={espelhoMaterialLimits.issBrl}
                            className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            Base de cálculo ISS
                          </label>
                          <input
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={espelhoBasesCalculo.baseIss}
                            className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700/40">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">COFINS</label>
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(federalTaxRates.cofins) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.cofins.value}
                          className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100"
                        />
                        {espelhoImpostos.cofins.recolher ? (
                          <p className="text-[11px] font-medium leading-snug text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.cofins.recolher}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700/40">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">CSLL</label>
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(federalTaxRates.csll) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.csll.value}
                          className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100"
                        />
                        {espelhoImpostos.csll.recolher ? (
                          <p className="text-[11px] font-medium leading-snug text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.csll.recolher}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700/40">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">IRPJ</label>
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(federalTaxRates.irpj) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.irpj.value}
                          className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100"
                        />
                        {espelhoImpostos.irpj.recolher ? (
                          <p className="text-[11px] font-medium leading-snug text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.irpj.recolher}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700/40">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">PIS</label>
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(federalTaxRates.pis) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.pis.value}
                          className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100"
                        />
                        {espelhoImpostos.pis.recolher ? (
                          <p className="text-[11px] font-medium leading-snug text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.pis.recolher}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700/40">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">INSS</label>
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(federalTaxRates.inss) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.inss.value}
                          className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100"
                        />
                        {espelhoImpostos.inss.recolher ? (
                          <p className="text-[11px] font-medium leading-snug text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.inss.recolher}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-1 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-700/40">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">ISS</label>
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(draftTaxCode?.issRate) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.iss.value}
                          className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-right text-sm tabular-nums text-gray-900 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-100"
                        />
                        {espelhoImpostos.iss.recolher ? (
                          <p className="text-[11px] font-medium leading-snug text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.iss.recolher}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex flex-col gap-4 md:flex-row md:items-stretch">
                    <div className="flex min-h-[140px] flex-1 flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Outras informações</label>
                      <div className="space-y-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50/90 dark:bg-gray-700/40 px-3 py-3 text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                        <p>
                          Retenção do INSS no Percentual de 11%. Dedução da BC do INSS conforme art. 117, inciso IV
                          da IN RFB No 2110/2022.
                        </p>
                        <p>
                          O ISS desta NF-e será RETIDO pelo TOMADOR DE SERVIÇO? —{' '}
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {espelhoIssRetidoPeloTomadorLabel}
                          </span>
                        </p>
                        <p>
                          O ISS desta NF-e é devido no Município de - {' '}
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {draftMunicipalityWithUf}
                          </span>
                          .
                        </p>
                      </div>
                      <textarea
                        rows={3}
                        placeholder="Informações complementares (opcional)..."
                        value={draft.notes}
                        onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                        className="min-h-[72px] w-full flex-1 resize-y px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-0"
                      />
                    </div>
                    <div
                      className={
                        espelhoValorLiquidoMeta.saldoNegativo
                          ? 'w-full shrink-0 rounded-lg border-2 border-amber-400/80 bg-amber-50/80 dark:bg-amber-950/40 p-3 md:w-[320px] md:self-stretch md:flex md:flex-col'
                          : 'w-full shrink-0 rounded-lg border-2 border-emerald-400/70 bg-emerald-50/80 dark:bg-emerald-900/20 p-3 md:w-[320px] md:self-stretch md:flex md:flex-col'
                      }
                    >
                      <label
                        className={
                          espelhoValorLiquidoMeta.saldoNegativo
                            ? 'mb-2 block text-sm font-semibold text-amber-900 dark:text-amber-200'
                            : 'mb-2 block text-sm font-semibold text-emerald-800 dark:text-emerald-300'
                        }
                      >
                        Valor Líquido
                      </label>
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={espelhoValorLiquidoMeta.display}
                        className={
                          espelhoValorLiquidoMeta.saldoNegativo
                            ? 'w-full flex-1 px-3 py-2 text-base font-bold text-center border border-amber-400/70 rounded-lg bg-white dark:bg-gray-800 text-amber-900 dark:text-amber-200 cursor-not-allowed md:min-h-0'
                            : 'w-full flex-1 px-3 py-2 text-base font-bold text-center border border-emerald-400/60 rounded-lg bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-300 cursor-not-allowed md:min-h-0'
                        }
                      />
                      {espelhoValorLiquidoMeta.saldoNegativo ? (
                        <p className="mt-2 text-xs text-amber-900/90 dark:text-amber-200/90">
                          A soma das retenções excede o valor da medição; o saldo fica negativo. Revise
                          alíquotas ou valores de medição/material.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
                </div>
                </div>
                <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/90 sm:px-6 flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={handleCancelSavedMirrorEdit}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={!canSave}
                      title={
                        !canSave
                          ? (espelhoMoneyTripletError ?? 'Preencha os obrigatórios.')
                          : undefined
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {editingSavedMirrorId ? (
                        <Pencil className="h-4 w-4" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      {editingSavedMirrorId ? 'Salvar alterações' : 'Salvar espelho'}
                    </button>
                  </div>
                </div>
              </div>
            </AppModalOverlay>
          )}

          {showEspelhoForm &&
            openEspelhoPicker &&
            espelhoPickerPanelGeo &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                ref={espelhoPickerPopoverRef}
                role="listbox"
                className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800"
                style={{
                  position: 'fixed',
                  left: espelhoPickerPanelGeo.left,
                  top: espelhoPickerPanelGeo.top,
                  width: espelhoPickerPanelGeo.width,
                  maxHeight: espelhoPickerPanelGeo.maxHeight,
                  zIndex: 200
                }}
              >
                <div className="shrink-0 border-b border-gray-200 p-2 dark:border-gray-600">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="search"
                      value={
                        openEspelhoPicker === 'prestador'
                          ? espelhoPrestadorPickerQuery
                          : espelhoTomadorPickerQuery
                      }
                      onChange={(e) =>
                        openEspelhoPicker === 'prestador'
                          ? setEspelhoPrestadorPickerQuery(e.target.value)
                          : setEspelhoTomadorPickerQuery(e.target.value)
                      }
                      placeholder="Pesquisar..."
                      className="w-full rounded-md border border-gray-300 bg-white py-2 pl-8 pr-2 text-sm text-gray-900 shadow-none placeholder:text-gray-400 outline-none focus:border-gray-300 focus:outline-none focus:ring-0 focus-visible:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:focus:border-gray-600"
                      autoFocus
                    />
                  </div>
                </div>
                <ul className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain py-1">
                  {openEspelhoPicker === 'prestador' ? (
                    filteredPrestadorPickerList.length === 0 ? (
                      <li className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                        Nenhum prestador encontrado.
                      </li>
                    ) : (
                      filteredPrestadorPickerList.map((provider) => {
                        const selected = draft.providerId === provider.id;
                        return (
                          <li key={provider.id} className="w-full" role="option" aria-selected={selected}>
                            <button
                              type="button"
                              title={selected ? 'Clique novamente para limpar a seleção' : undefined}
                              onClick={() => {
                                setDraft((prev) => {
                                  if (prev.providerId === provider.id) {
                                    return { ...prev, providerId: '', providerName: '' };
                                  }
                                  return {
                                    ...prev,
                                    providerId: provider.id,
                                    providerName: provider.corporateName
                                  };
                                });
                                setOpenEspelhoPicker(null);
                                setEspelhoPrestadorPickerQuery('');
                              }}
                              className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                                selected
                                  ? 'text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/60'
                                  : 'text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60'
                              }`}
                            >
                              <div className="relative shrink-0" aria-hidden>
                                <div
                                  className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-200 ${
                                    selected
                                      ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
                                      : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800 group-hover:border-red-500 dark:group-hover:border-red-400'
                                  }`}
                                >
                                  {selected ? (
                                    <svg
                                      className="h-3 w-3 text-white"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={3}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  ) : null}
                                </div>
                              </div>
                              <span className="min-w-0 flex-1 leading-snug">
                                <span
                                  className={`font-medium ${selected ? 'text-gray-800 dark:text-gray-200' : ''}`}
                                >
                                  {provider.corporateName}
                                </span>
                                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                                  {provider.cnpj} · {provider.city}/{provider.state}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })
                    )
                  ) : filteredTomadorPickerList.length === 0 ? (
                    <li className="px-3 py-4 text-center text-xs text-gray-500 dark:text-gray-400">
                      Nenhum tomador encontrado.
                    </li>
                  ) : (
                    filteredTomadorPickerList.map((taker) => {
                      const selected = draft.takerId === taker.id;
                      return (
                        <li key={taker.id} className="w-full" role="option" aria-selected={selected}>
                          <button
                            type="button"
                            title={selected ? 'Clique novamente para limpar a seleção' : undefined}
                            onClick={() => {
                              setDraft((prev) => {
                                if (prev.takerId === taker.id) {
                                  return {
                                    ...prev,
                                    takerId: '',
                                    takerName: '',
                                    municipality: '',
                                    costCenterId: '',
                                    bankAccountId: '',
                                    bankAccountName: '',
                                    taxCodeId: '',
                                    taxCodeCityName: ''
                                  };
                                }
                                const linkedTaxCode =
                                  taxCodes.find((code) => code.id === taker.taxCodeId) ?? null;
                                const linkedBank =
                                  bankAccounts.find((account) => account.id === taker.bankAccountId) ?? null;
                                return {
                                  ...prev,
                                  takerId: taker.id,
                                  takerName: taker.corporateName,
                                  municipality: taker.municipality || taker.city || '',
                                  costCenterId: taker.costCenterId || '',
                                  bankAccountId: taker.bankAccountId || '',
                                  bankAccountName: linkedBank?.name || '',
                                  taxCodeId: taker.taxCodeId || '',
                                  taxCodeCityName: linkedTaxCode?.cityName || ''
                                };
                              });
                              setOpenEspelhoPicker(null);
                              setEspelhoTomadorPickerQuery('');
                            }}
                            className={`group flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                              selected
                                ? 'text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/60'
                                : 'text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60'
                            }`}
                          >
                            <div className="relative shrink-0" aria-hidden>
                              <div
                                className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-200 ${
                                  selected
                                    ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
                                    : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800 group-hover:border-red-500 dark:group-hover:border-red-400'
                                }`}
                              >
                                {selected ? (
                                  <svg
                                    className="h-3 w-3 text-white"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={3}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                ) : null}
                              </div>
                            </div>
                            <span className="min-w-0 flex-1 leading-snug">
                              <span
                                className={`font-medium ${selected ? 'text-gray-800 dark:text-gray-200' : ''}`}
                              >
                                {taker.name} — {taker.corporateName}
                              </span>
                              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                                {taker.cnpj}
                                {taker.contractRef ? ` · Contrato: ${taker.contractRef}` : ''}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>,
              document.body
            )}

          {showEspelhoForm &&
            nfConstarMenuOpen &&
            nfConstarPanelGeo &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                ref={nfConstarPopoverRef}
                role="menu"
                className="overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-800"
                style={{
                  position: 'fixed',
                  left: nfConstarPanelGeo.left,
                  top: nfConstarPanelGeo.top,
                  width: nfConstarPanelGeo.width,
                  maxHeight: nfConstarPanelGeo.maxHeight,
                  zIndex: 200
                }}
              >
                <p className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Marque os campos que devem aparecer no formulário:
                </p>
                <div className="space-y-1">
                  {(Object.keys(NF_CONSTAR_FIELD_LABELS) as (keyof NfConstarNaNotaFields)[]).map((key) => {
                    const checked = draft.nfConstarNaNota[key];
                    return (
                      <label
                        key={key}
                        className="group flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/80"
                      >
                        <div className="relative shrink-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleNfConstarField(key)}
                            className="sr-only"
                            aria-label={NF_CONSTAR_FIELD_LABELS[key]}
                          />
                          <div
                            className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-200 ${
                              checked
                                ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
                                : 'border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800 group-hover:border-red-500 dark:group-hover:border-red-400'
                            }`}
                            aria-hidden
                          >
                            {checked ? (
                              <svg
                                className="h-3 w-3 text-white"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            ) : null}
                          </div>
                        </div>
                        <span className="min-w-0 flex-1 leading-snug">{NF_CONSTAR_FIELD_LABELS[key]}</span>
                      </label>
                    );
                  })}
                </div>
              </div>,
              document.body
            )}


          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <FileSpreadsheet className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Espelhos da Nota Fiscal
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Visualizar e gerenciar espelhos cadastrados para emissão de NF
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {savedDrafts.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => setEspelhoSavedFiltersModalOpen(true)}
                      className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                        hasActiveEspelhoSavedFilters
                          ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                          : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                      }`}
                      aria-label="Abrir filtro"
                      title={hasActiveEspelhoSavedFilters ? 'Filtros ativos' : 'Filtro'}
                    >
                      <Filter className="h-4 w-4" />
                      {hasActiveEspelhoSavedFilters ? (
                        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" />
                      ) : null}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      setDraft(INITIAL_DRAFT);
                      setEditingSavedMirrorId(null);
                      setShowEspelhoForm(true);
                    }}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Novo Espelho da Nota Fiscal</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {savedDrafts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <div className="mb-4 rounded-lg bg-red-100 dark:bg-red-900/30 p-4">
                    <FileSpreadsheet className="mx-auto h-8 w-8 text-red-600 dark:text-red-400" />
                  </div>
                  <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                    Nenhum espelho criado ainda
                  </p>
                  <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                    Clique em &ldquo;Novo espelho da nota fiscal&rdquo; para começar.
                  </p>
                </div>
                ) : (
                  <>
                    <Modal
                      isOpen={espelhoSavedFiltersModalOpen}
                      onClose={() => setEspelhoSavedFiltersModalOpen(false)}
                      title="Filtros"
                      size="md"
                    >
                      <div className="space-y-4">
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Centro de custo
                          </label>
                          <StringSingleSelectDropdown
                            value={espelhoSavedFilterCostCenter}
                            onChange={setEspelhoSavedFilterCostCenter}
                            options={espelhoSavedCostCenterFilterOptions}
                            disabled={loadingCostCenters}
                            allowEmpty={false}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Tomador
                          </label>
                          <StringSingleSelectDropdown
                            value={espelhoSavedFilterTaker}
                            onChange={setEspelhoSavedFilterTaker}
                            options={espelhoSavedTakerFilterOptions}
                            allowEmpty={false}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Mês
                          </label>
                          <StringSingleSelectDropdown
                            value={espelhoSavedFilterMonth}
                            onChange={setEspelhoSavedFilterMonth}
                            options={ESPELHO_SAVED_MONTH_FILTER_OPTIONS}
                            allowEmpty={false}
                          />
                        </div>
                        <div>
                          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Ano
                          </label>
                          <select
                            value={espelhoSavedFilterYear}
                            onChange={(e) => setEspelhoSavedFilterYear(e.target.value)}
                            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                          >
                            <option value="">Todos</option>
                            {espelhoSavedYearOptions.map((yr) => (
                              <option key={yr} value={String(yr)}>
                                {yr}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
                        <button
                          type="button"
                          onClick={() => {
                            setEspelhoSavedFilterCostCenter('');
                            setEspelhoSavedFilterTaker('');
                            setEspelhoSavedFilterMonth('');
                            setEspelhoSavedFilterYear('');
                          }}
                          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Limpar filtros
                        </button>
                        <button
                          type="button"
                          onClick={() => setEspelhoSavedFiltersModalOpen(false)}
                          className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                        >
                          Aplicar
                        </button>
                      </div>
                    </Modal>
                    {filteredSavedDrafts.length === 0 ? (
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Nenhum espelho corresponde aos filtros selecionados.
                      </p>
                    ) : (
                      <>
                        <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                          <span>
                            Mostrando 1 a {filteredSavedDrafts.length} de {filteredSavedDrafts.length}{' '}
                            espelho(s)
                            {savedDrafts.length !== filteredSavedDrafts.length ? (
                              <span className="text-gray-500 dark:text-gray-500">
                                {' '}
                                ({filteredSavedDrafts.length} de {savedDrafts.length} no cadastro)
                              </span>
                            ) : null}
                          </span>
                          <span>Página 1 de 1</span>
                        </div>

                        <div className="table-scroll">
                          <table className="w-full text-sm">
                            <thead className="border-b border-gray-200 dark:border-gray-700">
                              <tr>
                                <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                  Espelho
                                </th>
                                <th className="px-3 py-4 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                  Centro de custo
                                </th>
                                <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                  Status
                                </th>
                                <th className="px-3 py-4 text-center text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                  Criado em
                                </th>
                                <th className="px-3 py-4 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6">
                                  Ação
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                              {filteredSavedDrafts.map((item) => {
                                const approvalStatus = resolveEspelhoApprovalStatus(
                                  item.id,
                                  item.approvalStatus
                                );
                                const ccRow = costCentersForEspelho.find((c) => c.id === item.costCenterId);
                                const ccLabel = ccRow
                                  ? [ccRow.code, ccRow.name].filter(Boolean).join(' — ')
                                  : item.costCenterId
                                    ? 'Centro não encontrado no cadastro'
                                    : '—';
                                const takerTitle = item.takerName.trim() || 'Tomador não informado';
                                const medValue = parseEspelhoBrCurrencyToNumber(item.measurementAmount);
                                const medTitle =
                                  medValue !== null ? fmtEspelhoBrl(medValue) : 'Medição não informada';
                                const refTitle = item.measurementRef.trim() || 'Sem referência';
                                const statusBadgeClass =
                                  approvalStatus === 'APPROVED'
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
                                    : ESPELHO_APPROVAL_BADGE_CLASS[approvalStatus];
                                const createdLabel = item.createdAt
                                  ? new Date(item.createdAt).toLocaleDateString('pt-BR')
                                  : '—';
                                return (
                                  <tr
                                    key={item.id}
                                    onClick={() => setDetailMirror(item)}
                                    className={getListTableRowClassName(true)}
                                  >
                                    <td className="px-3 py-3 align-middle text-left sm:px-6">
                                      <div className="min-w-0 text-left">
                                        <ListRowNavigableLabel className="truncate font-semibold">
                                          {takerTitle}
                                        </ListRowNavigableLabel>
                                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                          {refTitle} · {medTitle}
                                        </p>
                                      </div>
                                    </td>
                                    <td
                                      className="px-3 py-3 text-left text-sm text-gray-700 dark:text-gray-300 sm:px-6"
                                      title={ccLabel}
                                    >
                                      <span className="line-clamp-2 sm:line-clamp-none">{ccLabel}</span>
                                    </td>
                                    <td className="px-3 py-3 text-center sm:px-6">
                                      <span
                                        className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${statusBadgeClass}`}
                                      >
                                        {ESPELHO_APPROVAL_STATUS_LABELS[approvalStatus]}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                      {createdLabel}
                                    </td>
                                    <td className="px-3 py-3 text-right sm:px-6" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex justify-end">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                            setMirrorActionMenu((prev) => {
                                              if (prev?.mirrorId === item.id) return null;
                                              let left = r.right - MIRROR_ACTION_MENU_WIDTH_PX;
                                              left = Math.max(
                                                8,
                                                Math.min(
                                                  left,
                                                  window.innerWidth - MIRROR_ACTION_MENU_WIDTH_PX - 8
                                                )
                                              );
                                              return { mirrorId: item.id, top: r.bottom + 4, left };
                                            });
                                          }}
                                          className={rowActionMenuButtonClass(mirrorActionMenu?.mirrorId === item.id)}
                                          aria-label="Menu de ações"
                                          aria-expanded={mirrorActionMenu?.mirrorId === item.id}
                                          aria-haspopup="menu"
                                        >
                                          <MoreVertical className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

          {mirrorActionMenu && mirrorMenuItem ? (
            <ActionMenuOverlay
              open
              onClose={() => setMirrorActionMenu(null)}
              top={mirrorActionMenu.top}
              left={mirrorActionMenu.left}
            >
                    {(() => {
                      const menuApproval = resolveEspelhoApprovalStatus(
                        mirrorMenuItem.id,
                        mirrorMenuItem.approvalStatus
                      );
                      return (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMirrorActionMenu(null);
                              setDetailMirror(mirrorMenuItem);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            <Eye className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                            <span>Ver detalhes</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMirrorActionMenu(null);
                              handleEditSavedMirror(mirrorMenuItem);
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            <Pencil className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                            <span>Editar</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMirrorActionMenu(null);
                              handleDeleteSavedMirror(mirrorMenuItem.id);
                            }}
                            disabled={menuApproval === 'APPROVED'}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            <Trash2 className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                            <span>Excluir</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={(e) => {
                              e.stopPropagation();
                              setMirrorActionMenu(null);
                              const msg = getEspelhoMoneyTripletMessage(mirrorMenuItem);
                              if (msg) {
                                toast.error(msg);
                                return;
                              }
                              exportEspelhoNfPdf(
                                espelhoMirrorForExport(mirrorMenuItem, costCentersForEspelho),
                                serviceProviders,
                                serviceTakers,
                                bankAccounts,
                                taxCodes,
                                federalTaxRates
                              );
                              toast.success('Arquivo PDF gerado.');
                            }}
                            disabled={menuApproval !== 'APPROVED'}
                            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-700"
                          >
                            <FileText className="h-4 w-4 shrink-0 text-gray-600 dark:text-gray-400" />
                            <span>Exportar PDF</span>
                          </button>
                        </>
                      );
                    })()}
            </ActionMenuOverlay>
          ) : null}

          {detailMirror && (
            <AppModalOverlay
              className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center overflow-hidden bg-black/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="espelho-detalhe-titulo"
            >
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Fechar"
                onClick={() => setDetailMirror(null)}
              />
              <div className="relative z-10 flex w-full max-w-lg max-h-[min(90vh,40rem)] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800 [&_button:focus]:outline-none [&_button:focus]:ring-0 [&_button:focus-visible]:outline-none [&_button:focus-visible]:ring-0 [&_input:not(.sr-only):focus]:outline-none [&_input:not(.sr-only):focus]:ring-0 [&_input:not(.sr-only):focus-visible]:outline-none [&_input:not(.sr-only):focus-visible]:ring-0 [&_select:focus]:outline-none [&_select:focus]:ring-0 [&_select:focus-visible]:outline-none [&_select:focus-visible]:ring-0 [&_textarea:focus]:outline-none [&_textarea:focus]:ring-0 [&_textarea:focus-visible]:outline-none [&_textarea:focus-visible]:ring-0">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0">
                  <h4
                    id="espelho-detalhe-titulo"
                    className="text-base font-semibold text-gray-900 dark:text-gray-100 pr-2"
                  >
                    Detalhes do espelho
                  </h4>
                  <button
                    type="button"
                    onClick={() => setDetailMirror(null)}
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto p-4 space-y-3 text-sm">
                  {buildEspelhoDetailRows(
                    detailMirror,
                    costCentersForEspelho,
                    taxCodes.find((t) => t.id === detailMirror.taxCodeId) ?? null,
                    taxCodes.find((t) => t.id === detailMirror.taxCodeId)?.iss ?? null
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="grid grid-cols-1 gap-1 border-b border-gray-100 pb-3 dark:border-gray-800 sm:grid-cols-[10rem_1fr] sm:gap-3"
                    >
                      <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
                      <span className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                        {value}
                      </span>
                    </div>
                  ))}
                  <div className="rounded-lg border border-gray-200/80 dark:border-gray-600 bg-gray-50/60 dark:bg-gray-700/25 p-4 space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      Anexos
                    </p>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white/70 dark:bg-gray-700/40 p-3 space-y-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Nota fiscal (PDF ou imagem)</p>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Selecionar arquivo
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            void handleAttachDetailFile('nfAttachment', file);
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      {detailMirror.nfAttachment ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs rounded-lg bg-gray-100/80 dark:bg-gray-700/40 px-2.5 py-2">
                          <span className="text-gray-700 dark:text-gray-300 break-all grow min-w-[12rem]">
                            {detailMirror.nfAttachment.name} ({humanFileSize(detailMirror.nfAttachment.size)})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDownloadAttachment(detailMirror.nfAttachment!)}
                            className="px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 inline-flex items-center gap-1 transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            Baixar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDetailAttachment('nfAttachment')}
                            className="px-2.5 py-1.5 rounded-md border border-red-300/90 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-600 bg-white/70 dark:bg-gray-700/40 p-3 space-y-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400">XML da nota fiscal</p>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Selecionar arquivo
                        <input
                          type="file"
                          accept=".xml,text/xml,application/xml"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            void handleAttachDetailFile('xmlAttachment', file);
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      {detailMirror.xmlAttachment ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs rounded-lg bg-gray-100/80 dark:bg-gray-700/40 px-2.5 py-2">
                          <span className="text-gray-700 dark:text-gray-300 break-all grow min-w-[12rem]">
                            {detailMirror.xmlAttachment.name} ({humanFileSize(detailMirror.xmlAttachment.size)})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDownloadAttachment(detailMirror.xmlAttachment!)}
                            className="px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 inline-flex items-center gap-1 transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            Baixar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDetailAttachment('xmlAttachment')}
                            className="px-2.5 py-1.5 rounded-md border border-red-300/90 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0 bg-gray-50 dark:bg-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      if (!detailMirror) return;
                      const detailApprovalStatus = resolveEspelhoApprovalStatus(
                        detailMirror.id,
                        detailMirror.approvalStatus
                      );
                      if (detailApprovalStatus !== 'APPROVED') {
                        toast.error('O PDF só pode ser baixado quando o espelho estiver aprovado.');
                        return;
                      }
                      const msg = getEspelhoMoneyTripletMessage(detailMirror);
                      if (msg) {
                        toast.error(msg);
                        return;
                      }
                      exportEspelhoNfPdf(
                        espelhoMirrorForExport(detailMirror, costCentersForEspelho),
                        serviceProviders,
                        serviceTakers,
                        bankAccounts,
                        taxCodes,
                        federalTaxRates
                      );
                      toast.success('Arquivo PDF gerado.');
                    }}
                    disabled={
                      !detailMirror ||
                      resolveEspelhoApprovalStatus(detailMirror.id, detailMirror.approvalStatus) !==
                        'APPROVED'
                    }
                    className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 inline-flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Exportar PDF
                  </button>
                </div>
              </div>
            </AppModalOverlay>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
