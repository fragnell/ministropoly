/**
 * Giocatori virtuali (bot) e politica di gioco semplice.
 * Servono per provare il gioco da soli e come motore delle simulazioni automatiche nei test.
 * Il bot compie solo azioni legali, validate dallo stesso motore dei giocatori umani.
 */
import { SQUARES, groupIndices } from '../config/board';
import { getCard } from '../config/cards';
import { GROUP_ORDER } from '../config/game.config';
import type { Action } from './actions';
import type { GameState, Player, Trade } from './types';
import { canDeclareBankruptcy } from './bankruptcy';
import { minimumBid } from './property';
import { canDevelop, canMortgage, canUnmortgage, mortgageValue, ownedSquares, ownsFullGroup, sellDevelopmentQuote, unmortgageCost } from './selectors';

export type Rand = () => number;

const priceOf = (i: number) => SQUARES[i].price ?? 0;

export function decide(s: GameState, p: Player, rand: Rand): Action | null {
  if (s.paused || p.bankrupt || s.phase === 'lobby' || s.phase === 'game_over') return null;
  const cur = s.currentPlayerId === p.id;

  const incoming = s.trades.find((t) => t.status === 'pending' && t.to === p.id);
  if (incoming && tradeAnswerable(s, incoming)) return tradeResponse(p, incoming);

  switch (s.phase) {
    case 'auction':
      return auctionDecision(s, p, rand);
    case 'turn_start':
      return cur ? { type: 'ROLL_DICE' } : null;
    case 'jail': {
      if (!cur) return null;
      if (p.heldCards.some((id) => getCard(id).effect.type === 'hold' && (getCard(id).effect as { kind: string }).kind === 'jail_free')) return { type: 'USE_JAIL_CARD' };
      if (p.cash >= 500 && rand() < 0.6) return { type: 'PAY_JAIL_FINE' };
      return { type: 'ROLL_DICE' };
    }
    case 'buy_decision': {
      if (!cur || s.pending?.kind !== 'buy') return null;
      const target = s.pending.square;
      const price = priceOf(target);
      const group = SQUARES[target].group;
      const completes = group ? groupIndices(group).filter((i) => i !== target).every((i) => s.props[String(i)].owner === p.id) : false;
      const reserve = completes ? 0 : 120;
      return p.cash - price >= reserve ? { type: 'BUY_PROPERTY' } : { type: 'DECLINE_PROPERTY' };
    }
    case 'resolving': {
      if (!cur) return null;
      const pend = s.pending;
      if (pend?.kind === 'rent') return { type: 'PAY_RENT' };
      if (pend?.kind === 'expense') return pend.amount >= 100 ? { type: 'USE_SAVED_CARD' } : { type: 'PAY_EXPENSE' };
      return null; // sfide: le valuta una persona (proprietario o conduttore)
    }
    case 'card_draw':
      return cur ? { type: 'ACK_CARD' } : null;
    case 'debt':
      return s.pending?.kind === 'debt' && s.pending.debtorId === p.id ? debtDecision(s, p) : null;
    case 'turn_end':
      return cur ? manageDecision(s, p) : null;
    default:
      return null;
  }
}

function auctionDecision(s: GameState, p: Player, rand: Rand): Action | null {
  const a = s.auction;
  if (!a || a.passed.includes(p.id) || a.highBidder === p.id) return null;
  const sq = SQUARES[a.square];
  const price = sq.price ?? 0;
  const group = sq.group;
  const completes = group ? groupIndices(group).filter((i) => i !== a.square).every((i) => s.props[String(i)].owner === p.id) : false;
  const value = Math.floor(price * (0.55 + rand() * 0.5) * (completes ? 1.5 : 1));
  const cap = Math.min(value, p.cash - 20);
  const min = minimumBid(s);
  if (min <= cap && rand() < 0.85) {
    const bid = Math.min(cap, min + Math.floor(rand() * 3) * a.minIncrement);
    return { type: 'BID', amount: Math.max(min, bid) };
  }
  return { type: 'PASS_AUCTION' };
}

function debtDecision(s: GameState, p: Player): Action | null {
  if (canDeclareBankruptcy(s, p.id).ok) return { type: 'DECLARE_BANKRUPTCY' };
  const owned = ownedSquares(s, p.id);
  // 1) vendere sviluppi (dalle proprietà con il livello più alto)
  const sellable = owned
    .filter((i) => s.props[String(i)].level > 0 && sellDevelopmentQuote(s, p.id, i).ok)
    .sort((a, b) => s.props[String(b)].level - s.props[String(a)].level);
  if (sellable.length) return { type: 'SELL_DEVELOPMENT', square: sellable[0] };
  // 2) ipotecare la proprietà di maggior valore
  const mortgageable = owned.filter((i) => canMortgage(s, p.id, i).ok).sort((a, b) => mortgageValue(b) - mortgageValue(a));
  if (mortgageable.length) return { type: 'MORTGAGE', square: mortgageable[0] };
  return { type: 'DECLARE_BANKRUPTCY' };
}

/** Si può rispondere a uno scambio solo tra un'azione e l'altra */
export function tradeAnswerable(s: GameState, t: Trade): boolean {
  if (s.paused) return false;
  if (s.phase === 'turn_start' || s.phase === 'turn_end' || s.phase === 'jail') return true;
  return s.phase === 'debt' && s.pending?.kind === 'debt' && (s.pending.debtorId === t.from || s.pending.debtorId === t.to);
}

/** Il bot accetta se riceve nettamente più valore di quanto cede */
function tradeResponse(p: Player, t: Trade): Action {
  const valueIn = t.offer.cash + t.offer.squares.reduce((a, i) => a + priceOf(i), 0);
  const valueOut = t.request.cash + t.request.squares.reduce((a, i) => a + priceOf(i), 0);
  const cashAfter = p.cash - t.request.cash + t.offer.cash;
  return valueIn >= valueOut * 1.3 && cashAfter >= 100 ? { type: 'ACCEPT_TRADE', id: t.id } : { type: 'DECLINE_TRADE', id: t.id };
}

/** Per completare un gruppo il bot offre il doppio del prezzo dell'ultima proprietà mancante */
function tradeProposal(s: GameState, p: Player): Action | null {
  if (s.trades.some((t) => t.status === 'pending' && t.from === p.id)) return null;
  if (p.cash < 400) return null;
  for (const g of GROUP_ORDER) {
    const idx = groupIndices(g);
    const missing = idx.filter((i) => s.props[String(i)].owner !== p.id);
    if (missing.length !== 1) continue;
    const sq = missing[0];
    const st = s.props[String(sq)];
    if (!st.owner || st.mortgaged) continue;
    if (idx.some((i) => s.props[String(i)].level > 0)) continue;
    const offerCash = Math.min(p.cash - 250, priceOf(sq) * 2);
    if (offerCash < priceOf(sq) * 1.3) continue;
    return { type: 'PROPOSE_TRADE', to: st.owner, offer: { cash: offerCash, squares: [] }, request: { cash: 0, squares: [sq] }, message: 'Mi serve per completare il gruppo' };
  }
  return null;
}

function manageDecision(s: GameState, p: Player): Action {
  const owned = ownedSquares(s, p.id);
  // riscatta ipoteche se ha molte Ore
  const un = owned.filter((i) => s.props[String(i)].mortgaged && canUnmortgage(s, p.id, i).ok && p.cash - unmortgageCost(i) >= 400);
  if (un.length) return { type: 'UNMORTGAGE', square: un[0] };
  // sviluppa la via più economica mantenendo una riserva
  const dev = owned
    .filter((i) => SQUARES[i].kind === 'street' && ownsFullGroup(s, p.id, SQUARES[i].group as string))
    .map((i) => ({ i, chk: canDevelop(s, p.id, i) }))
    .filter((x): x is { i: number; chk: { ok: true; kind: 'visit' | 'study'; cost: number } } => x.chk.ok && p.cash - x.chk.cost >= 150)
    .sort((a, b) => a.chk.cost - b.chk.cost || s.props[String(a.i)].level - s.props[String(b.i)].level);
  if (dev.length) return { type: 'DEVELOP', square: dev[0].i };
  const proposal = tradeProposal(s, p);
  if (proposal) return proposal;
  return { type: 'END_TURN' };
}

/** Prossima mossa disponibile tra i giocatori indicati (bot o tutti) */
export function nextMove(s: GameState, rand: Rand, onlyBots: boolean): { player: Player; action: Action } | null {
  // 1) chi ha ricevuto una proposta di scambio risponde subito (quando è consentito)
  if (s.phase !== 'auction') {
    for (const p of s.players) {
      if (onlyBots && !p.isBot) continue;
      if (p.bankrupt) continue;
      const incoming = s.trades.find((t) => t.status === 'pending' && t.to === p.id);
      if (incoming && tradeAnswerable(s, incoming) && !s.paused) return { player: p, action: tradeResponse(p, incoming) };
    }
  }
  const order = s.players.slice();
  // il giocatore di turno ha la precedenza, poi gli altri
  order.sort((a, b) => Number(b.id === s.currentPlayerId) - Number(a.id === s.currentPlayerId));
  for (const p of order) {
    if (onlyBots && !p.isBot) continue;
    const action = decide(s, p, rand);
    if (action) return { player: p, action };
  }
  return null;
}
