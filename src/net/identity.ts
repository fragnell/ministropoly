import { uid, type TransportKind } from './protocol';

/**
 * Identità anonima del dispositivo.
 * - Demo locale (più schede nello stesso browser): una identità per scheda (sessionStorage).
 * - Rete locale / Firebase: identità persistente del dispositivo (localStorage) così il giocatore
 *   resta collegato al proprio posto anche dopo un aggiornamento o la chiusura del browser.
 * Con `?as=nome` nell'indirizzo si può forzare un'identità distinta (utile per provare più giocatori
 * dallo stesso browser).
 */
export function getClientId(kind: TransportKind, room: string): string {
  const as = readAsParam();
  const key = `pp:cid:${kind}:${as ?? ''}`;
  const store = pickStore(kind, as);
  try {
    let id = store.getItem(key);
    if (!id) {
      id = uid();
      store.setItem(key, id);
    }
    return id;
  } catch {
    // archiviazione bloccata: identità valida solo finché la pagina resta aperta
    return memoryId(kind, room, as);
  }
}

const mem = new Map<string, string>();
function memoryId(kind: string, room: string, as: string | null): string {
  const k = `${kind}:${room}:${as ?? ''}`;
  let id = mem.get(k);
  if (!id) {
    id = uid();
    mem.set(k, id);
  }
  return id;
}

function pickStore(kind: TransportKind, as: string | null): Storage {
  return kind === 'local' || as ? sessionStorage : localStorage;
}

export function readAsParam(): string | null {
  try {
    const h = location.hash;
    const q = h.includes('?') ? h.slice(h.indexOf('?') + 1) : '';
    const v = new URLSearchParams(q).get('as');
    return v ? v.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20) : null;
  } catch {
    return null;
  }
}
