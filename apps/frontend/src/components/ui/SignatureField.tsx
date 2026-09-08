'use client';

import React, { useCallback, useEffect, useRef } from 'react';

type SignatureFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
};

const STROKE_COLOR = '#111827';

function fillCanvasBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
}

function isCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;

  const { width, height } = canvas;
  const pixels = ctx.getImageData(0, 0, width, height).data;

  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    if (a > 0 && (r < 245 || g < 245 || b < 245)) {
      return false;
    }
  }

  return true;
}

export function isBlankSignature(value: string): boolean {
  return !value || !value.startsWith('data:image/');
}

export function SignatureField({ value, onChange, disabled = false, className = '' }: SignatureFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const hasDrawnRef = useRef(false);

  const prepareContext = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  const resetCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    fillCanvasBackground(ctx, canvas.width, canvas.height);
    hasDrawnRef.current = false;
  }, []);

  useEffect(() => {
    resetCanvas();
  }, [resetCanvas]);

  useEffect(() => {
    if (drawingRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    if (!value) {
      resetCanvas();
      return;
    }

    const image = new Image();
    image.onload = () => {
      if (drawingRef.current) return;
      fillCanvasBackground(ctx, canvas.width, canvas.height);
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      hasDrawnRef.current = true;
    };
    image.src = value;
  }, [value, resetCanvas]);

  const getPoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY
    };
  };

  const exportSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || isCanvasBlank(canvas)) {
      hasDrawnRef.current = false;
      onChange('');
      return;
    }
    hasDrawnRef.current = true;
    onChange(canvas.toDataURL('image/png'));
  };

  const startDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    event.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);
    prepareContext(ctx);

    const point = getPoint(event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const draw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled) return;
    event.preventDefault();

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const point = getPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    hasDrawnRef.current = true;
  };

  const endDraw = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();

    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // ignore
    }

    exportSignature();
  };

  const clear = () => {
    resetCanvas();
    onChange('');
  };

  return (
    <div className={className}>
      <div className="overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600">
        <canvas
          ref={canvasRef}
          width={640}
          height={180}
          aria-label="Área de assinatura"
          className={`block h-40 w-full touch-none bg-white ${
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
          }`}
          style={{ touchAction: 'none' }}
          onPointerDown={startDraw}
          onPointerMove={draw}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
          onPointerCancel={endDraw}
        />
      </div>
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-50 dark:text-red-400 dark:hover:text-red-300"
        >
          Limpar assinatura
        </button>
      </div>
    </div>
  );
}
