'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWsCallsUrl } from '@/lib/wsCallUrl';
import { toast } from 'react-hot-toast';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export type NativeCallPhase = 'idle' | 'calling' | 'ringing' | 'connected';

export interface IncomingCallPayload {
  callId: string;
  chatId: string;
  video: boolean;
  from: { id: string; name: string };
}

interface CallCtx {
  callId: string;
  chatId: string;
  peerUserId: string;
  peerName: string;
  video: boolean;
  isCaller: boolean;
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

  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const callCtxRef = useRef<CallCtx | null>(null);
  const localMediaRef = useRef<MediaStream | null>(null);
  const phaseRef = useRef<NativeCallPhase>('idle');
  phaseRef.current = phase;

  const stopAllMedia = useCallback(() => {
    try {
      localMediaRef.current?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    localMediaRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setMicMuted(false);
    setCamOff(false);
  }, []);

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
  }, [closePeer, stopAllMedia]);

  endCallRef.current = endCall;

  useEffect(() => {
    if (!opts.userId) return;

    const token = getAuthToken();
    if (!token) return;

    const url = `${getWsCallsUrl()}?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

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
          sdp: pc.localDescription ?? answer,
        })
      );
    }

    ws.onmessage = async (ev) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(ev.data as string) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = msg.type as string;

      if (type === 'call:incoming') {
        if (phaseRef.current === 'connected' || callCtxRef.current) return;
        setIncoming({
          callId: msg.callId as string,
          chatId: msg.chatId as string,
          video: Boolean(msg.video),
          from: msg.from as IncomingCallPayload['from'],
        });
        setPhase('ringing');
        return;
      }

      if (type === 'call:accepted') {
        const callId = msg.callId as string;
        const ctx = callCtxRef.current;
        if (!ctx || !ctx.isCaller || ctx.callId !== callId) return;
        try {
          await ensureCallerOffer(ctx, localMediaRef.current);
        } catch (e) {
          console.error(e);
          toast.error('Falha ao conectar a chamada');
          endCallRef.current();
        }
        return;
      }

      if (type === 'call:rejected') {
        const callId = msg.callId as string;
        if (callCtxRef.current?.callId !== callId) return;
        toast.error('Chamada recusada');
        endCallRef.current();
        return;
      }

      if (type === 'call:ended') {
        const callId = msg.callId as string;
        setIncoming((cur) => {
          if (cur?.callId === callId) {
            setPhase('idle');
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
        const ctx = callCtxRef.current;
        const callId = msg.callId as string;
        if (!ctx || ctx.isCaller || ctx.callId !== callId) return;
        const sdp = msg.sdp as RTCSessionDescriptionInit;
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
        if (!ctx || !ctx.isCaller || ctx.callId !== callId) return;
        const pc = pcRef.current;
        if (!pc) return;
        const sdp = msg.sdp as RTCSessionDescriptionInit;
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
        const pc = pcRef.current;
        if (!pc || !msg.candidate) return;
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate as RTCIceCandidateInit));
        } catch {
          /* ignore */
        }
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) wsRef.current = null;
    };

    return () => {
      ws.close();
      if (wsRef.current === ws) wsRef.current = null;
      callCtxRef.current = null;
      try {
        pcRef.current?.close();
      } catch {
        /* ignore */
      }
      pcRef.current = null;
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
      setPeerName(name);
      setPhase('calling');
      setRemoteStream(null);
      closePeer();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: video ? { facingMode: 'user' } : false,
          audio: true,
        });
        localMediaRef.current = stream;
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
        setPhase('idle');
        setPeerName('');
        stopAllMedia();
      }
    },
    [opts.userId, closePeer, stopAllMedia]
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
    callCtxRef.current = {
      callId,
      chatId,
      peerUserId: from.id,
      peerName: from.name,
      video,
      isCaller: false,
    };
    setPeerName(from.name);
    setIncoming(null);
    setPhase('calling');
    closePeer();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: video ? { facingMode: 'user' } : false,
        audio: true,
      });
      localMediaRef.current = stream;
      setLocalStream(stream);
      setCamOff(!video);
      ws.send(JSON.stringify({ type: 'call:accept', callId }));
    } catch (e) {
      console.error(e);
      toast.error('Permissão negada');
      ws.send(JSON.stringify({ type: 'call:reject', callId }));
      callCtxRef.current = null;
      setPhase('idle');
      setPeerName('');
      stopAllMedia();
    }
  }, [incoming, closePeer, stopAllMedia]);

  const rejectIncoming = useCallback(() => {
    if (!incoming) return;
    wsRef.current?.send(JSON.stringify({ type: 'call:reject', callId: incoming.callId }));
    setIncoming(null);
    setPhase('idle');
  }, [incoming]);

  const toggleMic = useCallback(() => {
    const s = localMediaRef.current;
    if (!s) return;
    const next = !micMuted;
    s.getAudioTracks().forEach((t) => {
      t.enabled = !next;
    });
    setMicMuted(next);
  }, [micMuted]);

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
  }, [camOff]);

  return {
    phase,
    incoming,
    localStream,
    remoteStream,
    micMuted,
    camOff,
    peerName,
    startOutgoing,
    acceptIncoming,
    rejectIncoming,
    endCall,
    toggleMic,
    toggleCam,
  };
}

export type NativeCallHook = ReturnType<typeof useNativeWebRTCCall>;
