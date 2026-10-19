import { describe, expect, it } from 'vitest';
import { TOKENS } from '../src/config/game.config';
import type { Action } from '../src/engine/actions';
import { nextMove } from '../src/engine/bot';
import { applyAction, needsTick } from '../src/engine/engine';
import { createGame } from '../src/engine/state';
import type { GameState } from '../src/engine/types';
import { assertInvariants } from './helpers';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SimResult {
  finished: boolean;
  steps: number;
  turns: number;
  state: GameState;
  stats: Record<string, number>;
}

/** Simula una partita completa in cui tutti i giocatori usano la politica dei bot, controllando gli invarianti ad ogni passo. */
function simulate(seed: number, players: number, maxSteps = 9000, setup?: (s: GameState) => void): SimResult {
  const rand = rng(seed * 7919 + 13);
  let now = 5_000_000;
  let s = createGame('SIM00', seed, now);
  for (let i = 0; i < players; i++) {
    const r = applyAction(s, { type: 'JOIN', name: `G${i + 1}`, token: TOKENS[i].id, profile: i % 2 ? 'kid' : 'adult' }, { now, actor: { kind: 'client', clientId: `c${i}` } });
    if (!r.ok) throw new Error(r.error);
    s = r.state;
  }
  setup?.(s);
  let r = applyAction(s, { type: 'START_GAME' }, { now, actor: { kind: 'host' } });
  if (!r.ok) throw new Error(r.error);
  s = r.state;
  const stats: Record<string, number> = {};
  let steps = 0;
  let seenIds = 0;

  while (s.phase !== 'game_over' && steps < maxSteps) {
    steps++;
    let action: Action;
    let actor: { kind: 'host' } | { kind: 'client'; clientId: string };
    if (needsTick(s, now)) {
      action = { type: 'TICK' };
      actor = { kind: 'host' };
    } else if (s.phase === 'rolling' && s.roll) {
      now = Math.max(now, s.roll.endsAt);
      continue;
    } else if (s.phase === 'moving' && s.movement) {
      now = Math.max(now, s.movement.endsAt);
      continue;
    } else {
      const move = nextMove(s, rand, false);
      if (!move) {
        if (s.phase === 'auction' && s.auction) {
          now = Math.max(now, s.auction.endsAt);
          continue;
        }
        throw new Error(`Simulazione bloccata in fase ${s.phase} (${JSON.stringify(s.pending)}) al passo ${steps}`);
      }
      action = move.action;
      actor = { kind: 'client', clientId: move.player.clientId as string };
      now += 400;
    }
    const before = s;
    const res = applyAction(s, action, { now, actor, actionId: `a${++seenIds}` });
    if (!res.ok) {
      throw new Error(`Azione ${action.type} rifiutata al passo ${steps} (fase ${before.phase}): ${res.error}`);
    }
    s = res.state;
    stats[action.type] = (stats[action.type] ?? 0) + 1;
    if (steps % 5 === 0 || s.phase === 'game_over') assertInvariants(s, `seed ${seed} passo ${steps}`, true);
  }
  assertInvariants(s, `seed ${seed} finale`, true);
  return { finished: s.phase === 'game_over', steps, turns: s.turnNumber, state: s, stats };
}

describe('19. Simulazione completa con più giocatori', () => {
  it('30 partite simulate (2–6 giocatori): nessun saldo negativo, proprietà duplicate o effetti applicati due volte', () => {
    let finished = 0;
    const totals: Record<string, number> = {};
    for (let seed = 1; seed <= 30; seed++) {
      const n = 2 + (seed % 5);
      const res = simulate(seed, n);
      if (res.finished) finished++;
      for (const [k, v] of Object.entries(res.stats)) totals[k] = (totals[k] ?? 0) + v;
    }
    // la simulazione deve esercitare tutte le parti principali del gioco
    for (const key of ['ROLL_DICE', 'BUY_PROPERTY', 'PAY_RENT', 'ACK_CARD', 'BID', 'DEVELOP', 'MORTGAGE', 'SELL_DEVELOPMENT', 'DECLARE_BANKRUPTCY']) {
      expect(totals[key] ?? 0, `azione ${key} mai eseguita`).toBeGreaterThan(0);
    }
    // la maggior parte delle partite arriva a un vincitore
    expect(finished).toBeGreaterThanOrEqual(15);
  }, 120000);

  it('una partita terminata ha un solo vincitore e una classifica completa', () => {
    const res = simulate(4, 4);
    expect(res.finished).toBe(true);
    const s = res.state;
    expect(s.summary?.standings).toHaveLength(4);
    expect(s.summary?.standings[0].playerId).toBe(s.winnerId);
    expect(s.players.filter((p) => !p.bankrupt)).toHaveLength(1);
    expect(s.summary?.standings.map((x) => x.place)).toEqual([1, 2, 3, 4]);
  }, 60000);

  it('le partite sono riproducibili con lo stesso seme', () => {
    const a = simulate(11, 3, 600);
    const b = simulate(11, 3, 600);
    expect(a.state.players.map((p) => p.cash)).toEqual(b.state.players.map((p) => p.cash));
    expect(a.state.turnNumber).toBe(b.state.turnNumber);
  });

  it('con le espansioni attive le sfide non bloccano il gioco (le valuta il proprietario)', () => {
    // i bot non avviano sfide: qui si verifica solo che il motore resti coerente con i pacchetti attivi
    const res = simulate(21, 3, 4000, (s) => {
      s.settings.packs = { publisher: true, kids: true };
    });
    expect(res.state.settings.packs.kids).toBe(true);
  }, 60000);

  it('modalità rapida: la partita si chiude da sola a tempo scaduto', () => {
    // 45 minuti simulati: ogni azione avanza di 400 ms, quindi servono ~6750 azioni; usiamo una partita lunga
    const res = simulate(33, 4, 20000, (s) => {
      s.settings.speedMode = { enabled: true, minutes: 45 };
    });
    expect(res.finished).toBe(true);
  }, 120000);
});
