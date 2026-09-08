import api from './api';

export type HelpContentType = 'STEPS' | 'MARKDOWN' | 'DOCS' | 'RICH';

export type HelpTutorialStep = {
  title: string;
  body: string;
  hint?: string;
};

export type HelpTutorialRecord = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  setor: string;
  keywords: string[];
  href: string | null;
  contentType: HelpContentType;
  steps: HelpTutorialStep[];
  markdown: string | null;
  docsUrl: string | null;
  richHtml: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: { id: string; name: string } | null;
};

export type HelpTutorialCreatePayload = {
  title: string;
  summary: string;
  setor: string;
  keywords?: string[];
  href?: string | null;
  contentType: HelpContentType;
  steps?: HelpTutorialStep[];
  markdown?: string | null;
  docsUrl?: string | null;
  richHtml?: string | null;
};

function normalizeSteps(raw: unknown): HelpTutorialStep[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const step = s as Record<string, unknown>;
      const title = String(step.title || '').trim();
      const body = String(step.body || '').trim();
      const hint = step.hint != null ? String(step.hint).trim() : '';
      if (!title || !body) return null;
      return hint ? { title, body, hint } : { title, body };
    })
    .filter((s): s is HelpTutorialStep => !!s);
}

function mapTutorial(raw: any): HelpTutorialRecord {
  const contentType: HelpContentType =
    raw.contentType === 'MARKDOWN'
      ? 'MARKDOWN'
      : raw.contentType === 'DOCS'
        ? 'DOCS'
        : raw.contentType === 'RICH'
          ? 'RICH'
          : 'STEPS';
  return {
    id: raw.id,
    slug: raw.slug,
    title: raw.title,
    summary: raw.summary,
    setor: raw.setor,
    keywords: Array.isArray(raw.keywords) ? raw.keywords : [],
    href: raw.href ?? null,
    contentType,
    steps: normalizeSteps(raw.steps),
    markdown: raw.markdown ?? null,
    docsUrl: raw.docsUrl ?? null,
    richHtml: raw.richHtml ?? null,
    createdById: raw.createdById ?? null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    createdBy: raw.createdBy ?? null,
  };
}

export async function fetchHelpTutorials(params?: {
  setor?: string;
  q?: string;
}): Promise<HelpTutorialRecord[]> {
  const res = await api.get('/help-tutorials', { params });
  const list = Array.isArray(res.data?.data) ? res.data.data : [];
  return list.map(mapTutorial);
}

export async function fetchHelpTutorialBySlug(
  slug: string
): Promise<HelpTutorialRecord> {
  const res = await api.get(`/help-tutorials/by-slug/${encodeURIComponent(slug)}`);
  return mapTutorial(res.data.data);
}

export async function createHelpTutorial(
  payload: HelpTutorialCreatePayload
): Promise<HelpTutorialRecord> {
  const res = await api.post('/help-tutorials', payload);
  return mapTutorial(res.data.data);
}

export async function updateHelpTutorial(
  id: string,
  payload: HelpTutorialCreatePayload
): Promise<HelpTutorialRecord> {
  const res = await api.patch(`/help-tutorials/${id}`, payload);
  return mapTutorial(res.data.data);
}

export async function deleteHelpTutorial(id: string): Promise<void> {
  await api.delete(`/help-tutorials/${id}`);
}
