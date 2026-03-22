/**
 * sales-handlers.test.js
 *
 * Integration tests for the sale transaction IPC handlers.
 * Each test uses a fresh in-memory SQLite database so tests are fully isolated.
 *
 * Run with: npm test
 */

'use strict';

const Database = require('better-sqlite3');
const { registerSalesIpcHandlers } = require('../src/main/ipc-handlers/sales-handlers');
const { registerInventoryIpcHandlers } = require('../src/main/ipc-handlers/inventory-handlers');
const { registerCustomerIpcHandlers } = require('../src/main/ipc-handlers/customer-handlers');
const { IPC_CHANNELS, SALE_STATUS } = require('../src/shared/constants');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates an in-memory SQLite database with the full SamsJunkPro schema.
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
 * Registers all handler modules with a mock ipcMain and returns the handler map.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @returns {Object.<string, Function>}
 */
function buildAllHandlerMap(databaseConnection) {
  const handlerMap = {};
  const mockIpcMain = { handle: (channel, fn) => { handlerMap[channel] = fn; } };
  registerInventoryIpcHandlers(mockIpcMain, databaseConnection);
  registerCustomerIpcHandlers(mockIpcMain, databaseConnection);
  registerSalesIpcHandlers(mockIpcMain, databaseConnection);
  return handlerMap;
}

/** Reusable mock renderer event (unused by all sales handlers). */
const mockRendererEvent = {};

// ---------------------------------------------------------------------------
// Shared setup: insert parts and a customer used across multiple test suites
// ---------------------------------------------------------------------------

/**
 * Inserts two salvage parts into the database and returns their IDs.
 *
 * @param {Object.<string, Function>} handlers
 * @returns {{ firstPartId: number, secondPartId: number }}
 */
function seedSalvageParts(handlers) {
  const firstPartResult = handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, {
    partName: 'Left Headlight Assembly',
    vehicleMake: 'Nissan',
    vehicleModel: 'Altima',
    vehicleYear: 2017,
    partCondition: 'Good',
    askingPriceDollars: 80.00,
  });

  const secondPartResult = handlers[IPC_CHANNELS.INVENTORY_ADD_PART](mockRendererEvent, {
    partName: 'Right Headlight Assembly',
    vehicleMake: 'Nissan',
    vehicleModel: 'Altima',
    vehicleYear: 2017,
    partCondition: 'Fair',
    askingPriceDollars: 65.00,
  });

  return { firstPartId: firstPartResult.partId, secondPartId: secondPartResult.partId };
}

// ---------------------------------------------------------------------------
// handleCompleteSaleTransaction
// ---------------------------------------------------------------------------

describe('handleCompleteSaleTransaction', () => {
  let testDatabase;
  let handlers;
  let firstPartId;
  let secondPartId;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildAllHandlerMap(testDatabase);
    ({ firstPartId, secondPartId } = seedSalvageParts(handlers));
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success with a new saleId when given valid sale data', () => {
    const salePayload = {
      saleLineItemList: [
        { salvagePartId: firstPartId, quantitySold: 1, agreedUnitPriceDollars: 80.00 },
      ],
    };
    const result = handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, salePayload);

    expect(result.success).toBe(true);
    expect(typeof result.saleId).toBe('number');
    expect(result.saleId).toBeGreaterThan(0);
  });

  test('creates a sale transaction record with completed status', () => {
    const salePayload = {
      saleLineItemList: [
        { salvagePartId: firstPartId, quantitySold: 1, agreedUnitPriceDollars: 80.00 },
      ],
    };
    const { saleId } = handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, salePayload);
    const savedSale = testDatabase
      .prepare('SELECT sale_status, customer_id FROM sale_transactions WHERE sale_id = ?')
      .get(saleId);

    expect(savedSale.sale_status).toBe(SALE_STATUS.COMPLETED);
    expect(savedSale.customer_id).toBeNull();
  });

  test('associates the sale with a customer when a customerId is provided', () => {
    const addCustomerResult = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, {
      customerFirstName: 'Charlie',
      customerLastName: 'Brown',
    });
    const salePayload = {
      customerId: addCustomerResult.customerId,
      saleLineItemList: [
        { salvagePartId: firstPartId, quantitySold: 1, agreedUnitPriceDollars: 80.00 },
      ],
    };
    const { saleId } = handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, salePayload);
    const savedSale = testDatabase
      .prepare('SELECT customer_id FROM sale_transactions WHERE sale_id = ?')
      .get(saleId);

    expect(savedSale.customer_id).toBe(addCustomerResult.customerId);
  });

  test('marks each sold part as is_sold = 1 in the salvage_parts table', () => {
    const salePayload = {
      saleLineItemList: [
        { salvagePartId: firstPartId, quantitySold: 1, agreedUnitPriceDollars: 80.00 },
        { salvagePartId: secondPartId, quantitySold: 1, agreedUnitPriceDollars: 65.00 },
      ],
    };
    handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, salePayload);

    const firstPart = testDatabase
      .prepare('SELECT is_sold FROM salvage_parts WHERE part_id = ?')
      .get(firstPartId);
    const secondPart = testDatabase
      .prepare('SELECT is_sold FROM salvage_parts WHERE part_id = ?')
      .get(secondPartId);

    expect(firstPart.is_sold).toBe(1);
    expect(secondPart.is_sold).toBe(1);
  });

  test('stores the agreed price in cents converted from the dollar amount', () => {
    const salePayload = {
      saleLineItemList: [
        { salvagePartId: firstPartId, quantitySold: 1, agreedUnitPriceDollars: 79.99 },
      ],
    };
    const { saleId } = handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, salePayload);
    const lineItem = testDatabase
      .prepare('SELECT agreed_unit_price_cents FROM sale_line_items WHERE sale_id = ?')
      .get(saleId);

    expect(lineItem.agreed_unit_price_cents).toBe(7999);
  });

  test('creates one line item per entry in the saleLineItemList', () => {
    const salePayload = {
      saleLineItemList: [
        { salvagePartId: firstPartId, quantitySold: 1, agreedUnitPriceDollars: 80.00 },
        { salvagePartId: secondPartId, quantitySold: 1, agreedUnitPriceDollars: 65.00 },
      ],
    };
    const { saleId } = handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, salePayload);
    const lineItemCount = testDatabase
      .prepare('SELECT COUNT(*) AS lineItemCount FROM sale_line_items WHERE sale_id = ?')
      .get(saleId);

    expect(lineItemCount.lineItemCount).toBe(2);
  });

  test('returns success false when saleLineItemList is empty', () => {
    const result = handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, { saleLineItemList: [] });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/at least one/i);
  });

  test('returns success false when a line item has a zero quantity', () => {
    const salePayload = {
      saleLineItemList: [
        { salvagePartId: firstPartId, quantitySold: 0, agreedUnitPriceDollars: 80.00 },
      ],
    };
    const result = handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, salePayload);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/quantity/i);
  });
});

// ---------------------------------------------------------------------------
// handleGetSaleReceipt
// ---------------------------------------------------------------------------

describe('handleGetSaleReceipt', () => {
  let testDatabase;
  let handlers;
  let completedSaleId;
  let firstPartId;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildAllHandlerMap(testDatabase);
    ({ firstPartId } = seedSalvageParts(handlers));

    const saleResult = handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, {
      saleLineItemList: [
        { salvagePartId: firstPartId, quantitySold: 1, agreedUnitPriceDollars: 80.00 },
      ],
    });
    completedSaleId = saleResult.saleId;
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success with a saleReceipt object for an existing saleId', () => {
    const result = handlers[IPC_CHANNELS.SALES_GET_RECEIPT](mockRendererEvent, { saleId: completedSaleId });

    expect(result.success).toBe(true);
    expect(result.saleReceipt).toBeDefined();
    expect(result.saleReceipt.sale_id).toBe(completedSaleId);
  });

  test('includes sale line items in the receipt', () => {
    const result = handlers[IPC_CHANNELS.SALES_GET_RECEIPT](mockRendererEvent, { saleId: completedSaleId });

    expect(result.saleReceipt.saleLineItemList).toHaveLength(1);
    expect(result.saleReceipt.saleLineItemList[0].part_name).toBe('Left Headlight Assembly');
  });

  test('includes customer information when the sale is linked to a customer', () => {
    const addCustomerResult = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, {
      customerFirstName: 'Dana',
      customerLastName: 'Miller',
    });
    const { secondPartId } = seedSalvageParts(handlers);
    const linkedSaleResult = handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, {
      customerId: addCustomerResult.customerId,
      saleLineItemList: [
        { salvagePartId: secondPartId, quantitySold: 1, agreedUnitPriceDollars: 65.00 },
      ],
    });

    const result = handlers[IPC_CHANNELS.SALES_GET_RECEIPT](
      mockRendererEvent,
      { saleId: linkedSaleResult.saleId }
    );

    expect(result.saleReceipt.customer_first_name).toBe('Dana');
    expect(result.saleReceipt.customer_last_name).toBe('Miller');
  });

  test('returns success false when no sale exists with the given saleId', () => {
    const result = handlers[IPC_CHANNELS.SALES_GET_RECEIPT](mockRendererEvent, { saleId: 99999 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/99999/);
  });

  test('returns success false when saleId is zero or negative', () => {
    const result = handlers[IPC_CHANNELS.SALES_GET_RECEIPT](mockRendererEvent, { saleId: 0 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid sale id/i);
  });
});

// ---------------------------------------------------------------------------
// handleGetSalesSummary
// ---------------------------------------------------------------------------

describe('handleGetSalesSummary', () => {
  let testDatabase;
  let handlers;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildAllHandlerMap(testDatabase);

    const { firstPartId, secondPartId } = seedSalvageParts(handlers);

    handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, {
      saleLineItemList: [
        { salvagePartId: firstPartId, quantitySold: 1, agreedUnitPriceDollars: 80.00 },
      ],
    });
    handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, {
      saleLineItemList: [
        { salvagePartId: secondPartId, quantitySold: 1, agreedUnitPriceDollars: 65.00 },
      ],
    });
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success with a salesSummary for a broad date range covering all sales', () => {
    const result = handlers[IPC_CHANNELS.SALES_GET_SUMMARY](mockRendererEvent, {
      summaryStartDate: '2000-01-01',
      summaryEndDate: '2099-12-31',
    });

    expect(result.success).toBe(true);
    expect(result.salesSummary).toBeDefined();
    expect(result.salesSummary.totalSaleCount).toBe(2);
    expect(result.salesSummary.totalRevenueCents).toBe(14500);
  });

  test('returns a totalSaleCount of zero for a date range with no sales', () => {
    const result = handlers[IPC_CHANNELS.SALES_GET_SUMMARY](mockRendererEvent, {
      summaryStartDate: '1990-01-01',
      summaryEndDate: '1990-12-31',
    });

    expect(result.success).toBe(true);
    expect(result.salesSummary.totalSaleCount).toBe(0);
  });

  test('returns success false when summaryStartDate is missing', () => {
    const result = handlers[IPC_CHANNELS.SALES_GET_SUMMARY](mockRendererEvent, {
      summaryEndDate: '2099-12-31',
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/summaryStartDate/i);
  });

  test('returns success false when summaryEndDate is missing', () => {
    const result = handlers[IPC_CHANNELS.SALES_GET_SUMMARY](mockRendererEvent, {
      summaryStartDate: '2000-01-01',
    });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/summaryEndDate/i);
  });
});

// ---------------------------------------------------------------------------
// handleVoidSaleTransaction
// ---------------------------------------------------------------------------

describe('handleVoidSaleTransaction', () => {
  let testDatabase;
  let handlers;
  let completedSaleId;
  let firstPartId;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildAllHandlerMap(testDatabase);
    ({ firstPartId } = seedSalvageParts(handlers));

    const saleResult = handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, {
      saleLineItemList: [
        { salvagePartId: firstPartId, quantitySold: 1, agreedUnitPriceDollars: 80.00 },
      ],
    });
    completedSaleId = saleResult.saleId;
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success when voiding a completed sale transaction', () => {
    const result = handlers[IPC_CHANNELS.SALES_VOID_SALE](mockRendererEvent, { saleId: completedSaleId });

    expect(result.success).toBe(true);
  });

  test('updates the sale status to voided in the database', () => {
    handlers[IPC_CHANNELS.SALES_VOID_SALE](mockRendererEvent, { saleId: completedSaleId });

    const saleRecord = testDatabase
      .prepare('SELECT sale_status FROM sale_transactions WHERE sale_id = ?')
      .get(completedSaleId);

    expect(saleRecord.sale_status).toBe(SALE_STATUS.VOIDED);
  });

  test('restores the sold parts to available (is_sold = 0) after voiding', () => {
    handlers[IPC_CHANNELS.SALES_VOID_SALE](mockRendererEvent, { saleId: completedSaleId });

    const partRecord = testDatabase
      .prepare('SELECT is_sold FROM salvage_parts WHERE part_id = ?')
      .get(firstPartId);

    expect(partRecord.is_sold).toBe(0);
  });

  test('returns success false when trying to void a sale that is already voided', () => {
    handlers[IPC_CHANNELS.SALES_VOID_SALE](mockRendererEvent, { saleId: completedSaleId });
    const secondVoidResult = handlers[IPC_CHANNELS.SALES_VOID_SALE](
      mockRendererEvent,
      { saleId: completedSaleId }
    );

    expect(secondVoidResult.success).toBe(false);
    expect(secondVoidResult.errorMessage).toMatch(/not found or is not in 'completed' status/i);
  });

  test('returns success false when no sale exists with the given saleId', () => {
    const result = handlers[IPC_CHANNELS.SALES_VOID_SALE](mockRendererEvent, { saleId: 99999 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/99999/);
  });

  test('returns success false when saleId is zero or negative', () => {
    const result = handlers[IPC_CHANNELS.SALES_VOID_SALE](mockRendererEvent, { saleId: -1 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid sale id/i);
  });
});
