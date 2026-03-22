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
 * Creates all required tables if they do not already exist, and applies any
 * additive column migrations for tables that may have been created by an
 * earlier version of the application.
 * This function is idempotent — safe to call on every app launch.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 */
function runSchemaMigration(databaseConnection) {
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
      customer_id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_first_name      TEXT    NOT NULL,
      customer_last_name       TEXT    NOT NULL,
      customer_phone_number    TEXT,
      customer_email_address   TEXT,
      customer_address         TEXT,
      id_type                  TEXT,   -- 'driver_license', 'state_id', 'military_id', etc.
      id_number                TEXT,
      id_expiration            TEXT,
      id_issued_by             TEXT,
      company_name             TEXT,
      ein_number               TEXT,
      is_business              INTEGER NOT NULL DEFAULT 0,  -- 0 = individual, 1 = business
      notes                    TEXT,
      date_added               TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at               TEXT    NOT NULL DEFAULT (datetime('now'))
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

    -- Daily operating log for regulatory compliance (e.g. state scrap-metal laws).
    CREATE TABLE IF NOT EXISTS daily_logs (
      log_id              INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date            TEXT    NOT NULL UNIQUE,
      opening_inventory   TEXT,   -- JSON snapshot of inventory at day open
      purchases           TEXT,   -- JSON array of items purchased that day
      sales               TEXT,   -- JSON array of items sold that day
      closing_inventory   TEXT,   -- JSON snapshot of inventory at day close
      cash_on_hand        REAL    NOT NULL DEFAULT 0,
      checks_received     REAL    NOT NULL DEFAULT 0,
      notes               TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Law-enforcement interaction log for regulatory compliance.
    CREATE TABLE IF NOT EXISTS compliance_log (
      incident_id          INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date             TEXT    NOT NULL,
      police_report_number TEXT,
      officer_name         TEXT,
      officer_badge        TEXT,
      items_confiscated    TEXT,   -- JSON array of confiscated items
      reason               TEXT,
      disposition          TEXT,
      created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ---------------------------------------------------------------------------
  // Additive column migrations for pre-existing customers tables that were
  // created before the extended schema was introduced.  Each ALTER TABLE is
  // wrapped in a try/catch so that re-running on an already-migrated database
  // is safe (SQLite raises an error when a column already exists).
  // ---------------------------------------------------------------------------
  const customerColumnsToAdd = [
    { name: 'customer_address', definition: 'TEXT' },
    { name: 'id_type',          definition: 'TEXT' },
    { name: 'id_number',        definition: 'TEXT' },
    { name: 'id_expiration',    definition: 'TEXT' },
    { name: 'id_issued_by',     definition: 'TEXT' },
    { name: 'company_name',     definition: 'TEXT' },
    { name: 'ein_number',       definition: 'TEXT' },
    { name: 'is_business',      definition: "INTEGER NOT NULL DEFAULT 0" },
    { name: 'notes',            definition: 'TEXT' },
    { name: 'updated_at',       definition: "TEXT NOT NULL DEFAULT (datetime('now'))" },
  ];

  for (const column of customerColumnsToAdd) {
    try {
      databaseConnection.exec(
        `ALTER TABLE customers ADD COLUMN ${column.name} ${column.definition}`
      );
    } catch (_duplicateColumnError) {
      // Column already exists — no action required.
    }
  }
}

module.exports = { openDatabase };
