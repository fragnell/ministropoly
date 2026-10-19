import { expect } from 'vitest';
import { TOKENS } from '../src/config/game.config';
import { BUYABLE_INDICES } from '../src/config/board';
import type { Action } from '../src/engine/actions';
import { applyAction, needsTick } from '../src/engine/engine';
import { createGame } from '../src/engine/state';
import type { ApplyResult, GameState, Player } from '../src/engine/types';

export interface G {
  s: GameState;
  now: number;
}

export const cid = (i: number) => `dev${i}`;

/** Partita già avviata con `n` giocatori (p1…pn), turno del primo della lista */
export function mkGame(n = 3, seed = 12345, tweak?: (s: GameState) => void): G {
  const g: G = { s: createGame('TEST1', seed, 1_000_000), now: 1_000_000 };
  for (let i = 0; i < n; i++) {
    const r = applyAction(g.s, { type: 'JOIN', name: `Giocatore${i + 1}`, token: TOKENS[i].id }, { now: g.now, actor: { kind: 'client', clientId: cid(i) } });
    if (!r.ok) throw new Error(r.error);
    g.s = r.state;
  }
  if (tweak) tweak(g.s);
  const r = applyAction(g.s, { type: 'START_GAME' }, { now: g.now, actor: { kind: 'host' } });
  if (!r.ok) throw new Error(r.error);
  g.s = r.state;
  // ordine di turno deterministico per i test: p1, p2, p3 ...
  g.s.turnOrder = g.s.players.map((p) => p.id);
  g.s.currentPlayerId = g.s.turnOrder[0];
  return g;
}

export function playerIdx(g: G, id: string): number {
  return g.s.players.findIndex((p) => p.id === id);
}

export function P(g: G, i: number): Player {
  return g.s.players[i];
}

export function curIdx(g: G): number {
  return playerIdx(g, g.s.currentPlayerId as string);
}

/** Esegue un'azione e lancia un errore se viene rifiutata */
export function run(g: G, who: number | 'host', action: Action, extra: { forcedDice?: [number, number]; actionId?: string } = {}): ApplyResult {
  const r = applyAction(g.s, action, { now: g.now, actor: who === 'host' ? { kind: 'host' } : { kind: 'client', clientId: cid(who) }, ...extra });
  if (!r.ok) throw new Error(`Azione ${action.type} rifiutata: ${r.error}`);
  g.s = r.state;
  return r;
}

/** Esegue un'azione che DEVE essere rifiutata; restituisce il messaggio */
export function runFail(g: G, who: number | 'host', action: Action, extra: { forcedDice?: [number, number] } = {}): string {
  const before = g.s;
  const r = applyAction(g.s, action, { now: g.now, actor: who === 'host' ? { kind: 'host' } : { kind: 'client', clientId: cid(who) }, ...extra });
  expect(r.ok, `L'azione ${action.type} avrebbe dovuto essere rifiutata`).toBe(false);
  expect(r.state).toBe(before); // lo stato non cambia
  return (r as { error: string }).error;
}

/** Fa avanzare il tempo finché dadi e movimento sono conclusi */
export function settle(g: G): void {
  for (let i = 0; i < 40; i++) {
    const s = g.s;
    if (s.phase === 'rolling' && s.roll) g.now = Math.max(g.now, s.roll.endsAt);
    else if (s.phase === 'moving' && s.movement) g.now = Math.max(g.now, s.movement.endsAt);
    else return;
    const r = applyAction(g.s, { type: 'TICK' }, { now: g.now, actor: { kind: 'host' } });
    if (!r.ok) throw new Error(r.error);
    g.s = r.state;
  }
  throw new Error('settle: troppi cicli');
}

export function tick(g: G, ms = 0): void {
  g.now += ms;
  for (let i = 0; i < 10 && needsTick(g.s, g.now); i++) {
    const r = applyAction(g.s, { type: 'TICK' }, { now: g.now, actor: { kind: 'host' } });
    if (!r.ok) throw new Error(r.error);
    g.s = r.state;
  }
}

/** Il giocatore di turno lancia con dadi forzati e il movimento viene concluso */
export function roll(g: G, d1: number, d2: number): void {
  run(g, curIdx(g), { type: 'ROLL_DICE' }, { forcedDice: [d1, d2] });
  settle(g);
}

/** Posiziona il giocatore di turno in modo che il prossimo lancio (d1+d2) lo porti sulla casella `target` */
export function rollTo(g: G, target: number, d1 = 1, d2 = 2): void {
  const p = g.s.players[curIdx(g)];
  p.position = (((target - (d1 + d2)) % 40) + 40) % 40;
  roll(g, d1, d2);
}

export function give(g: G, i: number, squares: number[]): void {
  for (const q of squares) g.s.props[String(q)].owner = P(g, i).id;
}

function check(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

/**
 * Controlli di coerenza che devono valere SEMPRE (versione veloce: lancia un errore descrittivo).
 * Con `trackBalances` verifica anche che ogni Ora sia passata dal registro economico:
 * saldo = saldo iniziale + entrate - uscite (nessuna modifica silenziosa).
 */
export function assertInvariants(s: GameState, label = '', trackBalances = false): void {
  const tag = label ? ` [${label}]` : '';
  for (const p of s.players) {
    check(p.cash >= 0, `saldo negativo di ${p.name}: ${p.cash}${tag}`);
    check(Number.isInteger(p.cash), `saldo non intero di ${p.name}${tag}`);
    check(p.position >= 0 && p.position < 40, `posizione non valida di ${p.name}${tag}`);
    if (p.bankrupt) {
      check(p.cash === 0, `fallito con Ore${tag}`);
      check(!Object.values(s.props).some((x) => x.owner === p.id), `proprietà di un fallito${tag}`);
      check(p.heldCards.length === 0, `fallito con carte${tag}`);
    }
    if (trackBalances && s.phase !== 'lobby') {
      const expected = s.settings.startingCash + p.stats.income - p.stats.expenses;
      check(expected === p.cash, `saldo non tracciato di ${p.name}: ${p.cash} invece di ${expected}${tag}`);
    }
  }
  let visits = 0;
  let studies = 0;
  for (const i of BUYABLE_INDICES) {
    const st = s.props[String(i)];
    check(!!st, `proprietà ${i} mancante${tag}`);
    if (st.owner) check(s.players.some((p) => p.id === st.owner && !p.bankrupt), `proprietario non valido per ${i}${tag}`);
    if (!st.owner) check(st.level === 0 && !st.mortgaged, `sviluppi/ipoteca su proprietà libera ${i}${tag}`);
    if (st.mortgaged) check(st.level === 0, `ipoteca con sviluppi su ${i}${tag}`);
    check(st.level >= 0 && st.level <= 5, `livello non valido su ${i}${tag}`);
    if (st.level === 5) studies++;
    else visits += st.level;
  }
  check(s.bank.visits + visits === 32, `segnalini Visita: banca ${s.bank.visits} + tabellone ${visits}${tag}`);
  check(s.bank.studies + studies === 12, `segnalini Studio: banca ${s.bank.studies} + tabellone ${studies}${tag}`);
  for (const e of s.ledger.slice(-40)) {
    if (e.from !== 'bank') check((e.fromBefore as number) - e.amount === e.fromAfter, `registro incoerente (pagante) #${e.seq}${tag}`);
    if (e.to !== 'bank') check((e.toBefore as number) + e.amount === e.toAfter, `registro incoerente (destinatario) #${e.seq}${tag}`);
    check(e.amount > 0, `importo non positivo nel registro #${e.seq}${tag}`);
  }
  if (s.phase !== 'lobby') {
    for (const deck of ['treasure', 'surprise'] as const) {
      const prefix = deck === 'treasure' ? 'T' : 'S';
      const all = [...s.decks[deck].draw, ...s.decks[deck].discard, ...s.players.flatMap((p) => p.heldCards.filter((c) => c.startsWith(prefix)))];
      const inPlay = s.pending?.kind === 'card' && s.pending.deck === deck ? 1 : 0;
      check(new Set(all).size === all.length, `carte duplicate nel mazzo ${deck}${tag}`);
      check(all.length + inPlay === 24, `carte del mazzo ${deck}: ${all.length}+${inPlay} invece di 24${tag}`);
    }
  }
}
