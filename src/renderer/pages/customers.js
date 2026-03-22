/**
 * customers.js
 *
 * Renderer-side logic for the Customers page.
 */

'use strict';

const customerListContainer = document.getElementById('customer-list-container');
const addCustomerButton = document.getElementById('add-customer-button');

/**
 * Renders the full list of customer records as an HTML table.
 *
 * @param {Array<Object>} customerList - Customer records from the main process.
 */
function renderCustomerList(customerList) {
  if (customerList.length === 0) {
    customerListContainer.innerHTML =
      '<p class="empty-state-message">No customers on record yet.</p>';
    return;
  }

  const customerTableRows = customerList
    .map(
      (customerRecord) => `
      <tr data-customer-id="${customerRecord.customer_id}">
        <td>${customerRecord.customer_last_name}, ${customerRecord.customer_first_name}</td>
        <td>${customerRecord.customer_phone_number || '—'}</td>
        <td>${customerRecord.customer_email_address || '—'}</td>
      </tr>
    `
    )
    .join('');

  customerListContainer.innerHTML = `
    <table class="data-table" aria-label="Customer list">
      <thead>
        <tr>
          <th>Name</th>
          <th>Phone</th>
          <th>Email</th>
        </tr>
      </thead>
      <tbody>${customerTableRows}</tbody>
    </table>
  `;
}

/**
 * Fetches and renders all customer records from the main process.
 */
async function loadAndRenderAllCustomers() {
  customerListContainer.innerHTML = '<p class="loading-message">Loading customers…</p>';

  const result = await window.api.getAllCustomers();

  if (!result.success) {
    customerListContainer.innerHTML = `<p class="error-message">Error: ${result.errorMessage}</p>`;
    return;
  }

  renderCustomerList(result.customerList);
}

/**
 * Handles the New Customer button click.
 * (Full form implementation is a future enhancement.)
 */
function onAddCustomerButtonClick() {
  alert('The New Customer form will open here in a future update.');
}

addCustomerButton.addEventListener('click', onAddCustomerButtonClick);

// Load customers when this script initialises.
loadAndRenderAllCustomers();
