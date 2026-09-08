'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Video, VideoOff, PhoneOff, MonitorUp, Minimize2, Maximize2, MessageSquare, Send, Users, Copy, Lock, Unlock, VolumeX, UserX, UserPlus } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeCallHook } from '@/hooks/useNativeWebRTCCall';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import api from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { useTheme } from '@/context/ThemeContext';
import { toast } from 'react-hot-toast';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

const AVATAR_COLORS = [
  'bg-red-600',
  'bg-amber-600',
  'bg-emerald-600',
  'bg-cyan-600',
  'bg-indigo-600',
  'bg-violet-600',
];

function colorFromSeed(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i++) n = (n + seed.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[n];
}

function initialsFromName(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function CallAvatar({
  name,
  photoUrl,
  seed,
  sizeClass,
  ringClass = ''
}: {
  name: string;
  photoUrl?: string | null;
  seed: string;
  sizeClass: string;
  ringClass?: string;
}) {
  const resolved = resolveApiMediaUrl(photoUrl ?? null);
  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white shadow-lg ${sizeClass} ${ringClass} ${
        resolved ? '' : colorFromSeed(seed)
      }`}
    >
      {resolved ? (
        <img src={resolved} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        initialsFromName(name || '?')
      )}
    </div>
  );
}

function GroupMeshTile({
  name,
  stream,
  callIsVideo,
  muted,
  videoClassName
}: {
  name: string;
  stream: MediaStream | null;
  callIsVideo: boolean;
  muted?: boolean;
  videoClassName?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoLive, setVideoLive] = useState(false);

  useEffect(() => {
    if (!stream) {
      setVideoLive(false);
      return;
    }
    const sync = () => {
      setVideoLive(
        stream.getVideoTracks().some((t) => t.kind === 'video' && t.readyState === 'live' && t.enabled && !t.muted)
      );
    };
    sync();
    const cleanups: (() => void)[] = [];
    stream.getVideoTracks().forEach((t) => {
      t.addEventListener('mute', sync);
      t.addEventListener('unmute', sync);
      t.addEventListener('ended', sync);
      cleanups.push(() => {
        t.removeEventListener('mute', sync);
        t.removeEventListener('unmute', sync);
        t.removeEventListener('ended', sync);
      });
    });
    return () => cleanups.forEach((c) => c());
  }, [stream]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    void el.play().catch(() => {});
    const raf = requestAnimationFrame(() => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        void videoRef.current.play().catch(() => {});
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [stream]);

  const vtLive = callIsVideo && videoLive;

  return (
    <div
      className={`relative flex aspect-video min-h-0 w-full items-center justify-center overflow-hidden rounded-xl border ${!callIsVideo ? 'border-emerald-900/50 bg-gray-800/90' : vtLive ? 'border-white/20 bg-black' : 'border-white/15 bg-gray-900/90'} ${videoClassName ?? ''}`}
    >
      {stream ? (
        <video
          ref={videoRef}
          playsInline
          autoPlay
          muted={muted}
          className={
            vtLive
              ? 'absolute inset-0 h-full w-full object-cover'
              : 'pointer-events-none absolute left-0 top-0 h-px w-px opacity-0'
          }
        />
      ) : null}
      {!vtLive && (
        <div className="flex flex-col items-center gap-2 px-2 text-center">
          <CallAvatar name={name} photoUrl={null} seed={name} sizeClass="h-16 w-16 text-xl" ringClass="ring-2 ring-white/20" />
          <p className="max-w-full truncate text-xs font-medium text-white/90">{name}</p>
          {callIsVideo && <p className="text-[10px] text-white/55">Sem vídeo ou conectando…</p>}
          {!callIsVideo && <p className="text-[10px] text-emerald-300/80">Somente áudio</p>}
        </div>
      )}
      <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 rounded bg-black/65 px-2 py-0.5 text-[10px] font-semibold text-white/95">
        {name}
      </div>
    </div>
  );
}

export function NativeCallOverlay({
  call,
  peerAvatarUrl,
  localAvatarUrl,
  localDisplayName
}: {
  call: NativeCallHook;
  peerAvatarUrl?: string | null;
  localAvatarUrl?: string | null;
  localDisplayName?: string | null;
}) {
  const {
    phase,
    incoming,
    localStream,
    remoteStream,
    micMuted,
    camOff,
    peerName,
    callIsVideo,
    isScreenSharing,
    activeChatId,
    callSideChatId,
    callDurationSec,
    callQuality,
    callLatencyMs,
    packetLossPct,
    wsConnectionState,
    acceptIncoming,
    rejectIncoming,
    endCall,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    isGroupCall,
    groupPeers,
    groupCallLocked,
    groupPendingJoinIds,
    groupInviteLink,
    setGroupLock,
    muteGroupPeer,
    kickGroupPeer,
    approveGroupJoin,
    inviteMoreToGroupCall,
  } = call;

  const localPipRef = useRef<HTMLVideoElement>(null);
  const localMainRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);
  const remotePipRef = useRef<HTMLVideoElement>(null);
  const dragStateRef = useRef<{ active: boolean; dx: number; dy: number }>({ active: false, dx: 0, dy: 0 });
  const [primaryView, setPrimaryView] = useState<'remote' | 'local'>('remote');
  const [pipPos, setPipPos] = useState<{ x: number; y: number } | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [minimizedPos, setMinimizedPos] = useState<{ x: number; y: number } | null>(null);
  const [isCallChatOpen, setIsCallChatOpen] = useState(false);
  const [isGroupPanelOpen, setIsGroupPanelOpen] = useState(false);
  const [addParticipantOpen, setAddParticipantOpen] = useState(false);
  const [addParticipantPick, setAddParticipantPick] = useState<string[]>([]);
  const [callMessage, setCallMessage] = useState('');
  const prevMinimizedRef = useRef(false);
  const minimizedCardRef = useRef<HTMLDivElement>(null);
  const minDragStateRef = useRef<{ active: boolean; dx: number; dy: number }>({ active: false, dx: 0, dy: 0 });
  const queryClient = useQueryClient();
  const { user } = usePermissions();
  const { isDark } = useTheme();

  /** Atualiza quando o par desliga/liga câmera (`muted`/eventos nos tracks mudam sem trocar o objeto MediaStream). */
  const [remoteHasLiveVideo, setRemoteHasLiveVideo] = useState(false);

  useEffect(() => {
    if (!remoteStream) {
      setRemoteHasLiveVideo(false);
      return;
    }

    const update = () => {
      setRemoteHasLiveVideo(
        remoteStream.getVideoTracks().some(
          (t) => t.kind === 'video' && t.readyState === 'live' && t.enabled && !t.muted
        )
      );
    };

    const subscribeTrack = (t: MediaStreamTrack) => {
      t.addEventListener('mute', update);
      t.addEventListener('unmute', update);
      t.addEventListener('ended', update);
    };

    const unsubscribeTrack = (t: MediaStreamTrack) => {
      t.removeEventListener('mute', update);
      t.removeEventListener('unmute', update);
      t.removeEventListener('ended', update);
    };

    const onAddTrack = (ev: MediaStreamTrackEvent) => {
      subscribeTrack(ev.track);
      update();
    };

    const onRemoveTrack = (ev: MediaStreamTrackEvent) => {
      unsubscribeTrack(ev.track);
      update();
    };

    remoteStream.getVideoTracks().forEach(subscribeTrack);
    remoteStream.addEventListener('addtrack', onAddTrack);
    remoteStream.addEventListener('removetrack', onRemoveTrack);
    update();

    return () => {
      remoteStream.getVideoTracks().forEach(unsubscribeTrack);
      remoteStream.removeEventListener('addtrack', onAddTrack);
      remoteStream.removeEventListener('removetrack', onRemoveTrack);
    };
  }, [remoteStream]);

  const showRemoteVideo = callIsVideo && remoteHasLiveVideo;
  const showMain = phase === 'calling' || phase === 'connected';
  const showIncoming = phase === 'ringing' && incoming;

  /** Re-anexar streams sempre que o DOM dos &lt;video&gt; mudar (minimizar, trocar foco PiP/principal — refs montam de novo mas o objeto MediaStream não muda). */
  useEffect(() => {
    const bindLocal = () => {
      [localPipRef.current, localMainRef.current].forEach((el) => {
        if (!el) return;
        el.srcObject = localStream;
        void el.play().catch(() => {});
      });
    };
    bindLocal();
    const raf = requestAnimationFrame(bindLocal);
    return () => cancelAnimationFrame(raf);
  }, [localStream, isMinimized, primaryView, showMain]);

  useEffect(() => {
    const bindRemote = () => {
      [remoteRef.current, remotePipRef.current].forEach((el) => {
        if (!el) return;
        el.srcObject = remoteStream;
        void el.play().catch(() => {});
      });
    };
    bindRemote();
    const raf = requestAnimationFrame(bindRemote);
    return () => cancelAnimationFrame(raf);
  }, [remoteStream, isMinimized, primaryView, showMain]);

  useEffect(() => {
    if (phase === 'idle') {
      setPrimaryView('remote');
      setPipPos(null);
      setIsMinimized(false);
      setMinimizedPos(null);
      setIsCallChatOpen(false);
      setCallMessage('');
      setAddParticipantOpen(false);
      setAddParticipantPick([]);
    }
  }, [phase]);

  useEffect(() => {
    if (primaryView === 'local' && (!localStream || !callIsVideo)) {
      setPrimaryView('remote');
    }
  }, [primaryView, localStream, callIsVideo]);

  useEffect(() => {
    if (prevMinimizedRef.current && !isMinimized) {
      setPipPos(null);
    }
    prevMinimizedRef.current = isMinimized;
  }, [isMinimized]);

  if (typeof document === 'undefined') return null;

  const peerLabel = peerName || incoming?.from.name || 'Contato';
  const peerPhoto = peerAvatarUrl ?? null;
  const peerSeed = incoming?.from.id || peerLabel;
  const localLabel = localDisplayName || 'Você';
  const amHost = isGroupCall && !Object.values(groupPeers).some((p) => p.isHost);
  const showLocalAsMain = primaryView === 'local' && callIsVideo && !!localStream;
  const chatIdForCallMessages =
    isGroupCall && callSideChatId ? callSideChatId : activeChatId;
  const canUseCallChat = !!chatIdForCallMessages && phase === 'connected';

  const { data: callChatData } = useQuery({
    queryKey: ['native-call-chat', chatIdForCallMessages],
    queryFn: async () => {
      if (!chatIdForCallMessages) return null;
      const res = await api.get(`/chats/direct/${chatIdForCallMessages}`);
      return res.data?.data ?? null;
    },
    enabled: canUseCallChat,
    refetchInterval: canUseCallChat ? 3000 : false,
  });

  const { data: groupChatForInvite } = useQuery({
    queryKey: ['native-call-group-invite', activeChatId],
    queryFn: async () => {
      if (!activeChatId) return null;
      const res = await api.get(`/chats/direct/${activeChatId}`);
      return res.data?.data as {
        chatType?: string;
        participants?: Array<{ userId: string; user?: { name?: string | null } | null }>;
      } | null;
    },
    enabled: Boolean(isGroupCall && activeChatId && phase === 'connected'),
  });

  const eligibleAddParticipants = useMemo(() => {
    if (!groupChatForInvite || groupChatForInvite.chatType !== 'GROUP') return [];
    const parts = groupChatForInvite.participants ?? [];
    return parts.filter((p) => {
      if (!p.userId || p.userId === user?.id) return false;
      if (groupPeers[p.userId]) return false;
      return true;
    });
  }, [groupChatForInvite, groupPeers, user?.id]);

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!chatIdForCallMessages || !callMessage.trim()) return;
      const fd = new FormData();
      fd.append('chatId', chatIdForCallMessages);
      fd.append('content', callMessage.trim());
      await api.post('/chats/direct/messages', fd);
    },
    onSuccess: async () => {
      setCallMessage('');
      await queryClient.invalidateQueries({ queryKey: ['native-call-chat', chatIdForCallMessages] });
      await queryClient.invalidateQueries({ queryKey: ['directChat', chatIdForCallMessages] });
      await queryClient.invalidateQueries({ queryKey: ['directChats'] });
    }
  });

  const callMessages = useMemo(() => {
    const raw = (callChatData?.messages ?? []) as Array<{
      id: string;
      content?: string;
      senderId?: string;
      sender?: { name?: string | null } | null;
    }>;
    return raw.filter((m) => !!m?.content?.trim()).slice(-30);
  }, [callChatData]);

  const durationLabel = useMemo(() => {
    const mm = Math.floor(callDurationSec / 60).toString().padStart(2, '0');
    const ss = (callDurationSec % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }, [callDurationSec]);

  const qualityLabel =
    callQuality === 'good' ? 'Boa' : callQuality === 'medium' ? 'Média' : callQuality === 'poor' ? 'Ruim' : 'Sem dados';
  const qualityColor =
    callQuality === 'good'
      ? 'bg-emerald-600/85'
      : callQuality === 'medium'
        ? 'bg-amber-600/85'
        : callQuality === 'poor'
          ? 'bg-red-600/85'
          : 'bg-slate-700/85';
  const overlayShellClass = isDark ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-900';
  const callGradientClass = isDark ? 'from-gray-900 to-black' : 'from-slate-100 to-slate-200';
  const glassBtnClass = isDark
    ? 'bg-black/50 hover:bg-black/65 text-white'
    : 'bg-white/80 hover:bg-white text-gray-900 border border-gray-300/80';
  const controlBtnClass = isDark
    ? 'bg-white/10 hover:bg-white/20 text-white'
    : 'bg-white hover:bg-slate-100 text-gray-900 border border-gray-300';
  const footerTextClass = isDark ? 'text-white/60' : 'text-gray-600';

  const sortedGroupEntries = useMemo(
    () => Object.entries(groupPeers).sort(([a], [b]) => a.localeCompare(b)),
    [groupPeers]
  );

  const groupTileCount = 1 + sortedGroupEntries.length;

  if (!showMain && !showIncoming) return null;

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!callIsVideo) return;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const rect = target.getBoundingClientRect();
    dragStateRef.current = {
      active: true,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top
    };
    if (!pipPos) {
      setPipPos({ x: rect.left, y: rect.top });
    }
  };

  const onDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    const pipWidth = event.currentTarget.offsetWidth;
    const pipHeight = event.currentTarget.offsetHeight;
    const x = Math.min(Math.max(8, event.clientX - dragStateRef.current.dx), window.innerWidth - pipWidth - 8);
    const y = Math.min(Math.max(8, event.clientY - dragStateRef.current.dy), window.innerHeight - pipHeight - 96);
    setPipPos({ x, y });
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const startMinDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const card = minimizedCardRef.current;
    if (!card) return;
    card.setPointerCapture(event.pointerId);
    const rect = card.getBoundingClientRect();
    minDragStateRef.current = {
      active: true,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top
    };
    if (!minimizedPos) {
      setMinimizedPos({ x: rect.left, y: rect.top });
    }
  };

  const onMinDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!minDragStateRef.current.active) return;
    const card = minimizedCardRef.current;
    const w = card?.offsetWidth ?? 340;
    const h = card?.offsetHeight ?? 140;
    const x = Math.min(Math.max(8, event.clientX - minDragStateRef.current.dx), window.innerWidth - w - 8);
    const y = Math.min(Math.max(8, event.clientY - minDragStateRef.current.dy), window.innerHeight - h - 8);
    setMinimizedPos({ x, y });
  };

  const endMinDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!minDragStateRef.current.active) return;
    minDragStateRef.current.active = false;
    minimizedCardRef.current?.releasePointerCapture(event.pointerId);
  };

  if (showIncoming && !showMain) {
    return createPortal(
      <div
        className={`fixed bottom-4 right-4 z-[210] w-[min(92vw,360px)] rounded-2xl p-4 shadow-2xl backdrop-blur-md ${isDark ? 'border border-white/20 bg-gray-900/95 text-white' : 'border border-gray-300 bg-white/95 text-gray-900'}`}
        role="dialog"
        aria-modal="false"
        aria-labelledby="native-call-incoming-title"
      >
          <p id="native-call-incoming-title" className={`text-[11px] font-semibold uppercase tracking-wide ${isDark ? 'text-white/55' : 'text-gray-500'}`}>
            Chamada recebida
          </p>
          <div className="mt-3 flex items-center gap-3">
            <CallAvatar name={incoming!.from.name} photoUrl={peerPhoto} seed={peerSeed} sizeClass="h-14 w-14 text-lg" ringClass="ring-2 ring-white/15" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">{incoming!.from.name}</p>
              <p className={`text-xs ${footerTextClass}`}>
                {incoming!.isGroupCall
                  ? `Chamada em grupo (${incoming!.groupExpectedCount ?? 'vários'} pessoas)`
                  : incoming!.video
                    ? 'Videochamada'
                    : 'Somente áudio'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={rejectIncoming}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Recusar
            </button>
            <button
              type="button"
              onClick={() => void acceptIncoming()}
              className="rounded-full bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700"
            >
              Atender
            </button>
          </div>
        </div>,
      document.body
    );
  }

  if (showMain && isMinimized) {
    return createPortal(
      <div
        ref={minimizedCardRef}
        className={`fixed z-[210] w-[min(90vw,340px)] touch-none rounded-2xl p-3 shadow-2xl backdrop-blur-md ${isDark ? 'border border-white/20 bg-gray-900/95 text-white' : 'border border-gray-300 bg-white/95 text-gray-900'} ${minimizedPos ? '' : 'bottom-4 right-4'}`}
        style={minimizedPos ? { left: minimizedPos.x, top: minimizedPos.y } : undefined}
        onPointerMove={onMinDrag}
        onPointerUp={endMinDrag}
        onPointerCancel={endMinDrag}
      >
        <div className="mb-3 flex items-center gap-2">
          <div
            className="flex min-w-0 flex-1 cursor-grab touch-none items-center gap-2 active:cursor-grabbing"
            onPointerDown={startMinDrag}
          >
            <CallAvatar name={peerLabel} photoUrl={peerPhoto} seed={peerSeed} sizeClass="h-10 w-10 text-sm" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{peerLabel}</p>
              <p className={`text-xs ${footerTextClass}`}>
                {isGroupCall
                  ? `${1 + Object.keys(groupPeers).length} na chamada · ${durationLabel}`
                  : phase === 'connected'
                    ? `Em chamada · ${durationLabel}`
                    : 'Conectando...'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setIsMinimized(false);
            }}
            className={`shrink-0 rounded-md p-1.5 ${controlBtnClass}`}
            aria-label="Abrir chamada"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" onClick={toggleMic} className={`flex size-10 items-center justify-center rounded-full ${controlBtnClass}`} aria-label={micMuted ? 'Ligar microfone' : 'Silenciar'}>
            {micMuted ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
          {callIsVideo && (
            <button type="button" onClick={toggleCam} className={`flex size-10 items-center justify-center rounded-full ${controlBtnClass}`} aria-label={camOff ? 'Ligar câmera' : 'Desligar câmera'}>
              {camOff ? <VideoOff size={18} /> : <Video size={18} />}
            </button>
          )}
          <button type="button" onClick={endCall} className="flex size-11 items-center justify-center rounded-full bg-red-600 hover:bg-red-700" aria-label="Encerrar chamada">
            <PhoneOff size={20} />
          </button>
        </div>
      </div>,
      document.body
    );
  }

  return createPortal(
    <AppModalOverlay className={`app-modal-overlay fixed inset-0 z-[2000] flex min-h-0 flex-col ${overlayShellClass}`}>
      {showMain && (
        <>
          <div className={`relative flex min-h-0 flex-1 flex-col bg-gradient-to-b ${callGradientClass}`}>
            <div className="absolute right-4 top-4 z-30 flex items-center gap-2">
              {phase === 'connected' && !isGroupCall && (
                <>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${qualityColor}`}>
                    Qualidade: {qualityLabel}
                  </span>
                  <span className="rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold">
                    {durationLabel}
                  </span>
                </>
              )}
              {phase === 'connected' && isGroupCall && (
                <span className="rounded-full bg-black/50 px-2 py-1 text-[10px] font-semibold text-white/90">
                  Grupo · {durationLabel}
                </span>
              )}
              {isGroupCall && (
                <button
                  type="button"
                  onClick={() => setIsGroupPanelOpen((v) => !v)}
                  className={`rounded-md p-2 ${isGroupPanelOpen ? 'bg-blue-600 hover:bg-blue-700' : 'bg-black/50 hover:bg-black/65'}`}
                  aria-label="Painel de participantes"
                >
                  <Users className="h-4 w-4" />
                </button>
              )}
              {canUseCallChat && (
                <button
                  type="button"
                  onClick={() => setIsCallChatOpen((v) => !v)}
                  className={`rounded-md p-2 ${isCallChatOpen ? 'bg-blue-600 hover:bg-blue-700' : 'bg-black/50 hover:bg-black/65'}`}
                  aria-label="Abrir chat da ligação"
                >
                  <MessageSquare className="h-4 w-4" />
                </button>
              )}
              <span className={`rounded-md px-2 py-1 text-[10px] font-semibold ${isDark ? 'bg-black/50 text-white/80' : 'bg-white/80 text-gray-700 border border-gray-300/80'}`}>
                {wsConnectionState === 'connected'
                  ? 'Sinalização online'
                  : wsConnectionState === 'reconnecting'
                    ? 'Reconectando...'
                    : 'Sinalização offline'}
              </span>
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className={`rounded-md p-2 ${glassBtnClass}`}
                aria-label="Minimizar chamada"
              >
                <Minimize2 className="h-4 w-4" />
              </button>
            </div>
            {phase === 'calling' && (
              <p className={`pointer-events-none absolute left-0 right-0 top-4 z-20 text-center text-sm ${isDark ? 'text-white/80' : 'text-gray-700'}`}>
                {isGroupCall
                  ? 'Convidando participantes…'
                  : peerLabel
                    ? `Chamando ${peerLabel}…`
                    : 'Conectando…'}
              </p>
            )}
            {phase === 'connected' && !isGroupCall && (
              <p className={`pointer-events-none absolute left-0 right-0 top-11 z-20 text-center text-xs ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                RTT {callLatencyMs !== null ? `${Math.round(callLatencyMs)}ms` : '--'} | Perda {packetLossPct !== null ? `${packetLossPct.toFixed(1)}%` : '--'}
              </p>
            )}

            {isGroupCall ? (
              <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-32 pt-14 sm:px-4 sm:pt-16">
                <p className={`pointer-events-none px-2 text-center text-[11px] leading-snug ${isDark ? 'text-white/55' : 'text-gray-600'}`}>
                  Chamada em grupo (malha direta entre navegadores). Use fones de ouvido para melhor áudio e menos eco.
                </p>
                <div
                  className={`mx-auto mt-2 grid min-h-0 w-full max-w-6xl flex-1 gap-2 overflow-y-auto pb-4 ${
                    groupTileCount <= 2
                      ? 'grid-cols-1 sm:grid-cols-2'
                      : groupTileCount <= 4
                        ? 'grid-cols-2'
                        : 'grid-cols-2 lg:grid-cols-3'
                  }`}
                >
                  <GroupMeshTile name={`${localLabel} · você`} stream={localStream} callIsVideo={callIsVideo} muted />
                  {sortedGroupEntries.map(([pid, pv]) => (
                    <GroupMeshTile key={pid} name={pv.name} stream={pv.stream} callIsVideo={callIsVideo} />
                  ))}
                </div>
              </div>
            ) : (
              <>
            {/* Áudio continua saindo do &lt;video&gt; mesmo quando mostramos avatar (vídeo invisível). */}
            {showLocalAsMain ? (
              <video
                ref={localMainRef}
                playsInline
                autoPlay
                muted
                className="absolute inset-0 z-0 h-full w-full object-cover"
              />
            ) : (
              <video
                ref={remoteRef}
                playsInline
                autoPlay
                className={
                  showRemoteVideo
                    ? 'absolute inset-0 z-0 h-full w-full object-cover'
                    : 'pointer-events-none absolute left-0 top-0 z-0 h-px w-px opacity-0'
                }
                aria-hidden={!showRemoteVideo}
              />
            )}

            {((!showRemoteVideo && !showLocalAsMain) || (showLocalAsMain && camOff)) && (
              <div className="relative z-[25] flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 pb-4 pt-16">
                <CallAvatar
                  name={showLocalAsMain ? localLabel : peerLabel}
                  photoUrl={showLocalAsMain ? localAvatarUrl : peerPhoto}
                  seed={showLocalAsMain ? localLabel : peerSeed}
                  sizeClass="h-36 w-36 text-4xl sm:h-44 sm:w-44 sm:text-5xl"
                  ringClass="ring-4 ring-white/15"
                />
                <div className="text-center">
                  <p className="text-xl font-semibold sm:text-2xl">{showLocalAsMain ? localLabel : peerLabel}</p>
                  {!callIsVideo && <p className={`mt-1 text-sm ${isDark ? 'text-white/55' : 'text-gray-600'}`}>Chamada de voz</p>}
                  {!showLocalAsMain && callIsVideo && !remoteStream && (
                    <p className={`mt-1 text-sm ${isDark ? 'text-white/55' : 'text-gray-600'}`}>{phase === 'calling' ? 'Aguardando…' : 'Sem vídeo do outro participante'}</p>
                  )}
                  {!showLocalAsMain && callIsVideo && remoteStream && !remoteHasLiveVideo && (
                    <p className={`mt-1 max-w-md text-center text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                      {phase === 'connected'
                        ? `${peerLabel} está com a câmera desligada`
                        : 'Aguardando vídeo…'}
                    </p>
                  )}
                  {showLocalAsMain && camOff && (
                    <p className={`mt-1 max-w-md text-center text-sm ${isDark ? 'text-white/70' : 'text-gray-600'}`}>Sua câmera está desligada</p>
                  )}
                </div>
              </div>
            )}

            {callIsVideo && localStream && localStream.getVideoTracks().length > 0 && (
              <div
                className={`absolute z-20 h-28 w-40 cursor-grab touch-none overflow-hidden rounded-xl shadow-2xl active:cursor-grabbing sm:h-36 sm:w-52 ${isDark ? 'border border-white/25 bg-black' : 'border border-gray-300 bg-white'}`}
                style={pipPos ? { left: pipPos.x, top: pipPos.y } : { right: 16, bottom: 96 }}
                onPointerDown={startDrag}
                onPointerMove={onDrag}
                onPointerUp={endDrag}
              >
                {showLocalAsMain ? (
                  <>
                    <video ref={remotePipRef} playsInline autoPlay className="h-full w-full object-cover" />
                    {!showRemoteVideo && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gray-800/95 px-2 text-center text-xs text-white/90">
                        <CallAvatar name={peerLabel} photoUrl={peerPhoto} seed={peerSeed} sizeClass="h-12 w-12 text-sm" />
                        Câmera do contato desligada
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <video ref={localPipRef} playsInline autoPlay muted className="h-full w-full object-cover" />
                    {camOff && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gray-800/95 px-2 text-center text-xs text-white/90">
                        <CallAvatar name={localLabel} photoUrl={localAvatarUrl} seed={localLabel} sizeClass="h-12 w-12 text-sm" />
                        Câmera desligada
                      </div>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPrimaryView((v) => (v === 'remote' ? 'local' : 'remote'));
                  }}
                  className={`absolute right-2 top-2 rounded-md p-1.5 ${glassBtnClass}`}
                  aria-label={showLocalAsMain ? 'Voltar foco para contato' : 'Focar na sua câmera'}
                >
                  {showLocalAsMain ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </button>
              </div>
            )}
              </>
            )}

            {!callIsVideo && !isGroupCall && (
              <div className={`absolute right-4 top-16 z-20 flex items-center gap-3 rounded-2xl px-3 py-2 backdrop-blur-sm ${isDark ? 'border border-white/15 bg-black/50' : 'border border-gray-300 bg-white/85'}`}>
                <CallAvatar
                  name={localDisplayName || 'Você'}
                  photoUrl={localAvatarUrl}
                  seed={localDisplayName || 'local'}
                  sizeClass="h-11 w-11 text-sm"
                />
                <div className="min-w-0 text-left">
                  <p className="truncate text-sm font-medium">{localDisplayName || 'Você'}</p>
                  <p className={`text-xs ${isDark ? 'text-white/55' : 'text-gray-600'}`}>Você</p>
                </div>
              </div>
            )}
            {isCallChatOpen && (
              <div className={`absolute bottom-24 right-4 top-16 z-30 flex w-[min(92vw,360px)] flex-col overflow-hidden rounded-2xl backdrop-blur-md ${isDark ? 'border border-white/20 bg-black/75' : 'border border-gray-300 bg-white/90'}`}>
                <div className={`border-b px-3 py-2 text-sm font-semibold ${isDark ? 'border-white/15' : 'border-gray-300'}`}>Chat da ligação</div>
                <div className="flex-1 space-y-2 overflow-y-auto px-3 py-3">
                  {callMessages.length === 0 ? (
                    <p className={`text-xs ${footerTextClass}`}>Sem mensagens nessa conversa ainda.</p>
                  ) : (
                    callMessages.map((m) => (
                      <div key={m.id} className={`rounded-lg px-2 py-1.5 text-xs ${isDark ? 'bg-white/10' : 'bg-slate-100 border border-gray-300/60'}`}>
                        <p className={`mb-0.5 text-[10px] font-semibold ${isDark ? 'text-white/70' : 'text-gray-600'}`}>
                          {m.senderId === user?.id ? 'Você' : m.sender?.name || 'Contato'}
                        </p>
                        {m.content}
                      </div>
                    ))
                  )}
                </div>
                <form
                  className={`flex items-center gap-2 border-t p-2 ${isDark ? 'border-white/15' : 'border-gray-300'}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!callMessage.trim() || sendMessageMutation.isPending) return;
                    sendMessageMutation.mutate();
                  }}
                >
                  <input
                    value={callMessage}
                    onChange={(e) => setCallMessage(e.target.value)}
                    placeholder="Digite uma mensagem..."
                    className={`h-9 flex-1 rounded-lg px-3 text-sm outline-none ${isDark ? 'border border-white/15 bg-white/10 text-white placeholder:text-white/50 focus:border-white/30' : 'border border-gray-300 bg-white text-gray-900 placeholder:text-gray-500 focus:border-gray-500'}`}
                  />
                  <button
                    type="submit"
                    disabled={!callMessage.trim() || sendMessageMutation.isPending}
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50"
                    aria-label="Enviar mensagem"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>
              </div>
            )}
            {isGroupCall && isGroupPanelOpen && (
              <div className={`absolute bottom-24 left-4 top-16 z-30 flex w-[min(92vw,340px)] flex-col overflow-hidden rounded-2xl backdrop-blur-md ${isDark ? 'border border-white/20 bg-black/75' : 'border border-gray-300 bg-white/90'}`}>
                <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 text-sm font-semibold ${isDark ? 'border-white/15' : 'border-gray-300'}`}>
                  <span>Participantes</span>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {phase === 'connected' && eligibleAddParticipants.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddParticipantOpen((v) => !v);
                          setAddParticipantPick([]);
                        }}
                        className={`rounded-md px-2 py-1 text-xs ${addParticipantOpen ? 'bg-emerald-700 text-white' : 'bg-emerald-600 text-white hover:bg-emerald-700'}`}
                      >
                        <UserPlus className="mr-1 inline h-3 w-3" />
                        Adicionar
                      </button>
                    )}
                    {groupInviteLink && (
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(groupInviteLink);
                          toast.success('Link da chamada copiado');
                        }}
                        className="rounded-md bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                      >
                        <Copy className="mr-1 inline h-3 w-3" />
                        Copiar link
                      </button>
                    )}
                  </div>
                </div>
                {addParticipantOpen && phase === 'connected' && (
                  <div className={`max-h-48 space-y-2 overflow-y-auto border-b px-3 py-2 ${isDark ? 'border-white/15 bg-white/5' : 'border-gray-300 bg-slate-50'}`}>
                    <p className={`text-[11px] ${footerTextClass}`}>Membros do grupo ainda fora desta chamada:</p>
                    {eligibleAddParticipants.length === 0 ? (
                      <p className="text-xs opacity-80">Ninguém disponível para adicionar.</p>
                    ) : (
                      <>
                        {eligibleAddParticipants.map((p) => {
                          const checked = addParticipantPick.includes(p.userId);
                          return (
                            <label
                              key={p.userId}
                              className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs ${isDark ? 'hover:bg-white/10' : 'hover:bg-white'}`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  setAddParticipantPick((prev) =>
                                    checked ? prev.filter((id) => id !== p.userId) : [...prev, p.userId]
                                  );
                                }}
                                className="rounded border-gray-400"
                              />
                              <span className="truncate">{p.user?.name?.trim() || 'Membro'}</span>
                            </label>
                          );
                        })}
                        <button
                          type="button"
                          disabled={addParticipantPick.length === 0}
                          onClick={() => {
                            if (addParticipantPick.length === 0) return;
                            inviteMoreToGroupCall(addParticipantPick);
                            toast.success(
                              addParticipantPick.length === 1
                                ? 'Convite enviado'
                                : `${addParticipantPick.length} convites enviados`
                            );
                            setAddParticipantPick([]);
                            setAddParticipantOpen(false);
                          }}
                          className="mt-1 w-full rounded-lg bg-emerald-600 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Convidar selecionados
                        </button>
                      </>
                    )}
                  </div>
                )}
                <div className="space-y-2 overflow-y-auto px-3 py-3">
                  <div className={`rounded-lg border px-2 py-1.5 text-xs ${isDark ? 'border-white/20 bg-white/5' : 'border-gray-300 bg-white'}`}>
                    <div className="flex items-center justify-between">
                      <span>{localLabel} (você)</span>
                      {amHost ? <span className="text-[10px] text-amber-500">Host</span> : null}
                    </div>
                    <p className={`${footerTextClass}`}>Mic: {micMuted ? 'mutado' : 'ativo'} · Câmera: {camOff ? 'off' : 'on'}</p>
                  </div>
                  {sortedGroupEntries.map(([pid, p]) => (
                    <div key={pid} className={`rounded-lg border px-2 py-1.5 text-xs ${isDark ? 'border-white/20 bg-white/5' : 'border-gray-300 bg-white'}`}>
                      <div className="flex items-center justify-between">
                        <span className="truncate">{p.name}</span>
                        {p.isHost ? <span className="text-[10px] text-amber-500">Host</span> : null}
                      </div>
                      <p className={`${footerTextClass}`}>Mic: {p.micMuted ? 'mutado' : 'ativo'} · Câmera: {p.camOff ? 'off' : 'on'}</p>
                      {amHost && (
                        <div className="mt-1 flex gap-1">
                          <button type="button" onClick={() => muteGroupPeer(pid)} className="rounded bg-slate-700 px-2 py-1 text-[10px] text-white hover:bg-slate-600">
                            <VolumeX className="mr-1 inline h-3 w-3" />
                            Silenciar
                          </button>
                          <button type="button" onClick={() => kickGroupPeer(pid)} className="rounded bg-red-700 px-2 py-1 text-[10px] text-white hover:bg-red-600">
                            <UserX className="mr-1 inline h-3 w-3" />
                            Remover
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {amHost && (
                  <div className={`space-y-2 border-t px-3 py-2 ${isDark ? 'border-white/15' : 'border-gray-300'}`}>
                    <button
                      type="button"
                      onClick={() => setGroupLock(!groupCallLocked)}
                      className="w-full rounded bg-indigo-600 px-2 py-1 text-xs text-white hover:bg-indigo-700"
                    >
                      {groupCallLocked ? <Unlock className="mr-1 inline h-3 w-3" /> : <Lock className="mr-1 inline h-3 w-3" />}
                      {groupCallLocked ? 'Desbloquear entradas' : 'Bloquear novas entradas'}
                    </button>
                    {groupPendingJoinIds.length > 0 && (
                      <div className="space-y-1">
                        <p className={`text-[11px] font-medium ${footerTextClass}`}>Aguardando aprovação</p>
                        {groupPendingJoinIds.map((uid) => (
                          <button
                            key={uid}
                            type="button"
                            onClick={() => approveGroupJoin(uid)}
                            className="w-full rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-700"
                          >
                            Aprovar {uid.slice(0, 8)}...
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="pointer-events-none absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-0 right-0 z-40 flex justify-center">
            <div className="pointer-events-auto flex items-center justify-center gap-4">
            <button
              type="button"
              onClick={toggleMic}
              className={`flex size-12 items-center justify-center rounded-full ${controlBtnClass}`}
              aria-label={micMuted ? 'Ligar microfone' : 'Silenciar'}
            >
              {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            {callIsVideo && (
              <button
                type="button"
                onClick={toggleCam}
                disabled={!localStream || localStream.getVideoTracks().length === 0}
                className={`flex size-12 items-center justify-center rounded-full ${controlBtnClass} disabled:cursor-not-allowed disabled:opacity-40`}
                aria-label={camOff ? 'Ligar câmera' : 'Desligar câmera'}
              >
                {camOff ? <VideoOff size={22} /> : <Video size={22} />}
              </button>
            )}
            {callIsVideo && !isGroupCall && (
              <button
                type="button"
                onClick={() => void toggleScreenShare()}
                className={`flex size-12 items-center justify-center rounded-full ${
                  isScreenSharing ? 'bg-blue-600 hover:bg-blue-700 text-white' : controlBtnClass
                }`}
                aria-label={isScreenSharing ? 'Parar compartilhamento de tela' : 'Compartilhar tela'}
              >
                <MonitorUp size={22} />
              </button>
            )}
            <button
              type="button"
              onClick={endCall}
              className="flex size-14 items-center justify-center rounded-full bg-red-600 hover:bg-red-700"
              aria-label="Encerrar chamada"
            >
              <PhoneOff size={26} />
            </button>
            </div>
          </div>
        </>
      )}
    </AppModalOverlay>,
    document.body
  );
}
