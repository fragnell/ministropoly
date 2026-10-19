import type { GameState } from './types';

/** Errore di regola: l'azione viene rifiutata e lo stato non cambia. */
export class GameError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameError';
  }
}

export function fail(message: string): never {
  throw new GameError(message);
}

/** Generatore pseudo-casuale mulberry32; lo stato è dentro GameState.rng così la partita è riproducibile. */
export function nextRandom(s: GameState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Intero casuale in [0, n) */
export function randInt(s: GameState, n: number): number {
  return Math.floor(nextRandom(s) * n);
}

export function shuffle<T>(s: GameState, list: readonly T[]): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(s, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function fmt(n: number): string {
  return `${n.toLocaleString('it-IT')} Ore`;
}

export function isInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && Number.isFinite(n);
}

export function sum(list: number[]): number {
  return list.reduce((a, b) => a + b, 0);
}

/**
 * Clona lo stato di gioco. Registro eventi e registro economico sono 'append-only' (le voci non
 * vengono mai modificate dopo l'inserimento), quindi basta copiare gli array senza clonare ogni voce.
 */
export function cloneState(s: GameState): GameState {
  const { log, ledger, ...rest } = s;
  const c = structuredClone(rest) as GameState;
  c.log = log.slice();
  c.ledger = ledger.slice();
  return c;
}

/**
 * Impronta non reversibile di un identificativo di dispositivo (FNV-1a a 2 × 32 bit).
 * Lo stato pubblico contiene solo le impronte: chi legge lo stato non può impersonare un altro dispositivo.
 */
export function fingerprint(id: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x9e3779b9;
  for (let i = 0; i < id.length; i++) {
    const c = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return 'fp' + h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
