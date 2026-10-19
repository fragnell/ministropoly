import type { Action } from '../../engine/actions';
import type { Player } from '../../engine/types';
import type { GameView } from '../hooks';

export type Tab = 'game' | 'props' | 'trades' | 'bank' | 'log';

/** Tutto ciò che i pannelli dello smartphone ricevono: stato, il giocatore di questo telefono e come inviare richieste */
export interface PhoneCtx {
  view: GameView;
  me: Player;
  send: (a: Action) => void;
  busy: boolean;
  goTab: (t: Tab) => void;
  /** apre la scheda di una proprietà */
  openProperty: (index: number) => void;
  /** apre il costruttore di scambi (eventualmente precompilato) */
  openTrade: (preset?: { to?: string; request?: number[] }) => void;
}
