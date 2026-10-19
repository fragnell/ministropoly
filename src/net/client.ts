/**
 * Store dei CLIENT (smartphone e schermo TV): riceve lo stato pubblicato dal conduttore
 * e invia richieste di azione. Non scrive mai saldi o proprietà.
 */
import type { Action } from '../engine/actions';
import { fingerprint } from '../engine/util';
import type { GameState, LedgerEntry, LogEntry, Notice, Player } from '../engine/types';
import { TAIL, mergeBySeq, uid, type ClientTransport, type ClientUpdate, type LinkStatus } from './protocol';

/** Ordina gli stati pubblicati: prima l'epoca (ripristini del conduttore), poi la versione */
export function isNewerOrSame(a: GameState, b: GameState): boolean {
  const ea = a.epoch ?? 0;
  const eb = b.epoch ?? 0;
  return ea !== eb ? ea > eb : a.version >= b.version;
}

export interface ClientSnapshot {
  state: GameState | null;
  log: LogEntry[];
  ledger: LedgerEntry[];
  link: LinkStatus;
  hostOnline: boolean;
  /** il giocatore di questo dispositivo (se seduto) */
  me: Player | null;
  /** richieste inviate e non ancora riflesse nello stato */
  busy: boolean;
  /** ultima notifica indirizzata a questo dispositivo */
  notice: Notice | null;
  /** messaggio di errore di connessione */
  error: string | null;
}

export class ClientStore {
  private snap: ClientSnapshot;
  private listeners = new Set<() => void>();
  private offsets: number[] = [];
  private offset = 0;
  private lastNoticeId = 0;
  private pendingSince = 0;
  private busyTimer: ReturnType<typeof setTimeout> | null = null;
  private myFp = '';
  private started = false;
  private stopped = false;

  constructor(private transport: ClientTransport) {
    this.snap = { state: null, log: [], ledger: [], link: 'connecting', hostOnline: false, me: null, busy: false, notice: null, error: null };
  }

  get clientId(): string {
    return this.transport.clientId();
  }

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): ClientSnapshot => this.snap;

  /** Orario stimato del conduttore (per i conti alla rovescia e le animazioni) */
  hostNow = (): number => Date.now() + this.offset;

  private set(patch: Partial<ClientSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l();
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.transport.onUpdate((u) => this.onUpdate(u));
    this.transport.onStatus((link, hostOnline) => this.set({ link, hostOnline }));
    try {
      await this.transport.connect();
      if (this.stopped) {
        this.transport.close();
        return;
      }
      this.myFp = fingerprint(this.transport.clientId());
      this.recomputeMe();
    } catch (e) {
      this.set({ link: 'offline', error: e instanceof Error ? e.message : String(e) });
      throw e;
    }
  }

  stop(): void {
    this.stopped = true;
    this.transport.close();
  }

  private recomputeMe(state: GameState | null = this.snap.state): Player | null {
    if (!state || !this.myFp) return null;
    return state.players.find((p) => p.clientId === this.myFp) ?? null;
  }

  private onUpdate(u: ClientUpdate): void {
    const patch: Partial<ClientSnapshot> = {};
    if (u.state && (!this.snap.state || isNewerOrSame(u.state, this.snap.state))) {
      // sincronizzazione dell'orologio: il campione con scarto maggiore è quello con latenza minore
      if (typeof u.state.hostTime === 'number' && u.state.hostTime > 0) {
        this.offsets.push(u.state.hostTime - Date.now());
        if (this.offsets.length > 8) this.offsets.shift();
        this.offset = Math.max(...this.offsets);
      }
      patch.state = u.state;
      patch.me = this.recomputeMe(u.state);
      patch.error = null;
      const notice = u.state.notices.filter((n) => n.id > this.lastNoticeId && (n.to === 'all' || n.to === this.myFp)).at(-1);
      if (u.state.notices.length) this.lastNoticeId = Math.max(this.lastNoticeId, ...u.state.notices.map((n) => n.id));
      if (notice) patch.notice = notice;
      // la richiesta in corso è stata elaborata
      if (this.snap.busy) {
        patch.busy = false;
        if (this.busyTimer) clearTimeout(this.busyTimer);
      }
    }
    if (u.log && u.log.length) patch.log = mergeBySeq(this.snap.log, u.log, TAIL);
    if (u.ledger && u.ledger.length) patch.ledger = mergeBySeq(this.snap.ledger, u.ledger, TAIL);
    if (Object.keys(patch).length) this.set(patch);
  }

  /** Invia una richiesta di azione al conduttore. Il motore la valida: qui non si modifica nulla. */
  async send(action: Action): Promise<void> {
    const env = { id: uid(), clientId: this.transport.clientId(), action, ts: Date.now() };
    this.pendingSince = Date.now();
    this.set({ busy: true });
    if (this.busyTimer) clearTimeout(this.busyTimer);
    // sblocca comunque l'interfaccia dopo qualche secondo (es. richiesta persa)
    this.busyTimer = setTimeout(() => {
      if (this.snap.busy && Date.now() - this.pendingSince >= 3500) this.set({ busy: false });
    }, 3600);
    try {
      await this.transport.sendAction(env);
    } catch (e) {
      this.set({ busy: false, notice: { id: ++this.lastNoticeId, to: this.myFp, text: e instanceof Error ? e.message : 'Invio non riuscito', level: 'error', ts: Date.now() } });
    }
  }

  clearNotice(): void {
    if (this.snap.notice) this.set({ notice: null });
  }
}
