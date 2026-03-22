/**
 * sales-handlers.test.js
 *
 * Unit tests for the IPC handlers in src/main/ipc-handlers/sales-handlers.js.
 * An in-memory SQLite database is used so that no real file I/O takes place.
 *
 * Run with: npm test
 */

'use strict';

const Database = require('better-sqlite3');
const { registerSalesIpcHandlers } = require('../src/main/ipc-handlers/sales-handlers');
const { registerInventoryIpcHandlers } = require('../src/main/ipc-handlers/inventory-handlers');
const { registerCustomerIpcHandlers } = require('../src/main/ipc-handlers/customer-handlers');
const { IPC_CHANNELS, SALE_STATUS, DEFAULT_TAX_RATE_DECIMAL } = require('../src/shared/constants');

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
  registerSalesIpcHandlers(mockIpcMain, db);
  registerInventoryIpcHandlers(mockIpcMain, db);
  registerCustomerIpcHandlers(mockIpcMain, db);
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Shared test data helpers
// ---------------------------------------------------------------------------

/** Inserts a salvage part and returns its assigned part_id. */
function insertTestPart(overrides = {}) {
  const result = mockIpcMain.invoke(IPC_CHANNELS.INVENTORY_ADD_PART, {
    partName: 'Test Part',
    vehicleMake: 'Honda',
    vehicleModel: 'Accord',
    vehicleYear: 2012,
    partCondition: 'Fair',
    askingPriceDollars: 30.00,
    ...overrides,
  });
  return result.partId;
}

/** Inserts a customer and returns their assigned customer_id. */
function insertTestCustomer() {
  const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, {
    customerFirstName: 'Test',
    customerLastName: 'Customer',
  });
  return result.customerId;
}

// ---------------------------------------------------------------------------
// SALES_COMPLETE_SALE
// ---------------------------------------------------------------------------

describe('SALES_COMPLETE_SALE handler', () => {
  test('records a sale and returns success with a positive saleId', () => {
    const partId = insertTestPart();
    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 30.00 }],
    });
    expect(result.success).toBe(true);
    expect(typeof result.saleId).toBe('number');
    expect(result.saleId).toBeGreaterThan(0);
  });

  test('marks the sold part as is_sold = 1 after the transaction', () => {
    const partId = insertTestPart();
    mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 30.00 }],
    });
    const row = db.prepare('SELECT is_sold FROM salvage_parts WHERE part_id = ?').get(partId);
    expect(row.is_sold).toBe(1);
  });

  test('stores the agreed unit price in cents in sale_line_items', () => {
    const partId = insertTestPart();
    const { saleId } = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 45.50 }],
    });
    const row = db.prepare('SELECT agreed_unit_price_cents FROM sale_line_items WHERE sale_id = ?').get(saleId);
    expect(row.agreed_unit_price_cents).toBe(4550);
  });

  test('associates the sale with the provided customerId', () => {
    const partId = insertTestPart();
    const customerId = insertTestCustomer();
    const { saleId } = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      customerId,
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 30.00 }],
    });
    const row = db.prepare('SELECT customer_id FROM sale_transactions WHERE sale_id = ?').get(saleId);
    expect(row.customer_id).toBe(customerId);
  });

  test('uses the default tax rate when taxRateDecimal is not provided', () => {
    const partId = insertTestPart();
    const { saleId } = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 30.00 }],
    });
    const row = db.prepare('SELECT tax_rate_decimal FROM sale_transactions WHERE sale_id = ?').get(saleId);
    expect(row.tax_rate_decimal).toBeCloseTo(DEFAULT_TAX_RATE_DECIMAL);
  });

  test('applies the custom tax rate when one is provided', () => {
    const partId = insertTestPart();
    const { saleId } = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      taxRateDecimal: 0.05,
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 30.00 }],
    });
    const row = db.prepare('SELECT tax_rate_decimal FROM sale_transactions WHERE sale_id = ?').get(saleId);
    expect(row.tax_rate_decimal).toBeCloseTo(0.05);
  });

  test('records multiple line items for a single sale', () => {
    const partId1 = insertTestPart({ partName: 'Door Panel' });
    const partId2 = insertTestPart({ partName: 'Side Mirror' });
    const { saleId } = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [
        { salvagePartId: partId1, quantitySold: 1, agreedUnitPriceDollars: 20.00 },
        { salvagePartId: partId2, quantitySold: 1, agreedUnitPriceDollars: 15.00 },
      ],
    });
    const lineItems = db.prepare('SELECT * FROM sale_line_items WHERE sale_id = ?').all(saleId);
    expect(lineItems.length).toBe(2);
  });

  test('returns success false when the line item list is empty', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [],
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/at least one/i);
  });

  test('returns success false when a line item has an invalid salvage part ID', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: -1, quantitySold: 1, agreedUnitPriceDollars: 30.00 }],
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/part id/i);
  });

  test('returns success false when quantity sold is zero', () => {
    const partId = insertTestPart();
    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 0, agreedUnitPriceDollars: 30.00 }],
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/quantity/i);
  });
});

// ---------------------------------------------------------------------------
// SALES_GET_RECEIPT
// ---------------------------------------------------------------------------

describe('SALES_GET_RECEIPT handler', () => {
  test('returns the sale receipt with header and line items for a valid saleId', () => {
    const partId = insertTestPart();
    const { saleId } = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 30.00 }],
    });

    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_GET_RECEIPT, { saleId });
    expect(result.success).toBe(true);
    expect(result.saleReceipt).toBeDefined();
    expect(result.saleReceipt.sale_id).toBe(saleId);
    expect(result.saleReceipt.saleLineItemList.length).toBe(1);
  });

  test('includes part details in each line item of the receipt', () => {
    const partId = insertTestPart({ partName: 'Windshield', vehicleMake: 'Subaru' });
    const { saleId } = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 80.00 }],
    });

    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_GET_RECEIPT, { saleId });
    const lineItem = result.saleReceipt.saleLineItemList[0];
    expect(lineItem.part_name).toBe('Windshield');
    expect(lineItem.vehicle_make).toBe('Subaru');
  });

  test('includes customer details on the receipt when a customer is linked', () => {
    const partId = insertTestPart();
    const customerId = insertTestCustomer();
    const { saleId } = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      customerId,
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 30.00 }],
    });

    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_GET_RECEIPT, { saleId });
    expect(result.saleReceipt.customer_first_name).toBe('Test');
    expect(result.saleReceipt.customer_last_name).toBe('Customer');
  });

  test('returns success false when saleId does not exist', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_GET_RECEIPT, { saleId: 99999 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/no sale transaction found/i);
  });

  test('returns success false when saleId is not a positive integer', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_GET_RECEIPT, { saleId: 0 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid sale id/i);
  });
});

// ---------------------------------------------------------------------------
// SALES_GET_SUMMARY
// ---------------------------------------------------------------------------

describe('SALES_GET_SUMMARY handler', () => {
  test('returns aggregated totals for completed sales within a date range', () => {
    const partId1 = insertTestPart({ partName: 'Hood' });
    const partId2 = insertTestPart({ partName: 'Trunk Lid' });

    mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: partId1, quantitySold: 1, agreedUnitPriceDollars: 100.00 }],
    });
    mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: partId2, quantitySold: 1, agreedUnitPriceDollars: 150.00 }],
    });

    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_GET_SUMMARY, {
      summaryStartDate: '2000-01-01',
      summaryEndDate: '2099-12-31',
    });

    expect(result.success).toBe(true);
    expect(result.salesSummary.totalSaleCount).toBe(2);
    expect(result.salesSummary.totalRevenueCents).toBe(25000);
  });

  test('returns zero totals when there are no sales in the given date range', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_GET_SUMMARY, {
      summaryStartDate: '2000-01-01',
      summaryEndDate: '2000-01-02',
    });
    expect(result.success).toBe(true);
    expect(result.salesSummary.totalSaleCount).toBe(0);
  });

  test('returns success false when summaryStartDate is missing', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_GET_SUMMARY, {
      summaryEndDate: '2099-12-31',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/summaryStartDate/i);
  });

  test('returns success false when summaryEndDate is missing', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_GET_SUMMARY, {
      summaryStartDate: '2000-01-01',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/summaryEndDate/i);
  });
});

// ---------------------------------------------------------------------------
// SALES_VOID_SALE
// ---------------------------------------------------------------------------

describe('SALES_VOID_SALE handler', () => {
  test('voids a completed sale and restores part availability', () => {
    const partId = insertTestPart();
    const { saleId } = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 30.00 }],
    });

    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_VOID_SALE, { saleId });
    expect(result.success).toBe(true);

    const saleRow = db.prepare('SELECT sale_status FROM sale_transactions WHERE sale_id = ?').get(saleId);
    expect(saleRow.sale_status).toBe(SALE_STATUS.VOIDED);

    const partRow = db.prepare('SELECT is_sold FROM salvage_parts WHERE part_id = ?').get(partId);
    expect(partRow.is_sold).toBe(0);
  });

  test('returns success false when trying to void a sale that is already voided', () => {
    const partId = insertTestPart();
    const { saleId } = mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 30.00 }],
    });

    mockIpcMain.invoke(IPC_CHANNELS.SALES_VOID_SALE, { saleId });
    const secondVoidResult = mockIpcMain.invoke(IPC_CHANNELS.SALES_VOID_SALE, { saleId });
    expect(secondVoidResult.success).toBe(false);
    expect(secondVoidResult.errorMessage).toMatch(/not found or is not in 'completed' status/i);
  });

  test('returns success false when saleId does not exist', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_VOID_SALE, { saleId: 99999 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/not found or is not in 'completed' status/i);
  });

  test('returns success false when saleId is not a positive integer', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.SALES_VOID_SALE, { saleId: 0 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid sale id/i);
  });
});
