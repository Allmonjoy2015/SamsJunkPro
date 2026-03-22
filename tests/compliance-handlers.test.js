/**
 * compliance-handlers.test.js
 *
 * Integration tests for the compliance IPC handlers (daily_logs and
 * compliance_log).  These tests use an in-memory better-sqlite3 database and
 * a minimal ipcMain mock so they can run without Electron.
 */

'use strict';

const Database = require('better-sqlite3');
const { registerComplianceIpcHandlers } = require('../src/main/ipc-handlers/compliance-handlers');
const { IPC_CHANNELS } = require('../src/shared/constants');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal in-memory SQLite database with the tables needed by the
 * compliance handlers.
 *
 * @returns {import('better-sqlite3').Database}
 */
function createInMemoryTestDatabase() {
  const db = new Database(':memory:');

  db.exec(`
    CREATE TABLE daily_logs (
      log_id              INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date            TEXT    NOT NULL UNIQUE,
      opening_inventory   TEXT,
      purchases           TEXT,
      sales               TEXT,
      closing_inventory   TEXT,
      cash_on_hand        REAL    NOT NULL DEFAULT 0,
      checks_received     REAL    NOT NULL DEFAULT 0,
      notes               TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE compliance_log (
      compliance_id       INTEGER PRIMARY KEY AUTOINCREMENT,
      log_date            TEXT    NOT NULL,
      police_report_number TEXT,
      officer_name        TEXT,
      officer_badge       TEXT,
      items_confiscated   TEXT,
      reason              TEXT,
      disposition         TEXT,
      created_at          TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  return db;
}

/**
 * Creates a lightweight ipcMain mock that stores handlers by channel name so
 * they can be invoked directly in tests.
 *
 * @returns {{ handle: Function, invoke: Function }}
 */
function createMockIpcMain() {
  const handlerMap = {};
  return {
    handle(channel, handlerFunction) {
      handlerMap[channel] = handlerFunction;
    },
    /** Invokes a registered handler as if called from the renderer. */
    invoke(channel, payload) {
      const handlerFunction = handlerMap[channel];
      if (!handlerFunction) {
        throw new Error(`No handler registered for channel "${channel}"`);
      }
      // Pass a null event (unused in handler implementations) plus the payload.
      return handlerFunction(null, payload);
    },
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let db;
let ipcMainMock;

beforeEach(() => {
  db = createInMemoryTestDatabase();
  ipcMainMock = createMockIpcMain();
  registerComplianceIpcHandlers(ipcMainMock, db);
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Daily-log handler tests
// ---------------------------------------------------------------------------

describe('DAILY_LOGS_ADD handler', () => {
  test('inserts a new daily log and returns success with a logId', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_ADD, {
      logDate: '2025-07-04',
      cashOnHand: 500.00,
      checksReceived: 75.00,
      notes: 'Independence Day — busy day',
    });

    expect(result.success).toBe(true);
    expect(typeof result.logId).toBe('number');
    expect(result.logId).toBeGreaterThan(0);
  });

  test('stores JSON-serialisable opening and closing inventory snapshots', () => {
    const openingInventory = [{ partId: 1, partName: 'Door' }];
    const closingInventory = [{ partId: 1, partName: 'Door' }, { partId: 2, partName: 'Hood' }];

    ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_ADD, {
      logDate: '2025-07-05',
      openingInventory,
      closingInventory,
    });

    const row = db.prepare(`SELECT * FROM daily_logs WHERE log_date = '2025-07-05'`).get();
    expect(JSON.parse(row.opening_inventory)).toEqual(openingInventory);
    expect(JSON.parse(row.closing_inventory)).toEqual(closingInventory);
  });

  test('updates an existing daily log when the same date is submitted again', () => {
    ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_ADD, {
      logDate: '2025-07-06',
      cashOnHand: 100,
    });

    ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_ADD, {
      logDate: '2025-07-06',
      cashOnHand: 250,
      notes: 'Updated at close of day',
    });

    const rows = db.prepare(`SELECT * FROM daily_logs WHERE log_date = '2025-07-06'`).all();
    expect(rows.length).toBe(1);
    expect(rows[0].cash_on_hand).toBe(250);
    expect(rows[0].notes).toBe('Updated at close of day');
  });

  test('returns success false and an error message when log date is missing', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_ADD, { cashOnHand: 100 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/log date/i);
  });

  test('returns success false when log date format is invalid', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_ADD, { logDate: '04-07-2025' });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/YYYY-MM-DD/);
  });

  test('returns success false when cash on hand is negative', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_ADD, {
      logDate: '2025-07-04',
      cashOnHand: -1,
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/cash on hand/i);
  });
});

describe('DAILY_LOGS_GET_BY_DATE handler', () => {
  beforeEach(() => {
    ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_ADD, {
      logDate: '2025-07-10',
      cashOnHand: 300,
      notes: 'Test log',
    });
  });

  test('returns the daily log for an existing date', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_GET_BY_DATE, {
      logDate: '2025-07-10',
    });

    expect(result.success).toBe(true);
    expect(result.dailyLog).toBeDefined();
    expect(result.dailyLog.log_date).toBe('2025-07-10');
    expect(result.dailyLog.cash_on_hand).toBe(300);
  });

  test('returns success false when no log exists for the given date', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_GET_BY_DATE, {
      logDate: '2000-01-01',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/no daily log/i);
  });

  test('returns success false when the date format is invalid', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_GET_BY_DATE, {
      logDate: 'yesterday',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/YYYY-MM-DD/i);
  });
});

describe('DAILY_LOGS_GET_RANGE handler', () => {
  beforeEach(() => {
    ['2025-07-01', '2025-07-02', '2025-07-03'].forEach((logDate) => {
      ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_ADD, { logDate, cashOnHand: 100 });
    });
  });

  test('returns all daily logs within the specified date range', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_GET_RANGE, {
      startDate: '2025-07-01',
      endDate: '2025-07-03',
    });

    expect(result.success).toBe(true);
    expect(result.dailyLogList).toHaveLength(3);
  });

  test('returns only logs that fall within a narrower range', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_GET_RANGE, {
      startDate: '2025-07-02',
      endDate: '2025-07-02',
    });

    expect(result.success).toBe(true);
    expect(result.dailyLogList).toHaveLength(1);
    expect(result.dailyLogList[0].log_date).toBe('2025-07-02');
  });

  test('returns success false when start date is after end date', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_GET_RANGE, {
      startDate: '2025-07-31',
      endDate: '2025-07-01',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/start date/i);
  });

  test('returns success false when start date format is invalid', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.DAILY_LOGS_GET_RANGE, {
      startDate: 'bad-date',
      endDate: '2025-07-31',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/start date/i);
  });
});

// ---------------------------------------------------------------------------
// Compliance-log handler tests
// ---------------------------------------------------------------------------

describe('COMPLIANCE_LOG_ADD handler', () => {
  test('inserts a new compliance log entry and returns success with a complianceId', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_ADD, {
      logDate: '2025-08-15',
      policeReportNumber: 'RPT-2025-001',
      officerName: 'Officer Jane Doe',
      officerBadge: 'B-4521',
      itemsConfiscated: [{ description: 'Catalytic converter', quantity: 2 }],
      reason: 'Suspected stolen property',
      disposition: 'Turned over to police',
    });

    expect(result.success).toBe(true);
    expect(typeof result.complianceId).toBe('number');
    expect(result.complianceId).toBeGreaterThan(0);
  });

  test('stores items confiscated as a JSON string', () => {
    const itemsConfiscated = [{ description: 'Rims', quantity: 4 }];

    ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_ADD, {
      logDate: '2025-08-16',
      itemsConfiscated,
    });

    const row = db
      .prepare(`SELECT * FROM compliance_log WHERE log_date = '2025-08-16'`)
      .get();
    expect(JSON.parse(row.items_confiscated)).toEqual(itemsConfiscated);
  });

  test('allows multiple compliance log entries for the same date', () => {
    ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_ADD, {
      logDate: '2025-08-17',
      reason: 'First visit',
    });
    ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_ADD, {
      logDate: '2025-08-17',
      reason: 'Second visit',
    });

    const rows = db
      .prepare(`SELECT * FROM compliance_log WHERE log_date = '2025-08-17'`)
      .all();
    expect(rows.length).toBe(2);
  });

  test('returns success false when log date is missing', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_ADD, {
      reason: 'Missing date',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/log date/i);
  });

  test('returns success false when log date format is invalid', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_ADD, {
      logDate: '08/15/2025',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/YYYY-MM-DD/);
  });
});

describe('COMPLIANCE_LOG_GET_ALL handler', () => {
  test('returns an empty list when no compliance log entries exist', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_GET_ALL, undefined);
    expect(result.success).toBe(true);
    expect(result.complianceLogList).toEqual([]);
  });

  test('returns all compliance log entries ordered by date descending', () => {
    ['2025-08-10', '2025-08-12', '2025-08-11'].forEach((logDate) => {
      ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_ADD, { logDate });
    });

    const result = ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_GET_ALL, undefined);

    expect(result.success).toBe(true);
    expect(result.complianceLogList).toHaveLength(3);
    expect(result.complianceLogList[0].log_date).toBe('2025-08-12');
    expect(result.complianceLogList[2].log_date).toBe('2025-08-10');
  });
});

describe('COMPLIANCE_LOG_GET_BY_DATE handler', () => {
  beforeEach(() => {
    ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_ADD, {
      logDate: '2025-09-01',
      reason: 'Morning inspection',
    });
    ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_ADD, {
      logDate: '2025-09-01',
      reason: 'Afternoon follow-up',
    });
  });

  test('returns all compliance log entries for the specified date', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_GET_BY_DATE, {
      logDate: '2025-09-01',
    });

    expect(result.success).toBe(true);
    expect(result.complianceLogList).toHaveLength(2);
  });

  test('returns an empty list when no entries exist for the date', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_GET_BY_DATE, {
      logDate: '2000-01-01',
    });
    expect(result.success).toBe(true);
    expect(result.complianceLogList).toEqual([]);
  });

  test('returns success false when the date format is invalid', () => {
    const result = ipcMainMock.invoke(IPC_CHANNELS.COMPLIANCE_LOG_GET_BY_DATE, {
      logDate: 'Sept 1 2025',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/YYYY-MM-DD/i);
  });
});
