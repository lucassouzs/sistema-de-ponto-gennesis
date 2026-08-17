import { GestaoOsProfile, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import {
  attachWarrantyToLocationTree,
  loadAssetWarrantyMap,
  loadCategoryChecklistId,
  persistAssetWarranty,
  persistCategoryChecklistId,
  parseChecklistLabels,
  parseOptionalDate,
  upsertChecklistTemplate
} from '../lib/gestaoOsChecklistCopy';
import { gestaoOsService } from './GestaoOsService';

async function qrCodeToDataUrl(
  text: string,
  opts?: { margin?: number; width?: number; errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }
): Promise<string> {
  try {
    const QRCode = (await import('qrcode')).default;
    return QRCode.toDataURL(text, opts);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Cannot find module 'qrcode'") || msg.includes('Cannot find package')) {
      throw createError(
        'Dependência qrcode não instalada. Rode npm install na raiz do monorepo e reinicie o backend.',
        500
      );
    }
    throw e;
  }
}

function parseOptionalNonNegativeInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

const EQUIPMENT_DOC_KINDS = new Set(['MANUAL', 'WARRANTY', 'LAUDO', 'OTHER']);

function parseEquipmentAttachments(value: unknown): Prisma.InputJsonValue | undefined {
  if (value == null) return undefined;
  if (!Array.isArray(value)) throw createError('Anexos inválidos', 400);
  const parsed: Array<{ url: string; name: string; mimeType?: string; kind?: string }> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const url = String(row.url ?? '').trim();
    const name = String(row.name ?? row.originalName ?? 'anexo').trim() || 'anexo';
    if (!url) continue;
    const kindRaw = String(row.kind ?? '').toUpperCase();
    parsed.push({
      url,
      name,
      ...(row.mimeType ? { mimeType: String(row.mimeType) } : {}),
      ...(EQUIPMENT_DOC_KINDS.has(kindRaw) ? { kind: kindRaw } : {})
    });
  }
  return parsed as Prisma.InputJsonValue;
}

function newQrToken(): string {
  return randomBytes(16).toString('hex');
}

function parseProfile(value: unknown): GestaoOsProfile {
  const raw = String(value ?? 'REQUESTER').toUpperCase();
  if (raw === 'REQUESTER' || raw === 'MANAGER' || raw === 'TECHNICIAN' || raw === 'ADMIN') {
    return raw;
  }
  throw createError('Perfil de acesso inválido', 400);
}

function frontendBaseUrl(): string {
  return (
    process.env.FRONTEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

function assetQrPayloadUrl(qrToken: string): string {
  return `${frontendBaseUrl()}/ponto/meus-chamados?qr=${encodeURIComponent(qrToken)}`;
}

const DEFAULT_CATEGORIES = [
  { name: 'Elétrica', code: 'ELE' },
  { name: 'Hidráulica', code: 'HID' },
  { name: 'Climatização / Refrigeração', code: 'CLI' },
  { name: 'TI / Telefonia', code: 'TI' },
  { name: 'Civil / Alvenaria', code: 'CIV' },
  { name: 'Marcenaria', code: 'MAR' },
  { name: 'Limpeza / Conservação', code: 'LIM' },
  { name: 'Segurança / Acesso', code: 'SEG' },
  { name: 'Outros', code: 'OUT' }
] as const;

export class GestaoOsCadastrosService {
  // ─── Empresas / Filiais ───────────────────────────────────────────

  async listCompanies(opts?: { userId?: string; isAdmin?: boolean }) {
    const where =
      opts?.isAdmin || !opts?.userId
        ? {}
        : { members: { some: { userId: opts.userId, isActive: true } } };
    return prisma.gestaoOsCompany.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        branches: { orderBy: { name: 'asc' } },
        _count: { select: { members: true, buildings: true, providers: true } }
      }
    });
  }

  async createCompany(
    input: {
      name?: string;
      tradeName?: string | null;
      document?: string | null;
      code?: string | null;
    },
    creatorUserId?: string
  ) {
    const name = String(input.name ?? '').trim();
    if (!name) throw createError('Informe o nome da empresa', 400);
    const company = await prisma.gestaoOsCompany.create({
      data: {
        name,
        tradeName: input.tradeName?.trim() || null,
        document: input.document?.trim() || null,
        code: input.code?.trim() || null,
        ...(creatorUserId
          ? {
              members: {
                create: {
                  userId: creatorUserId,
                  profile: 'ADMIN'
                }
              }
            }
          : {})
      },
      include: { branches: true, members: true }
    });
    // Seed categorias e locais padrão da empresa
    await gestaoOsService.ensureDefaultLocations(company.id);
    return company;
  }

  async updateCompany(
    id: string,
    input: {
      name?: string;
      tradeName?: string | null;
      document?: string | null;
      code?: string | null;
      isActive?: boolean;
    }
  ) {
    const existing = await prisma.gestaoOsCompany.findUnique({ where: { id } });
    if (!existing) throw createError('Empresa não encontrada', 404);
    return prisma.gestaoOsCompany.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
        ...(input.tradeName !== undefined ? { tradeName: input.tradeName?.trim() || null } : {}),
        ...(input.document !== undefined ? { document: input.document?.trim() || null } : {}),
        ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
      },
      include: { branches: { orderBy: { name: 'asc' } } }
    });
  }

  async createBranch(input: {
    companyId?: string;
    name?: string;
    code?: string | null;
    address?: string | null;
  }) {
    const companyId = String(input.companyId ?? '').trim();
    const name = String(input.name ?? '').trim();
    if (!companyId) throw createError('Informe a empresa da filial', 400);
    if (!name) throw createError('Informe o nome da filial', 400);
    const company = await prisma.gestaoOsCompany.findUnique({ where: { id: companyId } });
    if (!company) throw createError('Empresa não encontrada', 404);
    return prisma.gestaoOsBranch.create({
      data: {
        companyId,
        name,
        code: input.code?.trim() || null,
        address: input.address?.trim() || null
      }
    });
  }

  async updateBranch(
    id: string,
    input: {
      name?: string;
      code?: string | null;
      address?: string | null;
      isActive?: boolean;
    }
  ) {
    const existing = await prisma.gestaoOsBranch.findUnique({ where: { id } });
    if (!existing) throw createError('Filial não encontrada', 404);
    return prisma.gestaoOsBranch.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
        ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
        ...(input.address !== undefined ? { address: input.address?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
      }
    });
  }

  // ─── Locais / Ativos ──────────────────────────────────────────────

  async getLocationTreeAdmin(companyId?: string | null) {
    const where: Prisma.GestaoOsBuildingWhereInput = {};
    if (companyId) where.companyId = companyId;
    const tree = await prisma.gestaoOsBuilding.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        company: { select: { id: true, name: true } },
        branch: { select: { id: true, name: true } },
        sectors: {
          orderBy: { name: 'asc' },
          include: {
            places: {
              orderBy: { name: 'asc' },
              include: {
                assets: { orderBy: { name: 'asc' } }
              }
            }
          }
        }
      }
    });
    return attachWarrantyToLocationTree(tree);
  }

  async createBuilding(input: {
    name?: string;
    code?: string | null;
    companyId?: string | null;
    branchId?: string | null;
  }) {
    const name = String(input.name ?? '').trim();
    if (!name) throw createError('Informe o nome do prédio', 400);
    return prisma.gestaoOsBuilding.create({
      data: {
        name,
        code: input.code?.trim() || null,
        companyId: input.companyId?.trim() || null,
        branchId: input.branchId?.trim() || null
      }
    });
  }

  async updateBuilding(
    id: string,
    input: {
      name?: string;
      code?: string | null;
      companyId?: string | null;
      branchId?: string | null;
      isActive?: boolean;
    }
  ) {
    const existing = await prisma.gestaoOsBuilding.findUnique({ where: { id } });
    if (!existing) throw createError('Prédio não encontrado', 404);
    return prisma.gestaoOsBuilding.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
        ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
        ...(input.companyId !== undefined ? { companyId: input.companyId?.trim() || null } : {}),
        ...(input.branchId !== undefined ? { branchId: input.branchId?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
      }
    });
  }

  async createSector(input: { buildingId?: string; name?: string; code?: string | null }) {
    const buildingId = String(input.buildingId ?? '').trim();
    const name = String(input.name ?? '').trim();
    if (!buildingId) throw createError('Informe o prédio', 400);
    if (!name) throw createError('Informe o nome do andar/setor', 400);
    const building = await prisma.gestaoOsBuilding.findUnique({ where: { id: buildingId } });
    if (!building) throw createError('Prédio não encontrado', 404);
    return prisma.gestaoOsSector.create({
      data: { buildingId, name, code: input.code?.trim() || null }
    });
  }

  async updateSector(
    id: string,
    input: { name?: string; code?: string | null; isActive?: boolean }
  ) {
    const existing = await prisma.gestaoOsSector.findUnique({ where: { id } });
    if (!existing) throw createError('Andar/setor não encontrado', 404);
    return prisma.gestaoOsSector.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
        ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
      }
    });
  }

  async createPlace(input: { sectorId?: string; name?: string; code?: string | null }) {
    const sectorId = String(input.sectorId ?? '').trim();
    const name = String(input.name ?? '').trim();
    if (!sectorId) throw createError('Informe o andar/setor', 400);
    if (!name) throw createError('Informe o nome da sala/local', 400);
    const sector = await prisma.gestaoOsSector.findUnique({ where: { id: sectorId } });
    if (!sector) throw createError('Andar/setor não encontrado', 404);
    return prisma.gestaoOsPlace.create({
      data: { sectorId, name, code: input.code?.trim() || null }
    });
  }

  async updatePlace(
    id: string,
    input: { name?: string; code?: string | null; isActive?: boolean }
  ) {
    const existing = await prisma.gestaoOsPlace.findUnique({ where: { id } });
    if (!existing) throw createError('Sala/local não encontrado', 404);
    return prisma.gestaoOsPlace.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
        ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
      }
    });
  }

  async createAsset(input: {
    placeId?: string;
    name?: string;
    code?: string | null;
    category?: string | null;
    warrantyEndsAt?: unknown;
  }) {
    const placeId = String(input.placeId ?? '').trim();
    const name = String(input.name ?? '').trim();
    if (!placeId) throw createError('Informe a sala/local do ativo', 400);
    if (!name) throw createError('Informe o nome do ativo', 400);
    const place = await prisma.gestaoOsPlace.findUnique({ where: { id: placeId } });
    if (!place) throw createError('Sala/local não encontrado', 404);
    const created = await prisma.gestaoOsAsset.create({
      data: {
        placeId,
        name,
        code: input.code?.trim() || null,
        category: input.category?.trim() || null,
        qrToken: newQrToken()
      }
    });
    const warrantyEndsAt = parseOptionalDate(input.warrantyEndsAt);
    await persistAssetWarranty(created.id, warrantyEndsAt);
    return { ...created, warrantyEndsAt: warrantyEndsAt ? warrantyEndsAt.toISOString() : null };
  }

  async updateAsset(
    id: string,
    input: {
      name?: string;
      code?: string | null;
      category?: string | null;
      isActive?: boolean;
      regenerateQr?: boolean;
      warrantyEndsAt?: unknown;
    }
  ) {
    const existing = await prisma.gestaoOsAsset.findUnique({ where: { id } });
    if (!existing) throw createError('Ativo não encontrado', 404);
    const updated = await prisma.gestaoOsAsset.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
        ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
        ...(input.category !== undefined ? { category: input.category?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}),
        ...(input.regenerateQr ? { qrToken: newQrToken() } : {})
      }
    });
    const warrantyEndsAt = parseOptionalDate(input.warrantyEndsAt);
    await persistAssetWarranty(id, warrantyEndsAt);
    const map = warrantyEndsAt === undefined ? await loadAssetWarrantyMap([id]) : null;
    return {
      ...updated,
      warrantyEndsAt:
        warrantyEndsAt === undefined
          ? map?.get(id)?.toISOString() ?? null
          : warrantyEndsAt
            ? warrantyEndsAt.toISOString()
            : null
    };
  }

  async deleteBuilding(id: string) {
    const existing = await prisma.gestaoOsBuilding.findUnique({ where: { id } });
    if (!existing) throw createError('Prédio não encontrado', 404);
    await prisma.gestaoOsBuilding.delete({ where: { id } });
    return { id };
  }

  async deleteSector(id: string) {
    const existing = await prisma.gestaoOsSector.findUnique({ where: { id } });
    if (!existing) throw createError('Andar/setor não encontrado', 404);
    await prisma.gestaoOsSector.delete({ where: { id } });
    return { id };
  }

  async deletePlace(id: string) {
    const existing = await prisma.gestaoOsPlace.findUnique({ where: { id } });
    if (!existing) throw createError('Sala/local não encontrado', 404);
    await prisma.gestaoOsPlace.delete({ where: { id } });
    return { id };
  }

  async deleteAsset(id: string) {
    const existing = await prisma.gestaoOsAsset.findUnique({ where: { id } });
    if (!existing) throw createError('Ativo não encontrado', 404);
    await prisma.gestaoOsAsset.delete({ where: { id } });
    return { id };
  }

  // ─── Catálogo de equipamentos (grupo › subgrupo › equipamento) ───

  async getEquipmentCatalog() {
    return prisma.gestaoOsEquipmentGroup.findMany({
      orderBy: { name: 'asc' },
      include: {
        subgroups: {
          orderBy: { name: 'asc' },
          include: {
            equipments: { orderBy: { name: 'asc' } }
          }
        }
      }
    });
  }

  async createEquipmentGroup(input: { name?: string }) {
    const name = String(input.name ?? '').trim();
    if (!name) throw createError('Informe o nome do grupo', 400);
    return prisma.gestaoOsEquipmentGroup.create({ data: { name } });
  }

  async updateEquipmentGroup(id: string, input: { name?: string; isActive?: boolean }) {
    const existing = await prisma.gestaoOsEquipmentGroup.findUnique({ where: { id } });
    if (!existing) throw createError('Grupo não encontrado', 404);
    return prisma.gestaoOsEquipmentGroup.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
      }
    });
  }

  async deleteEquipmentGroup(id: string) {
    const existing = await prisma.gestaoOsEquipmentGroup.findUnique({ where: { id } });
    if (!existing) throw createError('Grupo não encontrado', 404);
    await prisma.gestaoOsEquipmentGroup.delete({ where: { id } });
    return { id };
  }

  async createEquipmentSubgroup(input: { groupId?: string; name?: string }) {
    const groupId = String(input.groupId ?? '').trim();
    const name = String(input.name ?? '').trim();
    if (!groupId) throw createError('Selecione o grupo', 400);
    if (!name) throw createError('Informe o nome do subgrupo', 400);
    const group = await prisma.gestaoOsEquipmentGroup.findUnique({ where: { id: groupId } });
    if (!group) throw createError('Grupo não encontrado', 404);
    return prisma.gestaoOsEquipmentSubgroup.create({ data: { groupId, name } });
  }

  async updateEquipmentSubgroup(id: string, input: { name?: string; isActive?: boolean }) {
    const existing = await prisma.gestaoOsEquipmentSubgroup.findUnique({ where: { id } });
    if (!existing) throw createError('Subgrupo não encontrado', 404);
    return prisma.gestaoOsEquipmentSubgroup.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
      }
    });
  }

  async deleteEquipmentSubgroup(id: string) {
    const existing = await prisma.gestaoOsEquipmentSubgroup.findUnique({ where: { id } });
    if (!existing) throw createError('Subgrupo não encontrado', 404);
    await prisma.gestaoOsEquipmentSubgroup.delete({ where: { id } });
    return { id };
  }

  async createEquipment(input: {
    subgroupId?: string;
    name?: string;
    manufacturer?: string | null;
    model?: string | null;
    defaultSlaHours?: number | string | null;
    expectedLifeYears?: number | string | null;
    notes?: string | null;
    attachments?: unknown;
  }) {
    const subgroupId = String(input.subgroupId ?? '').trim();
    const name = String(input.name ?? '').trim();
    if (!subgroupId) throw createError('Selecione o subgrupo', 400);
    if (!name) throw createError('Informe o nome do equipamento', 400);
    const subgroup = await prisma.gestaoOsEquipmentSubgroup.findUnique({
      where: { id: subgroupId }
    });
    if (!subgroup) throw createError('Subgrupo não encontrado', 404);
    const attachments = parseEquipmentAttachments(input.attachments);
    return prisma.gestaoOsEquipment.create({
      data: {
        subgroupId,
        name,
        manufacturer: input.manufacturer?.trim() || null,
        model: input.model?.trim() || null,
        defaultSlaHours: parseOptionalNonNegativeInt(input.defaultSlaHours),
        expectedLifeYears: parseOptionalNonNegativeInt(input.expectedLifeYears),
        notes: input.notes?.trim() || null,
        ...(attachments !== undefined ? { attachments } : {})
      }
    });
  }

  async updateEquipment(
    id: string,
    input: {
      name?: string;
      manufacturer?: string | null;
      model?: string | null;
      isActive?: boolean;
      defaultSlaHours?: number | string | null;
      expectedLifeYears?: number | string | null;
      notes?: string | null;
      attachments?: unknown;
    }
  ) {
    const existing = await prisma.gestaoOsEquipment.findUnique({ where: { id } });
    if (!existing) throw createError('Equipamento não encontrado', 404);
    const attachments = parseEquipmentAttachments(input.attachments);
    return prisma.gestaoOsEquipment.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
        ...(input.manufacturer !== undefined
          ? { manufacturer: input.manufacturer?.trim() || null }
          : {}),
        ...(input.model !== undefined ? { model: input.model?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}),
        ...(input.defaultSlaHours !== undefined
          ? { defaultSlaHours: parseOptionalNonNegativeInt(input.defaultSlaHours) }
          : {}),
        ...(input.expectedLifeYears !== undefined
          ? { expectedLifeYears: parseOptionalNonNegativeInt(input.expectedLifeYears) }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(attachments !== undefined ? { attachments } : {})
      }
    });
  }

  async deleteEquipment(id: string) {
    const existing = await prisma.gestaoOsEquipment.findUnique({ where: { id } });
    if (!existing) throw createError('Equipamento não encontrado', 404);
    await prisma.gestaoOsEquipment.delete({ where: { id } });
    return { id };
  }

  async getAssetByQrToken(qrToken: string) {
    const token = String(qrToken ?? '').trim();
    if (!token) throw createError('Token do QR inválido', 400);
    const asset = await prisma.gestaoOsAsset.findUnique({
      where: { qrToken: token },
      include: {
        place: {
          include: {
            sector: {
              include: {
                building: {
                  include: {
                    company: { select: { id: true, name: true } },
                    branch: { select: { id: true, name: true } }
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!asset || !asset.isActive) throw createError('Ativo não encontrado para este QR', 404);
    const building = asset.place.sector.building;
    const sector = asset.place.sector;
    return {
      ...asset,
      locationLabel: [building.name, sector.name, asset.place.name, asset.name].join(' › '),
      buildingId: building.id,
      sectorId: sector.id,
      placeId: asset.placeId,
      companyId: building.companyId
    };
  }

  async getAssetQrCode(assetId: string) {
    const asset = await prisma.gestaoOsAsset.findUnique({
      where: { id: assetId },
      include: {
        place: {
          include: {
            sector: { include: { building: { select: { name: true } } } }
          }
        }
      }
    });
    if (!asset) throw createError('Ativo não encontrado', 404);
    if (!asset.qrToken) {
      const updated = await prisma.gestaoOsAsset.update({
        where: { id: assetId },
        data: { qrToken: newQrToken() }
      });
      asset.qrToken = updated.qrToken;
    }
    const payloadUrl = assetQrPayloadUrl(asset.qrToken);
    const dataUrl = await qrCodeToDataUrl(payloadUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320
    });
    return {
      assetId: asset.id,
      name: asset.name,
      code: asset.code,
      qrToken: asset.qrToken,
      payloadUrl,
      dataUrl,
      locationLabel: [
        asset.place.sector.building.name,
        asset.place.sector.name,
        asset.place.name,
        asset.name
      ].join(' › ')
    };
  }

  // ─── Prestadores ──────────────────────────────────────────────────

  async listProviders(companyId?: string | null) {
    const where: Prisma.GestaoOsProviderWhereInput = {};
    if (companyId) where.OR = [{ companyId }, { companyId: null }];
    return prisma.gestaoOsProvider.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { company: { select: { id: true, name: true } } }
    });
  }

  async createProvider(input: {
    companyId?: string | null;
    name?: string;
    document?: string | null;
    specialty?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    notes?: string | null;
  }) {
    const name = String(input.name ?? '').trim();
    if (!name) throw createError('Informe o nome do prestador', 400);
    return prisma.gestaoOsProvider.create({
      data: {
        companyId: input.companyId?.trim() || null,
        name,
        document: input.document?.trim() || null,
        specialty: input.specialty?.trim() || null,
        contactName: input.contactName?.trim() || null,
        phone: input.phone?.trim() || null,
        email: input.email?.trim() || null,
        notes: input.notes?.trim() || null
      }
    });
  }

  async updateProvider(
    id: string,
    input: {
      companyId?: string | null;
      name?: string;
      document?: string | null;
      specialty?: string | null;
      contactName?: string | null;
      phone?: string | null;
      email?: string | null;
      notes?: string | null;
      isActive?: boolean;
    }
  ) {
    const existing = await prisma.gestaoOsProvider.findUnique({ where: { id } });
    if (!existing) throw createError('Prestador não encontrado', 404);
    return prisma.gestaoOsProvider.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
        ...(input.companyId !== undefined ? { companyId: input.companyId?.trim() || null } : {}),
        ...(input.document !== undefined ? { document: input.document?.trim() || null } : {}),
        ...(input.specialty !== undefined ? { specialty: input.specialty?.trim() || null } : {}),
        ...(input.contactName !== undefined
          ? { contactName: input.contactName?.trim() || null }
          : {}),
        ...(input.phone !== undefined ? { phone: input.phone?.trim() || null } : {}),
        ...(input.email !== undefined ? { email: input.email?.trim() || null } : {}),
        ...(input.notes !== undefined ? { notes: input.notes?.trim() || null } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
      }
    });
  }

  // ─── Categorias de serviço ────────────────────────────────────────

  async ensureDefaultCategories(companyId?: string | null) {
    const where: Prisma.GestaoOsServiceCategoryWhereInput = companyId
      ? { companyId }
      : { companyId: null };
    const count = await prisma.gestaoOsServiceCategory.count({ where });
    if (count > 0) return;
    await prisma.gestaoOsServiceCategory.createMany({
      data: DEFAULT_CATEGORIES.map((c) => ({
        companyId: companyId || null,
        name: c.name,
        code: c.code
      })),
      skipDuplicates: true
    });
  }

  async listCategories(companyId?: string | null) {
    await this.ensureDefaultCategories(companyId || null);
    const where: Prisma.GestaoOsServiceCategoryWhereInput = {};
    if (companyId) where.OR = [{ companyId }, { companyId: null }];
    const rows = await prisma.gestaoOsServiceCategory.findMany({
      where,
      orderBy: { name: 'asc' }
    });
    const withChecklists = await Promise.all(
      rows.map(async (row) => {
        const checklistId = await loadCategoryChecklistId(row.id);
        let checklistItems: Array<{ id: string; label: string }> = [];
        if (checklistId) {
          const template = await prisma.gestaoOsChecklistTemplate.findUnique({
            where: { id: checklistId },
            select: { items: true }
          });
          if (Array.isArray(template?.items)) {
            checklistItems = (template!.items as Array<{ id?: string; label?: string }>)
              .map((item, idx) => ({
                id: item.id || `item-${idx + 1}`,
                label: String(item.label ?? '').trim()
              }))
              .filter((item) => item.label);
          }
        }
        return { ...row, checklistId, checklistItems };
      })
    );
    return withChecklists;
  }

  async createCategory(input: {
    companyId?: string | null;
    name?: string;
    code?: string | null;
    description?: string | null;
    checklistItems?: unknown;
  }) {
    const name = String(input.name ?? '').trim();
    if (!name) throw createError('Informe o nome da categoria', 400);
    const created = await prisma.gestaoOsServiceCategory.create({
      data: {
        companyId: input.companyId?.trim() || null,
        name,
        code: input.code?.trim() || null,
        description: input.description?.trim() || null
      }
    });
    const labels = parseChecklistLabels(input.checklistItems);
    let checklistId: string | null = null;
    if (labels.length) {
      checklistId = await upsertChecklistTemplate({
        companyId: created.companyId,
        name: `Tipo: ${created.name}`,
        planType: 'PREVENTIVE',
        category: created.name,
        labels
      });
      await persistCategoryChecklistId(created.id, checklistId);
    }
    return { ...created, checklistId, checklistItems: labels.map((label, idx) => ({ id: `item-${idx + 1}`, label })) };
  }

  async updateCategory(
    id: string,
    input: {
      name?: string;
      code?: string | null;
      description?: string | null;
      isActive?: boolean;
      checklistItems?: unknown;
    }
  ) {
    const existing = await prisma.gestaoOsServiceCategory.findUnique({ where: { id } });
    if (!existing) throw createError('Categoria não encontrada', 404);
    const updated = await prisma.gestaoOsServiceCategory.update({
      where: { id },
      data: {
        ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
        ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
        ...(input.description !== undefined
          ? { description: input.description?.trim() || null }
          : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
      }
    });
    if (input.checklistItems === undefined) {
      const checklistId = await loadCategoryChecklistId(id);
      return { ...updated, checklistId };
    }
    const labels = parseChecklistLabels(input.checklistItems);
    const existingChecklistId = await loadCategoryChecklistId(id);
    if (!labels.length) {
      await persistCategoryChecklistId(id, null);
      return { ...updated, checklistId: null, checklistItems: [] };
    }
    const checklistId = await upsertChecklistTemplate({
      companyId: updated.companyId,
      name: `Tipo: ${updated.name}`,
      planType: 'PREVENTIVE',
      category: updated.name,
      labels,
      existingId: existingChecklistId
    });
    await persistCategoryChecklistId(id, checklistId);
    return {
      ...updated,
      checklistId,
      checklistItems: labels.map((label, idx) => ({ id: `item-${idx + 1}`, label }))
    };
  }

  async deleteCategory(id: string) {
    const existing = await prisma.gestaoOsServiceCategory.findUnique({ where: { id } });
    if (!existing) throw createError('Categoria não encontrada', 404);
    await prisma.gestaoOsServiceCategory.delete({ where: { id } });
    return { id };
  }

  // ─── Configurações (numeração) ────────────────────────────────────

  async getSettings() {
    await prisma.$executeRawUnsafe(`
      INSERT INTO "gestao_os_settings" ("id", "nextOsNumber", "updatedAt")
      VALUES ('default', 1, CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO NOTHING;
    `);
    const rows = await prisma.$queryRaw<{ nextOsNumber: number }[]>`
      SELECT "nextOsNumber" FROM "gestao_os_settings" WHERE "id" = 'default' LIMIT 1
    `;
    const nextOsNumber = Number(rows[0]?.nextOsNumber ?? 1);
    const osAgg = await prisma.$queryRaw<{ max: number | null }[]>`
      SELECT MAX("osNumber")::int AS max FROM "gestao_os_work_orders"
    `;
    const maxExisting = Number(osAgg[0]?.max ?? 0);
    return {
      id: 'default',
      nextOsNumber,
      maxExistingDisplayNumber: maxExisting,
      suggestedNext: Math.max(maxExisting + 1, nextOsNumber)
    };
  }

  async updateSettings(input: { nextOsNumber?: unknown }) {
    const raw = Number(input.nextOsNumber);
    if (!Number.isFinite(raw) || raw < 1 || !Number.isInteger(raw)) {
      throw createError('Informe um número de OS válido (inteiro ≥ 1)', 400);
    }
    const osAgg = await prisma.$queryRaw<{ max: number | null }[]>`
      SELECT MAX("osNumber")::int AS max FROM "gestao_os_work_orders"
    `;
    const maxExisting = Number(osAgg[0]?.max ?? 0);
    if (raw <= maxExisting) {
      throw createError(
        `O próximo número deve ser maior que a última OS existente (#${maxExisting})`,
        400
      );
    }
    await prisma.$executeRaw`
      INSERT INTO "gestao_os_settings" ("id", "nextOsNumber", "updatedAt")
      VALUES ('default', ${raw}, CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO UPDATE
      SET "nextOsNumber" = EXCLUDED."nextOsNumber",
          "updatedAt" = CURRENT_TIMESTAMP
    `;
    return {
      id: 'default',
      nextOsNumber: raw,
      maxExistingDisplayNumber: maxExisting,
      suggestedNext: Math.max(maxExisting + 1, raw)
    };
  }

  // ─── Usuários / perfis ────────────────────────────────────────────

  async listMemberships(companyId?: string | null) {
    const where: Prisma.GestaoOsMembershipWhereInput = {};
    if (companyId) where.companyId = companyId;
    return prisma.gestaoOsMembership.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true, role: true, isActive: true } },
        company: { select: { id: true, name: true } }
      }
    });
  }

  async upsertMembership(input: {
    companyId?: string;
    userId?: string;
    profile?: unknown;
    isActive?: boolean;
  }) {
    const companyId = String(input.companyId ?? '').trim();
    const userId = String(input.userId ?? '').trim();
    if (!companyId) throw createError('Informe a empresa', 400);
    if (!userId) throw createError('Informe o usuário', 400);
    const profile = parseProfile(input.profile);
    const [company, user] = await Promise.all([
      prisma.gestaoOsCompany.findUnique({ where: { id: companyId } }),
      prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
    ]);
    if (!company) throw createError('Empresa não encontrada', 404);
    if (!user) throw createError('Usuário não encontrado', 404);
    return prisma.gestaoOsMembership.upsert({
      where: { companyId_userId: { companyId, userId } },
      create: {
        companyId,
        userId,
        profile,
        isActive: input.isActive !== undefined ? Boolean(input.isActive) : true
      },
      update: {
        profile,
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        company: { select: { id: true, name: true } }
      }
    });
  }

  async updateMembership(
    id: string,
    input: { profile?: unknown; isActive?: boolean }
  ) {
    const existing = await prisma.gestaoOsMembership.findUnique({ where: { id } });
    if (!existing) throw createError('Vínculo não encontrado', 404);
    return prisma.gestaoOsMembership.update({
      where: { id },
      data: {
        ...(input.profile !== undefined ? { profile: parseProfile(input.profile) } : {}),
        ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
      },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        company: { select: { id: true, name: true } }
      }
    });
  }

  async listUsersForMembership() {
    return prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
      take: 500
    });
  }
}

export const gestaoOsCadastrosService = new GestaoOsCadastrosService();
