import { memo, useMemo, type CSSProperties, type ReactNode } from 'react';
import { SQUARES, squareCoords, type SquareDef } from '../../config/board';
import { GROUPS, TIMING } from '../../config/game.config';
import type { GameState, Player, PropState } from '../../engine/types';
import { tokenDef } from '../format';
import { useHostNow, type GameView } from '../hooks';
import { DevMarks } from './cards';
import { cls } from './common';

/** Larghezza relativa delle 11 colonne/righe: angoli più grandi delle caselle laterali */
const CORNER = 2.7;
const TRACKS = [CORNER, 1, 1, 1, 1, 1, 1, 1, 1, 1, CORNER];
const TOTAL = TRACKS.reduce((a, b) => a + b, 0);
const TEMPLATE = TRACKS.map((t) => `${t}fr`).join(' ');

function trackCenter(i: number): number {
  const before = TRACKS.slice(0, i).reduce((a, b) => a + b, 0);
  return ((before + TRACKS[i] / 2) / TOTAL) * 100;
}

export function squareCenter(index: number): { x: number; y: number } {
  const { col, row } = squareCoords(index);
  return { x: trackCenter(col), y: trackCenter(row) };
}

type Side = 'bottom' | 'left' | 'top' | 'right' | 'corner';
function sideOf(index: number): Side {
  if (index % 10 === 0) return 'corner';
  if (index < 10) return 'bottom';
  if (index < 20) return 'left';
  if (index < 30) return 'top';
  return 'right';
}

// ------------------------------------------------------------------ posizioni animate delle pedine

/** Posizione mostrata di ogni pedina: segue il movimento programmato dal conduttore, casella per casella */
export function useDisplayPositions(view: GameView): Record<string, number> {
  const { state } = view;
  const m = state.movement;
  const now = useHostNow(view.hostNow, m ? 60 : 1000);
  const pos: Record<string, number> = {};
  for (const p of state.players) pos[p.id] = p.position;
  if (m) {
    const t = now - m.startsAt;
    const step = t < 0 ? -1 : Math.min(m.path.length - 1, Math.floor(t / m.stepMs));
    pos[m.playerId] = step < 0 ? m.from : m.path[step];
  }
  return pos;
}

// ------------------------------------------------------------------ casella

interface SquareProps {
  sq: SquareDef;
  st: PropState | undefined;
  owner: Player | undefined;
  tag: string | null;
  focus: boolean;
  target: boolean;
  onClick?: (i: number) => void;
}

const Square = memo(function Square({ sq, st, owner, tag, focus, target, onClick }: SquareProps) {
  const { col, row } = squareCoords(sq.index);
  const side = sideOf(sq.index);
  const group = sq.group ? GROUPS[sq.group] : null;
  const style = {
    gridColumn: col + 1,
    gridRow: row + 1,
    ...(group ? { '--gc': group.color, '--gi': group.ink } : {}),
    ...(owner ? { '--oc': tokenDef(owner.token).color } : {}),
  } as CSSProperties;

  return (
    <div
      className={cls('sq', `sq--${sq.kind}`, `sq--${side}`, st?.mortgaged && 'is-mortgaged', focus && 'is-focus', target && 'is-target', !!owner && 'is-owned')}
      style={style}
      onClick={onClick ? () => onClick(sq.index) : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick(sq.index) : undefined}
      aria-label={`${sq.index}. ${sq.name}${sq.city ? ' ' + sq.city : ''}${owner ? ', di ' + owner.name : ''}`}
    >
      {sq.kind === 'street' && group && (
        <div className="sq__band">
          <span className="sq__gnum" aria-hidden="true">
            {group.number}
            {group.symbol}
          </span>
          {st && st.level > 0 && <DevMarks level={st.level} size="sm" />}
        </div>
      )}
      <div className="sq__body">
        {sq.kind !== 'street' && (
          <div className="sq__icon" aria-hidden="true">
            {sq.icon}
          </div>
        )}
        <div className={cls('sq__name', sq.name.length > 18 && 'sq__name--long')}>{sq.name}</div>
        {sq.city && <div className="sq__city">{sq.city}</div>}
        {sq.kind === 'go' && <div className="sq__note">PARTENZA +200</div>}
        {sq.kind === 'jail' && <div className="sq__note">Solo visita</div>}
        {sq.kind === 'tax' && <div className="sq__price">−{sq.amount}</div>}
        {sq.price != null && <div className="sq__price">{sq.price}</div>}
      </div>
      {sq.index === 10 && <div className="sq__cell">Pausa</div>}
      {owner && (
        <span className="sq__owner" title={`Di ${owner.name}`} aria-hidden="true">
          {tokenDef(owner.token).emoji}
        </span>
      )}
      {st?.mortgaged && <div className="sq__mort">IPOTECATA</div>}
      {tag && <div className="sq__tag">{tag}</div>}
    </div>
  );
});

// ------------------------------------------------------------------ tabellone

export function Board({
  view,
  positions,
  onSquareClick,
  children,
  footer,
  rentTag,
}: {
  view: GameView;
  positions: Record<string, number>;
  onSquareClick?: (i: number) => void;
  /** contenuto del riquadro centrale */
  children?: ReactNode;
  /** barra fissa in fondo al riquadro centrale (resta visibile al cambiare delle scene) */
  footer?: ReactNode;
  rentTag?: { square: number; text: string } | null;
}) {
  const { state } = view;
  const current = state.currentPlayerId ? positions[state.currentPlayerId] : null;
  const target = state.movement?.to ?? null;
  const ownersById = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);

  // pedine raggruppate per casella
  const byPos = new Map<number, Player[]>();
  for (const p of state.players) {
    if (p.bankrupt) continue;
    const at = positions[p.id] ?? p.position;
    const list = byPos.get(at) ?? [];
    list.push(p);
    byPos.set(at, list);
  }

  return (
    <div className="board" style={{ '--tracks': TEMPLATE, '--step': `${state.movement ? state.movement.stepMs : TIMING.stepMs}ms` } as CSSProperties}>
      <div className="board__grid" style={{ gridTemplateColumns: TEMPLATE, gridTemplateRows: TEMPLATE }}>
        {SQUARES.map((sq) => (
          <Square
            key={sq.index}
            sq={sq}
            st={state.props[String(sq.index)]}
            owner={ownersById.get(state.props[String(sq.index)]?.owner ?? '')}
            tag={rentTag && rentTag.square === sq.index ? rentTag.text : null}
            focus={current === sq.index}
            target={target === sq.index}
            onClick={onSquareClick}
          />
        ))}
        <div className="board__center">
          <div className="board__main">{children}</div>
          {footer && <div className="board__foot">{footer}</div>}
        </div>
      </div>
      <div className="board__pawns" aria-hidden="false">
        {[...byPos.entries()].flatMap(([at, list]) => {
          const c = squareCenter(at);
          return list.map((p, k) => {
            const n = list.length;
            const ang = (2 * Math.PI * k) / n - Math.PI / 2;
            const r = n === 1 ? 0 : Math.min(2.6, 0.9 + 0.35 * n);
            const dx = Math.cos(ang) * r;
            const dy = Math.sin(ang) * r;
            return (
              <span
                key={p.id}
                className={cls('bpawn', p.id === state.currentPlayerId && 'is-current', state.movement?.playerId === p.id && 'is-moving')}
                style={{ left: `${c.x + dx}%`, top: `${c.y + dy}%`, '--pc': tokenDef(p.token).color } as CSSProperties}
                title={p.name}
              >
                {tokenDef(p.token).emoji}
              </span>
            );
          });
        })}
      </div>
    </div>
  );
}

