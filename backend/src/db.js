const path = require('path');
const fs = require('fs');
const config = require('./config');

function createSqliteDb() {
  const Database = require('better-sqlite3');
  const dbPath = path.resolve(config.databasePath);
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS local_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      auth_user_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      email TEXT,
      telefono TEXT,
      empresa TEXT,
      notas TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const prepare = (sql) => {
    const statement = db.prepare(sql);
    return {
      all: (...args) => statement.all(...args),
      get: (...args) => statement.get(...args),
      run: (...args) => statement.run(...args),
    };
  };

  return { prepare, exec: (sql) => db.exec(sql), close: () => db.close() };
}

function createPostgresDb() {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  const initSql = `
    CREATE TABLE IF NOT EXISTS local_users (
      id SERIAL PRIMARY KEY,
      auth_user_id TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'user')) DEFAULT 'user',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      email TEXT,
      telefono TEXT,
      empresa TEXT,
      notas TEXT,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `;

  const prepare = (sql) => {
    return {
      all: async (...args) => {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const res = await pool.query(sql, params);
        return res.rows;
      },
      get: async (...args) => {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const res = await pool.query(sql, params);
        return res.rows[0] ?? undefined;
      },
      run: async (...args) => {
        const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
        const res = await pool.query(sql, params);
        return { lastInsertRowid: res.rows?.[0]?.id ?? null, changes: res.rowCount, rowCount: res.rowCount };
      },
    };
  };

  return {
    prepare,
    init: async () => pool.query(initSql),
    exec: async (sql, params = []) => pool.query(sql, params),
    close: async () => pool.end(),
  };
}

const db = config.databaseUrl ? createPostgresDb() : createSqliteDb();
module.exports = db;
