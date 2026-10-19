import { useEffect, useRef, useState } from 'react';
import { GAME_NAME } from '../../config/game.config';
import { TRANSPORT_LABELS, detectTransports, type TransportAvailability } from '../../net/factory';
import { deleteHostGame, listSavedGames, parseImportedGame, prepareRestoredState, type SavedGameInfo } from '../../net/persist';
import { generateRoomCode, type TransportKind } from '../../net/protocol';
import { Button, Chip, PrefsMenu, cls } from '../components/common';
import { fmtTime } from '../format';
import { navigate } from '../router';

export function HostSetup() {
  const [avail, setAvail] = useState<TransportAvailability | null>(null);
  const [kind, setKind] = useState<TransportKind>('local');
  const [saved, setSaved] = useState<SavedGameInfo[]>(() => listSavedGames());
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void detectTransports().then((a) => {
      setAvail(a);
      setKind(a.firebase ? 'firebase' : a.relay ? 'relay' : 'local');
    });
  }, []);

  const options: { kind: TransportKind; ok: boolean; why?: string }[] = [
    { kind: 'local', ok: true },
    { kind: 'relay', ok: !!avail?.relay, why: 'Avvia il server incluso con «npm run lan» e apri l’indirizzo che mostra.' },
    { kind: 'firebase', ok: !!avail?.firebase, why: 'Configura il file .env con i dati del tuo progetto Firebase (vedi README).' },
  ];

  const create = (demo?: boolean) => navigate(`/host/${generateRoomCode()}?t=${demo ? 'local' : kind}&new=${demo ? 'demo' : '1'}`);

  const importFile = async (file: File) => {
    try {
      const text = await file.text();
      const g = parseImportedGame(text);
      const room = generateRoomCode();
      const restored = prepareRestoredState(g.state, room, Date.now(), false);
      sessionStorage.setItem('pp:import', JSON.stringify(restored));
      navigate(`/host/${room}?t=${kind}&import=1`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Importazione non riuscita');
    }
  };

  return (
    <div className="home hostsetup">
      <header className="home__top">
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          ‹ Indietro
        </Button>
        <PrefsMenu />
      </header>
      <section className="home__hero">
        <h1>Pannello del conduttore</h1>
        <p className="muted">
          Questo dispositivo è l’arbitro tecnico di <b>{GAME_NAME}</b>: valida le azioni dei giocatori e tiene lo stato della partita. Lascialo acceso e collegato per tutta la partita.
        </p>
      </section>

      <section className="card stack">
        <h2>1. Come si collegano i dispositivi?</h2>
        <div className="kinds">
          {options.map((o) => (
            <button key={o.kind} className={cls('kind', kind === o.kind && 'is-on', !o.ok && 'is-off')} disabled={!o.ok} onClick={() => setKind(o.kind)}>
              <b>{TRANSPORT_LABELS[o.kind].title}</b>
              <span className="small muted">{TRANSPORT_LABELS[o.kind].hint}</span>
              {!o.ok && <span className="small warn-note">Non disponibile: {o.why}</span>}
              {o.ok && kind === o.kind && <Chip tone="ok">Selezionato</Chip>}
            </button>
          ))}
        </div>
        <Button size="lg" onClick={() => create()}>
          Crea una nuova partita
        </Button>
        <Button variant="secondary" onClick={() => create(true)}>
          Prova subito la demo (con giocatori virtuali, nello stesso browser)
        </Button>
      </section>

      <section className="card stack">
        <h2>Partite salvate su questo dispositivo</h2>
        {saved.length === 0 && <p className="muted">Nessuna partita salvata.</p>}
        {saved.map((g) => (
          <div key={g.room} className="prow">
            <div className="grow">
              <b>Stanza {g.room}</b>{' '}
              <Chip>{g.phase === 'game_over' ? 'terminata' : g.phase === 'lobby' ? 'sala d’attesa' : 'in corso'}</Chip>
              <div className="small muted">
                {TRANSPORT_LABELS[g.transport].title} · {g.players.join(', ') || 'nessun giocatore'} · salvata alle {fmtTime(g.savedAt)}
              </div>
            </div>
            <Button size="sm" onClick={() => navigate(`/host/${g.room}?t=${g.transport}`)}>
              Riprendi
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                deleteHostGame(g.room);
                setSaved(listSavedGames());
              }}
            >
              Elimina
            </Button>
          </div>
        ))}
        <div className="row wrap">
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            Importa una partita da file…
          </Button>
          <span className="small muted">L’importazione crea una nuova stanza: i giocatori rientrano scegliendo il proprio nome.</span>
        </div>
        {msg && <div className="neg">{msg}</div>}
      </section>
    </div>
  );
}
