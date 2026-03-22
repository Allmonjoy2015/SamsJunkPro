/**
 * compliance-handlers.test.js
 *
 * Integration tests for compliance IPC handlers (daily_logs and compliance_log).
 * Uses an in-memory better-sqlite3 database and a mock ipcMain.
 */

'use strict';

const Database = require('better-sqlite3');
const { registerComplianceIpcHandlers } = require('../src/main/ipc-handlers/compliance-handlers');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory SQLite database with the daily_logs and compliance_log tables.
 *
 * @returns {import('better-sqlite3').Database}
 */
function createInMemoryTestDatabase() {
  const testDatabase = new Database(':memory:');

  testDatabase.exec(`
    CREATE TABLE daily_logs (
      log_id            INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date          TEXT    NOT NULL UNIQUE,
      opening_inventory TEXT,
      purchases         TEXT,
      sales             TEXT,
      closing_inventory TEXT,
      cash_on_hand      REAL    NOT NULL DEFAULT 0,
      checks_received   REAL    NOT NULL DEFAULT 0,
      notes             TEXT,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE compliance_log (
      incident_id          INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date             TEXT    NOT NULL,
      police_report_number TEXT,
      officer_name         TEXT,
      officer_badge        TEXT,
      items_confiscated    TEXT,
      reason               TEXT,
      disposition          TEXT,
      created_at           TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return testDatabase;
}

/**
 * Creates a minimal ipcMain mock.
 *
 * @returns {{ handle: Function, invoke: Function }}
 */
function createMockIpcMain() {
  const handlerMap = {};
  return {
    handle: (channel, handlerFn) => {
      handlerMap[channel] = handlerFn;
    },
    invoke: (channel, payload) => handlerMap[channel](null, payload),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerComplianceIpcHandlers', () => {
  let testDatabase;
  let mockIpcMain;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    mockIpcMain  = createMockIpcMain();
    registerComplianceIpcHandlers(mockIpcMain, testDatabase);
  });

  afterEach(() => {
    testDatabase.close();
  });

  // -------------------------------------------------------------------------
  // compliance:addDailyLog
  // -------------------------------------------------------------------------

  test('adds a daily log entry with all fields and returns a log ID', () => {
    const result = mockIpcMain.invoke('compliance:addDailyLog', {
      logDate:          '2026-03-22',
      openingInventory: [{ partId: 1, partName: 'Door' }],
      purchases:        [],
      sales:            [{ partId: 1, amountCents: 5000 }],
      closingInventory: [],
      cashOnHand:       300,
      checksReceived:   100,
      notes:            'End of day.',
    });

    expect(result.success).toBe(true);
    expect(typeof result.logId).toBe('number');
    expect(result.logId).toBeGreaterThan(0);
  });

  test('adds a daily log entry with only required logDate', () => {
    const result = mockIpcMain.invoke('compliance:addDailyLog', { logDate: '2026-03-22' });
    expect(result.success).toBe(true);
  });

  test('returns an error when logDate is missing', () => {
    const result = mockIpcMain.invoke('compliance:addDailyLog', { cashOnHand: 200 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/log date/i);
  });

  test('returns an error when logDate format is invalid', () => {
    const result = mockIpcMain.invoke('compliance:addDailyLog', { logDate: '22-03-2026' });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/yyyy-mm-dd/i);
  });

  test('upserts a daily log entry when the same date is submitted twice', () => {
    mockIpcMain.invoke('compliance:addDailyLog', { logDate: '2026-03-22', cashOnHand: 100 });
    mockIpcMain.invoke('compliance:addDailyLog', { logDate: '2026-03-22', cashOnHand: 999 });

    const getResult = mockIpcMain.invoke('compliance:getDailyLogByDate', { logDate: '2026-03-22' });
    expect(getResult.success).toBe(true);
    expect(getResult.dailyLog.cash_on_hand).toBe(999);
  });

  test('returns an error when cashOnHand is negative', () => {
    const result = mockIpcMain.invoke('compliance:addDailyLog', {
      logDate: '2026-03-22',
      cashOnHand: -50,
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/cash on hand/i);
  });

  // -------------------------------------------------------------------------
  // compliance:getDailyLogs
  // -------------------------------------------------------------------------

  test('returns all daily log entries ordered by date descending', () => {
    mockIpcMain.invoke('compliance:addDailyLog', { logDate: '2026-03-20' });
    mockIpcMain.invoke('compliance:addDailyLog', { logDate: '2026-03-22' });
    mockIpcMain.invoke('compliance:addDailyLog', { logDate: '2026-03-21' });

    const result = mockIpcMain.invoke('compliance:getDailyLogs', {});
    expect(result.success).toBe(true);
    expect(result.dailyLogList.length).toBe(3);
    expect(result.dailyLogList[0].log_date).toBe('2026-03-22');
    expect(result.dailyLogList[2].log_date).toBe('2026-03-20');
  });

  // -------------------------------------------------------------------------
  // compliance:getDailyLogByDate
  // -------------------------------------------------------------------------

  test('retrieves a daily log by date and deserializable JSON fields are stored correctly', () => {
    const inventorySnapshot = [{ partId: 5, partName: 'Bumper', quantity: 2 }];
    mockIpcMain.invoke('compliance:addDailyLog', {
      logDate:          '2026-03-22',
      openingInventory: inventorySnapshot,
      cashOnHand:       450,
    });

    const result = mockIpcMain.invoke('compliance:getDailyLogByDate', { logDate: '2026-03-22' });
    expect(result.success).toBe(true);
    expect(result.dailyLog.cash_on_hand).toBe(450);
    // JSON columns are stored as strings; caller is responsible for parsing.
    expect(JSON.parse(result.dailyLog.opening_inventory)).toEqual(inventorySnapshot);
  });

  test('returns an error when no daily log exists for the requested date', () => {
    const result = mockIpcMain.invoke('compliance:getDailyLogByDate', { logDate: '2000-01-01' });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/2000-01-01/);
  });

  // -------------------------------------------------------------------------
  // compliance:addIncident
  // -------------------------------------------------------------------------

  test('adds a compliance incident record and returns an incident ID', () => {
    const result = mockIpcMain.invoke('compliance:addIncident', {
      logDate:             '2026-03-22',
      policeReportNumber:  'RPT-2026-001',
      officerName:         'Officer Jane Doe',
      officerBadge:        'B-1234',
      itemsConfiscated:    [{ description: 'Copper wire, 10 lbs' }],
      reason:              'Suspected stolen material',
      disposition:         'Items held pending investigation',
    });

    expect(result.success).toBe(true);
    expect(typeof result.incidentId).toBe('number');
    expect(result.incidentId).toBeGreaterThan(0);
  });

  test('returns an error when logDate is missing for a compliance incident', () => {
    const result = mockIpcMain.invoke('compliance:addIncident', {
      officerName: 'Officer Smith',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/log date/i);
  });

  // -------------------------------------------------------------------------
  // compliance:getIncidents
  // -------------------------------------------------------------------------

  test('returns all compliance incidents ordered by date then ID descending', () => {
    mockIpcMain.invoke('compliance:addIncident', { logDate: '2026-03-20', officerName: 'Officer A' });
    mockIpcMain.invoke('compliance:addIncident', { logDate: '2026-03-22', officerName: 'Officer B' });

    const result = mockIpcMain.invoke('compliance:getIncidents', {});
    expect(result.success).toBe(true);
    expect(result.complianceIncidentList.length).toBe(2);
    expect(result.complianceIncidentList[0].log_date).toBe('2026-03-22');
  });

  // -------------------------------------------------------------------------
  // compliance:getIncidentById
  // -------------------------------------------------------------------------

  test('retrieves a compliance incident by ID including all stored fields', () => {
    const addResult = mockIpcMain.invoke('compliance:addIncident', {
      logDate:            '2026-03-22',
      policeReportNumber: 'RPT-2026-002',
      officerName:        'Officer Smith',
      officerBadge:       'B-5678',
    });

    const getResult = mockIpcMain.invoke('compliance:getIncidentById', { incidentId: addResult.incidentId });
    expect(getResult.success).toBe(true);
    expect(getResult.complianceIncident.police_report_number).toBe('RPT-2026-002');
    expect(getResult.complianceIncident.officer_name).toBe('Officer Smith');
  });

  test('returns an error when no incident exists for the given ID', () => {
    const result = mockIpcMain.invoke('compliance:getIncidentById', { incidentId: 9999 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/9999/);
  });

  test('returns an error when the incident ID is not a positive integer', () => {
    const result = mockIpcMain.invoke('compliance:getIncidentById', { incidentId: -1 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid incident id/i);
  });
});
