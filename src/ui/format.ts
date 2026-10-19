import { TOKENS, type TokenDef } from '../config/game.config';
import type { GameState, LedgerEntry, Party, Player, PlayerId } from '../engine/types';

export function fmtMoney(n: number): string {
  return n.toLocaleString('it-IT');
}

export function fmtOre(n: number): string {
  return `${fmtMoney(n)} Ore`;
}

export function fmtSigned(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtMoney(Math.abs(n))}`;
}

export function tokenDef(id: string): TokenDef {
  return TOKENS.find((t) => t.id === id) ?? TOKENS[0];
}

export function findP(state: GameState, id: PlayerId | null | undefined): Player | undefined {
  return id ? state.players.find((p) => p.id === id) : undefined;
}

export function nameOf(state: GameState, party: Party | null | undefined): string {
  if (!party) return '—';
  if (party === 'bank') return 'Banca';
  return findP(state, party)?.name ?? '—';
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h} h ${String(m).padStart(2, '0')} min`;
  if (m > 0) return `${m} min ${String(s).padStart(2, '0')} s`;
  return `${s} s`;
}

export const CATEGORY_LABELS: Record<LedgerEntry['category'], string> = {
  go: 'Sala del Regno',
  purchase: 'Acquisto',
  auction: 'Asta',
  rent: 'Contributo',
  tax: 'Spesa',
  card: 'Carta',
  development: 'Sviluppo',
  sale: 'Vendita sviluppo',
  mortgage: 'Ipoteca',
  unmortgage: 'Riscatto ipoteca',
  trade: 'Scambio',
  jail: 'Pausa organizzativa',
  bankruptcy: 'Bancarotta',
  adjustment: 'Rettifica',
};
