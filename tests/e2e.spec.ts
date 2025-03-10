import {
    type ElectronApplication,
    type JSHandle,
} from 'playwright';
import { _electron as electron } from 'playwright';
import { test as base, expect} from '@playwright/test';
import { type BrowserWindow } from 'electron';
import { globSync } from 'glob';
import { platform } from 'node:process';

// process.env.PLAYWRIGHT_TEST = 'true';

// // Declare the types of your fixtures.
// type TestFixtures = {
//   electronApp: ElectronApplication;
//   electronVersions: NodeJS.ProcessVersions;
// };

// const test = base.extend<TestFixtures>({
//     electronApp: [async ({}, use) => {

//         /**
//      * Executable path depends on root package name!
//      */
//         let executablePattern = 'dist/*/av1ation-station{,.*}';
//         if (platform === 'darwin') {
//             executablePattern += '/Contents/*/av1ation-station';
//         }

//         const [executablePath] = globSync(executablePattern);
//         if (!executablePath) {
//             throw new Error('App Executable path not found');
//         }

//         const electronApp = await electron.launch({
//             executablePath: executablePath,
//         });

//         electronApp.on('console', (msg) => {
//             if (msg.type() === 'error') {
//                 console.error(`[electron][${msg.type()}] ${msg.text()}`);
//             }
//         });

//         await use(electronApp);

//         // This code runs after all the tests in the worker process.
//         await electronApp.close();
//     }, {scope: 'worker', auto: true} as any],

//     page: async ({electronApp}, use) => {
//         const page = await electronApp.firstWindow();
//         // capture errors
//         page.on('pageerror', (error) => {
//             console.error(error);
//         });
//         // capture console messages
//         page.on('console', (msg) => {
//             console.log(msg.text());
//         });

//         await page.waitForLoadState('load');
//         await use(page);
//     },

//     electronVersions: async ({electronApp}, use) => {
//         await use(await electronApp.evaluate(() => process.versions));
//     },
// });


// test('Main window state', async ({electronApp, page}) => {
//     const window: JSHandle<BrowserWindow> = await electronApp.browserWindow(page);
//     const windowState = await window.evaluate(
//         (mainWindow): Promise<{isVisible: boolean; isDevToolsOpened: boolean; isCrashed: boolean}> => {
//             const getState = () => ({
//                 isVisible: mainWindow.isVisible(),
//                 isDevToolsOpened: mainWindow.webContents.isDevToolsOpened(),
//                 isCrashed: mainWindow.webContents.isCrashed(),
//             });

//             return new Promise(resolve => {
//                 /**
//          * The main window is created hidden, and is shown only when it is ready.
//          * See {@link ../packages/main/src/mainWindow.ts} function
//          */
//                 if (mainWindow.isVisible()) {
//                     resolve(getState());
//                 } else {
//                     mainWindow.once('ready-to-show', () => resolve(getState()));
//                 }
//             });
//         },
//     );

//     expect(windowState.isCrashed, 'The app has crashed').toEqual(false);
//     expect(windowState.isVisible, 'The main window was not visible').toEqual(true);
//     expect(windowState.isDevToolsOpened, 'The DevTools panel was open').toEqual(false);
// });