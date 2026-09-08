'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Z_LIGHTBOX } from '@/lib/zIndex';

const PAPER_COLORS = [
  '#61BD4F',
  '#F2D600',
  '#FF9F1A',
  '#EB5A46',
  '#C377E0',
  '#00C2E0',
  '#FF78CB',
  '#51E898',
  '#0079BF',
  '#FFFFFF',
  '#FFE566',
  '#7BC86C',
];

type PaperPiece = {
  id: number;
  dx: number;
  dy: number;
  rot: number;
  spin: number;
  color: string;
  width: number;
  height: number;
  delayMs: number;
  durationMs: number;
  shape: 'rect' | 'strip' | 'diamond' | 'dot' | 'star';
  fall: number;
};

type SparkBurst = {
  id: number;
  angle: number;
  distance: number;
  color: string;
  delayMs: number;
  size: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function buildPieces(count: number): PaperPiece[] {
  return Array.from({ length: count }, (_, id) => {
    const angle = randomBetween(-Math.PI, Math.PI);
    const distance = randomBetween(56, 175);
    const shapeRoll = Math.random();
    const shape: PaperPiece['shape'] =
      shapeRoll > 0.88
        ? 'star'
        : shapeRoll > 0.72
          ? 'dot'
          : shapeRoll > 0.48
            ? 'strip'
            : shapeRoll > 0.28
              ? 'diamond'
              : 'rect';

    let width = randomBetween(6, 12);
    let height = randomBetween(4, 8);
    if (shape === 'strip') {
      width = randomBetween(2.5, 4.5);
      height = randomBetween(12, 22);
    } else if (shape === 'diamond' || shape === 'star') {
      width = randomBetween(7, 12);
      height = width;
    } else if (shape === 'dot') {
      width = randomBetween(3.5, 6.5);
      height = width;
    }

    return {
      id,
      dx: Math.cos(angle) * distance + randomBetween(-18, 18),
      dy: Math.sin(angle) * distance * 0.72 - randomBetween(36, 110),
      rot: randomBetween(-50, 50),
      spin: randomBetween(-720, 720),
      color: PAPER_COLORS[Math.floor(Math.random() * PAPER_COLORS.length)]!,
      width,
      height,
      delayMs: randomBetween(0, 90),
      durationMs: randomBetween(850, 1350),
      shape,
      fall: randomBetween(48, 96),
    };
  });
}

function buildSparks(count: number): SparkBurst[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    angle: (id / count) * Math.PI * 2 + randomBetween(-0.12, 0.12),
    distance: randomBetween(28, 64),
    color: PAPER_COLORS[Math.floor(Math.random() * PAPER_COLORS.length)]!,
    delayMs: randomBetween(0, 40),
    size: randomBetween(2, 4),
  }));
}

export type PaperConfettiOrigin = {
  x: number;
  y: number;
};

export function originFromElement(el: Element | null): PaperConfettiOrigin | null {
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

type BurstShot = {
  key: string;
  origin: PaperConfettiOrigin;
  pieces: PaperPiece[];
  sparks: SparkBurst[];
};

/**
 * Dispara um estouro de “papeizinhos” a partir de um ponto (ex.: checkbox de conclusão).
 */
export function usePaperConfetti() {
  const reactId = useId();
  const [shots, setShots] = useState<BurstShot[]>([]);

  const fire = (origin: PaperConfettiOrigin | null | undefined, pieceCount = 44) => {
    if (!origin || prefersReducedMotion()) return;
    const key = `${reactId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setShots((prev) => [
      ...prev,
      {
        key,
        origin,
        pieces: buildPieces(pieceCount),
        sparks: buildSparks(14),
      },
    ]);
  };

  const dismiss = (key: string) => {
    setShots((prev) => prev.filter((shot) => shot.key !== key));
  };

  const host =
    shots.length > 0 ? (
      <PaperConfettiHost shots={shots} onShotDone={dismiss} />
    ) : null;

  return { fire, host };
}

/** Liga a animação de “pop” no checkbox por ~700ms. */
export function useCelebratePulse(durationMs = 720) {
  const [celebrating, setCelebrating] = useState(false);

  const trigger = () => {
    if (prefersReducedMotion()) return;
    setCelebrating(true);
    window.setTimeout(() => setCelebrating(false), durationMs);
  };

  return { celebrating, trigger };
}

function PaperConfettiHost({
  shots,
  onShotDone,
}: {
  shots: BurstShot[];
  onShotDone: (key: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 overflow-hidden"
      style={{ zIndex: Z_LIGHTBOX + 50 }}
      aria-hidden
    >
      {shots.map((shot) => (
        <PaperConfettiShot
          key={shot.key}
          shot={shot}
          onDone={() => onShotDone(shot.key)}
        />
      ))}
    </div>,
    document.body,
  );
}

function PaperConfettiShot({
  shot,
  onDone,
}: {
  shot: BurstShot;
  onDone: () => void;
}) {
  const maxDuration = useMemo(
    () => Math.max(...shot.pieces.map((p) => p.delayMs + p.durationMs), 1100),
    [shot.pieces],
  );

  useEffect(() => {
    const timer = window.setTimeout(onDone, maxDuration + 100);
    return () => window.clearTimeout(timer);
  }, [maxDuration, onDone]);

  return (
    <>
      <span
        className="paper-confetti-flash"
        style={{ left: shot.origin.x, top: shot.origin.y }}
      />
      <span
        className="paper-confetti-ring paper-confetti-ring--a"
        style={{ left: shot.origin.x, top: shot.origin.y }}
      />
      <span
        className="paper-confetti-ring paper-confetti-ring--b"
        style={{ left: shot.origin.x, top: shot.origin.y }}
      />

      {shot.sparks.map((spark) => (
        <span
          key={`spark-${spark.id}`}
          className="paper-confetti-spark"
          style={
            {
              left: shot.origin.x,
              top: shot.origin.y,
              width: spark.size,
              height: spark.size,
              backgroundColor: spark.color,
              animationDelay: `${spark.delayMs}ms`,
              '--pc-dx': `${Math.cos(spark.angle) * spark.distance}px`,
              '--pc-dy': `${Math.sin(spark.angle) * spark.distance}px`,
            } as React.CSSProperties
          }
        />
      ))}

      {shot.pieces.map((piece) => (
        <span
          key={piece.id}
          className={
            piece.shape === 'star'
              ? 'paper-confetti-piece paper-confetti-piece--star'
              : piece.shape === 'dot'
                ? 'paper-confetti-piece paper-confetti-piece--dot'
                : 'paper-confetti-piece'
          }
          style={
            {
              left: shot.origin.x,
              top: shot.origin.y,
              width: piece.width,
              height: piece.height,
              backgroundColor: piece.color,
              borderRadius:
                piece.shape === 'dot'
                  ? 999
                  : piece.shape === 'rect'
                    ? 1.5
                    : piece.shape === 'strip'
                      ? 1
                      : 2,
              boxShadow:
                piece.color === '#FFFFFF'
                  ? '0 0 0 1px rgba(0,0,0,0.08)'
                  : '0 1px 2px rgba(0,0,0,0.14)',
              animationDuration: `${piece.durationMs}ms`,
              animationDelay: `${piece.delayMs}ms`,
              '--pc-dx': `${piece.dx}px`,
              '--pc-dy': `${piece.dy}px`,
              '--pc-spin': `${piece.spin}deg`,
              '--pc-fall': `${piece.fall}px`,
              '--pc-base-rot': `${piece.shape === 'diamond' ? 45 : piece.rot}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}
