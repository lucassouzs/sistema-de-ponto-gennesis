import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { randomUUID } from 'crypto';

function toNum(v: unknown): number {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Alinhado ao normalizeContractOrderKey do frontend (painel de gastos). */
export function normalizeControleGeralContractKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

type TetoRow = {
  id: string;
  contractKey: string;
  contractName: string;
  year: number;
  month: number;
  amount: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function serializeRow(row: TetoRow) {
  return {
    id: row.id,
    contractKey: row.contractKey,
    contractName: row.contractName,
    year: row.year,
    month: row.month,
    amount: toNum(row.amount),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export class ControleGeralTetoOrcamentarioController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const yearRaw = typeof req.query.year === 'string' ? req.query.year : '';
      const monthRaw = typeof req.query.month === 'string' ? req.query.month : '';
      const contractKeyRaw =
        typeof req.query.contractKey === 'string' ? req.query.contractKey : '';

      const clauses: string[] = [];
      const params: unknown[] = [];

      if (yearRaw) {
        const year = Number.parseInt(yearRaw, 10);
        if (!Number.isFinite(year) || year < 2000 || year > 2100) {
          throw createError('Ano inválido.', 400);
        }
        params.push(year);
        clauses.push(`"year" = $${params.length}`);
      }

      if (monthRaw) {
        const month = Number.parseInt(monthRaw, 10);
        if (!Number.isFinite(month) || month < 1 || month > 12) {
          throw createError('Mês inválido.', 400);
        }
        params.push(month);
        clauses.push(`"month" = $${params.length}`);
      }

      if (contractKeyRaw.trim()) {
        params.push(normalizeControleGeralContractKey(contractKeyRaw));
        clauses.push(`"contractKey" = $${params.length}`);
      }

      const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const rows = await prisma.$queryRawUnsafe<TetoRow[]>(
        `
          SELECT "id", "contractKey", "contractName", "year", "month", "amount", "createdAt", "updatedAt"
          FROM "controle_geral_teto_orcamentario"
          ${whereSql}
          ORDER BY "year" DESC, "month" DESC, "contractName" ASC
        `,
        ...params
      );

      res.json({
        success: true,
        data: rows.map(serializeRow)
      });
    } catch (error) {
      next(error);
    }
  }

  async save(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const body = req.body as {
        contractName?: string;
        contractKey?: string;
        year?: number | string;
        month?: number | string;
        amount?: number | string;
      };

      const contractName = String(body.contractName ?? '').trim();
      if (!contractName) {
        throw createError('Informe o contrato.', 400);
      }

      const contractKey = normalizeControleGeralContractKey(
        String(body.contractKey ?? contractName).trim() || contractName
      );
      if (!contractKey) {
        throw createError('Contrato inválido.', 400);
      }

      const year = Number.parseInt(String(body.year ?? ''), 10);
      if (!Number.isFinite(year) || year < 2000 || year > 2100) {
        throw createError('Ano inválido.', 400);
      }

      const month = Number.parseInt(String(body.month ?? ''), 10);
      if (!Number.isFinite(month) || month < 1 || month > 12) {
        throw createError('Mês inválido.', 400);
      }

      const amount = typeof body.amount === 'number' ? body.amount : Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        throw createError('Informe um valor válido (maior ou igual a zero).', 400);
      }

      const userId = req.user?.id ?? null;
      const now = new Date();

      const existing = await prisma.$queryRawUnsafe<TetoRow[]>(
        `
          SELECT "id", "contractKey", "contractName", "year", "month", "amount", "createdAt", "updatedAt"
          FROM "controle_geral_teto_orcamentario"
          WHERE "contractKey" = $1 AND "year" = $2 AND "month" = $3
          LIMIT 1
        `,
        contractKey,
        year,
        month
      );

      let row: TetoRow | undefined;
      if (existing[0]) {
        const updated = await prisma.$queryRawUnsafe<TetoRow[]>(
          `
            UPDATE "controle_geral_teto_orcamentario"
            SET
              "contractName" = $1,
              "amount" = $2,
              "updatedById" = $3,
              "updatedAt" = $4
            WHERE "id" = $5
            RETURNING "id", "contractKey", "contractName", "year", "month", "amount", "createdAt", "updatedAt"
          `,
          contractName,
          amount,
          userId,
          now,
          existing[0].id
        );
        row = updated[0];
      } else {
        const id = randomUUID();
        const created = await prisma.$queryRawUnsafe<TetoRow[]>(
          `
            INSERT INTO "controle_geral_teto_orcamentario"
              ("id", "contractKey", "contractName", "year", "month", "amount", "createdById", "updatedById", "createdAt", "updatedAt")
            VALUES
              ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING "id", "contractKey", "contractName", "year", "month", "amount", "createdAt", "updatedAt"
          `,
          id,
          contractKey,
          contractName,
          year,
          month,
          amount,
          userId,
          userId,
          now,
          now
        );
        row = created[0];
      }

      if (!row) {
        throw createError('Falha ao gravar o teto orçamentário.', 500);
      }

      res.json({
        success: true,
        data: serializeRow(row),
        message: 'Teto orçamentário salvo.'
      });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      if (!id?.trim()) {
        throw createError('Informe o registro.', 400);
      }

      const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
        `SELECT "id" FROM "controle_geral_teto_orcamentario" WHERE "id" = $1 LIMIT 1`,
        id
      );
      if (!existing[0]) {
        throw createError('Registro não encontrado.', 404);
      }

      await prisma.$executeRawUnsafe(
        `DELETE FROM "controle_geral_teto_orcamentario" WHERE "id" = $1`,
        id
      );

      res.json({
        success: true,
        message: 'Teto orçamentário removido.'
      });
    } catch (error) {
      next(error);
    }
  }
}
