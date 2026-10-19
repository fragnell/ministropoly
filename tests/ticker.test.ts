import { describe, expect, it } from 'vitest';
import { startTicker } from '../src/net/ticker';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('Metronomo del conduttore', () => {
  it('batte a intervalli regolari e si ferma quando richiesto (in Node ricade su setInterval)', async () => {
    let n = 0;
    const stop = startTicker(20, () => n++);
    await wait(210);
    stop();
    const seen = n;
    expect(seen).toBeGreaterThanOrEqual(5);
    await wait(100);
    expect(n).toBe(seen); // dopo lo stop non batte più
  });
});
