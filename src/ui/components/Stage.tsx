/**
 * Riquadro centrale del tabellone: mostra ciò che sta accadendo, in grande, per chi guarda la TV.
 */
import type { ReactNode } from 'react';
import { SQUARES } from '../../config/board';
import { DECK_TITLES } from '../../config/cards';
import { ECONOMY, GAME_NAME, GAME_TAGLINE, TIMING } from '../../config/game.config';
import { debtTotal, liquidationPotential } from '../../engine/selectors';
import { elapsedMs } from '../../engine/state';
import { fmtDuration, fmtMoney, fmtOre, findP } from '../format';
import { useHostNow, type GameView } from '../hooks';
import { ChallengeFace, CardFace, PropertyCard } from './cards';
import { Button, Chip, DicePair, Pawn, QrImage } from './common';
import { AuctionView, GameOverView, SideList } from './panels';
import { getChallenge } from '../../config/challenges';
import type { Trade } from '../../engine/types';

export function BoardCenter({ view }: { view: GameView }) {
  const { state } = view;
  const cur = findP(state, state.currentPlayerId);
  const last = view.log[view.log.length - 1];
  const now = useHostNow(view.hostNow, 1000);
  const left = state.settings.speedMode.enabled && state.startedAt ? state.settings.speedMode.minutes * 60000 - elapsedMs(state, now) : null;
  return (
    <div className="bc">
      <div className="bc__logo">{GAME_NAME}</div>
      <div className="bc__tag">{GAME_TAGLINE}</div>
      {cur && state.phase !== 'game_over' && (
        <div className="bc__turn">
          <Pawn token={cur.token} size="lg" />
          <div>
            <div className="bc__small">Turno di</div>
            <div className="bc__big">{cur.name}</div>
            <div className="bc__small">{fmtOre(cur.cash)}</div>
          </div>
        </div>
      )}
      {state.roll && state.phase !== 'lobby' && (
        <div className="bc__dice">
          <DicePair dice={state.roll.dice} rolling={false} size="md" />
        </div>
      )}
      {last && <div className="bc__last">{last.text}</div>}
      <div className="bc__meta">
        {state.round > 0 && <Chip>Giro {state.round}</Chip>}
        {left != null && <Chip tone={left < 300000 ? 'warn' : 'gold'}>⏱ {state.timeUp ? 'ultimo giro' : fmtDuration(Math.max(0, left))}</Chip>}
        {state.settings.packs.publisher && <Chip tone="info">Publisher Power Pack</Chip>}
        {state.settings.packs.kids && <Chip tone="info">Kids Power Pack</Chip>}
      </div>
    </div>
  );
}

export function LobbyStage({ view, joinLink, roomCode }: { view: GameView; joinLink: string; roomCode: string }) {
  const { state } = view;
  return (
    <div className="stage stage--lobby">
      <div className="stage__art">
        <QrImage text={joinLink} size={260} />
        <div className="stage__code" aria-label={`Codice stanza ${roomCode}`}>
          {roomCode}
        </div>
      </div>
      <div className="stage__txt">
        <h2>Unisciti alla partita</h2>
        <ol className="steps">
          <li>Inquadra il codice QR con il telefono</li>
          <li>
            oppure apri la pagina e inserisci il codice <b>{roomCode}</b>
          </li>
          <li>Scegli un nickname e una pedina</li>
        </ol>
        <div className="lobby-players">
          {state.players.length === 0 && <span className="muted">Nessun giocatore ancora…</span>}
          {state.players.map((p) => (
            <span key={p.id} className="lobby-player">
              <Pawn token={p.token} size="md" />
              <b>{p.name}</b>
            </span>
          ))}
        </div>
        <div className="small muted">Servono almeno {ECONOMY.players.min} giocatori. Il conduttore avvia la partita.</div>
      </div>
    </div>
  );
}

function Who({ id, view }: { id: string | null | undefined; view: GameView }) {
  const p = findP(view.state, id);
  if (!p) return null;
  return (
    <span className="who">
      <Pawn token={p.token} size="sm" /> <b>{p.name}</b>
    </span>
  );
}

/** Quello che avviene adesso, in grande. Restituisce null se non c'è nulla da evidenziare. */
export function Stage({ view }: { view: GameView }): ReactNode {
  const { state } = view;
  const now = useHostNow(view.hostNow, 250);
  const cur = findP(state, state.currentPlayerId);
  const pend = state.pending;

  // esito recente di una sfida
  const lc = state.lastChallenge;
  const recentChallenge = lc && now - lc.at < TIMING.resultLingerMs && state.phase !== 'game_over' ? lc : null;
  // scambio appena concluso
  const recentTrade = state.trades.filter((t) => t.status === 'accepted' && t.resolvedAt != null && now - t.resolvedAt < 6000 && now >= t.resolvedAt - 500).at(-1) ?? null;

  switch (state.phase) {
    case 'rolling':
      return (
        <div className="stage stage--center">
          <div className="stage__big">
            <Who id={cur?.id} view={view} /> lancia i dadi…
          </div>
          <DicePair dice={state.roll?.dice ?? null} rolling={!!state.roll && now < state.roll.endsAt - 250} size="lg" />
          {state.roll && now >= state.roll.endsAt - 250 && (
            <div className="stage__big">
              {state.roll.dice[0]} + {state.roll.dice[1]} = <b>{state.roll.total}</b>
              {state.roll.isDouble && ' · Doppio!'}
            </div>
          )}
        </div>
      );
    case 'moving':
      return (
        <div className="stage stage--center">
          <DicePair dice={state.roll?.dice ?? null} rolling={false} size="lg" />
          <div className="stage__big">
            <Who id={cur?.id} view={view} /> avanza…
          </div>
        </div>
      );
    case 'buy_decision':
      if (pend?.kind !== 'buy') return null;
      return (
        <div className="stage">
          <div className="stage__art">
            <PropertyCard state={state} index={pend.square} />
          </div>
          <div className="stage__txt">
            <h2>Proprietà libera</h2>
            <p className="stage__big">
              <Who id={cur?.id} view={view} /> può acquistarla per <b>{fmtOre(SQUARES[pend.square].price ?? 0)}</b>
            </p>
            <p className="muted">Se rifiuta, si avvia un’asta aperta a tutti.</p>
          </div>
        </div>
      );
    case 'resolving':
      if (pend?.kind === 'rent') {
        return (
          <div className="stage">
            <div className="stage__art">
              <PropertyCard state={state} index={pend.square} compact />
            </div>
            <div className="stage__txt">
              <h2>Contributo da pagare</h2>
              <p className="stage__big">
                <Who id={cur?.id} view={view} /> deve <b>{fmtOre(pend.amount)}</b> a <Who id={pend.ownerId} view={view} />
              </p>
              <p className="muted">{pend.formula}</p>
              {pend.canChallenge && <Chip tone="info">Può affrontare una sfida per evitarlo</Chip>}
            </div>
          </div>
        );
      }
      if (pend?.kind === 'challenge') {
        return (
          <div className="stage">
            <div className="stage__art stage__art--wide">
              <ChallengeFace questionId={pend.questionId} who={cur?.name} />
            </div>
            <div className="stage__txt">
              <h2>Sfida in corso</h2>
              <p className="stage__big">
                <Who id={cur?.id} view={view} /> risponde a voce.
              </p>
              <p>
                Valuta la risposta: <Who id={pend.ownerId} view={view} /> (o il conduttore).
              </p>
              <p className="muted">Se è corretta, il contributo di {fmtOre(pend.amount)} è annullato.</p>
            </div>
          </div>
        );
      }
      if (pend?.kind === 'expense') {
        return (
          <div className="stage stage--center">
            <p className="stage__big">
              <Who id={cur?.id} view={view} /> deve pagare <b>{fmtOre(pend.amount)}</b>
            </p>
            <p className="muted">{pend.reason} — può usare la carta «Spesa evitata».</p>
          </div>
        );
      }
      if (recentChallenge) return <ChallengeResult view={view} />;
      return null;
    case 'card_draw':
      if (pend?.kind !== 'card') return null;
      return (
        <div className="stage">
          <div className="stage__art">
            <CardFace cardId={pend.cardId} big />
          </div>
          <div className="stage__txt">
            <h2>{DECK_TITLES[pend.deck]}</h2>
            <p className="stage__big">
              <Who id={cur?.id} view={view} /> ha pescato una carta.
            </p>
            <p className="muted">Quando ha letto, tocca «Esegui» sul telefono.</p>
          </div>
        </div>
      );
    case 'auction':
      return (
        <div className="stage stage--auction">
          <h2 className="stage__title">Asta</h2>
          <AuctionView view={view} />
        </div>
      );
    case 'debt': {
      if (pend?.kind !== 'debt') return null;
      const debtor = findP(state, pend.debtorId);
      return (
        <div className="stage stage--center">
          <h2>Debito da saldare</h2>
          <p className="stage__big">
            <Who id={pend.debtorId} view={view} /> deve <b>{fmtOre(debtTotal(state))}</b>
          </p>
          <p>
            Saldo: <b>{fmtOre(debtor?.cash ?? 0)}</b> · Può ottenere al massimo {fmtOre(debtor ? liquidationPotential(state, debtor.id) : 0)}
          </p>
          <p className="muted">Può vendere sviluppi, ipotecare proprietà o chiedere uno scambio. Altrimenti dichiara bancarotta.</p>
        </div>
      );
    }
    case 'jail':
      return (
        <div className="stage stage--center">
          <div className="stage__icon">☕</div>
          <p className="stage__big">
            <Who id={cur?.id} view={view} /> è nella Pausa organizzativa
          </p>
          <p className="muted">
            Tentativo {Math.min((cur?.jailTurns ?? 0) + 1, ECONOMY.jailMaxAttempts)} di {ECONOMY.jailMaxAttempts}: un doppio per uscire, oppure {ECONOMY.jailFine} Ore.
          </p>
        </div>
      );
    case 'turn_start':
    case 'turn_end':
      if (recentChallenge) return <ChallengeResult view={view} />;
      if (recentTrade) return <TradeDone view={view} trade={recentTrade} />;
      return null;
    default:
      return null;
  }
}

/** Breve animazione quando uno scambio va a buon fine */
function TradeDone({ view, trade }: { view: GameView; trade: Trade }) {
  const s = view.state;
  return (
    <div className="stage stage--center tradedone">
      <div className="tradedone__ico" aria-hidden="true">
        🤝
      </div>
      <h2>Scambio concluso!</h2>
      <p className="stage__big">
        <Who id={trade.from} view={view} /> ⇄ <Who id={trade.to} view={view} />
      </p>
      <div className="trade__cols" style={{ maxWidth: '70%' }}>
        <div className="trade__col">
          <b>{findP(s, trade.from)?.name} cede</b>
          <SideList state={s} side={trade.offer} />
        </div>
        <div className="trade__col">
          <b>{findP(s, trade.to)?.name} cede</b>
          <SideList state={s} side={trade.request} />
        </div>
      </div>
    </div>
  );
}

function ChallengeResult({ view }: { view: GameView }) {
  const lc = view.state.lastChallenge;
  if (!lc) return null;
  const q = getChallenge(lc.questionId);
  return (
    <div className="stage">
      <div className="stage__art stage__art--wide">
        <ChallengeFace questionId={lc.questionId} reveal who={findP(view.state, lc.playerId)?.name} />
      </div>
      <div className="stage__txt">
        <h2>{lc.correct ? '✅ Risposta corretta!' : '❌ Risposta non corretta'}</h2>
        <p className="stage__big">{lc.correct ? `Nessun contributo da pagare (${fmtMoney(lc.amount)} Ore annullate).` : `Si paga il contributo di ${fmtOre(lc.amount)}.`}</p>
        {q && <p className="muted">Ogni sfida è un’occasione per imparare insieme.</p>}
      </div>
    </div>
  );
}

export function PausedBanner() {
  return (
    <div className="paused" role="status">
      <div className="paused__box">
        <div className="paused__icon">⏸</div>
        <h2>Partita in pausa</h2>
        <p>Il conduttore riprenderà il gioco a breve.</p>
      </div>
    </div>
  );
}

export function GameOverStage({ view, onClose }: { view: GameView; onClose?: () => void }) {
  return (
    <div className="gameover-wrap">
      <div>
        <GameOverView view={view} />
        {onClose && (
          <div className="center" style={{ marginTop: 12 }}>
            <Button variant="secondary" onClick={onClose}>
              Mostra il tabellone e la cronologia
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

