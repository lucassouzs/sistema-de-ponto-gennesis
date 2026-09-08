import {
  DEFAULT_LICITACAO_CHECKLIST,
  LICITACAO_CHECKLIST_TEMPLATE_VERSION,
  type LicitacaoChecklistSection,
} from '../constants/licitacaoChecklistDefault';
import { canManageLicitacaoChecklist } from '../lib/licitacaoChecklistAuth';
import {
  CHECKLIST_TEMPLATE_KEY,
  licitacaoConfigGet,
  licitacaoConfigSet,
} from './licitacaoConfigStore';

export type { LicitacaoChecklistSection };

const CHECKLIST_TEMPLATE_VERSION_KEY = 'checklist_template_version';

function parseChecklistTemplate(raw: unknown): LicitacaoChecklistSection[] | null {
  if (!Array.isArray(raw)) return null;
  const sections: LicitacaoChecklistSection[] = [];
  for (const section of raw) {
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
    const s = section as Record<string, unknown>;
    const id = typeof s.id === 'string' ? s.id.trim() : '';
    const title = typeof s.title === 'string' ? s.title.trim() : '';
    if (!id || !title) continue;
    const itemsRaw = Array.isArray(s.items) ? s.items : [];
    const items: Array<{ id: string; label: string }> = [];
    for (const item of itemsRaw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const o = item as Record<string, unknown>;
      const itemId = typeof o.id === 'string' ? o.id.trim() : '';
      const label = typeof o.label === 'string' ? o.label.trim() : '';
      if (!itemId || !label) continue;
      items.push({ id: itemId, label });
    }
    sections.push({ id, title, items });
  }
  return sections.length ? sections : null;
}

function validateChecklistTemplate(sections: LicitacaoChecklistSection[]): void {
  if (!sections.length) {
    throw new Error('O checklist deve ter pelo menos uma seção');
  }
  const sectionIds = new Set<string>();
  for (const section of sections) {
    if (section.id.length > 80 || section.title.length > 200) {
      throw new Error('Seção com identificador ou título muito longo');
    }
    if (sectionIds.has(section.id)) {
      throw new Error(`Seção duplicada: ${section.id}`);
    }
    sectionIds.add(section.id);
    if (!section.items.length) {
      throw new Error(`A seção «${section.title}» precisa de pelo menos um item`);
    }
    const itemIds = new Set<string>();
    for (const item of section.items) {
      if (item.id.length > 80 || item.label.length > 500) {
        throw new Error('Item com identificador ou texto muito longo');
      }
      if (itemIds.has(item.id)) {
        throw new Error(`Item duplicado na seção «${section.title}»: ${item.id}`);
      }
      itemIds.add(item.id);
    }
  }
}

export async function getLicitacaoChecklistTemplate(): Promise<LicitacaoChecklistSection[]> {
  try {
    const storedVersion = await licitacaoConfigGet(CHECKLIST_TEMPLATE_VERSION_KEY);
    const needsUpgrade = storedVersion !== LICITACAO_CHECKLIST_TEMPLATE_VERSION;

    if (needsUpgrade) {
      await licitacaoConfigSet(CHECKLIST_TEMPLATE_KEY, DEFAULT_LICITACAO_CHECKLIST);
      await licitacaoConfigSet(
        CHECKLIST_TEMPLATE_VERSION_KEY,
        LICITACAO_CHECKLIST_TEMPLATE_VERSION
      );
      return DEFAULT_LICITACAO_CHECKLIST;
    }

    const stored = await licitacaoConfigGet(CHECKLIST_TEMPLATE_KEY);
    const parsed = parseChecklistTemplate(stored);
    if (parsed) return parsed;
  } catch {
    /* tabela ainda não criada ou leitura indisponível */
  }
  return DEFAULT_LICITACAO_CHECKLIST;
}

export async function updateLicitacaoChecklistTemplate(
  sections: unknown,
  userEmail: string | null | undefined
): Promise<LicitacaoChecklistSection[]> {
  if (!canManageLicitacaoChecklist(userEmail)) {
    throw new Error('Sem permissão para alterar itens do checklist');
  }
  const parsed = parseChecklistTemplate(sections);
  if (!parsed) {
    throw new Error('Formato de checklist inválido');
  }
  validateChecklistTemplate(parsed);
  await licitacaoConfigSet(CHECKLIST_TEMPLATE_KEY, parsed);
  await licitacaoConfigSet(
    CHECKLIST_TEMPLATE_VERSION_KEY,
    LICITACAO_CHECKLIST_TEMPLATE_VERSION
  );
  return parsed;
}

export function canUserManageLicitacaoChecklist(userEmail: string | null | undefined): boolean {
  return canManageLicitacaoChecklist(userEmail);
}
