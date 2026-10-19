/**
 * Flusso del turno: movimento, Pausa organizzativa, debiti, cambio turno e fine partita.
 * Tutte le funzioni modificano lo stato "bozza" ricevuto (già clonato da applyAction):
 * se una funzione lancia GameError, la bozza viene scartata e lo stato reale non cambia mai.
 */
import { BOARD_SIZE, JAIL_INDEX } from '../config/board';
import { TIMING } from '../config/game.config';
import type { DebtItem, DebtThen, GameState, Player, Standing } from './types';
import { pushLog, transfer } from './money';
import { activePlayers, developmentCounts, getPlayer, netWorth, ownedSquares } from './selectors';
import { elapsedMs } from './state';
import { fmt, sum } from './util';

// ------------------------------------------------------------------ movimento

export function startMovement(
  s: GameState,
  p: Player,
  o: { to: number; direction: 'forward' | 'backward'; collectGo: boolean; reason: 'dice' | 'card' | 'jail' },
  now: number,
): void {
  const path: number[] = [];
  let i = p.position;
  if (o.direction === 'forward') {
    do {
      i = (i + 1) % BOARD_SIZE;
      path.push(i);
    } while (i !== o.to);
  } else {
    do {
      i = (i + BOARD_SIZE - 1) % BOARD_SIZE;
      path.push(i);
    } while (i !== o.to);
  }
  const stepMs = Math.max(90, Math.min(TIMING.stepMs, Math.floor(TIMING.maxMoveMs / path.length)));
  s.movement = {
    playerId: p.id,
    from: p.position,
    to: o.to,
    path,
    startsAt: now,
    endsAt: now + path.length * stepMs,
    stepMs,
    collectGo: o.collectGo && o.direction === 'forward' && path.includes(0),
    reason: o.reason,
    seq: ++s.counters.move,
  };
  s.phase = 'moving';
  s.pending = null;
}

export function sendToJail(s: GameState, p: Player, why: string): void {
  p.position = JAIL_INDEX;
  p.inJail = true;
  p.jailTurns = 0;
  s.movement = null;
  s.pending = null;
  s.phase = 'turn_end';
  pushLog(s, `${p.name} va alla Pausa organizzativa (${why}).`, 'jail', p.id);
}

export function releaseFromJail(p: Player): void {
  p.inJail = false;
  p.jailTurns = 0;
}

// ------------------------------------------------------------------ chiusura delle risoluzioni

/** Se nulla è in sospeso dopo un'azione, chiude la risoluzione della casella/carta. */
export function settleFlow(s: GameState, now: number): void {
  if ((s.phase === 'resolving' || s.phase === 'card_resolution') && !s.pending) finishResolution(s, now);
}

/** Tutto risolto: lancio extra dopo un doppio oppure fine del movimento del turno. */
export function finishResolution(s: GameState, now: number): void {
  s.pending = null;
  s.movement = null;
  const p = s.currentPlayerId ? getPlayer(s, s.currentPlayerId) : null;
  if (!p || p.bankrupt) {
    advanceTurn(s, now);
    return;
  }
  const r = s.roll;
  if (r && r.playerId === p.id && r.isDouble && r.extraAllowed && !p.inJail) {
    s.phase = 'turn_start';
    pushLog(s, `${p.name} ha fatto un doppio e può lanciare ancora.`, 'roll', p.id);
    return;
  }
  s.phase = 'turn_end';
}

// ------------------------------------------------------------------ turni

export function advanceTurn(s: GameState, now: number): void {
  if (checkVictory(s)) return;
  const order = s.turnOrder;
  let idx = Math.max(0, order.indexOf(s.currentPlayerId ?? ''));
  for (let guard = 0; guard < order.length * 3 + 3; guard++) {
    idx = (idx + 1) % order.length;
    if (idx === 0) {
      s.round++;
      if (s.timeUp) {
        endGame(s, 'time');
        return;
      }
    }
    const cand = getPlayer(s, order[idx]);
    if (cand.bankrupt) continue;
    if (cand.skipTurn) {
      cand.skipTurn = false;
      pushLog(s, `${cand.name} salta questo turno.`, 'info', cand.id);
      continue;
    }
    s.currentPlayerId = cand.id;
    s.doublesCount = 0;
    s.turnNumber++;
    s.pending = null;
    s.movement = null;
    s.phase = cand.inJail ? 'jail' : 'turn_start';
    pushLog(s, `Tocca a ${cand.name}.`, 'info', cand.id);
    return;
  }
  // nessun giocatore disponibile (non dovrebbe accadere)
  endGame(s, 'last_standing');
}

export function checkVictory(s: GameState): boolean {
  if (s.phase === 'lobby' || s.phase === 'game_over') return false;
  if (activePlayers(s).length <= 1) {
    endGame(s, 'last_standing');
    return true;
  }
  return false;
}

export function buildStandings(s: GameState, reason: 'last_standing' | 'time' | 'host'): Standing[] {
  const active = activePlayers(s)
    .slice()
    .sort((a, b) => netWorth(s, b.id) - netWorth(s, a.id) || b.cash - a.cash);
  const out = s.players
    .filter((p) => p.bankrupt)
    .sort((a, b) => (b.bankruptAtTurn ?? 0) - (a.bankruptAtTurn ?? 0));
  const ranking = [...active, ...out];
  void reason;
  return ranking.map((p, i) => {
    const dev = developmentCounts(s, p.id);
    return {
      playerId: p.id,
      name: p.name,
      place: i + 1,
      netWorth: netWorth(s, p.id),
      cash: p.cash,
      properties: ownedSquares(s, p.id).length,
      developments: dev.visits + dev.studies,
      income: p.stats.income,
      expenses: p.stats.expenses,
      bankrupt: p.bankrupt,
    };
  });
}

export function endGame(s: GameState, reason: 'last_standing' | 'time' | 'host'): void {
  const standings = buildStandings(s, reason);
  for (const st of standings) getPlayer(s, st.playerId).place = st.place;
  const winner = standings[0] ? standings[0].playerId : null;
  s.summary = {
    winnerId: winner,
    reason,
    durationMs: elapsedMs(s, s.hostTime),
    turns: s.turnNumber,
    standings,
  };
  s.winnerId = winner;
  s.phase = 'game_over';
  s.pending = null;
  s.auction = null;
  s.movement = null;
  s.paused = null;
  const w = winner ? getPlayer(s, winner) : null;
  pushLog(
    s,
    reason === 'last_standing'
      ? `Partita terminata: ${w?.name} è l'ultimo giocatore in gioco. Complimenti per la bella partita!`
      : reason === 'time'
        ? `Tempo scaduto: vince ${w?.name} con il patrimonio più alto. Complimenti per la bella partita!`
        : `Partita terminata dal conduttore. In testa: ${w?.name}.`,
    'system',
    winner ?? undefined,
  );
}

// ------------------------------------------------------------------ pagamenti e debiti

/**
 * Tenta di far pagare `items` al giocatore.
 * Se ha le Ore necessarie esegue tutti i trasferimenti, altrimenti apre la procedura di debito.
 */
export function chargePlayer(s: GameState, p: Player, items: DebtItem[], then: DebtThen, now: number): 'paid' | 'debt' {
  const live = items.filter((i) => i.amount > 0);
  const total = sum(live.map((i) => i.amount));
  if (total <= 0) {
    runThen(s, p, then, now);
    return 'paid';
  }
  if (p.cash >= total) {
    for (const it of live) transfer(s, p.id, it.to, it.amount, it.category, it.reason, it.square);
    runThen(s, p, then, now);
    return 'paid';
  }
  s.pending = { kind: 'debt', debtorId: p.id, items: live, then };
  s.phase = 'debt';
  pushLog(
    s,
    `${p.name} deve ${fmt(total)} ma ha ${fmt(p.cash)}: può vendere sviluppi, ipotecare o chiedere uno scambio; altrimenti dichiara bancarotta.`,
    'money',
    p.id,
  );
  return 'debt';
}

/** Prosegue il flusso dopo che un pagamento è stato completato */
export function runThen(s: GameState, p: Player, then: DebtThen, now: number): void {
  switch (then.kind) {
    case 'finish':
      s.pending = null;
      if (s.phase === 'debt') s.phase = 'resolving';
      break;
    case 'jail_released':
      releaseFromJail(p);
      s.pending = null;
      s.phase = 'turn_start';
      pushLog(s, `${p.name} esce dalla Pausa organizzativa.`, 'jail', p.id);
      break;
    case 'jail_move':
      releaseFromJail(p);
      s.pending = null;
      if (s.roll) s.roll.extraAllowed = false;
      pushLog(s, `${p.name} esce dalla Pausa organizzativa e si muove.`, 'jail', p.id);
      startMovement(s, p, { to: (p.position + then.total) % BOARD_SIZE, direction: 'forward', collectGo: true, reason: 'jail' }, now);
      break;
  }
}

/** Dopo ogni operazione che aumenta le Ore del debitore: se può pagare, salda il debito */
export function settleDebt(s: GameState, now: number): void {
  if (s.phase !== 'debt' || s.pending?.kind !== 'debt') return;
  const debt = s.pending;
  const p = getPlayer(s, debt.debtorId);
  const total = sum(debt.items.map((i) => i.amount));
  if (p.cash < total) return;
  for (const it of debt.items) transfer(s, p.id, it.to, it.amount, it.category, it.reason, it.square);
  pushLog(s, `${p.name} ha saldato il debito di ${fmt(total)}.`, 'money', p.id);
  runThen(s, p, debt.then, now);
}
