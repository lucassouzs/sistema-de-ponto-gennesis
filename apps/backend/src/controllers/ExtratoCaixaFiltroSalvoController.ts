import { Response, NextFunction } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const PRISMA_FILTROS_MSG =
  'Filtros salvos indisponíveis: o servidor precisa de `npx prisma generate` em apps/backend e reinício do backend.';

function getFiltroSalvoDelegate() {
  const delegate = (prisma as PrismaClient).extratoCaixaFiltroSalvo;
  if (!delegate) {
    throw new Error(PRISMA_FILTROS_MSG);
  }
  return delegate;
}

export type ExtratoCaixaFiltroPayloadDto = {
  ccFilterCodes: string[];
  natureFilterCodes: string[];
  poloFilterIds: string[];
  fornecedorFilterValues: string[];
  historicoFilterValues: string[];
  tipoOperacaoFilterValues: string[];
  movimentoTipoFilter: string[];
  periodFrom: string;
  periodTo: string;
};

type CreateBody = {
  nome?: string;
  payload?: ExtratoCaixaFiltroPayloadDto;
};

function parsePayload(raw: unknown): ExtratoCaixaFiltroPayloadDto {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Payload do filtro inválido.');
  }
  const p = raw as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x)) : [];
  return {
    ccFilterCodes: arr(p.ccFilterCodes),
    natureFilterCodes: arr(p.natureFilterCodes),
    poloFilterIds: arr(p.poloFilterIds ?? p.filialFilterIds),
    fornecedorFilterValues: arr(p.fornecedorFilterValues),
    historicoFilterValues: arr(p.historicoFilterValues),
    tipoOperacaoFilterValues: arr(p.tipoOperacaoFilterValues),
    movimentoTipoFilter: arr(p.movimentoTipoFilter),
    periodFrom: p.periodFrom != null ? String(p.periodFrom) : '',
    periodTo: p.periodTo != null ? String(p.periodTo) : ''
  };
}

function parseNome(raw: unknown): string {
  const nome = String(raw ?? '').trim();
  if (!nome) throw new Error('Informe um nome para o filtro salvo.');
  if (nome.length > 80) throw new Error('O nome do filtro deve ter no máximo 80 caracteres.');
  return nome;
}

function serialize(row: {
  id: string;
  nome: string;
  payload: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    nome: row.nome,
    payload: parsePayload(row.payload),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export class ExtratoCaixaFiltroSalvoController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Não autenticado.' });
        return;
      }
      const rows = await getFiltroSalvoDelegate().findMany({
        where: { userId },
        orderBy: [{ nome: 'asc' }]
      });
      res.json({
        success: true,
        data: rows.map(serialize)
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Não autenticado.' });
        return;
      }
      const body = req.body as CreateBody;
      const nome = parseNome(body.nome);
      const payload = parsePayload(body.payload);

      const row = await getFiltroSalvoDelegate().create({
        data: {
          userId,
          nome,
          payload: payload as unknown as Prisma.InputJsonValue
        }
      });
      res.status(201).json({ success: true, data: serialize(row) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.status(409).json({
          success: false,
          message: 'Já existe um filtro salvo com esse nome. Escolha outro nome.'
        });
        return;
      }
      if (error instanceof Error && error.message) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Não autenticado.' });
        return;
      }
      const { id } = req.params;
      const body = req.body as CreateBody;
      const nome = parseNome(body.nome);
      const payload = parsePayload(body.payload);

      const existing = await getFiltroSalvoDelegate().findFirst({
        where: { id, userId }
      });
      if (!existing) {
        res.status(404).json({ success: false, message: 'Filtro salvo não encontrado.' });
        return;
      }

      const row = await getFiltroSalvoDelegate().update({
        where: { id },
        data: {
          nome,
          payload: payload as unknown as Prisma.InputJsonValue
        }
      });
      res.json({ success: true, data: serialize(row) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        res.status(409).json({
          success: false,
          message: 'Já existe um filtro salvo com esse nome. Escolha outro nome.'
        });
        return;
      }
      if (error instanceof Error && error.message) {
        res.status(400).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: 'Não autenticado.' });
        return;
      }
      const { id } = req.params;
      const existing = await getFiltroSalvoDelegate().findFirst({
        where: { id, userId }
      });
      if (!existing) {
        res.status(404).json({ success: false, message: 'Filtro salvo não encontrado.' });
        return;
      }
      await getFiltroSalvoDelegate().delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}
