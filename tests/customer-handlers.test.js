/**
 * customer-handlers.test.js
 *
 * Integration tests for customer IPC handlers.
 * Uses an in-memory better-sqlite3 database and a mock ipcMain so that
 * handlers can be exercised without a running Electron process.
 */

'use strict';

const Database = require('better-sqlite3');
const { registerCustomerIpcHandlers } = require('../src/main/ipc-handlers/customer-handlers');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal in-memory SQLite database with the customers and
 * sale_transactions tables required by the customer handlers.
 *
 * @returns {import('better-sqlite3').Database}
 */
function createInMemoryTestDatabase() {
  const testDatabase = new Database(':memory:');

  testDatabase.exec(`
    CREATE TABLE customers (
      customer_id              INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_first_name      TEXT    NOT NULL,
      customer_last_name       TEXT    NOT NULL,
      customer_phone_number    TEXT,
      customer_email_address   TEXT,
      customer_address         TEXT,
      id_type                  TEXT,
      id_number                TEXT,
      id_expiration            TEXT,
      id_issued_by             TEXT,
      company_name             TEXT,
      ein_number               TEXT,
      is_business              INTEGER NOT NULL DEFAULT 0,
      notes                    TEXT,
      date_added               TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at               TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE sale_transactions (
      sale_id          INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id      INTEGER REFERENCES customers(customer_id),
      sale_status      TEXT NOT NULL DEFAULT 'completed',
      tax_rate_decimal REAL NOT NULL DEFAULT 0.08,
      sale_date        TEXT NOT NULL DEFAULT (datetime('now')),
      notes            TEXT
    );

    CREATE TABLE salvage_parts (
      part_id            INTEGER PRIMARY KEY AUTOINCREMENT,
      part_name          TEXT NOT NULL,
      vehicle_make       TEXT NOT NULL,
      vehicle_model      TEXT NOT NULL,
      vehicle_year       INTEGER NOT NULL,
      part_number        TEXT,
      part_condition     TEXT NOT NULL,
      asking_price_cents INTEGER NOT NULL DEFAULT 0,
      is_sold            INTEGER NOT NULL DEFAULT 0,
      date_added         TEXT NOT NULL DEFAULT (datetime('now')),
      notes              TEXT
    );

    CREATE TABLE sale_line_items (
      line_item_id            INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id                 INTEGER NOT NULL REFERENCES sale_transactions(sale_id),
      part_id                 INTEGER NOT NULL REFERENCES salvage_parts(part_id),
      quantity_sold           INTEGER NOT NULL DEFAULT 1,
      agreed_unit_price_cents INTEGER NOT NULL
    );
  `);

  return testDatabase;
}

/**
 * Creates a minimal ipcMain mock that stores registered handlers in a map
 * so tests can invoke them directly.
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
// Fixtures
// ---------------------------------------------------------------------------

/** A minimal valid individual customer record reused across tests. */
const validIndividualCustomerData = {
  customerFirstName: 'Alice',
  customerLastName:  'Johnson',
  customerPhoneNumber:    '555-123-4567',
  customerEmailAddress:   'alice.johnson@example.com',
  customerAddress: '123 Main St, Springfield, IL 62701',
  idType:       'driver_license',
  idNumber:     'IL123456789',
  idExpiration: '2029-06-30',
  idIssuedBy:   'Illinois DMV',
};

/** A minimal valid business customer record reused across tests. */
const validBusinessCustomerData = {
  customerFirstName: 'Bob',
  customerLastName:  'Builder',
  isBusiness:   true,
  companyName:  "Bob's Salvage LLC",
  einNumber:    '12-3456789',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('registerCustomerIpcHandlers', () => {
  let testDatabase;
  let mockIpcMain;

  beforeEach(() => {
    testDatabase = createInMemoryTestDatabase();
    mockIpcMain  = createMockIpcMain();
    registerCustomerIpcHandlers(mockIpcMain, testDatabase);
  });

  afterEach(() => {
    testDatabase.close();
  });

  // -------------------------------------------------------------------------
  // customers:addCustomer
  // -------------------------------------------------------------------------

  test('adds an individual customer with ID-verification fields and returns a new customer ID', () => {
    const result = mockIpcMain.invoke('customers:addCustomer', validIndividualCustomerData);
    expect(result.success).toBe(true);
    expect(typeof result.customerId).toBe('number');
    expect(result.customerId).toBeGreaterThan(0);
  });

  test('adds a business customer and stores company name and EIN', () => {
    const addResult = mockIpcMain.invoke('customers:addCustomer', validBusinessCustomerData);
    expect(addResult.success).toBe(true);

    const getResult = mockIpcMain.invoke('customers:getById', { customerId: addResult.customerId });
    expect(getResult.success).toBe(true);
    expect(getResult.customerRecord.is_business).toBe(1);
    expect(getResult.customerRecord.company_name).toBe("Bob's Salvage LLC");
    expect(getResult.customerRecord.ein_number).toBe('12-3456789');
  });

  test('returns an error when required first name is missing', () => {
    const invalidCustomerData = { ...validIndividualCustomerData, customerFirstName: '' };
    const result = mockIpcMain.invoke('customers:addCustomer', invalidCustomerData);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/first name/i);
  });

  test('returns an error when ID type is not in the allowed list', () => {
    const invalidCustomerData = { ...validIndividualCustomerData, idType: 'student_id' };
    const result = mockIpcMain.invoke('customers:addCustomer', invalidCustomerData);
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/id type/i);
  });

  // -------------------------------------------------------------------------
  // customers:getAll
  // -------------------------------------------------------------------------

  test('returns all customers ordered alphabetically by last name', () => {
    mockIpcMain.invoke('customers:addCustomer', { customerFirstName: 'Charlie', customerLastName: 'Zephyr' });
    mockIpcMain.invoke('customers:addCustomer', { customerFirstName: 'Alice',   customerLastName: 'Apple' });

    const result = mockIpcMain.invoke('customers:getAll', {});
    expect(result.success).toBe(true);
    expect(result.customerList.length).toBe(2);
    expect(result.customerList[0].customer_last_name).toBe('Apple');
    expect(result.customerList[1].customer_last_name).toBe('Zephyr');
  });

  // -------------------------------------------------------------------------
  // customers:getById
  // -------------------------------------------------------------------------

  test('retrieves a customer by ID including new ID-verification columns', () => {
    const addResult = mockIpcMain.invoke('customers:addCustomer', validIndividualCustomerData);
    const getResult = mockIpcMain.invoke('customers:getById', { customerId: addResult.customerId });

    expect(getResult.success).toBe(true);
    const customerRecord = getResult.customerRecord;
    expect(customerRecord.id_type).toBe('driver_license');
    expect(customerRecord.id_number).toBe('IL123456789');
    expect(customerRecord.id_expiration).toBe('2029-06-30');
    expect(customerRecord.id_issued_by).toBe('Illinois DMV');
    expect(customerRecord.customer_address).toBe('123 Main St, Springfield, IL 62701');
  });

  test('returns an error when no customer exists for the given ID', () => {
    const result = mockIpcMain.invoke('customers:getById', { customerId: 9999 });
    expect(result.success).toBe(false);
    expect(result.errorMessage).toMatch(/9999/);
  });

  // -------------------------------------------------------------------------
  // customers:updateCustomer
  // -------------------------------------------------------------------------

  test('updates all extended fields on an existing customer record', () => {
    const addResult = mockIpcMain.invoke('customers:addCustomer', {
      customerFirstName: 'Dave',
      customerLastName: 'Doe',
    });

    const updateResult = mockIpcMain.invoke('customers:updateCustomer', {
      customerId:         addResult.customerId,
      customerFirstName:  'David',
      customerLastName:   'Doe',
      idType:             'state_id',
      idNumber:           'NY987654321',
      idExpiration:       '2031-12-31',
      idIssuedBy:         'New York DMV',
      customerAddress:    '456 Oak Ave, Albany, NY 12207',
      notes:              'Returning customer.',
    });

    expect(updateResult.success).toBe(true);

    const getResult = mockIpcMain.invoke('customers:getById', { customerId: addResult.customerId });
    const customerRecord = getResult.customerRecord;
    expect(customerRecord.customer_first_name).toBe('David');
    expect(customerRecord.id_type).toBe('state_id');
    expect(customerRecord.id_number).toBe('NY987654321');
    expect(customerRecord.notes).toBe('Returning customer.');
  });

  // -------------------------------------------------------------------------
  // customers:deleteCustomer
  // -------------------------------------------------------------------------

  test('deletes a customer with no associated sales', () => {
    const addResult = mockIpcMain.invoke('customers:addCustomer', {
      customerFirstName: 'Eve',
      customerLastName: 'Evans',
    });

    const deleteResult = mockIpcMain.invoke('customers:deleteCustomer', { customerId: addResult.customerId });
    expect(deleteResult.success).toBe(true);

    const getResult = mockIpcMain.invoke('customers:getById', { customerId: addResult.customerId });
    expect(getResult.success).toBe(false);
  });

  test('refuses to delete a customer who has sale transactions on record', () => {
    const addResult = mockIpcMain.invoke('customers:addCustomer', {
      customerFirstName: 'Frank',
      customerLastName: 'Fisher',
    });

    // Insert a sale transaction linked to this customer directly.
    testDatabase.prepare(
      `INSERT INTO sale_transactions (customer_id, sale_status, tax_rate_decimal) VALUES (?, 'completed', 0.08)`
    ).run(addResult.customerId);

    const deleteResult = mockIpcMain.invoke('customers:deleteCustomer', { customerId: addResult.customerId });
    expect(deleteResult.success).toBe(false);
    expect(deleteResult.errorMessage).toMatch(/sale transaction/i);
  });
});
