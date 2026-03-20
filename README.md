# SamsJunkPro

**SamsJunkPro** is a desktop application for managing a scrapyard / junkyard business. Built with [Electron](https://www.electronjs.org/), it provides tools for tracking inventory, managing customers, processing sales, and generating reports — all from a single offline-capable desktop window.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the App](#running-the-app)
  - [Building a Distributable](#building-a-distributable)
- [Usage](#usage)
  - [Inventory Management](#inventory-management)
  - [Customer Management](#customer-management)
  - [Sales & Transactions](#sales--transactions)
  - [Reporting](#reporting)
- [Code Conventions](#code-conventions)
  - [Descriptive Variable Names](#descriptive-variable-names)
  - [Descriptive Function Names](#descriptive-function-names)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Inventory Management** – Add, edit, search, and remove salvage parts and vehicles.
- **Customer Management** – Maintain a database of buyers and sellers with contact history.
- **Sales & Transactions** – Record part sales, generate receipts, and track revenue.
- **Reporting** – View daily, weekly, and monthly summaries of inventory and sales.
- **Offline-First** – All data stored locally; no internet connection required.
- **Cross-Platform** – Runs on Windows, macOS, and Linux via Electron.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | [Electron](https://www.electronjs.org/) |
| Front-end UI | HTML / CSS / Vanilla JS (or React, if added later) |
| Local database | [SQLite](https://www.sqlite.org/) via `better-sqlite3` |
| Build & packaging | [electron-builder](https://www.electron.build/) |
| Testing | [Jest](https://jestjs.io/) |

---

## Project Structure

```
SamsJunkPro/
├── src/
│   ├── main/                   # Electron main process
│   │   ├── main.js             # App entry point; creates BrowserWindow
│   │   ├── database.js         # SQLite connection and schema setup
│   │   └── ipc-handlers/       # IPC channel handlers (one file per domain)
│   │       ├── inventory-handlers.js
│   │       ├── customer-handlers.js
│   │       └── sales-handlers.js
│   ├── renderer/               # Electron renderer process (UI)
│   │   ├── index.html
│   │   ├── styles/
│   │   └── pages/
│   │       ├── inventory.js
│   │       ├── customers.js
│   │       └── sales.js
│   └── shared/                 # Code shared between main and renderer
│       ├── constants.js
│       └── validation.js
├── tests/                      # Jest unit and integration tests
├── assets/                     # Icons, images
├── package.json
├── electron-builder.yml
├── CONTRIBUTING.md
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- [npm](https://www.npmjs.com/) v9 or later

### Installation

```bash
# Clone the repository
git clone https://github.com/Allmonjoy2015/SamsJunkPro.git
cd SamsJunkPro

# Install dependencies
npm install
```

### Running the App

```bash
npm start
```

This launches the Electron window in development mode with DevTools enabled.

### Building a Distributable

```bash
# Build for the current platform
npm run build

# Build for a specific platform
npm run build -- --win    # Windows installer
npm run build -- --mac    # macOS .dmg
npm run build -- --linux  # Linux AppImage
```

Packaged files are placed in the `dist/` directory.

---

## Usage

### Inventory Management

1. Open the **Inventory** tab.
2. Click **Add Part** to enter a salvaged part (make, model, year, part number, condition, price).
3. Use the **Search** bar to find parts by keyword, part number, or vehicle.
4. Click a row to **Edit** or **Delete** an existing part.

### Customer Management

1. Open the **Customers** tab.
2. Click **New Customer** to add a buyer or seller with contact details.
3. View the full transaction history for any customer by clicking their name.

### Sales & Transactions

1. Open the **Sales** tab.
2. Select a customer and add parts to the cart.
3. Click **Complete Sale** to record the transaction and generate a printable receipt.

### Reporting

1. Open the **Reports** tab.
2. Choose a date range and report type (Inventory Summary, Sales Summary, or Customer Activity).
3. Click **Export** to save the report as a PDF or CSV.

---

## Code Conventions

Consistent, descriptive naming makes the codebase easier to read, review, and maintain. The guidelines below apply to all JavaScript files in this project.

### Descriptive Variable Names

Prefer names that reveal the **purpose** and **type** of the data rather than single letters or vague abbreviations.

| ❌ Avoid | ✅ Prefer | Reason |
|---|---|---|
| `d` | `saleDate` | Immediately conveys what the date represents |
| `arr` | `salvagePartList` | Describes the contents, not just the type |
| `tmp` | `temporarySaleReceipt` | Makes intent clear even out of context |
| `x`, `y` | `partQuantity`, `unitPrice` | Reveals the domain concept being stored |
| `cust` | `customerRecord` | Avoids ambiguous abbreviations |
| `i` (loop) | `partIndex` or `customerIndex` | Clarifies which collection is being iterated |
| `data` | `inventorySearchResults` | Describes what the data actually contains |
| `flag` | `isPartAvailableForSale` | Boolean names should read as yes/no questions |
| `cb` | `onSaleCompleteCallback` | Makes the callback's trigger obvious |

**Examples:**

```js
// ❌ Hard to understand at a glance
const d = new Date();
let arr = [];
function calc(x, y) { return x * y; }

// ✅ Self-documenting
const currentTransactionDate = new Date();
let salvagePartList = [];
function calculateTotalSalePrice(partQuantity, unitPrice) {
  return partQuantity * unitPrice;
}
```

### Descriptive Function Names

Function names should describe **what the function does** and, where helpful, **what it returns**.

| ❌ Avoid | ✅ Prefer | Reason |
|---|---|---|
| `process()` | `processSaleTransaction()` | Specifies what is being processed |
| `get()` | `getSalvagePartById()` | Names the resource and lookup key |
| `check()` | `isPartInStock()` | Returns a boolean — name it as a predicate |
| `update()` | `updateCustomerContactInfo()` | Identifies the exact data being updated |
| `run()` | `runMonthlyInventoryReport()` | States what will be run |
| `do()` | `archiveCompletedSaleRecords()` | Describes the action and the target |
| `handle()` | `handleDuplicatePartNumberError()` | Clarifies what kind of event is handled |
| `send()` | `sendLowStockAlertEmail()` | Specifies what is sent and to whom |

**Examples:**

```js
// ❌ Vague and hard to search for
async function get(id) { ... }
function check(part) { ... }

// ✅ Descriptive and searchable
async function getSalvagePartById(partId) { ... }
function isPartAvailableForSale(salvagePart) { ... }
```

**Additional naming rules:**

- **Event handlers** → prefix with `on` or `handle`: `onAddPartButtonClick`, `handleDatabaseConnectionError`
- **Async functions** → keep the verb, callers see `await` so no need for `async` in the name: `fetchCustomerTransactionHistory(customerId)`
- **IPC channel names** → use `domain:action` format: `'inventory:addPart'`, `'sales:completeSale'`, `'customers:getAll'`
- **Constants** → `SCREAMING_SNAKE_CASE`: `MAX_SEARCH_RESULTS`, `DEFAULT_TAX_RATE_DECIMAL`
- **Boolean variables** → prefix with `is`, `has`, or `can`: `isPartSold`, `hasCustomerAccount`, `canEditInventory`

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide on branching, commits, code style, and pull request process.

---

## License

This project is licensed under the [MIT License](LICENSE).

