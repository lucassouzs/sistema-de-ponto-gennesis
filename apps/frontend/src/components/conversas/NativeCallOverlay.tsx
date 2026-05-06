'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Video, VideoOff, PhoneOff } from 'lucide-react';
import type { NativeCallHook } from '@/hooks/useNativeWebRTCCall';

export function NativeCallOverlay({ call }: { call: NativeCallHook }) {
  const { phase, incoming, localStream, remoteStream, micMuted, camOff, peerName, acceptIncoming, rejectIncoming, endCall, toggleMic, toggleCam } =
    call;

  const localRef = useRef<HTMLVideoElement>(null);
  const remoteRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.srcObject = localStream;
    void el.play().catch(() => {});
  }, [localStream]);

  useEffect(() => {
    const el = remoteRef.current;
    if (!el) return;
    el.srcObject = remoteStream;
    void el.play().catch(() => {});
  }, [remoteStream]);

  if (typeof document === 'undefined') return null;

  const showMain = phase === 'calling' || phase === 'connected';
  const showIncoming = phase === 'ringing' && incoming;

  if (!showMain && !showIncoming) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col bg-gray-950 text-white">
      {showIncoming && (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
          <p className="text-lg font-semibold">Chamada recebida</p>
          <p className="text-2xl">{incoming!.from.name}</p>
          <p className="text-sm text-white/60">{incoming!.video ? 'Videochamada' : 'Somente áudio'}</p>
          <div className="mt-4 flex gap-4">
            <button
              type="button"
              onClick={() => void acceptIncoming()}
              className="rounded-full bg-green-600 px-8 py-3 font-medium hover:bg-green-700"
            >
              Atender
            </button>
            <button
              type="button"
              onClick={rejectIncoming}
              className="rounded-full bg-red-600 px-8 py-3 font-medium hover:bg-red-700"
            >
              Recusar
            </button>
          </div>
        </div>
      )}

      {showMain && (
        <>
          <div className="relative flex-1 bg-black">
            {phase === 'calling' && (
              <p className="pointer-events-none absolute left-0 right-0 top-4 z-10 text-center text-sm text-white/80">
                {peerName ? `Chamando ${peerName}…` : 'Conectando…'}
              </p>
            )}
            <video ref={remoteRef} playsInline autoPlay className="h-full w-full object-cover" />
            {!remoteStream && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
                <p className="text-center text-white/70">{phase === 'calling' ? 'Aguardando…' : peerName}</p>
              </div>
            )}
            {localStream && localStream.getVideoTracks().length > 0 && (
              <div className="absolute bottom-4 right-4 h-28 w-40 overflow-hidden rounded-lg border border-white/20 bg-black shadow-xl sm:h-36 sm:w-52">
                <video ref={localRef} playsInline autoPlay muted className="h-full w-full object-cover" />
                {camOff && <div className="absolute inset-0 flex items-center justify-center bg-gray-800 text-xs">Câmera off</div>}
              </div>
            )}
          </div>
          <div className="flex items-center justify-center gap-4 border-t border-white/10 bg-gray-900 py-4">
            <button
              type="button"
              onClick={toggleMic}
              className="flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              aria-label={micMuted ? 'Ligar microfone' : 'Silenciar'}
            >
              {micMuted ? <MicOff size={22} /> : <Mic size={22} />}
            </button>
            {localStream && localStream.getVideoTracks().length > 0 && (
              <button
                type="button"
                onClick={toggleCam}
                className="flex size-12 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                aria-label={camOff ? 'Ligar câmera' : 'Desligar câmera'}
              >
                {camOff ? <VideoOff size={22} /> : <Video size={22} />}
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
        </>
      )}
    </div>,
    document.body
  );
}
