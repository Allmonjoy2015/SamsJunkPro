# Contributing to SamsJunkPro

Thank you for considering a contribution to SamsJunkPro! This document explains how to set up the project, follow the code conventions, and submit a pull request.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Branch Strategy](#branch-strategy)
- [Commit Messages](#commit-messages)
- [Code Style](#code-style)
  - [Descriptive Variable Names](#descriptive-variable-names)
  - [Descriptive Function Names](#descriptive-function-names)
  - [File and Module Names](#file-and-module-names)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)

---

## Getting Started

1. Fork the repository on GitHub.
2. Clone your fork locally:

   ```bash
   git clone https://github.com/<your-username>/SamsJunkPro.git
   cd SamsJunkPro
   npm install
   ```

3. Create a feature branch (see [Branch Strategy](#branch-strategy)).
4. Make your changes, write tests, and verify the build.
5. Open a pull request against `main`.

---

## Branch Strategy

| Branch prefix | Purpose | Example |
|---|---|---|
| `feature/` | New features | `feature/add-vehicle-intake-form` |
| `fix/` | Bug fixes | `fix/correct-total-price-calculation` |
| `docs/` | Documentation only | `docs/expand-readme-usage-section` |
| `refactor/` | Code cleanup without behaviour change | `refactor/rename-vague-variable-names` |
| `test/` | Adding or fixing tests | `test/add-inventory-search-unit-tests` |

---

## Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) style:

```
<type>(<scope>): <short description>

[optional body]
[optional footer]
```

Examples:

```
feat(inventory): add search filter for part condition
fix(sales): correct total price when applying bulk discount
docs(readme): add getting-started installation steps
refactor(database): rename ambiguous `d` variable to `saleDate`
test(customers): add unit tests for customer contact validation
```

---

## Code Style

### Descriptive Variable Names

Variable names must convey their **purpose** and **domain context**. Avoid single letters, abbreviations, and generic words like `data`, `temp`, `arr`, or `obj`.

#### Rules

1. **Be specific about the domain** — include the business concept in the name.
2. **Booleans** — prefix with `is`, `has`, or `can`.
3. **Dates** — suffix with `Date` or `Timestamp`.
4. **Counts / quantities** — suffix with `Count`, `Quantity`, or `Total`.
5. **Lists / arrays** — use a plural noun describing the items.
6. **Loop indices** — name the index after what is being iterated.

#### Examples

```js
// ❌ Unclear
const d = new Date();
let n = 0;
let flag = false;
const arr = db.query('SELECT * FROM parts');

// ✅ Self-documenting
const saleCreatedDate = new Date();
let totalSaleItemCount = 0;
let isPartMarkedAsSold = false;
const availableSalvagePartList = db.query('SELECT * FROM parts WHERE sold = 0');

// ❌ Vague loop variable
for (let i = 0; i < customers.length; i++) { ... }

// ✅ Meaningful index
for (let customerIndex = 0; customerIndex < customerRecordList.length; customerIndex++) { ... }
// or use for...of with a descriptive element name
for (const customerRecord of customerRecordList) { ... }
```

---

### Descriptive Function Names

Function names must describe **the action performed** and **the subject of that action**. Use a verb + noun(s) pattern.

#### Rules

1. **Use a clear verb** — `get`, `fetch`, `save`, `delete`, `calculate`, `validate`, `render`, `handle`, `send`, `archive`, `process`.
2. **Name what is acted on** — `CustomerRecord`, `SaleTransaction`, `SalvagePart`.
3. **Predicates** — functions returning a boolean should start with `is`, `has`, or `can`.
4. **Event handlers** — prefix with `on` (bound in HTML) or `handle` (called from code).
5. **IPC channels** — use `domain:action` format (e.g., `'inventory:addPart'`).

#### Examples

```js
// ❌ Vague, hard to search for, tells us nothing
function process(x) { ... }
async function get(id) { ... }
function check(p) { ... }
function run() { ... }

// ✅ Descriptive and immediately understandable
function processSaleTransaction(saleTransaction) { ... }
async function getSalvagePartById(partId) { ... }
function isPartAvailableForSale(salvagePart) { ... }
function runMonthlyInventoryReport(reportStartDate, reportEndDate) { ... }

// Event handlers
function onAddPartButtonClick(clickEvent) { ... }
function handleDuplicatePartNumberError(databaseError) { ... }

// IPC channel registration (main process)
ipcMain.handle('inventory:addPart', async (event, newPartData) => { ... });
ipcMain.handle('sales:completeSale', async (event, saleTransactionData) => { ... });
ipcMain.handle('customers:getAll', async () => { ... });
```

---

### File and Module Names

| Resource | Convention | Example |
|---|---|---|
| Source files | `kebab-case.js` | `inventory-handlers.js` |
| React components (if added) | `PascalCase.jsx` | `SaleReceiptModal.jsx` |
| Test files | `<module>.test.js` | `inventory-handlers.test.js` |
| CSS files | `kebab-case.css` | `inventory-page.css` |
| Constants file | `constants.js` | `src/shared/constants.js` |

---

## Testing

- Tests live in the `tests/` directory and mirror the `src/` structure.
- Run the full test suite with:

  ```bash
  npm test
  ```

- Every new function should have at least one unit test.
- Test function names should follow the same descriptive convention:

  ```js
  // ❌
  test('works', () => { ... });

  // ✅
  test('calculateTotalSalePrice returns correct total for quantity and unit price', () => { ... });
  ```

---

## Pull Request Process

1. Ensure `npm test` passes with no failures.
2. Make sure the Electron app starts without errors (`npm start`).
3. Fill in the pull request template completely.
4. Request a review from a maintainer.
5. Address all review comments before merging.
6. PRs are merged using **Squash and Merge** to keep the commit history clean.
