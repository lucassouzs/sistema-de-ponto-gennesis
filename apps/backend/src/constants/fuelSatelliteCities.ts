export const FUEL_ABASTECIMENTO_STATE_CODES = ['DF', 'GO'] as const;
export type FuelAbastecimentoStateCode = (typeof FUEL_ABASTECIMENTO_STATE_CODES)[number];

export type FuelSatelliteCity = {
  /** Chave interna estável — não alterar após uso em produção */
  code: string;
  stateCode: FuelAbastecimentoStateCode;
  name: string;
};

/**
 * Regiões administrativas do DF (33 RAs) + cidades de GO para abastecimento.
 * Para incluir uma nova cidade, adicione um item nesta lista e faça deploy.
 */
export const FUEL_SATELLITE_CITIES: FuelSatelliteCity[] = [
  // DF — 33 regiões administrativas (ordem alfabética)
  { code: 'DF_AGUAS_CLARAS', stateCode: 'DF', name: 'Águas Claras' },
  { code: 'DF_ARNIQUEIRA', stateCode: 'DF', name: 'Arniqueira' },
  { code: 'DF_BRAZLANDIA', stateCode: 'DF', name: 'Brazlândia' },
  { code: 'DF_CANDANGOLANDIA', stateCode: 'DF', name: 'Candangolândia' },
  { code: 'DF_CEILANDIA', stateCode: 'DF', name: 'Ceilândia' },
  { code: 'DF_CRUZEIRO', stateCode: 'DF', name: 'Cruzeiro' },
  { code: 'DF_FERCAL', stateCode: 'DF', name: 'Fercal' },
  { code: 'DF_GAMA', stateCode: 'DF', name: 'Gama' },
  { code: 'DF_GUARA', stateCode: 'DF', name: 'Guará' },
  { code: 'DF_ITAPOA', stateCode: 'DF', name: 'Itapoã' },
  { code: 'DF_JARDIM_BOTANICO', stateCode: 'DF', name: 'Jardim Botânico' },
  { code: 'DF_LAGO_NORTE', stateCode: 'DF', name: 'Lago Norte' },
  { code: 'DF_LAGO_SUL', stateCode: 'DF', name: 'Lago Sul' },
  { code: 'DF_NUCLEO_BANDEIRANTE', stateCode: 'DF', name: 'Núcleo Bandeirante' },
  { code: 'DF_PARANOA', stateCode: 'DF', name: 'Paranoá' },
  { code: 'DF_PARK_WAY', stateCode: 'DF', name: 'Park Way' },
  { code: 'DF_PLANALTINA', stateCode: 'DF', name: 'Planaltina' },
  { code: 'DF_PLANO_PILOTO', stateCode: 'DF', name: 'Plano Piloto' },
  { code: 'DF_RECANTO_DAS_EMAS', stateCode: 'DF', name: 'Recanto das Emas' },
  { code: 'DF_RIACHO_FUNDO', stateCode: 'DF', name: 'Riacho Fundo' },
  { code: 'DF_RIACHO_FUNDO_II', stateCode: 'DF', name: 'Riacho Fundo II' },
  { code: 'DF_SAMAMBAIA', stateCode: 'DF', name: 'Samambaia' },
  { code: 'DF_SANTA_MARIA', stateCode: 'DF', name: 'Santa Maria' },
  { code: 'DF_SAO_SEBASTIAO', stateCode: 'DF', name: 'São Sebastião' },
  { code: 'DF_SCIA', stateCode: 'DF', name: 'SCIA' },
  { code: 'DF_SIA', stateCode: 'DF', name: 'SIA' },
  { code: 'DF_SOBRADINHO', stateCode: 'DF', name: 'Sobradinho' },
  { code: 'DF_SOBRADINHO_II', stateCode: 'DF', name: 'Sobradinho II' },
  { code: 'DF_SOL_NASCENTE_POR_DO_SOL', stateCode: 'DF', name: 'Sol Nascente/Pôr do Sol' },
  { code: 'DF_SUDOESTE_OCTOGONAL', stateCode: 'DF', name: 'Sudoeste/Octogonal' },
  { code: 'DF_TAGUATINGA', stateCode: 'DF', name: 'Taguatinga' },
  { code: 'DF_VARJAO', stateCode: 'DF', name: 'Varjão' },
  { code: 'DF_VICENTE_PIRES', stateCode: 'DF', name: 'Vicente Pires' },

  // GO
  { code: 'GO_GOIANIA', stateCode: 'GO', name: 'Goiânia' },
  { code: 'GO_APARECIDA', stateCode: 'GO', name: 'Aparecida de Goiânia' },
  { code: 'GO_ANAPOLIS', stateCode: 'GO', name: 'Anápolis' },
  { code: 'GO_TRINDADE', stateCode: 'GO', name: 'Trindade' },
  { code: 'GO_LUZIANIA', stateCode: 'GO', name: 'Luziânia' },
  { code: 'GO_RIO_VERDE', stateCode: 'GO', name: 'Rio Verde' },
];

/**
 * Códigos antigos mantidos só para leitura de solicitações/postos já salvos.
 * Não aparecem mais no select de cidade.
 */
const FUEL_SATELLITE_CITY_LEGACY: FuelSatelliteCity[] = [
  { code: 'DF_ARNIQUEIRAS', stateCode: 'DF', name: 'Arniqueira' },
  { code: 'DF_ASA_NORTE', stateCode: 'DF', name: 'Asa Norte' },
  { code: 'DF_SAMAMBAIA_NORTE', stateCode: 'DF', name: 'Samambaia Norte' },
  { code: 'DF_SETOR_CENTRAL_GAMA', stateCode: 'DF', name: 'Setor Central (Gama)' },
  { code: 'DF_ZONA_INDUSTRIAL_GUARA', stateCode: 'DF', name: 'Zona Industrial (Guará)' },
];

function allFuelSatelliteCitiesForLookup(): FuelSatelliteCity[] {
  return [...FUEL_SATELLITE_CITIES, ...FUEL_SATELLITE_CITY_LEGACY];
}

export function listFuelSatelliteCities(stateCode?: string): FuelSatelliteCity[] {
  const normalized = stateCode?.trim().toUpperCase();
  if (!normalized) return [...FUEL_SATELLITE_CITIES];
  return FUEL_SATELLITE_CITIES.filter((city) => city.stateCode === normalized);
}

export function getFuelSatelliteCityByCode(code: string): FuelSatelliteCity | undefined {
  const normalized = code.trim().toUpperCase();
  return allFuelSatelliteCitiesForLookup().find(
    (city) => city.code.toUpperCase() === normalized,
  );
}

export function resolveFuelSatelliteCityLabel(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return getFuelSatelliteCityByCode(code)?.name ?? null;
}
