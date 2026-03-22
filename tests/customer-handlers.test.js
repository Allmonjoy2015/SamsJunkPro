/**
 * customer-handlers.test.js
 *
 * Integration tests for the customer management IPC handlers.
 * Each test uses a fresh in-memory SQLite database so tests are fully isolated.
 *
 * Run with: npm test
 */

'use strict';

const Database = require('better-sqlite3');
const { registerCustomerIpcHandlers } = require('../src/main/ipc-handlers/customer-handlers');
const { registerSalesIpcHandlers } = require('../src/main/ipc-handlers/sales-handlers');
const { IPC_CHANNELS } = require('../src/shared/constants');

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
 * Registers customer handlers with a mock ipcMain and returns the handler map.
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @returns {Object.<string, Function>}
 */
function buildCustomerHandlerMap(databaseConnection) {
  const handlerMap = {};
  const mockIpcMain = { handle: (channel, fn) => { handlerMap[channel] = fn; } };
  registerCustomerIpcHandlers(mockIpcMain, databaseConnection);
  return handlerMap;
}

/**
 * Registers both customer and sales handlers (needed for transaction history tests).
 *
 * @param {import('better-sqlite3').Database} databaseConnection
 * @returns {Object.<string, Function>}
 */
function buildAllHandlerMap(databaseConnection) {
  const handlerMap = {};
  const mockIpcMain = { handle: (channel, fn) => { handlerMap[channel] = fn; } };
  registerCustomerIpcHandlers(mockIpcMain, databaseConnection);
  registerSalesIpcHandlers(mockIpcMain, databaseConnection);
  return handlerMap;
}

/** Reusable mock renderer event (unused by all customer handlers). */
const mockRendererEvent = {};

/** A complete, valid customer payload reused across tests. */
const validCustomerPayload = {
  customerFirstName: 'Alice',
  customerLastName: 'Johnson',
  customerPhoneNumber: '555-234-5678',
  customerEmailAddress: 'alice.johnson@example.com',
};

// ---------------------------------------------------------------------------
// handleGetAllCustomers
// ---------------------------------------------------------------------------

describe('handleGetAllCustomers', () => {
  let testDatabase;
  let handlers;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildCustomerHandlerMap(testDatabase);
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success with an empty customerList when no customers exist', () => {
    const result = handlers[IPC_CHANNELS.CUSTOMERS_GET_ALL](mockRendererEvent);

    expect(result.success).toBe(true);
    expect(result.customerList).toEqual([]);
  });

  test('returns all customers after several have been added', () => {
    handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, validCustomerPayload);
    handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, {
      customerFirstName: 'Bob',
      customerLastName: 'Williams',
    });

    const result = handlers[IPC_CHANNELS.CUSTOMERS_GET_ALL](mockRendererEvent);

    expect(result.success).toBe(true);
    expect(result.customerList).toHaveLength(2);
  });

  test('returns customers sorted alphabetically by last name', () => {
    handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, { customerFirstName: 'Bob', customerLastName: 'Zimmerman' });
    handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, { customerFirstName: 'Alice', customerLastName: 'Anderson' });

    const result = handlers[IPC_CHANNELS.CUSTOMERS_GET_ALL](mockRendererEvent);
    const lastNames = result.customerList.map((c) => c.customer_last_name);

    expect(lastNames[0]).toBe('Anderson');
    expect(lastNames[1]).toBe('Zimmerman');
  });
});

// ---------------------------------------------------------------------------
// handleGetCustomerById
// ---------------------------------------------------------------------------

describe('handleGetCustomerById', () => {
  let testDatabase;
  let handlers;
  let existingCustomerId;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildCustomerHandlerMap(testDatabase);
    const addResult = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, validCustomerPayload);
    existingCustomerId = addResult.customerId;
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success with the customerRecord for an existing customerId', () => {
    const result = handlers[IPC_CHANNELS.CUSTOMERS_GET_BY_ID](mockRendererEvent, { customerId: existingCustomerId });

    expect(result.success).toBe(true);
    expect(result.customerRecord).toBeDefined();
    expect(result.customerRecord.customer_first_name).toBe('Alice');
    expect(result.customerRecord.customer_last_name).toBe('Johnson');
  });

  test('returns success false when no customer exists with the given customerId', () => {
    const result = handlers[IPC_CHANNELS.CUSTOMERS_GET_BY_ID](mockRendererEvent, { customerId: 99999 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/99999/);
  });

  test('returns success false when customerId is zero or negative', () => {
    const result = handlers[IPC_CHANNELS.CUSTOMERS_GET_BY_ID](mockRendererEvent, { customerId: 0 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid customer id/i);
  });
});

// ---------------------------------------------------------------------------
// handleAddCustomer
// ---------------------------------------------------------------------------

describe('handleAddCustomer', () => {
  let testDatabase;
  let handlers;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildCustomerHandlerMap(testDatabase);
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success with a new customerId when given valid customer data', () => {
    const result = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, validCustomerPayload);

    expect(result.success).toBe(true);
    expect(typeof result.customerId).toBe('number');
    expect(result.customerId).toBeGreaterThan(0);
  });

  test('persists the customer record in the database', () => {
    const addResult = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, validCustomerPayload);
    const savedCustomer = testDatabase
      .prepare('SELECT * FROM customers WHERE customer_id = ?')
      .get(addResult.customerId);

    expect(savedCustomer).not.toBeNull();
    expect(savedCustomer.customer_first_name).toBe('Alice');
    expect(savedCustomer.customer_last_name).toBe('Johnson');
  });

  test('stores email addresses in lowercase', () => {
    const payloadWithUpperCaseEmail = {
      ...validCustomerPayload,
      customerEmailAddress: 'Alice.Johnson@Example.COM',
    };
    const addResult = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, payloadWithUpperCaseEmail);
    const savedCustomer = testDatabase
      .prepare('SELECT customer_email_address FROM customers WHERE customer_id = ?')
      .get(addResult.customerId);

    expect(savedCustomer.customer_email_address).toBe('alice.johnson@example.com');
  });

  test('returns success true when optional phone and email are omitted', () => {
    const minimalCustomerPayload = { customerFirstName: 'Bob', customerLastName: 'Smith' };
    const result = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, minimalCustomerPayload);

    expect(result.success).toBe(true);
  });

  test('returns success false when first name is empty', () => {
    const payloadMissingFirstName = { ...validCustomerPayload, customerFirstName: '' };
    const result = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, payloadMissingFirstName);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/first name/i);
  });

  test('returns success false when email address format is invalid', () => {
    const payloadWithBadEmail = { ...validCustomerPayload, customerEmailAddress: 'not-valid' };
    const result = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, payloadWithBadEmail);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/email/i);
  });
});

// ---------------------------------------------------------------------------
// handleUpdateCustomerContactInfo
// ---------------------------------------------------------------------------

describe('handleUpdateCustomerContactInfo', () => {
  let testDatabase;
  let handlers;
  let existingCustomerId;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildCustomerHandlerMap(testDatabase);
    const addResult = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, validCustomerPayload);
    existingCustomerId = addResult.customerId;
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success when updating an existing customer with valid data', () => {
    const updatedPayload = {
      ...validCustomerPayload,
      customerId: existingCustomerId,
      customerPhoneNumber: '555-999-0000',
    };
    const result = handlers[IPC_CHANNELS.CUSTOMERS_UPDATE](mockRendererEvent, updatedPayload);

    expect(result.success).toBe(true);
  });

  test('reflects the updated contact info in the database after a successful update', () => {
    const updatedPayload = {
      ...validCustomerPayload,
      customerId: existingCustomerId,
      customerPhoneNumber: '555-999-0000',
      customerEmailAddress: 'alice.new@example.com',
    };
    handlers[IPC_CHANNELS.CUSTOMERS_UPDATE](mockRendererEvent, updatedPayload);

    const updatedRecord = testDatabase
      .prepare('SELECT customer_phone_number, customer_email_address FROM customers WHERE customer_id = ?')
      .get(existingCustomerId);

    expect(updatedRecord.customer_phone_number).toBe('555-999-0000');
    expect(updatedRecord.customer_email_address).toBe('alice.new@example.com');
  });

  test('returns success false when customerId does not exist in the database', () => {
    const updatedPayload = { ...validCustomerPayload, customerId: 99999 };
    const result = handlers[IPC_CHANNELS.CUSTOMERS_UPDATE](mockRendererEvent, updatedPayload);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/99999/);
  });

  test('returns success false when customerId is zero', () => {
    const updatedPayload = { ...validCustomerPayload, customerId: 0 };
    const result = handlers[IPC_CHANNELS.CUSTOMERS_UPDATE](mockRendererEvent, updatedPayload);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid customer id/i);
  });

  test('returns success false when the updated data fails validation', () => {
    const invalidUpdatedPayload = {
      ...validCustomerPayload,
      customerId: existingCustomerId,
      customerFirstName: '',
    };
    const result = handlers[IPC_CHANNELS.CUSTOMERS_UPDATE](mockRendererEvent, invalidUpdatedPayload);

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/first name/i);
  });
});

// ---------------------------------------------------------------------------
// handleDeleteCustomer
// ---------------------------------------------------------------------------

describe('handleDeleteCustomer', () => {
  let testDatabase;
  let handlers;
  let existingCustomerId;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildAllHandlerMap(testDatabase);
    const addResult = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, validCustomerPayload);
    existingCustomerId = addResult.customerId;
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success and removes the customer when they have no sale transactions', () => {
    const result = handlers[IPC_CHANNELS.CUSTOMERS_DELETE](mockRendererEvent, { customerId: existingCustomerId });

    expect(result.success).toBe(true);

    const deletedCustomer = testDatabase
      .prepare('SELECT customer_id FROM customers WHERE customer_id = ?')
      .get(existingCustomerId);
    expect(deletedCustomer).toBeUndefined();
  });

  test('returns success false when the customer has existing sale transactions', () => {
    // Add a part and record a sale for this customer so the constraint is triggered.
    testDatabase.exec(`
      INSERT INTO salvage_parts (part_name, vehicle_make, vehicle_model, vehicle_year, part_condition, asking_price_cents)
      VALUES ('Test Part', 'Ford', 'Focus', 2010, 'Fair', 2000)
    `);
    const part = testDatabase.prepare('SELECT part_id FROM salvage_parts LIMIT 1').get();
    handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, {
      customerId: existingCustomerId,
      saleLineItemList: [{ salvagePartId: part.part_id, quantitySold: 1, agreedUnitPriceDollars: 20.00 }],
    });

    const result = handlers[IPC_CHANNELS.CUSTOMERS_DELETE](mockRendererEvent, { customerId: existingCustomerId });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/sale transaction/i);
  });

  test('returns success false when no customer exists with the given customerId', () => {
    const result = handlers[IPC_CHANNELS.CUSTOMERS_DELETE](mockRendererEvent, { customerId: 99999 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/99999/);
  });

  test('returns success false when customerId is not a positive integer', () => {
    const result = handlers[IPC_CHANNELS.CUSTOMERS_DELETE](mockRendererEvent, { customerId: -1 });

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid customer id/i);
  });
});

// ---------------------------------------------------------------------------
// handleGetCustomerTransactionHistory
// ---------------------------------------------------------------------------

describe('handleGetCustomerTransactionHistory', () => {
  let testDatabase;
  let handlers;
  let existingCustomerId;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    handlers = buildAllHandlerMap(testDatabase);
    const addResult = handlers[IPC_CHANNELS.CUSTOMERS_ADD](mockRendererEvent, validCustomerPayload);
    existingCustomerId = addResult.customerId;
  });

  afterEach(() => {
    testDatabase.close();
  });

  test('returns success with an empty transactionHistoryList for a customer with no sales', () => {
    const result = handlers[IPC_CHANNELS.CUSTOMERS_GET_TRANSACTION_HISTORY](
      mockRendererEvent,
      { customerId: existingCustomerId }
    );

    expect(result.success).toBe(true);
    expect(result.transactionHistoryList).toEqual([]);
  });

  test('returns the sale transactions after a customer has made a purchase', () => {
    testDatabase.exec(`
      INSERT INTO salvage_parts (part_name, vehicle_make, vehicle_model, vehicle_year, part_condition, asking_price_cents)
      VALUES ('Test Part', 'Ford', 'Focus', 2010, 'Fair', 3000)
    `);
    const part = testDatabase.prepare('SELECT part_id FROM salvage_parts LIMIT 1').get();
    handlers[IPC_CHANNELS.SALES_COMPLETE_SALE](mockRendererEvent, {
      customerId: existingCustomerId,
      saleLineItemList: [{ salvagePartId: part.part_id, quantitySold: 1, agreedUnitPriceDollars: 30.00 }],
    });

    const result = handlers[IPC_CHANNELS.CUSTOMERS_GET_TRANSACTION_HISTORY](
      mockRendererEvent,
      { customerId: existingCustomerId }
    );

    expect(result.success).toBe(true);
    expect(result.transactionHistoryList).toHaveLength(1);
    expect(result.transactionHistoryList[0].totalRevenueCents).toBe(3000);
  });

  test('returns success false when customerId is zero or negative', () => {
    const result = handlers[IPC_CHANNELS.CUSTOMERS_GET_TRANSACTION_HISTORY](
      mockRendererEvent,
      { customerId: 0 }
    );

    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid customer id/i);
  });
});
