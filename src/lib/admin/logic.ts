import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const COOKIE_NAME = "tropini_admin";
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

export const STATI = [
  { value: "nuovo", label: "Nuovo" },
  { value: "programmato", label: "Programmato" },
  { value: "in_corso", label: "In corso" },
  { value: "completato", label: "Completato" },
  { value: "annullato", label: "Annullato" },
] as const;

export const CANALI = [
  { value: "mail", label: "Mail" },
  { value: "cellulare", label: "Cellulare" },
  { value: "telefono", label: "Telefono" },
] as const;

export type Stato = (typeof STATI)[number]["value"];
export type Canale = (typeof CANALI)[number]["value"];

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export type ClienteFields = {
  nome: string;
  telefono: string;
  email: string;
  indirizzo: string;
  comune: string;
  marca: string;
  modello: string;
  note: string;
  telefonoNorm: string;
  emailNorm: string;
};

export type InterventoFields = {
  data: string | null;
  problema: string;
  lavoro: string;
  stato: Stato;
  canale: Canale | null;
  note: string;
};

export type RichiestaValue = {
  cliente: ClienteFields;
  intervento: {
    problema: string;
    canale: Canale | null;
    stato: "nuovo";
  };
};

export type Matchable = {
  id: string;
  telefonoNorm: string;
  emailNorm: string;
};

type Loose = {
  nome?: string;
  telefono?: string;
  email?: string;
  comune?: string;
  indirizzo?: string;
  marca?: string;
  modello?: string;
  problema?: string;
  lavoro?: string;
  note?: string;
  nota?: string;
  canale?: string;
  stato?: string;
  data?: string;
};

const NOME_MAX = 200;
const SHORT_MAX = 300;
const LONG_MAX = 4000;

export function normalizePhone(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.startsWith("0039")) digits = digits.slice(4);
  else if (digits.startsWith("39") && digits.length > 10) digits = digits.slice(2);
  return digits;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function missingDatabaseEnv(env: NodeJS.ProcessEnv): string[] {
  return ["DATABASE_HOST", "DATABASE_USER", "DATABASE_PASSWORD", "DATABASE_NAME"].filter(
    (key) => !env[key]?.trim(),
  );
}

export function missingAdminEnv(env: NodeJS.ProcessEnv): string[] {
  return ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"].filter((key) => !env[key]?.trim());
}

export function cookieSecure(protocol: string, envValue: string | undefined): boolean {
  if (envValue === "true") return true;
  if (envValue === "false") return false;
  return protocol === "https:";
}

export function todayInRome(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(now);
}

export function signSession(secret: string, now = Date.now()): string {
  const payload = String(now + SESSION_SECONDS * 1000);
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifySession(token: string, secret: string, now = Date.now()): boolean {
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return false;
  }
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > now;
}

export function passwordMatches(input: string, expected: string): boolean {
  const actual = createHash("sha256").update(input).digest();
  const wanted = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actual, wanted);
}

export function chooseCliente<T extends Matchable>(
  rows: T[],
  phoneNorm: string,
  emailNorm: string,
): T | undefined {
  if (phoneNorm) {
    const byPhone = rows.find((row) => row.telefonoNorm === phoneNorm);
    if (byPhone) return byPhone;
  }
  if (!emailNorm) return undefined;
  return rows.find((row) => row.emailNorm === emailNorm);
}

export function fillBlanks(
  current: Record<string, string>,
  incoming: Record<string, string>,
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const key of Object.keys(incoming)) {
    const existing = current[key]?.trim() ?? "";
    const next = incoming[key]?.trim() ?? "";
    if (!existing && next) patch[key] = next;
  }
  return patch;
}

export function labelStato(value: string | null | undefined): string {
  return STATI.find((item) => item.value === value)?.label ?? "—";
}

export function labelCanale(value: string | null | undefined): string {
  return CANALI.find((item) => item.value === value)?.label ?? "—";
}

export function formatDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export function validateRichiesta(input: Loose): Result<RichiestaValue> {
  const cliente = readCliente(input);
  if (!cliente.ok) return cliente;
  if (!cliente.value.telefonoNorm && !cliente.value.emailNorm) {
    return { ok: false, error: "Serve un telefono o un'email." };
  }
  const canale = readCanale(input.canale);
  if (!canale.ok) return canale;
  const problema = readText(input.problema, LONG_MAX);
  if (!problema.ok) return problema;
  return {
    ok: true,
    value: {
      cliente: cliente.value,
      intervento: { problema: problema.value, canale: canale.value, stato: "nuovo" },
    },
  };
}

export function validateCliente(input: Loose): Result<ClienteFields> {
  return readCliente(input);
}

export function interventoHasContent(input: Loose): boolean {
  return [input.data, input.problema, input.lavoro, input.nota, input.canale].some(
    (value) => (value ?? "").trim().length > 0,
  );
}

export function validateIntervento(input: Loose): Result<InterventoFields> {
  const stato = readStato(input.stato);
  if (!stato.ok) return stato;
  const canale = readCanale(input.canale);
  if (!canale.ok) return canale;
  const problema = readText(input.problema, LONG_MAX);
  if (!problema.ok) return problema;
  const lavoro = readText(input.lavoro, LONG_MAX);
  if (!lavoro.ok) return lavoro;
  const note = readText(input.nota ?? input.note, LONG_MAX);
  if (!note.ok) return note;
  const data = (input.data ?? "").trim();
  if (data && !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    return { ok: false, error: "La data non è valida." };
  }
  if (!data && !problema.value && !lavoro.value && !note.value) {
    return {
      ok: false,
      error: "Indica almeno la data, il problema, il lavoro svolto o una nota.",
    };
  }
  return {
    ok: true,
    value: {
      data: data || null,
      problema: problema.value,
      lavoro: lavoro.value,
      stato: stato.value,
      canale: canale.value,
      note: note.value,
    },
  };
}

function readCliente(input: Loose): Result<ClienteFields> {
  const nome = readText(input.nome, NOME_MAX);
  if (!nome.ok) return nome;
  if (!nome.value) return { ok: false, error: "Il nome è obbligatorio." };

  const telefono = readText(input.telefono, SHORT_MAX);
  if (!telefono.ok) return telefono;
  const email = readText(input.email, SHORT_MAX);
  if (!email.ok) return email;
  const indirizzo = readText(input.indirizzo, SHORT_MAX);
  if (!indirizzo.ok) return indirizzo;
  const comune = readText(input.comune, SHORT_MAX);
  if (!comune.ok) return comune;
  const marca = readText(input.marca, SHORT_MAX);
  if (!marca.ok) return marca;
  const modello = readText(input.modello, SHORT_MAX);
  if (!modello.ok) return modello;
  const note = readText(input.note, LONG_MAX);
  if (!note.ok) return note;

  const emailNorm = normalizeEmail(email.value);
  if (emailNorm && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNorm)) {
    return { ok: false, error: "L'email non è valida." };
  }

  return {
    ok: true,
    value: {
      nome: nome.value,
      telefono: telefono.value,
      email: email.value.trim(),
      indirizzo: indirizzo.value,
      comune: comune.value,
      marca: marca.value,
      modello: modello.value,
      note: note.value,
      telefonoNorm: normalizePhone(telefono.value),
      emailNorm,
    },
  };
}

function readText(value: string | undefined, max: number): Result<string> {
  const text = (value ?? "").trim();
  if (text.length > max) return { ok: false, error: "Uno dei campi supera la lunghezza massima." };
  return { ok: true, value: text };
}

function readCanale(value: string | undefined): Result<Canale | null> {
  const text = (value ?? "").trim();
  if (!text) return { ok: true, value: null };
  if (CANALI.some((item) => item.value === text)) return { ok: true, value: text as Canale };
  return { ok: false, error: "Il canale deve essere mail, cellulare o telefono." };
}

export function mappaRichiestaSito(input: {
  nome: string;
  recapito: string;
  preferenza: string;
  zona: string;
  descrizione: string;
}): Result<RichiestaValue> {
  const email = input.preferenza === "email";
  const canale =
    input.preferenza === "email" ? "mail" : input.preferenza === "fisso" ? "telefono" : input.preferenza;
  return validateRichiesta({
    nome: input.nome,
    email: email ? input.recapito : "",
    telefono: email ? "" : input.recapito,
    comune: input.zona,
    problema: input.descrizione,
    canale,
  });
}

function readStato(value: string | undefined): Result<Stato> {
  const text = (value ?? "").trim() || "nuovo";
  if (STATI.some((item) => item.value === text)) return { ok: true, value: text as Stato };
  return { ok: false, error: "Lo stato non è valido." };
}
