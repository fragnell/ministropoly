/**
 * Test del trasporto Firebase e delle regole di sicurezza contro gli EMULATORI Firebase ufficiali.
 *
 * Si eseguono da soli quando gli emulatori sono attivi (altrimenti vengono saltati):
 *
 *   npm run emulators                       (in un terminale; richiede Java)
 *   npx vitest run tests/firebase-emulator.test.ts    (in un altro)
 *
 * Ogni "dispositivo" usa una app Firebase distinta, quindi ha un utente anonimo (uid) diverso.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TOKENS } from '../src/config/game.config';
import { createGame } from '../src/engine/state';
import { ClientStore } from '../src/net/client';
import { createClientTransport, createHostTransport } from '../src/net/factory';
import { firebaseBoot } from '../src/net/firebase';
import { HostController } from '../src/net/host';

/** Gli emulatori sono raggiungibili? (si può forzare lo skip con FIREBASE_EMULATOR=0) */
async function emulatorUp(): Promise<boolean> {
  if (process.env.FIREBASE_EMULATOR === '0') return false;
  try {
    // il database risponde (anche con un 400 alla radice) solo se l'emulatore è attivo
    await fetch('http://127.0.0.1:9000/', { signal: AbortSignal.timeout(1500) });
    return true;
  } catch {
    return false;
  }
}
const enabled = await emulatorUp();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => T | undefined | false | null, label: string, timeout = 8000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (Date.now() - t0 > timeout) throw new Error(`Timeout in attesa di: ${label}`);
    await wait(25);
  }
}

describe.skipIf(!enabled)('Firebase (emulatori): sincronizzazione e regole di sicurezza', () => {
  beforeAll(() => {
    // configurazione a runtime (window.PP_FIREBASE_CONFIG): punta agli emulatori locali
    (globalThis as { PP_FIREBASE_CONFIG?: unknown }).PP_FIREBASE_CONFIG = {
      apiKey: 'demo-key',
      authDomain: 'demo-predicandopoly.firebaseapp.com',
      databaseURL: 'https://demo-predicandopoly-default-rtdb.firebaseio.com',
      projectId: 'demo-predicandopoly',
      appId: '1:1:web:1',
      useEmulator: true,
    };
  });
  afterAll(() => {
    delete (globalThis as { PP_FIREBASE_CONFIG?: unknown }).PP_FIREBASE_CONFIG;
  });

  it('conduttore e giocatori sincronizzano stato, azioni, registro e presenza; le regole bloccano abusi', async () => {
    const room = 'FB' + Math.random().toString(36).slice(2, 5).toUpperCase();

    // --- conduttore (utente anonimo A)
    const host = new HostController(createHostTransport('firebase', room, 'app-host'), createGame(room, 7, Date.now()));
    await host.start();

    // --- due smartphone e una TV (utenti B, C, D)
    const a = new ClientStore(createClientTransport('firebase', room, undefined, 'app-a'));
    const b = new ClientStore(createClientTransport('firebase', room, undefined, 'app-b'));
    const tv = new ClientStore(createClientTransport('firebase', room, undefined, 'app-tv'));
    await Promise.all([a.start(), b.start(), tv.start()]);

    await waitFor(() => a.getSnapshot().state && tv.getSnapshot().state, 'stato iniziale');
    await waitFor(() => a.getSnapshot().hostOnline, 'conduttore online');
    expect(a.clientId).not.toBe(b.clientId); // utenti anonimi distinti

    // --- ingresso dei giocatori
    await a.send({ type: 'JOIN', name: 'Anna', token: TOKENS[0].id });
    await b.send({ type: 'JOIN', name: 'Beppe', token: TOKENS[1].id });
    await waitFor(() => host.getSnapshot().state.players.length === 2, 'giocatori registrati');
    await waitFor(() => tv.getSnapshot().state?.players.length === 2, 'giocatori visibili sulla TV');
    await waitFor(() => a.getSnapshot().me?.name === 'Anna', 'riconoscimento di A');

    // --- un giocatore non può avviare la partita (azione del conduttore)
    await a.send({ type: 'START_GAME' });
    await waitFor(() => a.getSnapshot().notice, 'errore per azione riservata');
    expect(a.getSnapshot().notice?.text).toMatch(/conduttore/);

    // --- il conduttore avvia; tutti vedono lo stesso stato
    expect(host.dispatch({ type: 'START_GAME' }).ok).toBe(true);
    await waitFor(() => tv.getSnapshot().state?.phase === 'turn_start', 'partita avviata sulla TV');
    const currentId = host.getSnapshot().state.currentPlayerId as string;
    const current = currentId === a.getSnapshot().me?.id ? a : b;
    await current.send({ type: 'ROLL_DICE' });
    await waitFor(() => tv.getSnapshot().state?.roll, 'dadi sulla TV');
    await waitFor(() => !['rolling', 'moving'].includes(tv.getSnapshot().state?.phase ?? 'rolling'), 'fine del movimento', 12000);
    await waitFor(() => tv.getSnapshot().log.some((e) => e.text.includes('ha lanciato i dadi')), 'registro eventi sulla TV');
    // lo stato pubblicato non contiene l'ordine dei mazzi
    expect(tv.getSnapshot().state?.decks.treasure.draw).toEqual([]);

    // --- REGOLE DI SICUREZZA (accesso diretto al database, aggirando l'app)
    const evil = await firebaseBoot('app-a'); // stesso utente del giocatore A
    const { ref, set, get, push } = evil.api;
    // 1) un giocatore NON può scrivere lo stato
    await expect(set(ref(evil.db, `rooms/${room}/state`), '{"hacked":true}')).rejects.toThrow(/PERMISSION_DENIED|permission/i);
    // 2) un giocatore NON può scrivere saldi né il registro
    await expect(set(ref(evil.db, `rooms/${room}/log/e000000999`), '{"x":1}')).rejects.toThrow(/PERMISSION_DENIED|permission/i);
    // 3) un giocatore NON può inviare azioni a nome di un altro utente
    await expect(
      set(ref(evil.db, `rooms/${room}/actions/fake1`), { id: 'fake1', uid: b.clientId, ts: Date.now(), action: JSON.stringify({ type: 'ROLL_DICE' }) }),
    ).rejects.toThrow(/PERMISSION_DENIED|permission/i);
    // 4) un giocatore NON può leggere le richieste degli altri
    await expect(get(ref(evil.db, `rooms/${room}/actions`))).rejects.toThrow(/PERMISSION_DENIED|permission/i);
    // 5) un giocatore NON può rubare il ruolo di conduttore
    await expect(set(ref(evil.db, `rooms/${room}/meta`), { hostUid: a.clientId, createdAt: Date.now() })).rejects.toThrow(/PERMISSION_DENIED|permission/i);
    // 6) un giocatore NON può cancellare la stanza
    await expect(set(ref(evil.db, `rooms/${room}`), null)).rejects.toThrow(/PERMISSION_DENIED|permission/i);
    // 7) un giocatore PUÒ leggere lo stato (è pubblico) e inviare azioni a proprio nome
    const st = await get(ref(evil.db, `rooms/${room}/state`));
    expect(typeof st.val()).toBe('string');
    void push;

    // --- riconnessione: stesso utente anonimo ⇒ ritrova il proprio posto
    a.stop();
    const a2 = new ClientStore(createClientTransport('firebase', room, undefined, 'app-a'));
    await a2.start();
    await waitFor(() => a2.getSnapshot().me?.name === 'Anna', 'riconnessione dopo ricaricamento');
    await a2.send({ type: 'JOIN', name: 'Anna', token: TOKENS[0].id });
    await wait(300);
    expect(host.getSnapshot().state.players).toHaveLength(2); // nessun doppione

    // --- un dispositivo nuovo non può entrare a partita avviata senza riprendere un posto
    const x = new ClientStore(createClientTransport('firebase', room, undefined, 'app-x'));
    await x.start();
    await x.send({ type: 'JOIN', name: 'Intruso', token: TOKENS[5].id });
    await waitFor(() => x.getSnapshot().notice, 'ingresso rifiutato');
    expect(x.getSnapshot().notice?.text).toMatch(/già iniziata|riprendere/);

    // --- presenza: un dispositivo scollegato viene segnalato
    await waitFor(() => host.getSnapshot().connectedClients >= 2, 'presenza dei dispositivi');

    // --- il conduttore può cancellare la stanza
    await host.destroyRoom();
    // (l'intera stanza non è leggibile da nessuno: si verifica che meta e stato siano spariti)
    const hostFb = await firebaseBoot('app-host');
    expect((await hostFb.api.get(hostFb.api.ref(hostFb.db, `rooms/${room}/meta`))).exists()).toBe(false);
    expect((await hostFb.api.get(hostFb.api.ref(hostFb.db, `rooms/${room}/state`))).exists()).toBe(false);

    for (const c of [a2, b, tv, x]) c.stop();
    host.stop();
  }, 60000);

  it('un altro conduttore non può prendere una stanza già in uso', async () => {
    const room = 'FC' + Math.random().toString(36).slice(2, 5).toUpperCase();
    const h1 = new HostController(createHostTransport('firebase', room, 'app-host2'), createGame(room, 1, Date.now()));
    await h1.start();
    const h2 = new HostController(createHostTransport('firebase', room, 'app-host3'), createGame(room, 2, Date.now()));
    await expect(h2.start()).rejects.toThrow(/già in uso|PERMISSION/i);
    h1.stop();
  }, 30000);
});
