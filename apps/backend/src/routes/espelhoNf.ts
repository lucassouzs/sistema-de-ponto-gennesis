import { Router } from 'express';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { requireAnyModuleAccess, requireModuleAccess } from '../middleware/permissionAuth';
import { createError } from '../middleware/errorHandler';

const ESPELHO_NF_KEY = pathToModuleKey('/ponto/espelho-nf');
const PRESTADORES_KEY = pathToModuleKey('/ponto/espelho-nf/prestadores-servico');
const TOMADORES_KEY = pathToModuleKey('/ponto/espelho-nf/tomadores-servico');
const CONTAS_BANCARIAS_KEY = pathToModuleKey('/ponto/espelho-nf/contas-bancarias');
const CODIGOS_TRIBUTARIOS_KEY = pathToModuleKey('/ponto/espelho-nf/codigos-tributarios');
const APROVAR_ESPELHO_NF_KEY = pathToModuleKey('/ponto/controle/aprovar-espelho-nf');

/** O bootstrap carrega os dados usados pelo espelho, por cada tela de cadastro e pela aprovação. */
const requireEspelhoNfRead = requireAnyModuleAccess([
  ESPELHO_NF_KEY,
  PRESTADORES_KEY,
  TOMADORES_KEY,
  CONTAS_BANCARIAS_KEY,
  CODIGOS_TRIBUTARIOS_KEY,
  APROVAR_ESPELHO_NF_KEY,
]);

const COLLECTION_TYPES = ['RETIDO', 'RECOLHIDO'] as const;
function normCollectionType(v: unknown): string {
  const s = String(v ?? '').toUpperCase();
  return (COLLECTION_TYPES as readonly string[]).includes(s) ? s : 'RETIDO';
}

/** Garante objeto JSON puro para colunas Prisma Json (evita referências / tipos não serializáveis). */
function cloneForPrismaJsonColumn(v: unknown): object | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v) as unknown;
      return p !== null && typeof p === 'object' ? (p as object) : null;
    } catch {
      return null;
    }
  }
  try {
    return JSON.parse(JSON.stringify(v)) as object;
  } catch {
    return null;
  }
}

/**
 * Grava `federalRatesByContext` / `federalTaxContextEnabled` direto no PostgreSQL (JSONB).
 * O Prisma `create`/`update` às vezes não persiste campos Json em alguns runtimes; este flush usa SQL explícito.
 */
async function flushTaxCodeFederalJsonColumns(p: any, id: string, raw: Record<string, any>): Promise<void> {
  const hasR = Object.prototype.hasOwnProperty.call(raw, 'federalRatesByContext');
  const hasE = Object.prototype.hasOwnProperty.call(raw, 'federalTaxContextEnabled');
  if (!hasR && !hasE) return;

  const vals: unknown[] = [];
  const sets: string[] = [];
  let i = 1;
  if (hasR) {
    const parsed = cloneForPrismaJsonColumn(raw.federalRatesByContext);
    sets.push(`"federalRatesByContext" = $${i++}::jsonb`);
    vals.push(parsed === null ? null : JSON.stringify(parsed));
  }
  if (hasE) {
    const parsed = cloneForPrismaJsonColumn(raw.federalTaxContextEnabled);
    sets.push(`"federalTaxContextEnabled" = $${i++}::jsonb`);
    vals.push(parsed === null ? null : JSON.stringify(parsed));
  }
  vals.push(id);
  const sql = `UPDATE "espelho_nf_tax_codes" SET ${sets.join(', ')} WHERE "id" = $${i}`;
  await p.$executeRawUnsafe(sql, ...vals);
}

function stripFederalJsonFieldsForPrisma(data: Record<string, any>): Record<string, any> {
  const { federalRatesByContext: _r, federalTaxContextEnabled: _e, ...rest } = data;
  return rest;
}

const router = Router();
router.use(authenticate);

router.get('/bootstrap', requireEspelhoNfRead, async (_req, res, next) => {
  try {
    const p = prisma as any;
    const [providers, takers, bankAccounts, taxCodes, mirrors] = await Promise.all([
      p.espelhoNfServiceProvider.findMany({ orderBy: { createdAt: 'desc' } }),
      p.espelhoNfServiceTaker.findMany({ orderBy: { createdAt: 'desc' } }),
      p.espelhoNfBankAccount.findMany({ orderBy: { createdAt: 'desc' } }),
      p.espelhoNfTaxCode.findMany({ orderBy: { createdAt: 'desc' } }),
      p.espelhoNfMirror.findMany({ orderBy: { createdAt: 'desc' } })
    ]);

    return res.status(200).json({
      success: true,
      data: {
        providers,
        takers,
        bankAccounts,
        taxCodes: taxCodes.map((t: any) => ({
          id: t.id,
          cityName: t.name,
          abatesMaterial: t.abatesMaterial,
          hasComplementaryWarranty: Boolean(t.hasComplementaryWarranty),
          garantiaRetidaNaNota:
            Boolean(t.hasComplementaryWarranty) &&
            (t.garantiaRetidaNaNota === true || t.garantiaRetidaNaNota === false)
              ? t.garantiaRetidaNaNota
              : null,
          garantiaAliquota: Boolean(t.hasComplementaryWarranty) ? String(t.garantiaAliquota ?? '') : '',
          issRate: t.issRate,
          cofins: { collectionType: t.cofinsCollectionType },
          csll: { collectionType: t.csllCollectionType },
          inss: { collectionType: t.inssCollectionType },
          irpj: { collectionType: t.irpjCollectionType },
          pis: { collectionType: t.pisCollectionType },
          iss: { collectionType: t.issCollectionType },
          inssMaterialLimit: t.inssMaterialLimit,
          issMaterialLimit: t.issMaterialLimit,
          federalRatesByContext: t.federalRatesByContext ?? null,
          federalTaxContextEnabled: t.federalTaxContextEnabled ?? null
        })),
        mirrors: mirrors.map((m: any) => ({
          id: m.id,
          createdAt: m.createdAt?.toISOString?.() ?? m.createdAt,
          measurementRef: m.measurementRef ?? '',
          costCenterId: m.costCenterId ?? '',
          dueDate: m.dueDate ? new Date(m.dueDate).toISOString().slice(0, 10) : '',
          municipality: m.municipality ?? '',
          cnae: m.cnae ?? '41.20-4-00',
          serviceIssqn: m.serviceIssqn ?? '',
          empenhoNumber: m.empenhoNumber ?? '',
          processNumber: m.processNumber ?? '',
          serviceOrder: m.serviceOrder ?? '',
          measurementStartDate: m.measurementStartDate ?? '',
          measurementEndDate: m.measurementEndDate ?? '',
          buildingUnit: m.buildingUnit ?? '',
          obraCno: m.obraCno ?? '',
          garantiaComplementar: m.garantiaComplementar ?? '',
          observations: m.observations ?? '',
          notes: m.notes ?? '',
          measurementAmount: m.measurementAmount ?? '',
          laborAmount: m.laborAmount ?? '',
          materialAmount: m.materialAmount ?? '',
          providerId: m.providerId ?? '',
          providerName: '',
          takerId: m.takerId ?? '',
          takerName: '',
          bankAccountId: m.bankAccountId ?? '',
          bankAccountName: '',
          taxCodeId: m.taxCodeId ?? '',
          taxCodeCityName: '',
          nfAttachment:
            m.nfAttachmentDataUrl && m.nfAttachmentName
              ? {
                  name: m.nfAttachmentName,
                  mimeType: m.nfAttachmentMimeType ?? 'application/octet-stream',
                  size: m.nfAttachmentSize ?? 0,
                  dataUrl: m.nfAttachmentDataUrl
                }
              : undefined,
          xmlAttachment:
            m.xmlAttachmentDataUrl && m.xmlAttachmentName
              ? {
                  name: m.xmlAttachmentName,
                  mimeType: m.xmlAttachmentMimeType ?? 'application/octet-stream',
                  size: m.xmlAttachmentSize ?? 0,
                  dataUrl: m.xmlAttachmentDataUrl
                }
              : undefined,
          nfConstarNaNota: m.nfConstarNaNota ?? null,
          nfConstarNaNotaAcknowledged: Boolean(m.nfConstarNaNotaAcknowledged)
        }))
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/bootstrap', requireEspelhoNfRead, async (req, res, next) => {
  try {
    const p = prisma as any;
    const mirrorHasCnae = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some((field: any) => field?.name === 'cnae')
    );
    const mirrorHasMunicipality = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some(
        (field: any) => field?.name === 'municipality'
      )
    );
    const mirrorHasServiceIssqn = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some(
        (field: any) => field?.name === 'serviceIssqn'
      )
    );
    const mirrorHasMeasurementStartDate = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some(
        (field: any) => field?.name === 'measurementStartDate'
      )
    );
    const mirrorHasMeasurementEndDate = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some(
        (field: any) => field?.name === 'measurementEndDate'
      )
    );
    const mirrorHasNfConstarNaNota = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some(
        (field: any) => field?.name === 'nfConstarNaNota'
      )
    );
    const mirrorHasNfConstarNaNotaAcknowledged = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some(
        (field: any) => field?.name === 'nfConstarNaNotaAcknowledged'
      )
    );
    const mirrorHasObraCno = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some((field: any) => field?.name === 'obraCno')
    );
    const mirrorHasGarantiaComplementar = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfMirror?.fields?.some(
        (field: any) => field?.name === 'garantiaComplementar'
      )
    );
    const taxCodeHasComplementaryWarranty = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfTaxCode?.fields?.some(
        (field: any) => field?.name === 'hasComplementaryWarranty'
      )
    );
    const taxCodeHasGarantiaRetidaNaNota = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfTaxCode?.fields?.some(
        (field: any) => field?.name === 'garantiaRetidaNaNota'
      )
    );
    const taxCodeHasGarantiaAliquota = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfTaxCode?.fields?.some(
        (field: any) => field?.name === 'garantiaAliquota'
      )
    );
    const {
      providers = [],
      takers = [],
      bankAccounts = [],
      taxCodes = [],
      mirrors = []
    } = (req.body || {}) as Record<string, any[]>;
    const takerHasMunicipality = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfServiceTaker?.fields?.some(
        (field: any) => field?.name === 'municipality'
      )
    );

    if (
      !p.espelhoNfMirror ||
      !p.espelhoNfServiceTaker ||
      !p.espelhoNfServiceProvider ||
      !p.espelhoNfBankAccount ||
      !p.espelhoNfTaxCode
    ) {
      throw new Error('Prisma Client desatualizado para o módulo Espelho NF. Reinicie o backend.');
    }

    const ops: any[] = [
      p.espelhoNfMirror.deleteMany(),
      p.espelhoNfServiceTaker.deleteMany(),
      p.espelhoNfServiceProvider.deleteMany(),
      p.espelhoNfBankAccount.deleteMany(),
      p.espelhoNfTaxCode.deleteMany()
    ];

    if (providers.length > 0) {
      ops.push(
        p.espelhoNfServiceProvider.createMany({
          data: providers.map((item: any) => ({
            id: String(item.id),
            cnpj: String(item.cnpj ?? ''),
            municipalRegistration: String(item.municipalRegistration ?? ''),
            stateRegistration: String(item.stateRegistration ?? ''),
            corporateName: String(item.corporateName ?? ''),
            tradeName: String(item.tradeName ?? ''),
            address: String(item.address ?? ''),
            city: String(item.city ?? ''),
            state: String(item.state ?? ''),
            email: item.email ? String(item.email) : null
          }))
        })
      );
    }

    if (bankAccounts.length > 0) {
      ops.push(
        p.espelhoNfBankAccount.createMany({
          data: bankAccounts.map((item: any) => ({
            id: String(item.id),
            name: String(item.name ?? ''),
            bank: String(item.bank ?? ''),
            agency: String(item.agency ?? ''),
            account: String(item.account ?? '')
          }))
        })
      );
    }

    if (taxCodes.length > 0) {
      ops.push(
        p.espelhoNfTaxCode.createMany({
          data: taxCodes.map((item: any) => ({
            id: String(item.id),
            name: String(item.cityName ?? ''),
            abatesMaterial: Boolean(item.abatesMaterial),
            ...(taxCodeHasComplementaryWarranty
              ? { hasComplementaryWarranty: Boolean(item.hasComplementaryWarranty) }
              : {}),
            ...(taxCodeHasGarantiaRetidaNaNota
              ? {
                  garantiaRetidaNaNota:
                    Boolean(item.hasComplementaryWarranty) &&
                    (item.garantiaRetidaNaNota === true || item.garantiaRetidaNaNota === false)
                      ? item.garantiaRetidaNaNota
                      : null
                }
              : {}),
            ...(taxCodeHasGarantiaAliquota
              ? {
                  garantiaAliquota: Boolean(item.hasComplementaryWarranty)
                    ? String(item.garantiaAliquota ?? '')
                    : ''
                }
              : {}),
            issRate: String(item.issRate ?? ''),
            cofinsCollectionType: String(item?.cofins?.collectionType ?? 'RETIDO'),
            csllCollectionType: String(item?.csll?.collectionType ?? 'RETIDO'),
            inssCollectionType: String(item?.inss?.collectionType ?? 'RETIDO'),
            irpjCollectionType: String(item?.irpj?.collectionType ?? 'RETIDO'),
            pisCollectionType: String(item?.pis?.collectionType ?? 'RETIDO'),
            issCollectionType: String(item?.iss?.collectionType ?? 'RETIDO'),
            inssMaterialLimit: String(item.inssMaterialLimit ?? ''),
            issMaterialLimit: String(item.issMaterialLimit ?? ''),
            federalRatesByContext: item.federalRatesByContext ?? null,
            federalTaxContextEnabled: item.federalTaxContextEnabled ?? null
          }))
        })
      );
    }

    if (takers.length > 0) {
      ops.push(
        p.espelhoNfServiceTaker.createMany({
          data: takers.map((item: any) => ({
            id: String(item.id),
            name: String(item.name ?? ''),
            cnpj: String(item.cnpj ?? ''),
            municipalRegistration: String(item.municipalRegistration ?? ''),
            stateRegistration: String(item.stateRegistration ?? ''),
            corporateName: String(item.corporateName ?? ''),
            costCenterId: String(item.costCenterId ?? ''),
            taxCodeId: String(item.taxCodeId ?? ''),
            bankAccountId: String(item.bankAccountId ?? ''),
            address: String(item.address ?? ''),
            ...(takerHasMunicipality
              ? { municipality: String(item.municipality ?? item.city ?? '') }
              : {}),
            city: String(item.city ?? ''),
            state: String(item.state ?? ''),
            contractRef: String(item.contractRef ?? ''),
            serviceDescription: String(item.serviceDescription ?? '')
          }))
        })
      );
    }

    if (mirrors.length > 0) {
      ops.push(
        p.espelhoNfMirror.createMany({
          data: mirrors.map((item: any) => ({
            id: String(item.id),
            measurementRef: String(item.measurementRef ?? ''),
            costCenterId: String(item.costCenterId ?? ''),
            dueDate: item.dueDate ? new Date(String(item.dueDate)) : null,
            ...(mirrorHasMunicipality ? { municipality: String(item.municipality ?? '') } : {}),
            ...(mirrorHasCnae ? { cnae: item.cnae ? String(item.cnae) : '41.20-4-00' } : {}),
            ...(mirrorHasServiceIssqn
              ? { serviceIssqn: item.serviceIssqn ? String(item.serviceIssqn) : null }
              : {}),
            empenhoNumber: item.empenhoNumber ? String(item.empenhoNumber) : null,
            processNumber: item.processNumber ? String(item.processNumber) : null,
            serviceOrder: item.serviceOrder ? String(item.serviceOrder) : null,
            ...(mirrorHasMeasurementStartDate
              ? { measurementStartDate: item.measurementStartDate ? String(item.measurementStartDate) : null }
              : {}),
            ...(mirrorHasMeasurementEndDate
              ? { measurementEndDate: item.measurementEndDate ? String(item.measurementEndDate) : null }
              : {}),
            buildingUnit: item.buildingUnit ? String(item.buildingUnit) : null,
            ...(mirrorHasObraCno
              ? { obraCno: item.obraCno ? String(item.obraCno) : null }
              : {}),
            ...(mirrorHasGarantiaComplementar
              ? {
                  garantiaComplementar: item.garantiaComplementar
                    ? String(item.garantiaComplementar)
                    : null
                }
              : {}),
            observations: item.observations ? String(item.observations) : null,
            notes: item.notes ? String(item.notes) : null,
            measurementAmount: String(item.measurementAmount ?? ''),
            laborAmount: String(item.laborAmount ?? ''),
            materialAmount: String(item.materialAmount ?? ''),
            providerId: String(item.providerId ?? ''),
            takerId: String(item.takerId ?? ''),
            bankAccountId: String(item.bankAccountId ?? ''),
            taxCodeId: String(item.taxCodeId ?? ''),
            createdAt: item.createdAt ? new Date(String(item.createdAt)) : undefined,
            nfAttachmentName: item?.nfAttachment?.name ? String(item.nfAttachment.name) : null,
            nfAttachmentMimeType: item?.nfAttachment?.mimeType ? String(item.nfAttachment.mimeType) : null,
            nfAttachmentSize:
              item?.nfAttachment?.size != null && Number.isFinite(Number(item.nfAttachment.size))
                ? Number(item.nfAttachment.size)
                : null,
            nfAttachmentDataUrl: item?.nfAttachment?.dataUrl ? String(item.nfAttachment.dataUrl) : null,
            xmlAttachmentName: item?.xmlAttachment?.name ? String(item.xmlAttachment.name) : null,
            xmlAttachmentMimeType: item?.xmlAttachment?.mimeType ? String(item.xmlAttachment.mimeType) : null,
            xmlAttachmentSize:
              item?.xmlAttachment?.size != null && Number.isFinite(Number(item.xmlAttachment.size))
                ? Number(item.xmlAttachment.size)
                : null,
            xmlAttachmentDataUrl: item?.xmlAttachment?.dataUrl ? String(item.xmlAttachment.dataUrl) : null,
            ...(mirrorHasNfConstarNaNota
              ? {
                  nfConstarNaNota:
                    item.nfConstarNaNota != null && typeof item.nfConstarNaNota === 'object'
                      ? item.nfConstarNaNota
                      : null
                }
              : {}),
            ...(mirrorHasNfConstarNaNotaAcknowledged
              ? { nfConstarNaNotaAcknowledged: Boolean(item.nfConstarNaNotaAcknowledged) }
              : {})
          }))
        })
      );
    }

    await p.$transaction(ops);

    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
});

/** CRUD granular (cadastros auxiliares do Espelho NF) — não substitui PUT /bootstrap usado pela tela principal. */
function prismaEspelho() {
  const p = prisma as any;
  if (
    !p?.espelhoNfServiceProvider ||
    !p?.espelhoNfBankAccount ||
    !p?.espelhoNfTaxCode ||
    !p?.espelhoNfServiceTaker ||
    !p?.espelhoNfMirror
  ) {
    throw createError('Prisma Client desatualizado para o módulo Espelho NF.', 500);
  }
  return p;
}

function taxCodePayloadToPrismaData(body: Record<string, any>) {
  const p = prisma as any;
  const taxCodeHasComplementaryWarranty = Boolean(
    p?._runtimeDataModel?.models?.EspelhoNfTaxCode?.fields?.some(
      (field: any) => field?.name === 'hasComplementaryWarranty'
    )
  );
  const taxCodeHasGarantiaRetidaNaNota = Boolean(
    p?._runtimeDataModel?.models?.EspelhoNfTaxCode?.fields?.some(
      (field: any) => field?.name === 'garantiaRetidaNaNota'
    )
  );
  const taxCodeHasGarantiaAliquota = Boolean(
    p?._runtimeDataModel?.models?.EspelhoNfTaxCode?.fields?.some(
      (field: any) => field?.name === 'garantiaAliquota'
    )
  );

  const name = String(body.cityName ?? body.name ?? '').trim();
  const abatesMaterial = Boolean(body.abatesMaterial);
  const hasWarranty = Boolean(body.hasComplementaryWarranty);
  const gr = body.garantiaRetidaNaNota;
  const base: Record<string, any> = {
    name,
    abatesMaterial,
    issRate: String(body.issRate ?? ''),
    cofinsCollectionType: normCollectionType(body?.cofins?.collectionType),
    csllCollectionType: normCollectionType(body?.csll?.collectionType),
    inssCollectionType: normCollectionType(body?.inss?.collectionType),
    irpjCollectionType: normCollectionType(body?.irpj?.collectionType),
    pisCollectionType: normCollectionType(body?.pis?.collectionType),
    issCollectionType: normCollectionType(body?.iss?.collectionType),
    inssMaterialLimit: String(body.inssMaterialLimit ?? ''),
    issMaterialLimit: String(body.issMaterialLimit ?? ''),
  };
  if (taxCodeHasComplementaryWarranty) {
    base.hasComplementaryWarranty = hasWarranty;
  }
  if (taxCodeHasGarantiaRetidaNaNota) {
    base.garantiaRetidaNaNota =
      hasWarranty && (gr === true || gr === false) ? gr : null;
  }
  if (taxCodeHasGarantiaAliquota) {
    base.garantiaAliquota = hasWarranty ? String(body.garantiaAliquota ?? '') : '';
  }
  /** Colunas JSON federais são gravadas via `flushTaxCodeFederalJsonColumns` (SQL), não no objeto `data` do Prisma. */
  return base;
}

function taxCodeDbRowToApiBody(row: Record<string, any>) {
  return {
    cityName: row.name,
    abatesMaterial: row.abatesMaterial,
    hasComplementaryWarranty: row.hasComplementaryWarranty,
    garantiaRetidaNaNota: row.garantiaRetidaNaNota,
    garantiaAliquota: row.garantiaAliquota ?? '',
    issRate: row.issRate,
    cofins: { collectionType: row.cofinsCollectionType },
    csll: { collectionType: row.csllCollectionType },
    inss: { collectionType: row.inssCollectionType },
    irpj: { collectionType: row.irpjCollectionType },
    pis: { collectionType: row.pisCollectionType },
    iss: { collectionType: row.issCollectionType },
    inssMaterialLimit: row.inssMaterialLimit,
    issMaterialLimit: row.issMaterialLimit,
    federalRatesByContext: row.federalRatesByContext ?? null,
    federalTaxContextEnabled: row.federalTaxContextEnabled ?? null
  };
}

// --- Prestadores ---
router.post('/service-providers', requireModuleAccess(PRESTADORES_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const b = (req.body || {}) as Record<string, any>;
    const corporateName = String(b.corporateName ?? '').trim();
    if (!corporateName) throw createError('Razão social é obrigatória.', 400);
    const created = await p.espelhoNfServiceProvider.create({
      data: {
        cnpj: String(b.cnpj ?? ''),
        municipalRegistration: String(b.municipalRegistration ?? ''),
        stateRegistration: String(b.stateRegistration ?? ''),
        corporateName,
        tradeName: String(b.tradeName ?? ''),
        address: String(b.address ?? ''),
        city: String(b.city ?? ''),
        state: String(b.state ?? ''),
        email: b.email != null && String(b.email).trim() !== '' ? String(b.email).trim() : null,
      },
    });
    return res.status(201).json({ success: true, data: created });
  } catch (e) {
    return next(e);
  }
});

router.patch('/service-providers/:id', requireModuleAccess(PRESTADORES_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const { id } = req.params;
    const b = (req.body || {}) as Record<string, any>;
    if (b.corporateName !== undefined && !String(b.corporateName).trim()) {
      throw createError('Razão social é obrigatória.', 400);
    }
    const updated = await p.espelhoNfServiceProvider.update({
      where: { id },
      data: {
        cnpj: b.cnpj !== undefined ? String(b.cnpj) : undefined,
        municipalRegistration:
          b.municipalRegistration !== undefined ? String(b.municipalRegistration) : undefined,
        stateRegistration: b.stateRegistration !== undefined ? String(b.stateRegistration) : undefined,
        corporateName: b.corporateName !== undefined ? String(b.corporateName).trim() : undefined,
        tradeName: b.tradeName !== undefined ? String(b.tradeName) : undefined,
        address: b.address !== undefined ? String(b.address) : undefined,
        city: b.city !== undefined ? String(b.city) : undefined,
        state: b.state !== undefined ? String(b.state) : undefined,
        email:
          b.email === null
            ? null
            : b.email !== undefined
              ? String(b.email).trim() || null
              : undefined,
      },
    });
    return res.json({ success: true, data: updated });
  } catch (e: any) {
    if (e?.code === 'P2025') return next(createError('Prestador não encontrado.', 404));
    return next(e);
  }
});

router.delete('/service-providers/:id', requireModuleAccess(PRESTADORES_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const { id } = req.params;
    const n = await p.espelhoNfMirror.count({ where: { providerId: id } });
    if (n > 0) throw createError('Não é possível excluir: há espelhos de NF vinculados a este prestador.', 400);
    await p.espelhoNfServiceProvider.delete({ where: { id } });
    return res.json({ success: true });
  } catch (e: any) {
    if (e?.code === 'P2025') return next(createError('Prestador não encontrado.', 404));
    return next(e);
  }
});

// --- Contas bancárias ---
router.post('/bank-accounts', requireModuleAccess(CONTAS_BANCARIAS_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const b = (req.body || {}) as Record<string, any>;
    const name = String(b.name ?? '').trim();
    if (!name) throw createError('Nome da conta é obrigatório.', 400);
    const created = await p.espelhoNfBankAccount.create({
      data: {
        name,
        bank: String(b.bank ?? ''),
        agency: String(b.agency ?? ''),
        account: String(b.account ?? ''),
      },
    });
    return res.status(201).json({ success: true, data: created });
  } catch (e) {
    return next(e);
  }
});

router.patch('/bank-accounts/:id', requireModuleAccess(CONTAS_BANCARIAS_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const { id } = req.params;
    const b = (req.body || {}) as Record<string, any>;
    const updated = await p.espelhoNfBankAccount.update({
      where: { id },
      data: {
        name: b.name !== undefined ? String(b.name).trim() : undefined,
        bank: b.bank !== undefined ? String(b.bank) : undefined,
        agency: b.agency !== undefined ? String(b.agency) : undefined,
        account: b.account !== undefined ? String(b.account) : undefined,
      },
    });
    return res.json({ success: true, data: updated });
  } catch (e: any) {
    if (e?.code === 'P2025') return next(createError('Conta bancária não encontrada.', 404));
    return next(e);
  }
});

router.delete('/bank-accounts/:id', requireModuleAccess(CONTAS_BANCARIAS_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const { id } = req.params;
    const [mir, tak] = await Promise.all([
      p.espelhoNfMirror.count({ where: { bankAccountId: id } }),
      p.espelhoNfServiceTaker.count({ where: { bankAccountId: id } }),
    ]);
    if (mir + tak > 0) {
      throw createError('Não é possível excluir: conta em uso por tomador ou espelho de NF.', 400);
    }
    await p.espelhoNfBankAccount.delete({ where: { id } });
    return res.json({ success: true });
  } catch (e: any) {
    if (e?.code === 'P2025') return next(createError('Conta bancária não encontrada.', 404));
    return next(e);
  }
});

// --- Códigos tributários ---
router.post('/tax-codes', requireModuleAccess(CODIGOS_TRIBUTARIOS_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const raw = (req.body || {}) as Record<string, any>;
    const data = stripFederalJsonFieldsForPrisma(taxCodePayloadToPrismaData(raw));
    if (!data.name) throw createError('Nome (município / código) é obrigatório.', 400);
    const created = await p.espelhoNfTaxCode.create({ data });
    await flushTaxCodeFederalJsonColumns(p, created.id, raw);
    const out = await p.espelhoNfTaxCode.findUnique({ where: { id: created.id } });
    return res.status(201).json({ success: true, data: out });
  } catch (e) {
    return next(e);
  }
});

router.patch('/tax-codes/:id', requireModuleAccess(CODIGOS_TRIBUTARIOS_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const { id } = req.params;
    const cur = await p.espelhoNfTaxCode.findUnique({ where: { id } });
    if (!cur) return next(createError('Código tributário não encontrado.', 404));
    const incoming = (req.body || {}) as Record<string, any>;
    const merged = { ...taxCodeDbRowToApiBody(cur as any), ...incoming };
    if (Object.prototype.hasOwnProperty.call(incoming, 'federalRatesByContext')) {
      merged.federalRatesByContext = incoming.federalRatesByContext;
    }
    if (Object.prototype.hasOwnProperty.call(incoming, 'federalTaxContextEnabled')) {
      merged.federalTaxContextEnabled = incoming.federalTaxContextEnabled;
    }
    const data = stripFederalJsonFieldsForPrisma(taxCodePayloadToPrismaData(merged as Record<string, any>));
    if (!data.name) throw createError('Nome (município / código) é obrigatório.', 400);
    await p.espelhoNfTaxCode.update({ where: { id }, data });
    await flushTaxCodeFederalJsonColumns(p, id, incoming);
    const out = await p.espelhoNfTaxCode.findUnique({ where: { id } });
    return res.json({ success: true, data: out });
  } catch (e: any) {
    if (e?.code === 'P2025') return next(createError('Código tributário não encontrado.', 404));
    return next(e);
  }
});

router.delete('/tax-codes/:id', requireModuleAccess(CODIGOS_TRIBUTARIOS_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const { id } = req.params;
    const [mir, tak] = await Promise.all([
      p.espelhoNfMirror.count({ where: { taxCodeId: id } }),
      p.espelhoNfServiceTaker.count({ where: { taxCodeId: id } }),
    ]);
    if (mir + tak > 0) {
      throw createError('Não é possível excluir: código em uso por tomador ou espelho de NF.', 400);
    }
    await p.espelhoNfTaxCode.delete({ where: { id } });
    return res.json({ success: true });
  } catch (e: any) {
    if (e?.code === 'P2025') return next(createError('Código tributário não encontrado.', 404));
    return next(e);
  }
});

// --- Tomadores ---
router.post('/service-takers', requireModuleAccess(TOMADORES_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const b = (req.body || {}) as Record<string, any>;
    const corporateName = String(b.corporateName ?? '').trim();
    const costCenterId = String(b.costCenterId ?? '').trim();
    const taxCodeId = String(b.taxCodeId ?? '').trim();
    const bankAccountId = String(b.bankAccountId ?? '').trim();
    if (!corporateName) throw createError('Razão social do tomador é obrigatória.', 400);
    if (!costCenterId || !taxCodeId || !bankAccountId) {
      throw createError('Centro de custo, código tributário e conta bancária são obrigatórios.', 400);
    }
    const [cc, tx, bk] = await Promise.all([
      prisma.costCenter.findUnique({ where: { id: costCenterId } }),
      p.espelhoNfTaxCode.findUnique({ where: { id: taxCodeId } }),
      p.espelhoNfBankAccount.findUnique({ where: { id: bankAccountId } }),
    ]);
    if (!cc) throw createError('Centro de custo inválido.', 400);
    if (!tx) throw createError('Código tributário inválido.', 400);
    if (!bk) throw createError('Conta bancária inválida.', 400);

    const takerHasMunicipality = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfServiceTaker?.fields?.some(
        (field: any) => field?.name === 'municipality'
      )
    );

    const created = await p.espelhoNfServiceTaker.create({
      data: {
        name: String(b.name ?? corporateName),
        cnpj: String(b.cnpj ?? ''),
        municipalRegistration: String(b.municipalRegistration ?? ''),
        stateRegistration: String(b.stateRegistration ?? ''),
        corporateName,
        costCenterId,
        taxCodeId,
        bankAccountId,
        address: String(b.address ?? ''),
        ...(takerHasMunicipality
          ? { municipality: String(b.municipality ?? b.city ?? '') }
          : {}),
        city: String(b.city ?? ''),
        state: String(b.state ?? ''),
        contractRef: String(b.contractRef ?? ''),
        serviceDescription: String(b.serviceDescription ?? ''),
      },
    });
    return res.status(201).json({ success: true, data: created });
  } catch (e) {
    return next(e);
  }
});

router.patch('/service-takers/:id', requireModuleAccess(TOMADORES_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const { id } = req.params;
    const b = (req.body || {}) as Record<string, any>;
    const takerHasMunicipality = Boolean(
      p?._runtimeDataModel?.models?.EspelhoNfServiceTaker?.fields?.some(
        (field: any) => field?.name === 'municipality'
      )
    );

    if (b.costCenterId) {
      const cc = await prisma.costCenter.findUnique({ where: { id: String(b.costCenterId) } });
      if (!cc) throw createError('Centro de custo inválido.', 400);
    }
    if (b.taxCodeId) {
      const tx = await p.espelhoNfTaxCode.findUnique({ where: { id: String(b.taxCodeId) } });
      if (!tx) throw createError('Código tributário inválido.', 400);
    }
    if (b.bankAccountId) {
      const bk = await p.espelhoNfBankAccount.findUnique({ where: { id: String(b.bankAccountId) } });
      if (!bk) throw createError('Conta bancária inválida.', 400);
    }

    const data: Record<string, any> = {
      name: b.name !== undefined ? String(b.name) : undefined,
      cnpj: b.cnpj !== undefined ? String(b.cnpj) : undefined,
      municipalRegistration: b.municipalRegistration !== undefined ? String(b.municipalRegistration) : undefined,
      stateRegistration: b.stateRegistration !== undefined ? String(b.stateRegistration) : undefined,
      corporateName: b.corporateName !== undefined ? String(b.corporateName).trim() : undefined,
      costCenterId: b.costCenterId !== undefined ? String(b.costCenterId) : undefined,
      taxCodeId: b.taxCodeId !== undefined ? String(b.taxCodeId) : undefined,
      bankAccountId: b.bankAccountId !== undefined ? String(b.bankAccountId) : undefined,
      address: b.address !== undefined ? String(b.address) : undefined,
      city: b.city !== undefined ? String(b.city) : undefined,
      state: b.state !== undefined ? String(b.state) : undefined,
      contractRef: b.contractRef !== undefined ? String(b.contractRef) : undefined,
      serviceDescription: b.serviceDescription !== undefined ? String(b.serviceDescription) : undefined,
    };
    if (takerHasMunicipality && b.municipality !== undefined) {
      data.municipality = String(b.municipality ?? '');
    }
    const updated = await p.espelhoNfServiceTaker.update({
      where: { id },
      data,
    });
    return res.json({ success: true, data: updated });
  } catch (e: any) {
    if (e?.code === 'P2025') return next(createError('Tomador não encontrado.', 404));
    return next(e);
  }
});

router.delete('/service-takers/:id', requireModuleAccess(TOMADORES_KEY), async (req, res, next) => {
  try {
    const p = prismaEspelho();
    const { id } = req.params;
    const n = await p.espelhoNfMirror.count({ where: { takerId: id } });
    if (n > 0) throw createError('Não é possível excluir: há espelhos de NF vinculados a este tomador.', 400);
    await p.espelhoNfServiceTaker.delete({ where: { id } });
    return res.json({ success: true });
  } catch (e: any) {
    if (e?.code === 'P2025') return next(createError('Tomador não encontrado.', 404));
    return next(e);
  }
});

export default router;
