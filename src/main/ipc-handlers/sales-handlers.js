/**
 * sales-handlers.js
 *
 * Registers Electron IPC handlers for recording and retrieving sale transactions.
 *
 * Register all handlers by calling `registerSalesIpcHandlers(ipcMain, db)`.
 */

'use strict';

const { IPC_CHANNELS, SALE_STATUS, DEFAULT_TAX_RATE_DECIMAL } = require('../../shared/constants');
const { validateSaleLineItems } = require('../../shared/validation');

/**
 * Registers all sales-related IPC handlers with the Electron main process.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {import('better-sqlite3').Database} databaseConnection
 */
function registerSalesIpcHandlers(ipcMain, databaseConnection) {
  ipcMain.handle(IPC_CHANNELS.SALES_COMPLETE_SALE, handleCompleteSaleTransaction.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.SALES_GET_RECEIPT, handleGetSaleReceipt.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.SALES_GET_SUMMARY, handleGetSalesSummary.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.SALES_VOID_SALE, handleVoidSaleTransaction.bind(null, databaseConnection));
}

// ---------------------------------------------------------------------------
// Private handler functions
// ---------------------------------------------------------------------------

/**
 * Records a completed sale transaction together with its line items.
 * Runs inside a database transaction so all inserts succeed or all roll back.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{
 *   customerId?: number,
 *   taxRateDecimal?: number,
 *   saleLineItemList: Array<{ salvagePartId: number, quantitySold: number, agreedUnitPriceDollars: number }>,
 *   notes?: string
 * }} saleTransactionData
 * @returns {{ success: boolean, saleId?: number, errorMessage?: string }}
 */
function handleCompleteSaleTransaction(databaseConnection, _event, saleTransactionData) {
  if (!saleTransactionData || typeof saleTransactionData !== 'object') {
    return { success: false, errorMessage: 'Invalid sale transaction payload: expected an object.' };
  }

  const { customerId, taxRateDecimal = DEFAULT_TAX_RATE_DECIMAL, saleLineItemList, notes } =
    saleTransactionData;

  if (!Number.isFinite(taxRateDecimal) || taxRateDecimal < 0 || taxRateDecimal > 1) {
    return { success: false, errorMessage: 'Tax rate must be a number between 0 and 1.' };
  }

  const lineItemValidationResult = validateSaleLineItems(saleLineItemList);
  if (!lineItemValidationResult.isValid) {
    return { success: false, errorMessage: lineItemValidationResult.errorMessage };
  }

  const insertSaleTransactionStatement = databaseConnection.prepare(`
    INSERT INTO sale_transactions (customer_id, sale_status, tax_rate_decimal, notes)
    VALUES (@customerId, @saleStatus, @taxRateDecimal, @notes)
  `);

  const insertSaleLineItemStatement = databaseConnection.prepare(`
    INSERT INTO sale_line_items (sale_id, part_id, quantity_sold, agreed_unit_price_cents)
    VALUES (@saleId, @salvagePartId, @quantitySold, @agreedUnitPriceCents)
  `);

  const markPartAsSoldStatement = databaseConnection.prepare(
    `UPDATE salvage_parts SET is_sold = 1 WHERE part_id = ?`
  );

  // Wrap the multi-table insert in a single atomic database transaction.
  const persistCompletedSaleTransaction = databaseConnection.transaction(() => {
    const saleInsertResult = insertSaleTransactionStatement.run({
      customerId: customerId || null,
      saleStatus: SALE_STATUS.COMPLETED,
      taxRateDecimal,
      notes: notes ? notes.trim() : null,
    });

    const newSaleId = saleInsertResult.lastInsertRowid;

    for (const saleLineItem of saleLineItemList) {
      const agreedUnitPriceCents = Math.round(saleLineItem.agreedUnitPriceDollars * 100);

      insertSaleLineItemStatement.run({
        saleId: newSaleId,
        salvagePartId: saleLineItem.salvagePartId,
        quantitySold: saleLineItem.quantitySold,
        agreedUnitPriceCents,
      });

      markPartAsSoldStatement.run(saleLineItem.salvagePartId);
    }

    return newSaleId;
  });

  let newSaleId;
  try {
    newSaleId = persistCompletedSaleTransaction();
  } catch (transactionError) {
    const errorMessage =
      transactionError && typeof transactionError.message === 'string'
        ? transactionError.message
        : 'Failed to record the completed sale transaction.';
    return { success: false, errorMessage };
  }
  return { success: true, saleId: newSaleId };
}

/**
 * Retrieves the full receipt data for a completed sale (header + line items).
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ saleId: number }} payload
 * @returns {{ success: boolean, saleReceipt?: Object, errorMessage?: string }}
 */
function handleGetSaleReceipt(databaseConnection, _event, payload) {
  const { saleId } = (payload && typeof payload === 'object') ? payload : {};
  if (!Number.isInteger(saleId) || saleId <= 0) {
    return { success: false, errorMessage: 'A valid sale ID is required.' };
  }

  const selectSaleTransactionStatement = databaseConnection.prepare(`
    SELECT
      st.*,
      c.customer_first_name,
      c.customer_last_name,
      c.customer_phone_number,
      c.customer_email_address
    FROM sale_transactions st
    LEFT JOIN customers c ON c.customer_id = st.customer_id
    WHERE st.sale_id = ?
  `);

  const saleTransaction = selectSaleTransactionStatement.get(saleId);

  if (!saleTransaction) {
    return { success: false, errorMessage: `No sale transaction found with ID ${saleId}.` };
  }

  const selectSaleLineItemsStatement = databaseConnection.prepare(`
    SELECT
      sli.*,
      sp.part_name,
      sp.vehicle_make,
      sp.vehicle_model,
      sp.vehicle_year
    FROM sale_line_items sli
    JOIN salvage_parts sp ON sp.part_id = sli.part_id
    WHERE sli.sale_id = ?
  `);

  const saleLineItemList = selectSaleLineItemsStatement.all(saleId);

  const saleReceipt = { ...saleTransaction, saleLineItemList };
  return { success: true, saleReceipt };
}

/**
 * Returns aggregated sales totals for a given date range.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ summaryStartDate: string, summaryEndDate: string }} dateRange - ISO date strings.
 * @returns {{ success: boolean, salesSummary?: Object, errorMessage?: string }}
 */
function handleGetSalesSummary(databaseConnection, _event, payload) {
  const { summaryStartDate, summaryEndDate } =
    (payload && typeof payload === 'object') ? payload : {};
  if (!summaryStartDate || !summaryEndDate) {
    return { success: false, errorMessage: 'Both summaryStartDate and summaryEndDate are required.' };
  }

  const selectSalesSummaryStatement = databaseConnection.prepare(`
    SELECT
      COUNT(DISTINCT st.sale_id)                             AS totalSaleCount,
      SUM(sli.quantity_sold * sli.agreed_unit_price_cents)   AS totalRevenueCents,
      MIN(st.sale_date)                                      AS firstSaleDate,
      MAX(st.sale_date)                                      AS lastSaleDate
    FROM sale_transactions st
    JOIN sale_line_items sli ON sli.sale_id = st.sale_id
    WHERE st.sale_status = @completedStatus
      AND date(st.sale_date) BETWEEN date(@summaryStartDate) AND date(@summaryEndDate)
  `);

  const salesSummary = selectSalesSummaryStatement.get({
    summaryStartDate,
    summaryEndDate,
    completedStatus: SALE_STATUS.COMPLETED,
  });
  return { success: true, salesSummary };
}

/**
 * Voids a sale transaction and marks its parts as available again.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ saleId: number }} payload
 * @returns {{ success: boolean, errorMessage?: string }}
 */
function handleVoidSaleTransaction(databaseConnection, _event, payload) {
  const { saleId } = (payload && typeof payload === 'object') ? payload : {};
  if (!Number.isInteger(saleId) || saleId <= 0) {
    return { success: false, errorMessage: 'A valid sale ID is required to void a transaction.' };
  }

  const markSaleAsVoidedStatement = databaseConnection.prepare(
    `UPDATE sale_transactions SET sale_status = ? WHERE sale_id = ? AND sale_status = ?`
  );

  const restorePartAvailabilityStatement = databaseConnection.prepare(`
    UPDATE salvage_parts SET is_sold = 0
    WHERE part_id IN (
      SELECT part_id FROM sale_line_items WHERE sale_id = ?
    )
  `);

  const voidCompletedSaleTransaction = databaseConnection.transaction(() => {
    const voidResult = markSaleAsVoidedStatement.run(SALE_STATUS.VOIDED, saleId, SALE_STATUS.COMPLETED);
    if (voidResult.changes === 0) {
      throw new Error(`Sale ID ${saleId} was not found or is not in 'completed' status.`);
    }
    restorePartAvailabilityStatement.run(saleId);
  });

  try {
    voidCompletedSaleTransaction();
    return { success: true };
  } catch (transactionError) {
    return { success: false, errorMessage: transactionError.message };
  }
}

module.exports = { registerSalesIpcHandlers };
