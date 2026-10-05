import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseCliente,
  cookieSecure,
  fillBlanks,
  missingAdminEnv,
  missingDatabaseEnv,
  escapeLike,
  isUuid,
  normalizeEmail,
  normalizePhone,
  passwordMatches,
  signSession,
  mappaRichiestaSito,
  todayInRome,
  validateCliente,
  validateIntervento,
  validateRichiesta,
  verifySession,
} from "./logic.ts";

const SECRET = "segreto-di-test";

describe("normalizePhone", () => {
  it("tiene solo le cifre", () => {
    assert.equal(normalizePhone("334 296 8625"), "3342968625");
  });

  it("toglie il prefisso +39 e 0039", () => {
    assert.equal(normalizePhone("+39 334 2968625"), "3342968625");
    assert.equal(normalizePhone("0039 3342968625"), "3342968625");
  });

  it("lascia vuoto un valore senza cifre", () => {
    assert.equal(normalizePhone("  "), "");
  });
});

describe("escapeLike", () => {
  it("neutralizza i caratteri jolly", () => {
    assert.equal(escapeLike("100%_a\\b"), "100\\%\\_a\\\\b");
  });
});

describe("isUuid", () => {
  it("riconosce un uuid", () => {
    assert.equal(isUuid("550e8400-e29b-41d4-a716-446655440000"), true);
    assert.equal(isUuid("nope"), false);
  });
});

describe("normalizeEmail", () => {
  it("fa trim e minuscolo", () => {
    assert.equal(normalizeEmail("  Mario@Mail.com "), "mario@mail.com");
  });
});

describe("validateRichiesta", () => {
  it("rifiuta un nome vuoto", () => {
    const result = validateRichiesta({ telefono: "3331234567" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /nome/i);
  });

  it("rifiuta una richiesta senza telefono e senza email", () => {
    const result = validateRichiesta({ nome: "Mario Rossi" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /telefono|email/i);
  });

  it("accetta nome e telefono e normalizza i contatti", () => {
    const result = validateRichiesta({
      nome: " Mario Rossi ",
      telefono: "+39 333 1234567",
      email: "Mario@Mail.com",
      marca: "Extraflame",
      problema: "Non parte",
      canale: "cellulare",
    });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.cliente.nome, "Mario Rossi");
      assert.equal(result.value.cliente.telefonoNorm, "3331234567");
      assert.equal(result.value.cliente.emailNorm, "mario@mail.com");
      assert.equal(result.value.cliente.marca, "Extraflame");
      assert.equal(result.value.intervento.problema, "Non parte");
      assert.equal(result.value.intervento.canale, "cellulare");
      assert.equal(result.value.intervento.stato, "nuovo");
    }
  });

  it("rifiuta un canale sconosciuto", () => {
    const result = validateRichiesta({
      nome: "Mario",
      telefono: "3331234567",
      canale: "whatsapp",
    });
    assert.equal(result.ok, false);
  });

  it("rifiuta un'email malformata", () => {
    const result = validateRichiesta({ nome: "Mario", email: "non-una-mail" });
    assert.equal(result.ok, false);
  });
});

describe("validateCliente", () => {
  it("richiede il nome e permette un cliente senza contatti", () => {
    assert.equal(validateCliente({ nome: "Anna" }).ok, true);
    assert.equal(validateCliente({ nome: "  " }).ok, false);
  });
});

describe("validateIntervento", () => {
  it("accetta una visita con sola data", () => {
    const result = validateIntervento({ data: "2026-10-05", stato: "programmato" });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value.stato, "programmato");
  });

  it("rifiuta un intervento senza alcun contenuto", () => {
    assert.equal(validateIntervento({ stato: "nuovo" }).ok, false);
  });

  it("rifiuta uno stato sconosciuto", () => {
    const result = validateIntervento({ problema: "fumo", stato: "chiuso" });
    assert.equal(result.ok, false);
  });
});

describe("chooseCliente", () => {
  const phone = { id: "1", telefonoNorm: "3331234567", emailNorm: "" };
  const email = { id: "2", telefonoNorm: "", emailNorm: "mario@mail.com" };

  it("preferisce il telefono quando telefono e email puntano a schede diverse", () => {
    const chosen = chooseCliente([email, phone], "3331234567", "mario@mail.com");
    assert.equal(chosen?.id, "1");
  });

  it("usa l'email se il telefono non coincide", () => {
    const chosen = chooseCliente([email, phone], "", "mario@mail.com");
    assert.equal(chosen?.id, "2");
  });

  it("non abbina nulla se i contatti sono vuoti", () => {
    assert.equal(chooseCliente([phone, email], "", ""), undefined);
  });
});

describe("fillBlanks", () => {
  it("compila solo i campi ancora vuoti", () => {
    const patch = fillBlanks(
      { nome: "Mario", telefono: "", email: "mario@mail.com", comune: "" },
      { nome: "Altro", telefono: "333", email: "nuovo@mail.com", comune: "Cuneo" },
    );
    assert.deepEqual(patch, { telefono: "333", comune: "Cuneo" });
  });
});

describe("session", () => {
  it("accetta un token appena firmato", () => {
    const token = signSession(SECRET, 1_000);
    assert.equal(verifySession(token, SECRET, 1_000), true);
  });

  it("rifiuta un token alterato o scaduto", () => {
    const token = signSession(SECRET, 1_000);
    assert.equal(verifySession(`${token}x`, SECRET, 1_000), false);
    assert.equal(verifySession(token, SECRET, 1_000 + 8 * 24 * 60 * 60 * 1000), false);
  });

  it("confronta la password senza accettare una stringa diversa", () => {
    assert.equal(passwordMatches("officina", "officina"), true);
    assert.equal(passwordMatches("officina", "altro"), false);
    assert.equal(passwordMatches("breve", "password-lunga"), false);
  });
});

describe("config", () => {
  it("elenca le variabili database mancanti", () => {
    assert.deepEqual(
      missingDatabaseEnv({ DATABASE_HOST: "db.example", DATABASE_USER: "tropini" }),
      ["DATABASE_PASSWORD", "DATABASE_NAME"],
    );
  });

  it("elenca le variabili admin mancanti", () => {
    assert.deepEqual(missingAdminEnv({}), ["ADMIN_PASSWORD", "ADMIN_SESSION_SECRET"]);
  });

  it("decide il flag secure del cookie", () => {
    assert.equal(cookieSecure("https:", undefined), true);
    assert.equal(cookieSecure("http:", undefined), false);
    assert.equal(cookieSecure("http:", "true"), true);
    assert.equal(cookieSecure("https:", "false"), false);
  });

  it("formatta la data di Roma", () => {
    assert.equal(todayInRome(new Date("2026-10-05T00:30:00.000Z")), "2026-10-05");
  });
});

describe("mappaRichiestaSito", () => {
  it("mette l'email e il canale mail", () => {
    const result = mappaRichiestaSito({
      nome: "Maria Rossi",
      recapito: "maria@example.com",
      preferenza: "email",
      zona: "Savigliano",
      descrizione: "Stufa a pellet — Non parte",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.cliente.emailNorm, "maria@example.com");
    assert.equal(result.value.cliente.telefonoNorm, "");
    assert.equal(result.value.cliente.comune, "Savigliano");
    assert.equal(result.value.intervento.canale, "mail");
    assert.equal(result.value.intervento.problema, "Stufa a pellet — Non parte");
  });

  it("mette il telefono per cellulare e fisso", () => {
    const cellulare = mappaRichiestaSito({
      nome: "Maria Rossi",
      recapito: "333 1234567",
      preferenza: "cellulare",
      zona: "Cuneo",
      descrizione: "Fumo",
    });
    assert.equal(cellulare.ok, true);
    if (cellulare.ok) {
      assert.equal(cellulare.value.cliente.telefonoNorm, "3331234567");
      assert.equal(cellulare.value.intervento.canale, "cellulare");
    }

    const fisso = mappaRichiestaSito({
      nome: "Maria Rossi",
      recapito: "0172 382695",
      preferenza: "fisso",
      zona: "Cuneo",
      descrizione: "Fumo",
    });
    assert.equal(fisso.ok, true);
    if (fisso.ok) assert.equal(fisso.value.intervento.canale, "telefono");
  });
});
