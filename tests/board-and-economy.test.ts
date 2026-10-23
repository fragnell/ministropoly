import { describe, expect, it } from 'vitest';
import { BUYABLE_INDICES, SQUARES, SPECIAL_INDICES, UTILITY_INDICES, groupIndices, squareCoords, validateBoard } from '../src/config/board';
import { GROUPS } from '../src/config/game.config';
import { ALL_CARDS, SURPRISE_CARDS, TREASURE_CARDS } from '../src/config/cards';
import { KIDS_PACK, PUBLISHER_PACK } from '../src/config/challenges';
import { computeRent, rentTable } from '../src/engine/selectors';
import { deckIntegrity } from '../src/engine/cards';
import { mkGame, P, give, assertInvariants, rollTo, roll, run, runFail, curIdx, settle } from './helpers';

describe('1. Tabellone: 40 caselle esatte', () => {
  it('ha esattamente 40 caselle, indici unici e coordinate coerenti', () => {
    expect(validateBoard()).toEqual([]);
    expect(SQUARES).toHaveLength(40);
    expect(new Set(SQUARES.map((s) => s.index)).size).toBe(40);
  });

  it('rispetta il percorso orario sulla griglia 11×11', () => {
    expect(squareCoords(0)).toEqual({ col: 10, row: 10 }); // angolo inferiore destro
    expect(squareCoords(1)).toEqual({ col: 9, row: 10 }); // lato inferiore verso sinistra
    expect(squareCoords(9)).toEqual({ col: 1, row: 10 });
    expect(squareCoords(10)).toEqual({ col: 0, row: 10 }); // angolo inferiore sinistro
    expect(squareCoords(11)).toEqual({ col: 0, row: 9 }); // lato sinistro verso l'alto
    expect(squareCoords(19)).toEqual({ col: 0, row: 1 });
    expect(squareCoords(20)).toEqual({ col: 0, row: 0 }); // angolo superiore sinistro
    expect(squareCoords(21)).toEqual({ col: 1, row: 0 }); // lato superiore verso destra
    expect(squareCoords(29)).toEqual({ col: 9, row: 0 });
    expect(squareCoords(30)).toEqual({ col: 10, row: 0 }); // angolo superiore destro
    expect(squareCoords(31)).toEqual({ col: 10, row: 1 }); // lato destro verso il basso
    expect(squareCoords(39)).toEqual({ col: 10, row: 9 });
  });

  it('contiene le caselle e i tipi previsti', () => {
    const k = (i: number) => SQUARES[i].kind;
    expect([0, 10, 20, 30].map(k)).toEqual(['go', 'jail', 'free', 'gotojail']);
    expect([2, 17, 33].every((i) => k(i) === 'treasure')).toBe(true);
    expect([7, 22, 36].every((i) => k(i) === 'surprise')).toBe(true);
    expect(SQUARES[4]).toMatchObject({ kind: 'tax', amount: 200, name: 'Ammalato: non puoi predicare per un po’' });
    expect(SQUARES[38]).toMatchObject({ kind: 'tax', amount: 100 });
    expect(SPECIAL_INDICES).toEqual([5, 15, 25, 35]);
    expect(UTILITY_INDICES).toEqual([12, 28]);
    expect(BUYABLE_INDICES).toHaveLength(28);
    expect(SQUARES.filter((s) => s.kind === 'street')).toHaveLength(22);
  });

  it('le otto fasce di colore sono configurate come da tabella', () => {
    expect(Object.keys(GROUPS)).toHaveLength(8);
    expect(groupIndices('marrone')).toEqual([1, 3]);
    expect(groupIndices('azzurro')).toEqual([6, 8, 9]);
    expect(groupIndices('rosa')).toEqual([11, 13, 14]);
    expect(groupIndices('arancione')).toEqual([16, 18, 19]);
    expect(groupIndices('rosso')).toEqual([21, 23, 24]);
    expect(groupIndices('giallo')).toEqual([26, 27, 29]);
    expect(groupIndices('verde')).toEqual([31, 32, 34]);
    expect(groupIndices('blu')).toEqual([37, 39]);
  });

  it('prezzi, contributi base e costi di sviluppo corrispondono alla tabella', () => {
    const t: Record<number, [number, number]> = {
      1: [60, 6], 3: [60, 7], 6: [100, 8], 8: [100, 9], 9: [120, 10], 11: [140, 12], 13: [140, 13], 14: [160, 14],
      16: [180, 16], 18: [180, 17], 19: [200, 18], 21: [220, 20], 23: [220, 21], 24: [240, 22], 26: [260, 24],
      27: [260, 25], 29: [280, 26], 31: [300, 28], 32: [300, 29], 34: [320, 30], 37: [350, 35], 39: [400, 40],
    };
    for (const [i, [price, rent]] of Object.entries(t)) {
      expect(SQUARES[Number(i)].price, `prezzo ${i}`).toBe(price);
      expect(SQUARES[Number(i)].baseRent, `contributo ${i}`).toBe(rent);
    }
    const costs: Record<string, number> = { marrone: 50, azzurro: 50, rosa: 100, arancione: 100, rosso: 150, giallo: 150, verde: 200, blu: 200 };
    for (const [g, c] of Object.entries(costs)) {
      expect(GROUPS[g].buildCost).toBe(c);
      expect(GROUPS[g].studyCost).toBe(c);
    }
    expect([5, 15, 25, 35].map((i) => SQUARES[i].price)).toEqual([200, 200, 200, 200]);
    expect([12, 28].map((i) => SQUARES[i].price)).toEqual([150, 150]);
  });
});

describe('Mazzi e pacchetti', () => {
  it('ogni mazzo ha 16 carte uniche', () => {
    expect(TREASURE_CARDS).toHaveLength(16);
    expect(SURPRISE_CARDS).toHaveLength(16);
    expect(deckIntegrity()).toEqual([]);
    expect(new Set(ALL_CARDS.map((c) => c.id)).size).toBe(32);
  });
  it('le espansioni hanno almeno 30 domande ciascuna, con campi completi', () => {
    expect(PUBLISHER_PACK.length).toBeGreaterThanOrEqual(30);
    expect(KIDS_PACK.length).toBeGreaterThanOrEqual(30);
    for (const q of [...PUBLISHER_PACK, ...KIDS_PACK]) {
      expect(q.question.length).toBeGreaterThan(10);
      expect(q.answer.length).toBeGreaterThan(1);
      expect(q.explanation.length).toBeGreaterThan(5);
      expect(q.category).toBeTruthy();
      expect([1, 2, 3]).toContain(q.difficulty);
    }
  });
});

describe('2–3. Movimento e premio della Sala del Regno', () => {
  it('muove la pedina della somma dei dadi', () => {
    const g = mkGame(3);
    P(g, 0).position = 0;
    roll(g, 3, 4); // 7 = Imprevisti
    expect(P(g, 0).position).toBe(7);
    expect(g.s.phase).toBe('card_draw');
  });

  it('passando dalla Sala del Regno si ricevono 200 Ore', () => {
    const g = mkGame(3);
    P(g, 0).position = 38;
    const before = P(g, 0).cash;
    roll(g, 2, 3); // 38 + 5 = 43 → casella 3 (Via dei Tribunali)
    expect(P(g, 0).position).toBe(3);
    expect(P(g, 0).cash).toBe(before + 200);
    expect(g.s.phase).toBe('buy_decision');
    assertInvariants(g.s);
  });

  it('arrivando esattamente sulla Sala del Regno si ricevono 200 Ore', () => {
    const g = mkGame(3);
    P(g, 0).position = 35;
    const before = P(g, 0).cash;
    roll(g, 2, 3);
    expect(P(g, 0).position).toBe(0);
    expect(P(g, 0).cash).toBe(before + 200);
  });

  it('il registro contiene saldo precedente e successivo', () => {
    const g = mkGame(3);
    P(g, 0).position = 38;
    roll(g, 2, 3);
    const e = g.s.ledger.find((x) => x.category === 'go');
    expect(e).toMatchObject({ from: 'bank', to: 'p1', amount: 200, toBefore: 1500, toAfter: 1700 });
  });
});

describe('4–5. Acquisto, rifiuto e asta', () => {
  it('acquista una proprietà libera: addebito e proprietario', () => {
    const g = mkGame(3);
    rollTo(g, 1); // Via Toledo
    expect(g.s.phase).toBe('buy_decision');
    expect(g.s.props['1'].owner).toBeNull(); // non ancora posseduta
    run(g, 0, { type: 'BUY_PROPERTY' });
    expect(g.s.props['1'].owner).toBe('p1');
    expect(P(g, 0).cash).toBe(1500 - 60 + 200); // ha anche passato la partenza? (da 38 a 1)
    assertInvariants(g.s);
    expect(g.s.phase).toBe('turn_end');
  });

  it('non permette di acquistare senza Ore sufficienti', () => {
    const g = mkGame(3);
    P(g, 0).cash = 50;
    rollTo(g, 39); // Via della Spiga 400
    expect(runFail(g, 0, { type: 'BUY_PROPERTY' })).toMatch(/Ore sufficienti/);
    expect(g.s.props['39'].owner).toBeNull();
  });

  it('solo il giocatore di turno può acquistare', () => {
    const g = mkGame(3);
    rollTo(g, 6);
    expect(runFail(g, 1, { type: 'BUY_PROPERTY' })).toMatch(/turno/);
  });

  it('rifiutando si avvia un’asta pubblica a cui partecipano tutti', () => {
    const g = mkGame(3);
    rollTo(g, 6);
    run(g, 0, { type: 'DECLINE_PROPERTY' });
    expect(g.s.phase).toBe('auction');
    expect(g.s.auction?.square).toBe(6);
    expect(runFail(g, 1, { type: 'BID', amount: 5 })).toMatch(/minima/);
    run(g, 1, { type: 'BID', amount: 10 });
    expect(runFail(g, 1, { type: 'BID', amount: 20 })).toMatch(/miglior offerente/);
    expect(runFail(g, 2, { type: 'BID', amount: 15 })).toMatch(/minima/); // incremento minimo 10
    run(g, 2, { type: 'BID', amount: 20 });
    run(g, 0, { type: 'BID', amount: 30 }); // anche chi ha rifiutato può offrire
    expect(runFail(g, 0, { type: 'PASS_AUCTION' })).toMatch(/miglior offerente/);
    run(g, 1, { type: 'PASS_AUCTION' });
    expect(runFail(g, 1, { type: 'BID', amount: 50 })).toMatch(/passato/); // non si rientra
    run(g, 2, { type: 'PASS_AUCTION' });
    expect(g.s.auction).toBeNull();
    expect(g.s.props['6'].owner).toBe('p1');
    expect(P(g, 0).cash).toBe(1500 - 30);
    assertInvariants(g.s);
  });

  it('non si può offrire più delle Ore disponibili', () => {
    const g = mkGame(3);
    rollTo(g, 6);
    run(g, 0, { type: 'DECLINE_PROPERTY' });
    P(g, 1).cash = 100;
    expect(runFail(g, 1, { type: 'BID', amount: 110 })).toMatch(/più delle Ore/);
  });

  it('senza offerte la proprietà resta libera allo scadere del tempo', () => {
    const g = mkGame(3);
    rollTo(g, 6);
    run(g, 0, { type: 'DECLINE_PROPERTY' });
    g.now += 21_000;
    run(g, 'host', { type: 'TICK' });
    expect(g.s.auction).toBeNull();
    expect(g.s.props['6'].owner).toBeNull();
    expect(g.s.phase).toBe('turn_end');
  });

  it('allo scadere del tempo vince l’offerta più alta', () => {
    const g = mkGame(3);
    rollTo(g, 6);
    run(g, 0, { type: 'DECLINE_PROPERTY' });
    run(g, 2, { type: 'BID', amount: 40 });
    g.now += 21_000;
    run(g, 'host', { type: 'TICK' });
    expect(g.s.props['6'].owner).toBe('p3');
    expect(P(g, 2).cash).toBe(1500 - 40);
  });

  it('se tutti passano senza offerte la proprietà resta libera', () => {
    const g = mkGame(3);
    rollTo(g, 6);
    run(g, 0, { type: 'DECLINE_PROPERTY' });
    run(g, 0, { type: 'PASS_AUCTION' });
    run(g, 1, { type: 'PASS_AUCTION' });
    run(g, 2, { type: 'PASS_AUCTION' });
    expect(g.s.props['6'].owner).toBeNull();
  });
});

describe('6–8. Contributi', () => {
  it('contributo di un territorio non sviluppato = contributo base', () => {
    const g = mkGame(3);
    give(g, 1, [1]);
    expect(computeRent(g.s, 1, 7)?.amount).toBe(6);
    rollTo(g, 1);
    expect(g.s.phase).toBe('resolving');
    expect(g.s.pending).toMatchObject({ kind: 'rent', amount: 6, ownerId: 'p2' });
    const cash0 = P(g, 0).cash;
    run(g, 0, { type: 'PAY_RENT' });
    expect(P(g, 0).cash).toBe(cash0 - 6);
    expect(P(g, 1).cash).toBe(1500 + 6);
    expect(g.s.phase).toBe('turn_end');
    assertInvariants(g.s);
  });

  it('gruppo completo senza sviluppi: contributo doppio', () => {
    const g = mkGame(3);
    give(g, 1, [1, 3]);
    expect(computeRent(g.s, 1, 7)?.amount).toBe(12);
    expect(computeRent(g.s, 3, 7)?.amount).toBe(14);
  });

  it('tabella dei contributi per livello di sviluppo (R × 4, 10, 20, 35, 50)', () => {
    const g = mkGame(3);
    give(g, 1, [1, 3]);
    const expected = [12, 24, 60, 120, 210, 300];
    expected.forEach((amount, level) => {
      g.s.props['1'].level = level;
      expect(computeRent(g.s, 1, 7)?.amount, `livello ${level}`).toBe(amount);
    });
    // la maggiorazione del gruppo completo non si applica alle proprietà con sviluppi propri
    g.s.props['1'].level = 0;
    g.s.props['3'].level = 1;
    expect(computeRent(g.s, 1, 7)?.amount).toBe(12);
    expect(computeRent(g.s, 3, 7)?.amount).toBe(28);
    expect(rentTable(1).map((r) => r.amount)).toEqual([6, 12, 24, 60, 120, 210, 300]);
  });

  it('una proprietà ipotecata non produce contributi', () => {
    const g = mkGame(3);
    give(g, 1, [1]);
    g.s.props['1'].mortgaged = true;
    rollTo(g, 1);
    expect(g.s.phase).toBe('turn_end');
    expect(P(g, 0).cash).toBe(1500 + 200); // solo il premio della partenza, nessun contributo
  });

  it('su una proprietà propria non si paga nulla', () => {
    const g = mkGame(3);
    give(g, 0, [1]);
    const c = P(g, 0).cash;
    rollTo(g, 1);
    expect(g.s.phase).toBe('turn_end');
    expect(P(g, 0).cash).toBe(c + 200); // solo il premio della partenza
  });

  it('i contributi mostrati derivano dalla configurazione (nessun valore duplicato)', () => {
    const g = mkGame(3);
    give(g, 1, [39]);
    expect(computeRent(g.s, 39, 7)?.amount).toBe(40);
    g.s.props['39'].level = 5;
    expect(computeRent(g.s, 39, 7)?.formula).toContain('50 × 40');
  });
});

describe('11–12. Servizi speciali e servizi a dadi', () => {
  it('servizi speciali: 20 / 45 / 90 / 180 in base a quanti ne possiede il proprietario', () => {
    const g = mkGame(3);
    const amounts: number[] = [];
    for (const n of [1, 2, 3, 4]) {
      for (const i of [5, 15, 25, 35]) g.s.props[String(i)].owner = null;
      give(g, 1, [5, 15, 25, 35].slice(0, n));
      amounts.push(computeRent(g.s, 5, 7)?.amount as number);
    }
    expect(amounts).toEqual([20, 45, 90, 180]);
  });

  it('servizi a dadi: 4× la somma dei dadi con uno, 10× con entrambi', () => {
    const g = mkGame(3);
    give(g, 1, [12]);
    expect(computeRent(g.s, 12, 9)?.amount).toBe(36);
    give(g, 1, [28]);
    expect(computeRent(g.s, 12, 9)?.amount).toBe(90);
    expect(computeRent(g.s, 28, 5)?.amount).toBe(50);
    expect(computeRent(g.s, 28, 5)?.formula).toContain('10 × 5');
  });

  it('il contributo a dadi usa i dadi dell’ultimo lancio', () => {
    const g = mkGame(3);
    give(g, 1, [12]);
    P(g, 0).position = 5;
    roll(g, 3, 4); // 5 + 7 = 12
    expect(g.s.pending).toMatchObject({ kind: 'rent', amount: 28 });
  });
});

describe('9–10. Sviluppi: distribuzione uniforme e segnalini limitati', () => {
  function withGroup(): ReturnType<typeof mkGame> {
    const g = mkGame(3);
    give(g, 0, [1, 3]);
    return g;
  }

  it('non si sviluppa senza il gruppo completo', () => {
    const g = mkGame(3);
    give(g, 0, [1]);
    expect(runFail(g, 0, { type: 'DEVELOP', square: 1 })).toMatch(/tutte le proprietà/);
  });

  it('applica la regola della distribuzione uniforme', () => {
    const g = withGroup();
    run(g, 0, { type: 'DEVELOP', square: 1 });
    expect(runFail(g, 0, { type: 'DEVELOP', square: 1 })).toMatch(/uniforme/);
    run(g, 0, { type: 'DEVELOP', square: 3 });
    run(g, 0, { type: 'DEVELOP', square: 1 });
    expect(g.s.props['1'].level).toBe(2);
    expect(g.s.props['3'].level).toBe(1);
    expect(g.s.bank.visits).toBe(32 - 3);
    assertInvariants(g.s);
  });

  it('studio biblico solo dopo 4 visite; le visite tornano alla banca', () => {
    const g = withGroup();
    P(g, 0).cash = 5000;
    for (let i = 0; i < 4; i++) {
      run(g, 0, { type: 'DEVELOP', square: 1 });
      run(g, 0, { type: 'DEVELOP', square: 3 });
    }
    expect(g.s.props['1'].level).toBe(4);
    expect(g.s.bank.visits).toBe(32 - 8);
    run(g, 0, { type: 'DEVELOP', square: 1 }); // studio biblico
    expect(g.s.props['1'].level).toBe(5);
    expect(g.s.bank.studies).toBe(11);
    expect(g.s.bank.visits).toBe(32 - 8 + 4);
    expect(runFail(g, 0, { type: 'DEVELOP', square: 1 })).toMatch(/studio biblico/);
    assertInvariants(g.s);
  });

  it('i segnalini sono limitati: 32 visite e 12 studi', () => {
    const g = withGroup();
    g.s.bank.visits = 0;
    expect(runFail(g, 0, { type: 'DEVELOP', square: 1 })).toMatch(/esaurite/);
    const g2 = withGroup();
    for (const i of [1, 3]) g2.s.props[String(i)].level = 4;
    g2.s.bank.visits = 32 - 8;
    g2.s.bank.studies = 0;
    P(g2, 0).cash = 1000;
    expect(runFail(g2, 0, { type: 'DEVELOP', square: 1 })).toMatch(/studi biblici sono esauriti/);
  });

  it('non si sviluppa se una proprietà del gruppo è ipotecata', () => {
    const g = withGroup();
    run(g, 0, { type: 'MORTGAGE', square: 3 });
    expect(runFail(g, 0, { type: 'DEVELOP', square: 1 })).toMatch(/ipotecata/);
  });

  it('lo sviluppo costa quanto indicato e richiede le Ore', () => {
    const g = withGroup();
    const c = P(g, 0).cash;
    run(g, 0, { type: 'DEVELOP', square: 1 });
    expect(P(g, 0).cash).toBe(c - 50);
    P(g, 0).cash = 10;
    expect(runFail(g, 0, { type: 'DEVELOP', square: 3 })).toMatch(/Servono/);
  });

  it('solo il giocatore di turno può sviluppare', () => {
    const g = withGroup();
    expect(runFail(g, 1, { type: 'DEVELOP', square: 1 })).toMatch(/turno/);
  });

  it('vendita degli sviluppi al 50%, rispettando la distribuzione uniforme', () => {
    const g = withGroup();
    run(g, 0, { type: 'DEVELOP', square: 1 });
    run(g, 0, { type: 'DEVELOP', square: 3 });
    run(g, 0, { type: 'DEVELOP', square: 1 });
    expect(runFail(g, 0, { type: 'SELL_DEVELOPMENT', square: 3 })).toMatch(/uniforme/);
    const c = P(g, 0).cash;
    run(g, 0, { type: 'SELL_DEVELOPMENT', square: 1 });
    expect(P(g, 0).cash).toBe(c + 25);
    expect(g.s.props['1'].level).toBe(1);
    assertInvariants(g.s);
  });

  it('vendendo uno studio biblico si torna a 4 visite', () => {
    const g = withGroup();
    for (const i of [1, 3]) g.s.props[String(i)].level = 4;
    g.s.bank.visits = 32 - 8;
    P(g, 0).cash = 1000;
    run(g, 0, { type: 'DEVELOP', square: 1 });
    expect(g.s.props['1'].level).toBe(5);
    const c = P(g, 0).cash;
    run(g, 0, { type: 'SELL_DEVELOPMENT', square: 1 });
    expect(P(g, 0).cash).toBe(c + 25);
    expect(g.s.props['1'].level).toBe(4);
    assertInvariants(g.s);
  });

  it('con poche visite in banca, lo studio venduto scende al numero disponibile', () => {
    const g = withGroup();
    g.s.props['1'].level = 5;
    g.s.props['3'].level = 4;
    g.s.bank.visits = 32 - 4; // 4 visite in gioco sulla via 3; le altre 28 in banca
    g.s.bank.studies = 11;
    g.s.bank.visits = 2; // forziamo scarsità: (non coerente col totale, solo per verificare il calcolo)
    const c = P(g, 0).cash;
    run(g, 0, { type: 'SELL_DEVELOPMENT', square: 1 });
    expect(g.s.props['1'].level).toBe(2);
    expect(P(g, 0).cash).toBe(c + 25 + 25 * 2);
  });
});

describe('16. Ipoteche', () => {
  it('ipoteca al 50% e riscatto con il 10%', () => {
    const g = mkGame(3);
    give(g, 0, [3]); // prezzo 60
    const c = P(g, 0).cash;
    run(g, 0, { type: 'MORTGAGE', square: 3 });
    expect(P(g, 0).cash).toBe(c + 30);
    expect(g.s.props['3'].mortgaged).toBe(true);
    expect(runFail(g, 0, { type: 'MORTGAGE', square: 3 })).toMatch(/già/);
    run(g, 0, { type: 'UNMORTGAGE', square: 3 });
    expect(P(g, 0).cash).toBe(c + 30 - 33); // 30 × 1,1 = 33
    expect(g.s.props['3'].mortgaged).toBe(false);
  });

  it('arrotonda per difetto il valore di ipoteca', () => {
    const g = mkGame(3);
    give(g, 0, [9]); // Via Veneto, prezzo 120 → 60
    const c = P(g, 0).cash;
    run(g, 0, { type: 'MORTGAGE', square: 9 });
    expect(P(g, 0).cash).toBe(c + 60);
  });

  it('non si ipoteca una proprietà con sviluppi nel gruppo', () => {
    const g = mkGame(3);
    give(g, 0, [1, 3]);
    run(g, 0, { type: 'DEVELOP', square: 1 });
    expect(runFail(g, 0, { type: 'MORTGAGE', square: 3 })).toMatch(/sviluppi/);
  });
});

describe('Turno e fasi', () => {
  it('non si può lanciare due volte prima di aver risolto la casella', () => {
    const g = mkGame(3);
    P(g, 0).position = 0;
    run(g, 0, { type: 'ROLL_DICE' }, { forcedDice: [3, 4] });
    expect(runFail(g, 0, { type: 'ROLL_DICE' })).toMatch(/non disponibile/);
    settle(g);
    expect(g.s.phase).toBe('card_draw');
    expect(runFail(g, 0, { type: 'ROLL_DICE' })).toMatch(/non disponibile/);
  });

  it('con un doppio il giocatore può lanciare ancora dopo aver risolto la casella', () => {
    const g = mkGame(3);
    P(g, 0).position = 20;
    roll(g, 3, 3); // 26 (Via Indipendenza)
    expect(g.s.phase).toBe('buy_decision');
    run(g, 0, { type: 'DECLINE_PROPERTY' });
    run(g, 1, { type: 'PASS_AUCTION' });
    run(g, 2, { type: 'PASS_AUCTION' });
    run(g, 0, { type: 'PASS_AUCTION' });
    expect(g.s.phase).toBe('turn_start');
    expect(g.s.currentPlayerId).toBe('p1');
    expect(g.s.doublesCount).toBe(1);
  });

  it('solo il giocatore di turno può chiudere il turno', () => {
    const g = mkGame(3);
    P(g, 0).position = 20;
    roll(g, 1, 2); // 23 → Via Dante (libera)
    run(g, 0, { type: 'BUY_PROPERTY' });
    expect(runFail(g, 1, { type: 'END_TURN' })).toMatch(/turno/);
    run(g, 0, { type: 'END_TURN' });
    expect(g.s.currentPlayerId).toBe('p2');
    expect(curIdx(g)).toBe(1);
  });
});
