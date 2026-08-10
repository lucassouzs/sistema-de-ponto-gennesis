/** Contratos visíveis no módulo de sócios (allowlist fixa). */
export const CONTRATOS_SOCIOS_ALLOWED = [
  'MAPA - UMIPI DE JEQUIE',
  'CONFEA - 508 NORTE',
  'CONFEA - 516 NORTE'
] as const;

export type ContratoSocioName = (typeof CONTRATOS_SOCIOS_ALLOWED)[number];
