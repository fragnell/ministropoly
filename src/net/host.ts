/**
 * Controller del CONDUTTORE: autorità della partita.
 * Riceve le richieste, le valida con il motore, pubblica lo stato e pianifica i tempi (dadi, movimento, asta, bot).
 */
import { TIMING } from '../config/game.config';
import type { Action } from '../engine/actions';
import { nextMove } from '../engine/bot';
import { applyAction, needsTick } from '../engine/engine';
import { publicView, withNotice } from '../engine/state';
import type { ApplyResult, GameState, LedgerEntry, LogEntry } from '../engine/types';
import { saveHostGame } from './persist';
import type { ActionEnvelope, HostTransport, LinkStatus, PublishPayload } from './protocol';
import { startTicker } from './ticker';

const TICK_MS = 150;
const PRESENCE_TIMEOUT_MS = 20000;
const PRESENCE_GRACE_MS = 15000;
const SEEN_IDS_MAX = 600;

export interface HostSnapshot {
  state: GameState;
  link: LinkStatus;
  /** dispositivi dei giocatori attualmente collegati */
  connectedClients: number;
  lastError: string | null;
  saved: number | null;
}

export class HostController {
  private state: GameState;
  private listeners = new Set<() => void>();
  private snap: HostSnapshot;
  private link: LinkStatus = 'connecting';
  private lastLogSeq: number;
  private lastLedgerSeq: number;
  private seen = new Map<string, number>();
  private seenIds: string[] = [];
  private seenSet = new Set<string>();
  private stopTicker: (() => void) | null = null;
  private startedAt = Date.now();
  private lastPresenceEval = 0;
  private nextBotAt = 0;
  private lastError: string | null = null;
  private lastSaved: number | null = null;
  private stopped = false;

  constructor(
    private transport: HostTransport,
    initial: GameState,
  ) {
    this.state = initial;
    this.lastLogSeq = 0;
    this.lastLedgerSeq = 0;
    this.snap = this.makeSnapshot();
  }

  get roomCode(): string {
    return this.state.roomCode;
  }
  get kind() {
    return this.transport.kind;
  }

  // ---------------------------------------------------------------- store (useSyncExternalStore)

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  getSnapshot = (): HostSnapshot => this.snap;

  private makeSnapshot(): HostSnapshot {
    const now = Date.now();
    const connectedClients = this.state.players.filter((p) => !p.isBot && p.clientId && p.connected).length;
    void now;
    return { state: this.state, link: this.link, connectedClients, lastError: this.lastError, saved: this.lastSaved };
  }

  private emit(): void {
    this.snap = this.makeSnapshot();
    for (const l of this.listeners) l();
  }

  // ---------------------------------------------------------------- ciclo di vita

  async start(): Promise<void> {
    this.transport.onStatus((s) => {
      this.link = s;
      this.emit();
    });
    this.transport.onAction((env) => this.handleEnvelope(env));
    this.transport.onPresence((id, ts) => {
      if (ts === 0) this.seen.set(id, 0);
      else this.seen.set(id, Math.max(this.seen.get(id) ?? 0, Math.min(ts, Date.now())));
    });
    await this.transport.connect();
    if (this.stopped) {
      // la pagina è stata chiusa mentre ci si collegava: non avviare nulla
      this.transport.close();
      return;
    }
    this.startedAt = Date.now();
    this.exposeDevHook();
    if (typeof window !== 'undefined') window.addEventListener('pagehide', this.flush);
    this.publish(true);
    // metronomo su Web Worker: non rallenta se la scheda del conduttore finisce in secondo piano
    this.stopTicker = startTicker(TICK_MS, () => this.tick());
    this.emit();
  }

  /**
   * Solo nelle build di SVILUPPO (npm run dev): espone window.__pp per provare scenari difficili da ottenere a mano.
   * Nelle build di produzione questo codice viene eliminato da Vite.
   */
  private exposeDevHook(): void {
    if (!import.meta.env?.DEV || typeof window === 'undefined') return;
    (window as unknown as { __pp?: unknown }).__pp = {
      host: this,
      /** modifica lo stato con una funzione e lo ripubblica (solo per prove visive) */
      patch: (fn: (s: GameState) => void) => {
        const s = structuredClone(this.state);
        fn(s);
        s.version++;
        this.state = s;
        this.publish();
      },
    };
  }

  stop(): void {
    this.stopped = true;
    this.stopTicker?.();
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.flush);
    this.persistNow();
    this.transport.close();
  }

  /** Salva quando la pagina sta per chiudersi o essere aggiornata */
  private flush = (): void => this.persistNow();

  async destroyRoom(): Promise<void> {
    await this.transport.destroy?.();
  }

  // ---------------------------------------------------------------- azioni

  /** Azione richiesta dal conduttore (pannello di controllo) */
  dispatch(action: Action): ApplyResult {
    return this.applyLocal(action, { kind: 'host' }, undefined);
  }

  private applyLocal(action: Action, actor: { kind: 'host' } | { kind: 'client'; clientId: string }, actionId?: string): ApplyResult {
    const now = Date.now();
    const res = applyAction(this.state, action, { now, actor, actionId });
    if (res.ok) {
      if (res.state !== this.state) {
        this.state = res.state;
        this.lastError = null;
        this.publish();
      }
    } else if (actor.kind === 'host') {
      this.lastError = res.error;
      this.emit();
    }
    return res;
  }

  private handleEnvelope(env: ActionEnvelope): void {
    if (this.stopped || !env || typeof env.id !== 'string' || typeof env.clientId !== 'string' || !env.action || typeof env.action.type !== 'string') return;
    this.seen.set(env.clientId, Date.now());
    if (this.seenSet.has(env.id)) return; // già elaborata (doppia consegna)
    this.seenSet.add(env.id);
    this.seenIds.push(env.id);
    if (this.seenIds.length > SEEN_IDS_MAX) this.seenSet.delete(this.seenIds.shift() as string);

    const res = this.applyLocal(env.action, { kind: 'client', clientId: env.clientId }, env.id);
    if (!res.ok) {
      this.state = withNotice({ ...this.state, hostTime: Date.now() }, env.clientId, res.error, 'error');
      this.publish();
    }
  }

  // ---------------------------------------------------------------- tick: tempi, presenza, bot

  private tick(): void {
    if (this.stopped) return;
    const now = Date.now();

    if (now - this.lastPresenceEval > 1000) {
      this.lastPresenceEval = now;
      const map: Record<string, boolean> = {};
      let changed = false;
      for (const p of this.state.players) {
        if (p.isBot || !p.clientId) continue;
        const last = this.seen.get(p.clientId);
        let connected: boolean;
        if (last === undefined) connected = now - this.startedAt < PRESENCE_GRACE_MS ? p.connected : false;
        else connected = last > 0 && now - last < PRESENCE_TIMEOUT_MS;
        map[p.clientId] = connected;
        if (connected !== p.connected) changed = true;
      }
      if (changed) this.applyLocal({ type: 'PRESENCE', connected: map }, { kind: 'host' });
    }

    if (needsTick(this.state, now)) this.applyLocal({ type: 'TICK' }, { kind: 'host' });

    if (now >= this.nextBotAt && !this.state.paused) {
      const move = nextMove(this.state, Math.random, true);
      if (move && move.player.clientId) {
        const res = this.applyLocal(move.action, { kind: 'client', clientId: move.player.clientId });
        this.nextBotAt = now + TIMING.botDelayMs * (0.7 + Math.random() * 0.7);
        if (!res.ok) this.nextBotAt = now + 2000; // il bot ha provato un'azione non valida: evita il ciclo
      }
    }
  }

  // ---------------------------------------------------------------- pubblicazione e salvataggio

  private publish(force = false): void {
    const now = Date.now();
    const log = collectNew<LogEntry>(this.state.log, force ? Math.max(0, (this.state.log.at(-1)?.seq ?? 0) - 199) - 1 : this.lastLogSeq);
    const ledger = collectNew<LedgerEntry>(this.state.ledger, force ? Math.max(0, (this.state.ledger.at(-1)?.seq ?? 0) - 199) - 1 : this.lastLedgerSeq);
    this.lastLogSeq = this.state.log.at(-1)?.seq ?? this.lastLogSeq;
    this.lastLedgerSeq = this.state.ledger.at(-1)?.seq ?? this.lastLedgerSeq;
    const payload: PublishPayload = { state: publicView(this.state, now), log, ledger, hostTime: now };
    // scrittura anticipata: ciò che i giocatori vedono è già salvato, quindi un aggiornamento improvviso
    // della pagina del conduttore non può far "dimenticare" una mossa già mostrata agli altri
    this.persistNow();
    this.transport.publish(payload);
    this.emit();
  }

  private persistNow(): void {
    const ok = saveHostGame(this.state.roomCode, this.transport.kind, this.state);
    if (ok) this.lastSaved = Date.now();
  }

  /** Salvataggio manuale richiesto dal conduttore */
  saveNow(): boolean {
    const ok = saveHostGame(this.state.roomCode, this.transport.kind, this.state);
    if (ok) {
      this.lastSaved = Date.now();
      this.emit();
    }
    return ok;
  }

  /** Stato completo (con tutti i registri) per l'esportazione */
  fullState(): GameState {
    return this.state;
  }
}

/** Voci con seq > `afterSeq` (l'elenco è ordinato per seq) */
function collectNew<T extends { seq: number }>(list: T[], afterSeq: number): T[] {
  let i = list.length;
  while (i > 0 && list[i - 1].seq > afterSeq) i--;
  return list.slice(i);
}
