import { NextFunction, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import {
  fetchControleNfsSheet,
  fetchControleNfsSheetByName,
  fetchControleNfsTotalsSummary,
  fetchControleNfsValorBrutoTotal,
  fetchNfsLotFaturamento,
  fetchRecebidoMensalByGastosContract,
  loadProcessedNfsSheetsByTabKey,
  listControleNfsTabs,
  parseControleNfsTotalsFilters,
  parseEmissaoApuracaoFilters,
  toNfsTotalsComputeOptions,
  type ControleNfsTotalsFilters
} from '../services/ControleNfsSheetsService';
import { fetchControleGeralFinancialSummary } from '../services/ControleGeralFinancialService';
import {
  fetchBaseGastosSummary,
  resolveQueryContractRows
} from '../services/BaseGastosSheetsService';
import { buildGastosOperacionaisRows } from '../services/gastosOperacionaisRowsBuilder';
import { buildControleGeralFinancialRows } from '../services/controleGeralFinancialRowsBuilder';
import { buildFaturamentoByGastosContract } from '../lib/buildFaturamentoByGastosContract';

export class ControleNfsController {
  async listTabs(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({
        success: true,
        data: {
          tabs: listControleNfsTabs()
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getSheetByName(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const sheetName =
        typeof req.query.sheetName === 'string' ? req.query.sheetName.trim() : '';
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const sheet = await fetchControleNfsSheetByName(sheetName, forceRefresh);
      res.json({
        success: true,
        data: sheet
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar planilha.';
      if (message.includes('obrigatório') || message.includes('não encontrada')) {
        res.status(404).json({ success: false, message });
        return;
      }
      next(error);
    }
  }

  async getTotalsSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const gastosOnly =
        req.query.gastosOnly === '1' || req.query.gastosOnly === 'true';

      // Modo dedicado: gastos da aba QUERY BASE DE GASTOS (usado no Controle Geral).
      if (gastosOnly) {
        const { gastosYear } = req.query;
        const yearParam =
          gastosYear != null && String(gastosYear).trim() !== '' ? Number(gastosYear) : null;
        const filterYear =
          yearParam != null && Number.isFinite(yearParam) ? yearParam : undefined;

        const gastosSummary = await fetchBaseGastosSummary(filterYear, forceRefresh);
        const queryContractRows = resolveQueryContractRows(gastosSummary);
        const nfsRows = buildGastosOperacionaisRows(gastosSummary);

        res.json({
          success: true,
          data: {
            ...gastosSummary,
            byQueryContract: queryContractRows,
            queryContractRows,
            rows: queryContractRows,
            gastosOperacionaisRows: nfsRows
          }
        });
        return;
      }

      const filters = parseControleNfsTotalsFilters(req.query);
      const summary = await fetchControleNfsTotalsSummary(forceRefresh, filters);

      const includeGastos =
        req.query.includeGastos === '1' || req.query.includeGastos === 'true';

      if (includeGastos) {
        const { gastosYear } = req.query;
        const yearParam =
          gastosYear != null && String(gastosYear).trim() !== '' ? Number(gastosYear) : null;
        const filterYear =
          yearParam != null && Number.isFinite(yearParam) ? yearParam : undefined;

        const gastosSummary = await fetchBaseGastosSummary(filterYear, forceRefresh);
        const gastosOperacionaisRows = buildGastosOperacionaisRows(gastosSummary);
        const nfsLotFaturamento =
          summary.faturamentoByLot ??
          (await fetchNfsLotFaturamento(toNfsTotalsComputeOptions(filters)));
        const controleGeralRows = buildControleGeralFinancialRows(
          summary,
          gastosSummary,
          nfsLotFaturamento,
          filterYear
        );

        res.json({
          success: true,
          data: {
            ...summary,
            gastosByTab: gastosSummary.byTab,
            gastosByLot: gastosSummary.byLot,
            faturamentoByLot: nfsLotFaturamento,
            controleGeralRows,
            gastosOperacionaisRows,
            rows: gastosOperacionaisRows
          }
        });
        return;
      }

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar totais.';
      if (message.includes('Base de Gastos') || message.includes('planilha')) {
        res.status(503).json({ success: false, message });
        return;
      }
      next(error);
    }
  }

  async getValorBrutoTotal(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const summary = await fetchControleNfsValorBrutoTotal(forceRefresh);
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  /** Gastos (Base de Gastos) + faturamento bruto por contrato — usado no Controle Geral. */
  async getControleGeralFinancialSummary(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { year, refresh } = req.query;
      const yearParam = year != null && String(year).trim() !== '' ? Number(year) : null;
      const filterYear = yearParam != null && Number.isFinite(yearParam) ? yearParam : undefined;
      const forceRefresh = refresh === '1' || refresh === 'true';

      const summary = await fetchControleGeralFinancialSummary(filterYear, forceRefresh);

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  /** Faturamento bruto (NF's) somado por contrato da QUERY BASE DE GASTOS. */
  async getFaturamentoByGastosContract(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const apuracaoFilter = parseEmissaoApuracaoFilters(req.query);
      const filters: ControleNfsTotalsFilters | undefined = apuracaoFilter
        ? {
            emissaoApuracaoFilter: apuracaoFilter,
            recebimentoApuracaoFilter: apuracaoFilter
          }
        : undefined;

      const processedByTabKey = await loadProcessedNfsSheetsByTabKey(forceRefresh);

      // Recovery: carga paralela pode falhar na aba MAPA (rate-limit Google).
      if (!(processedByTabKey.get('mapa')?.rows?.length)) {
        try {
          await fetchControleNfsSheet('mapa', 'MAPA', true);
          const recovered = await loadProcessedNfsSheetsByTabKey(false);
          const mapa = recovered.get('mapa');
          if (mapa) processedByTabKey.set('mapa', mapa);
        } catch (error) {
          console.warn(
            '[controle-nfs] recovery MAPA falhou:',
            error instanceof Error ? error.message : error
          );
        }
      }

      const summary = await fetchControleNfsTotalsSummary(forceRefresh, filters, processedByTabKey);
      const nfsLotFaturamento =
        summary.faturamentoByLot ??
        (await fetchNfsLotFaturamento(toNfsTotalsComputeOptions(filters), processedByTabKey));

      const entries = buildFaturamentoByGastosContract(summary.byTab, nfsLotFaturamento);
      const recebidoMensal = await fetchRecebidoMensalByGastosContract(
        false,
        apuracaoFilter,
        processedByTabKey
      );

      res.json({
        success: true,
        data: {
          entries,
          recebidoMensalEntries: recebidoMensal.entries,
          fetchedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /** Recebidos mensais por contrato da QUERY BASE DE GASTOS (apuração por recebimento). */
  async getRecebidoMensalByGastosContract(
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const forceRefresh = req.query.refresh === '1' || req.query.refresh === 'true';
      const recebimentoApuracaoFilter = parseEmissaoApuracaoFilters(req.query);
      const summary = await fetchRecebidoMensalByGastosContract(
        forceRefresh,
        recebimentoApuracaoFilter
      );

      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      next(error);
    }
  }

  /** Gastos operacionais por contrato (aba Base de Gastos). */
  async getBaseGastosSummary(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { year, refresh } = req.query;
      const yearParam = year != null && String(year).trim() !== '' ? Number(year) : null;
      const filterYear = yearParam != null && Number.isFinite(yearParam) ? yearParam : undefined;
      const forceRefresh = refresh === '1' || refresh === 'true';

      const summary = await fetchBaseGastosSummary(filterYear, forceRefresh);
      const rows = buildGastosOperacionaisRows(summary);

      res.json({
        success: true,
        data: {
          ...summary,
          rows
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar Base de Gastos.';
      if (message.includes('Base de Gastos') || message.includes('planilha')) {
        res.status(503).json({ success: false, message });
        return;
      }
      next(error);
    }
  }

  async getSheet(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const tabKey = String(req.params.tabKey ?? '').trim();
      const sheetName =
        typeof req.query.sheetName === 'string' ? req.query.sheetName.trim() : undefined;
      const sheet = sheetName
        ? await fetchControleNfsSheetByName(sheetName)
        : await fetchControleNfsSheet(tabKey);
      res.json({
        success: true,
        data: sheet
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao carregar planilha.';
      if (message.includes('não encontrada')) {
        res.status(404).json({ success: false, message });
        return;
      }
      next(error);
    }
  }
}
