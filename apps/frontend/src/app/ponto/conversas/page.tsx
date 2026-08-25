'use client';

import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { MainLayout } from '@/components/layout/MainLayout';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { toast } from 'react-hot-toast';
import {
  Search,
  Send,
  MessageSquare,
  X,
  Plus,
  ChevronLeft,
  Users,
  UserPlus,
  CheckCheck,
  Loader2,
  ImageIcon,
  FileText,
  Download,
  Smile,
  Mic,
  Pencil,
  LogOut,
  Star,
  Pin,
  PinOff,
  Trash2,
  Check,
  Camera,
  ChevronRight,
  ChevronDown,
  MoreVertical,
  EyeOff,
  Info,
  MinusCircle,
  XCircle,
  CornerUpLeft,
  Bot,
  Video,
  Phone,
  Square,
  Play,
  Pause,
} from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { clsx } from 'clsx';
import { CircularPhotoCropModal } from '@/components/conversas/CircularPhotoCropModal';
import { ChatMentionPicker } from '@/components/conversas/ChatMentionPicker';
import { ChatComposerField } from '@/components/conversas/ChatComposerField';
import { ChatComposerAttachments } from '@/components/conversas/ChatComposerAttachments';
import { ChatPdfAttachmentCard } from '@/components/conversas/ChatPdfAttachmentCard';
import {
  incomingChatBubbleClass,
  ownChatAttachmentCardClass,
  ownChatAttachmentIconClass,
  ownChatAudioFocusClass,
  ownChatAudioPlayBtnClass,
  ownChatAudioThumbClass,
  ownChatAudioTimeClass,
  ownChatAudioTrackBgClass,
  ownChatAudioTrackFillClass,
  ownChatBubbleClass,
  ownChatBubbleDeletedClass,
  ownChatBubbleMenuBtnClass,
  ownChatMentionClass,
  ownChatMetaTextClass,
  ownChatPinClass,
  ownChatReadCheckClass,
  ownChatReplyAccentClass,
  ownChatReplyBoxClass,
  ownChatReplyTitleClass,
  ownChatStarClass,
  ownChatUnreadCheckClass,
} from '@/components/conversas/chatBubbleTheme';
import { ChatImageComposePanel } from '@/components/conversas/ChatImageComposePanel';
import { ChatTopicsSidebar, fetchChatTopics } from '@/components/conversas/ChatTopicsSidebar';
import { MentionHighlightedText } from '@/components/conversas/MentionHighlightedText';
import {
  formatGennecyMessageContent,
  GENNECY_BOT_AVATAR_PATH,
  isGennecyBotUser,
  isGennecyDirectChat,
} from '@/lib/gennecyBot';
import {
  applyMentionInsert,
  buildChatMentionOptions,
  detectMentionQuery,
  type ChatMentionOption,
} from '@/lib/chatMentions';
import { dedupeFiles, getFilesFromClipboard } from '@/lib/chatComposerFiles';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { useNativeCallContext } from '@/contexts/NativeCallContext';
import { syncConversasActiveChatId } from '@/hooks/useChatSounds';
import { AUTH_TOKEN_REFRESHED_EVENT, hasStoredAuthToken } from '@/lib/authSession';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { textMatchesSearch } from '@/lib/normalizeSearchText';

const SELECTED_CHAT_STORAGE_KEY = 'conversas-selected-chat-id';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserBasic {
  id: string;
  name: string;
  email: string;
  profilePhotoUrl?: string | null;
  employee?: {
    department: string;
    position: string;
    employeeId: string;
  } | null;
}

interface MessageAttachment {
  id: string;
  fileName: string;
  fileUrl: string | null;
  fileKey?: string | null;
  fileSize: number | null;
  mimeType: string | null;
}

/** Mensagem citada em uma resposta (retorno da API) */
interface MessageReplyPreview {
  id: string;
  content: string;
  deletedAt?: string | null;
  isSystem?: boolean;
  sender: UserBasic;
  attachments: Pick<MessageAttachment, 'id' | 'fileName' | 'mimeType'>[];
}

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  /** Evento de grupo/fixar/descrição — exibido no centro, sem bolha */
  isSystem?: boolean;
  content: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  sender: UserBasic;
  attachments: MessageAttachment[];
  replyToId?: string | null;
  topicId?: string | null;
  replyTo?: MessageReplyPreview | null;
  /** Preenchido pela API para o usuário logado: favoritou esta mensagem */
  favorites?: { id: string }[];
  editedAt?: string | null;
  deletedAt?: string | null;
}

interface ChatParticipant {
  userId: string;
  isAdmin: boolean;
  user: UserBasic;
}

interface DirectChat {
  id: string;
  chatType: 'DIRECT' | 'GROUP' | 'GROUP_CALL';
  groupName?: string | null;
  groupDescription?: string | null;
  groupAvatarUrl?: string | null;
  parentGroupChatId?: string | null;
  status: string;
  initiatorId: string;
  recipientId: string | null;
  lastMessageAt: string | null;
  pinnedMessageId?: string | null;
  pinnedMessage?: Message | null;
  initiator: UserBasic;
  recipient: UserBasic | null;
  participants?: ChatParticipant[];
  messages: Message[];
}

// ─── API helpers ──────────────────────────────────────────────────────────────

const fetchUsers = async (): Promise<UserBasic[]> => {
  const res = await api.get('/chats/direct/users');
  return res.data.data;
};

const fetchDirectChats = async (): Promise<DirectChat[]> => {
  const res = await api.get('/chats/direct');
  return res.data.data;
};

const fetchDirectChatById = async (
  id: string,
  options?: { since?: string },
): Promise<DirectChat> => {
  const res = await api.get(`/chats/direct/${id}`, {
    params: options?.since ? { since: options.since } : undefined,
  });
  return res.data.data;
};

/** Mescla mensagens por id (sync incremental no polling). */
function mergeDirectChatMessages(existing: DirectChat, incoming: DirectChat): DirectChat {
  if (!incoming.messages?.length) {
    return { ...existing, ...incoming, messages: existing.messages ?? [] };
  }
  const byId = new Map((existing.messages ?? []).map((m) => [m.id, m]));
  for (const m of incoming.messages) {
    byId.set(m.id, m);
  }
  const merged = Array.from(byId.values()).sort(
    (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
  );
  return { ...existing, ...incoming, messages: merged };
}

type ActiveNativeGroupCallInfo = {
  active: boolean;
  callId?: string;
  video?: boolean;
  joinedUserIds?: string[];
  userInCall?: boolean;
};

const fetchActiveNativeGroupCall = async (chatId: string): Promise<ActiveNativeGroupCallInfo> => {
  const res = await api.get(`/chats/direct/${chatId}/active-native-call`);
  return res.data.data;
};

const openDirectChat = async (recipientId: string): Promise<DirectChat> => {
  const res = await api.post('/chats/direct', { recipientId });
  return res.data.data;
};

const openGennecyDirectChat = async (): Promise<DirectChat> => {
  const res = await api.post('/chats/direct/gennecy');
  return res.data.data;
};

const createGroupChat = async ({
  groupName,
  groupDescription,
  groupAvatarFile,
  participantIds,
}: {
  groupName: string;
  groupDescription?: string;
  groupAvatarFile?: File | null;
  participantIds: string[];
}): Promise<DirectChat> => {
  const formData = new FormData();
  formData.append('groupName', groupName);
  if (groupDescription) formData.append('groupDescription', groupDescription);
  formData.append('participantIds', JSON.stringify(participantIds));
  if (groupAvatarFile) formData.append('groupAvatar', groupAvatarFile);
  const res = await api.post('/chats/direct/groups', formData);
  return res.data.data;
};

const leaveGroupChat = async (chatId: string): Promise<void> => {
  await api.delete(`/chats/direct/groups/${chatId}/leave`);
};

const updateGroupChatApi = async (
  chatId: string,
  body: { groupName?: string; groupDescription?: string | null }
): Promise<DirectChat> => {
  const res = await api.patch(`/chats/direct/groups/${chatId}`, body);
  return res.data.data;
};

const uploadGroupAvatarApi = async (chatId: string, file: File): Promise<DirectChat> => {
  const fd = new FormData();
  fd.append('groupAvatar', file);
  const res = await api.patch(`/chats/direct/groups/${chatId}/avatar`, fd);
  return res.data.data;
};

const removeGroupAvatarApi = async (chatId: string): Promise<DirectChat> => {
  const res = await api.delete(`/chats/direct/groups/${chatId}/avatar`);
  return res.data.data;
};

const addGroupMembersApi = async (
  chatId: string,
  participantIds: string[]
): Promise<DirectChat> => {
  const res = await api.post(`/chats/direct/groups/${chatId}/members`, { participantIds });
  return res.data.data;
};

const removeGroupMemberApi = async (chatId: string, userId: string): Promise<DirectChat> => {
  const res = await api.delete(`/chats/direct/groups/${chatId}/members/${userId}`);
  return res.data.data;
};

const sendDirectMessage = async ({
  chatId,
  content,
  files,
  replyToId,
  topicId,
}: {
  chatId: string;
  content: string;
  files?: File[];
  replyToId?: string;
  topicId?: string | null;
}): Promise<{ message: Message; gennecyProcessing?: boolean; gennecyMode?: 'task' | 'chat' | null }> => {
  const form = new FormData();
  form.append('chatId', chatId);
  form.append('content', content);
  if (replyToId) form.append('replyToId', replyToId);
  if (topicId) form.append('topicId', topicId);
  if (files) files.forEach(f => form.append('attachments', f));
  const res = await api.post('/chats/direct/messages', form);
  return {
    message: res.data.data,
    gennecyProcessing: Boolean(res.data.gennecyProcessing),
    gennecyMode: res.data.gennecyMode ?? null,
  };
};

const markAsRead = async (chatId: string) => {
  await api.patch(`/chats/direct/${chatId}/read`);
};

const favoriteMessageApi = async (messageId: string): Promise<Message> => {
  const res = await api.post(`/chats/direct/messages/${messageId}/favorite`);
  return res.data.data;
};

const unfavoriteMessageApi = async (messageId: string): Promise<Message> => {
  const res = await api.delete(`/chats/direct/messages/${messageId}/favorite`);
  return res.data.data;
};

const pinMessageApi = async (chatId: string, messageId: string): Promise<DirectChat> => {
  const res = await api.post(`/chats/direct/${chatId}/pin/${messageId}`);
  return res.data.data;
};

const unpinMessageApi = async (chatId: string): Promise<DirectChat> => {
  const res = await api.delete(`/chats/direct/${chatId}/pin`);
  return res.data.data;
};

const editMessageApi = async (messageId: string, content: string): Promise<Message> => {
  const res = await api.patch(`/chats/direct/messages/${messageId}`, { content });
  return res.data.data;
};

const deleteMessageApi = async (messageId: string): Promise<Message> => {
  const res = await api.delete(`/chats/direct/messages/${messageId}`);
  return res.data.data;
};

const hideMessageForMeApi = async (messageId: string): Promise<void> => {
  await api.post(`/chats/direct/messages/${messageId}/hide-for-me`);
};

const clearConversationForMeApi = async (chatId: string): Promise<void> => {
  await api.post(`/chats/direct/${chatId}/clear-for-me`);
};

// ─── Utility ──────────────────────────────────────────────────────────────────

function formatMessageTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}



function formatChatDate(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (days === 1) return 'Ontem';
  if (days < 7) return d.toLocaleDateString('pt-BR', { weekday: 'short' });
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

const NAME_COLOR_CLASSES = [
  'text-sky-700 dark:text-sky-300',
  'text-emerald-700 dark:text-emerald-300',
  'text-violet-700 dark:text-violet-300',
  'text-amber-700 dark:text-amber-300',
  'text-rose-700 dark:text-rose-300',
  'text-cyan-700 dark:text-cyan-300',
];

function getNameColorClass(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return NAME_COLOR_CLASSES[hash % NAME_COLOR_CLASSES.length];
}

function formatFileSize(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeAttachmentName(name: string | null | undefined) {
  const raw = String(name || '').trim() || 'Anexo';
  if (!/[ÃÂ]/.test(raw)) return raw;
  try {
    const bytes = Uint8Array.from(raw, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder('utf-8').decode(bytes);
    return decoded.includes('�') ? raw : decoded;
  } catch {
    return raw;
  }
}

function getAttachmentTypeLabel(fileName: string, mimeType: string | null) {
  const ext = fileName.split('.').pop()?.trim();
  if (ext) return ext.toUpperCase();
  if (mimeType) return mimeType.split('/').pop()?.toUpperCase() || 'ARQUIVO';
  return 'ARQUIVO';
}

function isImageMime(mimeType: string | null) {
  return mimeType?.startsWith('image/') ?? false;
}

function isAudioMime(mimeType: string | null) {
  if (!mimeType) return false;
  return mimeType.startsWith('audio/') || mimeType === 'application/ogg';
}

function isPdfMime(mimeType: string | null, fileName?: string) {
  if (mimeType === 'application/pdf') return true;
  return fileName?.toLowerCase().endsWith('.pdf') ?? false;
}

function pickAudioRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return '';
}

function formatVoiceRecordingTime(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function formatAudioSeconds(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

/** Player de voz: play + barra linear + tempo (sem controles nativos). */
function ChatInlineAudioPlayer({
  src,
  isOwn,
  reserveCornerForMeta,
}: {
  src: string;
  isOwn: boolean;
  reserveCornerForMeta?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);

  const syncDuration = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const d = el.duration;
    if (Number.isFinite(d) && d > 0) setDuration(d);
  }, []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }, []);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setCurrent(0);
    };
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => syncDuration();
    const onDurChange = () => syncDuration();
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('ended', onEnded);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('durationchange', onDurChange);
    el.addEventListener('loadeddata', onMeta);
    syncDuration();
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('durationchange', onDurChange);
      el.removeEventListener('loadeddata', onMeta);
    };
  }, [src, syncDuration]);

  const progressPct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;

  const seekFromClientX = useCallback(
    (clientX: number, bar: HTMLDivElement) => {
      const el = audioRef.current;
      if (!el) return;
      const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
      if (!d) return;
      const rect = bar.getBoundingClientRect();
      const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      el.currentTime = pct * d;
    },
    [duration]
  );

  const onBarPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    seekFromClientX(e.clientX, e.currentTarget);
  };
  const onBarPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    seekFromClientX(e.clientX, e.currentTarget);
  };
  const onBarPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const durationLabel = duration > 0 ? formatAudioSeconds(duration) : '0:00';

  return (
    <div
      className={clsx(
        'min-w-[220px] max-w-[min(100%,320px)]',
        reserveCornerForMeta ? 'pb-4 pr-12 pt-0.5' : 'py-0.5',
        isOwn ? '' : 'rounded-lg bg-gray-100/80 px-2 py-2 dark:bg-gray-800/60'
      )}
    >
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" aria-hidden />
      {/* Grid: play e barra na mesma linha (alinhados ao centro); tempo só sob a barra */}
      <div className="grid w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1">
        <button
          type="button"
          onClick={toggle}
          className={clsx(
            'col-start-1 row-start-1 flex size-10 items-center justify-center rounded-full border transition-colors active:scale-[0.98]',
            isOwn
              ? ownChatAudioPlayBtnClass
              : 'border-red-600/40 text-red-600 hover:bg-red-600/10 dark:border-red-500/50 dark:text-red-400'
          )}
          aria-label={playing ? 'Pausar áudio' : 'Reproduzir áudio'}
        >
          {playing ? (
            <Pause size={18} strokeWidth={2} className="shrink-0" />
          ) : (
            <Play size={18} strokeWidth={2} className="shrink-0 translate-x-[1px]" />
          )}
        </button>
        <div
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={Math.round(duration) || 0}
          aria-valuenow={Math.round(current)}
          aria-label="Posição do áudio"
          className={clsx(
            'col-start-2 row-start-1 flex w-full min-w-0 cursor-pointer items-center py-2 outline-none focus-visible:ring-2 focus-visible:ring-offset-1 rounded-sm',
            isOwn
              ? ownChatAudioFocusClass
              : 'focus-visible:ring-red-500/50 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-offset-gray-800'
          )}
          onPointerDown={onBarPointerDown}
          onPointerMove={onBarPointerMove}
          onPointerUp={onBarPointerUp}
          onPointerCancel={onBarPointerUp}
          onKeyDown={(e) => {
            const el = audioRef.current;
            if (!el) return;
            const d = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
            if (!d) return;
            const step = Math.max(1, d / 20);
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              el.currentTime = Math.min(d, el.currentTime + step);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              el.currentTime = Math.max(0, el.currentTime - step);
            }
          }}
        >
          <div className="relative h-2 w-full shrink-0 overflow-visible rounded-full">
            <div
              className={clsx(
                'absolute inset-0 rounded-full',
                isOwn ? ownChatAudioTrackBgClass : 'bg-gray-300 dark:bg-gray-600'
              )}
              aria-hidden
            />
            <div
              className={clsx(
                'absolute left-0 top-0 h-full rounded-full transition-[width] duration-100',
                isOwn ? ownChatAudioTrackFillClass : 'bg-red-600 dark:bg-red-500'
              )}
              style={{ width: `${progressPct}%` }}
              aria-hidden
            />
            <div
              className={clsx(
                'absolute top-1/2 z-[1] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 shadow-sm transition-[left] duration-100',
                isOwn ? ownChatAudioThumbClass : 'border-white bg-red-600 dark:bg-red-500'
              )}
              style={{ left: `${progressPct}%` }}
              aria-hidden
            />
          </div>
        </div>
        <p
          className={clsx(
            'col-start-2 row-start-2 text-left tabular-nums text-[11px] font-medium leading-none',
            isOwn ? ownChatAudioTimeClass : 'text-gray-600 dark:text-gray-400'
          )}
        >
          {formatAudioSeconds(current)}
          <span className="mx-1 opacity-45">/</span>
          {durationLabel}
        </p>
      </div>
    </div>
  );
}

function formatCallDurationPt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return mm > 0 ? `${h} h ${mm} min` : `${h} h`;
  }
  return rem > 0 ? `${m} min ${rem} s` : `${m} min`;
}

/** Exibe mensagens de sistema CALL_LOG / CALL_STARTED em português no chat. */
function formatSystemChatContent(raw: string): string {
  if (raw.startsWith('CALL_LOG:')) {
    try {
      const payload = JSON.parse(raw.slice('CALL_LOG:'.length)) as {
        mode: 'direct' | 'group';
        type: 'voice' | 'video';
        durationSec: number;
        status: 'answered' | 'missed' | 'rejected' | 'cancelled';
      };
      const isVideo = payload.type === 'video';
      const kindShort = isVideo ? 'Videochamada' : 'Ligação de voz';
      const kindGroup = payload.mode === 'group' ? `${kindShort} em grupo` : kindShort;
      const dur = formatCallDurationPt(payload.durationSec ?? 0);

      if (payload.status === 'rejected') {
        return payload.mode === 'group' ? 'Alguém recusou a chamada em grupo.' : 'Ligação recusada.';
      }
      if (payload.status === 'cancelled') {
        return payload.mode === 'group' ? 'Chamada em grupo encerrada.' : 'Ligação cancelada.';
      }
      if (payload.status === 'missed') {
        if (payload.mode === 'group') {
          return (payload.durationSec ?? 0) >= 30
            ? `Chamada encerrada · ${dur}`
            : `${kindGroup} não atendida`;
        }
        return isVideo ? 'Videochamada perdida' : 'Ligação perdida';
      }
      return `${kindGroup} · duração ${dur}`;
    } catch {
      return raw;
    }
  }
  if (raw.startsWith('CALL_STARTED:')) {
    try {
      const payload = JSON.parse(raw.slice('CALL_STARTED:'.length)) as {
        mode: 'direct' | 'group';
        type: 'voice' | 'video';
        initiatorName: string;
      };
      const n = payload.initiatorName || 'Alguém';
      const video = payload.type === 'video';
      if (payload.mode === 'group') {
        return video ? `${n} iniciou uma videochamada em grupo.` : `${n} iniciou uma ligação de voz em grupo.`;
      }
      return video ? `${n} iniciou uma videochamada.` : `${n} iniciou uma ligação de voz.`;
    } catch {
      return raw;
    }
  }
  return raw;
}

function isCallEventMessageContent(content: string | undefined | null): boolean {
  if (!content) return false;
  return content.startsWith('CALL_LOG:') || content.startsWith('CALL_STARTED:');
}

/** API às vezes não devolve isSystem=true; conteúdo CALL_* ainda deve ser tratado como sistema. */
function messageIsSystemLike(m: Pick<Message, 'isSystem' | 'content'>): boolean {
  return Boolean(m.isSystem) || isCallEventMessageContent(m.content);
}

function getReplyQuoteSnippet(reply: MessageReplyPreview) {
  if (reply.deletedAt) return 'Mensagem apagada';
  if (reply.isSystem || isCallEventMessageContent(reply.content))
    return formatSystemChatContent(reply.content || '') || 'Evento';
  if (reply.content && reply.content !== '📎') {
    const t = reply.content.trim();
    return t.length > 160 ? `${t.slice(0, 157)}…` : t;
  }
  const att = reply.attachments?.[0];
  if (att) {
    if (isImageMime(att.mimeType ?? null)) return '📷 Foto';
    if (isAudioMime(att.mimeType ?? null)) return '🎤 Mensagem de voz';
    return `📎 ${normalizeAttachmentName(att.fileName)}`;
  }
  return 'Mensagem';
}

function isMessageFavorited(m: Message) {
  return (m.favorites?.length ?? 0) > 0;
}

const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

const CHAT_REACTIONS_STORAGE_KEY = 'gennesis-chat-message-reactions';

/** Reações rápidas (estilo WhatsApp) — persistidas por chat/mensagem no dispositivo */
const QUICK_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'] as const;
const EXTRA_REACTION_EMOJIS = ['🔥', '👏', '🎉', '😀', '✅', '👋', '💯', '🙌', '💖', '😍'] as const;

function loadChatReactionsFromStorage(): Record<string, Record<string, string>> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(CHAT_REACTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Record<string, string>>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persistChatReactions(data: Record<string, Record<string, string>>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CHAT_REACTIONS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota */
  }
}

/** Só o remetente, mensagem não apagada, até 15 min após o envio */
function canEditOrDeleteMessage(m: Message, currentUserId: string | undefined): boolean {
  if (messageIsSystemLike(m)) return false;
  if (!currentUserId || m.senderId !== currentUserId) return false;
  if (m.deletedAt) return false;
  const elapsed = Date.now() - new Date(m.createdAt).getTime();
  return elapsed >= 0 && elapsed <= MESSAGE_EDIT_WINDOW_MS;
}

function getMessageSearchPreview(m: Message) {
  if (m.deletedAt) return 'Mensagem apagada';
  if (messageIsSystemLike(m)) return formatSystemChatContent(m.content || '');
  if (m.content && m.content !== '📎') return m.content;
  if (m.attachments?.length) {
    const a0 = m.attachments[0];
    if (isAudioMime(a0.mimeType)) return '🎤 Mensagem de voz';
    if (isImageMime(a0.mimeType)) return '📷 Foto';
    return a0.fileName || 'Anexo';
  }
  return 'Mensagem';
}

const AVATAR_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-green-500',
  'bg-orange-500',
  'bg-pink-500',
  'bg-teal-500',
  'bg-red-500',
  'bg-indigo-500',
];

function avatarColor(id: string) {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[n];
}

// ─── Avatar component ─────────────────────────────────────────────────────────

function Avatar({ user, size = 'md' }: { user: UserBasic; size?: 'sm' | 'md' | 'lg' | 'list' | 'xl' }) {
  const sizeClass = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    list: 'w-12 h-12 text-base',
    xl: 'w-24 h-24 text-3xl',
  }[size];
  let photoUrl = user.profilePhotoUrl ?? null;
  if (
    isGennecyBotUser(user) &&
    (!photoUrl || photoUrl.includes('logoredonda'))
  ) {
    photoUrl = GENNECY_BOT_AVATAR_PATH;
  }
  const resolved = resolveApiMediaUrl(photoUrl);
  return (
    <div
      className={clsx(
        'rounded-full flex items-center justify-center overflow-hidden text-white font-semibold flex-shrink-0',
        sizeClass,
        resolved ? '' : avatarColor(user.id)
      )}
    >
      {resolved ? (
        <img src={resolved} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        getInitials(user.name)
      )}
    </div>
  );
}

function GroupChatAvatar({ avatarUrl, size = 'md' }: { avatarUrl?: string | null; size?: 'md' | 'list' | 'xl' }) {
  const resolved = resolveApiMediaUrl(avatarUrl ?? null);
  const box = size === 'xl' ? 'w-24 h-24' : size === 'list' ? 'w-12 h-12' : 'w-10 h-10';
  const iconSize = size === 'xl' ? 40 : size === 'list' ? 20 : 18;
  return (
    <div
      className={clsx(
        'rounded-full bg-green-500 text-white flex items-center justify-center overflow-hidden flex-shrink-0',
        box
      )}
    >
      {resolved ? (
        <img src={resolved} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <Users size={iconSize} />
      )}
    </div>
  );
}

/** Mesmo padrão visual dos checkboxes modais em Drive/Orçamento (caixa 20×20, vermelho, check SVG). */
function GroupMemberPickCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span
        className={clsx(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all shadow-sm outline-none group-focus-within:ring-2 group-focus-within:ring-red-500/80 group-focus-within:ring-offset-2 ring-offset-white dark:ring-offset-gray-800',
          checked
            ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
            : 'border-gray-300 bg-white group-hover:border-red-400 dark:border-gray-500 dark:bg-gray-800 dark:group-hover:border-red-400/70',
          disabled && 'opacity-45'
        )}
        aria-hidden
      >
        {checked && (
          <svg className="h-3 w-3 text-white pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ConversasPage() {
  const router = useRouter();
  const { user } = usePermissions();

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  return (
    <MainLayout userRole="EMPLOYEE" userName={user?.name || ''} onLogout={handleLogout}>
      <ConversasContent />
    </MainLayout>
  );
}

interface GroupPhotoCropState {
  imageSrc: string;
  intent:
    | { kind: 'new-group' }
    | { kind: 'group-avatar'; chatId: string };
}

function ConversasContent() {
  const MIN_LEFT_PANEL_WIDTH = 320;
  const MIN_RIGHT_PANEL_WIDTH = 480;

  const { user: currentUser, isLoading: isLoadingUser } = usePermissions();
  const nativeCall = useNativeCallContext();
  const queryClient = useQueryClient();

  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUsers, setShowUsers] = useState(false);
  const [groupMembers, setGroupMembers] = useState<string[]>([]);
  // Modal "Novo grupo"
  const [showNewGroupModal, setShowNewGroupModal] = useState(false);
  const [newGroupModalStep, setNewGroupModalStep] = useState<1 | 2>(1);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [newGroupPhotoFile, setNewGroupPhotoFile] = useState<File | null>(null);
  const [newGroupPhotoPreview, setNewGroupPhotoPreview] = useState<string | null>(null);
  const [newGroupMemberSearch, setNewGroupMemberSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [mentionMenu, setMentionMenu] = useState<{
    start: number;
    query: string;
    activeIndex: number;
  } | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [composeImageIndex, setComposeImageIndex] = useState(0);
  const imageAttachInputRef = useRef<HTMLInputElement>(null);

  const imageAttachmentIndices = useMemo(
    () =>
      attachedFiles
        .map((f, index) => (f.type.startsWith('image/') ? index : -1))
        .filter((index) => index >= 0),
    [attachedFiles],
  );

  const hasImageCompose = imageAttachmentIndices.length > 0;
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showGroupDetails, setShowGroupDetails] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [editingGroupDescription, setEditingGroupDescription] = useState(false);
  const [groupDescriptionDraft, setGroupDescriptionDraft] = useState('');
  const [groupMemberSearch, setGroupMemberSearch] = useState('');
  const [showAddGroupMembers, setShowAddGroupMembers] = useState(false);
  const [addMemberPickSearch, setAddMemberPickSearch] = useState('');
  const [addMemberPickSelection, setAddMemberPickSelection] = useState<string[]>([]);
  const [contactDetailsUser, setContactDetailsUser] = useState<UserBasic | null>(null);
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [msgSearchQuery, setMsgSearchQuery] = useState('');
  const msgSearchInputRef = useRef<HTMLInputElement>(null);
  const [showStarredMsgSidebar, setShowStarredMsgSidebar] = useState(false);
  const [starredMsgSearchQuery, setStarredMsgSearchQuery] = useState('');
  const starredMsgInputRef = useRef<HTMLInputElement>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [showEditModalEmojiPicker, setShowEditModalEmojiPicker] = useState(false);
  const editModalTextareaRef = useRef<HTMLInputElement>(null);
  const editModalEmojiWrapRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [messageContextMenu, setMessageContextMenu] = useState<{
    x: number;
    y: number;
    messageId: string;
    isFavorited: boolean;
    isPinned: boolean;
  } | null>(null);
  /** Mensagem sendo respondida (envio usa `replyToId` na API) */
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  /** Reações locais: chatId → messageId → emoji */
  const [reactionsByChat, setReactionsByChat] = useState<Record<string, Record<string, string>>>({});
  const [reactionPickerForMessageId, setReactionPickerForMessageId] = useState<string | null>(null);
  const [reactionPickerShowMore, setReactionPickerShowMore] = useState(false);
  const [voiceRecordingActive, setVoiceRecordingActive] = useState(false);
  const [voiceRecordingMs, setVoiceRecordingMs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<BlobPart[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceRecordingActiveRef = useRef(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState(MIN_LEFT_PANEL_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false);
  const chatHeaderMenuRef = useRef<HTMLDivElement | null>(null);

  const layoutRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const emojiContainerRef = useRef<HTMLDivElement>(null);
  const newGroupPhotoInputRef = useRef<HTMLInputElement>(null);
  const groupAvatarInputRef = useRef<HTMLInputElement>(null);
  const [groupPhotoCrop, setGroupPhotoCrop] = useState<GroupPhotoCropState | null>(null);

  const closeGroupPhotoCrop = useCallback(() => {
    setGroupPhotoCrop((prev) => {
      if (prev?.imageSrc.startsWith('blob:')) URL.revokeObjectURL(prev.imageSrc);
      return null;
    });
  }, []);

  const handleGroupPhotoCropConfirm = async (file: File) => {
    if (!groupPhotoCrop) return;
    const { intent } = groupPhotoCrop;
    if (groupPhotoCrop.imageSrc.startsWith('blob:')) {
      URL.revokeObjectURL(groupPhotoCrop.imageSrc);
    }
    setGroupPhotoCrop(null);

    if (intent.kind === 'new-group') {
      setNewGroupPhotoFile(file);
      const url = URL.createObjectURL(file);
      setNewGroupPhotoPreview((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
        return url;
      });
    } else {
      uploadGroupAvatarMutation.mutate({ chatId: intent.chatId, file });
    }
  };

  const handleGroupPhotoReplaceSource = useCallback((picked: File) => {
    setGroupPhotoCrop((prev) => {
      if (prev?.imageSrc.startsWith('blob:')) URL.revokeObjectURL(prev.imageSrc);
      if (!prev) return null;
      return { ...prev, imageSrc: URL.createObjectURL(picked) };
    });
  }, []);

  const [groupAvatarMenu, setGroupAvatarMenu] = useState(false);
  const [showGroupAvatarViewer, setShowGroupAvatarViewer] = useState(false);
  const [messageImageViewer, setMessageImageViewer] = useState<{ src: string; name: string } | null>(null);
  const groupAvatarMenuRef = useRef<HTMLDivElement>(null);

  const closeEditModal = useCallback(() => {
    setEditingMessageId(null);
    setEditDraft('');
    setShowEditModalEmojiPicker(false);
  }, []);

  // Responsive
  useEffect(() => {
    const check = () => setIsMobileView(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const syncLeftPanelWidth = useCallback(() => {
    if (!layoutRef.current || isMobileView) return;
    const rect = layoutRef.current.getBoundingClientRect();
    if (rect.width <= 0) return;
    const max = Math.max(MIN_LEFT_PANEL_WIDTH, rect.width - MIN_RIGHT_PANEL_WIDTH);
    setLeftPanelWidth((prev) => Math.min(Math.max(prev, MIN_LEFT_PANEL_WIDTH), max));
  }, [isMobileView, MIN_LEFT_PANEL_WIDTH, MIN_RIGHT_PANEL_WIDTH]);

  useLayoutEffect(() => {
    syncLeftPanelWidth();
  }, [syncLeftPanelWidth]);

  useEffect(() => {
    if (!layoutRef.current || isMobileView) return;
    const el = layoutRef.current;
    const ro = new ResizeObserver(() => syncLeftPanelWidth());
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobileView, syncLeftPanelWidth]);

  useEffect(() => {
    if (!isResizing || isMobileView) return;

    const onMouseMove = (e: MouseEvent) => {
      if (!layoutRef.current) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const max = Math.max(MIN_LEFT_PANEL_WIDTH, rect.width - MIN_RIGHT_PANEL_WIDTH);
      const next = e.clientX - rect.left;
      setLeftPanelWidth(Math.min(Math.max(next, MIN_LEFT_PANEL_WIDTH), max));
    };

    const onMouseUp = () => setIsResizing(false);

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing, isMobileView]);

  const authReady = hasStoredAuthToken() && !!currentUser;

  // Queries
  const {
    data: chats = [],
    isLoading: chatsLoading,
    isError: chatsError,
    refetch: refetchChats,
  } = useQuery({
    queryKey: ['directChats'],
    queryFn: fetchDirectChats,
    enabled: authReady,
    staleTime: 5_000,
    refetchInterval: () => (authReady ? visibleTabRefetchInterval(8_000) : false),
  });

  const chatsListLoading =
    isLoadingUser || (hasStoredAuthToken() && !currentUser) || (authReady && chatsLoading);

  useEffect(() => {
    const onTokenRefreshed = () => {
      void queryClient.invalidateQueries({ queryKey: ['directChats'] });
    };
    window.addEventListener(AUTH_TOKEN_REFRESHED_EVENT, onTokenRefreshed);
    return () => window.removeEventListener(AUTH_TOKEN_REFRESHED_EVENT, onTokenRefreshed);
  }, [queryClient]);

  useEffect(() => {
    const saved = sessionStorage.getItem(SELECTED_CHAT_STORAGE_KEY);
    if (saved) setSelectedChatId(saved);
  }, []);

  useEffect(() => {
    if (selectedChatId) {
      sessionStorage.setItem(SELECTED_CHAT_STORAGE_KEY, selectedChatId);
    } else {
      sessionStorage.removeItem(SELECTED_CHAT_STORAGE_KEY);
    }
  }, [selectedChatId]);

  useEffect(() => {
    if (!selectedChatId || chatsLoading) return;
    if (!chats.some((chat) => chat.id === selectedChatId)) {
      setSelectedChatId(null);
    }
  }, [chats, chatsLoading, selectedChatId]);

  useEffect(() => {
    if (!authReady) return;
    void queryClient.prefetchQuery({
      queryKey: ['chatUsers'],
      queryFn: fetchUsers,
      staleTime: 5 * 60 * 1000,
    });
  }, [authReady, queryClient]);

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['chatUsers'],
    queryFn: fetchUsers,
    enabled: authReady,
    staleTime: 5 * 60 * 1000,
  });

  const { data: activeChat, isLoading: chatLoading } = useQuery({
    queryKey: ['directChat', selectedChatId],
    queryFn: async () => {
      const chatId = selectedChatId!;
      const cached = queryClient.getQueryData<DirectChat>(['directChat', chatId]);
      const lastMsg = cached?.messages?.length
        ? cached.messages[cached.messages.length - 1]
        : undefined;
      if (cached && lastMsg?.createdAt) {
        const delta = await fetchDirectChatById(chatId, { since: lastMsg.createdAt });
        if (!delta.messages?.length) {
          return { ...cached, ...delta, messages: cached.messages };
        }
        return mergeDirectChatMessages(cached, delta);
      }
      return fetchDirectChatById(chatId);
    },
    enabled: !!selectedChatId,
    staleTime: 3_000,
    refetchInterval: () => visibleTabRefetchInterval(6_000),
  });

  const rejoinContextGroupId =
    activeChat?.chatType === 'GROUP'
      ? activeChat.id
      : activeChat?.chatType === 'GROUP_CALL' && activeChat.parentGroupChatId
        ? activeChat.parentGroupChatId
        : null;

  const { data: activeNativeGroupCall } = useQuery({
    queryKey: ['activeNativeGroupCall', rejoinContextGroupId ?? ''],
    queryFn: () => fetchActiveNativeGroupCall(rejoinContextGroupId!),
    enabled: Boolean(rejoinContextGroupId),
    refetchInterval: () => visibleTabRefetchInterval(8_000),
  });

  const viewingGroupOrCallSideForActiveCall =
    !!nativeCall.activeChatId &&
    (selectedChatId === nativeCall.activeChatId ||
      (activeChat?.chatType === 'GROUP_CALL' &&
        activeChat.parentGroupChatId === nativeCall.activeChatId));

  const suppressGroupRejoinBanner =
    viewingGroupOrCallSideForActiveCall &&
    nativeCall.isGroupCall &&
    (nativeCall.phase === 'calling' ||
      nativeCall.phase === 'connected' ||
      nativeCall.phase === 'ringing');

  const showGroupCallRejoinBanner = Boolean(
    rejoinContextGroupId &&
      activeNativeGroupCall?.active &&
      activeNativeGroupCall.userInCall === false &&
      !suppressGroupRejoinBanner &&
      activeNativeGroupCall.callId
  );

  useEffect(() => {
    if (!nativeCall.callSideChatId || !nativeCall.isGroupCall) return;
    if (nativeCall.phase !== 'connected') return;
    if (selectedChatId === nativeCall.callSideChatId) return;
    setSelectedChatId(nativeCall.callSideChatId);
  }, [nativeCall.callSideChatId, nativeCall.isGroupCall, nativeCall.phase, selectedChatId]);

  useEffect(() => {
    setContactDetailsUser(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  }, [selectedChatId]);

  useEffect(() => {
    syncConversasActiveChatId(selectedChatId);
    return () => syncConversasActiveChatId(null);
  }, [selectedChatId]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  useEffect(() => {
    if (!showEmojiPicker) return;
    const onDown = (e: MouseEvent) => {
      if (emojiContainerRef.current && !emojiContainerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showEmojiPicker]);

  useEffect(() => {
    if (!activeChat || activeChat.chatType !== 'GROUP') {
      setShowGroupDetails(false);
      setGroupMemberSearch('');
      setShowAddGroupMembers(false);
      setAddMemberPickSearch('');
      setAddMemberPickSelection([]);
    }
  }, [activeChat?.id, activeChat?.chatType]);

  const inviteGroupConference = useCallback(
    (mode: 'video' | 'audio') => {
      if (!currentUser?.id || !activeChat) return;
      const groupChatId =
        activeChat.chatType === 'GROUP'
          ? activeChat.id
          : activeChat.chatType === 'GROUP_CALL' && activeChat.parentGroupChatId
            ? activeChat.parentGroupChatId
            : null;
      if (!groupChatId) return;
      const ids = activeChat.participants?.filter((p) => p.userId !== currentUser.id).map((p) => p.userId) ?? [];
      if (ids.length === 0) {
        toast.error('Sem outros participantes para convidar.');
        return;
      }
      void nativeCall.startGroupOutgoing(groupChatId, mode === 'video', ids);
    },
    [activeChat, currentUser?.id, nativeCall]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('callInvite');
    if (!inviteToken) return;
    const video = params.get('callType') !== 'audio';
    void nativeCall.joinGroupFromInvite(inviteToken, video);
  }, [nativeCall]);

  useEffect(() => {
    if (!showGroupDetails) {
      setEditingGroupName(false);
      setEditingGroupDescription(false);
      setShowAddGroupMembers(false);
      setAddMemberPickSearch('');
      setAddMemberPickSelection([]);
      setShowStarredMsgSidebar(false);
      setStarredMsgSearchQuery('');
    }
  }, [showGroupDetails]);

  useEffect(() => {
    if (showStarredMsgSidebar) {
      setTimeout(() => starredMsgInputRef.current?.focus(), 50);
    } else {
      setStarredMsgSearchQuery('');
    }
  }, [showStarredMsgSidebar]);

  useEffect(() => {
    if (!contactDetailsUser) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setContactDetailsUser(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [contactDetailsUser]);

  // Mark as read
  useEffect(() => {
    if (!selectedChatId || !activeChat || !currentUser) return;
    const unread = activeChat.messages.some(
      m => !m.isRead && m.senderId !== currentUser.id
    );
    if (unread) {
      markAsRead(selectedChatId).then(() => {
        queryClient.invalidateQueries({ queryKey: ['directChats'] });
      });
    }
  }, [activeChat, selectedChatId, currentUser, queryClient]);

  // Mutations
  const openChatMutation = useMutation({
    mutationFn: openDirectChat,
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      setSelectedChatId(chat.id);
      setShowUsers(false);
      setUserSearch('');
    },
    onError: () => toast.error('Erro ao abrir conversa'),
  });

  const openGennecyChatMutation = useMutation({
    mutationFn: openGennecyDirectChat,
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      setSelectedChatId(chat.id);
      setShowUsers(false);
      setUserSearch('');
      setSearchTerm('');
    },
    onError: () => toast.error('Erro ao abrir conversa com a Gennecy'),
  });

  const handleOpenGennecyChat = useCallback(() => {
    const existing = chats.find((c) => {
      if (c.chatType === 'GROUP' || c.chatType === 'GROUP_CALL') return false;
      const other =
        currentUser && c.initiatorId === currentUser.id ? c.recipient : c.initiator;
      return isGennecyBotUser(other);
    });
    if (existing) {
      setSelectedChatId(existing.id);
      setShowUsers(false);
      setUserSearch('');
      setSearchTerm('');
      return;
    }
    openGennecyChatMutation.mutate();
  }, [chats, currentUser, openGennecyChatMutation]);

  const closeNewGroupModal = useCallback(() => {
    setShowNewGroupModal(false);
    setNewGroupModalStep(1);
    setNewGroupName('');
    setNewGroupDescription('');
    setNewGroupPhotoFile(null);
    setNewGroupPhotoPreview((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
      return null;
    });
    setNewGroupMemberSearch('');
    setGroupMembers([]);
    setGroupPhotoCrop((prev) => {
      if (prev?.imageSrc.startsWith('blob:')) URL.revokeObjectURL(prev.imageSrc);
      return null;
    });
  }, []);

  const createGroupMutation = useMutation({
    mutationFn: createGroupChat,
    onSuccess: (chat) => {
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      setSelectedChatId(chat.id);
      setShowUsers(false);
      closeNewGroupModal();
      toast.success('Grupo criado com sucesso');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao criar grupo');
    }
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({
      chatId,
      groupName,
      groupDescription,
    }: {
      chatId: string;
      groupName?: string;
      groupDescription?: string | null;
    }) => updateGroupChatApi(chatId, { groupName, groupDescription }),
    onSuccess: (data) => {
      queryClient.setQueryData(['directChat', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      toast.success('Grupo atualizado');
      setEditingGroupName(false);
      setEditingGroupDescription(false);
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error || err?.response?.data?.message || 'Erro ao atualizar grupo'
      );
    },
  });

  const uploadGroupAvatarMutation = useMutation({
    mutationFn: ({ chatId, file }: { chatId: string; file: File }) =>
      uploadGroupAvatarApi(chatId, file),
    onSuccess: (data) => {
      queryClient.setQueryData(['directChat', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      toast.success('Foto do grupo atualizada');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao carregar foto');
    },
  });

  const removeGroupAvatarMutation = useMutation({
    mutationFn: (chatId: string) => removeGroupAvatarApi(chatId),
    onSuccess: (data) => {
      queryClient.setQueryData(['directChat', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      toast.success('Foto do grupo removida');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Erro ao remover foto');
    },
  });

  const addGroupMembersMutation = useMutation({
    mutationFn: ({ chatId, participantIds }: { chatId: string; participantIds: string[] }) =>
      addGroupMembersApi(chatId, participantIds),
    onSuccess: (data) => {
      queryClient.setQueryData(['directChat', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      setShowAddGroupMembers(false);
      setAddMemberPickSelection([]);
      setAddMemberPickSearch('');
      toast.success('Membro(s) adicionado(s) ao grupo');
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error || err?.response?.data?.message || 'Erro ao adicionar membros'
      );
    },
  });

  useEffect(() => {
    if (!showAddGroupMembers) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (addGroupMembersMutation.isPending) return;
      setShowAddGroupMembers(false);
      setAddMemberPickSelection([]);
      setAddMemberPickSearch('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAddGroupMembers, addGroupMembersMutation.isPending]);

  const removeGroupMemberMutation = useMutation({
    mutationFn: ({ chatId, userId }: { chatId: string; userId: string }) =>
      removeGroupMemberApi(chatId, userId),
    onSuccess: (data) => {
      queryClient.setQueryData(['directChat', data.id], data);
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      toast.success('Membro removido do grupo');
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error || err?.response?.data?.message || 'Erro ao remover membro'
      );
    },
  });

  const leaveGroupMutation = useMutation({
    mutationFn: leaveGroupChat,
    onSuccess: (_, chatId) => {
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      queryClient.invalidateQueries({ queryKey: ['chat-unread-count', currentUser?.id] });
      queryClient.removeQueries({ queryKey: ['directChat', chatId] });
      setShowGroupDetails(false);
      setGroupMemberSearch('');
      if (selectedChatId === chatId) {
        setSelectedChatId(null);
      }
      toast.success('Você saiu do grupo');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Erro ao sair do grupo');
    },
  });

  const sendMutation = useMutation({
    mutationFn: sendDirectMessage,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['directChat', selectedChatId] });
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      if (selectedChatId) {
        queryClient.invalidateQueries({ queryKey: ['chatTopics', selectedChatId] });
      }
      setMessageInput('');
      setAttachedFiles([]);
      setReplyingTo(null);
      if (textareaRef.current) {
        textareaRef.current.style.height = '44px';
      }
      if (result?.gennecyProcessing) {
        const gennecyToast =
          result.gennecyMode === 'task'
            ? 'Gennecy está criando o card no Tasks…'
            : 'Gennecy está respondendo…';
        toast(gennecyToast, { icon: '🤖', duration: 5000 });
        window.setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['directChat', selectedChatId] });
        }, 3500);
      }
    },
    onError: () => toast.error('Erro ao enviar mensagem'),
  });

  const mergeUpdatedMessage = useCallback((base: Message, updated: Message): Message => {
    return {
      ...base,
      ...updated,
      senderId: updated.senderId ?? base.senderId,
      chatId: updated.chatId ?? base.chatId,
      sender: updated.sender ?? base.sender,
      attachments: updated.attachments ?? base.attachments,
      replyTo: updated.replyTo !== undefined ? updated.replyTo : base.replyTo,
    };
  }, []);

  const messageContextMenuRef = useRef<HTMLDivElement | null>(null);

  const messageFavoriteMutation = useMutation({
    mutationFn: async ({ messageId, favorited }: { messageId: string; favorited: boolean }) => {
      return favorited ? favoriteMessageApi(messageId) : unfavoriteMessageApi(messageId);
    },
    onSuccess: (updated) => {
      if (!selectedChatId) return;
      setMessageContextMenu(null);
      queryClient.setQueryData(['directChat', selectedChatId], (old: DirectChat | undefined) => {
        if (!old) return old;
        return {
          ...old,
          messages: old.messages.map((m) =>
            m.id === updated.id ? mergeUpdatedMessage(m, updated) : m
          ),
        };
      });
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
    },
    onError: () => {
      toast.error('Não foi possível atualizar o favorito');
    },
  });

  const pinMessageMutation = useMutation({
    mutationFn: async ({ chatId, messageId, unpin }: { chatId: string; messageId?: string; unpin?: boolean }) => {
      return unpin ? unpinMessageApi(chatId) : pinMessageApi(chatId, messageId!);
    },
    onSuccess: (updatedChat) => {
      if (!updatedChat?.id) {
        toast.error('Resposta inválida do servidor');
        return;
      }
      setMessageContextMenu(null);
      queryClient.setQueryData(['directChat', updatedChat.id], updatedChat);
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      toast.success(updatedChat.pinnedMessageId ? 'Fixada' : 'Desafixada');
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.error || err?.response?.data?.message || 'Não foi possível atualizar a mensagem fixada';
      toast.error(msg);
    },
  });

  const editMessageMutation = useMutation({
    mutationFn: ({ messageId, content }: { messageId: string; content: string }) => editMessageApi(messageId, content),
    onSuccess: (updated) => {
      if (!selectedChatId) return;
      setMessageContextMenu(null);
      closeEditModal();
      queryClient.setQueryData(['directChat', selectedChatId], (old: DirectChat | undefined) => {
        if (!old) return old;
        const messages = old.messages.map((m) => (m.id === updated.id ? mergeUpdatedMessage(m, updated) : m));
        const pinThis = old.pinnedMessageId === updated.id && old.pinnedMessage;
        return {
          ...old,
          messages,
          pinnedMessage: pinThis ? mergeUpdatedMessage(old.pinnedMessage!, updated) : old.pinnedMessage,
        };
      });
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error || err?.response?.data?.message || 'Não foi possível editar a mensagem'
      );
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: (messageId: string) => deleteMessageApi(messageId),
    onSuccess: (updated) => {
      if (!selectedChatId) return;
      setMessageContextMenu(null);
      closeEditModal();
      queryClient.setQueryData(['directChat', selectedChatId], (old: DirectChat | undefined) => {
        if (!old) return old;
        const messages = old.messages.map((m) =>
          m.id === updated.id
            ? {
                ...m,
                content: updated.content ?? '',
                deletedAt: updated.deletedAt ?? m.deletedAt ?? new Date().toISOString(),
                attachments: updated.attachments ?? m.attachments,
                favorites: updated.favorites ?? m.favorites,
              }
            : m
        );
        const clearPin = old.pinnedMessageId === updated.id;
        return {
          ...old,
          messages,
          pinnedMessageId: clearPin ? null : old.pinnedMessageId,
          pinnedMessage: clearPin ? null : old.pinnedMessage,
        };
      });
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      toast.success('Mensagem apagada');
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error || err?.response?.data?.message || 'Não foi possível apagar a mensagem'
      );
    },
  });

  const hideMessageForMeMutation = useMutation({
    mutationFn: hideMessageForMeApi,
    onSuccess: () => {
      setMessageContextMenu(null);
      if (selectedChatId) queryClient.invalidateQueries({ queryKey: ['directChat', selectedChatId] });
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      queryClient.invalidateQueries({ queryKey: ['chat-unread-count', currentUser?.id] });
      toast.success('Mensagem oculta para você');
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error || err?.response?.data?.message || 'Não foi possível ocultar a mensagem'
      );
    },
  });

  const clearConversationForMeMutation = useMutation({
    mutationFn: clearConversationForMeApi,
    onSuccess: () => {
      setChatHeaderMenuOpen(false);
      if (selectedChatId) queryClient.invalidateQueries({ queryKey: ['directChat', selectedChatId] });
      queryClient.invalidateQueries({ queryKey: ['directChats'] });
      queryClient.invalidateQueries({ queryKey: ['chat-unread-count', currentUser?.id] });
      toast.success('Histórico limpo para você. Novas mensagens continuarão aparecendo.');
    },
    onError: (err: any) => {
      toast.error(
        err?.response?.data?.error || err?.response?.data?.message || 'Não foi possível limpar a conversa'
      );
    },
  });

  useEffect(() => {
    if (!chatHeaderMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (chatHeaderMenuRef.current?.contains(e.target as Node)) return;
      setChatHeaderMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [chatHeaderMenuOpen]);

  const contextMenuMessage = useMemo(() => {
    if (!messageContextMenu || !activeChat) return null;
    return activeChat.messages.find((m) => m.id === messageContextMenu.messageId) ?? null;
  }, [messageContextMenu, activeChat]);

  const canEditDeleteContext = useMemo(() => {
    return contextMenuMessage ? canEditOrDeleteMessage(contextMenuMessage, currentUser?.id) : false;
  }, [contextMenuMessage, currentUser?.id]);

  const editingMessageModal = useMemo(() => {
    if (!editingMessageId || !activeChat) return null;
    return activeChat.messages.find((m) => m.id === editingMessageId) ?? null;
  }, [editingMessageId, activeChat]);

  useEffect(() => {
    if (editingMessageId && activeChat && !editingMessageModal) {
      closeEditModal();
    }
  }, [editingMessageId, activeChat, editingMessageModal, closeEditModal]);

  useEffect(() => {
    if (!editingMessageId) return;
    document.body.classList.add('modal-open');
    return () => document.body.classList.remove('modal-open');
  }, [editingMessageId]);

  useEffect(() => {
    if (!editingMessageId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showEditModalEmojiPicker) {
        setShowEditModalEmojiPicker(false);
      } else {
        closeEditModal();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editingMessageId, closeEditModal, showEditModalEmojiPicker]);

  useEffect(() => {
    if (!showEditModalEmojiPicker) return;
    const onDown = (e: MouseEvent) => {
      if (editModalEmojiWrapRef.current?.contains(e.target as Node)) return;
      setShowEditModalEmojiPicker(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [showEditModalEmojiPicker]);

  useEffect(() => {
    if (!editingMessageId) return;
    const tid = window.setTimeout(() => editModalTextareaRef.current?.focus(), 80);
    return () => clearTimeout(tid);
  }, [editingMessageId]);

  // Mantém o menu de contexto dentro da viewport (evita corte no canto direito / inferior)
  useLayoutEffect(() => {
    if (!messageContextMenu) return;
    if (typeof window === 'undefined') return;
    const el = messageContextMenuRef.current;
    if (!el) return;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { width: w, height: h } = el.getBoundingClientRect();
    if (!w && !h) return;
    let { x, y } = messageContextMenu;
    if (x + w + margin > vw) x = Math.max(margin, vw - w - margin);
    if (x < margin) x = margin;
    if (y + h + margin > vh) y = Math.max(margin, vh - h - margin);
    if (y < margin) y = margin;
    if (x !== messageContextMenu.x || y !== messageContextMenu.y) {
      setMessageContextMenu((prev) => (prev ? { ...prev, x, y } : null));
    }
  }, [messageContextMenu, canEditDeleteContext]);

  // Fechar menu de contexto da mensagem (fora do painel, scroll, Escape)
  useEffect(() => {
    if (!messageContextMenu) return;
    const close = () => setMessageContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (messageContextMenuRef.current?.contains(e.target as Node)) return;
      close();
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onMouseDown, true);
    }, 0);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [messageContextMenu]);

  useEffect(() => {
    setMessageContextMenu(null);
  }, [selectedChatId]);

  useEffect(() => {
    setReplyingTo(null);
  }, [selectedChatId]);

  useEffect(() => {
    setMentionMenu(null);
  }, [selectedChatId]);

  useEffect(() => {
    setAttachedFiles([]);
    setComposeImageIndex(0);
  }, [selectedChatId]);

  useEffect(() => {
    if (composeImageIndex >= imageAttachmentIndices.length) {
      setComposeImageIndex(Math.max(0, imageAttachmentIndices.length - 1));
    }
  }, [composeImageIndex, imageAttachmentIndices.length]);

  const clearImageAttachments = useCallback(() => {
    setAttachedFiles((prev) => prev.filter((f) => !f.type.startsWith('image/')));
    setComposeImageIndex(0);
    setShowEmojiPicker(false);
  }, []);

  const mentionableUsers = useMemo((): UserBasic[] => {
    if (!activeChat || !currentUser) return [];
    if (activeChat.chatType === 'GROUP' || activeChat.chatType === 'GROUP_CALL') {
      return (activeChat.participants ?? [])
        .map((p) => p.user)
        .filter(
          (u): u is UserBasic =>
            Boolean(u?.id) && u.id !== currentUser.id && !isGennecyBotUser(u),
        );
    }
    const other =
      activeChat.initiatorId === currentUser.id ? activeChat.recipient : activeChat.initiator;
    if (!other || other.id === currentUser.id || isGennecyBotUser(other)) return [];
    return [other];
  }, [activeChat, currentUser]);

  const mentionOptions = useMemo(() => {
    if (!mentionMenu) return [];
    const inGennecyDm = isGennecyDirectChat(activeChat, currentUser?.id);
    return buildChatMentionOptions(mentionableUsers, mentionMenu.query, {
      includeGennecyAssistant: !inGennecyDm,
    });
  }, [mentionMenu, mentionableUsers, activeChat, currentUser?.id]);

  useEffect(() => {
    setReactionsByChat(loadChatReactionsFromStorage());
  }, []);

  useEffect(() => {
    setReactionPickerForMessageId(null);
    setReactionPickerShowMore(false);
  }, [selectedChatId]);

  useEffect(() => {
    if (!reactionPickerForMessageId) return;
    const close = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-reaction-picker-root]')) return;
      setReactionPickerForMessageId(null);
      setReactionPickerShowMore(false);
    };
    document.addEventListener('mousedown', close, true);
    return () => document.removeEventListener('mousedown', close, true);
  }, [reactionPickerForMessageId]);

  const applyMessageReaction = useCallback((messageId: string, emoji: string) => {
    if (!selectedChatId) return;
    setReactionsByChat((prev) => {
      const chatMap = { ...(prev[selectedChatId] || {}) };
      if (chatMap[messageId] === emoji) delete chatMap[messageId];
      else chatMap[messageId] = emoji;
      const next = { ...prev, [selectedChatId]: chatMap };
      persistChatReactions(next);
      return next;
    });
    setReactionPickerForMessageId(null);
    setReactionPickerShowMore(false);
  }, [selectedChatId]);

  const downloadAttachmentFile = useCallback(async (url: string, fileName: string) => {
    const triggerLinkDownload = (targetUrl: string, targetName: string) => {
      const link = document.createElement('a');
      link.href = targetUrl;
      link.download = targetName || 'anexo';
      link.rel = 'noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    try {
      const response = await api.get('/chats/direct/attachments/download', {
        params: { url, fileName },
        responseType: 'blob',
        timeout: 30000,
      });
      const blob = response.data as Blob;
      if (!(blob instanceof Blob)) throw new Error('Resposta de download inválida');
      const objectUrl = URL.createObjectURL(blob);
      triggerLinkDownload(objectUrl, fileName);
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      console.error('Falha ao baixar anexo:', error);
      toast.error('Não foi possível baixar o anexo.');
    }
  }, []);

  const handleSend = useCallback(() => {
    if (!selectedChatId) return;
    const text = messageInput.trim();
    if (!text && attachedFiles.length === 0) return;
    sendMutation.mutate({
      chatId: selectedChatId,
      content: text || '📎',
      files: attachedFiles,
      ...(replyingTo ? { replyToId: replyingTo.id } : {}),
      ...(selectedTopicId ? { topicId: selectedTopicId } : {}),
    });
  }, [selectedChatId, selectedTopicId, messageInput, attachedFiles, replyingTo, sendMutation]);

  const abortVoiceRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = () => {
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        mediaStreamRef.current = null;
      };
      try {
        recorder.stop();
      } catch {
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        recordingChunksRef.current = [];
        mediaRecorderRef.current = null;
        mediaStreamRef.current = null;
      }
    } else {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
    }
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    if (recordingMaxTimerRef.current) clearTimeout(recordingMaxTimerRef.current);
    recordingIntervalRef.current = null;
    recordingMaxTimerRef.current = null;
    voiceRecordingActiveRef.current = false;
    setVoiceRecordingActive(false);
    setVoiceRecordingMs(0);
  }, []);

  const stopVoiceRecordingAndSend = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== 'recording') return;
    recorder.onstop = () => {
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      const mime = recorder.mimeType || 'audio/webm';
      const blob = new Blob(recordingChunksRef.current, { type: mime });
      recordingChunksRef.current = [];
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (recordingMaxTimerRef.current) clearTimeout(recordingMaxTimerRef.current);
      recordingIntervalRef.current = null;
      recordingMaxTimerRef.current = null;
      voiceRecordingActiveRef.current = false;
      setVoiceRecordingActive(false);
      setVoiceRecordingMs(0);
      if (blob.size < 900) {
        toast.error('Áudio muito curto');
        return;
      }
      const ext = mime.includes('webm') ? 'webm' : mime.includes('mp4') ? 'm4a' : 'webm';
      const file = new File([blob], `mensagem-de-voz-${Date.now()}.${ext}`, { type: mime });
      if (!selectedChatId) return;
      sendMutation.mutate({
        chatId: selectedChatId,
        content: '📎',
        files: [file],
        ...(replyingTo ? { replyToId: replyingTo.id } : {}),
        ...(selectedTopicId ? { topicId: selectedTopicId } : {}),
      });
    };
    try {
      recorder.stop();
    } catch {
      abortVoiceRecording();
    }
  }, [selectedChatId, selectedTopicId, replyingTo, sendMutation, abortVoiceRecording]);

  const startVoiceRecording = useCallback(async () => {
    if (!selectedChatId || sendMutation.isPending || voiceRecordingActiveRef.current) return;
    if (messageInput.trim() || attachedFiles.length > 0) {
      toast.error('Envie ou apague o texto e os anexos antes de gravar áudio');
      return;
    }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      toast.error('Seu navegador não suporta gravação de áudio');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mime = pickAudioRecorderMimeType();
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.start(200);
      voiceRecordingActiveRef.current = true;
      setVoiceRecordingActive(true);
      setVoiceRecordingMs(0);
      const t0 = Date.now();
      recordingIntervalRef.current = setInterval(() => setVoiceRecordingMs(Date.now() - t0), 200);
      recordingMaxTimerRef.current = setTimeout(() => {
        if (voiceRecordingActiveRef.current) {
          toast('Limite de 2 minutos de gravação');
          stopVoiceRecordingAndSend();
        }
      }, 120_000);
    } catch {
      toast.error('Não foi possível acessar o microfone');
    }
  }, [selectedChatId, sendMutation, messageInput, attachedFiles, stopVoiceRecordingAndSend]);

  useEffect(() => {
    abortVoiceRecording();
  }, [selectedChatId, abortVoiceRecording]);

  const resizeComposerTextarea = useCallback((ta: HTMLTextAreaElement) => {
    ta.style.height = 'auto';
    const h = Math.round(Math.min(Math.max(ta.scrollHeight, 44), 120));
    ta.style.height = `${h}px`;
  }, []);

  const insertMention = useCallback(
    (opt: ChatMentionOption) => {
      const ta = textareaRef.current;
      if (!ta || !mentionMenu) return;
      const { value, cursor } = applyMentionInsert(
        messageInput,
        ta.selectionStart,
        ta.selectionEnd,
        mentionMenu.start,
        opt.insertText,
      );
      setMessageInput(value);
      setMentionMenu(null);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(cursor, cursor);
        resizeComposerTextarea(ta);
      });
    },
    [mentionMenu, messageInput, resizeComposerTextarea],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionMenu) {
      if (e.key === 'ArrowDown' && mentionOptions.length > 0) {
        e.preventDefault();
        setMentionMenu((m) =>
          m
            ? { ...m, activeIndex: (m.activeIndex + 1) % mentionOptions.length }
            : null,
        );
        return;
      }
      if (e.key === 'ArrowUp' && mentionOptions.length > 0) {
        e.preventDefault();
        setMentionMenu((m) =>
          m
            ? {
                ...m,
                activeIndex: (m.activeIndex - 1 + mentionOptions.length) % mentionOptions.length,
              }
            : null,
        );
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && mentionOptions.length > 0) {
        e.preventDefault();
        const opt = mentionOptions[mentionMenu.activeIndex];
        if (opt) insertMention(opt);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionMenu(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursor = e.target.selectionStart ?? value.length;
    setMessageInput(value);
    const detected = detectMentionQuery(value, cursor);
    if (!detected) {
      setMentionMenu(null);
    } else {
      setMentionMenu((prev) =>
        prev && prev.start === detected.start && prev.query === detected.query
          ? prev
          : { ...detected, activeIndex: 0 },
      );
    }
    resizeComposerTextarea(e.target);
  };

  const insertEmoji = (emoji: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      setMessageInput(v => v + emoji);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const v = messageInput;
    const newV = v.slice(0, start) + emoji + v.slice(end);
    setMessageInput(newV);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + emoji.length;
      ta.setSelectionRange(pos, pos);
      ta.style.height = 'auto';
      const h = Math.round(Math.min(Math.max(ta.scrollHeight, 44), 120));
      ta.style.height = `${h}px`;
    });
  };

  const insertEmojiInEditModal = useCallback((emoji: string) => {
    const ta = editModalTextareaRef.current;
    if (!ta) {
      setEditDraft((v) => v + emoji);
      return;
    }
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    setEditDraft((v) => v.slice(0, start) + emoji + v.slice(end));
    queueMicrotask(() => {
      const el = editModalTextareaRef.current;
      if (!el) return;
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  }, []);

  const commitEditMessage = useCallback(() => {
    if (!editingMessageId) return;
    const t = editDraft.trim();
    if (!t) {
      toast.error('A mensagem não pode ficar vazia');
      return;
    }
    if (t.length > 5000) return;
    editMessageMutation.mutate({ messageId: editingMessageId, content: t });
  }, [editingMessageId, editDraft, editMessageMutation]);

  const appendFilesToComposer = useCallback((files: File[]) => {
    if (!files.length) return;
    setAttachedFiles((prev) => dedupeFiles([...prev, ...files]).slice(0, 5));
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    appendFilesToComposer(files);
    e.target.value = '';
  };

  const removeFile = (idx: number) => {
    setAttachedFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const handleComposerDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!isDraggingFiles) setIsDraggingFiles(true);
  }, [isDraggingFiles]);

  const handleComposerDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) return;
    setIsDraggingFiles(false);
  }, []);

  const handleComposerDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFiles(false);
    const files = Array.from(e.dataTransfer.files || []);
    appendFilesToComposer(files);
  }, [appendFilesToComposer]);

  const handleComposerPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = getFilesFromClipboard(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      appendFilesToComposer(files);
    },
    [appendFilesToComposer],
  );

  // Helpers
  const getOtherUser = (chat: DirectChat): UserBasic | null => {
    if (chat.chatType === 'GROUP' || chat.chatType === 'GROUP_CALL') return null;
    if (!currentUser) return null;
    return chat.initiatorId === currentUser.id ? chat.recipient : chat.initiator;
  };

  const getChatDisplayName = (chat: DirectChat) => {
    if (chat.chatType === 'GROUP' || chat.chatType === 'GROUP_CALL') {
      return chat.groupName || (chat.chatType === 'GROUP_CALL' ? 'Chamada' : 'Grupo');
    }
    return getOtherUser(chat)?.name || 'Conversa';
  };

  const getChatSubtitle = (chat: DirectChat) => {
    if (chat.chatType === 'GROUP_CALL') {
      return 'Sala temporária desta ligação';
    }
    if (chat.chatType === 'GROUP') {
      const participants = chat.participants ?? [];
      const hasCurrentUser = participants.some((p) => p.userId === currentUser?.id);
      const otherNames = participants
        .filter((p) => p.user?.name)
        .filter((p) => p.userId !== currentUser?.id)
        .map((p) => p.user.name.trim())
        .filter(Boolean);
      const names = hasCurrentUser ? ['Você', ...otherNames] : otherNames;

      if (names.length > 0) {
        return names.join(', ');
      }

      const count = chat.participants?.length || 0;
      return `${count} participante${count === 1 ? '' : 's'}`;
    }
    return getOtherUser(chat)?.employee?.department ?? 'Conversa direta';
  };

  const getUnreadCount = (chat: DirectChat): number => {
    if (!currentUser) return 0;
    return chat.messages.filter(
      (m) => !messageIsSystemLike(m) && !m.isRead && m.senderId !== currentUser.id
    ).length;
  };

  const getLastMessage = (chat: DirectChat) => {
    return chat.messages[chat.messages.length - 1] ?? null;
  };

  // Fechar e limpar busca ao trocar de conversa
  useEffect(() => {
    setShowMsgSearch(false);
    setMsgSearchQuery('');
    setShowStarredMsgSidebar(false);
    setStarredMsgSearchQuery('');
    setReplyingTo(null);
    setAttachedFiles([]);
    setSelectedTopicId(null);
    closeEditModal();
  }, [selectedChatId, closeEditModal]);

  // Focar input quando o painel abre
  useEffect(() => {
    if (showMsgSearch) {
      setTimeout(() => msgSearchInputRef.current?.focus(), 50);
    } else {
      setMsgSearchQuery('');
    }
  }, [showMsgSearch]);

  const msgSearchResults = useMemo(() => {
    const query = msgSearchQuery.trim().toLowerCase();
    if (!query || !activeChat) return [];
    return activeChat.messages
      .filter(
        (m) =>
          !m.deletedAt && m.content && m.content !== '📎' && m.content.toLowerCase().includes(query)
      )
      .slice()
      .reverse();
  }, [msgSearchQuery, activeChat]);

  const scrollToMessage = useCallback((msgId: string) => {
    const el = msgRefs.current.get(msgId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('msg-highlight');
      setTimeout(() => el.classList.remove('msg-highlight'), 2000);
    }
  }, []);

  const favoritedMessagesInChat = useMemo(() => {
    if (!activeChat) return [];
    return activeChat.messages
      .filter((m) => isMessageFavorited(m) && !m.deletedAt)
      .slice()
      .reverse();
  }, [activeChat]);

  const topicsEnabled =
    activeChat?.chatType === 'DIRECT' || activeChat?.chatType === 'GROUP';

  const { data: chatTopicsData } = useQuery({
    queryKey: ['chatTopics', selectedChatId],
    queryFn: () => fetchChatTopics(selectedChatId!),
    enabled: !!selectedChatId && topicsEnabled,
    refetchInterval: () => visibleTabRefetchInterval(15_000),
  });

  const chatTopics = chatTopicsData?.topics ?? [];

  const topicFilteredMessages = useMemo(() => {
    if (!activeChat) return [];
    return activeChat.messages.filter((m) => {
      const msgTopic = m.topicId ?? null;
      if (selectedTopicId) return msgTopic === selectedTopicId;
      return !msgTopic;
    });
  }, [activeChat, selectedTopicId]);

  const selectedTopicTitle =
    selectedTopicId != null
      ? chatTopics.find((t) => t.id === selectedTopicId)?.title ?? null
      : null;

  const starredMsgSearchResults = useMemo(() => {
    const q = starredMsgSearchQuery.trim().toLowerCase();
    if (!q) return favoritedMessagesInChat;
    return favoritedMessagesInChat.filter((m) => {
      const t = (m.content || '').toLowerCase();
      if (t && t !== '📎' && t.includes(q)) return true;
      return m.attachments?.some((a) => (a.fileName || '').toLowerCase().includes(q)) ?? false;
    });
  }, [favoritedMessagesInChat, starredMsgSearchQuery]);

  const filteredGroupParticipants = useMemo(() => {
    if (!activeChat || activeChat.chatType !== 'GROUP') return [];
    const search = groupMemberSearch.trim();
    const participants = activeChat.participants ?? [];
    if (!search) return participants;
    return participants.filter((p) => textMatchesSearch(p.user?.name, search));
  }, [activeChat, groupMemberSearch]);

  /** Membro do grupo: pode editar nome e descrição (igual à API). */
  const isCurrentUserGroupMember = useMemo(() => {
    if (!activeChat || !currentUser?.id) return false;
    if (activeChat.chatType !== 'GROUP' && activeChat.chatType !== 'GROUP_CALL') return false;
    const uid = String(currentUser.id);
    return activeChat.participants?.some((x) => String(x.userId) === uid) ?? false;
  }, [activeChat, currentUser]);

  const participantIdSet = useMemo(() => {
    if (!activeChat?.participants) return new Set<string>();
    return new Set(activeChat.participants.map((p) => String(p.userId)));
  }, [activeChat?.participants]);

  const usersAvailableToAdd = useMemo(() => {
    return users.filter((u) => !participantIdSet.has(String(u.id)));
  }, [users, participantIdSet]);

  const filteredUsersToAdd = useMemo(() => {
    const q = addMemberPickSearch.trim();
    if (!q) return usersAvailableToAdd;
    return usersAvailableToAdd.filter(
      (u) =>
        textMatchesSearch(u.name, q) ||
        textMatchesSearch(u.employee?.department, q)
    );
  }, [usersAvailableToAdd, addMemberPickSearch]);

  const addMemberUsersByLetter = useMemo(() => {
    const grouped = new Map<string, UserBasic[]>();
    for (const u of filteredUsersToAdd) {
      const letter = (u.name?.trim()?.[0] || '#').toUpperCase();
      const key = /[A-ZÀ-Ú]/i.test(letter) ? letter : '#';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(u);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [filteredUsersToAdd]);

  /** Contato aberto a partir da sidebar do grupo → mostrar voltar em vez de fechar. */
  const contactDetailsOpenedFromGroup = useMemo(
    () =>
      Boolean(
        contactDetailsUser && showGroupDetails && activeChat?.chatType === 'GROUP'
      ),
    [contactDetailsUser, showGroupDetails, activeChat?.chatType]
  );

  const filteredChats = chats.filter(chat => {
    return textMatchesSearch(getChatDisplayName(chat), searchTerm);
  });

  const filteredUsers = users.filter(u =>
    textMatchesSearch(u.name, userSearch) ||
    textMatchesSearch(u.employee?.department, userSearch)
  );

  const usersByLetter = useMemo(() => {
    const grouped = new Map<string, UserBasic[]>();
    for (const u of filteredUsers) {
      const letter = (u.name?.trim()?.[0] || '#').toUpperCase();
      const key = /[A-ZÀ-Ú]/i.test(letter) ? letter : '#';
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(u);
    }
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [filteredUsers]);

  const toggleGroupMember = (userId: string) => {
    setGroupMembers((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleAddMemberPick = (userId: string) => {
    setAddMemberPickSelection((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) {
      toast.error('Informe o nome do grupo');
      return;
    }
    if (groupMembers.length === 0) {
      toast.error('Selecione ao menos 1 participante');
      return;
    }
    createGroupMutation.mutate({
      groupName: newGroupName.trim(),
      groupDescription: newGroupDescription.trim() || undefined,
      groupAvatarFile: newGroupPhotoFile,
      participantIds: groupMembers,
    });
  };

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isMobileView) return;
    e.preventDefault();
    setIsResizing(true);
  };

  const showLeftPanel = !isMobileView || !selectedChatId;
  const showRightPanel = !isMobileView || !!selectedChatId;

  return (
    <>
    <div className="h-full w-full overflow-hidden">
      <div
        ref={layoutRef}
        className={clsx(
          'flex h-full overflow-hidden bg-gray-50 dark:bg-gray-950',
          isResizing && 'cursor-col-resize'
        )}
      >
      {/* ── Left Panel ─────────────────────────────────────────── */}
      {showLeftPanel && (
        <div
          style={!isMobileView ? { width: `${leftPanelWidth}px` } : undefined}
          className={clsx(
            'flex flex-col bg-white dark:bg-gray-900',
            isMobileView ? 'border-r border-gray-200 dark:border-gray-800' : 'border-r-0',
            isMobileView ? 'w-full' : 'flex-shrink-0'
          )}
        >
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="flex items-center justify-between mb-3">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Conversas</h1>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleOpenGennecyChat}
                  disabled={openGennecyChatMutation.isPending}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200 disabled:opacity-50"
                  title="Conversar com a Gennecy"
                  aria-label="Conversar com a Gennecy"
                >
                  <Bot size={18} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowUsers(v => !v)}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-700 dark:text-gray-200"
                  title="Nova conversa"
                >
                  {showUsers ? <X size={18} /> : <Plus size={18} />}
                </button>
              </div>
            </div>

            {/* Search bar */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                placeholder={showUsers ? 'Buscar usuário...' : 'Buscar conversa...'}
                value={showUsers ? userSearch : searchTerm}
                onChange={e => showUsers ? setUserSearch(e.target.value) : setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 border border-transparent outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {showUsers ? (
              /* ── User picker ── */
              <>
                <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={() => {
                      setGroupMembers([]);
                      setNewGroupModalStep(1);
                      setNewGroupName('');
                      setNewGroupDescription('');
                      setNewGroupPhotoFile(null);
                      setNewGroupPhotoPreview((prev) => {
                        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
                        return null;
                      });
                      setNewGroupMemberSearch('');
                      setShowNewGroupModal(true);
                    }}
                    className="w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-green-500 text-white flex items-center justify-center shrink-0">
                      <Users size={18} />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">Novo grupo</span>
                  </button>
                </div>

                {usersLoading ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400 text-sm">
                    <Loader2 size={28} className="mb-2 animate-spin opacity-60" />
                    Carregando pessoas...
                  </div>
                ) : usersByLetter.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400 text-sm">
                    <Users size={32} className="mb-2 opacity-40" />
                    Nenhum usuário encontrado
                  </div>
                ) : (
                  usersByLetter.map(([letter, groupUsers]) => (
                    <div key={letter}>
                      <div className="px-4 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {letter}
                      </div>
                      {groupUsers.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => openChatMutation.mutate(u.id)}
                          disabled={openChatMutation.isPending}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                        >
                          <Avatar user={u} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{u.name}</p>
                            {u.employee && (
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.employee.department}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ))
                )}
              </>
            ) : (
              /* ── Chat list ── */
              <>
                {chatsListLoading ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 size={24} className="animate-spin text-[hsl(var(--muted-foreground))]" />
                  </div>
                ) : chatsError ? (
                  <div className="flex flex-col items-center justify-center h-40 px-4 text-center text-sm text-gray-500 dark:text-gray-400">
                    <p>Não foi possível carregar as conversas.</p>
                    <button
                      type="button"
                      onClick={() => void refetchChats()}
                      className="mt-2 text-blue-600 dark:text-blue-400 hover:underline text-xs"
                    >
                      Tentar novamente
                    </button>
                  </div>
                ) : filteredChats.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-500 dark:text-gray-400 text-sm px-4 text-center">
                    <MessageSquare size={32} className="mb-2 opacity-40" />
                    <p>Nenhuma conversa ainda.</p>
                    <button
                      onClick={() => setShowUsers(true)}
                      className="mt-2 text-blue-600 dark:text-blue-400 hover:underline text-xs"
                    >
                      Iniciar uma conversa
                    </button>
                  </div>
                ) : (
                  filteredChats.map(chat => {
                    const lastMsg = getLastMessage(chat);
                    const unread = getUnreadCount(chat);
                    const isSelected = chat.id === selectedChatId;
                    const other = getOtherUser(chat);
                    const isChatInCall =
                      nativeCall.activeChatId === chat.id &&
                      (nativeCall.phase === 'calling' ||
                        nativeCall.phase === 'connected' ||
                        nativeCall.phase === 'ringing');

                    return (
                      <button
                        key={chat.id}
                        onClick={() => setSelectedChatId(chat.id)}
                        className={clsx(
                          'w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-b border-gray-100 dark:border-gray-800',
                          isSelected
                            ? 'bg-red-50 dark:bg-red-900/20 border-l-2 border-l-red-600 dark:border-l-red-400'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                        )}
                      >
                        <div className="relative">
                          {chat.chatType === 'GROUP' ? (
                            <GroupChatAvatar avatarUrl={chat.groupAvatarUrl} size="list" />
                          ) : (
                            other && <Avatar user={other} size="list" />
                          )}
                          {unread > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-[hsl(var(--primary))] text-white text-[10px] rounded-full flex items-center justify-center font-bold animate-chat-unread-badge">
                              {unread > 9 ? '9+' : unread}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex items-center gap-2">
                              <p className={clsx('text-sm truncate', unread > 0 ? 'font-semibold text-gray-900 dark:text-gray-100' : 'font-medium text-gray-900 dark:text-gray-100')}>
                                {getChatDisplayName(chat)}
                              </p>
                              {isChatInCall && (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/35 dark:text-emerald-300">
                                  Em chamada
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400 flex-shrink-0 ml-1">
                              {formatChatDate(chat.lastMessageAt)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {lastMsg && lastMsg.senderId === currentUser?.id && (
                              <CheckCheck size={14} strokeWidth={2.4} className={clsx('flex-shrink-0', lastMsg.isRead ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-300')} />
                            )}
                            <p className={clsx('text-xs truncate', unread > 0 ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400')}>
                              {lastMsg ? getMessageSearchPreview(lastMsg) : getChatSubtitle(chat)}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </>
            )}
          </div>
        </div>
      )}

      {showLeftPanel && showRightPanel && !isMobileView && (
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={handleResizeStart}
          className="group relative z-10 -mx-1 w-3 flex-shrink-0 cursor-col-resize bg-transparent"
          title="Arrastar para redimensionar"
        >
          <div className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-gray-200 dark:bg-gray-800 group-hover:bg-red-500/60 group-active:bg-red-500/80 transition-colors" />
        </div>
      )}

      {/* ── Right Panel ────────────────────────────────────────── */}
      {showRightPanel && (
        <div
          className={clsx(
            'relative flex min-w-0 flex-1 flex-col overflow-hidden',
            'bg-gray-50 dark:bg-gray-950',
          )}
          onDragOver={hasImageCompose ? handleComposerDragOver : undefined}
          onDragLeave={hasImageCompose ? handleComposerDragLeave : undefined}
          onDrop={hasImageCompose ? handleComposerDrop : undefined}
        >
          {!selectedChatId ? (
            /* Empty state */
            <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 select-none">
              <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-6">
                <MessageSquare size={40} className="opacity-40" />
              </div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Conversas internas</h2>
              <p className="text-sm text-center max-w-xs">
                Selecione uma conversa na lista ou inicie uma nova clicando no ícone de usuários.
              </p>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {/* Chat Header */}
              {(() => {
                const other = activeChat ? getOtherUser(activeChat) : null;
                const isGennecyChatOpen = isGennecyDirectChat(activeChat, currentUser?.id);
                return (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
                    {isMobileView && (
                      <button onClick={() => setSelectedChatId(null)} className="text-gray-800 dark:text-gray-200 mr-1">
                        <ChevronLeft size={20} />
                      </button>
                    )}
                    {activeChat ? (
                      <>
                        {activeChat.chatType === 'GROUP' ? (
                          <button
                            type="button"
                            onClick={() => setShowGroupDetails(true)}
                            className="flex-1 min-w-0 flex items-start gap-3 text-left rounded-lg px-1 py-0.5 transition-colors"
                            title="Abrir dados do grupo"
                          >
                            <GroupChatAvatar avatarUrl={activeChat.groupAvatarUrl} />
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{getChatDisplayName(activeChat)}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {getChatSubtitle(activeChat)}
                              </p>
                            </div>
                          </button>
                        ) : activeChat.chatType === 'GROUP_CALL' ? (
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            {activeChat.parentGroupChatId ? (
                              <button
                                type="button"
                                onClick={() => setSelectedChatId(activeChat.parentGroupChatId!)}
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                                title="Voltar ao grupo"
                                aria-label="Voltar ao grupo"
                              >
                                <ChevronLeft size={20} />
                              </button>
                            ) : null}
                            <div className="min-w-0 flex-1 text-left">
                              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                {getChatDisplayName(activeChat)}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {getChatSubtitle(activeChat)}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => other && setContactDetailsUser(other)}
                            disabled={!other}
                            className="flex flex-1 min-w-0 items-center gap-3 rounded-lg px-1 py-0.5 text-left disabled:cursor-default disabled:opacity-60"
                            title={other ? 'Ver dados do contato' : undefined}
                          >
                            {other && <Avatar user={other} />}
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">
                                {getChatDisplayName(activeChat)}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {getChatSubtitle(activeChat)}
                              </p>
                            </div>
                          </button>
                        )}
                        {(activeChat.chatType === 'GROUP' || activeChat.chatType === 'GROUP_CALL') &&
                          showGroupCallRejoinBanner &&
                          activeNativeGroupCall?.callId && (
                            <div
                              className="flex min-w-0 shrink-0 items-center gap-1.5"
                              role="status"
                              aria-live="polite"
                            >
                              <span
                                className="inline-flex max-w-[9rem] items-center gap-1 truncate rounded-lg border border-amber-200/80 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/50 dark:text-amber-100 sm:max-w-none"
                                title={
                                  activeNativeGroupCall.video
                                    ? 'Há uma videochamada em andamento neste grupo.'
                                    : 'Há uma ligação de voz em andamento neste grupo.'
                                }
                              >
                                {activeNativeGroupCall.video ? (
                                  <Video size={12} className="shrink-0" aria-hidden />
                                ) : (
                                  <Phone size={12} className="shrink-0" aria-hidden />
                                )}
                                <span className="truncate sm:whitespace-nowrap">
                                  {activeNativeGroupCall.video ? 'Videochamada ativa' : 'Chamada ativa'}
                                </span>
                              </span>
                              <button
                                type="button"
                                className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-sm hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-500 sm:px-3 sm:text-xs"
                                onClick={() => {
                                  const gid =
                                    activeChat.chatType === 'GROUP_CALL' && activeChat.parentGroupChatId
                                      ? activeChat.parentGroupChatId
                                      : selectedChatId;
                                  if (!gid || !activeNativeGroupCall.callId) return;
                                  void nativeCall.rejoinActiveGroupCall(
                                    activeNativeGroupCall.callId,
                                    gid,
                                    activeNativeGroupCall.video ?? true
                                  );
                                }}
                              >
                                Entrar
                              </button>
                            </div>
                          )}
                        <div ref={chatHeaderMenuRef} className="relative ml-auto flex shrink-0 items-center gap-0.5">
                          {!isGennecyChatOpen && (
                            <>
                              <button
                                type="button"
                                title={
                                  activeChat?.chatType === 'GROUP' || activeChat?.chatType === 'GROUP_CALL'
                                    ? 'Videochamada com todo o grupo'
                                    : 'Videochamada no sistema'
                                }
                                aria-label="Iniciar videochamada"
                                onClick={() => {
                                  if (!activeChat?.id) return;
                                  if (activeChat.chatType === 'GROUP' || activeChat.chatType === 'GROUP_CALL') {
                                    inviteGroupConference('video');
                                    return;
                                  }
                                  if (!other) {
                                    toast.error('Abra uma conversa direta para ligar.');
                                    return;
                                  }
                                  void nativeCall.startOutgoing(activeChat.id, other.id, other.name || 'Contato', true);
                                }}
                                className="h-9 w-9 inline-flex flex-shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                              >
                                <Video size={18} />
                              </button>
                              <button
                                type="button"
                                title={
                                  activeChat?.chatType === 'GROUP' || activeChat?.chatType === 'GROUP_CALL'
                                    ? 'Ligação de voz com todo o grupo'
                                    : 'Ligação de voz no sistema'
                                }
                                aria-label="Iniciar ligação de voz"
                                onClick={() => {
                                  if (!activeChat?.id) return;
                                  if (activeChat.chatType === 'GROUP' || activeChat.chatType === 'GROUP_CALL') {
                                    inviteGroupConference('audio');
                                    return;
                                  }
                                  if (!other) {
                                    toast.error('Abra uma conversa direta para ligar.');
                                    return;
                                  }
                                  void nativeCall.startOutgoing(activeChat.id, other.id, other.name || 'Contato', false);
                                }}
                                className="h-9 w-9 inline-flex flex-shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                              >
                                <Phone size={18} />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            title="Pesquisar mensagens"
                            onClick={() => setShowMsgSearch(v => !v)}
                            className={clsx(
                              'h-9 w-9 inline-flex items-center justify-center rounded-lg transition-colors flex-shrink-0',
                              showMsgSearch
                                ? 'bg-red-600 text-white'
                                : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                            )}
                          >
                            <Search size={18} />
                          </button>
                          <button
                            type="button"
                            title="Menu da conversa"
                            aria-expanded={chatHeaderMenuOpen}
                            aria-haspopup="menu"
                            onClick={() => setChatHeaderMenuOpen((v) => !v)}
                            className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                          >
                            <MoreVertical size={18} />
                          </button>
                          {chatHeaderMenuOpen && (
                            <div
                              role="menu"
                              className="absolute right-0 top-[calc(100%+4px)] z-[70] flex min-w-[260px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800"
                            >
                              <div className="flex flex-col">
                                {activeChat.chatType === 'GROUP' && isCurrentUserGroupMember && (
                                  <>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                                      onClick={() => {
                                        setChatHeaderMenuOpen(false);
                                        setShowGroupDetails(true);
                                        setAddMemberPickSearch('');
                                        setAddMemberPickSelection([]);
                                        setShowAddGroupMembers(true);
                                      }}
                                    >
                                      <UserPlus
                                        size={16}
                                        strokeWidth={2}
                                        className="shrink-0 text-slate-400 transition-colors group-hover:text-emerald-400"
                                        aria-hidden
                                      />
                                      <span>Adicionar membro</span>
                                    </button>
                                    <div
                                      className="mx-4 h-px shrink-0 bg-gray-100 dark:bg-gray-700"
                                      aria-hidden
                                      role="presentation"
                                    />
                                  </>
                                )}
                                {activeChat.chatType === 'GROUP' && (
                                  <>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                                      onClick={() => {
                                        setChatHeaderMenuOpen(false);
                                        setShowGroupDetails(true);
                                      }}
                                    >
                                      <Info
                                        size={16}
                                        strokeWidth={2}
                                        className="shrink-0 text-slate-400 transition-colors group-hover:text-sky-400"
                                        aria-hidden
                                      />
                                      <span>Dados do grupo</span>
                                    </button>
                                    <div
                                      className="mx-4 h-px shrink-0 bg-gray-100 dark:bg-gray-700"
                                      aria-hidden
                                      role="presentation"
                                    />
                                  </>
                                )}
                                {activeChat.chatType === 'DIRECT' && other && (
                                  <>
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                                      onClick={() => {
                                        setChatHeaderMenuOpen(false);
                                        setContactDetailsUser(other);
                                      }}
                                    >
                                      <Info
                                        size={16}
                                        strokeWidth={2}
                                        className="shrink-0 text-slate-400 transition-colors group-hover:text-sky-400"
                                        aria-hidden
                                      />
                                      <span>Dados do contato</span>
                                    </button>
                                    <div
                                      className="mx-4 h-px shrink-0 bg-gray-100 dark:bg-gray-700"
                                      aria-hidden
                                      role="presentation"
                                    />
                                  </>
                                )}
                                <button
                                  type="button"
                                  role="menuitem"
                                  className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                                  onClick={() => {
                                    setChatHeaderMenuOpen(false);
                                    setShowMsgSearch(true);
                                    setMsgSearchQuery('');
                                  }}
                                >
                                  <Search
                                    size={16}
                                    strokeWidth={2}
                                    className="shrink-0 text-slate-400 transition-colors group-hover:text-violet-400"
                                    aria-hidden
                                  />
                                  <span>Pesquisar</span>
                                </button>
                              </div>

                              <div
                                className="mx-4 h-px shrink-0 bg-gray-100 dark:bg-gray-700"
                                aria-hidden
                                role="separator"
                              />
                              <button
                                type="button"
                                role="menuitem"
                                className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                                onClick={() => {
                                  setChatHeaderMenuOpen(false);
                                  setShowMsgSearch(false);
                                  setShowGroupDetails(false);
                                  setShowAddGroupMembers(false);
                                  setContactDetailsUser(null);
                                  setSelectedChatId(null);
                                }}
                              >
                                <XCircle
                                  size={16}
                                  strokeWidth={2}
                                  className="shrink-0 text-slate-400 transition-colors group-hover:text-slate-300"
                                  aria-hidden
                                />
                                <span>Fechar conversa</span>
                              </button>

                              <div
                                className="mx-4 h-px shrink-0 bg-gray-100 dark:bg-gray-700"
                                aria-hidden
                                role="separator"
                              />
                              <div className="flex flex-col">
                                <button
                                  type="button"
                                  role="menuitem"
                                  disabled={clearConversationForMeMutation.isPending}
                                  className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                                  onClick={() => {
                                    setChatHeaderMenuOpen(false);
                                    if (
                                      typeof window !== 'undefined' &&
                                      !window.confirm(
                                        'Limpar o histórico só para você? Os outros continuam vendo as mensagens. Novas mensagens continuarão aparecendo.'
                                      )
                                    )
                                      return;
                                    if (!activeChat?.id) return;
                                    clearConversationForMeMutation.mutate(activeChat.id);
                                  }}
                                >
                                  <MinusCircle
                                    size={16}
                                    strokeWidth={2}
                                    className="shrink-0 text-slate-400 transition-colors group-hover:text-zinc-300"
                                    aria-hidden
                                  />
                                  <span>Limpar conversa</span>
                                </button>
                                {activeChat.chatType === 'GROUP' && (
                                  <button
                                    type="button"
                                    role="menuitem"
                                    disabled={leaveGroupMutation.isPending}
                                    className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-white hover:bg-white/5 disabled:opacity-50"
                                    onClick={() => {
                                      setChatHeaderMenuOpen(false);
                                      if (!activeChat?.id) return;
                                      if (!confirm('Sair deste grupo?')) return;
                                      leaveGroupMutation.mutate(activeChat.id);
                                    }}
                                  >
                                    <LogOut
                                      size={19}
                                      strokeWidth={2}
                                      className="shrink-0 text-slate-400 transition-colors group-hover:text-red-500"
                                      aria-hidden
                                    />
                                    <span>Sair do grupo</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="h-10 w-32 bg-gray-100 dark:bg-gray-800 animate-pulse rounded" />
                    )}
                  </div>
                );
              })()}

              <div className="flex min-h-0 flex-1 overflow-hidden">
                {topicsEnabled && selectedChatId ? (
                  <ChatTopicsSidebar
                    chatId={selectedChatId}
                    selectedTopicId={selectedTopicId}
                    onSelectTopic={setSelectedTopicId}
                    className={isMobileView ? 'hidden' : undefined}
                  />
                ) : null}

              <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {selectedTopicTitle ? (
                <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-gray-800 dark:bg-gray-950">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Tópico
                  </p>
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                    {selectedTopicTitle}
                  </p>
                </div>
              ) : null}
              {/* ── Banner mensagem fixada ── */}
              {activeChat?.pinnedMessage && (
                <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 group relative overflow-hidden">
                  {/* barra colorida esquerda */}
                  <div className="absolute left-0 top-0 h-full w-1 bg-blue-500 rounded-r" aria-hidden />
                  <Pin
                    size={14}
                    strokeWidth={2}
                    className="flex-shrink-0 ml-3 rotate-45 text-blue-500"
                    aria-hidden
                  />
                  <button
                    type="button"
                    title="Ir para a fixa"
                    onClick={() => scrollToMessage(activeChat.pinnedMessage!.id)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide leading-none mb-0.5">
                      Fixada
                    </p>
                    <p className="text-xs text-gray-700 dark:text-gray-300 truncate leading-snug">
                      {activeChat.pinnedMessage.deletedAt
                        ? 'Mensagem apagada'
                        : activeChat.pinnedMessage.content && activeChat.pinnedMessage.content !== '📎'
                          ? messageIsSystemLike(activeChat.pinnedMessage)
                            ? formatSystemChatContent(activeChat.pinnedMessage.content)
                            : activeChat.pinnedMessage.content
                          : activeChat.pinnedMessage.attachments?.[0]?.fileName || '📎 Anexo'}
                    </p>
                  </button>
                  <button
                    type="button"
                    title="Desafixar"
                    onClick={() => {
                      if (!selectedChatId) return;
                      pinMessageMutation.mutate({ chatId: selectedChatId, unpin: true });
                    }}
                    className="flex-shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-200 opacity-0 group-hover:opacity-100 transition-opacity"
                    aria-label="Desafixar"
                  >
                    <PinOff size={14} />
                  </button>
                </div>
              )}

              {/* Mensagens ou pré-visualização de imagem (abaixo do header) */}
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {hasImageCompose ? (
                <ChatImageComposePanel
                  files={attachedFiles}
                  fileIndices={imageAttachmentIndices}
                  activeIndex={composeImageIndex}
                  caption={messageInput}
                  sending={sendMutation.isPending}
                  showEmojiPicker={showEmojiPicker}
                  onCaptionChange={setMessageInput}
                  onCaptionKeyDown={handleKeyDown}
                  onActiveIndexChange={setComposeImageIndex}
                  onRemoveAt={(fileIndex) => {
                    removeFile(fileIndex);
                    setComposeImageIndex((i) => Math.max(0, i - 1));
                  }}
                  onDiscard={clearImageAttachments}
                  onSend={handleSend}
                  onAddImages={() => imageAttachInputRef.current?.click()}
                  onPaste={handleComposerPaste}
                  onToggleEmojiPicker={() => setShowEmojiPicker((s) => !s)}
                  onPickEmoji={(e) => {
                    setMessageInput((v) => v + e);
                    setShowEmojiPicker(false);
                  }}
                />
              ) : (
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-1 bg-gray-50 dark:bg-gray-950">
                {chatLoading && !activeChat ? (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 size={28} className="animate-spin text-gray-500 dark:text-gray-400" />
                  </div>
                ) : topicFilteredMessages.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-6 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedTopicId
                        ? 'Nenhuma mensagem neste tópico ainda. Seja o primeiro a responder.'
                        : 'Nenhuma mensagem na conversa geral. Crie um tópico ao lado para organizar assuntos.'}
                    </p>
                  </div>
                ) : (
                  topicFilteredMessages.map((msg, idx) => {
                    const isOwn = Boolean(
                      currentUser?.id &&
                        (msg.senderId === currentUser.id || msg.sender?.id === currentUser.id)
                    );
                    const isGennecyMsg = !isOwn && isGennecyBotUser(msg.sender);
                    const isGroupChat =
                      activeChat?.chatType === 'GROUP' || activeChat?.chatType === 'GROUP_CALL';
                    const showSenderColumn =
                      !isOwn && (isGroupChat || isGennecyMsg);
                    const prevMsg = topicFilteredMessages[idx - 1];
                    const showDate = !prevMsg || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();
                    const isClusterStart =
                      !prevMsg ||
                      showDate ||
                      messageIsSystemLike(prevMsg) ||
                      prevMsg.senderId !== msg.senderId;
                    const hasAttachments = msg.attachments.length > 0;
                    const hasVisibleText = !!(msg.content && msg.content !== '📎');
                    const hasImageAttachment = msg.attachments.some(
                      (att) => isImageMime(att.mimeType) && !!resolveApiMediaUrl(att.fileUrl ?? null)
                    );
                    const hasPdfAttachment = msg.attachments.some(
                      (att) =>
                        isPdfMime(att.mimeType, normalizeAttachmentName(att.fileName)) &&
                        !!resolveApiMediaUrl(att.fileUrl ?? null)
                    );
                    const shouldOverlayMeta = !msg.deletedAt && hasAttachments && !hasVisibleText;
                    const useTightMediaPadding =
                      hasImageAttachment || hasPdfAttachment || shouldOverlayMeta;

                    return (
                      <React.Fragment key={msg.id}>
                        {showDate && (
                          <div className="flex justify-center my-3">
                            <span className="text-xs bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 px-3 py-1 rounded-full shadow-sm border border-gray-200 dark:border-gray-800">
                              {new Date(msg.createdAt).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                            </span>
                          </div>
                        )}
                        {messageIsSystemLike(msg) ? (
                          <div
                            ref={(el) => {
                              if (el) msgRefs.current.set(msg.id, el);
                              else msgRefs.current.delete(msg.id);
                            }}
                            className="flex justify-center px-2 py-2"
                          >
                            <p className="max-w-[min(100%,28rem)] text-center text-[12px] leading-snug text-gray-500 dark:text-gray-400 px-3">
                              {formatSystemChatContent(msg.content || '')}
                            </p>
                          </div>
                        ) : (
                        <div
                          ref={el => { if (el) msgRefs.current.set(msg.id, el); else msgRefs.current.delete(msg.id); }}
                          className={clsx(
                            'group flex msg-item items-start',
                            isOwn ? 'justify-end' : 'justify-start',
                            !isClusterStart && '-mt-0.5'
                          )}
                          onContextMenu={e => {
                            if (msg.deletedAt) return;
                            e.preventDefault();
                            setMessageContextMenu({
                              x: e.clientX,
                              y: e.clientY,
                              messageId: msg.id,
                              isFavorited: isMessageFavorited(msg),
                              isPinned: activeChat?.pinnedMessageId === msg.id,
                            });
                          }}
                          onDoubleClick={() => {
                            if (msg.deletedAt) return;
                            setReplyingTo(msg);
                            textareaRef.current?.focus();
                          }}
                        >
                          {showSenderColumn && (
                            <div className="mr-2 mt-1.5 flex w-8 flex-shrink-0 justify-center self-start">
                              {isClusterStart ? (
                                <Avatar user={msg.sender} size="sm" />
                              ) : (
                                <span className="block w-8 shrink-0" aria-hidden />
                              )}
                            </div>
                          )}
                          <div
                            className={clsx(
                              'flex min-w-0 flex-col',
                              isOwn ? 'items-end' : 'items-start'
                            )}
                          >
                            <div
                              className={clsx(
                                'flex min-w-0 max-w-full items-end gap-1',
                                isOwn ? 'flex-row-reverse' : 'flex-row'
                              )}
                            >
                              <div
                                className={clsx(
                                  'relative inline-flex w-max min-w-0 max-w-[75vw] flex-col items-start overflow-hidden rounded-2xl shadow-sm transition-colors duration-300 sm:max-w-[min(75%,28rem)]',
                                  useTightMediaPadding ? 'p-2' : 'px-4 py-2',
                                  msg.deletedAt
                                    ? isOwn
                                      ? ownChatBubbleDeletedClass
                                      : 'bg-white/70 dark:bg-gray-800/75 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-700'
                                    : isOwn
                                      ? clsx(ownChatBubbleClass, isClusterStart && 'rounded-br-sm')
                                      : clsx(incomingChatBubbleClass, isClusterStart && 'rounded-tl-sm')
                                )}
                              >
                            {showSenderColumn && isClusterStart && (
                              isGennecyMsg ? (
                                <p className="mb-1 block w-full text-left text-[11px] font-semibold text-red-600 dark:text-red-400">
                                  Gennecy
                                </p>
                              ) : isGroupChat ? (
                                <button
                                  type="button"
                                  onClick={() => setContactDetailsUser(msg.sender)}
                                  className={clsx(
                                    'mb-1 block w-full text-left text-[11px] font-semibold underline-offset-2 hover:underline',
                                    getNameColorClass(
                                      String(msg.senderId || msg.sender?.id || msg.sender?.name || 'sender'),
                                    ),
                                  )}
                                  title="Ver dados do contato"
                                >
                                  {msg.sender?.name || 'Usuário'}
                                </button>
                              ) : null
                            )}
                            {msg.deletedAt ? (
                              <p className="text-sm italic opacity-80">Mensagem apagada</p>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setMessageContextMenu({
                                      x: rect.right - 220,
                                      y: rect.bottom + 6,
                                      messageId: msg.id,
                                      isFavorited: isMessageFavorited(msg),
                                      isPinned: activeChat?.pinnedMessageId === msg.id,
                                    });
                                  }}
                                  className={clsx(
                                    'absolute right-2 top-2 z-10 inline-flex h-6 w-6 items-center justify-center rounded-md transition-opacity',
                                    'opacity-0 group-hover:opacity-100 focus:opacity-100',
                                    isOwn
                                      ? ownChatBubbleMenuBtnClass
                                      : 'bg-gray-200/80 text-gray-700 hover:bg-gray-300 dark:bg-gray-800/80 dark:text-gray-200 dark:hover:bg-gray-700'
                                  )}
                                  title="Abrir ações da mensagem"
                                  aria-label="Abrir ações da mensagem"
                                >
                                  <ChevronDown size={14} />
                                </button>
                                {msg.replyTo && (
                                  <button
                                    type="button"
                                    onClick={() => scrollToMessage(msg.replyTo!.id)}
                                    className={clsx(
                                      'relative z-0 mb-2 flex min-w-0 max-w-full items-stretch gap-2 rounded-md py-1.5 pl-2 pr-2 text-left transition-opacity hover:opacity-90',
                                      shouldOverlayMeta ? '' : '-mx-2',
                                      isOwn ? ownChatReplyBoxClass : 'bg-sky-50/90 dark:bg-sky-950/35'
                                    )}
                                    title="Ir à mensagem original"
                                  >
                                    <span
                                      className={clsx(
                                        'w-0.5 shrink-0 self-stretch rounded-full',
                                        isOwn ? ownChatReplyAccentClass : 'bg-sky-500 dark:bg-sky-400'
                                      )}
                                      aria-hidden
                                    />
                                    <span className="min-w-0 flex-1">
                                      <p
                                        className={clsx(
                                          'text-[11px] font-semibold leading-tight',
                                          isOwn
                                            ? ownChatReplyTitleClass
                                            : getNameColorClass(
                                                String(
                                                  msg.replyTo?.sender?.id ||
                                                    msg.replyTo?.sender?.name ||
                                                    'reply-sender'
                                                )
                                              )
                                        )}
                                      >
                                        {msg.replyTo.sender?.name || 'Usuário'}
                                      </p>
                                      <p
                                        className={clsx(
                                          'line-clamp-2 text-xs leading-snug',
                                          isOwn ? ownChatMetaTextClass : 'text-gray-600 dark:text-gray-400'
                                        )}
                                      >
                                        {getReplyQuoteSnippet(msg.replyTo)}
                                      </p>
                                    </span>
                                  </button>
                                )}
                                {/* Attachments */}
                                {msg.attachments.map(att => {
                                  const resolvedFileUrl = resolveApiMediaUrl(att.fileUrl ?? null);
                                  const normalizedFileName = normalizeAttachmentName(att.fileName);
                                  const isImageAttachment = isImageMime(att.mimeType) && !!resolvedFileUrl;
                                  const isAudioAttachment = isAudioMime(att.mimeType) && !!resolvedFileUrl;
                                  const isPdfAttachment = isPdfMime(att.mimeType, normalizedFileName) && !!resolvedFileUrl;
                                  const typeLabel = getAttachmentTypeLabel(normalizedFileName, att.mimeType);
                                  return (
                                    <div key={att.id} className={hasVisibleText ? 'mb-2' : ''}>
                                      {isImageAttachment ? (
                                        <button
                                          type="button"
                                          onClick={() => setMessageImageViewer({ src: resolvedFileUrl!, name: normalizedFileName })}
                                          className="block max-w-full rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                                          title="Abrir imagem"
                                        >
                                          <img
                                            src={resolvedFileUrl!}
                                            alt={normalizedFileName}
                                            className="max-w-full rounded-lg max-h-64 object-cover cursor-zoom-in"
                                          />
                                        </button>
                                      ) : isAudioAttachment ? (
                                        <ChatInlineAudioPlayer
                                          src={resolvedFileUrl!}
                                          isOwn={isOwn}
                                          reserveCornerForMeta={shouldOverlayMeta}
                                        />
                                      ) : isPdfAttachment ? (
                                        <ChatPdfAttachmentCard
                                          src={resolvedFileUrl!}
                                          fileName={normalizedFileName}
                                          fileKey={att.fileKey}
                                          fileSize={att.fileSize}
                                          typeLabel={typeLabel}
                                          isOwn={isOwn}
                                          reserveCornerForMeta={shouldOverlayMeta}
                                          onOpen={() =>
                                            window.open(resolvedFileUrl!, '_blank', 'noopener,noreferrer')
                                          }
                                        />
                                      ) : (
                                        <div
                                          className={clsx(
                                            'max-w-[min(100%,320px)] overflow-hidden rounded-xl border',
                                            isOwn
                                              ? ownChatAttachmentCardClass
                                              : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/70'
                                          )}
                                        >
                                          <div className="flex items-center gap-3 p-3">
                                            <div
                                              className={clsx(
                                                'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
                                                isOwn
                                                  ? ownChatAttachmentIconClass
                                                  : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                                              )}
                                            >
                                              <FileText size={18} />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <p className="truncate text-sm font-semibold">{normalizedFileName}</p>
                                              <p
                                                className={clsx(
                                                  'mt-0.5 text-xs',
                                                  isOwn ? ownChatMetaTextClass : 'text-gray-500 dark:text-gray-400'
                                                )}
                                              >
                                                {typeLabel}
                                                {att.fileSize ? ` - ${formatFileSize(att.fileSize)}` : ''}
                                              </p>
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {/* Conteúdo */}
                                {hasVisibleText && (
                                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed [overflow-wrap:anywhere]">
                                      <MentionHighlightedText
                                        text={
                                          isGennecyMsg
                                            ? formatGennecyMessageContent(msg.content)
                                            : msg.content
                                        }
                                        mentionClassName={
                                          isOwn
                                            ? ownChatMentionClass
                                            : 'font-medium text-red-600 dark:text-red-400'
                                        }
                                      />
                                    </p>
                                  )}
                              </>
                            )}
                            {/* Time + read status + ícones de estado */}
                            {shouldOverlayMeta ? (
                              <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] text-white/90 backdrop-blur-[1px]">
                                <span>{formatMessageTime(msg.createdAt)}</span>
                                {isOwn && !msg.deletedAt && (
                                  <CheckCheck
                                    size={12}
                                    strokeWidth={2.4}
                                    className={msg.isRead ? 'text-blue-300' : 'text-white/75'}
                                  />
                                )}
                              </div>
                            ) : (
                            <div className={clsx('mt-0.5 inline-flex items-center gap-1 self-end')}>
                              {activeChat?.pinnedMessageId === msg.id && !msg.deletedAt && (
                                <Pin
                                  size={11}
                                  className={clsx(
                                    'flex-shrink-0 rotate-45',
                                    isOwn ? ownChatPinClass : 'text-blue-400 dark:text-blue-300'
                                  )}
                                  aria-label="Fixada"
                                />
                              )}
                              {isMessageFavorited(msg) && !msg.deletedAt && (
                                <Star
                                  size={12}
                                  className={clsx(
                                    'flex-shrink-0',
                                    isOwn ? ownChatStarClass : 'text-amber-500 fill-amber-500 dark:text-amber-400'
                                  )}
                                  aria-label="Favoritada"
                                />
                              )}
                              {msg.editedAt && !msg.deletedAt && (
                                <span
                                  className={clsx('text-[10px]', isOwn ? ownChatMetaTextClass : 'text-gray-500 dark:text-gray-400')}
                                >
                                  (editada)
                                </span>
                              )}
                              <span className={clsx('text-[10px]', isOwn ? ownChatMetaTextClass : 'text-gray-500 dark:text-gray-400')}>
                                {formatMessageTime(msg.createdAt)}
                              </span>
                              {isOwn && !msg.deletedAt && (
                                <CheckCheck
                                  size={14}
                                  strokeWidth={2.4}
                                  className={msg.isRead ? ownChatReadCheckClass : ownChatUnreadCheckClass}
                                />
                              )}
                            </div>
                            )}
                              </div>
                              {!msg.deletedAt && (
                                <div
                                  className="relative flex shrink-0 flex-col items-center justify-center self-center"
                                  data-reaction-picker-root
                                  onDoubleClick={(e) => e.stopPropagation()}
                                >
                                  {reactionPickerForMessageId === msg.id && (
                                    <div
                                      className="absolute bottom-full left-1/2 z-[85] mb-1.5 flex max-w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 flex-wrap items-center justify-center gap-0.5 rounded-full border border-gray-600/80 bg-[#1f2c33] px-2 py-1.5 shadow-xl dark:border-gray-500/60"
                                      role="listbox"
                                      aria-label="Escolher reação"
                                    >
                                      {QUICK_REACTION_EMOJIS.map((em) => (
                                        <button
                                          key={em}
                                          type="button"
                                          className="rounded-full p-1 text-[1.35rem] leading-none transition-colors hover:bg-white/10"
                                          onClick={() => applyMessageReaction(msg.id, em)}
                                        >
                                          {em}
                                        </button>
                                      ))}
                                      {reactionPickerShowMore &&
                                        EXTRA_REACTION_EMOJIS.map((em) => (
                                          <button
                                            key={`extra-${em}`}
                                            type="button"
                                            className="rounded-full p-1 text-[1.35rem] leading-none transition-colors hover:bg-white/10"
                                            onClick={() => applyMessageReaction(msg.id, em)}
                                          >
                                            {em}
                                          </button>
                                        ))}
                                      <button
                                        type="button"
                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg font-light text-white/90 hover:bg-white/10"
                                        title="Mais reações"
                                        aria-label="Mais reações"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setReactionPickerShowMore((v) => !v);
                                        }}
                                      >
                                        +
                                      </button>
                                    </div>
                                  )}
                                  <button
                                    type="button"
                                    className={clsx(
                                      'flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity',
                                      'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                                      'max-md:opacity-100 md:opacity-0 md:group-hover:opacity-100',
                                      reactionPickerForMessageId === msg.id &&
                                        'opacity-100 ring-2 ring-red-400/40 dark:ring-red-500/35'
                                    )}
                                    title="Reagir"
                                    aria-label="Reagir à mensagem"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setReactionPickerShowMore(false);
                                      setReactionPickerForMessageId((id) => (id === msg.id ? null : msg.id));
                                    }}
                                    onDoubleClick={(e) => e.stopPropagation()}
                                  >
                                    <Smile size={17} strokeWidth={2} className="opacity-90" />
                                  </button>
                                </div>
                              )}
                            </div>
                            {selectedChatId &&
                              reactionsByChat[selectedChatId]?.[msg.id] &&
                              !msg.deletedAt && (
                                <button
                                  type="button"
                                  className={clsx(
                                    'mt-0.5 inline-flex min-w-0 max-w-full',
                                    isOwn ? 'self-end' : 'self-start'
                                  )}
                                  title="Toque para remover sua reação"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    applyMessageReaction(
                                      msg.id,
                                      reactionsByChat[selectedChatId]![msg.id]!
                                    );
                                  }}
                                >
                                  <span className="inline-flex cursor-pointer rounded-full border border-gray-200 bg-white px-2 py-0.5 text-sm leading-none shadow-sm dark:border-gray-600 dark:bg-gray-800">
                                    {reactionsByChat[selectedChatId]![msg.id]}
                                  </span>
                                </button>
                              )}
                          </div>
                        </div>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>
              )}
              </div>

              {typeof document !== 'undefined' && messageContextMenu
                ? createPortal(
                    <div
                      ref={messageContextMenuRef}
                      data-message-context-menu
                      className="fixed z-[200] min-w-[230px] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800"
                      style={{ left: messageContextMenu.x, top: messageContextMenu.y }}
                      role="menu"
                    >
                      {/* Fixar / Desafixar */}
                      <button
                        type="button"
                        role="menuitem"
                        className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                        disabled={pinMessageMutation.isPending}
                        onClick={() => {
                          if (!selectedChatId) return;
                          const { messageId, isPinned } = messageContextMenu;
                          pinMessageMutation.mutate(
                            isPinned
                              ? { chatId: selectedChatId, unpin: true }
                              : { chatId: selectedChatId, messageId }
                          );
                        }}
                      >
                        {messageContextMenu.isPinned ? (
                          <PinOff
                            size={16}
                            className="flex-shrink-0 text-slate-400 transition-colors group-hover:text-blue-500"
                          />
                        ) : (
                          <Pin
                            size={16}
                            className="flex-shrink-0 rotate-45 text-slate-400 transition-colors group-hover:text-blue-500"
                          />
                        )}
                        <span className="font-medium">
                          {messageContextMenu.isPinned ? 'Desafixar' : 'Fixar'}
                        </span>
                      </button>

                      {/* Separador */}
                      <div className="mx-4 h-px bg-gray-100 dark:bg-gray-700" role="separator" aria-hidden />

                      {/* Favoritar */}
                      <button
                        type="button"
                        role="menuitem"
                        className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                        disabled={messageFavoriteMutation.isPending}
                        onClick={() => {
                          const { messageId, isFavorited } = messageContextMenu;
                          messageFavoriteMutation.mutate({ messageId, favorited: !isFavorited });
                        }}
                      >
                        <Star
                          size={16}
                          className={clsx(
                            'flex-shrink-0 transition-colors',
                            messageContextMenu.isFavorited
                              ? 'text-amber-500'
                              : 'text-slate-400 group-hover:text-amber-500'
                          )}
                          fill={messageContextMenu.isFavorited ? 'currentColor' : 'none'}
                        />
                        <span className="font-medium">
                          {messageContextMenu.isFavorited ? 'Desfavoritar' : 'Favoritar'}
                        </span>
                      </button>

                      {contextMenuMessage &&
                        !contextMenuMessage.deletedAt &&
                        !messageIsSystemLike(contextMenuMessage) && (
                        <>
                          <div className="mx-4 h-px bg-gray-100 dark:bg-gray-700" role="separator" aria-hidden />
                          <button
                            type="button"
                            role="menuitem"
                            className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                            onClick={() => {
                              setReplyingTo(contextMenuMessage);
                              setMessageContextMenu(null);
                              textareaRef.current?.focus();
                            }}
                          >
                            <CornerUpLeft
                              size={16}
                              className="flex-shrink-0 text-slate-400 transition-colors group-hover:text-sky-500"
                            />
                            <span className="font-medium">Responder</span>
                          </button>
                        </>
                      )}

                      {contextMenuMessage?.attachments?.some((att) => !!resolveApiMediaUrl(att.fileUrl ?? null)) && (
                        <>
                          <div className="mx-4 h-px bg-gray-100 dark:bg-gray-700" role="separator" aria-hidden />
                          <button
                            type="button"
                            role="menuitem"
                            className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                            onClick={() => {
                              if (!contextMenuMessage) return;
                              const filesToDownload = contextMenuMessage.attachments
                                .map((att) => ({
                                  url: resolveApiMediaUrl(att.fileUrl ?? null),
                                  fileName: att.fileName || 'anexo',
                                }))
                                .filter((item): item is { url: string; fileName: string } => !!item.url);
                              if (filesToDownload.length === 0) return;

                              void Promise.all(
                                filesToDownload.map((item) => downloadAttachmentFile(item.url, item.fileName))
                              );

                              setMessageContextMenu(null);
                            }}
                          >
                            <Download
                              size={16}
                              className="flex-shrink-0 text-slate-400 transition-colors group-hover:text-emerald-500"
                            />
                            <span className="font-medium">
                              {contextMenuMessage.attachments.length > 1 ? 'Baixar' : 'Baixar'}
                            </span>
                          </button>
                        </>
                      )}

                      {contextMenuMessage && !contextMenuMessage.deletedAt && (
                        <>
                          <div className="mx-4 h-px bg-gray-100 dark:bg-gray-700" role="separator" aria-hidden />
                          <button
                            type="button"
                            role="menuitem"
                            className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                            disabled={hideMessageForMeMutation.isPending}
                            onClick={() => {
                              if (
                                typeof window !== 'undefined' &&
                                !window.confirm('Ocultar esta mensagem só para você?')
                              )
                                return;
                              hideMessageForMeMutation.mutate(contextMenuMessage!.id);
                            }}
                          >
                            <EyeOff
                              size={16}
                              className="flex-shrink-0 text-slate-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300"
                            />
                            <span className="font-medium">Apagar para mim</span>
                          </button>
                        </>
                      )}

                      {canEditDeleteContext && contextMenuMessage && (
                        <>
                          <div className="mx-4 h-px bg-gray-100 dark:bg-gray-700" role="separator" aria-hidden />
                          <button
                            type="button"
                            role="menuitem"
                            className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-gray-50 disabled:opacity-50 dark:text-gray-100 dark:hover:bg-gray-700/70"
                            disabled={editMessageMutation.isPending || deleteMessageMutation.isPending}
                            onClick={() => {
                              setMessageContextMenu(null);
                              setEditingMessageId(contextMenuMessage.id);
                              setEditDraft(
                                contextMenuMessage.content && contextMenuMessage.content !== '📎'
                                  ? contextMenuMessage.content
                                  : ''
                              );
                            }}
                          >
                            <Pencil
                              size={16}
                              className="flex-shrink-0 text-slate-400 transition-colors group-hover:text-sky-500"
                            />
                            <span className="font-medium">Editar</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="group flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-900 hover:bg-red-50 disabled:opacity-50 dark:text-gray-100 dark:hover:bg-red-900/20"
                            disabled={editMessageMutation.isPending || deleteMessageMutation.isPending}
                            onClick={() => {
                              if (typeof window !== 'undefined' && !window.confirm('Apagar?')) return;
                              deleteMessageMutation.mutate(contextMenuMessage.id);
                            }}
                          >
                            <Trash2
                              size={16}
                              className="flex-shrink-0 text-slate-400 transition-colors group-hover:text-red-500"
                            />
                            <span className="font-medium group-hover:text-red-600 dark:group-hover:text-red-400">
                              Apagar
                            </span>
                          </button>
                        </>
                      )}
                    </div>,
                    document.body
                  )
                : null}

              {typeof document !== 'undefined' &&
                editingMessageId &&
                editingMessageModal &&
                createPortal(
                  <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center px-4 py-6 sm:px-6">
                    <button
                      type="button"
                      className="absolute inset-0 bg-black/50 transition-opacity dark:bg-black/60"
                      aria-label="Fechar edição"
                      onClick={() => {
                        if (!editMessageMutation.isPending) closeEditModal();
                      }}
                    />
                    <div
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="edit-message-modal-title"
                      className="relative z-10 flex w-full max-w-[480px] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center gap-2 border-b border-gray-200 px-2 py-3 dark:border-gray-700 sm:gap-3 sm:px-3">
                        <button
                          type="button"
                          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                          onClick={() => {
                            if (!editMessageMutation.isPending) closeEditModal();
                          }}
                          aria-label="Fechar"
                        >
                          <X size={22} strokeWidth={2} />
                        </button>
                        <h2
                          id="edit-message-modal-title"
                          className="text-base font-semibold text-gray-900 dark:text-gray-100"
                        >
                          Editar mensagem
                        </h2>
                      </div>

                      <div className="relative min-h-[200px] bg-gray-50 px-4 pb-8 pt-8 dark:bg-gray-950">
                        <div
                          className={clsx(
                            'relative flex max-h-[min(40vh,260px)] items-end',
                            editingMessageModal.senderId === currentUser?.id ? 'justify-end' : 'justify-start'
                          )}
                        >
                          <div
                            className={clsx(
                              'max-w-[90%] rounded-2xl px-3 py-2 shadow-sm',
                              editingMessageModal.senderId === currentUser?.id
                                ? clsx(ownChatBubbleClass, 'rounded-br-sm')
                                : clsx(incomingChatBubbleClass, 'rounded-bl-sm')
                            )}
                          >
                            <p className="max-h-32 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap break-words">
                              {editDraft || '\u00a0'}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center justify-end gap-1">
                              <span
                                className={clsx(
                                  'text-[10px]',
                                  editingMessageModal.senderId === currentUser?.id
                                    ? ownChatMetaTextClass
                                    : 'text-gray-500 dark:text-gray-400'
                                )}
                              >
                                {formatMessageTime(editingMessageModal.createdAt)}
                              </span>
                              {editingMessageModal.senderId === currentUser?.id && (
                                <CheckCheck
                                  size={12}
                                  strokeWidth={2.4}
                                  className={
                                    editingMessageModal.isRead ? ownChatReadCheckClass : ownChatUnreadCheckClass
                                  }
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-gray-200 bg-white px-3 pb-4 pt-3 dark:border-gray-800 dark:bg-gray-900 sm:px-4">
                        {/* Mesma “pílula” do composer principal: bordas circulares, campo + emoji + salvar */}
                        <div
                          className={clsx(
                            'flex min-h-[52px] min-w-0 w-full items-center gap-1 rounded-full',
                            'border border-gray-200/80 dark:border-gray-600/50',
                            'bg-white px-1.5 py-1.5 dark:bg-gray-900'
                          )}
                        >
                          <input
                            ref={editModalTextareaRef}
                            type="text"
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            maxLength={5000}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitEditMessage();
                              }
                            }}
                            placeholder="Digite uma mensagem · @ para mencionar"
                            className="min-h-[44px] min-w-0 flex-1 bg-transparent px-2 py-2 text-base leading-6 text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-0 dark:text-gray-100 dark:placeholder:text-gray-400/90"
                          />
                          <div className="flex h-11 shrink-0 items-center gap-0.5">
                            <div ref={editModalEmojiWrapRef} className="relative flex h-11 shrink-0 items-center justify-center">
                              <button
                                type="button"
                                onClick={() => setShowEditModalEmojiPicker((v) => !v)}
                                className="flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent text-gray-600 transition-colors hover:bg-black/[0.06] dark:text-gray-200 dark:hover:bg-white/10"
                                title="Emojis"
                                aria-label="Emojis"
                              >
                                <Smile size={22} strokeWidth={2} className="shrink-0" />
                              </button>
                              {showEditModalEmojiPicker && (
                                <div
                                  className="absolute bottom-full right-0 z-[260] mb-2 flex w-[200px] flex-wrap gap-1.5 rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-[#1f2c33]"
                                  role="listbox"
                                >
                                  {['👍', '😀', '😂', '❤️', '🔥', '👏', '🎉', '😮', '😢', '🙏', '✅', '👋'].map((e) => (
                                    <button
                                      key={e}
                                      type="button"
                                      className="rounded p-1 text-xl leading-none hover:bg-gray-100 dark:hover:bg-white/10"
                                      onClick={() => {
                                        insertEmojiInEditModal(e);
                                        setShowEditModalEmojiPicker(false);
                                      }}
                                    >
                                      {e}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <button
                            type="button"
                            disabled={editMessageMutation.isPending}
                            onClick={commitEditMessage}
                            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent bg-red-600 text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Salvar"
                            aria-label="Salvar edição"
                          >
                            {editMessageMutation.isPending ? (
                              <Loader2 size={22} className="animate-spin text-white shrink-0" />
                            ) : (
                              <Check size={22} strokeWidth={2.5} className="shrink-0" />
                            )}
                          </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </AppModalOverlay>,
                  document.body
                )}

              <input
                ref={imageAttachInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Input area — oculto enquanto compõe imagem (legenda fica no painel) */}
              {!hasImageCompose && (
              <div
                className="flex-shrink-0 bg-transparent border-0 px-3 pt-2 pb-3 sm:px-4"
                onDragOver={handleComposerDragOver}
                onDragLeave={handleComposerDragLeave}
                onDrop={handleComposerDrop}
              >
                {replyingTo && (
                  <div className="mb-2 flex min-w-0 items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/90">
                    <div className="min-w-0 flex-1 border-l-[3px] border-red-500 pl-2.5">
                      <p className="text-[11px] font-semibold text-gray-800 dark:text-gray-100">
                        {replyingTo.sender?.name || 'Usuário'}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {getMessageSearchPreview(replyingTo)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-400"
                      aria-label="Cancelar resposta"
                      onClick={() => setReplyingTo(null)}
                    >
                      <X size={18} strokeWidth={2} />
                    </button>
                  </div>
                )}
                {isDraggingFiles && (
                  <div className="mb-2 rounded-lg border border-dashed border-red-400/70 bg-red-50/70 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-500/60 dark:bg-red-900/20 dark:text-red-300">
                    Solte os arquivos aqui para anexar
                  </div>
                )}
                {voiceRecordingActive && (
                  <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm dark:border-red-800 dark:bg-red-950/50">
                    <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" aria-hidden />
                    <span className="font-medium text-red-800 dark:text-red-200">
                      Gravando {formatVoiceRecordingTime(voiceRecordingMs)}
                    </span>
                    <span className="text-xs text-red-700/90 dark:text-red-300/90">
                      Toque no quadrado vermelho para parar e enviar
                    </span>
                  </div>
                )}
                <ChatComposerAttachments files={attachedFiles} onRemove={removeFile} />

                <div
                  className={clsx(
                    'flex min-h-[52px] w-full min-w-0 flex-nowrap items-center gap-1 rounded-full px-1.5 py-1.5',
                    'border border-gray-200/80 dark:border-gray-600/50',
                    'bg-white dark:bg-gray-900'
                  )}
                >
                  <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleFileChange} />

                  {/* Bloco fixo à esquerda: mesma altura visual que os botões direitos — centro optico alinhado à curva */}
                  <div className="flex h-11 shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={sendMutation.isPending}
                      className="flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent text-gray-600 transition-colors [backface-visibility:hidden] hover:bg-black/[0.06] dark:text-gray-200 dark:hover:bg-white/10 disabled:pointer-events-none disabled:opacity-40"
                      title="Anexar"
                      aria-label="Anexar arquivo"
                    >
                      <Plus size={22} strokeWidth={2} className="shrink-0" />
                    </button>
                    <div className="relative flex h-11 shrink-0 items-center justify-center" ref={emojiContainerRef}>
                      <button
                        type="button"
                        onClick={() => setShowEmojiPicker(s => !s)}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent text-gray-600 transition-colors hover:bg-black/[0.06] dark:text-gray-200 dark:hover:bg-white/10"
                        title="Emojis"
                        aria-label="Emojis"
                      >
                        <Smile size={22} strokeWidth={2} className="shrink-0" />
                      </button>
                      {showEmojiPicker && (
                        <div
                          className="absolute bottom-full left-0 mb-2 p-2 rounded-xl bg-white dark:bg-[#1f2c33] border border-gray-200 dark:border-gray-700 shadow-lg z-50 flex flex-wrap gap-1.5 w-[200px]"
                          role="listbox"
                        >
                          {['👍', '😀', '😂', '❤️', '🔥', '👏', '🎉', '😮', '😢', '🙏', '✅', '👋'].map(e => (
                            <button
                              key={e}
                              type="button"
                              className="text-xl leading-none p-1 rounded hover:bg-gray-100 dark:hover:bg-white/10"
                              onClick={() => {
                                insertEmoji(e);
                                setShowEmojiPicker(false);
                              }}
                            >
                              {e}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <ChatComposerField
                    textareaRef={textareaRef}
                    value={messageInput}
                    onChange={handleTextareaChange}
                    onKeyDown={handleKeyDown}
                    onPaste={handleComposerPaste}
                    onResize={resizeComposerTextarea}
                    placeholder="Digite uma mensagem"
                    disabled={voiceRecordingActive}
                    mentionPicker={
                      mentionMenu ? (
                        <ChatMentionPicker
                          options={mentionOptions}
                          activeIndex={Math.min(
                            mentionMenu.activeIndex,
                            Math.max(0, mentionOptions.length - 1),
                          )}
                          onSelect={insertMention}
                          onHoverIndex={(index) =>
                            setMentionMenu((m) => (m ? { ...m, activeIndex: index } : null))
                          }
                        />
                      ) : null
                    }
                  />

                  {/* Bloco fixo à direita: sempre h-11 alinhado ao esquerdo */}
                  <div className="flex h-11 shrink-0 items-center justify-center">
                    {voiceRecordingActive ? (
                      <button
                        type="button"
                        onClick={() => stopVoiceRecordingAndSend()}
                        disabled={sendMutation.isPending}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent bg-red-600 text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Parar e enviar áudio"
                        aria-label="Parar gravação e enviar"
                      >
                        <Square size={20} strokeWidth={2.5} className="shrink-0 fill-current" />
                      </button>
                    ) : messageInput.trim() || attachedFiles.length > 0 ? (
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={sendMutation.isPending}
                        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent bg-red-600 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                        title="Enviar"
                        aria-label="Enviar mensagem"
                      >
                        {sendMutation.isPending ? (
                          <Loader2 size={22} className="animate-spin shrink-0" />
                        ) : (
                          <Send size={22} strokeWidth={2} className="shrink-0" />
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="flex size-11 shrink-0 items-center justify-center rounded-full border border-transparent text-gray-600 transition-colors hover:bg-gray-200/80 dark:text-gray-300 dark:hover:bg-white/10 disabled:opacity-50"
                        title="Gravar mensagem de voz"
                        aria-label="Gravar mensagem de voz"
                        disabled={!selectedChatId || sendMutation.isPending}
                        onClick={() => void startVoiceRecording()}
                      >
                        <Mic size={22} strokeWidth={2} className="shrink-0" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
              )}

                </div>
              </div>

              {/* ── Sidebar de pesquisa de mensagens ── */}
              {showMsgSearch && (
                <aside className="absolute right-0 top-0 z-50 flex h-full w-full flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 sm:w-[520px] lg:w-[600px]">
                  {/* Header (sem borda: mesmo padrão visual do título "Dados do grupo") */}
                  <div className="flex items-center gap-2 px-3 sm:px-4 py-3 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setShowMsgSearch(false)}
                      className="h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 flex-shrink-0"
                      aria-label="Fechar busca"
                    >
                      <X size={22} strokeWidth={2} />
                    </button>
                    <h3 className="text-xl sm:text-lg font-semibold text-gray-900 dark:text-gray-100 leading-snug tracking-tight">
                      Pesquisar mensagens
                    </h3>
                  </div>

                  {/* Campo de busca */}
                  <div className="px-4 pt-3 pb-2 flex-shrink-0">
                    <div className="flex items-center gap-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2">
                      <Search size={16} className="text-gray-400 flex-shrink-0" />
                      <input
                        ref={msgSearchInputRef}
                        type="text"
                        value={msgSearchQuery}
                        onChange={e => setMsgSearchQuery(e.target.value)}
                        placeholder="Pesquisar na conversa..."
                        className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none"
                      />
                      {msgSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setMsgSearchQuery('')}
                          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {msgSearchQuery.trim() && (
                      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                        {msgSearchResults.length === 0
                          ? 'Nenhuma mensagem encontrada'
                          : `${msgSearchResults.length} resultado${msgSearchResults.length !== 1 ? 's' : ''}`}
                      </p>
                    )}
                  </div>

                  {/* Resultados */}
                  <div className="flex-1 overflow-y-auto px-3 pb-4">
                    {msgSearchResults.length === 0 && !msgSearchQuery.trim() && (
                      <div className="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-500 gap-3 px-6">
                        <Search size={36} strokeWidth={1.4} />
                        <p className="text-sm">Digite algo para pesquisar dentro desta conversa</p>
                      </div>
                    )}
                    {msgSearchResults.map(msg => {
                      const isOwn = msg.senderId === currentUser?.id;
                      const senderName = isOwn ? 'Você' : (activeChat?.participants?.find(p => p.userId === msg.senderId)?.user?.name ?? activeChat?.initiator?.id === msg.senderId ? activeChat?.initiator?.name : activeChat?.recipient?.name) ?? 'Contato';
                      const query = msgSearchQuery.trim().toLowerCase();
                      const content = msg.content ?? '';
                      const idx = content.toLowerCase().indexOf(query);
                      const before = idx >= 0 ? content.slice(0, idx) : content;
                      const match = idx >= 0 ? content.slice(idx, idx + query.length) : '';
                      const after = idx >= 0 ? content.slice(idx + query.length) : '';
                      return (
                        <button
                          key={msg.id}
                          type="button"
                          onClick={() => {
                            setShowMsgSearch(false);
                            setTimeout(() => scrollToMessage(msg.id), 150);
                          }}
                          className="w-full text-left rounded-xl px-3 py-3 mb-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{senderName}</span>
                            <span className="text-[10px] text-gray-400">
                              {new Date(msg.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                            {before}
                            <mark className="bg-yellow-200 dark:bg-yellow-600 text-gray-900 dark:text-white rounded px-0.5">{match}</mark>
                            {after}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </aside>
              )}

              {activeChat?.chatType === 'GROUP' && showGroupDetails && (
                <>
                  <button
                    type="button"
                    aria-label="Fechar dados do grupo"
                    onClick={() => setShowGroupDetails(false)}
                    className="absolute inset-0 bg-black/30 z-40"
                  />
                  <aside className="absolute right-0 top-0 z-50 flex h-full w-full flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 sm:w-[520px] lg:w-[600px]">
                    <div className="flex items-center gap-2 px-3 sm:px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setShowGroupDetails(false)}
                        className="h-9 w-9 -ml-1 inline-flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 flex-shrink-0"
                        aria-label="Fechar"
                      >
                        <X size={22} strokeWidth={2} />
                      </button>
                      <h3 className="text-xl sm:text-lg font-semibold text-gray-900 dark:text-gray-100 leading-snug tracking-tight">
                        Dados do grupo
                      </h3>
                    </div>

                    <div className="px-4 pt-4 pb-0">
                      <div className="flex flex-col items-center text-center">
                        {/* Avatar interativo */}
                        <div className="relative mb-4 group/avatar" ref={groupAvatarMenuRef}>
                          {/* Círculo da foto — maior que antes */}
                          <button
                            type="button"
                            aria-label="Opções da foto do grupo"
                            onClick={() => setGroupAvatarMenu(v => !v)}
                            className="relative block w-32 h-32 rounded-full overflow-hidden focus:outline-none"
                          >
                            <div className="w-32 h-32 rounded-full overflow-hidden bg-green-500 text-white flex items-center justify-center">
                              {resolveApiMediaUrl(activeChat.groupAvatarUrl) ? (
                                <img
                                  src={resolveApiMediaUrl(activeChat.groupAvatarUrl)!}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <Users size={52} />
                              )}
                            </div>
                            {/* Hover overlay */}
                            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover/avatar:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 pointer-events-none">
                              <ImageIcon size={20} className="text-white" />
                              <span className="text-white text-[10px] font-semibold leading-tight text-center px-2">
                                Mudar imagem do grupo
                              </span>
                            </div>
                          </button>

                          {/* Context menu */}
                          {groupAvatarMenu && (
                            <>
                              <div
                                className="fixed inset-0 z-[2000]"
                                onClick={() => setGroupAvatarMenu(false)}
                              />
                              <div className="absolute left-1/2 -translate-x-1/2 top-[calc(100%+8px)] z-[101] min-w-[180px] rounded-xl bg-white dark:bg-gray-800 shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden py-1">
                                {resolveApiMediaUrl(activeChat.groupAvatarUrl) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setGroupAvatarMenu(false);
                                      setShowGroupAvatarViewer(true);
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                  >
                                    <ImageIcon size={15} className="text-gray-500 dark:text-gray-400" />
                                    Mostrar foto
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setGroupAvatarMenu(false);
                                    groupAvatarInputRef.current?.click();
                                  }}
                                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <Camera size={15} className="text-gray-500 dark:text-gray-400" />
                                  Carregar foto
                                </button>
                                {resolveApiMediaUrl(activeChat.groupAvatarUrl) && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setGroupAvatarMenu(false);
                                      removeGroupAvatarMutation.mutate(activeChat.id);
                                    }}
                                    disabled={removeGroupAvatarMutation.isPending}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                                  >
                                    <Trash2 size={15} />
                                    Remover foto
                                  </button>
                                )}
                              </div>
                            </>
                          )}

                          {/* Input file oculto */}
                          <input
                            ref={groupAvatarInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file || !activeChat) return;
                              setGroupPhotoCrop({
                                imageSrc: URL.createObjectURL(file),
                                intent: { kind: 'group-avatar', chatId: activeChat.id },
                              });
                              e.target.value = '';
                            }}
                          />

                          {/* Loading spinner sobre o avatar durante upload */}
                          {(uploadGroupAvatarMutation.isPending || removeGroupAvatarMutation.isPending) && (
                            <div className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center">
                              <Loader2 size={28} className="animate-spin text-white" />
                            </div>
                          )}
                        </div>
                        {editingGroupName ? (
                          <div className="w-full mt-1 space-y-2">
                            <input
                              type="text"
                              value={groupNameDraft}
                              onChange={(e) => setGroupNameDraft(e.target.value)}
                              maxLength={120}
                              className="w-full px-3 py-2 text-base font-semibold rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-red-500/30"
                              placeholder="Nome do grupo"
                              autoFocus
                            />
                            <div className="flex gap-2 justify-center flex-wrap">
                              <button
                                type="button"
                                disabled={updateGroupMutation.isPending}
                                onClick={() => {
                                  const t = groupNameDraft.trim();
                                  if (t.length < 2) {
                                    toast.error('Nome deve ter ao menos 2 caracteres');
                                    return;
                                  }
                                  updateGroupMutation.mutate({
                                    chatId: activeChat.id,
                                    groupName: t,
                                  });
                                }}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                disabled={updateGroupMutation.isPending}
                                onClick={() => {
                                  setEditingGroupName(false);
                                  setGroupNameDraft(activeChat.groupName || '');
                                }}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:opacity-90 disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative w-full mt-1 min-h-[2.25rem] flex justify-center items-center px-10">
                            <p className="text-xl font-semibold text-gray-900 dark:text-gray-100 text-center break-words max-w-full">
                              {activeChat.groupName || 'Grupo'}
                            </p>
                            {isCurrentUserGroupMember && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingGroupName(true);
                                  setGroupNameDraft(activeChat.groupName || '');
                                }}
                                className="absolute right-0 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-full flex-shrink-0 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                                title="Editar nome do grupo"
                                aria-label="Editar nome do grupo"
                              >
                                <Pencil size={16} />
                              </button>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {activeChat.participants?.length ?? 0} membro(s)
                        </p>

                        {isCurrentUserGroupMember && (
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddGroupMembers(true);
                              setAddMemberPickSearch('');
                              setAddMemberPickSelection([]);
                            }}
                            className="mt-5 flex w-full max-w-[160px] flex-col items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-center transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-800"
                          >
                            <UserPlus size={26} strokeWidth={1.75} className="text-red-600 dark:text-red-400" />
                            <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                              Adicionar
                            </span>
                          </button>
                        )}
                      </div>

                      <div className="mt-4 w-full text-left">
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            Descrição
                          </span>
                          {isCurrentUserGroupMember && !editingGroupDescription && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingGroupDescription(true);
                                setGroupDescriptionDraft(activeChat.groupDescription || '');
                              }}
                              className="h-8 w-8 inline-flex items-center justify-center rounded-full flex-shrink-0 text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
                              title="Editar descrição"
                              aria-label="Editar descrição do grupo"
                            >
                              <Pencil size={16} />
                            </button>
                          )}
                        </div>
                        {editingGroupDescription ? (
                          <div className="space-y-2">
                            <textarea
                              value={groupDescriptionDraft}
                              onChange={(e) => setGroupDescriptionDraft(e.target.value)}
                              maxLength={500}
                              rows={4}
                              className="w-full px-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 outline-none focus:ring-2 focus:ring-red-500/30 resize-y min-h-[88px]"
                              placeholder="Descrição do grupo (opcional)"
                              autoFocus
                            />
                            <div className="flex gap-2 flex-wrap">
                              <button
                                type="button"
                                disabled={updateGroupMutation.isPending}
                                onClick={() => {
                                  updateGroupMutation.mutate({
                                    chatId: activeChat.id,
                                    groupDescription:
                                      groupDescriptionDraft.trim() === ''
                                        ? null
                                        : groupDescriptionDraft.trim(),
                                  });
                                }}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                              >
                                Salvar
                              </button>
                              <button
                                type="button"
                                disabled={updateGroupMutation.isPending}
                                onClick={() => {
                                  setEditingGroupDescription(false);
                                  setGroupDescriptionDraft(activeChat.groupDescription || '');
                                }}
                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 hover:opacity-90 disabled:opacity-50"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
                            {activeChat.groupDescription?.trim()
                              ? activeChat.groupDescription
                              : 'Sem descrição. Use o lápis para adicionar.'}
                          </p>
                        )}
                      </div>

                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                        Grupo criado por {activeChat.initiator?.name || 'Usuário'}
                      </p>

                      {/* Faixa de altura alinhada à busca: hover cobre tudo entre as bordas */}
                      <div
                        className="-mx-4 mt-4 border-t border-b border-gray-200 dark:border-gray-800"
                        role="group"
                        aria-label="Mensagens favoritas"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setShowStarredMsgSidebar(true);
                            setStarredMsgSearchQuery('');
                          }}
                          className="flex w-full min-h-[48px] items-center gap-3 px-4 py-3 text-left text-gray-900 transition-colors hover:bg-gray-100/80 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:text-gray-100 dark:hover:bg-white/10"
                        >
                          <Star
                            size={20}
                            strokeWidth={1.6}
                            className="flex-shrink-0 text-gray-400"
                            fill="none"
                          />
                          <span className="text-[15px]">Mensagens favoritas</span>
                        </button>
                      </div>
                    </div>

                    <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                      <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={groupMemberSearch}
                          onChange={(e) => setGroupMemberSearch(e.target.value)}
                          placeholder="Procurar membros"
                          className="w-full pl-8 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-500 border border-transparent outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50"
                        />
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto px-2 py-2 min-h-0">
                      {isCurrentUserGroupMember && (
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddGroupMembers(true);
                            setAddMemberPickSearch('');
                            setAddMemberPickSelection([]);
                          }}
                          className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-green-600 text-white dark:text-black">
                            <UserPlus size={20} strokeWidth={2.2} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                              Adicionar membro
                            </p>
                          </div>
                        </button>
                      )}
                      {filteredGroupParticipants.length === 0 ? (
                        <div className="text-sm text-center text-gray-500 dark:text-gray-400 py-8">
                          Nenhum membro encontrado
                        </div>
                      ) : (
                        filteredGroupParticipants.map((p) => (
                          <div
                            key={p.userId}
                            role="button"
                            tabIndex={0}
                            onClick={() => setContactDetailsUser(p.user)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setContactDetailsUser(p.user);
                              }
                            }}
                            className="group flex cursor-pointer items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                          >
                            <Avatar user={p.user} />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                {p.userId === currentUser?.id ? 'Você' : p.user.name}
                              </p>
                              {p.user.employee?.department && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                  {p.user.employee.department}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              {p.isAdmin && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                  Admin
                                </span>
                              )}
                              {isCurrentUserGroupMember &&
                                currentUser?.id &&
                                String(p.userId) !== String(currentUser.id) && (
                                  <button
                                    type="button"
                                    title={`Remover ${p.user.name} do grupo`}
                                    disabled={removeGroupMemberMutation.isPending}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!activeChat?.id) return;
                                      if (
                                        !confirm(
                                          `Remover ${p.user.name} deste grupo?`
                                        )
                                      ) {
                                        return;
                                      }
                                      removeGroupMemberMutation.mutate({
                                        chatId: activeChat.id,
                                        userId: p.userId,
                                      });
                                    }}
                                    className="h-8 w-8 inline-flex items-center justify-center rounded-lg text-gray-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100 hover:bg-rose-500/15 hover:text-rose-600 focus-visible:opacity-100 dark:hover:text-rose-400 disabled:opacity-50"
                                    aria-label={`Remover ${p.user.name} do grupo`}
                                  >
                                    <X size={18} strokeWidth={2.2} />
                                  </button>
                                )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 p-3">
                      <button
                        type="button"
                        disabled={leaveGroupMutation.isPending}
                        onClick={() => {
                          if (!activeChat?.id) return;
                          if (!confirm('Sair deste grupo?')) return;
                          leaveGroupMutation.mutate(activeChat.id);
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-rose-400 hover:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/15 transition-colors disabled:opacity-50"
                      >
                        {leaveGroupMutation.isPending ? (
                          <Loader2 size={20} className="animate-spin flex-shrink-0" />
                        ) : (
                          <LogOut size={20} className="flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium">Sair do grupo</span>
                      </button>
                    </div>
                  </aside>

                  {showAddGroupMembers && isCurrentUserGroupMember && activeChat && (
                    <>
                      <AppModalOverlay
                        as="button"
                        type="button"
                        aria-label="Fechar modal"
                        className="app-modal-overlay fixed inset-0 z-[2100] bg-black/50 backdrop-blur-[1px]"
                        onClick={() => {
                          if (addGroupMembersMutation.isPending) return;
                          setShowAddGroupMembers(false);
                          setAddMemberPickSelection([]);
                          setAddMemberPickSearch('');
                        }} />
                      <AppModalOverlay
                        className="app-modal-overlay fixed inset-0 z-[1101] flex items-center justify-center p-4 pointer-events-none"
                        role="presentation"
                      >
                        <div
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="add-member-modal-title"
                          className="pointer-events-auto flex max-h-[min(560px,85vh)] w-full max-w-md min-h-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-900"
                        >
                          <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
                            <h2
                              id="add-member-modal-title"
                              className="text-base font-semibold text-gray-900 dark:text-gray-100"
                            >
                              Adicionar ao grupo
                            </h2>
                            <button
                              type="button"
                              disabled={addGroupMembersMutation.isPending}
                              onClick={() => {
                                setShowAddGroupMembers(false);
                                setAddMemberPickSelection([]);
                                setAddMemberPickSearch('');
                              }}
                              className="h-9 w-9 inline-flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-50"
                              aria-label="Fechar"
                            >
                              <X size={20} />
                            </button>
                          </div>

                          <div className="px-4 pt-3 pb-2">
                            <div className="relative">
                              <Search
                                size={16}
                                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                              />
                              <input
                                type="search"
                                value={addMemberPickSearch}
                                onChange={(e) => setAddMemberPickSearch(e.target.value)}
                                placeholder="Buscar por nome ou setor..."
                                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-500 outline-none focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                                autoComplete="off"
                              />
                            </div>
                            {addMemberPickSelection.length > 0 && (
                              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                                {addMemberPickSelection.length} selecionado(s)
                              </p>
                            )}
                          </div>

                          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                            {addMemberUsersByLetter.length === 0 ? (
                              <p className="px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                                {usersAvailableToAdd.length === 0
                                  ? 'Todos os usuários já estão neste grupo.'
                                  : 'Nenhum resultado para a busca.'}
                              </p>
                            ) : (
                              addMemberUsersByLetter.map(([letter, letterUsers]) => (
                                <div key={letter}>
                                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                    {letter}
                                  </div>
                                  {letterUsers.map((u) => {
                                    const selected = addMemberPickSelection.includes(u.id);
                                    return (
                                      <label
                                        key={u.id}
                                        className={clsx(
                                          'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors',
                                          selected
                                            ? 'bg-red-50 dark:bg-red-900/20'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-800/80'
                                        )}
                                      >
                                        <div className="relative shrink-0">
                                          <input
                                            type="checkbox"
                                            checked={selected}
                                            onChange={() => toggleAddMemberPick(u.id)}
                                            disabled={addGroupMembersMutation.isPending}
                                            className="sr-only"
                                          />
                                          <div
                                            className={clsx(
                                              'h-5 w-5 rounded border-2 transition-all duration-200 flex items-center justify-center',
                                              selected
                                                ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                                : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600'
                                            )}
                                          >
                                            {selected && (
                                              <svg
                                                className="h-3 w-3 text-white"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                aria-hidden
                                              >
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                              </svg>
                                            )}
                                          </div>
                                        </div>
                                        <Avatar user={u} size="sm" />
                                        <div className="min-w-0 flex-1">
                                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                            {u.name}
                                          </p>
                                          {u.employee?.department && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                              {u.employee.department}
                                            </p>
                                          )}
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              ))
                            )}
                          </div>

                          <div className="flex flex-shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
                            <button
                              type="button"
                              disabled={addGroupMembersMutation.isPending}
                              onClick={() => {
                                setShowAddGroupMembers(false);
                                setAddMemberPickSelection([]);
                                setAddMemberPickSearch('');
                              }}
                              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={
                                addGroupMembersMutation.isPending || addMemberPickSelection.length === 0
                              }
                              onClick={() => {
                                if (!activeChat.id || addMemberPickSelection.length === 0) return;
                                addGroupMembersMutation.mutate({
                                  chatId: activeChat.id,
                                  participantIds: addMemberPickSelection,
                                });
                              }}
                              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              {addGroupMembersMutation.isPending
                                ? 'Adicionando...'
                                : `Adicionar (${addMemberPickSelection.length})`}
                            </button>
                          </div>
                        </div>
                      </AppModalOverlay>
                    </>
                  )}
                </>
              )}

              {activeChat?.chatType === 'GROUP' && showGroupDetails && showStarredMsgSidebar && (
                <>
                  <button
                    type="button"
                    aria-label="Fechar favoritos"
                    onClick={() => setShowStarredMsgSidebar(false)}
                    className="absolute inset-0 z-[54] bg-black/25"
                  />
                  <aside className="absolute right-0 top-0 z-[55] flex h-full w-full flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 sm:w-[520px] lg:w-[600px]">
                    <div className="flex flex-shrink-0 items-center gap-2 px-3 py-3 sm:px-4">
                      <button
                        type="button"
                        onClick={() => setShowStarredMsgSidebar(false)}
                        className="h-9 w-9 -ml-1 inline-flex flex-shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        aria-label="Voltar aos dados do grupo"
                      >
                        <ChevronLeft size={22} strokeWidth={2} />
                      </button>
                      <h3 className="text-xl font-semibold leading-snug tracking-tight text-gray-900 dark:text-gray-100 sm:text-lg">
                        Mensagens favoritas
                      </h3>
                    </div>
                    <div className="flex-shrink-0 px-4 pt-1 pb-2">
                      <div className="flex items-center gap-2 rounded-xl border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
                        <Search size={16} className="flex-shrink-0 text-gray-400" />
                        <input
                          ref={starredMsgInputRef}
                          type="text"
                          value={starredMsgSearchQuery}
                          onChange={(e) => setStarredMsgSearchQuery(e.target.value)}
                          placeholder="Pesquisar nas favoritas..."
                          className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100"
                        />
                        {starredMsgSearchQuery ? (
                          <button
                            type="button"
                            onClick={() => setStarredMsgSearchQuery('')}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                            aria-label="Limpar"
                          >
                            <X size={14} />
                          </button>
                        ) : null}
                      </div>
                      {starredMsgSearchQuery.trim() ? (
                        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                          {starredMsgSearchResults.length === 0
                            ? 'Nenhuma mensagem encontrada'
                            : `${starredMsgSearchResults.length} resultado${starredMsgSearchResults.length === 1 ? '' : 's'}`}
                        </p>
                      ) : null}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
                      {favoritedMessagesInChat.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center text-gray-400 dark:text-gray-500">
                          <Star size={36} strokeWidth={1.3} className="opacity-60" />
                          <p className="text-sm">
                            Nenhuma favorita ainda. Clique com o botão direito em uma mensagem e escolha
                            Favoritar.
                          </p>
                        </div>
                      ) : starredMsgSearchQuery.trim() && starredMsgSearchResults.length === 0 ? (
                        <div className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                          Nenhuma favorita bate com a busca
                        </div>
                      ) : (
                        starredMsgSearchResults.map((msg) => {
                          const isOwn = msg.senderId === currentUser?.id;
                          const senderName = isOwn
                            ? 'Você'
                            : activeChat?.participants?.find((p) => p.userId === msg.senderId)?.user
                                ?.name || msg.sender?.name || 'Contato';
                          const q = starredMsgSearchQuery.trim().toLowerCase();
                          const raw = getMessageSearchPreview(msg);
                          const content = String(raw);
                          const idx = q ? content.toLowerCase().indexOf(q) : -1;
                          const before = idx >= 0 ? content.slice(0, idx) : content;
                          const match = idx >= 0 ? content.slice(idx, idx + q.length) : '';
                          const after = idx >= 0 ? content.slice(idx + q.length) : '';
                          return (
                            <button
                              key={msg.id}
                              type="button"
                              onClick={() => {
                                setShowStarredMsgSidebar(false);
                                setTimeout(() => scrollToMessage(msg.id), 150);
                              }}
                              className="mb-1 w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              <div className="mb-1 flex items-center justify-between">
                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                                  <span className={isOwn ? 'text-gray-700 dark:text-gray-200' : getNameColorClass(String(msg.senderId || senderName))}>
                                    {senderName}
                                  </span>
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  {new Date(msg.createdAt).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: 'short',
                                  })}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-sm text-gray-600 dark:text-gray-300">
                                {q && idx >= 0 ? (
                                  <>
                                    {before}
                                    <mark className="rounded bg-yellow-200 px-0.5 text-gray-900 dark:bg-yellow-600 dark:text-white">
                                      {match}
                                    </mark>
                                    {after}
                                  </>
                                ) : (
                                  content
                                )}
                              </p>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </aside>
                </>
              )}

              {contactDetailsUser && (
                <>
                  <button
                    type="button"
                    aria-label="Fechar dados do contato"
                    onClick={() => setContactDetailsUser(null)}
                    className="absolute inset-0 z-[52] bg-black/30"
                  />
                  <aside className="absolute right-0 top-0 z-[53] flex h-full w-full flex-col border-l border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 sm:w-[520px] lg:w-[600px]">
                    <div className="flex flex-shrink-0 items-center gap-2 border-b border-gray-200 px-3 py-3 sm:px-4 dark:border-gray-800">
                      <button
                        type="button"
                        onClick={() => setContactDetailsUser(null)}
                        className="h-9 w-9 -ml-1 inline-flex flex-shrink-0 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
                        aria-label={
                          contactDetailsOpenedFromGroup
                            ? 'Voltar aos dados do grupo'
                            : 'Fechar dados do contato'
                        }
                        title={
                          contactDetailsOpenedFromGroup
                            ? 'Voltar aos dados do grupo'
                            : 'Fechar'
                        }
                      >
                        {contactDetailsOpenedFromGroup ? (
                          <ChevronLeft size={22} strokeWidth={2} />
                        ) : (
                          <X size={22} strokeWidth={2} />
                        )}
                      </button>
                      <h3 className="text-xl font-semibold leading-snug tracking-tight text-gray-900 dark:text-gray-100 sm:text-lg">
                        Dados do contato
                      </h3>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <div className="flex flex-col items-center border-b border-gray-200 px-4 py-6 text-center dark:border-gray-800">
                        <Avatar user={contactDetailsUser} size="xl" />
                        <p className="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100">
                          {contactDetailsUser.name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {contactDetailsUser.employee?.department || 'Contato interno'}
                        </p>

                        {contactDetailsOpenedFromGroup &&
                          currentUser?.id &&
                          String(contactDetailsUser.id) !== String(currentUser.id) && (
                            <button
                              type="button"
                              disabled={openChatMutation.isPending}
                              onClick={() => {
                                openChatMutation.mutate(contactDetailsUser.id);
                                setContactDetailsUser(null);
                                setShowGroupDetails(false);
                              }}
                              className="mt-5 flex w-full max-w-[160px] flex-col items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50/80 px-4 py-3 text-center transition-colors hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800/50 dark:hover:bg-gray-800 disabled:opacity-50"
                            >
                              <MessageSquare
                                size={26}
                                strokeWidth={1.75}
                                className="text-red-600 dark:text-red-400"
                              />
                              <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                                Conversar
                              </span>
                            </button>
                          )}
                      </div>

                      <div className="px-4 py-4">
                        <div className="mb-4 text-left">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            E-mail
                          </span>
                          <a
                            href={`mailto:${contactDetailsUser.email}`}
                            className="mt-1 block break-all text-sm text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {contactDetailsUser.email}
                          </a>
                        </div>

                        {contactDetailsUser.employee?.department && (
                          <div className="mb-4 text-left">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Departamento
                            </span>
                            <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                              {contactDetailsUser.employee.department}
                            </p>
                          </div>
                        )}

                        {contactDetailsUser.employee?.position && (
                          <div className="mb-4 text-left">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Cargo
                            </span>
                            <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                              {contactDetailsUser.employee.position}
                            </p>
                          </div>
                        )}

                        {contactDetailsUser.employee?.employeeId && (
                          <div className="text-left">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Matrícula
                            </span>
                            <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                              {contactDetailsUser.employee.employeeId}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </aside>
                </>
              )}
            </div>
          )}
        </div>
      )}
      </div>
    </div>

    {/* ── Lightbox: foto do grupo ────────────────────────────────── */}
    {showGroupAvatarViewer && activeChat && resolveApiMediaUrl(activeChat.groupAvatarUrl) && typeof document !== 'undefined' && createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80"
        onClick={() => setShowGroupAvatarViewer(false)}
      >
        <button
          type="button"
          onClick={() => setShowGroupAvatarViewer(false)}
          className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        >
          <X size={22} />
        </button>
        <img
          src={resolveApiMediaUrl(activeChat.groupAvatarUrl)!}
          alt={activeChat.groupName || 'Foto do grupo'}
          className="max-w-[90vw] max-h-[90vh] rounded-2xl object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          referrerPolicy="no-referrer"
        />
      </div>,
      document.body
    )}

    {/* ── Lightbox: imagens das mensagens ─────────────────────────── */}
    {messageImageViewer && typeof document !== 'undefined' && createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
        onClick={() => setMessageImageViewer(null)}
      >
        <button
          type="button"
          onClick={() => setMessageImageViewer(null)}
          className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
          title="Fechar"
        >
          <X size={22} />
        </button>
        <img
          src={messageImageViewer.src}
          alt={messageImageViewer.name}
          className="max-w-[92vw] max-h-[88vh] rounded-2xl object-contain shadow-2xl"
          onClick={(e) => e.stopPropagation()}
          referrerPolicy="no-referrer"
        />
      </div>,
      document.body
    )}

    {/* ── Modal Novo Grupo ──────────────────────────────────────── */}
    {showNewGroupModal && typeof document !== 'undefined' && createPortal(
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) closeNewGroupModal(); }}
      >
        <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90dvh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <div className="flex items-center gap-3">
              {newGroupModalStep === 2 && (
                <button
                  onClick={() => setNewGroupModalStep(1)}
                  className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
              )}
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                {newGroupModalStep === 1 ? 'Novo grupo' : 'Adicionar participantes'}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              {/* step indicator */}
              <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{newGroupModalStep}/2</span>
              <button
                onClick={closeNewGroupModal}
                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* ── Etapa 1: foto, nome, descrição ── */}
          {newGroupModalStep === 1 && (
            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

              {/* Foto do grupo */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => newGroupPhotoInputRef.current?.click()}
                  className="relative group focus:outline-none"
                >
                  <div className="w-24 h-24 rounded-full bg-gray-100 dark:bg-gray-800 border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center overflow-hidden transition-colors group-hover:border-red-400">
                    {newGroupPhotoPreview ? (
                      <img src={newGroupPhotoPreview ?? undefined} alt="Foto do grupo" className="w-full h-full object-cover" />
                    ) : (
                      <Camera size={30} className="text-gray-400 dark:text-gray-500" />
                    )}
                  </div>
                  <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shadow border-2 border-white dark:border-gray-900 group-hover:bg-red-500 transition-colors">
                    <Camera size={14} className="text-white" />
                  </div>
                </button>
                <input
                  ref={newGroupPhotoInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setGroupPhotoCrop({
                      imageSrc: URL.createObjectURL(file),
                      intent: { kind: 'new-group' },
                    });
                    e.target.value = '';
                  }}
                />
              </div>
              {newGroupPhotoPreview && (
                <div className="flex justify-center -mt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setNewGroupPhotoFile(null);
                      setNewGroupPhotoPreview((prev) => {
                        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev);
                        return null;
                      });
                    }}
                    className="text-xs text-red-500 hover:underline"
                  >
                    Remover foto
                  </button>
                </div>
              )}

              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Nome do grupo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="Digite o nome do grupo"
                  maxLength={100}
                  className="w-full px-4 py-2.5 text-sm rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 border border-transparent focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-500/50"
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                  Descrição
                </label>
                <textarea
                  value={newGroupDescription}
                  onChange={(e) => setNewGroupDescription(e.target.value)}
                  placeholder="Sobre o grupo..."
                  maxLength={500}
                  rows={3}
                  className="new-group-modal-field"
                />
              </div>
            </div>
          )}

          {/* ── Etapa 2: participantes ── */}
          {newGroupModalStep === 2 && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Chips dos selecionados */}
              {groupMembers.length > 0 && (
                <div className="px-4 pt-3 pb-2 flex flex-wrap gap-1.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
                  {groupMembers.map((mid) => {
                    const u = users.find(x => x.id === mid);
                    if (!u) return null;
                    return (
                      <span key={mid} className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-xs font-medium border border-red-200 dark:border-red-700/50">
                        {u.name.split(' ')[0]}
                        <button onClick={() => toggleGroupMember(mid)} className="hover:text-red-900 dark:hover:text-red-100">
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Busca */}
              <div className="px-4 py-2 shrink-0">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar pessoa..."
                    value={newGroupMemberSearch}
                    onChange={(e) => setNewGroupMemberSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 border border-transparent focus:outline-none focus:ring-2 focus:ring-red-500/30"
                  />
                </div>
              </div>

              {/* Lista de usuários */}
              <div className="flex-1 overflow-y-auto">
                {users
                  .filter(u => {
                    if (!newGroupMemberSearch.trim()) return true;
                    return (
                      textMatchesSearch(u.name, newGroupMemberSearch) ||
                      textMatchesSearch(u.email, newGroupMemberSearch)
                    );
                  })
                  .map((u) => {
                    const selected = groupMembers.includes(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleGroupMember(u.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-left"
                      >
                        <Avatar user={u} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{u.name}</p>
                          {u.employee && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{u.employee.department}</p>
                          )}
                        </div>
                        <div
                          className={clsx(
                            'shrink-0 h-[18px] w-[18px] rounded border flex items-center justify-center transition-colors',
                            selected
                              ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
                              : 'border-gray-300 bg-white dark:border-gray-500 dark:bg-gray-800'
                          )}
                        >
                          {selected && (
                            <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 shrink-0 flex items-center justify-between gap-3">
            {newGroupModalStep === 1 ? (
              <>
                <button
                  type="button"
                  onClick={closeNewGroupModal}
                  className="px-4 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!newGroupName.trim()) {
                      toast.error('Informe o nome do grupo');
                      return;
                    }
                    setNewGroupModalStep(2);
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium transition-colors"
                >
                  Próximo
                  <ChevronRight size={16} />
                </button>
              </>
            ) : (
              <>
                <span className="text-xs text-gray-500 dark:text-gray-400">{groupMembers.length} selecionado(s)</span>
                <button
                  type="button"
                  onClick={handleCreateGroup}
                  disabled={createGroupMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-medium transition-colors"
                >
                  {createGroupMutation.isPending ? (
                    <><Loader2 size={14} className="animate-spin" /> Criando...</>
                  ) : (
                    'Criar grupo'
                  )}
                </button>
              </>
            )}
          </div>

        </div>
      </div>,
      document.body
    )}

    {groupPhotoCrop && (
      <CircularPhotoCropModal
        open
        imageSrc={groupPhotoCrop.imageSrc}
        onClose={closeGroupPhotoCrop}
        onConfirm={handleGroupPhotoCropConfirm}
        onPickReplacement={handleGroupPhotoReplaceSource}
      />
    )}

    </>
  );
}
