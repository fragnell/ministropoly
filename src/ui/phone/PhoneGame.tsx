import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Action } from '../../engine/actions';
import type { Trade } from '../../engine/types';
import type { ClientStore, ClientSnapshot } from '../../net/client';
import { LinkBadge, Pawn, PrefsMenu, cls } from '../components/common';
import { ActivityFeed, Dashboard } from '../components/panels';
import { findP, fmtMoney } from '../format';
import { vibrate, useWakeLock, type GameView } from '../hooks';
import { PhoneLobby } from './Join';
import { PropertiesTab, PropertySheet } from './PropertiesTab';
import { TradeBuilder, TradeReview, TradesTab } from './TradesTab';
import { TurnPanel } from './TurnPanel';
import type { PhoneCtx, Tab } from './types';

const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'game', icon: '🎲', label: 'Gioco' },
  { id: 'props', icon: '🏠', label: 'Proprietà' },
  { id: 'trades', icon: '🤝', label: 'Scambi' },
  { id: 'bank', icon: '🏦', label: 'Banca' },
  { id: 'log', icon: '📜', label: 'Registro' },
];

export function PhoneGame({ store, snap, roomCode }: { store: ClientStore; snap: ClientSnapshot; roomCode: string }) {
  const state = snap.state!;
  const me = snap.me!;
  const [tab, setTab] = useState<Tab>('game');
  const [sheet, setSheet] = useState<number | null>(null);
  const [builder, setBuilder] = useState<{ preset?: { to?: string; request?: number[]; offer?: number[]; offerCash?: number; reqCash?: number }; counterOf?: Trade } | null>(null);
  const [review, setReview] = useState<string | null>(null);
  const hostNow = store.hostNow;

  useWakeLock(state.phase !== 'lobby' && state.phase !== 'game_over');

  const view: GameView = useMemo(() => ({ state, log: snap.log, ledger: snap.ledger, hostNow }), [state, snap.log, snap.ledger, hostNow]);
  const send = useCallback((a: Action) => void store.send(a), [store]);

  // ---- segnali: vibrazione e passaggio automatico alla scheda "Gioco"
  const prevTurn = useRef<string | null>(null);
  const prevPhase = useRef(state.phase);
  useEffect(() => {
    const mineNow = state.currentPlayerId === me.id;
    if (mineNow && prevTurn.current !== me.id) {
      vibrate([120, 60, 120]);
      setTab('game');
    }
    prevTurn.current = state.currentPlayerId;
    if (state.phase === 'auction' && prevPhase.current !== 'auction') {
      vibrate(80);
      setTab('game');
    }
    if (state.phase === 'debt' && prevPhase.current !== 'debt' && state.pending?.kind === 'debt' && state.pending.debtorId === me.id) setTab('game');
    prevPhase.current = state.phase;
  }, [state.currentPlayerId, state.phase, state.pending, me.id]);

  // ---- proposte di scambio ricevute
  const incoming = state.trades.filter((t) => t.status === 'pending' && t.to === me.id);
  const seenTrades = useRef(new Set<string>());
  useEffect(() => {
    for (const t of incoming) {
      if (!seenTrades.current.has(t.id)) {
        seenTrades.current.add(t.id);
        vibrate([60, 40, 60]);
      }
    }
  }, [incoming]);

  // ---- scambio concluso: breve conferma con vibrazione
  const [info, setInfo] = useState<string | null>(null);
  const seenAccepted = useRef(new Set<string>());
  useEffect(() => {
    for (const t of state.trades) {
      if (t.status !== 'accepted' || (t.from !== me.id && t.to !== me.id) || seenAccepted.current.has(t.id)) continue;
      seenAccepted.current.add(t.id);
      if (t.resolvedAt != null && hostNow() - t.resolvedAt < 15000) {
        const other = findP(state, t.from === me.id ? t.to : t.from);
        setInfo(`🤝 Scambio concluso con ${other?.name ?? 'un giocatore'}`);
        vibrate([80, 40, 80]);
        setTimeout(() => setInfo(null), 4500);
      }
    }
  }, [state, me.id, hostNow]);

  // ---- notifiche (errori del motore, ecc.)
  useEffect(() => {
    if (!snap.notice) return;
    const id = setTimeout(() => store.clearNotice(), 4500);
    return () => clearTimeout(id);
  }, [snap.notice, store]);

  const ctx: PhoneCtx = {
    view,
    me,
    send,
    busy: snap.busy,
    goTab: setTab,
    openProperty: setSheet,
    openTrade: (preset) => setBuilder({ preset: preset ? { to: preset.to, request: preset.request } : undefined }),
  };

  const cur = findP(state, state.currentPlayerId);
  const mine = state.currentPlayerId === me.id && state.phase !== 'game_over' && state.phase !== 'lobby';

  return (
    <div className={cls('phone', mine && 'phone--turn')}>
      <header className="phead">
        <Pawn token={me.token} size="lg" />
        <div className="phead__id">
          <div className="phead__name">{me.name}</div>
          <div className={cls('phead__cash', 'mono', me.cash < 100 && 'neg')} aria-label={`Saldo ${me.cash} Ore`}>
            {fmtMoney(me.cash)} <small>Ore</small>
          </div>
        </div>
        <div className="phead__right">
          <LinkBadge link={snap.link} hostOnline={snap.hostOnline} />
          <PrefsMenu />
        </div>
      </header>

      {snap.link === 'offline' && <div className="pbanner pbanner--warn">Connessione persa… riprovo a ricollegarmi.</div>}
      {snap.link !== 'offline' && !snap.hostOnline && <div className="pbanner pbanner--warn">Il conduttore non è collegato: il gioco riprenderà appena torna.</div>}
      {!mine && state.phase !== 'lobby' && state.phase !== 'game_over' && cur && tab !== 'game' && (
        <button className="pbanner pbanner--info pbanner--btn" onClick={() => setTab('game')}>
          Turno di <b>{cur.name}</b> · tocca per tornare al gioco
        </button>
      )}
      {incoming.length > 0 && tab !== 'trades' && (
        <button className="pbanner pbanner--trade pbanner--btn" onClick={() => setReview(incoming[0].id)}>
          🤝 {findP(state, incoming[0].from)?.name} ti propone uno scambio — tocca per esaminarlo
        </button>
      )}

      <main className="pmain">
        {state.phase === 'lobby' ? (
          <PhoneLobby view={view} me={me} roomCode={roomCode} busy={snap.busy} send={send} />
        ) : tab === 'game' ? (
          <TurnPanel ctx={ctx} />
        ) : tab === 'props' ? (
          <PropertiesTab ctx={ctx} />
        ) : tab === 'trades' ? (
          <TradesTab ctx={ctx} onReview={setReview} />
        ) : tab === 'bank' ? (
          <Dashboard view={view} playerId={me.id} />
        ) : (
          <ActivityFeed entries={snap.log} limit={80} />
        )}
      </main>

      {state.phase !== 'lobby' && (
        <nav className="pnav" aria-label="Sezioni">
          {TABS.map((t) => (
            <button key={t.id} className={cls('pnav__btn', tab === t.id && 'is-on')} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              <span className="pnav__ico" aria-hidden="true">
                {t.icon}
              </span>
              <span>{t.label}</span>
              {t.id === 'trades' && incoming.length > 0 && <span className="pnav__badge">{incoming.length}</span>}
            </button>
          ))}
        </nav>
      )}

      {sheet != null && <PropertySheet ctx={ctx} index={sheet} onClose={() => setSheet(null)} />}
      {review && (
        <TradeReview
          ctx={ctx}
          id={review}
          onClose={() => setReview(null)}
          onCounter={(t) => {
            setReview(null);
            setBuilder({ preset: { to: t.from, offer: t.request.squares, offerCash: t.request.cash, request: t.offer.squares, reqCash: t.offer.cash }, counterOf: t });
          }}
        />
      )}
      {builder && <TradeBuilder ctx={ctx} preset={builder.preset} counterOf={builder.counterOf} onClose={() => setBuilder(null)} />}

      {info && !snap.notice && (
        <div className="toasts" role="status" aria-live="polite">
          <div className="toast toast--ok">{info}</div>
        </div>
      )}
      {snap.notice && (
        <div className="toasts" role="status" aria-live="polite">
          <div className={cls('toast', snap.notice.level === 'error' && 'toast--error')} onClick={() => store.clearNotice()}>
            {snap.notice.level === 'error' ? '⚠️' : 'ℹ️'} {snap.notice.text}
          </div>
        </div>
      )}
    </div>
  );
}
