'use client';

const STORAGE_MUTED_KEY = 'chat-sounds-muted';

let audioCtx: AudioContext | null = null;
let incomingRingTimer: ReturnType<typeof setInterval> | null = null;
let outgoingRingTimer: ReturnType<typeof setInterval> | null = null;
let incomingOscillators: OscillatorNode[] = [];
let outgoingOscillators: OscillatorNode[] = [];

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
  }
  return audioCtx;
}

export function areChatSoundsMuted(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(STORAGE_MUTED_KEY) === '1';
}

export function setChatSoundsMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  if (muted) {
    localStorage.setItem(STORAGE_MUTED_KEY, '1');
    stopIncomingCallRing();
    stopOutgoingCallRingback();
  } else {
    localStorage.removeItem(STORAGE_MUTED_KEY);
  }
}

/** Desbloqueia áudio após gesto do usuário (política de autoplay dos navegadores). */
export async function unlockChatAudio(): Promise<void> {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
}

function stopOscillators(nodes: OscillatorNode[]) {
  nodes.forEach((o) => {
    try {
      o.stop();
      o.disconnect();
    } catch {
      /* ignore */
    }
  });
  nodes.length = 0;
}

function playDualTone(
  durationSec: number,
  gain = 0.12,
  freqs: [number, number] = [440, 480]
) {
  const ctx = getCtx();
  if (!ctx || areChatSoundsMuted()) return;
  const master = ctx.createGain();
  master.gain.value = gain;
  master.connect(ctx.destination);

  const oscs: OscillatorNode[] = [];
  freqs.forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    osc.connect(master);
    osc.start();
    osc.stop(ctx.currentTime + durationSec);
    oscs.push(osc);
  });
  return oscs;
}

/** Discagem: dois toques curtos + pausa breve, em loop contínuo. */
function playOutgoingRingBurst() {
  const ctx = getCtx();
  if (!ctx || areChatSoundsMuted()) return;
  stopOscillators(outgoingOscillators);

  const master = ctx.createGain();
  master.gain.value = 0.13;
  master.connect(ctx.destination);
  const freqs: [number, number] = [425, 475];
  const t0 = ctx.currentTime;

  const scheduleTone = (startAt: number) => {
    freqs.forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(master);
      osc.start(t0 + startAt);
      osc.stop(t0 + startAt + 0.55);
      outgoingOscillators.push(osc);
    });
  };

  scheduleTone(0);
  scheduleTone(0.75);
}

/** Toque de chamada recebida (repete até parar). */
export function startIncomingCallRing(): void {
  if (areChatSoundsMuted()) return;
  stopIncomingCallRing();
  void unlockChatAudio().then(() => {
    const ctx = getCtx();
    if (!ctx || areChatSoundsMuted()) return;

    const ringOnce = () => {
      stopOscillators(incomingOscillators);
      incomingOscillators = playDualTone(0.9, 0.14) ?? [];
    };

    ringOnce();
    incomingRingTimer = setInterval(ringOnce, 2800);
  });
}

export function stopIncomingCallRing(): void {
  if (incomingRingTimer) {
    clearInterval(incomingRingTimer);
    incomingRingTimer = null;
  }
  stopOscillators(incomingOscillators);
}

/** Tom de discagem enquanto aguarda atender (chamada saindo) — repete até parar. */
export function startOutgoingCallRingback(): void {
  if (areChatSoundsMuted()) return;
  stopOutgoingCallRingback();

  const run = () => {
    const ctx = getCtx();
    if (!ctx || areChatSoundsMuted()) return;
    playOutgoingRingBurst();
  };

  const startLoop = () => {
    if (outgoingRingTimer) return;
    run();
    outgoingRingTimer = setInterval(run, 2200);
  };

  void unlockChatAudio().then(startLoop);
  const ctx = getCtx();
  if (ctx?.state === 'running') startLoop();
}

export function stopOutgoingCallRingback(): void {
  if (outgoingRingTimer) {
    clearInterval(outgoingRingTimer);
    outgoingRingTimer = null;
  }
  stopOscillators(outgoingOscillators);
}

/** Notificação curta de nova mensagem. */
export function playNewMessageSound(): void {
  if (areChatSoundsMuted()) return;
  void unlockChatAudio().then(() => {
    const ctx = getCtx();
    if (!ctx || areChatSoundsMuted()) return;

    const notes = [
      { freq: 523.25, at: 0, dur: 0.09 },
      { freq: 659.25, at: 0.1, dur: 0.09 },
      { freq: 783.99, at: 0.2, dur: 0.14 },
    ];

    const master = ctx.createGain();
    master.gain.value = 0.1;
    master.connect(ctx.destination);

    notes.forEach(({ freq, at, dur }) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, ctx.currentTime + at);
      g.gain.linearRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + dur);
      osc.connect(g);
      g.connect(master);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + dur + 0.02);
    });
  });
}
