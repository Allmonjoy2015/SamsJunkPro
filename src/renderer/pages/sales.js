/**
 * sales.js
 *
 * Renderer-side logic for the Sales page.
 */

'use strict';

const saleFormContainer = document.getElementById('sale-form-container');

/**
 * Renders a placeholder message for the sales page.
 * Full cart and checkout functionality is a future enhancement.
 */
function renderSalesPagePlaceholder() {
  saleFormContainer.innerHTML = `
    <p class="empty-state-message">
      Select parts from the Inventory tab and click "Add to Sale" to begin a transaction.
    </p>
  `;
}

renderSalesPagePlaceholder();
