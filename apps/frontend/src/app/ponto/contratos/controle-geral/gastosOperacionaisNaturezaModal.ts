import { isGastosOperacionaisAllowedNatureza } from './gastosOperacionaisAllowedNaturezas';

/** Exibe somente naturezas da whitelist de Gastos Operacionais. */
export function shouldShowInGastosNaturezaModal(natureza: string): boolean {
  return isGastosOperacionaisAllowedNatureza(natureza);
}
