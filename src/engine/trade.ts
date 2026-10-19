/**
 * Scambi tra giocatori (proprietà + Ore), eseguiti come un'unica transazione atomica.
 *
 * Regole della prima versione:
 *  - nessuno scambio durante un'asta;
 *  - non si scambiano proprietà ipotecate né proprietà di un gruppo che ha sviluppi
 *    (prima si vendono gli sviluppi alla banca);
 *  - la proposta vale come conferma del proponente (dopo la schermata riepilogativa);
 *    il destinatario conferma accettando.
 */
import { squareLabel } from '../config/board';
import type { GameState, Player, PlayerId, Trade, TradeSide } from './types';
import { settleDebt } from './flow';
import { pushLog, transfer } from './money';
import { getPlayer, groupHasDevelopment, propOf } from './selectors';
import { SQUARES } from '../config/board';
import { fail, fmt, isInt } from './util';

const MAX_OPEN_PER_PLAYER = 6;
const KEEP_RESOLVED = 14;

function sideError(s: GameState, owner: Player, side: TradeSide): string | null {
  if (!side || !isInt(side.cash) || side.cash < 0) return 'Importo non valido';
  if (!Array.isArray(side.squares)) return 'Elenco proprietà non valido';
  if (new Set(side.squares).size !== side.squares.length) return 'Proprietà duplicata';
  for (const i of side.squares) {
    if (!isInt(i) || !s.props[String(i)]) return 'Proprietà non valida';
    const st = propOf(s, i);
    const name = squareLabel(i);
    if (st.owner !== owner.id) return `«${name}» non appartiene a ${owner.name}`;
    if (st.mortgaged) return `«${name}» è ipotecata: non può essere scambiata`;
    const sq = SQUARES[i];
    if (sq.kind === 'street' && groupHasDevelopment(s, sq.group as string)) return `Il gruppo di «${name}» ha sviluppi: vendili alla banca prima di scambiare`;
  }
  return null;
}

/** Restituisce il motivo per cui lo scambio non è eseguibile (oppure null) */
export function tradeError(s: GameState, from: Player, to: Player, offer: TradeSide, request: TradeSide): string | null {
  if (from.bankrupt || to.bankrupt) return 'Un giocatore è fuori dalla partita';
  const e1 = sideError(s, from, offer);
  if (e1) return e1;
  const e2 = sideError(s, to, request);
  if (e2) return e2;
  if (from.cash < offer.cash) return `${from.name} non ha ${fmt(offer.cash)}`;
  if (to.cash < request.cash) return `${to.name} non ha ${fmt(request.cash)}`;
  return null;
}

function isEmptySide(x: TradeSide): boolean {
  return x.cash === 0 && x.squares.length === 0;
}

function trimTrades(s: GameState): void {
  const open = s.trades.filter((t) => t.status === 'pending');
  const done = s.trades.filter((t) => t.status !== 'pending').slice(-KEEP_RESOLVED);
  s.trades = [...done, ...open].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

function normalizeSide(x: TradeSide): TradeSide {
  return { cash: x?.cash ?? 0, squares: Array.isArray(x?.squares) ? [...x.squares].sort((a, b) => a - b) : [] };
}

export function proposeTrade(
  s: GameState,
  from: Player,
  toId: PlayerId,
  offerIn: TradeSide,
  requestIn: TradeSide,
  message: string | undefined,
  now: number,
  counterOf?: string,
): Trade {
  if (s.phase === 'lobby' || s.phase === 'game_over') fail('Gli scambi non sono disponibili ora');
  if (s.phase === 'auction') fail('Non si può proporre uno scambio durante un’asta');
  const to = getPlayer(s, toId);
  if (to.id === from.id) fail('Non puoi scambiare con te stesso');
  const offer = normalizeSide(offerIn);
  const request = normalizeSide(requestIn);
  if (isEmptySide(offer) && isEmptySide(request)) fail('Lo scambio è vuoto');
  const err = tradeError(s, from, to, offer, request);
  if (err) fail(err);
  const open = s.trades.filter((t) => t.status === 'pending' && t.from === from.id).length;
  if (open >= MAX_OPEN_PER_PLAYER) fail('Hai già troppe proposte aperte: ritirane qualcuna');
  const t: Trade = {
    id: `t${++s.counters.trade}`,
    from: from.id,
    to: to.id,
    offer,
    request,
    message: message?.trim().slice(0, 140) || undefined,
    status: 'pending',
    createdAt: now,
    counterOf,
  };
  s.trades.push(t);
  trimTrades(s);
  pushLog(s, `${from.name} propone uno scambio a ${to.name}.`, 'trade', from.id);
  return t;
}

function findTrade(s: GameState, id: string): Trade {
  const t = s.trades.find((x) => x.id === id);
  if (!t) fail('Proposta di scambio non trovata');
  if (t.status !== 'pending') fail('La proposta non è più valida');
  return t;
}

function tradeAllowedNow(s: GameState, a: PlayerId, b: PlayerId): boolean {
  if (s.paused) return false;
  if (s.phase === 'turn_start' || s.phase === 'turn_end' || s.phase === 'jail') return true;
  if (s.phase === 'debt' && s.pending?.kind === 'debt') return s.pending.debtorId === a || s.pending.debtorId === b;
  return false;
}

export function acceptTrade(s: GameState, actor: Player, id: string, now: number): void {
  const t = findTrade(s, id);
  if (t.to !== actor.id) fail('Solo il destinatario può accettare');
  if (!tradeAllowedNow(s, t.from, t.to)) fail('Puoi accettare lo scambio tra un’azione e l’altra (non durante un acquisto, un’asta o un pagamento in corso)');
  const from = getPlayer(s, t.from);
  const to = getPlayer(s, t.to);
  const err = tradeError(s, from, to, t.offer, t.request);
  if (err) {
    t.status = 'invalid';
    t.note = err;
    t.resolvedAt = now;
    pushLog(s, `Lo scambio tra ${from.name} e ${to.name} non è più valido: ${err}.`, 'trade');
    return;
  }
  // Esecuzione atomica: se qualcosa fallisce, GameError scarta l'intera bozza
  if (t.offer.cash > 0) transfer(s, from.id, to.id, t.offer.cash, 'trade', `Scambio con ${to.name}`);
  if (t.request.cash > 0) transfer(s, to.id, from.id, t.request.cash, 'trade', `Scambio con ${from.name}`);
  for (const i of t.offer.squares) propOf(s, i).owner = to.id;
  for (const i of t.request.squares) propOf(s, i).owner = from.id;
  t.status = 'accepted';
  t.resolvedAt = now;
  pushLog(s, `Scambio concluso: ${describeSide(from, t.offer)} ⇄ ${describeSide(to, t.request)}.`, 'trade', actor.id);

  // le altre proposte che coinvolgono proprietà o cifre cambiate vengono riverificate
  for (const o of s.trades) {
    if (o.status !== 'pending') continue;
    const of = getPlayer(s, o.from);
    const ot = getPlayer(s, o.to);
    const e = tradeError(s, of, ot, o.offer, o.request);
    if (e) {
      o.status = 'invalid';
      o.note = e;
      o.resolvedAt = now;
    }
  }
  trimTrades(s);
  settleDebt(s, now);
}

function describeSide(p: Player, side: TradeSide): string {
  const parts: string[] = [];
  if (side.cash > 0) parts.push(fmt(side.cash));
  for (const i of side.squares) parts.push(`«${squareLabel(i)}»`);
  return `${p.name}: ${parts.length ? parts.join(' + ') : 'niente'}`;
}

export function declineTrade(s: GameState, actor: Player, id: string, now: number): void {
  const t = findTrade(s, id);
  if (t.to !== actor.id) fail('Solo il destinatario può rifiutare');
  t.status = 'declined';
  t.resolvedAt = now;
  pushLog(s, `${actor.name} rifiuta la proposta di scambio di ${getPlayer(s, t.from).name}.`, 'trade', actor.id);
  trimTrades(s);
}

export function withdrawTrade(s: GameState, actor: Player, id: string, now: number): void {
  const t = findTrade(s, id);
  if (t.from !== actor.id) fail('Solo chi ha proposto può ritirare');
  t.status = 'withdrawn';
  t.resolvedAt = now;
  pushLog(s, `${actor.name} ritira la proposta di scambio.`, 'trade', actor.id);
  trimTrades(s);
}

export function counterTrade(s: GameState, actor: Player, id: string, offer: TradeSide, request: TradeSide, message: string | undefined, now: number): void {
  const t = findTrade(s, id);
  if (t.to !== actor.id) fail('Solo il destinatario può rispondere con una controproposta');
  // `offer` = ciò che il destinatario (ora proponente) cede; `request` = ciò che chiede al proponente originale
  proposeTrade(s, actor, t.from, offer, request, message, now, t.id);
  const orig = s.trades.find((x) => x.id === id);
  if (orig) {
    orig.status = 'countered';
    orig.resolvedAt = now;
  }
  pushLog(s, `${actor.name} risponde con una controproposta.`, 'trade', actor.id);
}
