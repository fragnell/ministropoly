import type { GameState, LedgerCategory, LogKind, Party, PlayerId } from './types';
import { fail, isInt } from './util';
import { getPlayer } from './selectors';

const MAX_LOG = 6000;
const MAX_LEDGER = 6000;

export function pushLog(s: GameState, text: string, kind: LogKind = 'info', playerId?: PlayerId): void {
  s.log.push({ seq: ++s.counters.log, ts: s.hostTime, kind, text, playerId });
  if (s.log.length > MAX_LOG) s.log.splice(0, s.log.length - MAX_LOG);
}

/**
 * UNICO punto in cui cambiano le Ore dei giocatori.
 * Ogni trasferimento produce una voce nel registro con saldo precedente e successivo:
 * non esistono modifiche silenziose del saldo.
 */
export function transfer(s: GameState, from: Party, to: Party, amount: number, category: LedgerCategory, reason: string, square?: number): void {
  if (!isInt(amount) || amount < 0) fail('Importo non valido');
  if (amount === 0) return;
  if (from === to) fail('Pagante e destinatario coincidono');
  const seq = ++s.counters.ledger;
  const entry = { id: `${s.roomCode}-T${seq}`, seq, ts: s.hostTime, from, to, amount, category, reason, square } as GameState['ledger'][number];

  if (from !== 'bank') {
    const p = getPlayer(s, from);
    if (p.cash < amount) fail('Saldo insufficiente');
    entry.fromBefore = p.cash;
    p.cash -= amount;
    entry.fromAfter = p.cash;
    p.stats.expenses += amount;
    if (to === 'bank') p.stats.toBank += amount;
    if (category === 'rent') p.stats.rentOut += amount;
  }
  if (to !== 'bank') {
    const p = getPlayer(s, to);
    entry.toBefore = p.cash;
    p.cash += amount;
    entry.toAfter = p.cash;
    p.stats.income += amount;
    if (from === 'bank') p.stats.fromBank += amount;
    if (category === 'rent') p.stats.rentIn += amount;
  }
  s.ledger.push(entry);
  if (s.ledger.length > MAX_LEDGER) s.ledger.splice(0, s.ledger.length - MAX_LEDGER);
}

export function addNotice(s: GameState, to: string, text: string, level: 'info' | 'error' = 'info'): void {
  s.notices.push({ id: ++s.counters.notice, to, text, level, ts: s.hostTime });
  if (s.notices.length > 12) s.notices.splice(0, s.notices.length - 12);
}
