/**
 * customer-handlers.test.js
 *
 * Unit tests for the IPC handlers in src/main/ipc-handlers/customer-handlers.js.
 * An in-memory SQLite database is used so that no real file I/O takes place.
 *
 * Run with: npm test
 */

'use strict';

const Database = require('better-sqlite3');
const { registerCustomerIpcHandlers } = require('../src/main/ipc-handlers/customer-handlers');
const { registerSalesIpcHandlers } = require('../src/main/ipc-handlers/sales-handlers');
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
  registerCustomerIpcHandlers(mockIpcMain, db);
  registerSalesIpcHandlers(mockIpcMain, db);
});

afterEach(() => {
  db.close();
});

// ---------------------------------------------------------------------------
// Shared valid customer data
// ---------------------------------------------------------------------------

const validCustomerData = {
  customerFirstName: 'Alice',
  customerLastName: 'Johnson',
  customerPhoneNumber: '555-234-5678',
  customerEmailAddress: 'alice.johnson@example.com',
};

// ---------------------------------------------------------------------------
// CUSTOMERS_ADD
// ---------------------------------------------------------------------------

describe('CUSTOMERS_ADD handler', () => {
  test('inserts a valid customer and returns success with a positive customerId', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, validCustomerData);
    expect(result.success).toBe(true);
    expect(typeof result.customerId).toBe('number');
    expect(result.customerId).toBeGreaterThan(0);
  });

  test('stores the email address in lowercase', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, {
      ...validCustomerData,
      customerEmailAddress: 'ALICE@EXAMPLE.COM',
    });
    const row = db.prepare('SELECT customer_email_address FROM customers WHERE customer_id = ?').get(result.customerId);
    expect(row.customer_email_address).toBe('alice@example.com');
  });

  test('stores null for phone and email when they are omitted', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, {
      customerFirstName: 'Bob',
      customerLastName: 'Williams',
    });
    const row = db.prepare('SELECT customer_phone_number, customer_email_address FROM customers WHERE customer_id = ?').get(result.customerId);
    expect(row.customer_phone_number).toBeNull();
    expect(row.customer_email_address).toBeNull();
  });

  test('returns success false when first name is empty', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, {
      ...validCustomerData,
      customerFirstName: '',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/first name/i);
  });

  test('returns success false when last name is empty', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, {
      ...validCustomerData,
      customerLastName: '',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/last name/i);
  });

  test('returns success false when phone number has fewer than 10 digits', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, {
      ...validCustomerData,
      customerPhoneNumber: '123-456',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/phone number/i);
  });

  test('returns success false when email address format is invalid', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, {
      ...validCustomerData,
      customerEmailAddress: 'not-an-email',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/email/i);
  });
});

// ---------------------------------------------------------------------------
// CUSTOMERS_GET_ALL
// ---------------------------------------------------------------------------

describe('CUSTOMERS_GET_ALL handler', () => {
  test('returns an empty customerList when no customers exist', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_GET_ALL);
    expect(result.success).toBe(true);
    expect(result.customerList).toEqual([]);
  });

  test('returns all customers sorted alphabetically by last name then first name', () => {
    mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, { customerFirstName: 'Charlie', customerLastName: 'Zebra' });
    mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, { customerFirstName: 'Anna', customerLastName: 'Apple' });
    mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, { customerFirstName: 'Brian', customerLastName: 'Apple' });

    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_GET_ALL);
    expect(result.success).toBe(true);
    expect(result.customerList.length).toBe(3);
    expect(result.customerList[0].customer_last_name).toBe('Apple');
    expect(result.customerList[0].customer_first_name).toBe('Anna');
    expect(result.customerList[1].customer_first_name).toBe('Brian');
    expect(result.customerList[2].customer_last_name).toBe('Zebra');
  });
});

// ---------------------------------------------------------------------------
// CUSTOMERS_GET_BY_ID
// ---------------------------------------------------------------------------

describe('CUSTOMERS_GET_BY_ID handler', () => {
  test('returns the customer record for a known customerId', () => {
    const { customerId } = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, validCustomerData);
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_GET_BY_ID, { customerId });
    expect(result.success).toBe(true);
    expect(result.customerRecord).toBeDefined();
    expect(result.customerRecord.customer_id).toBe(customerId);
    expect(result.customerRecord.customer_first_name).toBe('Alice');
  });

  test('returns success false when customerId does not exist', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_GET_BY_ID, { customerId: 99999 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/no customer found/i);
  });

  test('returns success false when customerId is not a positive integer', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_GET_BY_ID, { customerId: 0 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid customer id/i);
  });
});

// ---------------------------------------------------------------------------
// CUSTOMERS_UPDATE
// ---------------------------------------------------------------------------

describe('CUSTOMERS_UPDATE handler', () => {
  test('updates an existing customer and returns success', () => {
    const { customerId } = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, validCustomerData);
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_UPDATE, {
      ...validCustomerData,
      customerId,
      customerFirstName: 'Alicia',
    });
    expect(result.success).toBe(true);
  });

  test('persists the updated fields in the database', () => {
    const { customerId } = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, validCustomerData);
    mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_UPDATE, {
      ...validCustomerData,
      customerId,
      customerFirstName: 'Alicia',
      customerPhoneNumber: '800-555-0199',
    });
    const row = db.prepare('SELECT customer_first_name, customer_phone_number FROM customers WHERE customer_id = ?').get(customerId);
    expect(row.customer_first_name).toBe('Alicia');
    expect(row.customer_phone_number).toBe('800-555-0199');
  });

  test('returns success false when customerId is not a positive integer', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_UPDATE, {
      ...validCustomerData,
      customerId: 0,
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid customer id/i);
  });

  test('returns success false when customerId does not exist in the database', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_UPDATE, {
      ...validCustomerData,
      customerId: 99999,
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/no customer found/i);
  });

  test('returns success false when updated data fails validation', () => {
    const { customerId } = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, validCustomerData);
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_UPDATE, {
      ...validCustomerData,
      customerId,
      customerFirstName: '',
    });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/first name/i);
  });
});

// ---------------------------------------------------------------------------
// CUSTOMERS_DELETE
// ---------------------------------------------------------------------------

describe('CUSTOMERS_DELETE handler', () => {
  test('deletes a customer who has no sale transactions', () => {
    const { customerId } = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, validCustomerData);
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_DELETE, { customerId });
    expect(result.success).toBe(true);

    const row = db.prepare('SELECT * FROM customers WHERE customer_id = ?').get(customerId);
    expect(row).toBeUndefined();
  });

  test('returns success false when the customer has existing sale transactions', () => {
    const { customerId } = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, validCustomerData);

    // Insert a part so the sale line item can reference it
    db.prepare(`
      INSERT INTO salvage_parts (part_name, vehicle_make, vehicle_model, vehicle_year, part_condition, asking_price_cents)
      VALUES ('Test Part', 'Any', 'Model', 2000, 'Good', 1000)
    `).run();
    const partId = db.prepare('SELECT last_insert_rowid() AS id').get().id;

    mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      customerId,
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 10.00 }],
    });

    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_DELETE, { customerId });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/sale transaction/i);
  });

  test('returns success false when customerId is not a positive integer', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_DELETE, { customerId: -1 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid customer id/i);
  });

  test('returns success false when the customer does not exist', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_DELETE, { customerId: 99999 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/no customer found/i);
  });
});

// ---------------------------------------------------------------------------
// CUSTOMERS_GET_TRANSACTION_HISTORY
// ---------------------------------------------------------------------------

describe('CUSTOMERS_GET_TRANSACTION_HISTORY handler', () => {
  test('returns an empty list when the customer has no transactions', () => {
    const { customerId } = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, validCustomerData);
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_GET_TRANSACTION_HISTORY, { customerId });
    expect(result.success).toBe(true);
    expect(result.transactionHistoryList).toEqual([]);
  });

  test('returns the transaction history for a customer with purchases', () => {
    const { customerId } = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_ADD, validCustomerData);

    db.prepare(`
      INSERT INTO salvage_parts (part_name, vehicle_make, vehicle_model, vehicle_year, part_condition, asking_price_cents)
      VALUES ('Tailgate', 'Ford', 'F-150', 2015, 'Good', 15000)
    `).run();
    const partId = db.prepare('SELECT last_insert_rowid() AS id').get().id;

    mockIpcMain.invoke(IPC_CHANNELS.SALES_COMPLETE_SALE, {
      customerId,
      saleLineItemList: [{ salvagePartId: partId, quantitySold: 1, agreedUnitPriceDollars: 150.00 }],
    });

    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_GET_TRANSACTION_HISTORY, { customerId });
    expect(result.success).toBe(true);
    expect(result.transactionHistoryList.length).toBe(1);
    expect(result.transactionHistoryList[0].totalRevenueCents).toBe(15000);
  });

  test('returns success false when customerId is not a positive integer', () => {
    const result = mockIpcMain.invoke(IPC_CHANNELS.CUSTOMERS_GET_TRANSACTION_HISTORY, { customerId: 0 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/valid customer id/i);
  });
});
