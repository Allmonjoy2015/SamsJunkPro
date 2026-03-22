/**
 * customer-handlers.js
 *
 * Registers Electron IPC handlers for all customer management operations.
 *
 * Register all handlers by calling `registerCustomerIpcHandlers(ipcMain, db)`.
 */

'use strict';

const { IPC_CHANNELS } = require('../../shared/constants');
const { validateCustomerData } = require('../../shared/validation');

/**
 * Registers all customer-related IPC handlers with the Electron main process.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {import('better-sqlite3').Database} databaseConnection
 */
function registerCustomerIpcHandlers(ipcMain, databaseConnection) {
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_GET_ALL, handleGetAllCustomers.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_GET_BY_ID, handleGetCustomerById.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_ADD, handleAddCustomer.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_UPDATE, handleUpdateCustomerContactInfo.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_DELETE, handleDeleteCustomer.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.CUSTOMERS_GET_TRANSACTION_HISTORY, handleGetCustomerTransactionHistory.bind(null, databaseConnection));
}

// ---------------------------------------------------------------------------
// Private handler functions
// ---------------------------------------------------------------------------

/**
 * Returns all customer records ordered alphabetically by last name.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @returns {{ success: boolean, customerList: Object[] }}
 */
function handleGetAllCustomers(databaseConnection) {
  const selectAllCustomersStatement = databaseConnection.prepare(
    `SELECT * FROM customers ORDER BY customer_last_name ASC, customer_first_name ASC`
  );
  const customerList = selectAllCustomersStatement.all();
  return { success: true, customerList };
}

/**
 * Returns a single customer record by primary key.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ customerId: number }} payload
 * @returns {{ success: boolean, customerRecord?: Object, errorMessage?: string }}
 */
function handleGetCustomerById(databaseConnection, _event, { customerId }) {
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return { success: false, errorMessage: 'A valid customer ID is required.' };
  }

  const selectCustomerStatement = databaseConnection.prepare(
    `SELECT * FROM customers WHERE customer_id = ?`
  );
  const customerRecord = selectCustomerStatement.get(customerId);

  if (!customerRecord) {
    return { success: false, errorMessage: `No customer found with ID ${customerId}.` };
  }

  return { success: true, customerRecord };
}

/**
 * Inserts a new customer record.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {Object} newCustomerData - Fields for the new customer (see validateCustomerData).
 * @returns {{ success: boolean, customerId?: number, errorMessage?: string }}
 */
function handleAddCustomer(databaseConnection, _event, newCustomerData) {
  const validationResult = validateCustomerData(newCustomerData);
  if (!validationResult.isValid) {
    return { success: false, errorMessage: validationResult.errorMessage };
  }

  const insertCustomerStatement = databaseConnection.prepare(`
    INSERT INTO customers (
      customer_first_name, customer_last_name, customer_phone_number,
      customer_email_address, customer_address,
      id_type, id_number, id_expiration, id_issued_by,
      is_business, company_name, ein_number, notes
    ) VALUES (
      @customerFirstName, @customerLastName, @customerPhoneNumber,
      @customerEmailAddress, @customerAddress,
      @idType, @idNumber, @idExpiration, @idIssuedBy,
      @isBusiness, @companyName, @einNumber, @notes
    )
  `);

  const insertResult = insertCustomerStatement.run({
    customerFirstName: newCustomerData.customerFirstName.trim(),
    customerLastName: newCustomerData.customerLastName.trim(),
    customerPhoneNumber: newCustomerData.customerPhoneNumber
      ? newCustomerData.customerPhoneNumber.trim()
      : null,
    customerEmailAddress: newCustomerData.customerEmailAddress
      ? newCustomerData.customerEmailAddress.trim().toLowerCase()
      : null,
    customerAddress: newCustomerData.customerAddress
      ? newCustomerData.customerAddress.trim()
      : null,
    idType: newCustomerData.idType ? newCustomerData.idType.trim() : null,
    idNumber: newCustomerData.idNumber ? newCustomerData.idNumber.trim() : null,
    idExpiration: newCustomerData.idExpiration ? newCustomerData.idExpiration.trim() : null,
    idIssuedBy: newCustomerData.idIssuedBy ? newCustomerData.idIssuedBy.trim() : null,
    isBusiness: newCustomerData.isBusiness ? 1 : 0,
    companyName: newCustomerData.companyName ? newCustomerData.companyName.trim() : null,
    einNumber: newCustomerData.einNumber ? newCustomerData.einNumber.trim() : null,
    notes: newCustomerData.notes ? newCustomerData.notes.trim() : null,
  });

  return { success: true, customerId: insertResult.lastInsertRowid };
}

/**
 * Updates the contact information for an existing customer.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ customerId: number } & Object} updatedCustomerData
 * @returns {{ success: boolean, errorMessage?: string }}
 */
function handleUpdateCustomerContactInfo(databaseConnection, _event, updatedCustomerData) {
  if (!Number.isInteger(updatedCustomerData.customerId) || updatedCustomerData.customerId <= 0) {
    return { success: false, errorMessage: 'A valid customer ID is required to update a record.' };
  }

  const validationResult = validateCustomerData(updatedCustomerData);
  if (!validationResult.isValid) {
    return { success: false, errorMessage: validationResult.errorMessage };
  }

  const updateCustomerStatement = databaseConnection.prepare(`
    UPDATE customers SET
      customer_first_name    = @customerFirstName,
      customer_last_name     = @customerLastName,
      customer_phone_number  = @customerPhoneNumber,
      customer_email_address = @customerEmailAddress,
      customer_address       = @customerAddress,
      id_type                = @idType,
      id_number              = @idNumber,
      id_expiration          = @idExpiration,
      id_issued_by           = @idIssuedBy,
      is_business            = @isBusiness,
      company_name           = @companyName,
      ein_number             = @einNumber,
      notes                  = @notes,
      updated_at             = datetime('now')
    WHERE customer_id = @customerId
  `);

  const updateResult = updateCustomerStatement.run({
    customerId: updatedCustomerData.customerId,
    customerFirstName: updatedCustomerData.customerFirstName.trim(),
    customerLastName: updatedCustomerData.customerLastName.trim(),
    customerPhoneNumber: updatedCustomerData.customerPhoneNumber
      ? updatedCustomerData.customerPhoneNumber.trim()
      : null,
    customerEmailAddress: updatedCustomerData.customerEmailAddress
      ? updatedCustomerData.customerEmailAddress.trim().toLowerCase()
      : null,
    customerAddress: updatedCustomerData.customerAddress
      ? updatedCustomerData.customerAddress.trim()
      : null,
    idType: updatedCustomerData.idType ? updatedCustomerData.idType.trim() : null,
    idNumber: updatedCustomerData.idNumber ? updatedCustomerData.idNumber.trim() : null,
    idExpiration: updatedCustomerData.idExpiration
      ? updatedCustomerData.idExpiration.trim()
      : null,
    idIssuedBy: updatedCustomerData.idIssuedBy ? updatedCustomerData.idIssuedBy.trim() : null,
    isBusiness: updatedCustomerData.isBusiness ? 1 : 0,
    companyName: updatedCustomerData.companyName ? updatedCustomerData.companyName.trim() : null,
    einNumber: updatedCustomerData.einNumber ? updatedCustomerData.einNumber.trim() : null,
    notes: updatedCustomerData.notes ? updatedCustomerData.notes.trim() : null,
  });

  if (updateResult.changes === 0) {
    return { success: false, errorMessage: `No customer found with ID ${updatedCustomerData.customerId}.` };
  }

  return { success: true };
}

/**
 * Deletes a customer record by ID.
 * Only customers with no associated sale transactions may be deleted.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ customerId: number }} payload
 * @returns {{ success: boolean, errorMessage?: string }}
 */
function handleDeleteCustomer(databaseConnection, _event, { customerId }) {
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return { success: false, errorMessage: 'A valid customer ID is required to delete a record.' };
  }

  const countCustomerSalesStatement = databaseConnection.prepare(
    `SELECT COUNT(*) AS saleCount FROM sale_transactions WHERE customer_id = ?`
  );
  const { saleCount } = countCustomerSalesStatement.get(customerId);

  if (saleCount > 0) {
    return {
      success: false,
      errorMessage: `Cannot delete customer ${customerId}: they have ${saleCount} sale transaction(s) on record.`,
    };
  }

  const deleteCustomerStatement = databaseConnection.prepare(
    `DELETE FROM customers WHERE customer_id = ?`
  );
  const deleteResult = deleteCustomerStatement.run(customerId);

  if (deleteResult.changes === 0) {
    return { success: false, errorMessage: `No customer found with ID ${customerId}.` };
  }

  return { success: true };
}

/**
 * Returns the full purchase history for a specific customer.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ customerId: number }} payload
 * @returns {{ success: boolean, transactionHistoryList?: Object[], errorMessage?: string }}
 */
function handleGetCustomerTransactionHistory(databaseConnection, _event, { customerId }) {
  if (!Number.isInteger(customerId) || customerId <= 0) {
    return { success: false, errorMessage: 'A valid customer ID is required.' };
  }

  const selectTransactionHistoryStatement = databaseConnection.prepare(`
    SELECT
      st.sale_id,
      st.sale_date,
      st.sale_status,
      st.tax_rate_decimal,
      SUM(sli.quantity_sold * sli.agreed_unit_price_cents) AS totalRevenueCents
    FROM sale_transactions st
    JOIN sale_line_items sli ON sli.sale_id = st.sale_id
    WHERE st.customer_id = ?
    GROUP BY st.sale_id
    ORDER BY st.sale_date DESC
  `);

  const transactionHistoryList = selectTransactionHistoryStatement.all(customerId);
  return { success: true, transactionHistoryList };
}

module.exports = { registerCustomerIpcHandlers };
