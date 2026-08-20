import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

export type HelpContentType = 'STEPS' | 'MARKDOWN' | 'DOCS' | 'RICH';

export type HelpStepInput = {
  title: string;
  body: string;
  hint?: string;
};

export type HelpTutorialCreateInput = {
  title: string;
  summary: string;
  setor: string;
  keywords?: string[];
  href?: string | null;
  contentType?: HelpContentType;
  steps?: HelpStepInput[];
  markdown?: string | null;
  docsUrl?: string | null;
  richHtml?: string | null;
  createdById?: string;
  slug?: string;
};

export type HelpTutorialUpdateInput = {
  title?: string;
  summary?: string;
  setor?: string;
  keywords?: string[];
  href?: string | null;
  contentType?: HelpContentType;
  steps?: HelpStepInput[];
  markdown?: string | null;
  docsUrl?: string | null;
  richHtml?: string | null;
};

function normalizeContentType(value: unknown, fallback: HelpContentType = 'STEPS'): HelpContentType {
  if (value === 'MARKDOWN' || value === 'DOCS' || value === 'STEPS' || value === 'RICH') {
    return value;
  }
  return fallback;
}

function normalizeDocsUrl(raw: string): string {
  const url = String(raw || '').trim();
  if (!url) return '';
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      !host.endsWith('docs.google.com') &&
      !host.endsWith('drive.google.com')
    ) {
      throw new Error('URL_DOCS_INVALIDA');
    }
    return parsed.toString();
  } catch (e: any) {
    if (e?.message === 'URL_DOCS_INVALIDA') throw e;
    throw new Error('URL_DOCS_INVALIDA');
  }
}

function normalizeRichHtml(raw: string): string {
  return String(raw || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
}

const SEED_TUTORIALS: HelpTutorialCreateInput[] = [
  {
    slug: 'cadastrar-funcionario',
    title: 'Cadastrar funcionário',
    summary:
      'Passo a passo para criar um novo funcionário em Funcionários e Externos, do formulário até a senha inicial.',
    setor: 'Departamento Pessoal',
    keywords: ['funcionário', 'cadastro', 'DP', 'novo colaborador', 'criar usuário', 'atendente'],
    href: '/ponto/funcionarios',
    steps: [
      {
        title: 'Abra Funcionários e Externos',
        body: 'No menu lateral, em Departamento Pessoal, acesse Funcionários e Externos. É preciso ter permissão de criar funcionários (ou ser administrador / equipe de DP).',
        hint: 'Se o botão de criar não aparecer, peça liberação da permissão Criar no módulo Funcionários.',
      },
      {
        title: 'Inicie um novo cadastro',
        body: 'Clique em Criar Funcionário (ou equivalente na barra da lista). O formulário abre em etapas: Dados Pessoais, Dados Profissionais, Valores e Adicionais, Dados Bancários e Horário de Trabalho.',
      },
      {
        title: 'Preencha os Dados Pessoais',
        body: 'Informe nome, e-mail, CPF e senha inicial de acesso. O e-mail e o CPF precisam ser únicos no sistema. Avance para a próxima etapa quando os campos obrigatórios estiverem válidos.',
      },
      {
        title: 'Complete Dados Profissionais',
        body: 'Preencha matrícula (quando aplicável), setor, cargo, datas de admissão e nascimento, centro de custo e demais campos profissionais exigidos pela empresa.',
      },
      {
        title: 'Valores, bancários e horário',
        body: 'Nas etapas seguintes, informe salário/adicionais (se couber), dados bancários ou PIX e o horário de trabalho. Use Voltar se precisar corrigir uma etapa anterior.',
      },
      {
        title: 'Salve e valide o acesso',
        body: 'Na última etapa, confirme e salve. O colaborador poderá entrar com o e-mail e a senha definidos. Ajuste permissões de módulos depois, se necessário, no cadastro ou na matriz de acessos.',
        hint: 'No primeiro login, o sistema pode solicitar troca de senha.',
      },
    ],
  },
  {
    slug: 'abrir-rm',
    title: 'Abrir uma RM',
    summary:
      'Como criar uma Nova Solicitação de Material, informar itens e enviar a RM para análise.',
    setor: 'Suprimentos',
    keywords: ['RM', 'requisição', 'materiais', 'compras', 'solicitar materiais', 'OC'],
    href: '/ponto/solicitar-materiais',
    steps: [
      {
        title: 'Abra Solicitar Materiais',
        body: 'No menu, acesse a tela de Solicitar Materiais (RMs). Ali você vê suas solicitações e o status de cada uma.',
      },
      {
        title: 'Clique em Nova Solicitação',
        body: 'Use o botão Nova Solicitação para abrir o formulário Nova Solicitação de Material.',
      },
      {
        title: 'Preencha cabeçalho e itens',
        body: 'Informe obra/centro de custo, prioridade e demais dados do cabeçalho. Adicione os itens (material, quantidade, unidade) e anexos se precisar.',
        hint: 'Revise preços unitários e descrições antes de enviar — isso evita correção de RM depois.',
      },
      {
        title: 'Crie a solicitação',
        body: 'Clique em Criar Solicitação. Acompanhe o status na lista (análise, correção, aprovação, OC etc.) até a conclusão do fluxo.',
      },
    ],
  },
  {
    slug: 'atender-central-de-atendimentos',
    title: 'Atender na Central de Atendimentos',
    summary:
      'Como localizar conversas aguardando atendente, responder e encerrar o atendimento humano.',
    setor: 'Departamento Pessoal',
    keywords: ['whatsapp', 'atendente', 'central de atendimentos', 'conversa', 'atestado', 'humano'],
    href: '/ponto/conversas-whatsapp',
    steps: [
      {
        title: 'Abra a Central de Atendimentos',
        body: 'No menu Departamento Pessoal, acesse Central de Atendimentos. A tela lista conversas que pediram atendimento humano.',
      },
      {
        title: 'Filtre por etapa',
        body: 'Use as abas Aguardando atendente, Em atendimento e Encerradas para focar no que precisa de ação.',
      },
      {
        title: 'Selecione a conversa e responda',
        body: 'Escolha um item da lista à esquerda. Leia o histórico e envie a resposta no painel da conversa. A conversa passa a Em atendimento enquanto você acompanha.',
      },
      {
        title: 'Encerre quando concluir',
        body: 'Quando o caso estiver resolvido, encerre a conversa. Ela aparece em Encerradas para consulta posterior.',
        hint: 'Quem não tiver permissão no módulo não verá a Central — peça acesso ao administrador ou ao DP.',
      },
    ],
  },
  {
    slug: 'navegar-no-sistema',
    title: 'Como navegar no sistema',
    summary:
      'Visão rápida do menu lateral, módulos liberados e atalhos (Drive, Tasks, Flow, chat).',
    setor: 'Geral',
    keywords: ['menu', 'sidebar', 'navegar', 'módulos', 'começar'],
    href: '/ponto/home',
    steps: [
      {
        title: 'Use o menu lateral',
        body: 'Os módulos aparecem agrupados (Principal, Departamento Pessoal, Compras, etc.). Só entram itens para os quais você tem permissão.',
      },
      {
        title: 'Atalhos do rodapé',
        body: 'Conversas, Tasks, Agenda, Flow e Meu Drive ficam nos atalhos inferiores (quando liberados para o seu perfil).',
      },
      {
        title: 'Central de Ajuda',
        body: 'Volte a esta Central sempre que precisar de um passo a passo. Use a busca no hub para achar tutoriais por palavra-chave.',
      },
    ],
  },
];

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'tutorial';
}

function normalizeSteps(steps: HelpStepInput[]): HelpStepInput[] {
  return steps
    .map((s) => ({
      title: String(s.title || '').trim(),
      body: String(s.body || '').trim(),
      ...(s.hint && String(s.hint).trim() ? { hint: String(s.hint).trim() } : {}),
    }))
    .filter((s) => s.title && s.body);
}

export class HelpTutorialService {
  async ensureSeed() {
    const count = await prisma.helpTutorial.count();
    if (count > 0) return;

    for (const item of SEED_TUTORIALS) {
      await prisma.helpTutorial.create({
        data: {
          slug: item.slug || slugify(item.title),
          title: item.title,
          summary: item.summary,
          setor: item.setor,
          keywords: item.keywords || [],
          href: item.href || null,
          steps: item.steps as unknown as Prisma.InputJsonValue,
        },
      });
    }
  }

  async list(filters?: { setor?: string; q?: string }) {
    await this.ensureSeed();

    const where: Prisma.HelpTutorialWhereInput = {};
    if (filters?.setor?.trim()) {
      where.setor = filters.setor.trim();
    }
    if (filters?.q?.trim()) {
      const q = filters.q.trim();
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { summary: { contains: q, mode: 'insensitive' } },
        { setor: { contains: q, mode: 'insensitive' } },
        { markdown: { contains: q, mode: 'insensitive' } },
        { keywords: { hasSome: [q] } },
      ];
    }

    return prisma.helpTutorial.findMany({
      where,
      orderBy: [{ setor: 'asc' }, { title: 'asc' }],
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async getBySlug(slug: string) {
    await this.ensureSeed();
    return prisma.helpTutorial.findUnique({
      where: { slug },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async getById(id: string) {
    return prisma.helpTutorial.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  private async uniqueSlug(base: string): Promise<string> {
    let slug = slugify(base);
    let n = 0;
    while (true) {
      const candidate = n === 0 ? slug : `${slug}-${n}`;
      const exists = await prisma.helpTutorial.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      if (!exists) return candidate;
      n += 1;
    }
  }

  async create(input: HelpTutorialCreateInput) {
    const title = String(input.title || '').trim();
    const summary = String(input.summary || '').trim();
    const setor = String(input.setor || '').trim();
    const contentType = normalizeContentType(input.contentType);
    const steps = normalizeSteps(input.steps || []);
    const markdown = String(input.markdown || '').trim();
    const docsUrl =
      contentType === 'DOCS' ? normalizeDocsUrl(String(input.docsUrl || '')) : '';
    const richHtml =
      contentType === 'RICH' ? normalizeRichHtml(String(input.richHtml || '')) : '';

    if (!title) throw new Error('Título é obrigatório');
    if (!summary) throw new Error('Resumo é obrigatório');
    if (!setor) throw new Error('Setor é obrigatório');
    if (contentType === 'STEPS' && steps.length === 0) {
      throw new Error('Informe ao menos um passo');
    }
    if (contentType === 'MARKDOWN' && !markdown) {
      throw new Error('Informe o conteúdo em markdown');
    }
    if (contentType === 'DOCS' && !docsUrl) {
      throw new Error('Informe a URL do Google Docs');
    }
    if (contentType === 'RICH' && !richHtml) {
      throw new Error('Informe o conteúdo do editor visual');
    }

    const slug = input.slug?.trim()
      ? await this.uniqueSlug(input.slug)
      : await this.uniqueSlug(title);

    return prisma.helpTutorial.create({
      data: {
        slug,
        title,
        summary,
        setor,
        keywords: (input.keywords || []).map((k) => String(k).trim()).filter(Boolean),
        href: input.href?.trim() || null,
        contentType,
        steps: (contentType === 'STEPS' ? steps : []) as unknown as Prisma.InputJsonValue,
        markdown: contentType === 'MARKDOWN' ? markdown : null,
        docsUrl: contentType === 'DOCS' ? docsUrl : null,
        richHtml: contentType === 'RICH' ? richHtml : null,
        createdById: input.createdById || null,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, input: HelpTutorialUpdateInput) {
    const existing = await prisma.helpTutorial.findUnique({ where: { id } });
    if (!existing) throw new Error('NOT_FOUND');

    const nextType = normalizeContentType(
      input.contentType,
      normalizeContentType(existing.contentType)
    );

    const data: Prisma.HelpTutorialUpdateInput = {};
    if (input.title !== undefined) {
      const title = String(input.title).trim();
      if (!title) throw new Error('Título é obrigatório');
      data.title = title;
    }
    if (input.summary !== undefined) {
      const summary = String(input.summary).trim();
      if (!summary) throw new Error('Resumo é obrigatório');
      data.summary = summary;
    }
    if (input.setor !== undefined) {
      const setor = String(input.setor).trim();
      if (!setor) throw new Error('Setor é obrigatório');
      data.setor = setor;
    }
    if (input.keywords !== undefined) {
      data.keywords = input.keywords.map((k) => String(k).trim()).filter(Boolean);
    }
    if (input.href !== undefined) {
      data.href = input.href?.trim() || null;
    }

    data.contentType = nextType;

    if (nextType === 'STEPS') {
      const steps =
        input.steps !== undefined
          ? normalizeSteps(input.steps)
          : normalizeSteps((existing.steps as HelpStepInput[]) || []);
      if (steps.length === 0) throw new Error('Informe ao menos um passo');
      data.steps = steps as unknown as Prisma.InputJsonValue;
      data.markdown = null;
      data.docsUrl = null;
      data.richHtml = null;
    } else if (nextType === 'MARKDOWN') {
      const markdown =
        input.markdown !== undefined
          ? String(input.markdown || '').trim()
          : String(existing.markdown || '').trim();
      if (!markdown) throw new Error('Informe o conteúdo em markdown');
      data.markdown = markdown;
      data.steps = [] as unknown as Prisma.InputJsonValue;
      data.docsUrl = null;
      data.richHtml = null;
    } else if (nextType === 'DOCS') {
      const docsUrl = normalizeDocsUrl(
        input.docsUrl !== undefined
          ? String(input.docsUrl || '')
          : String(existing.docsUrl || '')
      );
      if (!docsUrl) throw new Error('Informe a URL do Google Docs');
      data.docsUrl = docsUrl;
      data.steps = [] as unknown as Prisma.InputJsonValue;
      data.markdown = null;
      data.richHtml = null;
    } else {
      const richHtml = normalizeRichHtml(
        input.richHtml !== undefined
          ? String(input.richHtml || '')
          : String(existing.richHtml || '')
      );
      if (!richHtml) throw new Error('Informe o conteúdo do editor visual');
      data.richHtml = richHtml;
      data.steps = [] as unknown as Prisma.InputJsonValue;
      data.markdown = null;
      data.docsUrl = null;
    }

    return prisma.helpTutorial.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string) {
    const existing = await prisma.helpTutorial.findUnique({ where: { id } });
    if (!existing) throw new Error('NOT_FOUND');
    await prisma.helpTutorial.delete({ where: { id } });
    return existing;
  }
}
