/**
 * compliance-handlers.js
 *
 * Registers Electron IPC handlers for daily operational logs and police /
 * confiscation compliance log operations.
 *
 * Register all handlers by calling `registerComplianceIpcHandlers(ipcMain, db)`.
 */

'use strict';

const { IPC_CHANNELS } = require('../../shared/constants');
const { validateDailyLogData, validateComplianceLogData } = require('../../shared/validation');

/**
 * Registers all compliance-related IPC handlers with the Electron main process.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {import('better-sqlite3').Database} databaseConnection
 */
function registerComplianceIpcHandlers(ipcMain, databaseConnection) {
  ipcMain.handle(IPC_CHANNELS.DAILY_LOGS_ADD, handleAddDailyLog.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.DAILY_LOGS_GET_BY_DATE, handleGetDailyLogByDate.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.DAILY_LOGS_GET_RANGE, handleGetDailyLogRange.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.COMPLIANCE_LOG_ADD, handleAddComplianceLog.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.COMPLIANCE_LOG_GET_ALL, handleGetAllComplianceLogs.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.COMPLIANCE_LOG_GET_BY_DATE, handleGetComplianceLogsByDate.bind(null, databaseConnection));
}

// ---------------------------------------------------------------------------
// Daily-log handler functions
// ---------------------------------------------------------------------------

/**
 * Inserts or replaces the daily operational log for a given date.
 * Only one log record is allowed per day (enforced by the UNIQUE constraint on
 * `log_date`).  Calling this handler again for the same date will update the
 * existing record.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {Object} dailyLogData
 * @param {string} dailyLogData.logDate           - YYYY-MM-DD
 * @param {any}    [dailyLogData.openingInventory] - Serialisable object; stored as JSON.
 * @param {any}    [dailyLogData.purchases]        - Serialisable array; stored as JSON.
 * @param {any}    [dailyLogData.sales]            - Serialisable array; stored as JSON.
 * @param {any}    [dailyLogData.closingInventory] - Serialisable object; stored as JSON.
 * @param {number} [dailyLogData.cashOnHand]
 * @param {number} [dailyLogData.checksReceived]
 * @param {string} [dailyLogData.notes]
 * @returns {{ success: boolean, logId?: number, errorMessage?: string }}
 */
function handleAddDailyLog(databaseConnection, _event, dailyLogData) {
  const validationResult = validateDailyLogData(dailyLogData);
  if (!validationResult.isValid) {
    return { success: false, errorMessage: validationResult.errorMessage };
  }

  const upsertDailyLogStatement = databaseConnection.prepare(`
    INSERT INTO daily_logs
      (log_date, opening_inventory, purchases, sales, closing_inventory,
       cash_on_hand, checks_received, notes)
    VALUES
      (@logDate, @openingInventory, @purchases, @sales, @closingInventory,
       @cashOnHand, @checksReceived, @notes)
    ON CONFLICT(log_date) DO UPDATE SET
      opening_inventory = excluded.opening_inventory,
      purchases         = excluded.purchases,
      sales             = excluded.sales,
      closing_inventory = excluded.closing_inventory,
      cash_on_hand      = excluded.cash_on_hand,
      checks_received   = excluded.checks_received,
      notes             = excluded.notes
  `);

  const insertResult = upsertDailyLogStatement.run({
    logDate: dailyLogData.logDate.trim(),
    openingInventory: dailyLogData.openingInventory != null
      ? JSON.stringify(dailyLogData.openingInventory)
      : null,
    purchases: dailyLogData.purchases != null
      ? JSON.stringify(dailyLogData.purchases)
      : null,
    sales: dailyLogData.sales != null
      ? JSON.stringify(dailyLogData.sales)
      : null,
    closingInventory: dailyLogData.closingInventory != null
      ? JSON.stringify(dailyLogData.closingInventory)
      : null,
    cashOnHand: dailyLogData.cashOnHand != null ? dailyLogData.cashOnHand : 0,
    checksReceived: dailyLogData.checksReceived != null ? dailyLogData.checksReceived : 0,
    notes: dailyLogData.notes ? dailyLogData.notes.trim() : null,
  });

  return { success: true, logId: insertResult.lastInsertRowid };
}

/**
 * Retrieves the daily log record for a specific date.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ logDate: string }} payload - YYYY-MM-DD date string.
 * @returns {{ success: boolean, dailyLog?: Object, errorMessage?: string }}
 */
function handleGetDailyLogByDate(databaseConnection, _event, { logDate }) {
  if (!logDate || !/^\d{4}-\d{2}-\d{2}$/.test(logDate.trim())) {
    return { success: false, errorMessage: 'A valid log date in YYYY-MM-DD format is required.' };
  }

  const selectDailyLogStatement = databaseConnection.prepare(
    `SELECT * FROM daily_logs WHERE log_date = ?`
  );
  const dailyLog = selectDailyLogStatement.get(logDate.trim());

  if (!dailyLog) {
    return { success: false, errorMessage: `No daily log found for date ${logDate}.` };
  }

  return { success: true, dailyLog };
}

/**
 * Returns all daily log records whose `log_date` falls within an inclusive
 * date range, ordered chronologically.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ startDate: string, endDate: string }} payload - YYYY-MM-DD dates.
 * @returns {{ success: boolean, dailyLogList?: Object[], errorMessage?: string }}
 */
function handleGetDailyLogRange(databaseConnection, _event, { startDate, endDate }) {
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

  if (!startDate || !isoDateRegex.test(startDate.trim())) {
    return { success: false, errorMessage: 'A valid start date in YYYY-MM-DD format is required.' };
  }

  if (!endDate || !isoDateRegex.test(endDate.trim())) {
    return { success: false, errorMessage: 'A valid end date in YYYY-MM-DD format is required.' };
  }

  if (startDate.trim() > endDate.trim()) {
    return { success: false, errorMessage: 'Start date must not be after end date.' };
  }

  const selectRangeStatement = databaseConnection.prepare(`
    SELECT * FROM daily_logs
    WHERE log_date BETWEEN ? AND ?
    ORDER BY log_date ASC
  `);

  const dailyLogList = selectRangeStatement.all(startDate.trim(), endDate.trim());
  return { success: true, dailyLogList };
}

// ---------------------------------------------------------------------------
// Compliance-log handler functions
// ---------------------------------------------------------------------------

/**
 * Inserts a new compliance log entry (e.g. a police visit or item confiscation).
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {Object} complianceLogData
 * @param {string} complianceLogData.logDate           - YYYY-MM-DD
 * @param {string} [complianceLogData.policeReportNumber]
 * @param {string} [complianceLogData.officerName]
 * @param {string} [complianceLogData.officerBadge]
 * @param {any}    [complianceLogData.itemsConfiscated] - Serialisable array; stored as JSON.
 * @param {string} [complianceLogData.reason]
 * @param {string} [complianceLogData.disposition]
 * @returns {{ success: boolean, complianceId?: number, errorMessage?: string }}
 */
function handleAddComplianceLog(databaseConnection, _event, complianceLogData) {
  const validationResult = validateComplianceLogData(complianceLogData);
  if (!validationResult.isValid) {
    return { success: false, errorMessage: validationResult.errorMessage };
  }

  const insertComplianceLogStatement = databaseConnection.prepare(`
    INSERT INTO compliance_log
      (log_date, police_report_number, officer_name, officer_badge,
       items_confiscated, reason, disposition)
    VALUES
      (@logDate, @policeReportNumber, @officerName, @officerBadge,
       @itemsConfiscated, @reason, @disposition)
  `);

  const insertResult = insertComplianceLogStatement.run({
    logDate: complianceLogData.logDate.trim(),
    policeReportNumber: complianceLogData.policeReportNumber
      ? complianceLogData.policeReportNumber.trim()
      : null,
    officerName: complianceLogData.officerName ? complianceLogData.officerName.trim() : null,
    officerBadge: complianceLogData.officerBadge ? complianceLogData.officerBadge.trim() : null,
    itemsConfiscated: complianceLogData.itemsConfiscated != null
      ? JSON.stringify(complianceLogData.itemsConfiscated)
      : null,
    reason: complianceLogData.reason ? complianceLogData.reason.trim() : null,
    disposition: complianceLogData.disposition ? complianceLogData.disposition.trim() : null,
  });

  return { success: true, complianceId: insertResult.lastInsertRowid };
}

/**
 * Returns all compliance log records ordered by date descending.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @returns {{ success: boolean, complianceLogList: Object[] }}
 */
function handleGetAllComplianceLogs(databaseConnection) {
  const selectAllStatement = databaseConnection.prepare(
    `SELECT * FROM compliance_log ORDER BY log_date DESC, compliance_id DESC`
  );
  const complianceLogList = selectAllStatement.all();
  return { success: true, complianceLogList };
}

/**
 * Returns all compliance log records for a specific date.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ logDate: string }} payload - YYYY-MM-DD date string.
 * @returns {{ success: boolean, complianceLogList?: Object[], errorMessage?: string }}
 */
function handleGetComplianceLogsByDate(databaseConnection, _event, { logDate }) {
  if (!logDate || !/^\d{4}-\d{2}-\d{2}$/.test(logDate.trim())) {
    return { success: false, errorMessage: 'A valid log date in YYYY-MM-DD format is required.' };
  }

  const selectByDateStatement = databaseConnection.prepare(
    `SELECT * FROM compliance_log WHERE log_date = ? ORDER BY compliance_id ASC`
  );
  const complianceLogList = selectByDateStatement.all(logDate.trim());
  return { success: true, complianceLogList };
}

module.exports = { registerComplianceIpcHandlers };
