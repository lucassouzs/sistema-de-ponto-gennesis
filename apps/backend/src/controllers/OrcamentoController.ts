import { Response, NextFunction } from 'express';
import { OrcamentoService } from '../services/OrcamentoService';
import {
  OrcamentoCronogramaSubServicoService,
  type EstimarPrazosInput,
  type GerarSubServicosInput
} from '../services/OrcamentoCronogramaSubServicoService';
import { AuthRequest } from '../middleware/auth';

const orcamentoService = new OrcamentoService();
const cronogramaSubServicoService = new OrcamentoCronogramaSubServicoService();

export class OrcamentoController {
  /** Lê serviços padrão + imports do contrato (sem orçamento aberto). */
  async getServicosPadrao(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const centroCustoId = req.params.centroCustoId;
      if (!centroCustoId) {
        return res.status(400).json({ message: 'centroCustoId é obrigatório' });
      }
      const data = await orcamentoService.getServicosPadrao(centroCustoId);
      return res.json({ data });
    } catch (err) {
      return next(err);
    }
  }

  /** Lista metadados dos orçamentos do contrato. */
  /** Salva só serviços padrão + imports do contrato (sem precisar de orçamento aberto). */
  async saveServicosPadrao(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const centroCustoId = req.params.centroCustoId;
      const { servicos, imports } = req.body;
      if (!centroCustoId) {
        return res.status(400).json({ message: 'centroCustoId é obrigatório' });
      }
      await orcamentoService.saveServicosPadrao(centroCustoId, {
        servicos: servicos || [],
        imports: imports || []
      });
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }

  async getList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const centroCustoId = req.params.centroCustoId;
      if (!centroCustoId) {
        return res.status(400).json({ message: 'centroCustoId é obrigatório' });
      }
      const index = await orcamentoService.getIndex(centroCustoId);
      return res.json({
        orcamentos: index.orcamentos,
        ultimoOrcamentoId: index.ultimoOrcamentoId ?? null
      });
    } catch (err) {
      return next(err);
    }
  }

  async createOrcamento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const centroCustoId = req.params.centroCustoId;
      const nome = req.body?.nome as string | undefined;
      if (!centroCustoId) {
        return res.status(400).json({ message: 'centroCustoId é obrigatório' });
      }
      const entry = await orcamentoService.createOrcamento(centroCustoId, nome);
      return res.status(201).json(entry);
    } catch (err) {
      return next(err);
    }
  }

  async getOrcamento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { centroCustoId, orcamentoId } = req.params;
      if (!centroCustoId || !orcamentoId) {
        return res.status(400).json({ message: 'centroCustoId e orcamentoId são obrigatórios' });
      }
      const data = await orcamentoService.getOrcamento(centroCustoId, orcamentoId);
      if (!data) {
        return res.status(404).json({ message: 'Orçamento não encontrado' });
      }
      return res.json(data);
    } catch (err) {
      return next(err);
    }
  }

  async saveOrcamento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { centroCustoId, orcamentoId } = req.params;
      const { servicos, imports, sessaoOrcamento } = req.body;
      if (!centroCustoId || !orcamentoId) {
        return res.status(400).json({ message: 'centroCustoId e orcamentoId são obrigatórios' });
      }
      const raw = await orcamentoService.readOrcamentoFile(centroCustoId, orcamentoId);
      if (!raw) {
        return res.status(404).json({ message: 'Orçamento não encontrado' });
      }
      // Histórico de imports no catálogo do contrato (sem sobrescrever a árvore do orçamento perfeito).
      if (imports !== undefined) {
        const current = await orcamentoService.getServicosPadrao(centroCustoId);
        await orcamentoService.saveServicosPadrao(centroCustoId, {
          servicos: current.servicos,
          imports: imports as unknown[]
        });
      }
      // Árvore editada na montagem fica no arquivo do orçamento; não gravar em servicos-padrao.json.
      if (sessaoOrcamento !== undefined || servicos !== undefined) {
        await orcamentoService.mergeOrcamentoArquivo(centroCustoId, orcamentoId, {
          ...(sessaoOrcamento !== undefined ? { sessaoOrcamento } : {}),
          ...(servicos !== undefined ? { servicos: servicos as unknown[] } : {})
        });
      }
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }

  async renameOrcamento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { centroCustoId, orcamentoId } = req.params;
      const nome = req.body?.nome as string | undefined;
      if (!centroCustoId || !orcamentoId) {
        return res.status(400).json({ message: 'centroCustoId e orcamentoId são obrigatórios' });
      }
      if (nome === undefined || String(nome).trim() === '') {
        return res.status(400).json({ message: 'nome é obrigatório' });
      }
      await orcamentoService.renameOrcamento(centroCustoId, orcamentoId, String(nome));
      return res.json({ success: true });
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (e?.message === 'Orçamento não encontrado') {
        return res.status(404).json({ message: e.message });
      }
      return next(err);
    }
  }

  async deleteOrcamento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { centroCustoId, orcamentoId } = req.params;
      if (!centroCustoId || !orcamentoId) {
        return res.status(400).json({ message: 'centroCustoId e orcamentoId são obrigatórios' });
      }
      await orcamentoService.deleteOrcamento(centroCustoId, orcamentoId);
      return res.json({ success: true });
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (e?.message === 'Orçamento não encontrado') {
        return res.status(404).json({ message: e.message });
      }
      return next(err);
    }
  }

  /** @deprecated usar GET lista + GET por id */
  async get(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const centroCustoId = req.params.centroCustoId;
      if (!centroCustoId) {
        return res.status(400).json({ message: 'centroCustoId é obrigatório' });
      }
      const data = await orcamentoService.get(centroCustoId);
      return res.json(data || { servicos: [], composicoes: [], imports: [] });
    } catch (err) {
      return next(err);
    }
  }

  /** Compat: grava no orçamento “ativo” ou único. */
  async save(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const centroCustoId = req.params.centroCustoId;
      const { servicos, imports, sessaoOrcamento } = req.body;
      if (!centroCustoId) {
        return res.status(400).json({ message: 'centroCustoId é obrigatório' });
      }
      const existing = await orcamentoService.get(centroCustoId);
      await orcamentoService.saveLegacy(centroCustoId, {
        servicos: servicos || [],
        composicoes: [],
        imports: imports || [],
        sessaoOrcamento:
          sessaoOrcamento !== undefined ? sessaoOrcamento : existing?.sessaoOrcamento
      });
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }

  async getComposicoesGeral(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await orcamentoService.getComposicoesGeral();
      return res.json(data || []);
    } catch (err) {
      return next(err);
    }
  }

  async saveComposicoesGeral(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { items } = req.body;
      await orcamentoService.saveComposicoesGeral(items || []);
      return res.json({ success: true });
    } catch (err) {
      return next(err);
    }
  }

  /** Gera subserviços do cronograma a partir das composições (IA ou heurística). */
  async gerarSubServicosCronograma(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { centroCustoId, orcamentoId } = req.params;
      if (!centroCustoId || !orcamentoId) {
        return res.status(400).json({ message: 'centroCustoId e orcamentoId são obrigatórios' });
      }

      const orcamento = await orcamentoService.getOrcamento(centroCustoId, orcamentoId);
      if (!orcamento) {
        return res.status(404).json({ message: 'Orçamento não encontrado' });
      }

      const body = req.body ?? {};
      const servicoNome = String(body.servicoNome ?? '').trim();
      if (!servicoNome) {
        return res.status(400).json({ message: 'servicoNome é obrigatório' });
      }

      const composicoesRaw = Array.isArray(body.composicoes) ? body.composicoes : [];
      const composicoes = composicoesRaw
        .map((c: unknown) => {
          if (!c || typeof c !== 'object') return null;
          const o = c as Record<string, unknown>;
          const descricao = String(o.descricao ?? '').trim();
          if (!descricao) return null;
          return {
            chave: typeof o.chave === 'string' ? o.chave : undefined,
            codigo: String(o.codigo ?? '').trim(),
            descricao,
            subtitulo: String(o.subtitulo ?? o.subtituloNome ?? '').trim(),
            unidade: typeof o.unidade === 'string' ? o.unidade : undefined,
            quantidade:
              typeof o.quantidade === 'number' && Number.isFinite(o.quantidade)
                ? o.quantidade
                : undefined
          };
        })
        .filter(Boolean) as GerarSubServicosInput['composicoes'];

      const input: GerarSubServicosInput = {
        servicoNome,
        subtituloNome:
          typeof body.subtituloNome === 'string' ? body.subtituloNome.trim() : undefined,
        dataInicioObra:
          typeof body.dataInicioObra === 'string' ? body.dataInicioObra : undefined,
        dataFimObra: typeof body.dataFimObra === 'string' ? body.dataFimObra : undefined,
        composicoes
      };

      const result = await cronogramaSubServicoService.gerarSubServicos(input);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }

  /** Estima duração em dias de cada etapa do cronograma (IA ou heurística). */
  async estimarPrazosCronograma(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { centroCustoId, orcamentoId } = req.params;
      if (!centroCustoId || !orcamentoId) {
        return res.status(400).json({ message: 'centroCustoId e orcamentoId são obrigatórios' });
      }

      const orcamento = await orcamentoService.getOrcamento(centroCustoId, orcamentoId);
      if (!orcamento) {
        return res.status(404).json({ message: 'Orçamento não encontrado' });
      }

      const body = req.body ?? {};
      const dataInicioObra =
        typeof body.dataInicioObra === 'string' ? body.dataInicioObra.trim() : '';
      const dataFimObra = typeof body.dataFimObra === 'string' ? body.dataFimObra.trim() : '';
      if (!dataInicioObra || !dataFimObra) {
        return res.status(400).json({ message: 'dataInicioObra e dataFimObra são obrigatórios' });
      }

      const etapasRaw = Array.isArray(body.etapas) ? body.etapas : [];
      const etapas = etapasRaw
        .map((e: unknown) => {
          if (!e || typeof e !== 'object') return null;
          const o = e as Record<string, unknown>;
          const etapaKey = String(o.etapaKey ?? '').trim();
          const servicoNome = String(o.servicoNome ?? '').trim();
          const etapaNome = String(o.etapaNome ?? '').trim();
          if (!etapaKey || !servicoNome || !etapaNome) return null;

          const composicoesRaw = Array.isArray(o.composicoes) ? o.composicoes : [];
          const composicoes = composicoesRaw
            .map((c: unknown) => {
              if (!c || typeof c !== 'object') return null;
              const co = c as Record<string, unknown>;
              const descricao = String(co.descricao ?? '').trim();
              if (!descricao) return null;
              return {
                chave: typeof co.chave === 'string' ? co.chave : undefined,
                codigo: String(co.codigo ?? '').trim(),
                descricao,
                subtitulo: String(co.subtitulo ?? co.subtituloNome ?? '').trim(),
                unidade: typeof co.unidade === 'string' ? co.unidade : undefined,
                quantidade:
                  typeof co.quantidade === 'number' && Number.isFinite(co.quantidade)
                    ? co.quantidade
                    : undefined
              };
            })
            .filter(Boolean) as EstimarPrazosInput['etapas'][number]['composicoes'];

          return {
            etapaKey,
            servicoNome,
            etapaNome,
            valorTotal:
              typeof o.valorTotal === 'number' && Number.isFinite(o.valorTotal)
                ? o.valorTotal
                : undefined,
            composicoes
          };
        })
        .filter(Boolean) as EstimarPrazosInput['etapas'];

      if (etapas.length === 0) {
        return res.status(400).json({ message: 'Informe ao menos uma etapa' });
      }

      const input: EstimarPrazosInput = {
        dataInicioObra,
        dataFimObra,
        etapas
      };

      const result = await cronogramaSubServicoService.estimarPrazosEtapas(input);
      return res.json(result);
    } catch (err) {
      return next(err);
    }
  }
}
