import { SupportTicketCategory } from '@prisma/client';
import { findEmployeeByCpf, isValidCpf, onlyDigits } from '../lib/employeeCpfLookup';
import {
  SUPPORT_CATEGORY_LABELS,
  supportTicketService,
} from './SupportTicketService';
import { PASSWORD_RESET_HELP } from './GennecySupportFlowService';
import type { SendAction } from './WhatsAppBotService';

export type WhatsAppSupportFlowStatus =
  | 'SUPPORT_ASK_CATEGORY'
  | 'SUPPORT_ASK_DESCRIPTION'
  | 'SUPPORT_ASK_NAME'
  | 'SUPPORT_ASK_CPF'
  | 'SUPPORT_CONFIRM'
  | 'SUPPORT_COMPLETE';

const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;

function waButtons(body: string, extra?: Array<{ id: string; title: string }>): SendAction {
  return {
    type: 'buttons',
    body,
    buttons: extra ?? [
      { id: 'MENU', title: 'Menu' },
      { id: 'END', title: 'Encerrar' },
    ],
  };
}

function categoryFromInput(content: string): SupportTicketCategory | null {
  const t = content.trim().toLowerCase();
  if (
    t === 'suporte_sistema' ||
    t === 'suporte' ||
    t === '1' ||
    t.includes('senha') ||
    t.includes('login')
  ) {
    return 'PASSWORD_RESET';
  }
  if (t === '2' || t.includes('erro') || t.includes('bug')) return 'SYSTEM_ERROR';
  if (t === '3' || t.includes('permiss') || t.includes('menu')) return 'PERMISSION';
  if (t === '4' || t.includes('outro')) return 'OTHER';
  return null;
}

function buildSummary(payload: Record<string, unknown>): string {
  const category = String(payload.supportCategory ?? 'OTHER') as SupportTicketCategory;
  const label =
    SUPPORT_CATEGORY_LABELS[category in SUPPORT_CATEGORY_LABELS ? category : 'OTHER'];
  const lines = [
    'Confira o chamado de suporte:',
    '',
    `Assunto: ${label}`,
    `Nome: ${payload.name || '—'}`,
    `Descrição: ${payload.supportDescription || '—'}`,
  ];
  if (payload.supportModuleHint) {
    lines.push(`Tela/módulo: ${payload.supportModuleHint}`);
  }
  if (payload.supportCpf) {
    lines.push(`CPF: ${payload.supportCpf}`);
  }
  lines.push('', 'Responda SIM para abrir ou NÃO para cancelar.');
  return lines.join('\n');
}

export function isWhatsAppSupportFlowStatus(status: string): boolean {
  return status.startsWith('SUPPORT_');
}

export function isWhatsAppSupportMenuSelection(content: string): boolean {
  return (
    content === 'suporte_sistema' ||
    content.includes('suporte do sistema') ||
    (content.includes('suporte') && !content.includes('combust')) ||
    content.includes('esqueci') ||
    content.includes('senha') ||
    (content.includes('erro') && content.includes('sistema'))
  );
}

export async function processWhatsAppSupportFlow(params: {
  phone: string;
  textRaw: string;
  content: string;
  flowStatus: string;
  payload: Record<string, unknown>;
  conversationId: string;
  isMenuRequest: () => boolean;
  isEndRequest: () => boolean;
  resetToMenu: () => SendAction;
  endConversation: () => SendAction;
}): Promise<{
  sendAction: SendAction;
  newStatus: WhatsAppSupportFlowStatus | 'MENU';
  newPayload: Record<string, unknown>;
  newConversationStatus?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  clearPayload?: boolean;
} | null> {
  const {
    phone,
    textRaw,
    content,
    flowStatus,
    payload,
    conversationId,
    isMenuRequest,
    isEndRequest,
    resetToMenu,
    endConversation,
  } = params;

  const startingFromMenu = flowStatus === 'MENU' && isWhatsAppSupportMenuSelection(content);
  if (!isWhatsAppSupportFlowStatus(flowStatus) && !startingFromMenu) {
    return null;
  }

  let newPayload = { ...payload };
  let newStatus: WhatsAppSupportFlowStatus | 'MENU' = startingFromMenu
    ? 'SUPPORT_ASK_CATEGORY'
    : (flowStatus as WhatsAppSupportFlowStatus);

  if (isEndRequest()) {
    return { sendAction: endConversation(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }
  if (isMenuRequest()) {
    return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
  }

  if (newStatus === 'SUPPORT_ASK_CATEGORY' && startingFromMenu && content === 'suporte_sistema') {
    return {
      sendAction: waButtons(
        [
          'Suporte ao sistema Gennesis — escolha o assunto:',
          '',
          '1 — Esqueci a senha / primeiro acesso',
          '2 — Erro ou bug',
          '3 — Sem permissão / menu',
          '4 — Outro',
        ].join('\n'),
      ),
      newStatus: 'SUPPORT_ASK_CATEGORY',
      newPayload,
    };
  }

  switch (newStatus) {
    case 'SUPPORT_ASK_CATEGORY': {
      const category = categoryFromInput(content);
      if (!category) {
        return {
          sendAction: waButtons('Digite 1, 2, 3 ou 4 para o tipo de problema.'),
          newStatus: 'SUPPORT_ASK_CATEGORY',
          newPayload,
        };
      }
      newPayload.supportCategory = category;
      newPayload.supportFlow = 'SUPPORT';
      if (category === 'PASSWORD_RESET') {
        return {
          sendAction: {
            type: 'text',
            text: `${PASSWORD_RESET_HELP}\n\nDescreva sua situação para abrirmos o chamado:`,
          },
          newStatus: 'SUPPORT_ASK_DESCRIPTION',
          newPayload,
        };
      }
      return {
        sendAction: {
          type: 'text',
          text: 'Descreva o problema com detalhes (o que você fez e o que apareceu):',
        },
        newStatus: 'SUPPORT_ASK_DESCRIPTION',
        newPayload,
      };
    }

    case 'SUPPORT_ASK_DESCRIPTION': {
      const desc = (textRaw || '').trim();
      if (desc.length < 8) {
        return {
          sendAction: waButtons('Preciso de mais detalhes (pelo menos uma frase completa).'),
          newStatus: 'SUPPORT_ASK_DESCRIPTION',
          newPayload,
        };
      }
      newPayload.supportDescription = desc.slice(0, 4000);
      const existingName = String(newPayload.name || '').trim();
      if (existingName) {
        if (newPayload.supportCategory === 'PASSWORD_RESET') {
          return {
            sendAction: {
              type: 'text',
              text: 'Informe seu CPF (somente números) para o chamado de senha:',
            },
            newStatus: 'SUPPORT_ASK_CPF',
            newPayload,
          };
        }
        return {
          sendAction: waButtons(buildSummary(newPayload)),
          newStatus: 'SUPPORT_CONFIRM',
          newPayload,
        };
      }
      return {
        sendAction: waButtons('Qual é seu nome completo?'),
        newStatus: 'SUPPORT_ASK_NAME',
        newPayload,
      };
    }

    case 'SUPPORT_ASK_NAME': {
      const name = (textRaw || '').trim();
      if (name.length < 4) {
        return {
          sendAction: waButtons('Informe seu nome completo.'),
          newStatus: 'SUPPORT_ASK_NAME',
          newPayload,
        };
      }
      newPayload.name = name.slice(0, 60);
      if (newPayload.supportCategory === 'PASSWORD_RESET') {
        return {
          sendAction: {
            type: 'text',
            text: 'Informe seu CPF (somente números):',
          },
          newStatus: 'SUPPORT_ASK_CPF',
          newPayload,
        };
      }
      return {
        sendAction: waButtons(buildSummary(newPayload)),
        newStatus: 'SUPPORT_CONFIRM',
        newPayload,
      };
    }

    case 'SUPPORT_ASK_CPF': {
      const cpf = onlyDigits(textRaw || '');
      if (!isValidCpf(cpf)) {
        return {
          sendAction: waButtons('CPF inválido. Envie os 11 dígitos.'),
          newStatus: 'SUPPORT_ASK_CPF',
          newPayload,
        };
      }
      newPayload.supportCpf = cpf;
      const employee = await findEmployeeByCpf(cpf);
      if (employee?.userId) {
        newPayload.supportRequesterUserId = employee.userId;
      }
      return {
        sendAction: waButtons(buildSummary(newPayload)),
        newStatus: 'SUPPORT_CONFIRM',
        newPayload,
      };
    }

    case 'SUPPORT_CONFIRM': {
      if (NO_WORDS.test(content)) {
        return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
      }
      if (!YES_WORDS.test(content)) {
        return {
          sendAction: waButtons('Responda SIM para confirmar ou NÃO para cancelar.'),
          newStatus: 'SUPPORT_CONFIRM',
          newPayload,
        };
      }

      const category = (newPayload.supportCategory as SupportTicketCategory) || 'OTHER';
      const ticket = await supportTicketService.create({
        category,
        channel: 'WHATSAPP',
        description: String(newPayload.supportDescription || textRaw || 'Sem descrição'),
        moduleHint: String(newPayload.supportModuleHint || '') || null,
        requesterId: (newPayload.supportRequesterUserId as string) || null,
        requesterName: String(newPayload.name || '').trim() || null,
        requesterPhone: phone,
        requesterCpf: String(newPayload.supportCpf || '') || null,
        whatsAppConversationId: conversationId,
      });

      return {
        sendAction: {
          type: 'text',
          text: [
            `Chamado de suporte #${ticket.displayNumber} registrado.`,
            '',
            'Encaminhei para a fila de atendimento humano — alguém da equipe vai responder por aqui em breve.',
            'Aguarde nesta conversa.',
          ].join('\n'),
        },
        newStatus: 'SUPPORT_COMPLETE',
        newPayload: {
          ...newPayload,
          supportTicketId: ticket.id,
          supportTicketNumber: ticket.displayNumber,
          supportCategory: ticket.category,
          supportDescription: ticket.description,
          attendantRequested: true,
          attendantRequestedAt: new Date().toISOString(),
          attendantInProgress: false,
          supportEscalated: true,
        },
        newConversationStatus: 'PENDING',
      };
    }

    case 'SUPPORT_COMPLETE': {
      return { sendAction: resetToMenu(), newStatus: 'MENU', newPayload: {}, clearPayload: true };
    }

    default:
      return null;
  }
}
