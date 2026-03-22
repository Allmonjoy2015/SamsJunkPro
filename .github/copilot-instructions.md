# Copilot Instructions for SamsJunkPro

## Project Overview

SamsJunkPro is a scrapyard / salvage-yard management desktop application built with **Electron** and **Node.js**. It helps operators manage salvage-part inventory, customer records, and sale transactions, with reporting features (PDF/CSV export). Data is persisted locally in a SQLite database using **better-sqlite3**.

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop runtime | Electron ^28 |
| UI | HTML / CSS / Vanilla JavaScript |
| Backend (main process) | Node.js + Electron IPC |
| Database | SQLite via better-sqlite3 ^12 |
| Build / packaging | electron-builder ^24 |
| Tests | Jest ^29 |

There is no TypeScript and no frontend framework (React, Vue, etc.) in use. Keep new contributions in plain ES6+ JavaScript unless explicitly asked to introduce a new tool.

## Repository Layout

```
SamsJunkPro/
├── src/
│   ├── main/
│   │   ├── main.js                  # Electron main-process entry point
│   │   ├── database.js              # SQLite connection & schema migration
│   │   └── ipc-handlers/
│   │       ├── inventory-handlers.js
│   │       ├── customer-handlers.js
│   │       └── sales-handlers.js
│   ├── renderer/                    # HTML / CSS / JS for the UI (in progress)
│   └── shared/
│       ├── constants.js             # IPC channel names, defaults, enums
│       └── validation.js           # Shared input-validation helpers
└── tests/
    └── validation.test.js           # Jest unit tests
```

## Build & Run Commands

```bash
npm install          # Install dependencies
npm start            # Launch the Electron app in development mode
npm test             # Run Jest tests (pattern: tests/**/*.test.js)
npm run build        # Package the app with electron-builder (output: dist/)
```

No separate lint script exists yet; follow the coding conventions below manually.

## Coding Conventions

### Naming

- **Constants:** `SCREAMING_SNAKE_CASE` (e.g., `MAX_SEARCH_RESULTS`, `DEFAULT_TAX_RATE_DECIMAL`)
- **Variables:** descriptive, domain-specific camelCase (e.g., `availableSalvagePartList`, `saleCreatedDate`)
  - Booleans: `is*` / `has*` / `can*` prefix (e.g., `isPartMarkedAsSold`)
  - Dates: `*Date` / `*Timestamp` suffix
  - Counts / quantities: `*Count` / `*Quantity` suffix
  - Loop indices: contextual name (e.g., `customerIndex`, not just `i`)
- **Functions:** verb + noun (e.g., `processSaleTransaction`, `getSalvagePartById`, `isPartAvailableForSale`)
  - Event handlers: `on<Action>` (e.g., `onAddPartButtonClick`)
  - Error handlers: `handle<Error>` (e.g., `handleDuplicatePartNumberError`)
- **IPC channels:** `domain:action` format — must be defined in `src/shared/constants.js` under `IPC_CHANNELS` before registering a handler
- **Files:** `kebab-case.js` for source and test files; `PascalCase.jsx` if React components are ever added

### Code Style

- Use `async`/`await` for asynchronous operations; avoid raw `.then()` chains
- Use prepared statements (better-sqlite3) for all database queries — never interpolate user input into SQL strings
- Use atomic transactions (`db.transaction(fn)()`) for operations that touch multiple tables
- Use soft deletes where record history matters (e.g., `is_sold` flag on salvage parts)

### Response / Return Values

- **IPC handler responses:** always return `{ success: boolean, data?: any, errorMessage?: string }`
- **Validation helpers:** always return `{ isValid: boolean, errorMessage: string | null }`

### Documentation

- Add JSDoc comments to all exported functions and constants
- Document `@param` types (e.g., `@param {import('better-sqlite3').Database} db`)
- Add inline comments for any non-obvious logic

## Database

- SQLite database is stored at `app.getPath('userData')/samsjunkpro.db`
- WAL mode is enabled for concurrent access
- Schema is applied via `openDatabase()` in `src/main/database.js` on every app launch (migrations are idempotent `CREATE TABLE IF NOT EXISTS`)
- **Never alter the schema without reviewing existing handlers** — column renames and type changes require updates to all prepared statements that reference those columns
- Four tables: `salvage_parts`, `customers`, `sale_transactions`, `sale_line_items`
- Prices are stored as integers (cents); convert to/from dollars in handler logic

## IPC Architecture

- All channel names are defined in `src/shared/constants.js` (`IPC_CHANNELS`)
- Handlers are registered in `src/main/main.js` by calling `register*IpcHandlers(db)` at startup
- Each handler must validate its input with helpers from `src/shared/validation.js` before touching the database
- The renderer communicates only through the preload bridge — `nodeIntegration` is `false` and `contextIsolation` is `true`

## Testing

- Test files live in `tests/` and follow the pattern `<module>.test.js`
- Jest environment is `node`
- Use descriptive test names written as plain sentences (e.g., `"returns isValid true for a complete and correct salvage part"`)
- Define reusable fixture objects at the top of each test file (e.g., `validSalvagePartData`)
- Unit-test all validation helpers; integration-test IPC handlers using an in-memory SQLite database

## Sensitive Areas & Constraints

- Do not commit `.db`, `.db-shm`, or `.db-wal` files (covered by `.gitignore`)
- Do not expose Node.js APIs or `ipcRenderer` directly to renderer code — use the preload script
- Do not add new npm dependencies without checking they are compatible with Electron's Node version
- The `dist/` and `out/` directories are build artifacts — do not commit them
