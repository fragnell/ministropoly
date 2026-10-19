import { ECONOMY } from '../config/game.config';
import { BUYABLE_INDICES } from '../config/board';
import type { GameSettings, GameState, PlayerStats } from './types';
import { fingerprint } from './util';

export function defaultSettings(): GameSettings {
  return {
    startingCash: ECONOMY.startingCash,
    packs: { publisher: false, kids: false },
    auctionSeconds: ECONOMY.auction.seconds,
    speedMode: { enabled: false, minutes: 60 },
  };
}

export function emptyStats(): PlayerStats {
  return { income: 0, expenses: 0, fromBank: 0, toBank: 0, rentIn: 0, rentOut: 0, developmentsBuilt: 0, propertiesBought: 0 };
}

/** Crea una partita in sala d'attesa. `seed` rende riproducibile la partita (dadi, mazzi). */
export function createGame(roomCode: string, seed: number, now: number): GameState {
  const props: GameState['props'] = {};
  for (const i of BUYABLE_INDICES) props[String(i)] = { owner: null, mortgaged: false, level: 0 };
  return {
    epoch: now,
    version: 1,
    roomCode,
    phase: 'lobby',
    settings: defaultSettings(),
    players: [],
    turnOrder: [],
    currentPlayerId: null,
    turnNumber: 0,
    round: 0,
    props,
    bank: { visits: ECONOMY.tokens.visits, studies: ECONOMY.tokens.studies },
    roll: null,
    doublesCount: 0,
    movement: null,
    pending: null,
    auction: null,
    trades: [],
    decks: { treasure: { draw: [], discard: [] }, surprise: { draw: [], discard: [] } },
    lastCard: null,
    lastChallenge: null,
    usedQuestions: [],
    paused: null,
    startedAt: null,
    pausedTotalMs: 0,
    timeUp: false,
    winnerId: null,
    summary: null,
    log: [],
    ledger: [],
    notices: [],
    processed: [],
    rng: seed >>> 0,
    counters: { log: 0, ledger: 0, trade: 0, notice: 0, roll: 0, move: 0, card: 0, challenge: 0 },
    hostTime: now,
    createdAt: now,
  };
}

/**
 * Versione pubblicabile dello stato: nasconde l'ordine dei mazzi e il generatore casuale
 * e non include il registro completo (viene inviato a parte, a blocchi).
 */
export function publicView(s: GameState, hostTime: number): GameState {
  return {
    ...s,
    hostTime,
    players: s.players.map((p) => ({ ...p, clientId: p.clientId ? fingerprint(p.clientId) : null })),
    log: [],
    ledger: [],
    processed: [],
    rng: 0,
    decks: { treasure: { draw: [], discard: [] }, surprise: { draw: [], discard: [] } },
  };
}

/** Elapsed effettivo di gioco, senza i periodi di pausa */
export function elapsedMs(s: GameState, now: number): number {
  if (s.startedAt == null) return 0;
  const end = s.paused ? s.paused.since : now;
  return Math.max(0, end - s.startedAt - s.pausedTotalMs);
}

/** Aggiunge una notifica (es. un errore) destinata a un dispositivo, senza passare dal motore */
export function withNotice(s: GameState, clientId: string, text: string, level: 'info' | 'error' = 'error'): GameState {
  const id = s.counters.notice + 1;
  return {
    ...s,
    version: s.version + 1,
    counters: { ...s.counters, notice: id },
    notices: [...s.notices, { id, to: fingerprint(clientId), text, level, ts: s.hostTime }].slice(-12),
  };
}
