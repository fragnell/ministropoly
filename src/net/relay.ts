/**
 * Trasporto RETE LOCALE: WebSocket verso il server incluso (server/relay.mjs).
 * Funziona tra dispositivi diversi collegati allo stesso Wi-Fi, senza internet né account.
 */
import {
  HOST_BEAT_EVERY_MS,
  PRESENCE_EVERY_MS,
  SnapshotCache,
  uid,
  type ActionEnvelope,
  type ClientTransport,
  type ClientUpdate,
  type HostTransport,
  type LinkStatus,
  type PublishPayload,
} from './protocol';
import { getClientId } from './identity';
import { startTicker } from './ticker';

export interface RelayInfo {
  app: string;
  lanAddresses: string[];
  port: number;
}

export function relayUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}

/** Controlla se la pagina è servita dal server di rete locale */
export async function detectRelay(timeoutMs = 1500): Promise<RelayInfo | null> {
  // Il server incluso inserisce un contrassegno nella pagina che serve; in sviluppo si può forzare con ?relay.
  // Così, quando il server non c'è, non si generano richieste fallite nella console.
  const hinted = !!document.querySelector('meta[name="pp-relay"]') || new URLSearchParams(location.search).has('relay');
  if (!hinted) return null;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch('./api/info', { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) return null;
    const info = (await res.json()) as RelayInfo;
    return info.app === 'ministropoly-relay' ? info : null;
  } catch {
    return null;
  }
}

type ServerMsg =
  | { t: 'welcome'; hostOnline: boolean }
  | { t: 'update'; payload: PublishPayload }
  | { t: 'host_status'; online: boolean }
  | { t: 'action'; env: ActionEnvelope }
  | { t: 'presence'; clientId: string; ts: number }
  | { t: 'error'; message: string; fatal?: boolean };

/** Connessione WebSocket con riconnessione automatica */
class WsLink {
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private url: string,
    private handlers: { onOpen: () => void; onMessage: (m: ServerMsg) => void; onState: (open: boolean) => void },
  ) {}

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      let first = true;
      const connect = () => {
        if (this.closed) return;
        let ws: WebSocket;
        try {
          ws = new WebSocket(this.url);
        } catch (e) {
          if (first) reject(e);
          return;
        }
        this.ws = ws;
        ws.onopen = () => {
          this.retry = 0;
          this.handlers.onState(true);
          this.handlers.onOpen();
          if (first) {
            first = false;
            resolve();
          }
        };
        ws.onmessage = (ev) => {
          try {
            this.handlers.onMessage(JSON.parse(String(ev.data)) as ServerMsg);
          } catch {
            /* messaggio non valido */
          }
        };
        ws.onclose = () => {
          this.handlers.onState(false);
          if (first) {
            first = false;
            reject(new Error('Impossibile collegarsi al server di rete locale'));
          }
          if (this.closed) return;
          const delay = Math.min(5000, 400 * 2 ** Math.min(this.retry++, 4));
          this.timer = setTimeout(connect, delay);
        };
        ws.onerror = () => {
          /* gestito da onclose */
        };
      };
      connect();
    });
  }

  send(obj: unknown): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
      return true;
    }
    return false;
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
  }
}

export function hostKeyFor(room: string): string {
  const k = `pp:hostkey:${room}`;
  try {
    let v = localStorage.getItem(k);
    if (!v) {
      v = uid() + uid();
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return `mem-${room}`;
  }
}

export class RelayHostTransport implements HostTransport {
  readonly kind = 'relay' as const;
  private link: WsLink | null = null;
  private cache = new SnapshotCache();
  private actionCb: (e: ActionEnvelope) => void = () => {};
  private presenceCb: (id: string, ts: number) => void = () => {};
  private statusCb: (s: LinkStatus) => void = () => {};
  private stopBeat: (() => void) | null = null;
  private fatal: string | null = null;

  constructor(private room: string) {}

  async connect(): Promise<void> {
    this.link = new WsLink(relayUrl(), {
      onOpen: () => {
        this.link?.send({ t: 'hello', room: this.room, role: 'host', clientId: 'host', hostKey: hostKeyFor(this.room) });
        const snap = this.cache.snapshot();
        if (snap) this.link?.send({ t: 'publish', payload: snap });
      },
      onMessage: (m) => {
        if (m.t === 'welcome') this.statusCb('online');
        else if (m.t === 'action') this.actionCb(m.env);
        else if (m.t === 'presence') this.presenceCb(m.clientId, Date.now());
        else if (m.t === 'error' && m.fatal) {
          this.fatal = m.message;
          this.statusCb('offline');
        }
      },
      onState: (open) => this.statusCb(open ? 'connecting' : 'offline'),
    });
    await this.link.open();
    if (this.fatal) throw new Error(this.fatal);
    this.stopBeat = startTicker(HOST_BEAT_EVERY_MS, () => this.link?.send({ t: 'beat' }));
  }

  publish(p: PublishPayload): void {
    this.cache.apply(p);
    this.link?.send({ t: 'publish', payload: p });
  }
  onAction(cb: (e: ActionEnvelope) => void): void {
    this.actionCb = cb;
  }
  onPresence(cb: (id: string, ts: number) => void): void {
    this.presenceCb = cb;
  }
  onStatus(cb: (s: LinkStatus) => void): void {
    this.statusCb = cb;
  }
  close(): void {
    this.stopBeat?.();
    this.link?.close();
  }
}

export class RelayClientTransport implements ClientTransport {
  readonly kind = 'relay' as const;
  private link: WsLink | null = null;
  private updateCb: (p: ClientUpdate) => void = () => {};
  private statusCb: (s: LinkStatus, hostOnline: boolean) => void = () => {};
  private hostOnline = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private id: string;

  constructor(
    private room: string,
    forcedId?: string,
  ) {
    this.id = forcedId ?? getClientId('relay', room);
  }

  clientId(): string {
    return this.id;
  }

  async connect(): Promise<void> {
    this.link = new WsLink(relayUrl(), {
      onOpen: () => {
        this.link?.send({ t: 'hello', room: this.room, role: 'client', clientId: this.id });
      },
      onMessage: (m) => {
        if (m.t === 'welcome') {
          this.hostOnline = m.hostOnline;
          this.statusCb('online', this.hostOnline);
        } else if (m.t === 'update') this.updateCb(m.payload);
        else if (m.t === 'host_status') {
          this.hostOnline = m.online;
          this.statusCb('online', m.online);
        }
      },
      onState: (open) => {
        if (!open) {
          this.hostOnline = false;
          this.statusCb('offline', false);
        } else this.statusCb('connecting', false);
      },
    });
    await this.link.open();
    this.timer = setInterval(() => this.sendPresence(), PRESENCE_EVERY_MS);
  }

  onUpdate(cb: (p: ClientUpdate) => void): void {
    this.updateCb = cb;
  }
  onStatus(cb: (s: LinkStatus, hostOnline: boolean) => void): void {
    this.statusCb = cb;
  }
  async sendAction(env: ActionEnvelope): Promise<void> {
    if (!this.link?.send({ t: 'action', env })) throw new Error('Connessione assente: riprova tra un istante');
  }
  sendPresence(): void {
    this.link?.send({ t: 'presence', ts: Date.now() });
  }
  close(): void {
    if (this.timer) clearInterval(this.timer);
    this.link?.close();
  }
}
