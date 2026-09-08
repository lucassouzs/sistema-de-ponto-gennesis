import * as fs from 'fs';
import * as path from 'path';
import { Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { whatsAppBot } from '../services/WhatsAppBotService';
import { metaWhatsApp } from '../services/MetaWhatsAppService';

/** Token que a Meta envia no GET do webhook; deve ser igual ao configurado no App. */
const META_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'gennesis_whatsapp_verify';

export class WhatsAppController {
  /**
   * Verificação do webhook pela Meta (GET).
   * Meta envia hub.mode, hub.verify_token, hub.challenge; respondemos com hub.challenge se o token bater.
   */
  async verifyWebhook(req: Request, res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // Meta exige resposta em texto com o valor exato de hub.challenge (string)
    const challengeStr = Array.isArray(challenge) ? challenge[0] : challenge;

    if (mode === 'subscribe' && token === META_VERIFY_TOKEN && challengeStr) {
      console.log('[WhatsApp Webhook] Verificação Meta OK');
      res.status(200).type('text').send(String(challengeStr));
    } else {
      // GET sem hub.mode geralmente é health check, navegador ou outro serviço — não é a Meta
      if (mode === undefined && !token && !challengeStr) {
        console.log('[WhatsApp Webhook] GET sem parâmetros da Meta (ignorando)');
      } else {
        console.warn('[WhatsApp Webhook] Verificação falhou:', { mode, tokenMatch: token === META_VERIFY_TOKEN, hasChallenge: !!challengeStr });
      }
      res.status(403).send('Forbidden');
    }
  }

  /**
   * Webhook público - recebe eventos da WhatsApp Cloud API (Meta).
   * Payload: { object: "whatsapp_business_account", entry: [ { changes: [ { value: { messages: [...] } } ] } ] }
   */
  async handleWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body || {};

      // Log para debug: ver se a Meta está chamando o webhook
      console.log('[WhatsApp Webhook] POST recebido', { object: body.object, hasEntry: Array.isArray(body.entry) && body.entry.length > 0 });

      // Resposta rápida 200 para a Meta (evitar retentativas)
      res.status(200).send('OK');

      if (body.object !== 'whatsapp_business_account') {
        return;
      }

      const entries = Array.isArray(body.entry) ? body.entry : [];
      for (const entry of entries) {
        const changes = Array.isArray(entry.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change.value || {};
          const contacts = Array.isArray(value.contacts) ? value.contacts : [];
          const profileByWaDigits = new Map<string, string>();
          for (const c of contacts) {
            const waId = String((c as { wa_id?: string }).wa_id || '').replace(/\D/g, '');
            const pname = (c as { profile?: { name?: string } }).profile?.name;
            if (waId && typeof pname === 'string' && pname.trim()) {
              profileByWaDigits.set(waId, pname.trim().slice(0, 120));
            }
          }
          const messages = Array.isArray(value.messages) ? value.messages : [];
          for (const msg of messages) {
            const phone = String(msg.from || '').trim();
            if (!phone) {
              console.warn('[WhatsApp Webhook] Mensagem sem from:', JSON.stringify(msg).slice(0, 200));
              continue;
            }
            const phoneDigits = phone.replace(/\D/g, '');
            const whatsappProfileName = profileByWaDigits.get(phoneDigits);

            let text = '';
            let hasMedia = false;
            let mediaId: string | null = null;
            let mediaMimeType: string | undefined;
            let mediaFilename: string | undefined;

            switch (msg.type) {
              case 'text':
                text = msg.text?.body ?? '';
                break;
              case 'image':
              case 'document':
                hasMedia = true;
                mediaId = msg.image?.id ?? msg.document?.id ?? null;
                mediaMimeType = msg.image?.mime_type ?? msg.document?.mime_type;
                mediaFilename = msg.document?.filename;
                text = msg.caption ?? msg.image?.caption ?? msg.document?.caption ?? '';
                break;
              case 'audio':
              case 'video':
                hasMedia = true;
                mediaId = msg.audio?.id ?? msg.video?.id ?? null;
                mediaMimeType = msg.audio?.mime_type ?? msg.video?.mime_type;
                text = msg.caption ?? '';
                break;
              case 'button':
                text = msg.button?.text ?? msg.button?.payload ?? '';
                break;
              case 'interactive':
                if (msg.interactive?.type === 'button_reply') {
                  text = msg.interactive.button_reply?.id ?? msg.interactive.button_reply?.title ?? '';
                } else if (msg.interactive?.type === 'list_reply') {
                  text = msg.interactive.list_reply?.id ?? msg.interactive.list_reply?.title ?? '';
                }
                break;
              default:
                text = '';
            }

            if (!text && !hasMedia) {
              console.warn('[WhatsApp Webhook] Sem texto nem mídia, ignorando. phone=', phone);
              continue;
            }

            console.log(
              '[WhatsApp Webhook] Processando mensagem phone=',
              phone,
              'text=',
              (text || '').slice(0, 50),
              hasMedia ? ', hasMedia' : ''
            );
            const mediaInfo = hasMedia && mediaId ? { mediaId, mimeType: mediaMimeType, filename: mediaFilename } : undefined;
            whatsAppBot
              .processMessage(phone, text || ' ', hasMedia, mediaInfo, {
                whatsappProfileName: whatsappProfileName || undefined
              })
              .catch((err) => {
                console.error('[WhatsApp Webhook] Erro ao processar:', err);
              });
          }
        }
      }
    } catch (error) {
      console.error('[WhatsApp Webhook] Erro:', error);
    }
  }
  /**
   * Listar conversas do WhatsApp (para o pessoal ver no sistema)
   */
  async listConversations(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const conversations = await prisma.whatsAppConversation.findMany({
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: { messages: true, submissions: true }
          },
          submissions: {
            where: { type: 'MEDICAL_CERTIFICATE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true }
          },
          // O payload pode conter indicadores como escalonamento para atendente.
          // Usamos o payload na camada de mapeamento abaixo.
          messages: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        }
      });

      const data = conversations.map((c) => ({
        id: c.id,
        phone: c.phone,
        name:
          ((c.payload as any)?.name ??
            (c.payload as any)?.requesterName ??
            (c.payload as any)?.waProfileName) ||
          null,
        flowStatus: c.flowStatus,
        currentStep: c.currentStep,
        status: c.status,
        attendantRequested: !!(c.payload as any)?.attendantRequested,
        attendantInProgress: !!(c.payload as any)?.attendantInProgress,
        attendantHandoffEver: !!(c.payload as any)?.attendantHandoffEver,
        updatedAt: c.updatedAt,
        createdAt: c.createdAt,
        messageCount: c._count.messages,
        submissionCount: c._count.submissions,
        medicalCertificateStatus: c.submissions[0]?.status ?? null,
        lastMessage: c.messages[0]?.content?.substring(0, 80) || null,
        lastMessageAt: c.messages[0]?.createdAt || null
      }));

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Lista de envios de atestado (1 item por submission), para fila do painel de atestados.
   */
  async listMedicalCertificateSubmissions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const submissions = await prisma.whatsAppSubmission.findMany({
        where: { type: 'MEDICAL_CERTIFICATE' },
        orderBy: { createdAt: 'desc' },
        include: {
          conversation: {
            select: {
              id: true,
              phone: true,
              flowStatus: true,
              payload: true,
              status: true,
              createdAt: true,
              updatedAt: true
            }
          }
        }
      });

      const data = submissions.map((s) => {
        const conversationPayload = (s.conversation.payload as any) ?? {};
        const submissionPayload = (s.payload as any) ?? {};
        const name =
          ((submissionPayload?.name ??
            submissionPayload?.requesterName ??
            conversationPayload?.name ??
            conversationPayload?.requesterName ??
            conversationPayload?.waProfileName) as string | undefined) || null;

        return {
          id: s.id,
          submissionId: s.id,
          conversationId: s.conversation.id,
          phone: s.conversation.phone,
          name,
          flowStatus: s.conversation.flowStatus,
          conversationStatus: s.conversation.status,
          status: s.status,
          medicalCertificateStatus: s.status,
          fileName: s.fileName,
          createdAt: s.createdAt,
          updatedAt: s.createdAt
        };
      });

      return res.json({ success: true, data });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Obter uma conversa com todas as mensagens e envios (atestados etc.)
   */
  async getConversation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { id },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' }
          },
          submissions: {
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!conversation) {
        throw createError('Conversa não encontrada', 404);
      }

      const messages = await Promise.all(
        conversation.messages.map(async (m) => {
          let mediaUrl = m.mediaUrl;
          if (m.mediaKey && !mediaUrl) {
            const signed = await metaWhatsApp.getSignedUrlForMedia(m.mediaKey);
            if (signed) mediaUrl = signed;
          }
          return {
            id: m.id,
            role: m.role,
            content: m.content,
            mediaUrl,
            fileName: m.fileName,
            mimeType: m.mimeType,
            createdAt: m.createdAt
          };
        })
      );

      const submissions = await Promise.all(
        conversation.submissions.map(async (s) => {
          let fileUrl = s.fileUrl;
          if (s.fileKey && !fileUrl) {
            const signed = await metaWhatsApp.getSignedUrlForMedia(s.fileKey);
            if (signed) fileUrl = signed;
          }
          return {
            id: s.id,
            type: s.type,
            payload: s.payload,
            fileUrl,
            fileName: s.fileName,
            status: s.status,
            medicalCertificateId: s.medicalCertificateId,
            createdAt: s.createdAt
          };
        })
      );

      res.json({
        success: true,
        data: {
          id: conversation.id,
          phone: conversation.phone,
          flowStatus: conversation.flowStatus,
          currentStep: conversation.currentStep,
          status: conversation.status,
          payload: conversation.payload,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          messages,
          submissions
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Remover uma conversa do WhatsApp (mensagens e submissions em cascade).
   */
  async deleteConversation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const existing = await prisma.whatsAppConversation.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Conversa não encontrada', 404);
      }

      await prisma.whatsAppConversation.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Conversa removida com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Enviar mensagem manual para uma conversa WhatsApp.
   * (Mensagem do admin/DP via sistema)
   */
  async sendMessageToConversation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { content } = req.body || {};

      if (!content || typeof content !== 'string' || !content.trim()) {
        throw createError('Mensagem é obrigatória', 400);
      }

      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { id }
      });

      if (!conversation) {
        throw createError('Conversa não encontrada', 404);
      }

      // Envia via Meta
      await metaWhatsApp.sendText(conversation.phone, content.trim());

      // Salva a mensagem no histórico do sistema
      await prisma.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: content.trim()
        }
      });

      // Marca como pendente se for uma conversa já concluída/cancelada (evita “travamento” visual)
      const currentPayload = (conversation.payload as any) ?? {};
      const shouldTransitionToInProgress = !!currentPayload?.attendantRequested;
      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          status: 'PENDING' as any,
          payload: {
            ...currentPayload,
            attendantRequested: shouldTransitionToInProgress ? false : currentPayload?.attendantRequested,
            attendantInProgress: shouldTransitionToInProgress ? true : currentPayload?.attendantInProgress,
            attendantInProgressAt: shouldTransitionToInProgress
              ? new Date().toISOString()
              : currentPayload?.attendantInProgressAt ?? null
          } as any,
          updatedAt: new Date()
        } as any
      });

      // Garante encerramento automático caso a pessoa não responda.
      whatsAppBot.scheduleInactivityTimeoutForConversation(conversation.id, conversation.phone);

      res.json({
        success: true,
        message: 'Mensagem enviada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Encerrar conversa manualmente (admin/atendente).
   * Marca status como CANCELLED, limpa payload e envia mensagem de encerramento.
   */
  async endConversation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { id }
      });

      if (!conversation) {
        throw createError('Conversa não encontrada', 404);
      }

      const endText = 'Atendimento encerrado 😊\nSempre que precisar, é só me chamar por aqui!';

      // Para conversas que estavam em timer, evitamos disparos posteriores.
      whatsAppBot.clearInactivityTimeoutsForConversation(conversation.id);

      const prevPayload = (conversation.payload as Record<string, unknown>) || {};
      const keptContact: Record<string, unknown> = {};
      const n = prevPayload.name;
      const r = prevPayload.requesterName;
      const w = prevPayload.waProfileName;
      if (typeof n === 'string' && n.trim()) keptContact.name = n.trim().slice(0, 120);
      if (typeof r === 'string' && r.trim()) keptContact.requesterName = r.trim().slice(0, 120);
      if (typeof w === 'string' && w.trim()) keptContact.waProfileName = w.trim().slice(0, 120);

      // Histórico de atendimento humano: sem isso, conversas com atestado somem da aba "Encerradas"
      // após encerrar (payload perde attendantRequested).
      const hadHumanHandoff =
        prevPayload.attendantHandoffEver === true ||
        prevPayload.attendantRequested === true ||
        prevPayload.attendantInProgress === true ||
        (typeof prevPayload.attendantRequestedAt === 'string' && prevPayload.attendantRequestedAt.length > 0);
      if (hadHumanHandoff) {
        keptContact.attendantHandoffEver = true;
      }

      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          status: 'CANCELLED' as any,
          flowStatus: 'MENU',
          currentStep: 'MENU',
          // Mantém nome para a lista / detalhe não voltarem a mostrar só o telefone após encerrar.
          payload: Object.keys(keptContact).length ? (keptContact as any) : ({} as any),
          updatedAt: new Date()
        } as any
      });

      await prisma.whatsAppMessage.create({
        data: {
          conversationId: conversation.id,
          role: 'assistant',
          content: endText
        }
      });

      // Envia aviso ao usuário no WhatsApp.
      await metaWhatsApp.sendText(conversation.phone, endText);

      res.json({
        success: true,
        message: 'Conversa encerrada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Finalizar análise de um envio de atestado.
   * Move o submission de PENDING para PROCESSED.
   */
  async finalizeMedicalCertificateSubmission(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id, submissionId } = req.params;

      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { id },
        select: { id: true }
      });
      if (!conversation) {
        throw createError('Conversa não encontrada', 404);
      }

      const submission = await prisma.whatsAppSubmission.findFirst({
        where: {
          id: submissionId,
          conversationId: id,
          type: 'MEDICAL_CERTIFICATE'
        },
        select: { id: true, status: true }
      });

      if (!submission) {
        throw createError('Atestado não encontrado para esta conversa', 404);
      }

      if (submission.status !== 'PENDING') {
        return res.json({
          success: true,
          message: 'Atestado já finalizado'
        });
      }

      await prisma.whatsAppSubmission.update({
        where: { id: submission.id },
        data: { status: 'PROCESSED' as any }
      });

      return res.json({
        success: true,
        message: 'Atestado finalizado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Download do arquivo de um envio de atestado (força attachment; evita abrir S3 em nova aba).
   */
  async downloadMedicalCertificateSubmissionFile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id: conversationId, submissionId } = req.params;

      const submission = await prisma.whatsAppSubmission.findFirst({
        where: {
          id: submissionId,
          conversationId,
          type: 'MEDICAL_CERTIFICATE'
        }
      });

      if (!submission) {
        throw createError('Atestado não encontrado', 404);
      }

      const fileNameRaw = submission.fileName?.trim() || 'atestado';
      const safeFilename = fileNameRaw.replace(/[/\\?%*:|"<>]/g, '-').slice(0, 180);

      if (submission.fileKey) {
        const got = await metaWhatsApp.getObjectBuffer(submission.fileKey);
        if (!got) {
          throw createError('Não foi possível obter o arquivo', 500);
        }
        res.setHeader('Content-Type', got.contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        return res.send(got.buffer);
      }

      const url = submission.fileUrl || '';
      const marker = '/uploads/whatsapp-media/';
      if (url.includes(marker)) {
        const after = url.split(marker)[1]?.split('?')[0];
        if (!after) {
          throw createError('Arquivo não encontrado', 404);
        }
        const basename = path.basename(after);
        const filePath = path.join(process.cwd(), 'apps', 'backend', 'uploads', 'whatsapp-media', basename);
        if (!fs.existsSync(filePath)) {
          throw createError('Arquivo não encontrado', 404);
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType =
          (
            {
              '.pdf': 'application/pdf',
              '.jpg': 'image/jpeg',
              '.jpeg': 'image/jpeg',
              '.png': 'image/png',
              '.webp': 'image/webp',
              '.gif': 'image/gif'
            } as Record<string, string>
          )[ext] || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
        return res.sendFile(filePath);
      }

      throw createError('Arquivo não disponível para download', 404);
    } catch (error) {
      return next(error);
    }
  }
}
