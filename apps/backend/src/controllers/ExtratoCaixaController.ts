import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { getTotvsRmRelatorioFinService } from '../services/TotvsRmRelatorioFinService';

export type ExtratoCaixaItem = {
  idxcx: number | null;
  codColigada: number | null;
  historico: string;
  codCxa: string;
  codCCusto: string;
  /** Nome do centro de custo (GCCUSTO.NOME no RM). */
  ccusto: string;
  valor: number;
  /** VALOR_BAIXA (FLANBAIXA.VALORBAIXA) — valor da baixa no financeiro. */
  valorBaixa: number;
  entrada: number;
  saida: number;
  codFilial: number | null;
  data: string | null;
  dataCompensacao: string | null;
  codNatFinanceira: string;
  /** Descrição da natureza (TTBORCAMENTO.DESCRICAO no RM). */
  natureza: string;
  numeroDocumento: string;
  fornecedor: string;
  tipoOperacao: string;
};

function pickField(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key];
    const found = Object.keys(row).find((rk) => rk.toUpperCase() === key.toUpperCase());
    if (found && row[found] !== undefined && row[found] !== null) return row[found];
  }
  return undefined;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** Retorna YYYY-MM-DD sem deslocar o dia por fuso horário. */
function toCalendarDateString(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }

  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateSortKey(data: string | null): number {
  if (!data) return Number.NEGATIVE_INFINITY;
  const iso = data.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])).getTime();
  }
  const t = new Date(data).getTime();
  return Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY;
}

function mapRow(row: Record<string, unknown>): ExtratoCaixaItem {
  const idxcxRaw = pickField(row, 'IDXCX');
  const codColigadaRaw = pickField(row, 'CODCOLIGADA');
  const codFilialRaw = pickField(row, 'CODFILIAL');
  const entrada = toNumber(pickField(row, 'ENTRADA'));
  const saida = toNumber(pickField(row, 'SAIDA'));
  const valor = toNumber(pickField(row, 'VALOR'));
  const valorBaixa = toNumber(
    pickField(row, 'VALOR_BAIXA', 'VALORBAIXA', 'VALOR_BAIXADO', 'VALORBAIXADO', 'VALOR_DA_BAIXA')
  );

  return {
    idxcx: idxcxRaw != null ? toNumber(idxcxRaw) : null,
    codColigada: codColigadaRaw != null ? toNumber(codColigadaRaw) : null,
    historico: String(pickField(row, 'HISTORICO') ?? '').trim(),
    codCxa: String(pickField(row, 'CODCXA') ?? '').trim(),
    codCCusto: String(pickField(row, 'CODCCUSTO') ?? '').trim(),
    ccusto: String(pickField(row, 'CCUSTO') ?? '').trim(),
    valor,
    valorBaixa,
    entrada,
    saida,
    codFilial: codFilialRaw != null ? toNumber(codFilialRaw) : null,
    data: toCalendarDateString(pickField(row, 'DATA')),
    dataCompensacao: toCalendarDateString(pickField(row, 'DATACOMPENSACAO')),
    codNatFinanceira: String(pickField(row, 'CODNATFINANCEIRA') ?? '').trim(),
    natureza: String(pickField(row, 'NATUREZA') ?? '').trim(),
    numeroDocumento: String(pickField(row, 'NUMERODOCUMENTO') ?? '').trim(),
    fornecedor: String(pickField(row, 'FORNECEDOR') ?? '').trim(),
    tipoOperacao: String(pickField(row, 'TIPOOPERACAO') ?? '').trim()
  };
}

export class ExtratoCaixaController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const svc = getTotvsRmRelatorioFinService();
      if (!svc.isConfigured()) {
        res.json({
          success: true,
          data: {
            configured: false,
            items: [] as ExtratoCaixaItem[],
            total: 0,
            message:
              'Integração TOTVS RM não configurada. Defina TOTVS_RM_BASE_URL e TOTVS_RM_USER + TOTVS_RM_PASSWORD (Basic) ou TOTVS_RM_BEARER_TOKEN.'
          }
        });
        return;
      }

      try {
        const { rows, configuredYears, pathFailures } = await svc.fetchExtratoCaixaRows();
        const items = rows.map(mapRow).sort((a, b) => {
          const byComp = dateSortKey(b.dataCompensacao) - dateSortKey(a.dataCompensacao);
          if (byComp !== 0) return byComp;
          return (b.idxcx ?? 0) - (a.idxcx ?? 0);
        });
        res.json({
          success: true,
          data: {
            configured: true,
            items,
            total: items.length,
            configuredYears,
            pathFailures: pathFailures.length > 0 ? pathFailures : undefined,
            message: null as string | null
          }
        });
      } catch (err) {
        const message = svc.formatAxiosError(err);
        console.warn(`[TOTVS RM EXTRATO CAIXA]: ${message}`);
        res.json({
          success: false,
          message,
          data: {
            configured: true,
            items: [] as ExtratoCaixaItem[],
            total: 0
          }
        });
      }
    } catch (error) {
      next(error);
    }
  }
}
