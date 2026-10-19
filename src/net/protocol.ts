import type { Action } from '../engine/actions';
import type { GameState, LedgerEntry, LogEntry } from '../engine/types';

/**
 * Architettura di rete
 * --------------------
 * Il dispositivo del CONDUTTORE è l'autorità: riceve le richieste dagli smartphone, le valida con il
 * motore delle regole e pubblica il nuovo stato. Gli smartphone e lo schermo TV sono "client" che
 * leggono lo stato e inviano richieste (mai scritture dirette su saldi o proprietà).
 *
 * Tre trasporti intercambiabili:
 *  - local    : BroadcastChannel nello stesso browser (demo senza configurazioni)
 *  - relay    : piccolo server WebSocket incluso (rete locale / Wi-Fi di casa)
 *  - firebase : Firebase Realtime Database (internet)
 */
export type TransportKind = 'local' | 'relay' | 'firebase';

export interface ActionEnvelope {
  /** identificativo univoco: garantisce che l'azione sia elaborata una sola volta */
  id: string;
  clientId: string;
  action: Action;
  ts: number;
}

export interface PublishPayload {
  state: GameState;
  /** voci nuove del registro eventi dall'ultima pubblicazione (oppure la coda recente in uno snapshot) */
  log: LogEntry[];
  ledger: LedgerEntry[];
  hostTime: number;
}

/** Aggiornamento ricevuto da un client: con Firebase stato e registri arrivano separatamente */
export interface ClientUpdate {
  state?: GameState;
  log?: LogEntry[];
  ledger?: LedgerEntry[];
  hostTime?: number;
}

export type LinkStatus = 'connecting' | 'online' | 'offline';

export interface HostTransport {
  readonly kind: TransportKind;
  connect(): Promise<void>;
  publish(payload: PublishPayload): void;
  onAction(cb: (env: ActionEnvelope) => void): void;
  /** `ts` è espresso con l'orologio locale del conduttore; 0 = il dispositivo si è scollegato */
  onPresence(cb: (clientId: string, ts: number) => void): void;
  onStatus(cb: (status: LinkStatus) => void): void;
  /** Elimina i dati della stanza dal server (se previsto dal trasporto) */
  destroy?(): Promise<void>;
  close(): void;
}

export interface ClientTransport {
  readonly kind: TransportKind;
  connect(): Promise<void>;
  clientId(): string;
  onUpdate(cb: (update: ClientUpdate) => void): void;
  /** `hostOnline` indica se il conduttore risulta collegato */
  onStatus(cb: (status: LinkStatus, hostOnline: boolean) => void): void;
  sendAction(env: ActionEnvelope): Promise<void>;
  sendPresence(): void;
  close(): void;
}

export const TAIL = 200;
export const PRESENCE_EVERY_MS = 5000;
export const HOST_BEAT_EVERY_MS = 2500;
export const HOST_OFFLINE_AFTER_MS = 9000;

/** Alfabeto senza caratteri ambigui (niente 0/O, 1/I/L) */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateRoomCode(len = 5): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

export function normalizeRoomCode(raw: string): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Conserva soltanto le ultime `cap` voci in un elenco ordinato per seq */
export function mergeBySeq<T extends { seq: number }>(current: T[], incoming: T[] | undefined, cap = TAIL): T[] {
  if (!incoming || incoming.length === 0) return current;
  const have = new Set(current.map((e) => e.seq));
  const add = incoming.filter((e) => !have.has(e.seq));
  if (add.length === 0) return current;
  const merged = [...current, ...add].sort((a, b) => a.seq - b.seq);
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

/** Cache dell'ultimo stato pubblicato + coda dei registri (usata per i nuovi arrivati) */
export class SnapshotCache {
  state: GameState | null = null;
  log: LogEntry[] = [];
  ledger: LedgerEntry[] = [];
  hostTime = 0;

  apply(p: PublishPayload): void {
    this.state = p.state;
    this.hostTime = p.hostTime;
    this.log = mergeBySeq(this.log, p.log);
    this.ledger = mergeBySeq(this.ledger, p.ledger);
  }

  snapshot(): PublishPayload | null {
    if (!this.state) return null;
    return { state: this.state, log: this.log, ledger: this.ledger, hostTime: this.hostTime };
  }
}
