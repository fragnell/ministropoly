# MINISTROPOLY (nome alternativo: PREDICANDOPOLY)

Gioco di società **multiplayer in tempo reale** per famiglie e ragazzi, ispirato alle meccaniche generali dei giochi di compravendita e sviluppo dei territori e ambientato nella vita e nel ministero cristiano. Tutta l'interfaccia è in italiano.

Si gioca con **tre tipi di schermo**:

| Ruolo | Dispositivo | Che cosa fa |
|---|---|---|
| **Schermo principale** | TV o tablet (16:9) | Mostra il tabellone, le pedine, i saldi, le aste, le carte, le sfide e la cronologia. Sola lettura. |
| **Giocatore** | Smartphone personale | Controller: lancio dei dadi, acquisti, aste, scambi, sviluppi, ipoteche, debiti, dashboard economica. |
| **Conduttore** | Computer o tablet | Arbitro tecnico: crea la stanza, imposta la partita, convalida ogni azione, sospende/riprende, valuta le sfide, salva e ripristina. **Non è un giocatore.** |

> Le «Ore» sono una valuta fittizia del gioco. Punteggi e vittoria sono un risultato esclusivamente ludico e non dicono nulla della vita reale né della spiritualità di nessuno.

---

## 1. Avvio rapido

Servono **Node.js 20 o successivo** (testato con Node 24) e npm. Browser supportati: Chrome/Edge, Safari 16+ (iPhone/iPad), Firefox recenti (uscite dal 2023 in poi).

```bash
npm install
```

### A) Demo locale (1 minuto, nessuna configurazione)

Tutto nello stesso browser, su schede o finestre diverse: ideale per provare il gioco da soli.

```bash
npm run dev
```

1. Apri `http://localhost:5173` → **Sono il conduttore** → **Prova subito la demo** (crea una stanza con due giocatori virtuali).
2. Dal pannello del conduttore premi **Apri schermo TV** (si apre il tabellone in una nuova scheda).
3. In un'altra scheda apri il link giocatori (pulsante «Copia link giocatori») ed entra con nickname e pedina.
4. Per un secondo giocatore umano nello stesso browser aggiungi `&as=2` al link (`#/join/CODICE?t=local&as=2`). Vale per tutte le modalità: con Firebase ogni valore di `as` ottiene anche un utente anonimo diverso.
5. Il conduttore preme **Avvia la partita**.

> **Consiglio.** Per la prova su un solo computer è meglio usare **finestre separate affiancate** (trascina una scheda fuori dalla barra per farne una finestra) invece di tante schede nella stessa finestra. Il conduttore ha comunque un metronomo su Web Worker che non rallenta quando la sua scheda è in secondo piano, ma tenere visibile la finestra del conduttore (non ridotta a icona e non del tutto coperta) è la scelta più sicura, soprattutto con le funzioni di risparmio energia/memoria del browser.

### B) Rete locale / Wi-Fi di casa (consigliata per giocare davvero)

Telefoni, TV e computer sulla **stessa rete Wi-Fi**. Non servono account né internet.

```bash
npm run lan
```

Il comando compila l'app e avvia un piccolo server (`server/relay.mjs`) che serve la pagina e inoltra i messaggi tra il conduttore e i giocatori. Mostra gli indirizzi da usare, per esempio:

```
Su questo computer:           http://localhost:8787
Dai telefoni (stesso Wi-Fi):  http://192.168.1.20:8787
```

1. Sul computer del conduttore apri l'indirizzo e scegli **Pannello del conduttore → Rete locale (Wi-Fi) → Crea una nuova partita**.
2. L'app propone da sola l'indirizzo di rete (192.168.x.x) per il **QR code**: i telefoni lo inquadrano ed entrano.
3. Sulla TV (o sul tablet) apri il link con **Apri schermo TV** (oppure vai su `http://IP:8787` → *Schermo TV* e scrivi il codice).
4. Se il firewall di Windows chiede il permesso per Node.js, consenti l'accesso alle **reti private**.

La porta si cambia con la variabile `PORT` (`PORT=9000 npm run relay`).

### C) Online con Firebase (reti diverse, via internet)

Vedi la sezione [Firebase](#4-firebase-modalità-online). Con Firebase l'app può essere pubblicata su GitHub Pages o Firebase Hosting.

---

## 2. Procedura per provare una partita completa con almeno due dispositivi

1. **Conduttore** (computer): crea la stanza (modalità *Rete locale* o *Firebase*), tieni la pagina aperta per tutta la partita.
2. **TV**: apri «Apri schermo TV». Compare il tabellone con QR code e codice stanza.
3. **Telefono 1 e telefono 2**: inquadra il QR (o vai su *Sono un giocatore* e digita il codice), scegli nickname e pedina.
4. Il conduttore (facoltativo) imposta saldo iniziale, durata delle aste, espansioni (*Publisher Power Pack*, *Kids Power Pack*) e partita a tempo, poi **Avvia la partita**.
5. Il giocatore di turno preme **Lancia i dadi** dal telefono: la TV mostra i dadi e la pedina avanza casella per casella su tutti gli schermi.
6. Prova nell'ordine: **acquisto** di una via → **rifiuto** (parte l'asta, offri dal secondo telefono) → **contributo** sulla proprietà dell'altro → completamento di un **gruppo** e **sviluppo** (scheda *Proprietà*) → **scambio** (scheda *Scambi*) → **carta** Probabilità/Imprevisti → **ipoteca** → **debito e bancarotta**.
7. **Ricarica** la pagina di un telefono: il giocatore ritrova subito il proprio posto. **Ricarica** la pagina del conduttore: la partita riparte dal salvataggio, in pausa; premi **Riprendi**.
8. Chiudi con l'ultimo giocatore rimasto (o *Termina la partita* dal pannello del conduttore).

---

## 3. Regole implementate

Tutti i numeri sono in `src/config/` e si possono cambiare senza toccare il motore (vedi [Configurazione](#5-configurazione)).

**Tabellone**: 40 caselle (0–39) sul perimetro di una griglia 11 × 11, percorso orario con la Sala del Regno (casella 0) nell'angolo inferiore destro. Il motore e i test verificano numero, indici e coordinate.

**Economia**: 1.500 Ore iniziali; 200 Ore passando o arrivando alla Sala del Regno (non quando si va alla Pausa organizzativa). Ogni variazione di saldo passa da un **unico punto** (`transfer`) e produce una voce nel **registro economico** con data/ora, pagante, destinatario, causale, proprietà collegata, saldo prima e dopo.

**Proprietà**: 22 vie in 8 gruppi di colore, 4 servizi speciali, 2 servizi con contributo a dadi.
- Via non sviluppata: `R`; gruppo completo senza sviluppi: `2 × R`; con 1/2/3/4 visite ulteriori: `4/10/20/35 × R`; con studio biblico: `50 × R`.
- Servizi speciali: 20 / 45 / 90 / 180 Ore in base a quanti ne possiede il proprietario.
- Servizi a dadi: `4 ×` (uno posseduto) o `10 ×` (entrambi) la somma dei dadi.
- Il contributo è **mostrato prima di pagare** (con la formula) e calcolato solo dal motore, mai dai componenti grafici.

**Sviluppi**: gruppo completo e senza ipoteche; **distribuzione uniforme** (massimo una visita di differenza tra le proprietà del gruppo); studio biblico solo dopo 4 visite (le 4 visite tornano alla banca); **segnalini limitati**: 32 visite ulteriori e 12 studi biblici.

**Acquisto e aste**: su una proprietà libera si può acquistare o rifiutare; il rifiuto avvia un'**asta in tempo reale** aperta a tutti i giocatori in gioco (offerta minima 10, incremento 10, conto alla rovescia configurabile, inizialmente 20 s, che riparte a ogni offerta; chi passa non rientra; senza offerte la proprietà resta libera).

**Scambi**: proprietà e Ore in entrambe le direzioni, proposta/accettazione/rifiuto/ritiro/**controproposta**, schermata riepilogativa a due colonne, esecuzione **atomica**. Non si scambiano proprietà ipotecate o di un gruppo con sviluppi (si vendono prima gli sviluppi alla banca) e non durante un'asta.

**Ipoteche**: 50% del prezzo (arrotondato per difetto); riscatto +10%; una proprietà ipotecata non produce contributi. Gli sviluppi si vendono alla banca al 50%.

**Debiti e bancarotta**: se non si può pagare si apre la procedura di debito (vendi sviluppi, ipoteca, scambia); il debito si salda da solo non appena le Ore bastano. Se non è possibile saldarlo si dichiara la bancarotta: verso un giocatore passano al creditore Ore e proprietà (gli sviluppi vengono prima venduti alla banca al 50%); verso la banca le proprietà tornano libere.

**Pausa organizzativa** (casella 10): si arriva dalla casella 30, da carte o con 3 doppi consecutivi (senza premio di partenza). Si esce pagando 50 Ore, con un doppio entro 3 tentativi, con la carta dedicata; al 3° tentativo fallito si pagano 50 Ore e ci si muove.

**Carte**: due mazzi da 16 (*Probabilità*: 12 positive + 4 negative; *Imprevisti*: 9 positive + 7 negative — proporzione vicina al Monopoly classico), dati strutturati in `src/config/cards.ts`, con effetti **realmente eseguiti** dal motore (Ore, spostamenti, Pausa, carte conservate, sconti, spese per sviluppo ecc.).

**Espansioni facoltative** (`src/config/challenges.ts`): *Publisher Power Pack* (37 domande/scenari per adulti) e *Kids Power Pack* (38 domande per bambini), con testi originali, categoria, difficoltà, risposta attesa, spiegazione e riferimento biblico. Sul contributo il giocatore può scegliere la **sfida**: se risponde correttamente il contributo è annullato. **La valutazione spetta al proprietario o al conduttore: nessuna IA giudica risposte religiose.**

**Schermo principale**: oltre al tabellone, al centro ci sono i collegamenti rapidi **Banca** (patrimoni e ultime transazioni), **Proprietà** (collezione e valore di ogni giocatore + proprietà libere), **Aste** e **Scambi**; toccando una casella si apre la sua scheda dettagliata (anche con il contributo attuale e la formula applicata).

**Vittoria**: ultimo giocatore non in bancarotta, oppure — con la **partita a tempo** (45/60/90 minuti) — patrimonio più alto a fine giro (Ore + prezzo delle proprietà + metà del prezzo se ipotecate + 50% dei costi degli sviluppi).

---

## 4. Firebase (modalità online)

> **Stato della verifica.** Il trasporto Firebase e le regole di sicurezza sono stati provati contro gli **emulatori ufficiali** (Realtime Database + Authentication, `firebase-tools@13.35.1`, Java 17): ingresso dei giocatori, sincronizzazione di stato/azioni/registro, presenza, riconnessione, cancellazione della stanza e **6 tentativi di abuso respinti dalle regole** (scrivere lo stato, scrivere il registro, inviare azioni a nome di altri, leggere le richieste altrui, rubare il ruolo di conduttore, cancellare la stanza). **Non è stato provato contro un progetto Firebase reale**: la prima prova con il tuo progetto va fatta seguendo la procedura qui sotto.

### 4.1 Creare e configurare il progetto

1. Vai su <https://console.firebase.google.com> → **Aggiungi progetto**.
2. **Build → Authentication → Metodo di accesso** → abilita **Anonimo**.
3. **Build → Realtime Database → Crea database** (scegli la regione, avvia in modalità *bloccata*).
4. **Impostazioni progetto → Le tue app → Web (`</>`)** → registra l'app e copia la configurazione.
5. Copia `.env.example` in `.env` e compila:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_DATABASE_URL=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
```

6. Pubblica le **regole di sicurezza** (file `database.rules.json`):

```bash
npx firebase-tools login
npx firebase-tools use --add          # scegli il tuo progetto
npx firebase-tools deploy --only database
```

(oppure incolla il contenuto di `database.rules.json` in *Realtime Database → Regole* nella console).

7. `npm run dev` oppure `npm run build`: nel pannello del conduttore la scheda **Online (Firebase)** diventa selezionabile.

La configurazione Web di Firebase **non è un segreto** (finisce comunque nel browser): la sicurezza dei dati dipende dalle **regole**. Non inserire mai chiavi di servizio (`service account`) nel progetto.

### 4.2 Configurazione senza ricompilare (facoltativa)

Invece del file `.env` puoi compilare `public/config.js` (viene copiato nella cartella pubblicata come `config.js`): togli i commenti a `window.PP_FIREBASE_CONFIG = { ... }` e inserisci i dati del progetto. Se presente, ha la precedenza sul `.env`: utile per cambiare progetto senza ricompilare l'app.

### 4.3 Struttura dei dati e sicurezza

```
rooms/{CODICE}/meta      {hostUid, createdAt}     creato dal conduttore
rooms/{CODICE}/state     stringa JSON             scritta SOLO dal conduttore
rooms/{CODICE}/log/...   stringhe JSON            registro eventi (solo conduttore)
rooms/{CODICE}/ledger/...stringhe JSON            registro economico (solo conduttore)
rooms/{CODICE}/beat      orario del server        battito del conduttore
rooms/{CODICE}/actions/{id}  richieste dei giocatori: solo creazione, con uid = utente autenticato;
                              leggibili e cancellabili solo dal conduttore
rooms/{CODICE}/presence/{uid}  presenza di ogni dispositivo (scrive solo il proprietario)
```

- Chi gioca ha un **utente anonimo** Firebase: nessun account da creare.
- **Nessun giocatore può scrivere saldi, proprietà o stato**: gli smartphone possono solo *chiedere* azioni; il dispositivo del conduttore le valida con il motore delle regole e pubblica il nuovo stato.
- Stato e registri sono salvati come **stringhe JSON** per evitare le trasformazioni di Realtime Database su array e oggetti vuoti.
- A fine serata puoi cancellare la stanza dal database dalla scheda **Salvataggio → Cancella la stanza dal database**.

### 4.4 Provare Firebase in locale con gli emulatori

Serve Java (17 o superiore per `firebase-tools@13`; le versioni più recenti della CLI richiedono Java 21+). La prima volta vengono scaricati gli emulatori.

```bash
npm run emulators
```

In un altro terminale i test contro gli emulatori partono da soli (se gli emulatori non rispondono vengono saltati):

```bash
npx vitest run tests/firebase-emulator.test.ts
```

Per usare l'app stessa con gli emulatori aggiungi a `.env`: `VITE_FIREBASE_USE_EMULATOR=1` (con valori qualsiasi per le altre variabili, es. `demo-key` e `demo-ministropoly`).

### 4.5 Pubblicazione

- **GitHub Pages**: il file `.github/workflows/pages.yml` compila e pubblica automaticamente (Settings → Pages → *Source: GitHub Actions*). Aggiungi come *secrets* le cinque variabili `VITE_FIREBASE_*`. L'app usa un router basato sull'hash e percorsi relativi, quindi funziona anche in una sottocartella (`https://utente.github.io/repository/`). Su Pages **non** è disponibile la modalità *Rete locale* (serve il server incluso).
- **Firebase Hosting**: `npm run build` poi `npx firebase-tools deploy --only hosting` (il file `firebase.json` pubblica la cartella `dist`).

---

## 5. Configurazione

| Cosa cambiare | Dove |
|---|---|
| **Nome del gioco** (MINISTROPOLY ↔ PREDICANDOPOLY) | `src/config/game.config.ts` (`GAME_NAME`) oppure `VITE_GAME_NAME` nel file `.env` |
| Saldo iniziale, premio di partenza, multa, costo ipoteca, tempi dell'asta, segnalini, moltiplicatori dei contributi | `src/config/game.config.ts` (`ECONOMY`) |
| **Colori dei gruppi**, costo di visite/studi per gruppo | `src/config/game.config.ts` (`GROUPS`) |
| Pedine e colori dei giocatori, nomi dei giocatori virtuali | `src/config/game.config.ts` (`TOKENS`, `BOT_NAMES`) |
| Durata di animazioni e movimento | `src/config/game.config.ts` (`TIMING`) |
| **Prezzi e contributi base** delle vie, nomi, ordine delle caselle | `src/config/board.ts` |
| **Carte** Probabilità e Imprevisti | `src/config/cards.ts` (aggiungi un oggetto all'array: l'effetto è uno dei tipi già supportati) |
| **Domande** delle espansioni | `src/config/challenges.ts` |
| Tema grafico (colori principali) | `src/ui/styles/tokens.css` |

Le interfacce leggono sempre da questi file: nessun valore economico è duplicato nei componenti.

> **Revisione dei contenuti.** Le domande e i riferimenti biblici sono originali e riportano il passo della *Traduzione del Nuovo Mondo* (consultabile su jw.org e wol.jw.org); non riproducono carte commerciali. Le «risposte attese» degli scenari sono indicative. Prima di usare le espansioni con un gruppo, fai verificare i testi da una persona responsabile e, se vuoi documentarli, aggiungi nel campo `source` il riferimento a una pubblicazione ufficiale.

---

## 6. Salvataggio, ripristino e riconnessione

- Il conduttore salva **automaticamente** la partita nel browser dopo ogni mossa. Se la pagina si aggiorna o il browser si chiude, riaprila dal pannello del conduttore e scegli **Riprendi**: la partita riparte in **pausa** (i conti alla rovescia non scorrono mentre il conduttore era assente) e i giocatori si ricollegano da soli.
- **Esporta** la partita in un file JSON (*Salvataggio → Esporta*) e **importala** su un altro dispositivo (*Importa una partita da file…*): crea una nuova stanza e i giocatori riprendono il proprio posto scegliendo il nome.
- Un giocatore che ricarica la pagina o torna online ritrova subito il suo posto (identità anonima del dispositivo). Se cambia dispositivo, a partita avviata sceglie il proprio nome tra i posti scollegati (il conduttore può anche *liberare un posto*).
- Il conduttore deve restare collegato: è lui l'autorità della partita. Se si scollega, i telefoni mostrano «Il conduttore non è collegato» e riprendono da soli al suo ritorno.

---

## 7. Test

```bash
npm test            # tutti i test (motore, simulazioni, rete, schermate)
npm run typecheck   # controllo dei tipi
```

| File | Che cosa verifica |
|---|---|
| `tests/board-and-economy.test.ts` | 40 caselle, coordinate, gruppi, prezzi, movimento, premio di partenza, acquisto/asta, contributi (tutti i livelli), servizi, sviluppi, segnalini, ipoteche |
| `tests/rules-advanced.test.ts` | Effetti di **tutte le 32 carte**, Pausa organizzativa, scambi, debiti, bancarotta, vittoria, sfide, pausa, modalità rapida, idempotenza, ingressi |
| `tests/simulation.test.ts` | **30 partite complete** giocate da bot con più giocatori: dopo ogni passo si controllano saldi non negativi, proprietà non duplicate, segnalini, carte e che **ogni Ora sia passata dal registro economico** |
| `tests/network.test.ts` | Sincronizzazione reale tra conduttore, 2 smartphone e TV con i trasporti **locale** (BroadcastChannel) e **rete locale** (server WebSocket vero): ingresso, autorità del conduttore, dadi, movimento, registro, riconnessione, idempotenza, **ripristino da un salvataggio più vecchio** (epoca) |
| `tests/ui-smoke.test.tsx` | Ogni schermata si disegna in ogni fase di gioco con i controlli giusti per il giocatore giusto |
| `tests/firebase-emulator.test.ts` | Trasporto Firebase e **regole di sicurezza** contro gli emulatori (si esegue solo se attivi) |

---

### Per sviluppatori

- `npm run dev` avvia Vite su <http://localhost:5173>. Per provare anche la modalità rete locale in sviluppo avvia `npm run relay` e apri la pagina con `?relay` (es. `http://localhost:5173/?relay#/host`).
- Solo in sviluppo la console del browser (pagina del conduttore) espone `window.__pp`: `__pp.host.dispatch(azione)` e `__pp.patch(s => { ... })` per costruire scenari difficili da ottenere a mano (debito, bancarotta, sfide). Nelle build di produzione questo codice non esiste.
- Il file `.claude/launch.json` contiene le configurazioni di avvio (`dev`, `relay`) usate dagli strumenti di anteprima.

## 8. Architettura

```
src/config/     dati: tabellone, carte, domande, economia (nessuna logica)
src/engine/     MOTORE DELLE REGOLE: funzione pura applyAction(stato, azione) → nuovo stato
                (nessuna dipendenza da interfaccia o rete; testabile da solo)
src/net/        protocollo, trasporti (locale / WebSocket / Firebase), controller del conduttore,
                store dei client, salvataggio
src/ui/         schermate: TV (components/), smartphone (phone/), conduttore (host/, routes/)
server/         relay.mjs: server di rete locale (serve l'app e inoltra i messaggi)
tests/          test
```

**Flusso.** Lo smartphone invia una *richiesta di azione* (con id univoco) → il **conduttore** la valida con il motore (turno, fase, saldi, regole) → se è valida pubblica il nuovo stato → TV e telefoni si aggiornano. Le richieste non valide restituiscono un messaggio al solo dispositivo interessato. Lo stato pubblicato non contiene l'ordine dei mazzi né il generatore casuale, e identifica i dispositivi con un'**impronta** non reversibile.

**Stati del motore**: lobby · turno da iniziare · dadi (`rolling`) · movimento (`moving`) · risoluzione della casella · decisione d'acquisto · asta · pesca carta · esecuzione carta · gestione debito · Pausa organizzativa · fine turno · partita terminata. Sviluppo e scambi sono modalità disponibili a inizio/fine turno.

**Sincronizzazione delle animazioni.** Il conduttore programma dadi e movimento con orari (`rollEndsAt`, `startsAt`, `endsAt`, passo per casella); ogni schermo calcola la posizione mostrata dell'orologio del conduttore (stimato dal messaggio ricevuto), quindi tutti vedono lo stesso movimento e le decisioni compaiono solo a pedina arrivata.

**Ordine degli stati e ripristini.** Ogni stato pubblicato ha `(epoch, version)`: la versione cresce a ogni cambiamento, l'epoca a ogni ripristino di una partita salvata. I client scartano gli stati più vecchi e accettano sempre quelli di un ripristino, anche se il conduttore riparte da un salvataggio precedente. Il salvataggio locale è **scritto prima di pubblicare** (e alla chiusura della pagina), quindi ciò che i giocatori hanno visto è già al sicuro.

**Prevenzione delle doppie transazioni.** Ogni azione ha un id; il conduttore ricorda gli id già elaborati (anche nello stato salvato) e le fasi del motore rendono innocue le ripetizioni (es. un secondo «Acquista»). Ogni azione viene applicata su una copia dello stato: se una regola fallisce, lo stato reale non cambia mai.

---

## 9. Limiti noti e scelte di regola

- **Il conduttore è l'autorità**: se il suo dispositivo si spegne, il gioco si ferma finché non riapre la pagina (la partita si riprende dal salvataggio locale). Non c'è migrazione automatica del ruolo su un altro dispositivo; si usa Esporta/Importa.
- **Firebase non è stato provato contro un progetto reale** (solo contro gli emulatori): vedi la sezione 4.
- **Scelte di regola dove le specifiche lasciavano margine**:
  - «Servizio speciale» nelle carte indica le 4 caselle (Opera Metropolitana Napoli, Milano, Venezia, Roma); i due servizi a dadi (Opera Portuale, Opera Penitenziaria) sono contati a parte.
  - Per ipotecare una proprietà non deve esserci alcuno sviluppo nel suo gruppo; per scambiarla neppure.
  - Vendendo uno **studio biblico** la proprietà torna a 4 visite (50% del costo dello studio); se la banca non ha 4 visite disponibili scende al numero disponibile e le visite mancanti sono rimborsate al 50%.
  - «Spesa evitata» annulla una spesa verso la banca (caselle spesa e carte che pagano alla banca), a scelta del giocatore.
  - La «sosta libera» non ha alcun effetto economico.
  - Con più creditori (carte «paga a ciascun altro giocatore») la bancarotta ripartisce le Ore in proporzione e le proprietà tornano alla banca.
  - Modalità a tempo: allo scadere si finisce il giro corrente (fino a tornare al primo giocatore dell'ordine di turno).
- Le animazioni si possono **ridurre** (icona 🎨 → Animazioni) e il tema può essere chiaro, scuro o automatico.
- I segnalini di sviluppo sono quadratini verdi (visite) e un libro (studio biblico); i gruppi hanno anche **numero e simbolo** oltre al colore, per chi distingue male i colori.
- Su **iPhone/Safari** il blocco dello schermo non può essere impedito in tutti i casi: se il telefono si spegne, il giocatore ritrova il posto riaprendo la pagina.
