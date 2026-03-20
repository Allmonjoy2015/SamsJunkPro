'use strict';

/**
 * customerDatabase.js
 *
 * Provides all database operations for the SamsJunkPro platform using SQLite.
 * Tables: customers, scrap_inventory, transactions
 */

const Database = require('better-sqlite3');
const path = require('path');

/**
 * Opens (or creates) the SQLite database file and initialises the schema.
 *
 * @param {string} dbPath - Absolute path to the .db file.  Defaults to
 *   'samsjunkpro.db' next to this module.
 * @returns {Database.Database} The open database connection.
 */
function openDatabase(dbPath) {
  const resolvedPath =
    dbPath || path.join(__dirname, '..', '..', 'samsjunkpro.db');
  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createSchema(db);
  return db;
}

/**
 * Creates all required tables if they do not already exist.
 *
 * @param {Database.Database} db
 */
function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name  TEXT    NOT NULL,
      last_name   TEXT    NOT NULL,
      phone       TEXT,
      email       TEXT,
      address     TEXT,
      notes       TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scrap_inventory (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      material     TEXT    NOT NULL,
      weight_lbs   REAL    NOT NULL DEFAULT 0,
      price_per_lb REAL    NOT NULL DEFAULT 0,
      location     TEXT,
      notes        TEXT,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id    INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      type           TEXT    NOT NULL CHECK(type IN ('buy', 'sell')),
      material       TEXT    NOT NULL,
      weight_lbs     REAL    NOT NULL DEFAULT 0,
      price_per_lb   REAL    NOT NULL DEFAULT 0,
      total_amount   REAL    GENERATED ALWAYS AS (weight_lbs * price_per_lb) VIRTUAL,
      notes          TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ─── Customer operations ──────────────────────────────────────────────────────

/**
 * Inserts a new customer record.
 *
 * @param {Database.Database} db
 * @param {{ first_name: string, last_name: string, phone?: string,
 *           email?: string, address?: string, notes?: string }} customerData
 * @returns {{ id: number, changes: number }}
 */
function addCustomer(db, customerData) {
  const stmt = db.prepare(`
    INSERT INTO customers (first_name, last_name, phone, email, address, notes)
    VALUES (@first_name, @last_name, @phone, @email, @address, @notes)
  `);
  const result = stmt.run({
    first_name: customerData.first_name,
    last_name: customerData.last_name,
    phone: customerData.phone || null,
    email: customerData.email || null,
    address: customerData.address || null,
    notes: customerData.notes || null,
  });
  return { id: result.lastInsertRowid, changes: result.changes };
}

/**
 * Returns all customer records ordered by last name then first name.
 *
 * @param {Database.Database} db
 * @returns {object[]}
 */
function getAllCustomers(db) {
  return db
    .prepare('SELECT * FROM customers ORDER BY last_name, first_name')
    .all();
}

/**
 * Returns a single customer by primary key, or undefined if not found.
 *
 * @param {Database.Database} db
 * @param {number} customerId
 * @returns {object|undefined}
 */
function getCustomerById(db, customerId) {
  return db
    .prepare('SELECT * FROM customers WHERE id = ?')
    .get(customerId);
}

/**
 * Full-text search across first name, last name, phone, and email.
 *
 * @param {Database.Database} db
 * @param {string} searchTerm
 * @returns {object[]}
 */
function searchCustomers(db, searchTerm) {
  const pattern = `%${searchTerm}%`;
  return db
    .prepare(`
      SELECT * FROM customers
      WHERE first_name  LIKE ?
         OR last_name   LIKE ?
         OR phone       LIKE ?
         OR email       LIKE ?
      ORDER BY last_name, first_name
    `)
    .all(pattern, pattern, pattern, pattern);
}

/**
 * Updates an existing customer record.
 *
 * @param {Database.Database} db
 * @param {number} customerId
 * @param {{ first_name?: string, last_name?: string, phone?: string,
 *           email?: string, address?: string, notes?: string }} updates
 * @returns {{ changes: number }}
 */
function updateCustomer(db, customerId, updates) {
  const existing = getCustomerById(db, customerId);
  if (!existing) return { changes: 0 };

  const merged = { ...existing, ...updates };
  const stmt = db.prepare(`
    UPDATE customers
    SET first_name = @first_name,
        last_name  = @last_name,
        phone      = @phone,
        email      = @email,
        address    = @address,
        notes      = @notes,
        updated_at = datetime('now')
    WHERE id = @id
  `);
  const result = stmt.run({ ...merged, id: customerId });
  return { changes: result.changes };
}

/**
 * Deletes a customer record by primary key.
 *
 * @param {Database.Database} db
 * @param {number} customerId
 * @returns {{ changes: number }}
 */
function deleteCustomer(db, customerId) {
  const result = db
    .prepare('DELETE FROM customers WHERE id = ?')
    .run(customerId);
  return { changes: result.changes };
}

// ─── Scrap inventory operations ───────────────────────────────────────────────

/**
 * Inserts a new inventory item.
 *
 * @param {Database.Database} db
 * @param {{ material: string, weight_lbs: number, price_per_lb: number,
 *           location?: string, notes?: string }} itemData
 * @returns {{ id: number, changes: number }}
 */
function addInventoryItem(db, itemData) {
  const stmt = db.prepare(`
    INSERT INTO scrap_inventory
      (material, weight_lbs, price_per_lb, location, notes)
    VALUES
      (@material, @weight_lbs, @price_per_lb, @location, @notes)
  `);
  const result = stmt.run({
    material: itemData.material,
    weight_lbs: itemData.weight_lbs || 0,
    price_per_lb: itemData.price_per_lb || 0,
    location: itemData.location || null,
    notes: itemData.notes || null,
  });
  return { id: result.lastInsertRowid, changes: result.changes };
}

/**
 * Returns all inventory items ordered by material name.
 *
 * @param {Database.Database} db
 * @returns {object[]}
 */
function getAllInventory(db) {
  return db
    .prepare('SELECT * FROM scrap_inventory ORDER BY material')
    .all();
}

/**
 * Updates an existing inventory item.
 *
 * @param {Database.Database} db
 * @param {number} itemId
 * @param {object} updates
 * @returns {{ changes: number }}
 */
function updateInventoryItem(db, itemId, updates) {
  const existing = db
    .prepare('SELECT * FROM scrap_inventory WHERE id = ?')
    .get(itemId);
  if (!existing) return { changes: 0 };

  const merged = { ...existing, ...updates };
  const stmt = db.prepare(`
    UPDATE scrap_inventory
    SET material     = @material,
        weight_lbs   = @weight_lbs,
        price_per_lb = @price_per_lb,
        location     = @location,
        notes        = @notes,
        updated_at   = datetime('now')
    WHERE id = @id
  `);
  const result = stmt.run({ ...merged, id: itemId });
  return { changes: result.changes };
}

/**
 * Deletes an inventory item by primary key.
 *
 * @param {Database.Database} db
 * @param {number} itemId
 * @returns {{ changes: number }}
 */
function deleteInventoryItem(db, itemId) {
  const result = db
    .prepare('DELETE FROM scrap_inventory WHERE id = ?')
    .run(itemId);
  return { changes: result.changes };
}

// ─── Transaction operations ───────────────────────────────────────────────────

/**
 * Records a new buy or sell transaction.
 *
 * @param {Database.Database} db
 * @param {{ customer_id?: number, type: 'buy'|'sell', material: string,
 *           weight_lbs: number, price_per_lb: number, notes?: string }} txData
 * @returns {{ id: number, changes: number }}
 */
function addTransaction(db, txData) {
  const stmt = db.prepare(`
    INSERT INTO transactions
      (customer_id, type, material, weight_lbs, price_per_lb, notes)
    VALUES
      (@customer_id, @type, @material, @weight_lbs, @price_per_lb, @notes)
  `);
  const result = stmt.run({
    customer_id: txData.customer_id || null,
    type: txData.type,
    material: txData.material,
    weight_lbs: txData.weight_lbs || 0,
    price_per_lb: txData.price_per_lb || 0,
    notes: txData.notes || null,
  });
  return { id: result.lastInsertRowid, changes: result.changes };
}

/**
 * Returns all transactions joined with customer name, newest first.
 *
 * @param {Database.Database} db
 * @returns {object[]}
 */
function getAllTransactions(db) {
  return db
    .prepare(`
      SELECT t.*,
             c.first_name || ' ' || c.last_name AS customer_name
      FROM   transactions t
      LEFT   JOIN customers c ON c.id = t.customer_id
      ORDER  BY t.created_at DESC
    `)
    .all();
}

/**
 * Returns all transactions for a specific customer.
 *
 * @param {Database.Database} db
 * @param {number} customerId
 * @returns {object[]}
 */
function getTransactionsByCustomer(db, customerId) {
  return db
    .prepare(`
      SELECT * FROM transactions
      WHERE  customer_id = ?
      ORDER  BY created_at DESC
    `)
    .all(customerId);
}

// ─── Dashboard statistics ─────────────────────────────────────────────────────

/**
 * Returns summary statistics for the dashboard.
 *
 * @param {Database.Database} db
 * @returns {{ totalCustomers: number, totalInventoryItems: number,
 *             totalTransactions: number, totalRevenue: number }}
 */
function getDashboardStats(db) {
  const totalCustomers = db
    .prepare('SELECT COUNT(*) AS count FROM customers')
    .get().count;

  const totalInventoryItems = db
    .prepare('SELECT COUNT(*) AS count FROM scrap_inventory')
    .get().count;

  const totalTransactions = db
    .prepare('SELECT COUNT(*) AS count FROM transactions')
    .get().count;

  const revenueRow = db
    .prepare(`
      SELECT COALESCE(SUM(weight_lbs * price_per_lb), 0) AS total
      FROM   transactions
      WHERE  type = 'sell'
    `)
    .get();

  return {
    totalCustomers,
    totalInventoryItems,
    totalTransactions,
    totalRevenue: revenueRow.total,
  };
}

module.exports = {
  openDatabase,
  createSchema,
  // customers
  addCustomer,
  getAllCustomers,
  getCustomerById,
  searchCustomers,
  updateCustomer,
  deleteCustomer,
  // inventory
  addInventoryItem,
  getAllInventory,
  updateInventoryItem,
  deleteInventoryItem,
  // transactions
  addTransaction,
  getAllTransactions,
  getTransactionsByCustomer,
  // dashboard
  getDashboardStats,
};
