/**
 * inventory.js
 *
 * Renderer-side logic for the Inventory page.
 * Communicates with the main process exclusively through `window.api`
 * (exposed by preload.js via contextBridge).
 */

'use strict';

const inventorySearchInput = document.getElementById('inventory-search-input');
const inventoryResultsContainer = document.getElementById('inventory-results-container');
const addPartButton = document.getElementById('add-part-button');

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

/** Minimum characters required before triggering a live search. */
const MIN_SEARCH_KEYWORD_LENGTH = 2;

/**
 * Renders a list of salvage parts into the results container.
 *
 * @param {Array<Object>} salvagePartList - Parts returned by the main process.
 */
function renderSalvagePartList(salvagePartList) {
  if (salvagePartList.length === 0) {
    inventoryResultsContainer.innerHTML =
      '<p class="empty-state-message">No parts matched your search.</p>';
    return;
  }

  const salvagePartTableRows = salvagePartList
    .map(
      (salvagePart) => `
      <tr data-part-id="${salvagePart.part_id}">
        <td>${salvagePart.part_name}</td>
        <td>${salvagePart.vehicle_year} ${salvagePart.vehicle_make} ${salvagePart.vehicle_model}</td>
        <td>${salvagePart.part_condition}</td>
        <td>$${(salvagePart.asking_price_cents / 100).toFixed(2)}</td>
        <td>${salvagePart.is_sold ? 'Sold' : 'Available'}</td>
      </tr>
    `
    )
    .join('');

  inventoryResultsContainer.innerHTML = `
    <table class="data-table" aria-label="Salvage part search results">
      <thead>
        <tr>
          <th>Part Name</th>
          <th>Vehicle</th>
          <th>Condition</th>
          <th>Price</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>${salvagePartTableRows}</tbody>
    </table>
  `;
}

/**
 * Handles the inventory search input event by calling the main process
 * and rendering the returned salvage parts.
 */
async function onInventorySearchInputChange() {
  const searchKeyword = inventorySearchInput.value.trim();

  if (searchKeyword.length < MIN_SEARCH_KEYWORD_LENGTH) {
    inventoryResultsContainer.innerHTML =
      '<p class="empty-state-message">Enter at least 2 characters to search.</p>';
    return;
  }

  inventoryResultsContainer.innerHTML = '<p class="loading-message">Searching…</p>';

  const searchResult = await window.api.searchSalvageParts({ searchKeyword });

  if (!searchResult.success) {
    inventoryResultsContainer.innerHTML = `<p class="error-message">Error: ${searchResult.errorMessage}</p>`;
    return;
  }

  renderSalvagePartList(searchResult.salvagePartList);
}

inventorySearchInput.addEventListener('input', onInventorySearchInputChange);

// ---------------------------------------------------------------------------
// Add Part (placeholder — full form to be implemented)
// ---------------------------------------------------------------------------

/**
 * Handles the Add Part button click by prompting the user for part details.
 * (Full modal form implementation is a future enhancement.)
 */
function onAddPartButtonClick() {
  alert('The Add Part form will open here in a future update.');
}

addPartButton.addEventListener('click', onAddPartButtonClick);
