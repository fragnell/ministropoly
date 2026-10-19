/**
 * Test di integrazione della sincronizzazione tra dispositivi.
 * Usano i trasporti REALI: BroadcastChannel (demo locale) e il server WebSocket incluso (rete locale).
 * Il trasporto Firebase richiede un progetto Firebase e non può essere provato qui (vedi README).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOKENS } from '../src/config/game.config';
import { createGame } from '../src/engine/state';
import { fingerprint } from '../src/engine/util';
import { ClientStore } from '../src/net/client';
import { createClientTransport, createHostTransport } from '../src/net/factory';
import { HostController } from '../src/net/host';
import { prepareRestoredState } from '../src/net/persist';
import type { TransportKind } from '../src/net/protocol';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | undefined | false | null, label: string, timeout = 4000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`Timeout in attesa di: ${label}`);
    await wait(20);
  }
}

let relayProc: ChildProcess | null = null;
const RELAY_PORT = 18787 + Math.floor(Math.random() * 500);

beforeAll(async () => {
  relayProc = spawn(process.execPath, [path.resolve('server/relay.mjs')], { env: { ...process.env, PORT: String(RELAY_PORT) }, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Il server relay non si è avviato')), 8000);
    relayProc?.stdout?.on('data', (d: Buffer) => {
      if (String(d).includes('server di rete locale attivo')) {
        clearTimeout(timer);
        resolve();
      }
    });
    relayProc?.on('error', reject);
  });
  (globalThis as unknown as { location: unknown }).location = { protocol: 'http:', host: `127.0.0.1:${RELAY_PORT}`, hash: '', href: `http://127.0.0.1:${RELAY_PORT}/` };
});

afterAll(() => {
  relayProc?.kill();
});

async function scenario(kind: TransportKind, room: string): Promise<void> {
  // --- conduttore
  const host = new HostController(createHostTransport(kind, room), createGame(room, 99, Date.now()));
  await host.start();

  // --- due smartphone e uno schermo TV (client di sola lettura)
  const a = new ClientStore(createClientTransport(kind, room, 'device-A'));
  const b = new ClientStore(createClientTransport(kind, room, 'device-B'));
  const tv = new ClientStore(createClientTransport(kind, room, 'device-TV'));
  await Promise.all([a.start(), b.start(), tv.start()]);

  // tutti ricevono lo stato iniziale e vedono il conduttore collegato
  await waitFor(() => a.getSnapshot().state && b.getSnapshot().state && tv.getSnapshot().state, 'stato iniziale');
  await waitFor(() => a.getSnapshot().hostOnline, 'conduttore online');
  expect(a.getSnapshot().state?.roomCode).toBe(room);

  // --- ingresso dei giocatori dagli smartphone
  await a.send({ type: 'JOIN', name: 'Anna', token: TOKENS[0].id });
  await b.send({ type: 'JOIN', name: 'Beppe', token: TOKENS[1].id });
  await waitFor(() => host.getSnapshot().state.players.length === 2, 'giocatori registrati dal conduttore');
  // gli altri dispositivi vedono subito i nuovi giocatori
  await waitFor(() => tv.getSnapshot().state?.players.length === 2, 'giocatori visibili sulla TV');
  await waitFor(() => a.getSnapshot().me?.name === 'Anna', 'riconoscimento del proprio giocatore');
  await waitFor(() => b.getSnapshot().me?.name === 'Beppe', 'riconoscimento del proprio giocatore (B)');
  // lo stato pubblico non rivela l'identità dei dispositivi
  expect(tv.getSnapshot().state?.players[0].clientId).toBe(fingerprint('device-A'));
  expect(JSON.stringify(tv.getSnapshot().state)).not.toContain('device-A');
  // né l'ordine dei mazzi
  expect(tv.getSnapshot().state?.decks.treasure.draw).toEqual([]);

  // --- un giocatore non può avviare la partita (azione del conduttore)
  await a.send({ type: 'START_GAME' });
  await waitFor(() => a.getSnapshot().notice, 'errore per azione non consentita');
  expect(a.getSnapshot().notice?.text).toMatch(/conduttore/);
  expect(host.getSnapshot().state.phase).toBe('lobby');

  // --- il conduttore avvia la partita
  expect(host.dispatch({ type: 'START_GAME' }).ok).toBe(true);
  await waitFor(() => a.getSnapshot().state?.phase === 'turn_start', 'partita avviata su A');
  await waitFor(() => tv.getSnapshot().state?.phase === 'turn_start', 'partita avviata sulla TV');
  const st = host.getSnapshot().state;
  const currentId = st.currentPlayerId as string;
  const current = currentId === a.getSnapshot().me?.id ? a : b;
  const other = current === a ? b : a;

  // --- chi non è di turno non può lanciare i dadi
  other.clearNotice();
  await other.send({ type: 'ROLL_DICE' });
  await waitFor(() => other.getSnapshot().notice, 'rifiuto per turno altrui');
  expect(other.getSnapshot().notice?.text).toMatch(/turno/);

  // --- il giocatore di turno lancia: tutti vedono gli stessi dadi e lo stesso movimento
  await current.send({ type: 'ROLL_DICE' });
  await waitFor(() => tv.getSnapshot().state?.roll, 'dadi visibili sulla TV');
  const roll = tv.getSnapshot().state?.roll;
  expect(roll?.dice[0]).toBeGreaterThanOrEqual(1);
  expect(a.getSnapshot().state?.roll?.dice).toEqual(b.getSnapshot().state?.roll?.dice);
  // la pedina si muove (dopo l'animazione dei dadi e del movimento)
  await waitFor(() => tv.getSnapshot().state?.phase !== 'rolling' && tv.getSnapshot().state?.phase !== 'moving', 'fine del movimento', 9000);
  const moved = host.getSnapshot().state.players.find((p) => p.id === currentId);
  expect(tv.getSnapshot().state?.players.find((p) => p.id === currentId)?.position).toBe(moved?.position);
  expect(moved?.position).toBeGreaterThan(0);

  // --- il registro eventi arriva a tutti
  await waitFor(() => tv.getSnapshot().log.some((e) => e.text.includes('ha lanciato i dadi')), 'registro sulla TV');

  // --- idempotenza: la stessa richiesta consegnata due volte viene eseguita una sola volta
  const phaseNow = host.getSnapshot().state.phase;
  expect(['buy_decision', 'card_draw', 'resolving', 'turn_end']).toContain(phaseNow);

  // --- riconnessione: un nuovo store con lo stesso dispositivo ritrova il proprio posto
  a.stop();
  const a2 = new ClientStore(createClientTransport(kind, room, 'device-A'));
  await a2.start();
  await waitFor(() => a2.getSnapshot().me?.name === 'Anna', 'riconnessione dopo ricaricamento');
  await a2.send({ type: 'JOIN', name: 'Anna', token: TOKENS[0].id });
  await wait(150);
  expect(host.getSnapshot().state.players).toHaveLength(2); // nessun doppione

  // --- un dispositivo sconosciuto non può agire né entrare a partita avviata senza riprendere un posto
  const stranger = new ClientStore(createClientTransport(kind, room, 'device-X'));
  await stranger.start();
  await stranger.send({ type: 'JOIN', name: 'Intruso', token: TOKENS[5].id });
  await waitFor(() => stranger.getSnapshot().notice, 'ingresso rifiutato');
  expect(stranger.getSnapshot().notice?.text).toMatch(/già iniziata|riprendere/);
  expect(host.getSnapshot().state.players).toHaveLength(2);

  for (const c of [a2, b, tv, stranger]) c.stop();
  host.stop();
}

describe('20. Sincronizzazione tra dispositivi e riconnessione', () => {
  it('trasporto LOCALE (BroadcastChannel): ingresso, turno, dadi, movimento e registro sincronizzati', async () => {
    await scenario('local', 'LOCAL1');
  }, 30000);

  it('trasporto RETE LOCALE (WebSocket): ingresso, turno, dadi, movimento e registro sincronizzati', async () => {
    await scenario('relay', 'RELAY1');
  }, 30000);

  it('il server relay rifiuta un secondo conduttore con chiave diversa', async () => {
    const room = 'RELAY2';
    const h1 = new HostController(createHostTransport('relay', room), createGame(room, 1, Date.now()));
    await h1.start();
    // un'altra "identità conduttore" (chiave diversa) tenta di prendere la stessa stanza
    const ws = new WebSocket(`ws://127.0.0.1:${RELAY_PORT}/ws`);
    const reply = await new Promise<string>((resolve) => {
      ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', room, role: 'host', clientId: 'host', hostKey: 'chiave-sbagliata' }));
      ws.onmessage = (ev) => resolve(String(ev.data));
    });
    expect(JSON.parse(reply)).toMatchObject({ t: 'error', fatal: true });
    ws.close();
    h1.stop();
  });

  it('dopo un ripristino da un salvataggio più vecchio i client accettano comunque lo stato del conduttore', async () => {
    const room = 'LOCAL3';
    const host1 = new HostController(createHostTransport('local', room), createGame(room, 3, Date.now()));
    await host1.start();
    const a = new ClientStore(createClientTransport('local', room, 'old-A'));
    const b = new ClientStore(createClientTransport('local', room, 'old-B'));
    await Promise.all([a.start(), b.start()]);
    await a.send({ type: 'JOIN', name: 'Anna', token: TOKENS[0].id });
    await b.send({ type: 'JOIN', name: 'Beppe', token: TOKENS[1].id });
    await waitFor(() => host1.getSnapshot().state.players.length === 2, 'giocatori');
    // salvataggio "vecchio": prima dell'avvio
    const early = structuredClone(host1.getSnapshot().state);
    host1.dispatch({ type: 'START_GAME' });
    await waitFor(() => a.getSnapshot().state?.phase === 'turn_start', 'partita avviata');
    for (let i = 0; i < 3; i++) host1.dispatch({ type: 'ADJUST_CASH', playerId: 'p1', amount: 10, reason: 'prova versione' });
    await waitFor(() => a.getSnapshot().state!.version >= early.version + 4, 'ultime mosse viste dai client');
    const seenVersion = a.getSnapshot().state!.version;
    expect(seenVersion).toBeGreaterThan(early.version + 2); // più alta della versione ripristinata (early + 1)
    host1.stop();
    // il conduttore riparte dal salvataggio vecchio (le ultime mosse sono andate perse)
    const restored = prepareRestoredState(early, room, Date.now(), true);
    const host2 = new HostController(createHostTransport('local', room), restored);
    await host2.start();
    await waitFor(() => a.getSnapshot().state?.phase === 'lobby', 'lo stato ripristinato viene accettato dai client');
    expect(a.getSnapshot().state!.version).toBeLessThan(seenVersion + 1000);
    expect(a.getSnapshot().state!.epoch).toBeGreaterThan(early.epoch);
    // e il gioco prosegue normalmente da lì
    expect(host2.dispatch({ type: 'START_GAME' }).ok).toBe(true);
    await waitFor(() => b.getSnapshot().state?.phase === 'turn_start', 'nuova partenza');
    a.stop();
    b.stop();
    host2.stop();
  });

  it('la richiesta consegnata due volte con lo stesso id è elaborata una sola volta', async () => {
    const room = 'LOCAL2';
    const host = new HostController(createHostTransport('local', room), createGame(room, 5, Date.now()));
    await host.start();
    const t = createClientTransport('local', room, 'dup-A');
    await t.connect();
    const env = { id: 'same-id-1', clientId: 'dup-A', action: { type: 'JOIN', name: 'Dora', token: TOKENS[2].id } as const, ts: Date.now() };
    await t.sendAction(env);
    await t.sendAction(env);
    await t.sendAction({ ...env, id: 'same-id-2' }); // stessa azione, altro id: è una riconnessione, non un doppione
    await wait(200);
    expect(host.getSnapshot().state.players).toHaveLength(1);
    expect(host.getSnapshot().state.processed).toContain('same-id-1');
    expect(host.getSnapshot().state.log.filter((e) => e.text.includes('si è unito')).length).toBe(1);
    t.close();
    host.stop();
  });
});
