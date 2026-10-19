import { useEffect, useState, useSyncExternalStore } from 'react';
import { ClientStore } from '../../net/client';
import { createClientTransport } from '../../net/factory';
import type { TransportKind } from '../../net/protocol';
import { Button, PrefsMenu } from '../components/common';
import { JoinForm, SeatPicker } from '../phone/Join';
import { PhoneGame } from '../phone/PhoneGame';
import { navigate } from '../router';

export function useClientStore(room: string, kind: TransportKind): { store: ClientStore | null; error: string | null } {
  const [store, setStore] = useState<ClientStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const st = new ClientStore(createClientTransport(kind, room));
    setStore(st);
    setError(null);
    st.start().catch((e) => setError(e instanceof Error ? e.message : String(e)));
    return () => st.stop();
  }, [room, kind]);
  return { store, error };
}

const EMPTY_SNAP = { state: null, log: [], ledger: [], link: 'connecting' as const, hostOnline: false, me: null, busy: false, notice: null, error: null };
const noop = () => () => {};

export function PlayerPage({ room, kind }: { room: string; kind: TransportKind }) {
  const { store, error } = useClientStore(room, kind);
  const snap = useSyncExternalStore(store ? store.subscribe : noop, store ? store.getSnapshot : () => EMPTY_SNAP);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setWaited(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // errori del motore (es. nome già in uso) mostrati anche prima di essere seduti
  useEffect(() => {
    if (!snap.notice || !store) return;
    const id = setTimeout(() => store.clearNotice(), 4500);
    return () => clearTimeout(id);
  }, [snap.notice, store]);

  if (error) {
    return (
      <div className="pjoin">
        <h2 className="center">Impossibile collegarsi</h2>
        <p className="muted center">{error}</p>
        <Button onClick={() => location.reload()}>Riprova</Button>
        <Button variant="ghost" onClick={() => navigate('/')}>
          Indietro
        </Button>
      </div>
    );
  }

  if (!store || !snap.state) {
    return (
      <div className="pjoin center">
        <div className="spinner" aria-hidden="true" />
        <h2>Collegamento alla stanza {room}…</h2>
        <p className="muted">{snap.link === 'offline' ? 'Connessione assente.' : waited ? 'Il conduttore non risponde ancora. Controlla il codice e che il conduttore abbia creato la partita.' : 'Un istante…'}</p>
        {waited && (
          <Button variant="secondary" onClick={() => navigate('/')}>
            Cambia codice
          </Button>
        )}
      </div>
    );
  }

  const toast = snap.notice && (
    <div className="toasts" role="status">
      <div className={`toast ${snap.notice.level === 'error' ? 'toast--error' : ''}`} onClick={() => store.clearNotice()}>
        {snap.notice.level === 'error' ? '⚠️' : 'ℹ️'} {snap.notice.text}
      </div>
    </div>
  );

  if (!snap.me) {
    const s = snap.state;
    return (
      <div className="phone">
        <div style={{ position: 'absolute', right: 10, top: 10 }}>
          <PrefsMenu />
        </div>
        {s.phase === 'lobby' ? (
          <JoinForm state={s} roomCode={room} busy={snap.busy} onJoin={(name, token, profile) => void store.send({ type: 'JOIN', name, token, profile })} />
        ) : s.phase === 'game_over' ? (
          <div className="pjoin center">
            <h2>La partita è terminata</h2>
            <p className="muted">Grazie per aver giocato!</p>
            <Button onClick={() => navigate('/')}>Torna all’inizio</Button>
          </div>
        ) : (
          <SeatPicker state={s} roomCode={room} busy={snap.busy} onClaim={(id) => void store.send({ type: 'JOIN', name: '-', token: s.players.find((p) => p.id === id)?.token ?? 'borsa', claim: id })} />
        )}
        {toast}
      </div>
    );
  }

  return <PhoneGame store={store} snap={snap} roomCode={room} />;
}
