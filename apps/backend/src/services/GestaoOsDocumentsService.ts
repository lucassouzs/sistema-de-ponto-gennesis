import { GestaoOsDocumentKind } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';
import {
  assertCanManageCadastros,
  type GestaoOsAccessContext
} from '../lib/gestaoOsAccess';

function parseKind(value: unknown): GestaoOsDocumentKind {
  const raw = String(value ?? 'OTHER').toUpperCase();
  if (raw === 'MANUAL' || raw === 'WARRANTY' || raw === 'LAUDO' || raw === 'ART' || raw === 'OTHER') {
    return raw;
  }
  throw createError('Tipo de documento inválido', 400);
}

export class GestaoOsDocumentsService {
  async list(
    _access: GestaoOsAccessContext,
    opts?: { buildingId?: string; assetId?: string; kind?: string }
  ) {
    return prisma.gestaoOsDocument.findMany({
      where: {
        ...(opts?.buildingId ? { buildingId: opts.buildingId } : {}),
        ...(opts?.assetId ? { assetId: opts.assetId } : {}),
        ...(opts?.kind ? { kind: parseKind(opts.kind) } : {})
      },
      include: {
        building: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true } },
        uploadedBy: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 300
    });
  }

  async create(access: GestaoOsAccessContext, body: Record<string, unknown>, userId: string) {
    let companyId = access.companyId || (typeof body.companyId === 'string' ? body.companyId : null);
    if (!companyId) {
      const first = await prisma.gestaoOsCompany.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: 'asc' }
      });
      companyId = first?.id ?? null;
    }
    if (!companyId) {
      throw createError('Cadastre uma empresa em Cadastros antes de anexar documentos', 400);
    }
    const title = String(body.title ?? '').trim();
    const fileUrl = String(body.fileUrl ?? '').trim();
    if (!title) throw createError('Título obrigatório', 400);
    if (!fileUrl) throw createError('Arquivo obrigatório', 400);

    return prisma.gestaoOsDocument.create({
      data: {
        companyId,
        title,
        fileUrl,
        fileName: body.fileName ? String(body.fileName) : null,
        mimeType: body.mimeType ? String(body.mimeType) : null,
        kind: parseKind(body.kind),
        notes: body.notes ? String(body.notes).trim() : null,
        buildingId: body.buildingId ? String(body.buildingId) : null,
        assetId: body.assetId ? String(body.assetId) : null,
        uploadedById: userId
      },
      include: {
        building: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true } }
      }
    });
  }

  async remove(access: GestaoOsAccessContext, id: string) {
    assertCanManageCadastros(access);
    const doc = await prisma.gestaoOsDocument.findUnique({ where: { id } });
    if (!doc) throw createError('Documento não encontrado', 404);
    await prisma.gestaoOsDocument.delete({ where: { id } });
    return { ok: true };
  }
}

export const gestaoOsDocumentsService = new GestaoOsDocumentsService();
