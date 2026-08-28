import { Prisma } from '@prisma/client';
import { Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { savePersistentUpload, deletePersistentUpload } from '../lib/persistentUpload';
import { fixMulterOriginalName } from '../lib/fixUploadFileName';
import { isZipBuffer, unzipAll } from '../lib/unzipBuffer';
import { extractZipArchive, walkFilesRecursive } from '../lib/extractZipArchive';

type Money = Prisma.Decimal | null;

function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function opt(value: unknown): string | null {
  const v = str(value);
  if (!v || v === '-' || v === '—' || v.toLowerCase() === 'n/a') return null;
  return v;
}

function parseMoney(value: unknown): Money {
  const raw = str(value)
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '');
  if (!raw || raw === '-' || raw === '—') return null;
  let normalized = raw;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastDot > lastComma) {
      normalized = raw.replace(/,/g, '');
    } else {
      normalized = raw.replace(/\./g, '').replace(',', '.');
    }
  } else if (lastComma >= 0) {
    const frac = raw.length - lastComma - 1;
    normalized = frac <= 2 ? raw.replace(',', '.') : raw.replace(/,/g, '');
  }
  const num = Number(normalized);
  if (!Number.isFinite(num)) return null;
  return new Prisma.Decimal(num.toFixed(2));
}

function parseIntSafe(value: unknown): number | null {
  const raw = str(value).replace(/[^\d-]/g, '');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function basename(pathLike: string): string {
  return pathLike.replace(/\\/g, '/').split('/').filter(Boolean).pop() || pathLike;
}

function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function mimeFromName(name: string): string {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    bmp: 'image/bmp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
  };
  return map[ext] || 'application/octet-stream';
}

type IndexedFile = {
  name: string;
  mimeType: string;
  /** Lê o conteúdo sob demanda (evita carregar ZIP inteiro na RAM). */
  read: () => Buffer;
};

function indexFiles(files: IndexedFile[]) {
  const byName = new Map<string, IndexedFile>();
  const byStem = new Map<string, IndexedFile[]>();
  for (const file of files) {
    const base = normalizeKey(basename(file.name));
    if (!base) continue;
    if (!byName.has(base)) byName.set(base, file);
    const stem = base.replace(/\.[a-z0-9]+$/, '');
    const list = byStem.get(stem) || [];
    list.push(file);
    byStem.set(stem, list);
  }
  return { byName, byStem, all: files };
}

function matchFile(
  index: ReturnType<typeof indexFiles>,
  sourcePath: string | null | undefined,
  externalId: string | null | undefined,
): IndexedFile | null {
  const source = sourcePath ? normalizeKey(basename(sourcePath)) : '';
  if (source && index.byName.has(source)) return index.byName.get(source)!;
  if (source) {
    const stem = source.replace(/\.[a-z0-9]+$/, '');
    const byStem = index.byStem.get(stem);
    if (byStem?.[0]) return byStem[0];
  }
  const id = normalizeKey(externalId || '');
  if (id) {
    const hit = index.all.find((f) => normalizeKey(basename(f.name)).includes(id));
    if (hit) return hit;
  }
  if (source) {
    const hit = index.all.find((f) => {
      const n = normalizeKey(basename(f.name));
      return n.includes(source) || source.includes(n);
    });
    if (hit) return hit;
  }
  return null;
}

type ProcessoInput = {
  externalId?: string;
  numeroProcesso?: string;
  tribunal?: string;
  vara?: string;
  reclamante?: string;
  dataAudiencia?: string;
  horario?: string;
  presencial?: string;
  statusProcesso?: string;
  decisaoStf?: string;
  polo?: string;
  empresa?: string;
  objeto?: string;
  objeto2?: string;
  contrato?: string;
  funcao?: string;
  regimeContratacao?: string;
  periodo?: string;
  periodoInicio?: string;
  periodoFim?: string;
  representanteAutor?: string;
  acordo?: string;
  valorCausa?: unknown;
  statusSentenca?: string;
  valorSentenca?: unknown;
  valorRO?: unknown;
  valorRR?: unknown;
  valorCustas?: unknown;
  valorAcordo?: unknown;
  valorPagoSentenciado?: unknown;
  valorParcela?: unknown;
  valorPago?: unknown;
  numParcelas?: unknown;
  custas?: unknown;
  previdencia?: unknown;
  outrosGastos?: unknown;
  status?: string;
  dataAcordo?: string;
  dataAbertura?: string;
  agravoInstrumento?: string;
  anexos?: Array<{
    externalId?: string;
    originalName?: string;
    sourcePath?: string;
  }>;
  comprovantes?: Array<{
    externalId?: string;
    originalName?: string;
    sourcePath?: string;
    dataPagamento?: string;
  }>;
};

function buildProcessoData(row: ProcessoInput) {
  const reclamante = opt(row.reclamante) || 'Não informado';
  const numeroProcesso = opt(row.numeroProcesso) || '—';
  return {
    numeroProcesso,
    tribunal: opt(row.tribunal),
    vara: opt(row.vara),
    reclamante,
    dataAudiencia: opt(row.dataAudiencia),
    horario: opt(row.horario),
    presencial: opt(row.presencial),
    statusProcesso: opt(row.statusProcesso),
    decisaoStf: opt(row.decisaoStf),
    polo: opt(row.polo),
    empresa: opt(row.empresa),
    objeto: opt(row.objeto),
    objeto2: opt(row.objeto2),
    contrato: opt(row.contrato),
    funcao: opt(row.funcao),
    regimeContratacao: opt(row.regimeContratacao),
    periodo: opt(row.periodo),
    periodoInicio: opt(row.periodoInicio),
    periodoFim: opt(row.periodoFim),
    representanteAutor: opt(row.representanteAutor),
    acordo: opt(row.acordo),
    valorCausa: parseMoney(row.valorCausa),
    statusSentenca: opt(row.statusSentenca),
    valorSentenca: parseMoney(row.valorSentenca),
    valorRO: parseMoney(row.valorRO),
    valorRR: parseMoney(row.valorRR),
    valorCustas: parseMoney(row.valorCustas),
    valorAcordo: parseMoney(row.valorAcordo),
    valorPagoSentenciado: parseMoney(row.valorPagoSentenciado),
    valorParcela: parseMoney(row.valorParcela),
    valorPago: parseMoney(row.valorPago),
    numParcelas: parseIntSafe(row.numParcelas),
    custas: parseMoney(row.custas),
    previdencia: parseMoney(row.previdencia),
    outrosGastos: parseMoney(row.outrosGastos),
    status: opt(row.status),
    dataAcordo: opt(row.dataAcordo),
    dataAbertura: opt(row.dataAbertura),
    agravoInstrumento: opt(row.agravoInstrumento),
  };
}

function collectUploadedFiles(
  files: Express.Multer.File[] | undefined,
  kind: 'anexo' | 'comprovante',
  cleanups: Array<() => void>,
): IndexedFile[] {
  if (!files?.length) return [];
  const out: IndexedFile[] = [];

  for (const file of files) {
    const originalName = fixMulterOriginalName(file.originalname) || file.originalname;
    const diskPath = file.path;
    const looksZip =
      /\.zip$/i.test(originalName) ||
      /zip/.test(file.mimetype || '') ||
      (!!diskPath && /\.zip$/i.test(diskPath));

    if (looksZip && diskPath) {
      try {
        const extracted = extractZipArchive(diskPath);
        cleanups.push(extracted.cleanup);
        const filePaths = walkFilesRecursive(extracted.dir);
        for (const abs of filePaths) {
          const rel = path.relative(extracted.dir, abs).replace(/\\/g, '/');
          out.push({
            name: rel || path.basename(abs),
            mimeType: mimeFromName(abs),
            read: () => fs.readFileSync(abs),
          });
        }
      } catch (err) {
        console.warn(`[juridico-import] ZIP ${kind} inválido (${originalName}):`, err);
      }
      continue;
    }

    if (diskPath) {
      // ZIP em memória (legado) ou arquivo solto em disco
      let head: Buffer | null = null;
      try {
        const fd = fs.openSync(diskPath, 'r');
        head = Buffer.alloc(4);
        fs.readSync(fd, head, 0, 4, 0);
        fs.closeSync(fd);
      } catch {
        head = null;
      }
      if (head && isZipBuffer(head)) {
        try {
          const extracted = extractZipArchive(diskPath);
          cleanups.push(extracted.cleanup);
          for (const abs of walkFilesRecursive(extracted.dir)) {
            const rel = path.relative(extracted.dir, abs).replace(/\\/g, '/');
            out.push({
              name: rel || path.basename(abs),
              mimeType: mimeFromName(abs),
              read: () => fs.readFileSync(abs),
            });
          }
        } catch (err) {
          console.warn(`[juridico-import] ZIP ${kind} inválido (${originalName}):`, err);
        }
        continue;
      }
      out.push({
        name: originalName,
        mimeType: file.mimetype || mimeFromName(originalName),
        read: () => fs.readFileSync(diskPath),
      });
      continue;
    }

    const buf = file.buffer;
    if (!buf?.length) continue;
    if (isZipBuffer(buf) || /\.zip$/i.test(originalName) || /zip/.test(file.mimetype || '')) {
      try {
        const entries = unzipAll(buf);
        for (const entry of entries) {
          out.push({
            name: entry.name,
            mimeType: mimeFromName(entry.name),
            read: () => entry.data,
          });
        }
      } catch (err) {
        console.warn(`[juridico-import] ZIP ${kind} inválido (${originalName}):`, err);
      }
    } else {
      out.push({
        name: originalName,
        mimeType: file.mimetype || mimeFromName(originalName),
        read: () => buf,
      });
    }
  }
  return out;
}

const PROCESSO_INCLUDE = {
  anexos: { orderBy: { createdAt: 'asc' as const } },
  comprovantes: { orderBy: { createdAt: 'asc' as const } },
  _count: { select: { anexos: true, comprovantes: true } },
};

export class JuridicoProcessoController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const q = str(req.query.q);
      const status = str(req.query.status);
      const empresa = str(req.query.empresa);

      /** Cards de status ignoram a busca — só a empresa restringe os totais. */
      const metaFilters: Prisma.JuridicoProcessoWhereInput[] = [];
      const searchFilters: Prisma.JuridicoProcessoWhereInput[] = [];
      if (q) {
        searchFilters.push({
          OR: [
            { reclamante: { contains: q, mode: 'insensitive' } },
            { numeroProcesso: { contains: q, mode: 'insensitive' } },
            { tribunal: { contains: q, mode: 'insensitive' } },
            { vara: { contains: q, mode: 'insensitive' } },
            { empresa: { contains: q, mode: 'insensitive' } },
            { polo: { contains: q, mode: 'insensitive' } },
            { objeto: { contains: q, mode: 'insensitive' } },
            { contrato: { contains: q, mode: 'insensitive' } },
            { funcao: { contains: q, mode: 'insensitive' } },
            { status: { contains: q, mode: 'insensitive' } },
            { statusProcesso: { contains: q, mode: 'insensitive' } },
            { representanteAutor: { contains: q, mode: 'insensitive' } },
          ],
        });
      }
      if (empresa && empresa !== 'all') {
        searchFilters.push({ empresa: { equals: empresa, mode: 'insensitive' } });
        metaFilters.push({ empresa: { equals: empresa, mode: 'insensitive' } });
      }

      const listFilters = [...searchFilters];
      if (status && status !== 'all') {
        listFilters.push({
          OR: [
            { status: { equals: status, mode: 'insensitive' } },
            { statusProcesso: { equals: status, mode: 'insensitive' } },
          ],
        });
      }

      const metaWhere: Prisma.JuridicoProcessoWhereInput =
        metaFilters.length > 0 ? { AND: metaFilters } : {};
      const where: Prisma.JuridicoProcessoWhereInput =
        listFilters.length > 0 ? { AND: listFilters } : {};

      const [rows, total, allForMeta] = await Promise.all([
        prisma.juridicoProcesso.findMany({
          where,
          orderBy: [{ dataAbertura: 'desc' }, { reclamante: 'asc' }],
          include: {
            _count: { select: { anexos: true, comprovantes: true } },
            anexos: { select: { fileUrl: true } },
            comprovantes: { select: { fileUrl: true } },
          },
        }),
        prisma.juridicoProcesso.count({ where }),
        prisma.juridicoProcesso.findMany({
          where: metaWhere,
          select: { status: true, statusProcesso: true },
        }),
      ]);

      const statusCount: Record<string, number> = {};
      for (const row of allForMeta) {
        const key = row.status || row.statusProcesso || 'INDEFINIDO';
        statusCount[key] = (statusCount[key] || 0) + 1;
      }

      /** Registros importados da planilha que ainda não têm o arquivo enviado. */
      const semArquivo = (files: Array<{ fileUrl: string | null }>) =>
        files.filter((file) => !file.fileUrl || !file.fileUrl.trim()).length;

      const data = rows.map(({ anexos, comprovantes, ...row }) => ({
        ...row,
        anexosPendentes: semArquivo(anexos),
        comprovantesPendentes: semArquivo(comprovantes),
      }));

      res.json({
        success: true,
        data,
        meta: { total, statusCount },
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const row = await prisma.juridicoProcesso.findUnique({
        where: { id: req.params.id },
        include: PROCESSO_INCLUDE,
      });
      if (!row) throw createError('Processo não encontrado', 404);
      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const body = (req.body || {}) as ProcessoInput;
      const reclamante = opt(body.reclamante);
      const numeroProcesso = opt(body.numeroProcesso);
      if (!reclamante) throw createError('Informe o reclamante.', 400);
      if (!numeroProcesso) throw createError('Informe o número do processo.', 400);

      const externalId = opt(body.externalId) || `manual-${uuidv4()}`;
      const data = buildProcessoData(body);

      const created = await prisma.juridicoProcesso.create({
        data: { ...data, externalId },
        include: PROCESSO_INCLUDE,
      });

      res.status(201).json({
        success: true,
        data: created,
        message: 'Processo cadastrado com sucesso.',
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = str(req.params.id);
      if (!id) throw createError('ID do processo inválido', 400);

      const existing = await prisma.juridicoProcesso.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) throw createError('Processo não encontrado', 404);

      const body = (req.body || {}) as ProcessoInput;
      const data = buildProcessoData(body);

      const updated = await prisma.juridicoProcesso.update({
        where: { id },
        data,
        include: PROCESSO_INCLUDE,
      });

      res.json({
        success: true,
        data: updated,
        message: 'Processo atualizado com sucesso.',
      });
    } catch (error) {
      next(error);
    }
  }

  async importMany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      let payload: { processos?: ProcessoInput[] } = {};
      const rawPayload = str((req.body as { payload?: unknown })?.payload);
      if (rawPayload) {
        try {
          payload = JSON.parse(rawPayload) as { processos?: ProcessoInput[] };
        } catch {
          throw createError('Payload da importação inválido.', 400);
        }
      } else if (Array.isArray((req.body as { processos?: unknown })?.processos)) {
        payload = { processos: (req.body as { processos: ProcessoInput[] }).processos };
      }

      const processos = Array.isArray(payload.processos) ? payload.processos : [];
      if (processos.length === 0) {
        throw createError('Nenhum processo encontrado na planilha.', 400);
      }

      const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
      const cleanups: Array<() => void> = [];
      let anexoFiles = indexFiles([]);
      let comprovanteFiles = indexFiles([]);
      try {
        anexoFiles = indexFiles([
          ...collectUploadedFiles(files.anexos, 'anexo', cleanups),
          ...collectUploadedFiles(files.anexosZip, 'anexo', cleanups),
        ]);
        comprovanteFiles = indexFiles([
          ...collectUploadedFiles(files.comprovantes, 'comprovante', cleanups),
          ...collectUploadedFiles(files.comprovantesZip, 'comprovante', cleanups),
        ]);

        const hasUploadedFiles =
          anexoFiles.all.length > 0 || comprovanteFiles.all.length > 0;

      let created = 0;
      let updated = 0;
      let anexosLinked = 0;
      let comprovantesLinked = 0;
      const errors: { index: number; message: string }[] = [];

      for (let i = 0; i < processos.length; i += 1) {
        const row = processos[i] || {};
        try {
          const externalId = opt(row.externalId) || `imp-${uuidv4().slice(0, 8)}`;
          const data = buildProcessoData(row);
          const existing = await prisma.juridicoProcesso.findUnique({
            where: { externalId },
            select: { id: true },
          });

          const processo = existing
            ? await prisma.juridicoProcesso.update({
                where: { id: existing.id },
                data,
              })
            : await prisma.juridicoProcesso.create({
                data: { externalId, ...data },
              });
          if (existing) updated += 1;
          else created += 1;

          if (!hasUploadedFiles) continue;

          const anexos = Array.isArray(row.anexos) ? row.anexos : [];
          for (const anexo of anexos) {
            const sourcePath = opt(anexo.sourcePath);
            const anexoExt = opt(anexo.externalId);
            const originalName =
              opt(anexo.originalName) ||
              (sourcePath ? basename(sourcePath) : null) ||
              'anexo';
            const matched = matchFile(anexoFiles, sourcePath, anexoExt);
            let fileUrl: string | null = null;
            let fileKey: string | null = null;
            let mimeType: string | null = null;
            let size: number | null = null;
            if (matched) {
              const buffer = matched.read();
              const saved = await savePersistentUpload({
                folder: `juridico-processos/${processo.id}/anexos`,
                buffer,
                originalName: basename(matched.name),
                mimeType: matched.mimeType,
                includeSafeOriginalName: true,
              });
              fileUrl = saved.url;
              fileKey = saved.key;
              mimeType = matched.mimeType;
              size = buffer.length;
              anexosLinked += 1;
            }

            const already = anexoExt
              ? await prisma.juridicoProcessoAnexo.findFirst({
                  where: { processoId: processo.id, externalId: anexoExt },
                })
              : null;

            if (already) {
              await prisma.juridicoProcessoAnexo.update({
                where: { id: already.id },
                data: {
                  originalName,
                  sourcePath,
                  ...(fileUrl
                    ? { fileUrl, fileKey, mimeType, size }
                    : {}),
                },
              });
            } else {
              await prisma.juridicoProcessoAnexo.create({
                data: {
                  processoId: processo.id,
                  externalId: anexoExt,
                  originalName,
                  sourcePath,
                  fileUrl,
                  fileKey,
                  mimeType,
                  size,
                },
              });
            }
          }

          const comprovantes = Array.isArray(row.comprovantes) ? row.comprovantes : [];
          for (const comp of comprovantes) {
            const sourcePath = opt(comp.sourcePath);
            const compExt = opt(comp.externalId);
            const originalName =
              opt(comp.originalName) ||
              (sourcePath ? basename(sourcePath) : null) ||
              'comprovante';
            const matched = matchFile(comprovanteFiles, sourcePath, compExt);
            let fileUrl: string | null = null;
            let fileKey: string | null = null;
            let mimeType: string | null = null;
            let size: number | null = null;
            if (matched) {
              const buffer = matched.read();
              const saved = await savePersistentUpload({
                folder: `juridico-processos/${processo.id}/comprovantes`,
                buffer,
                originalName: basename(matched.name),
                mimeType: matched.mimeType,
                includeSafeOriginalName: true,
              });
              fileUrl = saved.url;
              fileKey = saved.key;
              mimeType = matched.mimeType;
              size = buffer.length;
              comprovantesLinked += 1;
            }

            const already = compExt
              ? await prisma.juridicoProcessoComprovante.findFirst({
                  where: { processoId: processo.id, externalId: compExt },
                })
              : null;

            if (already) {
              await prisma.juridicoProcessoComprovante.update({
                where: { id: already.id },
                data: {
                  originalName,
                  sourcePath,
                  dataPagamento: opt(comp.dataPagamento),
                  ...(fileUrl
                    ? { fileUrl, fileKey, mimeType, size }
                    : {}),
                },
              });
            } else {
              await prisma.juridicoProcessoComprovante.create({
                data: {
                  processoId: processo.id,
                  externalId: compExt,
                  originalName,
                  sourcePath,
                  dataPagamento: opt(comp.dataPagamento),
                  fileUrl,
                  fileKey,
                  mimeType,
                  size,
                },
              });
            }
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Erro ao importar linha';
          errors.push({ index: i, message });
        }
      }

      res.json({
        success: true,
        data: {
          created,
          updated,
          failed: errors.length,
          errors,
          anexosLinked,
          comprovantesLinked,
          anexosFiles: anexoFiles.all.length,
          comprovantesFiles: comprovanteFiles.all.length,
        },
        message: `Importação: ${created} novo(s), ${updated} atualizado(s), ${errors.length} erro(s).`,
      });
      } finally {
        for (const cleanup of cleanups) {
          try {
            cleanup();
          } catch {
            // ignore
          }
        }
      }
    } catch (error) {
      next(error);
    }
  }

  /**
   * Vincula ZIPs/arquivos avulsos a anexos/comprovantes já cadastrados sem fileUrl.
   * Não precisa reenviar a planilha — só a pasta Images / ZIP restante.
   */
  async linkPendingFiles(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const kindRaw = str((req.body as { kind?: unknown })?.kind).toLowerCase();
      const linkAnexos = !kindRaw || kindRaw === 'all' || kindRaw === 'anexos';
      const linkComprovantes =
        !kindRaw || kindRaw === 'all' || kindRaw === 'comprovantes';

      const files = (req.files || {}) as Record<string, Express.Multer.File[]>;
      const cleanups: Array<() => void> = [];
      try {
        const anexoFiles = indexFiles(
          linkAnexos
            ? [
                ...collectUploadedFiles(files.anexos, 'anexo', cleanups),
                ...collectUploadedFiles(files.anexosZip, 'anexo', cleanups),
              ]
            : [],
        );
        const comprovanteFiles = indexFiles(
          linkComprovantes
            ? [
                ...collectUploadedFiles(files.comprovantes, 'comprovante', cleanups),
                ...collectUploadedFiles(files.comprovantesZip, 'comprovante', cleanups),
              ]
            : [],
        );

        if (!anexoFiles.all.length && !comprovanteFiles.all.length) {
          throw createError('Envie ao menos um ZIP ou arquivo para vincular.', 400);
        }

        let anexosLinked = 0;
        let comprovantesLinked = 0;
        let anexosPending = 0;
        let comprovantesPending = 0;
        const usedAnexoKeys = new Set<string>();
        const usedComprovanteKeys = new Set<string>();

        if (linkAnexos && anexoFiles.all.length) {
          const pending = await prisma.juridicoProcessoAnexo.findMany({
            where: {
              OR: [{ fileUrl: null }, { fileUrl: '' }],
            },
            select: {
              id: true,
              processoId: true,
              externalId: true,
              originalName: true,
              sourcePath: true,
            },
          });
          anexosPending = pending.length;

          for (const row of pending) {
            const matched = matchFile(anexoFiles, row.sourcePath || row.originalName, row.externalId);
            if (!matched) continue;
            const key = normalizeKey(matched.name);
            if (usedAnexoKeys.has(key)) continue;
            usedAnexoKeys.add(key);

            const buffer = matched.read();
            const saved = await savePersistentUpload({
              folder: `juridico-processos/${row.processoId}/anexos`,
              buffer,
              originalName: basename(matched.name),
              mimeType: matched.mimeType,
              includeSafeOriginalName: true,
            });
            await prisma.juridicoProcessoAnexo.update({
              where: { id: row.id },
              data: {
                fileUrl: saved.url,
                fileKey: saved.key,
                mimeType: matched.mimeType,
                size: buffer.length,
                originalName: row.originalName || basename(matched.name),
              },
            });
            anexosLinked += 1;
          }
        }

        if (linkComprovantes && comprovanteFiles.all.length) {
          const pending = await prisma.juridicoProcessoComprovante.findMany({
            where: {
              OR: [{ fileUrl: null }, { fileUrl: '' }],
            },
            select: {
              id: true,
              processoId: true,
              externalId: true,
              originalName: true,
              sourcePath: true,
            },
          });
          comprovantesPending = pending.length;

          for (const row of pending) {
            const matched = matchFile(
              comprovanteFiles,
              row.sourcePath || row.originalName,
              row.externalId,
            );
            if (!matched) continue;
            const key = normalizeKey(matched.name);
            if (usedComprovanteKeys.has(key)) continue;
            usedComprovanteKeys.add(key);

            const buffer = matched.read();
            const saved = await savePersistentUpload({
              folder: `juridico-processos/${row.processoId}/comprovantes`,
              buffer,
              originalName: basename(matched.name),
              mimeType: matched.mimeType,
              includeSafeOriginalName: true,
            });
            await prisma.juridicoProcessoComprovante.update({
              where: { id: row.id },
              data: {
                fileUrl: saved.url,
                fileKey: saved.key,
                mimeType: matched.mimeType,
                size: buffer.length,
                originalName: row.originalName || basename(matched.name),
              },
            });
            comprovantesLinked += 1;
          }
        }

        res.json({
          success: true,
          data: {
            anexosLinked,
            comprovantesLinked,
            anexosPending,
            comprovantesPending,
            anexosFiles: anexoFiles.all.length,
            comprovantesFiles: comprovanteFiles.all.length,
          },
          message:
            `Vinculados: ${anexosLinked} anexo(s) e ${comprovantesLinked} comprovante(s)` +
            ` (pendentes: ${anexosPending} / ${comprovantesPending}).`,
        });
      } finally {
        for (const cleanup of cleanups) {
          try {
            cleanup();
          } catch {
            // ignore
          }
        }
      }
    } catch (error) {
      next(error);
    }
  }

  async addAnexos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = str(req.params.id);
      const processo = await prisma.juridicoProcesso.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!processo) throw createError('Processo não encontrado', 404);

      const files = (req.files as Express.Multer.File[] | undefined) || [];
      if (!files.length) throw createError('Selecione ao menos um arquivo.', 400);

      const created = [];
      for (const file of files) {
        const originalName =
          fixMulterOriginalName(file.originalname) || file.originalname || 'anexo';
        const saved = await savePersistentUpload({
          folder: `juridico-processos/${id}/anexos`,
          buffer: file.buffer,
          originalName,
          mimeType: file.mimetype,
          includeSafeOriginalName: true,
        });
        const row = await prisma.juridicoProcessoAnexo.create({
          data: {
            processoId: id,
            originalName: saved.originalName || originalName,
            fileUrl: saved.url,
            fileKey: saved.key,
            mimeType: file.mimetype || mimeFromName(originalName),
            size: file.size || saved.key.length,
          },
        });
        created.push(row);
      }

      res.json({
        success: true,
        data: created,
        message: `${created.length} anexo(s) adicionado(s).`,
      });
    } catch (error) {
      next(error);
    }
  }

  async addComprovantes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = str(req.params.id);
      const processo = await prisma.juridicoProcesso.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!processo) throw createError('Processo não encontrado', 404);

      const files = (req.files as Express.Multer.File[] | undefined) || [];
      if (!files.length) throw createError('Selecione ao menos um arquivo.', 400);
      const dataPagamento = opt((req.body as { dataPagamento?: unknown })?.dataPagamento);

      const created = [];
      for (const file of files) {
        const originalName =
          fixMulterOriginalName(file.originalname) || file.originalname || 'comprovante';
        const saved = await savePersistentUpload({
          folder: `juridico-processos/${id}/comprovantes`,
          buffer: file.buffer,
          originalName,
          mimeType: file.mimetype,
          includeSafeOriginalName: true,
        });
        const row = await prisma.juridicoProcessoComprovante.create({
          data: {
            processoId: id,
            originalName: saved.originalName || originalName,
            dataPagamento,
            fileUrl: saved.url,
            fileKey: saved.key,
            mimeType: file.mimetype || mimeFromName(originalName),
            size: file.size || saved.key.length,
          },
        });
        created.push(row);
      }

      res.json({
        success: true,
        data: created,
        message: `${created.length} comprovante(s) adicionado(s).`,
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteAnexo(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const processoId = str(req.params.id);
      const fileId = str(req.params.fileId);
      const row = await prisma.juridicoProcessoAnexo.findFirst({
        where: { id: fileId, processoId },
      });
      if (!row) throw createError('Anexo não encontrado', 404);

      await deletePersistentUpload(row.fileKey || row.fileUrl);
      await prisma.juridicoProcessoAnexo.delete({ where: { id: row.id } });

      res.json({ success: true, message: 'Anexo removido.' });
    } catch (error) {
      next(error);
    }
  }

  async deleteComprovante(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const processoId = str(req.params.id);
      const fileId = str(req.params.fileId);
      const row = await prisma.juridicoProcessoComprovante.findFirst({
        where: { id: fileId, processoId },
      });
      if (!row) throw createError('Comprovante não encontrado', 404);

      await deletePersistentUpload(row.fileKey || row.fileUrl);
      await prisma.juridicoProcessoComprovante.delete({ where: { id: row.id } });

      res.json({ success: true, message: 'Comprovante removido.' });
    } catch (error) {
      next(error);
    }
  }
}
