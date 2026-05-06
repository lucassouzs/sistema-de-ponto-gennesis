import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { metaWhatsApp } from './MetaWhatsAppService';

type FlowStatus =
  | 'MENU'
  | 'FAQ_TOPIC_SELECT'
  | 'FAQ_QUESTION_SELECT'
  | 'ATESTADO_ASK_REQUESTER_NAME'
  | 'ATESTADO_ASK_START_DATE'
  | 'ATESTADO_ASK_END_DATE'
  | 'ATESTADO_ASK_DAYS'
  | 'ATESTADO_ASK_FILE'
  | 'ATESTADO_COMPLETE'
  | 'ATENDANT_ASK_NAME';

type FaqItem = { id: string; question: string; answer: string; label?: string };
type FaqTopic = { id: string; title: string; items: FaqItem[]; label?: string };

const FAQ_TOPICS: FaqTopic[] = [
  {
    id: 'PONTO_JORNADA',
    title: 'Dúvidas sobre ponto e jornada',
    label: 'Ponto e Jornada',
    items: [
      {
        id: 'COMO_REGISTRAR',
        question: 'Como registrar meu ponto?',
        label: 'Como registrar ponto',
        answer:
          'Você deve registrar seu ponto diariamente com as quatro batidas obrigatórias (entrada, saída para almoço, retorno do almoço e saída final) pelo aplicativo Quark.\n\nLogin: CPF (sem pontos e traços) + @eng.com.br\nSenha padrão: Gennesis123*.'
      },
      {
        id: 'ESQUECI_BATER',
        question: 'Esqueci de bater o ponto, o que fazer?',
        label: 'Esqueci de bater ponto',
        answer:
          'Informe imediatamente seu gestor e solicite a regularização junto ao Departamento Pessoal (DP), para que o ajuste seja realizado corretamente no sistema.'
      },
      {
        id: 'FORA_HORARIO',
        question: 'Posso bater ponto fora do horário?',
        label: 'Ponto fora do horário',
        answer:
          'O registro fora do horário padrão só deve ser realizado mediante autorização prévia do gestor, alinhado com a jornada e as atividades do dia.'
      },
      {
        id: 'HORA_EXTRA',
        question: 'Posso fazer horas extras?',
        label: 'Horas extras',
        answer: 'A realização de horas extras só é permitida com autorização do Gestor e Diretoria.'
      }
    ]
  },
  {
    id: 'SALARIO_PAGAMENTOS',
    title: 'Dúvidas sobre salário e pagamentos',
    label: 'Salário e Pagamentos',
    items: [
      {
        id: 'DATA_PAGAMENTO',
        question: 'Qual a data de pagamento?',
        label: 'Data de pagamento',
        answer: 'Até o 5º dia útil de cada mês.'
      },
      {
        id: 'CONTRACHEQUE',
        question: 'Onde vejo meu contracheque?',
        label: 'Ver contracheque',
        answer: 'Disponível no sistema/app Quark.'
      },
      {
        id: 'DESCONTO_SALARIO',
        question: 'Tive desconto no salário, por quê?',
        label: 'Desconto no salário',
        answer: 'Pode ser por faltas, atrasos ou benefícios.'
      },
      {
        id: 'SALARIO_NAO_CAIU',
        question: 'O salário do meu colega já caiu e o meu ainda não, o que aconteceu?',
        label: 'Salário ainda não caiu',
        answer: 'Aguarde até o fim do dia, pois o financeiro ainda está realizando os pagamentos.'
      }
    ]
  },
  {
    id: 'FERIAS',
    title: 'Dúvidas sobre férias',
    label: 'Férias',
    items: [
      {
        id: 'QUANDO_TIRAR',
        question: 'Quando posso tirar férias?',
        label: 'Quando tirar férias',
        answer: 'Após 12 meses de trabalho (período aquisitivo).'
      },
      {
        id: 'QUANTOS_DIAS',
        question: 'Quantos dias posso tirar?',
        label: 'Quantos dias tirar',
        answer: 'Até 30 dias corridos (pode variar por faltas injustificadas).'
      },
      {
        id: 'DIVIDIR',
        question: 'Posso dividir minhas férias?',
        label: 'Dividir férias',
        answer: 'Sim. Em até 3 períodos: um com no mínimo 14 dias e os demais com pelo menos 5 dias cada.'
      },
      {
        id: 'QUEM_DEFINE',
        question: 'Quem define o período?',
        label: 'Quem define o período',
        answer: 'A empresa define, alinhando sempre que possível com o colaborador.'
      },
      {
        id: 'VENDER',
        question: 'Posso vender parte das férias?',
        label: 'Vender férias',
        answer: 'Sim. Até 10 dias podem ser convertidos em abono.'
      },
      {
        id: 'QUANDO_RECEBE',
        question: 'Quando recebo?',
        label: 'Quando recebo',
        answer: 'Até 2 dias antes do início das férias.'
      },
      {
        id: 'O_QUE_RECEBE',
        question: 'O que recebo no pagamento?',
        label: 'O que recebo',
        answer: 'Salário + adicional de 1/3.'
      },
      {
        id: 'INICIO_QUALQUER_DIA',
        question: 'Posso começar férias em qualquer dia?',
        label: 'Pode começar férias',
        answer: 'Não. Não podem iniciar nos dois dias que antecedem feriado ou DSR.'
      }
    ]
  },
  {
    id: 'ATESTADOS',
    title: 'Dúvidas sobre atestados',
    label: 'Atestados',
    items: [
      {
        id: 'COMO_ENTREGAR',
        question: 'Como entregar atestado?',
        label: 'Como entregar atestado',
        answer:
          'O atestado médico deve ser enviado ao responsável pelas alocações do seu contrato em até 48 horas após a emissão.\n\nAlém disso, o colaborador deve homologar o atestado na clínica Ambrac em até 24 horas após o término do afastamento.'
      },
      {
        id: 'QUANDO_INSS',
        question: 'Quando vai para o INSS?',
        label: 'Vai para o INSS',
        answer:
          'Quando o afastamento por saúde ultrapassa 15 dias consecutivos, o colaborador deve ser encaminhado ao INSS. A partir do 16º dia, acompanhamento e pagamento passam a ser responsabilidade do INSS.'
      },
      {
        id: 'QUEM_PAGA',
        question: 'Quem paga?',
        label: 'Quem paga',
        answer:
          'Nos primeiros 15 dias de afastamento, o pagamento do salário é da empresa. A partir do 16º dia, o pagamento passa a ser realizado pelo INSS, caso o benefício seja aprovado.'
      },
      {
        id: 'JA_DEI_ENTRADA_INSS',
        question: 'Já dei entrada no INSS, o que fazer agora?',
        label: 'Já deu entrada no INSS',
        answer: 'Enviar ao DP o protocolo de agendamento e aguardar o resultado da perícia.'
      },
      {
        id: 'ATESTADO_ACABOU',
        question: 'O atestado acabou, o que devo fazer agora?',
        label: 'Atestado acabou',
        answer: 'Se permanecer inapto, retorne ao médico e solicite novo atestado médico.'
      }
    ]
  },
  {
    id: 'BENEFICIOS',
    title: 'Dúvidas sobre benefícios',
    label: 'Benefícios',
    items: [
      {
        id: 'VT_PAGAMENTO',
        question: 'Quando é pago o vale-transporte?',
        label: 'Vale-transporte: quando',
        answer: 'É pago juntamente com a folha de pagamento, até o 5º dia útil do mês.'
      },
      {
        id: 'VA_PAGAMENTO',
        question: 'Quando é pago o vale-alimentação?',
        label: 'Vale-alimentação: quando',
        answer: 'O benefício é pago até o último dia do mês.'
      },
      {
        id: 'DESCONTO_VT',
        question: 'Quanto é o desconto do vale-transporte?',
        label: 'Desconto do VT',
        answer: 'Não há desconto no DF. No GO, o desconto é de 6% sobre o salário.'
      },
      {
        id: 'DESCONTO_VA',
        question: 'Quanto é o desconto do vale-alimentação?',
        label: 'Desconto do VA',
        answer: 'No DF, o desconto é de 9% sobre o saldo. No GO, não há desconto.'
      },
      {
        id: 'PERDI_CARTAO',
        question: 'Perdi o meu cartão Beevale, o que fazer?',
        label: 'Perdi o cartão Beevale',
        answer: 'No próprio aplicativo existe a opção de emitir a segunda via.'
      },
      {
        id: 'PRAZO_CARTAO',
        question: 'Qual o prazo para entrega do cartão Beevale?',
        label: 'Prazo do cartão Beevale',
        answer: 'De 7 a 15 dias.'
      }
    ]
  },
  {
    id: 'RESCISAO',
    title: 'Dúvidas sobre rescisão',
    label: 'Rescisão',
    items: [
      {
        id: 'PRAZO_PAGAMENTO',
        question: 'Qual o prazo de pagamento da rescisão?',
        label: 'Prazo de pagamento',
        answer: 'Até 10 dias.'
      }
    ]
  }
];

/** Delay curto (API oficial) — rápido sem parecer “instantâneo” */
const delayNatural = () =>
  new Promise((r) => setTimeout(r, 600 + Math.random() * 700));

/** Escolhe uma opção aleatória de um array */
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

type SendAction =
  | { type: 'text'; text: string }
  | { type: 'buttons'; body: string; buttons: Array<{ id: string; title: string }> }
  | {
      type: 'list';
      body: string;
      buttonText: string;
      sections: Array<{ title: string; rows: Array<{ id: string; title: string }> }>;
    };

export type MediaInfo = { mediaId: string; mimeType?: string; filename?: string };

export class WhatsAppBotService {
  /**
   * Timer em memória para encerrar conversas por inatividade.
   * Observação: se o processo do backend reiniciar, os timers pendentes se perdem.
   */
  private inactivityTimers = new Map<string, NodeJS.Timeout>();
  private inactivityTokens = new Map<string, string>();

  private reminderTimers = new Map<string, NodeJS.Timeout>();
  private reminderTokens = new Map<string, string>();

  private getReminderTimeoutMs(): number {
    const raw = process.env.WHATSAPP_BOT_REMINDER_TIMEOUT_MS;
    const parsed = raw ? Number(raw) : NaN;
    // Default: 5 minutos
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 5 * 60 * 1000;
  }

  private getIdleTimeoutMs(): number {
    const raw = process.env.WHATSAPP_BOT_END_TIMEOUT_MS || process.env.WHATSAPP_BOT_IDLE_TIMEOUT_MS;
    const parsed = raw ? Number(raw) : NaN;
    // Default: 10 minutos (5 min para lembrete + 5 min após o lembrete)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10 * 60 * 1000;
  }

  private clearInactivityTimeout(conversationId: string) {
    const t = this.inactivityTimers.get(conversationId);
    if (t) clearTimeout(t);
    this.inactivityTimers.delete(conversationId);
    this.inactivityTokens.delete(conversationId);

    const r = this.reminderTimers.get(conversationId);
    if (r) clearTimeout(r);
    this.reminderTimers.delete(conversationId);
    this.reminderTokens.delete(conversationId);
  }

  public clearInactivityTimeoutsForConversation(conversationId: string) {
    // Usado pelo admin ao encerrar manualmente uma conversa.
    this.clearInactivityTimeout(conversationId);
  }

  private clearReminderTimeout(conversationId: string) {
    const r = this.reminderTimers.get(conversationId);
    if (r) clearTimeout(r);
    this.reminderTimers.delete(conversationId);
    this.reminderTokens.delete(conversationId);
  }

  private async handleInactivityTimeout(conversationId: string, phone: string, token: string) {
    // Garante que não é um timer antigo (race condition).
    if (this.inactivityTokens.get(conversationId) !== token) return;

    const endText = 'Atendimento encerrado 😊\nSempre que precisar, é só me chamar por aqui!';

    try {
      // Verificações de segurança: se a conversa já foi encerrada/concluída, não fazemos nada.
      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { id: conversationId },
        select: { id: true, phone: true, status: true }
      });
      if (!conversation) return;

      const status = (conversation.status as 'PENDING' | 'COMPLETED' | 'CANCELLED' | null) ?? 'PENDING';
      if (status !== 'PENDING') return;

      const lastMessage = await prisma.whatsAppMessage.findFirst({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, role: true, content: true, createdAt: true }
      });

      // Só encerra se a última mensagem registrada for do assistente (significa que a pessoa não respondeu).
      if (!lastMessage || lastMessage.role !== 'assistant') return;

      // Encerrar: volta para MENU, limpa payload e marca como CANCELLED.
      await prisma.whatsAppConversation.update({
        where: { id: conversationId },
        data: {
          flowStatus: 'MENU',
          currentStep: 'MENU',
          payload: {} as Prisma.InputJsonValue,
          status: 'CANCELLED' as any,
          updatedAt: new Date()
        } as any
      });

      await prisma.whatsAppMessage.create({
        data: {
          conversationId,
          role: 'assistant',
          content: endText
        }
      });

      // Dispara a mensagem para o WhatsApp.
      await metaWhatsApp.sendText(phone || conversation.phone, endText);
    } finally {
      // Remove o token/timer apenas se ainda for o mesmo agendamento.
      if (this.inactivityTokens.get(conversationId) === token) {
        this.clearInactivityTimeout(conversationId);
      }
    }
  }

  private async handleReminderTimeout(conversationId: string, phone: string, token: string) {
    // Garante que não é um timer antigo (race condition).
    if (this.reminderTokens.get(conversationId) !== token) return;

    const reminderText =
      'Oi! Vou continuar por aqui 😊\nSe quiser seguir, me responda por favor. Caso não responda, encerro o atendimento mais tarde.';

    try {
      const conversation = await prisma.whatsAppConversation.findUnique({
        where: { id: conversationId },
        select: { id: true, phone: true, status: true }
      });
      if (!conversation) return;

      const status = (conversation.status as 'PENDING' | 'COMPLETED' | 'CANCELLED' | null) ?? 'PENDING';
      if (status !== 'PENDING') return;

      const lastMessage = await prisma.whatsAppMessage.findFirst({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, role: true }
      });

      // Só manda lembrete se a última mensagem registrada for do assistente (a pessoa não respondeu).
      if (!lastMessage || lastMessage.role !== 'assistant') return;

      await prisma.whatsAppMessage.create({
        data: {
          conversationId,
          role: 'assistant',
          content: reminderText
        }
      });

      await metaWhatsApp.sendText(phone || conversation.phone, reminderText);
    } finally {
      // Remove token/timer do lembrete apenas se ainda for o mesmo agendamento.
      if (this.reminderTokens.get(conversationId) === token) {
        this.clearReminderTimeout(conversationId);
      }
    }
  }

  /**
   * Agendamento externo (ex.: mensagem manual do admin).
   * O timer só dispara se a conversa continuar em PENDING e sem resposta do usuário.
   */
  public scheduleInactivityTimeoutForConversation(conversationId: string, phone: string) {
    const reminderMs = this.getReminderTimeoutMs();
    const endMs = this.getIdleTimeoutMs();

    if (!endMs || endMs <= 0) return;
    if (!reminderMs || reminderMs <= 0) return;
    if (reminderMs >= endMs) return;

    this.clearInactivityTimeout(conversationId);

    const reminderToken = `${Date.now()}-rem-${Math.random().toString(16).slice(2)}`;
    const endToken = `${Date.now()}-end-${Math.random().toString(16).slice(2)}`;

    this.reminderTokens.set(conversationId, reminderToken);
    this.inactivityTokens.set(conversationId, endToken);

    const reminderTimer = setTimeout(() => {
      this.handleReminderTimeout(conversationId, phone, reminderToken).catch((err) => {
        console.error('[WhatsAppBotService] Erro no idle reminder timeout:', err);
      });
    }, reminderMs);
    this.reminderTimers.set(conversationId, reminderTimer);

    const endTimer = setTimeout(() => {
      this.handleInactivityTimeout(conversationId, phone, endToken).catch((err) => {
        console.error('[WhatsAppBotService] Erro no idle end timeout:', err);
      });
    }, endMs);
    this.inactivityTimers.set(conversationId, endTimer);
  }

  async processMessage(
    phone: string,
    text: string,
    hasMedia = false,
    mediaInfo?: MediaInfo,
    opts?: { whatsappProfileName?: string }
  ): Promise<void> {
    let conversation = await prisma.whatsAppConversation.findFirst({
      where: { phone },
      orderBy: { updatedAt: 'desc' }
    });

    if (!conversation) {
      conversation = await prisma.whatsAppConversation.create({
        data: {
          phone,
          flowStatus: 'MENU',
          payload: {}
        }
      });
    }

    // A pessoa acabou de responder (chegou webhook): cancela qualquer timer anterior.
    this.clearInactivityTimeout(conversation.id);

    const textRaw = (text || '').trim();
    const content = textRaw.toLowerCase();
    const flowStatusBefore = (conversation.flowStatus || 'MENU') as FlowStatus;

    const isFaqStart = () =>
      content === '2' ||
      content.includes('duvida') ||
      content.includes('dúvida') ||
      content.includes('duvidas') ||
      content.includes('dúvidas');

    const payload = (conversation.payload as Record<string, unknown>) || {};
    const flowStatus = (conversation.flowStatus || 'MENU') as FlowStatus;
    const normalizedFlowStatus = (String(flowStatus).startsWith('ATESTADO') ? 'MENU' : flowStatus) as FlowStatus;

    // Baixar e salvar mídia (S3 ou local)
    let savedMedia: { fileUrl: string; fileName: string; fileKey?: string } | null = null;
    if (hasMedia && mediaInfo?.mediaId) {
      const result = await metaWhatsApp.downloadAndSaveMedia(
        mediaInfo.mediaId,
        conversation.id,
        mediaInfo.mimeType,
        mediaInfo.filename
      );
      if (result) {
        savedMedia = {
          fileUrl: result.fileUrl || '',
          fileName: result.fileName,
          fileKey: result.fileKey
        };
      }
    }

    // Salvar mensagem do usuário
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: hasMedia ? '[Arquivo enviado]' : (text || '[sem texto]'),
        mediaUrl: savedMedia?.fileUrl || undefined,
        mediaKey: savedMedia?.fileKey,
        fileName: savedMedia?.fileName
      }
    });

    let sendAction: SendAction = { type: 'text', text: '' };
    let newStatus = flowStatus;
    type ConversationStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';
    let newConversationStatus: ConversationStatus = ((conversation as any).status as ConversationStatus) || 'PENDING';
    const newPayload = { ...payload };

    if (opts?.whatsappProfileName?.trim()) {
      (newPayload as any).waProfileName = opts.whatsappProfileName.trim().slice(0, 120);
    }

    const isEndRequest = () =>
      ['end', 'encerrar', 'sair', 'cancelar', 'parar', 'fim'].includes(content);

    const isAttendantRequest = () => ['atendente', 'atendimento', 'humano', 'falar'].includes(content);

    // Se o usuário pedir atendimento humano, não queremos que o idle timeout feche a conversa.
    let skipInactivityTimeout = false;

    // Se estava CANCELLED (por encerramento manual ou por inatividade), a próxima mensagem deve reativar.
    if (newConversationStatus === 'CANCELLED' && !isEndRequest()) {
      newConversationStatus = 'PENDING';
    }

    /**
     * Atendimento humano (ou fila após nome): não rodar o fluxo da Luna em cada mensagem —
     * senão o default do MENU cai em `menu()` e sorteia de novo "Oi! Tudo bem?...".
     * A mensagem do usuário já foi salva acima; só atualizamos updatedAt.
     */
    const pHand = newPayload as any;
    const inHumanHandover =
      pHand.attendantInProgress === true ||
      (pHand.attendantRequested === true && !!String(pHand.name || '').trim());

    if (inHumanHandover) {
      skipInactivityTimeout = true;
      await prisma.whatsAppConversation.update({
        where: { id: conversation.id },
        data: {
          updatedAt: new Date(),
          payload: newPayload as Prisma.InputJsonValue
        }
      });
      return;
    }

    const isMenuRequest = () => ['menu', 'voltar', 'inicio'].includes(content);

    const tryExtractNameFromText = (rawText: string): string | null => {
      const t = (rawText || '').trim();
      if (!t) return null;

      // Heurísticas simples para extrair nome quando a pessoa envia algo como:
      // "me chamo Lucas Ribeiro", "eu sou Lucas", "sou Lucas Ribeiro", etc.
      const regexes: RegExp[] = [
        /(?:me chamo|eu sou|sou|meu nome é|meu nome|nome é)\s+(.{3,80})/i,
      ];

      for (const r of regexes) {
        const m = t.match(r);
        if (!m?.[1]) continue;
        const candidate = String(m[1])
          .trim()
          .replace(/[\r\n]+/g, ' ')
          .split(/[!?.\n\r]/)[0]
          .replace(/^[^A-Za-zÀ-ÖØ-öø-ÿ]+/, '')
          .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ\s'.-]+/g, '')
          .trim();

        if (!candidate) continue;
        if (candidate.split(/\s+/).length < 2) continue;
        return candidate.slice(0, 60);
      }

      return null;
    };

    const menu = (): SendAction => ({
      type: 'list',
      body: pick([
        'Olá! 😊 Eu sou a Luna, assistente virtual da Gennesis.\nEstou por aqui pra te ajudar — como posso te atender hoje?',
        'Oi! Tudo bem? 😊\nSou a Luna, da Gennesis. Me conta como posso te ajudar!',
        'Olá! Seja bem-vindo(a) à Gennesis.\nEu sou a Luna, assistente virtual, e estou à disposição para ajudar no que precisar.'
      ]),
      buttonText: 'Escolher opção',
      sections: [
        {
          title: 'Atendimento',
          rows: [
            { id: 'ATESTADO', title: 'Enviar atestado' },
            { id: 'ATENDENTE', title: 'Falar com atendente' },
            { id: 'DUVIDAS', title: 'Dúvidas' },
            { id: 'END', title: 'Encerrar' }
          ]
        }
      ]
    });

    const faqTopicList = (): SendAction => ({
      type: 'list',
      body: 'Selecione o tema da sua dúvida:',
      buttonText: 'Escolher tema',
      sections: [
        {
          title: 'Tópicos',
          rows: FAQ_TOPICS.map((topic) => ({
            id: `FAQ_TOPIC_${topic.id}`,
        title: topic.label ?? topic.title
          }))
        }
      ]
    });

    const faqQuestionList = (topicId: string): SendAction => {
      const topic = FAQ_TOPICS.find((t) => t.id === topicId);
      if (!topic) return faqTopicList();

      return {
        type: 'list',
        body: `Tema: ${topic.title}\n\nEscolha uma pergunta:`,
        buttonText: 'Ver perguntas',
        sections: [
          {
            title: 'Perguntas',
            rows: topic.items.map((item) => ({
              id: `FAQ_Q_${topic.id}_${item.id}`,
          title: item.label ?? item.question
            }))
          }
        ]
      };
    };

    const faqTopicNotFound = (): SendAction => ({
      type: 'buttons',
      body: 'Não encontrei esse tópico. Quer tentar novamente?',
      buttons: [
        { id: 'DUVIDAS', title: 'Ver tópicos' },
        { id: 'ATENDENTE', title: 'Falar com atendente' },
        { id: 'MENU', title: 'Menu principal' },
        { id: 'END', title: 'Encerrar' }
      ]
    });

    const faqQuestionNotFound = (): SendAction => ({
      type: 'buttons',
      body: 'Não encontrei essa pergunta. Quer ver a lista novamente?',
      buttons: [
        { id: 'FAQ_PERGUNTAS', title: 'Ver perguntas' },
        { id: 'DUVIDAS', title: 'Trocar tópico' },
        { id: 'ATENDENTE', title: 'Falar com atendente' },
        { id: 'MENU', title: 'Menu' }
      ]
    });

    const askRequesterName = (): SendAction => ({
      type: 'buttons',
      body: 'Pode me informar seu nome completo?',
      buttons: [
        { id: 'MENU', title: 'Voltar' },
        { id: 'END', title: 'Encerrar' }
      ]
    });

    const parseDateInput = (
      value: string
    ): { date: Date; normalized: string } | null => {
      const v = (value || '').trim();
      if (!v) return null;

      // Formatos aceitos (local):
      // - dd/MM/yyyy ou dd-MM-yyyy
      // - yyyy-MM-dd ou yyyy-MM-ddTHH:mm:ss...
      const dmY = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmY) {
        const day = Number(dmY[1]);
        const month = Number(dmY[2]);
        const year = Number(dmY[3]);
        if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
        const date = new Date(year, month - 1, day, 0, 0, 0, 0);
        // Validação real (evita 31/02 virar mar/03)
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        const normalized = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
        return { date, normalized };
      }

      const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
      if (iso) {
        const year = Number(iso[1]);
        const month = Number(iso[2]);
        const day = Number(iso[3]);
        const date = new Date(year, month - 1, day, 0, 0, 0, 0);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        const normalized = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
        return { date, normalized };
      }

      return null;
    };

    const askDateByTyping = (kind: 'inicio' | 'fim'): SendAction => ({
      type: 'buttons',
      body: `Digite a data de ${kind} do atestado no formato *DD/MM/AAAA*.\nEx.: *01/03/2026*`,
      buttons: [
        { id: 'MENU', title: 'Voltar' },
        { id: 'END', title: 'Encerrar' }
      ]
    });

    const clearPayload = () => {
      Object.keys(newPayload).forEach((k) => delete (newPayload as any)[k]);
    };

    const endConversation = (): SendAction => {
      const nameKeep =
        typeof (newPayload as any).name === 'string' ? String((newPayload as any).name).trim().slice(0, 120) : '';
      const requesterKeep =
        typeof (newPayload as any).requesterName === 'string'
          ? String((newPayload as any).requesterName).trim().slice(0, 120)
          : '';
      const waKeep =
        typeof (newPayload as any).waProfileName === 'string'
          ? String((newPayload as any).waProfileName).trim().slice(0, 120)
          : '';
      clearPayload();
      if (nameKeep) (newPayload as any).name = nameKeep;
      if (requesterKeep) (newPayload as any).requesterName = requesterKeep;
      if (waKeep) (newPayload as any).waProfileName = waKeep;
      newStatus = 'MENU';
      newConversationStatus = 'CANCELLED';
      return {
        type: 'text',
        text: 'Atendimento encerrado 😊\nSempre que precisar, é só me chamar por aqui!'
      };
    };

    const finalizeConversation = (): SendAction => {
      // Finalizar a solicitação após o envio do arquivo.
      // Importante: não deve cancelar a submissão já concluída.
      const nameKeep =
        typeof (newPayload as any).name === 'string' ? String((newPayload as any).name).trim().slice(0, 120) : '';
      const requesterKeep =
        typeof (newPayload as any).requesterName === 'string'
          ? String((newPayload as any).requesterName).trim().slice(0, 120)
          : '';
      const waKeep =
        typeof (newPayload as any).waProfileName === 'string'
          ? String((newPayload as any).waProfileName).trim().slice(0, 120)
          : '';
      clearPayload();
      if (nameKeep) (newPayload as any).name = nameKeep;
      if (requesterKeep) (newPayload as any).requesterName = requesterKeep;
      if (waKeep) (newPayload as any).waProfileName = waKeep;
      newStatus = 'MENU';
      newConversationStatus = 'COMPLETED';
      return {
        type: 'text',
        text: 'Solicitação finalizada 😊\nSe precisar de algo mais, é só me chamar por aqui!'
      };
    };

    const resetToMenu = (): SendAction => {
      clearPayload();
      newStatus = 'MENU';
      if (newConversationStatus !== 'COMPLETED') newConversationStatus = 'PENDING';
      return menu();
    };

    const talkToAttendant = (): SendAction => {
      clearPayload();
      skipInactivityTimeout = true;
      // Indicador para o admin: essa conversa foi escalada para atendente humano.
      (newPayload as any).attendantRequested = true;
      (newPayload as any).attendantRequestedAt = new Date().toISOString();
      (newPayload as any).attendantInProgress = false;
      (newPayload as any).attendantInProgressAt = null;

      newConversationStatus = 'PENDING';

      const extractedName = tryExtractNameFromText(textRaw);
      if (extractedName) {
        (newPayload as any).name = extractedName;
        newStatus = 'MENU';
        return {
          type: 'text',
          text: `Claro! Obrigado, ${extractedName}.\nVou encaminhar seu atendimento para um atendente humano.\nPor favor, aguarde um instante. O atendente irá responder no sistema e continuar por aqui.`
        };
      }

      // Se a pessoa não enviou o nome no mesmo texto, pedimos para armazenar em payload.name.
      newStatus = 'ATENDANT_ASK_NAME';
      return {
        type: 'buttons',
        body: 'Perfeito! Para eu encaminhar seu atendimento para um atendente humano, qual é seu nome completo?',
        buttons: [
          { id: 'MENU', title: 'Voltar' },
          { id: 'END', title: 'Encerrar' }
        ]
      };
    };

    switch (normalizedFlowStatus) {
      case 'MENU': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }

        if (isAttendantRequest()) {
          sendAction = talkToAttendant();
          break;
        }

        // Se já está escalado para atendente, e ainda não temos o nome, pedimos.
        if ((newPayload as any)?.attendantRequested && !(newPayload as any)?.name) {
          newStatus = 'ATENDANT_ASK_NAME';
          sendAction = {
            type: 'buttons',
            body: 'Só pra eu encaminhar direitinho: qual é seu nome completo?',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          break;
        }

        if (content === 'duvidas' || content === '2' || isFaqStart()) {
          newStatus = 'FAQ_TOPIC_SELECT';
          newPayload.flow = 'FAQ';
          sendAction = faqTopicList();
        } else if (
          content === 'atestado' ||
          content.includes('atestado') ||
          content.includes('atestato') ||
          content.includes('atestados') ||
          content.includes('atest')
        ) {
          newStatus = 'ATESTADO_ASK_REQUESTER_NAME';
          newPayload.flow = 'ATESTADO';
          sendAction = askRequesterName();
        } else {
          sendAction = menu();
        }
        break;
      }

      case 'ATENDANT_ASK_NAME': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }

        if (isMenuRequest()) {
          // Voltar: não limpamos o payload; só retornamos para o menu.
          newStatus = 'MENU';
          newConversationStatus = 'PENDING';
          skipInactivityTimeout = true;
          sendAction = {
            type: 'text',
            text: 'Tudo bem. Por favor aguarde um instante. O atendente irá responder no sistema.'
          };
          break;
        }

        const rawCandidate = (textRaw || '').trim();
        if (!rawCandidate) {
          sendAction = {
            type: 'buttons',
            body: 'Não entendi seu nome. Pode me informar seu nome completo?',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          break;
        }

        (newPayload as any).name = rawCandidate.slice(0, 60);
        newStatus = 'MENU';
        newConversationStatus = 'PENDING';
        skipInactivityTimeout = true;
        sendAction = {
          type: 'text',
          text: `Obrigado! Agora já tenho seu nome e vou encaminhar para o atendente humano. Por favor aguarde um instante.`
        };
        break;
      }

      case 'FAQ_TOPIC_SELECT': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isAttendantRequest()) {
          sendAction = talkToAttendant();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        if (content === 'duvidas') {
          sendAction = faqTopicList();
          break;
        }

        const selectedTopicId = content.startsWith('faq_topic_')
          ? content.replace('faq_topic_', '').trim().toUpperCase()
          : undefined;

        const topicExists = selectedTopicId && FAQ_TOPICS.some((topic) => topic.id === selectedTopicId);
        if (!selectedTopicId || !topicExists) {
          sendAction = faqTopicNotFound();
          break;
        }

        newPayload.faqTopicId = selectedTopicId;
        newStatus = 'FAQ_QUESTION_SELECT';
        sendAction = faqQuestionList(selectedTopicId);
        break;
      }

      case 'FAQ_QUESTION_SELECT': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isAttendantRequest()) {
          sendAction = talkToAttendant();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }
        if (content === 'duvidas') {
          newStatus = 'FAQ_TOPIC_SELECT';
          sendAction = faqTopicList();
          break;
        }
        if (content === 'faq_perguntas') {
          const currentTopicId = String(newPayload.faqTopicId || '').toUpperCase();
          if (!currentTopicId) {
            newStatus = 'FAQ_TOPIC_SELECT';
            sendAction = faqTopicList();
          } else {
            sendAction = faqQuestionList(currentTopicId);
          }
          break;
        }

        const currentTopicId = String(newPayload.faqTopicId || '').toUpperCase();
        const topic = FAQ_TOPICS.find((t) => t.id === currentTopicId);
        if (!topic) {
          newStatus = 'FAQ_TOPIC_SELECT';
          sendAction = faqTopicList();
          break;
        }

        const questionIdPrefix = `faq_q_${currentTopicId.toLowerCase()}_`;
        const selectedQuestionId = content.startsWith(questionIdPrefix)
          ? content.replace(questionIdPrefix, '').trim().toUpperCase()
          : undefined;

        const selectedQuestion = topic.items.find((item) => item.id === selectedQuestionId);
        if (!selectedQuestion) {
          sendAction = faqQuestionNotFound();
          break;
        }

        sendAction = {
          type: 'buttons',
          body: `*${selectedQuestion.question}*\n\n${selectedQuestion.answer}`,
          buttons: [
            { id: 'FAQ_PERGUNTAS', title: 'Mais perguntas' },
            { id: 'DUVIDAS', title: 'Trocar tópico' },
            { id: 'ATENDENTE', title: 'Falar com atendente' },
            { id: 'END', title: 'Encerrar' },
            { id: 'MENU', title: 'Menu principal' }
          ]
        };
        break;
      }

      case 'ATESTADO_ASK_REQUESTER_NAME': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        if (!textRaw) {
          sendAction = {
            type: 'buttons',
            body: 'Não recebi o nome. Qual é o nome completo da pessoa que está solicitando?',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          break;
        }

        newPayload.requesterName = textRaw;
        newPayload.name = textRaw;
        newStatus = 'ATESTADO_ASK_START_DATE';
        sendAction = askDateByTyping('inicio');
        break;
      }

      case 'ATESTADO_ASK_START_DATE': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        const startParsed = parseDateInput(textRaw);
        if (startParsed) {
          newPayload.dataInicio = startParsed.normalized;
          newStatus = 'ATESTADO_ASK_END_DATE';
          sendAction = askDateByTyping('fim');
          break;
        }

        sendAction = {
          type: 'buttons',
          body:
            'Formato inválido. Digite a data inicial no formato DD/MM/AAAA.\n' +
            'Ex.: *01/03/2026*.',
          buttons: [
            { id: 'MENU', title: 'Voltar' },
            { id: 'END', title: 'Encerrar' }
          ]
        };
        break;
      }

      case 'ATESTADO_ASK_END_DATE': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        const startParsed = parseDateInput(String(newPayload.dataInicio || ''));
        const endParsed = parseDateInput(textRaw);
        if (!endParsed) {
          sendAction = {
            type: 'buttons',
            body: 'Formato inválido. Digite a data final no formato DD/MM/AAAA.\nEx.: *05/03/2026*.',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          break;
        }
        if (!startParsed || endParsed.date < startParsed.date) {
          sendAction = {
            type: 'buttons',
            body: 'A data final não pode ser menor que a data inicial. Informe novamente a data final.',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          break;
        }

        newPayload.dataFim = endParsed.normalized;
        newStatus = 'ATESTADO_ASK_DAYS';
        sendAction = {
          type: 'buttons',
          body: 'Agora me informe o número de dias do atestado (somente número).',
          buttons: [
            { id: 'MENU', title: 'Voltar' },
            { id: 'END', title: 'Encerrar' }
          ]
        };
        break;
      }

      case 'ATESTADO_ASK_DAYS': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        const days = Number.parseInt(textRaw, 10);
        if (!Number.isFinite(days) || days <= 0) {
          sendAction = {
            type: 'buttons',
            body: 'Não consegui validar o número de dias. Envie apenas um número inteiro maior que zero.',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          break;
        }

        newPayload.numeroDias = days;
        newStatus = 'ATESTADO_ASK_FILE';
        sendAction = {
          type: 'buttons',
          body: 'Perfeito. Agora envie a foto ou PDF do atestado. 📎',
          buttons: [
            { id: 'MENU', title: 'Voltar' },
            { id: 'END', title: 'Encerrar' }
          ]
        };
        break;
      }

      case 'ATESTADO_ASK_FILE': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        if (hasMedia) {
          // Recebeu arquivo (imagem/documento) - criamos o submission com link para o arquivo
          newPayload.fileReceived = true;
          newPayload.fileNote = 'Arquivo enviado pelo usuário';

          await prisma.whatsAppSubmission.create({
            data: {
              conversationId: conversation.id,
              type: 'MEDICAL_CERTIFICATE',
              payload: newPayload as Prisma.InputJsonValue,
              status: 'PENDING',
              fileUrl: savedMedia?.fileUrl || undefined,
              fileKey: savedMedia?.fileKey,
              fileName: savedMedia?.fileName ?? 'atestado_enviado'
            }
          });

          newStatus = 'ATESTADO_COMPLETE';
          newConversationStatus = 'COMPLETED';
          sendAction = {
            type: 'buttons',
            body: '✅ Atestado recebido! Já registramos suas informações. O DP vai analisar e te dar retorno.',
            buttons: [
              { id: 'ATESTADO', title: 'Enviar outro' },
              { id: 'FINALIZE', title: 'Finalizar' }
            ]
          };
          clearPayload();
        } else {
          sendAction = {
            type: 'buttons',
            body: 'Envie a foto ou PDF do atestado.',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
        }
        break;
      }

      case 'ATESTADO_COMPLETE': {
        if (content === 'finalize' || content === 'finalizar') {
          sendAction = finalizeConversation();
          break;
        }
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        if (content.includes('atestado') || content === 'atestados' || content === 'atestato') {
          newStatus = 'ATESTADO_ASK_REQUESTER_NAME';
          newPayload.flow = 'ATESTADO';
          sendAction = askRequesterName();
          break;
        }

        sendAction = menu();
        break;
      }

      default:
        sendAction = resetToMenu();
    }

    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        flowStatus: newStatus,
        currentStep: newStatus,
        payload: newPayload as Prisma.InputJsonValue,
        status: newConversationStatus,
        updatedAt: new Date()
      } as any
    });

    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: sendAction.type === 'text' ? sendAction.text : sendAction.body
      }
    });

    await delayNatural();
    if (sendAction.type === 'text') {
      await metaWhatsApp.sendText(phone, sendAction.text);
    } else if (sendAction.type === 'buttons') {
      await metaWhatsApp.sendButtons(phone, sendAction.body, sendAction.buttons);
    } else {
      await metaWhatsApp.sendList(
        phone,
        sendAction.body,
        sendAction.buttonText,
        sendAction.sections
      );
    }

    // Se a conversa continuar em andamento (PENDING), agendar encerrar por inatividade.
    // Quando o usuário pede "atendente humano", não fechamos automaticamente.
    if (newConversationStatus === 'PENDING' && !skipInactivityTimeout) {
      this.scheduleInactivityTimeoutForConversation(conversation.id, phone);
    }
  }
}

export const whatsAppBot = new WhatsAppBotService();
