# Sam's Junk Pro

A scrapyard management desktop application built with [Electron](https://www.electronjs.org/) and [SQLite](https://www.sqlite.org/) (via [better-sqlite3](https://github.com/WiseLibs/better-sqlite3)).

---

## Features

| Module | Description |
|---|---|
| **Dashboard** | At-a-glance stats: total customers, inventory items, transactions, and sales revenue. Recent transactions listed. |
| **Customer Database** | Full CRUD for customers — add, edit, delete, and search by name, phone, or email. |
| **Scrap Inventory** | Track scrap materials by weight, price per pound, and yard location. |
| **Transactions** | Record buy and sell transactions linked to customers with automatic total calculation. |

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) v18 or later
- npm v9 or later

### Install

```bash
npm install
```

### Run the app

```bash
npm start
```

### Run tests

```bash
npm test
```

---

## Project Structure

```
SamsJunkPro/
├── main.js                          # Electron main process
├── preload.js                       # Secure context-bridge (renderer ↔ main)
├── package.json
├── src/
│   ├── database/
│   │   └── customerDatabase.js      # SQLite database layer (all CRUD operations)
│   ├── ipc/
│   │   └── handlers.js              # IPC handlers wiring renderer calls to the DB
│   └── renderer/
│       ├── index.html               # Application shell / markup
│       ├── styles.css               # Application styles
│       └── renderer.js              # Renderer-process UI logic
└── tests/
    └── customerDatabase.test.js     # Jest unit tests for the database layer
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Renderer Process (Chromium)                                    │
│  src/renderer/renderer.js  ──calls──▶  window.api (contextBridge)│
└─────────────────────────────────────────────────────────────────┘
                          │ ipcRenderer.invoke
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│  Main Process (Node.js / Electron)                              │
│  src/ipc/handlers.js  ──calls──▶  src/database/customerDatabase.js│
│                                         │                       │
│                                    better-sqlite3               │
│                                    samsjunkpro.db               │
└─────────────────────────────────────────────────────────────────┘
```

All database access is performed in the main process.  The renderer process
never has direct access to Node.js APIs or the database — communication goes
through Electron's [contextIsolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
pattern.

---

## Database Schema

### `customers`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-incremented identifier |
| `first_name` | TEXT | Required |
| `last_name` | TEXT | Required |
| `phone` | TEXT | Optional |
| `email` | TEXT | Optional |
| `address` | TEXT | Optional |
| `notes` | TEXT | Optional free-form notes |
| `created_at` | TEXT | ISO-8601 datetime (UTC) |
| `updated_at` | TEXT | ISO-8601 datetime (UTC) |

### `scrap_inventory`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-incremented identifier |
| `material` | TEXT | Material name (e.g. Copper, Steel) |
| `weight_lbs` | REAL | Weight in pounds |
| `price_per_lb` | REAL | Current price per pound |
| `location` | TEXT | Yard location (optional) |
| `notes` | TEXT | Optional notes |
| `created_at` / `updated_at` | TEXT | ISO-8601 datetimes (UTC) |

### `transactions`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-incremented identifier |
| `customer_id` | INTEGER FK | References `customers.id` (nullable) |
| `type` | TEXT | `'buy'` or `'sell'` |
| `material` | TEXT | Material traded |
| `weight_lbs` | REAL | Weight in pounds |
| `price_per_lb` | REAL | Price per pound |
| `total_amount` | REAL | Computed: `weight_lbs × price_per_lb` |
| `notes` | TEXT | Optional notes |
| `created_at` | TEXT | ISO-8601 datetime (UTC) |

---

## License

MIT
