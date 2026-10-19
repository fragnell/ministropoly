#!/usr/bin/env node
/**
 * MINISTROPOLY – server di rete locale
 * --------------------------------------
 * - Serve l'app compilata (cartella dist/) a tutti i dispositivi della rete.
 * - Inoltra i messaggi tra il dispositivo del conduttore (autorità del gioco) e i client
 *   (smartphone, schermo TV). NON contiene regole di gioco e non conosce i saldi.
 * - Conserva in memoria l'ultimo stato pubblicato per far entrare i nuovi arrivati.
 *
 * Avvio:  npm run lan      (compila e avvia)    oppure    npm run build && npm run relay
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const DIST = path.resolve(__dirname, '..', 'dist');
const TAIL = 200;
const MAX_ROOMS = 200;
const ROOM_TTL_MS = 12 * 60 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/** @type {Map<string, {hostKey: string, host: import('ws').WebSocket | null, clients: Set<import('ws').WebSocket>, snap: any, log: any[], ledger: any[], touched: number}>} */
const rooms = new Map();

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list ?? []) {
      if (n.family === 'IPv4' && !n.internal) out.push(n.address);
    }
  }
  return out;
}

function mergeBySeq(current, incoming) {
  if (!Array.isArray(incoming) || incoming.length === 0) return current;
  const have = new Set(current.map((e) => e.seq));
  const merged = [...current, ...incoming.filter((e) => e && !have.has(e.seq))].sort((a, b) => a.seq - b.seq);
  return merged.length > TAIL ? merged.slice(merged.length - TAIL) : merged;
}

function send(ws, obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
}

// ------------------------------------------------------------------ HTTP (file statici + info)

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/api/info') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ app: 'ministropoly-relay', lanAddresses: lanAddresses(), port: PORT }));
    return;
  }
  if (url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  if (!fs.existsSync(DIST)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
    res.end("L'app non è ancora stata compilata. Esegui: npm run build (oppure npm run lan).");
    return;
  }
  let rel = decodeURIComponent(url.pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    // il router dell'app usa l'hash: ogni percorso sconosciuto torna alla pagina principale
    file = path.join(DIST, 'index.html');
  }
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') {
    // contrassegno: l'app capisce di essere servita dal server di rete locale
    const html = fs.readFileSync(file, 'utf8').replace('<head>', '<head><meta name="pp-relay" content="1" />');
    res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' });
    res.end(html);
    return;
  }
  const immutable = file.includes(`${path.sep}assets${path.sep}`);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
});

// ------------------------------------------------------------------ WebSocket (inoltro)

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4 * 1024 * 1024 });

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  /** @type {{room: any, role: string, clientId: string} | null} */
  let me = null;

  ws.on('message', (data) => {
    let m;
    try {
      m = JSON.parse(String(data));
    } catch {
      return;
    }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'hello') {
      const code = String(m.room ?? '').toUpperCase();
      if (!/^[A-Z0-9]{4,8}$/.test(code)) return send(ws, { t: 'error', message: 'Codice stanza non valido', fatal: true });
      let room = rooms.get(code);
      if (m.role === 'host') {
        if (!room) {
          if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', message: 'Troppe stanze attive sul server', fatal: true });
          room = { hostKey: String(m.hostKey ?? ''), host: null, clients: new Set(), snap: null, log: [], ledger: [], touched: Date.now() };
          rooms.set(code, room);
        } else if (room.hostKey && room.hostKey !== String(m.hostKey ?? '')) {
          return send(ws, { t: 'error', message: 'Questa stanza è già gestita da un altro conduttore', fatal: true });
        } else if (!room.hostKey) {
          room.hostKey = String(m.hostKey ?? '');
        }
        if (room.host && room.host !== ws) room.host.close(4000, 'sostituito');
        room.host = ws;
        me = { room, role: 'host', clientId: 'host' };
        send(ws, { t: 'welcome', hostOnline: true });
        for (const c of room.clients) send(c, { t: 'host_status', online: true });
      } else {
        if (!room) {
          if (rooms.size >= MAX_ROOMS) return send(ws, { t: 'error', message: 'Troppe stanze attive sul server' });
          room = { hostKey: '', host: null, clients: new Set(), snap: null, log: [], ledger: [], touched: Date.now() };
          rooms.set(code, room);
        }
        room.clients.add(ws);
        me = { room, role: 'client', clientId: String(m.clientId ?? '').slice(0, 80) };
        send(ws, { t: 'welcome', hostOnline: !!(room.host && room.host.readyState === 1) });
        if (room.snap) send(ws, { t: 'update', payload: { state: room.snap.state, log: room.log, ledger: room.ledger, hostTime: room.snap.hostTime } });
      }
      room.touched = Date.now();
      return;
    }

    if (!me) return;
    const room = me.room;
    room.touched = Date.now();

    if (me.role === 'host') {
      if (m.t === 'publish' && m.payload && m.payload.state) {
        room.snap = { state: m.payload.state, hostTime: m.payload.hostTime };
        room.log = mergeBySeq(room.log, m.payload.log);
        room.ledger = mergeBySeq(room.ledger, m.payload.ledger);
        const msg = JSON.stringify({ t: 'update', payload: m.payload });
        for (const c of room.clients) if (c.readyState === 1) c.send(msg);
      }
      return;
    }

    // client
    if (m.t === 'action' && m.env) {
      if (room.host && room.host.readyState === 1) send(room.host, { t: 'action', env: { ...m.env, clientId: me.clientId } });
      else send(ws, { t: 'error', message: 'Il conduttore non è collegato' });
    } else if (m.t === 'presence') {
      if (room.host && room.host.readyState === 1) send(room.host, { t: 'presence', clientId: me.clientId, ts: Date.now() });
    }
  });

  ws.on('close', () => {
    if (!me) return;
    const room = me.room;
    if (me.role === 'host' && room.host === ws) {
      room.host = null;
      for (const c of room.clients) send(c, { t: 'host_status', online: false });
    } else {
      room.clients.delete(ws);
    }
  });
});

// connessioni morte e stanze abbandonate
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.host && room.clients.size === 0 && now - room.touched > ROOM_TTL_MS) rooms.delete(code);
  }
}, 25000);

server.listen(PORT, '0.0.0.0', () => {
  const addrs = lanAddresses();
  console.log('\n  MINISTROPOLY – server di rete locale attivo\n');
  console.log(`  Su questo computer:           http://localhost:${PORT}`);
  for (const a of addrs) console.log(`  Dai telefoni (stesso Wi-Fi):  http://${a}:${PORT}`);
  if (!fs.existsSync(DIST)) console.log('\n  ATTENZIONE: manca la cartella dist/. Esegui prima: npm run build\n');
  else console.log('\n  Apri uno degli indirizzi sul computer del conduttore e scegli «Rete locale».\n');
});
