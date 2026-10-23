/**
 * TABELLONE: 40 caselle numerate da 0 a 39, disposte sul perimetro di una griglia 11 × 11.
 *
 * Percorso orario:
 *   0 = angolo inferiore destro (Sala del Regno – PARTENZA)
 *   1–9 lato inferiore, da destra verso sinistra
 *   10 = angolo inferiore sinistro (Pausa organizzativa – Solo visita)
 *   11–19 lato sinistro, dal basso verso l'alto
 *   20 = angolo superiore sinistro (Sosta libera)
 *   21–29 lato superiore, da sinistra verso destra
 *   30 = angolo superiore destro (Riprogrammazione urgente)
 *   31–39 lato destro, dall'alto verso il basso
 */

export type SquareKind =
  | 'go'
  | 'street'
  | 'special' // servizi speciali (contributo in base a quanti se ne possiedono)
  | 'utility' // servizi a dadi
  | 'treasure'
  | 'surprise'
  | 'tax'
  | 'jail'
  | 'free'
  | 'gotojail';

export interface SquareDef {
  index: number;
  name: string;
  kind: SquareKind;
  city?: string;
  group?: string;
  price?: number;
  /** contributo base R (solo vie) */
  baseRent?: number;
  /** importo da pagare alla banca (solo caselle spesa) */
  amount?: number;
  icon: string;
  /** descrizione breve dell'effetto */
  note?: string;
}

function street(index: number, name: string, city: string, group: string, price: number, baseRent: number): SquareDef {
  return { index, name, city, kind: 'street', group, price, baseRent, icon: '🏠' };
}

export const SQUARES: SquareDef[] = [
  { index: 0, name: 'Sala del Regno', kind: 'go', icon: '🏛️', note: 'PARTENZA: ricevi 200 Ore quando passi o arrivi' },
  street(1, 'Via Toledo', 'Napoli', 'marrone', 60, 6),
  { index: 2, name: 'Probabilità', kind: 'treasure', icon: '🎲', note: 'Pesca una carta Probabilità' },
  street(3, 'Via dei Tribunali', 'Napoli', 'marrone', 60, 7),
  { index: 4, name: 'Ammalato: non puoi predicare per un po’', kind: 'tax', amount: 200, icon: '🤒', note: 'Paga 200 Ore alla banca' },
  { index: 5, name: 'Opera Metropolitana Napoli', kind: 'special', price: 200, icon: '🏢' },
  street(6, 'Via del Corso', 'Roma', 'azzurro', 100, 8),
  { index: 7, name: 'Imprevisti', kind: 'surprise', icon: '❓', note: 'Pesca una carta Imprevisti' },
  street(8, 'Via Nazionale', 'Roma', 'azzurro', 100, 9),
  street(9, 'Via Veneto', 'Roma', 'azzurro', 120, 10),
  { index: 10, name: 'Pausa organizzativa', kind: 'jail', icon: '☕', note: 'Solo visita (nessuna penalità)' },
  street(11, 'Via Garibaldi', 'Genova', 'rosa', 140, 12),
  { index: 12, name: 'Opera Portuale', kind: 'utility', price: 150, icon: '⚓', note: 'Predica in tutti i porti d’Italia' },
  street(13, 'Via XX Settembre', 'Genova', 'rosa', 140, 13),
  street(14, 'Via San Lorenzo', 'Genova', 'rosa', 160, 14),
  { index: 15, name: 'Opera Metropolitana Milano', kind: 'special', price: 200, icon: '🏢' },
  street(16, 'Via Etnea', 'Catania', 'arancione', 180, 16),
  { index: 17, name: 'Probabilità', kind: 'treasure', icon: '🎲', note: 'Pesca una carta Probabilità' },
  street(18, 'Via Maqueda', 'Palermo', 'arancione', 180, 17),
  street(19, 'Via Ruggero Settimo', 'Palermo', 'arancione', 200, 18),
  { index: 20, name: 'Sosta libera', kind: 'free', icon: '🌳', note: 'Nessun effetto economico' },
  street(21, 'Corso Buenos Aires', 'Milano', 'rosso', 220, 20),
  { index: 22, name: 'Imprevisti', kind: 'surprise', icon: '❓', note: 'Pesca una carta Imprevisti' },
  street(23, 'Via Dante', 'Milano', 'rosso', 220, 21),
  street(24, 'Corso Vittorio Emanuele II', 'Milano', 'rosso', 240, 22),
  { index: 25, name: 'Opera Metropolitana Venezia', kind: 'special', price: 200, icon: '🏢' },
  street(26, 'Via Indipendenza', 'Bologna', 'giallo', 260, 24),
  street(27, 'Via Rizzoli', 'Bologna', 'giallo', 260, 25),
  { index: 28, name: 'Opera Penitenziaria', kind: 'utility', price: 150, icon: '🔒', note: 'Predica in tutte le carceri d’Italia' },
  street(29, 'Via Mazzini', 'Verona', 'giallo', 280, 26),
  { index: 30, name: 'Riprogrammazione urgente', kind: 'gotojail', icon: '📅', note: 'Vai direttamente alla Pausa organizzativa' },
  street(31, 'Via Po', 'Torino', 'verde', 300, 28),
  street(32, 'Via Roma', 'Torino', 'verde', 300, 29),
  { index: 33, name: 'Probabilità', kind: 'treasure', icon: '🎲', note: 'Pesca una carta Probabilità' },
  street(34, 'Corso Francia', 'Torino', 'verde', 320, 30),
  { index: 35, name: 'Opera Metropolitana Roma', kind: 'special', price: 200, icon: '🏢' },
  { index: 36, name: 'Imprevisti', kind: 'surprise', icon: '❓', note: 'Pesca una carta Imprevisti' },
  street(37, 'Via Montenapoleone', 'Milano', 'blu', 350, 35),
  { index: 38, name: 'Ti sei scoraggiato!', kind: 'tax', amount: 100, icon: '😔', note: 'Paga 100 Ore alla banca' },
  street(39, 'Via della Spiga', 'Milano', 'blu', 400, 40),
];

export const BOARD_SIZE = SQUARES.length; // 40
export const GO_INDEX = 0;
export const JAIL_INDEX = 10;
export const FREE_INDEX = 20;
export const GOTOJAIL_INDEX = 30;

export const BUYABLE_INDICES = SQUARES.filter((s) => s.kind === 'street' || s.kind === 'special' || s.kind === 'utility').map((s) => s.index);
export const STREET_INDICES = SQUARES.filter((s) => s.kind === 'street').map((s) => s.index);
export const SPECIAL_INDICES = SQUARES.filter((s) => s.kind === 'special').map((s) => s.index);
export const UTILITY_INDICES = SQUARES.filter((s) => s.kind === 'utility').map((s) => s.index);

export function isBuyable(index: number): boolean {
  const k = SQUARES[index]?.kind;
  return k === 'street' || k === 'special' || k === 'utility';
}

export function groupIndices(groupId: string): number[] {
  return SQUARES.filter((s) => s.group === groupId).map((s) => s.index);
}

/** Etichetta completa, es. "Via Toledo – Napoli" */
export function squareLabel(index: number): string {
  const sq = SQUARES[index];
  if (!sq) return `Casella ${index}`;
  return sq.city ? `${sq.name} – ${sq.city}` : sq.name;
}

/**
 * Coordinate sulla griglia 11×11 (colonna, riga), con origine in alto a sinistra.
 * Rispetta il percorso orario descritto in testa al file.
 */
export function squareCoords(index: number): { col: number; row: number } {
  if (index < 0 || index >= BOARD_SIZE) throw new Error(`Indice casella non valido: ${index}`);
  if (index <= 10) return { col: 10 - index, row: 10 }; // 0 = (10,10) … 10 = (0,10)
  if (index <= 20) return { col: 0, row: 10 - (index - 10) }; // 11…20 salendo
  if (index <= 30) return { col: index - 20, row: 0 }; // 21…30 verso destra
  return { col: 10, row: index - 30 }; // 31…39 scendendo
}

/** Verifica strutturale del tabellone (usata anche dai test e all'avvio dell'app) */
export function validateBoard(): string[] {
  const errors: string[] = [];
  if (SQUARES.length !== 40) errors.push(`Il tabellone deve avere 40 caselle (trovate ${SQUARES.length})`);
  const seen = new Set<number>();
  SQUARES.forEach((s, i) => {
    if (s.index !== i) errors.push(`La casella in posizione ${i} ha indice ${s.index}`);
    if (seen.has(s.index)) errors.push(`Indice duplicato ${s.index}`);
    seen.add(s.index);
  });
  const coords = new Set<string>();
  for (let i = 0; i < BOARD_SIZE; i++) {
    const { col, row } = squareCoords(i);
    const onEdge = col === 0 || col === 10 || row === 0 || row === 10;
    if (!onEdge) errors.push(`La casella ${i} non è sul perimetro`);
    const key = `${col},${row}`;
    if (coords.has(key)) errors.push(`Coordinate duplicate ${key}`);
    coords.add(key);
  }
  // Caselle consecutive adiacenti sulla griglia
  for (let i = 0; i < BOARD_SIZE; i++) {
    const a = squareCoords(i);
    const b = squareCoords((i + 1) % BOARD_SIZE);
    if (Math.abs(a.col - b.col) + Math.abs(a.row - b.row) !== 1) errors.push(`Le caselle ${i} e ${(i + 1) % BOARD_SIZE} non sono adiacenti`);
  }
  if (BUYABLE_INDICES.length !== 28) errors.push(`Le caselle acquistabili devono essere 28 (trovate ${BUYABLE_INDICES.length})`);
  if (STREET_INDICES.length !== 22) errors.push(`Le vie devono essere 22 (trovate ${STREET_INDICES.length})`);
  return errors;
}
