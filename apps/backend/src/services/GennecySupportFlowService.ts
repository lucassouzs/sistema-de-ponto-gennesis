import { SupportTicketCategory, SupportTicketChannel } from '@prisma/client';
import { prisma } from '../lib/prisma';
import {
  SUPPORT_CATEGORY_LABELS,
  supportTicketService,
} from './SupportTicketService';

const FLOW_TYPE = 'SUPPORT_TICKET';

type SupportFlowStep =
  | 'MENU'
  | 'ASK_CATEGORY'
  | 'ASK_DESCRIPTION'
  | 'ASK_MODULE'
  | 'CONFIRM';

type SupportFlowPayload = {
  category?: SupportTicketCategory;
  description?: string;
  moduleHint?: string;
  requesterName?: string;
  requesterPhone?: string;
  requesterCpf?: string;
  whatsAppConversationId?: string;
};

const CANCEL_WORDS = /^(cancelar|cancela|sair|parar|desistir)$/i;
const YES_WORDS = /^(sim|s|confirmar|confirmo|ok|pode|yes)$/i;
const NO_WORDS = /^(n[aã]o|nao|n|cancelar|cancela)$/i;
const SKIP_WORDS = /^(n[aã]o|nao|nenhuma|nenhum|-|pular|skip)$/i;

const SUPPORT_INTENT =
  /\b(suporte|senha|login|acesso|esqueci|err[oa]|bug|n[aã]o\s+(consigo|abre|entra|funciona)|permiss[aã]o|menu|sistema)\b/i;

export function messageHasSupportIntent(text: string): boolean {
  return SUPPORT_INTENT.test(text.trim());
}

export function messageStartsSupportMenu(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t === '5' || t === 'suporte' || t.includes('suporte do sistema');
}

export const PASSWORD_RESET_HELP = [
  'Esqueceu a senha?',
  '',
  'A recuperação automática está desativada. Para resetar:',
  '1. Confirme seu CPF com o DP/TI',
  '2. Aguarde a nova senha ser liberada',
  '',
  'Se quiser registrar um chamado formal, digite 5 (Suporte do sistema) ou descreva o problema.',
].join('\n');

export const GENNECY_SUPPORT_MENU_LINES = [
  '5 — Suporte do sistema (senha, erro, permissão)',
];

async function getActiveSession(chatId: string, userId: string) {
  return prisma.gennecyChatFlowSession.findUnique({
    where: { chatId_userId_flowType: { chatId, userId, flowType: FLOW_TYPE } },
  });
}

async function upsertSession(
  chatId: string,
  userId: string,
  step: SupportFlowStep,
  payload: SupportFlowPayload,
) {
  return prisma.gennecyChatFlowSession.upsert({
    where: { chatId_userId_flowType: { chatId, userId, flowType: FLOW_TYPE } },
    create: {
      chatId,
      userId,
      flowType: FLOW_TYPE,
      step,
      payload,
      status: 'ACTIVE',
    },
    update: { step, payload, status: 'ACTIVE' },
  });
}

async function completeSession(chatId: string, userId: string) {
  await prisma.gennecyChatFlowSession.updateMany({
    where: { chatId, userId, flowType: FLOW_TYPE, status: 'ACTIVE' },
    data: { status: 'COMPLETED' },
  });
}

async function cancelSession(chatId: string, userId: string) {
  await prisma.gennecyChatFlowSession.updateMany({
    where: { chatId, userId, flowType: FLOW_TYPE, status: 'ACTIVE' },
    data: { status: 'CANCELLED' },
  });
}

function categoryFromInput(body: string): SupportTicketCategory | null {
  const t = body.trim().toLowerCase();
  if (t === '1' || t.includes('senha') || t.includes('login') || t.includes('acesso')) {
    return 'PASSWORD_RESET';
  }
  if (t === '2' || t.includes('erro') || t.includes('bug') || t.includes('trav')) {
    return 'SYSTEM_ERROR';
  }
  if (t === '3' || t.includes('permiss') || t.includes('menu') || t.includes('liber')) {
    return 'PERMISSION';
  }
  if (t === '4' || t.includes('outro')) return 'OTHER';
  return null;
}

function buildSummary(payload: SupportFlowPayload): string {
  const cat = payload.category ? SUPPORT_CATEGORY_LABELS[payload.category] : '—';
  const lines = [
    'Confira os dados do chamado:',
    '',
    `Assunto: ${cat}`,
    `Descrição: ${payload.description || '—'}`,
  ];
  if (payload.moduleHint?.trim()) {
    lines.push(`Tela/módulo: ${payload.moduleHint}`);
  }
  lines.push('', 'Digite sim para abrir o chamado ou nao para cancelar.');
  return lines.join('\n');
}

export class GennecySupportFlowService {
  async hasActiveFlow(chatId: string, userId: string): Promise<boolean> {
    const session = await getActiveSession(chatId, userId);
    return Boolean(session && session.status === 'ACTIVE' && session.step !== 'MENU');
  }

  async processMessage(params: {
    chatId: string;
    userId: string;
    content: string;
    channel?: SupportTicketChannel;
    requesterName?: string;
    requesterPhone?: string;
    whatsAppConversationId?: string;
  }): Promise<{ handled: boolean; reply: string }> {
    const body = params.content.trim();
    const channel = params.channel ?? 'GENNECY_CHAT';
    const session = await getActiveSession(params.chatId, params.userId);
    const payload = (session?.payload ?? {}) as SupportFlowPayload;
    const step = (session?.step ?? 'MENU') as SupportFlowStep;

    if (CANCEL_WORDS.test(body)) {
      if (session?.status === 'ACTIVE' && step !== 'MENU') {
        await cancelSession(params.chatId, params.userId);
        return {
          handled: true,
          reply: 'Chamado cancelado. Se precisar, digite 5 para suporte do sistema.',
        };
      }
    }

    if (step === 'MENU') {
      if (!messageStartsSupportMenu(body) && !messageHasSupportIntent(body)) {
        return { handled: false, reply: '' };
      }
      await upsertSession(params.chatId, params.userId, 'ASK_CATEGORY', {});
      return {
        handled: true,
        reply: [
          'Vou te ajudar com suporte ao sistema. Escolha o assunto:',
          '',
          '1 — Esqueci a senha / primeiro acesso',
          '2 — Erro ou bug no sistema',
          '3 — Sem permissão / não vejo um menu',
          '4 — Outro',
          '',
          'Digite o número ou descreva brevemente.',
        ].join('\n'),
      };
    }

    if (step === 'ASK_CATEGORY') {
      const category = categoryFromInput(body);
      if (!category && body.length < 8) {
        return {
          handled: true,
          reply: 'Não entendi. Digite **1**, **2**, **3** ou **4**, ou descreva o problema em uma frase.',
        };
      }
      payload.category = category ?? 'OTHER';
      if (!category && body.length >= 8) {
        payload.description = body;
        await upsertSession(params.chatId, params.userId, 'ASK_MODULE', payload);
        return {
          handled: true,
          reply:
            'Em qual tela ou módulo aconteceu? (ex.: Folha de Pagamento, Conversas)\nDigite **pular** se não souber.',
        };
      }
      await upsertSession(params.chatId, params.userId, 'ASK_DESCRIPTION', payload);
      if (payload.category === 'PASSWORD_RESET') {
        return {
          handled: true,
          reply: [
            PASSWORD_RESET_HELP,
            '',
            'Descreva sua situação (CPF, se é primeiro acesso, etc.) para abrirmos o chamado:',
          ].join('\n'),
        };
      }
      return {
        handled: true,
        reply: 'Descreva o problema com o máximo de detalhes (o que fez, o que apareceu na tela):',
      };
    }

    if (step === 'ASK_DESCRIPTION') {
      if (body.length < 6) {
        return {
          handled: true,
          reply: 'Preciso de um pouco mais de detalhe (mínimo uma frase completa).',
        };
      }
      payload.description = body;
      await upsertSession(params.chatId, params.userId, 'ASK_MODULE', payload);
      return {
        handled: true,
        reply:
          'Qual tela ou módulo do sistema? (ex.: /ponto/folha-pagamento)\nDigite **pular** se não se aplicar.',
      };
    }

    if (step === 'ASK_MODULE') {
      if (!SKIP_WORDS.test(body)) {
        payload.moduleHint = body.slice(0, 200);
      }
      await upsertSession(params.chatId, params.userId, 'CONFIRM', payload);
      return { handled: true, reply: buildSummary(payload) };
    }

    if (step === 'CONFIRM') {
      if (NO_WORDS.test(body)) {
        await cancelSession(params.chatId, params.userId);
        return { handled: true, reply: 'Ok, chamado não foi aberto.' };
      }
      if (!YES_WORDS.test(body)) {
        return { handled: true, reply: 'Digite sim para confirmar ou nao para cancelar.' };
      }

      const user = await prisma.user.findUnique({
        where: { id: params.userId },
        select: { name: true, cpf: true },
      });

      const ticket = await supportTicketService.create({
        category: payload.category ?? 'OTHER',
        channel,
        description: payload.description ?? body,
        moduleHint: payload.moduleHint,
        requesterId: params.userId,
        requesterName: params.requesterName ?? user?.name ?? null,
        requesterPhone: params.requesterPhone ?? null,
        requesterCpf: payload.requesterCpf ?? user?.cpf ?? null,
        sourceChatId: params.chatId,
        whatsAppConversationId: params.whatsAppConversationId ?? null,
      });

      await completeSession(params.chatId, params.userId);

      return {
        handled: true,
        reply: [
          `Chamado de suporte #${ticket.displayNumber} registrado.`,
          '',
          'Encaminhei para a Central de Atendimentos — a equipe vai analisar e retornar.',
          'Se precisar de resposta imediata, use o WhatsApp (Falar com atendente) ou aguarde contato.',
        ].join('\n'),
      };
    }

    return { handled: false, reply: '' };
  }
}

export const gennecySupportFlowService = new GennecySupportFlowService();
