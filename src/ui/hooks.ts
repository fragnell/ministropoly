import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameState, LedgerEntry, LogEntry } from '../engine/types';
import { sfxCard, sfxDice, sfxJail, sfxMove } from './sound';

/** Ciò che le schermate hanno bisogno di conoscere della partita, indipendentemente da chi la mostra */
export interface GameView {
  state: GameState;
  log: LogEntry[];
  ledger: LedgerEntry[];
  /** orario (stimato) del conduttore */
  hostNow: () => number;
}

/** Aggiorna il componente a intervalli regolari e restituisce l'orario del conduttore (ms) */
export function useHostNow(hostNow: () => number, intervalMs = 100): number {
  const [t, setT] = useState(() => hostNow());
  useEffect(() => {
    const id = setInterval(() => setT(hostNow()), intervalMs);
    return () => clearInterval(id);
  }, [hostNow, intervalMs]);
  return t;
}

// ------------------------------------------------------------------ preferenze (tema, animazioni)

export type ThemePref = 'auto' | 'light' | 'dark';
export type MotionPref = 'auto' | 'reduced' | 'full';
export type SoundPref = 'on' | 'off';

interface Prefs {
  theme: ThemePref;
  motion: MotionPref;
  sound: SoundPref;
}

const PREFS_KEY = 'pp:prefs';

function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return { theme: p.theme ?? 'auto', motion: p.motion ?? 'auto', sound: p.sound ?? 'on' };
  } catch {
    return { theme: 'auto', motion: 'auto', sound: 'on' };
  }
}

export function applyPrefs(p: Prefs): void {
  const root = document.documentElement;
  if (p.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', p.theme);
  if (p.motion === 'auto') root.removeAttribute('data-motion');
  else root.setAttribute('data-motion', p.motion);
}

/** notifica le altre istanze di usePrefs montate nella stessa pagina (es. console del conduttore + tabellone incorporato) */
const PREFS_EVENT = 'pp:prefs-changed';

export function usePrefs(): {
  prefs: Prefs;
  setTheme: (t: ThemePref) => void;
  setMotion: (m: MotionPref) => void;
  setSound: (s: SoundPref) => void;
} {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  useEffect(() => applyPrefs(prefs), [prefs]);
  useEffect(() => {
    const onChange = (e: Event) => setPrefs((e as CustomEvent<Prefs>).detail);
    window.addEventListener(PREFS_EVENT, onChange);
    return () => window.removeEventListener(PREFS_EVENT, onChange);
  }, []);
  const save = useCallback((next: Prefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignora */
    }
    window.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: next }));
  }, []);
  return {
    prefs,
    setTheme: (theme) => save({ ...prefs, theme }),
    setMotion: (motion) => save({ ...prefs, motion }),
    setSound: (sound) => save({ ...prefs, sound }),
  };
}

export function prefersReducedMotion(): boolean {
  const attr = document.documentElement.getAttribute('data-motion');
  if (attr === 'reduced') return true;
  if (attr === 'full') return false;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** Richiede lo schermo intero (utile per la TV) */
export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non supportato */
  }
}

/** Impedisce che lo schermo si spenga (smartphone/TV) quando il browser lo consente */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const req = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        if (nav.wakeLock && document.visibilityState === 'visible') {
          const l = await nav.wakeLock.request('screen');
          if (cancelled) void l.release();
          else lock = l;
        }
      } catch {
        /* non disponibile */
      }
    };
    void req();
    const onVis = () => void req();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => {});
    };
  }, [enabled]);
}

/** Riproduce gli effetti sonori della partita osservando i contatori di stato (dadi, movimento, carte, prigione) */
export function useGameSfx(view: GameView, enabled: boolean): void {
  const prev = useRef<{ roll: number; move: number; card: number; jailSeq: number } | null>(null);
  useEffect(() => {
    const st = view.state;
    const jailSeq = st.log.slice(-5).reduce((max, e) => (e.kind === 'jail' && e.seq > max ? e.seq : max), 0);
    const next = { roll: st.counters.roll, move: st.counters.move, card: st.counters.card, jailSeq };
    const p = prev.current;
    prev.current = next;
    if (!enabled || !p) return;
    if (next.roll !== p.roll) sfxDice();
    if (next.move !== p.move) sfxMove();
    if (next.card !== p.card) sfxCard();
    if (next.jailSeq !== p.jailSeq) sfxJail();
  }, [view.state, enabled]);
}
