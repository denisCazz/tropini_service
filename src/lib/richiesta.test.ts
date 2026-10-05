import assert from "node:assert/strict";
import test from "node:test";
import { validaRichiesta } from "./richiesta.ts";

const valida = {
  stufa: "pellet",
  problema: "non-parte",
  zona: "Savigliano",
  nome: "Maria Rossi",
  recapito: "maria@example.com",
  preferenza: "email",
  note: "",
  azienda: "",
};

test("accetta una richiesta completa", () => {
  const esito = validaRichiesta(valida);
  assert.equal(esito.ok, true);
  if (!esito.ok || esito.ignora) throw new Error("attesa richiesta valida");
  assert.equal(esito.dati.nome, "Maria Rossi");
  assert.equal(esito.dati.zona, "Savigliano");
  assert.equal(esito.dati.preferenza, "email");
});

test("rifiuta un nome troppo corto", () => {
  const esito = validaRichiesta({ ...valida, nome: "A" });
  assert.equal(esito.ok, false);
  if (esito.ok) return;
  assert.match(esito.campi.nome ?? "", /nome/i);
});

test("chiede un'email quando la preferenza è email", () => {
  const esito = validaRichiesta({ ...valida, recapito: "non-email" });
  assert.equal(esito.ok, false);
  if (esito.ok) return;
  assert.equal(esito.campi.recapito, "Scrivi un indirizzo email valido.");
});

test("chiede un telefono quando la preferenza è cellulare o fisso", () => {
  for (const preferenza of ["cellulare", "fisso"]) {
    const esito = validaRichiesta({ ...valida, preferenza, recapito: "abc" });
    assert.equal(esito.ok, false);
    if (esito.ok) continue;
    assert.equal(esito.campi.recapito, "Scrivi un numero di telefono valido.");
  }

  const esito = validaRichiesta({
    ...valida,
    preferenza: "fisso",
    recapito: "0172 382695",
  });
  assert.equal(esito.ok, true);
});

test("ignora il honeypot senza errori di campo", () => {
  const esito = validaRichiesta({ ...valida, nome: "", azienda: "bot" });
  assert.deepEqual(esito, { ok: true, ignora: true });
});

test("rifiuta note troppo lunghe", () => {
  const esito = validaRichiesta({ ...valida, note: "a".repeat(1001) });
  assert.equal(esito.ok, false);
  if (esito.ok) return;
  assert.equal(esito.campi.note, "Il messaggio è troppo lungo.");
});
