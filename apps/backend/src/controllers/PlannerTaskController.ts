import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/** Aceita YYYY-MM-DD, YYYY-MM-DDTHH:mm ou ISO completo (fuso local). */
function parseDueDateTime(value: unknown): Date | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const raw = String(value).trim();

  const localDt = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (localDt) {
    return new Date(
      Number(localDt[1]),
      Number(localDt[2]) - 1,
      Number(localDt[3]),
      Number(localDt[4]),
      Number(localDt[5]),
      Number(localDt[6] || 0),
      0
    );
  }

  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
      9,
      0,
      0,
      0
    );
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseDate(value: unknown): Date | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

async function ensureDefaultList(userId: string) {
  const existing = await prisma.plannerTaskList.findFirst({
    where: { userId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  if (existing) return existing;
  return prisma.plannerTaskList.create({
    data: { userId, title: 'Minhas tarefas', position: 0 },
  });
}

export class PlannerTaskController {
  async listLists(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      await ensureDefaultList(userId);
      const lists = await prisma.plannerTaskList.findMany({
        where: { userId },
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        include: {
          tasks: {
            orderBy: [
              { completed: 'asc' },
              { starred: 'desc' },
              { dueDate: 'asc' },
              { position: 'asc' },
              { createdAt: 'desc' },
            ],
          },
        },
      });
      res.json({ success: true, data: lists });
    } catch (error) {
      next(error);
    }
  }

  async createList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const title = String(req.body?.title || '').trim() || 'Lista sem nome';
      const maxPos = await prisma.plannerTaskList.aggregate({
        where: { userId },
        _max: { position: true },
      });
      const created = await prisma.plannerTaskList.create({
        data: {
          userId,
          title,
          position: (maxPos._max.position ?? -1) + 1,
        },
        include: { tasks: true },
      });
      res.status(201).json({ success: true, data: created });
    } catch (error) {
      next(error);
    }
  }

  async updateList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const id = String(req.params.id || '');
      const existing = await prisma.plannerTaskList.findFirst({ where: { id, userId } });
      if (!existing) throw createError('Lista não encontrada', 404);

      const data: { title?: string; position?: number } = {};
      if (req.body?.title !== undefined) {
        const title = String(req.body.title || '').trim();
        if (!title) throw createError('Título é obrigatório', 400);
        data.title = title;
      }
      if (req.body?.position !== undefined) {
        const pos = Number(req.body.position);
        if (!Number.isNaN(pos)) data.position = pos;
      }

      const updated = await prisma.plannerTaskList.update({
        where: { id },
        data,
        include: {
          tasks: {
            orderBy: [
              { completed: 'asc' },
              { starred: 'desc' },
              { dueDate: 'asc' },
              { position: 'asc' },
              { createdAt: 'desc' },
            ],
          },
        },
      });
      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async deleteList(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const id = String(req.params.id || '');
      const existing = await prisma.plannerTaskList.findFirst({ where: { id, userId } });
      if (!existing) throw createError('Lista não encontrada', 404);

      const count = await prisma.plannerTaskList.count({ where: { userId } });
      if (count <= 1) throw createError('Não é possível excluir a única lista', 400);

      await prisma.plannerTaskList.delete({ where: { id } });
      res.json({ success: true, data: { id } });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const from = parseDate(req.query.from);
      const to = parseDate(req.query.to);
      const onlyWithDue = String(req.query.withDue || '') === '1';
      const includeCompleted = String(req.query.includeCompleted || '1') !== '0';
      const listId = req.query.listId ? String(req.query.listId) : undefined;

      const where: {
        userId: string;
        listId?: string;
        completed?: boolean;
        dueDate?: { gte?: Date; lt?: Date; not?: null };
      } = { userId };

      if (listId) where.listId = listId;
      if (!includeCompleted) where.completed = false;
      if (onlyWithDue) where.dueDate = { not: null };
      if (from || to) {
        where.dueDate = {
          ...(where.dueDate || {}),
          ...(from ? { gte: from } : {}),
          ...(to ? { lt: to } : {}),
        };
      }

      const tasks = await prisma.plannerTask.findMany({
        where,
        orderBy: [
          { completed: 'asc' },
          { starred: 'desc' },
          { dueDate: 'asc' },
          { position: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      res.json({ success: true, data: tasks });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const title = String(req.body?.title || '').trim();
      if (!title) throw createError('Título é obrigatório', 400);

      let listId = String(req.body?.listId || '').trim();
      if (listId) {
        const list = await prisma.plannerTaskList.findFirst({ where: { id: listId, userId } });
        if (!list) throw createError('Lista não encontrada', 404);
      } else {
        const defaultList = await ensureDefaultList(userId);
        listId = defaultList.id;
      }

      const maxPos = await prisma.plannerTask.aggregate({
        where: { userId, listId, completed: false },
        _max: { position: true },
      });

      const created = await prisma.plannerTask.create({
        data: {
          userId,
          listId,
          title,
          notes: String(req.body?.notes || '').trim(),
          dueDate: parseDueDateTime(req.body?.dueDate),
          starred: Boolean(req.body?.starred),
          position: (maxPos._max.position ?? 0) + 1,
        },
      });

      res.status(201).json({ success: true, data: created });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const id = String(req.params.id || '');
      const existing = await prisma.plannerTask.findFirst({ where: { id, userId } });
      if (!existing) throw createError('Tarefa não encontrada', 404);

      const data: {
        title?: string;
        notes?: string;
        dueDate?: Date | null;
        starred?: boolean;
        completed?: boolean;
        completedAt?: Date | null;
        position?: number;
        listId?: string;
      } = {};

      if (req.body?.title !== undefined) {
        const title = String(req.body.title || '').trim();
        if (!title) throw createError('Título é obrigatório', 400);
        data.title = title;
      }
      if (req.body?.notes !== undefined) data.notes = String(req.body.notes || '').trim();
      if (req.body?.dueDate !== undefined) {
        data.dueDate =
          req.body.dueDate === null || req.body.dueDate === ''
            ? null
            : parseDueDateTime(req.body.dueDate);
      }
      if (req.body?.starred !== undefined) data.starred = Boolean(req.body.starred);
      if (req.body?.position !== undefined) {
        const pos = Number(req.body.position);
        if (!Number.isNaN(pos)) data.position = pos;
      }
      if (req.body?.listId !== undefined) {
        const listId = String(req.body.listId || '').trim();
        const list = await prisma.plannerTaskList.findFirst({ where: { id: listId, userId } });
        if (!list) throw createError('Lista não encontrada', 404);
        data.listId = listId;
      }
      if (req.body?.completed !== undefined) {
        const completed = Boolean(req.body.completed);
        data.completed = completed;
        data.completedAt = completed ? new Date() : null;
      }

      const updated = await prisma.plannerTask.update({
        where: { id },
        data,
      });

      res.json({ success: true, data: updated });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const id = String(req.params.id || '');
      const existing = await prisma.plannerTask.findFirst({ where: { id, userId } });
      if (!existing) throw createError('Tarefa não encontrada', 404);
      await prisma.plannerTask.delete({ where: { id } });
      res.json({ success: true, data: { id } });
    } catch (error) {
      next(error);
    }
  }
}
