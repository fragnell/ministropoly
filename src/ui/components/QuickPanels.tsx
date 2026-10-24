/**
 * Collegamenti rapidi al centro del tabellone: Banca, Proprietà, Aste, Scambi.
 */
import { useState } from 'react';
import { BUYABLE_INDICES, SQUARES, squareLabel } from '../../config/board';
import { GROUPS, GROUP_ORDER } from '../../config/game.config';
import { economySnapshot, ownedSquares } from '../../engine/selectors';
import type { GameState, Player } from '../../engine/types';
import type { HostController } from '../../net/host';
import type { TransportKind } from '../../net/protocol';
import { ControlPanel } from '../host/ControlPanel';
import { SavePanel } from '../host/SavePanel';
import { findP, fmtMoney, fmtOre } from '../format';
import type { GameView } from '../hooks';
import { DevMarks } from './cards';
import { Chip, EmptyNote, Modal, Pawn, cls } from './common';
import { ActivityFeed, AuctionView, LedgerList, TradeSummary } from './panels';

type Panel = 'bank' | 'props' | 'auctions' | 'trades' | 'control' | 'registro' | 'save' | null;

/** Presente solo per il conduttore (non per lo schermo TV dei soli spettatori) */
export interface QuickAdmin {
  ctl: HostController;
  kind: TransportKind;
  saved: number | null;
  onError: (m: string) => void;
}

export function QuickLinks({ view, admin }: { view: GameView; admin?: QuickAdmin }) {
  const [open, setOpen] = useState<Panel>(null);
  const s = view.state;
  const pendingTrades = s.trades.filter((t) => t.status === 'pending').length;
  const btn = (id: Exclude<Panel, null>, icon: string, label: string, badge?: boolean) => (
    <button className="qlink" onClick={() => setOpen(id)}>
      <span aria-hidden="true">{icon}</span>
      {label}
      {badge && <span className="qlink__dot" aria-label="attivo" />}
    </button>
  );
  return (
    <>
      <div className="qlinks" role="group" aria-label="Collegamenti rapidi">
        {btn('bank', '🏦', 'Banca')}
        {btn('props', '🏠', 'Proprietà')}
        {btn('auctions', '🔨', 'Aste', !!s.auction)}
        {btn('trades', '🤝', 'Scambi', pendingTrades > 0)}
        {admin && btn('control', '🎛️', 'Controllo')}
        {admin && btn('registro', '📖', 'Registro')}
        {admin && btn('save', '💾', 'Salvataggio')}
      </div>
      {open === 'bank' && (
        <Modal onClose={() => setOpen(null)} title="Banca e patrimoni" wide>
          <BankPanel view={view} />
        </Modal>
      )}
      {open === 'props' && (
        <Modal onClose={() => setOpen(null)} title="Proprietà per giocatore" wide>
          <PropertiesOverview state={s} />
        </Modal>
      )}
      {open === 'auctions' && (
        <Modal onClose={() => setOpen(null)} title="Aste" wide>
          <AuctionsPanel view={view} />
        </Modal>
      )}
      {open === 'trades' && (
        <Modal onClose={() => setOpen(null)} title="Scambi" wide>
          <TradesPanel state={s} />
        </Modal>
      )}
      {open === 'control' && admin && (
        <Modal onClose={() => setOpen(null)} title="Controllo della partita" wide>
          <ControlPanel ctl={admin.ctl} view={view} onError={admin.onError} />
        </Modal>
      )}
      {open === 'registro' && admin && (
        <Modal onClose={() => setOpen(null)} title="Registro" wide>
          <RegistroPanel view={view} />
        </Modal>
      )}
      {open === 'save' && admin && (
        <Modal onClose={() => setOpen(null)} title="Salvataggio" wide>
          <SavePanel ctl={admin.ctl} kind={admin.kind} saved={admin.saved} onError={admin.onError} />
        </Modal>
      )}
    </>
  );
}

function RegistroPanel({ view }: { view: GameView }) {
  const s = view.state;
  return (
    <div className="stack">
      <section>
        <h3>Cronologia della partita</h3>
        <ActivityFeed entries={s.log} limit={400} />
      </section>
      <section>
        <h3>Registro economico</h3>
        <p className="small muted">Ogni variazione di saldo è registrata con causale, saldi prima e dopo. Qui le ultime 150 operazioni; il file di esportazione le contiene tutte.</p>
        <div className="tablewrap">
          <LedgerList state={s} entries={s.ledger} limit={150} />
        </div>
      </section>
    </div>
  );
}

export function BankPanel({ view }: { view: GameView }) {
  const s = view.state;
  const rows = s.players.map((p) => ({ p, eco: economySnapshot(s, p.id) }));
  return (
    <div className="stack">
      <div className="tablewrap">
        <table className="table">
          <thead>
            <tr>
              <th>Giocatore</th>
              <th className="num">Ore</th>
              <th className="num">Proprietà</th>
              <th className="num">Prezzo orig.</th>
              <th className="num">Sviluppi</th>
              <th className="num">Patrimonio</th>
              <th className="num">Incassi contributi</th>
              <th className="num">Contributi pagati</th>
              <th className="num">Ipoteche</th>
              <th className="num">Debito</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ p, eco }) => (
              <tr key={p.id} className={cls(p.bankrupt && 'is-out')}>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    <Pawn token={p.token} size="xs" dim={p.bankrupt} />
                    <b>{p.name}</b>
                  </span>
                </td>
                <td className="num">{fmtMoney(eco.cash)}</td>
                <td className="num">{eco.propertyCount}</td>
                <td className="num">{fmtMoney(eco.originalPrice)}</td>
                <td className="num">{fmtMoney(eco.developmentValue)}</td>
                <td className="num">
                  <b>{fmtMoney(eco.netWorth)}</b>
                </td>
                <td className="num">{fmtMoney(p.stats.rentIn)}</td>
                <td className="num">{fmtMoney(p.stats.rentOut)}</td>
                <td className="num">{eco.mortgagedCount}</td>
                <td className="num">{eco.activeDebt > 0 ? fmtMoney(eco.activeDebt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="small muted">
        Segnalini in banca: {s.bank.visits} visite ulteriori · {s.bank.studies} studi biblici
      </div>
      <h3>Ultime transazioni</h3>
      <div className="tablewrap">
        <LedgerList state={s} entries={view.ledger} limit={14} />
      </div>
    </div>
  );
}

function PropChip({ state, index }: { state: GameState; index: number }) {
  const sq = SQUARES[index];
  const st = state.props[String(index)];
  const g = sq.group ? GROUPS[sq.group] : null;
  return (
    <span className={cls('pchip', st.mortgaged && 'is-mortgaged')} title={squareLabel(index)}>
      <i className="pchip__sw" style={{ background: g?.color ?? 'var(--petrol)', color: g?.ink ?? '#fff' }}>
        {g ? `${g.number}${g.symbol}` : sq.icon}
      </i>
      <span>{sq.name}</span>
      {st.level > 0 && <DevMarks level={st.level} size="sm" />}
      {st.mortgaged && <small>ipot.</small>}
    </span>
  );
}

export function PropertiesOverview({ state }: { state: GameState }) {
  const free = BUYABLE_INDICES.filter((i) => !state.props[String(i)].owner);
  return (
    <div className="stack">
      {state.players.map((p: Player) => {
        const owned = ownedSquares(state, p.id);
        const value = owned.reduce((a, i) => a + (SQUARES[i].price ?? 0), 0);
        return (
          <section key={p.id} className="card">
            <header className="row">
              <Pawn token={p.token} size="sm" dim={p.bankrupt} />
              <b className="grow">{p.name}</b>
              <Chip>{owned.length} propr.</Chip>
              <Chip tone="gold">valore {fmtOre(value)}</Chip>
            </header>
            <div className="pchips">
              {owned.length === 0 ? <span className="muted small">Nessuna proprietà.</span> : owned.map((i) => <PropChip key={i} state={state} index={i} />)}
            </div>
          </section>
        );
      })}
      <section className="card">
        <header className="row">
          <b className="grow">Ancora libere</b>
          <Chip tone="ok">{free.length}</Chip>
        </header>
        <div className="pchips">
          {GROUP_ORDER.map((g) => free.filter((i) => SQUARES[i].group === g).map((i) => <PropChip key={i} state={state} index={i} />))}
          {free.filter((i) => !SQUARES[i].group).map((i) => (
            <PropChip key={i} state={state} index={i} />
          ))}
          {free.length === 0 && <span className="muted small">Tutte le proprietà hanno un proprietario.</span>}
        </div>
      </section>
    </div>
  );
}

export function AuctionsPanel({ view }: { view: GameView }) {
  const s = view.state;
  const past = view.log.filter((e) => e.kind === 'auction');
  return (
    <div className="stack">
      {s.auction ? <AuctionView view={view} /> : <EmptyNote>Nessuna asta in corso.</EmptyNote>}
      <h3>Cronologia delle aste</h3>
      <ActivityFeed entries={past} limit={14} />
    </div>
  );
}

export function TradesPanel({ state }: { state: GameState }) {
  const pending = state.trades.filter((t) => t.status === 'pending');
  const done = state.trades.filter((t) => t.status !== 'pending').slice(-6).reverse();
  return (
    <div className="stack">
      <h3>In attesa</h3>
      {pending.length === 0 && <EmptyNote>Nessuna proposta in attesa.</EmptyNote>}
      {pending.map((t) => (
        <div key={t.id} className="card">
          <TradeSummary state={state} trade={t} />
        </div>
      ))}
      <h3>Recenti</h3>
      {done.length === 0 && <EmptyNote>Nessuno scambio concluso.</EmptyNote>}
      {done.map((t) => (
        <div key={t.id} className="row small">
          <Chip tone={t.status === 'accepted' ? 'ok' : t.status === 'invalid' ? 'danger' : 'plain'}>{t.status === 'accepted' ? 'Accettato' : t.status === 'declined' ? 'Rifiutato' : t.status === 'withdrawn' ? 'Ritirato' : t.status === 'countered' ? 'Controproposta' : 'Non più valido'}</Chip>
          <span>
            {findP(state, t.from)?.name} ⇄ {findP(state, t.to)?.name}
          </span>
        </div>
      ))}
    </div>
  );
}
