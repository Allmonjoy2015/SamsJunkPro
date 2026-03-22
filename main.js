'use strict';

/**
 * main.js
 *
 * Electron main process entry point for SamsJunkPro.
 * Responsibilities:
 *   - Open / create the SQLite database
 *   - Register IPC handlers so the renderer can query the database
 *   - Create and manage the BrowserWindow lifecycle
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');
const { openDatabase } = require('./src/database/customerDatabase');
const { registerAllHandlers } = require('./src/ipc/handlers');

let mainWindow;

/**
 * Creates the main application window.
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "Sam's Junk Pro",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer', 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const database = openDatabase();
  registerAllHandlers(database);
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
