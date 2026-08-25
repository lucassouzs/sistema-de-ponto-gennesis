import { FuelVehicleType, VehicleUsageType } from '@prisma/client';
import {
  getFuelSatelliteCityByCode,
  listFuelSatelliteCities,
  type FuelSatelliteCity,
} from '../constants/fuelSatelliteCities';
import { prisma } from './prisma';
import { placaVariants } from './brazilianVehiclePlate';

export {
  FUEL_ABASTECIMENTO_STATE_CODES,
  listFuelSatelliteCities,
  getFuelSatelliteCityByCode,
} from '../constants/fuelSatelliteCities';

/** Códigos legados → código canônico da RA (para agregar postos antigos). */
const LEGACY_CITY_CODE_TO_CANONICAL: Record<string, string> = {
  DF_ARNIQUEIRAS: 'DF_ARNIQUEIRA',
  DF_ASA_NORTE: 'DF_PLANO_PILOTO',
  DF_SAMAMBAIA_NORTE: 'DF_SAMAMBAIA',
  DF_SETOR_CENTRAL_GAMA: 'DF_GAMA',
  DF_ZONA_INDUSTRIAL_GUARA: 'DF_GUARA',
};

export type FuelSatelliteCityWithStations = FuelSatelliteCity & {
  stationCount: number;
};

function cityCodesForLookup(cityCode: string): string[] {
  const code = cityCode.trim().toUpperCase();
  if (!code) return [];
  const aliases = Object.entries(LEGACY_CITY_CODE_TO_CANONICAL)
    .filter(([, canonical]) => canonical === code)
    .map(([legacy]) => legacy);
  return [code, ...aliases];
}

/**
 * Cidades satélites que possuem ao menos 1 posto ativo, com a quantidade.
 * Mantido para telas administrativas / cadastro de postos.
 */
export async function listFuelSatelliteCitiesWithActiveStations(
  stateCode?: string,
): Promise<FuelSatelliteCityWithStations[]> {
  const groups = await prisma.fuelGasStation.groupBy({
    by: ['cityCode'],
    where: { isActive: true },
    _count: { _all: true },
  });

  const countByCanonical = new Map<string, number>();
  for (const row of groups) {
    const raw = String(row.cityCode || '').trim().toUpperCase();
    if (!raw) continue;
    const canonical = LEGACY_CITY_CODE_TO_CANONICAL[raw] ?? raw;
    countByCanonical.set(canonical, (countByCanonical.get(canonical) ?? 0) + row._count._all);
  }

  return listFuelSatelliteCities(stateCode)
    .map((city) => ({
      ...city,
      stationCount: countByCanonical.get(city.code.toUpperCase()) ?? 0,
    }))
    .filter((city) => city.stationCount > 0);
}

const fuelGasStationListSelect = {
  id: true,
  displayNumber: true,
  cityCode: true,
  name: true,
  address: true,
  sortOrder: true,
  isActive: true,
} as const;

export async function listActiveFuelGasStationsByCity(cityCode: string) {
  const codes = cityCodesForLookup(cityCode);
  return prisma.fuelGasStation.findMany({
    where: { cityCode: { in: codes }, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { displayNumber: 'asc' }],
    select: fuelGasStationListSelect,
  });
}

/** Postos ativos vinculados ao contrato da solicitação. */
export async function listActiveFuelGasStationsByContract(contractId: string) {
  const id = contractId.trim();
  if (!id) return [];
  return prisma.fuelGasStation.findMany({
    where: {
      isActive: true,
      contracts: { some: { contractId: id } },
    },
    orderBy: [{ sortOrder: 'asc' }, { displayNumber: 'asc' }],
    select: fuelGasStationListSelect,
  });
}

export async function getFuelGasStationInCity(stationId: string, cityCode: string) {
  const codes = cityCodesForLookup(cityCode);
  return prisma.fuelGasStation.findFirst({
    where: { id: stationId, cityCode: { in: codes }, isActive: true },
    select: { id: true, displayNumber: true, cityCode: true, name: true, address: true },
  });
}

export async function getFuelGasStationForContract(stationId: string, contractId: string) {
  const cid = contractId.trim();
  if (!cid) return null;
  return prisma.fuelGasStation.findFirst({
    where: {
      id: stationId,
      isActive: true,
      contracts: { some: { contractId: cid } },
    },
    select: { id: true, displayNumber: true, cityCode: true, name: true, address: true },
  });
}

export function mapVehicleUsageToFuelType(
  frotaPartic?: VehicleUsageType | null,
): FuelVehicleType {
  return frotaPartic === VehicleUsageType.PARTICULAR
    ? FuelVehicleType.PRIVATE
    : FuelVehicleType.COMPANY;
}

export async function findActiveVehicleByPlate(plate: string) {
  const variants = placaVariants(plate);
  return prisma.vehicle.findFirst({
    where: { isActive: true, placaVeic: { in: variants } },
    select: {
      id: true,
      placaVeic: true,
      marcaVeic: true,
      modeloVeic: true,
      frotaPartic: true,
    },
  });
}

export async function reserveFuelGasStationDisplayNumbers(count: number): Promise<number[]> {
  if (count <= 0) return [];

  const result = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX("displayNumber") AS max FROM fuel_gas_stations
  `;

  let start = Number(result[0]?.max ?? 0);
  const numbers: number[] = [];
  for (let i = 0; i < count; i++) {
    start += 1;
    numbers.push(start);
  }
  return numbers;
}

export function assertValidSatelliteCityCode(cityCode: string) {
  const city = getFuelSatelliteCityByCode(cityCode);
  if (!city) throw new Error('Cidade satélite inválida');
  return city;
}
