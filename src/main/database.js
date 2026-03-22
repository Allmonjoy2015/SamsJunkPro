/**
 * database.js
 *
 * Opens (or creates) the SQLite database for SamsJunkPro and runs the schema
 * migration to ensure all required tables exist.
 *
 * Usage (main process only):
 *   const { openDatabase } = require('./database');
 *   const db = openDatabase();
 */

'use strict';

const path = require('path');
const { app } = require('electron');

// Use better-sqlite3 for synchronous, straightforward SQLite access.
// Install with: npm install better-sqlite3
const Database = require('better-sqlite3');

/** Absolute path to the SQLite database file stored in the user's app-data directory. */
const DATABASE_FILE_PATH = path.join(app.getPath('userData'), 'samsjunkpro.db');

/**
 * Opens the SQLite database and runs the initial schema migration.
 * If the database file does not exist it is created automatically.
 *
 * @returns {import('better-sqlite3').Database} The open database connection.
 */
function openDatabase() {
  const databaseConnection = new Database(DATABASE_FILE_PATH);

  // Enable WAL mode for better read/write concurrency.
  databaseConnection.pragma('journal_mode = WAL');

  runSchemaMigration(databaseConnection);

  return databaseConnection;
}

/**
 * Creates all required tables if they do not already exist and applies any
 * incremental column migrations.  This function is idempotent — safe to call
 * on every app launch.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 */
function runSchemaMigration(databaseConnection) {
  // Core tables ---------------------------------------------------------------
  databaseConnection.exec(`
    CREATE TABLE IF NOT EXISTS salvage_parts (
      part_id             INTEGER PRIMARY KEY AUTOINCREMENT,
      part_name           TEXT    NOT NULL,
      vehicle_make        TEXT    NOT NULL,
      vehicle_model       TEXT    NOT NULL,
      vehicle_year        INTEGER NOT NULL,
      part_number         TEXT,
      part_condition      TEXT    NOT NULL,
      asking_price_cents  INTEGER NOT NULL DEFAULT 0,
      is_sold             INTEGER NOT NULL DEFAULT 0,  -- 0 = available, 1 = sold
      date_added          TEXT    NOT NULL DEFAULT (datetime('now')),
      notes               TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      customer_id             INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_first_name     TEXT NOT NULL,
      customer_last_name      TEXT NOT NULL,
      customer_phone_number   TEXT,
      customer_email_address  TEXT,
      customer_address        TEXT,
      id_type                 TEXT,  -- 'driver_license', 'state_id', 'military_id', etc.
      id_number               TEXT,
      id_expiration           TEXT,
      id_issued_by            TEXT,
      company_name            TEXT,
      ein_number              TEXT,
      is_business             INTEGER NOT NULL DEFAULT 0,
      notes                   TEXT,
      date_added              TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sale_transactions (
      sale_id           INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id       INTEGER REFERENCES customers(customer_id),
      sale_status       TEXT    NOT NULL DEFAULT 'completed',
      tax_rate_decimal  REAL    NOT NULL DEFAULT 0.08,
      sale_date         TEXT    NOT NULL DEFAULT (datetime('now')),
      notes             TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_line_items (
      line_item_id              INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id                   INTEGER NOT NULL REFERENCES sale_transactions(sale_id),
      part_id                   INTEGER NOT NULL REFERENCES salvage_parts(part_id),
      quantity_sold             INTEGER NOT NULL DEFAULT 1,
      agreed_unit_price_cents   INTEGER NOT NULL
    );

    -- Daily operational logs for regulatory compliance ------------------------
    CREATE TABLE IF NOT EXISTS daily_logs (
      log_id              INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date            TEXT    NOT NULL UNIQUE,  -- YYYY-MM-DD, one record per day
      opening_inventory   TEXT,   -- JSON snapshot of inventory at start of day
      purchases           TEXT,   -- JSON array of items purchased from public
      sales               TEXT,   -- JSON array of items sold during the day
      closing_inventory   TEXT,   -- JSON snapshot of inventory at end of day
      cash_on_hand        REAL    NOT NULL DEFAULT 0,
      checks_received     REAL    NOT NULL DEFAULT 0,
      notes               TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Police / confiscation compliance log ------------------------------------
    CREATE TABLE IF NOT EXISTS compliance_log (
      compliance_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date            TEXT    NOT NULL,
      police_report_number TEXT,
      officer_name        TEXT,
      officer_badge       TEXT,
      items_confiscated   TEXT,   -- JSON array describing confiscated items
      reason              TEXT,
      disposition         TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Incremental column migrations for customers table -------------------------
  // SQLite does not support IF NOT EXISTS on ALTER TABLE ADD COLUMN, so we
  // check the existing columns via PRAGMA before attempting each migration.
  addColumnIfMissing(databaseConnection, 'customers', 'customer_address', 'TEXT');
  addColumnIfMissing(databaseConnection, 'customers', 'id_type',          'TEXT');
  addColumnIfMissing(databaseConnection, 'customers', 'id_number',        'TEXT');
  addColumnIfMissing(databaseConnection, 'customers', 'id_expiration',    'TEXT');
  addColumnIfMissing(databaseConnection, 'customers', 'id_issued_by',     'TEXT');
  addColumnIfMissing(databaseConnection, 'customers', 'company_name',     'TEXT');
  addColumnIfMissing(databaseConnection, 'customers', 'ein_number',       'TEXT');
  addColumnIfMissing(databaseConnection, 'customers', 'is_business',      'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing(databaseConnection, 'customers', 'notes',            'TEXT');
  addColumnIfMissing(databaseConnection, 'customers', 'updated_at',       "TEXT NOT NULL DEFAULT (datetime('now'))");
}

/**
 * Adds a column to an existing table only if it is not already present.
 * This is the safe migration pattern for SQLite, which lacks
 * `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {string} tableName
 * @param {string} columnName
 * @param {string} columnDefinition - SQLite type + optional constraints (e.g. "TEXT NOT NULL DEFAULT ''").
 */
function addColumnIfMissing(databaseConnection, tableName, columnName, columnDefinition) {
  const existingColumns = databaseConnection.pragma(`table_info(${tableName})`);
  const columnAlreadyExists = existingColumns.some((col) => col.name === columnName);
  if (!columnAlreadyExists) {
    databaseConnection.exec(
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`
    );
  }
}

module.exports = { openDatabase };
