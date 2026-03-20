'use strict';

/**
 * preload.js
 *
 * Runs in the renderer process before any web content loads.
 * Exposes a safe, typed API (window.api) to the renderer via contextBridge
 * so the renderer never has direct access to Node.js or Electron internals.
 */

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Sends an IPC request to the main process and returns the result.
 * All channels are prefixed with "db:" to clearly indicate database calls.
 *
 * @param {string}    channel - IPC channel name
 * @param {...any}    args    - Arguments forwarded to the main-process handler
 * @returns {Promise<{ success: boolean, data?: any, error?: string }>}
 */
function invokeDb(channel, ...args) {
  return ipcRenderer.invoke(channel, ...args);
}

contextBridge.exposeInMainWorld('api', {
  // Dashboard
  getDashboardStats: () => invokeDb('db:getDashboardStats'),

  // Customers
  getAllCustomers: () => invokeDb('db:getAllCustomers'),
  getCustomerById: (id) => invokeDb('db:getCustomerById', id),
  searchCustomers: (term) => invokeDb('db:searchCustomers', term),
  addCustomer: (data) => invokeDb('db:addCustomer', data),
  updateCustomer: (id, updates) => invokeDb('db:updateCustomer', id, updates),
  deleteCustomer: (id) => invokeDb('db:deleteCustomer', id),

  // Inventory
  getAllInventory: () => invokeDb('db:getAllInventory'),
  addInventoryItem: (data) => invokeDb('db:addInventoryItem', data),
  updateInventoryItem: (id, updates) =>
    invokeDb('db:updateInventoryItem', id, updates),
  deleteInventoryItem: (id) => invokeDb('db:deleteInventoryItem', id),

  // Transactions
  getAllTransactions: () => invokeDb('db:getAllTransactions'),
  getTransactionsByCustomer: (id) =>
    invokeDb('db:getTransactionsByCustomer', id),
  addTransaction: (data) => invokeDb('db:addTransaction', data),
});
