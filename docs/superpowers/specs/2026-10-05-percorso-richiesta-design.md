# Percorso richiesta Tropini Service

## Obiettivo

Il sito resta la vetrina di Tropini Service e guadagna un solo percorso interattivo: la persona descrive stufa, problema e zona, poi chiama il cellulare, chiama il fisso, oppure invia una richiesta. L’email arriva a Tropini tramite Resend. Il sito è un’app Astro dinamica, pubblicata con il Dockerfile su Coolify.

## Contesto

- Pagine attuali: home (`src/pages/index.astro`) e Chi siamo (`src/pages/chi-siamo.astro`).
- Numeri già in uso: cellulare `334 2968625` (`tel:3342968625`), fisso `0172 382695` (`tel:0172382695`).
- Oggi il sito è statico e l’immagine Docker lo serve con nginx. La nuova immagine esegue Node. Coolify termina il traffico e inietta le variabili d’ambiente.
- Nessun framework UI. L’interazione resta in script del componente Astro.

## Percorso

Il percorso vive nella home, sezione `#percorso`, sulla stessa pagina. Quattro passi. Si vede un passo alla volta. I passi già compilati restano modificabili.

1. **Stufa.** Valori: `pellet`, `legna`, `non-so`. Etichette: “Stufa a pellet”, “Stufa a legna”, “Non so”.
2. **Problema.** Un solo valore:
   - `non-parte` — Non parte
   - `si-spegne` — Si spegne
   - `fumo` — Fumo o odore
   - `errore` — Codice o scheda
   - `ricambio` — Ricambio
   - `manutenzione` — Manutenzione o pulizia
   - `installazione` — Installazione
   - `altro` — Altro
3. **Zona.** La mappa del Piemonte è cliccabile. Le città già disegnate (Verbania, Biella, Novara, Torino, Asti, Alessandria, Cuneo) e la sede Cavallermaggiore impostano la zona con quel nome. Sotto la mappa c’è il campo “Altro comune”. La zona inviata è il testo trimmato di quel campo quando non è vuoto; se il campo è vuoto, la zona è la città selezionata. Svuotare il campo ripristina la città. La zona è una stringa da 2 a 80 caratteri.
4. **Contatto.** Tre azioni allo stesso livello:
   - Chiama il cellulare.
   - Chiama il fisso.
   - Invia richiesta. Campi: nome, recapito, preferenza di ricontatto (`email`, `cellulare`, `fisso`), note opzionali. Un campo honeypot `azienda`, nascosto agli utenti e fuori dal tab order.

Se la persona chiama, il riepilogo (stufa, problema, zona) resta visibile sopra i pulsanti, così può leggerlo durante la telefonata.

Dopo un invio riuscito, il modulo è sostituito da “Richiesta inviata. Ti ricontattiamo via email.”, “via cellulare.” o “via telefono fisso.”, in base alla preferenza. I due pulsanti di chiamata restano.

## Ingressi

Tutti portano a `#percorso` e precompilano solo i dati già noti. Il primo passo ancora vuoto è quello visibile.

| Ingresso | Precompilazione |
| --- | --- |
| Hero, “Descrivi il problema” | nessuna |
| Card Stufe a pellet | stufa `pellet` |
| Card Stufe a legna | stufa `legna` |
| Card Assistenza multibrand | nessuna |
| Card Pulizia stufe e Manutenzione | problema `manutenzione` |
| Card Installazioni | problema `installazione` |
| Card Schede elettroniche | problema `errore` |
| Card Reperimento materiali | problema `ricambio` |
| Città o sede sulla mappa in Contatti | zona = nome cliccato |
| Barra mobile “Richiedi” | nessuna |
| Chi siamo, link “Descrivi il problema” | nessuna, destinazione `/#percorso` |

L’hero tiene “Chiama ora” sul cellulare come azione principale. Sotto le due azioni c’è un link testuale al fisso. La barra fissa in basso compare solo sotto i 901px, con tre controlli: Cellulare, Fisso, Richiedi. Il body della home ha padding inferiore pari all’altezza della barra, così il footer non resta coperto. La barra rispetta `safe-area-inset-bottom`.

## Componenti

- `src/components/Percorso.astro` — passi, stato, riepilogo, modulo, messaggi di esito. Ascolta `tropini:percorso` e `tropini:zona`.
- `src/components/MappaPiemonte.astro` — prop `selezionabile`. In modalità selezionabile, ogni città e la sede sono attivabili con click e con Invio/Spazio. Emette `tropini:zona` con `{ zona: string }` e segna la città scelta. Usata nel passo 3 e in Contatti.
- `src/components/BarraContatto.astro` — barra mobile, solo in home.
- `src/lib/richiesta.ts` — tipi, etichette, validazione. Nessun accesso a rete.
- `src/pages/api/richiesta.ts` — `POST` JSON, chiama Resend.

Gli eventi sono `CustomEvent` inviati su `document`. Percorso conserva la zona e la passa alla mappa del passo 3. Un click sulla mappa in Contatti aggiorna la stessa zona.

Hero, Servizi e Chi siamo puntano al percorso o emettono `tropini:percorso` con il dettaglio `{ stufa?: string, problema?: string, zona?: string }`.

Lo stile usa le variabili già in `Layout.astro`, compreso il tema scuro. Le animazioni nuove rispettano `prefers-reduced-motion`.

## Dati e invio

`POST /api/richiesta` accetta JSON:

```json
{
  "stufa": "pellet",
  "problema": "non-parte",
  "zona": "Savigliano",
  "nome": "Maria Rossi",
  "recapito": "maria@example.com",
  "preferenza": "email",
  "note": "",
  "azienda": ""
}
```

Validazione in `src/lib/richiesta.ts`:

- `stufa` e `problema` e `preferenza` devono essere uno dei valori elencati.
- `zona` e `nome`: testo trimmato, 2–80 caratteri.
- `note`: opzionale, al massimo 1000 caratteri.
- Se `preferenza` è `email`, `recapito` è un indirizzo con un `@` e un punto nel dominio, massimo 120 caratteri.
- Se `preferenza` è `cellulare` o `fisso`, `recapito` contiene almeno 8 cifre e solo cifre, spazi, `+`, `/`, `-`, massimo 30 caratteri.
- Se `azienda` non è vuota, la validazione restituisce `{ ok: true, ignora: true }`. L’API risponde `200` con `{ ok: true }` e non parte nessuna email.

Ordine del `POST`: conta la richiesta; se supera il limite, `429`; se `ignora` è vero, `200` senza invio; altrimenti valida i campi; se sono validi, invia con Resend. Limite: 5 `POST` per IP in 10 minuti, conteggio in memoria nel processo Node. L’IP è il primo valore di `X-Forwarded-For`, altrimenti l’indirizzo del socket.

Resend, pacchetto `resend`:

- `from`: `RESEND_FROM`
- `to`: `RICHIESTA_TO`
- `replyTo`: il recapito, solo quando `preferenza` è `email`
- oggetto: `Richiesta assistenza — {etichetta problema} — {zona}`
- corpo testo: nome, recapito, preferenza, stufa, problema, zona, note

Variabili lette solo sul server:

- `RESEND_API_KEY`
- `RESEND_FROM` — mittente di un dominio verificato su Resend
- `RICHIESTA_TO` — casella di Tropini
- `HOST` — `0.0.0.0` nell’immagine
- `PORT` — quella impostata da Coolify; default `4321`

Se una variabile Resend manca, `POST` risponde `500` e la pagina non si rompe.

## Errori

- Campo non valido: `400` e `{ ok: false, campi: { nome: "..." } }`. Il passo 4 mostra l’errore sotto il campo.
- `429`: “Troppe richieste. Chiama il 334 2968625 o il 0172 382695.”
- Resend non riesce, rete assente, o configurazione mancante: “Non siamo riusciti a inviare. Chiama il 334 2968625 o il 0172 382695.” I due link `tel:` sono nel messaggio.
- Successo: il testo di conferma descritto sopra.

Il client invia `fetch` con `Content-Type: application/json`. Durante l’invio il pulsante è disabilitato.

## Deploy

`astro.config.mjs` imposta `output: 'server'` e l’adapter `@astrojs/node` in modalità `standalone`.

Il Dockerfile resta l’artefatto di deploy, in due stage:

1. `node:22-alpine`, `npm ci`, `npm run build`.
2. `node:22-alpine`, copia `dist`, `node_modules` e `package.json`. `ENV HOST=0.0.0.0`. `EXPOSE 4321`. Comando `node ./dist/server/entry.mjs`.

Il Dockerfile non copia più `nginx.conf`. Il file resta nel repository e non entra nell’immagine. Coolify punta al Dockerfile, imposta `PORT` e le tre variabili Resend, e pubblica la porta del container.

## Verifica

- Script `test`: `node --experimental-strip-types --test src/lib/richiesta.test.ts`. Casi: valore ammesso, nome corto, email richiesta quando la preferenza è email, telefono richiesto quando la preferenza è cellulare o fisso, honeypot riconosciuto senza essere un errore di campo, note troppo lunghe.
- `npm run build` completa.
- Controllo manuale in home: quattro passi, precompilazione da una card e da una città, entrambe le chiamate, invio con successo, errore di campo, messaggio quando Resend fallisce. La barra mobile non copre il footer. Chi siamo linka `/#percorso`.

## Fuori scope

WhatsApp, prezzi, account clienti, pannello di lettura delle richieste, salvataggio su database, modifica dei testi istituzionali già pubblicati.
