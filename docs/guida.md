# Guida di Timebox

Come funziona Timebox e come si leggono i suoi numeri. Descrive solo l'app: le routine di pianificazione stanno altrove. Le parole usate qui sono quelle dell'interfaccia; il glossario in fondo è la fonte unica.

## Concetti

### Template

La settimana tipo, modificata in Ricorrenza. Ogni blocco è un'area, un giorno (lunedì-domenica, weekend compreso), una fascia (Mattina fino alle 13, Pomeriggio dalle 13 alle 18, Sera dopo le 18) e un numero di ore. Il template conosce le aree, non i progetti. Una modifica vale per le settimane future; le settimane passate si congelano (vedi Congelamento).

### Override

Il cambio di una sola settimana. Si fa da Settimana o da Giorno: aggiungere un blocco, cambiarne le ore, spostarlo, toglierlo. Una fascia svuotata a mano resta vuota, non torna al template. In Settimana, un badge "Δ template" dice quanti slot differiscono dal template e il tasto "Ripristina template" cancella gli override della settimana mostrata. Su una settimana passata cancella anche il piano congelato, che torna a seguire il template di oggi.

### Piano

Le ore dei blocchi di un giorno o di una settimana, per area: l'override dove c'è, altrimenti il template. Il piano non dice cosa si è fatto, dice cosa è riservato.

### Fatto

Le ore lavorate registrate, per area, fino a oggi. Le ore con una data successiva a oggi non sono ancora fatte: Settimana le mostra a parte e Andamento non le conta. Le ore fatturabili sono un'altra cosa (vedi Ore fatturabili) e non entrano nel fatto.

### Obiettivo

Le ore che una settimana deve dare a un'area. Senza un valore scelto è la somma del template dell'area (numero in grigio); per una settimana passata senza valore salvato è il piano congelato di quella settimana, non il template di oggi.

- **Cambiarlo.** Andamento → Settimana, tabella "Per area · obiettivo", campo Obiettivo. Si scrive `10`, `10h`, `10:30` o `1h 30m`; un numero nudo qui è sempre in ore. Invio conferma, Esc annulla, riscrivere lo stesso valore non salva niente. Si può farlo anche su settimane future.
- **Lunedì e finale.** L'app tiene ogni cambio. Il primo valore salvato nella settimana è l'obiettivo del lunedì, l'ultimo è l'obiettivo finale. Lo scarto si misura sul finale, così un'urgenza non risulta deriva. La taratura del template usa quello del lunedì, così un'urgenza non fa sembrare sbagliato il template.
- **Attenzione.** "Del lunedì" significa "il primo salvato", non "quello scritto di lunedì". Senza valori già salvati, un cambio fatto a metà settimana diventa anche il valore del lunedì.
- **Avvisi.** Un ⚠ accanto all'area segnala un obiettivo sopra il limite settimanale dell'area, oppure un obiettivo sopra zero su un'area chiusa. Segnala e basta, non blocca.

### Blocchi rimasti

Il piano che resta da fare nella settimana, per area. Per oggi è `max(0, piano di oggi − fatto di oggi)`; per i giorni dopo oggi è il loro piano intero, weekend compreso; i giorni passati non contano. In Andamento la colonna si chiama "Rimasti".

### Scarto

`scarto = obiettivo − fatto − blocchi rimasti`

Positivo: mancano ore ("mancano 2h"). Negativo: ore oltre l'obiettivo ("2h oltre"). Entro la tolleranza la tabella scrive "in pari".

- **Tolleranza.** Mezz'ora o il 10% dell'obiettivo, vale il più largo dei due. È la stessa dei segnali di taratura e degli avvisi di `status`.
- **Solo stato, mai gesti.** Il numero dipende da obiettivo, ore fatte e blocchi, non da come si è arrivati lì. Spostare un blocco non cambia lo scarto; aggiungerne uno lo chiude; toglierne uno lo apre; toglierne uno dopo averci lavorato lascia le ore fatte dove sono e le ore mancanti in vista.
- **Totale.** Il Carico della settimana somma le aree: scarti opposti si compensano. Le decisioni si prendono sulle righe per area.
- **Non suggerisce.** Lo scarto mostra, non propone cosa spostare.

### Limiti

Un tetto di ore, in tre forme:

- **Limite settimanale** di un'area, o **ore settimanali** di un progetto: si azzera ogni settimana.
- **Limite globale** di un'area: cumulativo, dall'inizio.
- **Budget totale** di un progetto: cumulativo, dall'inizio.

Si impostano in Aree. Ogni tetto si misura su due conteggi, ore lavorate e ore fatturabili (queste solo nelle aree a ore); le soglie usano il peggiore e, quando i due differiscono, ogni numero porta la sua etichetta ("lavorate" o "fatt."). Un numero senza etichetta sono ore lavorate. Le barrette del tetto si accendono al 50%, all'80% e al 100%.

I tetti settimanali si giudicano sul **previsto**: il fatto più i blocchi rimasti. Per un'area il ⚠ scatta quando il previsto supera il tetto; per un progetto vale solo il fatto, perché il piano è per area. I tetti cumulativi si leggono in Andamento → In prospettiva. Settimana mostra un banner quando un tetto è superato (o, per il limite settimanale dell'area, quando lo supera il piano mentre il fatto ci sta ancora).

### Stato dell'area

Un'etichetta: Attiva, Minima o Chiusa. Dice come lavorare su un'area, non quanto. Ogni area ha uno stato di default (Aree → Stato di default); per una settimana si cambia con i selettori in fondo alla sidebar ("Aree · settimana"), che agiscono sulla settimana corrente. Il glifo compare accanto all'area in Settimana, Giorno e Ricorrenza.

Nessun calcolo usa lo stato, con due eccezioni di mostra: un'area chiusa senza obiettivo, ore fatte o blocchi rimasti sparisce dalla tabella degli obiettivi, e un'area chiusa con un obiettivo sopra zero riceve il ⚠.

### Taratura del template

Andamento → Trend, per area, sulle ultime 8 settimane chiuse. Due segnali separati, ognuno con il suo verso:

- **Template.** L'obiettivo del lunedì è diverso dalle ore di template quasi ogni settimana, nello stesso verso. Il template è sbagliato; il valore proposto è la media degli obiettivi del lunedì, al quarto d'ora. Contano solo le settimane con un obiettivo salvato.
- **Esecuzione.** Il fatto è diverso dall'obiettivo finale quasi ogni settimana, nello stesso verso. Il template non c'entra: a derivare è come si lavora. Una settimana senza obiettivo salvato si confronta col suo piano congelato.

"Quasi ogni settimana" vuol dire almeno il 75% delle settimane utili fuori tolleranza nello stesso verso, con almeno 4 settimane utili (su 8, sono 6). Le settimane con obiettivo a zero si saltano. Il segnale dà il totale per area; la distribuzione nei giorni e nelle fasce si decide in Ricorrenza, che mostra le ore di template per area.

### Congelamento

Quando si modifica il template, Timebox copia come override il piano che le settimane avevano fino a quel momento, così la storia non si riscrive. Si congelano:

- le settimane passate, dalla prima in cui ci sono ore o override fino alla settimana scorsa;
- nella settimana in corso, solo i giorni prima di oggi.

Oggi e le settimane future seguono sempre il template nuovo. I task Todoist in cache non contano come segno che una settimana sia stata usata. Vale per ogni modo di cambiare il template: Ricorrenza, HTTP (`PUT /recurring/slot`) e MCP (`set_recurring_slot`).

### Capacità

Le ore che una fascia può contenere, impostate in Impostazioni → Pianificazione → "Capacità per slot" (Mattina, Pomeriggio, Sera; di partenza 4 ore ciascuna, da 0,5 a 12). Serve solo alle barre delle fasce in Settimana, Giorno e Ricorrenza: la barra mostra il carico della fascia (il maggiore fra piano e ore lavorate) sulla capacità e si tratteggia oltre. Non è l'obiettivo e non entra in scarto o limiti.

### Ore fatturabili

Nelle aree a ore (Aree → Tipo di compenso → Compenso a ore) una registrazione può avere ore fatturabili diverse dalle lavorate. Se non sono indicate valgono le lavorate. Il simbolo ◇ segna che i due numeri differiscono; ○ ore da fatturare, ✓ ore fatturate. Le aree a compenso fisso non fatturano ore.

### Registrazione per progetto e giorno

Le ore lavorate si registrano senza fascia: c'è una registrazione per progetto e giorno. Le fasce appartengono ai blocchi pianificati. Spostare una registrazione su un giorno in cui il progetto ha già ore unisce le due (ore e ore fatturabili sommate, fatturata solo se lo erano entrambe).

## Schermate

L'ordine è quello della sidebar. ⌘1…⌘9 aprono le prime nove; Q apre il QuickLog, dove si scrive `Acme +1h` per aggiungere ore a un progetto; ? mostra le scorciatoie.

### Giorno

Un giorno alla volta (‹ › per spostarsi, "Oggi" per tornare). Risponde a: cosa ho pianificato oggi, cosa ho fatto, cosa non torna con Todoist.

- **Piano.** I blocchi del giorno per fascia, con la barra di capacità; si trascinano fra le fasce e la modifica è un override per quel giorno. Sotto, "Extra / fuori piano": ore fatte o task Todoist su aree senza blocco.
- **Ore.** Una riga per progetto: le ore lavorate del giorno, con il selettore Lavorate / Fatturabili e quello Progetti lavorati / Tutti i progetti (⌘⇧H).
- **Blocchi pianificati senza azioni.** Blocchi che nessun task Todoist copre. Ogni riga è area e fascia; il numero a destra sono le ore scoperte (disponibili meno stimate dai task). Per oggi non compaiono le fasce già finite (Mattina fino alle 13, Pomeriggio fino alle 18).
- **Mismatch dopo sync.** Task Todoist che non tornano col piano: non mappati (nessun progetto Timebox con quel nome), fuori pianificazione (area senza blocco in quella fascia), oltre blocco (stima più grande delle ore libere del blocco), stime oltre il piano rimasto (le stime del giorno superano il piano che resta, cioè i blocchi meno le ore già fatte).
- **Aggiorna / Importa completati.** Il primo scarica da Todoist i task del giorno; il secondo porta nel timesheet i task completati.

### Settimana

La griglia della settimana: pianificare e registrare nello stesso posto. Risponde a: cosa è previsto ogni giorno, quanto ho fatto e dove devo intervenire.

- **Barra in alto.** Navigazione fra settimane, badge "Δ template" e "Ripristina template" (solo se la settimana ha override), sincronizzazione Todoist per oggi e i giorni futuri, importazione dei completati. A destra il consuntivo: ore fatte sul piano, percentuale di piano coperta, quota fatturabile (Fatt.), non fatturabile (NF) ed extra; la freccia apre Andamento.
- **Controlli.** Pianificazione Completa / Compatta / Nascosta (⌘⇧P), Progetti lavorati / Tutti i progetti (⌘⇧H), Ore lavorate / fatturabili (⌘⇧V).
- **Riepilogo settimana / area.** Per area, fatto su piano, richiudibile.
- **Pianificato.** I blocchi per giorno e fascia: si aggiungono, si cambiano, si trascinano. Il weekend si pianifica come gli altri giorni. Sotto, la riga Extra e la riga Bilancio: ore fatte dentro le aree pianificate sul piano del giorno, con "+N extra" per le ore fuori piano e "+N" tratteggiato per la pianificazione sopra il template.
- **Ore per progetto.** Una riga per progetto, una cella per giorno, modificabile (`1h 30m`; `1:30` e `90` funzionano come scorciatoie di scrittura). Il totale del giorno ha ▴ / ▾ sul piano.

### Andamento

Il confronto fra quello che era previsto e quello che è successo, in tre lenti. Le frecce cambiano la settimana (condivisa con Settimana).

- **Settimana.** Dove arrivo a fine settimana e se sto nei limiti.
  - *Carico della settimana*: ore fatte sull'obiettivo totale, con blocchi rimasti e scarto totali.
  - *Fatturabile a consumo*: ricavo delle ore fatturabili fatte e proiezione a fine settimana (fatto fatturabile più il piano che resta nelle aree a ore).
  - *Per area · obiettivo*: obiettivo (modificabile), fatto, rimasti, scarto.
  - *Limiti della settimana*: i tetti settimanali di aree e progetti, con ⚠ sul previsto.
- **Trend.** Le ultime 8 settimane, per scoprire la deriva.
  - *Aggregato settimanale*: piano e fatto di ogni settimana, con la linea del piano della settimana selezionata.
  - *Per area*: un mini-trend per area, con il piano di ogni settimana, i tetti settimanali e un glifo sul verdetto delle sole settimane chiuse (▪ in linea, ▴ sopra, ▾ sotto, doppio oltre 2 ore o il 30%).
  - *Taratura del template*: vedi il concetto.
- **In prospettiva.** I tetti cumulativi (limiti globali delle aree, budget totali dei progetti) bastano? Per ciascuno: consumato, residuo e in quale fascia di tempo si esaurisce (entro 1, 2, 4, 8 settimane, oltre) al ritmo misurato. Il ritmo misurato è la media settimanale delle ore lavorate nelle ultime 4 settimane chiuse (per un tetto nato da poco conta solo da quando c'è lavoro; la riga dichiara "ritmo su N settimane"). "Fermo" vuol dire nessuna ora nella finestra: nessun esaurimento prevedibile. Dove esiste, la riga mostra anche le ore di template a settimana. Un budget di progetto dentro un'area con limite globale compare nelle righe ma non nei totali, per non contarlo due volte.

### Ricorrenza

Il template: una griglia giorno per fascia dove si aggiungono, spostano, duplicano e tolgono i blocchi, con la barra di capacità per fascia. In fondo, il totale della settimana e le ore per area. Ogni modifica congela prima le settimane passate.

### Aree

Aree e progetti. Per area: nome, colore, stato di default, limite ore (cadenza Nessuna / Settimanale / Globale e ore massime), tipo di compenso (Nessuno / a ore / fisso) e tariffa oraria. Per progetto: descrizione, budget totale, ore settimanali, prezzo a corpo, spostamento in un'altra area, archivio (le ore restano) e ordinamento. Un'area o un progetto con ore registrate non si elimina senza prima archiviarlo o spostare le ore.

### Registro

Tutte le registrazioni di un intervallo (da inizio mese a oggi, all'apertura), filtrabili per area e progetto. Si modificano data, progetto, ore lavorate, ore fatturabili e stato fatturato, o si eliminano. Risponde a: cosa ho registrato davvero.

### Rendiconto

Le ore da fatturare, per mese, trimestre o intervallo. In testa Da fatturare, Fatturate e Fatturabili totali (con il valore in euro dove c'è una tariffa); sotto, un blocco per area a ore con i progetti e le registrazioni. Si segna fatturata una riga o tutte insieme; "Rimuovi fatturazione" le rimette da fatturare. Le aree a compenso fisso compaiono solo come riga di riepilogo.

### Import Todoist

L'elenco dei task completati importati nel timesheet, raggruppati per data. Si può correggere l'import (data, progetto, ore, nota): le ore si spostano di conseguenza. Eliminare un import toglie le sue ore dalla registrazione del giorno. Un import si fa da "Importa completati" in Settimana o Giorno.

### Impostazioni

- **Aspetto**: tema chiaro, scuro o del sistema.
- **Pianificazione**: capacità per slot e soglia ore/minuti (un numero nudo sopra la soglia, di partenza 9, è letto come minuti; `1:30` è sempre esplicito).
- **Todoist**: token, cifrato nel sistema; importazione dei progetti, con l'elenco dei progetti Timebox che non esistono più in Todoist.
- **CLI e MCP**: installazione degli strumenti e configurazione degli agent.
- **Database**: file in uso, scelta di un altro file, nuovo database.
- **Dati**: dati di prova e cancellazione totale.
- **Aggiornamenti**: stato e installazione.
- **iPhone**: accende e spegne la pagina per le ore (si spegne anche dall'interruttore nella barra in alto), mostra il link e rigenera il token.

### Pagina iPhone

Una pagina web, raggiungibile solo con il Mac acceso e Timebox aperto, per registrare e correggere le ore dal telefono. Mostra un giorno alla volta (‹ ›, "Torna a oggi"): una riga per progetto con il menu delle ore (da 0h a 12h a passi di 15 minuti) e il totale lavorate contro pianificate; sotto, il piano del giorno per fascia, in sola lettura. Cambia solo le ore lavorate: le ore fatturabili e lo stato fatturato restano come sono. Il link contiene il token e il traffico non è cifrato: fuori casa la pagina va spenta.

## Glossario

- **Blocchi rimasti** — il piano che resta da fare nella settimana: per oggi il piano meno il fatto di oggi (mai sotto zero), per i giorni dopo oggi il loro piano.
- **Budget totale** — tetto cumulativo di ore di un progetto.
- **Capacità** — le ore che una fascia può contenere, dalle Impostazioni. Solo per le barre delle fasce; non è il piano e non è l'obiettivo.
- **Congelamento** — la copia come override del piano delle settimane passate, fatta prima di cambiare il template.
- **Extra** — ore fatte fuori dal piano di un giorno.
- **Fascia** — Mattina (fino alle 13), Pomeriggio (13-18) o Sera (dopo le 18). Appartiene ai blocchi pianificati, non alle ore registrate. Nel codice e nell'API si chiama anche slot.
- **Fatto** — le ore lavorate registrate fino a oggi, per area.
- **In pari** — scarto entro la tolleranza.
- **Limite** — tetto di ore, settimanale (si azzera) o globale (cumulativo); vale per un'area o, come budget, per un progetto.
- **Obiettivo** — le ore che la settimana deve dare a un'area; del lunedì (il primo valore salvato) o finale (l'ultimo).
- **Ore fatturabili** — le ore da fatturare, che nelle aree a ore possono differire dalle lavorate. Abbreviate "fatt.".
- **Ore lavorate** — le ore registrate. È la parola per le ore fatte; "tracciate", "svolte" e "reali" non si usano.
- **Override** — il piano di una sola settimana al posto del template.
- **Piano** — le ore dei blocchi (override, altrimenti template) di un giorno o di una settimana.
- **Previsto** — il fatto più i blocchi rimasti; è la misura dei limiti settimanali.
- **Ricorrenza** — la schermata del template.
- **Ritmo misurato** — la media settimanale di ore lavorate nelle ultime 4 settimane chiuse; si usa solo in In prospettiva. Le ore di template a settimana si chiamano "template".
- **Scarto** — obiettivo meno fatto meno blocchi rimasti.
- **Stato dell'area** — Attiva, Minima o Chiusa; un'etichetta con un predefinito per area e un'eccezione per settimana.
- **Taratura del template** — il controllo, in Andamento → Trend, che dice se il template di un'area è sbagliato o se a derivare è l'esecuzione.
- **Template** — la settimana tipo, in Ricorrenza.
- **Tolleranza** — mezz'ora o il 10%, il più largo dei due.
