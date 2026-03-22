'use strict';

/**
 * handlers.js
 *
 * Registers all IPC (inter-process communication) handlers that the renderer
 * process uses to interact with the SQLite database through Electron's
 * contextBridge / ipcMain.
 *
 * Each handler validates its arguments and returns a consistent response
 * envelope: { success: boolean, data?: any, error?: string }
 */

const { ipcMain } = require('electron');
const db = require('../database/customerDatabase');

/**
 * Wraps a synchronous database function in an IPC handler that returns a
 * standard { success, data, error } envelope.
 *
 * @param {string}   channelName  - IPC channel to listen on.
 * @param {Function} handlerFn    - (event, ...args) => data
 */
function registerHandler(channelName, handlerFn) {
  ipcMain.handle(channelName, async (event, ...args) => {
    try {
      const data = handlerFn(event, ...args);
      return { success: true, data };
    } catch (err) {
      console.error(`IPC handler error on channel "${channelName}":`, err);
      return { success: false, error: err.message };
    }
  });
}

/**
 * Registers all database-related IPC handlers.
 *
 * @param {import('better-sqlite3').Database} database - Open SQLite connection.
 */
function registerAllHandlers(database) {
  // ── Dashboard ──────────────────────────────────────────────────────────────
  registerHandler('db:getDashboardStats', () =>
    db.getDashboardStats(database)
  );

  // ── Customers ──────────────────────────────────────────────────────────────
  registerHandler('db:getAllCustomers', () =>
    db.getAllCustomers(database)
  );

  registerHandler('db:getCustomerById', (_event, customerId) =>
    db.getCustomerById(database, customerId)
  );

  registerHandler('db:searchCustomers', (_event, searchTerm) =>
    db.searchCustomers(database, searchTerm)
  );

  registerHandler('db:addCustomer', (_event, customerData) =>
    db.addCustomer(database, customerData)
  );

  registerHandler('db:updateCustomer', (_event, customerId, updates) =>
    db.updateCustomer(database, customerId, updates)
  );

  registerHandler('db:deleteCustomer', (_event, customerId) =>
    db.deleteCustomer(database, customerId)
  );

  // ── Inventory ──────────────────────────────────────────────────────────────
  registerHandler('db:getAllInventory', () =>
    db.getAllInventory(database)
  );

  registerHandler('db:addInventoryItem', (_event, itemData) =>
    db.addInventoryItem(database, itemData)
  );

  registerHandler('db:updateInventoryItem', (_event, itemId, updates) =>
    db.updateInventoryItem(database, itemId, updates)
  );

  registerHandler('db:deleteInventoryItem', (_event, itemId) =>
    db.deleteInventoryItem(database, itemId)
  );

  // ── Transactions ───────────────────────────────────────────────────────────
  registerHandler('db:getAllTransactions', () =>
    db.getAllTransactions(database)
  );

  registerHandler('db:getTransactionsByCustomer', (_event, customerId) =>
    db.getTransactionsByCustomer(database, customerId)
  );

  registerHandler('db:addTransaction', (_event, txData) =>
    db.addTransaction(database, txData)
  );

  // ── Inventory (supplier purchase records) ──────────────────────────────────
  registerHandler('db:addInventory', (_event, item) =>
    db.addInventory(database, item)
  );

  registerHandler('db:getInventory', () =>
    db.getInventory(database)
  );

  // ── Sales ──────────────────────────────────────────────────────────────────
  registerHandler('db:addSale', (_event, sale) =>
    db.addSale(database, sale)
  );

  registerHandler('db:getSales', () =>
    db.getSales(database)
  );

  registerHandler('db:getComplianceReport', (_event, startDate, endDate) =>
    db.getComplianceReport(database, startDate, endDate)
  );

  registerHandler('db:cleanupOldRecords', () =>
    db.cleanupOldRecords(database)
  );

  // ── Compliance logs ────────────────────────────────────────────────────────
  registerHandler('db:addComplianceLog', (_event, log) =>
    db.addComplianceLog(database, log)
  );

  registerHandler('db:getComplianceLogs', () =>
    db.getComplianceLogs(database)
  );

  // ── Settings ───────────────────────────────────────────────────────────────
  registerHandler('db:getSetting', (_event, key) =>
    db.getSetting(database, key)
  );

  registerHandler('db:setSetting', (_event, key, value) =>
    db.setSetting(database, key, value)
  );

  registerHandler('db:getAllSettings', () =>
    db.getAllSettings(database)
  );
}

module.exports = { registerAllHandlers };
