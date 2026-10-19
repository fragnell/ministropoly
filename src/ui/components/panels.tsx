import { useState, type ReactNode } from 'react';
import { SQUARES, squareLabel } from '../../config/board';
import { GROUPS } from '../../config/game.config';
import { economySnapshot, fullGroupsOwned, minimumBidOf, netWorth, ownedSquares } from '../../engine/selectors';
import type { Action } from '../../engine/actions';
import type { GameState, LedgerEntry, LogEntry, Player, Trade, TradeSide } from '../../engine/types';
import { CATEGORY_LABELS, fmtDuration, fmtMoney, fmtOre, fmtSigned, fmtTime, findP, nameOf } from '../format';
import { useHostNow, type GameView } from '../hooks';
import { PropertyCard } from './cards';
import { Button, Chip, Countdown, EmptyNote, Pawn, cls } from './common';

// ------------------------------------------------------------------ registro eventi

export function ActivityFeed({ entries, limit = 40, showTime = true }: { entries: LogEntry[]; limit?: number; showTime?: boolean }) {
  const list = entries.slice(-limit).reverse();
  if (list.length === 0) return <EmptyNote>Nessun evento ancora.</EmptyNote>;
  return (
    <ul className="feed">
      {list.map((e) => (
        <li key={e.seq} className={cls('feed__item', `feed__item--${e.kind}`)}>
          {showTime && <span className="feed__time">{fmtTime(e.ts)}</span>}
          <span>{e.text}</span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ giocatori

export function statusChips(state: GameState, p: Player): ReactNode {
  return (
    <>
      {p.bankrupt && <Chip tone="danger">In bancarotta</Chip>}
      {!p.bankrupt && p.inJail && <Chip tone="warn">☕ Pausa organizzativa</Chip>}
      {!p.bankrupt && p.skipTurn && <Chip tone="warn">Salta un turno</Chip>}
      {!p.bankrupt && !p.isBot && !p.connected && state.phase !== 'lobby' && <Chip tone="danger">Scollegato</Chip>}
      {!p.bankrupt && p.heldCards.length > 0 && <Chip tone="info">🃏 {p.heldCards.length}</Chip>}
      {!p.bankrupt && p.isBot && <Chip>Virtuale</Chip>}
    </>
  );
}

export function PlayersPanel({ view, highlightId, onPick }: { view: GameView; highlightId?: string | null; onPick?: (id: string) => void }) {
  const { state } = view;
  const order = state.turnOrder.length ? state.turnOrder.map((id) => findP(state, id)).filter((p): p is Player => !!p) : state.players;
  return (
    <ul className="plist">
      {order.map((p) => {
        const owned = ownedSquares(state, p.id);
        const groups = fullGroupsOwned(state, p.id);
        const isTurn = state.currentPlayerId === p.id && state.phase !== 'lobby' && state.phase !== 'game_over';
        return (
          <li
            key={p.id}
            className={cls('pl', isTurn && 'is-turn', p.bankrupt && 'is-out', highlightId === p.id && 'is-me')}
            onClick={onPick ? () => onPick(p.id) : undefined}
            role={onPick ? 'button' : undefined}
          >
            <Pawn token={p.token} size="md" dim={p.bankrupt} />
            <div className="pl__main">
              <div className="pl__name">
                {p.name}
                {isTurn && <span className="pl__turn">turno</span>}
              </div>
              <div className="pl__sub">
                <span>🏠 {owned.length}</span>
                <span title="Patrimonio">Patr. {fmtMoney(netWorth(state, p.id))}</span>
                {groups.map((g) => (
                  <span key={g} className="pl__grp" style={{ background: GROUPS[g].color, color: GROUPS[g].ink }} title={`Gruppo ${GROUPS[g].label} completo`}>
                    {GROUPS[g].number}
                  </span>
                ))}
              </div>
              <div className="pl__chips">{statusChips(state, p)}</div>
            </div>
            <div className="pl__cash mono">{p.bankrupt ? '—' : fmtMoney(p.cash)}</div>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ asta

export function AuctionView({
  view,
  controls,
}: {
  view: GameView;
  controls?: { me: Player; send: (a: Action) => void; busy: boolean };
}) {
  const { state } = view;
  const a = state.auction;
  const now = useHostNow(view.hostNow, 100);
  const [custom, setCustom] = useState('');
  if (!a) return null;
  const high = findP(state, a.highBidder);
  const min = minimumBidOf(a);
  const me = controls?.me;
  const passed = !!me && a.passed.includes(me.id);
  const iAmHigh = !!me && a.highBidder === me.id;
  const canBid = !!me && !passed && !iAmHigh && me.cash >= min && !state.paused;
  const quick = [min, min + 10, min + 50, min + 100].filter((v, i, arr) => arr.indexOf(v) === i && me && v <= me.cash);

  return (
    <div className="auction">
      <div className="auction__prop">
        <PropertyCard state={state} index={a.square} compact />
      </div>
      <div className="auction__side">
        <div className="auction__bid">
          <span className="muted small">Offerta corrente</span>
          <b className="auction__amount mono">{a.highBid > 0 ? fmtMoney(a.highBid) : '—'}</b>
          {high ? (
            <span className="row" style={{ gap: 6 }}>
              <Pawn token={high.token} size="sm" />
              <b>{high.name}</b>
            </span>
          ) : (
            <span className="muted small">Nessuna offerta (minimo {fmtMoney(a.startingBid)})</span>
          )}
        </div>
        <Countdown endsAt={a.endsAt} hostNow={now} totalMs={a.seconds * 1000} paused={state.paused?.since ?? null} />
        {state.paused && <Chip tone="warn">Asta sospesa dal conduttore</Chip>}
        <div className="muted small">Incremento minimo: {fmtMoney(a.minIncrement)} Ore · prossima offerta da {fmtMoney(min)}</div>
        <ul className="auction__players">
          {state.players
            .filter((p) => !p.bankrupt)
            .map((p) => (
              <li key={p.id} className={cls(a.highBidder === p.id && 'is-high', a.passed.includes(p.id) && 'is-passed')}>
                <Pawn token={p.token} size="xs" />
                <span className="grow">{p.name}</span>
                <span className="mono small">{fmtMoney(p.cash)}</span>
                <span className="small">{a.highBidder === p.id ? '🥇 in testa' : a.passed.includes(p.id) ? 'ha passato' : 'in gara'}</span>
              </li>
            ))}
        </ul>
        {controls && me && (
          <div className="auction__ctl">
            <div className="small muted">
              Il tuo saldo: <b>{fmtOre(me.cash)}</b>
            </div>
            {passed ? (
              <Chip tone="warn">Hai passato: non puoi rientrare in questa asta</Chip>
            ) : iAmHigh ? (
              <Chip tone="ok">Sei il miglior offerente: attendi</Chip>
            ) : (
              <>
                <div className="auction__quick">
                  {quick.length === 0 && <span className="muted small">Non hai Ore sufficienti per offrire.</span>}
                  {quick.map((v, i) => (
                    <Button key={v} size="lg" variant={i === 0 ? 'primary' : 'secondary'} disabled={!canBid || controls.busy} onClick={() => controls.send({ type: 'BID', amount: v })}>
                      Offri {fmtMoney(v)}
                    </Button>
                  ))}
                </div>
                <div className="row">
                  <input className="input" inputMode="numeric" placeholder="Altra cifra" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, ''))} aria-label="Offerta personalizzata" />
                  <Button variant="secondary" disabled={!canBid || !custom || controls.busy} onClick={() => controls.send({ type: 'BID', amount: Number(custom) })}>
                    Offri
                  </Button>
                </div>
                <Button variant="ghost" block disabled={controls.busy} onClick={() => controls.send({ type: 'PASS_AUCTION' })}>
                  Passo
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ scambi

export function SideList({ state, side }: { state: GameState; side: TradeSide }) {
  if (side.cash === 0 && side.squares.length === 0) return <span className="muted">Niente</span>;
  return (
    <ul className="tside">
      {side.cash > 0 && <li>💶 {fmtOre(side.cash)}</li>}
      {side.squares.map((i) => (
        <li key={i}>
          <span className="tside__dot" style={{ background: SQUARES[i].group ? GROUPS[SQUARES[i].group as string].color : 'var(--petrol)' }} />
          {squareLabel(i)}
        </li>
      ))}
    </ul>
  );
}

/** Riepilogo a due colonne: che cosa cede e che cosa riceve ciascun giocatore, con i nuovi saldi */
export function TradeSummary({ state, trade, fromId, toId, offer, request }: { state: GameState; trade?: Trade; fromId?: string; toId?: string; offer?: TradeSide; request?: TradeSide }) {
  const from = findP(state, trade?.from ?? fromId);
  const to = findP(state, trade?.to ?? toId);
  const o = trade?.offer ?? offer ?? { cash: 0, squares: [] };
  const r = trade?.request ?? request ?? { cash: 0, squares: [] };
  if (!from || !to) return null;
  const fromAfter = from.cash - o.cash + r.cash;
  const toAfter = to.cash + o.cash - r.cash;
  return (
    <div className="trade">
      <div className="trade__cols">
        <section className="trade__col">
          <header>
            <Pawn token={from.token} size="sm" /> <b>{from.name}</b>
          </header>
          <div className="small muted">Cede</div>
          <SideList state={state} side={o} />
          <div className="small muted">Riceve</div>
          <SideList state={state} side={r} />
          <div className="trade__after">
            Ore: <b className="mono">{fmtMoney(from.cash)}</b> → <b className={cls('mono', fromAfter < 0 ? 'neg' : fromAfter >= from.cash ? 'pos' : '')}>{fmtMoney(fromAfter)}</b>
            <div className="small muted">
              {o.cash > 0 && `− ${fmtMoney(o.cash)} in uscita `}
              {r.cash > 0 && `+ ${fmtMoney(r.cash)} in entrata`}
            </div>
          </div>
        </section>
        <section className="trade__col">
          <header>
            <Pawn token={to.token} size="sm" /> <b>{to.name}</b>
          </header>
          <div className="small muted">Cede</div>
          <SideList state={state} side={r} />
          <div className="small muted">Riceve</div>
          <SideList state={state} side={o} />
          <div className="trade__after">
            Ore: <b className="mono">{fmtMoney(to.cash)}</b> → <b className={cls('mono', toAfter < 0 ? 'neg' : toAfter >= to.cash ? 'pos' : '')}>{fmtMoney(toAfter)}</b>
            <div className="small muted">
              {r.cash > 0 && `− ${fmtMoney(r.cash)} in uscita `}
              {o.cash > 0 && `+ ${fmtMoney(o.cash)} in entrata`}
            </div>
          </div>
        </section>
      </div>
      {trade?.message && <blockquote className="trade__msg">“{trade.message}”</blockquote>}
      <div className="small muted">Lo scambio avviene in un’unica operazione: proprietà e Ore passano insieme oppure non passa nulla.</div>
    </div>
  );
}

// ------------------------------------------------------------------ dashboard economica

export function LedgerList({ state, entries, playerId, limit = 25 }: { state: GameState; entries: LedgerEntry[]; playerId?: string; limit?: number }) {
  const list = entries
    .filter((e) => !playerId || e.from === playerId || e.to === playerId)
    .slice(-limit)
    .reverse();
  if (list.length === 0) return <EmptyNote>Nessuna operazione registrata.</EmptyNote>;
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Ora</th>
          <th>Causale</th>
          <th>Con</th>
          <th className="num">Importo</th>
          <th className="num">Saldo</th>
        </tr>
      </thead>
      <tbody>
        {list.map((e) => {
          const mineOut = playerId ? e.from === playerId : false;
          const sign = playerId ? (mineOut ? -1 : 1) : 0;
          const before = playerId ? (mineOut ? e.fromBefore : e.toBefore) : undefined;
          const after = playerId ? (mineOut ? e.fromAfter : e.toAfter) : undefined;
          const other = playerId ? (mineOut ? e.to : e.from) : null;
          return (
            <tr key={e.seq}>
              <td className="small muted">{fmtTime(e.ts)}</td>
              <td>
                <div>{e.reason}</div>
                <div className="small muted">
                  {CATEGORY_LABELS[e.category]}
                  {e.square != null ? ` · ${squareLabel(e.square)}` : ''}
                </div>
              </td>
              <td className="small">{playerId ? nameOf(state, other) : `${nameOf(state, e.from)} → ${nameOf(state, e.to)}`}</td>
              <td className={cls('num', sign > 0 && 'pos', sign < 0 && 'neg')}>{playerId ? fmtSigned(sign * e.amount) : fmtMoney(e.amount)}</td>
              <td className="num small">{before != null && after != null ? `${fmtMoney(before)} → ${fmtMoney(after)}` : ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Dashboard({ view, playerId }: { view: GameView; playerId: string }) {
  const { state } = view;
  const p = findP(state, playerId);
  if (!p) return null;
  const eco = economySnapshot(state, playerId);
  return (
    <div className="stack">
      <div className="kpi-grid">
        <Kpi label="Ore disponibili" value={fmtMoney(eco.cash)} strong />
        <Kpi label="Patrimonio (a fine tempo)" value={fmtMoney(eco.netWorth)} />
        <Kpi label="Proprietà possedute" value={String(eco.propertyCount)} />
        <Kpi label="Prezzo originario proprietà" value={fmtMoney(eco.originalPrice)} />
        <Kpi label="Valore degli sviluppi" value={fmtMoney(eco.developmentValue)} hint={`${eco.visits} visite · ${eco.studies} studi`} />
        <Kpi label="Proprietà ipotecate" value={String(eco.mortgagedCount)} />
        <Kpi label="Contributi incassati" value={fmtMoney(p.stats.rentIn)} />
        <Kpi label="Contributi pagati" value={fmtMoney(p.stats.rentOut)} />
        <Kpi label="Incassato dalla banca" value={fmtMoney(p.stats.fromBank)} />
        <Kpi label="Spese sostenute" value={fmtMoney(p.stats.expenses)} hint={`${fmtMoney(p.stats.toBank)} alla banca`} />
        <Kpi label="Debito attivo" value={eco.activeDebt > 0 ? fmtMoney(eco.activeDebt) : '—'} tone={eco.activeDebt > 0 ? 'bad' : undefined} />
        <Kpi label="Entrate totali" value={fmtMoney(p.stats.income)} />
      </div>
      <h3>Ultime transazioni</h3>
      <LedgerList state={state} entries={view.ledger} playerId={playerId} limit={20} />
    </div>
  );
}

function Kpi({ label, value, hint, strong, tone }: { label: string; value: string; hint?: string; strong?: boolean; tone?: 'bad' }) {
  return (
    <div className={cls('kpi', strong && 'kpi--strong')}>
      <div className={cls('kpi__v', tone === 'bad' && 'neg')}>{value}</div>
      <div className="kpi__l">{label}</div>
      {hint && <div className="kpi__l">{hint}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ fine partita

export function GameOverView({ view }: { view: GameView }) {
  const { state } = view;
  const sum = state.summary;
  if (!sum) return null;
  const winner = findP(state, sum.winnerId);
  return (
    <div className="gameover">
      <div className="gameover__trophy" aria-hidden="true">
        🏆
      </div>
      <h2>{winner ? `${winner.name} vince la partita!` : 'Partita terminata'}</h2>
      <p className="muted">
        {sum.reason === 'last_standing' ? 'È rimasto l’ultimo giocatore in gioco.' : sum.reason === 'time' ? 'Il tempo è scaduto: vince il patrimonio più alto.' : 'Partita chiusa dal conduttore.'} Durata {fmtDuration(sum.durationMs)} · {sum.turns} turni.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Giocatore</th>
            <th className="num">Patrimonio</th>
            <th className="num">Ore</th>
            <th className="num">Proprietà</th>
            <th className="num">Sviluppi</th>
            <th className="num">Entrate</th>
            <th className="num">Spese</th>
          </tr>
        </thead>
        <tbody>
          {sum.standings.map((r) => {
            const p = findP(state, r.playerId);
            return (
              <tr key={r.playerId}>
                <td>{r.place}</td>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    {p && <Pawn token={p.token} size="xs" />}
                    <b>{r.name}</b>
                    {r.bankrupt && <Chip tone="danger">bancarotta</Chip>}
                  </span>
                </td>
                <td className="num">{fmtMoney(r.netWorth)}</td>
                <td className="num">{fmtMoney(r.cash)}</td>
                <td className="num">{r.properties}</td>
                <td className="num">{r.developments}</td>
                <td className="num">{fmtMoney(r.income)}</td>
                <td className="num">{fmtMoney(r.expenses)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="small muted center">La vittoria è soltanto un risultato di gioco: non dice nulla della vita reale di nessuno. Grazie per aver giocato insieme!</p>
    </div>
  );
}
