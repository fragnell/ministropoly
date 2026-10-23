/**
 * Test di rendering delle schermate: ogni schermata si disegna senza errori nelle diverse fasi di gioco
 * e mostra i controlli giusti al giocatore giusto (render lato server, senza browser).
 */
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/engine/types';
import { HostController } from '../src/net/host';
import type { HostTransport } from '../src/net/protocol';
import { Dashboard, GameOverView } from '../src/ui/components/panels';
import { PropertySheet, PropertiesTab } from '../src/ui/phone/PropertiesTab';
import { TradeBuilder, TradeReview, TradesTab } from '../src/ui/phone/TradesTab';
import { TurnPanel } from '../src/ui/phone/TurnPanel';
import { JoinForm, PhoneLobby, SeatPicker } from '../src/ui/phone/Join';
import type { PhoneCtx } from '../src/ui/phone/types';
import { TvScreen } from '../src/ui/components/TvScreen';
import { ControlPanel } from '../src/ui/host/ControlPanel';
import { LobbyPanel } from '../src/ui/host/LobbyPanel';
import { Home } from '../src/ui/routes/Home';
import { AuctionsPanel, BankPanel, PropertiesOverview, QuickLinks, TradesPanel } from '../src/ui/components/QuickPanels';
import type { GameView } from '../src/ui/hooks';
import { createGame } from '../src/engine/state';
import { applyAction } from '../src/engine/engine';
import { TOKENS } from '../src/config/game.config';
import { getChallenge } from '../src/config/challenges';
import { give, mkGame, P, rollTo, run, runFail, settle, type G } from './helpers';

const view = (s: GameState): GameView => ({ state: s, log: s.log, ledger: s.ledger, hostNow: () => s.hostTime + 100 });
const ctxFor = (g: G, i: number): PhoneCtx => ({ view: view(g.s), me: g.s.players[i], send: () => {}, busy: false, goTab: () => {}, openProperty: () => {}, openTrade: () => {} });
// React inserisce <!-- --> tra testi adiacenti: li togliamo per confrontare il testo visibile
const html = (node: React.ReactElement) => renderToString(node).replace(/<!-- -->/g, '');
const turn = (g: G, i: number) => html(<TurnPanel ctx={ctxFor(g, i)} />);

const dummyTransport: HostTransport = {
  kind: 'local',
  connect: async () => {},
  publish: () => {},
  onAction: () => {},
  onPresence: () => {},
  onStatus: () => {},
  close: () => {},
};

describe('Schermate: rendering e controlli per fase', () => {
  it('home e sala d’attesa', () => {
    expect(html(<Home />)).toContain('Conduttore / Schermo TV');
    let s = createGame('ROOM1', 1, 1000);
    for (let i = 0; i < 3; i++) {
      const r = applyAction(s, { type: 'JOIN', name: `P${i + 1}`, token: TOKENS[i].id }, { now: 1000, actor: { kind: 'client', clientId: `c${i}` } });
      if (!r.ok) throw new Error(r.error);
      s = r.state;
    }
    const tv = html(<TvScreen view={view(s)} roomCode="ROOM1" joinLink="http://x/#/join/ROOM1" />);
    expect(tv).toContain('Unisciti alla partita');
    expect(tv).toContain('ROOM1');
    expect(html(<JoinForm state={s} roomCode="ROOM1" busy={false} onJoin={() => {}} />)).toContain('Entra in partita');
    expect(html(<PhoneLobby view={view(s)} me={s.players[0]} roomCode="ROOM1" busy={false} send={() => {}} />)).toContain('Ciao P1');
    const ctl = new HostController(dummyTransport, s);
    expect(html(<LobbyPanel ctl={ctl} state={s} kind="local" joinBase={{ base: 'http://x/', suggestions: [], setBase: () => {} }} onError={() => {}} />)).toContain('Avvia la partita');
  });

  it('inizio turno: solo il giocatore di turno può lanciare', () => {
    const g = mkGame(3);
    expect(turn(g, 0)).toContain('Lancia i dadi');
    expect(turn(g, 0)).toContain('È il tuo turno');
    expect(turn(g, 1)).not.toContain('Lancia i dadi');
    expect(turn(g, 1)).toContain('Turno di');
    const tv = html(<TvScreen view={view(g.s)} roomCode="TEST1" joinLink="x" />);
    expect(tv).toContain('Turno di');
  });

  it('decisione d’acquisto, contributo, sfida e carta', () => {
    const g = mkGame(3, 5, (s) => {
      s.settings.packs = { publisher: true, kids: false };
    });
    give(g, 1, [1]);
    rollTo(g, 1);
    expect(g.s.phase).toBe('resolving');
    const rent = turn(g, 0);
    expect(rent).toContain('Paga 6 Ore');
    expect(rent).toContain('Affronta una sfida');
    expect(html(<TvScreen view={view(g.s)} roomCode="TEST1" joinLink="x" />)).toContain('Contributo da pagare');

    run(g, 0, { type: 'START_CHALLENGE' });
    const q = getChallenge((g.s.pending as { questionId: string }).questionId)!;
    // chi risponde vede la domanda ma non la risposta; il proprietario vede la risposta e può valutare
    const mine = turn(g, 0);
    expect(mine).toContain('Rispondi a voce');
    expect(mine).not.toContain('Corretta');
    const owner = turn(g, 1);
    expect(owner).toContain('Corretta');
    expect(owner).toContain('Errata');
    expect(owner).toContain('Risposta attesa');
    const tv = html(<TvScreen view={view(g.s)} roomCode="TEST1" joinLink="x" />);
    expect(tv).toContain('Sfida in corso');
    expect(tv).not.toContain('Risposta attesa');
    void q;
    run(g, 1, { type: 'JUDGE_CHALLENGE', correct: true });

    const g2 = mkGame(3);
    rollTo(g2, 6);
    expect(turn(g2, 0)).toContain('Acquista per 100 Ore');
    expect(turn(g2, 0)).toContain('Rifiuta');
    expect(turn(g2, 1)).toContain('decide se acquistare');
    expect(html(<TvScreen view={view(g2.s)} roomCode="TEST1" joinLink="x" />)).toContain('Proprietà libera');

    const g3 = mkGame(3);
    rollTo(g3, 2); // Probabilità
    expect(g3.s.phase).toBe('card_draw');
    expect(turn(g3, 0)).toMatch(/Esegui|Conserva|Avanza|Vai|Paga|Ho capito/);
    expect(html(<TvScreen view={view(g3.s)} roomCode="TEST1" joinLink="x" />)).toContain('ha pescato una carta');
  });

  it('asta: tutti possono offrire, chi ha passato no', () => {
    const g = mkGame(3);
    rollTo(g, 6);
    run(g, 0, { type: 'DECLINE_PROPERTY' });
    run(g, 1, { type: 'BID', amount: 10 });
    expect(turn(g, 2)).toContain('Offri 20');
    expect(turn(g, 1)).toContain('miglior offerente');
    run(g, 2, { type: 'PASS_AUCTION' });
    expect(turn(g, 2)).toContain('Hai passato');
    expect(html(<TvScreen view={view(g.s)} roomCode="TEST1" joinLink="x" />)).toContain('Offerta corrente');
  });

  it('debito e bancarotta', () => {
    const g = mkGame(3);
    give(g, 1, [39]);
    g.s.props['39'].level = 5;
    g.s.bank.studies = 11;
    rollTo(g, 39);
    P(g, 0).cash = 5;
    run(g, 0, { type: 'PAY_RENT' });
    expect(g.s.phase).toBe('debt');
    const debtor = turn(g, 0);
    expect(debtor).toContain('Devi saldare un debito');
    expect(debtor).toContain('Dichiara bancarotta');
    expect(turn(g, 1)).toContain('deve');
    expect(html(<TvScreen view={view(g.s)} roomCode="TEST1" joinLink="x" />)).toContain('Debito da saldare');
    const ctl = new HostController(dummyTransport, g.s);
    expect(html(<ControlPanel ctl={ctl} view={view(g.s)} onError={() => {}} />)).toContain('Debito in corso');
  });

  it('Pausa organizzativa, fine turno, pausa del conduttore', () => {
    const g = mkGame(3);
    rollTo(g, 30);
    expect(g.s.phase).toBe('turn_end');
    expect(turn(g, 0)).toContain('Termina il turno');
    void runFail;
    const g2 = mkGame(3);
    P(g2, 0).inJail = true;
    P(g2, 0).position = 10;
    g2.s.phase = 'jail';
    const jail = turn(g2, 0);
    expect(jail).toContain('Pausa organizzativa');
    expect(jail).toContain('Paga 50 Ore');
    run(g2, 'host', { type: 'PAUSE' });
    expect(turn(g2, 0)).toContain('Partita in pausa');
    expect(html(<TvScreen view={view(g2.s)} roomCode="TEST1" joinLink="x" />)).toContain('Partita in pausa');
  });

  it('proprietà, scheda con azioni, scambi, banca', () => {
    const g = mkGame(3);
    give(g, 0, [1, 3, 6]);
    give(g, 1, [8]);
    const ctx = ctxFor(g, 0);
    expect(html(<PropertiesTab ctx={ctx} />)).toContain('Via Toledo');
    const sheet = html(<PropertySheet ctx={ctx} index={1} onClose={() => {}} />);
    expect(sheet).toContain('Aggiungi una visita ulteriore');
    expect(sheet).toContain('Ipoteca');
    expect(html(<PropertySheet ctx={ctx} index={8} onClose={() => {}} />)).toContain('Proponi uno scambio');
    expect(html(<TradesTab ctx={ctx} onReview={() => {}} />)).toContain('Nuova proposta di scambio');
    expect(html(<TradeBuilder ctx={ctx} preset={{ to: 'p2', request: [8] }} onClose={() => {}} />)).toContain('Tu offri');
    run(g, 0, { type: 'PROPOSE_TRADE', to: 'p2', offer: { cash: 50, squares: [6] }, request: { cash: 0, squares: [8] }, message: 'Ciao' });
    const ctx2 = ctxFor(g, 1);
    const review = html(<TradeReview ctx={ctx2} id={g.s.trades[0].id} onClose={() => {}} onCounter={() => {}} />);
    expect(review).toContain('Conferma e accetta');
    expect(review).toContain('Controproposta');
    expect(html(<Dashboard view={view(g.s)} playerId="p1" />)).toContain('Ore disponibili');
  });

  it('collegamenti rapidi: banca, proprietà per giocatore, aste e scambi', () => {
    const g = mkGame(3);
    give(g, 0, [1, 3]);
    give(g, 1, [6]);
    g.s.props['1'].level = 1;
    expect(html(<QuickLinks view={view(g.s)} />)).toContain('Banca');
    const bank = html(<BankPanel view={view(g.s)} />);
    expect(bank).toContain('Patrimonio');
    expect(bank).toContain('Segnalini in banca');
    const props = html(<PropertiesOverview state={g.s} />);
    expect(props).toContain('Via Toledo');
    expect(props).toContain('Ancora libere');
    expect(html(<AuctionsPanel view={view(g.s)} />)).toContain('Nessuna asta in corso');
    run(g, 0, { type: 'PROPOSE_TRADE', to: 'p2', offer: { cash: 10, squares: [] }, request: { cash: 0, squares: [6] } });
    expect(html(<TradesPanel state={g.s} />)).toContain('In attesa');
    run(g, 1, { type: 'ACCEPT_TRADE', id: g.s.trades[0].id });
    // scena di scambio concluso sulla TV (subito dopo l'accettazione)
    const tv = html(<TvScreen view={{ ...view(g.s), hostNow: () => g.s.hostTime + 200 }} roomCode="TEST1" joinLink="x" />);
    expect(tv).toContain('Scambio concluso');
  });

  it('fine partita e console del conduttore', () => {
    const g = mkGame(2);
    give(g, 1, [39]);
    g.s.props['39'].level = 5;
    g.s.bank.studies = 11;
    rollTo(g, 39);
    P(g, 0).cash = 5;
    run(g, 0, { type: 'PAY_RENT' });
    run(g, 0, { type: 'DECLARE_BANKRUPTCY' });
    expect(g.s.phase).toBe('game_over');
    expect(html(<GameOverView view={view(g.s)} />)).toContain('vince la partita');
    expect(turn(g, 1)).toContain('vince la partita');
    expect(html(<TvScreen view={view(g.s)} roomCode="TEST1" joinLink="x" />)).toContain('vince la partita');
    const ctl = new HostController(dummyTransport, g.s);
    expect(html(<ControlPanel ctl={ctl} view={view(g.s)} onError={() => {}} />)).toContain('Partita terminata');
    // posto da riprendere (partita già avviata)
    const g2 = mkGame(3);
    expect(html(<SeatPicker state={g2.s} roomCode="TEST1" busy={false} onClaim={() => {}} />)).toContain('La partita è già iniziata');
    void settle;
  });
});
