import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { OrcafascioService } from '../services/OrcafascioService';

const service = new OrcafascioService();

export class OrcafascioController {
  // GET /api/orcafascio/bases — segmentos em que há catálogo de composições
  async listarBases(req: Request, res: Response, next: NextFunction) {
    try {
      const segments = await service.obterBasesComCatalogo();
      res.json({ bases: segments.map(segment => ({ segment })) });
    } catch (err) {
      next(err);
    }
  }

  // GET /api/orcafascio/composicoes?page=1&search=… — catálogo ORSE (parâmetro base ignorado)
  async listarComposicoes(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
      const search = (req.query.search as string) || undefined;
      const base = (req.query.base as string) || undefined;
      const data = await service.listarComposicoes(page, search, base);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  // GET /api/orcafascio/composicoes/by-code?code=74210001&state=SP
  async buscarComposicaoPorCodigo(req: Request, res: Response, next: NextFunction) {
    try {
      const { code, state } = req.query as { code?: string; state?: string };
      if (!code) {
        return res.status(400).json({ error: 'Parâmetro "code" é obrigatório' });
      }
      const data = await service.buscarComposicaoPorCodigo(code, state?.trim() || undefined);
      return res.json(data);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return res.status(404).json({ error: 'Composição não encontrada' });
      }
      return next(err);
    }
  }

  // GET /api/orcafascio/composicoes/:id
  async buscarComposicaoPorId(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const base = (req.query.base as string) || undefined;
      const data = await service.buscarComposicaoPorId(id, base);
      return res.json(data);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        return res.status(404).json({ error: 'Composição não encontrada' });
      }
      return next(err);
    }
  }

  // GET /api/orcafascio/orcamentos/:id/analitico — composições analíticas com preço unitário
  async buscarAnaliticoOrcamento(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'Parâmetro "id" é obrigatório' });
      const data = await service.buscarAnaliticoOrcamento(id);
      return res.json(data);
    } catch (err: any) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return res.status(404).json({ error: 'Orçamento não encontrado' });
      }
      return next(err);
    }
  }

  // GET /api/orcafascio/orcamentos/:id/sintetico — relatório sintético
  async buscarSinteticoOrcamento(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'Parâmetro "id" é obrigatório' });
      const data = await service.buscarSinteticoOrcamento(id);
      return res.json(data);
    } catch (err: any) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return res.status(404).json({ error: 'Orçamento não encontrado' });
      }
      return next(err);
    }
  }

  // GET /api/orcafascio/orcamentos/:id — detalhe + itens do orçamento
  async buscarDetalheOrcamento(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).json({ error: 'Parâmetro "id" é obrigatório' });
      const data = await service.buscarDetalheOrcamento(id);
      return res.json(data);
    } catch (err: any) {
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        return res.status(404).json({ error: 'Orçamento não encontrado' });
      }
      return next(err);
    }
  }

  // GET /api/orcafascio/orcamentos?page=1&order_type=Asc&order_name=description
  async listarOrcamentos(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
      const perPageRaw = parseInt((req.query.per_page as string) || '0', 10);
      const perPage = Number.isFinite(perPageRaw) && perPageRaw > 0
        ? Math.min(5000, perPageRaw)
        : undefined;
      const search = (req.query.search as string) || undefined;
      const orderType = (req.query.order_type as string) || undefined;
      const orderName = (req.query.order_name as string) || undefined;
      const data = await service.listarOrcamentos(page, orderType, orderName, perPage, search);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  // GET /api/orcafascio/insumos?page=1
  async listarInsumos(req: Request, res: Response, next: NextFunction) {
    try {
      const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
      const data = await service.listarInsumos(page);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }

  // GET /api/orcafascio/diagnostico
  async diagnosticar(req: Request, res: Response, next: NextFunction) {
    try {
      const data = await service.diagnosticar();
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
}
