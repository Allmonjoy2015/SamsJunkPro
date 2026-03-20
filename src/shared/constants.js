/**
 * constants.js
 *
 * Application-wide constants shared between the main and renderer processes.
 * All constants use SCREAMING_SNAKE_CASE to distinguish them from variables.
 */

'use strict';

/** Maximum number of rows returned by any single database search query. */
const MAX_SEARCH_RESULTS = 200;

/** Default sales-tax rate applied to every sale transaction (as a decimal). */
const DEFAULT_TAX_RATE_DECIMAL = 0.08;

/** Human-readable label for the default tax rate shown in receipts and reports. */
const DEFAULT_TAX_RATE_LABEL = '8%';

/** Condition grades used when cataloguing a salvage part. */
const PART_CONDITION_OPTIONS = Object.freeze(['Excellent', 'Good', 'Fair', 'Poor', 'For Parts Only']);

/** Sale status values stored in the `sales` database table. */
const SALE_STATUS = Object.freeze({
  PENDING: 'pending',
  COMPLETED: 'completed',
  REFUNDED: 'refunded',
  VOIDED: 'voided',
});

/** IPC channel names used to communicate between renderer and main process. */
const IPC_CHANNELS = Object.freeze({
  // Inventory channels
  INVENTORY_ADD_PART: 'inventory:addPart',
  INVENTORY_UPDATE_PART: 'inventory:updatePart',
  INVENTORY_DELETE_PART: 'inventory:deletePart',
  INVENTORY_GET_PART_BY_ID: 'inventory:getPartById',
  INVENTORY_SEARCH_PARTS: 'inventory:searchParts',

  // Customer channels
  CUSTOMERS_GET_ALL: 'customers:getAll',
  CUSTOMERS_GET_BY_ID: 'customers:getById',
  CUSTOMERS_ADD: 'customers:addCustomer',
  CUSTOMERS_UPDATE: 'customers:updateCustomer',
  CUSTOMERS_DELETE: 'customers:deleteCustomer',
  CUSTOMERS_GET_TRANSACTION_HISTORY: 'customers:getTransactionHistory',

  // Sales channels
  SALES_COMPLETE_SALE: 'sales:completeSale',
  SALES_GET_RECEIPT: 'sales:getReceipt',
  SALES_GET_SUMMARY: 'sales:getSummary',
  SALES_VOID_SALE: 'sales:voidSale',

  // Report channels
  REPORTS_GET_INVENTORY_SUMMARY: 'reports:getInventorySummary',
  REPORTS_GET_SALES_SUMMARY: 'reports:getSalesSummary',
  REPORTS_EXPORT_PDF: 'reports:exportPdf',
  REPORTS_EXPORT_CSV: 'reports:exportCsv',
});

module.exports = {
  MAX_SEARCH_RESULTS,
  DEFAULT_TAX_RATE_DECIMAL,
  DEFAULT_TAX_RATE_LABEL,
  PART_CONDITION_OPTIONS,
  SALE_STATUS,
  IPC_CHANNELS,
};
