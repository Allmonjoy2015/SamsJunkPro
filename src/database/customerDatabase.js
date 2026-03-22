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

    CREATE TABLE IF NOT EXISTS inventory (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type        TEXT    NOT NULL,
      description      TEXT,
      weight           REAL,
      unit_price       REAL,
      total_value      REAL,
      supplier_name    TEXT,
      supplier_address TEXT,
      supplier_phone   TEXT,
      purchase_date    TEXT,
      ticket_number    TEXT    UNIQUE,
      material_type    TEXT,
      photo_path       TEXT,
      notes            TEXT,
      created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sales (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      inventory_id       INTEGER REFERENCES inventory(id),
      customer_name      TEXT    NOT NULL,
      customer_address   TEXT,
      customer_phone     TEXT,
      customer_id_type   TEXT,
      customer_id_number TEXT,
      vehicle_info       TEXT,
      license_plate      TEXT,
      sale_date          TEXT,
      total_weight       REAL,
      total_amount       REAL,
      payment_method     TEXT,
      ticket_number      TEXT    UNIQUE,
      created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS compliance_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      log_type    TEXT,
      description TEXT,
      date        TEXT,
      reported_to TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Insert default business settings if they do not already exist
  const insertDefaultSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  const defaults = [
    ['business_name', 'Your Scrapyard Name'],
    ['business_address', 'Your Address'],
    ['business_phone', 'Your Phone'],
    ['business_license', 'Your License Number'],
  ];
  for (const [key, value] of defaults) {
    insertDefaultSetting.run(key, value);
  }
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

// ─── Inventory (supplier purchase records) ────────────────────────────────────

/**
 * Inserts a new inventory record (item purchased from a supplier).
 *
 * @param {Database.Database} db
 * @param {{ item_type: string, description?: string, weight?: number,
 *           unit_price?: number, total_value?: number, supplier_name?: string,
 *           supplier_address?: string, supplier_phone?: string,
 *           purchase_date?: string, ticket_number?: string,
 *           material_type?: string, photo_path?: string,
 *           notes?: string }} item
 * @returns {{ id: number, changes: number }}
 */
function addInventory(db, item) {
  const stmt = db.prepare(`
    INSERT INTO inventory
      (item_type, description, weight, unit_price, total_value, supplier_name,
       supplier_address, supplier_phone, purchase_date, ticket_number,
       material_type, photo_path, notes)
    VALUES
      (@item_type, @description, @weight, @unit_price, @total_value,
       @supplier_name, @supplier_address, @supplier_phone, @purchase_date,
       @ticket_number, @material_type, @photo_path, @notes)
  `);
  const result = stmt.run({
    item_type: item.item_type,
    description: item.description || null,
    weight: item.weight || null,
    unit_price: item.unit_price || null,
    total_value: item.total_value || null,
    supplier_name: item.supplier_name || null,
    supplier_address: item.supplier_address || null,
    supplier_phone: item.supplier_phone || null,
    purchase_date: item.purchase_date || null,
    ticket_number: item.ticket_number || null,
    material_type: item.material_type || null,
    photo_path: item.photo_path || null,
    notes: item.notes || null,
  });
  return { id: result.lastInsertRowid, changes: result.changes };
}

/**
 * Returns all inventory records ordered by purchase date descending.
 *
 * @param {Database.Database} db
 * @returns {object[]}
 */
function getInventory(db) {
  return db
    .prepare('SELECT * FROM inventory ORDER BY purchase_date DESC, created_at DESC')
    .all();
}

// ─── Sales ────────────────────────────────────────────────────────────────────

/**
 * Records a new sale transaction with embedded customer and vehicle details.
 *
 * @param {Database.Database} db
 * @param {{ inventory_id?: number, customer_name: string,
 *           customer_address?: string, customer_phone?: string,
 *           customer_id_type?: string, customer_id_number?: string,
 *           vehicle_info?: string, license_plate?: string,
 *           sale_date?: string, total_weight?: number, total_amount?: number,
 *           payment_method?: string, ticket_number?: string }} sale
 * @returns {{ id: number, changes: number }}
 */
function addSale(db, sale) {
  const stmt = db.prepare(`
    INSERT INTO sales
      (inventory_id, customer_name, customer_address, customer_phone,
       customer_id_type, customer_id_number, vehicle_info, license_plate,
       sale_date, total_weight, total_amount, payment_method, ticket_number)
    VALUES
      (@inventory_id, @customer_name, @customer_address, @customer_phone,
       @customer_id_type, @customer_id_number, @vehicle_info, @license_plate,
       @sale_date, @total_weight, @total_amount, @payment_method, @ticket_number)
  `);
  const result = stmt.run({
    inventory_id: sale.inventory_id || null,
    customer_name: sale.customer_name,
    customer_address: sale.customer_address || null,
    customer_phone: sale.customer_phone || null,
    customer_id_type: sale.customer_id_type || null,
    customer_id_number: sale.customer_id_number || null,
    vehicle_info: sale.vehicle_info || null,
    license_plate: sale.license_plate || null,
    sale_date: sale.sale_date || null,
    total_weight: sale.total_weight || null,
    total_amount: sale.total_amount || null,
    payment_method: sale.payment_method || null,
    ticket_number: sale.ticket_number || null,
  });
  return { id: result.lastInsertRowid, changes: result.changes };
}

/**
 * Returns all sales joined with the linked inventory item description,
 * ordered by sale date descending.
 *
 * @param {Database.Database} db
 * @returns {object[]}
 */
function getSales(db) {
  return db
    .prepare(`
      SELECT s.*, i.description AS item_description
      FROM   sales s
      LEFT   JOIN inventory i ON i.id = s.inventory_id
      ORDER  BY s.sale_date DESC, s.created_at DESC
    `)
    .all();
}

/**
 * Returns aggregate compliance statistics for a date range.
 *
 * @param {Database.Database} db
 * @param {string} startDate - ISO date string (inclusive).
 * @param {string} endDate   - ISO date string (inclusive).
 * @returns {{ total_transactions: number, total_sales: number,
 *             total_weight: number, unique_customers: number }}
 */
function getComplianceReport(db, startDate, endDate) {
  return db
    .prepare(`
      SELECT
        COUNT(*)                      AS total_transactions,
        COALESCE(SUM(total_amount), 0) AS total_sales,
        COALESCE(SUM(total_weight), 0) AS total_weight,
        COUNT(DISTINCT customer_name)  AS unique_customers
      FROM sales
      WHERE sale_date BETWEEN ? AND ?
    `)
    .get(startDate, endDate);
}

/**
 * Deletes sales and inventory records older than three years.
 *
 * @param {Database.Database} db
 * @returns {{ salesDeleted: number, inventoryDeleted: number }}
 */
function cleanupOldRecords(db) {
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const cutoff = threeYearsAgo.toISOString().split('T')[0];

  const salesResult = db
    .prepare('DELETE FROM sales WHERE sale_date < ?')
    .run(cutoff);
  const inventoryResult = db
    .prepare('DELETE FROM inventory WHERE purchase_date < ?')
    .run(cutoff);

  return {
    salesDeleted: salesResult.changes,
    inventoryDeleted: inventoryResult.changes,
  };
}

// ─── Compliance logs ──────────────────────────────────────────────────────────

/**
 * Inserts a new compliance log entry.
 *
 * @param {Database.Database} db
 * @param {{ log_type?: string, description?: string, date?: string,
 *           reported_to?: string }} log
 * @returns {{ id: number, changes: number }}
 */
function addComplianceLog(db, log) {
  const stmt = db.prepare(`
    INSERT INTO compliance_logs (log_type, description, date, reported_to)
    VALUES (@log_type, @description, @date, @reported_to)
  `);
  const result = stmt.run({
    log_type: log.log_type || null,
    description: log.description || null,
    date: log.date || null,
    reported_to: log.reported_to || null,
  });
  return { id: result.lastInsertRowid, changes: result.changes };
}

/**
 * Returns all compliance log entries ordered by date descending.
 *
 * @param {Database.Database} db
 * @returns {object[]}
 */
function getComplianceLogs(db) {
  return db
    .prepare('SELECT * FROM compliance_logs ORDER BY date DESC, created_at DESC')
    .all();
}

// ─── Settings ─────────────────────────────────────────────────────────────────

/**
 * Returns the value for a given settings key, or undefined if not found.
 *
 * @param {Database.Database} db
 * @param {string} key
 * @returns {string|undefined}
 */
function getSetting(db, key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : undefined;
}

/**
 * Inserts or replaces a setting value.
 *
 * @param {Database.Database} db
 * @param {string} key
 * @param {string} value
 * @returns {{ changes: number }}
 */
function setSetting(db, key, value) {
  const result = db
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, value);
  return { changes: result.changes };
}

/**
 * Returns all settings as an array of { key, value } objects.
 *
 * @param {Database.Database} db
 * @returns {{ key: string, value: string }[]}
 */
function getAllSettings(db) {
  return db.prepare('SELECT key, value FROM settings ORDER BY key').all();
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
  // scrap_inventory (legacy)
  addInventoryItem,
  getAllInventory,
  updateInventoryItem,
  deleteInventoryItem,
  // transactions (legacy)
  addTransaction,
  getAllTransactions,
  getTransactionsByCustomer,
  // dashboard
  getDashboardStats,
  // inventory (supplier purchase records)
  addInventory,
  getInventory,
  // sales
  addSale,
  getSales,
  getComplianceReport,
  cleanupOldRecords,
  // compliance logs
  addComplianceLog,
  getComplianceLogs,
  // settings
  getSetting,
  setSetting,
  getAllSettings,
};
