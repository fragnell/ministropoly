/**
 * Effetti sonori sintetizzati via Web Audio API: nessun file audio esterno da scaricare.
 */
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

/** Tintinnio rapido quando vengono lanciati i dadi */
export function sfxDice(): void {
  const c = getCtx();
  if (!c) return;
  for (let i = 0; i < 5; i++) tone(c, 220 + Math.random() * 300, i * 0.05, 0.05, 'square', 0.09);
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
