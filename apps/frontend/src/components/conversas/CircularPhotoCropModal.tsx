'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Cropper, { type Area } from 'react-easy-crop';
import { X, RotateCcw, Plus, Minus, Check, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getCroppedImageBlob } from '@/lib/getCroppedImg';

/** Sidebar e página Conversas podem cada uma ter um modal; usa contagem para não “liberar” o FAB antes da hora. */
let cropModalsFabSuppressionDepth = 0;

function broadcastConversasFabHidden() {
  window.dispatchEvent(
    new CustomEvent('conversas-fab-visibility', {
      detail: { hidden: cropModalsFabSuppressionDepth > 0 },
    })
  );
}

export interface CircularPhotoCropModalProps {
  open: boolean;
  imageSrc: string;
  onClose: () => void;
  /** Arquivo JPEG recortado (~quadrado inscrito no círculo de preview). */
  onConfirm: (file: File) => void | Promise<void>;
  /** Troca a imagem de origem (novo arquivo, ex.: outra foto da galeria). */
  onPickReplacement: (file: File) => void;
}

export function CircularPhotoCropModal({
  open,
  imageSrc,
  onClose,
  onConfirm,
  onPickReplacement,
}: CircularPhotoCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedPixels, setCroppedPixels] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !imageSrc) return;
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedPixels(null);
  }, [open, imageSrc]);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cropModalsFabSuppressionDepth += 1;
    broadcastConversasFabHidden();
    return () => {
      document.body.style.overflow = prevOverflow;
      cropModalsFabSuppressionDepth = Math.max(0, cropModalsFabSuppressionDepth - 1);
      broadcastConversasFabHidden();
    };
  }, [open]);

  const onCropComplete = useCallback((_area: Area, areaPixels: Area) => {
    setCroppedPixels(areaPixels);
  }, []);

  const handleConfirm = async () => {
    if (!croppedPixels) return;
    setBusy(true);
    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedPixels);
      const file = new File([blob], `foto-grupo-${Date.now()}.jpg`, {
        type: 'image/jpeg',
      });
      await onConfirm(file);
    } catch {
      toast.error('Não foi possível preparar a imagem.');
    } finally {
      setBusy(false);
    }
  };

  const onReplaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file?.type.startsWith('image/')) return;
    onPickReplacement(file);
  };

  if (typeof document === 'undefined' || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200050] flex min-h-[100vh] flex-col bg-black/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crop-photo-title"
    >
      <input
        ref={replaceInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onReplaceFile}
      />

      <div className="flex shrink-0 items-center justify-between px-3 py-3 pt-[max(12px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-full text-white/90 hover:bg-white/10 transition-colors"
          aria-label="Fechar"
        >
          <X size={24} strokeWidth={2} />
        </button>
        <h2
          id="crop-photo-title"
          className="text-center text-[15px] font-medium text-white px-2 flex-1 truncate"
        >
          Arraste a imagem para ajustar
        </h2>
        <button
          type="button"
          onClick={() => replaceInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-medium text-[#25D366] hover:bg-white/10 transition-colors whitespace-nowrap"
        >
          <RotateCcw size={16} />
          Carregar
        </button>
      </div>

      <div className="relative mx-auto flex w-full max-w-[min(440px,95vw)] min-h-[min(260px,50svh)] flex-1 flex-col px-2 pb-2">
        <div className="relative min-h-[min(62vh,420px)] w-full flex-1 rounded-2xl overflow-hidden bg-[#1a1a1a]">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid={false}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
            objectFit="horizontal-cover"
          />

          <div className="absolute right-2 top-1/2 z-10 flex -translate-y-1/2 pointer-events-auto flex-col items-center gap-1 rounded-full bg-black/50 py-2 px-1.5 backdrop-blur-sm border border-white/10">
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(4, z + 0.15))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15"
              aria-label="Aproximar"
            >
              <Plus size={20} />
            </button>
            <div className="h-8 w-px bg-white/25 shrink-0" />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(1, z - 0.15))}
              className="flex h-9 w-9 items-center justify-center rounded-full text-white hover:bg-white/15"
              aria-label="Afastar"
            >
              <Minus size={20} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 justify-center px-5 pt-4 pb-[calc(96px+env(safe-area-inset-bottom))] sm:justify-end sm:pb-[max(20px,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy || !croppedPixels}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30 hover:bg-[#20bd5a] disabled:opacity-50 transition-colors"
          aria-label="Confirmar foto"
        >
          {busy ? (
            <Loader2 size={28} className="animate-spin" />
          ) : (
            <Check size={30} strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>,
    document.body
  );
}
