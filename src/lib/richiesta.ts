export const STUFE = ["pellet"] as const;
export const PROBLEMI = [
  "non-parte",
  "si-spegne",
  "fumo",
  "errore",
  "ricambio",
  "manutenzione",
  "installazione",
  "altro",
] as const;
export const PREFERENZE = ["email", "cellulare", "fisso"] as const;

export type Stufa = (typeof STUFE)[number];
export type Problema = (typeof PROBLEMI)[number];
export type Preferenza = (typeof PREFERENZE)[number];

export type RichiestaValida = {
  stufa: Stufa;
  problema: Problema;
  zona: string;
  nome: string;
  recapito: string;
  preferenza: Preferenza;
  note: string;
};

export type CampiErrore = Partial<
  Record<"stufa" | "problema" | "zona" | "nome" | "recapito" | "preferenza" | "note", string>
>;

export type EsitoValidazione =
  | { ok: true; ignora: true }
  | { ok: true; ignora: false; dati: RichiestaValida }
  | { ok: false; campi: CampiErrore };

const ETICHETTA_STUFA: Record<Stufa, string> = {
  pellet: "Stufa a pellet",
};

const ETICHETTA_PROBLEMA: Record<Problema, string> = {
  "non-parte": "Non parte",
  "si-spegne": "Si spegne",
  fumo: "Fumo o odore",
  errore: "Codice o scheda",
  ricambio: "Ricambio",
  manutenzione: "Manutenzione o pulizia",
  installazione: "Installazione",
  altro: "Altro",
};

const ETICHETTA_PREFERENZA: Record<Preferenza, string> = {
  email: "email",
  cellulare: "cellulare",
  fisso: "telefono fisso",
};

export function etichettaStufa(valore: Stufa): string {
  return ETICHETTA_STUFA[valore];
}

export function etichettaProblema(valore: Problema): string {
  return ETICHETTA_PROBLEMA[valore];
}

export function etichettaPreferenza(valore: Preferenza): string {
  return ETICHETTA_PREFERENZA[valore];
}

export function messaggioConferma(preferenza: Preferenza): string {
  if (preferenza === "email") return "Richiesta inviata. Ti ricontattiamo via email.";
  if (preferenza === "cellulare") return "Richiesta inviata. Ti ricontattiamo via cellulare.";
  return "Richiesta inviata. Ti ricontattiamo via telefono fisso.";
}

function testo(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function incluso<T extends string>(valori: readonly T[], value: string): value is T {
  return (valori as readonly string[]).includes(value);
}

function emailValida(value: string): boolean {
  if (value.length > 120 || value.includes(" ")) return false;
  const at = value.indexOf("@");
  if (at <= 0 || at !== value.lastIndexOf("@")) return false;
  const dominio = value.slice(at + 1);
  return dominio.includes(".") && !dominio.startsWith(".") && !dominio.endsWith(".");
}

function telefonoValido(value: string): boolean {
  if (value.length === 0 || value.length > 30) return false;
  if (!/^[0-9+\s/-]+$/.test(value)) return false;
  return value.replace(/\D/g, "").length >= 8;
}

export function validaRichiesta(input: unknown): EsitoValidazione {
  const body = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  if (testo(body.azienda)) return { ok: true, ignora: true };

  const campi: CampiErrore = {};
  const stufa = testo(body.stufa);
  const problema = testo(body.problema);
  const preferenza = testo(body.preferenza);
  const zona = testo(body.zona);
  const nome = testo(body.nome);
  const recapito = testo(body.recapito);
  const note = testo(body.note);

  if (!incluso(STUFE, stufa)) campi.stufa = "Scegli il tipo di stufa.";
  if (!incluso(PROBLEMI, problema)) campi.problema = "Scegli il problema.";
  if (!incluso(PREFERENZE, preferenza)) campi.preferenza = "Scegli come vuoi essere ricontattato.";
  if (zona.length < 2 || zona.length > 80) campi.zona = "Indica il comune.";
  if (nome.length < 2 || nome.length > 80) campi.nome = "Scrivi nome e cognome.";
  if (note.length > 1000) campi.note = "Il messaggio è troppo lungo.";

  if (preferenza === "email") {
    if (!emailValida(recapito)) campi.recapito = "Scrivi un indirizzo email valido.";
  } else if (preferenza === "cellulare" || preferenza === "fisso") {
    if (!telefonoValido(recapito)) campi.recapito = "Scrivi un numero di telefono valido.";
  }

  if (Object.keys(campi).length > 0) return { ok: false, campi };

  return {
    ok: true,
    ignora: false,
    dati: {
      stufa: stufa as Stufa,
      problema: problema as Problema,
      zona,
      nome,
      recapito,
      preferenza: preferenza as Preferenza,
      note,
    },
  };
}
