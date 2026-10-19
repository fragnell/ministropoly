/**
 * Bancarotta.
 *
 * Procedura (esplicita e coerente):
 *  1. Tutti gli sviluppi del giocatore vengono venduti alla banca al 50% e i segnalini tornano alla banca;
 *     il ricavato si aggiunge alle Ore del giocatore.
 *  2. Debito verso UN altro giocatore: le Ore rimaste e tutte le proprietà passano al creditore
 *     (le ipoteche restano com'erano).
 *  3. Debito verso più giocatori (es. carta "Spese condivise"): le Ore sono ripartite in proporzione al
 *     credito di ciascuno e le proprietà tornano libere nella banca.
 *  4. Debito verso la banca: Ore e proprietà tornano alla banca (proprietà libere, senza ipoteche né sviluppi).
 *  5. Le carte conservate tornano nei mazzi, le proposte di scambio del giocatore vengono annullate,
 *     il giocatore esce dalla partita e il turno passa al successivo (o la partita termina).
 */
import { getCard } from '../config/cards';
import type { GameState, Player, PlayerId } from './types';
import { advanceTurn, checkVictory } from './flow';
import { pushLog, transfer } from './money';
import { developmentValue, getPlayer, liquidationPotential, ownedSquares } from './selectors';
import { fail, fmt, sum } from './util';

export function canDeclareBankruptcy(s: GameState, pid: PlayerId): { ok: true } | { ok: false; reason: string } {
  if (s.phase !== 'debt' || s.pending?.kind !== 'debt' || s.pending.debtorId !== pid) {
    return { ok: false, reason: 'Non hai debiti da saldare' };
  }
  const total = sum(s.pending.items.map((i) => i.amount));
  if (liquidationPotential(s, pid) >= total) {
    return { ok: false, reason: 'Puoi ancora saldare il debito vendendo sviluppi o ipotecando proprietà' };
  }
  return { ok: true };
}

export function declareBankruptcy(s: GameState, p: Player, now: number): void {
  if (p.bankrupt) fail('Il giocatore è già in bancarotta');
  const debt = s.pending?.kind === 'debt' && s.pending.debtorId === p.id ? s.pending : null;

  // creditori (giocatori ancora in gioco)
  const creditorAmounts = new Map<PlayerId, number>();
  if (debt) {
    for (const it of debt.items) {
      if (it.to !== 'bank' && it.to !== p.id && !getPlayer(s, it.to).bankrupt) {
        creditorAmounts.set(it.to, (creditorAmounts.get(it.to) ?? 0) + it.amount);
      }
    }
  }

  // 1. vendita degli sviluppi
  let devCash = 0;
  for (const i of ownedSquares(s, p.id)) {
    const st = s.props[String(i)];
    if (st.level <= 0) continue;
    devCash += developmentValue(i, st.level);
    if (st.level === 5) s.bank.studies += 1;
    else s.bank.visits += st.level;
    st.level = 0;
  }
  if (devCash > 0) {
    transfer(s, 'bank', p.id, devCash, 'bankruptcy', 'Sviluppi venduti alla banca per la bancarotta');
    pushLog(s, `Gli sviluppi di ${p.name} sono stati venduti alla banca per ${fmt(devCash)}.`, 'bankruptcy', p.id);
  }

  const owned = ownedSquares(s, p.id);
  const creditors = [...creditorAmounts.keys()];

  if (creditors.length === 1) {
    const cid = creditors[0];
    const c = getPlayer(s, cid);
    if (p.cash > 0) transfer(s, p.id, cid, p.cash, 'bankruptcy', `Bancarotta di ${p.name}`);
    for (const i of owned) s.props[String(i)].owner = cid;
    pushLog(s, `${p.name} è in bancarotta: Ore e ${owned.length} proprietà passano a ${c.name}.`, 'bankruptcy', p.id);
  } else if (creditors.length > 1) {
    const totalOwed = sum([...creditorAmounts.values()]);
    let remaining = p.cash;
    creditors.forEach((cid, k) => {
      const share = k === creditors.length - 1 ? remaining : Math.floor((p.cash * (creditorAmounts.get(cid) as number)) / totalOwed);
      const pay = Math.min(share, remaining);
      if (pay > 0) transfer(s, p.id, cid, pay, 'bankruptcy', `Bancarotta di ${p.name}`);
      remaining -= pay;
    });
    if (p.cash > 0) transfer(s, p.id, 'bank', p.cash, 'bankruptcy', `Bancarotta di ${p.name}`);
    for (const i of owned) Object.assign(s.props[String(i)], { owner: null, mortgaged: false, level: 0 });
    pushLog(s, `${p.name} è in bancarotta: le Ore sono ripartite tra i creditori e le proprietà tornano libere.`, 'bankruptcy', p.id);
  } else {
    if (p.cash > 0) transfer(s, p.id, 'bank', p.cash, 'bankruptcy', `Bancarotta di ${p.name}`);
    for (const i of owned) Object.assign(s.props[String(i)], { owner: null, mortgaged: false, level: 0 });
    pushLog(s, `${p.name} è in bancarotta: le proprietà tornano libere sul mercato.`, 'bankruptcy', p.id);
  }

  // carte conservate: tornano nei mazzi
  for (const id of p.heldCards) s.decks[getCard(id).deck].discard.push(id);
  p.heldCards = [];

  // scambi del giocatore annullati
  for (const t of s.trades) {
    if (t.status === 'pending' && (t.from === p.id || t.to === p.id)) {
      t.status = 'invalid';
      t.note = `${p.name} è in bancarotta`;
      t.resolvedAt = s.hostTime;
    }
  }

  p.bankrupt = true;
  p.cash = 0;
  p.inJail = false;
  p.nextDevDiscount = 0;
  p.bankruptAtTurn = s.turnNumber;
  s.pending = null;
  s.movement = null;

  if (checkVictory(s)) return;
  if (s.currentPlayerId === p.id) advanceTurn(s, now);
}
