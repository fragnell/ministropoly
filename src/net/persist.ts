/**
 * Salvataggio e ripristino della partita (sul dispositivo del conduttore) + esportazione/importazione.
 */
import type { GameState } from '../engine/types';
import type { TransportKind } from './protocol';

export interface SavedGame {
  v: 1;
  savedAt: number;
  transport: TransportKind;
  state: GameState;
}

const key = (room: string) => `pp:host:${room}`;
const INDEX = 'pp:host:index';

function trimmed(state: GameState, tail: number): GameState {
  return { ...state, log: state.log.slice(-tail), ledger: state.ledger.slice(-tail) };
}

export function saveHostGame(room: string, transport: TransportKind, state: GameState): boolean {
  for (const tail of [1500, 600, 200, 60]) {
    try {
      const saved: SavedGame = { v: 1, savedAt: Date.now(), transport, state: trimmed(state, tail) };
      localStorage.setItem(key(room), JSON.stringify(saved));
      const idx = new Set<string>(JSON.parse(localStorage.getItem(INDEX) ?? '[]'));
      idx.add(room);
      localStorage.setItem(INDEX, JSON.stringify([...idx]));
      return true;
    } catch {
      /* spazio esaurito: riprova con meno registro */
    }
  }
  return false;
}

export function loadHostGame(room: string): SavedGame | null {
  try {
    const raw = localStorage.getItem(key(room));
    if (!raw) return null;
    const saved = JSON.parse(raw) as SavedGame;
    return saved && saved.v === 1 && saved.state ? saved : null;
  } catch {
    return null;
  }
}

export function deleteHostGame(room: string): void {
  try {
    localStorage.removeItem(key(room));
    const idx = new Set<string>(JSON.parse(localStorage.getItem(INDEX) ?? '[]'));
    idx.delete(room);
    localStorage.setItem(INDEX, JSON.stringify([...idx]));
  } catch {
    /* ignora */
  }
}

export interface SavedGameInfo {
  room: string;
  savedAt: number;
  transport: TransportKind;
  phase: GameState['phase'];
  players: string[];
}

export function listSavedGames(): SavedGameInfo[] {
  try {
    const idx: string[] = JSON.parse(localStorage.getItem(INDEX) ?? '[]');
    const out: SavedGameInfo[] = [];
    for (const room of idx) {
      const g = loadHostGame(room);
      if (g) out.push({ room, savedAt: g.savedAt, transport: g.transport, phase: g.state.phase, players: g.state.players.map((p) => p.name) });
    }
    return out.sort((a, b) => b.savedAt - a.savedAt);
  } catch {
    return [];
  }
}

/** Contenuto del file di esportazione (JSON leggibile) */
export function exportGameJson(state: GameState, transport: TransportKind): string {
  const saved: SavedGame = { v: 1, savedAt: Date.now(), transport, state };
  return JSON.stringify(saved, null, 1);
}

export function parseImportedGame(text: string): SavedGame {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Il file non è un salvataggio valido (JSON non leggibile)');
  }
  const d = data as Partial<SavedGame>;
  const s = d?.state as GameState | undefined;
  if (!d || d.v !== 1 || !s || !Array.isArray(s.players) || typeof s.phase !== 'string' || typeof s.props !== 'object' || !s.settings) {
    throw new Error('Il file non è un salvataggio di questo gioco');
  }
  return d as SavedGame;
}

/**
 * Prepara uno stato salvato per essere ripreso:
 *  - la partita in corso viene messa in PAUSA, congelando i conti alla rovescia al momento dell'ultimo salvataggio;
 *  - se `keepSeats` è falso (importazione su un'altra stanza/dispositivo) i posti vengono liberati
 *    e i giocatori li riprenderanno scegliendo il proprio nome.
 */
export function prepareRestoredState(saved: GameState, room: string, now: number, keepSeats: boolean): GameState {
  const s: GameState = structuredClone(saved);
  s.roomCode = room;
  s.version = (s.version ?? 0) + 1;
  // nuova epoca: i client accettano lo stato ripristinato anche se la sua `version` è più bassa di quella
  // che avevano visto (ultime mosse non salvate dopo un arresto improvviso)
  s.epoch = Math.max(now, (saved.epoch ?? 0) + 1);
  s.hostTime = now;
  for (const p of s.players) {
    if (p.isBot) continue;
    p.connected = false;
    if (!keepSeats) p.clientId = null;
  }
  s.notices = [];
  if (s.phase !== 'lobby' && s.phase !== 'game_over' && !s.paused) {
    s.paused = { since: Math.min(now, s.hostTime > 0 ? (saved.hostTime ?? now) : now) };
  }
  const text = 'Partita ripristinata: il conduttore la riprenderà con «Riprendi».';
  s.counters.log += 1;
  s.log.push({ seq: s.counters.log, ts: now, kind: 'system', text });
  return s;
}
