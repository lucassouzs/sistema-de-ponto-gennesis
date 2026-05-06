import { ChatStatus, ChatType, Prisma } from '@prisma/client';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma';

export interface CreateChatData {
  initiatorId: string;
  recipientDepartment: string;
  initialMessage: string;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileKey: string;
    fileSize: number;
    mimeType: string;
  }>;
}

export interface SendMessageData {
  chatId: string;
  senderId: string;
  content: string;
  /** ID da mensagem citada (mesmo chat; não pode ser mensagem de sistema) */
  replyToId?: string | null;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileKey: string;
    fileSize: number;
    mimeType: string;
  }>;
}

export class ChatService {
  private s3: AWS.S3 | null;
  private bucketName: string;
  private useLocal: boolean;

  // Função auxiliar para normalizar departamentos (remove acentos e converte para uppercase)
  private normalizeDepartment(dept: string | null | undefined): string {
    if (!dept) return '';
    return dept.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  /**
   * Filtro por usuário (limpar só pra mim + apagar só pra mim), estilo WhatsApp.
   */
  private async getPersonalMessagesWhere(userId: string, chatId: string): Promise<Prisma.MessageWhereInput> {
    const [privacy, hiddenRows] = await Promise.all([
      prisma.chatUserPrivacy.findUnique({
        where: { userId_chatId: { userId, chatId } }
      }),
      prisma.messageHiddenForUser.findMany({
        where: { userId, message: { chatId } },
        select: { messageId: true }
      })
    ]);

    const parts: Prisma.MessageWhereInput[] = [];
    if (privacy?.clearedAt) {
      parts.push({ createdAt: { gt: privacy.clearedAt } });
    }
    const hiddenIds = hiddenRows.map((h: { messageId: string }) => h.messageId).filter(Boolean);
    if (hiddenIds.length > 0) {
      parts.push({ id: { notIn: hiddenIds } });
    }

    if (parts.length === 0) return {};
    return parts.length === 1 ? parts[0]! : { AND: parts };
  }

  constructor() {
    this.useLocal = (process.env.STORAGE_PROVIDER || '').toLowerCase() === 'local'
      || !process.env.AWS_ACCESS_KEY_ID
      || !process.env.AWS_SECRET_ACCESS_KEY;

    this.s3 = this.useLocal ? null : new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });

    this.bucketName = process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos';
  }

  private saveFileLocally(file: any): {
    url: string;
    key: string;
    size: number;
    mimeType: string;
  } {
    const uploadsDir = path.join(process.cwd(), 'apps', 'backend', 'uploads', 'messages');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileExtension = path.extname(file.originalname);
    const fileName = `${uuidv4()}${fileExtension}`;
    const filePath = path.join(uploadsDir, fileName);

    fs.writeFileSync(filePath, file.buffer);

    return {
      url: `/uploads/messages/${fileName}`,
      key: `messages/${fileName}`,
      size: file.size,
      mimeType: file.mimetype || 'application/octet-stream'
    };
  }

  /**
   * Cria um novo chat (conversa pendente)
   */
  async createChat(data: CreateChatData) {
    const { initiatorId, recipientDepartment, initialMessage, attachments = [] } = data;

    // Validar setor destinatário (normalizado)
    const validDepartments = [
      'PROJETOS',
      'CONTRATOS E LICITACOES',
      'SUPRIMENTOS',
      'JURIDICO',
      'DEPARTAMENTO PESSOAL',
      'ENGENHARIA',
      'ADMINISTRATIVO',
      'FINANCEIRO'
    ];

    const normalizedDepartment = this.normalizeDepartment(recipientDepartment);
    if (!validDepartments.includes(normalizedDepartment)) {
      throw new Error('Setor destinatário inválido');
    }

    // Criar chat e primeira mensagem
    const chat = await prisma.chat.create({
      data: {
        initiatorId,
        recipientDepartment: normalizedDepartment,
        status: ChatStatus.PENDING,
        lastMessageAt: new Date(),
        messages: {
          create: {
            senderId: initiatorId,
            content: initialMessage,
            isRead: false,
            attachments: {
              create: attachments.map(att => ({
                fileName: att.fileName,
                fileUrl: att.fileUrl,
                fileKey: att.fileKey,
                fileSize: att.fileSize,
                mimeType: att.mimeType
              }))
            }
          }
        }
      },
      include: {
        initiator: {
          select: {
            id: true,
            name: true,
            email: true,
            employee: {
              select: {
                department: true,
                position: true
              }
            }
          }
        },
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            attachments: true
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    return chat;
  }

  /**
   * Aceita uma conversa pendente
   */
  async acceptChat(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    if (chat.status !== ChatStatus.PENDING) {
      throw new Error('Chat não está pendente de aceitação');
    }

    // Verificar se o usuário pertence ao setor destinatário
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      throw new Error('Usuário não possui departamento associado');
    }

    // Normalizar ambos os departamentos para comparação
    const userDepartment = this.normalizeDepartment(user.employee.department);
    const chatDepartment = this.normalizeDepartment(chat.recipientDepartment);

    if (userDepartment !== chatDepartment) {
      throw new Error('Usuário não tem permissão para aceitar este chat');
    }

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: {
        status: ChatStatus.ACCEPTED,
        acceptedBy: userId,
        acceptedAt: new Date()
      },
      include: {
        initiator: {
          select: {
            id: true,
            name: true,
            email: true,
            employee: {
              select: {
                department: true,
                position: true
              }
            }
          }
        },
        accepter: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            attachments: true
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    return updated;
  }

  /**
   * Rejeita uma conversa (deleta)
   */
  async rejectChat(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      throw new Error('Usuário não possui departamento');
    }

    const userDepartment = this.normalizeDepartment(user.employee.department);
    const chatDepartment = this.normalizeDepartment(chat.recipientDepartment);

    if (userDepartment !== chatDepartment) {
      throw new Error('Usuário não tem permissão para rejeitar este chat');
    }

    await prisma.chat.delete({
      where: { id: chatId }
    });

    return { success: true };
  }

  /**
   * Deleta uma conversa (permite iniciador ou destinatário)
   */
  async deleteChat(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      throw new Error('Usuário não possui departamento');
    }

    const userDepartment = this.normalizeDepartment(user.employee.department);
    const isInitiator = chat.initiatorId === userId;
    const isRecipient = userDepartment === this.normalizeDepartment(chat.recipientDepartment);

    if (!isInitiator && !isRecipient) {
      throw new Error('Usuário não tem permissão para deletar este chat');
    }

    await prisma.chat.delete({
      where: { id: chatId }
    });

    return { success: true };
  }

  /**
   * Envia mensagem em um chat
   */
  async sendMessage(data: SendMessageData) {
    const { chatId, senderId, content, attachments = [] } = data;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    if (chat.status === ChatStatus.CLOSED) {
      throw new Error('Chat está encerrado');
    }

    // Verificar se o usuário pode enviar mensagem neste chat
    const user = await prisma.user.findUnique({
      where: { id: senderId },
      include: { employee: true }
    });

    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    const canSend = 
      chat.initiatorId === senderId || 
      (user.employee && this.normalizeDepartment(user.employee.department) === this.normalizeDepartment(chat.recipientDepartment));

    if (!canSend) {
      throw new Error('Usuário não tem permissão para enviar mensagem neste chat');
    }

    // Se o chat estava pendente e o remetente é do setor destinatário, aceitar automaticamente
    if (chat.status === ChatStatus.PENDING && user.employee && 
        this.normalizeDepartment(user.employee.department) === this.normalizeDepartment(chat.recipientDepartment)) {
      await prisma.chat.update({
        where: { id: chatId },
        data: {
          status: ChatStatus.ACCEPTED,
          acceptedBy: senderId,
          acceptedAt: new Date()
        }
      });
    }

    const message = await prisma.message.create({
      data: {
        chatId,
        senderId,
        content,
        isRead: false,
        attachments: {
          create: attachments.map(att => ({
            fileName: att.fileName,
            fileUrl: att.fileUrl,
            fileKey: att.fileKey,
            fileSize: att.fileSize,
            mimeType: att.mimeType
          }))
        }
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            email: true,
            employee: {
              select: {
                department: true,
                position: true
              }
            }
          }
        },
        attachments: true
      }
    });

    // Atualizar lastMessageAt do chat
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: new Date()
      }
    });

    return message;
  }

  /**
   * Lista chats pendentes de um setor
   */
  async getPendingChats(department: string) {
    const normalizedDepartment = this.normalizeDepartment(department);
    const chats = await prisma.chat.findMany({
      where: {
        recipientDepartment: normalizedDepartment,
        status: ChatStatus.PENDING
      },
      include: {
        initiator: {
          select: {
            id: true,
            name: true,
            email: true,
            employee: {
              select: {
                department: true,
                position: true
              }
            }
          }
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            sender: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        lastMessageAt: 'desc'
      }
    });

    return chats;
  }

  /**
   * Lista chats ativos de um usuário
   */
  async getActiveChats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      return [];
    }

    const department = this.normalizeDepartment(user.employee.department);

    const chats = await prisma.chat.findMany({
      where: {
        OR: [
          // Chats criados pelo usuário (mostrar PENDING e ACCEPTED)
          { 
            initiatorId: userId, 
            status: { in: [ChatStatus.PENDING, ChatStatus.ACCEPTED] }
          },
          // Chats aceitos do setor do usuário
          { recipientDepartment: department, status: ChatStatus.ACCEPTED }
        ]
      },
      include: {
        initiator: {
          select: {
            id: true,
            name: true,
            email: true,
            employee: {
              select: {
                department: true,
                position: true
              }
            }
          }
        },
        accepter: {
          select: {
            id: true,
            name: true,
            email: true,
            employee: {
              select: {
                department: true,
                position: true
              }
            }
          }
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            sender: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        lastMessageAt: 'desc'
      }
    });

    return chats;
  }

  /**
   * Lista chats encerrados de um usuário
   */
  async getClosedChats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      return [];
    }

    const department = this.normalizeDepartment(user.employee.department);

    const chats = await prisma.chat.findMany({
      where: {
        status: ChatStatus.CLOSED,
        OR: [
          // Chats criados pelo usuário
          { initiatorId: userId },
          // Chats do setor do usuário que foram fechados
          { recipientDepartment: department }
        ]
      },
      include: {
        initiator: {
          select: {
            id: true,
            name: true,
            email: true,
            employee: {
              select: {
                department: true,
                position: true
              }
            }
          }
        },
        accepter: {
          select: {
            id: true,
            name: true,
            email: true,
            employee: {
              select: {
                department: true,
                position: true
              }
            }
          }
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            sender: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        closedAt: 'desc'
      }
    });

    return chats;
  }

  /**
   * Obtém um chat específico com todas as mensagens
   */
  async getChatById(chatId: string, userId: string) {
    try {
      if (!chatId || !userId) {
        throw new Error('ID do chat e ID do usuário são obrigatórios');
      }

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
          initiator: {
            select: {
              id: true,
              name: true,
              email: true,
              employee: {
                select: {
                  department: true,
                  position: true
                }
              }
            }
          },
          accepter: {
            select: {
              id: true,
              name: true,
              email: true,
              employee: {
                select: {
                  department: true,
                  position: true
                }
              }
            }
          },
          messages: {
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employee: {
                    select: {
                      department: true,
                      position: true
                    }
                  }
                }
              },
              attachments: {
                select: {
                  id: true,
                  fileName: true,
                  fileUrl: true,
                  fileSize: true,
                  mimeType: true
                }
              }
            },
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      if (!chat) {
        throw new Error('Chat não encontrado');
      }

      // Verificar permissão
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { employee: true }
      });

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      // Verificar permissão: iniciador ou membro do setor destinatário
      const isInitiator = chat.initiatorId === userId;
      let isRecipient = false;

      // Se for o iniciador, já tem permissão
      if (isInitiator) {
        return chat;
      }

      // Verificar se é do setor destinatário
      if (user.employee && user.employee.department && chat.recipientDepartment) {
        try {
          const userDepartment = this.normalizeDepartment(user.employee.department);
          const chatDepartment = this.normalizeDepartment(chat.recipientDepartment);
          isRecipient = userDepartment === chatDepartment && userDepartment !== '';
        } catch (normalizeError) {
          console.error('Erro ao normalizar departamentos:', normalizeError);
          // Se houver erro na normalização, não conceder permissão
          isRecipient = false;
        }
      }

      if (!isRecipient) {
        throw new Error('Usuário não tem permissão para ver este chat');
      }

      return chat;
    } catch (error: any) {
      console.error('Erro em getChatById:', {
        chatId,
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Marca mensagens como lidas
   */
  async markMessagesAsRead(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: {
        chatType: true,
        initiatorId: true,
        recipientId: true,
        participants: { select: { userId: true } }
      }
    });

    if (!chat) throw new Error('Chat não encontrado');

    if (chat.chatType === ChatType.GROUP || chat.chatType === ChatType.DIRECT) {
      const hasAccess =
        chat.chatType === ChatType.GROUP
          ? chat.participants.some((p) => p.userId === userId)
          : chat.initiatorId === userId || chat.recipientId === userId;
      if (!hasAccess) throw new Error('Você não tem acesso a este chat');
    }

    const personal = await this.getPersonalMessagesWhere(userId, chatId);

    await prisma.message.updateMany({
      where: {
        chatId,
        senderId: { not: userId },
        isRead: false,
        ...personal
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    return { success: true };
  }

  /**
   * Encerra um chat
   */
  async closeChat(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    if (chat.status === ChatStatus.CLOSED) {
      throw new Error('Chat já está encerrado');
    }

    // Verificar permissão (qualquer participante pode encerrar)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    const hasPermission = 
      chat.initiatorId === userId || 
      (user.employee && this.normalizeDepartment(user.employee.department) === this.normalizeDepartment(chat.recipientDepartment));

    if (!hasPermission) {
      throw new Error('Usuário não tem permissão para encerrar este chat');
    }

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: {
        status: ChatStatus.CLOSED,
        closedBy: userId,
        closedAt: new Date()
      }
    });

    return updated;
  }

  /**
   * Conta chats pendentes de um setor
   */
  async getPendingChatsCount(department: string) {
    const normalizedDepartment = this.normalizeDepartment(department);
    const count = await prisma.chat.count({
      where: {
        recipientDepartment: normalizedDepartment,
        status: ChatStatus.PENDING
      }
    });

    return count;
  }

  /**
   * Conta mensagens não lidas de um usuário
   */
  async getUnreadMessagesCount(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      return 0;
    }

    const department = this.normalizeDepartment(user.employee.department);

    // Contar mensagens não lidas em chats ativos onde o usuário não é o remetente
    const count = await prisma.message.count({
      where: {
        chat: {
          OR: [
            { initiatorId: userId },
            { recipientDepartment: department, status: ChatStatus.ACCEPTED }
          ],
          status: ChatStatus.ACCEPTED
        },
        senderId: { not: userId },
        isRead: false
      }
    });

    return count;
  }

  // ===========================================================
  //  CHAT DIRETO E EM GRUPO (estilo WhatsApp)
  // ===========================================================

  private readonly directChatUserInclude = {
    id: true,
    name: true,
    email: true,
    profilePhotoUrl: true,
    employee: {
      select: {
        department: true,
        position: true,
        employeeId: true
      }
    }
  } as const;

  private buildMessageFavoriteInclude(favoriteUserId?: string) {
    if (!favoriteUserId) return {};
    return {
      favorites: {
        where: { userId: favoriteUserId },
        select: { id: true }
      }
    };
  }

  /** Trecho incluído ao carregar mensagem citada (resposta) */
  private buildReplyToInclude() {
    return {
      select: {
        id: true,
        content: true,
        deletedAt: true,
        isSystem: true,
        sender: { select: this.directChatUserInclude },
        attachments: {
          select: { id: true, fileName: true, mimeType: true },
          take: 1,
          orderBy: { createdAt: 'asc' as const }
        }
      }
    };
  }

  private buildChatIncludeWithoutMessages() {
    return {
      initiator: { select: this.directChatUserInclude },
      recipient: { select: this.directChatUserInclude },
      participants: {
        include: {
          user: { select: this.directChatUserInclude }
        },
        orderBy: { joinedAt: 'asc' as const }
      },
      pinnedMessage: {
        include: {
          sender: { select: this.directChatUserInclude },
          attachments: true,
          replyTo: this.buildReplyToInclude()
        }
      }
    };
  }

  private buildChatInclude(
    includeAllMessages = false,
    favoriteUserId?: string,
    messageWhere?: Prisma.MessageWhereInput
  ) {
    const fav = this.buildMessageFavoriteInclude(favoriteUserId);
    const msgFilter =
      messageWhere && Object.keys(messageWhere).length > 0 ? { where: messageWhere } : {};
    return {
      ...this.buildChatIncludeWithoutMessages(),
      messages: includeAllMessages
        ? {
            ...msgFilter,
            include: {
              sender: { select: this.directChatUserInclude },
              attachments: true,
              replyTo: this.buildReplyToInclude(),
              ...fav
            },
            orderBy: { createdAt: 'asc' as const }
          }
        : {
            ...msgFilter,
            take: 1,
            orderBy: { createdAt: 'desc' as const },
            include: {
              sender: { select: this.directChatUserInclude },
              attachments: true,
              replyTo: this.buildReplyToInclude(),
              ...fav
            }
          }
    };
  }

  /** Mensagem de evento no histórico (não conta como não lida). */
  private async createSystemMessage(chatId: string, actorUserId: string, content: string) {
    const message = await prisma.message.create({
      data: {
        chatId,
        senderId: actorUserId,
        content,
        isSystem: true,
        isRead: true,
      },
      include: {
        sender: { select: this.directChatUserInclude },
        attachments: true,
      },
    });
    await prisma.chat.update({
      where: { id: chatId },
      data: { lastMessageAt: new Date() }
    });
    return message;
  }

  /**
   * Fixa uma mensagem no topo do chat (qualquer participante)
   */
  async pinMessage(chatId: string, userId: string, messageId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: { select: { userId: true } } }
    });
    if (!chat) throw new Error('Chat não encontrado');
    if (chat.chatType !== ChatType.DIRECT && chat.chatType !== ChatType.GROUP) {
      throw new Error('Tipo de chat não suportado');
    }
    const hasAccess =
      chat.chatType === ChatType.GROUP
        ? chat.participants.some((p) => p.userId === userId)
        : chat.initiatorId === userId || chat.recipientId === userId;
    if (!hasAccess) throw new Error('Você não tem acesso a este chat');

    const pinTarget = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, chatId: true, content: true, deletedAt: true, isSystem: true }
    });
    if (!pinTarget || pinTarget.chatId !== chatId) throw new Error('Mensagem não encontrada neste chat');
    if (pinTarget.isSystem) throw new Error('Não é possível fixar mensagens de evento');

    await prisma.chat.update({
      where: { id: chatId },
      data: { pinnedMessageId: messageId }
    });

    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const actorName = actor?.name?.trim() || 'Alguém';
    let sysText = `${actorName} fixou uma mensagem.`;
    if (!pinTarget.deletedAt && pinTarget.content && pinTarget.content !== '📎') {
      const c = pinTarget.content;
      sysText =
        `${actorName} fixou a mensagem: «${c.slice(0, 100)}${c.length > 100 ? '…' : ''}».`;
    }
    try {
      await this.createSystemMessage(chatId, userId, sysText);
    } catch (e) {
      console.error('[ChatService.pinMessage] createSystemMessage falhou:', e);
      // Mantém mensagem fixada; evento pode falhar se migração isSystem não foi aplicada, etc.
    }

    const mw = await this.getPersonalMessagesWhere(userId, chatId);
    const out = await prisma.chat.findUnique({
      where: { id: chatId },
      include: this.buildChatInclude(true, userId, mw)
    });
    if (!out) throw new Error('Chat não encontrado');
    return out;
  }

  /**
   * Remove a mensagem fixada do chat
   */
  async unpinMessage(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: { select: { userId: true } } }
    });
    if (!chat) throw new Error('Chat não encontrado');
    const hasAccess =
      chat.chatType === ChatType.GROUP
        ? chat.participants.some((p) => p.userId === userId)
        : chat.initiatorId === userId || chat.recipientId === userId;
    if (!hasAccess) throw new Error('Você não tem acesso a este chat');

    await prisma.chat.update({
      where: { id: chatId },
      data: { pinnedMessageId: null }
    });

    const actor = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const actorName = actor?.name?.trim() || 'Alguém';
    try {
      await this.createSystemMessage(chatId, userId, `${actorName} desfixou a mensagem.`);
    } catch (e) {
      console.error('[ChatService.unpinMessage] createSystemMessage falhou:', e);
    }

    const mw = await this.getPersonalMessagesWhere(userId, chatId);
    const out = await prisma.chat.findUnique({
      where: { id: chatId },
      include: this.buildChatInclude(true, userId, mw)
    });
    if (!out) throw new Error('Chat não encontrado');
    return out;
  }

  /**
   * Retorna (ou cria) o chat direto entre dois usuários
   */
  async getOrCreateDirectChat(initiatorId: string, recipientId: string) {
    if (initiatorId === recipientId) {
      throw new Error('Você não pode iniciar um chat consigo mesmo');
    }

    // Verificar se já existe um chat direto entre esses dois usuários
    const existing = await prisma.chat.findFirst({
      where: {
        chatType: ChatType.DIRECT,
        OR: [
          { initiatorId, recipientId },
          { initiatorId: recipientId, recipientId: initiatorId }
        ]
      },
      select: { id: true }
    });

    if (existing) {
      const mw = await this.getPersonalMessagesWhere(initiatorId, existing.id);
      const full = await prisma.chat.findUnique({
        where: { id: existing.id },
        include: this.buildChatInclude(true, initiatorId, mw)
      });
      if (!full) throw new Error('Chat não encontrado');
      return full;
    }

    // Criar novo chat direto
    const created = await prisma.chat.create({
      data: {
        chatType: ChatType.DIRECT,
        initiatorId,
        recipientId,
        recipientDepartment: null,
        status: ChatStatus.ACCEPTED,
        acceptedAt: new Date()
      },
      select: { id: true }
    });

    const mwNew = await this.getPersonalMessagesWhere(initiatorId, created.id);
    const chat = await prisma.chat.findUnique({
      where: { id: created.id },
      include: this.buildChatInclude(true, initiatorId, mwNew)
    });
    if (!chat) throw new Error('Chat não encontrado');
    return chat;
  }

  /**
   * Cria um novo grupo
   */
  async createGroupChat(
    creatorId: string,
    groupName: string,
    participantIds: string[],
    options?: { groupDescription?: string; groupAvatarUrl?: string }
  ) {
    const cleanedName = String(groupName || '').trim();
    if (cleanedName.length < 2) {
      throw new Error('Nome do grupo deve ter ao menos 2 caracteres');
    }

    const normalizedParticipants = Array.from(
      new Set(participantIds.filter(Boolean).filter((id) => id !== creatorId))
    );
    if (normalizedParticipants.length === 0) {
      throw new Error('Selecione ao menos 1 participante para criar o grupo');
    }

    const users = await prisma.user.findMany({
      where: { id: { in: normalizedParticipants }, isActive: true },
      select: { id: true }
    });

    if (users.length !== normalizedParticipants.length) {
      throw new Error('Um ou mais participantes são inválidos');
    }

    const cleanedDesc = options?.groupDescription?.trim() || null;

    const chat = await prisma.chat.create({
      data: {
        chatType: ChatType.GROUP,
        groupName: cleanedName,
        groupDescription: cleanedDesc,
        groupAvatarUrl: options?.groupAvatarUrl || null,
        initiatorId: creatorId,
        status: ChatStatus.ACCEPTED,
        acceptedBy: creatorId,
        acceptedAt: new Date(),
        participants: {
          create: [
            { userId: creatorId, isAdmin: true },
            ...normalizedParticipants.map((id) => ({ userId: id, isAdmin: false }))
          ]
        }
      },
      select: { id: true }
    });

    const mwGrp = await this.getPersonalMessagesWhere(creatorId, chat.id);
    const full = await prisma.chat.findUnique({
      where: { id: chat.id },
      include: this.buildChatInclude(true, creatorId, mwGrp)
    });
    if (!full) throw new Error('Grupo criado mas não recuperado');
    return full;
  }

  /**
   * Usuário sai de um grupo (remove participação). Se não restar ninguém, remove o chat.
   */
  async leaveGroupChat(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { id: true, chatType: true }
    });

    if (!chat) throw new Error('Chat não encontrado');
    if (chat.chatType !== ChatType.GROUP) {
      throw new Error('Apenas grupos podem ser abandonados por este fluxo');
    }

    const participant = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId } }
    });
    if (!participant) throw new Error('Você não participa deste grupo');

    const memberCount = await prisma.chatParticipant.count({ where: { chatId } });
    const leaver = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true }
    });
    const actorName = leaver?.name?.trim() || 'Um membro';
    const sysLine = `${actorName} saiu.`;
    const leavingWasAdmin = participant.isAdmin;

    await prisma.$transaction(async (tx) => {
      if (memberCount > 1) {
        await tx.message.create({
          data: {
            chatId,
            senderId: userId,
            content: sysLine,
            isSystem: true,
            isRead: true
          }
        });
        await tx.chat.update({
          where: { id: chatId },
          data: { lastMessageAt: new Date() }
        });
      }
      await tx.chatParticipant.delete({
        where: { chatId_userId: { chatId, userId } }
      });
      const remaining = await tx.chatParticipant.count({ where: { chatId } });
      if (remaining === 0) {
        await tx.chat.delete({ where: { id: chatId } });
      } else if (leavingWasAdmin) {
        const adminsLeft = await tx.chatParticipant.count({
          where: { chatId, isAdmin: true }
        });
        if (adminsLeft === 0) {
          const eldest = await tx.chatParticipant.findFirst({
            where: { chatId },
            orderBy: { joinedAt: 'asc' }
          });
          if (eldest) {
            await tx.chatParticipant.update({
              where: { chatId_userId: { chatId, userId: eldest.userId } },
              data: { isAdmin: true }
            });
          }
        }
      }
    });

    return { left: true };
  }

  /** Retorna o chat do grupo se o userId for membro (helper interno). */
  private async assertGroupMember(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: true }
    });
    if (!chat) throw new Error('Chat não encontrado');
    if (chat.chatType !== ChatType.GROUP) throw new Error('Não é um grupo');
    const uid = String(userId);
    if (!chat.participants.find((p) => String(p.userId) === uid)) {
      throw new Error('Você não participa deste grupo');
    }
    return chat;
  }

  /** Faz upload de nova foto para o grupo e salva a URL. */
  async updateGroupAvatar(chatId: string, userId: string, file: any) {
    await this.assertGroupMember(chatId, userId);
    const uploadResult = await this.uploadFile(file, userId);
    const mwAv = await this.getPersonalMessagesWhere(userId, chatId);
    return prisma.chat.update({
      where: { id: chatId },
      data: { groupAvatarUrl: uploadResult.url },
      include: this.buildChatInclude(false, userId, mwAv)
    });
  }

  /** Remove a foto do grupo (seta null). */
  async removeGroupAvatar(chatId: string, userId: string) {
    await this.assertGroupMember(chatId, userId);
    const mwRm = await this.getPersonalMessagesWhere(userId, chatId);
    return prisma.chat.update({
      where: { id: chatId },
      data: { groupAvatarUrl: null },
      include: this.buildChatInclude(false, userId, mwRm)
    });
  }

  /**
   * Atualiza nome e/ou descrição do grupo (qualquer membro do grupo)
   */
  async updateGroupChat(
    chatId: string,
    userId: string,
    data: { groupName?: string; groupDescription?: string | null }
  ) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: true }
    });

    if (!chat) throw new Error('Chat não encontrado');
    if (chat.chatType !== ChatType.GROUP) {
      throw new Error('Apenas grupos podem ser editados por este fluxo');
    }

    const uid = String(userId);
    const participant = chat.participants.find((p) => String(p.userId) === uid);
    if (!participant) throw new Error('Você não participa deste grupo');

    const updateData: { groupName?: string; groupDescription?: string | null } = {};

    if (data.groupName !== undefined) {
      const cleaned = String(data.groupName || '').trim();
      if (cleaned.length < 2) {
        throw new Error('Nome do grupo deve ter ao menos 2 caracteres');
      }
      updateData.groupName = cleaned;
    }

    if (data.groupDescription !== undefined) {
      if (data.groupDescription === null || data.groupDescription === '') {
        updateData.groupDescription = null;
      } else {
        const desc = String(data.groupDescription).trim();
        if (desc.length > 500) {
          throw new Error('Descrição muito longa (máximo 500 caracteres)');
        }
        updateData.groupDescription = desc;
      }
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('Nada para atualizar');
    }

    const prevName = (chat.groupName ?? '').trim();
    const prevDesc = chat.groupDescription ?? null;

    await prisma.chat.update({
      where: { id: chatId },
      data: updateData
    });

    const actorUser = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    const actorName = actorUser?.name?.trim() || 'Um membro';

    if (updateData.groupName !== undefined && updateData.groupName.trim() !== prevName) {
      await this.createSystemMessage(
        chatId,
        userId,
        `${actorName} alterou o nome do grupo para "${updateData.groupName}".`
      );
    }

    if (data.groupDescription !== undefined) {
      const newDesc = updateData.groupDescription ?? null;
      if ((prevDesc ?? '') !== (newDesc ?? '')) {
        if (!newDesc) {
          await this.createSystemMessage(chatId, userId, `${actorName} removeu a descrição do grupo.`);
        } else if (!prevDesc) {
          await this.createSystemMessage(chatId, userId, `${actorName} definiu a descrição do grupo.`);
        } else {
          await this.createSystemMessage(chatId, userId, `${actorName} alterou a descrição do grupo.`);
        }
      }
    }

    const mwUg = await this.getPersonalMessagesWhere(userId, chatId);
    return prisma.chat.findUnique({
      where: { id: chatId },
      include: this.buildChatInclude(true, userId, mwUg)
    });
  }

  /**
   * Adiciona participantes a um grupo (quem chama precisa ser membro do grupo)
   */
  async addGroupMembers(chatId: string, actorUserId: string, newParticipantIds: string[]) {
    const uid = String(actorUserId);
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: true }
    });

    if (!chat) throw new Error('Chat não encontrado');
    if (chat.chatType !== ChatType.GROUP) {
      throw new Error('Apenas grupos aceitam novos membros por este fluxo');
    }

    const actor = chat.participants.find((p) => String(p.userId) === uid);
    if (!actor) throw new Error('Você não participa deste grupo');

    const existingIds = new Set(chat.participants.map((p) => String(p.userId)));
    const raw = Array.from(
      new Set((newParticipantIds || []).filter(Boolean).map((id) => String(id)))
    );
    const toAdd = raw.filter((id) => !existingIds.has(id));

    if (toAdd.length === 0) {
      throw new Error('Nenhum participante novo para adicionar');
    }

    const users = await prisma.user.findMany({
      where: { id: { in: toAdd }, isActive: true },
      select: { id: true }
    });
    if (users.length !== toAdd.length) {
      throw new Error('Um ou mais usuários são inválidos ou inativos');
    }

    await prisma.chatParticipant.createMany({
      data: toAdd.map((userId) => ({
        chatId,
        userId,
        isAdmin: false
      })),
      skipDuplicates: true
    });

    const addedUsers = await prisma.user.findMany({
      where: { id: { in: toAdd } },
      select: { name: true },
      orderBy: { name: 'asc' }
    });
    const namesJoin = addedUsers.map((u) => u.name).join(', ');
    const actorSelf = await prisma.user.findUnique({ where: { id: uid }, select: { name: true } });
    const actorName = actorSelf?.name?.trim() || 'Um membro';
    const line = `${actorName} adicionou ${namesJoin}.`;
    await this.createSystemMessage(chatId, actorUserId, line);

    const mwAdd = await this.getPersonalMessagesWhere(actorUserId, chatId);
    const updated = await prisma.chat.findUnique({
      where: { id: chatId },
      include: this.buildChatInclude(true, actorUserId, mwAdd)
    });
    if (!updated) throw new Error('Chat não encontrado');
    return updated;
  }

  /**
   * Remove um participante do grupo (quem chama deve ser membro; não pode remover a si mesmo — use leave)
   */
  async removeGroupMember(chatId: string, actorUserId: string, targetUserId: string) {
    const aid = String(actorUserId);
    const tid = String(targetUserId);
    if (aid === tid) {
      throw new Error('Para sair do grupo, use a opção Sair do grupo');
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: true }
    });

    if (!chat) throw new Error('Chat não encontrado');
    if (chat.chatType !== ChatType.GROUP) {
      throw new Error('Apenas grupos permitem remover membros por este fluxo');
    }

    const actor = chat.participants.find((p) => String(p.userId) === aid);
    if (!actor) throw new Error('Você não participa deste grupo');

    const target = chat.participants.find((p) => String(p.userId) === tid);
    if (!target) throw new Error('Este usuário não participa do grupo');

    const removedUserName =
      (
        await prisma.user.findUnique({ where: { id: tid }, select: { name: true } })
      )?.name?.trim() ?? 'um membro';

    await prisma.chatParticipant.delete({
      where: { chatId_userId: { chatId, userId: tid } }
    });

    const actorSelf = await prisma.user.findUnique({ where: { id: aid }, select: { name: true } });
    const actorName = actorSelf?.name?.trim() || 'Um membro';
    const rmLine = `${actorName} removeu ${removedUserName}.`;
    await this.createSystemMessage(chatId, actorUserId, rmLine);

    const mwRem = await this.getPersonalMessagesWhere(actorUserId, chatId);
    const updated = await prisma.chat.findUnique({
      where: { id: chatId },
      include: this.buildChatInclude(true, actorUserId, mwRem)
    });
    if (!updated) throw new Error('Chat não encontrado');
    return updated;
  }

  /**
   * Lista todos os chats diretos/grupo de um usuário (com a última mensagem)
   */
  async getDirectChats(userId: string) {
    const chats = await prisma.chat.findMany({
      where: {
        OR: [
          {
            chatType: ChatType.DIRECT,
            OR: [{ initiatorId: userId }, { recipientId: userId }]
          },
          {
            chatType: ChatType.GROUP,
            participants: { some: { userId } }
          }
        ]
      },
      include: this.buildChatIncludeWithoutMessages(),
      orderBy: { lastMessageAt: 'desc' }
    });

    const fav = this.buildMessageFavoriteInclude(userId);
    for (const c of chats) {
      const mw = await this.getPersonalMessagesWhere(userId, c.id);
      const last = await prisma.message.findMany({
        where: { chatId: c.id, ...mw },
        take: 1,
        orderBy: { createdAt: 'desc' },
        include: {
          sender: { select: this.directChatUserInclude },
          attachments: true,
          replyTo: this.buildReplyToInclude(),
          ...fav
        }
      });
      (c as unknown as { messages: typeof last }).messages = last;
    }

    return chats;
  }

  /**
   * Retorna um chat direto/grupo específico com todas as mensagens
   */
  async getDirectChatById(chatId: string, userId: string) {
    const mw = await this.getPersonalMessagesWhere(userId, chatId);
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: this.buildChatInclude(true, userId, mw)
    });

    if (!chat) throw new Error('Chat não encontrado');
    if (chat.chatType !== ChatType.DIRECT && chat.chatType !== ChatType.GROUP) {
      throw new Error('Chat não é do tipo suportado por este endpoint');
    }

    const hasAccess = chat.chatType === ChatType.GROUP
      ? chat.participants.some((p) => p.userId === userId)
      : chat.initiatorId === userId || chat.recipientId === userId;
    if (!hasAccess) throw new Error('Você não tem acesso a este chat');

    return chat;
  }

  /**
   * Favorita ou desfavorita uma mensagem (apenas para o próprio usuário; exige acesso ao chat)
   */
  async setMessageFavorite(userId: string, messageId: string, favorited: boolean) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        chat: {
          select: {
            id: true,
            chatType: true,
            initiatorId: true,
            recipientId: true,
            participants: { select: { userId: true } }
          }
        }
      }
    });
    if (!message) throw new Error('Mensagem não encontrada');
    if (message.isSystem) throw new Error('Mensagens de evento não podem ser favoritadas');
    const chat = message.chat;
    if (chat.chatType !== ChatType.DIRECT && chat.chatType !== ChatType.GROUP) {
      throw new Error('Mensagem não suportada neste contexto');
    }
    if (chat.chatType === ChatType.GROUP) {
      if (!chat.participants.some((p) => p.userId === userId)) {
        throw new Error('Você não participa deste chat');
      }
    } else if (chat.initiatorId !== userId && chat.recipientId !== userId) {
      throw new Error('Você não tem acesso a esta mensagem');
    }

    if (favorited) {
      await prisma.messageFavorite.upsert({
        where: { userId_messageId: { userId, messageId } },
        create: { userId, messageId },
        update: {}
      });
    } else {
      await prisma.messageFavorite.deleteMany({
        where: { userId, messageId }
      });
    }

    const out = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: this.directChatUserInclude },
        attachments: true,
        replyTo: this.buildReplyToInclude(),
        ...this.buildMessageFavoriteInclude(userId)
      }
    });
    if (!out) throw new Error('Mensagem não encontrada');
    return out;
  }

  /** Janela de 15 minutos a partir de `createdAt` para editar/apagar (chat direto/grupo). */
  private static readonly DIRECT_MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

  private assertCanEditOrDeleteOwnMessage(
    message: { senderId: string; createdAt: Date; deletedAt: Date | null },
    userId: string
  ) {
    if (message.senderId !== userId) {
      throw new Error('Só o remetente pode editar ou apagar esta mensagem');
    }
    if (message.deletedAt) {
      throw new Error('Esta mensagem já foi apagada');
    }
    const elapsed = Date.now() - message.createdAt.getTime();
    if (elapsed > ChatService.DIRECT_MESSAGE_EDIT_WINDOW_MS) {
      throw new Error('Só é possível editar ou apagar até 15 minutos após o envio');
    }
  }

  /**
   * Edita o texto de uma mensagem (apenas o remetente, até 15 min após o envio)
   */
  async editDirectMessage(userId: string, messageId: string, newContent: string) {
    const text = String(newContent ?? '').trim();
    if (text.length === 0) {
      throw new Error('A mensagem não pode ficar vazia');
    }
    if (text.length > 5000) {
      throw new Error('Mensagem muito longa (máximo 5000 caracteres)');
    }

    const message = await prisma.message.findUnique({
      where: { id: messageId }
    });
    if (!message) throw new Error('Mensagem não encontrada');
    if (message.isSystem) throw new Error('Mensagens de evento não podem ser editadas');
    this.assertCanEditOrDeleteOwnMessage(message, userId);

    return prisma.message.update({
      where: { id: messageId },
      data: { content: text, editedAt: new Date() },
      include: {
        sender: { select: this.directChatUserInclude },
        attachments: true,
        replyTo: this.buildReplyToInclude(),
        ...this.buildMessageFavoriteInclude(userId)
      }
    });
  }

  /**
   * Apaga a mensagem (soft delete) — apenas o remetente, até 15 min após o envio. Desfavorita e desfixa o chat.
   */
  async deleteDirectMessage(userId: string, messageId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, senderId: true, createdAt: true, deletedAt: true, chatId: true, isSystem: true }
    });
    if (!message) throw new Error('Mensagem não encontrada');
    if (message.isSystem) throw new Error('Mensagens de evento não podem ser apagadas');
    this.assertCanEditOrDeleteOwnMessage(
      { ...message, deletedAt: message.deletedAt },
      userId
    );

    await prisma.$transaction([
      prisma.chat.updateMany({
        where: { pinnedMessageId: messageId },
        data: { pinnedMessageId: null }
      }),
      prisma.messageFavorite.deleteMany({ where: { messageId } }),
      prisma.message.update({
        where: { id: messageId },
        data: { content: '', deletedAt: new Date() }
      })
    ]);

    const out = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        sender: { select: this.directChatUserInclude },
        attachments: true,
        replyTo: this.buildReplyToInclude(),
        ...this.buildMessageFavoriteInclude(userId)
      }
    });
    if (!out) throw new Error('Mensagem não encontrada após apagar');
    return out;
  }

  /**
   * Envia uma mensagem em um chat direto ou grupo
   */
  async sendDirectMessage(data: SendMessageData) {
    const { chatId, senderId, content, attachments = [], replyToId: rawReplyId } = data;

    const chat = await prisma.chat.findUnique({ where: { id: chatId } });

    if (!chat) throw new Error('Chat não encontrado');
    if (chat.chatType !== ChatType.DIRECT && chat.chatType !== ChatType.GROUP) {
      throw new Error('Use o método de mensagem correto para este tipo de chat');
    }

    const canSend = chat.chatType === ChatType.GROUP
      ? !!(await prisma.chatParticipant.findUnique({
          where: { chatId_userId: { chatId, userId: senderId } },
          select: { id: true }
        }))
      : chat.initiatorId === senderId || chat.recipientId === senderId;
    if (!canSend) throw new Error('Você não tem permissão para enviar mensagem neste chat');

    let replyToId: string | undefined;
    const trimmedReply = typeof rawReplyId === 'string' ? rawReplyId.trim() : '';
    if (trimmedReply) {
      const parent = await prisma.message.findUnique({
        where: { id: trimmedReply },
        select: { id: true, chatId: true, isSystem: true }
      });
      if (!parent || parent.chatId !== chatId) {
        throw new Error('Mensagem citada não encontrada nesta conversa');
      }
      if (parent.isSystem) {
        throw new Error('Não é possível responder a uma mensagem de evento');
      }
      replyToId = parent.id;
    }

    const message = await prisma.message.create({
      data: {
        chatId,
        senderId,
        content,
        isRead: false,
        ...(replyToId ? { replyToId } : {}),
        attachments: {
          create: attachments.map(att => ({
            fileName: att.fileName,
            fileUrl: att.fileUrl,
            fileKey: att.fileKey,
            fileSize: att.fileSize,
            mimeType: att.mimeType
          }))
        }
      },
      include: {
        sender: { select: this.directChatUserInclude },
        attachments: true,
        replyTo: this.buildReplyToInclude(),
        ...this.buildMessageFavoriteInclude(senderId)
      }
    });

    await prisma.chat.update({
      where: { id: chatId },
      data: { lastMessageAt: new Date() }
    });

    return message;
  }

  /**
   * Conta mensagens não lidas em chats diretos/grupos de um usuário
   */
  async getDirectUnreadCount(userId: string) {
    const candidates = await prisma.message.findMany({
      where: {
        chat: {
          OR: [
            {
              chatType: ChatType.DIRECT,
              OR: [{ initiatorId: userId }, { recipientId: userId }]
            },
            {
              chatType: ChatType.GROUP,
              participants: { some: { userId } }
            }
          ]
        },
        senderId: { not: userId },
        isRead: false,
        isSystem: false
      },
      select: { id: true, chatId: true, createdAt: true }
    });

    const [privacies, hiddenRows] = await Promise.all([
      prisma.chatUserPrivacy.findMany({
        where: { userId, clearedAt: { not: null } },
        select: { chatId: true, clearedAt: true }
      }),
      prisma.messageHiddenForUser.findMany({
        where: { userId },
        select: { messageId: true }
      })
    ]);
    const clearedByChat = new Map<string, Date>();
    for (const p of privacies) {
      if (p.clearedAt) clearedByChat.set(p.chatId, p.clearedAt);
    }
    const hiddenSet = new Set(
      hiddenRows.map((h: { messageId: string }) => h.messageId)
    );

    let total = 0;
    for (const m of candidates) {
      if (hiddenSet.has(m.id)) continue;
      const clearedAt = clearedByChat.get(m.chatId);
      if (clearedAt && m.createdAt.getTime() <= clearedAt.getTime()) continue;
      total++;
    }

    return total;
  }

  /**
   * Oculta uma mensagem só para este usuário (histórico local).
   */
  async hideMessageForMe(userId: string, messageId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        chat: {
          select: {
            chatType: true,
            initiatorId: true,
            recipientId: true,
            participants: { select: { userId: true } }
          }
        }
      }
    });
    if (!message) throw new Error('Mensagem não encontrada');
    const ch = message.chat;
    if (ch.chatType !== ChatType.GROUP && ch.chatType !== ChatType.DIRECT) {
      throw new Error('Mensagem não suportada neste contexto');
    }
    if (ch.chatType === ChatType.GROUP) {
      if (!ch.participants.some((p) => p.userId === userId)) throw new Error('Você não participa deste chat');
    } else if (ch.initiatorId !== userId && ch.recipientId !== userId) {
      throw new Error('Você não tem acesso a esta mensagem');
    }

    await prisma.messageHiddenForUser.upsert({
      where: { userId_messageId: { userId, messageId } },
      create: { userId, messageId },
      update: {}
    });
    return { ok: true as const };
  }

  /**
   * Limpa o histórico só para este usuário (mensagens novas continuam aparecendo).
   */
  async clearConversationForMe(userId: string, chatId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { participants: { select: { userId: true } } }
    });
    if (!chat) throw new Error('Chat não encontrado');

    const hasAccess =
      chat.chatType === ChatType.GROUP
        ? chat.participants.some((p) => p.userId === userId)
        : chat.chatType === ChatType.DIRECT &&
          (chat.initiatorId === userId || chat.recipientId === userId);

    if (!hasAccess) throw new Error('Você não tem acesso a este chat');

    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.chatUserPrivacy.upsert({
        where: { userId_chatId: { userId, chatId } },
        create: { userId, chatId, clearedAt: now },
        update: { clearedAt: now }
      });
      await tx.messageHiddenForUser.deleteMany({
        where: { userId, message: { chatId } }
      });
    });

    return { ok: true as const };
  }

  /**
   * Lista todos os usuários ativos do sistema (para iniciar um chat)
   */
  async listUsers(currentUserId: string) {
    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        profilePhotoUrl: true,
        employee: {
          select: {
            department: true,
            position: true,
            employeeId: true
          }
        }
      },
      orderBy: { name: 'asc' }
    });

    return users;
  }

  /**
   * Faz upload de arquivo
   */
  async uploadFile(file: any, userId: string): Promise<{
    url: string;
    key: string;
    size: number;
    mimeType: string;
  }> {
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error('Arquivo muito grande. Tamanho máximo: 10MB');
    }

    if (this.useLocal || !this.s3) return this.saveFileLocally(file);

    const fileExtension = path.extname(file.originalname);
    const fileName = `messages/${userId}/${uuidv4()}${fileExtension}`;

    const uploadParams = {
      Bucket: this.bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/octet-stream',
      ACL: 'private'
    } as AWS.S3.PutObjectRequest;

    try {
      const uploadPromise = this.s3.upload(uploadParams).promise();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Timeout ao enviar arquivo para o S3')), 15000);
      });
      const result = await Promise.race([uploadPromise, timeoutPromise]) as AWS.S3.ManagedUpload.SendData;

      return {
        url: result.Location,
        key: fileName,
        size: file.size,
        mimeType: file.mimetype || 'application/octet-stream'
      };
    } catch (error) {
      console.warn('[ChatService] Falha no upload S3. Usando armazenamento local.', error);
      return this.saveFileLocally(file);
    }
  }
}

