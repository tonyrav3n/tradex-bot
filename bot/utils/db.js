import dotenv from "dotenv";
import { Pool } from "pg";
import fs from "fs";
import path from "path";
import crypto from "crypto";

dotenv.config();

// Default migrations directory: <repo>/bot/migrations
const DEFAULT_MIGRATIONS_DIR = path.resolve(process.cwd(), "bot", "migrations");

let poolInstance = null;

/**
 * Resolve SSL config for Postgres (Heroku/production-friendly).
 * - If DATABASE_SSL=true, or NODE_ENV=production, or DATABASE_URL contains sslmode=require
 *   then enable SSL with rejectUnauthorized=false
 */
function resolveSslConfig(databaseUrl) {
  const explicit = String(process.env.DATABASE_SSL || "").toLowerCase();
  const isProduction = process.env.NODE_ENV === "production";
  const urlRequiresSsl =
    typeof databaseUrl === "string" &&
    /sslmode=require/i.test(databaseUrl || "");

  const shouldEnable = explicit === "true" || isProduction || urlRequiresSsl;

  return shouldEnable ? { rejectUnauthorized: false } : undefined;
}

/**
 * Lazily create and return a shared pg.Pool.
 */
export function getPool() {
  if (poolInstance) return poolInstance;

  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || "";

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL (or POSTGRES_URL) is not set. Configure your Postgres connection string.",
    );
  }

  poolInstance = new Pool({
    connectionString,
    max: parseInt(process.env.PGPOOL_MAX || "10", 10),
    idleTimeoutMillis: parseInt(process.env.PGPOOL_IDLE || "30000", 10),
    connectionTimeoutMillis: parseInt(
      process.env.PGPOOL_CONNECT_TIMEOUT || "10000",
      10,
    ),
    ssl: resolveSslConfig(connectionString),
  });

  poolInstance.once("connect", () => {
    console.log("✅ Connected to PostgreSQL");
  });
  poolInstance.on("error", (err) => {
    console.error("❌ PostgreSQL pool error:", err);
  });

  return poolInstance;
}

/**
 * Close the shared pg.Pool (useful for graceful shutdowns).
 */
export async function closePool() {
  if (poolInstance) {
    try {
      await poolInstance.end();
    } catch {
      // ignore
    } finally {
      poolInstance = null;
    }
  }
}

/**
 * Thin query wrapper using the shared pool.
 * @param {string} text
 * @param {any[]} [params]
 */
export async function query(text, params) {
  const pool = getPool();
  return pool.query(text, params);
}

/**
 * Run a callback inside a single transaction.
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn
 */
export async function withTransaction(fn) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Ensure the migrations table exists.
 * @param {import('pg').PoolClient} client
 */
async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      checksum TEXT
    )
  `);
}

/**
 * Load already applied migrations (name -> checksum).
 * @param {import('pg').PoolClient} client
 * @returns {Promise<Map<string, string | null>>}
 */
async function getAppliedMigrations(client) {
  const res = await client.query(
    `SELECT name, checksum FROM migrations ORDER BY id ASC`,
  );
  const map = new Map();
  for (const row of res.rows) {
    map.set(row.name, row.checksum || null);
  }
  return map;
}

/**
 * Compute a checksum for a given SQL string.
 * @param {string} sql
 */
function checksum(sql) {
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

/**
 * Discover .sql migration files in a directory, sorted by filename ASC.
 * File naming convention suggestion: 20250101_120000_init.sql
 * @param {string} dir
 * @returns {{ name: string, sql: string, checksum: string }[]}
 */
function loadMigrationFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const files = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        f.toLowerCase().endsWith(".sql") &&
        !f.startsWith(".") &&
        fs.statSync(path.join(dir, f)).isFile(),
    )
    .sort((a, b) => a.localeCompare(b));

  return files.map((file) => {
    const fullPath = path.join(dir, file);
    const sql = fs.readFileSync(fullPath, "utf8");
    return { name: file, sql, checksum: checksum(sql) };
  });
}

/**
 * Apply a single migration inside a transaction and record it.
 * @param {import('pg').PoolClient} client
 * @param {{ name: string, sql: string, checksum: string }} migration
 */
async function applyMigration(client, migration) {
  console.log(`📦 Applying migration: ${migration.name}`);
  await client.query("BEGIN");
  try {
    // Execute migration SQL (allowing multiple statements)
    await client.query(migration.sql);

    await client.query(
      `INSERT INTO migrations (name, checksum) VALUES ($1, $2)`,
      [migration.name, migration.checksum],
    );

    await client.query("COMMIT");
    console.log(`✅ Migration applied: ${migration.name}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`❌ Migration failed: ${migration.name}`, err);
    throw err;
  }
}

/**
 * Run all pending migrations from the migrations directory.
 * - Creates migrations table if missing
 * - Skips already applied migrations
 * - Warns if checksums differ for already-applied names
 *
 * @param {{ dir?: string }} [options]
 */
export async function runMigrations(options = {}) {
  const dir = options.dir || DEFAULT_MIGRATIONS_DIR;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await ensureMigrationsTable(client);

    const applied = await getAppliedMigrations(client);
    const files = loadMigrationFiles(dir);

    for (const mig of files) {
      if (applied.has(mig.name)) {
        const prev = applied.get(mig.name);
        if (prev && prev !== mig.checksum) {
          console.warn(
            `⚠️ Migration '${mig.name}' checksum changed. Already applied: ${prev}, now: ${mig.checksum}. Skipping.`,
          );
        } else {
          console.log(`⏭️  Skipping already applied: ${mig.name}`);
        }
        continue;
      }

      await applyMigration(client, mig);
    }

    if (files.length === 0) {
      console.log(`ℹ️ No migrations found in: ${dir}`);
    }
  } finally {
    client.release();
  }
}

/**
 * Initialize DB and run migrations.
 * Call this once at startup (e.g., from bot bootstrap).
 *
 * @param {{ dir?: string }} [options]
 */
export async function initDb(options = {}) {
  // Ensure pool is created and reachable (connect once)
  getPool();
  // Run migrations
  await runMigrations(options);
  console.log("✅ Database initialized");
}

export default {
  getPool,
  closePool,
  query,
  withTransaction,
  runMigrations,
  initDb,
};
