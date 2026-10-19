import type { PlayerId, GameSettings, TradeSide } from './types';

/** Azioni richieste dai giocatori (smartphone) o dal conduttore. Tutte sono validate dal motore. */
export type Action =
  // --- Sala d'attesa e gestione (conduttore) ---
  | { type: 'JOIN'; name: string; token: string; profile?: 'adult' | 'kid'; claim?: PlayerId }
  | { type: 'LEAVE' }
  | { type: 'UPDATE_PROFILE'; name?: string; token?: string; profile?: 'adult' | 'kid' }
  | { type: 'ADD_BOT' }
  | { type: 'SET_SETTINGS'; settings: Partial<Omit<GameSettings, 'packs' | 'speedMode'>> & { packs?: Partial<GameSettings['packs']>; speedMode?: Partial<GameSettings['speedMode']> } }
  | { type: 'KICK'; playerId: PlayerId }
  | { type: 'START_GAME' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'END_GAME' }
  | { type: 'ADJUST_CASH'; playerId: PlayerId; amount: number; reason: string }
  | { type: 'AUTO_STEP' }
  | { type: 'FORCE_BANKRUPTCY'; playerId: PlayerId }
  // --- Turno ---
  | { type: 'ROLL_DICE' }
  | { type: 'PAY_JAIL_FINE' }
  | { type: 'USE_JAIL_CARD' }
  | { type: 'BUY_PROPERTY' }
  | { type: 'DECLINE_PROPERTY' }
  | { type: 'PAY_RENT' }
  | { type: 'START_CHALLENGE' }
  | { type: 'JUDGE_CHALLENGE'; correct: boolean }
  | { type: 'ACK_CARD' }
  | { type: 'USE_SAVED_CARD' }
  | { type: 'PAY_EXPENSE' }
  | { type: 'END_TURN' }
  // --- Aste ---
  | { type: 'BID'; amount: number }
  | { type: 'PASS_AUCTION' }
  // --- Proprietà ---
  | { type: 'DEVELOP'; square: number }
  | { type: 'SELL_DEVELOPMENT'; square: number }
  | { type: 'MORTGAGE'; square: number }
  | { type: 'UNMORTGAGE'; square: number }
  // --- Scambi ---
  | { type: 'PROPOSE_TRADE'; to: PlayerId; offer: TradeSide; request: TradeSide; message?: string }
  | { type: 'ACCEPT_TRADE'; id: string }
  | { type: 'DECLINE_TRADE'; id: string }
  | { type: 'WITHDRAW_TRADE'; id: string }
  | { type: 'COUNTER_TRADE'; id: string; offer: TradeSide; request: TradeSide; message?: string }
  // --- Debiti ---
  | { type: 'DECLARE_BANKRUPTCY' }
  // --- Interne (solo conduttore) ---
  | { type: 'TICK' }
  | { type: 'PRESENCE'; connected: Record<string, boolean> };

export type ActionType = Action['type'];

/** Azioni riservate al conduttore */
export const HOST_ONLY: ActionType[] = [
  'ADD_BOT',
  'SET_SETTINGS',
  'KICK',
  'START_GAME',
  'PAUSE',
  'RESUME',
  'END_GAME',
  'ADJUST_CASH',
  'AUTO_STEP',
  'FORCE_BANKRUPTCY',
  'TICK',
  'PRESENCE',
];
