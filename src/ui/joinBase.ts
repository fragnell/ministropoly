import { useEffect, useState } from 'react';
import type { TransportKind } from '../net/protocol';
import { detectRelay } from '../net/relay';
import { baseUrl } from './router';

/**
 * Indirizzo che i telefoni devono aprire (usato per il QR code).
 * In rete locale, se la pagina è aperta come "localhost", i telefoni non possono raggiungerla:
 * si propone allora l'indirizzo di rete del computer (letto dal server incluso).
 */
export function useAutoBase(kind: TransportKind): { auto: string; suggestions: string[] } {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    if (kind !== 'relay') return;
    void detectRelay().then((info) => {
      if (alive && info) setSuggestions(info.lanAddresses.map((a) => `http://${a}:${info.port}/`));
    });
    return () => {
      alive = false;
    };
  }, [kind]);
  const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const auto = kind === 'relay' && isLocalHost && suggestions[0] ? suggestions[0] : baseUrl();
  return { auto, suggestions: kind === 'relay' ? suggestions : [] };
}
