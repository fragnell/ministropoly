import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { validateBoard } from './config/board';
import { GAME_NAME } from './config/game.config';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/board.css';
import './ui/styles/components.css';
import './ui/styles/tv.css';
import './ui/styles/phone.css';
import './ui/styles/host.css';

document.title = GAME_NAME;

// Controllo di integrità del tabellone all'avvio: 40 caselle, indici unici, coordinate coerenti
const boardErrors = validateBoard();
if (boardErrors.length) console.error('Tabellone non valido:', boardErrors);

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
