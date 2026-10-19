import { useEffect, useState } from 'react';

/** Router minimale basato sull'hash (#/percorso?parametri): funziona ovunque, anche su GitHub Pages. */
export interface Route {
  path: string[];
  query: URLSearchParams;
  raw: string;
}

export function parseHash(hash: string): Route {
  const h = hash.replace(/^#/, '') || '/';
  const [p, q = ''] = h.split('?');
  return { path: p.split('/').filter(Boolean), query: new URLSearchParams(q), raw: h };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function navigate(to: string, replace = false): void {
  const target = to.startsWith('#') ? to : `#${to}`;
  if (replace) history.replaceState(null, '', target);
  else location.hash = target;
  if (replace) window.dispatchEvent(new HashChangeEvent('hashchange'));
}

/** Indirizzo base dell'app (senza hash), usato per i link e il QR code */
export function baseUrl(): string {
  return location.origin + location.pathname;
}

export function joinUrl(base: string, room: string, kind: string): string {
  const b = base.replace(/#.*$/, '').replace(/\/?$/, '/');
  return `${b}#/join/${room}?t=${kind}`;
}

export function tvUrl(base: string, room: string, kind: string): string {
  const b = base.replace(/#.*$/, '').replace(/\/?$/, '/');
  return `${b}#/tv/${room}?t=${kind}`;
}
