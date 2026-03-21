/**
 * inventory-handlers.test.js
 *
 * Integration tests for the salvage-part inventory IPC handlers.
 * Each test uses a fresh in-memory SQLite database so tests are fully isolated.
 *
 * Run with: npm test
 */

'use strict';

const Database = require('better-sqlite3');
const { registerInventoryIpcHandlers } = require('../src/main/ipc-handlers/inventory-handlers');
const { IPC_CHANNELS } = require('../src/shared/constants');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory SQLite database and runs the schema migration so handler
 * tests can insert and query records without touching the filesystem.
 *
 * @returns {import('better-sqlite3').Database}
 */
function createInMemoryTestDatabase() {
  const testDatabase = new Database(':memory:');

  testDatabase.exec(`
    CREATE TABLE IF NOT EXISTS salvage_parts (
      part_id             INTEGER PRIMARY KEY AUTOINCREMENT,
      part_name           TEXT    NOT NULL,
      vehicle_make        TEXT    NOT NULL,
      vehicle_model       TEXT    NOT NULL,
      vehicle_year        INTEGER NOT NULL,
      part_number         TEXT,
      part_condition      TEXT    NOT NULL,
      asking_price_cents  INTEGER NOT NULL DEFAULT 0,
      is_sold             INTEGER NOT NULL DEFAULT 0,
      date_added          TEXT    NOT NULL DEFAULT (datetime('now')),
      notes               TEXT
    );

    CREATE TABLE IF NOT EXISTS customers (
      customer_id           INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_first_name   TEXT NOT NULL,
      customer_last_name    TEXT NOT NULL,
      customer_phone_number TEXT,
      customer_email_address TEXT,
      date_added            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sale_transactions (
      sale_id           INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id       INTEGER REFERENCES customers(customer_id),
      sale_status       TEXT    NOT NULL DEFAULT 'completed',
      tax_rate_decimal  REAL    NOT NULL DEFAULT 0.08,
      sale_date         TEXT    NOT NULL DEFAULT (datetime('now')),
      notes             TEXT
    );

    CREATE TABLE IF NOT EXISTS sale_line_items (
      line_item_id              INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id                   INTEGER NOT NULL REFERENCES sale_transactions(sale_id),
      part_id                   INTEGER NOT NULL REFERENCES salvage_parts(part_id),
      quantity_sold             INTEGER NOT NULL DEFAULT 1,
      agreed_unit_price_cents   INTEGER NOT NULL
    );
  `);

  return testDatabase;
}

/**
 * Registers handlers with a mock ipcMain and returns a map of channel → handler function,
 * so tests can invoke handlers directly without a running Electron process.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @returns {Object.<string, Function>}
 */
function buildHandlerMap(databaseConnection) {
  const handlerMap = {};
  const mockIpcMain = { handle: (channel, fn) => { handlerMap[channel] = fn; } };
  registerInventoryIpcHandlers(mockIpcMain, databaseConnection);
  return handlerMap;
}

/** Reusable mock renderer event (unused by all inventory handlers). */
const mockRendererEvent = {};

/** A complete, valid salvage part payload reused across tests. */
const validSalvagePartPayload = {
  partName: 'Passenger Side Mirror',
  vehicleMake: 'Toyota',
  vehicleModel: 'Camry',
  vehicleYear: 2018,
  partNumber: 'TOY-CAM-PSM-18',
  partCondition: 'Good',
  askingPriceDollars: 45.00,
  notes: 'Minor scratch on housing',
};

// ---------------------------------------------------------------------------
// handleAddSalvagePart
// ---------------------------------------------------------------------------

describe('handleAddSalvagePart', () => {
  let testDatabase;
  let handlers;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildHandlerMap(testDatabase);
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success with a new partId when given valid part data', () => {
    const result = handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, validSalvagePartPayload);

    expect(result.success).toBe(true);
    expect(typeof result.partId).toBe('number');
    expect(result.partId).toBeGreaterThan(0);
  });

  test('persists the part record so it can be retrieved afterwards', () => {
    const addResult = handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, validSalvagePartPayload);
    const insertedPart = testDatabase
      .prepare('SELECT * FROM salvage_parts WHERE part_id = ?')
      .get(addResult.partId);

    expect(insertedPart).not.toBeNull();
    expect(insertedPart.part_name).toBe('Passenger Side Mirror');
    expect(insertedPart.vehicle_make).toBe('Toyota');
    expect(insertedPart.asking_price_cents).toBe(4500);
    expect(insertedPart.is_sold).toBe(0);
  });

  test('returns success false when part name is missing', () => {
    const partDataMissingName = { ...validSalvagePartPayload, partName: '' };
    const result = handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, partDataMissingName);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/part name/i);
  });

  test('returns success false when asking price is negative', () => {
    const partDataWithNegativePrice = { ...validSalvagePartPayload, askingPriceDollars: -20 };
    const result = handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, partDataWithNegativePrice);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/asking price/i);
  });

  test('converts dollar amount to cents when storing in the database', () => {
    const partDataWithDecimalPrice = { ...validSalvagePartPayload, askingPriceDollars: 12.99 };
    const addResult = handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, partDataWithDecimalPrice);
    const insertedPart = testDatabase
      .prepare('SELECT asking_price_cents FROM salvage_parts WHERE part_id = ?')
      .get(addResult.partId);

    expect(insertedPart.asking_price_cents).toBe(1299);
  });
});

// ---------------------------------------------------------------------------
// handleUpdateSalvagePart
// ---------------------------------------------------------------------------

describe('handleUpdateSalvagePart', () => {
  let testDatabase;
  let handlers;
  let existingPartId;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildHandlerMap(testDatabase);
    const addResult = handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, validSalvagePartPayload);
    existingPartId = addResult.partId;
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success when updating an existing part with valid data', () => {
    const updatedPartData = {
      ...validSalvagePartPayload,
      partId: existingPartId,
      askingPriceDollars: 55.00,
      notes: 'Price updated after inspection',
    };
    const result = handlers[IPC_CHANNELS.INVENTORY_UPDATE_PART](mockRendererEvent, updatedPartData);

    expect(result.success).toBe(true);
  });

  test('reflects the updated values in the database after a successful update', () => {
    const updatedPartData = {
      ...validSalvagePartPayload,
      partId: existingPartId,
      partName: 'Driver Side Mirror',
      askingPriceDollars: 55.00,
    };
    handlers[IPC_CHANNELS.INVENTORY_UPDATE_PART](mockRendererEvent, updatedPartData);

    const updatedRecord = testDatabase
      .prepare('SELECT part_name, asking_price_cents FROM salvage_parts WHERE part_id = ?')
      .get(existingPartId);

    expect(updatedRecord.part_name).toBe('Driver Side Mirror');
    expect(updatedRecord.asking_price_cents).toBe(5500);
  });

  test('returns success false when partId does not exist in the database', () => {
    const updatedPartData = { ...validSalvagePartPayload, partId: 99999 };
    const result = handlers[IPC_CHANNELS.INVENTORY_UPDATE_PART](mockRendererEvent, updatedPartData);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/99999/);
  });

  test('returns success false when partId is zero or negative', () => {
    const updatedPartData = { ...validSalvagePartPayload, partId: 0 };
    const result = handlers[IPC_CHANNELS.INVENTORY_UPDATE_PART](mockRendererEvent, updatedPartData);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/part id/i);
  });

  test('returns success false when the updated part data fails validation', () => {
    const invalidUpdatedPartData = { ...validSalvagePartPayload, partId: existingPartId, vehicleMake: '' };
    const result = handlers[IPC_CHANNELS.INVENTORY_UPDATE_PART](mockRendererEvent, invalidUpdatedPartData);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/vehicle make/i);
  });
});

// ---------------------------------------------------------------------------
// handleDeleteSalvagePart
// ---------------------------------------------------------------------------

describe('handleDeleteSalvagePart', () => {
  let testDatabase;
  let handlers;
  let existingPartId;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildHandlerMap(testDatabase);
    const addResult = handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, validSalvagePartPayload);
    existingPartId = addResult.partId;
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success when deleting an existing part', () => {
    const result = handlers[IPC_CHANNELS.INVENTORY_DELETE_PART](mockRendererEvent, { partId: existingPartId });

    expect(result.success).toBe(true);
  });

  test('marks the part as sold (soft-delete) rather than removing the row', () => {
    handlers[IPC_CHANNELS.INVENTORY_DELETE_PART](mockRendererEvent, { partId: existingPartId });

    const partRecord = testDatabase
      .prepare('SELECT is_sold FROM salvage_parts WHERE part_id = ?')
      .get(existingPartId);

    expect(partRecord).not.toBeNull();
    expect(partRecord.is_sold).toBe(1);
  });

  test('returns success false when no part exists with the given partId', () => {
    const result = handlers[IPC_CHANNELS.INVENTORY_DELETE_PART](mockRendererEvent, { partId: 99999 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/99999/);
  });

  test('returns success false when partId is not a positive integer', () => {
    const result = handlers[IPC_CHANNELS.INVENTORY_DELETE_PART](mockRendererEvent, { partId: -5 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid part id/i);
  });
});

// ---------------------------------------------------------------------------
// handleGetSalvagePartById
// ---------------------------------------------------------------------------

describe('handleGetSalvagePartById', () => {
  let testDatabase;
  let handlers;
  let existingPartId;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildHandlerMap(testDatabase);
    const addResult = handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, validSalvagePartPayload);
    existingPartId = addResult.partId;
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success with the salvagePart object for an existing partId', () => {
    const result = handlers[IPC_CHANNELS.INVENTORY_GET_PART_BY_ID](mockRendererEvent, { partId: existingPartId });

    expect(result.success).toBe(true);
    expect(result.salvagePart).toBeDefined();
    expect(result.salvagePart.part_name).toBe('Passenger Side Mirror');
    expect(result.salvagePart.vehicle_make).toBe('Toyota');
  });

  test('returns success false when no part exists with the given partId', () => {
    const result = handlers[IPC_CHANNELS.INVENTORY_GET_PART_BY_ID](mockRendererEvent, { partId: 99999 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/99999/);
  });

  test('returns success false when partId is zero', () => {
    const result = handlers[IPC_CHANNELS.INVENTORY_GET_PART_BY_ID](mockRendererEvent, { partId: 0 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid part id/i);
  });
});

// ---------------------------------------------------------------------------
// handleSearchSalvageParts
// ---------------------------------------------------------------------------

describe('handleSearchSalvageParts', () => {
  let testDatabase;
  let handlers;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildHandlerMap(testDatabase);

    handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, {
      ...validSalvagePartPayload,
      partName: 'Front Bumper',
      vehicleMake: 'Honda',
      vehicleModel: 'Civic',
      vehicleYear: 2019,
    });
    handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, {
      ...validSalvagePartPayload,
      partName: 'Rear Bumper',
      vehicleMake: 'Ford',
      vehicleModel: 'Mustang',
      vehicleYear: 2020,
    });
    handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, {
      ...validSalvagePartPayload,
      partName: 'Engine Block',
      vehicleMake: 'Chevrolet',
      vehicleModel: 'Silverado',
      vehicleYear: 2016,
    });
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success with all available parts when search keyword is empty', () => {
    const result = handlers[IPC_CHANNELS.INVENTORY_SEARCH_PARTS](mockRendererEvent, { searchKeyword: '' });

    expect(result.success).toBe(true);
    expect(result.salvagePartList).toHaveLength(3);
  });

  test('returns only parts whose name matches the search keyword', () => {
    const result = handlers[IPC_CHANNELS.INVENTORY_SEARCH_PARTS](mockRendererEvent, { searchKeyword: 'Bumper' });

    expect(result.success).toBe(true);
    expect(result.salvagePartList).toHaveLength(2);
    const partNames = result.salvagePartList.map((p) => p.part_name);
    expect(partNames).toContain('Front Bumper');
    expect(partNames).toContain('Rear Bumper');
  });

  test('returns parts matching by vehicle make', () => {
    const result = handlers[IPC_CHANNELS.INVENTORY_SEARCH_PARTS](mockRendererEvent, { searchKeyword: 'Honda' });

    expect(result.success).toBe(true);
    expect(result.salvagePartList).toHaveLength(1);
    expect(result.salvagePartList[0].part_name).toBe('Front Bumper');
  });

  test('returns an empty list when no parts match the search keyword', () => {
    const result = handlers[IPC_CHANNELS.INVENTORY_SEARCH_PARTS](mockRendererEvent, { searchKeyword: 'Transmission' });

    expect(result.success).toBe(true);
    expect(result.salvagePartList).toHaveLength(0);
  });

  test('excludes sold parts from results by default', () => {
    // Mark the Front Bumper as sold via the delete handler.
    const frontBumper = testDatabase
      .prepare("SELECT part_id FROM salvage_parts WHERE part_name = 'Front Bumper'")
      .get();
    handlers[IPC_CHANNELS.INVENTORY_DELETE_PART](mockRendererEvent, { partId: frontBumper.part_id });

    const result = handlers[IPC_CHANNELS.INVENTORY_SEARCH_PARTS](mockRendererEvent, { searchKeyword: 'Bumper' });

    expect(result.salvagePartList).toHaveLength(1);
    expect(result.salvagePartList[0].part_name).toBe('Rear Bumper');
  });

  test('includes sold parts when includeAlreadySoldParts is true', () => {
    const frontBumper = testDatabase
      .prepare("SELECT part_id FROM salvage_parts WHERE part_name = 'Front Bumper'")
      .get();
    handlers[IPC_CHANNELS.INVENTORY_DELETE_PART](mockRendererEvent, { partId: frontBumper.part_id });

    const result = handlers[IPC_CHANNELS.INVENTORY_SEARCH_PARTS](mockRendererEvent, {
      searchKeyword: 'Bumper',
      includeAlreadySoldParts: true,
    });

    expect(result.salvagePartList).toHaveLength(2);
  });
});
