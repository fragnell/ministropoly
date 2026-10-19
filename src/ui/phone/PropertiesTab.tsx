import { useMemo, useState } from 'react';
import { BUYABLE_INDICES, SQUARES, squareLabel } from '../../config/board';
import { GROUPS, GROUP_ORDER } from '../../config/game.config';
import {
  canDevelop,
  canManageNow,
  canMortgage,
  canUnmortgage,
  developCost,
  fullGroupsOwned,
  sellDevelopmentQuote,
} from '../../engine/selectors';
import { findP, fmtMoney } from '../format';
import { DevMarks, PropertyCard } from '../components/cards';
import { Button, Chip, EmptyNote, Modal, Pawn, cls } from '../components/common';
import type { PhoneCtx } from './types';

type Filter = 'all' | 'free' | 'mine' | 'others' | 'services' | 'mortgaged' | 'developed';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Tutte' },
  { id: 'free', label: 'Libere' },
  { id: 'mine', label: 'Mie' },
  { id: 'others', label: 'Avversari' },
  { id: 'services', label: 'Servizi' },
  { id: 'mortgaged', label: 'Ipotecate' },
  { id: 'developed', label: 'Sviluppate' },
];

export function PropertiesTab({ ctx }: { ctx: PhoneCtx }) {
  const { view, me, openProperty } = ctx;
  const s = view.state;
  const [filter, setFilter] = useState<Filter>('all');
  const [group, setGroup] = useState<string | null>(null);
  const [owner, setOwner] = useState<string>('');

  const list = useMemo(() => {
    return BUYABLE_INDICES.filter((i) => {
      const sq = SQUARES[i];
      const st = s.props[String(i)];
      if (group && sq.group !== group) return false;
      if (owner && st.owner !== owner) return false;
      switch (filter) {
        case 'free':
          return !st.owner;
        case 'mine':
          return st.owner === me.id;
        case 'others':
          return !!st.owner && st.owner !== me.id;
        case 'services':
          return sq.kind === 'special' || sq.kind === 'utility';
        case 'mortgaged':
          return st.mortgaged;
        case 'developed':
          return st.level > 0;
        default:
          return true;
      }
    });
  }, [s.props, filter, group, owner, me.id]);

  const completed = fullGroupsOwned(s, me.id);
  const listValue = list.reduce((a, i) => a + (s.props[String(i)].owner ? SQUARES[i].price ?? 0 : 0), 0);

  return (
    <div className="stack">
      <div className="chips-scroll" role="tablist" aria-label="Filtri">
        {FILTERS.map((f) => (
          <button key={f.id} role="tab" aria-selected={filter === f.id} className={cls('fchip', filter === f.id && 'is-on')} onClick={() => setFilter(f.id)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="chips-scroll" aria-label="Gruppi di colore">
        {GROUP_ORDER.map((g) => (
          <button
            key={g}
            className={cls('gchip', group === g && 'is-on')}
            style={{ background: GROUPS[g].color, color: GROUPS[g].ink }}
            onClick={() => setGroup(group === g ? null : g)}
            aria-pressed={group === g}
            title={GROUPS[g].label}
          >
            {GROUPS[g].number}
            {GROUPS[g].symbol}
          </button>
        ))}
      </div>
      <div className="row">
        <label className="small muted" htmlFor="ownerf">
          Proprietario
        </label>
        <select id="ownerf" className="input" style={{ minHeight: 38 }} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">Tutti</option>
          {s.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === me.id ? ' (io)' : ''}
            </option>
          ))}
        </select>
      </div>
      {owner && (
        <div className="small muted">
          {list.length} proprietà · valore d’acquisto {fmtMoney(listValue)} Ore
        </div>
      )}
      {completed.length > 0 && (
        <div className="small">
          Gruppi completi:{' '}
          {completed.map((g) => (
            <Chip key={g} tone="ok">
              {GROUPS[g].symbol} {GROUPS[g].label}
            </Chip>
          ))}
        </div>
      )}
      {list.length === 0 && <EmptyNote>Nessuna proprietà con questi filtri.</EmptyNote>}
      <ul className="plist2">
        {list.map((i) => {
          const sq = SQUARES[i];
          const st = s.props[String(i)];
          const owner = findP(s, st.owner);
          const g = sq.group ? GROUPS[sq.group] : null;
          return (
            <li key={i}>
              <button className={cls('prop', st.mortgaged && 'is-mortgaged', st.owner === me.id && 'is-mine')} onClick={() => openProperty(i)}>
                <span className="prop__sw" style={{ background: g?.color ?? 'var(--petrol)', color: g?.ink ?? '#fff' }}>
                  {g ? `${g.number}${g.symbol}` : sq.icon}
                </span>
                <span className="prop__main">
                  <b>{sq.name}</b>
                  <span className="small muted">
                    {sq.city ? sq.city + ' · ' : ''}
                    {fmtMoney(sq.price ?? 0)} Ore
                  </span>
                </span>
                <span className="prop__side">
                  {st.level > 0 && <DevMarks level={st.level} />}
                  {st.mortgaged && <Chip tone="danger">Ipot.</Chip>}
                  {owner ? <Pawn token={owner.token} size="sm" title={owner.name} /> : <Chip tone="ok">Libera</Chip>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ scheda con azioni

export function PropertySheet({ ctx, index, onClose }: { ctx: PhoneCtx; index: number; onClose: () => void }) {
  const { view, me, send, busy } = ctx;
  const s = view.state;
  const sq = SQUARES[index];
  const st = s.props[String(index)];
  const mine = st.owner === me.id;
  const manage = canManageNow(s, me.id);
  const inDebt = s.phase === 'debt';
  const why = !manage ? (s.currentPlayerId !== me.id ? 'Puoi gestire le proprietà durante il tuo turno.' : 'In questo momento non puoi gestire le proprietà.') : null;

  let actions: React.ReactNode = null;
  if (mine) {
    const dev = sq.kind === 'street' ? canDevelop(s, me.id, index) : null;
    const devInfo = sq.kind === 'street' ? developCost(s, me.id, index) : null;
    const sell = sq.kind === 'street' && st.level > 0 ? sellDevelopmentQuote(s, me.id, index) : null;
    const mort = canMortgage(s, me.id, index);
    const unm = canUnmortgage(s, me.id, index);
    actions = (
      <div className="stack">
        {sq.kind === 'street' && (
          <>
            <Button
              block
              busy={busy}
              disabled={!manage || inDebt || !dev?.ok}
              onClick={() => send({ type: 'DEVELOP', square: index })}
            >
              {st.level >= 4 ? '📘 Installa lo studio biblico' : '➕ Aggiungi una visita ulteriore'} ({fmtMoney(devInfo?.cost ?? 0)} Ore{devInfo && devInfo.discount > 0 ? `, sconto ${devInfo.discount}%` : ''})
            </Button>
            {dev && !dev.ok && <div className="small muted">{dev.reason}.</div>}
            {st.level > 0 && (
              <Button block variant="secondary" busy={busy} disabled={!manage || !sell?.ok} onClick={() => send({ type: 'SELL_DEVELOPMENT', square: index })}>
                Vendi uno sviluppo alla banca {sell?.ok ? `(+${fmtMoney(sell.refund)} Ore)` : ''}
              </Button>
            )}
            {sell && !sell.ok && <div className="small muted">{sell.reason}.</div>}
          </>
        )}
        {!st.mortgaged ? (
          <>
            <Button block variant="secondary" busy={busy} disabled={!manage || !mort.ok} onClick={() => send({ type: 'MORTGAGE', square: index })}>
              Ipoteca {mort.ok ? `(+${fmtMoney(mort.value)} Ore)` : ''}
            </Button>
            {!mort.ok && <div className="small muted">{mort.reason}.</div>}
          </>
        ) : (
          <>
            <Button block variant="secondary" busy={busy} disabled={!manage || inDebt || !unm.ok} onClick={() => send({ type: 'UNMORTGAGE', square: index })}>
              Libera l’ipoteca {unm.ok ? `(−${fmtMoney(unm.cost)} Ore)` : ''}
            </Button>
            {!unm.ok && <div className="small muted">{unm.reason}.</div>}
          </>
        )}
        {why && <div className="small muted">{why}</div>}
        {st.owner && (
          <Button block variant="ghost" onClick={() => { onClose(); ctx.openTrade({ request: [], to: undefined }); }}>
            🤝 Proponi uno scambio
          </Button>
        )}
      </div>
    );
  } else if (st.owner) {
    actions = (
      <Button
        block
        variant="secondary"
        onClick={() => {
          onClose();
          ctx.openTrade({ to: st.owner as string, request: [index] });
        }}
      >
        🤝 Proponi uno scambio per «{sq.name}»
      </Button>
    );
  }

  return (
    <Modal onClose={onClose} label={squareLabel(index)}>
      <div className="stack">
        <PropertyCard state={s} index={index} />
        {actions}
      </div>
    </Modal>
  );
}
