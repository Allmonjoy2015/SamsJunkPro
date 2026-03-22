'use strict';

/**
 * renderer.js
 *
 * All UI logic for the SamsJunkPro renderer process.
 * Communicates with the main process exclusively via window.api (contextBridge).
 */

// ── Utilities ──────────────────────────────────────────────────────────────────

/**
 * Formats a dollar amount for display.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount || 0);
}

/**
 * Formats a SQLite datetime string for display.
 * @param {string} dateString
 * @returns {string}
 */
function formatDate(dateString) {
  if (!dateString) return '–';
  const date = new Date(dateString.replace(' ', 'T') + 'Z');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Escapes HTML to prevent XSS when inserting user data into innerHTML.
 * @param {string|number|null|undefined} value
 * @returns {string}
 */
function escapeHtml(value) {
  if (value == null) return '–';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Toast notifications ────────────────────────────────────────────────────────

const toastContainer = document.getElementById('toast-container');

/**
 * Displays a temporary toast notification.
 * @param {string}            message
 * @param {'success'|'error'} type
 */
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ── Navigation ─────────────────────────────────────────────────────────────────

const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const topbarTitle = document.getElementById('topbar-title');

/**
 * Activates the specified view and deactivates all others.
 * @param {string} viewName - matches data-view attribute and id prefix
 */
function activateView(viewName) {
  navItems.forEach((item) => {
    item.classList.toggle('active', item.dataset.view === viewName);
  });
  views.forEach((view) => {
    view.classList.toggle('active', view.id === `view-${viewName}`);
  });

  const labelMap = {
    dashboard: 'Dashboard',
    customers: 'Customers',
    inventory: 'Inventory',
    transactions: 'Transactions',
  };
  topbarTitle.textContent = labelMap[viewName] || viewName;

  if (viewName === 'dashboard') loadDashboard();
  if (viewName === 'customers') loadCustomers();
  if (viewName === 'inventory') loadInventory();
  if (viewName === 'transactions') loadTransactions();
}

navItems.forEach((item) => {
  item.addEventListener('click', () => activateView(item.dataset.view));
});

// ── Date display ───────────────────────────────────────────────────────────────

document.getElementById('topbar-date').textContent = new Date().toLocaleDateString(
  'en-US',
  { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }
);

// ── Modal helpers ──────────────────────────────────────────────────────────────

/**
 * Opens a modal by its overlay element ID.
 * @param {string} overlayId
 */
function openModal(overlayId) {
  document.getElementById(overlayId).classList.remove('hidden');
}

/**
 * Closes a modal by its overlay element ID.
 * @param {string} overlayId
 */
function closeModal(overlayId) {
  document.getElementById(overlayId).classList.add('hidden');
}

// Close buttons and overlay clicks
document.querySelectorAll('[data-close]').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ── Dashboard ──────────────────────────────────────────────────────────────────

async function loadDashboard() {
  const tbody = document.getElementById('dashboard-tx-tbody');

  try {
    const [statsRes, txRes] = await Promise.all([
      window.api.getDashboardStats(),
      window.api.getAllTransactions(),
    ]);

    if (statsRes && statsRes.success) {
      const s = statsRes.data;
      document.getElementById('stat-customers').textContent = s.totalCustomers;
      document.getElementById('stat-inventory').textContent = s.totalInventoryItems;
      document.getElementById('stat-transactions').textContent = s.totalTransactions;
      document.getElementById('stat-revenue').textContent = formatCurrency(s.totalRevenue);
    }

    if (tbody) {
      if (txRes && txRes.success && txRes.data.length > 0) {
        const recent = txRes.data.slice(0, 10);
        tbody.innerHTML = recent.map((tx) => `
          <tr>
            <td>${escapeHtml(tx.id)}</td>
            <td><span class="badge badge--${tx.type}">${tx.type}</span></td>
            <td>${escapeHtml(tx.customer_name)}</td>
            <td>${escapeHtml(tx.material)}</td>
            <td>${escapeHtml(tx.weight_lbs)}</td>
            <td>${escapeHtml(tx.price_per_lb)}</td>
            <td>${formatCurrency(tx.total_amount)}</td>
            <td>${formatDate(tx.created_at)}</td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="8">
              <div class="empty-state">
                <div class="empty-state__icon">💰</div>
                No transactions yet.
              </div>
            </td>
          </tr>`;
      }
    }
  } catch (error) {
    console.error('Failed to load dashboard data:', error);

    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <div class="empty-state__icon">⚠️</div>
              Error loading dashboard data. Please try again.
            </div>
          </td>
        </tr>`;
    }

    // Simple error notification; replace with a proper toast if available elsewhere.
    alert('An error occurred while loading the dashboard. Please try again.');
  }
}

// ── Customers ──────────────────────────────────────────────────────────────────

let editingCustomerId = null;

/**
 * Loads and renders all customers (or search results) into the customer table.
 * @param {string} [searchTerm]
 */
async function loadCustomers(searchTerm = '') {
  const res = searchTerm.trim()
    ? await window.api.searchCustomers(searchTerm.trim())
    : await window.api.getAllCustomers();

  const tbody = document.getElementById('customers-tbody');
  if (!res.success) {
    showToast('Failed to load customers: ' + res.error, 'error');
    return;
  }

  if (res.data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            <div class="empty-state__icon">👥</div>
            No customers found.
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = res.data.map((c) => `
    <tr>
      <td>${escapeHtml(c.id)}</td>
      <td>${escapeHtml(c.first_name)} ${escapeHtml(c.last_name)}</td>
      <td>${escapeHtml(c.phone)}</td>
      <td>${escapeHtml(c.email)}</td>
      <td>${escapeHtml(c.address)}</td>
      <td>${formatDate(c.created_at)}</td>
      <td>
        <button class="btn btn--ghost btn--sm" data-edit-customer="${c.id}">Edit</button>
        <button class="btn btn--danger btn--sm" data-delete-customer="${c.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  // Edit & delete button handlers
  tbody.querySelectorAll('[data-edit-customer]').forEach((btn) =>
    btn.addEventListener('click', () => openEditCustomerModal(Number(btn.dataset.editCustomer)))
  );
  tbody.querySelectorAll('[data-delete-customer]').forEach((btn) =>
    btn.addEventListener('click', () => confirmDeleteCustomer(Number(btn.dataset.deleteCustomer)))
  );
}

// Search
document.getElementById('customer-search').addEventListener('input', (e) => {
  loadCustomers(e.target.value);
});

// Add customer button
document.getElementById('btn-add-customer').addEventListener('click', () => {
  editingCustomerId = null;
  document.getElementById('customer-modal-title').textContent = 'Add Customer';
  document.getElementById('customer-form').reset();
  openModal('customer-modal-overlay');
});

/**
 * Pre-fills the customer form for editing an existing record.
 * @param {number} customerId
 */
async function openEditCustomerModal(customerId) {
  const res = await window.api.getCustomerById(customerId);
  if (!res.success || !res.data) {
    showToast('Customer not found.', 'error');
    return;
  }
  const c = res.data;
  editingCustomerId = customerId;
  document.getElementById('customer-modal-title').textContent = 'Edit Customer';
  document.getElementById('cf-first-name').value = c.first_name || '';
  document.getElementById('cf-last-name').value = c.last_name || '';
  document.getElementById('cf-phone').value = c.phone || '';
  document.getElementById('cf-email').value = c.email || '';
  document.getElementById('cf-address').value = c.address || '';
  document.getElementById('cf-notes').value = c.notes || '';
  openModal('customer-modal-overlay');
}

/**
 * Asks for confirmation and deletes a customer.
 * @param {number} customerId
 */
async function confirmDeleteCustomer(customerId) {
  // eslint-disable-next-line no-alert
  if (!window.confirm('Delete this customer? This cannot be undone.')) return;
  const res = await window.api.deleteCustomer(customerId);
  if (res.success && res.data.changes > 0) {
    showToast('Customer deleted.');
    loadCustomers();
  } else {
    showToast('Failed to delete customer.', 'error');
  }
}

// Customer form submission
document.getElementById('customer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = Object.fromEntries(new FormData(e.target));

  if (!formData.first_name.trim() || !formData.last_name.trim()) {
    showToast('First and last name are required.', 'error');
    return;
  }

  const res = editingCustomerId
    ? await window.api.updateCustomer(editingCustomerId, formData)
    : await window.api.addCustomer(formData);

  if (res.success) {
    showToast(editingCustomerId ? 'Customer updated.' : 'Customer added.');
    closeModal('customer-modal-overlay');
    loadCustomers();
  } else {
    showToast('Error: ' + res.error, 'error');
  }
});

// ── Inventory ──────────────────────────────────────────────────────────────────

let editingInventoryId = null;

async function loadInventory() {
  const res = await window.api.getAllInventory();
  const tbody = document.getElementById('inventory-tbody');

  if (!res.success) {
    showToast('Failed to load inventory: ' + res.error, 'error');
    return;
  }

  if (res.data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <div class="empty-state__icon">📦</div>
            No inventory items yet.
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = res.data.map((item) => `
    <tr>
      <td>${escapeHtml(item.id)}</td>
      <td>${escapeHtml(item.material)}</td>
      <td>${escapeHtml(item.weight_lbs)}</td>
      <td>${escapeHtml(item.price_per_lb)}</td>
      <td>${formatCurrency(item.weight_lbs * item.price_per_lb)}</td>
      <td>${escapeHtml(item.location)}</td>
      <td>${escapeHtml(item.notes)}</td>
      <td>
        <button class="btn btn--ghost btn--sm" data-edit-inventory="${item.id}">Edit</button>
        <button class="btn btn--danger btn--sm" data-delete-inventory="${item.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit-inventory]').forEach((btn) =>
    btn.addEventListener('click', () => openEditInventoryModal(Number(btn.dataset.editInventory)))
  );
  tbody.querySelectorAll('[data-delete-inventory]').forEach((btn) =>
    btn.addEventListener('click', () => confirmDeleteInventoryItem(Number(btn.dataset.deleteInventory)))
  );
}

document.getElementById('btn-add-inventory').addEventListener('click', () => {
  editingInventoryId = null;
  document.getElementById('inventory-modal-title').textContent = 'Add Inventory Item';
  document.getElementById('inventory-form').reset();
  openModal('inventory-modal-overlay');
});

async function openEditInventoryModal(itemId) {
  const res = await window.api.getAllInventory();
  if (!res.success) return;
  const item = res.data.find((i) => i.id === itemId);
  if (!item) { showToast('Item not found.', 'error'); return; }

  editingInventoryId = itemId;
  document.getElementById('inventory-modal-title').textContent = 'Edit Inventory Item';
  document.getElementById('if-material').value = item.material || '';
  document.getElementById('if-weight').value = item.weight_lbs || '';
  document.getElementById('if-price').value = item.price_per_lb || '';
  document.getElementById('if-location').value = item.location || '';
  document.getElementById('if-notes').value = item.notes || '';
  openModal('inventory-modal-overlay');
}

async function confirmDeleteInventoryItem(itemId) {
  // eslint-disable-next-line no-alert
  if (!window.confirm('Delete this inventory item? This cannot be undone.')) return;
  const res = await window.api.deleteInventoryItem(itemId);
  if (res.success && res.data.changes > 0) {
    showToast('Inventory item deleted.');
    loadInventory();
  } else {
    showToast('Failed to delete inventory item.', 'error');
  }
}

document.getElementById('inventory-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = Object.fromEntries(new FormData(e.target));

  if (!formData.material.trim()) {
    showToast('Material name is required.', 'error');
    return;
  }
  formData.weight_lbs = parseFloat(formData.weight_lbs) || 0;
  formData.price_per_lb = parseFloat(formData.price_per_lb) || 0;

  const res = editingInventoryId
    ? await window.api.updateInventoryItem(editingInventoryId, formData)
    : await window.api.addInventoryItem(formData);

  if (res.success) {
    showToast(editingInventoryId ? 'Item updated.' : 'Item added.');
    closeModal('inventory-modal-overlay');
    loadInventory();
  } else {
    showToast('Error: ' + res.error, 'error');
  }
});

// ── Transactions ───────────────────────────────────────────────────────────────

async function loadTransactions() {
  const res = await window.api.getAllTransactions();
  const tbody = document.getElementById('transactions-tbody');

  if (!res.success) {
    showToast('Failed to load transactions: ' + res.error, 'error');
    return;
  }

  if (res.data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9">
          <div class="empty-state">
            <div class="empty-state__icon">💰</div>
            No transactions yet.
          </div>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = res.data.map((tx) => `
    <tr>
      <td>${escapeHtml(tx.id)}</td>
      <td><span class="badge badge--${tx.type}">${tx.type}</span></td>
      <td>${escapeHtml(tx.customer_name)}</td>
      <td>${escapeHtml(tx.material)}</td>
      <td>${escapeHtml(tx.weight_lbs)}</td>
      <td>${escapeHtml(tx.price_per_lb)}</td>
      <td>${formatCurrency(tx.total_amount)}</td>
      <td>${escapeHtml(tx.notes)}</td>
      <td>${formatDate(tx.created_at)}</td>
    </tr>
  `).join('');
}

// New transaction button — populate customer dropdown first
document.getElementById('btn-add-transaction').addEventListener('click', async () => {
  const res = await window.api.getAllCustomers();
  const select = document.getElementById('tf-customer');
  select.innerHTML = '<option value="">— Walk-in / No customer —</option>';
  if (res.success) {
    res.data.forEach((c) => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = `${c.first_name} ${c.last_name}`;
      select.appendChild(option);
    });
  }
  document.getElementById('transaction-form').reset();
  openModal('transaction-modal-overlay');
});

document.getElementById('transaction-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = Object.fromEntries(new FormData(e.target));

  if (!formData.material.trim()) {
    showToast('Material name is required.', 'error');
    return;
  }
  formData.weight_lbs = parseFloat(formData.weight_lbs) || 0;
  formData.price_per_lb = parseFloat(formData.price_per_lb) || 0;
  if (formData.customer_id === '') formData.customer_id = null;

  const res = await window.api.addTransaction(formData);
  if (res.success) {
    showToast('Transaction recorded.');
    closeModal('transaction-modal-overlay');
    loadTransactions();
  } else {
    showToast('Error: ' + res.error, 'error');
  }
});

// ── Bootstrap ──────────────────────────────────────────────────────────────────

loadDashboard();
