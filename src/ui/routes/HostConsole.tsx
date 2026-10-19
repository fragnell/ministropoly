import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GAME_NAME, TOKENS } from '../../config/game.config';
import { createGame } from '../../engine/state';
import type { GameState } from '../../engine/types';
import { createHostTransport, TRANSPORT_LABELS } from '../../net/factory';
import { HostController } from '../../net/host';
import { exportGameJson, loadHostGame, parseImportedGame, prepareRestoredState } from '../../net/persist';
import { generateRoomCode, type TransportKind } from '../../net/protocol';
import { Button, Chip, LinkBadge, PrefsMenu, cls } from '../components/common';
import { ActivityFeed, LedgerList } from '../components/panels';
import { TvScreen } from '../components/TvScreen';
import { ControlPanel } from '../host/ControlPanel';
import { LobbyPanel, type JoinBaseCtl } from '../host/LobbyPanel';
import { fmtTime } from '../format';
import type { GameView } from '../hooks';
import { useAutoBase } from '../joinBase';
import { joinUrl, navigate } from '../router';

type HostTab = 'control' | 'tv' | 'log' | 'ledger' | 'save';

function useJoinBase(kind: TransportKind): JoinBaseCtl {
  const KEY = 'pp:base';
  const [custom, setCustom] = useState<string | null>(() => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  });
  const { auto, suggestions } = useAutoBase(kind);
  return {
    base: custom ?? auto,
    suggestions,
    setBase: (v) => {
      setCustom(v);
      try {
        localStorage.setItem(KEY, v);
      } catch {
        /* ignora */
      }
    },
  };
}

export function HostConsole({ room, kind, isNew, fromImport }: { room: string; kind: TransportKind; isNew: string | null; fromImport: boolean }) {
  const [ctl, setCtl] = useState<HostController | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Parametri letti UNA volta: dopo la creazione l'indirizzo viene ripulito da «new=1», così un
  // aggiornamento della pagina riprende la partita salvata invece di crearne una nuova.
  const initial = useRef({ isNew, fromImport });

  useEffect(() => {
    const { isNew, fromImport } = initial.current;
    let alive = true;
    const now = Date.now();
    let state: GameState;
    try {
      if (fromImport) {
        const raw = sessionStorage.getItem('pp:import');
        if (!raw) throw new Error('Nessuna partita da importare');
        state = JSON.parse(raw) as GameState;
        state.roomCode = room;
      } else {
        const saved = !isNew ? loadHostGame(room) : null;
        state = saved ? prepareRestoredState(saved.state, room, now, true) : createGame(room, (crypto.getRandomValues(new Uint32Array(1))[0] ^ now) >>> 0, now);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return;
    }
    const c = new HostController(createHostTransport(kind, room), state);
    c.start()
      .then(() => {
        if (!alive) return;
        setCtl(c);
        if (isNew || fromImport) {
          initial.current = { isNew: null, fromImport: false };
          navigate(`/host/${room}?t=${kind}`, true);
        }
        if (isNew === 'demo') {
          c.dispatch({ type: 'ADD_BOT' });
          c.dispatch({ type: 'ADD_BOT' });
        }
      })
      .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      alive = false;
      c.stop();
    };
  }, [room, kind]);

  if (error) {
    return (
      <div className="pjoin center">
        <h2>Non riesco ad aprire la stanza</h2>
        <p className="muted">{error}</p>
        <Button onClick={() => navigate(`/host/${generateRoomCode()}?t=${kind}&new=1`)}>Riprova con un nuovo codice</Button>
        <Button variant="ghost" onClick={() => navigate('/host')}>
          Indietro
        </Button>
      </div>
    );
  }
  if (!ctl) {
    return (
      <div className="pjoin center">
        <div className="spinner" aria-hidden="true" />
        <h2>Apertura della stanza {room}…</h2>
      </div>
    );
  }
  return <HostScreen ctl={ctl} kind={kind} />;
}

function HostScreen({ ctl, kind }: { ctl: HostController; kind: TransportKind }) {
  const snap = useSyncExternalStore(ctl.subscribe, ctl.getSnapshot);
  const state = snap.state;
  const [tab, setTab] = useState<HostTab>('control');
  const [toast, setToast] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const joinBase = useJoinBase(kind);
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(state.roomCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 1800);
    } catch {
      window.prompt('Copia il codice:', state.roomCode);
    }
  };
  const onError = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 4500);
  }, []);
  const view: GameView = useMemo(() => ({ state, log: state.log, ledger: state.ledger, hostNow: () => Date.now() }), [state]);
  const lobby = state.phase === 'lobby';
  const link = joinUrl(joinBase.base, state.roomCode, kind);
  const tvLink = `${link.replace('#/join/', '#/tv/')}&b=${encodeURIComponent(joinBase.base)}`;

  return (
    <div className="host">
      <header className="host__bar">
        <div className="tv__brand">
          <span className="tv__logo" aria-hidden="true">
            🎛️
          </span>
          <b>{GAME_NAME}</b>
          <span className="muted small">conduttore</span>
        </div>

        <button className="host__code" onClick={copyCode} title="Copia il codice della stanza">
          <span className="small muted">Codice partita</span>
          <b>{state.roomCode}</b>
          <span aria-hidden="true">{codeCopied ? '✓' : '📋'}</span>
        </button>

        <div className="row wrap host__status">
          <Chip tone="info" title="Giocatori presenti / posti disponibili">
            👥 {state.players.length}/{TOKENS.length}
          </Chip>
          <LinkBadge link={snap.link} hostOnline />
          <Chip title={TRANSPORT_LABELS[kind].title}>{TRANSPORT_LABELS[kind].title}</Chip>
        </div>

        {!lobby && (
          <nav className="host__tabs" aria-label="Sezioni del conduttore">
            {(
              [
                ['control', '🎛️', 'Controllo'],
                ['tv', '📺', 'Tabellone'],
                ['log', '📜', 'Cronologia'],
                ['ledger', '💶', 'Registro economico'],
                ['save', '💾', 'Salvataggio'],
              ] as [HostTab, string, string][]
            ).map(([id, icon, label]) => (
              <button key={id} className={cls('host__tab', tab === id && 'is-on')} onClick={() => setTab(id)} title={label}>
                <span aria-hidden="true">{icon}</span> <span className="host__tab-label">{label}</span>
              </button>
            ))}
          </nav>
        )}

        <div className="row host__actions">
          <Button variant="gold" size="sm" onClick={() => window.open(tvLink, '_blank', 'noopener')}>
            📺 Schermo TV
          </Button>
          <PrefsMenu />
        </div>
      </header>

      <main className={cls('host__main', tab === 'tv' && !lobby && 'host__main--tv')}>
        {snap.link === 'offline' && <div className="pbanner pbanner--warn">Il collegamento con il server è interrotto: i giocatori non ricevono aggiornamenti finché non torna.</div>}
        {lobby ? (
          <LobbyPanel ctl={ctl} state={state} kind={kind} joinBase={joinBase} onError={onError} />
        ) : tab === 'control' ? (
          <ControlPanel ctl={ctl} view={view} onError={onError} />
        ) : tab === 'tv' ? (
          <TvScreen view={view} roomCode={state.roomCode} joinLink={link} link={snap.link} hostOnline embedded />
        ) : tab === 'log' ? (
          <section className="card">
            <h2>Cronologia della partita</h2>
            <ActivityFeed entries={state.log} limit={400} />
          </section>
        ) : tab === 'ledger' ? (
          <section className="card">
            <h2>Registro economico</h2>
            <p className="small muted">Ogni variazione di saldo è registrata con causale, saldi prima e dopo. Qui le ultime 150 operazioni; il file di esportazione le contiene tutte.</p>
            <div className="tablewrap">
              <LedgerList state={state} entries={state.ledger} limit={150} />
            </div>
          </section>
        ) : (
          <SavePanel ctl={ctl} kind={kind} saved={snap.saved} onError={onError} />
        )}
      </main>

      {toast && (
        <div className="toasts" role="alert">
          <div className="toast toast--error">⚠️ {toast}</div>
        </div>
      )}
    </div>
  );
}

function SavePanel({ ctl, kind, saved, onError }: { ctl: HostController; kind: TransportKind; saved: number | null; onError: (m: string) => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const download = () => {
    const state = ctl.fullState();
    const blob = new Blob([exportGameJson(state, kind)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${GAME_NAME.toLowerCase()}-${state.roomCode}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  void parseImportedGame;
  return (
    <div className="hgrid">
      <section className="card stack">
        <h2>Salvataggio e ripristino</h2>
        <p>
          La partita viene salvata automaticamente su questo dispositivo dopo ogni mossa{saved ? ` (ultimo salvataggio alle ${fmtTime(saved)})` : ''}. Se la pagina si aggiorna o il browser si chiude, riaprila dal pannello del conduttore e scegli «Riprendi»: i giocatori
          si ricollegano da soli.
        </p>
        <div className="row wrap">
          <Button
            variant="secondary"
            onClick={() => {
              if (ctl.saveNow()) setMsg('Partita salvata su questo dispositivo.');
              else onError('Salvataggio non riuscito (memoria del browser piena?).');
            }}
          >
            💾 Salva ora
          </Button>
          <Button variant="secondary" onClick={download}>
            ⬇ Esporta la partita (file JSON)
          </Button>
        </div>
        {msg && <div className="pos">{msg}</div>}
        <p className="small muted">Il file può essere importato da «Pannello del conduttore → Importa una partita» anche su un altro dispositivo. L’importazione crea una nuova stanza e mette la partita in pausa.</p>
      </section>
      <section className="card stack">
        <h2>Fine sessione</h2>
        <p className="small muted">Quando tutti hanno finito, puoi chiudere la stanza. Con Firebase puoi anche cancellare i dati della stanza dal database.</p>
        {kind === 'firebase' && (
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm('Cancellare la stanza dal database online? I giocatori non potranno più rientrare.')) {
                ctl
                  .destroyRoom()
                  .then(() => setMsg('Stanza cancellata dal database.'))
                  .catch(() => onError('Impossibile cancellare la stanza.'));
              }
            }}
          >
            Cancella la stanza dal database
          </Button>
        )}
        <Button variant="secondary" onClick={() => navigate('/host')}>
          Torna al pannello iniziale
        </Button>
      </section>
    </div>
  );
}
