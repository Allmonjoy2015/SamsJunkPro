'use strict';

/**
 * customerDatabase.test.js
 *
 * Unit tests for the SamsJunkPro customer database module.
 * Uses an in-memory SQLite database so tests are fast and self-contained.
 */

const {
  openDatabase,
  addCustomer,
  getAllCustomers,
  getCustomerById,
  searchCustomers,
  updateCustomer,
  deleteCustomer,
  addInventoryItem,
  getAllInventory,
  updateInventoryItem,
  deleteInventoryItem,
  addTransaction,
  getAllTransactions,
  getTransactionsByCustomer,
  getDashboardStats,
  addInventory,
  getInventory,
  addSale,
  getSales,
  getComplianceReport,
  cleanupOldRecords,
  addComplianceLog,
  getComplianceLogs,
  getSetting,
  setSetting,
  getAllSettings,
} = require('../src/database/customerDatabase');

// Use an in-memory database for tests
let db;

beforeEach(() => {
  db = openDatabase(':memory:');
});

afterEach(() => {
  db.close();
});

// ── Customers ──────────────────────────────────────────────────────────────────

describe('Customer CRUD', () => {
  test('addCustomer inserts a record and returns a positive id', () => {
    const result = addCustomer(db, {
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '555-1234',
      email: 'jane@example.com',
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.changes).toBe(1);
  });

  test('getAllCustomers returns all inserted customers', () => {
    addCustomer(db, { first_name: 'Alice', last_name: 'Smith' });
    addCustomer(db, { first_name: 'Bob', last_name: 'Jones' });
    const customers = getAllCustomers(db);
    expect(customers).toHaveLength(2);
  });

  test('getAllCustomers returns records ordered by last name then first name', () => {
    addCustomer(db, { first_name: 'Zoe', last_name: 'Zebra' });
    addCustomer(db, { first_name: 'Amy', last_name: 'Adams' });
    addCustomer(db, { first_name: 'Bob', last_name: 'Adams' });
    const customers = getAllCustomers(db);
    expect(customers[0].first_name).toBe('Amy');
    expect(customers[1].first_name).toBe('Bob');
    expect(customers[2].last_name).toBe('Zebra');
  });

  test('getCustomerById returns the correct customer', () => {
    const { id } = addCustomer(db, { first_name: 'Tom', last_name: 'Hill', phone: '999' });
    const customer = getCustomerById(db, id);
    expect(customer).not.toBeUndefined();
    expect(customer.first_name).toBe('Tom');
    expect(customer.phone).toBe('999');
  });

  test('getCustomerById returns undefined for a non-existent id', () => {
    const customer = getCustomerById(db, 9999);
    expect(customer).toBeUndefined();
  });

  test('searchCustomers finds matches by first name', () => {
    addCustomer(db, { first_name: 'Alice', last_name: 'Wonder' });
    addCustomer(db, { first_name: 'Bob', last_name: 'Builder' });
    const results = searchCustomers(db, 'alice');
    expect(results).toHaveLength(1);
    expect(results[0].first_name).toBe('Alice');
  });

  test('searchCustomers finds matches by phone', () => {
    addCustomer(db, { first_name: 'Sam', last_name: 'Test', phone: '800-555-0100' });
    addCustomer(db, { first_name: 'Other', last_name: 'Person', phone: '123-456-7890' });
    const results = searchCustomers(db, '800-555');
    expect(results).toHaveLength(1);
    expect(results[0].first_name).toBe('Sam');
  });

  test('searchCustomers returns empty array when no matches found', () => {
    addCustomer(db, { first_name: 'Alice', last_name: 'Wonder' });
    const results = searchCustomers(db, 'zzznomatch');
    expect(results).toHaveLength(0);
  });

  test('updateCustomer modifies an existing customer', () => {
    const { id } = addCustomer(db, { first_name: 'Old', last_name: 'Name' });
    const result = updateCustomer(db, id, { first_name: 'New', last_name: 'Name' });
    expect(result.changes).toBe(1);
    const updated = getCustomerById(db, id);
    expect(updated.first_name).toBe('New');
  });

  test('updateCustomer returns 0 changes for a non-existent id', () => {
    const result = updateCustomer(db, 9999, { first_name: 'Ghost' });
    expect(result.changes).toBe(0);
  });

  test('deleteCustomer removes the customer and returns changes = 1', () => {
    const { id } = addCustomer(db, { first_name: 'ToDelete', last_name: 'Me' });
    const result = deleteCustomer(db, id);
    expect(result.changes).toBe(1);
    expect(getCustomerById(db, id)).toBeUndefined();
  });

  test('deleteCustomer returns 0 changes for a non-existent id', () => {
    const result = deleteCustomer(db, 9999);
    expect(result.changes).toBe(0);
  });
});

// ── Inventory ──────────────────────────────────────────────────────────────────

describe('Inventory CRUD', () => {
  test('addInventoryItem inserts a record', () => {
    const result = addInventoryItem(db, {
      material: 'Copper',
      weight_lbs: 150,
      price_per_lb: 3.5,
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.changes).toBe(1);
  });

  test('getAllInventory returns all items ordered by material', () => {
    addInventoryItem(db, { material: 'Steel', weight_lbs: 100, price_per_lb: 0.5 });
    addInventoryItem(db, { material: 'Aluminum', weight_lbs: 50, price_per_lb: 1.2 });
    const items = getAllInventory(db);
    expect(items).toHaveLength(2);
    expect(items[0].material).toBe('Aluminum');
    expect(items[1].material).toBe('Steel');
  });

  test('updateInventoryItem modifies an existing item', () => {
    const { id } = addInventoryItem(db, {
      material: 'Lead',
      weight_lbs: 200,
      price_per_lb: 0.8,
    });
    updateInventoryItem(db, id, { weight_lbs: 250 });
    const items = getAllInventory(db);
    const updated = items.find((i) => i.id === id);
    expect(updated.weight_lbs).toBe(250);
  });

  test('deleteInventoryItem removes the item', () => {
    const { id } = addInventoryItem(db, {
      material: 'Brass',
      weight_lbs: 75,
      price_per_lb: 2.0,
    });
    const result = deleteInventoryItem(db, id);
    expect(result.changes).toBe(1);
    const items = getAllInventory(db);
    expect(items.find((i) => i.id === id)).toBeUndefined();
  });
});

// ── Transactions ───────────────────────────────────────────────────────────────

describe('Transaction operations', () => {
  test('addTransaction inserts a record and returns a positive id', () => {
    const result = addTransaction(db, {
      type: 'buy',
      material: 'Copper wire',
      weight_lbs: 10,
      price_per_lb: 3.5,
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.changes).toBe(1);
  });

  test('getAllTransactions returns all transactions', () => {
    addTransaction(db, { type: 'buy', material: 'Steel', weight_lbs: 100, price_per_lb: 0.5 });
    addTransaction(db, { type: 'sell', material: 'Copper', weight_lbs: 50, price_per_lb: 3.0 });
    const txs = getAllTransactions(db);
    expect(txs).toHaveLength(2);
    const materials = txs.map((tx) => tx.material);
    expect(materials).toContain('Steel');
    expect(materials).toContain('Copper');
  });

  test('addTransaction links to a customer and getAllTransactions includes customer_name', () => {
    const { id: customerId } = addCustomer(db, {
      first_name: 'Sam',
      last_name: 'Scrap',
    });
    addTransaction(db, {
      customer_id: customerId,
      type: 'buy',
      material: 'Iron',
      weight_lbs: 200,
      price_per_lb: 0.3,
    });
    const txs = getAllTransactions(db);
    expect(txs[0].customer_name).toBe('Sam Scrap');
  });

  test('getTransactionsByCustomer returns only that customer\'s transactions', () => {
    const { id: c1 } = addCustomer(db, { first_name: 'A', last_name: 'One' });
    const { id: c2 } = addCustomer(db, { first_name: 'B', last_name: 'Two' });
    addTransaction(db, { customer_id: c1, type: 'buy', material: 'Tin', weight_lbs: 10, price_per_lb: 1 });
    addTransaction(db, { customer_id: c1, type: 'sell', material: 'Lead', weight_lbs: 5, price_per_lb: 1 });
    addTransaction(db, { customer_id: c2, type: 'buy', material: 'Zinc', weight_lbs: 20, price_per_lb: 2 });
    const results = getTransactionsByCustomer(db, c1);
    expect(results).toHaveLength(2);
    results.forEach((tx) => expect(tx.customer_id).toBe(c1));
  });
});

// ── Dashboard statistics ───────────────────────────────────────────────────────

describe('getDashboardStats', () => {
  test('returns zeroes on an empty database', () => {
    const stats = getDashboardStats(db);
    expect(stats.totalCustomers).toBe(0);
    expect(stats.totalInventoryItems).toBe(0);
    expect(stats.totalTransactions).toBe(0);
    expect(stats.totalRevenue).toBe(0);
  });

  test('correctly counts customers, inventory, and transactions', () => {
    addCustomer(db, { first_name: 'A', last_name: 'B' });
    addCustomer(db, { first_name: 'C', last_name: 'D' });
    addInventoryItem(db, { material: 'Steel', weight_lbs: 100, price_per_lb: 0.5 });
    addTransaction(db, { type: 'buy', material: 'Copper', weight_lbs: 10, price_per_lb: 3 });
    addTransaction(db, { type: 'sell', material: 'Steel', weight_lbs: 50, price_per_lb: 1 });

    const stats = getDashboardStats(db);
    expect(stats.totalCustomers).toBe(2);
    expect(stats.totalInventoryItems).toBe(1);
    expect(stats.totalTransactions).toBe(2);
    // Revenue only counts 'sell' transactions: 50 * 1 = 50
    expect(stats.totalRevenue).toBe(50);
  });

  test('revenue calculation only includes sell transactions', () => {
    addTransaction(db, { type: 'buy', material: 'Lead', weight_lbs: 100, price_per_lb: 2 });
    addTransaction(db, { type: 'sell', material: 'Copper', weight_lbs: 20, price_per_lb: 4 });
    addTransaction(db, { type: 'sell', material: 'Aluminum', weight_lbs: 10, price_per_lb: 1 });

    const stats = getDashboardStats(db);
    // Revenue = (20 * 4) + (10 * 1) = 80 + 10 = 90
    expect(stats.totalRevenue).toBe(90);
  });
});

// ── Inventory (supplier purchase records) ─────────────────────────────────────

describe('Inventory (supplier purchase records)', () => {
  test('addInventory inserts a record and returns a positive id', () => {
    const result = addInventory(db, {
      item_type: 'Metal',
      description: 'Copper pipes',
      weight: 50.5,
      unit_price: 1.25,
      total_value: 63.125,
      supplier_name: 'ABC Metals',
      supplier_phone: '555-9000',
      purchase_date: '2024-06-15',
      ticket_number: 'TKT-001',
      material_type: 'Copper',
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.changes).toBe(1);
  });

  test('getInventory returns all records ordered by purchase date descending', () => {
    addInventory(db, { item_type: 'Metal', purchase_date: '2024-01-01', ticket_number: 'A1' });
    addInventory(db, { item_type: 'Plastic', purchase_date: '2024-06-01', ticket_number: 'A2' });
    const items = getInventory(db);
    expect(items).toHaveLength(2);
    expect(items[0].purchase_date).toBe('2024-06-01');
    expect(items[1].purchase_date).toBe('2024-01-01');
  });

  test('addInventory stores all supplier fields correctly', () => {
    addInventory(db, {
      item_type: 'Electronics',
      supplier_name: 'Joe Supplier',
      supplier_address: '123 Main St',
      supplier_phone: '555-1111',
      material_type: 'Copper',
      photo_path: '/photos/item1.jpg',
      ticket_number: 'TKT-100',
    });
    const items = getInventory(db);
    expect(items[0].supplier_name).toBe('Joe Supplier');
    expect(items[0].supplier_address).toBe('123 Main St');
    expect(items[0].photo_path).toBe('/photos/item1.jpg');
  });

  test('ticket_number must be unique across inventory records', () => {
    addInventory(db, { item_type: 'Metal', ticket_number: 'DUPE-001' });
    expect(() =>
      addInventory(db, { item_type: 'Plastic', ticket_number: 'DUPE-001' })
    ).toThrow();
  });

  test('addInventory accepts null optional fields', () => {
    const result = addInventory(db, { item_type: 'Misc' });
    expect(result.id).toBeGreaterThan(0);
    const items = getInventory(db);
    expect(items[0].ticket_number).toBeNull();
    expect(items[0].supplier_name).toBeNull();
  });
});

// ── Sales ─────────────────────────────────────────────────────────────────────

describe('Sales', () => {
  test('addSale inserts a record and returns a positive id', () => {
    const result = addSale(db, {
      customer_name: 'John Smith',
      customer_phone: '555-2000',
      sale_date: '2024-07-01',
      total_weight: 30.0,
      total_amount: 75.0,
      payment_method: 'cash',
      ticket_number: 'SALE-001',
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.changes).toBe(1);
  });

  test('getSales returns all records with item_description joined from inventory', () => {
    const { id: invId } = addInventory(db, {
      item_type: 'Metal',
      description: 'Old radiator',
      ticket_number: 'INV-X1',
    });
    addSale(db, {
      inventory_id: invId,
      customer_name: 'Alice',
      sale_date: '2024-08-01',
      ticket_number: 'SALE-X1',
    });
    const sales = getSales(db);
    expect(sales).toHaveLength(1);
    expect(sales[0].item_description).toBe('Old radiator');
    expect(sales[0].customer_name).toBe('Alice');
  });

  test('getSales returns records ordered by sale date descending', () => {
    addSale(db, { customer_name: 'Alpha', sale_date: '2024-01-01', ticket_number: 'S1' });
    addSale(db, { customer_name: 'Beta', sale_date: '2024-12-01', ticket_number: 'S2' });
    const sales = getSales(db);
    expect(sales[0].customer_name).toBe('Beta');
    expect(sales[1].customer_name).toBe('Alpha');
  });

  test('addSale stores customer identification and vehicle fields', () => {
    addSale(db, {
      customer_name: 'Bob Jones',
      customer_id_type: 'Driver License',
      customer_id_number: 'DL-12345',
      vehicle_info: '2010 Ford F-150',
      license_plate: 'ABC-1234',
      sale_date: '2024-09-15',
      ticket_number: 'SALE-V1',
    });
    const sales = getSales(db);
    expect(sales[0].customer_id_type).toBe('Driver License');
    expect(sales[0].vehicle_info).toBe('2010 Ford F-150');
    expect(sales[0].license_plate).toBe('ABC-1234');
  });

  test('ticket_number must be unique across sales records', () => {
    addSale(db, { customer_name: 'X', ticket_number: 'DUP-S' });
    expect(() =>
      addSale(db, { customer_name: 'Y', ticket_number: 'DUP-S' })
    ).toThrow();
  });
});

// ── getComplianceReport ───────────────────────────────────────────────────────

describe('getComplianceReport', () => {
  test('returns zeroes when no sales exist in the date range', () => {
    const report = getComplianceReport(db, '2024-01-01', '2024-12-31');
    expect(report.total_transactions).toBe(0);
    expect(report.total_sales).toBe(0);
    expect(report.total_weight).toBe(0);
    expect(report.unique_customers).toBe(0);
  });

  test('aggregates sales totals within the date range', () => {
    addSale(db, {
      customer_name: 'Alice',
      sale_date: '2024-03-01',
      total_weight: 20,
      total_amount: 50,
      ticket_number: 'CR-1',
    });
    addSale(db, {
      customer_name: 'Bob',
      sale_date: '2024-06-15',
      total_weight: 30,
      total_amount: 80,
      ticket_number: 'CR-2',
    });
    const report = getComplianceReport(db, '2024-01-01', '2024-12-31');
    expect(report.total_transactions).toBe(2);
    expect(report.total_sales).toBe(130);
    expect(report.total_weight).toBe(50);
    expect(report.unique_customers).toBe(2);
  });

  test('excludes sales outside the date range', () => {
    addSale(db, { customer_name: 'Alice', sale_date: '2023-12-31', total_amount: 999, ticket_number: 'OUT-1' });
    addSale(db, { customer_name: 'Bob', sale_date: '2024-06-01', total_amount: 50, ticket_number: 'IN-1' });
    const report = getComplianceReport(db, '2024-01-01', '2024-12-31');
    expect(report.total_transactions).toBe(1);
    expect(report.total_sales).toBe(50);
  });

  test('counts same customer name as one unique customer', () => {
    addSale(db, { customer_name: 'Sam', sale_date: '2024-01-10', ticket_number: 'UC-1' });
    addSale(db, { customer_name: 'Sam', sale_date: '2024-02-10', ticket_number: 'UC-2' });
    const report = getComplianceReport(db, '2024-01-01', '2024-12-31');
    expect(report.unique_customers).toBe(1);
  });
});

// ── cleanupOldRecords ─────────────────────────────────────────────────────────

describe('cleanupOldRecords', () => {
  test('deletes sales and inventory records older than three years', () => {
    addSale(db, { customer_name: 'Old', sale_date: '2000-01-01', ticket_number: 'OLD-S' });
    addInventory(db, { item_type: 'Metal', purchase_date: '2000-01-01', ticket_number: 'OLD-I' });
    addSale(db, { customer_name: 'Recent', sale_date: '2099-01-01', ticket_number: 'NEW-S' });

    const result = cleanupOldRecords(db);
    expect(result.salesDeleted).toBe(1);
    expect(result.inventoryDeleted).toBe(1);
    const sales = getSales(db);
    expect(sales).toHaveLength(1);
    expect(sales[0].customer_name).toBe('Recent');
  });

  test('returns zero deletions when no old records exist', () => {
    addSale(db, { customer_name: 'New', sale_date: '2099-06-01', ticket_number: 'N-1' });
    const result = cleanupOldRecords(db);
    expect(result.salesDeleted).toBe(0);
    expect(result.inventoryDeleted).toBe(0);
  });
});

// ── Compliance logs ───────────────────────────────────────────────────────────

describe('Compliance logs', () => {
  test('addComplianceLog inserts a record and returns a positive id', () => {
    const result = addComplianceLog(db, {
      log_type: 'theft',
      description: 'Suspected stolen catalytic converter',
      date: '2024-05-20',
      reported_to: 'Police Dept',
    });
    expect(result.id).toBeGreaterThan(0);
    expect(result.changes).toBe(1);
  });

  test('getComplianceLogs returns all entries ordered by date descending', () => {
    addComplianceLog(db, { log_type: 'info', date: '2024-01-01' });
    addComplianceLog(db, { log_type: 'alert', date: '2024-09-01' });
    const logs = getComplianceLogs(db);
    expect(logs).toHaveLength(2);
    expect(logs[0].date).toBe('2024-09-01');
    expect(logs[1].date).toBe('2024-01-01');
  });

  test('addComplianceLog stores all fields correctly', () => {
    addComplianceLog(db, {
      log_type: 'suspicious',
      description: 'Customer refused to show ID',
      date: '2024-03-10',
      reported_to: 'Local Sheriff',
    });
    const logs = getComplianceLogs(db);
    expect(logs[0].log_type).toBe('suspicious');
    expect(logs[0].reported_to).toBe('Local Sheriff');
  });

  test('addComplianceLog accepts null optional fields', () => {
    const result = addComplianceLog(db, {});
    expect(result.id).toBeGreaterThan(0);
    const logs = getComplianceLogs(db);
    expect(logs[0].log_type).toBeNull();
  });
});

// ── Settings ──────────────────────────────────────────────────────────────────

describe('Settings', () => {
  test('default settings are populated on database open', () => {
    const name = getSetting(db, 'business_name');
    expect(name).toBe('Your Scrapyard Name');
    const address = getSetting(db, 'business_address');
    expect(address).toBe('Your Address');
    const phone = getSetting(db, 'business_phone');
    expect(phone).toBe('Your Phone');
    const license = getSetting(db, 'business_license');
    expect(license).toBe('Your License Number');
  });

  test('setSetting updates an existing setting value', () => {
    setSetting(db, 'business_name', "Sam's Scrapyard");
    expect(getSetting(db, 'business_name')).toBe("Sam's Scrapyard");
  });

  test('setSetting inserts a new custom setting', () => {
    setSetting(db, 'tax_rate', '0.08');
    expect(getSetting(db, 'tax_rate')).toBe('0.08');
  });

  test('getSetting returns undefined for a non-existent key', () => {
    expect(getSetting(db, 'nonexistent_key')).toBeUndefined();
  });

  test('getAllSettings returns all settings as key-value pairs ordered by key', () => {
    const settings = getAllSettings(db);
    expect(settings.length).toBeGreaterThanOrEqual(4);
    const keys = settings.map((s) => s.key);
    expect(keys).toContain('business_name');
    expect(keys).toContain('business_license');
    // Verify ordering
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i] >= keys[i - 1]).toBe(true);
    }
  });
});
