import { ChatType, UserRole } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/passwordHash';
import { KanbanService } from './KanbanService';
import { buildFuelOpenRequestsStatusMessage } from '../lib/fuelRefuelChatNotify';
import {
  gennecyFuelFlowService,
  GENNECY_FUEL_MENU_MESSAGE,
  isGennecyFuelMenuMessage,
  messageHasFuelIntent,
  messageStartsFuelMenu,
  shouldShowGennecyFuelMenu,
} from './GennecyFuelFlowService';
import {
  gennecySupportFlowService,
  messageHasSupportIntent,
  messageStartsSupportMenu,
} from './GennecySupportFlowService';
import {
  gennecyFuelRefuelReportFlowService,
  messageHasFuelRefuelReportIntent,
} from './GennecyFuelRefuelReportFlowService';

const kanbanService = new KanbanService();

const GENNECY_MENTION = /@gennecy\b/i;
/** Pedido explícito de criar card no Tasks — não dispara com perguntas gerais. */
const TASK_INTENT =
  /\b(criar|crie|cria|gerar|nova|adicionar|abrir|registrar)\b[\s\S]{0,80}?\b(task|tarefa|card|cart[aã]o)\b/i;

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

const GENNECY_BOT_EMAIL =
  (process.env.GENNECY_BOT_EMAIL || 'gennecy-bot@gennesis.internal').trim().toLowerCase();
const GENNECY_BOT_CPF = (process.env.GENNECY_BOT_CPF || '00000000099').replace(/\D/g, '');

let cachedGennecyBotUserId: string | null = null;

function getGennecyBotAvatarUrl(): string {
  const custom = process.env.GENNECY_BOT_AVATAR_URL?.trim();
  if (custom) return custom;
  const fe = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
  return `${fe}/Logo%20-%20Luna.png`;
}

/** Conta virtual da Gennecy — mensagens aparecem como participante (bolha lateral), não no centro. */
async function getOrCreateGennecyBotUserId(): Promise<string> {
  const avatarUrl = getGennecyBotAvatarUrl();
  if (cachedGennecyBotUserId) {
    const ok = await prisma.user.findUnique({
      where: { id: cachedGennecyBotUserId },
      select: { id: true },
    });
    if (ok) return ok.id;
    cachedGennecyBotUserId = null;
  }

  const existing = await prisma.user.findUnique({
    where: { email: GENNECY_BOT_EMAIL },
    select: { id: true, profilePhotoUrl: true },
  });
  if (existing) {
    if (existing.profilePhotoUrl !== avatarUrl) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { profilePhotoUrl: avatarUrl },
      });
    }
    cachedGennecyBotUserId = existing.id;
    return existing.id;
  }

  const passwordHash = await hashPassword(
    `gennecy-bot-${process.env.JWT_SECRET || 'local'}`,
    10,
  );

  const created = await prisma.user.create({
    data: {
      email: GENNECY_BOT_EMAIL,
      password: passwordHash,
      name: 'Gennecy',
      cpf: GENNECY_BOT_CPF.padStart(11, '0').slice(0, 11),
      role: UserRole.EMPLOYEE,
      isActive: true,
      isFirstLogin: false,
      profilePhotoUrl: avatarUrl,
    },
    select: { id: true },
  });

  cachedGennecyBotUserId = created.id;
  return created.id;
}

export type GennecyTaskIntent = {
  action: 'create_task' | 'help' | 'none';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  endDate: string | null;
  checklistItems: string[];
  replyToUser: string;
};

export type GennecyInvokeMode = 'task' | 'chat' | null;

function isEnabled(): boolean {
  const flag = String(process.env.GENNECY_ANTHROPIC_ENABLED ?? '').trim();
  if (flag === '0' || flag.toLowerCase() === 'false') return false;
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

function stripMention(content: string): string {
  return content.replace(GENNECY_MENTION, '').replace(/\s+/g, ' ').trim();
}

export function messageMentionsGennecy(content: string): boolean {
  return GENNECY_MENTION.test(content);
}

/** Só true quando o usuário pede explicitamente para criar task/tarefa/card. */
export function hasExplicitCreateTaskIntent(body: string): boolean {
  const text = body.trim();
  if (!text) return false;
  return TASK_INTENT.test(text);
}

/** Dispara a Gennecy (resposta ou task) — qualquer menção com texto após @Gennecy. */
export function messageShouldInvokeGennecy(content: string): boolean {
  if (!messageMentionsGennecy(content)) return false;
  return stripMention(content).length > 0;
}

export function getGennecyInvokeMode(content: string): GennecyInvokeMode {
  if (!messageShouldInvokeGennecy(content)) return null;
  const body = stripMention(content);
  return hasExplicitCreateTaskIntent(body) ? 'task' : 'chat';
}

/** DM 1:1 com a conta bot — não exige @Gennecy em cada mensagem. */
export async function isDirectChatWithGennecyBot(
  chatId: string,
  senderId: string,
): Promise<boolean> {
  const botId = await getOrCreateGennecyBotUserId();
  const chat = await prisma.chat.findFirst({
    where: {
      id: chatId,
      chatType: ChatType.DIRECT,
      OR: [
        { initiatorId: botId, recipientId: senderId },
        { initiatorId: senderId, recipientId: botId },
      ],
    },
    select: { id: true },
  });
  return Boolean(chat);
}

export async function resolveGennecyInvokeMode(
  chatId: string,
  senderId: string,
  content: string,
  options?: { hasAttachments?: boolean },
): Promise<GennecyInvokeMode> {
  const fromMention = getGennecyInvokeMode(content);
  if (fromMention) return fromMention;
  if (!(await isDirectChatWithGennecyBot(chatId, senderId))) return null;
  const body = content.trim();
  const hasAttachments = Boolean(options?.hasAttachments);
  if (!body && !hasAttachments) return null;
  if (hasExplicitCreateTaskIntent(body)) return 'task';
  return 'chat';
}

export async function shouldProcessGennecyMessage(
  chatId: string,
  senderId: string,
  content: string,
  options?: { hasAttachments?: boolean },
): Promise<boolean> {
  if (messageShouldInvokeGennecy(content)) return true;
  const inDm = await isDirectChatWithGennecyBot(chatId, senderId);
  if (!inDm) return false;
  if (content.trim().length > 0 || options?.hasAttachments) return true;
  if (await gennecyFuelFlowService.hasActiveFlow(chatId, senderId)) return true;
  if (await gennecyFuelRefuelReportFlowService.hasActiveFlow(chatId, senderId)) return true;
  if (await gennecySupportFlowService.hasActiveFlow(chatId, senderId)) return true;
  return false;
}

/** @deprecated Use getGennecyInvokeMode — mantido para compatibilidade. */
export function messageMayCreateTask(content: string): boolean {
  return getGennecyInvokeMode(content) === 'task';
}

function brDateToIso(day: string, month: string, year: string): string | null {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10);
  let y = parseInt(year, 10);
  if (Number.isNaN(d) || Number.isNaN(m) || Number.isNaN(y)) return null;
  if (y < 100) y += 2000;
  if (d < 1 || d > 31 || m < 1 || m > 12) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function formatBrDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Extrai título, prazo, prioridade e checklist do texto em português (fallback e reforço da IA). */
export function parseTaskBodyLocally(body: string, requesterName: string): GennecyTaskIntent {
  let work = body.trim();

  work = work
    .replace(
      /^(?:por favor\s+)?(?:criar|crie|gerar|nova|adicionar|abrir|registrar)\s+(?:uma?\s+)?(?:task|tarefa|card|cart[aã]o)\s*/i,
      '',
    )
    .replace(/^(?:sobre|para|de)\s+/i, '')
    .trim();

  let checklistItems: string[] = [];
  const subMatch = work.match(/,?\s*subtarefas?\s*:?\s*(.+)$/i);
  if (subMatch) {
    checklistItems = subMatch[1]
      .split(/,(?=\s*\S)|(?:\s+;\s+)|(?:\s+e\s+)/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s.length < 200)
      .slice(0, 15);
    work = work.slice(0, subMatch.index).trim().replace(/,?\s*$/, '');
  }

  let endDate: string | null = null;
  const datePatterns = [
    /\b(?:prazo\s+)?(?:até|ate|para|vencimento|deadline)\s+(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/i,
    /\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\b/,
    /\b(\d{4})-(\d{2})-(\d{2})\b/,
  ];
  for (const re of datePatterns) {
    const m = work.match(re);
    if (!m) continue;
    if (m[1].length === 4) {
      endDate = `${m[1]}-${m[2]}-${m[3]}`;
    } else {
      endDate = brDateToIso(m[1], m[2], m[3]);
    }
    if (endDate) {
      work = work.replace(m[0], '').replace(/,?\s*$/, '').trim();
      break;
    }
  }

  let priority: GennecyTaskIntent['priority'] = 'medium';
  if (/\b(critical|cr[ií]tico|bloqueante)\b/i.test(body)) priority = 'critical';
  else if (/\b(urgente|urgência|alta prioridade|prioridade alta|asap)\b/i.test(body)) priority = 'high';
  else if (/\b(baixa|low|sem pressa)\b/i.test(body)) priority = 'low';

  work = work
    .replace(/,?\s*urgente\b/gi, '')
    .replace(/,?\s*prazo\s+(?:até|ate)\s+[^,]+/gi, '')
    .replace(/,+\s*/g, ', ')
    .replace(/^,\s*|,\s*$/g, '')
    .trim();

  const titleRaw = work.split(',')[0]?.trim() || work || 'Nova tarefa do chat';
  const title = titleRaw.length > 120 ? `${titleRaw.slice(0, 117)}…` : titleRaw;

  const descriptionParts = [
    `Solicitado por ${requesterName} via chat (@Gennecy).`,
    '',
    work || body,
  ];
  if (endDate) descriptionParts.push('', `Prazo: ${formatBrDate(endDate)}`);
  if (checklistItems.length) {
    descriptionParts.push('', 'Subtarefas:', ...checklistItems.map((i) => `• ${i}`));
  }

  const prioLabel =
    priority === 'high' ? 'alta' : priority === 'critical' ? 'crítica' : priority === 'low' ? 'baixa' : 'média';

  return {
    action: 'create_task',
    title,
    description: descriptionParts.join('\n'),
    priority,
    endDate,
    checklistItems,
    replyToUser: `Criei o card «${title}» (prioridade ${prioLabel}${endDate ? `, prazo ${formatBrDate(endDate)}` : ''}${checklistItems.length ? `, ${checklistItems.length} subtarefa(s)` : ''}).`,
  };
}

function mergeWithLocalParse(ai: GennecyTaskIntent, body: string, requesterName: string): GennecyTaskIntent {
  const local = parseTaskBodyLocally(body, requesterName);
  if (ai.action !== 'create_task') return ai;

  const titleLooksRaw =
    ai.title.length > 80 ||
    /subtarefas?|prazo\s+até|urgente,/i.test(ai.title) ||
    ai.title === body.trim();

  return {
    ...ai,
    title: titleLooksRaw ? local.title : ai.title,
    description:
      ai.description.length > 40 && !ai.description.includes('Solicitado por')
        ? ai.description
        : local.description,
    priority: ai.priority === 'medium' && local.priority !== 'medium' ? local.priority : ai.priority,
    endDate: ai.endDate ?? local.endDate,
    checklistItems:
      ai.checklistItems.length > 0 ? ai.checklistItems : local.checklistItems,
    replyToUser: ai.replyToUser || local.replyToUser,
  };
}

function parseIntentJson(text: string): GennecyTaskIntent | null {
  let raw = text.trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const action = parsed.action;
    if (action !== 'create_task' && action !== 'help' && action !== 'none') return null;

    const priority = String(parsed.priority ?? 'medium').toLowerCase();
    const validPriority = ['low', 'medium', 'high', 'critical'].includes(priority)
      ? (priority as GennecyTaskIntent['priority'])
      : 'medium';

    let endDate: string | null = null;
    if (parsed.endDate && typeof parsed.endDate === 'string') {
      const iso = parsed.endDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        endDate = iso;
      } else {
        const br = iso.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
        if (br) endDate = brDateToIso(br[1], br[2], br[3]);
      }
    }

    const checklistItems = Array.isArray(parsed.checklistItems)
      ? parsed.checklistItems.map((x) => String(x).trim()).filter(Boolean).slice(0, 15)
      : [];

    return {
      action,
      title: String(parsed.title ?? '').trim().slice(0, 200) || 'Nova tarefa',
      description: String(parsed.description ?? '').trim().slice(0, 8000),
      priority: validPriority,
      endDate,
      checklistItems,
      replyToUser: String(parsed.replyToUser ?? '').trim().slice(0, 500) || 'Pronto!',
    };
  } catch {
    return null;
  }
}

async function callClaude(params: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const model =
    process.env.GENNECY_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: params.maxTokens,
      system: params.system,
      messages: [{ role: 'user', content: params.user }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[Gennecy] Claude API error', res.status, errText.slice(0, 400));
    return null;
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return data.content?.find((c) => c.type === 'text')?.text?.trim() ?? null;
}

async function extractIntentWithClaude(
  body: string,
  requesterName: string,
  todayIso: string,
): Promise<GennecyTaskIntent | null> {
  const system = `Você é a Gennecy, assistente da Gennesis Engenharia integrada ao chat interno.
Analise o pedido do usuário e responda APENAS com um JSON válido (sem markdown), no formato:
{
  "action": "create_task" | "help" | "none",
  "title": "título curto do card no Kanban",
  "description": "descrição clara em português com contexto e próximos passos",
  "priority": "low" | "medium" | "high" | "critical",
  "endDate": "YYYY-MM-DD" ou null,
  "checklistItems": ["subtarefa 1", "subtarefa 2"],
  "replyToUser": "mensagem curta confirmando o que fez"
}
Regras:
- action=create_task SOMENTE se o usuário pedir explicitamente criar task/tarefa/card (ex.: "criar task sobre...", "nova tarefa para...").
- Perguntas gerais, cálculos, curiosidades → action=none (não crie task).
- action=help só se pedirem ajuda sobre como usar @Gennecy para tasks.
- Título: só o assunto principal (máx. 80 caracteres).
- Datas em português (30/06/2026) → endDate em ISO (2026-06-30). Hoje: ${todayIso}.
- "urgente" → priority high; "crítico" → critical.
- checklistItems: itens após "subtarefas:" separados por vírgula.`;

  const userPrompt = `Usuário: ${requesterName}
Pedido: ${body}`;

  const text = await callClaude({ system, user: userPrompt, maxTokens: 1200 });
  if (!text) return null;
  return parseIntentJson(text);
}

async function answerGeneralChat(body: string, requesterName: string): Promise<string> {
  if (!isEnabled()) {
    return (
      'Olá! Sou a Gennecy. Posso responder perguntas quando a IA estiver ativa (ANTHROPIC_API_KEY). ' +
      'Para criar um card no Tasks, use por exemplo: «@Gennecy criar task sobre integração com calendário, urgente, prazo até 30/06/2026».'
    );
  }

  const system = `Você é a Gennecy, assistente virtual da Gennesis Engenharia no chat interno da empresa.
Responda em português, de forma clara, amigável e objetiva — como uma IA de atendimento.
Você pode:
- Responder perguntas gerais (matemática, dúvidas, orientações).
- Explicar que cards no Tasks são criados só quando o usuário pedir explicitamente, por exemplo: "@Gennecy criar task sobre ...".
Não invente dados internos da empresa (salários, senhas, contratos específicos). Se não souber, diga honestamente.
Mantenha respostas curtas (até ~3 parágrafos), salvo se pedirem mais detalhes.
Não use markdown pesado; pode usar listas simples se ajudar.`;

  const userPrompt = `${requesterName} perguntou: ${body}`;

  const reply = await callClaude({ system, user: userPrompt, maxTokens: 800 });
  if (!reply) {
    return 'Não consegui processar agora. Tente de novo em instantes.';
  }
  return reply.slice(0, 4000);
}

export class GennecyChatAssistantService {
  async resolveTaskIntent(content: string, requesterName: string): Promise<GennecyTaskIntent> {
    const body = stripMention(content);
    if (!body) {
      return {
        action: 'help',
        title: '',
        description: '',
        priority: 'medium',
        endDate: null,
        checklistItems: [],
        replyToUser:
          'Olá! Para criar um card no Tasks: «@Gennecy criar task sobre …, urgente, prazo até 30/06/2026, subtarefas: API, testes». ' +
          'Para outras perguntas, é só mencionar @Gennecy e perguntar.',
      };
    }

    if (!hasExplicitCreateTaskIntent(body)) {
      return {
        action: 'none',
        title: '',
        description: '',
        priority: 'medium',
        endDate: null,
        checklistItems: [],
        replyToUser: '',
      };
    }

    const today = new Date().toISOString().slice(0, 10);
    const local = parseTaskBodyLocally(body, requesterName);

    if (isEnabled()) {
      const fromAi = await extractIntentWithClaude(body, requesterName, today);
      if (fromAi && fromAi.action === 'create_task') {
        return mergeWithLocalParse(fromAi, body, requesterName);
      }
      if (fromAi && fromAi.action === 'help') return fromAi;
      if (fromAi && fromAi.action === 'none') {
        return local;
      }
    }

    return local;
  }

  async postGennecyReply(chatId: string, _actorUserId: string, text: string) {
    const senderId = await getOrCreateGennecyBotUserId();
    const msg = await prisma.message.create({
      data: {
        chatId,
        senderId,
        content: text.trim(),
        isSystem: false,
        isRead: false,
      },
      select: { id: true },
    });
    await prisma.chat.update({
      where: { id: chatId },
      data: { lastMessageAt: new Date() },
    });
    return msg;
  }

  private async assertCanProcessInChat(chatId: string, senderId: string): Promise<boolean> {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { id: true, chatType: true },
    });
    if (
      !chat ||
      (chat.chatType !== ChatType.DIRECT &&
        chat.chatType !== ChatType.GROUP &&
        chat.chatType !== ChatType.GROUP_CALL)
    ) {
      return false;
    }

    if (chat.chatType === ChatType.DIRECT) {
      const ok = await prisma.chat.findFirst({
        where: {
          id: chatId,
          OR: [{ initiatorId: senderId }, { recipientId: senderId }],
        },
        select: { id: true },
      });
      return Boolean(ok);
    }

    const participant = await prisma.chatParticipant.findUnique({
      where: { chatId_userId: { chatId, userId: senderId } },
    });
    return Boolean(participant);
  }

  private async handleCreateTask(
    chatId: string,
    senderId: string,
    content: string,
    requesterName: string,
  ): Promise<void> {
    const intent = await this.resolveTaskIntent(content, requesterName);

    if (intent.action === 'help') {
      await this.postGennecyReply(chatId, senderId, intent.replyToUser);
      return;
    }

    if (intent.action !== 'create_task') {
      await this.postGennecyReply(
        chatId,
        senderId,
        'Para criar um card no Tasks, use: @Gennecy criar task sobre … (com prazo, prioridade ou subtarefas se quiser).',
      );
      return;
    }

    await kanbanService.createTaskFromChatAssistant(senderId, {
      title: intent.title,
      description: intent.description,
      priority: intent.priority,
      endDate: intent.endDate,
      checklistItems: intent.checklistItems,
      sourceChatId: chatId,
    });

    await this.postGennecyReply(chatId, senderId, intent.replyToUser);
  }

  private async handleGeneralChat(
    chatId: string,
    senderId: string,
    content: string,
    requesterName: string,
  ): Promise<void> {
    const body = stripMention(content);
    const reply = await answerGeneralChat(body, requesterName);
    await this.postGennecyReply(chatId, senderId, reply);
  }

  async processOutgoingMessage(params: {
    chatId: string;
    senderId: string;
    content: string;
    messageId?: string;
    hasAttachments?: boolean;
  }): Promise<void> {
    if (
      !(await shouldProcessGennecyMessage(params.chatId, params.senderId, params.content, {
        hasAttachments: params.hasAttachments,
      }))
    ) {
      return;
    }

    if (!(await this.assertCanProcessInChat(params.chatId, params.senderId))) return;

    const user = await prisma.user.findUnique({
      where: { id: params.senderId },
      select: { name: true },
    });
    const requesterName = user?.name?.trim() || 'Colaborador';

    const body = messageMentionsGennecy(params.content)
      ? stripMention(params.content)
      : params.content.trim();
    const isTask = hasExplicitCreateTaskIntent(body);
    const inGennecyDm = await isDirectChatWithGennecyBot(params.chatId, params.senderId);

    try {
      const supportActive = await gennecySupportFlowService.hasActiveFlow(
        params.chatId,
        params.senderId,
      );
      const supportTrigger =
        supportActive ||
        messageStartsSupportMenu(body) ||
        (inGennecyDm && messageHasSupportIntent(body));

      if (supportTrigger) {
        const supportResult = await gennecySupportFlowService.processMessage({
          chatId: params.chatId,
          userId: params.senderId,
          content: body || '(anexo)',
          requesterName: requesterName,
        });
        if (supportResult.handled) {
          await this.postGennecyReply(params.chatId, params.senderId, supportResult.reply);
          return;
        }
      }

      const reportActive = await gennecyFuelRefuelReportFlowService.hasActiveFlow(
        params.chatId,
        params.senderId,
      );
      const fuelActive = await gennecyFuelFlowService.hasActiveFlow(params.chatId, params.senderId);

      if (reportActive || messageHasFuelRefuelReportIntent(body)) {
        const reportResult = await gennecyFuelRefuelReportFlowService.processMessage({
          chatId: params.chatId,
          userId: params.senderId,
          content: body || '(anexo)',
          messageId: params.messageId,
        });
        if (reportResult.handled) {
          await this.postGennecyReply(params.chatId, params.senderId, reportResult.reply);
          return;
        }
      }

      if (
        inGennecyDm ||
        messageHasFuelIntent(body) ||
        messageStartsFuelMenu(body) ||
        fuelActive
      ) {
        const fuelResult = await gennecyFuelFlowService.processMessage({
          chatId: params.chatId,
          userId: params.senderId,
          content: body || '(anexo)',
          messageId: params.messageId,
        });
        if (fuelResult.handled) {
          await this.postGennecyReply(params.chatId, params.senderId, fuelResult.reply);
          return;
        }

        if (inGennecyDm && !body && !params.hasAttachments && !fuelActive && !reportActive) {
          const statusLine = await buildFuelOpenRequestsStatusMessage(params.senderId);
          const menu = statusLine
            ? `${statusLine}\n\n${GENNECY_FUEL_MENU_MESSAGE}`
            : GENNECY_FUEL_MENU_MESSAGE;
          await this.postGennecyReply(params.chatId, params.senderId, menu);
          return;
        }
      }

      if (inGennecyDm && !isTask && shouldShowGennecyFuelMenu(body)) {
        const statusLine = await buildFuelOpenRequestsStatusMessage(params.senderId);
        const menu = statusLine
          ? `${statusLine}\n\n${GENNECY_FUEL_MENU_MESSAGE}`
          : GENNECY_FUEL_MENU_MESSAGE;
        await this.postGennecyReply(params.chatId, params.senderId, menu);
        return;
      }

      if (isTask) {
        await this.handleCreateTask(
          params.chatId,
          params.senderId,
          params.content,
          requesterName,
        );
      } else {
        await this.handleGeneralChat(
          params.chatId,
          params.senderId,
          params.content,
          requesterName,
        );
      }
    } catch (err) {
      console.error('[Gennecy] processOutgoingMessage', err);
      const msg =
        err instanceof Error ? err.message : 'Não foi possível responder agora.';
      await this.postGennecyReply(
        params.chatId,
        params.senderId,
        isTask ? `Não consegui criar o card: ${msg}` : `Desculpe, tive um problema: ${msg}`,
      );
    }
  }
}

export const gennecyChatAssistant = new GennecyChatAssistantService();

/** ID da conta bot — para abrir DM com a Gennecy no chat interno. */
export async function getGennecyBotUserId(): Promise<string> {
  return getOrCreateGennecyBotUserId();
}
