import { useState } from 'react';
import { ECONOMY, SPEED_MODE_MINUTES } from '../../config/game.config';
import type { HostController } from '../../net/host';
import type { TransportKind } from '../../net/protocol';
import { TRANSPORT_LABELS } from '../../net/factory';
import type { GameState } from '../../engine/types';
import { Button, Chip, Pawn, QrImage } from '../components/common';
import { statusChips } from '../components/panels';
import { joinUrl, tvUrl } from '../router';

export interface JoinBaseCtl {
  base: string;
  suggestions: string[];
  setBase: (v: string) => void;
}

export function LobbyPanel({ ctl, state, kind, joinBase, onError }: { ctl: HostController; state: GameState; kind: TransportKind; joinBase: JoinBaseCtl; onError: (m: string) => void }) {
  const room = state.roomCode;
  const link = joinUrl(joinBase.base, room, kind);
  const tv = `${tvUrl(joinBase.base, room, kind)}&b=${encodeURIComponent(joinBase.base)}`;
  const [copied, setCopied] = useState<string | null>(null);
  const run = (a: Parameters<HostController['dispatch']>[0]) => {
    const r = ctl.dispatch(a);
    if (!r.ok) onError(r.error);
  };
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt('Copia il link:', text);
    }
  };
  const s = state.settings;
  const local = joinBase.base.includes('localhost') || joinBase.base.includes('127.0.0.1');

  return (
    <div className="hgrid">
      <section className="card stack">
        <h2>Invita i giocatori</h2>
        <div className="invite">
          <QrImage text={link} size={220} />
          <div className="invite__txt">
            <div className="small muted">Codice stanza</div>
            <div className="invite__code">{room}</div>
            <div className="small muted">Collegamento: {TRANSPORT_LABELS[kind].title}</div>
          </div>
        </div>
        <div className="field">
          <label htmlFor="jl">Indirizzo che i telefoni useranno</label>
          <input id="jl" className="input" value={joinBase.base} onChange={(e) => joinBase.setBase(e.target.value)} spellCheck={false} />
          {joinBase.suggestions.length > 0 && (
            <div className="row wrap">
              {joinBase.suggestions.map((sg) => (
                <Button key={sg} size="sm" variant="secondary" onClick={() => joinBase.setBase(sg)}>
                  {sg}
                </Button>
              ))}
            </div>
          )}
          {local && kind === 'relay' && <div className="small warn-note">Attenzione: «localhost» non funziona dai telefoni. Usa l’indirizzo di rete del computer (es. http://192.168.x.x:8787).</div>}
          {local && kind === 'firebase' && (
            <div className="small warn-note">
              Attenzione: questa pagina è aperta come «localhost», che i telefoni non raggiungono. Pubblica l’app (GitHub Pages o Firebase Hosting, vedi README) e apri da lì il pannello del conduttore, oppure scrivi qui l’indirizzo di rete del computer.
            </div>
          )}
        </div>
        <div className="row wrap">
          <Button variant="secondary" onClick={() => void copy(link, 'join')}>
            {copied === 'join' ? '✓ Copiato' : '📋 Copia link giocatori'}
          </Button>
          <Button variant="gold" onClick={() => window.open(tv, '_blank', 'noopener')}>
            📺 Apri schermo TV
          </Button>
          <Button variant="secondary" onClick={() => void copy(tv, 'tv')}>
            {copied === 'tv' ? '✓ Copiato' : 'Copia link TV'}
          </Button>
        </div>
        {kind === 'local' && <div className="small muted">Demo locale: apri il link in un’altra scheda di questo browser per fare il giocatore (aggiungi <code>?as=2</code> dopo il codice per un secondo giocatore nello stesso browser).</div>}
      </section>

      <section className="card stack">
        <h2>
          Giocatori <Chip>{state.players.length}/{ECONOMY.players.max}</Chip>
        </h2>
        {state.players.length === 0 && <p className="muted">In attesa che qualcuno si colleghi…</p>}
        <ul className="plist">
          {state.players.map((p) => (
            <li key={p.id} className="pl">
              <Pawn token={p.token} size="md" />
              <div className="pl__main">
                <div className="pl__name">{p.name}</div>
                <div className="pl__chips">
                  {p.profile === 'kid' && <Chip tone="info">Giovane</Chip>}
                  {statusChips(state, p)}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => run({ type: 'KICK', playerId: p.id })}>
                Rimuovi
              </Button>
            </li>
          ))}
        </ul>
        <div className="row wrap">
          <Button variant="secondary" disabled={state.players.length >= ECONOMY.players.max} onClick={() => run({ type: 'ADD_BOT' })}>
            🤖 Aggiungi giocatore virtuale
          </Button>
        </div>
        <Button size="lg" disabled={state.players.length < ECONOMY.players.min} onClick={() => run({ type: 'START_GAME' })}>
          ▶ Avvia la partita
        </Button>
        {state.players.length < ECONOMY.players.min && <div className="small muted">Servono almeno {ECONOMY.players.min} giocatori.</div>}
      </section>

      <section className="card stack">
        <h2>Impostazioni</h2>
        <div className="field">
          <label htmlFor="sc">Ore iniziali per giocatore</label>
          <select id="sc" className="input" value={s.startingCash} onChange={(e) => run({ type: 'SET_SETTINGS', settings: { startingCash: Number(e.target.value) } })}>
            {[1000, 1500, 2000, 2500, 3000].map((v) => (
              <option key={v} value={v}>
                {v.toLocaleString('it-IT')} Ore
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="as">Durata del conto alla rovescia delle aste</label>
          <select id="as" className="input" value={s.auctionSeconds} onChange={(e) => run({ type: 'SET_SETTINGS', settings: { auctionSeconds: Number(e.target.value) } })}>
            {[10, 15, 20, 30, 45, 60, 90].map((v) => (
              <option key={v} value={v}>
                {v} secondi
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Espansioni (sfide al posto del contributo)</label>
          <label className="check">
            <input type="checkbox" checked={s.packs.publisher} onChange={(e) => run({ type: 'SET_SETTINGS', settings: { packs: { publisher: e.target.checked } } })} />
            <span>
              <b>Publisher Power Pack</b>
              <div className="small muted">Domande e scenari per adulti</div>
            </span>
          </label>
          <label className="check">
            <input type="checkbox" checked={s.packs.kids} onChange={(e) => run({ type: 'SET_SETTINGS', settings: { packs: { kids: e.target.checked } } })} />
            <span>
              <b>Kids Power Pack</b>
              <div className="small muted">Domande brevi per i bambini</div>
            </span>
          </label>
        </div>
        <div className="field">
          <label className="check">
            <input type="checkbox" checked={s.speedMode.enabled} onChange={(e) => run({ type: 'SET_SETTINGS', settings: { speedMode: { enabled: e.target.checked } } })} />
            <span>
              <b>Partita a tempo (modalità rapida)</b>
              <div className="small muted">Allo scadere si termina il giro e vince il patrimonio più alto</div>
            </span>
          </label>
          {s.speedMode.enabled && (
            <div className="seg">
              {SPEED_MODE_MINUTES.map((m) => (
                <button key={m} className={`seg__btn ${s.speedMode.minutes === m ? 'is-on' : ''}`} onClick={() => run({ type: 'SET_SETTINGS', settings: { speedMode: { minutes: m } } })}>
                  {m} min
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
