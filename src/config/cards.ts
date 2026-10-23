/**
 * MAZZI DI CARTE
 * --------------
 * Due mazzi base di 16 carte ciascuno: "Probabilità" e "Imprevisti".
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

/** 16 carte: 12 positive + 4 negative (vicino al mazzo «Probabilità» del Monopoly classico, 11+5) */
export const TREASURE_CARDS: CardDef[] = [
  { id: 'T01', deck: 'treasure', name: 'Campagna speciale', text: 'Cogli l’opportunità di partecipare alla Campagna speciale! Ricevi 30 Ore.', effect: { type: 'gain', amount: 30 }, icon: '📣', ui: { tone: 'good' } },
  { id: 'T04', deck: 'treasure', name: 'Campagna per la Commemorazione', text: 'Cogli l’opportunità di partecipare alla Campagna per la Commemorazione! Ricevi 30 Ore.', effect: { type: 'gain', amount: 30 }, icon: '📣', ui: { tone: 'good' } },
  { id: 'T05', deck: 'treasure', name: 'Campagna per il Congresso', text: 'Cogli l’opportunità di partecipare alla Campagna di inviti per il Congresso! Ricevi 30 Ore.', effect: { type: 'gain', amount: 30 }, icon: '📣', ui: { tone: 'good' } },
  { id: 'T06', deck: 'treasure', name: 'Campagna per l’Assemblea', text: 'Cogli l’opportunità di partecipare alla Campagna di inviti per l’Assemblea di circoscrizione! Ricevi 30 Ore.', effect: { type: 'gain', amount: 30 }, icon: '📣', ui: { tone: 'good' } },
  { id: 'T09', deck: 'treasure', name: 'Visita del sorvegliante di circoscrizione', text: 'È la settimana della visita del sorvegliante di circoscrizione! Cogli l’opportunità di dedicare più tempo al ministero! Ricevi 50 Ore.', effect: { type: 'gain', amount: 50 }, icon: '🗓️', ui: { tone: 'good' } },
  { id: 'T10', deck: 'treasure', name: 'Testimonianza sul lavoro', text: 'Cogli l’opportunità di predicare sul posto di lavoro! Ricevi 75 Ore.', effect: { type: 'gain', amount: 75 }, icon: '💼', ui: { tone: 'good' } },
  { id: 'T14', deck: 'treasure', name: 'Nuova opportunità', text: 'Cogli l’opportunità di raggiungere la più vicina Opera Metropolitana e risolvi la casella.', effect: { type: 'move_nearest', target: 'special' }, icon: '🧭', ui: { tone: 'good', button: 'Vai' } },
  { id: 'T15', deck: 'treasure', name: 'Testimonianza al medico', text: 'Cogli l’opportunità di predicare al tuo medico! Ricevi 75 Ore.', effect: { type: 'gain', amount: 75 }, icon: '🩺', ui: { tone: 'good' } },
  { id: 'T16', deck: 'treasure', name: 'Programma da rivedere', text: 'Devi rivedere il programma della settimana: torna indietro di 3 caselle e risolvi la destinazione.', effect: { type: 'move_relative', steps: -3 }, icon: '⏪', ui: { tone: 'good', button: 'Torna indietro' } },
  { id: 'T18', deck: 'treasure', name: 'Un parente interessato', text: 'La tua visita ulteriore è assente, ma trovi un altro parente interessato alla Bibbia! Ricevi 60 Ore.', effect: { type: 'gain', amount: 60 }, icon: '👪', ui: { tone: 'good' } },
  { id: 'T19', deck: 'treasure', name: 'Sentenza della Corte Europea', text: 'Una sentenza della Corte Europea denuncia le autorità che ti hanno arrestato! Conserva questa carta: ti farà uscire gratis dalla Pausa organizzativa quando vorrai.', effect: { type: 'hold', kind: 'jail_free' }, icon: '⚖️', ui: { tone: 'good', button: 'Conserva la carta' } },
  { id: 'T20', deck: 'treasure', name: 'Campagna mancata', text: 'Avevi l’opportunità di partecipare a una campagna speciale, ma non ti sei organizzato in tempo. Paga 30 Ore.', effect: { type: 'pay_bank', amount: 30 }, icon: '📉', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'T21', deck: 'treasure', name: 'Opera al bando', text: 'Opera al bando! Vai direttamente alla Pausa organizzativa, senza ricevere 200 Ore.', effect: { type: 'go_to_jail' }, icon: '🚔', ui: { tone: 'bad', button: 'Vai alla Pausa' } },
  { id: 'T22', deck: 'treasure', name: 'Contatto mancato', text: 'Incontri una persona interessata, ma non prendi accordi per ricontattarla. Paga 40 Ore.', effect: { type: 'pay_bank', amount: 40 }, icon: '📵', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'T23', deck: 'treasure', name: 'Opportunità non colta', text: 'Ti si presenta un’opportunità per dare testimonianza, ma non riesci a coglierla. Paga 30 Ore.', effect: { type: 'pay_bank', amount: 30 }, icon: '🙁', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'T24', deck: 'treasure', name: 'Un amico interessato', text: 'Durante una visita ulteriore, la persona ti presenta un amico interessato alla Bibbia! Ricevi 50 Ore.', effect: { type: 'gain', amount: 50 }, icon: '🤝', ui: { tone: 'good' } },
];

/** 16 carte: 9 positive + 7 negative, come il mazzo «Imprevisti» del Monopoly classico */
export const SURPRISE_CARDS: CardDef[] = [
  { id: 'S01', deck: 'surprise', name: 'Un fratello ti accompagna', text: 'Un fratello ti propone di accompagnarlo in predicazione e riesci a dedicare più tempo al ministero! Ricevi 25 Ore.', effect: { type: 'gain', amount: 25 }, icon: '🧑‍🤝‍🧑', ui: { tone: 'good' } },
  { id: 'S02', deck: 'surprise', name: 'Aiuto in famiglia', text: 'Un tuo familiare ti aiuta con alcune faccende e hai più tempo per predicare! Ricevi 20 Ore.', effect: { type: 'gain', amount: 20 }, icon: '🧹', ui: { tone: 'good' } },
  { id: 'S03', deck: 'surprise', name: 'Appuntamento annullato', text: 'Un appuntamento viene annullato e puoi dedicare quel tempo alla predicazione! Ricevi 15 Ore.', effect: { type: 'gain', amount: 15 }, icon: '📅', ui: { tone: 'good' } },
  { id: 'S04', deck: 'surprise', name: 'Un passaggio offerto', text: 'Un fratello ti offre un passaggio e riesci a raggiungere un territorio più lontano! Ricevi 20 Ore.', effect: { type: 'gain', amount: 20 }, icon: '🚗', ui: { tone: 'good' } },
  { id: 'S05', deck: 'surprise', name: 'Settimana ben organizzata', text: 'Riesci a organizzare meglio la settimana e trovi più tempo per il ministero! Ricevi 30 Ore.', effect: { type: 'gain', amount: 30 }, icon: '🗓️', ui: { tone: 'good' } },
  { id: 'S06', deck: 'surprise', name: 'Cambio turno', text: 'Un collega ti cambia il turno e puoi partecipare a un’uscita in predicazione! Ricevi 25 Ore.', effect: { type: 'gain', amount: 25 }, icon: '🔄', ui: { tone: 'good' } },
  { id: 'S07', deck: 'surprise', name: 'Sentenza della Corte Europea', text: 'Una sentenza della Corte Europea denuncia le autorità che ti hanno arrestato! Conserva questa carta: ti farà uscire gratis dalla Pausa organizzativa quando vorrai.', effect: { type: 'hold', kind: 'jail_free' }, icon: '⚖️', ui: { tone: 'good', button: 'Conserva la carta' } },
  { id: 'S08', deck: 'surprise', name: 'Scuola teocratica', text: 'Scuola teocratica! Ti sono state abbuonate delle ore! Ricevi 30 Ore.', effect: { type: 'gain', amount: 30 }, icon: '🎓', ui: { tone: 'good' } },
  { id: 'S09', deck: 'surprise', name: 'Ministero in famiglia', text: 'Riesci a coinvolgere un familiare nella predicazione e trascorrete più tempo insieme nel ministero! Ricevi 20 Ore.', effect: { type: 'gain', amount: 20 }, icon: '👨‍👩‍👧', ui: { tone: 'good' } },
  { id: 'S10', deck: 'surprise', name: 'Programmazione mancata', text: 'Ti sei programmato male e non riesci a dedicare al ministero il tempo previsto. Paga 10 Ore.', effect: { type: 'pay_bank', amount: 10 }, icon: '😓', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S14', deck: 'surprise', name: 'Rinuncia forzata', text: 'Dovevi uscire in predicazione, ma hai un imprevisto e devi rinunciare! Paga 50 Ore.', effect: { type: 'pay_bank', amount: 50 }, icon: '🚫', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S15', deck: 'surprise', name: 'Ruota bucata', text: 'Hai una ruota bucata e non puoi raggiungere il territorio! Paga 35 Ore.', effect: { type: 'pay_bank', amount: 35 }, icon: '🛞', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S16', deck: 'surprise', name: 'Non ti senti bene', text: 'Ti senti poco bene e devi rimandare l’uscita in predicazione. Paga 25 Ore.', effect: { type: 'pay_bank', amount: 25 }, icon: '🤒', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S20', deck: 'surprise', name: 'Lavoro prolungato', text: 'Un impegno di lavoro si prolunga e perdi il tempo che avevi riservato al ministero. Paga 30 Ore.', effect: { type: 'pay_bank', amount: 30 }, icon: '⏰', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S22', deck: 'surprise', name: 'Traffico eccessivo', text: 'Il traffico eccessivo ti fa perdere molto tempo per raggiungere il territorio. Paga 15 Ore.', effect: { type: 'pay_bank', amount: 15 }, icon: '🚦', ui: { tone: 'bad', button: 'Paga' } },
  { id: 'S24', deck: 'surprise', name: 'Impegno familiare urgente', text: 'Un impegno familiare urgente ti impedisce di partecipare all’uscita in predicazione. Paga 40 Ore.', effect: { type: 'pay_bank', amount: 40 }, icon: '👪', ui: { tone: 'bad', button: 'Paga' } },
];

export const ALL_CARDS: CardDef[] = [...TREASURE_CARDS, ...SURPRISE_CARDS];

const CARD_INDEX: Record<string, CardDef> = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const c = CARD_INDEX[id];
  if (!c) throw new Error(`Carta sconosciuta: ${id}`);
  return c;
}

export const DECK_TITLES: Record<DeckId, string> = {
  treasure: 'Probabilità',
  surprise: 'Imprevisti',
};
