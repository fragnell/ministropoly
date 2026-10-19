import { useMemo, useSyncExternalStore } from 'react';
import type { TransportKind } from '../../net/protocol';
import { Button } from '../components/common';
import { TvScreen } from '../components/TvScreen';
import { useAutoBase } from '../joinBase';
import { joinUrl, navigate } from '../router';
import { useClientStore } from './PlayerPage';

const EMPTY = { state: null, log: [], ledger: [], link: 'connecting' as const, hostOnline: false, me: null, busy: false, notice: null, error: null };
const noop = () => () => {};

/** Schermo TV/tablet: client di sola lettura che mostra il tabellone */
export function TvPage({ room, kind, base }: { room: string; kind: TransportKind; base: string | null }) {
  const { store, error } = useClientStore(room, kind);
  const { auto } = useAutoBase(kind);
  const snap = useSyncExternalStore(store ? store.subscribe : noop, store ? store.getSnapshot : () => EMPTY);
  const view = useMemo(() => (snap.state && store ? { state: snap.state, log: snap.log, ledger: snap.ledger, hostNow: store.hostNow } : null), [snap.state, snap.log, snap.ledger, store]);

  if (error) {
    return (
      <div className="pjoin center">
        <h2>Impossibile collegarsi</h2>
        <p className="muted">{error}</p>
        <Button onClick={() => location.reload()}>Riprova</Button>
      </div>
    );
  }
  if (!view) {
    return (
      <div className="pjoin center">
        <div className="spinner" aria-hidden="true" />
        <h2>Collegamento alla stanza {room}…</h2>
        <Button variant="ghost" onClick={() => navigate('/')}>
          Indietro
        </Button>
      </div>
    );
  }
  return <TvScreen view={view} roomCode={room} joinLink={joinUrl(base ?? auto, room, kind)} link={snap.link} hostOnline={snap.hostOnline} />;
}
