/**
 * Acquisto, sviluppi, ipoteche e aste.
 */
import { SQUARES, squareLabel } from '../config/board';
import { ECONOMY } from '../config/game.config';
import type { GameState, Player } from './types';
import { settleDebt } from './flow';
import { pushLog, transfer } from './money';
import {
  activePlayers,
  canDevelop,
  canMortgage,
  canUnmortgage,
  getPlayer,
  minimumBidOf,
  propOf,
  sellDevelopmentQuote,
} from './selectors';
import { fail, fmt, isInt } from './util';

// ------------------------------------------------------------------ acquisto

export function buyProperty(s: GameState, p: Player): void {
  const pend = s.pending;
  if (pend?.kind !== 'buy') fail('Non c’è nessun acquisto in corso');
  const sq = SQUARES[pend.square];
  const price = sq.price ?? 0;
  const st = propOf(s, pend.square);
  if (st.owner) fail('La proprietà è già posseduta');
  if (p.cash < price) fail(`Non hai Ore sufficienti: servono ${fmt(price)}`);
  transfer(s, p.id, 'bank', price, 'purchase', `Acquisto di ${squareLabel(pend.square)}`, pend.square);
  st.owner = p.id; // la proprietà risulta posseduta solo a transazione completata
  p.stats.propertiesBought++;
  s.pending = null;
  s.phase = 'resolving';
  pushLog(s, `«${squareLabel(pend.square)}» è stata acquistata da ${p.name} per ${fmt(price)}.`, 'property', p.id);
}

// ------------------------------------------------------------------ asta

export function startAuction(s: GameState, square: number, now: number): void {
  const seconds = s.settings.auctionSeconds;
  s.auction = {
    square,
    startingBid: ECONOMY.auction.startingBid,
    minIncrement: ECONOMY.auction.minIncrement,
    highBid: 0,
    highBidder: null,
    passed: [],
    startedAt: now,
    endsAt: now + seconds * 1000,
    seconds,
    bids: [],
  };
  s.pending = null;
  s.phase = 'auction';
  pushLog(s, `È stata avviata un’asta per «${squareLabel(square)}».`, 'auction');
}

export function minimumBid(s: GameState): number {
  return s.auction ? minimumBidOf(s.auction) : 0;
}

export function placeBid(s: GameState, p: Player, amount: number, now: number): void {
  const a = s.auction;
  if (s.phase !== 'auction' || !a) fail('Nessuna asta in corso');
  if (p.bankrupt) fail('Sei fuori dalla partita');
  if (a.passed.includes(p.id)) fail('Hai già passato: non puoi rientrare in questa asta');
  if (!isInt(amount)) fail('Offerta non valida');
  if (a.highBidder === p.id) fail('Sei già il miglior offerente');
  const min = minimumBid(s);
  if (amount < min) fail(`L’offerta minima è ${fmt(min)}`);
  if (amount > p.cash) fail('Non puoi offrire più delle Ore che hai');
  a.highBid = amount;
  a.highBidder = p.id;
  a.endsAt = now + a.seconds * 1000;
  a.bids.push({ playerId: p.id, amount, at: now });
  if (a.bids.length > 12) a.bids.shift();
  pushLog(s, `${p.name} offre ${fmt(amount)} per «${squareLabel(a.square)}».`, 'auction', p.id);
}

export function passAuction(s: GameState, p: Player, now: number): void {
  const a = s.auction;
  if (s.phase !== 'auction' || !a) fail('Nessuna asta in corso');
  if (p.bankrupt) fail('Sei fuori dalla partita');
  if (a.passed.includes(p.id)) fail('Hai già passato');
  if (a.highBidder === p.id) fail('Sei il miglior offerente: non puoi passare');
  a.passed.push(p.id);
  pushLog(s, `${p.name} passa.`, 'auction', p.id);
  maybeEndAuction(s, now);
}

/** Termina l'asta se tutti gli altri hanno passato */
export function maybeEndAuction(s: GameState, now: number): void {
  const a = s.auction;
  if (!a) return;
  const eligible = activePlayers(s).filter((p) => !a.passed.includes(p.id));
  const others = eligible.filter((p) => p.id !== a.highBidder);
  if (a.highBidder ? others.length === 0 : eligible.length === 0) endAuction(s, now);
}

export function endAuction(s: GameState, now: number): void {
  void now;
  const a = s.auction;
  if (!a) return;
  const label = squareLabel(a.square);
  if (a.highBidder) {
    const w = getPlayer(s, a.highBidder);
    if (w.cash >= a.highBid) {
      transfer(s, w.id, 'bank', a.highBid, 'auction', `Asta: ${label}`, a.square);
      propOf(s, a.square).owner = w.id;
      w.stats.propertiesBought++;
      pushLog(s, `${w.name} si aggiudica «${label}» all’asta per ${fmt(a.highBid)}.`, 'auction', w.id);
    } else {
      pushLog(s, `L’offerta di ${w.name} non può essere onorata: «${label}» resta libera.`, 'auction', w.id);
    }
  } else {
    pushLog(s, `Nessuna offerta valida: «${label}» resta libera.`, 'auction');
  }
  s.auction = null;
  s.phase = 'resolving';
  s.pending = null;
}

// ------------------------------------------------------------------ sviluppi e ipoteche

function requireManagePhase(s: GameState, allowDebt: boolean): void {
  const ok = s.phase === 'turn_start' || s.phase === 'turn_end' || s.phase === 'jail' || (allowDebt && s.phase === 'debt');
  if (!ok) fail('In questo momento non puoi gestire le proprietà');
}

export function develop(s: GameState, p: Player, index: number): void {
  requireManagePhase(s, false);
  const chk = canDevelop(s, p.id, index);
  if (!chk.ok) fail(chk.reason);
  const st = propOf(s, index);
  const sq = SQUARES[index];
  transfer(s, p.id, 'bank', chk.cost, 'development', `${chk.kind === 'visit' ? 'Visita ulteriore' : 'Studio biblico'} a ${squareLabel(index)}`, index);
  if (chk.kind === 'visit') {
    s.bank.visits -= 1;
    st.level += 1;
  } else {
    s.bank.studies -= 1;
    s.bank.visits += ECONOMY.maxVisits; // le quattro visite tornano alla banca
    st.level = 5;
  }
  p.nextDevDiscount = 0;
  p.stats.developmentsBuilt++;
  pushLog(
    s,
    chk.kind === 'visit'
      ? `${p.name} aggiunge una visita ulteriore a «${sq.name}» (${st.level}/4) per ${fmt(chk.cost)}.`
      : `${p.name} installa uno studio biblico a «${sq.name}» per ${fmt(chk.cost)}.`,
    'property',
    p.id,
  );
}

export function sellDevelopment(s: GameState, p: Player, index: number, now: number): void {
  requireManagePhase(s, true);
  const q = sellDevelopmentQuote(s, p.id, index);
  if (!q.ok) fail(q.reason);
  const st = propOf(s, index);
  transfer(s, 'bank', p.id, q.refund, 'sale', `Vendita sviluppo a ${squareLabel(index)}`, index);
  if (st.level === 5) {
    s.bank.studies += 1;
    s.bank.visits -= q.visitsTaken;
  } else {
    s.bank.visits += 1;
  }
  st.level = q.newLevel;
  pushLog(s, `${p.name} vende uno sviluppo di «${SQUARES[index].name}» alla banca per ${fmt(q.refund)}.`, 'property', p.id);
  settleDebt(s, now);
}

export function mortgage(s: GameState, p: Player, index: number, now: number): void {
  requireManagePhase(s, true);
  const chk = canMortgage(s, p.id, index);
  if (!chk.ok) fail(chk.reason);
  transfer(s, 'bank', p.id, chk.value, 'mortgage', `Ipoteca di ${squareLabel(index)}`, index);
  propOf(s, index).mortgaged = true;
  pushLog(s, `${p.name} ipoteca «${squareLabel(index)}» e riceve ${fmt(chk.value)}.`, 'property', p.id);
  settleDebt(s, now);
}

export function unmortgage(s: GameState, p: Player, index: number): void {
  requireManagePhase(s, false);
  const chk = canUnmortgage(s, p.id, index);
  if (!chk.ok) fail(chk.reason);
  transfer(s, p.id, 'bank', chk.cost, 'unmortgage', `Riscatto ipoteca di ${squareLabel(index)}`, index);
  propOf(s, index).mortgaged = false;
  pushLog(s, `${p.name} libera l’ipoteca di «${squareLabel(index)}» pagando ${fmt(chk.cost)}.`, 'property', p.id);
}
