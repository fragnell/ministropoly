import { useEffect, useState } from 'react';
import { GAME_NAME, GAME_TAGLINE } from '../../config/game.config';
import { detectTransports, type TransportAvailability } from '../../net/factory';
import type { TransportKind } from '../../net/protocol';
import { normalizeRoomCode } from '../../net/protocol';
import { Button, PrefsMenu } from '../components/common';
import { navigate } from '../router';

/** Trasporto predefinito per chi entra scrivendo il codice: quello più probabile in base a dove è servita la pagina */
export function defaultKind(a: TransportAvailability | null): TransportKind {
  if (a?.relay) return 'relay';
  if (a?.firebase) return 'firebase';
  return 'local';
}

export function CodeEntry({ target, label }: { target: 'join' | 'tv'; label: string }) {
  const [code, setCode] = useState('');
  const [avail, setAvail] = useState<TransportAvailability | null>(null);
  const [kind, setKind] = useState<TransportKind | null>(null);
  useEffect(() => {
    void detectTransports().then((a) => {
      setAvail(a);
      setKind(defaultKind(a));
    });
  }, []);
  const c = normalizeRoomCode(code);
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (c.length >= 4) navigate(`/${target}/${c}?t=${kind ?? 'local'}`);
      }}
    >
      <div className="field">
        <label htmlFor={`code-${target}`}>{label}</label>
        <input id={`code-${target}`} className="input input--code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODICE" maxLength={8} autoCapitalize="characters" autoComplete="off" />
      </div>
      {avail && (avail.relay || avail.firebase) && (
        <div className="field">
          <label>Connessione</label>
          <div className="seg">
            {(['relay', 'firebase', 'local'] as const)
              .filter((k) => k === 'local' || (k === 'relay' && avail.relay) || (k === 'firebase' && avail.firebase))
              .map((k) => (
                <button key={k} type="button" className={`seg__btn ${kind === k ? 'is-on' : ''}`} onClick={() => setKind(k)}>
                  {k === 'relay' ? 'Rete locale' : k === 'firebase' ? 'Online' : 'Demo'}
                </button>
              ))}
          </div>
        </div>
      )}
      <Button type="submit" size="lg" block disabled={c.length < 4}>
        Continua
      </Button>
    </form>
  );
}

export function Home() {
  return (
    <div className="home">
      <header className="home__top">
        <span />
        <PrefsMenu />
      </header>
      <section className="home__hero">
        <div className="home__logo" aria-hidden="true">
          🏛️
        </div>
        <h1>{GAME_NAME}</h1>
        <p className="home__tag">{GAME_TAGLINE}</p>
        <p className="home__verse">
          «…usando al meglio il vostro tempo…»
          <cite>Efesini 5:15-16</cite>
        </p>
      </section>

      <section className="home__grid">
        <div className="card home__card">
          <div className="home__ico" aria-hidden="true">
            📱
          </div>
          <h2>Sono un giocatore</h2>
          <p className="muted">Entra dal tuo smartphone con il codice mostrato sullo schermo (oppure inquadra il QR).</p>
          <CodeEntry target="join" label="Codice della partita" />
        </div>

        <div className="card home__card">
          <div className="home__ico" aria-hidden="true">
            🎛️
          </div>
          <h2>Conduttore / Schermo TV</h2>
          <p className="muted">Questo dispositivo è l’arbitro tecnico del gioco: crea la stanza, scegli le impostazioni, avvia e gestisci la partita — e mostra il tabellone a tutti.</p>
          <Button size="lg" block onClick={() => navigate('/host')}>
            Crea o riprendi una partita
          </Button>
          <p className="small muted home__or">oppure, su una TV o un tablet già avviato:</p>
          <CodeEntry target="tv" label="Codice della partita" />
        </div>
      </section>

      <section className="home__how card">
        <h3>Come si gioca</h3>
        <ol>
          <li>Il conduttore crea la partita; la TV mostra il tabellone con il QR code.</li>
          <li>Ogni persona entra dal proprio telefono, sceglie nickname e pedina.</li>
          <li>Si lanciano i dadi dal telefono, si comprano e si sviluppano i territori, si fanno aste e scambi.</li>
          <li>Vince chi resta l’ultimo giocatore (o, nella partita a tempo, chi ha il patrimonio più alto).</li>
        </ol>
        <p className="small muted">Gioco di società a scopo ricreativo: le Ore e i punteggi non hanno alcun legame con il servizio reale né con la spiritualità di nessuno.</p>
      </section>
    </div>
  );
}
