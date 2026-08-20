import {
  getGastosOperacionaisDfcAllowedKeys,
  normalizeGastosOperacionaisNaturezaKey,
  resolveGastosOperacionaisDfcEntry,
  gastosNaturezaTotalContribution,
  isGastosOperacionaisPositiveCreditNatureza
} from './gastosOperacionaisDfcBlocks';
import { isCustomGastosOperacionaisAllowedNatureza, isUnlinkedConfiguredNatureza } from './gastosOperacionaisNaturezasStore';

export {
  normalizeGastosOperacionaisNaturezaKey,
  resolveGastosOperacionaisDfcEntry,
  gastosNaturezaTotalContribution,
  isGastosOperacionaisPositiveCreditNatureza
};
export {
  GASTOS_OPERACIONAIS_DFC_LEAF_BLOCKS,
  GASTOS_OPERACIONAIS_DFC_TRIBUTO_RETIDO_BLOCK,
  GASTOS_OPERACIONAIS_DFC_TRIBUTO_PAGO_BLOCK,
  GASTOS_OPERACIONAIS_DFC_REPASSES_TERCEIROS_BLOCK,
  GASTOS_OPERACIONAIS_DFC_PESSOAL_BLOCK,
  GASTOS_OPERACIONAIS_DFC_MATERIAL_APLICADO_BLOCK,
  GASTOS_OPERACIONAIS_DFC_SERVICOS_TERCEIRIZADOS_BLOCK,
  GASTOS_OPERACIONAIS_DFC_CANTEIRO_OBRA_BLOCK,
  GASTOS_OPERACIONAIS_DFC_VEICULOS_LOGISTICA_BLOCK,
  GASTOS_OPERACIONAIS_DFC_TAXAS_TARIFAS_BLOCK,
  GASTOS_OPERACIONAIS_DFC_DESPESAS_SERVICOS_TERCEIRIZADOS_BLOCK,
  GASTOS_OPERACIONAIS_DFC_INFORMATICA_SOFTWARE_BLOCK,
  GASTOS_OPERACIONAIS_DFC_COMERCIAL_MARKETING_BLOCK,
  GASTOS_OPERACIONAIS_DFC_ESCRITORIOS_ADMINISTRATIVO_BLOCK,
  GASTOS_OPERACIONAIS_DFC_DIRETORIA_BLOCK,
  GASTOS_OPERACIONAIS_DFC_REPASSE_ADM_BLOCK,
  GASTOS_OPERACIONAIS_DFC_INVESTIMENTOS_IMOVEIS_INSTALACOES_BLOCK,
  GASTOS_OPERACIONAIS_DFC_INVESTIMENTOS_VEICULOS_BLOCK,
  GASTOS_OPERACIONAIS_DFC_INVESTIMENTOS_MAQUINAS_TI_BLOCK
} from './gastosOperacionaisDfcBlocks';

/** Naturezas fora dos blocos DFC já mapeados (demais custos operacionais). */
const GASTOS_OPERACIONAIS_LEGACY_ALLOWED_NATUREZAS = [] as const;

const GASTOS_OPERACIONAIS_LEGACY_ALIASES = [] as const;

const GASTOS_OPERACIONAIS_LEGACY_ALLOWED_KEYS = new Set(
  [...GASTOS_OPERACIONAIS_LEGACY_ALLOWED_NATUREZAS, ...GASTOS_OPERACIONAIS_LEGACY_ALIASES].map(
    (natureza) => normalizeGastosOperacionaisNaturezaKey(natureza)
  )
);

const GASTOS_OPERACIONAIS_DFC_ALLOWED_KEYS = getGastosOperacionaisDfcAllowedKeys();

export function isGastosOperacionaisAllowedNatureza(natureza: string): boolean {
  const key = normalizeGastosOperacionaisNaturezaKey(natureza);
  if (!key || key === '—' || key === '-') return false;
  if (isUnlinkedConfiguredNatureza(natureza)) return false;
  return (
    GASTOS_OPERACIONAIS_DFC_ALLOWED_KEYS.has(key) ||
    GASTOS_OPERACIONAIS_LEGACY_ALLOWED_KEYS.has(key) ||
    isCustomGastosOperacionaisAllowedNatureza(natureza)
  );
}
