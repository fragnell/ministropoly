import { useCallback, useEffect, useState } from 'react';
import type { GameState, LedgerEntry, LogEntry } from '../engine/types';

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

interface Prefs {
  theme: ThemePref;
  motion: MotionPref;
}

const PREFS_KEY = 'pp:prefs';

function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>;
    return { theme: p.theme ?? 'auto', motion: p.motion ?? 'auto' };
  } catch {
    return { theme: 'auto', motion: 'auto' };
  }
}

export function applyPrefs(p: Prefs): void {
  const root = document.documentElement;
  if (p.theme === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', p.theme);
  if (p.motion === 'auto') root.removeAttribute('data-motion');
  else root.setAttribute('data-motion', p.motion);
}

export function usePrefs(): { prefs: Prefs; setTheme: (t: ThemePref) => void; setMotion: (m: MotionPref) => void } {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  useEffect(() => applyPrefs(prefs), [prefs]);
  const save = useCallback((next: Prefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignora */
    }
  }, []);
  return {
    prefs,
    setTheme: (theme) => save({ ...prefs, theme }),
    setMotion: (motion) => save({ ...prefs, motion }),
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
