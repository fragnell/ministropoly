/**
 * PACCHETTI FACOLTATIVI DI SFIDE
 * ------------------------------
 * - Publisher Power Pack: domande e scenari originali per adulti.
 * - Kids Power Pack: domande brevi e accessibili per i bambini.
 *
 * Tutti i testi sono ORIGINALI (non riprodotti da giochi commerciali).
 * I riferimenti biblici rimandano alla Traduzione del Nuovo Mondo, consultabile su jw.org e wol.jw.org.
 * Nessuna risposta viene giudicata da un'IA: la valutazione spetta al proprietario della proprietà o al conduttore.
 * Le "risposte attese" per gli scenari sono indicative: vale il buon senso dei partecipanti.
 *
 * Per aggiungere domande basta aggiungere oggetti agli array. Il campo `source` può contenere un
 * riferimento verificabile a una pubblicazione ufficiale (es. un articolo di wol.jw.org) quando
 * il gruppo vuole documentare la domanda.
 */

export type ChallengePackId = 'publisher' | 'kids';

export interface ChallengeDef {
  id: string;
  pack: ChallengePackId;
  question: string;
  category: string;
  /** 1 = facile, 2 = media, 3 = impegnativa */
  difficulty: 1 | 2 | 3;
  /** risposta attesa (indicativa per gli scenari) */
  answer: string;
  explanation: string;
  scripture?: string;
  /** fonte ufficiale verificabile (facoltativa) */
  source?: string;
}

export const BIBLE_SOURCE = 'Traduzione del Nuovo Mondo della Sacra Scrittura (jw.org / wol.jw.org)';

export const PACK_TITLES: Record<ChallengePackId, string> = {
  publisher: 'Publisher Power Pack',
  kids: 'Kids Power Pack',
};

type Q = Omit<ChallengeDef, 'pack' | 'id'>;

const publisher: Q[] = [
  { category: 'Uso delle Scritture', difficulty: 1, question: 'Quale versetto puoi leggere per mostrare che Dio ha un nome personale?', answer: 'Salmo 83:18 (anche Isaia 42:8): il nome di Dio è Geova.', explanation: 'Un versetto breve e chiaro aiuta la persona a vedere il nome direttamente nella propria Bibbia.', scripture: 'Salmo 83:18', source: BIBLE_SOURCE },
  { category: 'Conoscenza biblica', difficulty: 1, question: 'Secondo Matteo 24:14, quale opera sarebbe stata svolta prima che venga la fine?', answer: 'La buona notizia del Regno sarebbe stata predicata in tutta la terra abitata, come testimonianza a tutte le nazioni.', explanation: 'Gesù indicò un’opera mondiale di predicazione come parte del segno della sua presenza.', scripture: 'Matteo 24:14', source: BIBLE_SOURCE },
  { category: 'Conoscenza biblica', difficulty: 1, question: 'Quale testo mostra che Paolo insegnava sia in pubblico sia di casa in casa?', answer: 'Atti 20:20.', explanation: 'Paolo ricordò agli anziani di Efeso come aveva svolto il ministero con loro.', scripture: 'Atti 20:20', source: BIBLE_SOURCE },
  { category: 'Principi biblici', difficulty: 1, question: 'In Matteo 28:19, 20 quale incarico diede Gesù ai suoi discepoli?', answer: 'Fare discepoli di persone di tutte le nazioni, battezzarle e insegnare loro a osservare ciò che aveva comandato.', explanation: 'È l’incarico di base dei cristiani; Gesù aggiunse la promessa di essere con loro.', scripture: 'Matteo 28:19, 20', source: BIBLE_SOURCE },
  { category: 'Conversazioni', difficulty: 2, question: 'Filippo si avvicinò a un eunuco etiope che leggeva la Scrittura. Quale domanda gli rivolse e che cosa ne impariamo?', answer: 'Gli chiese se capiva ciò che stava leggendo. Impariamo a iniziare con una domanda semplice, legata a ciò che la persona sta già facendo o pensando.', explanation: 'Una domanda interessata invita a rispondere senza mettere a disagio.', scripture: 'Atti 8:30', source: BIBLE_SOURCE },
  { category: 'Conversazioni', difficulty: 2, question: 'Come si adattò Paolo al suo uditorio ad Atene?', answer: 'Partì da qualcosa che gli ateniesi conoscevano, un altare dedicato «a un Dio sconosciuto», per presentare il vero Dio.', explanation: 'Trovare un punto in comune aiuta le persone ad ascoltare.', scripture: 'Atti 17:22, 23', source: BIBLE_SOURCE },
  { category: 'Principi biblici', difficulty: 2, question: 'Che cosa intendeva Paolo dicendo di essere diventato «ogni cosa per persone di ogni sorta»?', answer: 'Adattava il modo di presentare il messaggio alla sensibilità, al contesto e alle necessità di chi ascoltava, senza compromettere la verità.', explanation: 'Adattarsi mostra rispetto e interesse sincero per le persone.', scripture: '1 Corinti 9:22', source: BIBLE_SOURCE },
  { category: 'Principi biblici', difficulty: 1, question: 'Che cosa raccomanda 1 Pietro 3:15 a chi deve spiegare la propria speranza?', answer: 'Farlo con mitezza e profondo rispetto, essendo sempre pronti.', explanation: 'Il tono rispettoso conta quanto il contenuto.', scripture: '1 Pietro 3:15', source: BIBLE_SOURCE },
  { category: 'Principi biblici', difficulty: 1, question: 'Secondo Colossesi 4:6, come dovrebbe essere la nostra parola?', answer: 'Sempre gradevole, condita con sale, sapendo come rispondere a ciascuno.', explanation: 'Parole gentili e ben calibrate rendono più facile il dialogo.', scripture: 'Colossesi 4:6', source: BIBLE_SOURCE },
  { category: 'Obiezioni', difficulty: 1, question: 'Secondo Proverbi 15:1, che effetto ha una risposta mite?', answer: 'Allontana l’ira, mentre una parola dura la fa aumentare.', explanation: 'Davanti a un’obiezione accesa, la calma mantiene aperto il dialogo.', scripture: 'Proverbi 15:1', source: BIBLE_SOURCE },
  { category: 'Obiezioni', difficulty: 2, question: 'Scenario: un padrone di casa dice «Ho già la mia religione». Come puoi rispondere con tatto?', answer: 'Esempio: ringraziare e rispettare la sua convinzione, spiegare che non vuoi toglierli la fede, e chiedere un parere su una domanda che interessa tutti oppure lasciargli un versetto o una domanda su cui riflettere.', explanation: 'La cortesia lascia la porta aperta a una conversazione futura.', scripture: '1 Pietro 3:15' },
  { category: 'Obiezioni', difficulty: 1, question: 'Scenario: «Non ho tempo adesso». Come rispondi?', answer: 'Esempio: mostrare comprensione, offrire un solo pensiero in un minuto oppure chiedere quando sarebbe più comodo tornare, e ringraziare.', explanation: 'Rispettare il tempo delle persone costruisce fiducia.', scripture: 'Colossesi 4:6' },
  { category: 'Obiezioni', difficulty: 3, question: 'Scenario: qualcuno chiede «Se Dio esiste, perché permette la sofferenza?». Come potresti cominciare a rispondere?', answer: 'Esempio: mostrare empatia e riconoscere che la domanda è seria; poi leggere un versetto adatto, come Rivelazione 21:3, 4 sulla promessa di Dio o Giobbe 34:10 sul fatto che Dio non è autore del male; offrire di approfondire in un’altra occasione.', explanation: 'Prima l’ascolto e la compassione, poi la Bibbia.', scripture: 'Rivelazione 21:3, 4' },
  { category: 'Uso delle Scritture', difficulty: 1, question: 'Quale testo puoi leggere per presentare la promessa di un futuro senza morte né dolore?', answer: 'Rivelazione 21:3, 4.', explanation: 'È un versetto di grande conforto, facile da leggere e da commentare.', scripture: 'Rivelazione 21:3, 4', source: BIBLE_SOURCE },
  { category: 'Principi biblici', difficulty: 1, question: 'Secondo Matteo 6:33, che cosa dovremmo cercare per prima cosa?', answer: 'Il Regno di Dio e la sua giustizia.', explanation: 'Gesù indicò l’ordine giusto delle priorità.', scripture: 'Matteo 6:33', source: BIBLE_SOURCE },
  { category: 'Principi biblici', difficulty: 1, question: 'Quale testo ci incoraggia a non trascurare di radunarci e a incoraggiarci a vicenda?', answer: 'Ebrei 10:24, 25.', explanation: 'Le adunanze ci aiutano a stimolarci all’amore e alle opere eccellenti.', scripture: 'Ebrei 10:24, 25', source: BIBLE_SOURCE },
  { category: 'Conoscenza biblica', difficulty: 2, question: 'Come vengono descritti i Bereani in Atti 17:11?', answer: 'Di mentalità più aperta: accolsero la parola con grande premura ed esaminavano le Scritture ogni giorno per verificare se le cose stavano così.', explanation: 'Verificare nella Bibbia è un atteggiamento lodevole.', scripture: 'Atti 17:11', source: BIBLE_SOURCE },
  { category: 'Uso delle Scritture', difficulty: 1, question: 'Quale testo mostra che tutta la Scrittura è utile per insegnare e correggere?', answer: '2 Timoteo 3:16, 17.', explanation: 'La Bibbia rende l’uomo di Dio pienamente competente.', scripture: '2 Timoteo 3:16, 17', source: BIBLE_SOURCE },
  { category: 'Conversazioni', difficulty: 2, question: 'Scenario: hai letto un versetto e la persona mostra interesse. Qual è un buon passo successivo?', answer: 'Ringraziare, concordare quando tornare e lasciare una domanda a cui rispondere la volta successiva; offrire una pubblicazione o un video adatto alla sua domanda.', explanation: 'Una visita ulteriore ben preparata nasce da un accordo concreto.', scripture: 'Proverbi 21:5' },
  { category: 'Principi biblici', difficulty: 2, question: 'Che cosa insegna Proverbi 21:5 sull’importanza di prepararsi?', answer: 'I piani del diligente portano al successo: preparare in anticipo domande, versetti e introduzione rende le conversazioni più efficaci.', explanation: 'La preparazione ci aiuta a essere chiari e a mettere a proprio agio chi ascolta.', scripture: 'Proverbi 21:5', source: BIBLE_SOURCE },
  { category: 'Conversazioni', difficulty: 2, question: 'Come iniziò Gesù la conversazione con la donna samaritana al pozzo?', answer: 'Con una richiesta semplice e ragionevole: le chiese da bere; da lì passò all’acqua che dà vita.', explanation: 'Partire da qualcosa di quotidiano rende naturale il passaggio a temi più profondi.', scripture: 'Giovanni 4:7-10', source: BIBLE_SOURCE },
  { category: 'Conoscenza biblica', difficulty: 1, question: 'Come inviò Gesù i 70 discepoli, secondo Luca 10:1?', answer: 'A due a due, davanti a sé, in ogni città e luogo dove stava per andare.', explanation: 'Predicare in due offre sostegno reciproco.', scripture: 'Luca 10:1', source: BIBLE_SOURCE },
  { category: 'Principi biblici', difficulty: 2, question: 'Che cosa ci insegna Filippesi 2:3, 4 per le conversazioni con gli altri?', answer: 'Agire con umiltà, considerando gli altri superiori, e interessarsi non solo dei propri interessi ma anche di quelli altrui.', explanation: 'L’interesse sincero per la persona vale più di un discorso perfetto.', scripture: 'Filippesi 2:3, 4', source: BIBLE_SOURCE },
  { category: 'Principi biblici', difficulty: 1, question: 'Che cosa dice Romani 12:15 su come comportarci con chi soffre?', answer: 'Piangere con quelli che piangono (e rallegrarsi con quelli che si rallegrano).', explanation: 'L’empatia apre il cuore alle parole di conforto.', scripture: 'Romani 12:15', source: BIBLE_SOURCE },
  { category: 'Uso delle Scritture', difficulty: 2, question: 'Che cosa dice Matteo 5:3 sulle persone felici secondo Gesù?', answer: 'Sono felici quelli che sono consapevoli del loro bisogno spirituale.', explanation: 'Riconoscere il proprio bisogno spirituale è il punto di partenza per ascoltare.', scripture: 'Matteo 5:3', source: BIBLE_SOURCE },
  { category: 'Conoscenza biblica', difficulty: 1, question: 'Secondo Giovanni 17:3, che cosa significa ottenere la vita eterna?', answer: 'Acquistare conoscenza dell’unico vero Dio e di colui che ha mandato, Gesù Cristo.', explanation: 'La conoscenza di Dio è alla base di una relazione con lui.', scripture: 'Giovanni 17:3', source: BIBLE_SOURCE },
  { category: 'Conversazioni', difficulty: 3, question: 'Scenario: un conoscente ti chiede perché non partecipi a certe ricorrenze popolari. Come puoi spiegare con rispetto?', answer: 'Esempio: spiegare con calma, senza criticare né giudicare, che è una scelta di coscienza basata sulla Bibbia; rispettare le sue scelte, ringraziare per l’invito e mostrare di apprezzare l’amicizia.', explanation: 'Un tono sereno evita contrasti e favorisce il rispetto reciproco.', scripture: '1 Pietro 3:15' },
  { category: 'Conoscenza biblica', difficulty: 1, question: 'Che cosa disse Geova al suo popolo in Isaia 43:10?', answer: '«Voi siete i miei testimoni.»', explanation: 'Il popolo di Dio ha il privilegio di rendere testimonianza a lui.', scripture: 'Isaia 43:10', source: BIBLE_SOURCE },
  { category: 'Principi biblici', difficulty: 1, question: 'Secondo Giacomo 1:19, come dobbiamo comportarci quando conversiamo?', answer: 'Pronti ad ascoltare, lenti a parlare e lenti all’ira.', explanation: 'Ascoltare con attenzione aiuta a capire le vere preoccupazioni dell’altro.', scripture: 'Giacomo 1:19', source: BIBLE_SOURCE },
  { category: 'Conoscenza biblica', difficulty: 1, question: 'Che cosa disse Gesù sulla messe in Matteo 9:37, 38?', answer: 'La messe è grande ma gli operai sono pochi; occorre pregare il Padrone della messe di mandare operai.', explanation: 'Gesù mostrò sia la necessità sia la fiducia nell’aiuto di Dio.', scripture: 'Matteo 9:37, 38', source: BIBLE_SOURCE },
  { category: 'Conoscenza biblica', difficulty: 2, question: 'Perché Romani 10:14, 15 sottolinea l’importanza di predicare?', answer: 'Per invocare il nome di Geova bisogna credere; per credere bisogna udire; per udire serve qualcuno che predichi.', explanation: 'Il ragionamento di Paolo collega fede, ascolto e predicazione.', scripture: 'Romani 10:14, 15', source: BIBLE_SOURCE },
  { category: 'Conversazioni', difficulty: 2, question: 'Scenario: dopo una prima visita vuoi mantenere vivo l’interesse. Che cosa puoi fare?', answer: 'Interessarti sinceramente della persona, ricordare ciò di cui avete parlato e tornare nel momento concordato con la risposta alla sua domanda o con un nuovo spunto.', explanation: 'La costanza e l’affetto sincero fanno crescere la fiducia.', scripture: 'Filippesi 2:4' },
  { category: 'Uso delle Scritture', difficulty: 1, question: 'Quale promessa troviamo in Salmo 37:29?', answer: 'I giusti possederanno la terra e vi dimoreranno per sempre.', explanation: 'È una promessa chiara sul futuro della terra.', scripture: 'Salmo 37:29', source: BIBLE_SOURCE },
  { category: 'Principi biblici', difficulty: 1, question: 'Quale promessa fece Gesù ai discepoli in Matteo 28:20?', answer: 'Di essere con loro tutti i giorni fino al termine del sistema di cose.', explanation: 'Chi predica non è mai solo.', scripture: 'Matteo 28:20', source: BIBLE_SOURCE },
  { category: 'Principi biblici', difficulty: 1, question: 'Perché è utile predicare insieme a un compagno (Ecclesiaste 4:9, 10)?', answer: 'Due sono meglio di uno: se uno cade, l’altro lo può rialzare; ci si sostiene a vicenda.', explanation: 'Il sostegno reciproco rende più sereno il ministero.', scripture: 'Ecclesiaste 4:9, 10', source: BIBLE_SOURCE },
  { category: 'Presentazione', difficulty: 2, question: 'Proponi una domanda iniziale che inviti la persona a dire la sua opinione su un tema quotidiano.', answer: 'Esempio: «Secondo lei, che cosa servirebbe per rendere il mondo un posto migliore per i nostri figli?» Risposta libera: conta che la domanda sia aperta e rispettosa.', explanation: 'Le domande aperte mostrano interesse per il punto di vista dell’altro.', scripture: 'Giacomo 1:19' },
  { category: 'Presentazione', difficulty: 2, question: 'In circa 30 secondi, presenta un versetto biblico collegandolo a una preoccupazione comune a tua scelta.', answer: 'Risposta libera: il proprietario valuta chiarezza, brevità e uso corretto del versetto, evitando di forzarne il significato.', explanation: 'Un versetto ben introdotto e spiegato semplicemente è più efficace di molte parole.', scripture: '2 Timoteo 3:16, 17' },
  { category: 'Obiezioni', difficulty: 2, question: 'Scenario: il padrone di casa dice «Non credo nella Bibbia». Come puoi rispondere?', answer: 'Esempio: ascoltare con rispetto, chiedere con gentilezza che cosa lo ha portato a quella conclusione, trovare un punto in comune ed evitare di discutere.', explanation: 'Capire il punto di vista dell’altro è più utile che vincere un confronto.', scripture: 'Proverbi 15:1' },
];

const kids: Q[] = [
  { category: 'Racconti biblici', difficulty: 1, question: 'Chi costruì un’arca per salvare la sua famiglia e gli animali durante il Diluvio?', answer: 'Noè.', explanation: 'Noè ubbidì a Geova e costruì l’arca come gli era stato detto.', scripture: 'Genesi 6:13-22', source: BIBLE_SOURCE },
  { category: 'Racconti biblici', difficulty: 2, question: 'Per quanti giorni e notti piovve durante il Diluvio?', answer: '40 giorni e 40 notti.', explanation: 'Dopo la pioggia Noè e la sua famiglia attesero con pazienza nell’arca.', scripture: 'Genesi 7:12', source: BIBLE_SOURCE },
  { category: 'Racconti biblici', difficulty: 1, question: 'Quale uccello tornò da Noè con un ramoscello d’olivo nel becco?', answer: 'La colomba.', explanation: 'Il ramoscello mostrava che le acque si stavano ritirando.', scripture: 'Genesi 8:11', source: BIBLE_SOURCE },
  { category: 'Personaggi biblici', difficulty: 1, question: 'Chi fu inghiottito da un grosso pesce perché all’inizio non ubbidì a Geova?', answer: 'Giona.', explanation: 'Giona poi ubbidì e andò a Ninive a portare il messaggio di Geova.', scripture: 'Giona, capitoli 1 e 2', source: BIBLE_SOURCE },
  { category: 'Personaggi biblici', difficulty: 1, question: 'Chi sconfisse il gigante Golia con una fionda e una pietra?', answer: 'Davide.', explanation: 'Davide aveva fiducia in Geova, non nelle sue forze.', scripture: '1 Samuele 17:48-50', source: BIBLE_SOURCE },
  { category: 'Personaggi biblici', difficulty: 1, question: 'Chi fu gettato nella fossa dei leoni perché continuava a pregare Geova?', answer: 'Daniele.', explanation: 'Geova protesse Daniele perché gli era rimasto fedele.', scripture: 'Daniele 6:10, 16, 22', source: BIBLE_SOURCE },
  { category: 'Vita di Gesù', difficulty: 1, question: 'Quanti apostoli scelse Gesù?', answer: '12.', explanation: 'Gesù li scelse dopo aver pregato tutta la notte.', scripture: 'Luca 6:12, 13', source: BIBLE_SOURCE },
  { category: 'Vita di Gesù', difficulty: 2, question: 'Qual è stato il primo miracolo di Gesù?', answer: 'Trasformò l’acqua in vino a una festa di nozze a Cana.', explanation: 'Gesù usò il suo potere per aiutare e rallegrare gli altri.', scripture: 'Giovanni 2:1-11', source: BIBLE_SOURCE },
  { category: 'Personaggi biblici', difficulty: 2, question: 'Chi fu il grande amico di Davide, figlio del re Saul?', answer: 'Gionatan.', explanation: 'Gionatan fu un vero amico, leale anche nelle difficoltà.', scripture: '1 Samuele 18:1-3', source: BIBLE_SOURCE },
  { category: 'Vita di Gesù', difficulty: 1, question: 'Chi salì su un sicomoro per vedere Gesù passare?', answer: 'Zaccheo.', explanation: 'Zaccheo era basso di statura ma fece di tutto per vedere Gesù.', scripture: 'Luca 19:1-4', source: BIBLE_SOURCE },
  { category: 'Principi pratici', difficulty: 1, question: 'Qual è il nome di Dio?', answer: 'Geova.', explanation: 'Il nome di Dio si trova nella Bibbia migliaia di volte.', scripture: 'Salmo 83:18', source: BIBLE_SOURCE },
  { category: 'Personaggi biblici', difficulty: 2, question: 'Quale giovane compagno di Paolo conosceva le Sacre Scritture fin da piccolo?', answer: 'Timoteo.', explanation: 'Sua madre e sua nonna gli avevano insegnato la Bibbia.', scripture: '2 Timoteo 3:14, 15', source: BIBLE_SOURCE },
  { category: 'Personaggi biblici', difficulty: 2, question: 'Chi era la regina che rischiò la vita per salvare il suo popolo?', answer: 'Ester.', explanation: 'Ester fu coraggiosa e si presentò al re per aiutare gli ebrei.', scripture: 'Ester 4:14-16; 7:3, 4', source: BIBLE_SOURCE },
  { category: 'Qualità cristiane', difficulty: 1, question: 'Che cosa fece il buon samaritano per l’uomo ferito?', answer: 'Lo soccorse, fasciò le sue ferite, lo portò in una locanda e pagò per curarlo.', explanation: 'Gesù raccontò questa storia per insegnare ad amare il prossimo.', scripture: 'Luca 10:33-35', source: BIBLE_SOURCE },
  { category: 'Personaggi biblici', difficulty: 2, question: 'Quale giovane donna restò fedele alla suocera Naomi?', answer: 'Rut.', explanation: 'Rut disse a Naomi che il suo popolo sarebbe stato il suo popolo e il suo Dio il suo Dio.', scripture: 'Rut 1:16', source: BIBLE_SOURCE },
  { category: 'Racconti biblici', difficulty: 3, question: 'Come si chiamavano i tre giovani ebrei che non si inchinarono davanti alla statua d’oro?', answer: 'Sadrac, Mesac e Abednego.', explanation: 'Restarono fedeli a Geova anche davanti alla minaccia della fornace.', scripture: 'Daniele 3:16-18', source: BIBLE_SOURCE },
  { category: 'Personaggi biblici', difficulty: 2, question: 'Quale bambino fu portato dalla madre Anna al tabernacolo per servire Geova?', answer: 'Samuele.', explanation: 'Anna mantenne la sua promessa a Geova.', scripture: '1 Samuele 1:27, 28', source: BIBLE_SOURCE },
  { category: 'Racconti biblici', difficulty: 2, question: 'Quali uccelli portavano pane e carne al profeta Elia vicino al torrente?', answer: 'I corvi.', explanation: 'Geova si prese cura di Elia in modo sorprendente.', scripture: '1 Re 17:4-6', source: BIBLE_SOURCE },
  { category: 'Principi pratici', difficulty: 1, question: 'Gesù disse di trattare gli altri come vorremmo essere trattati noi. Come si chiama spesso questa regola?', answer: 'La regola d’oro.', explanation: 'Pensare a come si sentirebbe l’altro ci aiuta a comportarci bene.', scripture: 'Matteo 7:12', source: BIBLE_SOURCE },
  { category: 'Racconti biblici', difficulty: 3, question: 'Quante piaghe mandò Geova sull’Egitto?', answer: '10 piaghe.', explanation: 'Dopo la decima il faraone lasciò partire gli israeliti.', scripture: 'Esodo, capitoli 7-12', source: BIBLE_SOURCE },
  { category: 'Racconti biblici', difficulty: 1, question: 'Chi stese la mano sul mare quando Geova aprì un passaggio per gli israeliti?', answer: 'Mosè.', explanation: 'Geova salvò il suo popolo dall’esercito egiziano.', scripture: 'Esodo 14:21, 22', source: BIBLE_SOURCE },
  { category: 'Vita di Gesù', difficulty: 2, question: 'Chi tradì Gesù per 30 pezzi d’argento?', answer: 'Giuda Iscariota.', explanation: 'Giuda lasciò che la cupidigia guidasse le sue scelte.', scripture: 'Matteo 26:14-16', source: BIBLE_SOURCE },
  { category: 'Vita di Gesù', difficulty: 2, question: 'Con quanti pani e pesci Gesù sfamò una grande folla di circa 5.000 uomini?', answer: 'Cinque pani e due pesci.', explanation: 'Gesù ringraziò Dio e condivise il cibo con tutti, e ne avanzò.', scripture: 'Matteo 14:17-21', source: BIBLE_SOURCE },
  { category: 'Qualità cristiane', difficulty: 1, question: 'Quale qualità mostri quando dici sempre la verità?', answer: 'L’onestà.', explanation: 'I cristiani vogliono comportarsi onestamente in ogni cosa.', scripture: 'Ebrei 13:18', source: BIBLE_SOURCE },
  { category: 'Qualità cristiane', difficulty: 1, question: 'Come si chiama la qualità di chi dà volentieri agli altri?', answer: 'La generosità.', explanation: 'C’è più felicità nel dare che nel ricevere.', scripture: 'Atti 20:35', source: BIBLE_SOURCE },
  { category: 'Qualità cristiane', difficulty: 2, question: 'Dimmi almeno tre qualità del «frutto dello spirito».', answer: 'Ad esempio: amore, gioia, pace, longanimità, benignità, bontà, fede, mitezza, autocontrollo.', explanation: 'Con l’aiuto di Geova possiamo coltivare queste qualità.', scripture: 'Galati 5:22, 23', source: BIBLE_SOURCE },
  { category: 'Principi pratici', difficulty: 1, question: 'A chi dobbiamo rivolgere le nostre preghiere?', answer: 'A Geova Dio.', explanation: 'Gesù insegnò ai discepoli a pregare il Padre.', scripture: 'Matteo 6:9', source: BIBLE_SOURCE },
  { category: 'Racconti biblici', difficulty: 1, question: 'Chi fu il primo uomo creato da Geova?', answer: 'Adamo.', explanation: 'Geova lo formò dalla polvere del suolo.', scripture: 'Genesi 2:7', source: BIBLE_SOURCE },
  { category: 'Vita di Gesù', difficulty: 2, question: 'Dove trovarono Maria e Giuseppe Gesù, a 12 anni, dopo tre giorni di ricerca?', answer: 'Nel tempio, seduto in mezzo agli insegnanti.', explanation: 'Già da ragazzo Gesù amava imparare cose su Dio.', scripture: 'Luca 2:42-46', source: BIBLE_SOURCE },
  { category: 'Personaggi biblici', difficulty: 2, question: 'Chi fu venduto dai suoi fratelli e poi divenne un governante importante in Egitto?', answer: 'Giuseppe.', explanation: 'Giuseppe perdonò i fratelli e li aiutò.', scripture: 'Genesi 37:28; 41:41', source: BIBLE_SOURCE },
  { category: 'Racconti biblici', difficulty: 2, question: 'Quale animale parlò a Balaam?', answer: 'Un’asina.', explanation: 'Geova usò l’asina per fermare Balaam.', scripture: 'Numeri 22:28', source: BIBLE_SOURCE },
  { category: 'Vita di Gesù', difficulty: 2, question: 'Quale apostolo provò a camminare sull’acqua per raggiungere Gesù?', answer: 'Pietro.', explanation: 'Quando ebbe paura cominciò ad affondare, ma Gesù lo aiutò.', scripture: 'Matteo 14:28, 29', source: BIBLE_SOURCE },
  { category: 'Vita di Gesù', difficulty: 1, question: 'Che cosa fece Gesù quando una grande tempesta spaventò i discepoli in barca?', answer: 'Calmò il vento e il mare.', explanation: 'Gesù ha un grande potere e si prende cura dei suoi amici.', scripture: 'Marco 4:37-39', source: BIBLE_SOURCE },
  { category: 'Personaggi biblici', difficulty: 2, question: 'Chi costruì il tempio di Geova a Gerusalemme?', answer: 'Salomone, figlio di Davide.', explanation: 'Il tempio fu costruito per adorare Geova.', scripture: '1 Re 6:1, 2', source: BIBLE_SOURCE },
  { category: 'Applicazione', difficulty: 2, question: 'Che cosa puoi fare se hai offeso un amico?', answer: 'Chiedergli scusa e fare pace.', explanation: 'Gesù disse di sistemare le cose con il fratello.', scripture: 'Matteo 5:23, 24', source: BIBLE_SOURCE },
  { category: 'Applicazione', difficulty: 1, question: 'Perché è giusto ubbidire ai genitori?', answer: 'Perché piace a Geova ed è giusto.', explanation: 'I figli che ubbidiscono mostrano rispetto e fiducia.', scripture: 'Efesini 6:1', source: BIBLE_SOURCE },
  { category: 'Applicazione', difficulty: 1, question: 'Che cosa dici quando qualcuno ti fa un regalo o un favore?', answer: 'Grazie: mostrarsi riconoscenti.', explanation: 'La riconoscenza rende felici anche chi ha donato.', scripture: 'Colossesi 3:15', source: BIBLE_SOURCE },
  { category: 'Applicazione', difficulty: 1, question: 'Come puoi mostrare amore al prossimo non solo a parole?', answer: 'Con i fatti, aiutandolo concretamente (ad esempio condividendo, ascoltando, dando una mano).', explanation: 'L’amore vero si vede da quello che facciamo.', scripture: '1 Giovanni 3:18', source: BIBLE_SOURCE },
  { category: 'Qualità cristiane', difficulty: 2, question: 'Quale uomo rimase paziente e fedele a Geova durante grandi sofferenze?', answer: 'Giobbe.', explanation: 'Giobbe è un esempio di perseveranza.', scripture: 'Giacomo 5:11', source: BIBLE_SOURCE },
];

function build(pack: ChallengePackId, prefix: string, list: Q[]): ChallengeDef[] {
  return list.map((q, i) => ({ ...q, pack, id: `${prefix}${String(i + 1).padStart(2, '0')}` }));
}

export const PUBLISHER_PACK: ChallengeDef[] = build('publisher', 'P', publisher);
export const KIDS_PACK: ChallengeDef[] = build('kids', 'K', kids);
export const ALL_CHALLENGES: ChallengeDef[] = [...PUBLISHER_PACK, ...KIDS_PACK];

const INDEX: Record<string, ChallengeDef> = Object.fromEntries(ALL_CHALLENGES.map((c) => [c.id, c]));

export function getChallenge(id: string): ChallengeDef | undefined {
  return INDEX[id];
}
