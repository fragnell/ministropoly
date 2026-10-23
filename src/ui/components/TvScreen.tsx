/**
 * Schermata principale (TV o tablet): tabellone, giocatori, registro e finestre di decisione.
 * È di sola lettura: mostra lo stato pubblicato dal conduttore.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { GAME_NAME } from '../../config/game.config';
import { SQUARES } from '../../config/board';
import { findP, fmtOre } from '../format';
import { toggleFullscreen, useHostNow, type GameView } from '../hooks';
import { Board, useDisplayPositions } from './Board';
import { PropertyCard } from './cards';
import { Chip, LinkBadge, Modal, PrefsMenu } from './common';
import { ActivityFeed, PlayersPanel } from './panels';
import { QuickLinks } from './QuickPanels';
import { BoardCenter, GameOverStage, LobbyStage, PausedBanner, Stage } from './Stage';
import { elapsedMs } from '../../engine/state';
import { fmtDuration } from '../format';

export interface TvProps {
  view: GameView;
  roomCode: string;
  joinLink: string;
  link?: 'connecting' | 'online' | 'offline';
  hostOnline?: boolean;
  /** contenuto extra nella barra superiore (es. pulsanti del conduttore) */
  topExtra?: ReactNode;
  embedded?: boolean;
}

export function TvScreen({ view, roomCode, joinLink, link = 'online', hostOnline = true, topExtra, embedded }: TvProps) {
  const { state } = view;
  const positions = useDisplayPositions(view);
  const [detail, setDetail] = useState<number | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [logOpen, setLogOpen] = useState(false);
  const now = useHostNow(view.hostNow, 1000);

  useEffect(() => {
    if (embedded) return;
    document.documentElement.classList.add('is-tv');
    return () => document.documentElement.classList.remove('is-tv');
  }, [embedded]);

  const stage = Stage({ view });
  const rent = state.pending?.kind === 'rent' || state.pending?.kind === 'challenge' ? state.pending : null;
  const rentTag = rent ? { square: rent.square, text: `Contributo ${rent.amount}` } : null;
  const pendingTrades = useMemo(() => state.trades.filter((t) => t.status === 'pending'), [state.trades]);
  const timeLeft = state.settings.speedMode.enabled && state.startedAt ? state.settings.speedMode.minutes * 60000 - elapsedMs(state, now) : null;

  let center: ReactNode;
  if (state.phase === 'lobby') center = <LobbyStage view={view} joinLink={joinLink} roomCode={roomCode} />;
  else center = <BoardCenter view={view} />;
  const showSide = state.phase !== 'lobby' && state.phase !== 'game_over';

  const showTimer = timeLeft != null && state.phase !== 'lobby' && state.phase !== 'game_over';
  const showSummaryReopen = state.phase === 'game_over' && !summaryOpen;
  const hasTopRow = !embedded || showTimer || showSummaryReopen || !!topExtra;

  return (
    <div className={embedded ? 'tv tv--embedded' : 'tv'}>
      {hasTopRow && (
        <header className="tv__top">
          {!embedded && (
            <>
              <div className="tv__brand">
                <span className="tv__logo" aria-hidden="true">
                  🏛️
                </span>
                <b>{GAME_NAME}</b>
              </div>
              <div className="tv__top-mid">
                <Chip tone="gold">Stanza {roomCode}</Chip>
                {showTimer && <Chip tone={timeLeft! < 300000 ? 'warn' : 'plain'}>⏱ {state.timeUp ? 'ultimo giro' : fmtDuration(Math.max(0, timeLeft!))}</Chip>}
                <LinkBadge link={link} hostOnline={hostOnline} />
              </div>
            </>
          )}
          {embedded && showTimer && <Chip tone={timeLeft! < 300000 ? 'warn' : 'plain'}>⏱ {state.timeUp ? 'ultimo giro' : fmtDuration(Math.max(0, timeLeft!))}</Chip>}
          <div className="row">
            {topExtra}
            {showSummaryReopen && (
              <button className="btn btn--gold btn--sm" onClick={() => setSummaryOpen(true)}>
                🏆 Riepilogo
              </button>
            )}
            {!embedded && (
              <button className="btn btn--ghost btn--sm" onClick={toggleFullscreen} aria-label="Schermo intero" title="Schermo intero">
                ⛶
              </button>
            )}
            {!embedded && <PrefsMenu />}
          </div>
        </header>
      )}

      {showSide && (
        <aside className="tv__left">
          {stage && <div className="tv__stage">{stage}</div>}
          <QuickLinks view={view} />
        </aside>
      )}

      <main className="tv__board">
        <Board view={view} positions={positions} onSquareClick={setDetail} rentTag={rentTag}>
          {center}
        </Board>
      </main>

      <aside className="tv__right">
        {pendingTrades.length > 0 && (
          <section className="tv__trades">
            <h3 className="tv__h">Proposte di scambio</h3>
            <ul className="tv__tlist">
              {pendingTrades.map((t) => (
                <li key={t.id}>
                  <b>{findP(state, t.from)?.name}</b> → <b>{findP(state, t.to)?.name}</b>
                  <div className="small muted">
                    {t.offer.cash > 0 ? fmtOre(t.offer.cash) : ''}
                    {t.offer.squares.length ? ` ${t.offer.squares.length} propr.` : ''} ⇄ {t.request.cash > 0 ? fmtOre(t.request.cash) : ''}
                    {t.request.squares.length ? ` ${t.request.squares.length} propr.` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="tv__history">
          <h3 className="tv__h">Cronologia</h3>
          <ActivityFeed entries={view.log} limit={3} />
          {view.log.length > 0 && (
            <button className="tv__more" onClick={() => setLogOpen(true)}>
              ⌄ Mostra cronologia completa
            </button>
          )}
        </section>
        <section className="tv__players">
          <h3 className="tv__h">Giocatori</h3>
          <div className="tv__players-scroll">
            <PlayersPanel view={view} />
          </div>
        </section>
      </aside>

      {logOpen && (
        <Modal onClose={() => setLogOpen(false)} title="Cronologia completa">
          <ActivityFeed entries={view.log} limit={400} />
        </Modal>
      )}

      {state.paused && <PausedBanner />}
      {state.phase === 'game_over' && summaryOpen && <GameOverStage view={view} onClose={() => setSummaryOpen(false)} />}

      {detail != null && SQUARES[detail] && (SQUARES[detail].kind === 'street' || SQUARES[detail].kind === 'special' || SQUARES[detail].kind === 'utility') && (
        <Modal onClose={() => setDetail(null)} label="Scheda della proprietà">
          <PropertyCard state={state} index={detail} />
        </Modal>
      )}
      {detail != null && SQUARES[detail] && !(SQUARES[detail].kind === 'street' || SQUARES[detail].kind === 'special' || SQUARES[detail].kind === 'utility') && (
        <Modal onClose={() => setDetail(null)} title={SQUARES[detail].name}>
          <p style={{ fontSize: '2.4rem', textAlign: 'center', margin: 0 }}>{SQUARES[detail].icon}</p>
          <p>{SQUARES[detail].note ?? 'Casella speciale.'}</p>
        </Modal>
      )}
    </div>
  );
}

