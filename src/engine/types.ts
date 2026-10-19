import type { DeckId } from '../config/cards';

export type PlayerId = string;
export type Party = PlayerId | 'bank';

/**
 * Stati del motore a stati.
 * - lobby: sala d'attesa
 * - turn_start: il giocatore di turno deve lanciare i dadi (anche per un lancio extra dopo un doppio)
 * - rolling: i dadi sono stati lanciati (animazione dei dadi)
 * - moving: la pedina si sta muovendo
 * - resolving: risoluzione della casella (contributo da pagare, sfida, spesa con carta "Spesa evitata")
 * - buy_decision: decisione d'acquisto
 * - auction: asta in corso
 * - card_draw: carta pescata, in attesa che il giocatore la esegua
 * - card_resolution: esecuzione dell'effetto (transitorio, dentro la stessa azione)
 * - debt: gestione di un debito (vendite, ipoteche, scambi, bancarotta)
 * - jail: Pausa organizzativa (il giocatore di turno è in attesa)
 * - turn_end: movimento e casella risolti; il giocatore può gestire proprietà/scambi e poi chiude il turno
 * - game_over: partita terminata
 * - development / trade: modalità di interfaccia disponibili in turn_start, turn_end e jail
 *   (sviluppo delle proprietà e scambi): non sono fasi persistenti perché non bloccano il turno.
 */
export type Phase =
  | 'lobby'
  | 'turn_start'
  | 'rolling'
  | 'moving'
  | 'resolving'
  | 'buy_decision'
  | 'auction'
  | 'card_draw'
  | 'card_resolution'
  | 'debt'
  | 'development'
  | 'trade'
  | 'jail'
  | 'turn_end'
  | 'game_over';

export type LedgerCategory =
  | 'go' // premio Sala del Regno
  | 'purchase' // acquisto di una proprietà
  | 'auction' // acquisto all'asta
  | 'rent' // contributi
  | 'tax' // caselle spesa
  | 'card' // effetti delle carte
  | 'development' // acquisto sviluppi
  | 'sale' // vendita sviluppi alla banca
  | 'mortgage' // ipoteca
  | 'unmortgage' // riscatto ipoteca
  | 'trade' // scambi tra giocatori
  | 'jail' // multa della Pausa organizzativa
  | 'bankruptcy' // trasferimenti per bancarotta
  | 'adjustment'; // rettifica del conduttore

export interface PlayerStats {
  /** totale incassato (da chiunque) */
  income: number;
  /** totale pagato (a chiunque) */
  expenses: number;
  /** incassato dalla banca */
  fromBank: number;
  /** pagato alla banca */
  toBank: number;
  /** contributi incassati dagli avversari */
  rentIn: number;
  /** contributi pagati agli avversari */
  rentOut: number;
  developmentsBuilt: number;
  propertiesBought: number;
}

export interface Player {
  id: PlayerId;
  /** dispositivo associato (uid anonimo o identificativo casuale); null se il posto è libero */
  clientId: string | null;
  name: string;
  token: string;
  color: string;
  /** profilo per le sfide: adulto o bambino */
  profile: 'adult' | 'kid';
  isBot: boolean;
  cash: number;
  position: number;
  inJail: boolean;
  /** tentativi di doppio falliti nella Pausa organizzativa */
  jailTurns: number;
  bankrupt: boolean;
  connected: boolean;
  skipTurn: boolean;
  /** carte conservate (id) */
  heldCards: string[];
  /** il prossimo sviluppo costa meno (percentuale di sconto) */
  nextDevDiscount: number;
  stats: PlayerStats;
  /** posizione finale in classifica (1 = vincitore) quando la partita termina */
  place?: number;
  bankruptAtTurn?: number;
}

export interface PropState {
  owner: PlayerId | null;
  mortgaged: boolean;
  /** 0 = nessuno sviluppo, 1–4 = visite ulteriori, 5 = studio biblico */
  level: number;
}

export interface GameSettings {
  startingCash: number;
  packs: { publisher: boolean; kids: boolean };
  auctionSeconds: number;
  speedMode: { enabled: boolean; minutes: number };
}

export interface DiceRoll {
  playerId: PlayerId;
  dice: [number, number];
  total: number;
  isDouble: boolean;
  /** fine dell'animazione dei dadi (orario del conduttore) */
  endsAt: number;
  /** se false, un doppio non concede un lancio extra (uscita dalla Pausa con un doppio) */
  extraAllowed: boolean;
  seq: number;
}

export interface Movement {
  playerId: PlayerId;
  from: number;
  to: number;
  /** caselle attraversate, destinazione inclusa */
  path: number[];
  startsAt: number;
  endsAt: number;
  stepMs: number;
  /** vero se all'arrivo va assegnato il premio della Sala del Regno */
  collectGo: boolean;
  reason: 'dice' | 'card' | 'jail';
  seq: number;
}

export interface DebtItem {
  to: Party;
  amount: number;
  reason: string;
  category: LedgerCategory;
  square?: number;
}

export type DebtThen = { kind: 'finish' } | { kind: 'jail_released' } | { kind: 'jail_move'; total: number };

export type Pending =
  | { kind: 'buy'; square: number }
  | {
      kind: 'rent';
      square: number;
      ownerId: PlayerId;
      amount: number;
      formula: string;
      canChallenge: boolean;
    }
  | {
      kind: 'challenge';
      square: number;
      ownerId: PlayerId;
      amount: number;
      questionId: string;
      startedAt: number;
    }
  | { kind: 'expense'; amount: number; reason: string; square?: number; cardId?: string }
  | { kind: 'card'; deck: DeckId; cardId: string }
  | { kind: 'debt'; debtorId: PlayerId; items: DebtItem[]; then: DebtThen };

export interface Auction {
  square: number;
  startingBid: number;
  minIncrement: number;
  highBid: number;
  highBidder: PlayerId | null;
  passed: PlayerId[];
  startedAt: number;
  endsAt: number;
  seconds: number;
  bids: { playerId: PlayerId; amount: number; at: number }[];
}

export interface TradeSide {
  cash: number;
  squares: number[];
}

export type TradeStatus = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'countered' | 'invalid';

export interface Trade {
  id: string;
  from: PlayerId;
  to: PlayerId;
  /** ciò che `from` cede */
  offer: TradeSide;
  /** ciò che `from` chiede a `to` */
  request: TradeSide;
  message?: string;
  status: TradeStatus;
  createdAt: number;
  resolvedAt?: number;
  /** motivo di un eventuale rifiuto automatico */
  note?: string;
  counterOf?: string;
}

export interface DeckState {
  draw: string[];
  discard: string[];
}

export type LogKind =
  | 'info'
  | 'roll'
  | 'move'
  | 'money'
  | 'property'
  | 'card'
  | 'auction'
  | 'trade'
  | 'jail'
  | 'bankruptcy'
  | 'host'
  | 'system';

export interface LogEntry {
  seq: number;
  ts: number;
  kind: LogKind;
  text: string;
  playerId?: PlayerId;
}

export interface LedgerEntry {
  /** identificativo univoco della transazione: CODICE-STANZA-T<n> */
  id: string;
  seq: number;
  ts: number;
  from: Party;
  to: Party;
  amount: number;
  category: LedgerCategory;
  reason: string;
  square?: number;
  fromBefore?: number;
  fromAfter?: number;
  toBefore?: number;
  toAfter?: number;
}

export interface Notice {
  id: number;
  /** clientId destinatario oppure 'all' */
  to: string;
  text: string;
  level: 'info' | 'error';
  ts: number;
}

export interface LastCard {
  seq: number;
  deck: DeckId;
  cardId: string;
  playerId: PlayerId;
  /** la carta è stata eseguita */
  resolved: boolean;
  at: number;
}

export interface LastChallenge {
  seq: number;
  questionId: string;
  playerId: PlayerId;
  ownerId: PlayerId;
  correct: boolean;
  amount: number;
  at: number;
}

export interface Standing {
  playerId: PlayerId;
  name: string;
  place: number;
  netWorth: number;
  cash: number;
  properties: number;
  developments: number;
  income: number;
  expenses: number;
  bankrupt: boolean;
}

export interface Summary {
  winnerId: PlayerId | null;
  reason: 'last_standing' | 'time' | 'host';
  durationMs: number;
  turns: number;
  standings: Standing[];
}

export interface GameState {
  /**
   * "Epoca" della sessione del conduttore: cresce a ogni ripristino di una partita salvata.
   * Insieme a `version` ordina gli stati pubblicati: (epoch, version) più alto = più recente.
   */
  epoch: number;
  /** incrementa a ogni cambiamento (per ignorare messaggi fuori ordine) */
  version: number;
  roomCode: string;
  phase: Phase;
  settings: GameSettings;
  players: Player[];
  turnOrder: PlayerId[];
  currentPlayerId: PlayerId | null;
  turnNumber: number;
  round: number;
  props: Record<string, PropState>;
  bank: { visits: number; studies: number };
  roll: DiceRoll | null;
  doublesCount: number;
  movement: Movement | null;
  pending: Pending | null;
  auction: Auction | null;
  trades: Trade[];
  decks: Record<DeckId, DeckState>;
  lastCard: LastCard | null;
  lastChallenge: LastChallenge | null;
  usedQuestions: string[];
  paused: { since: number } | null;
  startedAt: number | null;
  pausedTotalMs: number;
  /** modalità rapida: il tempo è scaduto, si termina il giro corrente */
  timeUp: boolean;
  winnerId: PlayerId | null;
  summary: Summary | null;
  log: LogEntry[];
  ledger: LedgerEntry[];
  notices: Notice[];
  /** identificativi delle azioni già elaborate (prevenzione delle doppie transazioni) */
  processed: string[];
  rng: number;
  counters: { log: number; ledger: number; trade: number; notice: number; roll: number; move: number; card: number; challenge: number };
  /** orario del conduttore all'ultima pubblicazione (per sincronizzare i conti alla rovescia) */
  hostTime: number;
  createdAt: number;
}

/** L'attore che richiede un'azione */
export type Actor = { kind: 'host' } | { kind: 'client'; clientId: string };

export interface ActionContext {
  now: number;
  actor: Actor;
  /** id univoco dell'azione (per l'idempotenza) */
  actionId?: string;
  /** solo per i test: forza il risultato dei dadi */
  forcedDice?: [number, number];
}

export type ApplyResult = { ok: true; state: GameState; duplicate?: boolean } | { ok: false; error: string; state: GameState };
