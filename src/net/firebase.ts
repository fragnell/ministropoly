/**
 * Trasporto ONLINE: Firebase Realtime Database + autenticazione anonima.
 *
 * Struttura dei dati (vedi anche database.rules.json):
 *   rooms/{CODICE}/meta        {hostUid, createdAt}        creato dal conduttore
 *   rooms/{CODICE}/state       stringa JSON (stato pubblico) scritto SOLO dal conduttore
 *   rooms/{CODICE}/log/{key}   stringa JSON (voce del registro eventi)
 *   rooms/{CODICE}/ledger/{key}stringa JSON (voce del registro economico)
 *   rooms/{CODICE}/beat        orario del server (battito del conduttore)
 *   rooms/{CODICE}/actions/{id}  richieste dei giocatori (solo creazione, uid = utente autenticato)
 *   rooms/{CODICE}/presence/{uid} orario del server (presenza dei dispositivi)
 *
 * Stato e registri sono salvati come STRINGHE JSON: così Realtime Database non trasforma array e
 * oggetti vuoti o con chiavi numeriche e il formato resta identico a quello degli altri trasporti.
 *
 * Nessuna credenziale segreta è nel codice: la configurazione Web di Firebase è pubblica per sua natura;
 * la sicurezza è garantita dalle regole del database.
 */
import {
  HOST_BEAT_EVERY_MS,
  HOST_OFFLINE_AFTER_MS,
  PRESENCE_EVERY_MS,
  TAIL,
  type ActionEnvelope,
  type ClientTransport,
  type ClientUpdate,
  type HostTransport,
  type LinkStatus,
  type PublishPayload,
} from './protocol';
import { startTicker } from './ticker';
import type { LedgerEntry, LogEntry } from '../engine/types';

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain?: string;
  databaseURL: string;
  projectId: string;
  appId?: string;
}

/**
 * La configurazione può arrivare da due fonti (la seconda ha la precedenza):
 *  1. variabili d'ambiente di compilazione `VITE_FIREBASE_*` (file .env);
 *  2. un oggetto globale `window.PP_FIREBASE_CONFIG`, definito per esempio in un file `config.js`
 *     caricato prima dell'app: permette di cambiare progetto senza ricompilare.
 */
type RuntimeFirebaseConfig = Partial<FirebaseWebConfig> & { useEmulator?: boolean };

function runtimeConfig(): RuntimeFirebaseConfig | undefined {
  return (globalThis as { PP_FIREBASE_CONFIG?: RuntimeFirebaseConfig }).PP_FIREBASE_CONFIG;
}

export function firebaseConfig(): FirebaseWebConfig | null {
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  const rt = runtimeConfig();
  const cfg = {
    apiKey: rt?.apiKey ?? env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: rt?.authDomain ?? env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: rt?.databaseURL ?? env.VITE_FIREBASE_DATABASE_URL ?? '',
    projectId: rt?.projectId ?? env.VITE_FIREBASE_PROJECT_ID ?? '',
    appId: rt?.appId ?? env.VITE_FIREBASE_APP_ID,
  };
  if (!cfg.apiKey || !cfg.databaseURL || !cfg.projectId) return null;
  return cfg;
}

export function isFirebaseConfigured(): boolean {
  return firebaseConfig() !== null;
}

type DbApi = typeof import('firebase/database');

interface Boot {
  db: import('firebase/database').Database;
  api: DbApi;
  uid: string;
}

const bootPromises = new Map<string, Promise<Boot>>();

function useEmulator(): boolean {
  const rt = runtimeConfig();
  if (rt?.useEmulator !== undefined) return rt.useEmulator;
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  return env.VITE_FIREBASE_USE_EMULATOR === '1' || env.VITE_FIREBASE_USE_EMULATOR === 'true';
}

/**
 * Inizializza Firebase (caricamento dinamico: chi non lo usa non scarica la libreria).
 * `appName` permette a più "dispositivi" nello stesso processo di avere identità distinte (usato dai test).
 */
function boot(appName = '[DEFAULT]'): Promise<Boot> {
  const cached = bootPromises.get(appName);
  if (cached) return cached;
  const p = (async () => {
    const cfg = firebaseConfig();
    if (!cfg) throw new Error('Firebase non è configurato: compila il file .env (vedi README)');
    const [{ initializeApp, getApps }, { getAuth, signInAnonymously, connectAuthEmulator }, api] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth'),
      import('firebase/database'),
    ]);
    const existing = getApps().find((a) => a.name === appName);
    const app = existing ?? initializeApp(cfg, appName);
    const auth = getAuth(app);
    const db = api.getDatabase(app);
    if (!existing && useEmulator()) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      api.connectDatabaseEmulator(db, '127.0.0.1', 9000);
    }
    await auth.authStateReady();
    if (!auth.currentUser) await signInAnonymously(auth);
    const user = auth.currentUser;
    if (!user) throw new Error('Accesso anonimo a Firebase non riuscito (è attivo nella console?)');
    return { db, api, uid: user.uid };
  })();
  bootPromises.set(appName, p);
  p.catch(() => bootPromises.delete(appName));
  return p;
}

/** UID anonimo dell'utente Firebase (identificativo stabile del dispositivo) */
export async function firebaseUid(): Promise<string> {
  return (await boot()).uid;
}

const key = (seq: number) => `e${String(seq).padStart(9, '0')}`;

async function serverOffset(b: Boot): Promise<number> {
  return new Promise((resolve) => {
    const r = b.api.ref(b.db, '.info/serverTimeOffset');
    b.api.onValue(
      r,
      (snap) => resolve(Number(snap.val()) || 0),
      () => resolve(0),
      { onlyOnce: true },
    );
  });
}

export class FirebaseHostTransport implements HostTransport {
  readonly kind = 'firebase' as const;
  private b!: Boot;
  private actionCb: (e: ActionEnvelope) => void = () => {};
  private presenceCb: (id: string, ts: number) => void = () => {};
  private statusCb: (s: LinkStatus) => void = () => {};
  private stopBeat: (() => void) | null = null;
  private unsubs: (() => void)[] = [];
  private offset = 0;
  private startedAt = Date.now();
  private closed = false;

  constructor(
    private room: string,
    private appName?: string,
  ) {}

  private path(sub = ''): string {
    return `rooms/${this.room}${sub ? '/' + sub : ''}`;
  }

  async connect(): Promise<void> {
    this.statusCb('connecting');
    this.b = await boot(this.appName);
    if (this.closed) return;
    const { db, api, uid } = this.b;
    // crea la stanza oppure riprende una propria stanza esistente
    const metaRef = api.ref(db, this.path('meta'));
    const res = await api.runTransaction(metaRef, (cur) => {
      if (cur === null) return { hostUid: uid, createdAt: Date.now() };
      if (cur.hostUid === uid) return cur;
      return undefined; // codice già usato da un altro conduttore
    });
    if (!res.committed) throw new Error('Codice stanza già in uso: riprova');
    this.offset = await serverOffset(this.b);
    if (this.closed) return;

    // richieste dei giocatori
    const actionsRef = api.ref(db, this.path('actions'));
    const offAct = api.onChildAdded(actionsRef, (snap) => {
      const v = snap.val() as { id?: string; uid?: string; ts?: number; action?: string } | null;
      void api.remove(snap.ref).catch(() => {});
      if (!v || typeof v.action !== 'string' || typeof v.uid !== 'string' || typeof v.id !== 'string') return;
      // richieste rimaste in coda da prima dell'avvio: ignorate se troppo vecchie
      if (typeof v.ts === 'number' && Date.now() - v.ts > 120000 && v.ts < this.startedAt) return;
      try {
        this.actionCb({ id: v.id, clientId: v.uid, action: JSON.parse(v.action), ts: v.ts ?? Date.now() });
      } catch {
        /* richiesta non valida */
      }
    });
    this.unsubs.push(offAct);

    // presenza dei dispositivi
    let known = new Set<string>();
    const offPres = api.onValue(api.ref(db, this.path('presence')), (snap) => {
      const now = new Set<string>();
      snap.forEach((child) => {
        now.add(child.key as string);
        const ts = Number(child.val());
        this.presenceCb(child.key as string, ts - this.offset);
      });
      for (const id of known) if (!now.has(id)) this.presenceCb(id, 0);
      known = now;
    });
    this.unsubs.push(offPres);

    const writeBeat = () => void api.set(api.ref(db, this.path('beat')), api.serverTimestamp()).catch(() => {});
    writeBeat();
    this.stopBeat = startTicker(HOST_BEAT_EVERY_MS * 2, writeBeat);

    // stato della connessione
    const offConn = api.onValue(api.ref(db, '.info/connected'), (snap) => this.statusCb(snap.val() === true ? 'online' : 'offline'));
    this.unsubs.push(offConn);
  }

  publish(p: PublishPayload): void {
    const { db, api } = this.b;
    const updates: Record<string, string> = { [this.path('state')]: JSON.stringify(p.state) };
    for (const e of p.log) updates[this.path(`log/${key(e.seq)}`)] = JSON.stringify(e);
    for (const e of p.ledger) updates[this.path(`ledger/${key(e.seq)}`)] = JSON.stringify(e);
    void api.update(api.ref(db), updates).catch((err) => {
      console.error('Pubblicazione su Firebase non riuscita', err);
      this.statusCb('offline');
    });
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

  async destroy(): Promise<void> {
    await this.b.api.remove(this.b.api.ref(this.b.db, this.path()));
  }

  close(): void {
    this.closed = true;
    this.stopBeat?.();
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}

export class FirebaseClientTransport implements ClientTransport {
  readonly kind = 'firebase' as const;
  private b!: Boot;
  private updateCb: (p: ClientUpdate) => void = () => {};
  private statusCb: (s: LinkStatus, hostOnline: boolean) => void = () => {};
  private unsubs: (() => void)[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private offset = 0;
  private lastBeat = 0;
  private hostOnline = false;
  private link: LinkStatus = 'connecting';
  private uid = '';
  private logBuf: LogEntry[] = [];
  private ledBuf: LedgerEntry[] = [];
  private flushScheduled = false;
  private closed = false;

  constructor(
    private room: string,
    private appName?: string,
  ) {}

  clientId(): string {
    return this.uid;
  }

  private path(sub = ''): string {
    return `rooms/${this.room}${sub ? '/' + sub : ''}`;
  }

  async connect(): Promise<void> {
    this.statusCb('connecting', false);
    this.b = await boot(this.appName);
    this.uid = this.b.uid;
    const { db, api } = this.b;
    this.offset = await serverOffset(this.b);
    if (this.closed) return;

    this.unsubs.push(
      api.onValue(api.ref(db, this.path('state')), (snap) => {
        const v = snap.val();
        if (typeof v !== 'string') return;
        try {
          const state = JSON.parse(v);
          this.updateCb({ state, hostTime: state.hostTime });
        } catch {
          /* stato non valido */
        }
      }),
    );
    this.unsubs.push(
      api.onChildAdded(api.query(api.ref(db, this.path('log')), api.limitToLast(TAIL)), (snap) => {
        try {
          this.logBuf.push(JSON.parse(snap.val()));
          this.scheduleFlush();
        } catch {
          /* ignora */
        }
      }),
    );
    this.unsubs.push(
      api.onChildAdded(api.query(api.ref(db, this.path('ledger')), api.limitToLast(TAIL)), (snap) => {
        try {
          this.ledBuf.push(JSON.parse(snap.val()));
          this.scheduleFlush();
        } catch {
          /* ignora */
        }
      }),
    );
    this.unsubs.push(
      api.onValue(api.ref(db, this.path('beat')), (snap) => {
        this.lastBeat = Number(snap.val()) || 0;
        this.evalHost();
      }),
    );
    this.unsubs.push(
      api.onValue(api.ref(db, '.info/connected'), (snap) => {
        this.link = snap.val() === true ? 'online' : 'offline';
        this.statusCb(this.link, this.hostOnline);
      }),
    );
    // presenza (con rimozione automatica alla disconnessione)
    const presRef = api.ref(db, this.path(`presence/${this.uid}`));
    void api.onDisconnect(presRef).remove().catch(() => {});
    this.sendPresence();
    this.timer = setInterval(() => {
      this.sendPresence();
      this.evalHost();
    }, PRESENCE_EVERY_MS);
  }

  private scheduleFlush(): void {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    queueMicrotask(() => {
      this.flushScheduled = false;
      const log = this.logBuf;
      const ledger = this.ledBuf;
      this.logBuf = [];
      this.ledBuf = [];
      this.updateCb({ log, ledger });
    });
  }

  private evalHost(): void {
    const serverNow = Date.now() + this.offset;
    const online = this.lastBeat > 0 && serverNow - this.lastBeat < HOST_OFFLINE_AFTER_MS * 2;
    if (online !== this.hostOnline) {
      this.hostOnline = online;
      this.statusCb(this.link, online);
    }
  }

  onUpdate(cb: (p: ClientUpdate) => void): void {
    this.updateCb = cb;
  }
  onStatus(cb: (s: LinkStatus, hostOnline: boolean) => void): void {
    this.statusCb = cb;
  }

  async sendAction(env: ActionEnvelope): Promise<void> {
    const { db, api } = this.b;
    await api.set(api.ref(db, this.path(`actions/${env.id}`)), {
      id: env.id,
      uid: this.uid,
      ts: env.ts,
      action: JSON.stringify(env.action),
    });
  }

  sendPresence(): void {
    const { db, api } = this.b;
    void api.set(api.ref(db, this.path(`presence/${this.uid}`)), api.serverTimestamp()).catch(() => {});
  }

  close(): void {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
  }
}

/** Accesso diretto al database (usato solo dai test contro gli emulatori Firebase) */
export const firebaseBoot = boot;
