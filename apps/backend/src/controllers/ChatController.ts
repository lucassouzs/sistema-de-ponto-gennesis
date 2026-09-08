import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { ChatService } from '../services/ChatService';
import { readFuelStoredPhoto } from '../lib/fuelPhotoStorage';
import {
  gennecyChatAssistant,
  getGennecyBotUserId,
  resolveGennecyInvokeMode,
  shouldProcessGennecyMessage,
} from '../services/GennecyChatAssistantService';
import { GENNECY_FUEL_MENU_MESSAGE, isGennecyFuelMenuMessage } from '../services/GennecyFuelFlowService';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { getActiveGroupCallForChat } from '../realtime/wsCallSignaling';

const chatService = new ChatService();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5
  }
});

export class ChatController {
  private normalizeDownloadFileName(name?: string): string {
    const base = String(name || 'anexo').trim() || 'anexo';
    return base.replace(/[\\/:*?"<>|]+/g, '_');
  }
  /**
   * Cria um novo chat
   */
  async createChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { recipientDepartment, initialMessage } = req.body;

      if (!recipientDepartment || !initialMessage) {
        throw createError('Setor destinatário e mensagem inicial são obrigatórios', 400);
      }

      const attachments: any[] = [];
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as Express.Multer.File[]) {
          const uploadResult = await chatService.uploadFile(file, userId);
          attachments.push({
            fileName: file.originalname,
            fileUrl: uploadResult.url,
            fileKey: uploadResult.key,
            fileSize: uploadResult.size,
            mimeType: uploadResult.mimeType
          });
        }
      }

      const chat = await chatService.createChat({
        initiatorId: userId,
        recipientDepartment,
        initialMessage,
        attachments
      });

      res.json({
        success: true,
        message: 'Chat criado com sucesso',
        data: chat
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Aceita um chat pendente
   */
  async acceptChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      const chat = await chatService.acceptChat(id, userId);

      res.json({
        success: true,
        message: 'Chat aceito com sucesso',
        data: chat
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Rejeita um chat
   */
  async rejectChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      await chatService.rejectChat(id, userId);

      res.json({
        success: true,
        message: 'Chat rejeitado'
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Deleta uma conversa
   */
  async deleteChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      await chatService.deleteChat(id, userId);

      res.json({
        success: true,
        message: 'Conversa deletada com sucesso'
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Envia mensagem em um chat
   */
  async sendMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { chatId, content } = req.body;

      if (!chatId || !content) {
        throw createError('ID do chat e conteúdo são obrigatórios', 400);
      }

      const attachments: any[] = [];
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as Express.Multer.File[]) {
          const uploadResult = await chatService.uploadFile(file, userId);
          attachments.push({
            fileName: file.originalname,
            fileUrl: uploadResult.url,
            fileKey: uploadResult.key,
            fileSize: uploadResult.size,
            mimeType: uploadResult.mimeType
          });
        }
      }

      const message = await chatService.sendMessage({
        chatId,
        senderId: userId,
        content,
        attachments
      });

      res.json({
        success: true,
        message: 'Mensagem enviada',
        data: message
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Lista chats pendentes
   */
  async getPendingChats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { employee: true }
      });

      if (!user?.employee) {
        throw createError('Usuário não possui departamento', 400);
      }

      const chats = await chatService.getPendingChats(user.employee.department);

      res.json({
        success: true,
        data: chats
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Lista chats ativos
   */
  async getActiveChats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const chats = await chatService.getActiveChats(userId);

      res.json({
        success: true,
        data: chats
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Lista chats encerrados
   */
  async getClosedChats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const chats = await chatService.getClosedChats(userId);

      res.json({
        success: true,
        data: chats
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Obtém um chat específico
   */
  async getChatById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      if (!id) {
        throw createError('ID do chat é obrigatório', 400);
      }

      const chat = await chatService.getChatById(id, userId);

      res.json({
        success: true,
        data: chat
      });
    } catch (error: any) {
      console.error('Erro em getChatById controller:', {
        userId: req.user?.id,
        chatId: req.params?.id,
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * Marca mensagens como lidas
   */
  async markAsRead(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      await chatService.markMessagesAsRead(id, userId);

      res.json({
        success: true,
        message: 'Mensagens marcadas como lidas'
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Encerra um chat
   */
  async closeChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const { id } = req.params;
      await chatService.closeChat(id, userId);

      res.json({
        success: true,
        message: 'Chat encerrado'
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Conta chats pendentes
   */
  async getPendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { employee: true }
      });

      if (!user?.employee) {
        throw createError('Usuário não possui departamento', 400);
      }

      const count = await chatService.getPendingChatsCount(user.employee.department);

      res.json({
        success: true,
        data: { count }
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Conta mensagens não lidas
   */
  async getUnreadCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        throw createError('Usuário não autenticado', 401);
      }

      const count = await chatService.getUnreadMessagesCount(userId);

      res.json({
        success: true,
        data: { count }
      });
    } catch (error: any) {
      next(error);
    }
  }

  // ===========================================================
  //  CHAT DIRETO ENTRE USUÁRIOS
  // ===========================================================

  /**
   * Lista todos os usuários para iniciar conversa
   */
  async listUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const users = await chatService.listUsers(userId);
      res.json({ success: true, data: users });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Abre (ou cria) um chat direto com outro usuário
   */
  async openDirectChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const initiatorId = req.user?.id;
      if (!initiatorId) throw createError('Usuário não autenticado', 401);

      const { recipientId } = req.body;
      if (!recipientId) throw createError('ID do destinatário é obrigatório', 400);

      const chat = await chatService.getOrCreateDirectChat(initiatorId, recipientId);
      res.json({ success: true, data: chat });
    } catch (error: any) {
      next(error);
    }
  }

  /** Abre (ou cria) conversa direta com a assistente Gennecy. */
  async openGennecyDirectChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const initiatorId = req.user?.id;
      if (!initiatorId) throw createError('Usuário não autenticado', 401);

      const botId = await getGennecyBotUserId();
      const chat = await chatService.getOrCreateDirectChat(initiatorId, botId);

      const lastBotMessage = await prisma.message.findFirst({
        where: { chatId: chat.id, senderId: botId },
        orderBy: { createdAt: 'desc' },
        select: { content: true },
      });
      const needsMenu =
        !lastBotMessage?.content || !isGennecyFuelMenuMessage(lastBotMessage.content);
      if (needsMenu) {
        void gennecyChatAssistant
          .postGennecyReply(chat.id, initiatorId, GENNECY_FUEL_MENU_MESSAGE)
          .catch((err) => console.error('[Gennecy] welcome', err));
      }

      res.json({ success: true, data: chat });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Cria um grupo com múltiplos participantes (suporta multipart com foto opcional)
   */
  async createGroupChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const { groupName, groupDescription } = req.body;

      // participantIds pode vir como JSON string (multipart) ou array (JSON)
      let participantIds: string[] = [];
      if (typeof req.body.participantIds === 'string') {
        try { participantIds = JSON.parse(req.body.participantIds); } catch { participantIds = []; }
      } else if (Array.isArray(req.body.participantIds)) {
        participantIds = req.body.participantIds;
      }

      if (!groupName) {
        throw createError('Nome do grupo é obrigatório', 400);
      }

      let groupAvatarUrl: string | undefined;
      if ((req as any).file) {
        const uploadResult = await chatService.uploadFile((req as any).file, userId);
        groupAvatarUrl = uploadResult.url;
      }

      const chat = await chatService.createGroupChat(userId, groupName, participantIds, {
        groupDescription,
        groupAvatarUrl,
      });
      res.json({ success: true, message: 'Grupo criado com sucesso', data: chat });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Sai de um grupo (remove o usuário autenticado dos participantes)
   */
  async leaveGroupChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const { id } = req.params;
      const result = await chatService.leaveGroupChat(id, userId);
      res.json({ success: true, message: 'Você saiu do grupo', data: result });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Atualiza nome e/ou descrição do grupo
   */
  async updateGroupChat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const { id } = req.params;
      const { groupName, groupDescription } = req.body as {
        groupName?: string;
        groupDescription?: string | null;
      };

      const chat = await chatService.updateGroupChat(id, userId, {
        groupName,
        groupDescription
      });
      res.json({ success: true, message: 'Grupo atualizado', data: chat });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Adiciona membros a um grupo
   */
  async addGroupMembers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const { id } = req.params;
      const { participantIds } = req.body as { participantIds?: string[] };
      if (!Array.isArray(participantIds) || participantIds.length === 0) {
        throw createError('Informe ao menos um participante (participantIds)', 400);
      }

      const chat = await chatService.addGroupMembers(id, userId, participantIds);
      res.json({ success: true, message: 'Membros adicionados', data: chat });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Remove um membro do grupo
   */
  async removeGroupMember(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const { id, userId: targetUserId } = req.params;
      if (!targetUserId) throw createError('ID do usuário é obrigatório', 400);

      const chat = await chatService.removeGroupMember(id, userId, targetUserId);
      res.json({ success: true, message: 'Membro removido do grupo', data: chat });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Lista todos os chats diretos do usuário autenticado
   */
  async getDirectChats(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const chats = await chatService.getDirectChats(userId);
      res.json({ success: true, data: chats });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Retorna um chat direto específico com todas as mensagens
   */
  async getDirectChatById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const { id } = req.params;
      const sinceRaw = req.query.since as string | undefined;
      const since =
        sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw) : undefined;
      const chat = await chatService.getDirectChatById(id, userId, since ? { since } : undefined);
      res.json({ success: true, data: chat });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Chamada WebRTC em grupo ainda ativa (para banner “Entrar” no chat).
   */
  async getActiveNativeCall(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const { id } = req.params;
      const chat = await chatService.getDirectChatById(id, userId);
      if (chat.chatType !== 'GROUP') {
        res.json({ success: true, data: { active: false } });
        return;
      }

      const active = getActiveGroupCallForChat(id);
      if (!active) {
        res.json({ success: true, data: { active: false } });
        return;
      }

      const userInCall = active.joinedUserIds.includes(userId);
      res.json({
        success: true,
        data: {
          active: true,
          callId: active.callId,
          video: active.video,
          joinedUserIds: active.joinedUserIds,
          userInCall,
        },
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Envia mensagem em um chat direto
   */
  async sendDirectMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const { chatId } = req.body;
      const rawContent = typeof req.body.content === 'string' ? req.body.content : '';
      if (!chatId) throw createError('ID do chat é obrigatório', 400);

      const rawReply = req.body.replyToId != null ? String(req.body.replyToId).trim() : '';
      const replyToId = rawReply.length > 0 ? rawReply : undefined;

      const attachments: any[] = [];
      if (req.files && Array.isArray(req.files)) {
        for (const file of req.files as Express.Multer.File[]) {
          const uploadResult = await chatService.uploadFile(file, userId);
          attachments.push({
            fileName: file.originalname,
            fileUrl: uploadResult.url,
            fileKey: uploadResult.key,
            fileSize: uploadResult.size,
            mimeType: uploadResult.mimeType
          });
        }
      }

      if (!rawContent.trim() && attachments.length === 0) {
        throw createError('Informe uma mensagem ou anexo', 400);
      }

      const content = rawContent.trim() || '(anexo)';

      const message = await chatService.sendDirectMessage({
        chatId,
        senderId: userId,
        content,
        attachments,
        replyToId,
        topicId: req.body.topicId != null ? String(req.body.topicId).trim() || undefined : undefined
      });

      const hasAttachments = attachments.length > 0;
      const gennecyMode = await resolveGennecyInvokeMode(chatId, userId, content, {
        hasAttachments,
      });
      const gennecyProcessing = await shouldProcessGennecyMessage(chatId, userId, content, {
        hasAttachments,
      });
      if (gennecyProcessing) {
        void gennecyChatAssistant
          .processOutgoingMessage({
            chatId,
            senderId: userId,
            content,
            messageId: message.id,
            hasAttachments,
          })
          .catch((err) => console.error('[Gennecy] async', err));
      }

      res.json({
        success: true,
        message: 'Mensagem enviada',
        data: message,
        gennecyProcessing,
        gennecyMode,
      });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Faz download de anexo via proxy autenticado
   */
  async downloadDirectAttachment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const rawUrl = String(req.query.url || '').trim();
      const rawFileKey = String(req.query.fileKey || '').trim();
      if (!rawUrl && !rawFileKey) throw createError('URL do anexo é obrigatória', 400);

      const fallbackNameFromUrl = (() => {
        if (!rawUrl) return 'anexo';
        try {
          const parsed = new URL(rawUrl.startsWith('/') ? `http://local${rawUrl}` : rawUrl);
          const last = parsed.pathname.split('/').filter(Boolean).pop();
          return last || 'anexo';
        } catch {
          return 'anexo';
        }
      })();
      const fileName = this.normalizeDownloadFileName(
        String(req.query.fileName || fallbackNameFromUrl)
      );

      const stored = await readFuelStoredPhoto({
        fileUrl: rawUrl || undefined,
        fileKey: rawFileKey || undefined,
        fileName,
      });

      if (!stored) {
        throw createError('Não foi possível baixar o anexo', 404);
      }

      res.setHeader('Content-Type', stored.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.status(200).send(stored.buffer);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Conta mensagens não lidas em chats diretos
   */
  async getDirectUnreadCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const count = await chatService.getDirectUnreadCount(userId);
      res.json({ success: true, data: { count } });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Favorita uma mensagem (chat direto ou grupo)
   */
  async favoriteMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { messageId } = req.params;
      if (!messageId) throw createError('ID da mensagem é obrigatório', 400);
      const message = await chatService.setMessageFavorite(userId, messageId, true);
      res.json({ success: true, data: message });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Remove a mensagem dos favoritos
   */
  async unfavoriteMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { messageId } = req.params;
      if (!messageId) throw createError('ID da mensagem é obrigatório', 400);
      const message = await chatService.setMessageFavorite(userId, messageId, false);
      res.json({ success: true, data: message });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Edita o texto de uma mensagem (janela de 15 min)
   */
  async editDirectMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { messageId } = req.params;
      const { content } = req.body as { content?: string };
      if (typeof content !== 'string') throw createError('Conteúdo é obrigatório', 400);
      const message = await chatService.editDirectMessage(userId, messageId, content);
      res.json({ success: true, data: message });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Apaga uma mensagem (janela de 15 min, soft delete)
   */
  async deleteDirectMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { messageId } = req.params;
      if (!messageId) throw createError('ID da mensagem é obrigatório', 400);
      const message = await chatService.deleteDirectMessage(userId, messageId);
      res.json({ success: true, data: message });
    } catch (error: any) {
      next(error);
    }
  }

  /** Oculta mensagem só para o usuário atual (estilo WhatsApp). */
  async hideMessageForMe(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { messageId } = req.params;
      if (!messageId) throw createError('ID da mensagem é obrigatório', 400);
      await chatService.hideMessageForMe(userId, messageId);
      res.json({ success: true, message: 'Mensagem oculta para você' });
    } catch (error: any) {
      next(error);
    }
  }

  /** Limpa o histórico só para o usuário atual. */
  async clearConversationForMe(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { chatId } = req.params;
      if (!chatId) throw createError('ID do chat é obrigatório', 400);
      await chatService.clearConversationForMe(userId, chatId);
      res.json({ success: true, message: 'Conversa limpa para você. Novas mensagens continuarão aparecendo.' });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Fixa uma mensagem no chat
   */
  async pinMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { chatId, messageId } = req.params;
      if (!chatId || !messageId) throw createError('IDs obrigatórios', 400);
      const chat = await chatService.pinMessage(chatId, userId, messageId);
      res.json({ success: true, data: chat });
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Remove a mensagem fixada do chat
   */
  async unpinMessage(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { chatId } = req.params;
      if (!chatId) throw createError('ID do chat obrigatório', 400);
      const chat = await chatService.unpinMessage(chatId, userId);
      res.json({ success: true, data: chat });
    } catch (error: any) {
      next(error);
    }
  }

  static uploadFiles() {
    return upload.array('attachments', 5);
  }

  static uploadGroupAvatar() {
    return upload.single('groupAvatar');
  }

  /** Troca a foto do grupo */
  async updateGroupAvatar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { id } = req.params;
      if (!(req as any).file) throw createError('Nenhuma imagem enviada', 400);
      const chat = await chatService.updateGroupAvatar(id, userId, (req as any).file);
      res.json({ success: true, message: 'Foto atualizada', data: chat });
    } catch (error: any) {
      next(error);
    }
  }

  /** Remove a foto do grupo */
  async removeGroupAvatar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { id } = req.params;
      const chat = await chatService.removeGroupAvatar(id, userId);
      res.json({ success: true, message: 'Foto removida', data: chat });
    } catch (error: any) {
      next(error);
    }
  }

  /** Lista tópicos de uma conversa */
  async listChatTopics(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { chatId } = req.params;
      const topics = await chatService.listChatTopics(chatId, userId);
      const canDeleteTopics = chatService.canDeleteChatTopics(req.user?.email ?? '');
      res.json({ success: true, data: topics, canDeleteTopics });
    } catch (error: any) {
      next(error);
    }
  }

  /** Cria um tópico na conversa */
  async createChatTopic(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { chatId } = req.params;
      const title = typeof req.body.title === 'string' ? req.body.title : '';
      const initialMessage =
        typeof req.body.initialMessage === 'string' ? req.body.initialMessage : undefined;
      const topic = await chatService.createChatTopic(chatId, userId, title, initialMessage);
      res.status(201).json({ success: true, data: topic });
    } catch (error: any) {
      next(error);
    }
  }

  /** Fixa ou desfixa um tópico */
  async setChatTopicPinned(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { chatId, topicId } = req.params;
      const isPinned = Boolean(req.body?.isPinned);
      const topic = await chatService.setChatTopicPinned(chatId, topicId, userId, isPinned);
      res.json({ success: true, data: topic });
    } catch (error: any) {
      next(error);
    }
  }

  /** Reordena tópicos fixados e/ou não fixados */
  async reorderChatTopics(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { chatId } = req.params;
      const pinnedIds = Array.isArray(req.body?.pinnedIds)
        ? req.body.pinnedIds.map(String)
        : undefined;
      const unpinnedIds = Array.isArray(req.body?.unpinnedIds)
        ? req.body.unpinnedIds.map(String)
        : undefined;
      const topics = await chatService.reorderChatTopics(chatId, userId, {
        pinnedIds,
        unpinnedIds
      });
      res.json({ success: true, data: topics });
    } catch (error: any) {
      next(error);
    }
  }

  /** Renomeia um tópico */
  async renameChatTopic(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);
      const { chatId, topicId } = req.params;
      const title = typeof req.body.title === 'string' ? req.body.title : '';
      const topic = await chatService.renameChatTopic(chatId, topicId, userId, title);
      res.json({ success: true, data: topic });
    } catch (error: any) {
      next(error);
    }
  }

  /** Exclui um tópico (apenas usuários autorizados) */
  async deleteChatTopic(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      const userEmail = req.user?.email;
      if (!userId || !userEmail) throw createError('Usuário não autenticado', 401);
      const { chatId, topicId } = req.params;
      await chatService.deleteChatTopic(chatId, topicId, userId, userEmail);
      res.json({ success: true, message: 'Tópico excluído' });
    } catch (error: any) {
      next(error);
    }
  }
}

