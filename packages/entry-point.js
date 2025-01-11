import {initApp} from '@av1ation-station/main';
import {fileURLToPath} from 'node:url';

if (process.env.NODE_ENV === 'development' || process.env.PLAYWRIGHT_TEST === 'true' || !!process.env.CI) {
    function showAndExit(...args) {
        console.error(...args);
        process.exit(1);
    }

    process.on('uncaughtException', showAndExit);
    process.on('unhandledRejection', showAndExit);
}

// noinspection JSIgnoredPromiseFromCall
/**
 * We resolve '@av1ation-station/renderer' and '@av1ation-station/preload'
 * here and not in '@av1ation-station/main'
 * to observe good practices of modular design.
 * This allows fewer dependencies and better separation of concerns in '@av1ation-station/main'.
 * Thus,
 * the main module remains simplistic and efficient
 * as it receives initialization instructions rather than direct module imports.
 */
initApp(
    {
        renderer: (process.env.MODE === 'development' && !!process.env.VITE_DEV_SERVER_URL) ?
            new URL(process.env.VITE_DEV_SERVER_URL)
            : {
                path: fileURLToPath(import.meta.resolve('@av1ation-station/renderer')),
            },

        preload: {
            path: fileURLToPath(import.meta.resolve('@av1ation-station/preload/exposed.mjs')),
        },
    },
);
