import { useEffect } from 'react';
import { GAME_NAME } from '../config/game.config';
import { applyPrefs, usePrefs } from './hooks';
import { useRoute } from './router';
import { HostConsole } from './routes/HostConsole';
import { HostSetup } from './routes/HostSetup';
import { Home } from './routes/Home';
import { PlayerPage } from './routes/PlayerPage';
import { TvPage } from './routes/TvPage';
import { parseTransportKind } from '../net/factory';
import { normalizeRoomCode } from '../net/protocol';

export function App() {
  const route = useRoute();
  const { prefs } = usePrefs();
  useEffect(() => applyPrefs(prefs), [prefs]);
  useEffect(() => {
    document.title = GAME_NAME;
  }, []);

  const [first, second] = route.path;
  const kind = parseTransportKind(route.query.get('t'));

  if (first === 'host') {
    if (second) return <HostConsole key={second + kind} room={normalizeRoomCode(second)} kind={kind} isNew={route.query.get('new')} fromImport={route.query.get('import') === '1'} />;
    return <HostSetup />;
  }
  if (first === 'tv' && second) return <TvPage key={second + kind} room={normalizeRoomCode(second)} kind={kind} base={route.query.get('b')} />;
  if ((first === 'join' || first === 'play') && second) return <PlayerPage key={second + kind} room={normalizeRoomCode(second)} kind={kind} />;
  return <Home />;
}
