'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const raw = hex.replace('#', '').trim();
  const full =
    raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw.length === 6 ? raw : null;
  if (!full) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((c) => clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const rgb = hexToRgb(hex);
  if (!rgb) return { h: 0, s: 0, v: 0.42 };
  return rgbToHsv(rgb.r, rgb.g, rgb.b);
}

function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function hueCss(h: number) {
  const { r, g, b } = hsvToRgb(h, 1, 1);
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function safeLabelHex(color: string): string {
  return /^#([0-9A-Fa-f]{6})$/.test(color) ? color.toUpperCase() : '#6B7280';
}

export function expandShortLabelHex(color: string): string {
  if (/^#[0-9A-Fa-f]{3}$/.test(color)) {
    const r = color[1];
    const g = color[2];
    const b = color[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return color.toUpperCase();
}

export interface KanbanLabelColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  className?: string;
}

/** Mapa HSV inline (saturação/brilho + matiz), sem popover. */
export function KanbanLabelColorMapInline({
  color,
  onChange,
  className,
}: {
  color: string;
  onChange: (color: string) => void;
  className?: string;
}) {
  const safeColor = safeLabelHex(color);
  const [hsv, setHsv] = useState(() => hexToHsv(safeColor));
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;
  const previewHex = hsvToHex(hsv.h, hsv.s, hsv.v);

  useEffect(() => {
    const nextHex = safeLabelHex(color);
    const currentHex = hsvToHex(hsvRef.current.h, hsvRef.current.s, hsvRef.current.v);
    if (nextHex !== currentHex) {
      setHsv(hexToHsv(nextHex));
    }
  }, [color]);

  const applyHsv = useCallback(
    (next: { h: number; s: number; v: number }) => {
      hsvRef.current = next;
      setHsv(next);
      onChange(hsvToHex(next.h, next.s, next.v));
    },
    [onChange],
  );

  const bindPlane = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);

      const update = (clientX: number, clientY: number) => {
        const rect = el.getBoundingClientRect();
        const s = clamp((clientX - rect.left) / rect.width, 0, 1);
        const v = clamp(1 - (clientY - rect.top) / rect.height, 0, 1);
        applyHsv({ ...hsvRef.current, s, v });
      };

      update(e.clientX, e.clientY);

      const onMove = (ev: PointerEvent) => update(ev.clientX, ev.clientY);
      const onUp = () => {
        el.releasePointerCapture(e.pointerId);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
      };

      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    },
    [applyHsv],
  );

  const bindHue = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      el.setPointerCapture(e.pointerId);

      const update = (clientX: number) => {
        const rect = el.getBoundingClientRect();
        const h = clamp(((clientX - rect.left) / rect.width) * 360, 0, 360);
        applyHsv({ ...hsvRef.current, h });
      };

      update(e.clientX);

      const onMove = (ev: PointerEvent) => update(ev.clientX);
      const onUp = () => {
        el.releasePointerCapture(e.pointerId);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
      };

      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
    },
    [applyHsv],
  );

  return (
    <div className={clsx('w-full', className)}>
      <div
        className="relative h-40 w-full cursor-crosshair touch-none rounded-lg"
        style={{ backgroundColor: hueCss(hsv.h) }}
        onPointerDown={bindPlane}
      >
        <div
          className="absolute inset-0 rounded-lg"
          style={{ background: 'linear-gradient(to right, #fff, transparent)' }}
        />
        <div
          className="absolute inset-0 rounded-lg"
          style={{ background: 'linear-gradient(to top, #000, transparent)' }}
        />
        <span
          className="pointer-events-none absolute h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/20"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: previewHex,
          }}
        />
      </div>

      <div
        className="relative mt-3 h-3 w-full cursor-pointer touch-none rounded-full"
        style={{
          background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
        }}
        onPointerDown={bindHue}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-1 ring-black/20"
          style={{
            left: `${(hsv.h / 360) * 100}%`,
            backgroundColor: hueCss(hsv.h),
          }}
        />
      </div>
    </div>
  );
}

export function KanbanLabelColorPicker({ color, onChange, className }: KanbanLabelColorPickerProps) {
  const safeColor = safeLabelHex(color);
  const popoverId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPanelPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const panelWidth = 220;
    const left = Math.min(rect.left, window.innerWidth - panelWidth - 12);
    setPanelPos({ top: rect.bottom + 8, left: Math.max(12, left) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDocPointer(e: PointerEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      const panel = document.getElementById(popoverId);
      if (panel?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, popoverId]);

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-11 w-11 shrink-0 cursor-pointer rounded-xl shadow-md ring-1 ring-black/10 transition hover:ring-2 hover:ring-red-500/50 dark:ring-white/15"
        title="Escolher cor"
        aria-label="Escolher cor"
        aria-expanded={open}
        aria-controls={popoverId}
      >
        <span
          className="absolute inset-0 rounded-xl"
          style={{ backgroundColor: safeColor }}
        />
      </button>

      {open &&
        panelPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            id={popoverId}
            role="dialog"
            aria-label="Seletor de cor"
            className="fixed w-[220px] rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-900"
            style={{ top: panelPos.top, left: panelPos.left, zIndex: 2300 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <KanbanLabelColorMapInline color={color} onChange={onChange} />
          </div>,
          document.body,
        )}
    </div>
  );
}
