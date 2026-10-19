import type { CSSProperties, ReactNode } from 'react';
import { SQUARES, squareLabel } from '../../config/board';
import { getCard, DECK_TITLES } from '../../config/cards';
import { PACK_TITLES, getChallenge } from '../../config/challenges';
import { GROUPS } from '../../config/game.config';
import { countOwnedOfKind, currentRentLine, levelLabel, mortgageValue, ownsFullGroup, rentTable, unmortgageCost } from '../../engine/selectors';
import type { GameState } from '../../engine/types';
import { fmtMoney, findP } from '../format';
import { Chip, Pawn, cls } from './common';

/** Segnalini di sviluppo: quadratini per le visite ulteriori, libro per lo studio biblico */
export function DevMarks({ level, size = 'md' }: { level: number; size?: 'sm' | 'md' }) {
  if (level <= 0) return null;
  if (level === 5) {
    return (
      <span className={cls('devs', `devs--${size}`)} title="Studio biblico" aria-label="Studio biblico">
        <i className="dev dev--study">📘</i>
      </span>
    );
  }
  return (
    <span className={cls('devs', `devs--${size}`)} title={levelLabel(level)} aria-label={levelLabel(level)}>
      {Array.from({ length: level }, (_, i) => (
        <i key={i} className="dev dev--visit" />
      ))}
    </span>
  );
}

/** Riga della tabella contributi attualmente in vigore per la proprietà */
function activeRentRow(s: GameState, index: number): number {
  const sq = SQUARES[index];
  const st = s.props[String(index)];
  if (!st?.owner || st.mortgaged) return -1;
  if (sq.kind === 'street') {
    if (st.level === 0) return ownsFullGroup(s, st.owner, sq.group as string) ? 1 : 0;
    return st.level + 1;
  }
  if (sq.kind === 'special') return Math.max(0, countOwnedOfKind(s, st.owner, 'special') - 1);
  if (sq.kind === 'utility') return countOwnedOfKind(s, st.owner, 'utility') >= 2 ? 1 : 0;
  return -1;
}

export function PropertyCard({ state, index, footer, compact }: { state: GameState; index: number; footer?: ReactNode; compact?: boolean }) {
  const sq = SQUARES[index];
  const st = state.props[String(index)];
  const group = sq.group ? GROUPS[sq.group] : null;
  const owner = findP(state, st?.owner);
  const rows = rentTable(index);
  const active = activeRentRow(state, index);
  const rentNow = compact ? null : currentRentLine(state, index);
  const style = group ? ({ '--gc': group.color, '--gi': group.ink } as CSSProperties) : ({ '--gc': 'var(--petrol)', '--gi': '#fff' } as CSSProperties);

  return (
    <article className={cls('deed', compact && 'deed--compact')} style={style} aria-label={squareLabel(index)}>
      <header className="deed__head">
        <div className="deed__group">
          {group ? (
            <>
              <span className="deed__sym" aria-hidden="true">
                {group.symbol}
              </span>
              Gruppo {group.number} · {group.label}
            </>
          ) : sq.kind === 'special' ? (
            <>
              <span aria-hidden="true">{sq.icon}</span> Servizio speciale
            </>
          ) : (
            <>
              <span aria-hidden="true">{sq.icon}</span> Servizio a dadi
            </>
          )}
        </div>
        <h3 className="deed__name">{sq.name}</h3>
        {sq.city && <div className="deed__city">{sq.city}</div>}
      </header>
      <div className="deed__body">
        <div className="deed__prices">
          <div>
            <span className="muted small">Prezzo</span>
            <b className="mono">{fmtMoney(sq.price ?? 0)} Ore</b>
          </div>
          {sq.kind === 'street' && (
            <div>
              <span className="muted small">Contributo base</span>
              <b className="mono">{fmtMoney(sq.baseRent as number)} Ore</b>
            </div>
          )}
          {sq.kind === 'street' && group && (
            <div>
              <span className="muted small">Visita / Studio</span>
              <b className="mono">
                {group.buildCost} / {group.studyCost}
              </b>
            </div>
          )}
        </div>
        {!compact && (
          <table className="deed__table">
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className={cls(i === active && 'is-active')}>
                  <td>{r.label}</td>
                  <td className="mono">{sq.kind === 'utility' ? `${r.amount} × dadi` : `${fmtMoney(r.amount)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!compact && sq.kind === 'utility' && <div className="small muted">Contributo = moltiplicatore × somma dei dadi dell’ultimo lancio.</div>}
        {rentNow && (
          <div className="deed__now">
            <span className="small muted">Contributo attuale</span>
            <b>{rentNow}</b>
          </div>
        )}
        {!compact && (
          <div className="small muted">
            Ipoteca: {fmtMoney(mortgageValue(index))} Ore · Riscatto: {fmtMoney(unmortgageCost(index))} Ore
          </div>
        )}
        <div className="deed__status">
          {!st?.owner ? (
            <Chip tone="ok">Libera</Chip>
          ) : (
            <>
              {owner && (
                <span className="row" style={{ gap: 6 }}>
                  <Pawn token={owner.token} size="xs" />
                  <b>{owner.name}</b>
                </span>
              )}
              {st.mortgaged && <Chip tone="danger">Ipotecata</Chip>}
              {st.level > 0 && (
                <span className="row" style={{ gap: 6 }}>
                  <DevMarks level={st.level} /> <span className="small">{levelLabel(st.level)}</span>
                </span>
              )}
            </>
          )}
        </div>
        {footer}
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ carte Tesori / Imprevisti

export function CardFace({ cardId, big, resolved }: { cardId: string; big?: boolean; resolved?: boolean }) {
  const card = getCard(cardId);
  return (
    <article className={cls('gcard', `gcard--${card.deck}`, `gcard--${card.ui?.tone ?? 'neutral'}`, big && 'gcard--big', resolved && 'gcard--resolved')} aria-label={`${DECK_TITLES[card.deck]}: ${card.name}`}>
      <header className="gcard__head">{DECK_TITLES[card.deck]}</header>
      <div className="gcard__icon" aria-hidden="true">
        {card.icon}
      </div>
      <h3 className="gcard__name">{card.name}</h3>
      <p className="gcard__text">{card.text}</p>
      {card.scripture && <footer className="gcard__ref">Cfr. {card.scripture}</footer>}
    </article>
  );
}

export function DifficultyDots({ n }: { n: number }) {
  return (
    <span className="dots" title={`Difficoltà ${n} su 3`} aria-label={`Difficoltà ${n} su 3`}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={cls('dots__d', i <= n && 'is-on')} />
      ))}
    </span>
  );
}

/** Domanda di una sfida; la risposta si mostra solo quando `reveal` è vero */
export function ChallengeFace({ questionId, reveal, who }: { questionId: string; reveal?: boolean; who?: string }) {
  const q = getChallenge(questionId);
  if (!q) return null;
  return (
    <article className={cls('qcard', `qcard--${q.pack}`)} aria-label="Sfida">
      <header className="qcard__head">
        <span>{PACK_TITLES[q.pack]}</span>
        <DifficultyDots n={q.difficulty} />
      </header>
      <div className="qcard__cat">{q.category}</div>
      {who && <div className="qcard__who">Risponde: {who}</div>}
      <h3 className="qcard__q">{q.question}</h3>
      {reveal ? (
        <div className="qcard__a">
          <div className="small muted">Risposta attesa</div>
          <p>
            <b>{q.answer}</b>
          </p>
          <p className="small">{q.explanation}</p>
          {q.scripture && <p className="small">📖 {q.scripture}</p>}
          {q.source && <p className="small muted">Fonte: {q.source}</p>}
        </div>
      ) : (
        <div className="qcard__hide">La risposta resta nascosta fino alla valutazione.</div>
      )}
    </article>
  );
}

