import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { usePrefs } from '../hooks';
import { tokenDef } from '../format';

export function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ pulsanti

type Variant = 'primary' | 'secondary' | 'danger' | 'gold' | 'ghost';

export function Button(props: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  size?: 'md' | 'lg' | 'sm';
  disabled?: boolean;
  busy?: boolean;
  block?: boolean;
  title?: string;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const { children, onClick, variant = 'primary', size = 'md', disabled, busy, block, title, type = 'button', className } = props;
  return (
    <button
      type={type}
      className={cls('btn', `btn--${variant}`, `btn--${size}`, block && 'btn--block', busy && 'is-busy', className)}
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ finestre

export function Modal(props: { children: ReactNode; onClose?: () => void; title?: string; wide?: boolean; label?: string; tone?: 'plain' | 'felt' }) {
  const { children, onClose, title, wide, label, tone = 'plain' } = props;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const node = (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label ?? title} className={cls('modal', wide && 'modal--wide', `modal--${tone}`)}>
        {(title || onClose) && (
          <div className="modal__head">
            <h3>{title}</h3>
            {onClose && (
              <button className="modal__close" onClick={onClose} aria-label="Chiudi">
                ✕
              </button>
            )}
          </div>
        )}
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
  // Portale sul corpo della pagina: dentro il tabellone (contenitore con contenimento) una finestra "fixed" resterebbe intrappolata
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}

// ------------------------------------------------------------------ pedine

export function Pawn(props: { token: string; size?: 'xs' | 'sm' | 'md' | 'lg'; ring?: boolean; dim?: boolean; title?: string }) {
  const t = tokenDef(props.token);
  return (
    <span className={cls('pawn', `pawn--${props.size ?? 'md'}`, props.dim && 'pawn--dim')} style={{ '--pc': t.color } as CSSProperties} title={props.title ?? t.label} aria-label={t.label} role="img">
      {t.emoji}
    </span>
  );
}

export function Chip(props: { children: ReactNode; tone?: 'ok' | 'danger' | 'warn' | 'info' | 'gold' | 'plain'; title?: string }) {
  return (
    <span className={cls('chip', `chip--${props.tone ?? 'plain'}`)} title={props.title}>
      {props.children}
    </span>
  );
}

// ------------------------------------------------------------------ dadi

const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export function DiceFace({ value, rolling, size = 'md' }: { value: number; rolling?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={cls('die', `die--${size}`, rolling && 'die--rolling')} role="img" aria-label={`Dado: ${value}`}>
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={cls('die__pip', PIPS[value]?.includes(i) && 'die__pip--on')} />
      ))}
    </span>
  );
}

/** Coppia di dadi: durante `rolling` le facce cambiano in fretta, poi mostrano il risultato */
export function DicePair({ dice, rolling, size = 'md' }: { dice: [number, number] | null; rolling: boolean; size?: 'sm' | 'md' | 'lg' }) {
  const [shown, setShown] = useState<[number, number]>(dice ?? [1, 1]);
  useEffect(() => {
    if (!rolling) {
      if (dice) setShown(dice);
      return;
    }
    const id = setInterval(() => setShown([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]), 90);
    return () => clearInterval(id);
  }, [rolling, dice]);
  if (!dice && !rolling) return null;
  return (
    <span className="dice-pair">
      <DiceFace value={shown[0]} rolling={rolling} size={size} />
      <DiceFace value={shown[1]} rolling={rolling} size={size} />
    </span>
  );
}

// ------------------------------------------------------------------ codice QR

export function QrImage({ text, size = 280, label }: { text: string; size?: number; label?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#164735', light: '#ffffff' }, errorCorrectionLevel: 'M' })
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(''));
    return () => {
      alive = false;
    };
  }, [text, size]);
  return src ? <img className="qr" src={src} width={size} height={size} alt={label ?? 'Codice QR per unirsi alla partita'} /> : <div className="qr qr--empty" style={{ width: size, height: size }} />;
}

// ------------------------------------------------------------------ varie

export function PrefsMenu() {
  const { prefs, setTheme, setMotion, setSound } = usePrefs();
  const [open, setOpen] = useState(false);
  return (
    <div className="prefs">
      <button className="btn btn--ghost btn--sm" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Aspetto e animazioni">
        🎨
      </button>
      {open && (
        <div className="prefs__pop" role="menu">
          <div className="small muted">Tema</div>
          <div className="seg">
            {(['auto', 'light', 'dark'] as const).map((t) => (
              <button key={t} className={cls('seg__btn', prefs.theme === t && 'is-on')} onClick={() => setTheme(t)}>
                {t === 'auto' ? 'Auto' : t === 'light' ? '☀️ Chiaro' : '🌙 Scuro'}
              </button>
            ))}
          </div>
          <div className="small muted">Animazioni</div>
          <div className="seg">
            {(['auto', 'reduced', 'full'] as const).map((m) => (
              <button key={m} className={cls('seg__btn', prefs.motion === m && 'is-on')} onClick={() => setMotion(m)}>
                {m === 'auto' ? 'Auto' : m === 'reduced' ? 'Ridotte' : 'Piene'}
              </button>
            ))}
          </div>
          <div className="small muted">Suoni</div>
          <div className="seg">
            {(['on', 'off'] as const).map((s) => (
              <button key={s} className={cls('seg__btn', prefs.sound === s && 'is-on')} onClick={() => setSound(s)}>
                {s === 'on' ? '🔊 Attivi' : '🔇 Muti'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function LinkBadge({ link, hostOnline }: { link: 'connecting' | 'online' | 'offline'; hostOnline?: boolean }) {
  if (link === 'offline') return <Chip tone="danger">Senza connessione</Chip>;
  if (link === 'connecting') return <Chip tone="warn">Connessione…</Chip>;
  if (hostOnline === false) return <Chip tone="warn">In attesa del conduttore</Chip>;
  return <Chip tone="ok">Collegato</Chip>;
}

export function Countdown({ endsAt, hostNow, totalMs, paused }: { endsAt: number; hostNow: number; totalMs: number; paused?: number | null }) {
  const ref = paused ?? hostNow;
  const left = Math.max(0, endsAt - ref);
  const pct = Math.max(0, Math.min(100, (left / totalMs) * 100));
  const secs = Math.ceil(left / 1000);
  return (
    <div className={cls('countdown', secs <= 5 && 'countdown--low')} role="timer" aria-label={`${secs} secondi rimasti`}>
      <div className="countdown__bar">
        <div className="countdown__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="countdown__num mono">{secs}s</div>
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="empty-note">{children}</div>;
}
