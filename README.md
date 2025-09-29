# Tropini Service · Landing Page

Sito vetrina in **Astro** per Tropini Service di Tropini Gianfranco, centro assistenza accreditato per stufe e camini Clam e Nordica Extraflame con sede a Cavallermaggiore (CN). Il progetto offre un'unica pagina a scorrimento con design dark mode, accenti rosso/grigio e call to action per contattare rapidamente il servizio tecnico.

## ✨ Funzionalità principali

- Hero section con messaggio chiave, badge dei marchi serviti e call to action.
- Sezioni "Chi siamo", "Cosa facciamo", "Dove siamo" e "I nostri marchi" con contenuti ottimizzati SEO.
- Bottone flottante sempre visibile per chiamare direttamente il numero di assistenza.
- Palette dark con sfumature e glassmorphism per un look moderno e professionale.
- Layout responsive ottimizzato per dispositivi mobili e desktop.

## 📁 Struttura del progetto

```text
/
├── public/              # Asset statici (favicon, immagini, ecc.)
├── src/
│   └── pages/
│       └── index.astro  # Pagina principale con layout e contenuti
├── package.json
└── tsconfig.json
```

## 🧞 Comandi utili

Tutti i comandi vanno eseguiti nella root del progetto (`c:\Users\marco.origlia\Desktop\tropini`).

| Comando          | Descrizione                                        |
| :--------------- | :------------------------------------------------- |
| `npm install`    | Installa le dipendenze (già eseguito in fase setup) |
| `npm run dev`    | Avvia il server di sviluppo su `http://localhost:4321` |
| `npm run build`  | Genera la versione statica pronta per il deploy     |
| `npm run preview`| Anteprima locale della build                        |

## 🚀 Deploy

L'output statico è generato nella cartella `dist/`. Può essere pubblicato su qualsiasi hosting statico (Netlify, Vercel, GitHub Pages, ecc.).

## 📞 Contatti

- Tropini Service di Tropini Gianfranco
- Via San Giorgio 14 · 12030 Cavallermaggiore (CN)
- Tel. [334 296 8625](tel:+393342968625)

---

Per modifiche grafiche o test aggiuntivi è sufficiente aggiornare `src/pages/index.astro` e rilanciare `npm run dev` per visualizzare i cambiamenti.
