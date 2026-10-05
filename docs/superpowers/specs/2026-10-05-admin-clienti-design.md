# Area admin clienti

Data: 2026-10-05

## Obiettivo

Anagrafica dell'officina Tropini Service nello stesso sito Astro. Ogni cliente ha i propri dati e lo storico degli interventi. Le richieste dal sito creano una scheda (o si agganciano a un cliente già presente). In ufficio si aggiungono clienti a mano. Accesso con una password condivisa.

L'altro agent continua a occuparsi del modulo contatti e di Resend: questa area non invia email.

## Configurazione

Segnaposto in `.env.example`. I valori veri non vanno in git (`.env` è già ignorato).

- `DATABASE_HOST`
- `DATABASE_PORT` (default `5432`)
- `DATABASE_USER`
- `DATABASE_PASSWORD`
- `DATABASE_NAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_SECRET`
- `COOKIE_SECURE` facoltativo: `true` o `false`. Se assente, il cookie è secure solo su HTTPS.

All'avvio dello schema, se le tabelle non esistono vengono create. Postgres è sul VPS; l'app non include un database locale.

In produzione il sito è servito dal server Node di Astro (`@astrojs/node`, mode standalone), perché `/admin` e `/api/richiesta` non possono girare su nginx statico.

## Dati

`clienti`: id, nome, telefono, email, indirizzo, comune, marca_stufa, modello_stufa, origine (`sito` | `manuale`), note, telefono_norm, email_norm, created_at, updated_at.

`interventi`: id, cliente_id, data, problema, lavoro, stato (`nuovo` | `programmato` | `in_corso` | `completato` | `annullato`), canale (`mail` | `cellulare` | `telefono` | null), note, created_at.

Il telefono normalizzato tiene solo le cifre e toglie il prefisso italiano `0039` / `39`. L'email normalizzata è trim e minuscolo.

Abbinamento di una richiesta: se il telefono normalizzato coincide, si usa quel cliente (vince sul match email). Altrimenti si usa l'email. Se il cliente esiste, si aggiunge un intervento e si compilano solo i campi anagrafici ancora vuoti. Se non esiste, si crea il cliente con origine `sito` e il primo intervento in stato `nuovo`, data odierna in Europe/Rome.

## Schermate

- `/admin/login` — password condivisa. Sessione 7 giorni, cookie HttpOnly, SameSite=Lax.
- `/admin` — elenco. Ricerca su nome, telefono e comune. Filtro sullo stato dell'ultimo intervento. 40 schede per pagina.
- `/admin/clienti/nuovo` — inserimento manuale. Il primo intervento è facoltativo. Se telefono o email esistono già, si apre la scheda presente.
- `/admin/clienti/[id]` — modifica anagrafica e storico, dal più recente. Si aggiunge un intervento se c'è almeno data, problema, lavoro svolto o nota.

Pagine admin con `noindex`. Nessun menu pubblico.

## API per il modulo contatti

Il modulo pubblico invia `POST /api/richiesta` (validazione e email Resend restano di quel percorso). Dopo l'invio dell'email, la stessa richiesta viene salvata in anagrafica.

Mappatura: `nome` resta il nome; `zona` diventa il comune; tipo di stufa, problema e note diventano il testo del problema. Se la preferenza è `email`, il recapito va nell'email e il canale è `mail`. Se è `cellulare` o `fisso`, il recapito va nel telefono e il canale è `cellulare` o `telefono`.

Cliente e intervento si salvano nella stessa transazione. Se il database non è raggiungibile, l'email parte comunque e l'errore resta nel log: il visitatore non perde la richiesta. Un secondo invio con lo stesso telefono o la stessa email aggiunge un intervento alla scheda già presente.

## Errori

Password assente o sbagliata: si resta sul login, senza cookie. Variabili admin mancanti: messaggio esplicito, nessun accesso. Id cliente inesistente: 404.
