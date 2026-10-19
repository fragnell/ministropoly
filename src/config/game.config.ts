/**
 * CONFIGURAZIONE CENTRALE DEL GIOCO
 * ---------------------------------
 * Tutti i valori di bilanciamento (prezzi, contributi, costi, moltiplicatori, tempi, nome del gioco)
 * sono qui o nei file collegati (board.ts, cards.ts, challenges.ts). Il motore delle regole
 * (src/engine) non contiene numeri "magici": legge sempre da questi file.
 */

/** Nomi disponibili. Per cambiare nome: modifica GAME_NAME oppure imposta VITE_GAME_NAME in .env */
export const GAME_NAMES = {
  primary: 'MINISTROPOLY',
  alternative: 'PREDICANDOPOLY',
} as const;

const envName = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GAME_NAME;
export const GAME_NAME: string = envName && envName.trim() ? envName.trim() : GAME_NAMES.primary;

export const GAME_TAGLINE = 'Compra, sviluppa, condividi: il gioco di società per tutta la famiglia';

/** Valuta fittizia del gioco (non rappresenta in alcun modo il servizio reale). */
export const CURRENCY = { name: 'Ore', short: 'Ore' } as const;

export const ECONOMY = {
  startingCash: 1500,
  /** Premio quando si passa o si arriva alla Sala del Regno (casella 0) */
  goReward: 200,
  /** Multa per uscire dalla Pausa organizzativa */
  jailFine: 50,
  /** Tentativi di doppio concessi nella Pausa organizzativa */
  jailMaxAttempts: 3,
  /** Doppi consecutivi che mandano alla Pausa organizzativa */
  doublesToJail: 3,
  /** Frazione del prezzo ricevuta con l'ipoteca (arrotondata per difetto) */
  mortgageRate: 0.5,
  /** Interesse da pagare per liberare l'ipoteca (sul valore ricevuto) */
  unmortgageInterestRate: 0.1,
  /** Frazione del costo di sviluppo ricavata vendendo alla banca */
  developmentSellRate: 0.5,
  /** Segnalini disponibili nella banca */
  tokens: { visits: 32, studies: 12 },
  /** Visite ulteriori massime prima dello studio biblico */
  maxVisits: 4,
  /**
   * Moltiplicatore del contributo base R in base al livello di sviluppo:
   * [nessuno, 1 visita, 2 visite, 3 visite, 4 visite, 1 studio biblico]
   */
  rentMultiplierByLevel: [1, 4, 10, 20, 35, 50],
  /** Moltiplicatore se il gruppo è completo e la proprietà non ha sviluppi */
  completeGroupMultiplier: 2,
  /** Contributo dei servizi speciali in base a quanti ne possiede il proprietario (indice = quantità) */
  specialServiceRents: [0, 20, 45, 90, 180],
  /** Servizi a dadi: moltiplicatore sulla somma dei dadi (uno posseduto / entrambi) */
  diceServiceMultipliers: { one: 4, both: 10 },
  auction: { startingBid: 10, minIncrement: 10, seconds: 20 },
  players: { min: 2, max: 8 },
  /** Dimensione massima dei messaggi di testo del conduttore ecc. */
  maxNameLength: 16,
} as const;

/** Tempi dell'animazione (millisecondi). Il motore li usa per programmare gli stati "rolling" e "moving". */
export const TIMING = {
  diceMs: 1300,
  stepMs: 320,
  /** Durata massima dell'intero movimento: i percorsi lunghi accelerano */
  maxMoveMs: 4200,
  botDelayMs: 1100,
  /** Quanto resta visibile l'esito di una sfida / carta sul tabellone dopo la risoluzione */
  resultLingerMs: 9000,
} as const;

/** Durate disponibili per la modalità rapida (minuti) */
export const SPEED_MODE_MINUTES = [45, 60, 90] as const;

export interface GroupDef {
  id: string;
  label: string;
  color: string;
  /** colore del testo/bordo leggibile sopra `color` */
  ink: string;
  /** simbolo aggiuntivo per non affidarsi soltanto al colore */
  symbol: string;
  number: number;
  /** costo di una visita ulteriore */
  buildCost: number;
  /** costo dello studio biblico (pagato in più rispetto alle 4 visite) */
  studyCost: number;
}

export const GROUPS: Record<string, GroupDef> = {
  marrone: { id: 'marrone', label: 'Marrone', color: '#8a5a33', ink: '#ffffff', symbol: '●', number: 1, buildCost: 50, studyCost: 50 },
  azzurro: { id: 'azzurro', label: 'Azzurro', color: '#8ed3f2', ink: '#0b2a3a', symbol: '■', number: 2, buildCost: 50, studyCost: 50 },
  rosa: { id: 'rosa', label: 'Rosa', color: '#ec7fae', ink: '#3b0a1f', symbol: '▲', number: 3, buildCost: 100, studyCost: 100 },
  arancione: { id: 'arancione', label: 'Arancione', color: '#f39433', ink: '#2e1500', symbol: '◆', number: 4, buildCost: 100, studyCost: 100 },
  rosso: { id: 'rosso', label: 'Rosso', color: '#d63b3b', ink: '#ffffff', symbol: '★', number: 5, buildCost: 150, studyCost: 150 },
  giallo: { id: 'giallo', label: 'Giallo', color: '#f3d23b', ink: '#2e2600', symbol: '✚', number: 6, buildCost: 150, studyCost: 150 },
  verde: { id: 'verde', label: 'Verde', color: '#2f9e5b', ink: '#ffffff', symbol: '⬟', number: 7, buildCost: 200, studyCost: 200 },
  blu: { id: 'blu', label: 'Blu scuro', color: '#1f3b8a', ink: '#ffffff', symbol: '⬢', number: 8, buildCost: 200, studyCost: 200 },
};

export const GROUP_ORDER = ['marrone', 'azzurro', 'rosa', 'arancione', 'rosso', 'giallo', 'verde', 'blu'] as const;

export interface TokenDef {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

/** Pedine/avatar selezionabili (massimo 8 giocatori) */
export const TOKENS: TokenDef[] = [
  { id: 'borsa', label: 'Borsa', emoji: '🎒', color: '#2e7d5b' },
  { id: 'bici', label: 'Bicicletta', emoji: '🚲', color: '#1b6a8a' },
  { id: 'libro', label: 'Libro', emoji: '📖', color: '#c79a2b' },
  { id: 'colomba', label: 'Colomba', emoji: '🕊️', color: '#7b5fc9' },
  { id: 'albero', label: 'Albero', emoji: '🌳', color: '#e0702d' },
  { id: 'barca', label: 'Barca', emoji: '⛵', color: '#d44a4a' },
  { id: 'stella', label: 'Stella', emoji: '🌟', color: '#d95fa3' },
  { id: 'autobus', label: 'Autobus', emoji: '🚌', color: '#7a6a5a' },
];

export const BOT_NAMES = ['Aldo', 'Berta', 'Carlo', 'Dora', 'Elia', 'Franca', 'Gino', 'Irene'];

/** Tema grafico: colori principali (usati dal CSS tramite variabili) */
export const THEME = {
  forest: '#1f5d46',
  petrol: '#1b5f73',
  gold: '#c9a24a',
  paper: '#f6f1e7',
};
