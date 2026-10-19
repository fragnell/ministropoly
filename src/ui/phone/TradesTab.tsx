import { useMemo, useState } from 'react';
import { SQUARES, squareLabel } from '../../config/board';
import { GROUPS } from '../../config/game.config';
import { groupHasDevelopment, ownedSquares } from '../../engine/selectors';
import type { GameState, Player, Trade, TradeSide } from '../../engine/types';
import { findP, fmtMoney } from '../format';
import { Button, Chip, EmptyNote, Modal, Pawn, cls } from '../components/common';
import { SideList, TradeSummary } from '../components/panels';
import type { PhoneCtx } from './types';

const STATUS_LABEL: Record<Trade['status'], string> = {
  pending: 'In attesa',
  accepted: 'Accettato',
  declined: 'Rifiutato',
  withdrawn: 'Ritirato',
  countered: 'Controproposta',
  invalid: 'Non più valido',
};

export function canAcceptNow(s: GameState, t: Trade): string | null {
  if (s.paused) return 'La partita è in pausa.';
  if (s.phase === 'turn_start' || s.phase === 'turn_end' || s.phase === 'jail') return null;
  if (s.phase === 'debt' && s.pending?.kind === 'debt' && (s.pending.debtorId === t.from || s.pending.debtorId === t.to)) return null;
  return 'Puoi accettare tra un’azione e l’altra (non durante un acquisto, un’asta o un pagamento in corso).';
}

// ------------------------------------------------------------------ scheda "Scambi"

export function TradesTab({ ctx, onReview }: { ctx: PhoneCtx; onReview: (id: string) => void }) {
  const { view, me, send, busy } = ctx;
  const s = view.state;
  const incoming = s.trades.filter((t) => t.status === 'pending' && t.to === me.id);
  const outgoing = s.trades.filter((t) => t.status === 'pending' && t.from === me.id);
  const history = s.trades.filter((t) => t.status !== 'pending' && (t.from === me.id || t.to === me.id)).slice(-6).reverse();

  return (
    <div className="stack">
      <Button size="lg" block onClick={() => ctx.openTrade()} disabled={s.phase === 'auction' || s.phase === 'lobby'}>
        🤝 Nuova proposta di scambio
      </Button>
      {s.phase === 'auction' && <div className="small muted center">Durante un’asta non si possono proporre scambi.</div>}

      <h3>Ricevute</h3>
      {incoming.length === 0 && <EmptyNote>Nessuna proposta ricevuta.</EmptyNote>}
      {incoming.map((t) => (
        <TradeRow key={t.id} s={s} t={t} me={me}>
          <Button size="sm" onClick={() => onReview(t.id)}>
            Esamina
          </Button>
        </TradeRow>
      ))}

      <h3>Inviate</h3>
      {outgoing.length === 0 && <EmptyNote>Nessuna proposta in attesa.</EmptyNote>}
      {outgoing.map((t) => (
        <TradeRow key={t.id} s={s} t={t} me={me}>
          <Button size="sm" variant="secondary" busy={busy} onClick={() => send({ type: 'WITHDRAW_TRADE', id: t.id })}>
            Ritira
          </Button>
        </TradeRow>
      ))}

      {history.length > 0 && (
        <>
          <h3>Recenti</h3>
          {history.map((t) => (
            <TradeRow key={t.id} s={s} t={t} me={me}>
              <Chip tone={t.status === 'accepted' ? 'ok' : t.status === 'invalid' ? 'danger' : 'plain'}>{STATUS_LABEL[t.status]}</Chip>
            </TradeRow>
          ))}
        </>
      )}
    </div>
  );
}

function TradeRow({ s, t, me, children }: { s: GameState; t: Trade; me: Player; children?: React.ReactNode }) {
  const other = findP(s, t.from === me.id ? t.to : t.from);
  const give = t.from === me.id ? t.offer : t.request;
  const get = t.from === me.id ? t.request : t.offer;
  return (
    <div className="card trow">
      <div className="row">
        {other && <Pawn token={other.token} size="sm" />}
        <b className="grow">{other?.name}</b>
        {children}
      </div>
      <div className="trow__cols small">
        <div>
          <span className="muted">Cedi</span>
          <SideList state={s} side={give} />
        </div>
        <div>
          <span className="muted">Ricevi</span>
          <SideList state={s} side={get} />
        </div>
      </div>
      {t.note && <div className="small neg">{t.note}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ esame di una proposta ricevuta

export function TradeReview({ ctx, id, onClose, onCounter }: { ctx: PhoneCtx; id: string; onClose: () => void; onCounter: (t: Trade) => void }) {
  const { view, me, send, busy } = ctx;
  const s = view.state;
  const t = s.trades.find((x) => x.id === id);
  if (!t) {
    return (
      <Modal onClose={onClose} title="Proposta di scambio">
        <EmptyNote>Questa proposta non esiste più.</EmptyNote>
      </Modal>
    );
  }
  const from = findP(s, t.from);
  const reason = t.status === 'pending' && t.to === me.id ? canAcceptNow(s, t) : null;
  const mineToAnswer = t.status === 'pending' && t.to === me.id;
  return (
    <Modal onClose={onClose} title={`Scambio con ${from?.name ?? ''}`} wide>
      <div className="stack">
        <TradeSummary state={s} trade={t} />
        {!mineToAnswer && <Chip tone={t.status === 'accepted' ? 'ok' : 'plain'}>{STATUS_LABEL[t.status]}</Chip>}
        {mineToAnswer && (
          <>
            {reason && <div className="small warn-note">{reason}</div>}
            <Button size="lg" block busy={busy} disabled={!!reason} onClick={() => { send({ type: 'ACCEPT_TRADE', id: t.id }); onClose(); }}>
              ✅ Conferma e accetta
            </Button>
            <div className="row">
              <Button variant="secondary" className="grow" busy={busy} onClick={() => { send({ type: 'DECLINE_TRADE', id: t.id }); onClose(); }}>
                Rifiuta
              </Button>
              <Button variant="secondary" className="grow" onClick={() => onCounter(t)}>
                Controproposta
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ costruttore di proposte

interface Draft {
  to: string | null;
  offerCash: string;
  offerSquares: number[];
  reqCash: string;
  reqSquares: number[];
  message: string;
}

export function TradeBuilder({
  ctx,
  preset,
  counterOf,
  onClose,
}: {
  ctx: PhoneCtx;
  preset?: { to?: string; request?: number[]; offer?: number[]; offerCash?: number; reqCash?: number };
  counterOf?: Trade;
  onClose: () => void;
}) {
  const { view, me, send, busy } = ctx;
  const s = view.state;
  const [step, setStep] = useState<'who' | 'edit' | 'summary'>(preset?.to ? 'edit' : 'who');
  const [d, setD] = useState<Draft>({
    to: preset?.to ?? null,
    offerCash: preset?.offerCash ? String(preset.offerCash) : '',
    offerSquares: preset?.offer ?? [],
    reqCash: preset?.reqCash ? String(preset.reqCash) : '',
    reqSquares: preset?.request ?? [],
    message: '',
  });
  const partner = findP(s, d.to);
  const others = s.players.filter((p) => p.id !== me.id && !p.bankrupt);

  const offer: TradeSide = { cash: Number(d.offerCash) || 0, squares: d.offerSquares };
  const request: TradeSide = { cash: Number(d.reqCash) || 0, squares: d.reqSquares };
  const empty = offer.cash === 0 && request.cash === 0 && offer.squares.length === 0 && request.squares.length === 0;
  const problems: string[] = [];
  if (offer.cash > me.cash) problems.push('Non hai abbastanza Ore per questa offerta.');
  if (partner && request.cash > partner.cash) problems.push(`${partner.name} non ha tutte le Ore richieste.`);
  if (empty) problems.push('Aggiungi qualcosa allo scambio.');

  const toggle = (key: 'offerSquares' | 'reqSquares', i: number) =>
    setD((x) => ({ ...x, [key]: x[key].includes(i) ? x[key].filter((n) => n !== i) : [...x[key], i] }));

  const submit = () => {
    if (!partner) return;
    if (counterOf) send({ type: 'COUNTER_TRADE', id: counterOf.id, offer, request, message: d.message || undefined });
    else send({ type: 'PROPOSE_TRADE', to: partner.id, offer, request, message: d.message || undefined });
    onClose();
  };

  return (
    <Modal onClose={onClose} title={counterOf ? 'Controproposta' : 'Proposta di scambio'} wide>
      {step === 'who' && (
        <div className="stack">
          <p className="muted">Con chi vuoi scambiare?</p>
          {others.map((p) => (
            <button key={p.id} className="prow prow--btn" onClick={() => { setD({ ...d, to: p.id }); setStep('edit'); }}>
              <Pawn token={p.token} size="md" />
              <span className="grow">
                <b>{p.name}</b>
                <div className="small muted">
                  {fmtMoney(p.cash)} Ore · {ownedSquares(s, p.id).length} proprietà
                </div>
              </span>
              <span>›</span>
            </button>
          ))}
        </div>
      )}

      {step === 'edit' && partner && (
        <div className="stack">
          <TradeSide
            title="Tu offri"
            player={me}
            state={s}
            cash={d.offerCash}
            onCash={(v) => setD({ ...d, offerCash: v })}
            selected={d.offerSquares}
            onToggle={(i) => toggle('offerSquares', i)}
          />
          <TradeSide
            title={`Chiedi a ${partner.name}`}
            player={partner}
            state={s}
            cash={d.reqCash}
            onCash={(v) => setD({ ...d, reqCash: v })}
            selected={d.reqSquares}
            onToggle={(i) => toggle('reqSquares', i)}
          />
          <div className="field">
            <label htmlFor="tmsg">Messaggio (facoltativo)</label>
            <input id="tmsg" className="input" maxLength={140} value={d.message} onChange={(e) => setD({ ...d, message: e.target.value })} placeholder="Ad es. «Mi serve per completare il gruppo»" />
          </div>
          {problems.map((p) => (
            <div key={p} className="small neg">
              {p}
            </div>
          ))}
          <div className="row">
            {!preset?.to && !counterOf && (
              <Button variant="secondary" onClick={() => setStep('who')}>
                ‹ Indietro
              </Button>
            )}
            <Button className="grow" disabled={problems.length > 0} onClick={() => setStep('summary')}>
              Riepilogo ›
            </Button>
          </div>
        </div>
      )}

      {step === 'summary' && partner && (
        <div className="stack">
          <TradeSummary state={s} fromId={me.id} toId={partner.id} offer={offer} request={request} />
          {d.message && <blockquote className="trade__msg">“{d.message}”</blockquote>}
          <div className="small muted">Inviando la proposta confermi la tua parte. {partner.name} dovrà esaminare il riepilogo e accettare.</div>
          <Button size="lg" block busy={busy} onClick={submit}>
            📨 Invia la proposta
          </Button>
          <Button variant="secondary" block onClick={() => setStep('edit')}>
            ‹ Modifica
          </Button>
        </div>
      )}
    </Modal>
  );
}

function TradeSide({
  title,
  player,
  state,
  cash,
  onCash,
  selected,
  onToggle,
}: {
  title: string;
  player: Player;
  state: GameState;
  cash: string;
  onCash: (v: string) => void;
  selected: number[];
  onToggle: (i: number) => void;
}) {
  const owned = useMemo(() => ownedSquares(state, player.id), [state, player.id]);
  return (
    <section className="tbox">
      <header className="row">
        <Pawn token={player.token} size="sm" />
        <b className="grow">{title}</b>
        <span className="small muted">{fmtMoney(player.cash)} Ore</span>
      </header>
      <div className="field">
        <label htmlFor={`cash-${player.id}`}>Ore</label>
        <input id={`cash-${player.id}`} className="input" inputMode="numeric" value={cash} onChange={(e) => onCash(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="0" />
      </div>
      <div className="label">Proprietà</div>
      {owned.length === 0 && <div className="small muted">Nessuna proprietà.</div>}
      <ul className="tpicks">
        {owned.map((i) => {
          const sq = SQUARES[i];
          const st = state.props[String(i)];
          const blocked = st.mortgaged ? 'ipotecata' : sq.kind === 'street' && groupHasDevelopment(state, sq.group as string) ? 'ha sviluppi nel gruppo' : null;
          const g = sq.group ? GROUPS[sq.group] : null;
          return (
            <li key={i}>
              <label className={cls('tpick', blocked && 'is-blocked', selected.includes(i) && 'is-on')}>
                <input type="checkbox" disabled={!!blocked} checked={selected.includes(i)} onChange={() => onToggle(i)} />
                <span className="tside__dot" style={{ background: g?.color ?? 'var(--petrol)' }} />
                <span className="grow">{squareLabel(i)}</span>
                {blocked && <span className="small muted">{blocked}</span>}
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
