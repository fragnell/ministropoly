/**
 * Lancio dei dadi, arrivo della pedina e risoluzione della casella di destinazione.
 */
import { BOARD_SIZE, SQUARES, squareLabel } from '../config/board';
import { ECONOMY, TIMING } from '../config/game.config';
import type { GameState, Player } from './types';
import { chargeExpense, drawCard } from './cards';
import { chargePlayer, releaseFromJail, sendToJail, settleFlow, startMovement } from './flow';
import { pushLog, transfer } from './money';
import { canChallenge } from './challenge';
import { computeRent, getPlayer } from './selectors';
import { fail, fmt, nextRandom } from './util';

/** Lancia i dadi del giocatore di turno (fase "rolling": animazione dei dadi) */
export function rollDice(s: GameState, p: Player, now: number, forced?: [number, number]): void {
  const d1 = forced ? forced[0] : 1 + Math.floor(nextRandom(s) * 6);
  const d2 = forced ? forced[1] : 1 + Math.floor(nextRandom(s) * 6);
  if (forced) nextRandom(s); // mantiene comunque avanzato il generatore
  s.roll = {
    playerId: p.id,
    dice: [d1, d2],
    total: d1 + d2,
    isDouble: d1 === d2,
    endsAt: now + TIMING.diceMs,
    extraAllowed: !p.inJail,
    seq: ++s.counters.roll,
  };
  s.phase = 'rolling';
  s.pending = null;
  pushLog(s, `${p.name} ha lanciato i dadi: ${d1} + ${d2} = ${d1 + d2}${d1 === d2 ? ' (doppio!)' : ''}.`, 'roll', p.id);
}

/** Fine dell'animazione dei dadi: decide che cosa succede (movimento, Pausa, multa ...) */
export function settleRoll(s: GameState, now: number): void {
  const r = s.roll;
  if (!r) fail('Nessun lancio da risolvere');
  const p = getPlayer(s, r.playerId);

  if (p.inJail) {
    if (r.isDouble) {
      releaseFromJail(p);
      r.extraAllowed = false;
      pushLog(s, `${p.name} ha fatto un doppio ed esce dalla Pausa organizzativa.`, 'jail', p.id);
      startMovement(s, p, { to: (p.position + r.total) % BOARD_SIZE, direction: 'forward', collectGo: true, reason: 'jail' }, now);
      return;
    }
    p.jailTurns++;
    if (p.jailTurns >= ECONOMY.jailMaxAttempts) {
      pushLog(s, `${p.name} non ha ottenuto un doppio al ${ECONOMY.jailMaxAttempts}° tentativo: paga ${fmt(ECONOMY.jailFine)} e si muove.`, 'jail', p.id);
      chargePlayer(
        s,
        p,
        [{ to: 'bank', amount: ECONOMY.jailFine, reason: 'Multa della Pausa organizzativa', category: 'jail' }],
        { kind: 'jail_move', total: r.total },
        now,
      );
      return;
    }
    pushLog(s, `${p.name} non ha ottenuto un doppio (tentativo ${p.jailTurns}/${ECONOMY.jailMaxAttempts}).`, 'jail', p.id);
    s.phase = 'turn_end';
    return;
  }

  if (r.isDouble) {
    s.doublesCount++;
    if (s.doublesCount >= ECONOMY.doublesToJail) {
      sendToJail(s, p, `${ECONOMY.doublesToJail} doppi consecutivi`);
      return;
    }
  }
  startMovement(s, p, { to: (p.position + r.total) % BOARD_SIZE, direction: 'forward', collectGo: true, reason: 'dice' }, now);
}

/** La pedina è arrivata: premio della partenza (se dovuto) e risoluzione della casella */
export function arrive(s: GameState, now: number): void {
  const m = s.movement;
  if (!m) fail('Nessun movimento in corso');
  const p = getPlayer(s, m.playerId);
  p.position = m.to;
  s.movement = null;
  s.phase = 'resolving';
  pushLog(s, `${p.name} è arrivato a «${squareLabel(m.to)}».`, 'move', p.id);
  if (m.collectGo) {
    transfer(s, 'bank', p.id, ECONOMY.goReward, 'go', 'Premio Sala del Regno');
    pushLog(s, `${p.name} riceve ${fmt(ECONOMY.goReward)} passando dalla Sala del Regno.`, 'money', p.id);
  }
  landOn(s, p, now);
  settleFlow(s, now);
}

export function landOn(s: GameState, p: Player, now: number): void {
  const sq = SQUARES[p.position];
  switch (sq.kind) {
    case 'go':
    case 'jail':
    case 'free':
      break;
    case 'gotojail':
      sendToJail(s, p, 'IN PRIGIONE');
      break;
    case 'tax':
      pushLog(s, `${p.name} deve pagare ${fmt(sq.amount ?? 0)} per «${sq.name}».`, 'money', p.id);
      chargeExpense(s, p, sq.amount ?? 0, sq.name, now, sq.index);
      break;
    case 'treasure':
      drawCard(s, p, 'treasure');
      break;
    case 'surprise':
      drawCard(s, p, 'surprise');
      break;
    case 'street':
    case 'special':
    case 'utility':
      propertyLanding(s, p, sq.index);
      break;
  }
}

function propertyLanding(s: GameState, p: Player, index: number): void {
  const st = s.props[String(index)];
  const sq = SQUARES[index];
  if (!st.owner) {
    s.pending = { kind: 'buy', square: index };
    s.phase = 'buy_decision';
    pushLog(s, `«${sq.name}» è libera: ${p.name} può acquistarla per ${fmt(sq.price ?? 0)}.`, 'property', p.id);
    return;
  }
  if (st.owner === p.id) {
    pushLog(s, `${p.name} è su una sua proprietà: nessun contributo.`, 'property', p.id);
    return;
  }
  if (st.mortgaged) {
    pushLog(s, `«${sq.name}» è ipotecata: nessun contributo da pagare.`, 'property', p.id);
    return;
  }
  const quote = computeRent(s, index, s.roll?.total ?? 7);
  if (!quote) return;
  s.pending = {
    kind: 'rent',
    square: index,
    ownerId: quote.ownerId,
    amount: quote.amount,
    formula: quote.formula,
    canChallenge: canChallenge(s),
  };
  s.phase = 'resolving';
  pushLog(s, `${p.name} deve un contributo di ${fmt(quote.amount)} a ${getPlayer(s, quote.ownerId).name} per «${sq.name}».`, 'money', p.id);
}

/** Pagamento del contributo (conferma esplicita del giocatore) */
export function payRent(s: GameState, p: Player, now: number): void {
  const pend = s.pending;
  if (pend?.kind !== 'rent') fail('Nessun contributo da pagare');
  s.pending = null;
  s.phase = 'resolving';
  const owner = getPlayer(s, pend.ownerId);
  chargePlayer(
    s,
    p,
    [{ to: owner.id, amount: pend.amount, reason: `Contributo per ${squareLabel(pend.square)}`, category: 'rent', square: pend.square }],
    { kind: 'finish' },
    now,
  );
  if (s.phase === 'resolving') pushLog(s, `${p.name} ha pagato ${fmt(pend.amount)} a ${owner.name}.`, 'money', p.id);
}

