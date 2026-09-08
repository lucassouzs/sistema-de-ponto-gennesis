import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HELP_TUTORIAL_SEEDS } from './helpTutorialSeeds';

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
  /**
   * Garante tutoriais padrão por slug.
   * Em geral não sobrescreve tutoriais já existentes (criados/editados na UI).
   * Exceção: slugs em SEED_FORCE_REFRESH_SLUGS — republica o conteúdo oficial se estiver desatualizado.
   */
  async ensureSeed() {
    /** Seeds oficiais que podem ser republicados quando o conteúdo do seed mudar. */
    const SEED_FORCE_REFRESH_SLUGS = new Set(['usar-estoque', 'usar-furo-de-estoque']);

    const existing = await prisma.helpTutorial.findMany({
      select: { slug: true, summary: true, title: true, steps: true, href: true, keywords: true },
    });
    const existingBySlug = new Map(existing.map((row) => [row.slug, row]));

    for (const item of HELP_TUTORIAL_SEEDS) {
      const slug = item.slug || slugify(item.title);
      const seedData = {
        title: item.title,
        summary: item.summary,
        setor: item.setor,
        keywords: item.keywords || [],
        href: item.href || null,
        contentType: 'STEPS' as const,
        steps: (item.steps || []) as unknown as Prisma.InputJsonValue,
      };

      const current = existingBySlug.get(slug);
      if (current) {
        if (!SEED_FORCE_REFRESH_SLUGS.has(slug)) continue;
        const same =
          current.title === seedData.title &&
          current.summary === seedData.summary &&
          (current.href || null) === seedData.href &&
          JSON.stringify(current.keywords || []) === JSON.stringify(seedData.keywords) &&
          JSON.stringify(current.steps ?? []) === JSON.stringify(item.steps || []);
        if (same) continue;
        await prisma.helpTutorial.update({
          where: { slug },
          data: seedData,
        });
        continue;
      }

      await prisma.helpTutorial.create({
        data: {
          slug,
          ...seedData,
        },
      });
      existingBySlug.set(slug, {
        slug,
        title: seedData.title,
        summary: seedData.summary,
        steps: seedData.steps,
        href: seedData.href,
        keywords: seedData.keywords,
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
