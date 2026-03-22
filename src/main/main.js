/**
 * main.js
 *
 * Electron main process entry point for SamsJunkPro.
 *
 * Responsibilities:
 *  - Creates and manages the BrowserWindow.
 *  - Opens the SQLite database connection.
 *  - Registers all IPC handlers before the renderer loads.
 */

'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

const { openDatabase } = require('./database');
const { registerInventoryIpcHandlers } = require('./ipc-handlers/inventory-handlers');
const { registerCustomerIpcHandlers } = require('./ipc-handlers/customer-handlers');
const { registerSalesIpcHandlers } = require('./ipc-handlers/sales-handlers');
const { registerComplianceIpcHandlers } = require('./ipc-handlers/compliance-handlers');

/** @type {BrowserWindow | null} Reference to the main application window. */
let mainApplicationWindow = null;

/** @type {import('better-sqlite3').Database | null} Shared SQLite database connection. */
let databaseConnection = null;

/**
 * Creates the main BrowserWindow and loads the application's index page.
 */
function createMainApplicationWindow() {
  mainApplicationWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Sam's Junk Pro",
    webPreferences: {
      // Use a dedicated preload script to expose only the required IPC methods
      // to the renderer — never enable nodeIntegration in the renderer.
      preload: path.join(__dirname, '..', 'renderer', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainApplicationWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainApplicationWindow.on('closed', () => {
    mainApplicationWindow = null;
  });
}

// ---------------------------------------------------------------------------
// App lifecycle events
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  databaseConnection = openDatabase();

  registerInventoryIpcHandlers(ipcMain, databaseConnection);
  registerCustomerIpcHandlers(ipcMain, databaseConnection);
  registerSalesIpcHandlers(ipcMain, databaseConnection);
  registerComplianceIpcHandlers(ipcMain, databaseConnection);

  createMainApplicationWindow();

  // On macOS, re-create the window when the dock icon is clicked and no windows are open.
  app.on('activate', () => {
    if (mainApplicationWindow === null) {
      createMainApplicationWindow();
    }
  });
});

// Quit the application when all windows are closed (except on macOS).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Close the database connection cleanly before the app exits.
app.on('before-quit', () => {
  if (databaseConnection) {
    databaseConnection.close();
    databaseConnection = null;
  }
});
