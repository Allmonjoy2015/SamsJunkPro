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
 * Creates all required tables if they do not already exist.
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
      customer_id           INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_first_name   TEXT NOT NULL,
      customer_last_name    TEXT NOT NULL,
      customer_phone_number TEXT,
      customer_email_address TEXT,
      date_added            TEXT NOT NULL DEFAULT (datetime('now'))
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
  `);
}

module.exports = { openDatabase };
