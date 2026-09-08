import { Request, Response } from 'express';
import { FluigService } from '../services/FluigService';

export const fluigService = new FluigService();

type FluigHttpError = {
  response?: { data?: unknown; status?: number };
  message?: string;
};

function fluigErrorResponse(error: unknown, fallbackMessage: string) {
  const err = (error ?? {}) as FluigHttpError;
  const status = err.response?.status || 500;
  const message =
    (err.response?.data as { message?: string } | undefined)?.message ||
    err.message ||
    fallbackMessage;
  return { status, message };
}

export async function getAvailableDatasets(req: Request, res: Response) {
  try {
    const datasets = await fluigService.getAvailableDatasets();
    return res.json({ success: true, data: datasets });
  } catch (error: unknown) {
    console.error('Fluig getAvailableDatasets error:', error);
    const { status, message } = fluigErrorResponse(error, 'Erro ao buscar datasets');
    return res.status(status).json({ success: false, message });
  }
}

export async function getDatasetStructure(req: Request, res: Response) {
  try {
    const { datasetId } = req.params;
    if (!datasetId) {
      return res.status(400).json({ success: false, message: 'datasetId é obrigatório' });
    }
    const structure = await fluigService.getDatasetStructure(datasetId);
    return res.json({ success: true, data: structure });
  } catch (error: unknown) {
    console.error('Fluig getDatasetStructure error:', error);
    const { status, message } = fluigErrorResponse(error, 'Erro ao buscar estrutura');
    return res.status(status).json({ success: false, message });
  }
}

export async function getDatasetData(req: Request, res: Response) {
  try {
    const { datasetId } = req.params;
    if (!datasetId) {
      return res.status(400).json({ success: false, message: 'datasetId é obrigatório' });
    }
    const { fields, constraints, order } = req.body || {};
    const startedAt = Date.now();
    const data = await fluigService.getDatasetData(datasetId, {
      fields: Array.isArray(fields) ? fields : undefined,
      constraints: Array.isArray(constraints) ? constraints : undefined,
      order: Array.isArray(order) ? order : undefined,
    });
    const elapsed = Date.now() - startedAt;
    res.setHeader('X-Fluig-Cache', elapsed < 200 ? 'HIT' : 'MISS');
    res.setHeader('X-Fluig-Elapsed-Ms', String(elapsed));
    return res.json({ success: true, data });
  } catch (error: unknown) {
    console.error('Fluig getDatasetData error:', error);
    const { status, message } = fluigErrorResponse(error, 'Erro ao buscar dados');
    return res.status(status).json({ success: false, message });
  }
}

export async function searchDataset(req: Request, res: Response) {
  try {
    const { datasetId } = req.params;
    if (!datasetId) {
      return res.status(400).json({ success: false, message: 'datasetId é obrigatório' });
    }
    const body = req.body || {};
    const data = await fluigService.searchDataset(datasetId, {
      searchField: body.searchField,
      searchValue: body.searchValue,
      filterFields: body.filterFields,
      resultFields: body.resultFields,
      likeField: body.likeField,
      likeValue: body.likeValue,
      limit: body.limit,
      orderBy: body.orderBy,
    });
    return res.json({ success: true, data });
  } catch (error: unknown) {
    console.error('Fluig searchDataset error:', error);
    const { status, message } = fluigErrorResponse(error, 'Erro na busca');
    return res.status(status).json({ success: false, message });
  }
}
