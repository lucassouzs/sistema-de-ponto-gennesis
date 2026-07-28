import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { PNCP_MODALIDADES } from '../services/PncpConsultaService';
import {
  addCustomPncpKeyword,
  listPncpKeywordEntries,
  removeCustomPncpKeyword,
} from '../services/pncpKeywordsStore';
import { consultarContratacoesLocais } from '../services/PncpLocalConsultaService';
import { enviarPncpParaAnalise } from '../services/PncpEnviarAnaliseService';
import { rejeitarPncpContratacao } from '../services/PncpRejeitarService';
import {
  getPncpSyncStatus,
  requestPncpSyncCancel,
  startPncpIngestBackgroundSafe,
  type PncpSyncOptions,
  BRASIL_UFS,
} from '../services/PncpIngestService';

function parseModalidadeList(raw: unknown): number[] | null {
  if (raw == null || raw === '') return null;
  const parts = Array.isArray(raw)
    ? raw.map((v) => String(v))
    : String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.some((s) => ['all', 'todos', '0'].includes(s.toLowerCase()))) return null;
  const nums = parts
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n > 0);
  return nums.length > 0 ? Array.from(new Set(nums)) : null;
}

function parseUfList(raw: unknown): string[] {
  if (raw == null || raw === '') return [];
  const parts = Array.isArray(raw)
    ? raw.map((v) => String(v))
    : String(raw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
  if (parts.some((s) => ['all', 'todos', '*'].includes(s.toLowerCase()))) return [];
  return Array.from(
    new Set(parts.map((s) => s.toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s)))
  );
}

function parseSyncOptions(body: unknown): PncpSyncOptions {
  if (!body || typeof body !== 'object') {
    return { incremental: true, staleOnly: true };
  }
  const raw = body as Record<string, unknown>;
  const ufs = Array.isArray(raw.ufs)
    ? raw.ufs.map((u) => String(u).trim().toUpperCase()).filter(Boolean)
    : undefined;
  const invalid = ufs?.filter((uf) => !BRASIL_UFS.includes(uf as (typeof BRASIL_UFS)[number]));
  if (invalid?.length) {
    throw createError(`UF(s) inválida(s): ${invalid.join(', ')}`, 400);
  }
  const fullResync = raw.fullResync === true;
  return {
    ufs,
    retryErrorsOnly: raw.retryErrorsOnly === true,
    incremental: fullResync ? false : raw.incremental !== false,
    staleOnly: fullResync ? false : raw.staleOnly !== false,
    fullResync,
  };
}

export class PncpController {
  listModalidades(_req: AuthRequest, res: Response) {
    res.json({ success: true, data: PNCP_MODALIDADES });
  }

  async listKeywords(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const entries = await listPncpKeywordEntries();
      res.json({
        success: true,
        data: {
          keywords: entries.map((e) => e.keyword),
          entries,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async addKeyword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const keyword =
        typeof req.body?.keyword === 'string' ? req.body.keyword : '';
      const created = await addCustomPncpKeyword({
        keyword,
        createdBy: req.user!.id,
      });
      res.status(201).json({
        success: true,
        data: { keyword: created, custom: true },
        message: 'Palavra-chave adicionada.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao adicionar palavra-chave';
      if (
        message.includes('pelo menos') ||
        message.includes('já existe') ||
        message.includes('já foi')
      ) {
        next(createError(message, 400));
        return;
      }
      next(createError(message, 500));
    }
  }

  async removeKeyword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const keyword =
        typeof req.body?.keyword === 'string' ? req.body.keyword : '';
      const removed = await removeCustomPncpKeyword(keyword);
      if (!removed) {
        throw createError('Palavra-chave customizada não encontrada.', 404);
      }
      res.json({
        success: true,
        data: { keyword },
        message: 'Palavra-chave removida.',
      });
    } catch (err) {
      if ((err as { statusCode?: number })?.statusCode) {
        next(err);
        return;
      }
      const message = err instanceof Error ? err.message : 'Erro ao remover palavra-chave';
      next(createError(message, 500));
    }
  }

  async listContratacoes(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const dataInicial = String(req.query.dataInicial || '');
      const dataFinal = String(req.query.dataFinal || '');
      const ufs = parseUfList(req.query.uf ?? req.query.ufs);
      const codigosModalidade = parseModalidadeList(req.query.codigoModalidadeContratacao);
      const pagina = Number(req.query.pagina || 1);
      const tamanhoPagina = Number(req.query.tamanhoPagina || 50);
      const q = req.query.q != null ? String(req.query.q) : undefined;
      const valorMinRaw = req.query.valorMin != null ? String(req.query.valorMin) : '';
      const valorMaxRaw = req.query.valorMax != null ? String(req.query.valorMax) : '';
      const valorMin = valorMinRaw.trim() !== '' ? Number(valorMinRaw) : null;
      const valorMax = valorMaxRaw.trim() !== '' ? Number(valorMaxRaw) : null;
      const statusAnaliseRaw = String(req.query.statusAnalise || '')
        .trim()
        .toLowerCase();
      const statusAnalise =
        statusAnaliseRaw === 'disponivel' ||
        statusAnaliseRaw === 'enviada' ||
        statusAnaliseRaw === 'rejeitada' ||
        statusAnaliseRaw === 'vencida'
          ? statusAnaliseRaw
          : statusAnaliseRaw === 'all'
            ? 'all'
            : null;

      if (!dataInicial || !dataFinal) {
        throw createError('Informe dataInicial e dataFinal.', 400);
      }

      // Espelho local (já filtrado por keywords na ingestão).
      const result = await consultarContratacoesLocais({
        dataInicial,
        dataFinal,
        ufs,
        codigoModalidadeContratacao: codigosModalidade,
        pagina,
        tamanhoPagina,
        q,
        valorMin: valorMin != null && Number.isFinite(valorMin) ? valorMin : null,
        valorMax: valorMax != null && Number.isFinite(valorMax) ? valorMax : null,
        statusAnalise,
      });

      res.json({ success: true, data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao consultar PNCP';
      if (
        message.includes('inválida') ||
        message.includes('Informe') ||
        message.includes('não pode')
      ) {
        next(createError(message, 400));
        return;
      }
      next(createError(message, 500));
    }
  }

  async rejeitar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const numeroControlePNCP =
        typeof req.body?.numeroControlePNCP === 'string'
          ? req.body.numeroControlePNCP.trim()
          : '';

      if (!numeroControlePNCP) {
        throw createError('Informe o número de controle PNCP.', 400);
      }

      const result = await rejeitarPncpContratacao({
        numeroControlePNCP,
        userId: req.user!.id,
      });

      if (result.alreadyRejected) {
        res.status(409).json({
          success: false,
          data: result,
          message: 'Esta licitação já foi rejeitada.',
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: result,
        message: 'Licitação rejeitada.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao rejeitar licitação';
      if (
        message.includes('Informe') ||
        message.includes('não encontrada') ||
        message.includes('já foi enviada')
      ) {
        next(createError(message, message.includes('já foi enviada') ? 409 : 400));
        return;
      }
      next(createError(message, 500));
    }
  }

  async enviarParaAnalise(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const numeroControlePNCP =
        typeof req.body?.numeroControlePNCP === 'string'
          ? req.body.numeroControlePNCP.trim()
          : '';
      const regiaoKey =
        typeof req.body?.regiaoKey === 'string' ? req.body.regiaoKey.trim() : undefined;

      if (!numeroControlePNCP) {
        throw createError('Informe o número de controle PNCP.', 400);
      }

      const result = await enviarPncpParaAnalise({
        numeroControlePNCP,
        userId: req.user!.id,
        regiaoKeyOverride: regiaoKey || null,
      });

      if (result.alreadySent) {
        res.status(409).json({
          success: false,
          data: result,
          message: `Esta licitação já foi enviada para ${result.regiaoLabel}.`,
        });
        return;
      }

      res.status(201).json({
        success: true,
        data: result,
        message: `Licitação enviada para ${result.regiaoLabel}.`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar para análise';
      if (
        message.includes('Informe') ||
        message.includes('não encontrada') ||
        message.includes('mapear') ||
        message.includes('inválida') ||
        message.includes('montar')
      ) {
        next(createError(message, 400));
        return;
      }
      next(createError(message, 500));
    }
  }

  async syncStatus(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const status = await getPncpSyncStatus();
      res.json({ success: true, data: status });
    } catch (err) {
      next(err);
    }
  }

  async startSync(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const options = parseSyncOptions(req.body);
      const result = await startPncpIngestBackgroundSafe('manual', options);
      const status = await getPncpSyncStatus();

      if (result.nothingToDo) {
        res.status(400).json({
          success: false,
          data: status,
          message: result.message,
        });
        return;
      }

      if (result.alreadyRunning) {
        res.status(202).json({
          success: true,
          data: status,
          message: 'Sincronização já em andamento.',
        });
        return;
      }

      const ufLabel =
        options.retryErrorsOnly
          ? 'UFs com erro'
          : options.ufs?.length
            ? `${options.ufs.length} UF(s)`
            : 'Brasil';
      res.status(202).json({
        success: true,
        data: status,
        message: `Sincronização iniciada (${ufLabel}, incremental).`,
      });
    } catch (err) {
      next(err);
    }
  }

  async stopSync(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = requestPncpSyncCancel();
      const status = await getPncpSyncStatus();

      if (!result.requested) {
        res.status(400).json({
          success: false,
          data: status,
          message: result.message,
        });
        return;
      }

      res.status(202).json({
        success: true,
        data: status,
        message: 'Cancelamento solicitado. A sync para na próxima pausa.',
      });
    } catch (err) {
      next(err);
    }
  }
}
