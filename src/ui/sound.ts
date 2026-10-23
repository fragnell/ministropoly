/**
 * Effetti sonori: il lancio dei dadi usa una registrazione; gli altri sono sintetizzati
 * via Web Audio API (nessun file audio esterno da scaricare per quelli).
 */
let diceAudio: HTMLAudioElement | null = null;

function getDiceAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!diceAudio) {
    diceAudio = new Audio(`${import.meta.env.BASE_URL}audio/effetto-dado.mp3`);
    diceAudio.preload = 'auto';
  }
  return diceAudio;
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, offset: number, duration: number, type: OscillatorType, peak: number): void {
  const t0 = c.currentTime + offset;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

/** Rumore dei dadi lanciati */
export function sfxDice(): void {
  const base = getDiceAudio();
  if (!base) return;
  try {
    const a = base.cloneNode(true) as HTMLAudioElement;
    a.volume = 0.7;
    void a.play().catch(() => {});
  } catch {
    /* non disponibile */
  }
}

/** Passo quando la pedina avanza sul tabellone */
export function sfxMove(): void {
  const c = getCtx();
  if (!c) return;
  tone(c, 500, 0, 0.08, 'triangle', 0.12);
}

/** Campanello quando esce una proprietà da acquistare o una carta evento */
export function sfxCard(): void {
  const c = getCtx();
  if (!c) return;
  tone(c, 660, 0, 0.1, 'sine', 0.15);
  tone(c, 920, 0.09, 0.14, 'sine', 0.13);
}

/** Suono discendente quando un giocatore va alla Pausa organizzativa (prigione) */
export function sfxJail(): void {
  const c = getCtx();
  if (!c) return;
  tone(c, 300, 0, 0.16, 'sawtooth', 0.13);
  tone(c, 180, 0.15, 0.24, 'sawtooth', 0.13);
}
