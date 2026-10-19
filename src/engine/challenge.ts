/**
 * Sfide (espansioni facoltative): alternativa al pagamento del contributo.
 * La valutazione della risposta spetta al proprietario o al conduttore: nessuna IA giudica risposte religiose.
 */
import { ALL_CHALLENGES, getChallenge, type ChallengeDef } from '../config/challenges';
import { squareLabel } from '../config/board';
import type { GameState, Player } from './types';
import { chargePlayer } from './flow';
import { pushLog } from './money';
import { getPlayer } from './selectors';
import { fail, fmt, randInt } from './util';

export function canChallenge(s: GameState): boolean {
  return s.settings.packs.publisher || s.settings.packs.kids;
}

export function pickQuestion(s: GameState, p: Player): ChallengeDef {
  const { publisher, kids } = s.settings.packs;
  let pool = ALL_CHALLENGES.filter((c) => (c.pack === 'publisher' && publisher) || (c.pack === 'kids' && kids));
  // i bambini ricevono le domande del Kids Power Pack (se attivo), gli adulti quelle del Publisher Power Pack
  const wanted = p.profile === 'kid' ? 'kids' : 'publisher';
  const preferred = pool.filter((c) => c.pack === wanted);
  if (preferred.length > 0) pool = preferred;
  if (pool.length === 0) fail('Nessun pacchetto di sfide attivo');
  let fresh = pool.filter((c) => !s.usedQuestions.includes(c.id));
  if (fresh.length === 0) {
    const poolIds = new Set(pool.map((c) => c.id));
    s.usedQuestions = s.usedQuestions.filter((id) => !poolIds.has(id));
    fresh = pool;
  }
  return fresh[randInt(s, fresh.length)];
}

export function startChallenge(s: GameState, p: Player, now: number): void {
  const pend = s.pending;
  if (pend?.kind !== 'rent') fail('Nessun contributo da sfidare');
  if (!pend.canChallenge) fail('Le sfide non sono attive in questa partita');
  const q = pickQuestion(s, p);
  s.usedQuestions.push(q.id);
  s.pending = { kind: 'challenge', square: pend.square, ownerId: pend.ownerId, amount: pend.amount, questionId: q.id, startedAt: now };
  pushLog(s, `${p.name} affronta una sfida per evitare il contributo di ${fmt(pend.amount)}.`, 'info', p.id);
}

export function judgeChallenge(s: GameState, p: Player, correct: boolean, now: number): void {
  const pend = s.pending;
  if (pend?.kind !== 'challenge') fail('Nessuna sfida da valutare');
  const owner = getPlayer(s, pend.ownerId);
  s.lastChallenge = { seq: ++s.counters.challenge, questionId: pend.questionId, playerId: p.id, ownerId: owner.id, correct, amount: pend.amount, at: s.hostTime };
  s.pending = null;
  s.phase = 'resolving';
  if (correct) {
    pushLog(s, `Risposta corretta! ${p.name} non paga il contributo per «${squareLabel(pend.square)}».`, 'info', p.id);
    return;
  }
  pushLog(s, `Risposta non corretta: ${p.name} paga il contributo di ${fmt(pend.amount)}.`, 'info', p.id);
  chargePlayer(
    s,
    p,
    [{ to: owner.id, amount: pend.amount, reason: `Contributo per ${squareLabel(pend.square)}`, category: 'rent', square: pend.square }],
    { kind: 'finish' },
    now,
  );
}

export { getChallenge };
