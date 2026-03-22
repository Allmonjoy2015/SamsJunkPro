/**
 * navigation.js
 *
 * Handles switching between the Inventory, Customers, and Sales page sections.
 * Tab buttons carry a `data-target-page` attribute matching the `id` of the
 * `<section>` they reveal.
 */

'use strict';

const navigationTabButtonList = document.querySelectorAll('.navigation-tab-button');
const pageSectionList = document.querySelectorAll('.page-section');

/**
 * Shows the requested page section and hides all others.
 * Updates the active state of the navigation tab buttons.
 *
 * @param {string} targetPageId - The `id` of the `<section>` to make visible.
 */
function navigateToPage(targetPageId) {
  pageSectionList.forEach((pageSection) => {
    if (pageSection.id === targetPageId) {
      pageSection.classList.remove('hidden');
    } else {
      pageSection.classList.add('hidden');
    }
  });

  navigationTabButtonList.forEach((navigationTabButton) => {
    const isActiveTab = navigationTabButton.dataset.targetPage === targetPageId;
    navigationTabButton.classList.toggle('active', isActiveTab);
    navigationTabButton.setAttribute('aria-current', isActiveTab ? 'page' : 'false');
  });
}

/**
 * Handles a click on a navigation tab button by switching to the requested page.
 *
 * @param {MouseEvent} clickEvent - The click event from the navigation button.
 */
function onNavigationTabButtonClick(clickEvent) {
  const targetPageId = clickEvent.currentTarget.dataset.targetPage;
  if (targetPageId) {
    navigateToPage(targetPageId);
  }
}

navigationTabButtonList.forEach((navigationTabButton) => {
  navigationTabButton.addEventListener('click', onNavigationTabButtonClick);
});
