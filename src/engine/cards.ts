/**
 * Mazzi di carte: pesca ed esecuzione degli effetti.
 * Gli effetti agiscono realmente sullo stato (Ore, posizione, Pausa, carte conservate, sconti ...).
 */
import { ALL_CARDS, DECK_TITLES, SURPRISE_CARDS, TREASURE_CARDS, getCard, type CardDef, type DeckId } from '../config/cards';
import { BOARD_SIZE, SQUARES } from '../config/board';
import type { DebtItem, GameState, Player } from './types';
import { chargePlayer, sendToJail, startMovement } from './flow';
import { pushLog, transfer } from './money';
import { activePlayers, developmentCounts, fullGroupsOwned, nearestForward, ownedSquares } from './selectors';
import { fmt, shuffle } from './util';

export function initDecks(s: GameState): void {
  s.decks.treasure = { draw: shuffle(s, TREASURE_CARDS.map((c) => c.id)), discard: [] };
  s.decks.surprise = { draw: shuffle(s, SURPRISE_CARDS.map((c) => c.id)), discard: [] };
}

/** Pesca la prima carta del mazzo e la mostra: l'effetto verrà eseguito con ACK_CARD. */
export function drawCard(s: GameState, p: Player, deck: DeckId): void {
  const d = s.decks[deck];
  if (d.draw.length === 0) {
    d.draw = shuffle(s, d.discard);
    d.discard = [];
    if (d.draw.length > 0) pushLog(s, `Il mazzo «${DECK_TITLES[deck]}» è stato rimescolato.`, 'card');
  }
  const cardId = d.draw.shift();
  if (!cardId) {
    pushLog(s, `Il mazzo «${DECK_TITLES[deck]}» è vuoto: nessuna carta da pescare.`, 'card');
    return;
  }
  const card = getCard(cardId);
  s.pending = { kind: 'card', deck, cardId };
  s.phase = 'card_draw';
  s.lastCard = { seq: ++s.counters.card, deck, cardId, playerId: p.id, resolved: false, at: s.hostTime };
  pushLog(s, `${p.name} ha pescato la carta «${card.name}» (${DECK_TITLES[deck]}).`, 'card', p.id);
}

/** Spesa verso la banca: se il giocatore ha la carta "Spesa evitata" può scegliere di usarla. */
export function chargeExpense(s: GameState, p: Player, amount: number, reason: string, now: number, square?: number): void {
  if (amount <= 0) {
    pushLog(s, `${p.name}: nessuna spesa da pagare.`, 'money', p.id);
    return;
  }
  const saved = p.heldCards.find((id) => getCard(id).effect.type === 'hold' && (getCard(id).effect as { kind: string }).kind === 'cancel_expense');
  if (saved) {
    s.pending = { kind: 'expense', amount, reason, square, cardId: saved };
    s.phase = 'resolving';
    return;
  }
  chargePlayer(s, p, [{ to: 'bank', amount, reason, category: square != null ? 'tax' : 'card', square }], { kind: 'finish' }, now);
}

export function returnHeldCard(s: GameState, p: Player, cardId: string): void {
  p.heldCards = p.heldCards.filter((id) => id !== cardId);
  s.decks[getCard(cardId).deck].discard.push(cardId);
}

/** Esegue l'effetto della carta pescata (pending.kind === 'card') */
export function executeCard(s: GameState, p: Player, now: number): void {
  if (s.pending?.kind !== 'card') return;
  const card: CardDef = getCard(s.pending.cardId);
  s.pending = null;
  s.phase = 'card_resolution';
  if (s.lastCard) s.lastCard.resolved = true;
  const e = card.effect;
  let held = false;
  const log = (text: string) => pushLog(s, text, 'card', p.id);

  switch (e.type) {
    case 'gain': {
      transfer(s, 'bank', p.id, e.amount, 'card', card.name);
      log(`${p.name} riceve ${fmt(e.amount)} dalla banca.`);
      break;
    }
    case 'pay_bank': {
      log(`${p.name} deve pagare ${fmt(e.amount)} alla banca.`);
      chargeExpense(s, p, e.amount, card.name, now);
      break;
    }
    case 'pay_each_player': {
      const others = activePlayers(s).filter((o) => o.id !== p.id);
      const items: DebtItem[] = others.map((o) => ({ to: o.id, amount: e.amount, reason: card.name, category: 'card' }));
      log(`${p.name} deve pagare ${fmt(e.amount)} a ciascun altro giocatore.`);
      chargePlayer(s, p, items, { kind: 'finish' }, now);
      break;
    }
    case 'pay_per_property': {
      const n = ownedSquares(s, p.id).length;
      const total = Math.min(e.max, n * e.each);
      log(`${p.name} possiede ${n} proprietà: paga ${fmt(total)}.`);
      chargeExpense(s, p, total, card.name, now);
      break;
    }
    case 'pay_per_development': {
      const d = developmentCounts(s, p.id);
      const total = d.visits * e.perVisit + d.studies * e.perStudy;
      log(`${p.name} ha ${d.visits} visite ulteriori e ${d.studies} studi biblici: paga ${fmt(total)}.`);
      chargeExpense(s, p, total, card.name, now);
      break;
    }
    case 'gain_per': {
      let count = 0;
      if (e.counted === 'developed_streets') count = developmentCounts(s, p.id).developedStreets;
      else if (e.counted === 'special_services') count = ownedSquares(s, p.id).filter((i) => SQUARES[i].kind === 'special').length;
      else count = new Set(ownedSquares(s, p.id).filter((i) => SQUARES[i].kind === 'street').map((i) => SQUARES[i].group)).size;
      const total = Math.min(e.max ?? Infinity, count * e.each);
      if (total > 0) {
        transfer(s, 'bank', p.id, total, 'card', card.name);
        log(`${p.name} riceve ${fmt(total)} (${count} × ${fmt(e.each)}).`);
      } else {
        log(`${p.name} non ha nulla da conteggiare: nessun incasso.`);
      }
      break;
    }
    case 'gain_conditional': {
      const has = fullGroupsOwned(s, p.id).length > 0;
      const amount = has ? e.ifTrue : e.ifFalse;
      transfer(s, 'bank', p.id, amount, 'card', card.name);
      log(`${p.name} ${has ? 'possiede un gruppo completo' : 'non possiede gruppi completi'}: riceve ${fmt(amount)}.`);
      break;
    }
    case 'move_to': {
      log(`${p.name} si sposta verso «${SQUARES[e.target].name}».`);
      startMovement(s, p, { to: e.target, direction: 'forward', collectGo: e.collectGo, reason: 'card' }, now);
      break;
    }
    case 'move_relative': {
      const to = (((p.position + e.steps) % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
      log(`${p.name} ${e.steps > 0 ? 'avanza' : 'torna indietro'} di ${Math.abs(e.steps)} caselle.`);
      startMovement(s, p, { to, direction: e.steps > 0 ? 'forward' : 'backward', collectGo: e.steps > 0, reason: 'card' }, now);
      break;
    }
    case 'move_nearest': {
      const target =
        e.target === 'free_street'
          ? nearestForward(p.position, (sq) => sq.kind === 'street' && s.props[String(sq.index)]?.owner === null)
          : e.target === 'special'
            ? nearestForward(p.position, (sq) => sq.kind === 'special')
            : nearestForward(p.position, (sq) => sq.kind === 'treasure');
      if (target == null) {
        log(`Nessuna destinazione disponibile: la carta non ha effetto.`);
      } else {
        log(`${p.name} si sposta verso «${SQUARES[target].name}».`);
        startMovement(s, p, { to: target, direction: 'forward', collectGo: true, reason: 'card' }, now);
      }
      break;
    }
    case 'go_to_jail': {
      sendToJail(s, p, `carta «${card.name}»`);
      break;
    }
    case 'skip_turn': {
      p.skipTurn = true;
      log(`${p.name} salterà il prossimo turno.`);
      break;
    }
    case 'hold': {
      p.heldCards.push(card.id);
      held = true;
      log(`${p.name} conserva la carta «${card.name}».`);
      break;
    }
    case 'discount_next_development': {
      p.nextDevDiscount = Math.max(p.nextDevDiscount, e.percent);
      log(`${p.name}: il prossimo sviluppo costerà il ${e.percent}% in meno.`);
      break;
    }
  }
  if (!held) s.decks[card.deck].discard.push(card.id);
}

/** Verifica di integrità dei mazzi (usata nei test) */
export function deckIntegrity(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const c of ALL_CARDS) {
    if (ids.has(c.id)) errors.push(`Carta duplicata ${c.id}`);
    ids.add(c.id);
  }
  if (TREASURE_CARDS.length !== 16) errors.push('Il mazzo Probabilità deve avere 16 carte');
  if (SURPRISE_CARDS.length !== 16) errors.push('Il mazzo Imprevisti deve avere 16 carte');
  return errors;
}
