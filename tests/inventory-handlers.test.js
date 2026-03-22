/**
 * inventory-handlers.test.js
 *
 * Unit tests for the IPC handlers in src/main/ipc-handlers/inventory-handlers.js.
 * An in-memory SQLite database is used so that no real file I/O takes place.
 *
 * Run with: npm test
 */

'use strict';

const Database = require('better-sqlite3');
const { registerInventoryIpcHandlers } = require('../src/main/ipc-handlers/inventory-handlers');
const { IPC_CHANNELS } = require('../src/shared/constants');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates and migrates an in-memory SQLite database for testing. */
function createInMemoryDatabase() {
  const db = new Database(':memory:');
  db.exec(`
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
  `);
  return db;
}

/**
 * Creates a minimal mock of Electron's ipcMain, capturing handlers so
 * they can be invoked directly in tests.
 */
function createMockIpcMain() {
  const handlers = {};
  return {
    handle: (channel, fn) => { handlers[channel] = fn; },
    /** Simulate an invoke call from the renderer (event is set to null). */
    invoke: (channel, payload) => handlers[channel](null, payload),
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let db;
let mockIpcMain;

beforeEach(() => {
  db = createInMemoryDatabase();
  mockIpcMain = createMockIpcMain();
  registerInventoryIpcHandlers(mockIpcMain, db);
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Shared valid part data
// ---------------------------------------------------------------------------

const validPartData = {
  partName: 'Passenger Side Mirror',
  vehicleMake: 'Toyota',
  vehicleModel: 'Camry',
  vehicleYear: 2018,
  partCondition: 'Good',
  askingPriceDollars: 45.00,
  partNumber: 'TY-MIRR-001',
  notes: 'Minor surface scratch',
};

// ---------------------------------------------------------------------------
// INVENTORY_ADD_PART
// ---------------------------------------------------------------------------

describe('INVENTORY_ADD_PART handler', () => {
  test('inserts a valid salvage part and returns success with a positive partId', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, validPartData);
    expect(result.success).toBe(true);
    expect(typeof result.partId).toBe('number');
    expect(result.partId).toBeGreaterThan(0);
  });

  test('converts the asking price from dollars to cents in the database', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, validPartData);
    const row = db.prepare('SELECT asking_price_cents FROM salvage_parts WHERE part_id = ?').get(result.partId);
    expect(row.asking_price_cents).toBe(4500);
  });

  test('stores optional partNumber and notes when provided', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, validPartData);
    const row = db.prepare('SELECT part_number, notes FROM salvage_parts WHERE part_id = ?').get(result.partId);
    expect(row.part_number).toBe('TY-MIRR-001');
    expect(row.notes).toBe('Minor surface scratch');
  });

  test('stores null for partNumber and notes when they are absent', () => {
    const partWithoutOptionals = {
      partName: 'Hood',
      vehicleMake: 'Honda',
      vehicleModel: 'Civic',
      vehicleYear: 2010,
      partCondition: 'Fair',
      askingPriceDollars: 80.00,
    };
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, partWithoutOptionals);
    const row = db.prepare('SELECT part_number, notes FROM salvage_parts WHERE part_id = ?').get(result.partId);
    expect(row.part_number).toBeNull();
    expect(row.notes).toBeNull();
  });

  test('returns success false with an errorMessage when partName is empty', () => {
    const badData = { ...validPartData, partName: '' };
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, badData);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/part name/i);
  });

  test('returns success false with an errorMessage when the vehicle year is out of range', () => {
    const badData = { ...validPartData, vehicleYear: 1800 };
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, badData);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/vehicle year/i);
  });

  test('returns success false when the asking price is negative', () => {
    const badData = { ...validPartData, askingPriceDollars: -1 };
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, badData);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/asking price/i);
  });
});

// ---------------------------------------------------------------------------
// INVENTORY_UPDATE_PART
// ---------------------------------------------------------------------------

describe('INVENTORY_UPDATE_PART handler', () => {
  /** Inserts a part and returns its assigned ID. */
  function insertPart(partData = validPartData) {
    return mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, partData).partId;
  }

  test('updates an existing part and returns success', () => {
    const partId = insertPart();
    const updatedData = { ...validPartData, partId, partName: 'Updated Mirror', askingPriceDollars: 60.00 };
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_UPDATE_PART, updatedData);
    expect(result.success).toBe(true);
  });

  test('persists the updated fields in the database', () => {
    const partId = insertPart();
    mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_UPDATE_PART, {
      ...validPartData,
      partId,
      partName: 'Updated Mirror',
      askingPriceDollars: 60.00,
    });
    const row = db.prepare('SELECT part_name, asking_price_cents FROM salvage_parts WHERE part_id = ?').get(partId);
    expect(row.part_name).toBe('Updated Mirror');
    expect(row.asking_price_cents).toBe(6000);
  });

  test('returns success false when partId is missing', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_UPDATE_PART, { ...validPartData });
    expect(result.success).toBe(false);
  });

  test('returns success false when partId does not exist in the database', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_UPDATE_PART, { ...validPartData, partId: 99999 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/no salvage part found/i);
  });

  test('returns success false when updated data fails validation', () => {
    const partId = insertPart();
    const invalidUpdate = { ...validPartData, partId, vehicleMake: '' };
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_UPDATE_PART, invalidUpdate);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/vehicle make/i);
  });
});

// ---------------------------------------------------------------------------
// INVENTORY_DELETE_PART
// ---------------------------------------------------------------------------

describe('INVENTORY_DELETE_PART handler', () => {
  test('soft-deletes an existing part by setting is_sold to 1', () => {
    const { partId } = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, validPartData);
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_DELETE_PART, { partId });
    expect(result.success).toBe(true);

    const row = db.prepare('SELECT is_sold FROM salvage_parts WHERE part_id = ?').get(partId);
    expect(row.is_sold).toBe(1);
  });

  test('returns success false when the partId is not a positive integer', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_DELETE_PART, { partId: -5 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid part id/i);
  });

  test('returns success false when the part does not exist', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_DELETE_PART, { partId: 99999 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/no salvage part found/i);
  });
});

// ---------------------------------------------------------------------------
// INVENTORY_GET_PART_BY_ID
// ---------------------------------------------------------------------------

describe('INVENTORY_GET_PART_BY_ID handler', () => {
  test('returns the salvage part record for a known ID', () => {
    const { partId } = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, validPartData);
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_GET_PART_BY_ID, { partId });
    expect(result.success).toBe(true);
    expect(result.salvagePart).toBeDefined();
    expect(result.salvagePart.part_id).toBe(partId);
    expect(result.salvagePart.part_name).toBe(validPartData.partName);
  });

  test('returns success false when the partId does not exist', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_GET_PART_BY_ID, { partId: 99999 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/no salvage part found/i);
  });

  test('returns success false when the partId is not a positive integer', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_GET_PART_BY_ID, { partId: 0 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid part id/i);
  });
});

// ---------------------------------------------------------------------------
// INVENTORY_SEARCH_PARTS
// ---------------------------------------------------------------------------

describe('INVENTORY_SEARCH_PARTS handler', () => {
  beforeEach(() => {
    mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, {
      partName: 'Front Bumper',
      vehicleMake: 'Ford',
      vehicleModel: 'Mustang',
      vehicleYear: 2016,
      partCondition: 'Fair',
      askingPriceDollars: 120.00,
    });
    mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, {
      partName: 'Rear Spoiler',
      vehicleMake: 'Chevrolet',
      vehicleModel: 'Camaro',
      vehicleYear: 2019,
      partCondition: 'Excellent',
      askingPriceDollars: 200.00,
    });
    mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, {
      partName: 'Engine Block',
      vehicleMake: 'Ford',
      vehicleModel: 'F-150',
      vehicleYear: 2014,
      partCondition: 'Poor',
      askingPriceDollars: 500.00,
    });
  });

  test('returns all available parts when the search keyword is empty', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_SEARCH_PARTS, { searchKeyword: '' });
    expect(result.success).toBe(true);
    expect(result.salvagePartList.length).toBe(3);
  });

  test('filters parts whose part_name matches the keyword', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_SEARCH_PARTS, { searchKeyword: 'Bumper' });
    expect(result.success).toBe(true);
    expect(result.salvagePartList.length).toBe(1);
    expect(result.salvagePartList[0].part_name).toBe('Front Bumper');
  });

  test('filters parts by vehicle_make', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_SEARCH_PARTS, { searchKeyword: 'Ford' });
    expect(result.success).toBe(true);
    expect(result.salvagePartList.length).toBe(2);
  });

  test('excludes sold parts by default', () => {
    // Soft-delete one Ford part
    const allFordParts = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_SEARCH_PARTS, { searchKeyword: 'Ford' });
    const firstPartId = allFordParts.salvagePartList[0].part_id;
    mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_DELETE_PART, { partId: firstPartId });

    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_SEARCH_PARTS, { searchKeyword: 'Ford' });
    expect(result.salvagePartList.length).toBe(1);
  });

  test('includes sold parts when includeAlreadySoldParts is true', () => {
    const allFordParts = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_SEARCH_PARTS, { searchKeyword: 'Ford' });
    const firstPartId = allFordParts.salvagePartList[0].part_id;
    mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_DELETE_PART, { partId: firstPartId });

    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_SEARCH_PARTS, {
      searchKeyword: 'Ford',
      includeAlreadySoldParts: true,
    });
    expect(result.salvagePartList.length).toBe(2);
  });

  test('returns an empty list when no parts match the keyword', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_SEARCH_PARTS, { searchKeyword: 'Lamborghini' });
    expect(result.success).toBe(true);
    expect(result.salvagePartList.length).toBe(0);
  });
});
