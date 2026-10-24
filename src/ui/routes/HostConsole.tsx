import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { GAME_NAME, TOKENS } from '../../config/game.config';
import { createGame } from '../../engine/state';
import type { GameState } from '../../engine/types';
import { createHostTransport } from '../../net/factory';
import { HostController } from '../../net/host';
import { loadHostGame, prepareRestoredState } from '../../net/persist';
import { generateRoomCode, type TransportKind } from '../../net/protocol';
import { Button, Chip, PrefsMenu, cls } from '../components/common';
import { TvScreen } from '../components/TvScreen';
import { LobbyPanel, type JoinBaseCtl } from '../host/LobbyPanel';
import type { GameView } from '../hooks';
import { useAutoBase } from '../joinBase';
import { joinUrl, navigate } from '../router';

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
        </div>

        <button className="host__code" onClick={copyCode} title="Copia il codice della stanza">
          <span className="small muted">{codeCopied ? 'Copiato!' : 'Codice partita'}</span>
          <b>{state.roomCode}</b>
        </button>

        <div className="row wrap host__status">
          <Chip tone="info" title="Giocatori presenti / posti disponibili">
            👥 {state.players.length}/{TOKENS.length}
          </Chip>
        </div>

        <div className="row host__actions">
          <Button variant="gold" size="sm" onClick={() => window.open(tvLink, '_blank', 'noopener')}>
            📺 Schermo TV
          </Button>
          <PrefsMenu />
        </div>
      </header>

      <main className={cls('host__main', !lobby && 'host__main--tv')}>
        {snap.link === 'offline' && <div className="pbanner pbanner--warn">Il collegamento con il server è interrotto: i giocatori non ricevono aggiornamenti finché non torna.</div>}
        {lobby ? (
          <LobbyPanel ctl={ctl} state={state} kind={kind} joinBase={joinBase} onError={onError} />
        ) : (
          <TvScreen view={view} roomCode={state.roomCode} joinLink={link} link={snap.link} hostOnline embedded admin={{ ctl, kind, saved: snap.saved, onError }} />
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
