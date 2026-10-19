/**
 * Trasporto LOCALE (demo): BroadcastChannel tra schede dello stesso browser.
 * Sincronizzazione reale tra più schede/finestre, ma non tra dispositivi diversi.
 */
import {
  HOST_BEAT_EVERY_MS,
  HOST_OFFLINE_AFTER_MS,
  PRESENCE_EVERY_MS,
  SnapshotCache,
  type ActionEnvelope,
  type ClientTransport,
  type ClientUpdate,
  type HostTransport,
  type LinkStatus,
  type PublishPayload,
} from './protocol';
import { getClientId } from './identity';
import { startTicker } from './ticker';

type Msg =
  | { t: 'update'; payload: PublishPayload }
  | { t: 'beat' }
  | { t: 'hello' }
  | { t: 'action'; env: ActionEnvelope }
  | { t: 'presence'; clientId: string; ts: number };

const chName = (room: string) => `pp:room:${room}`;
const snapKey = (room: string) => `pp:snap:${room}`;

export class LocalHostTransport implements HostTransport {
  readonly kind = 'local' as const;
  private ch: BroadcastChannel | null = null;
  private cache = new SnapshotCache();
  private actionCb: (e: ActionEnvelope) => void = () => {};
  private presenceCb: (id: string, ts: number) => void = () => {};
  private statusCb: (s: LinkStatus) => void = () => {};
  private stopBeat: (() => void) | null = null;

  constructor(private room: string) {}

  async connect(): Promise<void> {
    if (typeof BroadcastChannel === 'undefined') throw new Error('Questo browser non supporta BroadcastChannel');
    this.ch = new BroadcastChannel(chName(this.room));
    this.ch.onmessage = (ev: MessageEvent<Msg>) => {
      const m = ev.data;
      if (m.t === 'action') this.actionCb(m.env);
      else if (m.t === 'presence') this.presenceCb(m.clientId, m.ts);
      else if (m.t === 'hello') {
        const snap = this.cache.snapshot();
        if (snap) this.ch?.postMessage({ t: 'update', payload: snap } satisfies Msg);
      }
    };
    this.stopBeat = startTicker(HOST_BEAT_EVERY_MS, () => this.ch?.postMessage({ t: 'beat' } satisfies Msg));
    this.statusCb('online');
  }

  publish(p: PublishPayload): void {
    this.cache.apply(p);
    this.ch?.postMessage({ t: 'update', payload: p } satisfies Msg);
    try {
      localStorage.setItem(snapKey(this.room), JSON.stringify(this.cache.snapshot()));
    } catch {
      /* memoria piena o non disponibile: la demo funziona comunque */
    }
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
    this.ch?.close();
    this.ch = null;
  }
}

export class LocalClientTransport implements ClientTransport {
  readonly kind = 'local' as const;
  private ch: BroadcastChannel | null = null;
  private updateCb: (p: ClientUpdate) => void = () => {};
  private statusCb: (s: LinkStatus, hostOnline: boolean) => void = () => {};
  private lastHostSeen = 0;
  private timers: ReturnType<typeof setInterval>[] = [];
  private id: string;
  private hostOnline = false;

  constructor(
    private room: string,
    forcedId?: string,
  ) {
    this.id = forcedId ?? getClientId('local', room);
  }

  clientId(): string {
    return this.id;
  }

  async connect(): Promise<void> {
    if (typeof BroadcastChannel === 'undefined') throw new Error('Questo browser non supporta BroadcastChannel');
    this.ch = new BroadcastChannel(chName(this.room));
    this.ch.onmessage = (ev: MessageEvent<Msg>) => {
      const m = ev.data;
      if (m.t === 'update') {
        this.lastHostSeen = Date.now();
        this.updateCb(m.payload);
        this.setHost(true);
      } else if (m.t === 'beat') {
        this.lastHostSeen = Date.now();
        this.setHost(true);
      }
    };
    // ultimo stato conosciuto (utile se la scheda viene aperta dopo l'avvio)
    try {
      const raw = localStorage.getItem(snapKey(this.room));
      if (raw) this.updateCb(JSON.parse(raw) as PublishPayload);
    } catch {
      /* ignora */
    }
    this.statusCb('online', false);
    this.ch.postMessage({ t: 'hello' } satisfies Msg);
    this.timers.push(
      setInterval(() => {
        this.sendPresence();
        if (!this.hostOnline) this.ch?.postMessage({ t: 'hello' } satisfies Msg);
      }, PRESENCE_EVERY_MS),
      setInterval(() => {
        if (this.hostOnline && Date.now() - this.lastHostSeen > HOST_OFFLINE_AFTER_MS) this.setHost(false);
      }, 1000),
    );
  }

  private setHost(v: boolean): void {
    if (this.hostOnline === v) return;
    this.hostOnline = v;
    this.statusCb('online', v);
  }

  onUpdate(cb: (p: ClientUpdate) => void): void {
    this.updateCb = cb;
  }
  onStatus(cb: (s: LinkStatus, hostOnline: boolean) => void): void {
    this.statusCb = cb;
  }
  async sendAction(env: ActionEnvelope): Promise<void> {
    this.ch?.postMessage({ t: 'action', env } satisfies Msg);
  }
  sendPresence(): void {
    this.ch?.postMessage({ t: 'presence', clientId: this.id, ts: Date.now() } satisfies Msg);
  }
  close(): void {
    this.timers.forEach(clearInterval);
    this.ch?.close();
    this.ch = null;
  }
}
