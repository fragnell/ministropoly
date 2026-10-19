import { SQUARES, squareLabel } from '../../config/board';
import { getCard } from '../../config/cards';
import { ECONOMY } from '../../config/game.config';
import { canDeclareBankruptcy } from '../../engine/bankruptcy';
import { debtTotal, developmentValue, liquidationPotential, mortgageValue, ownedSquares, canMortgage, sellDevelopmentQuote } from '../../engine/selectors';
import { findP, fmtMoney, fmtOre } from '../format';
import { PropertyCard, CardFace, ChallengeFace } from '../components/cards';
import { Button, Chip, DicePair, Pawn } from '../components/common';
import { AuctionView, GameOverView, PlayersPanel } from '../components/panels';
import type { PhoneCtx } from './types';
import { getChallenge } from '../../config/challenges';

function Banner({ tone = 'info', children }: { tone?: 'info' | 'turn' | 'warn'; children: React.ReactNode }) {
  return <div className={`pbanner pbanner--${tone}`}>{children}</div>;
}

function Waiting({ children }: { children: React.ReactNode }) {
  return <div className="pwait">{children}</div>;
}

export function HeldCards({ ctx }: { ctx: PhoneCtx }) {
  const { me } = ctx;
  if (me.heldCards.length === 0 && me.nextDevDiscount === 0) return null;
  return (
    <div className="row wrap">
      {me.heldCards.map((id) => (
        <Chip key={id} tone="info" title={getCard(id).text}>
          {getCard(id).icon} {getCard(id).name}
        </Chip>
      ))}
      {me.nextDevDiscount > 0 && <Chip tone="ok">🏷️ Prossimo sviluppo −{me.nextDevDiscount}%</Chip>}
    </div>
  );
}

export function TurnPanel({ ctx }: { ctx: PhoneCtx }) {
  const { view, me, send, busy, goTab } = ctx;
  const s = view.state;
  const cur = findP(s, s.currentPlayerId);
  const mine = cur?.id === me.id;
  const pend = s.pending;

  if (s.phase === 'game_over') return <GameOverView view={view} />;

  if (me.bankrupt) {
    return (
      <div className="stack">
        <Banner tone="warn">Sei fuori dalla partita. Puoi continuare a guardare e fare il tifo!</Banner>
        <PlayersPanel view={view} />
      </div>
    );
  }

  if (s.phase === 'lobby') return null;

  const header = (
    <>
      {mine ? <Banner tone="turn">🎯 È il tuo turno!</Banner> : cur && <Banner>Turno di <b>{cur.name}</b></Banner>}
      {s.paused && <Banner tone="warn">⏸ Partita in pausa: il conduttore riprenderà a breve.</Banner>}
      <HeldCards ctx={ctx} />
    </>
  );

  // ---------------------------------------------------------------- asta (tutti partecipano)
  if (s.phase === 'auction') {
    return (
      <div className="stack">
        {header}
        <AuctionView view={view} controls={{ me, send, busy }} />
      </div>
    );
  }

  // ---------------------------------------------------------------- debito
  if (s.phase === 'debt' && pend?.kind === 'debt') {
    if (pend.debtorId === me.id) return <div className="stack">{header}<DebtPanel ctx={ctx} /></div>;
    const debtor = findP(s, pend.debtorId);
    return (
      <div className="stack">
        {header}
        <Waiting>
          <b>{debtor?.name}</b> deve {fmtOre(debtTotal(s))} e sta cercando di saldare il debito.
        </Waiting>
        <div className="small muted">Puoi comunque proporgli uno scambio dalla scheda «Scambi».</div>
      </div>
    );
  }

  // ---------------------------------------------------------------- sfida: valutazione
  if (s.phase === 'resolving' && pend?.kind === 'challenge') {
    const isOwner = pend.ownerId === me.id;
    const q = getChallenge(pend.questionId);
    return (
      <div className="stack">
        {header}
        <ChallengeFace questionId={pend.questionId} reveal={isOwner} who={cur?.name} />
        {mine && <Waiting>Rispondi a voce. {findP(s, pend.ownerId)?.name} valuterà la risposta.</Waiting>}
        {isOwner && !mine && (
          <div className="card stack">
            <b>Valuta la risposta di {cur?.name}</b>
            <div className="small muted">La risposta attesa è indicativa: decidi tu con buon senso.</div>
            <div className="row">
              <Button variant="primary" size="lg" className="grow" busy={busy} onClick={() => send({ type: 'JUDGE_CHALLENGE', correct: true })}>
                ✅ Corretta
              </Button>
              <Button variant="danger" size="lg" className="grow" busy={busy} onClick={() => send({ type: 'JUDGE_CHALLENGE', correct: false })}>
                ❌ Errata
              </Button>
            </div>
          </div>
        )}
        {!isOwner && !mine && <Waiting>{findP(s, pend.ownerId)?.name} (o il conduttore) valuta la risposta…</Waiting>}
        {q && !isOwner && <div className="small muted center">La risposta resta nascosta fino alla valutazione.</div>}
      </div>
    );
  }

  // ---------------------------------------------------------------- non è il mio turno
  if (!mine) {
    return (
      <div className="stack">
        {header}
        <OthersTurn ctx={ctx} />
        <PlayersPanel view={view} highlightId={me.id} />
      </div>
    );
  }

  // ---------------------------------------------------------------- è il mio turno
  const dis = !!s.paused;
  switch (s.phase) {
    case 'turn_start': {
      const again = s.roll?.playerId === me.id && s.roll.isDouble && s.doublesCount > 0;
      return (
        <div className="stack">
          {header}
          {again && (
            <Banner tone={s.doublesCount >= ECONOMY.doublesToJail - 1 ? 'warn' : 'info'}>
              🎲 Hai fatto un doppio: tira ancora!
              {s.doublesCount >= ECONOMY.doublesToJail - 1 && ' Attenzione: un altro doppio ti manda alla Pausa organizzativa.'}
            </Banner>
          )}
          <Button size="lg" block busy={busy} disabled={dis} onClick={() => send({ type: 'ROLL_DICE' })}>
            🎲 {again ? 'Tira ancora' : 'Lancia i dadi'}
          </Button>
          <div className="row">
            <Button variant="secondary" className="grow" onClick={() => goTab('props')}>
              🏠 Proprietà
            </Button>
            <Button variant="secondary" className="grow" onClick={() => ctx.openTrade()}>
              🤝 Scambio
            </Button>
          </div>
        </div>
      );
    }
    case 'jail': {
      const hasCard = me.heldCards.some((id) => getCard(id).effect.type === 'hold' && (getCard(id).effect as { kind: string }).kind === 'jail_free');
      return (
        <div className="stack">
          {header}
          <div className="card center">
            <div style={{ fontSize: '2.4rem' }}>☕</div>
            <h3>Pausa organizzativa</h3>
            <p className="muted">
              Tentativo {Math.min(me.jailTurns + 1, ECONOMY.jailMaxAttempts)} di {ECONOMY.jailMaxAttempts}. Con un doppio esci subito; al terzo tentativo fallito paghi {ECONOMY.jailFine} Ore e ti muovi.
            </p>
          </div>
          <Button size="lg" block busy={busy} disabled={dis} onClick={() => send({ type: 'ROLL_DICE' })}>
            🎲 Lancia per un doppio
          </Button>
          <Button variant="gold" size="lg" block busy={busy} disabled={dis || me.cash < ECONOMY.jailFine} onClick={() => send({ type: 'PAY_JAIL_FINE' })}>
            Paga {ECONOMY.jailFine} Ore ed esci
          </Button>
          {hasCard && (
            <Button variant="secondary" size="lg" block busy={busy} disabled={dis} onClick={() => send({ type: 'USE_JAIL_CARD' })}>
              🔑 Usa la carta «Esci dalla Pausa»
            </Button>
          )}
        </div>
      );
    }
    case 'rolling':
    case 'moving':
      return (
        <div className="stack">
          {header}
          <Waiting>
            <DicePair dice={s.roll?.dice ?? null} rolling={s.phase === 'rolling'} size="lg" />
            <div>{s.phase === 'rolling' ? 'I dadi rotolano…' : 'La tua pedina avanza sul tabellone…'}</div>
          </Waiting>
        </div>
      );
    case 'buy_decision': {
      if (pend?.kind !== 'buy') return null;
      const price = SQUARES[pend.square].price ?? 0;
      const can = me.cash >= price;
      return (
        <div className="stack">
          {header}
          <PropertyCard state={s} index={pend.square} />
          <div className="center">
            Prezzo <b>{fmtOre(price)}</b> · Il tuo saldo <b>{fmtOre(me.cash)}</b>
          </div>
          <Button size="lg" block busy={busy} disabled={!can || dis} onClick={() => send({ type: 'BUY_PROPERTY' })}>
            Acquista per {fmtMoney(price)} Ore
          </Button>
          {!can && <div className="small neg center">Non hai Ore sufficienti per acquistare.</div>}
          <Button variant="secondary" size="lg" block busy={busy} disabled={dis} onClick={() => send({ type: 'DECLINE_PROPERTY' })}>
            Rifiuta (si va all’asta)
          </Button>
        </div>
      );
    }
    case 'resolving': {
      if (pend?.kind === 'rent') {
        const owner = findP(s, pend.ownerId);
        return (
          <div className="stack">
            {header}
            <PropertyCard state={s} index={pend.square} compact />
            <div className="card center stack">
              <div className="muted">Devi un contributo a</div>
              <div className="row" style={{ justifyContent: 'center' }}>
                {owner && <Pawn token={owner.token} size="md" />}
                <b style={{ fontSize: '1.3rem' }}>{owner?.name}</b>
              </div>
              <div className="bigmoney">{fmtOre(pend.amount)}</div>
              <div className="small muted">{pend.formula}</div>
            </div>
            <Button size="lg" block busy={busy} disabled={dis} onClick={() => send({ type: 'PAY_RENT' })}>
              Paga {fmtMoney(pend.amount)} Ore
            </Button>
            {pend.canChallenge && (
              <Button variant="gold" size="lg" block busy={busy} disabled={dis} onClick={() => send({ type: 'START_CHALLENGE' })}>
                🎯 Affronta una sfida
              </Button>
            )}
            {pend.canChallenge && <div className="small muted center">Rispondi correttamente e il contributo è annullato; se sbagli, paghi.</div>}
          </div>
        );
      }
      if (pend?.kind === 'expense') {
        return (
          <div className="stack">
            {header}
            <div className="card center stack">
              <h3>{pend.reason}</h3>
              <div className="bigmoney">{fmtOre(pend.amount)}</div>
              <div className="muted small">Hai la carta «Spesa evitata»: puoi usarla per non pagare.</div>
            </div>
            <Button variant="gold" size="lg" block busy={busy} disabled={dis} onClick={() => send({ type: 'USE_SAVED_CARD' })}>
              🛡️ Usa «Spesa evitata»
            </Button>
            <Button variant="secondary" size="lg" block busy={busy} disabled={dis} onClick={() => send({ type: 'PAY_EXPENSE' })}>
              Paga {fmtMoney(pend.amount)} Ore
            </Button>
          </div>
        );
      }
      if (pend?.kind === 'challenge') {
        return (
          <div className="stack">
            {header}
            <ChallengeFace questionId={pend.questionId} who={me.name} />
            <Waiting>Rispondi a voce, ad alta voce. {findP(s, pend.ownerId)?.name} valuterà la risposta.</Waiting>
          </div>
        );
      }
      return <div className="stack">{header}<Waiting>Un momento…</Waiting></div>;
    }
    case 'card_draw': {
      if (pend?.kind !== 'card') return null;
      const card = getCard(pend.cardId);
      return (
        <div className="stack">
          {header}
          <CardFace cardId={pend.cardId} big />
          <Button size="lg" block busy={busy} disabled={dis} onClick={() => send({ type: 'ACK_CARD' })}>
            {card.ui?.button ?? 'Esegui'}
          </Button>
        </div>
      );
    }
    case 'turn_end':
      return (
        <div className="stack">
          {header}
          <div className="card center">
            {s.roll && <DicePair dice={s.roll.dice} rolling={false} size="md" />}
            <p className="muted" style={{ margin: '8px 0 0' }}>
              Puoi sviluppare, ipotecare o proporre scambi, poi chiudi il turno.
            </p>
          </div>
          <Button size="lg" block busy={busy} disabled={dis} onClick={() => send({ type: 'END_TURN' })}>
            ✔ Termina il turno
          </Button>
          <div className="row">
            <Button variant="secondary" className="grow" onClick={() => goTab('props')}>
              🏠 Proprietà
            </Button>
            <Button variant="secondary" className="grow" onClick={() => ctx.openTrade()}>
              🤝 Scambio
            </Button>
          </div>
        </div>
      );
    default:
      return <div className="stack">{header}<Waiting>…</Waiting></div>;
  }
}

function OthersTurn({ ctx }: { ctx: PhoneCtx }) {
  const { view } = ctx;
  const s = view.state;
  const cur = findP(s, s.currentPlayerId);
  const pend = s.pending;
  let text: React.ReactNode = 'Attendi il tuo turno.';
  let extra: React.ReactNode = null;
  if (cur) {
    switch (s.phase) {
      case 'turn_start':
        text = <><b>{cur.name}</b> sta per lanciare i dadi.</>;
        break;
      case 'jail':
        text = <><b>{cur.name}</b> è nella Pausa organizzativa.</>;
        break;
      case 'rolling':
        text = <><b>{cur.name}</b> lancia i dadi…</>;
        extra = <DicePair dice={s.roll?.dice ?? null} rolling size="md" />;
        break;
      case 'moving':
        text = <><b>{cur.name}</b> avanza di {s.roll?.total} caselle.</>;
        extra = <DicePair dice={s.roll?.dice ?? null} rolling={false} size="md" />;
        break;
      case 'buy_decision':
        if (pend?.kind === 'buy') {
          text = <><b>{cur.name}</b> decide se acquistare «{squareLabel(pend.square)}».</>;
          extra = <PropertyCard state={s} index={pend.square} compact />;
        }
        break;
      case 'resolving':
        if (pend?.kind === 'rent') text = <><b>{cur.name}</b> deve {fmtOre(pend.amount)} a {findP(s, pend.ownerId)?.name}.</>;
        else if (pend?.kind === 'expense') text = <><b>{cur.name}</b> deve pagare una spesa.</>;
        break;
      case 'card_draw':
        if (pend?.kind === 'card') {
          text = <><b>{cur.name}</b> ha pescato una carta.</>;
          extra = <CardFace cardId={pend.cardId} />;
        }
        break;
      case 'turn_end':
        text = <><b>{cur.name}</b> sta concludendo il turno.</>;
        break;
    }
  }
  return (
    <div className="stack">
      <Waiting>{text}</Waiting>
      {extra}
    </div>
  );
}

// ------------------------------------------------------------------ debito

export function DebtPanel({ ctx }: { ctx: PhoneCtx }) {
  const { view, me, send, busy, openProperty } = ctx;
  const s = view.state;
  const total = debtTotal(s);
  const potential = liquidationPotential(s, me.id);
  const chk = canDeclareBankruptcy(s, me.id);
  const owned = ownedSquares(s, me.id);
  const sellable = owned.filter((i) => s.props[String(i)].level > 0);
  const mortgageable = owned.filter((i) => canMortgage(s, me.id, i).ok);
  const pend = s.pending?.kind === 'debt' ? s.pending : null;

  return (
    <div className="stack">
      <div className="card debt">
        <h3>Devi saldare un debito</h3>
        <div className="bigmoney neg">{fmtOre(total)}</div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>Il tuo saldo</span>
          <b className="mono">{fmtOre(me.cash)}</b>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span>Mancano</span>
          <b className="mono neg">{fmtOre(Math.max(0, total - me.cash))}</b>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Massimo ottenibile</span>
          <b className="mono">{fmtOre(potential)}</b>
        </div>
        {pend && (
          <ul className="small muted" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {pend.items.map((it, i) => (
              <li key={i}>
                {it.reason}: {fmtOre(it.amount)} a {it.to === 'bank' ? 'la banca' : findP(s, it.to)?.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <h3>Vendi sviluppi (50%)</h3>
      {sellable.length === 0 && <div className="small muted">Nessuno sviluppo da vendere.</div>}
      {sellable.map((i) => {
        const q = sellDevelopmentQuote(s, me.id, i);
        return (
          <div key={i} className="prow">
            <button className="prow__main" onClick={() => openProperty(i)}>
              <b>{squareLabel(i)}</b>
              <span className="small muted">Valore sviluppi {fmtMoney(developmentValue(i, s.props[String(i)].level))}</span>
            </button>
            <Button size="sm" variant="secondary" busy={busy} disabled={!q.ok} title={q.ok ? '' : q.reason} onClick={() => send({ type: 'SELL_DEVELOPMENT', square: i })}>
              Vendi {q.ok ? `+${q.refund}` : ''}
            </Button>
          </div>
        );
      })}

      <h3>Ipoteca proprietà</h3>
      {mortgageable.length === 0 && <div className="small muted">Nessuna proprietà ipotecabile (vendi prima gli sviluppi del gruppo).</div>}
      {mortgageable.map((i) => (
        <div key={i} className="prow">
          <button className="prow__main" onClick={() => openProperty(i)}>
            <b>{squareLabel(i)}</b>
            <span className="small muted">Prezzo {SQUARES[i].price}</span>
          </button>
          <Button size="sm" variant="secondary" busy={busy} onClick={() => send({ type: 'MORTGAGE', square: i })}>
            Ipoteca +{mortgageValue(i)}
          </Button>
        </div>
      ))}

      <Button variant="secondary" block onClick={() => ctx.openTrade()}>
        🤝 Proponi uno scambio per ottenere Ore
      </Button>
      <div className="debt__bk">
        <Button variant="danger" block busy={busy} disabled={!chk.ok} onClick={() => send({ type: 'DECLARE_BANKRUPTCY' })}>
          Dichiara bancarotta
        </Button>
        {!chk.ok && <div className="small muted center">{chk.reason}.</div>}
      </div>
    </div>
  );
}
