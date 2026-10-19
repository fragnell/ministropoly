/**
 * Funzioni di lettura (pure): non modificano mai lo stato.
 * Sono usate sia dal motore sia dalle interfacce (per mostrare costi, contributi e azioni disponibili).
 */
import { ECONOMY, GROUPS } from '../config/game.config';
import { BOARD_SIZE, SQUARES, groupIndices, isBuyable, type SquareDef } from '../config/board';
import type { Auction, GameState, Player, PlayerId, PropState } from './types';
import { fail, sum } from './util';

export type Check<T = object> = ({ ok: true } & T) | { ok: false; reason: string };

export function findPlayer(s: GameState, id: PlayerId | null | undefined): Player | undefined {
  if (!id) return undefined;
  return s.players.find((p) => p.id === id);
}

export function getPlayer(s: GameState, id: PlayerId): Player {
  const p = findPlayer(s, id);
  if (!p) fail('Giocatore non trovato');
  return p;
}

export function playerByClient(s: GameState, clientId: string): Player | undefined {
  return s.players.find((p) => p.clientId === clientId);
}

export function activePlayers(s: GameState): Player[] {
  return s.players.filter((p) => !p.bankrupt);
}

export function currentPlayer(s: GameState): Player | undefined {
  return findPlayer(s, s.currentPlayerId);
}

export function propOf(s: GameState, index: number): PropState {
  const p = s.props[String(index)];
  if (!p) fail('Questa casella non è acquistabile');
  return p;
}

export function propKey(index: number): string {
  return String(index);
}

export function squareOf(index: number): SquareDef {
  const sq = SQUARES[index];
  if (!sq) fail('Casella inesistente');
  return sq;
}

export function ownedSquares(s: GameState, pid: PlayerId): number[] {
  return Object.keys(s.props)
    .map(Number)
    .filter((i) => s.props[String(i)].owner === pid)
    .sort((a, b) => a - b);
}

export function ownsFullGroup(s: GameState, pid: PlayerId, groupId: string): boolean {
  const idx = groupIndices(groupId);
  return idx.length > 0 && idx.every((i) => s.props[String(i)]?.owner === pid);
}

export function fullGroupsOwned(s: GameState, pid: PlayerId): string[] {
  return Object.keys(GROUPS).filter((g) => ownsFullGroup(s, pid, g));
}

export function countOwnedOfKind(s: GameState, pid: PlayerId, kind: 'special' | 'utility' | 'street'): number {
  return ownedSquares(s, pid).filter((i) => SQUARES[i].kind === kind).length;
}

export function groupLevels(s: GameState, groupId: string): number[] {
  return groupIndices(groupId).map((i) => s.props[String(i)].level);
}

export function groupHasMortgage(s: GameState, groupId: string): boolean {
  return groupIndices(groupId).some((i) => s.props[String(i)].mortgaged);
}

export function groupHasDevelopment(s: GameState, groupId: string): boolean {
  return groupLevels(s, groupId).some((l) => l > 0);
}

export const LEVEL_LABELS = ['Nessuno sviluppo', '1 visita ulteriore', '2 visite ulteriori', '3 visite ulteriori', '4 visite ulteriori', '1 studio biblico'];

export function levelLabel(level: number): string {
  return LEVEL_LABELS[level] ?? `Livello ${level}`;
}

/** Conta le visite ulteriori e gli studi biblici di un giocatore */
export function developmentCounts(s: GameState, pid: PlayerId): { visits: number; studies: number; developedStreets: number } {
  let visits = 0;
  let studies = 0;
  let developedStreets = 0;
  for (const i of ownedSquares(s, pid)) {
    const lv = s.props[String(i)].level;
    if (lv === 0) continue;
    developedStreets++;
    if (lv === 5) studies++;
    else visits += lv;
  }
  return { visits, studies, developedStreets };
}

// ------------------------------------------------------------------ contributi

export interface RentQuote {
  square: number;
  ownerId: PlayerId;
  amount: number;
  formula: string;
}

/**
 * Calcola il contributo dovuto per una casella posseduta.
 * Restituisce null se la casella è libera o ipotecata (nessun contributo).
 */
export function computeRent(s: GameState, index: number, diceTotal: number): RentQuote | null {
  const sq = SQUARES[index];
  const st = s.props[String(index)];
  if (!sq || !st || !st.owner || st.mortgaged) return null;
  const ownerId = st.owner;

  if (sq.kind === 'street') {
    const R = sq.baseRent as number;
    const mult = ECONOMY.rentMultiplierByLevel;
    if (st.level === 0) {
      if (ownsFullGroup(s, ownerId, sq.group as string)) {
        const m = ECONOMY.completeGroupMultiplier;
        return { square: index, ownerId, amount: m * R, formula: `Gruppo completo senza sviluppi: ${m} × ${R} = ${m * R} Ore` };
      }
      return { square: index, ownerId, amount: R, formula: `Contributo base: ${R} Ore` };
    }
    const m = mult[st.level];
    return { square: index, ownerId, amount: m * R, formula: `${levelLabel(st.level)}: ${m} × ${R} = ${m * R} Ore` };
  }

  if (sq.kind === 'special') {
    const n = countOwnedOfKind(s, ownerId, 'special');
    const amount = ECONOMY.specialServiceRents[n] ?? ECONOMY.specialServiceRents[ECONOMY.specialServiceRents.length - 1];
    return { square: index, ownerId, amount, formula: `${n} serviz${n === 1 ? 'io speciale posseduto' : 'i speciali posseduti'}: ${amount} Ore` };
  }

  if (sq.kind === 'utility') {
    const n = countOwnedOfKind(s, ownerId, 'utility');
    const m = n >= 2 ? ECONOMY.diceServiceMultipliers.both : ECONOMY.diceServiceMultipliers.one;
    return {
      square: index,
      ownerId,
      amount: m * diceTotal,
      formula: `${n === 1 ? 'Un servizio a dadi' : 'Entrambi i servizi a dadi'}: ${m} × ${diceTotal} (dadi) = ${m * diceTotal} Ore`,
    };
  }
  return null;
}

/** Tabella informativa dei contributi di una via, per la scheda dettagliata */
export function rentTable(index: number): { label: string; amount: number }[] {
  const sq = SQUARES[index];
  if (sq?.kind === 'street') {
    const R = sq.baseRent as number;
    return [
      { label: 'Proprietà non sviluppata', amount: R },
      { label: 'Gruppo completo (senza sviluppi)', amount: R * ECONOMY.completeGroupMultiplier },
      ...[1, 2, 3, 4].map((n) => ({ label: levelLabel(n), amount: R * ECONOMY.rentMultiplierByLevel[n] })),
      { label: levelLabel(5), amount: R * ECONOMY.rentMultiplierByLevel[5] },
    ];
  }
  if (sq?.kind === 'special') {
    return [1, 2, 3, 4].map((n) => ({ label: `${n} serviz${n === 1 ? 'io posseduto' : 'i posseduti'}`, amount: ECONOMY.specialServiceRents[n] }));
  }
  if (sq?.kind === 'utility') {
    return [
      { label: 'Un servizio a dadi posseduto', amount: ECONOMY.diceServiceMultipliers.one },
      { label: 'Entrambi i servizi a dadi', amount: ECONOMY.diceServiceMultipliers.both },
    ];
  }
  return [];
}

// ------------------------------------------------------------------ valori

export function mortgageValue(index: number): number {
  const price = SQUARES[index]?.price ?? 0;
  return Math.floor(price * ECONOMY.mortgageRate);
}

export function unmortgageCost(index: number): number {
  return Math.ceil(mortgageValue(index) * (1 + ECONOMY.unmortgageInterestRate));
}

/** Costo complessivamente investito negli sviluppi di una proprietà (4 visite + studio = 5 unità) */
export function developmentInvested(index: number, level: number): number {
  const sq = SQUARES[index];
  if (sq?.kind !== 'street' || level <= 0) return 0;
  const g = GROUPS[sq.group as string];
  if (level <= 4) return level * g.buildCost;
  return 4 * g.buildCost + g.studyCost;
}

export function developmentValue(index: number, level: number): number {
  return Math.floor(developmentInvested(index, level) * ECONOMY.developmentSellRate);
}

/** Valore dei beni usato per la classifica a tempo (e per il patrimonio) */
export function netWorth(s: GameState, pid: PlayerId): number {
  const p = getPlayer(s, pid);
  if (p.bankrupt) return 0;
  let total = p.cash;
  for (const i of ownedSquares(s, pid)) {
    const st = s.props[String(i)];
    const price = SQUARES[i].price ?? 0;
    total += st.mortgaged ? Math.floor(price / 2) : price;
    total += developmentValue(i, st.level);
  }
  return total;
}

/** Quanto potrebbe incassare il giocatore vendendo sviluppi e ipotecando tutto */
export function liquidationPotential(s: GameState, pid: PlayerId): number {
  const p = getPlayer(s, pid);
  let total = p.cash;
  for (const i of ownedSquares(s, pid)) {
    const st = s.props[String(i)];
    total += developmentValue(i, st.level);
    if (!st.mortgaged) total += mortgageValue(i);
  }
  return total;
}

export interface EconomySnapshot {
  cash: number;
  propertyCount: number;
  originalPrice: number;
  developmentValue: number;
  mortgagedCount: number;
  visits: number;
  studies: number;
  netWorth: number;
  activeDebt: number;
}

export function economySnapshot(s: GameState, pid: PlayerId): EconomySnapshot {
  const p = getPlayer(s, pid);
  const owned = ownedSquares(s, pid);
  const dev = developmentCounts(s, pid);
  const debt = s.pending?.kind === 'debt' && s.pending.debtorId === pid ? sum(s.pending.items.map((i) => i.amount)) : 0;
  return {
    cash: p.cash,
    propertyCount: owned.length,
    originalPrice: sum(owned.map((i) => SQUARES[i].price ?? 0)),
    developmentValue: sum(owned.map((i) => developmentValue(i, s.props[String(i)].level))),
    mortgagedCount: owned.filter((i) => s.props[String(i)].mortgaged).length,
    visits: dev.visits,
    studies: dev.studies,
    netWorth: netWorth(s, pid),
    activeDebt: debt,
  };
}

// ------------------------------------------------------------------ sviluppi

export function developCost(s: GameState, pid: PlayerId, index: number): { kind: 'visit' | 'study'; base: number; cost: number; discount: number } {
  const sq = squareOf(index);
  const g = GROUPS[sq.group as string];
  const st = propOf(s, index);
  const kind = st.level >= ECONOMY.maxVisits ? 'study' : 'visit';
  const base = kind === 'study' ? g.studyCost : g.buildCost;
  const discount = getPlayer(s, pid).nextDevDiscount;
  const cost = Math.ceil(base * (1 - discount / 100));
  return { kind, base, cost, discount };
}

export function canDevelop(s: GameState, pid: PlayerId, index: number): Check<{ kind: 'visit' | 'study'; cost: number }> {
  const sq = SQUARES[index];
  if (!sq || sq.kind !== 'street') return { ok: false, reason: 'Solo le vie possono essere sviluppate' };
  const st = s.props[String(index)];
  if (st.owner !== pid) return { ok: false, reason: 'Non possiedi questa proprietà' };
  const group = sq.group as string;
  if (!ownsFullGroup(s, pid, group)) return { ok: false, reason: 'Devi possedere tutte le proprietà del gruppo' };
  if (groupHasMortgage(s, group)) return { ok: false, reason: 'Una proprietà del gruppo è ipotecata' };
  if (st.level >= 5) return { ok: false, reason: 'Questa proprietà ha già uno studio biblico' };
  const levels = groupLevels(s, group);
  if (st.level > Math.min(...levels)) return { ok: false, reason: 'Sviluppa prima le altre proprietà del gruppo (distribuzione uniforme)' };
  const { kind, cost } = developCost(s, pid, index);
  if (kind === 'visit' && s.bank.visits < 1) return { ok: false, reason: 'Le 32 visite ulteriori sono esaurite' };
  if (kind === 'study' && s.bank.studies < 1) return { ok: false, reason: 'I 12 studi biblici sono esauriti' };
  if (getPlayer(s, pid).cash < cost) return { ok: false, reason: `Servono ${cost} Ore` };
  return { ok: true, kind, cost };
}

export function sellDevelopmentQuote(s: GameState, pid: PlayerId, index: number): Check<{ refund: number; newLevel: number; visitsBack: number; studiesBack: number; visitsTaken: number }> {
  const sq = SQUARES[index];
  if (!sq || sq.kind !== 'street') return { ok: false, reason: 'Solo le vie hanno sviluppi' };
  const st = s.props[String(index)];
  if (st.owner !== pid) return { ok: false, reason: 'Non possiedi questa proprietà' };
  if (st.level <= 0) return { ok: false, reason: 'Nessuno sviluppo da vendere' };
  const group = sq.group as string;
  if (st.level < Math.max(...groupLevels(s, group))) return { ok: false, reason: 'Vendi prima gli sviluppi delle altre proprietà del gruppo (distribuzione uniforme)' };
  const g = GROUPS[group];
  if (st.level <= 4) {
    return { ok: true, refund: Math.floor(g.buildCost * ECONOMY.developmentSellRate), newLevel: st.level - 1, visitsBack: 1, studiesBack: 0, visitsTaken: 0 };
  }
  // Studio biblico: torna a 4 visite se la banca ne ha abbastanza, altrimenti scende al numero disponibile
  const avail = Math.min(ECONOMY.maxVisits, s.bank.visits);
  const missing = ECONOMY.maxVisits - avail;
  const refund = Math.floor(g.studyCost * ECONOMY.developmentSellRate) + Math.floor(g.buildCost * ECONOMY.developmentSellRate) * missing;
  return { ok: true, refund, newLevel: avail, visitsBack: 0, studiesBack: 1, visitsTaken: avail };
}

export function canMortgage(s: GameState, pid: PlayerId, index: number): Check<{ value: number }> {
  if (!isBuyable(index)) return { ok: false, reason: 'Casella non acquistabile' };
  const st = s.props[String(index)];
  if (st.owner !== pid) return { ok: false, reason: 'Non possiedi questa proprietà' };
  if (st.mortgaged) return { ok: false, reason: 'È già ipotecata' };
  const sq = SQUARES[index];
  if (sq.kind === 'street' && groupHasDevelopment(s, sq.group as string)) return { ok: false, reason: 'Vendi prima gli sviluppi del gruppo' };
  return { ok: true, value: mortgageValue(index) };
}

export function canUnmortgage(s: GameState, pid: PlayerId, index: number): Check<{ cost: number }> {
  if (!isBuyable(index)) return { ok: false, reason: 'Casella non acquistabile' };
  const st = s.props[String(index)];
  if (st.owner !== pid) return { ok: false, reason: 'Non possiedi questa proprietà' };
  if (!st.mortgaged) return { ok: false, reason: 'Non è ipotecata' };
  const cost = unmortgageCost(index);
  if (getPlayer(s, pid).cash < cost) return { ok: false, reason: `Servono ${cost} Ore` };
  return { ok: true, cost };
}

// ------------------------------------------------------------------ percorso

/** Prima casella (in avanti, partendo dalla successiva) che soddisfa il predicato */
export function nearestForward(from: number, predicate: (sq: SquareDef) => boolean): number | null {
  for (let step = 1; step <= BOARD_SIZE; step++) {
    const i = (from + step) % BOARD_SIZE;
    if (predicate(SQUARES[i])) return i;
  }
  return null;
}

/** Fasi in cui il giocatore di turno può gestire sviluppi e ipoteche */
export function canManageNow(s: GameState, pid: PlayerId): boolean {
  if (s.paused) return false;
  if (s.currentPlayerId !== pid) return false;
  return s.phase === 'turn_start' || s.phase === 'turn_end' || s.phase === 'jail' || (s.phase === 'debt' && s.pending?.kind === 'debt' && s.pending.debtorId === pid);
}

export function debtTotal(s: GameState): number {
  return s.pending?.kind === 'debt' ? sum(s.pending.items.map((i) => i.amount)) : 0;
}

/** Offerta minima ammessa in questo momento in un'asta */
export function minimumBidOf(a: Auction): number {
  return a.highBidder ? a.highBid + a.minIncrement : a.startingBid;
}

/** Riga descrittiva del contributo attualmente in vigore su una proprietà (formula e risultato) */
export function currentRentLine(s: GameState, index: number): string | null {
  const sq = SQUARES[index];
  const st = s.props[String(index)];
  if (!sq || !st?.owner) return null;
  if (st.mortgaged) return 'Ipotecata: nessun contributo finché resta ipotecata';
  const total = s.roll?.total;
  if (sq.kind === 'utility' && total == null) {
    const n = countOwnedOfKind(s, st.owner, 'utility');
    const m = n >= 2 ? ECONOMY.diceServiceMultipliers.both : ECONOMY.diceServiceMultipliers.one;
    return `${m} × somma dei dadi`;
  }
  const q = computeRent(s, index, total ?? 7);
  return q ? q.formula : null;
}
