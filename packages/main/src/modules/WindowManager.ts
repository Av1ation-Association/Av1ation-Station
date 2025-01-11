import type { AppModule } from '../AppModule.js';
import type { ModuleContext } from '../ModuleContext.js';
import {
    app,
    BrowserWindow,
    ipcMain,
    screen,
} from 'electron';
import type { AppInitConfig } from '../AppInitConfig.js';

import {
    type AppCommand,
    registerAllSDKs,
} from '../api/index.js';
import { ConfigurationManager } from '../data/Configuration/Configuration.js';

function appCommand(command: AppCommand) {
    switch (command) {
        case 'restart':
            app.relaunch();
            app.quit();
            break;
        default:
            break;
    }
}

class WindowManager implements AppModule {
    readonly #preload: {path: string};
    readonly #renderer: {path: string} | URL;
    readonly #openDevTools;

    constructor({initConfig, openDevTools = false}: {initConfig: AppInitConfig, openDevTools?: boolean}) {
        this.#preload = initConfig.preload;
        this.#renderer = initConfig.renderer;
        this.#openDevTools = openDevTools;
    }

    async enable({app}: ModuleContext): Promise<void> {
        await app.whenReady();
        await this.restoreOrCreateWindow(true, appCommand);
        app.on('second-instance', () => this.restoreOrCreateWindow(true, appCommand));
        app.on('activate', () => this.restoreOrCreateWindow(true, appCommand));
    }

    async createWindow(appCommand: (command: AppCommand) => void): Promise<BrowserWindow> {
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
                preload: this.#preload.path,
            },
        });

        // Register SDKs with ipcMain
        Object.entries(registerAllSDKs(browserWindow, appCommand)).forEach(([eventName, handler]) => {
            ipcMain.handle(eventName, handler);
        });

        if (this.#renderer instanceof URL) {
            await browserWindow.loadURL(this.#renderer.href);
        } else {
            await browserWindow.loadFile(this.#renderer.path);
        }

        return browserWindow;
    }

    async restoreOrCreateWindow(show = false, appCommand: (command: AppCommand) => void) {
        let window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());

        if (window === undefined) {
            window = await this.createWindow(appCommand);
        }

        if (!show) {
            return window;
        }

        if (window.isMinimized()) {
            window.restore();
        }

        window?.show();

        if (this.#openDevTools) {
            window?.webContents.openDevTools();
        }

        window.focus();

        return window;
    }

}

export function createWindowManagerModule(...args: ConstructorParameters<typeof WindowManager>) {
    return new WindowManager(...args);
}
