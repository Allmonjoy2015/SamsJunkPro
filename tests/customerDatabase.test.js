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
