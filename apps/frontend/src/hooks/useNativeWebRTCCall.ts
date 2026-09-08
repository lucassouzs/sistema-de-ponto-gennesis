'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWsCallsUrl } from '@/lib/wsCallUrl';
import {
  startOutgoingCallRingback,
  stopOutgoingCallRingback,
  unlockChatAudio,
} from '@/lib/chatSounds';
import { toast } from 'react-hot-toast';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export type NativeCallPhase = 'idle' | 'calling' | 'ringing' | 'connected';
export type CallQualityLevel = 'good' | 'medium' | 'poor' | 'unknown';

export interface IncomingCallPayload {
  callId: string;
  chatId: string;
  video: boolean;
  from: { id: string; name: string };
  isGroupCall?: boolean;
  groupExpectedCount?: number;
  /** Sala GROUP_CALL (mensagens / histórico da ligação). */
  callSideChatId?: string;
}

interface CallCtx {
  callId: string;
  chatId: string;
  peerUserId: string;
  peerName: string;
  video: boolean;
  isCaller: boolean;
  isGroupCall?: boolean;
}

export interface GroupPeerView {
  name: string;
  stream: MediaStream | null;
  micMuted?: boolean;
  camOff?: boolean;
  isHost?: boolean;
}

function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

export function waitWsOpen(ws: WebSocket, ms: number): Promise<void> {
  if (ws.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error('timeout')), ms);
    ws.addEventListener(
      'open',
      () => {
        window.clearTimeout(t);
        resolve();
      },
      { once: true }
    );
    ws.addEventListener(
      'error',
      () => {
        window.clearTimeout(t);
        reject(new Error('ws'));
      },
      { once: true }
    );
  });
}

export function useNativeWebRTCCall(opts: { userId: string | undefined }) {
  const [phase, setPhase] = useState<NativeCallPhase>('idle');
  const [incoming, setIncoming] = useState<IncomingCallPayload | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [peerName, setPeerName] = useState('');
  /** Modo da chamada atual (para UI: botões de câmera e layout só áudio). */
  const [callIsVideo, setCallIsVideo] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [callQuality, setCallQuality] = useState<CallQualityLevel>('unknown');
  const [callLatencyMs, setCallLatencyMs] = useState<number | null>(null);
  const [packetLossPct, setPacketLossPct] = useState<number | null>(null);
  const [wsConnectionState, setWsConnectionState] = useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const [isGroupCall, setIsGroupCall] = useState(false);
  const [groupPeers, setGroupPeers] = useState<Record<string, GroupPeerView>>({});
  const [groupCallLocked, setGroupCallLocked] = useState(false);
  const [groupPendingJoinIds, setGroupPendingJoinIds] = useState<string[]>([]);
  const [groupInviteLink, setGroupInviteLink] = useState<string | null>(null);
  /** ID do chat GROUP_CALL (texto da ligação); `activeChatId` continua sendo o grupo para sinalização. */
  const [callSideChatId, setCallSideChatId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const groupPcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const callCtxRef = useRef<CallCtx | null>(null);
  const localMediaRef = useRef<MediaStream | null>(null);
  const cameraTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenTrackRef = useRef<MediaStreamTrack | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef<NativeCallPhase>('idle');
  phaseRef.current = phase;
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<number | null>(null);
  const disconnectToastShownRef = useRef(false);

  const closeAllGroupPeers = useCallback(() => {
    groupPcsRef.current.forEach((pc) => {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    });
    groupPcsRef.current.clear();
    setGroupPeers({});
    setIsGroupCall(false);
    setGroupCallLocked(false);
    setGroupPendingJoinIds([]);
    setGroupInviteLink(null);
  }, []);

  const stopAllMedia = useCallback(() => {
    closeAllGroupPeers();
    try {
      localMediaRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    localMediaRef.current = null;
    cameraTrackRef.current = null;
    screenTrackRef.current = null;
    try {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    screenStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMicMuted(false);
    setCamOff(false);
    setCallIsVideo(false);
    setIsScreenSharing(false);
    setCallDurationSec(0);
    setCallQuality('unknown');
    setCallLatencyMs(null);
    setPacketLossPct(null);
  }, [closeAllGroupPeers]);

  const closePeer = useCallback(() => {
    try {
      pcRef.current?.close();
    } catch {
      /* ignore */
    }
    pcRef.current = null;
  }, []);

  const endCallRef = useRef<() => void>(() => {});

  const endCall = useCallback(() => {
    stopOutgoingCallRingback();
    const ctx = callCtxRef.current;
    if (ctx && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'call:end', callId: ctx.callId }));
    }
    callCtxRef.current = null;
    closePeer();
    stopAllMedia();
    setPhase('idle');
    setIncoming(null);
    setPeerName('');
    setCallIsVideo(false);
    setIsGroupCall(false);
    setActiveChatId(null);
    setCallSideChatId(null);
  }, [closePeer, stopAllMedia]);

  endCallRef.current = endCall;

  useEffect(() => {
    if (phase === 'connected' || phase === 'ringing' || phase === 'idle') {
      stopOutgoingCallRingback();
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'connected') {
      setCallDurationSec(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setCallDurationSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'connected' || callCtxRef.current?.isGroupCall || !pcRef.current) {
      setCallQuality('unknown');
      setCallLatencyMs(null);
      setPacketLossPct(null);
      return;
    }
    const pc = pcRef.current;
    const poll = window.setInterval(async () => {
      try {
        const stats = await pc.getStats();
        let rttMs: number | null = null;
        let packetsLost = 0;
        let packetsTotal = 0;

        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && (report as any).state === 'succeeded' && (report as any).currentRoundTripTime) {
            rttMs = ((report as any).currentRoundTripTime as number) * 1000;
          }
          if (report.type === 'inbound-rtp' && !report.isRemote) {
            packetsLost += Number((report as any).packetsLost || 0);
            packetsTotal += Number((report as any).packetsReceived || 0) + Number((report as any).packetsLost || 0);
          }
        });

        const lossPct = packetsTotal > 0 ? (packetsLost / packetsTotal) * 100 : null;
        setCallLatencyMs(rttMs);
        setPacketLossPct(lossPct);

        if (rttMs === null || lossPct === null) {
          setCallQuality('unknown');
        } else if (rttMs <= 180 && lossPct <= 2) {
          setCallQuality('good');
        } else if (rttMs <= 350 && lossPct <= 6) {
          setCallQuality('medium');
        } else {
          setCallQuality('poor');
        }
      } catch {
        setCallQuality('unknown');
      }
    }, 3000);
    return () => window.clearInterval(poll);
  }, [phase, remoteStream, isGroupCall]);

  useEffect(() => {
    if (!opts.userId) return;

    const token = getAuthToken();
    if (!token) return;
    let disposed = false;

    async function ensureCallerOffer(ctx: CallCtx, stream: MediaStream | null) {
      if (pcRef.current || !stream) return;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (ev) => {
        const [r] = ev.streams;
        if (r) setRemoteStream(r);
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'rtc:candidate',
              callId: ctx.callId,
              candidate: ev.candidate.toJSON(),
            })
          );
        }
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(
        JSON.stringify({
          type: 'rtc:offer',
          callId: ctx.callId,
          sdp: pc.localDescription ?? offer,
        })
      );
    }

    async function ensureCalleeAnswer(ctx: CallCtx, stream: MediaStream | null, offerSdp: RTCSessionDescriptionInit) {
      if (pcRef.current || !stream) return;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      pcRef.current = pc;
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      pc.ontrack = (ev) => {
        const [r] = ev.streams;
        if (r) setRemoteStream(r);
      };
      pc.onicecandidate = (ev) => {
        if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'rtc:candidate',
              callId: ctx.callId,
              to: ctx.peerUserId,
              candidate: ev.candidate.toJSON(),
            })
          );
        }
      };
      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsRef.current?.send(
        JSON.stringify({
          type: 'rtc:answer',
          callId: ctx.callId,
          to: ctx.peerUserId,
          sdp: pc.localDescription ?? answer,
        })
      );
    }

    function attachGroupPcHandlers(pc: RTCPeerConnection, callId: string, remoteUserId: string) {
      pc.onicecandidate = (ev) => {
        if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'rtc:candidate',
              callId,
              to: remoteUserId,
              candidate: ev.candidate.toJSON(),
            })
          );
        }
      };
      pc.ontrack = (event) => {
        const [incoming] = event.streams;
        if (!incoming) return;
        setGroupPeers((prev) => ({
          ...prev,
          [remoteUserId]: { name: prev[remoteUserId]?.name || 'Participante', stream: incoming },
        }));
        setPhase((p) => (p === 'calling' ? 'connected' : p));
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          /* peer pode sair; servidor envia call:group-peer-left */
        }
      };
    }

    async function ensureGroupOffer(remoteUserId: string) {
      const ctx = callCtxRef.current;
      const stream = localMediaRef.current;
      if (!ctx?.isGroupCall || !stream || groupPcsRef.current.has(remoteUserId)) return;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      groupPcsRef.current.set(remoteUserId, pc);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      attachGroupPcHandlers(pc, ctx.callId, remoteUserId);

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      wsRef.current?.send(
        JSON.stringify({
          type: 'rtc:offer',
          callId: ctx.callId,
          to: remoteUserId,
          sdp: pc.localDescription ?? offer,
        })
      );
    }

    async function ensureGroupAnswer(remoteUserId: string, offerSdp: RTCSessionDescriptionInit) {
      const ctx = callCtxRef.current;
      const stream = localMediaRef.current;
      if (!ctx?.isGroupCall || !stream) return;

      let pc = groupPcsRef.current.get(remoteUserId);
      if (!pc) {
        const createdPc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        groupPcsRef.current.set(remoteUserId, createdPc);
        stream.getTracks().forEach((t) => createdPc.addTrack(t, stream));
        attachGroupPcHandlers(createdPc, ctx.callId, remoteUserId);
        pc = createdPc;
      }
      if (!pc) return;

      await pc.setRemoteDescription(new RTCSessionDescription(offerSdp));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      wsRef.current?.send(
        JSON.stringify({
          type: 'rtc:answer',
          callId: ctx.callId,
          to: remoteUserId,
          sdp: pc.localDescription ?? answer,
        })
      );
      setPhase((p) => (p === 'calling' ? 'connected' : p));
    }

    const attachWsHandlers = (ws: WebSocket) => {
      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setWsConnectionState('connected');
        disconnectToastShownRef.current = false;
      };

      ws.onmessage = async (ev) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(ev.data as string) as Record<string, unknown>;
        } catch {
          return;
        }
        const type = msg.type as string;

        if (type === 'call:group-signaling-offer') {
          const callId = msg.callId as string;
          const remoteUserId = msg.remoteUserId as string;
          if (!callCtxRef.current || callCtxRef.current.callId !== callId || !remoteUserId) return;
          try {
            await ensureGroupOffer(remoteUserId);
          } catch (e) {
            console.error(e);
            toast.error('Falha na conexão com um participante');
          }
          return;
        }

        if (type === 'call:group-sync') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          const side = msg.callSideChatId as string | undefined;
          if (side) setCallSideChatId(side);
          const members = (msg.members ?? []) as Array<{
            id: string;
            name?: string | null;
            micMuted?: boolean;
            camOff?: boolean;
            isHost?: boolean;
          }>;
          setGroupPeers((prev) => {
            const next = { ...prev };
            members.forEach((m) => {
              const pid = String(m.id);
              if (!pid || pid === opts.userId) return;
              next[pid] = {
                name: (m.name && String(m.name).trim()) || next[pid]?.name || 'Participante',
                stream: next[pid]?.stream ?? null,
                micMuted: Boolean(m.micMuted),
                camOff: Boolean(m.camOff),
                isHost: Boolean(m.isHost),
              };
            });
            return next;
          });
          setGroupCallLocked(Boolean(msg.locked));
          return;
        }

        if (type === 'call:group-peer-left') {
          const callId = msg.callId as string;
          const gone = msg.userId as string;
          if (callCtxRef.current?.callId !== callId || !gone) return;
          const pc = groupPcsRef.current.get(gone);
          if (pc) {
            try {
              pc.close();
            } catch {
              /* ignore */
            }
            groupPcsRef.current.delete(gone);
          }
          setGroupPeers((prev) => {
            const copy = { ...prev };
            delete copy[gone];
            return copy;
          });
          return;
        }

        if (type === 'call:group-progress') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          setPhase('connected');
          return;
        }

        if (type === 'call:invite-link') {
          const callId = msg.callId as string;
          const token = msg.inviteToken as string | undefined;
          if (!token || callCtxRef.current?.callId !== callId) return;
          const side = msg.callSideChatId as string | undefined;
          if (side) setCallSideChatId(side);
          const url = `${window.location.origin}/ponto/conversas?callInvite=${encodeURIComponent(token)}`;
          setGroupInviteLink(url);
          return;
        }

        if (type === 'call:group-media-state') {
          const callId = msg.callId as string;
          const userId = msg.userId as string;
          if (callCtxRef.current?.callId !== callId || !userId || userId === opts.userId) return;
          setGroupPeers((prev) => {
            if (!prev[userId]) return prev;
            return {
              ...prev,
              [userId]: {
                ...prev[userId],
                micMuted: Boolean(msg.micMuted),
                camOff: Boolean(msg.camOff),
              },
            };
          });
          return;
        }

        if (type === 'call:group-join-request') {
          const callId = msg.callId as string;
          const userId = msg.userId as string;
          if (callCtxRef.current?.callId !== callId || !userId) return;
          setGroupPendingJoinIds((prev) => (prev.includes(userId) ? prev : [...prev, userId]));
          return;
        }

        if (type === 'call:group-lock-state') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          setGroupCallLocked(Boolean(msg.locked));
          return;
        }

        if (type === 'call:group-join-pending') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          toast('Aguardando aprovação do host...');
          return;
        }

        if (type === 'call:group-join-approved') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          toast.success('Entrada aprovada');
          return;
        }

        if (type === 'call:force-mute') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          const stream = localMediaRef.current;
          if (stream) {
            stream.getAudioTracks().forEach((t) => {
              t.enabled = false;
            });
          }
          setMicMuted(true);
          toast('Host silenciou seu microfone');
          return;
        }

        if (type === 'call:kicked') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          toast.error('Você foi removido da chamada');
          endCallRef.current();
          return;
        }

        if (type === 'call:group-busy') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          toast.error('Alguns participantes já estão em outra chamada');
          endCallRef.current();
          return;
        }

        if (type === 'call:busy-self') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          toast.error('Você já está em uma chamada');
          endCallRef.current();
          return;
        }

        if (type === 'call:error') {
          const callId = msg.callId as string;
          const code = msg.code as string;
          if (callCtxRef.current?.callId !== callId) return;
          if (code === 'group-too-big') toast.error('Grupo grande demais para chamada única nesta rede');
          else toast.error('Não foi possível iniciar a chamada');
          endCallRef.current();
          return;
        }

        if (type === 'call:incoming') {
          if (phaseRef.current === 'connected' || callCtxRef.current) return;
          const sideIn = msg.callSideChatId as string | undefined;
          if (sideIn) setCallSideChatId(sideIn);
          setIncoming({
            callId: msg.callId as string,
            chatId: msg.chatId as string,
            video: Boolean(msg.video),
            from: msg.from as IncomingCallPayload['from'],
            isGroupCall: Boolean(msg.isGroupCall),
            groupExpectedCount: typeof msg.groupExpectedCount === 'number' ? msg.groupExpectedCount : undefined,
            callSideChatId: sideIn,
          });
          setActiveChatId((msg.chatId as string) || null);
          setPhase('ringing');
          return;
        }

        if (type === 'call:accepted') {
          const callId = msg.callId as string;
          const ctx = callCtxRef.current;
          if (!ctx || !ctx.isCaller || ctx.callId !== callId) return;
          if (ctx.isGroupCall) return;
          try {
            await ensureCallerOffer(ctx, localMediaRef.current);
          } catch (e) {
            console.error(e);
            toast.error('Falha ao conectar a chamada');
            endCallRef.current();
          }
          return;
        }

        if (type === 'call:busy') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          toast.error('Usuário já está em chamada');
          endCallRef.current();
          return;
        }

        if (type === 'call:rejected') {
          const callId = msg.callId as string;
          if (callCtxRef.current?.callId !== callId) return;
          toast.error('Chamada recusada');
          endCallRef.current();
          return;
        }

        if (type === 'call:group-decline') {
          const callId = msg.callId as string;
          const ctx = callCtxRef.current;
          if (!ctx || ctx.callId !== callId || !ctx.isCaller) return;
          toast((msg.userId as string) ? 'Um convite foi recusado' : 'Convite recusado');
          return;
        }

        if (type === 'call:ended') {
          const callId = msg.callId as string;
          setIncoming((cur) => {
            if (cur?.callId === callId) {
              setPhase('idle');
              setActiveChatId(null);
              setCallSideChatId(null);
              toast('Chamada encerrada');
              return null;
            }
            return cur;
          });
          if (callCtxRef.current?.callId === callId) {
            toast('Chamada encerrada');
            endCallRef.current();
          }
          return;
        }

        if (type === 'rtc:offer') {
          const callId = msg.callId as string;
          const ctx = callCtxRef.current;
          const sdp = msg.sdp as RTCSessionDescriptionInit;
          const fromUid = msg.from as string | undefined;

          if (ctx && ctx.callId === callId && ctx.isGroupCall && fromUid) {
            try {
              await ensureGroupAnswer(fromUid, sdp);
            } catch (e) {
              console.error(e);
              toast.error('Erro ao conectar vídeo');
            }
            return;
          }

          if (!ctx || ctx.isCaller || ctx.callId !== callId) return;
          try {
            await ensureCalleeAnswer(ctx, localMediaRef.current, sdp);
            setPhase('connected');
          } catch (e) {
            console.error(e);
            toast.error('Erro ao conectar o vídeo');
            endCallRef.current();
          }
          return;
        }

        if (type === 'rtc:answer') {
          const ctx = callCtxRef.current;
          const callId = msg.callId as string;
          const sdp = msg.sdp as RTCSessionDescriptionInit;
          const fromUid = msg.from as string | undefined;

          if (ctx && ctx.callId === callId && ctx.isGroupCall && fromUid) {
            const pcAns = groupPcsRef.current.get(fromUid);
            if (pcAns) {
              try {
                await pcAns.setRemoteDescription(new RTCSessionDescription(sdp));
              } catch (e) {
                console.error(e);
              }
            }
            return;
          }

          if (!ctx || !ctx.isCaller || ctx.callId !== callId) return;
          const pc = pcRef.current;
          if (!pc) return;
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            setPhase('connected');
          } catch (e) {
            console.error(e);
          }
          return;
        }

        if (type === 'rtc:candidate') {
          const ctx = callCtxRef.current;
          const callId = msg.callId as string;
          if (!ctx || ctx.callId !== callId) return;

          if (ctx.isGroupCall) {
            const fromUid = msg.from as string | undefined;
            if (!fromUid || !msg.candidate) return;
            const pcCand = groupPcsRef.current.get(fromUid);
            if (!pcCand) return;
            try {
              await pcCand.addIceCandidate(new RTCIceCandidate(msg.candidate as RTCIceCandidateInit));
            } catch {
              /* ignore */
            }
            return;
          }

          const pcCand = pcRef.current;
          if (!pcCand || !msg.candidate) return;
          try {
            await pcCand.addIceCandidate(new RTCIceCandidate(msg.candidate as RTCIceCandidateInit));
          } catch {
            /* ignore */
          }
        }
      };

      ws.onclose = () => {
        if (wsRef.current === ws) wsRef.current = null;
        if (disposed) return;
        const shouldReconnect = phaseRef.current !== 'ringing' || !!callCtxRef.current;
        if (!shouldReconnect && reconnectAttemptsRef.current > 4) {
          setWsConnectionState('disconnected');
          return;
        }
        setWsConnectionState('reconnecting');
        if (!disconnectToastShownRef.current) {
          toast('Reconectando sinalização de chamada...');
          disconnectToastShownRef.current = true;
        }
        reconnectAttemptsRef.current += 1;
        const wait = Math.min(1000 * 2 ** (reconnectAttemptsRef.current - 1), 10000);
        reconnectTimerRef.current = window.setTimeout(() => {
          if (disposed) return;
          connectWs();
        }, wait);
      };
    };

    const connectWs = () => {
      const url = `${getWsCallsUrl()}?token=${encodeURIComponent(token)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      attachWsHandlers(ws);
    };

    connectWs();

    return () => {
      disposed = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      wsRef.current?.close();
      wsRef.current = null;
      callCtxRef.current = null;
      try {
        pcRef.current?.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
      groupPcsRef.current.forEach((gpc) => {
        try {
          gpc.close();
        } catch {
          /* ignore */
        }
      });
      groupPcsRef.current.clear();
      try {
        localMediaRef.current?.getTracks().forEach((t) => t.stop());
      } catch {
        /* ignore */
      }
      localMediaRef.current = null;
      setLocalStream(null);
      setRemoteStream(null);
      setPhase('idle');
      setIncoming(null);
      setPeerName('');
      setCallIsVideo(false);
      setIsGroupCall(false);
      setGroupPeers({});
      setWsConnectionState('disconnected');
    };
  }, [opts.userId]);

  const startOutgoing = useCallback(
    async (chatId: string, peerUserId: string, name: string, video: boolean) => {
      if (!opts.userId) return;
      let ws = wsRef.current;
      if (ws?.readyState === WebSocket.CONNECTING) {
        try {
          await waitWsOpen(ws, 5000);
        } catch {
          toast.error('Conexão de chamadas não está pronta. Aguarde e tente de novo.');
          return;
        }
      }
      ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        toast.error('Conexão de chamadas não está pronta. Aguarde um instante e tente de novo.');
        return;
      }

      const callId = crypto.randomUUID();
      callCtxRef.current = {
        callId,
        chatId,
        peerUserId,
        peerName: name,
        video,
        isCaller: true,
      };
      setIsGroupCall(false);
      setGroupPeers({});
      setPeerName(name);
      setActiveChatId(chatId);
      setCallSideChatId(null);
      setPhase('calling');
      void unlockChatAudio();
      startOutgoingCallRingback();
      setRemoteStream(null);
      closePeer();
      setCallIsVideo(video);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: video ? { facingMode: 'user' } : false,
          audio: true,
        });
        localMediaRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        setLocalStream(stream);
        setCamOff(!video);
        ws.send(
          JSON.stringify({
            type: 'call:invite',
            callId,
            chatId,
            video,
            targetUserId: peerUserId,
          })
        );
      } catch (e) {
        console.error(e);
        toast.error('Não foi possível acessar microfone ou câmera');
        callCtxRef.current = null;
        stopOutgoingCallRingback();
        setPhase('idle');
        setPeerName('');
        setCallIsVideo(false);
        stopAllMedia();
      }
    },
    [opts.userId, closePeer, stopAllMedia]
  );

  const startGroupOutgoing = useCallback(
    async (chatId: string, video: boolean, targetUserIds: string[]) => {
      if (!opts.userId) return;

      let ws = wsRef.current;
      if (ws?.readyState === WebSocket.CONNECTING) {
        try {
          await waitWsOpen(ws, 5000);
        } catch {
          toast.error('Conexão de chamadas não está pronta. Aguarde e tente de novo.');
          return;
        }
      }
      ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        toast.error('Conexão de chamadas não está pronta.');
        return;
      }

      const invitees = Array.from(new Set(targetUserIds)).filter((id) => id && id !== opts.userId);
      if (invitees.length === 0) {
        toast.error('Convide pelo menos uma pessoa para a chamada em grupo.');
        return;
      }

      const callId = crypto.randomUUID();
      setCallSideChatId(null);
      closePeer();
      setRemoteStream(null);
      groupPcsRef.current.forEach((gpc) => {
        try {
          gpc.close();
        } catch {
          /* ignore */
        }
      });
      groupPcsRef.current.clear();

      callCtxRef.current = {
        callId,
        chatId,
        peerUserId: opts.userId,
        peerName: '',
        video,
        isCaller: true,
        isGroupCall: true,
      };
      setIsGroupCall(true);
      setGroupPeers({});
      setPeerName('Chamada em grupo');
      setActiveChatId(chatId);
      setPhase('calling');
      void unlockChatAudio();
      startOutgoingCallRingback();
      setCallIsVideo(video);

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: video ? { facingMode: 'user' } : false,
          audio: true,
        });
        localMediaRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        setLocalStream(stream);
        setCamOff(!video);
        ws.send(
          JSON.stringify({
            type: 'call:invite-group',
            callId,
            chatId,
            video,
            targetUserIds: invitees,
          })
        );
        stopOutgoingCallRingback();
        setPhase('connected');
      } catch (e) {
        console.error(e);
        toast.error('Não foi possível acessar microfone ou câmera');
        stopOutgoingCallRingback();
        callCtxRef.current = null;
        setIsGroupCall(false);
        setGroupPeers({});
        setPhase('idle');
        setPeerName('');
        setCallIsVideo(false);
        stopAllMedia();
      }
    },
    [opts.userId, closePeer, stopAllMedia]
  );

  const rejoinActiveGroupCall = useCallback(
    async (callId: string, chatId: string, video: boolean) => {
      if (!opts.userId || !callId || !chatId) return;
      setCallSideChatId(null);
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        toast.error('Conexão de chamadas não está pronta.');
        return;
      }

      groupPcsRef.current.forEach((gpc) => {
        try {
          gpc.close();
        } catch {
          /* ignore */
        }
      });
      groupPcsRef.current.clear();

      closePeer();
      setRemoteStream(null);
      callCtxRef.current = {
        callId,
        chatId,
        peerUserId: '',
        peerName: 'Chamada em grupo',
        video,
        isCaller: false,
        isGroupCall: true,
      };
      setIsGroupCall(true);
      setGroupPeers({});
      setPeerName('Chamada em grupo');
      setCallIsVideo(video);
      setActiveChatId(chatId);
      setPhase('calling');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: video ? { facingMode: 'user' } : false,
          audio: true,
        });
        localMediaRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        setLocalStream(stream);
        setCamOff(!video);
        ws.send(JSON.stringify({ type: 'call:request-join', callId }));
      } catch {
        toast.error('Não foi possível acessar microfone ou câmera');
        endCallRef.current();
      }
    },
    [opts.userId, closePeer]
  );

  const joinGroupFromInvite = useCallback(
    async (inviteToken: string, video: boolean) => {
      if (!opts.userId || !inviteToken) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        toast.error('Conexão de chamadas não está pronta.');
        return;
      }
      let decoded = '';
      try {
        decoded = atob(inviteToken.replace(/-/g, '+').replace(/_/g, '/'));
      } catch {
        toast.error('Link de chamada inválido.');
        return;
      }
      let payload: { callId?: string; chatId?: string; callSideChatId?: string };
      try {
        payload = JSON.parse(decoded) as { callId?: string; chatId?: string; callSideChatId?: string };
      } catch {
        toast.error('Link de chamada inválido.');
        return;
      }
      if (!payload.callId || !payload.chatId) {
        toast.error('Link de chamada inválido.');
        return;
      }
      if (payload.callSideChatId) setCallSideChatId(payload.callSideChatId);

      closePeer();
      setRemoteStream(null);
      callCtxRef.current = {
        callId: payload.callId,
        chatId: payload.chatId,
        peerUserId: '',
        peerName: 'Chamada em grupo',
        video,
        isCaller: false,
        isGroupCall: true,
      };
      setIsGroupCall(true);
      setPeerName('Chamada em grupo');
      setCallIsVideo(video);
      setActiveChatId(payload.chatId);
      setPhase('calling');

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: video ? { facingMode: 'user' } : false,
          audio: true,
        });
        localMediaRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
        setLocalStream(stream);
        setCamOff(!video);
        ws.send(JSON.stringify({ type: 'call:request-join', callId: payload.callId }));
      } catch {
        toast.error('Não foi possível acessar microfone ou câmera');
        endCallRef.current();
      }
    },
    [opts.userId, closePeer]
  );

  const acceptIncoming = useCallback(async () => {
    const inc = incoming;
    if (!inc) return;
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      toast.error('Conexão perdida.');
      setIncoming(null);
      setPhase('idle');
      return;
    }
    const { callId, chatId, video, from } = inc;
    const isGc = Boolean(inc.isGroupCall);
    groupPcsRef.current.forEach((gpc) => {
      try {
        gpc.close();
      } catch {
        /* ignore */
      }
    });
    groupPcsRef.current.clear();

    if (inc.callSideChatId) setCallSideChatId(inc.callSideChatId);
    callCtxRef.current = {
      callId,
      chatId,
      peerUserId: from.id,
      peerName: from.name,
      video,
      isCaller: false,
      isGroupCall: isGc,
    };
    setIsGroupCall(isGc);
    setGroupPeers({});
    setPeerName(isGc ? `${from.name || 'Participante'} · grupo` : from.name);
    setActiveChatId(chatId);
    setIncoming(null);
    setPhase('calling');
    closePeer();
    setCallIsVideo(video);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? { facingMode: 'user' } : false,
        audio: true,
      });
      localMediaRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] ?? null;
      setLocalStream(stream);
      setCamOff(!video);
      ws.send(JSON.stringify({ type: 'call:accept', callId }));
    } catch (e) {
      console.error(e);
      toast.error('Permissão negada');
      ws.send(JSON.stringify({ type: 'call:reject', callId }));
      callCtxRef.current = null;
      setIsGroupCall(false);
      setGroupPeers({});
      setPhase('idle');
      setPeerName('');
      setCallIsVideo(false);
      stopAllMedia();
    }
  }, [incoming, closePeer, stopAllMedia]);

  const rejectIncoming = useCallback(() => {
    if (!incoming) return;
    wsRef.current?.send(JSON.stringify({ type: 'call:reject', callId: incoming.callId }));
    setIncoming(null);
    setPhase('idle');
    setActiveChatId(null);
    setCallSideChatId(null);
  }, [incoming]);

  const inviteMoreToGroupCall = useCallback((targetUserIds: string[]) => {
    const ctx = callCtxRef.current;
    const ws = wsRef.current;
    if (!ctx?.isGroupCall || !ws || ws.readyState !== WebSocket.OPEN) return;
    const ids = Array.from(new Set(targetUserIds.filter(Boolean)));
    if (ids.length === 0) return;
    ws.send(JSON.stringify({ type: 'call:group-add-invite', callId: ctx.callId, targetUserIds: ids }));
  }, []);

  const emitGroupMediaState = useCallback(
    (nextMicMuted: boolean, nextCamOff: boolean) => {
      const ctx = callCtxRef.current;
      if (!ctx?.isGroupCall || wsRef.current?.readyState !== WebSocket.OPEN) return;
      wsRef.current.send(
        JSON.stringify({
          type: 'call:group-media-state',
          callId: ctx.callId,
          micMuted: nextMicMuted,
          camOff: nextCamOff,
        })
      );
    },
    []
  );

  const toggleMic = useCallback(() => {
    const s = localMediaRef.current;
    if (!s) return;
    const next = !micMuted;
    s.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMicMuted(next);
    emitGroupMediaState(next, camOff);
  }, [micMuted, camOff, emitGroupMediaState]);

  const toggleCam = useCallback(() => {
    const s = localMediaRef.current;
    if (!s) return;
    const vts = s.getVideoTracks();
    if (vts.length === 0) return;
    const next = !camOff;
    vts.forEach((t) => {
      t.enabled = !next;
    });
    setCamOff(next);
    emitGroupMediaState(micMuted, next);
  }, [camOff, micMuted, emitGroupMediaState]);

  const requestGroupJoin = useCallback((callId: string) => {
    if (!callId || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'call:request-join', callId }));
  }, []);

  const setGroupLock = useCallback((locked: boolean) => {
    const ctx = callCtxRef.current;
    if (!ctx?.isGroupCall || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'call:group-host-action', callId: ctx.callId, action: 'set-lock', locked }));
  }, []);

  const muteGroupPeer = useCallback((targetUserId: string) => {
    const ctx = callCtxRef.current;
    if (!ctx?.isGroupCall || !targetUserId || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({ type: 'call:group-host-action', callId: ctx.callId, action: 'mute', targetUserId })
    );
  }, []);

  const kickGroupPeer = useCallback((targetUserId: string) => {
    const ctx = callCtxRef.current;
    if (!ctx?.isGroupCall || !targetUserId || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({ type: 'call:group-host-action', callId: ctx.callId, action: 'kick', targetUserId })
    );
  }, []);

  const approveGroupJoin = useCallback((targetUserId: string) => {
    const ctx = callCtxRef.current;
    if (!ctx?.isGroupCall || !targetUserId || wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({ type: 'call:group-host-action', callId: ctx.callId, action: 'approve-join', targetUserId })
    );
    setGroupPendingJoinIds((prev) => prev.filter((id) => id !== targetUserId));
  }, []);

  const stopScreenShare = useCallback(() => {
    const pc = pcRef.current;
    const currentLocal = localMediaRef.current;
    const camTrack = cameraTrackRef.current;
    const activeScreen = screenTrackRef.current;
    if (!pc || !currentLocal || !activeScreen) return;

    const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (sender && camTrack) {
      void sender.replaceTrack(camTrack);
    }

    try {
      activeScreen.stop();
    } catch {
      /* ignore */
    }
    screenTrackRef.current = null;
    try {
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    screenStreamRef.current = null;

    currentLocal.getVideoTracks().forEach((t) => {
      if (t !== camTrack) {
        try {
          currentLocal.removeTrack(t);
        } catch {
          /* ignore */
        }
      }
    });
    if (camTrack && !currentLocal.getVideoTracks().includes(camTrack)) {
      currentLocal.addTrack(camTrack);
    }
    setLocalStream(new MediaStream(currentLocal.getTracks()));
    setIsScreenSharing(false);
    setCamOff(false);
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (!callIsVideo) return;
    if (callCtxRef.current?.isGroupCall) {
      toast.error('Compartilhamento de tela não está disponível na chamada em grupo.');
      return;
    }
    const pc = pcRef.current;
    const currentLocal = localMediaRef.current;
    if (!pc || !currentLocal) return;

    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
    if (!videoSender) return;

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      const [screenTrack] = stream.getVideoTracks();
      if (!screenTrack) return;

      if (!cameraTrackRef.current) {
        cameraTrackRef.current = currentLocal.getVideoTracks()[0] ?? null;
      }

      screenTrack.onended = () => {
        stopScreenShare();
      };

      await videoSender.replaceTrack(screenTrack);

      const camTrack = cameraTrackRef.current;
      currentLocal.getVideoTracks().forEach((t) => {
        if (t !== camTrack) {
          try {
            currentLocal.removeTrack(t);
          } catch {
            /* ignore */
          }
        }
      });
      if (camTrack) {
        try {
          currentLocal.removeTrack(camTrack);
        } catch {
          /* ignore */
        }
      }
      currentLocal.addTrack(screenTrack);
      screenStreamRef.current = stream;
      screenTrackRef.current = screenTrack;
      setLocalStream(new MediaStream(currentLocal.getTracks()));
      setIsScreenSharing(true);
      setCamOff(false);
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível compartilhar a tela');
    }
  }, [callIsVideo, isScreenSharing, stopScreenShare]);

  return {
    phase,
    incoming,
    localStream,
    remoteStream,
    micMuted,
    camOff,
    peerName,
    callIsVideo,
    activeChatId,
    callSideChatId,
    callDurationSec,
    callQuality,
    callLatencyMs,
    packetLossPct,
    wsConnectionState,
    startOutgoing,
    startGroupOutgoing,
    joinGroupFromInvite,
    rejoinActiveGroupCall,
    acceptIncoming,
    rejectIncoming,
    endCall,
    toggleMic,
    toggleCam,
    toggleScreenShare,
    isScreenSharing,
    isGroupCall,
    groupPeers,
    groupCallLocked,
    groupPendingJoinIds,
    groupInviteLink,
    requestGroupJoin,
    setGroupLock,
    muteGroupPeer,
    kickGroupPeer,
    approveGroupJoin,
    inviteMoreToGroupCall,
  };
}

export type NativeCallHook = ReturnType<typeof useNativeWebRTCCall>;
