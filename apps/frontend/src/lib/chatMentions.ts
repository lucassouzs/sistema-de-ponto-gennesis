import { isGennecyBotUser } from './gennecyBot';
import { GENNECY_BOT_AVATAR_PATH } from './resolveMediaUrl';
import { normalizeSearchText, textMatchesSearch } from './normalizeSearchText';

export const GENNECY_MENTION_HANDLE = 'Gennecy';

export type ChatMentionOption = {
  id: string;
  label: string;
  insertText: string;
  subtitle?: string;
  kind: 'bot' | 'user';
  photoUrl?: string | null;
};

export type MentionQueryState = {
  start: number;
  query: string;
};

/** Detecta @query imediatamente antes do cursor (sem espaço no meio). */
export function detectMentionQuery(text: string, cursor: number): MentionQueryState | null {
  const before = text.slice(0, cursor);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1] ?? '')) return null;
  const query = before.slice(at + 1);
  if (/[\s\n]/.test(query)) return null;
  return { start: at, query };
}

/** Letras (incl. acentuadas latinas), dígitos, _ e - — sem \p{} (target TS es5). */
const MENTION_HANDLE_CHARS = /[a-zA-Z0-9\u00C0-\u024F_-]/g;

export function mentionHandleFromName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? name.trim();
  const chars = first.match(MENTION_HANDLE_CHARS);
  return (chars ? chars.join('') : '') || 'usuario';
}

type MentionUser = {
  id: string;
  name: string;
  email?: string | null;
  profilePhotoUrl?: string | null;
  employee?: { department?: string | null } | null;
};

export function buildChatMentionOptions(
  users: MentionUser[],
  query: string,
  options?: { includeGennecyAssistant?: boolean },
): ChatMentionOption[] {
  const q = normalizeSearchText(query);

  const gennecy: ChatMentionOption = {
    id: 'gennecy',
    label: 'Gennecy',
    insertText: `@${GENNECY_MENTION_HANDLE} `,
    subtitle: 'Assistente · criar tasks no chat',
    kind: 'bot',
    photoUrl: GENNECY_BOT_AVATAR_PATH,
  };

  const people: ChatMentionOption[] = users
    .filter((u) => !isGennecyBotUser(u))
    .map((u) => {
      const handle = mentionHandleFromName(u.name);
      return {
        id: u.id,
        label: u.name.trim(),
        insertText: `@${handle} `,
        subtitle: u.employee?.department?.trim() || undefined,
        kind: 'user' as const,
        photoUrl: u.profilePhotoUrl ?? null,
      };
    });

  const includeAssistant = options?.includeGennecyAssistant !== false;
  const all = includeAssistant ? [gennecy, ...people] : people;
  if (!q) return all;

  return all.filter((o) => {
    const handle = o.insertText.slice(1).trim();
    return (
      textMatchesSearch(o.label, q) ||
      normalizeSearchText(handle).startsWith(q)
    );
  });
}

/** Token @nome no composer e nas mensagens (estilo WhatsApp). */
export const CHAT_MENTION_PATTERN = /@([a-zA-Z0-9\u00C0-\u024F_]+)/g;

export type MentionTextSegment = { type: 'text' | 'mention'; value: string };

export function splitTextWithMentions(text: string): MentionTextSegment[] {
  if (!text) return [];
  const segments: MentionTextSegment[] = [];
  const re = new RegExp(CHAT_MENTION_PATTERN.source, 'g');
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const idx = match.index;
    if (idx > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, idx) });
    }
    segments.push({ type: 'mention', value: match[0] });
    lastIndex = idx + match[0].length;
    if (match[0].length === 0) break;
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: text }];
}

export function applyMentionInsert(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  mentionStart: number,
  insertText: string,
): { value: string; cursor: number } {
  const before = text.slice(0, mentionStart);
  const after = text.slice(selectionEnd);
  const value = before + insertText + after;
  const cursor = before.length + insertText.length;
  return { value, cursor };
}
