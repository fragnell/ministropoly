/**
 * MAZZI DI CARTE
 * --------------
 * Due mazzi base di 24 carte ciascuno: "Tesori della Bibbia" e "Imprevisti".
 * Ogni carta è un dato strutturato: gli effetti sono eseguiti dal motore (src/engine/cards.ts).
 * Per aggiungere una carta basta aggiungere un oggetto a TREASURE_CARDS o SURPRISE_CARDS.
 *
 * I riferimenti biblici (`scripture`) indicano soltanto il passo collegato al principio della carta
 * (cfr. Traduzione del Nuovo Mondo); non vengono riportati testi né interpretazioni.
 */

export type DeckId = 'treasure' | 'surprise';

export type NearestTarget = 'free_street' | 'special' | 'treasure';
export type CountedThing = 'developed_streets' | 'special_services' | 'color_groups_touched';
export type HeldKind = 'jail_free' | 'cancel_expense';

export type CardEffect =
  /** Ricevi Ore dalla banca */
  | { type: 'gain'; amount: number }
  /** Paga alla banca (annullabile con la carta "Spesa evitata") */
  | { type: 'pay_bank'; amount: number }
  /** Paga a ciascun altro giocatore ancora in gioco */
  | { type: 'pay_each_player'; amount: number }
  /** Paga per ogni proprietà posseduta, con tetto massimo */
  | { type: 'pay_per_property'; each: number; max: number }
  /** Paga per ogni visita ulteriore e per ogni studio biblico */
  | { type: 'pay_per_development'; perVisit: number; perStudy: number }
  /** Ricevi un importo per ogni elemento contato, con eventuale tetto */
  | { type: 'gain_per'; counted: CountedThing; each: number; max?: number }
  /** Ricevi un importo diverso se possiedi almeno un gruppo di colore completo */
  | { type: 'gain_conditional'; condition: 'owns_full_group'; ifTrue: number; ifFalse: number }
  /** Vai a una casella precisa avanzando; `collectGo` indica se attraversare la casella 0 dà il premio */
  | { type: 'move_to'; target: number; collectGo: boolean }
  /** Muoviti di un numero di caselle (negativo = indietro) */
  | { type: 'move_relative'; steps: number }
  /** Vai alla più vicina casella del tipo indicato (in avanti) */
  | { type: 'move_nearest'; target: NearestTarget }
  /** Vai direttamente alla Pausa organizzativa */
  | { type: 'go_to_jail' }
  /** Salta il prossimo turno */
  | { type: 'skip_turn' }
  /** Conserva la carta e usala quando vuoi */
  | { type: 'hold'; kind: HeldKind }
  /** Il prossimo sviluppo costa meno */
  | { type: 'discount_next_development'; percent: number };

export interface CardDef {
  id: string;
  deck: DeckId;
  name: string;
  text: string;
  effect: CardEffect;
  /** icona mostrata sulla carta */
  icon: string;
  /** riferimento biblico facoltativo (solo il passo, senza citazioni) */
  scripture?: string;
  /** istruzioni per l'interfaccia (testo del pulsante, tono ecc.) */
  ui?: { tone: 'good' | 'bad' | 'neutral'; button?: string };
}

export const TREASURE_CARDS: CardDef[] = [
  { id: 'T01', deck: 'treasure', name: 'Preparazione ben organizzata', text: 'Ricevi 75 Ore dalla banca.', effect: { type: 'gain', amount: 75 }, icon: '📋', scripture: 'Proverbi 21:5', ui: { tone: 'good' } },
  { id: 'T02', deck: 'treasure', name: 'Collaborazione efficace', text: 'Ricevi 60 Ore.', effect: { type: 'gain', amount: 60 }, icon: '🤝', scripture: 'Proverbi 15:22', ui: { tone: 'good' } },
  { id: 'T03', deck: 'treasure', name: 'Trasporto condiviso', text: 'Ricevi 40 Ore.', effect: { type: 'gain', amount: 40 }, icon: '🚗', scripture: 'Ecclesiaste 4:9', ui: { tone: 'good' } },
  { id: 'T04', deck: 'treasure', name: 'Pianificazione anticipata', text: 'Avanza di 3 caselle e risolvi la destinazione.', effect: { type: 'move_relative', steps: 3 }, icon: '🗓️', scripture: 'Proverbi 21:5', ui: { tone: 'neutral', button: 'Avanza' } },
  { id: 'T05', deck: 'treasure', name: 'Passaggio dalla Sala del Regno', text: 'Vai alla casella 0 e ricevi 200 Ore.', effect: { type: 'move_to', target: 0, collectGo: true }, icon: '🏛️', ui: { tone: 'good', button: 'Vai alla Sala del Regno' } },
  { id: 'T06', deck: 'treasure', name: 'Opportunità favorevole', text: 'Vai alla più vicina proprietà stradale libera: puoi acquistarla o, se rifiuti, si avvia l’asta.', effect: { type: 'move_nearest', target: 'free_street' }, icon: '🔭', ui: { tone: 'neutral', button: 'Vai' } },
  { id: 'T07', deck: 'treasure', name: 'Materiali recuperati', text: 'Ricevi 40 Ore.', effect: { type: 'gain', amount: 40 }, icon: '♻️', scripture: 'Giovanni 6:12', ui: { tone: 'good' } },
  { id: 'T08', deck: 'treasure', name: 'Rimborso delle spese', text: 'Ricevi 50 Ore.', effect: { type: 'gain', amount: 50 }, icon: '💶', ui: { tone: 'good' } },
  { id: 'T09', deck: 'treasure', name: 'Organizzazione efficiente', text: 'Il prossimo sviluppo costa il 50% in meno.', effect: { type: 'discount_next_development', percent: 50 }, icon: '🏷️', scripture: 'Luca 14:28', ui: { tone: 'good', button: 'Conserva lo sconto' } },
  { id: 'T10', deck: 'treasure', name: 'Esci dalla Pausa organizzativa', text: 'Conserva questa carta fino a quando vuoi utilizzarla.', effect: { type: 'hold', kind: 'jail_free' }, icon: '🔑', ui: { tone: 'good', button: 'Conserva la carta' } },
  { id: 'T11', deck: 'treasure', name: 'Progetto ben coordinato', text: 'Ricevi 100 Ore.', effect: { type: 'gain', amount: 100 }, icon: '🧩', scripture: 'Proverbi 15:22', ui: { tone: 'good' } },
  { id: 'T12', deck: 'treasure', name: 'Buon uso delle risorse', text: 'Ricevi 40 Ore.', effect: { type: 'gain', amount: 40 }, icon: '🌱', scripture: 'Giovanni 6:12', ui: { tone: 'good' } },
  { id: 'T13', deck: 'treasure', name: 'Assistenza logistica', text: 'Ricevi 60 Ore.', effect: { type: 'gain', amount: 60 }, icon: '📦', ui: { tone: 'good' } },
  { id: 'T14', deck: 'treasure', name: 'Preparazione completata', text: 'Ricevi 30 Ore per ogni proprietà stradale sviluppata, fino a un massimo di 150 Ore.', effect: { type: 'gain_per', counted: 'developed_streets', each: 30, max: 150 }, icon: '✅', ui: { tone: 'good' } },
  { id: 'T15', deck: 'treasure', name: 'Servizi organizzati', text: 'Ricevi 25 Ore per ogni servizio speciale posseduto.', effect: { type: 'gain_per', counted: 'special_services', each: 25 }, icon: '🏢', ui: { tone: 'good' } },
  { id: 'T16', deck: 'treasure', name: 'Gruppo completato', text: 'Se possiedi un gruppo di colore completo ricevi 100 Ore; altrimenti ne ricevi 30.', effect: { type: 'gain_conditional', condition: 'owns_full_group', ifTrue: 100, ifFalse: 30 }, icon: '🎯', ui: { tone: 'good' } },
  { id: 'T17', deck: 'treasure', name: 'Attività ben preparata', text: 'Ricevi 80 Ore.', effect: { type: 'gain', amount: 80 }, icon: '📝', ui: { tone: 'good' } },
  { id: 'T18', deck: 'treasure', name: 'Spesa evitata', text: 'Conserva questa carta per annullare una futura spesa organizzativa.', effect: { type: 'hold', kind: 'cancel_expense' }, icon: '🛡️', scripture: 'Proverbi 22:3', ui: { tone: 'good', button: 'Conserva la carta' } },
  { id: 'T19', deck: 'treasure', name: 'Nuova opportunità', text: 'Vai alla più vicina casella di servizio speciale e risolvila.', effect: { type: 'move_nearest', target: 'special' }, icon: '🧭', ui: { tone: 'neutral', button: 'Vai' } },
  { id: 'T20', deck: 'treasure', name: 'Aiuto tempestivo', text: 'Ricevi 50 Ore.', effect: { type: 'gain', amount: 50 }, icon: '⏱️', ui: { tone: 'good' } },
  { id: 'T21', deck: 'treasure', name: 'Risorse risparmiate', text: 'Ricevi 40 Ore.', effect: { type: 'gain', amount: 40 }, icon: '🪙', ui: { tone: 'good' } },
  { id: 'T22', deck: 'treasure', name: 'Organizzazione anticipata', text: 'Ricevi 60 Ore.', effect: { type: 'gain', amount: 60 }, icon: '📅', ui: { tone: 'good' } },
  { id: 'T23', deck: 'treasure', name: 'Programma completato', text: 'Ricevi 100 Ore.', effect: { type: 'gain', amount: 100 }, icon: '🏁', scripture: '1 Corinti 14:40', ui: { tone: 'good' } },
  { id: 'T24', deck: 'treasure', name: 'Buona gestione', text: 'Ricevi 20 Ore per ogni gruppo di colore in cui possiedi almeno una proprietà.', effect: { type: 'gain_per', counted: 'color_groups_touched', each: 20 }, icon: '🌟', scripture: 'Luca 16:10', ui: { tone: 'good' } },
];

export const SURPRISE_CARDS: CardDef[] = [
  { id: 'S01', deck: 'surprise', name: 'Materiale da sostituire', text: 'Paga 50 Ore alla banca.', effect: { type: 'pay_bank', amount: 50 }, icon: '🧰', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S02', deck: 'surprise', name: 'Spese organizzative', text: 'Paga 100 Ore.', effect: { type: 'pay_bank', amount: 100 }, icon: '🧾', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S03', deck: 'surprise', name: 'Riparazioni urgenti', text: 'Paga 25 Ore per ogni visita ulteriore e 100 Ore per ogni studio biblico posseduto.', effect: { type: 'pay_per_development', perVisit: 25, perStudy: 100 }, icon: '🔧', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S04', deck: 'surprise', name: 'Riprogrammazione urgente', text: 'Vai direttamente alla casella 10 (Pausa organizzativa), senza ricevere 200 Ore.', effect: { type: 'go_to_jail' }, icon: '📅', ui: { tone: 'bad', button: 'Vai alla Pausa' } },
  { id: 'S05', deck: 'surprise', name: 'Cambio di programma', text: 'Torna indietro di 3 caselle e risolvi la destinazione.', effect: { type: 'move_relative', steps: -3 }, icon: '↩️', ui: { tone: 'neutral', button: 'Torna indietro' } },
  { id: 'S06', deck: 'surprise', name: 'Trasporto imprevisto', text: 'Paga 40 Ore.', effect: { type: 'pay_bank', amount: 40 }, icon: '🚕', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S07', deck: 'surprise', name: 'Spese condivise', text: 'Paga 20 Ore a ciascun altro giocatore.', effect: { type: 'pay_each_player', amount: 20 }, icon: '🍽️', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S08', deck: 'surprise', name: 'Costi di gestione', text: 'Paga 10 Ore per ogni proprietà posseduta, fino a un massimo di 100 Ore.', effect: { type: 'pay_per_property', each: 10, max: 100 }, icon: '🗂️', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S09', deck: 'surprise', name: 'Attesa organizzativa', text: 'Salta il prossimo turno.', effect: { type: 'skip_turn' }, icon: '⏳', ui: { tone: 'bad', button: 'Ho capito' } },
  { id: 'S10', deck: 'surprise', name: 'Nuovo appuntamento', text: 'Vai alla Sala del Regno e ricevi 200 Ore.', effect: { type: 'move_to', target: 0, collectGo: true }, icon: '🏛️', ui: { tone: 'good', button: 'Vai alla Sala del Regno' } },
  { id: 'S11', deck: 'surprise', name: 'Riparazioni aggiuntive', text: 'Paga 40 Ore per ogni visita ulteriore e 120 Ore per ogni studio biblico.', effect: { type: 'pay_per_development', perVisit: 40, perStudy: 120 }, icon: '🛠️', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S12', deck: 'surprise', name: 'Trasferimento necessario', text: 'Vai al più vicino servizio speciale e risolvi la casella.', effect: { type: 'move_nearest', target: 'special' }, icon: '🧭', ui: { tone: 'neutral', button: 'Vai' } },
  { id: 'S13', deck: 'surprise', name: 'Spesa straordinaria', text: 'Paga 80 Ore.', effect: { type: 'pay_bank', amount: 80 }, icon: '💸', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S14', deck: 'surprise', name: 'Modifica del programma', text: 'Vai alla casella 30 e applica il suo effetto.', effect: { type: 'move_to', target: 30, collectGo: false }, icon: '🔀', ui: { tone: 'bad', button: 'Vai' } },
  { id: 'S15', deck: 'surprise', name: 'Impegno fuori programma', text: 'Vai a Via Montenapoleone e risolvi la casella; ricevi il premio di partenza se attraversi la casella 0.', effect: { type: 'move_to', target: 37, collectGo: true }, icon: '🚀', ui: { tone: 'neutral', button: 'Vai' } },
  { id: 'S16', deck: 'surprise', name: 'Nuovo territorio', text: 'Vai a Via Toledo e risolvi la casella; applica il premio di partenza se attraversi la casella 0.', effect: { type: 'move_to', target: 1, collectGo: true }, icon: '🗺️', ui: { tone: 'neutral', button: 'Vai' } },
  { id: 'S17', deck: 'surprise', name: 'Attrezzatura da riparare', text: 'Paga 20 Ore per ogni visita ulteriore e 80 Ore per ogni studio biblico.', effect: { type: 'pay_per_development', perVisit: 20, perStudy: 80 }, icon: '🔩', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S18', deck: 'surprise', name: 'Trasporto urgente', text: 'Paga 50 Ore.', effect: { type: 'pay_bank', amount: 50 }, icon: '🚐', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S19', deck: 'surprise', name: 'Ritardo organizzativo', text: 'Salta il prossimo turno.', effect: { type: 'skip_turn' }, icon: '🕰️', ui: { tone: 'bad', button: 'Ho capito' } },
  { id: 'S20', deck: 'surprise', name: 'Rimborso parziale', text: 'Ricevi 30 Ore dalla banca.', effect: { type: 'gain', amount: 30 }, icon: '💶', ui: { tone: 'good' } },
  { id: 'S21', deck: 'surprise', name: 'Spese supplementari', text: 'Paga 25 Ore a ciascun altro giocatore.', effect: { type: 'pay_each_player', amount: 25 }, icon: '🥘', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S22', deck: 'surprise', name: 'Nuova opportunità di servizio', text: 'Vai alla più vicina casella Tesori della Bibbia e pesca una carta.', effect: { type: 'move_nearest', target: 'treasure' }, icon: '📖', ui: { tone: 'good', button: 'Vai' } },
  { id: 'S23', deck: 'surprise', name: 'Materiale dimenticato', text: 'Paga 30 Ore.', effect: { type: 'pay_bank', amount: 30 }, icon: '🎒', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S24', deck: 'surprise', name: 'Cambio sede', text: 'Vai alla Sala delle Assemblee e risolvi la casella, ricevendo il premio di partenza se attraversi la casella 0.', effect: { type: 'move_to', target: 25, collectGo: true }, icon: '🏛️', ui: { tone: 'neutral', button: 'Vai' } },
];

export const ALL_CARDS: CardDef[] = [...TREASURE_CARDS, ...SURPRISE_CARDS];

const CARD_INDEX: Record<string, CardDef> = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const c = CARD_INDEX[id];
  if (!c) throw new Error(`Carta sconosciuta: ${id}`);
  return c;
}

export const DECK_TITLES: Record<DeckId, string> = {
  treasure: 'Tesori della Bibbia',
  surprise: 'Imprevisti',
};
