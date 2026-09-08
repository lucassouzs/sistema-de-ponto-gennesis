import { GENNECY_BOT_AVATAR_PATH } from './resolveMediaUrl';

/** Identifica mensagens enviadas pela conta bot da Gennecy no chat interno. */
export const GENNECY_BOT_EMAIL_SUFFIX = '@gennesis.internal';

export { GENNECY_BOT_AVATAR_PATH };

export function isGennecyBotUser(
  user?: { name?: string | null; email?: string | null } | null,
): boolean {
  if (!user) return false;
  const name = user.name?.trim().toLowerCase();
  if (name === 'gennecy') return true;
  const email = user.email?.trim().toLowerCase() ?? '';
  return email.startsWith('gennecy-bot@') || email.includes('gennecy-bot');
}

/** Conversa direta 1:1 com a assistente (esconde chamadas, etc.). */
export function isGennecyDirectChat(
  chat?: {
    chatType?: string | null;
    initiatorId?: string;
    recipientId?: string | null;
    initiator?: { name?: string | null; email?: string | null } | null;
    recipient?: { name?: string | null; email?: string | null } | null;
  } | null,
  currentUserId?: string | null,
): boolean {
  if (!chat || chat.chatType !== 'DIRECT' || !currentUserId) return false;
  const other =
    chat.initiatorId === currentUserId ? chat.recipient : chat.initiator;
  return isGennecyBotUser(other);
}

/** Mensagens antigas vinham com prefixo de sistema; exibe só o texto na bolha. */
export function formatGennecyMessageContent(content: string): string {
  const stripped = content.replace(/^🤖\s*Gennecy:\s*/i, '').trim();
  return stripped || content;
}
