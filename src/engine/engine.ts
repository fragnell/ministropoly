/**
 * MOTORE DELLE REGOLE
 * -------------------
 * `applyAction(stato, azione, contesto)` è una funzione pura: clona lo stato, applica l'azione e
 * restituisce il nuovo stato oppure un errore (lasciando lo stato originale intatto).
 * Il motore non conosce l'interfaccia grafica né la rete: funziona anche da solo (test, simulazioni).
 */
import { BOT_NAMES, ECONOMY, SPEED_MODE_MINUTES, TOKENS } from '../config/game.config';
import { getCard } from '../config/cards';
import type { Action } from './actions';
import { HOST_ONLY } from './actions';
import type { ActionContext, ApplyResult, GameState, Player } from './types';
import { declareBankruptcy, canDeclareBankruptcy } from './bankruptcy';
import { executeCard, initDecks, returnHeldCard } from './cards';
import { judgeChallenge, startChallenge } from './challenge';
import { advanceTurn, chargePlayer, endGame, releaseFromJail, settleFlow } from './flow';
import { arrive, payRent, rollDice, settleRoll } from './landing';
import { pushLog, transfer } from './money';
import { buyProperty, develop, endAuction, mortgage, passAuction, placeBid, sellDevelopment, startAuction, unmortgage } from './property';
import { currentPlayer, findPlayer, getPlayer, playerByClient } from './selectors';
import { elapsedMs, emptyStats } from './state';
import { acceptTrade, counterTrade, declineTrade, proposeTrade, withdrawTrade } from './trade';
import { GameError, cloneState, fail, fmt, isInt, shuffle } from './util';

const MAX_PROCESSED = 400;

/** Vero se un TICK produrrebbe un cambiamento (evita cloni inutili) */
export function needsTick(s: GameState, now: number): boolean {
  if (s.paused || s.phase === 'lobby' || s.phase === 'game_over') return false;
  if (s.settings.speedMode.enabled && !s.timeUp && s.startedAt != null && elapsedMs(s, now) >= s.settings.speedMode.minutes * 60000) return true;
  if (s.phase === 'rolling' && s.roll && now >= s.roll.endsAt) return true;
  if (s.phase === 'moving' && s.movement && now >= s.movement.endsAt) return true;
  if (s.phase === 'auction' && s.auction && now >= s.auction.endsAt) return true;
  return false;
}

export function applyAction(state: GameState, action: Action, ctx: ActionContext): ApplyResult {
  if (HOST_ONLY.includes(action.type) && ctx.actor.kind !== 'host') return { ok: false, error: 'Azione riservata al conduttore', state };
  if (ctx.actionId && state.processed.includes(ctx.actionId)) return { ok: true, state, duplicate: true };
  if (action.type === 'TICK' && !needsTick(state, ctx.now)) return { ok: true, state };

  const s: GameState = cloneState(state);
  s.hostTime = ctx.now;
  try {
    if (HOST_ONLY.includes(action.type) && ctx.actor.kind !== 'host') fail('Azione riservata al conduttore');
    if (s.paused && !ALLOWED_WHILE_PAUSED.includes(action.type)) fail('La partita è in pausa');
    handle(s, action, ctx);
    if (s.phase !== 'lobby') settleFlow(s, ctx.now);
    if (ctx.actionId) {
      s.processed.push(ctx.actionId);
      if (s.processed.length > MAX_PROCESSED) s.processed.splice(0, s.processed.length - MAX_PROCESSED);
    }
    s.version = state.version + 1;
    return { ok: true, state: s };
  } catch (e) {
    if (e instanceof GameError) return { ok: false, error: e.message, state };
    throw e;
  }
}

const ALLOWED_WHILE_PAUSED = ['RESUME', 'PAUSE', 'END_GAME', 'ADJUST_CASH', 'KICK', 'PRESENCE', 'JOIN', 'LEAVE', 'UPDATE_PROFILE', 'SET_SETTINGS', 'ADD_BOT'];

// ------------------------------------------------------------------ attori

function seated(s: GameState, ctx: ActionContext): Player {
  if (ctx.actor.kind !== 'client') fail('Questa azione spetta a un giocatore');
  const p = playerByClient(s, ctx.actor.clientId);
  if (!p) fail('Non sei seduto in questa partita');
  if (p.bankrupt) fail('Sei fuori dalla partita');
  return p;
}

function turnPlayer(s: GameState, ctx: ActionContext): Player {
  const p = seated(s, ctx);
  if (s.currentPlayerId !== p.id) fail('Non è il tuo turno');
  return p;
}

function requirePhase(s: GameState, ...phases: GameState['phase'][]): void {
  if (!phases.includes(s.phase)) fail('Azione non disponibile in questo momento');
}

function sanitizeName(raw: string): string {
  const name = String(raw ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, ECONOMY.maxNameLength);
  if (name.length < 1) fail('Inserisci un nickname');
  return name;
}

// ------------------------------------------------------------------ gestore principale

function handle(s: GameState, a: Action, ctx: ActionContext): void {
  const now = ctx.now;
  switch (a.type) {
    // ---------------------------------------------------- sala d'attesa e conduttore
    case 'JOIN':
      return join(s, a, ctx);
    case 'LEAVE': {
      const p = seated(s, ctx);
      if (s.phase === 'lobby') {
        s.players = s.players.filter((x) => x.id !== p.id);
        pushLog(s, `${p.name} ha lasciato la sala d'attesa.`, 'system');
      } else {
        p.clientId = null;
        p.connected = false;
        pushLog(s, `${p.name} ha lasciato il posto: potrà riprenderlo da un dispositivo.`, 'system');
      }
      return;
    }
    case 'UPDATE_PROFILE': {
      requirePhase(s, 'lobby');
      const p = seated(s, ctx);
      if (a.name != null) {
        const name = sanitizeName(a.name);
        if (s.players.some((x) => x.id !== p.id && x.name.toLowerCase() === name.toLowerCase())) fail('Nome già in uso');
        p.name = name;
      }
      if (a.token != null) {
        const t = TOKENS.find((x) => x.id === a.token);
        if (!t) fail('Pedina non valida');
        if (s.players.some((x) => x.id !== p.id && x.token === t.id)) fail('Pedina già scelta');
        p.token = t.id;
        p.color = t.color;
      }
      if (a.profile) p.profile = a.profile === 'kid' ? 'kid' : 'adult';
      return;
    }
    case 'ADD_BOT': {
      requirePhase(s, 'lobby');
      if (s.players.length >= ECONOMY.players.max) fail('La partita è al completo');
      const tok = TOKENS.find((t) => !s.players.some((p) => p.token === t.id));
      if (!tok) fail('Nessuna pedina libera');
      const base = BOT_NAMES.find((n) => !s.players.some((p) => p.name.toLowerCase() === `bot ${n}`.toLowerCase())) ?? `${s.players.length + 1}`;
      const p = newPlayer(s, `Bot ${base}`, tok.id, 'adult', `bot:${s.players.length + 1}:${Math.floor(s.rng % 100000)}`);
      p.isBot = true;
      p.connected = true;
      s.players.push(p);
      pushLog(s, `${p.name} si è unito alla partita (giocatore virtuale).`, 'system');
      return;
    }
    case 'SET_SETTINGS': {
      requirePhase(s, 'lobby');
      const x = a.settings;
      if (x.startingCash != null) {
        if (!isInt(x.startingCash) || x.startingCash < 200 || x.startingCash > 10000) fail('Saldo iniziale non valido');
        s.settings.startingCash = x.startingCash;
      }
      if (x.auctionSeconds != null) {
        if (!isInt(x.auctionSeconds) || x.auctionSeconds < 5 || x.auctionSeconds > 180) fail('Durata asta non valida (5–180 secondi)');
        s.settings.auctionSeconds = x.auctionSeconds;
      }
      if (x.packs) {
        if (x.packs.publisher != null) s.settings.packs.publisher = !!x.packs.publisher;
        if (x.packs.kids != null) s.settings.packs.kids = !!x.packs.kids;
      }
      if (x.speedMode) {
        if (x.speedMode.enabled != null) s.settings.speedMode.enabled = !!x.speedMode.enabled;
        if (x.speedMode.minutes != null) {
          if (!(SPEED_MODE_MINUTES as readonly number[]).includes(x.speedMode.minutes)) fail('Durata non valida (45, 60 o 90 minuti)');
          s.settings.speedMode.minutes = x.speedMode.minutes;
        }
      }
      return;
    }
    case 'KICK': {
      const p = getPlayer(s, a.playerId);
      if (s.phase === 'lobby') {
        s.players = s.players.filter((x) => x.id !== p.id);
        pushLog(s, `${p.name} è stato rimosso dalla sala d'attesa.`, 'host');
      } else {
        if (p.isBot) fail('I giocatori virtuali non possono essere rimossi durante la partita');
        p.clientId = null;
        p.connected = false;
        pushLog(s, `Il conduttore ha liberato il posto di ${p.name}.`, 'host');
      }
      return;
    }
    case 'START_GAME':
      return startGame(s, now);
    case 'PAUSE': {
      if (s.phase === 'lobby' || s.phase === 'game_over') fail('Nessuna partita in corso');
      if (s.paused) fail('La partita è già in pausa');
      s.paused = { since: now };
      pushLog(s, 'Il conduttore ha messo la partita in pausa.', 'host');
      return;
    }
    case 'RESUME': {
      if (!s.paused) fail('La partita non è in pausa');
      const d = now - s.paused.since;
      s.pausedTotalMs += d;
      if (s.auction) s.auction.endsAt += d;
      if (s.roll && s.phase === 'rolling') s.roll.endsAt += d;
      if (s.movement) {
        s.movement.startsAt += d;
        s.movement.endsAt += d;
      }
      s.paused = null;
      pushLog(s, 'La partita riprende.', 'host');
      return;
    }
    case 'END_GAME': {
      if (s.phase === 'lobby' || s.phase === 'game_over') fail('Nessuna partita in corso');
      endGame(s, 'host');
      return;
    }
    case 'ADJUST_CASH': {
      if (s.phase === 'lobby' || s.phase === 'game_over') fail('Nessuna partita in corso');
      const p = getPlayer(s, a.playerId);
      const reason = String(a.reason ?? '').trim().slice(0, 120);
      if (reason.length < 3) fail('Indica il motivo della rettifica');
      if (!isInt(a.amount) || a.amount === 0) fail('Importo non valido');
      if (p.bankrupt) fail('Il giocatore è fuori dalla partita');
      if (a.amount > 0) transfer(s, 'bank', p.id, a.amount, 'adjustment', `Rettifica del conduttore: ${reason}`);
      else transfer(s, p.id, 'bank', -a.amount, 'adjustment', `Rettifica del conduttore: ${reason}`);
      pushLog(s, `Il conduttore ha rettificato il saldo di ${p.name} di ${a.amount > 0 ? '+' : ''}${fmt(a.amount)} (${reason}).`, 'host', p.id);
      return;
    }
    case 'AUTO_STEP':
      return autoStep(s, now);
    case 'FORCE_BANKRUPTCY': {
      if (s.phase !== 'debt' || s.pending?.kind !== 'debt' || s.pending.debtorId !== a.playerId) fail('Il giocatore non è in fase di debito');
      const p = getPlayer(s, a.playerId);
      pushLog(s, `Il conduttore dichiara la bancarotta di ${p.name}.`, 'host', p.id);
      declareBankruptcy(s, p, now);
      return;
    }
    case 'TICK':
      return tick(s, now);
    case 'PRESENCE': {
      for (const p of s.players) {
        if (p.isBot || !p.clientId) continue;
        const c = a.connected[p.clientId];
        if (c !== undefined && p.connected !== c) {
          p.connected = c;
        }
      }
      return;
    }

    // ---------------------------------------------------- turno
    case 'ROLL_DICE': {
      const p = turnPlayer(s, ctx);
      requirePhase(s, 'turn_start', 'jail');
      rollDice(s, p, now, ctx.forcedDice);
      return;
    }
    case 'PAY_JAIL_FINE': {
      const p = turnPlayer(s, ctx);
      requirePhase(s, 'jail');
      pushLog(s, `${p.name} paga ${fmt(ECONOMY.jailFine)} per uscire dalla Pausa organizzativa.`, 'jail', p.id);
      chargePlayer(s, p, [{ to: 'bank', amount: ECONOMY.jailFine, reason: 'Multa della Pausa organizzativa', category: 'jail' }], { kind: 'jail_released' }, now);
      return;
    }
    case 'USE_JAIL_CARD': {
      const p = turnPlayer(s, ctx);
      requirePhase(s, 'jail');
      const card = p.heldCards.find((id) => {
        const e = getCard(id).effect;
        return e.type === 'hold' && e.kind === 'jail_free';
      });
      if (!card) fail('Non hai la carta per uscire dalla Pausa organizzativa');
      returnHeldCard(s, p, card);
      releaseFromJail(p);
      s.phase = 'turn_start';
      pushLog(s, `${p.name} usa la carta e esce dalla Pausa organizzativa.`, 'jail', p.id);
      return;
    }
    case 'BUY_PROPERTY': {
      const p = turnPlayer(s, ctx);
      requirePhase(s, 'buy_decision');
      buyProperty(s, p);
      return;
    }
    case 'DECLINE_PROPERTY': {
      const p = turnPlayer(s, ctx);
      requirePhase(s, 'buy_decision');
      if (s.pending?.kind !== 'buy') fail('Nessun acquisto in corso');
      pushLog(s, `${p.name} rifiuta l'acquisto: si va all'asta.`, 'auction', p.id);
      startAuction(s, s.pending.square, now);
      return;
    }
    case 'PAY_RENT': {
      const p = turnPlayer(s, ctx);
      requirePhase(s, 'resolving');
      payRent(s, p, now);
      return;
    }
    case 'START_CHALLENGE': {
      const p = turnPlayer(s, ctx);
      requirePhase(s, 'resolving');
      startChallenge(s, p, now);
      return;
    }
    case 'JUDGE_CHALLENGE': {
      requirePhase(s, 'resolving');
      if (s.pending?.kind !== 'challenge') fail('Nessuna sfida da valutare');
      const payer = currentPlayer(s);
      if (!payer) fail('Nessun giocatore di turno');
      if (ctx.actor.kind === 'client') {
        const me = seated(s, ctx);
        if (me.id !== s.pending.ownerId) fail('Solo il proprietario (o il conduttore) può valutare la risposta');
      }
      judgeChallenge(s, payer, !!a.correct, now);
      return;
    }
    case 'ACK_CARD': {
      requirePhase(s, 'card_draw');
      const p = currentPlayer(s);
      if (!p) fail('Nessun giocatore di turno');
      if (ctx.actor.kind === 'client') {
        const me = seated(s, ctx);
        if (me.id !== p.id) fail('Non è il tuo turno');
      }
      executeCard(s, p, now);
      return;
    }
    case 'USE_SAVED_CARD': {
      const p = turnPlayer(s, ctx);
      requirePhase(s, 'resolving');
      if (s.pending?.kind !== 'expense' || !s.pending.cardId) fail('Nessuna spesa da annullare');
      const pend = s.pending;
      returnHeldCard(s, p, pend.cardId as string);
      s.pending = null;
      pushLog(s, `${p.name} usa la carta «Spesa evitata»: ${fmt(pend.amount)} non vengono pagate.`, 'card', p.id);
      return;
    }
    case 'PAY_EXPENSE': {
      const p = turnPlayer(s, ctx);
      requirePhase(s, 'resolving');
      if (s.pending?.kind !== 'expense') fail('Nessuna spesa da pagare');
      const pend = s.pending;
      s.pending = null;
      chargePlayer(s, p, [{ to: 'bank', amount: pend.amount, reason: pend.reason, category: pend.square != null ? 'tax' : 'card', square: pend.square }], { kind: 'finish' }, now);
      return;
    }
    case 'END_TURN': {
      turnPlayer(s, ctx);
      requirePhase(s, 'turn_end');
      advanceTurn(s, now);
      return;
    }

    // ---------------------------------------------------- aste
    case 'BID':
      return placeBid(s, seated(s, ctx), a.amount, now);
    case 'PASS_AUCTION':
      return passAuction(s, seated(s, ctx), now);

    // ---------------------------------------------------- proprietà
    case 'DEVELOP':
      return develop(s, turnPlayer(s, ctx), a.square);
    case 'SELL_DEVELOPMENT':
      return sellDevelopment(s, turnPlayer(s, ctx), a.square, now);
    case 'MORTGAGE':
      return mortgage(s, turnPlayer(s, ctx), a.square, now);
    case 'UNMORTGAGE':
      return unmortgage(s, turnPlayer(s, ctx), a.square);

    // ---------------------------------------------------- scambi
    case 'PROPOSE_TRADE':
      proposeTrade(s, seated(s, ctx), a.to, a.offer, a.request, a.message, now);
      return;
    case 'ACCEPT_TRADE':
      return acceptTrade(s, seated(s, ctx), a.id, now);
    case 'DECLINE_TRADE':
      return declineTrade(s, seated(s, ctx), a.id, now);
    case 'WITHDRAW_TRADE':
      return withdrawTrade(s, seated(s, ctx), a.id, now);
    case 'COUNTER_TRADE':
      return counterTrade(s, seated(s, ctx), a.id, a.offer, a.request, a.message, now);

    // ---------------------------------------------------- debiti
    case 'DECLARE_BANKRUPTCY': {
      const p = turnPlayer(s, ctx);
      const chk = canDeclareBankruptcy(s, p.id);
      if (!chk.ok) fail(chk.reason);
      declareBankruptcy(s, p, now);
      return;
    }
    default: {
      const _never: never = a;
      void _never;
      fail('Azione sconosciuta');
    }
  }
}

// ------------------------------------------------------------------ sala d'attesa

function newPlayer(s: GameState, name: string, tokenId: string, profile: 'adult' | 'kid', clientId: string): Player {
  const t = TOKENS.find((x) => x.id === tokenId);
  if (!t) fail('Pedina non valida');
  let n = s.players.length + 1;
  while (s.players.some((p) => p.id === `p${n}`)) n++;
  return {
    id: `p${n}`,
    clientId,
    name,
    token: t.id,
    color: t.color,
    profile,
    isBot: false,
    cash: s.settings.startingCash,
    position: 0,
    inJail: false,
    jailTurns: 0,
    bankrupt: false,
    connected: true,
    skipTurn: false,
    heldCards: [],
    nextDevDiscount: 0,
    stats: emptyStats(),
  };
}

function join(s: GameState, a: Extract<Action, { type: 'JOIN' }>, ctx: ActionContext): void {
  if (ctx.actor.kind !== 'client') fail('Solo un dispositivo può unirsi alla partita');
  const cid = ctx.actor.clientId;
  const existing = playerByClient(s, cid);
  if (existing) {
    existing.connected = true; // riconnessione: nessun doppione
    return;
  }
  if (s.phase === 'lobby') {
    if (s.players.length >= ECONOMY.players.max) fail('La partita è al completo');
    const name = sanitizeName(a.name);
    if (s.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) fail('Nome già in uso: scegline un altro');
    if (s.players.some((p) => p.token === a.token)) fail('Pedina già scelta da un altro giocatore');
    const p = newPlayer(s, name, a.token, a.profile === 'kid' ? 'kid' : 'adult', cid);
    s.players.push(p);
    pushLog(s, `${p.name} si è unito alla partita.`, 'system', p.id);
    return;
  }
  if (s.phase === 'game_over') fail('La partita è terminata');
  if (!a.claim) fail('La partita è già iniziata: scegli il tuo nome per riprendere il posto');
  const seat = findPlayer(s, a.claim);
  if (!seat || seat.isBot) fail('Posto non disponibile');
  if (seat.bankrupt) fail('Questo giocatore è in bancarotta');
  if (seat.clientId && seat.connected) fail('Questo posto è occupato da un dispositivo collegato');
  seat.clientId = cid;
  seat.connected = true;
  pushLog(s, `${seat.name} è tornato in partita da un nuovo dispositivo.`, 'system', seat.id);
}

function startGame(s: GameState, now: number): void {
  requirePhase(s, 'lobby');
  if (s.players.length < ECONOMY.players.min) fail(`Servono almeno ${ECONOMY.players.min} giocatori`);
  for (const p of s.players) {
    p.cash = s.settings.startingCash;
    p.position = 0;
    p.stats = emptyStats();
  }
  initDecks(s);
  s.turnOrder = shuffle(s, s.players.map((p) => p.id));
  s.currentPlayerId = s.turnOrder[0];
  s.turnNumber = 1;
  s.round = 1;
  s.startedAt = now;
  s.pausedTotalMs = 0;
  s.timeUp = false;
  s.phase = 'turn_start';
  const first = getPlayer(s, s.currentPlayerId);
  pushLog(s, `La partita comincia! Ordine di gioco: ${s.turnOrder.map((id) => getPlayer(s, id).name).join(', ')}.`, 'system');
  pushLog(s, `Tocca a ${first.name}.`, 'info', first.id);
}

// ------------------------------------------------------------------ tick e passo automatico

function tick(s: GameState, now: number): void {
  if (s.settings.speedMode.enabled && !s.timeUp && s.startedAt != null && elapsedMs(s, now) >= s.settings.speedMode.minutes * 60000) {
    s.timeUp = true;
    pushLog(s, 'Il tempo è scaduto: si termina il giro corrente e poi si calcola il patrimonio finale.', 'system');
  }
  if (s.phase === 'rolling' && s.roll && now >= s.roll.endsAt) settleRoll(s, now);
  else if (s.phase === 'moving' && s.movement && now >= s.movement.endsAt) arrive(s, now);
  else if (s.phase === 'auction' && s.auction && now >= s.auction.endsAt) endAuction(s, now);
}

/** Aiuto del conduttore: esegue il passo predefinito della fase corrente (giocatore assente) */
function autoStep(s: GameState, now: number): void {
  const p = currentPlayer(s);
  if (!p) fail('Nessun giocatore di turno');
  pushLog(s, `Il conduttore fa proseguire il gioco per ${p.name}.`, 'host', p.id);
  switch (s.phase) {
    case 'turn_start':
    case 'jail':
      rollDice(s, p, now);
      return;
    case 'buy_decision':
      if (s.pending?.kind === 'buy') startAuction(s, s.pending.square, now);
      return;
    case 'resolving':
      if (s.pending?.kind === 'rent') payRent(s, p, now);
      else if (s.pending?.kind === 'expense') {
        const pend = s.pending;
        s.pending = null;
        chargePlayer(s, p, [{ to: 'bank', amount: pend.amount, reason: pend.reason, category: pend.square != null ? 'tax' : 'card', square: pend.square }], { kind: 'finish' }, now);
      } else fail('Valuta la risposta della sfida con i pulsanti dedicati');
      return;
    case 'card_draw':
      executeCard(s, p, now);
      return;
    case 'turn_end':
      advanceTurn(s, now);
      return;
    case 'auction':
      endAuction(s, now);
      return;
    case 'debt':
      fail('Il giocatore ha un debito: usa «Dichiara bancarotta» se non può saldarlo');
    // eslint-disable-next-line no-fallthrough
    default:
      fail('Nessun passo automatico disponibile ora');
  }
}

