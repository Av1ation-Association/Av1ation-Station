import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    type AppCommand,
    registerAllSDKs,
} from './api';
import { ConfigurationManager } from './data/Configuration/Configuration';

async function createWindow(appCommand: (command: AppCommand) => void) {
    const configManager = ConfigurationManager.instance;
    const {
        size,
        // position,
        maximized,
    } = configManager.configuration.appearance;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;

    // Reduce initial window to 60% of the screen size
    const initialWidth = Math.min(width, size.width);
    const initialHeight = Math.min(height, size.height);

    // TODO: Set position of the window

    const browserWindow = new BrowserWindow({
        show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
        width: initialWidth,
        height: initialHeight,
        fullscreen: maximized,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: false, // Sandbox disabled because the demo of preload script depend on the Node.js api
            webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
            preload: join(app.getAppPath(), 'packages/preload/dist/index.mjs'),
        },
    });

    // Register SDKs with ipcMain
    Object.entries(registerAllSDKs(browserWindow, appCommand)).forEach(([eventName, handler]) => {
        ipcMain.handle(eventName, handler);
    });

    /**
   * If the 'show' property of the BrowserWindow's constructor is omitted from the initialization options,
   * it then defaults to 'true'. This can cause flickering as the window loads the html content,
   * and it also has show problematic behaviour with the closing of the window.
   * Use `show: false` and listen to the  `ready-to-show` event to show the window.
   *
   * @see https://github.com/electron/electron/issues/25012 for the afford mentioned issue.
   */
    browserWindow.on('ready-to-show', () => {
        browserWindow?.show();

        if (import.meta.env.DEV) {
            browserWindow?.webContents.openDevTools();
        }
    });

    /**
   * Load the main page of the main window.
   */
    if (import.meta.env.DEV && import.meta.env.VITE_DEV_SERVER_URL !== undefined) {
    /**
     * Load from the Vite dev server for development.
     */
        await browserWindow.loadURL(import.meta.env.VITE_DEV_SERVER_URL);
    } else {
    /**
     * Load from the local file system for production and test.
     *
     * Use BrowserWindow.loadFile() instead of BrowserWindow.loadURL() for WhatWG URL API limitations
     * when path contains special characters like `#`.
     * Let electron handle the path quirks.
     * @see https://github.com/nodejs/node/issues/12682
     * @see https://github.com/electron/electron/issues/6869
     */
        await browserWindow.loadFile(
            fileURLToPath(new URL('./../../renderer/dist/index.html', import.meta.url)),
        );
    }

    return browserWindow;
}

/**
 * Restore an existing BrowserWindow or Create a new BrowserWindow.
 */
export async function restoreOrCreateWindow(appCommand: (command: AppCommand) => void) {
    let window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());

    if (window === undefined) {
        window = await createWindow(appCommand);
    }

    if (window.isMinimized()) {
        window.restore();
    }

    window.focus();
}
