import { useState } from 'react';
import { squareLabel } from '../../config/board';
import { economySnapshot, ownedSquares, debtTotal, liquidationPotential } from '../../engine/selectors';
import type { Phase, GameState } from '../../engine/types';
import type { HostController } from '../../net/host';
import { Button, Chip, Pawn } from '../components/common';
import { ChallengeFace } from '../components/cards';
import { AuctionView, statusChips } from '../components/panels';
import { findP, fmtMoney, fmtOre } from '../format';
import type { GameView } from '../hooks';

export const PHASE_LABEL: Record<Phase, string> = {
  lobby: 'Sala d’attesa',
  turn_start: 'In attesa del lancio dei dadi',
  rolling: 'Dadi in corso',
  moving: 'Movimento della pedina',
  resolving: 'Risoluzione della casella',
  buy_decision: 'Decisione d’acquisto',
  auction: 'Asta in corso',
  card_draw: 'Carta pescata',
  card_resolution: 'Esecuzione della carta',
  debt: 'Gestione di un debito',
  development: 'Sviluppo',
  trade: 'Scambio',
  jail: 'Pausa organizzativa',
  turn_end: 'Fine turno (gestione proprietà)',
  game_over: 'Partita terminata',
};

export function ControlPanel({ ctl, view, onError }: { ctl: HostController; view: GameView; onError: (m: string) => void }) {
  const s: GameState = view.state;
  const [adjust, setAdjust] = useState<{ playerId: string; amount: string; reason: string } | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const run = (a: Parameters<HostController['dispatch']>[0]) => {
    const r = ctl.dispatch(a);
    if (!r.ok) onError(r.error);
    return r.ok;
  };
  const cur = findP(s, s.currentPlayerId);
  const pend = s.pending;
  const over = s.phase === 'game_over';

  return (
    <div className="hgrid">
      <section className="card stack">
        <h2>Stato della partita</h2>
        <div className="row wrap">
          <Chip tone="gold">{PHASE_LABEL[s.phase]}</Chip>
          {s.paused && <Chip tone="warn">In pausa</Chip>}
          <Chip>Turno {s.turnNumber}</Chip>
          <Chip>Giro {s.round}</Chip>
        </div>
        {cur && !over && (
          <div className="row">
            <Pawn token={cur.token} size="md" />
            <div>
              Di turno: <b>{cur.name}</b>
              <div className="small muted">{fmtOre(cur.cash)}</div>
            </div>
          </div>
        )}
        {!over && (
          <div className="row wrap">
            {s.paused ? (
              <Button variant="primary" onClick={() => run({ type: 'RESUME' })}>
                ▶ Riprendi
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => run({ type: 'PAUSE' })}>
                ⏸ Sospendi
              </Button>
            )}
            <Button variant="secondary" disabled={!!s.paused} onClick={() => run({ type: 'AUTO_STEP' })} title="Esegue il passo predefinito per il giocatore di turno (utile se è assente)">
              ⏭ Fai proseguire il turno
            </Button>
          </div>
        )}
        <p className="small muted">
          «Fai proseguire» esegue la mossa più semplice al posto di un giocatore assente (lancio, rifiuto d’acquisto, pagamento del contributo…). Ogni intervento resta nel registro.
        </p>
        {!over && (
          <div className="row wrap">
            {!confirmEnd ? (
              <Button variant="ghost" onClick={() => setConfirmEnd(true)}>
                🏁 Termina la partita…
              </Button>
            ) : (
              <>
                <span className="small">Terminare ora e calcolare il patrimonio?</span>
                <Button variant="danger" size="sm" onClick={() => { run({ type: 'END_GAME' }); setConfirmEnd(false); }}>
                  Sì, termina
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setConfirmEnd(false)}>
                  Annulla
                </Button>
              </>
            )}
          </div>
        )}
      </section>

      {pend?.kind === 'challenge' && s.phase === 'resolving' && (
        <section className="card stack">
          <h2>Valuta la sfida</h2>
          <ChallengeFace questionId={pend.questionId} reveal who={cur?.name} />
          <div className="small muted">
            Di norma valuta il proprietario ({findP(s, pend.ownerId)?.name}). Puoi farlo tu se è un giocatore virtuale o se è assente.
          </div>
          <div className="row">
            <Button className="grow" onClick={() => run({ type: 'JUDGE_CHALLENGE', correct: true })}>
              ✅ Corretta
            </Button>
            <Button className="grow" variant="danger" onClick={() => run({ type: 'JUDGE_CHALLENGE', correct: false })}>
              ❌ Errata
            </Button>
          </div>
        </section>
      )}

      {s.phase === 'debt' && pend?.kind === 'debt' && (
        <section className="card stack">
          <h2>Debito in corso</h2>
          <p>
            <b>{findP(s, pend.debtorId)?.name}</b> deve {fmtOre(debtTotal(s))}; può ottenere al massimo {fmtOre(liquidationPotential(s, pend.debtorId))}.
          </p>
          <Button variant="danger" onClick={() => run({ type: 'FORCE_BANKRUPTCY', playerId: pend.debtorId })}>
            Dichiara la bancarotta di {findP(s, pend.debtorId)?.name}
          </Button>
          <div className="small muted">Usalo solo se il giocatore non risponde.</div>
        </section>
      )}

      {s.phase === 'auction' && (
        <section className="card stack">
          <h2>Asta</h2>
          <AuctionView view={view} />
        </section>
      )}

      <section className="card stack hwide">
        <h2>Giocatori</h2>
        <div className="tablewrap">
          <table className="table">
            <thead>
              <tr>
                <th>Giocatore</th>
                <th className="num">Ore</th>
                <th className="num">Propr.</th>
                <th className="num">Patrimonio</th>
                <th>Stato</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {s.players.map((p) => {
                const eco = economySnapshot(s, p.id);
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <Pawn token={p.token} size="sm" dim={p.bankrupt} />
                        <b>{p.name}</b>
                        {p.id === s.currentPlayerId && !over && <Chip tone="gold">turno</Chip>}
                      </span>
                    </td>
                    <td className="num">{fmtMoney(p.cash)}</td>
                    <td className="num" title={ownedSquares(s, p.id).map(squareLabel).join(', ')}>
                      {eco.propertyCount}
                    </td>
                    <td className="num">{fmtMoney(eco.netWorth)}</td>
                    <td>
                      <div className="pl__chips">{statusChips(s, p)}</div>
                    </td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: 'flex-end' }}>
                        {!p.bankrupt && (
                          <Button size="sm" variant="secondary" onClick={() => setAdjust({ playerId: p.id, amount: '', reason: '' })}>
                            Rettifica
                          </Button>
                        )}
                        {!p.isBot && !p.bankrupt && (
                          <Button size="sm" variant="ghost" onClick={() => run({ type: 'KICK', playerId: p.id })} title="Libera il posto: il giocatore potrà riprenderlo da un altro dispositivo">
                            Libera posto
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {adjust && (
          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              const amount = Number(adjust.amount);
              if (run({ type: 'ADJUST_CASH', playerId: adjust.playerId, amount, reason: adjust.reason })) setAdjust(null);
            }}
          >
            <b>Rettifica del saldo di {findP(s, adjust.playerId)?.name}</b>
            <div className="small muted">Ogni rettifica richiede un motivo ed è registrata nel registro economico («Rettifica del conduttore»).</div>
            <div className="row wrap">
              <input className="input" style={{ maxWidth: 160 }} inputMode="numeric" placeholder="± importo" value={adjust.amount} onChange={(e) => setAdjust({ ...adjust, amount: e.target.value.replace(/[^\d-]/g, '') })} aria-label="Importo" />
              <input className="input grow" placeholder="Motivo (obbligatorio)" value={adjust.reason} onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} aria-label="Motivo" />
            </div>
            <div className="row">
              <Button type="submit" disabled={!adjust.amount || adjust.reason.trim().length < 3}>
                Applica
              </Button>
              <Button variant="ghost" onClick={() => setAdjust(null)}>
                Annulla
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
