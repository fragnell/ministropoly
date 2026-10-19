/**
 * Timer che continua a scorrere regolarmente anche quando la scheda del browser è in secondo piano.
 *
 * I browser rallentano i `setInterval` delle schede nascoste (a una volta al secondo e, dopo qualche
 * minuto, anche a una volta al minuto): il conduttore, che fa avanzare dadi, movimenti, aste e giocatori
 * virtuali con un timer, rischierebbe di "congelare" la partita se la sua scheda finisse dietro un'altra.
 * Un Web Worker non è soggetto a questo rallentamento: il worker fa solo da metronomo e invia un
 * messaggio a ogni battito. Se i worker non sono disponibili (test in Node, impostazioni restrittive)
 * si ricade su un normale `setInterval`.
 *
 * Restituisce la funzione che ferma il timer.
 */
export function startTicker(everyMs: number, callback: () => void): () => void {
  try {
    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const ms = Math.max(10, Math.floor(everyMs));
      const url = URL.createObjectURL(new Blob([`setInterval(function () { postMessage(0); }, ${ms});`], { type: 'text/javascript' }));
      const worker = new Worker(url);
      worker.onmessage = () => callback();
      // se il worker non riesce a partire (es. regole di sicurezza della pagina) si passa al timer normale
      let fallback: ReturnType<typeof setInterval> | null = null;
      worker.onerror = () => {
        worker.terminate();
        if (!fallback) fallback = setInterval(callback, everyMs);
      };
      return () => {
        worker.terminate();
        URL.revokeObjectURL(url);
        if (fallback) clearInterval(fallback);
      };
    }
  } catch {
    /* ambiente senza worker: si usa il timer normale */
  }
  const id = setInterval(callback, everyMs);
  return () => clearInterval(id);
}
