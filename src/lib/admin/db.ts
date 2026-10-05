import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  chooseCliente,
  escapeLike,
  fillBlanks,
  missingDatabaseEnv,
  normalizePhone,
  STATI,
  type ClienteFields,
  type InterventoFields,
  type RichiestaValue,
} from "./logic.ts";

const { Pool } = pg;

pg.types.setTypeParser(1082, (value) => value);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS clienti (
  id UUID PRIMARY KEY,
  nome TEXT NOT NULL,
  telefono TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  indirizzo TEXT NOT NULL DEFAULT '',
  comune TEXT NOT NULL DEFAULT '',
  marca_stufa TEXT NOT NULL DEFAULT '',
  modello_stufa TEXT NOT NULL DEFAULT '',
  origine TEXT NOT NULL CHECK (origine IN ('sito', 'manuale')),
  note TEXT NOT NULL DEFAULT '',
  telefono_norm TEXT NOT NULL DEFAULT '',
  email_norm TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS interventi (
  id UUID PRIMARY KEY,
  cliente_id UUID NOT NULL REFERENCES clienti (id) ON DELETE CASCADE,
  data DATE,
  problema TEXT NOT NULL DEFAULT '',
  lavoro TEXT NOT NULL DEFAULT '',
  stato TEXT NOT NULL CHECK (stato IN ('nuovo', 'programmato', 'in_corso', 'completato', 'annullato')),
  canale TEXT CHECK (canale IN ('mail', 'cellulare', 'telefono')),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clienti_telefono_norm_idx ON clienti (telefono_norm);
CREATE INDEX IF NOT EXISTS clienti_email_norm_idx ON clienti (email_norm);
CREATE INDEX IF NOT EXISTS clienti_updated_idx ON clienti (updated_at DESC);
CREATE INDEX IF NOT EXISTS interventi_cliente_idx ON interventi (cliente_id, created_at DESC);
`;

const BLANK_COLUMNS: Record<string, string> = {
  telefono: "telefono",
  email: "email",
  indirizzo: "indirizzo",
  comune: "comune",
  marca: "marca_stufa",
  modello: "modello_stufa",
  note: "note",
};

export class ConfigError extends Error {}

export class DbFailure extends Error {}

export type ClienteRecord = ClienteFields & {
  id: string;
  origine: "sito" | "manuale";
  createdAt: Date;
  updatedAt: Date;
};

export type InterventoRecord = InterventoFields & {
  id: string;
  createdAt: Date;
};

export type ClienteListItem = {
  id: string;
  nome: string;
  telefono: string;
  comune: string;
  origine: "sito" | "manuale";
  ultimoStato: string | null;
  ultimaData: string | null;
  ultimoProblema: string | null;
};

export type ClienteList = {
  rows: ClienteListItem[];
  total: number;
  page: number;
  pageSize: number;
};

type ClienteDb = {
  id: string;
  nome: string;
  telefono: string;
  email: string;
  indirizzo: string;
  comune: string;
  marca_stufa: string;
  modello_stufa: string;
  origine: "sito" | "manuale";
  note: string;
  telefono_norm: string;
  email_norm: string;
  created_at: Date;
  updated_at: Date;
};

type InterventoDb = {
  id: string;
  data: string | null;
  problema: string;
  lavoro: string;
  stato: InterventoFields["stato"];
  canale: InterventoFields["canale"];
  note: string;
  created_at: Date;
};

let pool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

function getPool(): pg.Pool {
  const missing = missingDatabaseEnv(process.env);
  if (missing.length) {
    throw new ConfigError(`Mancano le variabili: ${missing.join(", ")}.`);
  }
  if (!pool) {
    pool = new Pool({
      host: process.env.DATABASE_HOST,
      port: Number(process.env.DATABASE_PORT || 5432),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      database: process.env.DATABASE_NAME,
      max: 10,
    });
  }
  return pool;
}

function wrap(error: unknown): Error {
  if (error instanceof ConfigError || error instanceof DbFailure) return error;
  console.error(error);
  return new DbFailure(
    "Database non raggiungibile. Controlla DATABASE_HOST, DATABASE_USER, DATABASE_PASSWORD e DATABASE_NAME.",
  );
}

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = getPool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((error: unknown) => {
        schemaReady = null;
        throw wrap(error);
      });
  }
  return schemaReady;
}

export async function listClienti(query: string, stato: string, page: number): Promise<ClienteList> {
  const pageSize = 40;
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const text = query.trim();
  const like = escapeLike(text);
  const phone = normalizePhone(text);
  const status = STATI.some((item) => item.value === stato) ? stato : "";

  try {
    await ensureSchema();
    const filter = [
      like,
      phone,
      status,
    ];
    const where = `
       FROM clienti c
       LEFT JOIN LATERAL (
         SELECT stato, data, problema
         FROM interventi
         WHERE cliente_id = c.id
         ORDER BY created_at DESC
         LIMIT 1
       ) i ON true
       WHERE (
         $1 = ''
         OR c.nome ILIKE '%' || $1 || '%' ESCAPE '\\'
         OR c.telefono ILIKE '%' || $1 || '%' ESCAPE '\\'
         OR c.comune ILIKE '%' || $1 || '%' ESCAPE '\\'
         OR ($2 <> '' AND c.telefono_norm LIKE '%' || $2 || '%')
       )
       AND ($3 = '' OR i.stato = $3)`;
    const counted = await getPool().query<{ total: number }>(
      `SELECT COUNT(*)::int AS total ${where}`,
      filter,
    );
    const result = await getPool().query<{
      id: string;
      nome: string;
      telefono: string;
      comune: string;
      origine: "sito" | "manuale";
      ultimo_stato: string | null;
      ultima_data: string | null;
      ultimo_problema: string | null;
    }>(
      `SELECT c.id, c.nome, c.telefono, c.comune, c.origine,
              i.stato AS ultimo_stato, i.data AS ultima_data, i.problema AS ultimo_problema
       ${where}
       ORDER BY c.updated_at DESC
       LIMIT $4 OFFSET $5`,
      [...filter, pageSize, (safePage - 1) * pageSize],
    );
    return {
      rows: result.rows.map((row) => ({
        id: row.id,
        nome: row.nome,
        telefono: row.telefono,
        comune: row.comune,
        origine: row.origine,
        ultimoStato: row.ultimo_stato,
        ultimaData: row.ultima_data,
        ultimoProblema: row.ultimo_problema,
      })),
      total: counted.rows[0]?.total ?? 0,
      page: safePage,
      pageSize,
    };
  } catch (error) {
    throw wrap(error);
  }
}

export async function getCliente(id: string): Promise<ClienteRecord | null> {
  try {
    await ensureSchema();
    const result = await getPool().query<ClienteDb>("SELECT * FROM clienti WHERE id = $1", [id]);
    const row = result.rows[0];
    return row ? mapCliente(row) : null;
  } catch (error) {
    throw wrap(error);
  }
}

export async function listInterventi(clienteId: string): Promise<InterventoRecord[]> {
  try {
    await ensureSchema();
    const result = await getPool().query<InterventoDb>(
      `SELECT id, data, problema, lavoro, stato, canale, note, created_at
       FROM interventi
       WHERE cliente_id = $1
       ORDER BY created_at DESC`,
      [clienteId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      data: row.data,
      problema: row.problema,
      lavoro: row.lavoro,
      stato: row.stato,
      canale: row.canale,
      note: row.note,
      createdAt: row.created_at,
    }));
  } catch (error) {
    throw wrap(error);
  }
}

export async function findClienteByContatti(
  phoneNorm: string,
  emailNorm: string,
): Promise<{ id: string } | null> {
  if (!phoneNorm && !emailNorm) return null;
  try {
    await ensureSchema();
    const result = await getPool().query<{ id: string; telefono_norm: string; email_norm: string }>(
      `SELECT id, telefono_norm, email_norm
       FROM clienti
       WHERE ($1 <> '' AND telefono_norm = $1) OR ($2 <> '' AND email_norm = $2)
       ORDER BY updated_at DESC`,
      [phoneNorm, emailNorm],
    );
    const chosen = chooseCliente(
      result.rows.map((row) => ({
        id: row.id,
        telefonoNorm: row.telefono_norm,
        emailNorm: row.email_norm,
      })),
      phoneNorm,
      emailNorm,
    );
    return chosen ? { id: chosen.id } : null;
  } catch (error) {
    throw wrap(error);
  }
}

export async function createCliente(
  fields: ClienteFields,
  intervento: InterventoFields | null,
): Promise<string> {
  const id = randomUUID();
  const client = await connect();
  try {
    await client.query("BEGIN");
    await insertCliente(client, id, fields, "manuale");
    if (intervento) await insertIntervento(client, id, intervento);
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw wrap(error);
  } finally {
    client.release();
  }
}

export async function updateCliente(id: string, fields: ClienteFields): Promise<void> {
  try {
    await ensureSchema();
    await getPool().query(
      `UPDATE clienti
       SET nome = $2, telefono = $3, email = $4, indirizzo = $5, comune = $6,
           marca_stufa = $7, modello_stufa = $8, note = $9,
           telefono_norm = $10, email_norm = $11, updated_at = now()
       WHERE id = $1`,
      [
        id,
        fields.nome,
        fields.telefono,
        fields.email,
        fields.indirizzo,
        fields.comune,
        fields.marca,
        fields.modello,
        fields.note,
        fields.telefonoNorm,
        fields.emailNorm,
      ],
    );
  } catch (error) {
    throw wrap(error);
  }
}

export async function addIntervento(clienteId: string, fields: InterventoFields): Promise<void> {
  const client = await connect();
  try {
    await client.query("BEGIN");
    await insertIntervento(client, clienteId, fields);
    await client.query("UPDATE clienti SET updated_at = now() WHERE id = $1", [clienteId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw wrap(error);
  } finally {
    client.release();
  }
}

export async function registerRichiesta(
  value: RichiestaValue,
  data: string,
): Promise<{ clienteId: string; interventoId: string; esistente: boolean }> {
  const client = await connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<ClienteDb>(
      `SELECT *
       FROM clienti
       WHERE ($1 <> '' AND telefono_norm = $1) OR ($2 <> '' AND email_norm = $2)
       ORDER BY updated_at DESC`,
      [value.cliente.telefonoNorm, value.cliente.emailNorm],
    );
    const existing = chooseCliente(
      found.rows.map((row) => ({
        id: row.id,
        telefonoNorm: row.telefono_norm,
        emailNorm: row.email_norm,
        row,
      })),
      value.cliente.telefonoNorm,
      value.cliente.emailNorm,
    );

    let clienteId: string;
    let esistente = false;
    if (existing) {
      esistente = true;
      clienteId = existing.id;
      await fillEmptyFields(client, existing.row, value.cliente);
    } else {
      clienteId = randomUUID();
      await insertCliente(client, clienteId, value.cliente, "sito");
    }

    const interventoId = randomUUID();
    await insertIntervento(client, clienteId, {
      data,
      problema: value.intervento.problema,
      lavoro: "",
      stato: "nuovo",
      canale: value.intervento.canale,
      note: "",
    }, interventoId);
    await client.query("UPDATE clienti SET updated_at = now() WHERE id = $1", [clienteId]);
    await client.query("COMMIT");
    return { clienteId, interventoId, esistente };
  } catch (error) {
    await client.query("ROLLBACK");
    throw wrap(error);
  } finally {
    client.release();
  }
}

async function connect(): Promise<pg.PoolClient> {
  await ensureSchema();
  try {
    return await getPool().connect();
  } catch (error) {
    throw wrap(error);
  }
}

async function insertCliente(
  client: pg.PoolClient,
  id: string,
  fields: ClienteFields,
  origine: "sito" | "manuale",
): Promise<void> {
  await client.query(
    `INSERT INTO clienti (
       id, nome, telefono, email, indirizzo, comune, marca_stufa, modello_stufa,
       origine, note, telefono_norm, email_norm
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      id,
      fields.nome,
      fields.telefono,
      fields.email,
      fields.indirizzo,
      fields.comune,
      fields.marca,
      fields.modello,
      origine,
      fields.note,
      fields.telefonoNorm,
      fields.emailNorm,
    ],
  );
}

async function insertIntervento(
  client: pg.PoolClient,
  clienteId: string,
  fields: InterventoFields,
  id = randomUUID(),
): Promise<void> {
  await client.query(
    `INSERT INTO interventi (id, cliente_id, data, problema, lavoro, stato, canale, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      clienteId,
      fields.data,
      fields.problema,
      fields.lavoro,
      fields.stato,
      fields.canale,
      fields.note,
    ],
  );
}

async function fillEmptyFields(
  client: pg.PoolClient,
  row: ClienteDb,
  incoming: ClienteFields,
): Promise<void> {
  const patch = fillBlanks(
    {
      telefono: row.telefono,
      email: row.email,
      indirizzo: row.indirizzo,
      comune: row.comune,
      marca: row.marca_stufa,
      modello: row.modello_stufa,
      note: row.note,
    },
    {
      telefono: incoming.telefono,
      email: incoming.email,
      indirizzo: incoming.indirizzo,
      comune: incoming.comune,
      marca: incoming.marca,
      modello: incoming.modello,
      note: incoming.note,
    },
  );
  const sets: string[] = [];
  const values: string[] = [];
  for (const [key, column] of Object.entries(BLANK_COLUMNS)) {
    if (!(key in patch)) continue;
    values.push(patch[key]);
    sets.push(`${column} = $${values.length}`);
  }
  if ("telefono" in patch) {
    values.push(incoming.telefonoNorm);
    sets.push(`telefono_norm = $${values.length}`);
  }
  if ("email" in patch) {
    values.push(incoming.emailNorm);
    sets.push(`email_norm = $${values.length}`);
  }
  if (!sets.length) return;
  values.push(row.id);
  await client.query(
    `UPDATE clienti SET ${sets.join(", ")} WHERE id = $${values.length}`,
    values,
  );
}

function mapCliente(row: ClienteDb): ClienteRecord {
  return {
    id: row.id,
    nome: row.nome,
    telefono: row.telefono,
    email: row.email,
    indirizzo: row.indirizzo,
    comune: row.comune,
    marca: row.marca_stufa,
    modello: row.modello_stufa,
    note: row.note,
    telefonoNorm: row.telefono_norm,
    emailNorm: row.email_norm,
    origine: row.origine,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
