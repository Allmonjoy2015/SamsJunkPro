/**
 * compliance-handlers.js
 *
 * Registers Electron IPC handlers for regulatory-compliance operations:
 *  - daily_logs  : end-of-day operating summaries required by scrap-metal laws.
 *  - compliance_log : law-enforcement interaction records.
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
  ipcMain.handle(IPC_CHANNELS.COMPLIANCE_ADD_DAILY_LOG,         handleAddDailyLog.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.COMPLIANCE_GET_DAILY_LOGS,        handleGetDailyLogs.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.COMPLIANCE_GET_DAILY_LOG_BY_DATE, handleGetDailyLogByDate.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.COMPLIANCE_ADD_INCIDENT,          handleAddComplianceIncident.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.COMPLIANCE_GET_INCIDENTS,         handleGetComplianceIncidents.bind(null, databaseConnection));
  ipcMain.handle(IPC_CHANNELS.COMPLIANCE_GET_INCIDENT_BY_ID,    handleGetComplianceIncidentById.bind(null, databaseConnection));
}

// ---------------------------------------------------------------------------
// daily_logs handlers
// ---------------------------------------------------------------------------

/**
 * Creates or replaces the daily log entry for the given date.
 * Each calendar date may have only one log entry (enforced by the UNIQUE
 * constraint on `log_date`).
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{
 *   logDate: string,
 *   openingInventory?: any,
 *   purchases?: any,
 *   sales?: any,
 *   closingInventory?: any,
 *   cashOnHand?: number,
 *   checksReceived?: number,
 *   notes?: string
 * }} dailyLogData
 * @returns {{ success: boolean, logId?: number, errorMessage?: string }}
 */
function handleAddDailyLog(databaseConnection, _event, dailyLogData) {
  const validationResult = validateDailyLogData(dailyLogData);
  if (!validationResult.isValid) {
    return { success: false, errorMessage: validationResult.errorMessage };
  }

  const insertDailyLogStatement = databaseConnection.prepare(`
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

  const insertResult = insertDailyLogStatement.run({
    logDate:          dailyLogData.logDate.trim(),
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
    cashOnHand:      dailyLogData.cashOnHand      != null ? dailyLogData.cashOnHand      : 0,
    checksReceived:  dailyLogData.checksReceived  != null ? dailyLogData.checksReceived  : 0,
    notes:           dailyLogData.notes           ? dailyLogData.notes.trim() : null,
  });

  return { success: true, logId: insertResult.lastInsertRowid };
}

/**
 * Returns all daily log entries ordered by date descending.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @returns {{ success: boolean, dailyLogList: Object[] }}
 */
function handleGetDailyLogs(databaseConnection) {
  const selectDailyLogsStatement = databaseConnection.prepare(
    `SELECT * FROM daily_logs ORDER BY log_date DESC`
  );
  const dailyLogList = selectDailyLogsStatement.all();
  return { success: true, dailyLogList };
}

/**
 * Returns the daily log entry for a specific date.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ logDate: string }} payload
 * @returns {{ success: boolean, dailyLog?: Object, errorMessage?: string }}
 */
function handleGetDailyLogByDate(databaseConnection, _event, { logDate }) {
  if (!logDate || logDate.trim().length === 0) {
    return { success: false, errorMessage: 'A log date is required.' };
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

// ---------------------------------------------------------------------------
// compliance_log handlers
// ---------------------------------------------------------------------------

/**
 * Creates a new law-enforcement interaction (compliance incident) record.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{
 *   logDate: string,
 *   policeReportNumber?: string,
 *   officerName?: string,
 *   officerBadge?: string,
 *   itemsConfiscated?: any,
 *   reason?: string,
 *   disposition?: string
 * }} complianceIncidentData
 * @returns {{ success: boolean, incidentId?: number, errorMessage?: string }}
 */
function handleAddComplianceIncident(databaseConnection, _event, complianceIncidentData) {
  const validationResult = validateComplianceLogData(complianceIncidentData);
  if (!validationResult.isValid) {
    return { success: false, errorMessage: validationResult.errorMessage };
  }

  const insertIncidentStatement = databaseConnection.prepare(`
    INSERT INTO compliance_log
      (log_date, police_report_number, officer_name, officer_badge,
       items_confiscated, reason, disposition)
    VALUES
      (@logDate, @policeReportNumber, @officerName, @officerBadge,
       @itemsConfiscated, @reason, @disposition)
  `);

  const insertResult = insertIncidentStatement.run({
    logDate:             complianceIncidentData.logDate.trim(),
    policeReportNumber:  complianceIncidentData.policeReportNumber
      ? complianceIncidentData.policeReportNumber.trim()
      : null,
    officerName:  complianceIncidentData.officerName  ? complianceIncidentData.officerName.trim()  : null,
    officerBadge: complianceIncidentData.officerBadge ? complianceIncidentData.officerBadge.trim() : null,
    itemsConfiscated: complianceIncidentData.itemsConfiscated != null
      ? JSON.stringify(complianceIncidentData.itemsConfiscated)
      : null,
    reason:      complianceIncidentData.reason      ? complianceIncidentData.reason.trim()      : null,
    disposition: complianceIncidentData.disposition ? complianceIncidentData.disposition.trim() : null,
  });

  return { success: true, incidentId: insertResult.lastInsertRowid };
}

/**
 * Returns all compliance incident records ordered by date descending.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @returns {{ success: boolean, complianceIncidentList: Object[] }}
 */
function handleGetComplianceIncidents(databaseConnection) {
  const selectIncidentsStatement = databaseConnection.prepare(
    `SELECT * FROM compliance_log ORDER BY log_date DESC, incident_id DESC`
  );
  const complianceIncidentList = selectIncidentsStatement.all();
  return { success: true, complianceIncidentList };
}

/**
 * Returns a single compliance incident record by primary key.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @param {Electron.IpcMainInvokeEvent} _event
 * @param {{ incidentId: number }} payload
 * @returns {{ success: boolean, complianceIncident?: Object, errorMessage?: string }}
 */
function handleGetComplianceIncidentById(databaseConnection, _event, { incidentId }) {
  if (!Number.isInteger(incidentId) || incidentId <= 0) {
    return { success: false, errorMessage: 'A valid incident ID is required.' };
  }

  const selectIncidentStatement = databaseConnection.prepare(
    `SELECT * FROM compliance_log WHERE incident_id = ?`
  );
  const complianceIncident = selectIncidentStatement.get(incidentId);

  if (!complianceIncident) {
    return { success: false, errorMessage: `No compliance incident found with ID ${incidentId}.` };
  }

  return { success: true, complianceIncident };
}

module.exports = { registerComplianceIpcHandlers };
