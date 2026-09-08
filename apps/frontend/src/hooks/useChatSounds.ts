'use client';

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import type { NativeCallPhase } from '@/hooks/useNativeWebRTCCall';
import {
  playNewMessageSound,
  startIncomingCallRing,
  startOutgoingCallRingback,
  stopIncomingCallRing,
  stopOutgoingCallRingback,
  unlockChatAudio,
} from '@/lib/chatSounds';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';

const ACTIVE_CHAT_STORAGE_KEY = 'conversas-active-chat-id';

type ChatMessageSnapshot = {
  id: string;
  senderId: string;
  createdAt: string;
  isRead: boolean;
};

type DirectChatSnapshot = {
  id: string;
  messages?: ChatMessageSnapshot[];
};

function shouldSuppressMessageSound(chatId: string): boolean {
  if (typeof window === 'undefined') return false;
  if (!window.location.pathname.includes('/ponto/conversas')) return false;
  const active = sessionStorage.getItem(ACTIVE_CHAT_STORAGE_KEY);
  if (active !== chatId) return false;
  return document.visibilityState === 'visible' && document.hasFocus();
}

function lastMessageFingerprint(chat: DirectChatSnapshot): string | null {
  const msgs = chat.messages ?? [];
  if (msgs.length === 0) return null;
  const last = msgs[msgs.length - 1];
  return `${last.id}:${last.createdAt}`;
}

async function fetchDirectChatsForSounds(): Promise<DirectChatSnapshot[]> {
  const res = await api.get('/chats/direct');
  return res.data?.data ?? [];
}

export function useChatSounds(opts: {
  userId: string | undefined;
  callPhase: NativeCallPhase;
}) {
  const { userId, callPhase } = opts;
  const initializedRef = useRef(false);
  const fingerprintsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const unlock = () => {
      void unlockChatAudio();
    };
    window.addEventListener('pointerdown', unlock, { once: true, passive: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (callPhase === 'ringing') {
      startIncomingCallRing();
      stopOutgoingCallRingback();
      return () => stopIncomingCallRing();
    }
    stopIncomingCallRing();
    return undefined;
  }, [callPhase]);

  useEffect(() => {
    if (callPhase === 'idle' || callPhase === 'connected') {
      stopIncomingCallRing();
      stopOutgoingCallRingback();
    }
  }, [callPhase]);

  /** Mesmo cache da página Conversas — evita polling duplicado do endpoint pesado. */
  const { data: chats = [] } = useQuery({
    queryKey: ['directChats'],
    queryFn: fetchDirectChatsForSounds,
    enabled: !!userId,
    staleTime: 5_000,
    refetchInterval: () => visibleTabRefetchInterval(8_000),
  });

  useEffect(() => {
    if (!userId || chats.length === 0) return;

    if (!initializedRef.current) {
      chats.forEach((chat) => {
        const fp = lastMessageFingerprint(chat);
        if (fp) fingerprintsRef.current.set(chat.id, fp);
      });
      initializedRef.current = true;
      return;
    }

    for (const chat of chats) {
      const msgs = chat.messages ?? [];
      if (msgs.length === 0) continue;
      const last = msgs[msgs.length - 1];
      const fp = `${last.id}:${last.createdAt}`;
      const prev = fingerprintsRef.current.get(chat.id);

      if (prev && prev !== fp && last.senderId !== userId && !shouldSuppressMessageSound(chat.id)) {
        playNewMessageSound();
      }

      fingerprintsRef.current.set(chat.id, fp);
    }
  }, [chats, userId]);
}

/** Sincroniza o chat aberto na tela de conversas (evita som ao ler em tempo real). */
export function syncConversasActiveChatId(chatId: string | null): void {
  if (typeof window === 'undefined') return;
  if (chatId) {
    sessionStorage.setItem(ACTIVE_CHAT_STORAGE_KEY, chatId);
  } else {
    sessionStorage.removeItem(ACTIVE_CHAT_STORAGE_KEY);
  }
}
