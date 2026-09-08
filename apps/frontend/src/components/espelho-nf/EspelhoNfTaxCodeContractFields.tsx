'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

const ISS_COLLECTION_TYPE_OPTIONS = labeledToSelectOptions([
  { value: 'RETIDO', label: 'Retido' },
  { value: 'RECOLHIDO', label: 'Recolhido' },
]);

export type FederalTaxRates = {
  cofins: string;
  csll: string;
  inss: string;
  irpj: string;
  pis: string;
};

export type FederalTaxContextKey =
  | 'gdfObra'
  | 'gdfManutencaoReforma'
  | 'gdfMaoObraSemMaterial'
  | 'foraGdfObra'
  | 'foraGdfManutencaoReforma'
  | 'foraGdfMaoObraSemMaterial';

export type FederalTaxRatesByContext = Record<FederalTaxContextKey, FederalTaxRates>;
export type FederalTaxContextEnabled = Record<FederalTaxContextKey, boolean>;

export type TaxRule = { collectionType: 'RETIDO' | 'RECOLHIDO' };

export type TaxCodeFormState = Omit<
  {
    cityName: string;
    abatesMaterial: boolean;
    hasComplementaryWarranty: boolean;
    garantiaRetidaNaNota: boolean | null;
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
  },
  'abatesMaterial' | 'hasComplementaryWarranty' | 'garantiaRetidaNaNota'
> & {
  abatesMaterial: boolean | null;
  hasComplementaryWarranty: boolean | null;
  garantiaRetidaNaNota: boolean | null;
};

const INITIAL_TAX_RULE: TaxRule = { collectionType: 'RETIDO' };

export const INITIAL_FEDERAL_TAX_RATES: FederalTaxRates = {
  cofins: '',
  csll: '',
  inss: '',
  irpj: '',
  pis: ''
};

export const INITIAL_FEDERAL_TAX_RATES_BY_CONTEXT: FederalTaxRatesByContext = {
  gdfObra: { ...INITIAL_FEDERAL_TAX_RATES },
  gdfManutencaoReforma: { ...INITIAL_FEDERAL_TAX_RATES },
  gdfMaoObraSemMaterial: { ...INITIAL_FEDERAL_TAX_RATES },
  foraGdfObra: { ...INITIAL_FEDERAL_TAX_RATES },
  foraGdfManutencaoReforma: { ...INITIAL_FEDERAL_TAX_RATES },
  foraGdfMaoObraSemMaterial: { ...INITIAL_FEDERAL_TAX_RATES }
};

export const INITIAL_FEDERAL_TAX_CONTEXT_ENABLED: FederalTaxContextEnabled = {
  gdfObra: false,
  gdfManutencaoReforma: false,
  gdfMaoObraSemMaterial: false,
  foraGdfObra: false,
  foraGdfManutencaoReforma: false,
  foraGdfMaoObraSemMaterial: false
};

const ALL_FEDERAL_CONTEXT_KEYS: FederalTaxContextKey[] = [
  'gdfObra',
  'gdfManutencaoReforma',
  'gdfMaoObraSemMaterial',
  'foraGdfObra',
  'foraGdfManutencaoReforma',
  'foraGdfMaoObraSemMaterial'
];

/** Padrão da tela de cadastro de códigos tributários (primeiro contexto ativo). */
export const DEFAULT_CADASTRO_FEDERAL_TAX_CONTEXT_ENABLED: FederalTaxContextEnabled = {
  gdfObra: true,
  gdfManutencaoReforma: false,
  gdfMaoObraSemMaterial: false,
  foraGdfObra: false,
  foraGdfManutencaoReforma: false,
  foraGdfMaoObraSemMaterial: false
};

function normalizeOneFederalRates(raw: unknown): FederalTaxRates {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const s = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  return {
    cofins: s(o.cofins),
    csll: s(o.csll),
    inss: s(o.inss),
    irpj: s(o.irpj),
    pis: s(o.pis)
  };
}

/** Reidrata matriz federal a partir do JSON do backend (cadastro / bootstrap). */
export function mergeFederalTaxStateFromApi(
  ratesPartial: unknown,
  enabledPartial: unknown
): { federalRatesByContext: FederalTaxRatesByContext; federalTaxContextEnabled: FederalTaxContextEnabled } {
  const parseJsonObject = (raw: unknown): Record<string, unknown> | null => {
    if (raw == null) return null;
    if (typeof raw === 'string') {
      try {
        const p = JSON.parse(raw) as unknown;
        return p && typeof p === 'object' ? (p as Record<string, unknown>) : null;
      } catch {
        return null;
      }
    }
    if (typeof raw === 'object') return raw as Record<string, unknown>;
    return null;
  };

  const federalRatesByContext: FederalTaxRatesByContext = {
    gdfObra: { ...INITIAL_FEDERAL_TAX_RATES },
    gdfManutencaoReforma: { ...INITIAL_FEDERAL_TAX_RATES },
    gdfMaoObraSemMaterial: { ...INITIAL_FEDERAL_TAX_RATES },
    foraGdfObra: { ...INITIAL_FEDERAL_TAX_RATES },
    foraGdfManutencaoReforma: { ...INITIAL_FEDERAL_TAX_RATES },
    foraGdfMaoObraSemMaterial: { ...INITIAL_FEDERAL_TAX_RATES }
  };
  const rp = parseJsonObject(ratesPartial) as Partial<Record<FederalTaxContextKey, unknown>> | null;
  for (const k of ALL_FEDERAL_CONTEXT_KEYS) {
    const chunk = rp?.[k];
    if (chunk !== undefined && chunk !== null) {
      federalRatesByContext[k] = { ...INITIAL_FEDERAL_TAX_RATES, ...normalizeOneFederalRates(chunk) };
    }
  }

  const federalTaxContextEnabled: FederalTaxContextEnabled = { ...INITIAL_FEDERAL_TAX_CONTEXT_ENABLED };
  const ep = parseJsonObject(enabledPartial) as Partial<FederalTaxContextEnabled> | null;
  for (const k of ALL_FEDERAL_CONTEXT_KEYS) {
    if (ep && typeof ep[k] === 'boolean') {
      federalTaxContextEnabled[k] = ep[k] as boolean;
    }
  }

  const anyOn = ALL_FEDERAL_CONTEXT_KEYS.some((k) => federalTaxContextEnabled[k]);
  if (!anyOn) {
    return {
      federalRatesByContext,
      federalTaxContextEnabled: { ...DEFAULT_CADASTRO_FEDERAL_TAX_CONTEXT_ENABLED }
    };
  }
  return { federalRatesByContext, federalTaxContextEnabled };
}

export const FEDERAL_TAX_LAYOUT: Array<{
  title: string;
  contexts: Array<{ key: FederalTaxContextKey; label: string }>;
}> = [
  {
    title: 'Cliente do GDF ou possui convêncio com GDF',
    contexts: [
      { key: 'gdfObra', label: 'Obra' },
      { key: 'gdfManutencaoReforma', label: 'Manutenção ou reforma' },
      { key: 'gdfMaoObraSemMaterial', label: 'Fornecimento de mão de obra. Sem material.' }
    ]
  },
  {
    title: 'Cliente fora da esfera GDF',
    contexts: [
      { key: 'foraGdfObra', label: 'Obra' },
      { key: 'foraGdfManutencaoReforma', label: 'Manutenção ou reforma' },
      { key: 'foraGdfMaoObraSemMaterial', label: 'Fornecimento de mão de obra. Sem material.' }
    ]
  }
];

const FEDERAL_SPHERE_GDF_KEYS: FederalTaxContextKey[] = [
  'gdfObra',
  'gdfManutencaoReforma',
  'gdfMaoObraSemMaterial'
];
const FEDERAL_SPHERE_FORA_KEYS: FederalTaxContextKey[] = [
  'foraGdfObra',
  'foraGdfManutencaoReforma',
  'foraGdfMaoObraSemMaterial'
];

/** Texto compacto nos botões de tipo de contrato (título completo em `title`). */
const FEDERAL_CONTEXT_BUTTON_LABEL: Record<FederalTaxContextKey, string> = {
  gdfObra: 'Obra',
  gdfManutencaoReforma: 'Manutenção ou reforma',
  gdfMaoObraSemMaterial: 'Mão de obra',
  foraGdfObra: 'Obra',
  foraGdfManutencaoReforma: 'Manutenção ou reforma',
  foraGdfMaoObraSemMaterial: 'Mão de obra'
};

/** Une os percentuais já digitados nos 3 contextos do perfil (prioriza o tipo clicado). */
function mergeFederalRatesForSphere(
  prev: FederalTaxRatesByContext,
  keys: FederalTaxContextKey[],
  preferKey: FederalTaxContextKey
): FederalTaxRates {
  const order: FederalTaxContextKey[] = [preferKey, ...keys.filter((x) => x !== preferKey)];
  const taxNames: (keyof FederalTaxRates)[] = ['cofins', 'csll', 'inss', 'irpj', 'pis'];
  const next: FederalTaxRates = { ...INITIAL_FEDERAL_TAX_RATES };
  for (const t of taxNames) {
    for (const k of order) {
      const raw = String(prev[k][t] ?? '').trim();
      if (raw !== '') {
        next[t] = raw;
        break;
      }
    }
  }
  return next;
}

export type FederalTaxSphereTab = 'gdf' | 'foraGdf';

export function emptyTaxCodeFormState(): TaxCodeFormState {
  return {
    cityName: '',
    abatesMaterial: null,
    hasComplementaryWarranty: null,
    garantiaRetidaNaNota: null,
    garantiaAliquota: '',
    issRate: '',
    cofins: { ...INITIAL_TAX_RULE },
    csll: { ...INITIAL_TAX_RULE },
    inss: { ...INITIAL_TAX_RULE },
    irpj: { ...INITIAL_TAX_RULE },
    pis: { ...INITIAL_TAX_RULE },
    iss: { ...INITIAL_TAX_RULE },
    inssMaterialLimit: '',
    issMaterialLimit: ''
  };
}

function formatEspelhoPercentNormalized(n: number): string {
  const c = Math.max(0, Math.min(100, n));
  const rounded = Math.round(c * 1e12) / 1e12;
  const s = rounded.toFixed(12).replace(/\.?0+$/, '');
  return s.includes('.') ? s.replace('.', ',') : s;
}

export function sanitizeEspelhoPercentTyping(raw: string): string {
  let s = String(raw ?? '')
    .replace(/%/g, '')
    .replace(/[^\d,.]/g, '')
    .replace(/\./g, ',');
  if (!s) return '';
  const firstComma = s.indexOf(',');
  if (firstComma !== -1) {
    s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, '');
  }
  const parts = s.split(',');
  const intPart = (parts[0] ?? '').replace(/\D/g, '').slice(0, 6);
  const decPartRaw = parts[1] ?? '';
  const decPart = decPartRaw.replace(/\D/g, '').slice(0, 8);

  const hasComma = s.includes(',');
  if (hasComma && parts.length >= 2 && parts[1] === '' && decPart === '') {
    if (intPart === '') return '';
    return `${intPart},`;
  }
  if (hasComma) {
    const left = intPart === '' ? '0' : intPart;
    return `${left},${decPart}`;
  }
  return intPart;
}

export function normalizeEspelhoPercentBlur(raw: string): string {
  const s = sanitizeEspelhoPercentTyping(raw);
  if (!s || s === ',') return '';
  let numStr = s;
  if (numStr.endsWith(',')) numStr = numStr.slice(0, -1);
  else numStr = numStr.replace(',', '.');
  const n = Number(numStr);
  if (!Number.isFinite(n)) return '';
  return formatEspelhoPercentNormalized(n);
}

/** Corpo JSON para POST/PATCH `/espelho-nf/tax-codes` — inclui alíquotas federais persistidas no cadastro. */
export function buildEspelhoNfTaxCodeApiPayload(
  taxCodeForm: TaxCodeFormState,
  federalRatesByContext: FederalTaxRatesByContext,
  federalTaxContextEnabled: FederalTaxContextEnabled
): {
  cityName: string;
  abatesMaterial: boolean;
  hasComplementaryWarranty: boolean;
  garantiaRetidaNaNota: boolean | null;
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
  federalRatesByContext: FederalTaxRatesByContext;
  federalTaxContextEnabled: FederalTaxContextEnabled;
} {
  const normalizedIssRate = normalizeEspelhoPercentBlur(taxCodeForm.issRate.trim());
  const normalizedGarantiaAliquota =
    taxCodeForm.hasComplementaryWarranty === true
      ? normalizeEspelhoPercentBlur(taxCodeForm.garantiaAliquota.trim())
      : '';
  const normalizedInssLimit =
    taxCodeForm.abatesMaterial === true
      ? normalizeEspelhoPercentBlur(taxCodeForm.inssMaterialLimit.trim())
      : '0';
  const normalizedIssLimit =
    taxCodeForm.abatesMaterial === true
      ? normalizeEspelhoPercentBlur(taxCodeForm.issMaterialLimit.trim())
      : '0';
  return {
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
    federalRatesByContext,
    federalTaxContextEnabled
  };
}

/** Garante POST/PATCH com JSON federal completo (`undefined` some do JSON no axios). */
export function wireTaxCodeSavePayload(
  taxCodeForm: TaxCodeFormState,
  federalRatesByContext: FederalTaxRatesByContext | null | undefined,
  federalTaxContextEnabled: FederalTaxContextEnabled | null | undefined
): ReturnType<typeof buildEspelhoNfTaxCodeApiPayload> {
  const rates = JSON.parse(
    JSON.stringify(federalRatesByContext ?? INITIAL_FEDERAL_TAX_RATES_BY_CONTEXT)
  ) as FederalTaxRatesByContext;
  const enabled = JSON.parse(
    JSON.stringify(federalTaxContextEnabled ?? DEFAULT_CADASTRO_FEDERAL_TAX_CONTEXT_ENABLED)
  ) as FederalTaxContextEnabled;
  return buildEspelhoNfTaxCodeApiPayload(taxCodeForm, rates, enabled);
}

export function validateTaxCodeContractForm(taxCodeForm: TaxCodeFormState): string | null {
  if (!taxCodeForm.cityName.trim()) return 'Informe o nome do contrato.';
  if (!taxCodeForm.issRate.trim()) return 'Informe a alíquota de ISS.';
  if (taxCodeForm.abatesMaterial === null) return 'Indique se deduz material (obrigatório).';
  if (taxCodeForm.hasComplementaryWarranty === null) {
    return 'Indique se possui garantia complementar (obrigatório).';
  }
  if (
    taxCodeForm.hasComplementaryWarranty === true &&
    normalizeEspelhoPercentBlur(taxCodeForm.garantiaAliquota.trim()) === ''
  ) {
    return 'Informe a alíquota da garantia (obrigatório quando há garantia complementar).';
  }
  if (taxCodeForm.hasComplementaryWarranty === true && taxCodeForm.garantiaRetidaNaNota === null) {
    return 'Informe se a garantia complementar é retida na nota.';
  }
  if (
    taxCodeForm.abatesMaterial === true &&
    (!taxCodeForm.inssMaterialLimit.trim() || !taxCodeForm.issMaterialLimit.trim())
  ) {
    return 'Informe os limites de material INSS e ISS quando deduz material.';
  }
  return null;
}

export function canSaveTaxCodeContractForm(taxCodeForm: TaxCodeFormState): boolean {
  return validateTaxCodeContractForm(taxCodeForm) === null;
}

type Props = {
  taxCodeForm: TaxCodeFormState;
  setTaxCodeForm: React.Dispatch<React.SetStateAction<TaxCodeFormState>>;
  federalRatesByContext: FederalTaxRatesByContext;
  setFederalRatesByContext: React.Dispatch<React.SetStateAction<FederalTaxRatesByContext>>;
  federalTaxContextEnabled: FederalTaxContextEnabled;
  setFederalTaxContextEnabled: React.Dispatch<React.SetStateAction<FederalTaxContextEnabled>>;
  /** Mesma UI da aba do espelho (azul) ou tons do cadastro (vermelho). */
  variant?: 'espelho' | 'cadastro';
};

export function EspelhoNfTaxCodeContractFields({
  taxCodeForm,
  setTaxCodeForm,
  federalRatesByContext,
  setFederalRatesByContext,
  federalTaxContextEnabled,
  setFederalTaxContextEnabled,
  variant = 'espelho'
}: Props) {
  const focusRing = variant === 'cadastro' ? 'focus:ring-red-500' : 'focus:ring-blue-500';

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
        ? federalRatesByContext[selectedFederalTaxContextKey]
        : INITIAL_FEDERAL_TAX_RATES,
    [federalRatesByContext, selectedFederalTaxContextKey]
  );

  const [activeFederalSphere, setActiveFederalSphere] = useState<FederalTaxSphereTab>('gdf');

  useEffect(() => {
    if (!selectedFederalTaxContextKey) return;
    if (FEDERAL_SPHERE_GDF_KEYS.includes(selectedFederalTaxContextKey)) {
      setActiveFederalSphere('gdf');
    } else if (FEDERAL_SPHERE_FORA_KEYS.includes(selectedFederalTaxContextKey)) {
      setActiveFederalSphere('foraGdf');
    }
  }, [selectedFederalTaxContextKey]);

  const handleFederalSphereTab = (sphere: FederalTaxSphereTab) => {
    setActiveFederalSphere(sphere);
    const allowed = sphere === 'gdf' ? FEDERAL_SPHERE_GDF_KEYS : FEDERAL_SPHERE_FORA_KEYS;
    if (selectedFederalTaxContextKey && !allowed.includes(selectedFederalTaxContextKey)) {
      const next: FederalTaxContextEnabled = {
        gdfObra: false,
        gdfManutencaoReforma: false,
        gdfMaoObraSemMaterial: false,
        foraGdfObra: false,
        foraGdfManutencaoReforma: false,
        foraGdfMaoObraSemMaterial: false
      };
      next[allowed[0]] = true;
      setFederalTaxContextEnabled(next);
    }
  };

  const activeFederalLayoutGroup =
    activeFederalSphere === 'gdf' ? FEDERAL_TAX_LAYOUT[0] : FEDERAL_TAX_LAYOUT[1];

  const sphereKeys = useMemo(
    () =>
      activeFederalSphere === 'gdf' ? [...FEDERAL_SPHERE_GDF_KEYS] : [...FEDERAL_SPHERE_FORA_KEYS],
    [activeFederalSphere]
  );

  const selectedInSphere = useMemo(() => {
    if (
      selectedFederalTaxContextKey &&
      sphereKeys.includes(selectedFederalTaxContextKey)
    ) {
      return selectedFederalTaxContextKey;
    }
    return null;
  }, [selectedFederalTaxContextKey, sphereKeys]);

  const displayFederalRates = useMemo(() => {
    const refKey = selectedInSphere ?? sphereKeys[0];
    return federalRatesByContext[refKey];
  }, [federalRatesByContext, selectedInSphere, sphereKeys]);

  const patchAllKeysInSphere = (
    keys: FederalTaxContextKey[],
    selectedKey: FederalTaxContextKey | null,
    mut: (rates: FederalTaxRates) => FederalTaxRates
  ) => {
    setFederalRatesByContext((prev) => {
      const refKey = selectedKey && keys.includes(selectedKey) ? selectedKey : keys[0];
      const nextRow = mut({ ...prev[refKey] });
      const out = { ...prev };
      for (const k of keys) {
        out[k] = { ...nextRow };
      }
      return out;
    });
  };

  const handleSphereFederalRateChange = (taxName: keyof FederalTaxRates, value: string) => {
    patchAllKeysInSphere(sphereKeys, selectedFederalTaxContextKey, (r) => ({
      ...r,
      [taxName]: sanitizeEspelhoPercentTyping(value)
    }));
  };

  const handleSphereFederalRateBlur = (taxName: keyof FederalTaxRates, value: string) => {
    patchAllKeysInSphere(sphereKeys, selectedFederalTaxContextKey, (r) => ({
      ...r,
      [taxName]: normalizeEspelhoPercentBlur(value)
    }));
  };

  const selectFederalContractLine = (contextKey: FederalTaxContextKey) => {
    const keys = FEDERAL_SPHERE_GDF_KEYS.includes(contextKey)
      ? [...FEDERAL_SPHERE_GDF_KEYS]
      : [...FEDERAL_SPHERE_FORA_KEYS];

    setFederalRatesByContext((prev) => {
      const merged = mergeFederalRatesForSphere(prev, keys, contextKey);
      const out = { ...prev };
      for (const k of keys) {
        out[k] = { ...merged };
      }
      return out;
    });

    setFederalTaxContextEnabled({
      gdfObra: false,
      gdfManutencaoReforma: false,
      gdfMaoObraSemMaterial: false,
      foraGdfObra: false,
      foraGdfManutencaoReforma: false,
      foraGdfMaoObraSemMaterial: false,
      [contextKey]: true
    });
  };

  const labelClass = 'mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300';
  const inputClass = `w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 ${focusRing} dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100`;
  const segmentBase =
    'rounded-lg border px-3 py-2 text-center text-sm font-medium transition-colors focus:outline-none focus:ring-0 focus-visible:ring-0';
  const segmentInactive =
    'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700/80';
  const segmentActive =
    variant === 'cadastro'
      ? 'border-red-600 bg-red-600 text-white shadow-sm dark:border-red-600 dark:bg-red-600 dark:text-white'
      : 'border-blue-600 bg-blue-600 text-white shadow-sm dark:border-blue-600 dark:bg-blue-600 dark:text-white';
  const segmentCompact =
    'min-w-[5.25rem] rounded-lg border px-3 py-1.5 text-center text-sm font-medium transition-colors focus:outline-none focus:ring-0 focus-visible:ring-0';

  const handleTaxRuleFieldChange = (
    taxName: 'cofins' | 'csll' | 'inss' | 'irpj' | 'pis' | 'iss',
    value: 'RETIDO' | 'RECOLHIDO'
  ) => {
    setTaxCodeForm((prev) => ({
      ...prev,
      [taxName]: { ...prev[taxName], collectionType: value }
    }));
  };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="espelho-nf-tax-contract-name" className={labelClass}>
          Nome do contrato <span className="text-red-600 dark:text-red-400">*</span>
        </label>
        <input
          id="espelho-nf-tax-contract-name"
          type="text"
          value={taxCodeForm.cityName}
          onChange={(e) => setTaxCodeForm((prev) => ({ ...prev, cityName: e.target.value }))}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Perfil do cliente</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => handleFederalSphereTab('gdf')}
            title={FEDERAL_TAX_LAYOUT[0].title}
            className={`${segmentBase} ${
              activeFederalSphere === 'gdf' ? segmentActive : segmentInactive
            }`}
          >
            Cliente do GDF ou possui convêncio com GDF
          </button>
          <button
            type="button"
            onClick={() => handleFederalSphereTab('foraGdf')}
            title={FEDERAL_TAX_LAYOUT[1].title}
            className={`${segmentBase} ${
              activeFederalSphere === 'foraGdf' ? segmentActive : segmentInactive
            }`}
          >
            Cliente fora da esfera GDF
          </button>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
        <label className={labelClass}>Tipo de contrato</label>
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-3"
          role="group"
          aria-label="Tipo de contrato no perfil selecionado"
        >
          {activeFederalLayoutGroup.contexts.map((ctx) => (
            <button
              key={ctx.key}
              type="button"
              title={ctx.label}
              onClick={() => selectFederalContractLine(ctx.key)}
              className={`${segmentBase} ${
                selectedInSphere === ctx.key ? segmentActive : segmentInactive
              }`}
            >
              {FEDERAL_CONTEXT_BUTTON_LABEL[ctx.key]}
            </button>
          ))}
        </div>

        <div className="mt-4">
          <label className={labelClass}>Alíquotas federais</label>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                ['cofins', 'COFINS'],
                ['csll', 'CSLL'],
                ['inss', 'INSS'],
                ['irpj', 'IRPJ'],
                ['pis', 'PIS']
              ] as const
            ).map(([taxKey, label]) => (
              <div key={taxKey}>
                <label className="mb-2 block text-xs text-gray-500 dark:text-gray-400">{label}</label>
                <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0"
                    aria-label={`${label} (percentual)`}
                    value={displayFederalRates[taxKey]}
                    onChange={(e) => handleSphereFederalRateChange(taxKey, e.target.value)}
                    onBlur={(e) => handleSphereFederalRateBlur(taxKey, e.target.value)}
                    className={`min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-right text-gray-900 focus:outline-none focus:ring-0 dark:text-gray-100`}
                  />
                  <span className="shrink-0 pr-3 text-sm text-gray-500 dark:text-gray-400">%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8 lg:items-start">
          <div className="min-w-0 space-y-4 lg:pr-2">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <label className="mb-0 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Deduz material? <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="flex shrink-0 gap-1.5" role="group" aria-label="Deduz material">
                <button
                  type="button"
                  onClick={() =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      abatesMaterial: true,
                      inssMaterialLimit: prev.inssMaterialLimit === '0' ? '' : prev.inssMaterialLimit,
                      issMaterialLimit: prev.issMaterialLimit === '0' ? '' : prev.issMaterialLimit
                    }))
                  }
                  className={`${segmentCompact} ${
                    taxCodeForm.abatesMaterial === true ? segmentActive : segmentInactive
                  }`}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      abatesMaterial: false,
                      inssMaterialLimit: '0',
                      issMaterialLimit: '0'
                    }))
                  }
                  className={`${segmentCompact} ${
                    taxCodeForm.abatesMaterial === false ? segmentActive : segmentInactive
                  }`}
                >
                  Não
                </button>
              </div>
            </div>

            {taxCodeForm.abatesMaterial === true && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>
                Limite material INSS <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                <input
                  type="text"
                  inputMode="decimal"
                  value={taxCodeForm.inssMaterialLimit}
                  onChange={(e) =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      inssMaterialLimit: sanitizeEspelhoPercentTyping(e.target.value)
                    }))
                  }
                  onBlur={(e) =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      inssMaterialLimit: normalizeEspelhoPercentBlur(e.target.value)
                    }))
                  }
                  className={`min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-gray-900 focus:outline-none focus:ring-0 dark:text-gray-100`}
                />
                <span className="shrink-0 pr-3 text-sm text-gray-500 dark:text-gray-400">%</span>
              </div>
            </div>
            <div>
              <label className={labelClass}>
                Limite material ISS <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                <input
                  type="text"
                  inputMode="decimal"
                  value={taxCodeForm.issMaterialLimit}
                  onChange={(e) =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      issMaterialLimit: sanitizeEspelhoPercentTyping(e.target.value)
                    }))
                  }
                  onBlur={(e) =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      issMaterialLimit: normalizeEspelhoPercentBlur(e.target.value)
                    }))
                  }
                  className={`min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-gray-900 focus:outline-none focus:ring-0 dark:text-gray-100`}
                />
                <span className="shrink-0 pr-3 text-sm text-gray-500 dark:text-gray-400">%</span>
              </div>
            </div>
          </div>
        )}
          </div>

          <div className="min-w-0 space-y-4 lg:border-l lg:border-gray-200 lg:pl-6 dark:lg:border-gray-700">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <label className="mb-0 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Possui garantia complementar? <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="flex shrink-0 gap-1.5" role="group" aria-label="Garantia complementar">
                <button
                  type="button"
                  onClick={() =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      hasComplementaryWarranty: true,
                      garantiaRetidaNaNota: null
                    }))
                  }
                  className={`${segmentCompact} ${
                    taxCodeForm.hasComplementaryWarranty === true ? segmentActive : segmentInactive
                  }`}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      hasComplementaryWarranty: false,
                      garantiaRetidaNaNota: null,
                      garantiaAliquota: ''
                    }))
                  }
                  className={`${segmentCompact} ${
                    taxCodeForm.hasComplementaryWarranty === false ? segmentActive : segmentInactive
                  }`}
                >
                  Não
                </button>
              </div>
            </div>

        {taxCodeForm.hasComplementaryWarranty === true && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>
                Alíquota da garantia <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="flex w-full items-center overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                <input
                  type="text"
                  inputMode="decimal"
                  value={taxCodeForm.garantiaAliquota}
                  onChange={(e) =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      garantiaAliquota: sanitizeEspelhoPercentTyping(e.target.value)
                    }))
                  }
                  onBlur={(e) =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      garantiaAliquota: normalizeEspelhoPercentBlur(e.target.value)
                    }))
                  }
                  className={`min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-gray-900 focus:outline-none focus:ring-0 dark:text-gray-100`}
                />
                <span className="shrink-0 pr-3 text-sm text-gray-500 dark:text-gray-400">%</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <label className="mb-0 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Garantia retida na nota? <span className="text-red-600 dark:text-red-400">*</span>
              </label>
              <div className="flex shrink-0 gap-1.5" role="group" aria-label="Garantia retida na nota">
                <button
                  type="button"
                  onClick={() =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      garantiaRetidaNaNota: true
                    }))
                  }
                  className={`${segmentCompact} ${
                    taxCodeForm.garantiaRetidaNaNota === true ? segmentActive : segmentInactive
                  }`}
                >
                  Sim
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTaxCodeForm((prev) => ({
                      ...prev,
                      garantiaRetidaNaNota: false
                    }))
                  }
                  className={`${segmentCompact} ${
                    taxCodeForm.garantiaRetidaNaNota === false ? segmentActive : segmentInactive
                  }`}
                >
                  Não
                </button>
              </div>
            </div>
          </div>
        )}
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
        <label className={labelClass}>Impostos (tipo por contrato)</label>
        <div className="mt-2 space-y-4">
          {(
            [
              ['iss', 'ISS'],
              ['cofins', 'COFINS'],
              ['csll', 'CSLL'],
              ['inss', 'INSS'],
              ['irpj', 'IRPJ'],
              ['pis', 'PIS']
            ] as const
          ).map(([taxKey, label]) => (
            <div key={taxKey} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs text-gray-500 dark:text-gray-400">
                  {label} — alíquota
                </label>
                {taxKey === 'iss' ? (
                  <div className="flex items-center overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={taxCodeForm.issRate}
                      onChange={(e) =>
                        setTaxCodeForm((prev) => ({
                          ...prev,
                          issRate: sanitizeEspelhoPercentTyping(e.target.value)
                        }))
                      }
                      onBlur={(e) =>
                        setTaxCodeForm((prev) => ({
                          ...prev,
                          issRate: normalizeEspelhoPercentBlur(e.target.value)
                        }))
                      }
                      className={`min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-gray-900 focus:outline-none focus:ring-0 dark:text-gray-100`}
                    />
                    <span className="shrink-0 pr-3 text-sm text-gray-500 dark:text-gray-400">%</span>
                  </div>
                ) : (
                  <input
                    type="text"
                    value={
                      federalTaxRates[taxKey as Exclude<keyof FederalTaxRates, 'iss'>]
                        ? `${federalTaxRates[taxKey as Exclude<keyof FederalTaxRates, 'iss'>]}%`
                        : ''
                    }
                    readOnly
                    className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-600 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-300"
                  />
                )}
              </div>
              <div>
                <label className="mb-2 block text-xs text-gray-500 dark:text-gray-400">
                  {label} — tipo
                </label>
                {taxKey === 'iss' ? (
                  <StringSingleSelectDropdown
                    value={taxCodeForm.iss.collectionType}
                    onChange={(value) =>
                      handleTaxRuleFieldChange('iss', value as 'RETIDO' | 'RECOLHIDO')
                    }
                    options={ISS_COLLECTION_TYPE_OPTIONS}
                    allowEmpty={false}
                    className={inputClass}
                  />
                ) : (
                  <input
                    type="text"
                    value="Retido"
                    readOnly
                    className="w-full cursor-not-allowed rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-gray-600 dark:border-gray-600 dark:bg-gray-700/50 dark:text-gray-300"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
