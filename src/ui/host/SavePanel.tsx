import { useState } from 'react';
import { GAME_NAME } from '../../config/game.config';
import { exportGameJson } from '../../net/persist';
import type { HostController } from '../../net/host';
import type { TransportKind } from '../../net/protocol';
import { Button } from '../components/common';
import { fmtTime } from '../format';
import { navigate } from '../router';

export function SavePanel({ ctl, kind, saved, onError }: { ctl: HostController; kind: TransportKind; saved: number | null; onError: (m: string) => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const download = () => {
    const state = ctl.fullState();
    const blob = new Blob([exportGameJson(state, kind)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${GAME_NAME.toLowerCase()}-${state.roomCode}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="hgrid">
      <section className="card stack">
        <h2>Salvataggio e ripristino</h2>
        <p>
          La partita viene salvata automaticamente su questo dispositivo dopo ogni mossa{saved ? ` (ultimo salvataggio alle ${fmtTime(saved)})` : ''}. Se la pagina si aggiorna o il browser si chiude, riaprila dal pannello del conduttore e scegli «Riprendi»: i giocatori
          si ricollegano da soli.
        </p>
        <div className="row wrap">
          <Button
            variant="secondary"
            onClick={() => {
              if (ctl.saveNow()) setMsg('Partita salvata su questo dispositivo.');
              else onError('Salvataggio non riuscito (memoria del browser piena?).');
            }}
          >
            💾 Salva ora
          </Button>
          <Button variant="secondary" onClick={download}>
            ⬇ Esporta la partita (file JSON)
          </Button>
        </div>
        {msg && <div className="pos">{msg}</div>}
        <p className="small muted">Il file può essere importato da «Pannello del conduttore → Importa una partita» anche su un altro dispositivo. L’importazione crea una nuova stanza e mette la partita in pausa.</p>
      </section>
      <section className="card stack">
        <h2>Fine sessione</h2>
        <p className="small muted">Quando tutti hanno finito, puoi chiudere la stanza. Con Firebase puoi anche cancellare i dati della stanza dal database.</p>
        {kind === 'firebase' && (
          <Button
            variant="danger"
            onClick={() => {
              if (window.confirm('Cancellare la stanza dal database online? I giocatori non potranno più rientrare.')) {
                ctl
                  .destroyRoom()
                  .then(() => setMsg('Stanza cancellata dal database.'))
                  .catch(() => onError('Impossibile cancellare la stanza.'));
              }
            }}
          >
            Cancella la stanza dal database
          </Button>
        )}
        <Button variant="secondary" onClick={() => navigate('/host')}>
          Torna al pannello iniziale
        </Button>
      </section>
    </div>
  );
}
