/**
 * preload.js
 *
 * Electron preload script — runs in an isolated context before the renderer
 * page loads. Exposes a safe, narrow API surface to the renderer via
 * `contextBridge.exposeInMainWorld` so the renderer never has direct access
 * to Node.js or Electron internals.
 *
 * The exposed `window.api` object mirrors the IPC channel names defined in
 * src/shared/constants.js (IPC_CHANNELS).
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Wraps `ipcRenderer.invoke` with a descriptive name so renderer code reads
 * like a normal async function call instead of a raw IPC string.
 *
 * @param {string} ipcChannelName - The IPC channel to invoke.
 * @param {unknown} [payload]     - Optional data to pass to the main process.
 * @returns {Promise<unknown>}    - The value returned by the main-process handler.
 */
function invokeIpcChannel(ipcChannelName, payload) {
  return ipcRenderer.invoke(ipcChannelName, payload);
}

// Expose the API surface to the renderer process.
contextBridge.exposeInMainWorld('api', {
  // --- Inventory ---
  addSalvagePart: (newPartData) => invokeIpcChannel('inventory:addPart', newPartData),
  updateSalvagePart: (updatedPartData) => invokeIpcChannel('inventory:updatePart', updatedPartData),
  deleteSalvagePart: (partId) => invokeIpcChannel('inventory:deletePart', { partId }),
  getSalvagePartById: (partId) => invokeIpcChannel('inventory:getPartById', { partId }),
  searchSalvageParts: (searchOptions) => invokeIpcChannel('inventory:searchParts', searchOptions),

  // --- Customers ---
  getAllCustomers: () => invokeIpcChannel('customers:getAll'),
  getCustomerById: (customerId) => invokeIpcChannel('customers:getById', { customerId }),
  addCustomer: (newCustomerData) => invokeIpcChannel('customers:addCustomer', newCustomerData),
  updateCustomer: (updatedCustomerData) => invokeIpcChannel('customers:updateCustomer', updatedCustomerData),
  deleteCustomer: (customerId) => invokeIpcChannel('customers:deleteCustomer', { customerId }),
  getCustomerTransactionHistory: (customerId) =>
    invokeIpcChannel('customers:getTransactionHistory', { customerId }),

  // --- Sales ---
  completeSale: (saleTransactionData) => invokeIpcChannel('sales:completeSale', saleTransactionData),
  getSaleReceipt: (saleId) => invokeIpcChannel('sales:getReceipt', { saleId }),
  getSalesSummary: (dateRange) => invokeIpcChannel('sales:getSummary', dateRange),
  voidSale: (saleId) => invokeIpcChannel('sales:voidSale', { saleId }),
});
