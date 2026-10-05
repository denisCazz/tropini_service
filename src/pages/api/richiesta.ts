import type { APIRoute } from "astro";
import { Resend } from "resend";
import { registerRichiesta } from "../../lib/admin/db";
import { mappaRichiestaSito, todayInRome } from "../../lib/admin/logic";
import {
  etichettaPreferenza,
  etichettaProblema,
  etichettaStufa,
  validaRichiesta,
} from "../../lib/richiesta";

const FINESTRA_MS = 10 * 60 * 1000;
const MASSIMO = 5;
const richieste = new Map<string, number[]>();
const ERRORE_INVIO = "Non siamo riusciti a inviare. Chiama il 334 2968625 o il 0172 382695.";
const ERRORE_LIMITE = "Troppe richieste. Chiama il 334 2968625 o il 0172 382695.";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function ipDi(request: Request, clientAddress: () => string): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const primo = forwarded.split(",")[0]?.trim();
    if (primo) return primo;
  }
  try {
    return clientAddress() || "sconosciuto";
  } catch {
    return "sconosciuto";
  }
}

function consenti(ip: string): boolean {
  const now = Date.now();
  const recenti = (richieste.get(ip) ?? []).filter((istante) => now - istante < FINESTRA_MS);
  if (recenti.length >= MASSIMO) {
    richieste.set(ip, recenti);
    return false;
  }
  recenti.push(now);
  richieste.set(ip, recenti);
  return true;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!consenti(ipDi(request, () => clientAddress))) {
    return json({ ok: false, errore: ERRORE_LIMITE }, 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, errore: "Richiesta non valida." }, 400);
  }

  const esito = validaRichiesta(body);
  if (esito.ok && esito.ignora) return json({ ok: true }, 200);
  if (!esito.ok) return json({ ok: false, campi: esito.campi }, 400);

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  const to = process.env.RICHIESTA_TO;
  if (!apiKey || !from || !to) return json({ ok: false, errore: ERRORE_INVIO }, 500);

  const { dati } = esito;
  const resend = new Resend(apiKey);
  const inviata = await resend.emails.send({
    from,
    to,
    subject: `Richiesta assistenza — ${etichettaProblema(dati.problema)} — ${dati.zona}`,
    text: [
      "Nuova richiesta di assistenza",
      "",
      `Nome: ${dati.nome}`,
      `Recapito: ${dati.recapito}`,
      `Preferenza: ${etichettaPreferenza(dati.preferenza)}`,
      `Stufa: ${etichettaStufa(dati.stufa)}`,
      `Problema: ${etichettaProblema(dati.problema)}`,
      `Zona: ${dati.zona}`,
      `Note: ${dati.note || "—"}`,
    ].join("\n"),
    ...(dati.preferenza === "email" ? { replyTo: dati.recapito } : {}),
  });

  if (inviata.error) return json({ ok: false, errore: ERRORE_INVIO }, 500);

  const descrizione = [etichettaStufa(dati.stufa), etichettaProblema(dati.problema), dati.note]
    .filter((parte) => parte.length > 0)
    .join(" — ");
  const anagrafica = mappaRichiestaSito({
    nome: dati.nome,
    recapito: dati.recapito,
    preferenza: dati.preferenza,
    zona: dati.zona,
    descrizione,
  });
  if (anagrafica.ok) {
    try {
      await registerRichiesta(anagrafica.value, todayInRome());
    } catch (error) {
      console.error("Anagrafica non aggiornata.", error);
    }
  }

  return json({ ok: true }, 200);
};
