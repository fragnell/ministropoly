import { FirebaseClientTransport, FirebaseHostTransport, isFirebaseConfigured } from './firebase';
import { readAsParam } from './identity';
import { LocalClientTransport, LocalHostTransport } from './local';
import type { ClientTransport, HostTransport, TransportKind } from './protocol';
import { RelayClientTransport, RelayHostTransport, detectRelay, type RelayInfo } from './relay';

export function createHostTransport(kind: TransportKind, room: string, firebaseApp?: string): HostTransport {
  if (kind === 'firebase') return new FirebaseHostTransport(room, firebaseApp);
  if (kind === 'relay') return new RelayHostTransport(room);
  return new LocalHostTransport(room);
}

export function createClientTransport(kind: TransportKind, room: string, forcedClientId?: string, firebaseApp?: string): ClientTransport {
  // con ?as=nome nell'indirizzo, più giocatori nello stesso browser hanno utenti anonimi Firebase distinti
  const as = readAsParam();
  if (kind === 'firebase') return new FirebaseClientTransport(room, firebaseApp ?? (as ? `as-${as}` : undefined));
  if (kind === 'relay') return new RelayClientTransport(room, forcedClientId);
  return new LocalClientTransport(room, forcedClientId);
}

export interface TransportAvailability {
  local: true;
  relay: RelayInfo | null;
  firebase: boolean;
}

export async function detectTransports(): Promise<TransportAvailability> {
  return { local: true, relay: await detectRelay(), firebase: isFirebaseConfigured() };
}

export const TRANSPORT_LABELS: Record<TransportKind, { title: string; hint: string }> = {
  local: { title: 'Demo locale', hint: 'Più schede dello stesso browser. Nessuna configurazione.' },
  relay: { title: 'Rete locale (Wi-Fi)', hint: 'Telefoni e TV sulla stessa rete, con il server incluso.' },
  firebase: { title: 'Online (Firebase)', hint: 'Anche da reti diverse, tramite internet.' },
};

export function parseTransportKind(v: string | null | undefined): TransportKind {
  return v === 'relay' || v === 'firebase' ? v : 'local';
}
