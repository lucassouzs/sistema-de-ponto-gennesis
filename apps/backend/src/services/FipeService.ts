import { createError } from '../middleware/errorHandler';

const FIPE_BASE_URL = 'https://parallelum.com.br/fipe/api/v2';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type FipeVehicleType = 'cars' | 'motorcycles' | 'trucks';

export type FipeOption = {
  code: string;
  name: string;
};

export type FipeBrandSource = {
  type: FipeVehicleType;
  code: string;
};

export type FipeFleetBrand = FipeOption & {
  sources: FipeBrandSource[];
};

type CacheEntry<T> = {
  expiresAt: number;
  data: T;
};

const cache = new Map<string, CacheEntry<unknown>>();

const VALID_VEHICLE_TYPES = new Set<FipeVehicleType>(['cars', 'motorcycles', 'trucks']);

function parseVehicleType(value: unknown): FipeVehicleType {
  const normalized = String(value ?? 'cars').trim().toLowerCase();
  if (normalized === 'car' || normalized === 'carros' || normalized === 'cars') return 'cars';
  if (normalized === 'motorcycle' || normalized === 'motos' || normalized === 'motorcycles') {
    return 'motorcycles';
  }
  if (normalized === 'truck' || normalized === 'caminhoes' || normalized === 'trucks') {
    return 'trucks';
  }
  if (VALID_VEHICLE_TYPES.has(normalized as FipeVehicleType)) {
    return normalized as FipeVehicleType;
  }
  throw createError('Tipo de veículo FIPE inválido', 400);
}

function normalizeFipeOptions(payload: unknown): FipeOption[] {
  const list = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as { models?: unknown }).models)
      ? (payload as { models: unknown[] }).models
      : [];

  return list
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const code = String(row.code ?? row.codigo ?? '').trim();
      const name = String(row.name ?? row.nome ?? '').trim();
      if (!code || !name) return null;
      return { code, name };
    })
    .filter((item): item is FipeOption => item !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/** Ex.: "Polo 1.0 Flex 12V 5p" → "Polo" */
export function extractBaseModelName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';
  return trimmed.split(/\s+/)[0] || trimmed;
}

function collapseFipeModelsToBaseNames(models: FipeOption[]): FipeOption[] {
  const byBase = new Map<string, FipeOption>();

  for (const model of models) {
    const baseName = extractBaseModelName(model.name);
    if (!baseName) continue;

    const key = baseName.toLocaleLowerCase('pt-BR');
    if (!byBase.has(key)) {
      byBase.set(key, { code: baseName, name: baseName });
    }
  }

  return Array.from(byBase.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
  );
}

async function fetchFipeJson<T>(path: string): Promise<T> {
  const cacheKey = path;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data as T;
  }

  const response = await fetch(`${FIPE_BASE_URL}${path}`, {
    headers: { Accept: 'application/json' }
  });

  if (!response.ok) {
    throw createError('Não foi possível consultar a tabela FIPE no momento', 502);
  }

  const data = (await response.json()) as T;
  cache.set(cacheKey, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export async function listFipeBrands(vehicleTypeInput: unknown): Promise<FipeOption[]> {
  const vehicleType = parseVehicleType(vehicleTypeInput);
  const data = await fetchFipeJson<unknown>(`/${vehicleType}/brands`);
  return normalizeFipeOptions(data);
}

export async function listFipeModels(
  vehicleTypeInput: unknown,
  brandId: string
): Promise<FipeOption[]> {
  const vehicleType = parseVehicleType(vehicleTypeInput);
  const brandCode = String(brandId ?? '').trim();
  if (!brandCode) throw createError('Marca é obrigatória', 400);

  const data = await fetchFipeJson<unknown>(`/${vehicleType}/brands/${encodeURIComponent(brandCode)}/models`);
  return collapseFipeModelsToBaseNames(normalizeFipeOptions(data));
}

/** Marcas de carro e moto juntas (Honda aparece uma vez, com as duas fontes). */
export async function listFipeFleetBrands(): Promise<FipeFleetBrand[]> {
  const [cars, motorcycles] = await Promise.all([
    listFipeBrands('cars'),
    listFipeBrands('motorcycles'),
  ]);

  const byName = new Map<string, FipeFleetBrand>();
  const add = (type: FipeVehicleType, brand: FipeOption) => {
    const key = brand.name.toLocaleLowerCase('pt-BR');
    const existing = byName.get(key);
    const source: FipeBrandSource = { type, code: brand.code };
    if (existing) {
      if (!existing.sources.some((item) => item.type === type && item.code === brand.code)) {
        existing.sources.push(source);
      }
      return;
    }
    byName.set(key, {
      code: `${type}:${brand.code}`,
      name: brand.name,
      sources: [source],
    });
  };

  for (const brand of cars) add('cars', brand);
  for (const brand of motorcycles) add('motorcycles', brand);

  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export async function listFipeFleetModels(sources: FipeBrandSource[]): Promise<FipeOption[]> {
  const lists = await Promise.all(
    sources.map((source) => listFipeModels(source.type, source.code).catch(() => [] as FipeOption[]))
  );
  const byName = new Map<string, FipeOption>();
  for (const model of lists.flat()) {
    const key = model.name.toLocaleLowerCase('pt-BR');
    if (!byName.has(key)) byName.set(key, model);
  }
  return Array.from(byName.values()).sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
  );
}
