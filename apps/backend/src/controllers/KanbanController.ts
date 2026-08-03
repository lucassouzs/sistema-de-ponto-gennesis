import { Response, NextFunction } from 'express';
import multer from 'multer';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { KanbanService, KANBAN_FORBIDDEN } from '../services/KanbanService';

const kanbanService = new KanbanService();

const kanbanUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function requireUserId(req: AuthRequest, next: NextFunction): string | null {
  const id = req.user?.id;
  if (!id) {
    next(createError('Usuário não autenticado', 401));
    return null;
  }
  return id;
}

function handleKanbanError(error: unknown, next: NextFunction) {
  const msg = error instanceof Error ? error.message : '';
  if (msg === KANBAN_FORBIDDEN) {
    return next(createError('Sem permissão para acessar este quadro', 403));
  }
  next(error);
}

export class KanbanController {
  async listPickerUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const users = await kanbanService.listPickerUsers(userId);
      res.json({ success: true, data: users });
    } catch (error) {
      handleKanbanError(error, next);
    }
  }

  async listBoards(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const boards = await kanbanService.listBoardsForUser(userId);
      res.json({ success: true, data: boards });
    } catch (error) {
      handleKanbanError(error, next);
    }
  }

  async createBoard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { name } = req.body;
      if (!name?.trim()) return next(createError('Nome do quadro é obrigatório', 400));
      const board = await kanbanService.createCustomBoard(userId, name.trim());
      res.status(201).json({ success: true, data: board });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg && msg !== KANBAN_FORBIDDEN) {
        return next(createError(msg, 400));
      }
      handleKanbanError(error, next);
    }
  }

  async updateBoard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { boardId } = req.params;
      const { name } = req.body;
      if (!name?.trim()) return next(createError('Nome do quadro é obrigatório', 400));
      const board = await kanbanService.updateCustomBoardName(boardId, userId, name.trim());
      res.json({ success: true, data: board });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Quadro não encontrado') return next(createError(msg, 404));
      if (msg && msg !== KANBAN_FORBIDDEN) {
        return next(createError(msg, 400));
      }
      handleKanbanError(error, next);
    }
  }

  async deleteBoard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { boardId } = req.params;
      const result = await kanbanService.deleteCustomBoard(boardId, userId);
      res.json({ success: true, data: result });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Quadro não encontrado') return next(createError(msg, 404));
      handleKanbanError(error, next);
    }
  }

  async listBoardShares(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { boardId } = req.params;
      const shares = await kanbanService.listBoardShares(boardId, userId);
      res.json({ success: true, data: shares });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Quadro não encontrado') return next(createError(msg, 404));
      handleKanbanError(error, next);
    }
  }

  async addBoardShare(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { boardId } = req.params;
      const { userId: targetUserId, permission = 'WRITE' } = req.body;
      if (!targetUserId) return next(createError('userId do convidado é obrigatório', 400));
      const perm = permission === 'READ' ? 'READ' : 'WRITE';
      const share = await kanbanService.addBoardShare(boardId, targetUserId, perm, userId);
      res.status(201).json({ success: true, data: share });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Quadro não encontrado') return next(createError(msg, 404));
      if (msg && msg !== KANBAN_FORBIDDEN) {
        return next(createError(msg, 400));
      }
      handleKanbanError(error, next);
    }
  }

  async updateBoardShare(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { boardId, userId: targetUserId } = req.params;
      const { permission = 'READ' } = req.body;
      const perm = permission === 'WRITE' ? 'WRITE' : 'READ';
      const share = await kanbanService.updateBoardShare(boardId, targetUserId, perm, userId);
      res.json({ success: true, data: share });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Quadro não encontrado') return next(createError(msg, 404));
      handleKanbanError(error, next);
    }
  }

  async removeBoardShare(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { boardId, userId: targetUserId } = req.params;
      await kanbanService.removeBoardShare(boardId, targetUserId, userId);
      res.json({ success: true });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Quadro não encontrado') return next(createError(msg, 404));
      handleKanbanError(error, next);
    }
  }

  async getBoard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const departmentKey =
        typeof req.query.departmentKey === 'string' ? req.query.departmentKey : undefined;
      const board = await kanbanService.getBoardForUser(userId, departmentKey);
      res.json({ success: true, data: board });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Quadro não encontrado para este setor') {
        return next(createError(msg, 404));
      }
      handleKanbanError(error, next);
    }
  }

  async listArchivedCards(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const departmentKey =
        typeof req.query.departmentKey === 'string' ? req.query.departmentKey : undefined;
      const cards = await kanbanService.listArchivedCards(userId, departmentKey);
      res.json({ success: true, data: cards });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Quadro não encontrado para este setor') {
        return next(createError(msg, 404));
      }
      handleKanbanError(error, next);
    }
  }

  async updateBoardLabelPresets(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { presets, departmentKey, colorRemaps } = req.body;
      const data = await kanbanService.updateBoardLabelPresets(
        userId,
        presets,
        typeof departmentKey === 'string' ? departmentKey : undefined,
        colorRemaps,
      );
      res.json({ success: true, data });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Quadro não encontrado para este setor') {
        return next(createError(msg, 404));
      }
      if (msg && msg !== KANBAN_FORBIDDEN) {
        return next(createError(msg, 400));
      }
      handleKanbanError(error, next);
    }
  }

  async exportBoardTrello(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const departmentKey =
        typeof req.query.departmentKey === 'string' ? req.query.departmentKey : undefined;
      const { filename, payload } = await kanbanService.exportBoardAsTrello(
        userId,
        departmentKey,
      );
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      res.status(200).json(payload);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Quadro não encontrado para este setor') {
        return next(createError(msg, 404));
      }
      handleKanbanError(error, next);
    }
  }

  async importBoardTrello(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const body = req.body || {};
      const { departmentKey, replace, memberMap } = body;
      const trelloData =
        body.board && typeof body.board === 'object'
          ? body.board
          : Array.isArray(body.lists) && Array.isArray(body.cards)
            ? body
            : null;
      if (!trelloData) {
        return next(
          createError(
            'JSON inválido. Envie { board, replace } com export Trello/Gennesis (lists + cards).',
            400,
          ),
        );
      }

      const result = await kanbanService.importBoardFromTrello(userId, trelloData, {
        departmentKey: typeof departmentKey === 'string' ? departmentKey : undefined,
        replace: !!replace,
        memberMap:
          memberMap && typeof memberMap === 'object' && !Array.isArray(memberMap)
            ? (memberMap as Record<string, string>)
            : undefined,
      });
      res.json({ success: true, data: result });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Quadro não encontrado para este setor') {
        return next(createError(msg, 404));
      }
      if (msg && msg !== KANBAN_FORBIDDEN) {
        const friendly = /timeout|Transaction already closed|expired transaction/i.test(msg)
          ? 'A importação demorou demais. Tente de novo; o arquivo é muito grande.'
          : msg;
        const status = /timeout|Transaction already closed|expired transaction/i.test(msg)
          ? 408
          : 400;
        return next(createError(friendly, status));
      }
      handleKanbanError(error, next);
    }
  }

  async createColumn(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { title, color, cardLimit, boardId } = req.body;
      if (!title?.trim()) return next(createError('Título da coluna é obrigatório', 400));
      if (!color?.trim()) return next(createError('Cor da coluna é obrigatória', 400));

      const column = await kanbanService.createColumn(userId, {
        boardId,
        title: title.trim(),
        color: color.trim(),
        cardLimit: cardLimit != null ? Number(cardLimit) : undefined,
      });

      res.status(201).json({ success: true, data: column });
    } catch (error) {
      handleKanbanError(error, next);
    }
  }

  async updateColumn(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { id } = req.params;
      const { title, color, cardLimit, position } = req.body;

      const column = await kanbanService.updateColumn(userId, id, {
        title: title?.trim(),
        color: color?.trim(),
        cardLimit: cardLimit === undefined ? undefined : cardLimit == null ? null : Number(cardLimit),
        position: position !== undefined ? Number(position) : undefined,
      });

      res.json({ success: true, data: column });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2025') {
        return next(createError('Coluna não encontrada', 404));
      }
      handleKanbanError(error, next);
    }
  }

  async deleteColumn(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { id } = req.params;
      await kanbanService.deleteColumn(userId, id);
      res.json({ success: true, message: 'Coluna removida' });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2025') {
        return next(createError('Coluna não encontrada', 404));
      }
      handleKanbanError(error, next);
    }
  }

  async createCard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const {
        columnId,
        title,
        description,
        priority,
        startDate,
        endDate,
        labels,
        assigneeUserId,
        assigneeName,
        memberUserIds,
        totalTasks,
        completedTasks,
        insertAt,
      } = req.body;

      if (!columnId) return next(createError('columnId é obrigatório', 400));
      if (!title?.trim()) return next(createError('Título do card é obrigatório', 400));

      const card = await kanbanService.createCard(userId, {
        columnId,
        title,
        description,
        priority,
        startDate,
        endDate,
        labels,
        assigneeUserId,
        assigneeName,
        memberUserIds: Array.isArray(memberUserIds) ? memberUserIds : undefined,
        totalTasks: totalTasks != null ? Number(totalTasks) : 0,
        completedTasks: completedTasks != null ? Number(completedTasks) : 0,
        insertAt: insertAt === 'bottom' ? 'bottom' : 'top',
      });

      res.status(201).json({ success: true, data: card });
    } catch (error) {
      handleKanbanError(error, next);
    }
  }

  async updateCard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { id } = req.params;
      const {
        columnId,
        title,
        description,
        priority,
        startDate,
        endDate,
        labels,
        assigneeUserId,
        assigneeName,
        totalTasks,
        completedTasks,
        checklistEnabled,
        attachmentsEnabled,
        position,
        workHours,
        completedAt,
        archivedAt,
      } = req.body;

      const card = await kanbanService.updateCard(userId, id, {
        columnId,
        title: title?.trim(),
        description,
        priority,
        startDate,
        endDate,
        labels,
        assigneeUserId,
        assigneeName,
        totalTasks: totalTasks != null ? Number(totalTasks) : undefined,
        completedTasks: completedTasks != null ? Number(completedTasks) : undefined,
        checklistEnabled:
          checklistEnabled !== undefined ? Boolean(checklistEnabled) : undefined,
        attachmentsEnabled:
          attachmentsEnabled !== undefined ? Boolean(attachmentsEnabled) : undefined,
        position: position != null ? Number(position) : undefined,
        workHours:
          workHours !== undefined
            ? workHours == null || workHours === ''
              ? null
              : Number(workHours)
            : undefined,
        completedAt:
          completedAt === undefined
            ? undefined
            : completedAt === null || completedAt === ''
              ? null
              : String(completedAt),
        archivedAt:
          archivedAt === undefined
            ? undefined
            : archivedAt === null || archivedAt === ''
              ? null
              : String(archivedAt),
      });

      res.json({ success: true, data: card });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Card não encontrado' || (error as { code?: string })?.code === 'P2025') {
        return next(createError('Card não encontrado', 404));
      }
      handleKanbanError(error, next);
    }
  }

  async moveCard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { id } = req.params;
      const columnId = typeof req.body?.columnId === 'string' ? req.body.columnId : '';
      const position = req.body?.position != null ? Number(req.body.position) : NaN;
      if (!columnId || !Number.isFinite(position)) {
        return next(createError('columnId e position são obrigatórios', 400));
      }

      const card = await kanbanService.moveCard(userId, id, {
        columnId,
        position,
      });

      res.json({ success: true, data: card });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Card não encontrado' || (error as { code?: string })?.code === 'P2025') {
        return next(createError('Card não encontrado', 404));
      }
      handleKanbanError(error, next);
    }
  }

  async duplicateCard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { id } = req.params;
      const body = req.body as { title?: string; columnId?: string } | undefined;
      const card = await kanbanService.duplicateCard(userId, id, {
        title: body?.title,
        columnId: body?.columnId,
      });
      res.status(201).json({ success: true, data: card });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Card não encontrado' || (error as { code?: string })?.code === 'P2025') {
        return next(createError('Card não encontrado', 404));
      }
      if (msg === 'Coluna inválida') {
        return next(createError('Coluna inválida', 400));
      }
      handleKanbanError(error, next);
    }
  }

  async deleteCard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { id } = req.params;
      await kanbanService.deleteCard(userId, id);
      res.json({ success: true, message: 'Card removido' });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2025') {
        return next(createError('Card não encontrado', 404));
      }
      handleKanbanError(error, next);
    }
  }

  async addCardMember(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const requesterId = requireUserId(req, next);
      if (!requesterId) return;
      const { cardId } = req.params;
      const { userId } = req.body;
      if (!userId) return next(createError('userId é obrigatório', 400));
      const card = await kanbanService.addCardMember(requesterId, cardId, userId);
      res.json({ success: true, data: card });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Card não encontrado' || msg === 'Usuário não encontrado') {
        return next(createError(msg, 404));
      }
      handleKanbanError(error, next);
    }
  }

  async removeCardMember(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const requesterId = requireUserId(req, next);
      if (!requesterId) return;
      const { cardId, userId } = req.params;
      const card = await kanbanService.removeCardMember(requesterId, cardId, userId);
      res.json({ success: true, data: card });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Card não encontrado') return next(createError(msg, 404));
      handleKanbanError(error, next);
    }
  }

  async getCardById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const card = await kanbanService.getCardById(userId, req.params.id);
      res.json({ success: true, data: card });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Card não encontrado') return next(createError(msg, 404));
      handleKanbanError(error, next);
    }
  }

  async getCardCost(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const cost = await kanbanService.getCardCost(userId, req.params.id);
      res.json({ success: true, data: cost });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Card não encontrado') return next(createError(msg, 404));
      if (
        msg === 'Defina a data de entrega (início e fim) no card para calcular o custo' ||
        msg === 'A data final deve ser posterior à data inicial'
      ) {
        return next(createError(msg, 400));
      }
      handleKanbanError(error, next);
    }
  }

  async createChecklistItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { title } = req.body;
      if (!title?.trim()) return next(createError('Título da tarefa é obrigatório', 400));
      const data = await kanbanService.createChecklistItem(userId, req.params.cardId, title);
      res.status(201).json({ success: true, data });
    } catch (error) {
      handleKanbanError(error, next);
    }
  }

  async updateChecklistItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { title, isDone, assigneeUserId, dueDate } = req.body;
      const data = await kanbanService.updateChecklistItem(userId, req.params.id, {
        title,
        isDone,
        assigneeUserId: assigneeUserId !== undefined ? assigneeUserId : undefined,
        dueDate: dueDate !== undefined ? dueDate : undefined,
      });
      res.json({ success: true, data });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2025') {
        return next(createError('Tarefa não encontrada', 404));
      }
      handleKanbanError(error, next);
    }
  }

  async deleteChecklistItem(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      await kanbanService.deleteChecklistItem(userId, req.params.id);
      res.json({ success: true, message: 'Tarefa removida' });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2025') {
        return next(createError('Tarefa não encontrada', 404));
      }
      handleKanbanError(error, next);
    }
  }

  async createComment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { content } = req.body;
      if (!content?.trim()) return next(createError('Comentário não pode ser vazio', 400));
      const comment = await kanbanService.createComment(
        userId,
        req.params.cardId,
        content,
      );
      res.status(201).json({ success: true, data: comment });
    } catch (error) {
      handleKanbanError(error, next);
    }
  }

  async deleteComment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      await kanbanService.deleteComment(userId, req.params.id);
      res.json({ success: true, message: 'Comentário removido' });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Comentário não encontrado' || (error as { code?: string })?.code === 'P2025') {
        return next(createError('Comentário não encontrado', 404));
      }
      handleKanbanError(error, next);
    }
  }

  static uploadAttachments() {
    return kanbanUpload.array('attachments', 10);
  }

  async addAttachments(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const files = (req as AuthRequest & { files?: Express.Multer.File[] }).files ?? [];
      const card = await kanbanService.addAttachments(userId, req.params.cardId, files);
      res.status(201).json({ success: true, data: card });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Card não encontrado') return next(createError(msg, 404));
      if (msg === 'Nenhum arquivo enviado') return next(createError(msg, 400));
      handleKanbanError(error, next);
    }
  }

  async addLinkAttachment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const { url, displayName } = req.body as { url?: string; displayName?: string };
      const card = await kanbanService.addLinkAttachment(userId, req.params.cardId, {
        url: url ?? '',
        displayName,
      });
      res.status(201).json({ success: true, data: card });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Card não encontrado') return next(createError(msg, 404));
      if (msg === 'URL é obrigatória' || msg === 'URL inválida') {
        return next(createError(msg, 400));
      }
      handleKanbanError(error, next);
    }
  }

  async deleteAttachment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = requireUserId(req, next);
      if (!userId) return;
      const card = await kanbanService.deleteAttachment(userId, req.params.id);
      res.json({ success: true, data: card });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'Anexo não encontrado') return next(createError(msg, 404));
      if (msg === 'Sem permissão para remover este anexo') return next(createError(msg, 403));
      handleKanbanError(error, next);
    }
  }
}
