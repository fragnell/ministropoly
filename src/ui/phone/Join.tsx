import { useState } from 'react';
import { ECONOMY, GAME_NAME, GAME_TAGLINE, TOKENS } from '../../config/game.config';
import type { GameState, Player } from '../../engine/types';
import { Button, Chip, Pawn, cls } from '../components/common';
import { PlayersPanel } from '../components/panels';
import type { GameView } from '../hooks';

function TokenPicker({ state, value, onChange, mine }: { state: GameState; value: string; onChange: (id: string) => void; mine?: string }) {
  return (
    <div className="tokens" role="radiogroup" aria-label="Scegli la pedina">
      {TOKENS.map((t) => {
        const taken = state.players.some((p) => p.token === t.id && p.id !== mine);
        return (
          <button key={t.id} type="button" role="radio" aria-checked={value === t.id} disabled={taken} className={cls('tokbtn', value === t.id && 'is-on')} onClick={() => onChange(t.id)} title={taken ? `${t.label} (già scelta)` : t.label}>
            <Pawn token={t.id} size="lg" />
            <span className="small">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function JoinForm({ state, roomCode, busy, onJoin }: { state: GameState; roomCode: string; busy: boolean; onJoin: (name: string, token: string, profile: 'adult' | 'kid') => void }) {
  const firstFree = TOKENS.find((t) => !state.players.some((p) => p.token === t.id))?.id ?? TOKENS[0].id;
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('pp:nick') ?? '';
    } catch {
      return '';
    }
  });
  const [token, setToken] = useState(firstFree);
  const [profile, setProfile] = useState<'adult' | 'kid'>('adult');
  const full = state.players.length >= ECONOMY.players.max;
  const valid = name.trim().length > 0 && !full;
  return (
    <form
      className="pjoin"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        try {
          localStorage.setItem('pp:nick', name.trim());
        } catch {
          /* ignora */
        }
        onJoin(name.trim(), token, profile);
      }}
    >
      <div className="pjoin__logo">{GAME_NAME}</div>
      <p className="muted center">{GAME_TAGLINE}</p>
      <div className="center">
        <Chip tone="gold">Stanza {roomCode}</Chip>
      </div>
      <div className="field">
        <label htmlFor="nick">Il tuo nickname</label>
        <input id="nick" className="input" value={name} maxLength={ECONOMY.maxNameLength} onChange={(e) => setName(e.target.value)} placeholder="Ad es. Marco" autoComplete="nickname" autoFocus />
      </div>
      <div className="field">
        <label>La tua pedina</label>
        <TokenPicker state={state} value={token} onChange={setToken} />
      </div>
      <div className="field">
        <label>Profilo per le sfide</label>
        <div className="seg">
          <button type="button" className={cls('seg__btn', profile === 'adult' && 'is-on')} onClick={() => setProfile('adult')}>
            Adulto
          </button>
          <button type="button" className={cls('seg__btn', profile === 'kid' && 'is-on')} onClick={() => setProfile('kid')}>
            Giovane giocatore
          </button>
        </div>
        <div className="small muted">Se le sfide sono attive, i giovani giocatori ricevono domande più semplici.</div>
      </div>
      {full && <div className="neg center">La partita è al completo.</div>}
      <Button type="submit" size="lg" block busy={busy} disabled={!valid}>
        Entra in partita
      </Button>
    </form>
  );
}

/** A partita avviata: si può solo riprendere il proprio posto */
export function SeatPicker({ state, roomCode, busy, onClaim }: { state: GameState; roomCode: string; busy: boolean; onClaim: (id: string) => void }) {
  const seats = state.players.filter((p) => !p.isBot && !p.bankrupt);
  return (
    <div className="pjoin">
      <div className="pjoin__logo">{GAME_NAME}</div>
      <div className="center">
        <Chip tone="gold">Stanza {roomCode}</Chip>
      </div>
      <h2 className="center">La partita è già iniziata</h2>
      <p className="muted center">Se eri già dentro, scegli il tuo nome per riprendere il posto da questo dispositivo.</p>
      <div className="stack">
        {seats.map((p) => {
          const free = !p.connected || !p.clientId;
          return (
            <button key={p.id} className="prow prow--btn" disabled={!free || busy} onClick={() => onClaim(p.id)}>
              <Pawn token={p.token} size="md" />
              <span className="grow">
                <b>{p.name}</b>
                <div className="small muted">{free ? 'Posto libero — tocca per riprenderlo' : 'Collegato da un altro dispositivo'}</div>
              </span>
              <span>{free ? '›' : '🔒'}</span>
            </button>
          );
        })}
        {seats.length === 0 && <div className="muted center">Nessun posto disponibile.</div>}
      </div>
      <p className="small muted center">Se il tuo nome risulta ancora collegato, attendi qualche secondo oppure chiedi al conduttore di liberare il posto.</p>
    </div>
  );
}

export function PhoneLobby({
  view,
  me,
  roomCode,
  busy,
  send,
}: {
  view: GameView;
  me: Player;
  roomCode: string;
  busy: boolean;
  send: (a: import('../../engine/actions').Action) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(me.name);
  const [token, setToken] = useState(me.token);
  const [profile, setProfile] = useState(me.profile);
  const s = view.state;
  return (
    <div className="stack">
      <div className="card center stack">
        <Pawn token={me.token} size="lg" />
        <h2 style={{ margin: 0 }}>Ciao {me.name}!</h2>
        <p className="muted" style={{ margin: 0 }}>
          Sei nella stanza <b>{roomCode}</b>. Attendi che il conduttore avvii la partita.
        </p>
        <Chip tone="ok">{s.players.length} giocator{s.players.length === 1 ? 'e' : 'i'} in sala</Chip>
      </div>
      <PlayersPanel view={view} highlightId={me.id} />
      {!edit ? (
        <Button variant="secondary" block onClick={() => setEdit(true)}>
          ✏️ Cambia nome, pedina o profilo
        </Button>
      ) : (
        <div className="card stack">
          <div className="field">
            <label htmlFor="n2">Nickname</label>
            <input id="n2" className="input" value={name} maxLength={ECONOMY.maxNameLength} onChange={(e) => setName(e.target.value)} />
          </div>
          <TokenPicker state={s} value={token} onChange={setToken} mine={me.id} />
          <div className="seg">
            <button className={cls('seg__btn', profile === 'adult' && 'is-on')} onClick={() => setProfile('adult')}>
              Adulto
            </button>
            <button className={cls('seg__btn', profile === 'kid' && 'is-on')} onClick={() => setProfile('kid')}>
              Giovane giocatore
            </button>
          </div>
          <Button
            busy={busy}
            onClick={() => {
              send({ type: 'UPDATE_PROFILE', name, token, profile });
              setEdit(false);
            }}
          >
            Salva
          </Button>
        </div>
      )}
      <Button variant="ghost" block onClick={() => send({ type: 'LEAVE' })}>
        Esci dalla sala
      </Button>
    </div>
  );
}

