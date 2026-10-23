import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCard } from '../src/config/cards';
import { applyAction } from '../src/engine/engine';
import { computeRent, liquidationPotential, netWorth } from '../src/engine/selectors';
import { createGame } from '../src/engine/state';
import { TOKENS } from '../src/config/game.config';
import { assertInvariants, cid, curIdx, give, mkGame, P, roll, rollTo, run, runFail, settle, tick, type G } from './helpers';

/** Mette `cardId` in cima al suo mazzo e fa pescare la carta al giocatore di turno */
function draw(g: G, cardId: string, square?: number): void {
  const deck = cardId.startsWith('T') ? 'treasure' : 'surprise';
  const d = g.s.decks[deck];
  d.draw = [cardId, ...d.draw.filter((x) => x !== cardId)];
  d.discard = d.discard.filter((x) => x !== cardId);
  for (const p of g.s.players) p.heldCards = p.heldCards.filter((x) => x !== cardId);
  rollTo(g, square ?? (deck === 'treasure' ? 17 : 22));
  expect(g.s.pending).toMatchObject({ kind: 'card', cardId });
}

function ack(g: G): void {
  run(g, curIdx(g), { type: 'ACK_CARD' });
  settle(g);
}

describe('13. Effetti delle carte', () => {
  it('ricevi Ore dalla banca (9 carte positive di Probabilità)', () => {
    const amounts: Record<string, number> = { T01: 30, T04: 30, T05: 30, T06: 30, T09: 50, T10: 75, T15: 75, T18: 60, T24: 50 };
    for (const [id, amount] of Object.entries(amounts)) {
      const g = mkGame(3);
      draw(g, id);
      const c = P(g, 0).cash;
      ack(g);
      expect(P(g, 0).cash, id).toBe(c + amount);
      expect(g.s.phase).toBe('turn_end');
      assertInvariants(g.s);
    }
  });

  it('paga alla banca (3 carte negative di Probabilità)', () => {
    const amounts: Record<string, number> = { T20: 30, T22: 40, T23: 30 };
    for (const [id, amount] of Object.entries(amounts)) {
      const g = mkGame(3);
      draw(g, id);
      const c = P(g, 0).cash;
      ack(g);
      expect(P(g, 0).cash, id).toBe(c - amount);
      assertInvariants(g.s);
    }
  });

  it('vai alla più vicina Opera Metropolitana (T14)', () => {
    const g = mkGame(3);
    draw(g, 'T14'); // da 17 → 25
    ack(g);
    expect(P(g, 0).position).toBe(25);
    expect(g.s.phase).toBe('buy_decision');
  });

  it('torna indietro di 3 caselle (T16)', () => {
    const g = mkGame(3);
    draw(g, 'T16'); // da 17 → 14
    ack(g);
    expect(P(g, 0).position).toBe(14);
  });

  it('"Opera al bando" (T21): Pausa organizzativa senza i 200 Ore', () => {
    const g = mkGame(3);
    draw(g, 'T21');
    const c = P(g, 0).cash;
    ack(g);
    expect(P(g, 0).inJail).toBe(true);
    expect(P(g, 0).position).toBe(10);
    expect(P(g, 0).cash).toBe(c);
    expect(g.s.phase).toBe('turn_end');
  });

  it('ricevi Ore dalla banca (8 carte positive di Imprevisti)', () => {
    const amounts: Record<string, number> = { S01: 25, S02: 20, S03: 15, S04: 20, S05: 30, S06: 25, S08: 30, S09: 20 };
    for (const [id, amount] of Object.entries(amounts)) {
      const g = mkGame(3);
      draw(g, id);
      const c = P(g, 0).cash;
      ack(g);
      expect(P(g, 0).cash, id).toBe(c + amount);
      assertInvariants(g.s);
    }
  });

  it('paga alla banca (7 carte negative di Imprevisti)', () => {
    const amounts: Record<string, number> = { S10: 10, S14: 50, S15: 35, S16: 25, S20: 30, S22: 15, S24: 40 };
    for (const [id, amount] of Object.entries(amounts)) {
      const g = mkGame(3);
      draw(g, id);
      const c = P(g, 0).cash;
      ack(g);
      expect(P(g, 0).cash, id).toBe(c - amount);
      assertInvariants(g.s);
    }
  });

  it.each([
    ['T19', 'treasure'],
    ['S07', 'surprise'],
  ])('carta "Esci di prigione" (%s) conservata e poi usata, tornando nel mazzo', (id, deck) => {
    const g = mkGame(3);
    draw(g, id);
    ack(g);
    expect(P(g, 0).heldCards).toEqual([id]);
    expect(g.s.decks[deck as 'treasure' | 'surprise'].discard).not.toContain(id);
    P(g, 0).inJail = true;
    P(g, 0).position = 10;
    g.s.phase = 'jail';
    run(g, 0, { type: 'USE_JAIL_CARD' });
    expect(P(g, 0).inJail).toBe(false);
    expect(P(g, 0).heldCards).toEqual([]);
    expect(g.s.decks[deck as 'treasure' | 'surprise'].discard).toContain(id);
    expect(g.s.phase).toBe('turn_start');
    assertInvariants(g.s);
  });

  it('ognuna delle 32 carte si esegue senza errori e senza violare gli invarianti', () => {
    for (const card of ALL_CARDS) {
      const g = mkGame(3, 99);
      give(g, 1, [18, 19, 25]);
      draw(g, card.id);
      ack(g);
      // risolvi eventuali sospesi in modo semplice
      for (let i = 0; i < 20; i++) {
        const ph = g.s.phase;
        if (ph === 'buy_decision') run(g, curIdx(g), { type: 'DECLINE_PROPERTY' });
        else if (ph === 'auction') {
          for (const k of [0, 1, 2]) {
            try {
              run(g, k, { type: 'PASS_AUCTION' });
            } catch {
              /* ignora */
            }
          }
        } else if (ph === 'card_draw') run(g, curIdx(g), { type: 'ACK_CARD' });
        else if (ph === 'resolving') {
          if (g.s.pending?.kind === 'expense') run(g, curIdx(g), { type: 'PAY_EXPENSE' });
          else run(g, curIdx(g), { type: 'PAY_RENT' });
        } else break;
        settle(g);
      }
      assertInvariants(g.s, card.id);
      expect(getCard(card.id).name).toBeTruthy();
    }
  });
});

describe('14. Pausa organizzativa', () => {
  it('la casella 30 manda alla Pausa senza premio; la casella 10 è solo visita', () => {
    const g = mkGame(3);
    const c = P(g, 0).cash;
    rollTo(g, 30);
    expect(P(g, 0).inJail).toBe(true);
    expect(P(g, 0).position).toBe(10);
    expect(P(g, 0).cash).toBe(c);
    expect(g.s.phase).toBe('turn_end');

    const g2 = mkGame(3);
    rollTo(g2, 10);
    expect(P(g2, 0).inJail).toBe(false);
    expect(g2.s.phase).toBe('turn_end');
  });

  function toJail(g: G, i: number): void {
    P(g, i).inJail = true;
    P(g, i).position = 10;
    P(g, i).jailTurns = 0;
    g.s.currentPlayerId = P(g, i).id;
    g.s.phase = 'jail';
  }

  it('si esce pagando 50 Ore prima del lancio, poi si lancia normalmente', () => {
    const g = mkGame(3);
    toJail(g, 0);
    const c = P(g, 0).cash;
    run(g, 0, { type: 'PAY_JAIL_FINE' });
    expect(P(g, 0).cash).toBe(c - 50);
    expect(P(g, 0).inJail).toBe(false);
    expect(g.s.phase).toBe('turn_start');
    roll(g, 2, 3);
    expect(P(g, 0).position).toBe(15);
  });

  it('con un doppio si esce e ci si muove, senza lancio extra', () => {
    const g = mkGame(3);
    toJail(g, 0);
    const c = P(g, 0).cash;
    roll(g, 2, 2);
    expect(P(g, 0).inJail).toBe(false);
    expect(P(g, 0).position).toBe(14);
    expect(P(g, 0).cash).toBe(c);
    expect(g.s.phase).toBe('buy_decision');
    run(g, 0, { type: 'DECLINE_PROPERTY' });
    for (const k of [0, 1, 2]) if (g.s.phase === 'auction') run(g, k, { type: 'PASS_AUCTION' });
    expect(g.s.phase).toBe('turn_end'); // niente lancio extra
  });

  it('al terzo tentativo fallito si pagano 50 Ore e ci si muove', () => {
    const g = mkGame(3);
    toJail(g, 0);
    roll(g, 1, 2);
    expect(g.s.phase).toBe('turn_end');
    expect(P(g, 0).jailTurns).toBe(1);
    expect(P(g, 0).inJail).toBe(true);
    // gli altri giocano, poi torna p1
    g.s.currentPlayerId = 'p1';
    g.s.phase = 'jail';
    roll(g, 1, 3);
    expect(P(g, 0).jailTurns).toBe(2);
    g.s.phase = 'jail';
    const c = P(g, 0).cash;
    roll(g, 2, 5); // 10 + 7 = 17
    expect(P(g, 0).inJail).toBe(false);
    expect(P(g, 0).cash).toBe(c - 50);
    expect(P(g, 0).position).toBe(17);
    assertInvariants(g.s);
  });

  it('tre doppi consecutivi mandano alla Pausa, senza premio della partenza', () => {
    const g = mkGame(3);
    P(g, 0).position = 8;
    roll(g, 1, 1); // 10
    expect(g.s.phase).toBe('turn_start');
    roll(g, 5, 5); // 20
    expect(g.s.phase).toBe('turn_start');
    expect(g.s.doublesCount).toBe(2);
    const c = P(g, 0).cash;
    P(g, 0).position = 38; // avrebbe attraversato lo 0
    roll(g, 4, 4);
    expect(P(g, 0).inJail).toBe(true);
    expect(P(g, 0).position).toBe(10);
    expect(P(g, 0).cash).toBe(c);
    expect(g.s.phase).toBe('turn_end');
  });

  it('chi è nella Pausa riceve ancora i contributi e può partecipare alle aste', () => {
    const g = mkGame(3);
    P(g, 1).inJail = true;
    P(g, 1).position = 10;
    give(g, 1, [1]);
    rollTo(g, 1);
    run(g, 0, { type: 'PAY_RENT' });
    expect(P(g, 1).cash).toBe(1506); // p2 è nella Pausa ma incassa il contributo
    // anche chi è nella Pausa può offrire all'asta
    g.s.phase = 'turn_start';
    rollTo(g, 6);
    run(g, 0, { type: 'DECLINE_PROPERTY' });
    run(g, 1, { type: 'BID', amount: 20 });
    run(g, 0, { type: 'PASS_AUCTION' });
    run(g, 2, { type: 'PASS_AUCTION' });
    expect(g.s.props['6'].owner).toBe('p2');
  });
});

describe('15. Scambi', () => {
  it('proposta, accettazione e trasferimento atomico di proprietà e Ore', () => {
    const g = mkGame(3);
    give(g, 0, [1]);
    give(g, 1, [6]);
    run(g, 0, { type: 'PROPOSE_TRADE', to: 'p2', offer: { cash: 100, squares: [1] }, request: { cash: 0, squares: [6] }, message: 'Affare?' });
    const t = g.s.trades[0];
    expect(t.status).toBe('pending');
    expect(runFail(g, 2, { type: 'ACCEPT_TRADE', id: t.id })).toMatch(/destinatario/);
    run(g, 1, { type: 'ACCEPT_TRADE', id: t.id });
    expect(g.s.trades[0].status).toBe('accepted');
    expect(g.s.props['1'].owner).toBe('p2');
    expect(g.s.props['6'].owner).toBe('p1');
    expect(P(g, 0).cash).toBe(1400);
    expect(P(g, 1).cash).toBe(1600);
    assertInvariants(g.s);
  });

  it('lo scambio non è eseguibile se mancano le Ore: nessun trasferimento parziale', () => {
    const g = mkGame(3);
    give(g, 0, [1]);
    run(g, 0, { type: 'PROPOSE_TRADE', to: 'p2', offer: { cash: 0, squares: [1] }, request: { cash: 500, squares: [] } });
    const t = g.s.trades[0];
    P(g, 1).cash = 100;
    run(g, 1, { type: 'ACCEPT_TRADE', id: t.id });
    expect(g.s.trades[0].status).toBe('invalid');
    expect(g.s.props['1'].owner).toBe('p1');
    expect(P(g, 1).cash).toBe(100);
  });

  it('non si scambiano proprietà ipotecate o con sviluppi', () => {
    const g = mkGame(3);
    give(g, 0, [1, 3]);
    run(g, 0, { type: 'DEVELOP', square: 1 });
    expect(runFail(g, 0, { type: 'PROPOSE_TRADE', to: 'p2', offer: { cash: 0, squares: [3] }, request: { cash: 10, squares: [] } })).toMatch(/sviluppi/);
    run(g, 0, { type: 'SELL_DEVELOPMENT', square: 1 });
    run(g, 0, { type: 'MORTGAGE', square: 3 });
    expect(runFail(g, 0, { type: 'PROPOSE_TRADE', to: 'p2', offer: { cash: 0, squares: [3] }, request: { cash: 10, squares: [] } })).toMatch(/ipotecata/);
  });

  it('non si può scambiare ciò che non si possiede né durante un’asta', () => {
    const g = mkGame(3);
    give(g, 1, [6]);
    expect(runFail(g, 0, { type: 'PROPOSE_TRADE', to: 'p2', offer: { cash: 0, squares: [6] }, request: { cash: 0, squares: [] } })).toMatch(/non appartiene/);
    give(g, 0, [3]);
    rollTo(g, 8);
    run(g, 0, { type: 'DECLINE_PROPERTY' });
    expect(g.s.phase).toBe('auction');
    expect(runFail(g, 0, { type: 'PROPOSE_TRADE', to: 'p2', offer: { cash: 0, squares: [3] }, request: { cash: 10, squares: [] } })).toMatch(/asta/);
  });

  it('rifiuto, ritiro e controproposta', () => {
    const g = mkGame(3);
    give(g, 0, [1]);
    give(g, 1, [6]);
    run(g, 0, { type: 'PROPOSE_TRADE', to: 'p2', offer: { cash: 0, squares: [1] }, request: { cash: 0, squares: [6] } });
    const id = g.s.trades[0].id;
    run(g, 1, { type: 'COUNTER_TRADE', id, offer: { cash: 0, squares: [6] }, request: { cash: 50, squares: [1] } });
    expect(g.s.trades.find((t) => t.id === id)?.status).toBe('countered');
    const counter = g.s.trades.find((t) => t.status === 'pending');
    expect(counter).toMatchObject({ from: 'p2', to: 'p1' });
    run(g, 1, { type: 'WITHDRAW_TRADE', id: counter!.id });
    run(g, 0, { type: 'PROPOSE_TRADE', to: 'p2', offer: { cash: 10, squares: [] }, request: { cash: 0, squares: [] } });
    const t3 = g.s.trades.find((t) => t.status === 'pending')!;
    run(g, 1, { type: 'DECLINE_TRADE', id: t3.id });
    expect(g.s.trades.find((t) => t.id === t3.id)?.status).toBe('declined');
  });

  it('non si accetta uno scambio durante un’azione in corso', () => {
    const g = mkGame(3);
    give(g, 0, [3]);
    run(g, 0, { type: 'PROPOSE_TRADE', to: 'p2', offer: { cash: 0, squares: [3] }, request: { cash: 10, squares: [] } });
    const id = g.s.trades[0].id;
    rollTo(g, 6); // decisione d'acquisto in corso
    expect(runFail(g, 1, { type: 'ACCEPT_TRADE', id })).toMatch(/tra un’azione e l’altra/);
  });
});

describe('17–18. Debiti e bancarotta', () => {
  it('un debito si salda ipotecando e il gioco prosegue', () => {
    const g = mkGame(3);
    give(g, 1, [1, 3]);
    give(g, 0, [6]); // da ipotecare: 50
    g.s.props['1'].level = 0;
    rollTo(g, 1); // contributo 12 (gruppo completo)
    P(g, 0).cash = 8;
    run(g, 0, { type: 'PAY_RENT' });
    expect(g.s.phase).toBe('debt');
    expect(g.s.pending).toMatchObject({ kind: 'debt', debtorId: 'p1' });
    expect(runFail(g, 0, { type: 'DECLARE_BANKRUPTCY' })).toMatch(/ancora saldare/);
    run(g, 0, { type: 'MORTGAGE', square: 6 });
    expect(g.s.phase).toBe('turn_end');
    expect(P(g, 0).cash).toBe(8 + 50 - 12);
    expect(P(g, 1).cash).toBe(1512);
    assertInvariants(g.s);
  });

  it('un debito si salda vendendo sviluppi', () => {
    const g = mkGame(3);
    give(g, 0, [37, 39]);
    g.s.props['37'].level = 2;
    g.s.props['39'].level = 2;
    g.s.bank.visits = 28;
    give(g, 1, [1]);
    P(g, 0).cash = 0;
    rollTo(g, 1);
    P(g, 0).cash = 0;
    run(g, 0, { type: 'PAY_RENT' });
    expect(g.s.phase).toBe('debt');
    run(g, 0, { type: 'SELL_DEVELOPMENT', square: 37 }); // +100
    expect(g.s.phase).toBe('turn_end');
    expect(P(g, 0).cash).toBe(100 - 6);
  });

  it('durante un debito si può chiedere uno scambio per ottenere Ore: il debito si salda da solo', () => {
    const g = mkGame(3);
    give(g, 1, [39]);
    g.s.props['39'].level = 5;
    g.s.bank.studies = 11;
    give(g, 0, [8, 9]); // 2 proprietà del debitore
    rollTo(g, 39);
    P(g, 0).cash = 100;
    run(g, 0, { type: 'PAY_RENT' }); // 2000 Ore: non basta nemmeno ipotecando
    expect(g.s.phase).toBe('debt');
    P(g, 2).cash = 3000;
    // il debitore vende le due vie a p3 per 2500 Ore
    run(g, 0, { type: 'PROPOSE_TRADE', to: 'p3', offer: { cash: 0, squares: [8, 9] }, request: { cash: 2500, squares: [] } });
    // le altre persone non coinvolte non possono accettare una proposta altrui
    const t = g.s.trades.find((x) => x.status === 'pending')!;
    expect(runFail(g, 1, { type: 'ACCEPT_TRADE', id: t.id })).toMatch(/destinatario/);
    run(g, 2, { type: 'ACCEPT_TRADE', id: t.id });
    // 100 + 2500 = 2600 ≥ 2000: il debito è stato pagato automaticamente
    expect(g.s.phase).toBe('turn_end');
    expect(P(g, 0).cash).toBe(600);
    expect(P(g, 1).cash).toBe(1500 + 2000);
    expect(g.s.props['8'].owner).toBe('p3');
    expect(g.s.pending).toBeNull();
    assertInvariants(g.s);
  });

  it('bancarotta verso un giocatore: Ore e proprietà passano al creditore', () => {
    const g = mkGame(3);
    give(g, 1, [39]);
    g.s.props['39'].level = 5;
    g.s.bank.studies = 11;
    give(g, 0, [1, 3]);
    P(g, 0).cash = 20;
    rollTo(g, 39);
    P(g, 0).cash = 20;
    run(g, 0, { type: 'PAY_RENT' }); // 2000 Ore
    expect(g.s.phase).toBe('debt');
    expect(liquidationPotential(g.s, 'p1')).toBeLessThan(2000);
    run(g, 0, { type: 'DECLARE_BANKRUPTCY' });
    expect(P(g, 0).bankrupt).toBe(true);
    expect(g.s.props['1'].owner).toBe('p2');
    expect(g.s.props['3'].owner).toBe('p2');
    expect(P(g, 1).cash).toBe(1500 + 20);
    expect(g.s.currentPlayerId).toBe('p2');
    expect(g.s.phase).toBe('turn_start');
    expect(g.s.phase).not.toBe('game_over');
    assertInvariants(g.s);
  });

  it('bancarotta verso la banca: le proprietà tornano libere', () => {
    const g = mkGame(3);
    give(g, 0, [1, 3]);
    g.s.props['1'].level = 1;
    g.s.bank.visits = 31;
    // il giocatore non può permettersi la spesa: vende tutto e comunque non basta
    P(g, 0).cash = 0;
    P(g, 0).position = 35;
    roll(g, 1, 2); // 38 → 150 Ore
    expect(g.s.phase).toBe('debt');
    expect(liquidationPotential(g.s, 'p1')).toBeLessThan(150);
    run(g, 0, { type: 'DECLARE_BANKRUPTCY' });
    expect(P(g, 0).bankrupt).toBe(true);
    expect([1, 3].map((i) => g.s.props[String(i)].owner)).toEqual([null, null]);
    expect(g.s.props['1'].level).toBe(0);
    expect(g.s.bank.visits).toBe(32);
    assertInvariants(g.s);
  });

  it('con un solo giocatore rimasto la partita termina e mostra il riepilogo', () => {
    const g = mkGame(2);
    give(g, 1, [39]);
    g.s.props['39'].level = 5;
    g.s.bank.studies = 11;
    P(g, 0).cash = 10;
    rollTo(g, 39);
    P(g, 0).cash = 10;
    run(g, 0, { type: 'PAY_RENT' });
    run(g, 0, { type: 'DECLARE_BANKRUPTCY' });
    expect(g.s.phase).toBe('game_over');
    expect(g.s.winnerId).toBe('p2');
    expect(g.s.summary?.standings.map((s) => s.playerId)).toEqual(['p2', 'p1']);
    expect(g.s.summary?.reason).toBe('last_standing');
    // dopo la fine nessuna azione di gioco è accettata
    expect(runFail(g, 1, { type: 'ROLL_DICE' })).toMatch(/non disponibile|Sei fuori|turno/);
  });

  it('un giocatore in bancarotta non può più agire', () => {
    const g = mkGame(3);
    P(g, 2).bankrupt = true;
    P(g, 2).cash = 0;
    expect(runFail(g, 2, { type: 'BID', amount: 10 })).toMatch(/Nessuna asta|fuori/);
    expect(runFail(g, 2, { type: 'ROLL_DICE' })).toMatch(/fuori/);
  });

  it('il conduttore può forzare la bancarotta di chi non risponde', () => {
    const g = mkGame(3);
    P(g, 0).cash = 0;
    give(g, 1, [1]);
    rollTo(g, 1);
    P(g, 0).cash = 0;
    run(g, 0, { type: 'PAY_RENT' });
    expect(g.s.phase).toBe('debt');
    run(g, 'host', { type: 'FORCE_BANKRUPTCY', playerId: 'p1' });
    expect(P(g, 0).bankrupt).toBe(true);
  });
});

describe('Sfide (espansioni)', () => {
  function challengeGame(packs: { publisher: boolean; kids: boolean }): G {
    const g = mkGame(3, 5, (s) => {
      s.settings.packs = packs;
    });
    give(g, 1, [1]);
    rollTo(g, 1);
    return g;
  }

  it('senza pacchetti attivi non è disponibile alcuna sfida', () => {
    const g = challengeGame({ publisher: false, kids: false });
    expect(g.s.pending).toMatchObject({ kind: 'rent', canChallenge: false });
    expect(runFail(g, 0, { type: 'START_CHALLENGE' })).toMatch(/non sono attive/);
  });

  it('risposta corretta: il contributo è annullato e il proprietario non incassa', () => {
    const g = challengeGame({ publisher: true, kids: false });
    expect(g.s.pending).toMatchObject({ kind: 'rent', canChallenge: true });
    const c0 = P(g, 0).cash;
    const c1 = P(g, 1).cash;
    run(g, 0, { type: 'START_CHALLENGE' });
    expect(g.s.pending).toMatchObject({ kind: 'challenge', ownerId: 'p2' });
    expect(runFail(g, 2, { type: 'JUDGE_CHALLENGE', correct: true })).toMatch(/proprietario/);
    expect(runFail(g, 0, { type: 'JUDGE_CHALLENGE', correct: true })).toMatch(/proprietario/);
    run(g, 1, { type: 'JUDGE_CHALLENGE', correct: true });
    expect(P(g, 0).cash).toBe(c0);
    expect(P(g, 1).cash).toBe(c1);
    expect(g.s.lastChallenge).toMatchObject({ correct: true, playerId: 'p1' });
    expect(g.s.phase).toBe('turn_end');
  });

  it('risposta errata: si paga il contributo ordinario', () => {
    const g = challengeGame({ publisher: true, kids: false });
    const c0 = P(g, 0).cash;
    run(g, 0, { type: 'START_CHALLENGE' });
    run(g, 'host', { type: 'JUDGE_CHALLENGE', correct: false }); // anche il conduttore può valutare
    expect(P(g, 0).cash).toBe(c0 - 6);
    expect(P(g, 1).cash).toBe(1506);
    expect(g.s.lastChallenge).toMatchObject({ correct: false });
  });

  it('il profilo del giocatore sceglie il pacchetto quando sono attivi entrambi', () => {
    const g = mkGame(3, 5, (s) => {
      s.settings.packs = { publisher: true, kids: true };
      s.players[0].profile = 'kid';
    });
    give(g, 1, [1]);
    rollTo(g, 1);
    run(g, 0, { type: 'START_CHALLENGE' });
    const q = (g.s.pending as { questionId: string }).questionId;
    expect(q.startsWith('K')).toBe(true);
  });

  it('le domande non si ripetono finché ce ne sono di nuove', () => {
    const g = mkGame(3, 5, (s) => {
      s.settings.packs = { publisher: false, kids: true };
    });
    const seen = new Set<string>();
    for (let i = 0; i < 10; i++) {
      give(g, 1, [1]);
      g.s.phase = 'turn_start';
      g.s.currentPlayerId = 'p1';
      rollTo(g, 1);
      run(g, 0, { type: 'START_CHALLENGE' });
      const q = (g.s.pending as { questionId: string }).questionId;
      expect(seen.has(q)).toBe(false);
      seen.add(q);
      run(g, 1, { type: 'JUDGE_CHALLENGE', correct: true });
    }
  });
});

describe('Pausa, modalità rapida, idempotenza e ingressi', () => {
  it('la pausa congela l’asta e al RESUME il conto alla rovescia riprende', () => {
    const g = mkGame(3);
    rollTo(g, 6);
    run(g, 0, { type: 'DECLINE_PROPERTY' });
    const ends = g.s.auction!.endsAt;
    g.now += 5000;
    run(g, 'host', { type: 'PAUSE' });
    expect(runFail(g, 1, { type: 'BID', amount: 10 })).toMatch(/pausa/);
    g.now += 60_000; // un minuto di pausa: l'asta non scade
    tick(g);
    expect(g.s.auction).not.toBeNull();
    run(g, 'host', { type: 'RESUME' });
    expect(g.s.auction!.endsAt).toBe(ends + 60_000);
    run(g, 1, { type: 'BID', amount: 10 });
  });

  it('ogni richiesta di un’azione con lo stesso id viene eseguita una sola volta', () => {
    const g = mkGame(3);
    rollTo(g, 6);
    const r1 = run(g, 0, { type: 'BUY_PROPERTY' }, { actionId: 'abc' });
    expect(r1.ok).toBe(true);
    const cash = P(g, 0).cash;
    const r2 = applyAction(g.s, { type: 'BUY_PROPERTY' }, { now: g.now, actor: { kind: 'client', clientId: cid(0) }, actionId: 'abc' });
    expect(r2.ok && r2.duplicate).toBe(true);
    expect(r2.state).toBe(g.s);
    expect(P(g, 0).cash).toBe(cash);
  });

  it('le azioni riservate al conduttore sono rifiutate ai giocatori', () => {
    const g = mkGame(3);
    expect(runFail(g, 0, { type: 'PAUSE' })).toMatch(/conduttore/);
    expect(runFail(g, 0, { type: 'ADJUST_CASH', playerId: 'p1', amount: 1000, reason: 'trucco' })).toMatch(/conduttore/);
    expect(runFail(g, 0, { type: 'TICK' })).toMatch(/conduttore/);
  });

  it('ogni transazione ha un identificativo univoco', () => {
    const g = mkGame(3);
    give(g, 1, [1]);
    rollTo(g, 1);
    run(g, 0, { type: 'PAY_RENT' });
    const ids = g.s.ledger.map((e) => e.id);
    expect(ids.length).toBeGreaterThan(1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('TEST1-T1');
  });

  it('le rettifiche del conduttore lasciano una traccia nel registro', () => {
    const g = mkGame(3);
    run(g, 'host', { type: 'ADJUST_CASH', playerId: 'p1', amount: 100, reason: 'errore tecnico' });
    expect(P(g, 0).cash).toBe(1600);
    const e = g.s.ledger[g.s.ledger.length - 1];
    expect(e).toMatchObject({ category: 'adjustment', amount: 100, toBefore: 1500, toAfter: 1600 });
    expect(e.fromBefore).toBeUndefined();
    expect(runFail(g, 'host', { type: 'ADJUST_CASH', playerId: 'p1', amount: 5, reason: '' })).toMatch(/motivo/);
  });

  it('modalità rapida: scaduto il tempo si finisce il giro e vince il patrimonio più alto', () => {
    const g = mkGame(3, 5, (s) => {
      s.settings.speedMode = { enabled: true, minutes: 45 };
    });
    give(g, 1, [39]);
    g.now += 46 * 60_000;
    tick(g);
    expect(g.s.timeUp).toBe(true);
    // chiudiamo i turni: p1, p2, p3 → al ritorno su p1 la partita termina
    for (const i of [0, 1, 2]) {
      g.s.currentPlayerId = P(g, i).id;
      g.s.phase = 'turn_end';
      run(g, i, { type: 'END_TURN' });
    }
    expect(g.s.phase).toBe('game_over');
    expect(g.s.summary?.reason).toBe('time');
    expect(g.s.winnerId).toBe('p2'); // possiede la proprietà da 400
    expect(netWorth(g.s, 'p2')).toBe(1500 + 400);
  });

  it('il patrimonio conta le proprietà (ipotecate a metà) e il 50% degli sviluppi', () => {
    const g = mkGame(3);
    give(g, 0, [1, 3, 6]);
    g.s.props['3'].mortgaged = true;
    g.s.props['6'].level = 0;
    expect(netWorth(g.s, 'p1')).toBe(1500 + 60 + 30 + 100);
    g.s.props['1'].level = 2; // 2 × 50 × 50% = 50
    g.s.props['3'].mortgaged = false;
    expect(netWorth(g.s, 'p1')).toBe(1500 + 60 + 60 + 100 + 50);
  });

  it('JOIN: nickname e pedine uniche, massimo 8 giocatori, riconnessione senza doppioni', () => {
    let s = createGame('ABCDE', 1, 0);
    const join = (id: string, name: string, token: string, claim?: string) =>
      applyAction(s, { type: 'JOIN', name, token, claim }, { now: 0, actor: { kind: 'client', clientId: id } });
    let r = join('c1', 'Anna', TOKENS[0].id);
    expect(r.ok).toBe(true);
    s = r.state;
    r = join('c2', 'anna', TOKENS[1].id);
    expect(r.ok).toBe(false); // nome già in uso
    r = join('c2', 'Luca', TOKENS[0].id);
    expect(r.ok).toBe(false); // pedina già scelta
    r = join('c1', 'Anna', TOKENS[0].id); // stesso dispositivo: riconnessione
    expect(r.ok).toBe(true);
    expect(r.state.players).toHaveLength(1);
    for (let i = 1; i < 8; i++) {
      r = join(`c${i + 1}`, `G${i}`, TOKENS[i].id);
      expect(r.ok).toBe(true);
      s = r.state;
    }
    r = join('c99', 'Extra', TOKENS[0].id);
    expect(r.ok).toBe(false);
    expect((r as { error: string }).error).toMatch(/completo/);
  });

  it('a partita avviata si può solo riprendere un posto scollegato', () => {
    const g = mkGame(3);
    const tryJoin = (client: string, claim?: string) =>
      applyAction(g.s, { type: 'JOIN', name: 'Nuovo', token: TOKENS[4].id, claim }, { now: g.now, actor: { kind: 'client', clientId: client } });
    expect(tryJoin('nuovo').ok).toBe(false);
    expect(tryJoin('nuovo', 'p2').ok).toBe(false); // p2 è collegato
    run(g, 'host', { type: 'PRESENCE', connected: { [cid(1)]: false } });
    expect(P(g, 1).connected).toBe(false);
    const r = tryJoin('nuovo', 'p2');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.players[1].clientId).toBe('nuovo');
      expect(r.state.players).toHaveLength(3);
    }
  });

  it('computeRent non assegna contributi per caselle libere', () => {
    const g = mkGame(3);
    expect(computeRent(g.s, 1, 7)).toBeNull();
  });
});
