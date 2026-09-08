import {
  extractBaseModelName,
  listFipeFleetBrands,
  listFipeFleetModels,
  type FipeFleetBrand,
  type FipeOption
} from '../services/FipeService';
import { prisma } from './prisma';

export type VehicleImportNormalizeContext = {
  brands: FipeFleetBrand[];
  modelsByBrandCode: Map<string, FipeOption[]>;
  contractCandidates: Array<{ label: string; canonical: string }>;
};

const BRAND_ALIASES: Record<string, string> = {
  vw: 'volkswagen',
  volks: 'volkswagen',
  volkswagen: 'volkswagen',
  gm: 'chevrolet',
  chevy: 'chevrolet',
  chevrolet: 'chevrolet',
  fiat: 'fiat',
  ford: 'ford',
  toyota: 'toyota',
  honda: 'honda',
  hyundai: 'hyundai',
  renault: 'renault',
  nissan: 'nissan',
  peugeot: 'peugeot',
  citroen: 'citroen',
  jeep: 'jeep',
  mitsubishi: 'mitsubishi',
  mmc: 'mitsubishi',
  kia: 'kia',
  bmw: 'bmw',
  audi: 'audi',
  mercedes: 'mercedes-benz',
  'mercedes benz': 'mercedes-benz',
  mb: 'mercedes-benz',
  benz: 'mercedes-benz',
  volvo: 'volvo',
  iveco: 'iveco',
  scania: 'scania',
  jac: 'jac',
  caoa: 'chery',
  chery: 'chery',
  caoachery: 'chery',
  'caoa chery': 'chery',
  ram: 'ram',
  dodge: 'dodge',
  suzuki: 'suzuki',
  yamaha: 'yamaha',
  kawasaki: 'kawasaki',
  harley: 'harley-davidson',
  'harley davidson': 'harley-davidson',
  hd: 'harley-davidson',
  triumph: 'triumph',
  dafra: 'dafra',
  sundown: 'sundown',
  haojue: 'haojue',
  bajaj: 'bajaj',
  ktm: 'ktm',
  ducati: 'ducati',
  'royal enfield': 'royal enfield',
  royalenfield: 'royal enfield',
  honda_moto: 'honda',
  agrale: 'agrale',
  troller: 'troller',
  landrover: 'land rover',
  'land rover': 'land rover',
  mini: 'mini',
  porsche: 'porsche',
  subaru: 'subaru',
  mazda: 'mazda',
  bys: 'byd',
  byd: 'byd',
  gwm: 'gwm',
  hafei: 'hafei',
  effa: 'effa',
  shineray: 'shineray'
};

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Remove código de centro de custo no início: "02.06.01.01.011 - TJGO..." → "TJGO..." */
export function stripContratoCostCenterCode(value: string | null | undefined): string {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const stripped = trimmed.replace(/^\d{1,2}(?:\.\d{1,2})+\s*[-–—]\s*/, '').trim();
  return stripped || trimmed;
}

/** Fallback só quando não há match FIPE. Com dígito (HB20) → maiúsculas; senão só a 1ª maiúscula. */
function formatModelFallbackCase(value: string): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (!trimmed) return trimmed;
  if (/\d/.test(trimmed)) return trimmed.toLocaleUpperCase('pt-BR');
  const lower = trimmed.toLocaleLowerCase('pt-BR');
  return lower.charAt(0).toLocaleUpperCase('pt-BR') + lower.slice(1);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function similarityScore(query: string, candidate: string): number {
  const q = normalizeText(query);
  const c = normalizeText(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.startsWith(q) || q.startsWith(c)) return 0.95;
  if (c.includes(q) || q.includes(c)) return 0.88;

  const qTokens = q.split(' ');
  const cTokens = c.split(' ');
  const overlap = qTokens.filter((t) => cTokens.includes(t)).length;
  if (overlap > 0) {
    const tokenScore = overlap / Math.max(qTokens.length, cTokens.length);
    if (tokenScore >= 0.6) return 0.75 + tokenScore * 0.2;
  }

  const maxLen = Math.max(q.length, c.length);
  if (maxLen <= 0) return 0;
  const dist = levenshtein(q, c);
  const ratio = 1 - dist / maxLen;
  return ratio >= 0.72 ? ratio : 0;
}

function bestMatch<T extends { label: string }>(
  query: string,
  candidates: T[],
  minScore = 0.78
): { item: T; score: number } | null {
  const q = query.trim();
  if (!q || candidates.length === 0) return null;

  let best: { item: T; score: number } | null = null;
  for (const item of candidates) {
    const score = similarityScore(q, item.label);
    if (!best || score > best.score) best = { item, score };
  }
  if (!best || best.score < minScore) return null;
  return best;
}

function resolveBrandAlias(raw: string): string {
  const norm = normalizeText(raw);
  return BRAND_ALIASES[norm] || BRAND_ALIASES[norm.replace(/\s+/g, '')] || norm;
}

function findBrandInText(text: string, brands: FipeFleetBrand[]): FipeFleetBrand | null {
  const normText = ` ${normalizeText(text)} `;
  const sorted = [...brands].sort((a, b) => b.name.length - a.name.length);

  for (const brand of sorted) {
    const brandNorm = normalizeText(brand.name);
    if (brandNorm.length >= 2 && normText.includes(` ${brandNorm} `)) return brand;
  }

  for (const [alias, target] of Object.entries(BRAND_ALIASES)) {
    if (alias.length < 2) continue;
    if (normText.includes(` ${alias} `)) {
      const brand = brands.find((b) => normalizeText(b.name) === target);
      if (brand) return brand;
    }
  }

  return null;
}

function stripBrandFromModel(modelText: string, brandName: string): string {
  let result = modelText.trim();
  const patterns = [
    brandName,
    ...Object.entries(BRAND_ALIASES)
      .filter(([, target]) => target === normalizeText(brandName))
      .map(([alias]) => alias)
  ];

  for (const pattern of patterns) {
    const re = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[\\s\\-/]*`, 'i');
    result = result.replace(re, '').trim();
  }
  return result || modelText.trim();
}

async function getModelsForBrand(
  ctx: VehicleImportNormalizeContext,
  brand: FipeFleetBrand
): Promise<FipeOption[]> {
  const cached = ctx.modelsByBrandCode.get(brand.code);
  if (cached) return cached;
  try {
    const models = await listFipeFleetModels(brand.sources);
    ctx.modelsByBrandCode.set(brand.code, models);
    return models;
  } catch {
    ctx.modelsByBrandCode.set(brand.code, []);
    return [];
  }
}

export async function createVehicleImportNormalizeContext(): Promise<VehicleImportNormalizeContext> {
  const [brands, costCenters, contracts, existingContratos] = await Promise.all([
    listFipeFleetBrands().catch(() => [] as FipeFleetBrand[]),
    prisma.costCenter.findMany({
      where: { isActive: true },
      select: { code: true, name: true },
      orderBy: { code: 'asc' }
    }),
    prisma.contract.findMany({
      select: { name: true, number: true },
      orderBy: { name: 'asc' },
      take: 5000
    }),
    prisma.vehicle.findMany({
      where: { contrato: { not: null } },
      select: { contrato: true },
      distinct: ['contrato'],
      take: 5000
    })
  ]);

  const contractCandidates: Array<{ label: string; canonical: string }> = [];
  const seen = new Set<string>();

  const pushCandidate = (label: string, canonical: string) => {
    const key = normalizeText(canonical);
    if (!key || seen.has(`c:${key}`)) return;
    seen.add(`c:${key}`);
    contractCandidates.push({ label, canonical });
    if (normalizeText(label) !== key) {
      contractCandidates.push({ label: canonical, canonical });
    }
  };

  for (const cc of costCenters) {
    const code = cc.code.trim();
    const name = cc.name.trim();
    const combined = code && name ? `${code} - ${name}` : code || name;
    const canonical = name || combined;
    if (combined) pushCandidate(combined, canonical);
    if (code) pushCandidate(code, canonical);
    if (name) pushCandidate(name, canonical);
  }

  for (const contract of contracts) {
    const name = contract.name.trim();
    const number = contract.number.trim();
    if (name) pushCandidate(name, name);
    if (number) pushCandidate(number, name || number);
    if (name && number) pushCandidate(`${number} - ${name}`, name);
  }

  for (const row of existingContratos) {
    const value = (row.contrato || '').trim();
    if (!value) continue;
    const withoutCode = stripContratoCostCenterCode(value);
    pushCandidate(value, withoutCode);
    if (withoutCode !== value) pushCandidate(withoutCode, withoutCode);
  }

  return {
    brands,
    modelsByBrandCode: new Map(),
    contractCandidates
  };
}

export type NormalizedVehicleImportFields = {
  marcaVeic: string | null;
  modeloVeic: string;
  contrato: string | null;
  polo: string | null;
  notes: string[];
};

/**
 * Associa marca/modelo via FIPE e corrige contrato contra centros de custo / contratos / valores já usados.
 */
export async function normalizeVehicleImportFields(
  input: {
    marcaVeic?: string | null;
    modeloVeic?: string | null;
    contrato?: string | null;
    polo?: string | null;
  },
  ctx: VehicleImportNormalizeContext
): Promise<NormalizedVehicleImportFields> {
  const notes: string[] = [];
  let marcaRaw = (input.marcaVeic || '').trim();
  let modeloRaw = (input.modeloVeic || '').trim();
  const contratoRaw = (input.contrato || '').trim();
  let polo = (input.polo || '').trim() || null;

  if (polo) {
    const poloNorm = normalizeText(polo);
    if (['df', 'brasilia', 'brasília', 'distrito federal'].includes(poloNorm)) {
      if (polo !== 'DF') notes.push(`Polo "${polo}" → DF`);
      polo = 'DF';
    } else if (['go', 'goias', 'goiás', 'goiania', 'goiânia'].includes(poloNorm)) {
      if (polo !== 'GO') notes.push(`Polo "${polo}" → GO`);
      polo = 'GO';
    }
  }

  // Se só veio um texto "VW Gol", trata como modelo completo.
  if (!marcaRaw && modeloRaw) {
    const brandInModel = findBrandInText(modeloRaw, ctx.brands);
    if (brandInModel) {
      marcaRaw = brandInModel.name;
      modeloRaw = stripBrandFromModel(modeloRaw, brandInModel.name);
      notes.push(`Marca detectada no modelo: ${brandInModel.name}`);
    }
  }

  let marcaVeic: string | null = marcaRaw || null;
  let modeloVeic = modeloRaw;
  let matchedFipeModel = false;

  if (ctx.brands.length > 0) {
    let brand: FipeFleetBrand | null = null;

    if (marcaRaw) {
      const alias = resolveBrandAlias(marcaRaw);
      brand =
        ctx.brands.find((b) => normalizeText(b.name) === alias) ||
        bestMatch(
          marcaRaw,
          ctx.brands.map((b) => ({ label: b.name, brand: b })),
          0.78
        )?.item.brand ||
        null;

      if (!brand) {
        brand = findBrandInText(`${marcaRaw} ${modeloRaw}`, ctx.brands);
      }
    } else {
      brand = findBrandInText(modeloRaw, ctx.brands);
    }

    if (brand) {
      if (marcaVeic !== brand.name) {
        notes.push(`Marca "${marcaVeic || '—'}" → ${brand.name}`);
      }
      marcaVeic = brand.name;

      const cleanedModel = stripBrandFromModel(modeloVeic || modeloRaw, brand.name);
      const models = await getModelsForBrand(ctx, brand);
      if (models.length > 0 && cleanedModel) {
        const base = extractBaseModelName(cleanedModel);
        const modelMatch =
          bestMatch(
            cleanedModel,
            models.map((m) => ({ label: m.name, model: m })),
            0.72
          ) ||
          bestMatch(
            base,
            models.map((m) => ({ label: m.name, model: m })),
            0.8
          );

        if (modelMatch) {
          if (modeloVeic !== modelMatch.item.model.name) {
            notes.push(`Modelo "${modeloVeic || cleanedModel}" → ${modelMatch.item.model.name}`);
          }
          modeloVeic = modelMatch.item.model.name;
          matchedFipeModel = true;
        } else {
          modeloVeic = base || cleanedModel;
          if (modeloVeic !== cleanedModel) {
            notes.push(`Modelo simplificado para "${modeloVeic}"`);
          }
        }
      } else if (cleanedModel) {
        modeloVeic = extractBaseModelName(cleanedModel) || cleanedModel;
      }
    }
  }

  let contrato: string | null = contratoRaw || null;
  if (contratoRaw && ctx.contractCandidates.length > 0) {
    const match = bestMatch(contratoRaw, ctx.contractCandidates, 0.78);
    if (match && match.item.canonical !== contratoRaw) {
      notes.push(`Contrato "${contratoRaw}" → ${match.item.canonical}`);
      contrato = match.item.canonical;
    } else if (match) {
      contrato = match.item.canonical;
    }
  }
  if (contrato) {
    const withoutCode = stripContratoCostCenterCode(contrato);
    if (withoutCode !== contrato) {
      notes.push(`Contrato sem código: "${withoutCode}"`);
      contrato = withoutCode;
    }
  }

  // Nome da FIPE (ex.: HB20) prevalece; fallback só quando não houve match.
  const modeloFinal = matchedFipeModel
    ? modeloVeic || modeloRaw
    : formatModelFallbackCase(modeloVeic || modeloRaw);
  if (modeloFinal && modeloVeic && modeloFinal !== modeloVeic) {
    notes.push(`Modelo "${modeloVeic}" → ${modeloFinal}`);
  }

  return {
    marcaVeic,
    modeloVeic: modeloFinal,
    contrato,
    polo,
    notes
  };
}

let vehicleModelRepairPromise: Promise<number> | null = null;

/** Corrige modelos já cadastrados para o nome exato da lista FIPE (ex.: Hb20 → HB20). */
export async function repairExistingVehicleModelsFromFipe(): Promise<number> {
  if (!vehicleModelRepairPromise) {
    vehicleModelRepairPromise = (async () => {
      const ctx = await createVehicleImportNormalizeContext();
      const vehicles = await prisma.vehicle.findMany({
        select: { id: true, marcaVeic: true, modeloVeic: true }
      });

      let updated = 0;
      for (const vehicle of vehicles) {
        const normalized = await normalizeVehicleImportFields(
          {
            marcaVeic: vehicle.marcaVeic,
            modeloVeic: vehicle.modeloVeic
          },
          ctx
        );
        const nextModelo = normalized.modeloVeic.trim();
        const nextMarca = normalized.marcaVeic;
        if (!nextModelo) continue;

        const modeloChanged = nextModelo !== vehicle.modeloVeic;
        const marcaChanged =
          nextMarca != null && nextMarca !== (vehicle.marcaVeic || '').trim();

        if (!modeloChanged && !marcaChanged) continue;

        await prisma.vehicle.update({
          where: { id: vehicle.id },
          data: {
            ...(modeloChanged ? { modeloVeic: nextModelo } : {}),
            ...(marcaChanged ? { marcaVeic: nextMarca } : {})
          }
        });
        updated += 1;
      }
      return updated;
    })().catch((err) => {
      vehicleModelRepairPromise = null;
      throw err;
    });
  }
  return vehicleModelRepairPromise;
}
