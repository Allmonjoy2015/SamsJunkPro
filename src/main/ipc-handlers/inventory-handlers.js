/**
 * inventory-handlers.js
 *
 * Registers Electron IPC handlers for all salvage-part inventory operations.
 * Each handler validates input, performs the database operation, and returns
 * a structured `{ success, data, errorMessage }` response to the renderer.
 *
 * Register all handlers by calling `registerInventoryIpcHandlers(ipcMain, db)`.
 */

'use strict';

const { IPC_CHANNELS, MAX_SEARCH_RESULTS } = require('../../shared/constants');
const { validateSalvagePartData } = require('../../shared/validation');

/**
 * Registers all inventory-related IPC handlers with the Electron main process.
 *
 * @param {Electron.IpcMain} ipcMain - The Electron IpcMain module.
 * @param {import('better-sqlite3').Database} databaseConnection - Open SQLite connection.
 */
function registerInventoryIpcHandlers(ipcMain, databaseConnection) {
  ipcMain.handle(IPC_CHANNELS.INVENTORY_ADD_PART, handleAddSalvagePart.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.INVENTORY_UPDATE_PART, handleUpdateSalvagePart.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.INVENTORY_DELETE_PART, handleDeleteSalvagePart.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.INVENTORY_GET_PART_BY_ID, handleGetSalvagePartById.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.INVENTORY_SEARCH_PARTS, handleSearchSalvageParts.bind(null, databaseConnection));
}

// ---------------------------------------------------------------------------
// Private handler functions (bound to ipcMain.handle above)
// ---------------------------------------------------------------------------

/**
 * Inserts a new salvage part into the database.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event - Unused renderer event.
 * @param {Object} newPartData - Fields for the new part (see validateSalvagePartData).
 * @returns {{ success: boolean, partId?: number, errorMessage?: string }}
 */
function handleAddSalvagePart(databaseConnection, _event, newPartData) {
  const validationResult = validateSalvagePartData(newPartData);
  if (!validationResult.isValid) {
    return { success: false, errorMessage: validationResult.errorMessage };
  }

  const askingPriceCents = Math.round(newPartData.askingPriceDollars * 100);

  const insertPartStatement = databaseConnection.prepare(`
    INSERT INTO salvage_parts
      (part_name, vehicle_make, vehicle_model, vehicle_year, part_number,
       part_condition, asking_price_cents, notes)
    VALUES
      (@partName, @vehicleMake, @vehicleModel, @vehicleYear, @partNumber,
       @partCondition, @askingPriceCents, @notes)
  `);

  const insertResult = insertPartStatement.run({
    partName: newPartData.partName.trim(),
    vehicleMake: newPartData.vehicleMake.trim(),
    vehicleModel: newPartData.vehicleModel.trim(),
    vehicleYear: newPartData.vehicleYear,
    partNumber: newPartData.partNumber ? newPartData.partNumber.trim() : null,
    partCondition: newPartData.partCondition,
    askingPriceCents,
    notes: newPartData.notes ? newPartData.notes.trim() : null,
  });

  return { success: true, partId: insertResult.lastInsertRowid };
}

/**
 * Updates an existing salvage part record by its ID.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ partId: number } & Object} updatedPartData - Part ID plus updated fields.
 * @returns {{ success: boolean, errorMessage?: string }}
 */
function handleUpdateSalvagePart(databaseConnection, _event, updatedPartData) {
  const validationResult = validateSalvagePartData(updatedPartData);
  if (!validationResult.isValid) {
    return { success: false, errorMessage: validationResult.errorMessage };
  }

  if (!Number.isInteger(updatedPartData.partId) || updatedPartData.partId <= 0) {
    return { success: false, errorMessage: 'A valid part ID is required to update a record.' };
  }

  const askingPriceCents = Math.round(updatedPartData.askingPriceDollars * 100);

  const updatePartStatement = databaseConnection.prepare(`
    UPDATE salvage_parts SET
      part_name          = @partName,
      vehicle_make       = @vehicleMake,
      vehicle_model      = @vehicleModel,
      vehicle_year       = @vehicleYear,
      part_number        = @partNumber,
      part_condition     = @partCondition,
      asking_price_cents = @askingPriceCents,
      notes              = @notes
    WHERE part_id = @partId
  `);

  const updateResult = updatePartStatement.run({
    partId: updatedPartData.partId,
    partName: updatedPartData.partName.trim(),
    vehicleMake: updatedPartData.vehicleMake.trim(),
    vehicleModel: updatedPartData.vehicleModel.trim(),
    vehicleYear: updatedPartData.vehicleYear,
    partNumber: updatedPartData.partNumber ? updatedPartData.partNumber.trim() : null,
    partCondition: updatedPartData.partCondition,
    askingPriceCents,
    notes: updatedPartData.notes ? updatedPartData.notes.trim() : null,
  });

  if (updateResult.changes === 0) {
    return { success: false, errorMessage: `No salvage part found with ID ${updatedPartData.partId}.` };
  }

  return { success: true };
}

/**
 * Removes a salvage part from active inventory (soft-delete: sets is_removed = 1).
 * Hard deletion is avoided to preserve sale history integrity.
 * This is distinct from `is_sold`, which marks parts sold via a sale transaction.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ partId: number } | null | undefined} payload
 * @returns {{ success: boolean, errorMessage?: string }}
 */
function handleDeleteSalvagePart(databaseConnection, _event, payload) {
  const { partId } = (payload && typeof payload === 'object') ? payload : {};
  if (!Number.isInteger(partId) || partId <= 0) {
    return { success: false, errorMessage: 'A valid part ID is required to delete a record.' };
  }

  const markPartAsRemovedStatement = databaseConnection.prepare(
    `UPDATE salvage_parts SET is_removed = 1 WHERE part_id = ?`
  );

  const updateResult = markPartAsRemovedStatement.run(partId);

  if (updateResult.changes === 0) {
    return { success: false, errorMessage: `No salvage part found with ID ${partId}.` };
  }

  return { success: true };
}

/**
 * Retrieves a single salvage part by its primary key.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ partId: number }} payload
 * @returns {{ success: boolean, salvagePart?: Object, errorMessage?: string }}
 */
function handleGetSalvagePartById(databaseConnection, _event, payload) {
  const { partId } = (payload && typeof payload === 'object') ? payload : {};
  if (!Number.isInteger(partId) || partId <= 0) {
    return { success: false, errorMessage: 'A valid part ID is required.' };
  }

  const selectPartStatement = databaseConnection.prepare(
    `SELECT * FROM salvage_parts WHERE part_id = ?`
  );

  const salvagePart = selectPartStatement.get(partId);

  if (!salvagePart) {
    return { success: false, errorMessage: `No salvage part found with ID ${partId}.` };
  }

  return { success: true, salvagePart };
}

/**
 * Searches salvage parts by keyword across name, make, model, and part number.
 * Returns at most MAX_SEARCH_RESULTS rows, sorted by most recently added first.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ searchKeyword: string, includeAlreadySoldParts?: boolean }} searchOptions
 * @returns {{ success: boolean, salvagePartList?: Object[], errorMessage?: string }}
 */
function handleSearchSalvageParts(databaseConnection, _event, searchOptions = {}) {
  const { searchKeyword = '', includeAlreadySoldParts = false } = searchOptions;

  if (typeof searchKeyword !== 'string') {
    return { success: false, errorMessage: 'A valid search keyword string is required.' };
  }

  const searchPattern = `%${searchKeyword.trim()}%`;
  const soldFilterClause = includeAlreadySoldParts ? '' : 'AND is_sold = 0';

  const searchPartsStatement = databaseConnection.prepare(`
    SELECT * FROM salvage_parts
    WHERE (
      part_name    LIKE @searchPattern OR
      vehicle_make LIKE @searchPattern OR
      vehicle_model LIKE @searchPattern OR
      part_number  LIKE @searchPattern
    )
    AND is_removed = 0
    ${soldFilterClause}
    ORDER BY date_added DESC
    LIMIT @maxResults
  `);

  const salvagePartList = searchPartsStatement.all({
    searchPattern,
    maxResults: MAX_SEARCH_RESULTS,
  });

  return { success: true, salvagePartList };
}

module.exports = { registerInventoryIpcHandlers };
