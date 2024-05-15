import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    type BrowserWindow,
    type IpcMainInvokeEvent,
    // ipcRenderer,
    app,
    dialog,
    shell,
    clipboard,
} from 'electron';
import {
    type ClientSDK,
    // type ClientAPI,
    // OmitFirstArg,
} from '../index';
import { ConfigurationManager } from '../../data/Configuration/Configuration';
import { type Configuration } from '../../data/Configuration/Types/Configuration';


export function registerSDK(browserWindow: BrowserWindow) {
    return {
        // // TODO: Consolidate these to a global VideoSaladAPI (Prefix: `vs-${}`)
        // 'get-videos-folder': (_event: IpcMainInvokeEvent, newFileName?: string) => {
        //     try {
        //         const videosPath = app.getPath('videos');
        //         return path.resolve(videosPath, newFileName ?? '');
        //     } catch (error) {
        //         // eslint-disable-next-line no-console
        //         console.log('Failed to get videos folder');
        //     }
        // },
        // 'get-ffmpeg-path': async (_event: IpcMainInvokeEvent, type: 'ffmpeg' | 'ffprobe', existingPath?: string) => {
        //     const selectedFile = await dialog.showOpenDialog({
        //         title: `Select ${type} path`,
        //         defaultPath: existingPath,
        //         properties: ['openFile', 'dontAddToRecent'],
        //     });
        //     return selectedFile;
        // },
        'get-config': (_event: IpcMainInvokeEvent) => {
            return ConfigurationManager.instance.configuration;
        },
        'set-config': (_event: IpcMainInvokeEvent, config: Configuration) => {
            ConfigurationManager.instance.configuration = config;
        },
        'save-config': (_event: IpcMainInvokeEvent) => {
            ConfigurationManager.SaveConfiguration();
        },
        'get-environment-variable': (_event: IpcMainInvokeEvent, name: string) => {
            return process.env[name];
        },
        'get-path': (_event: IpcMainInvokeEvent, name: Parameters<typeof app.getPath>[0]) => {
            return app.getPath(name);
        },
        'resolve-path': (_event: IpcMainInvokeEvent, ...paths: string[]) => {
            return path.resolve(...paths);
        },
        'path-basename': (_event: IpcMainInvokeEvent, filePath: string, removeExtension?: boolean) => {
            return path.basename(filePath, removeExtension ? path.extname(filePath) : undefined);
        },
        'path-dirname': (_event: IpcMainInvokeEvent, filePath: string) => {
            return path.dirname(filePath);
        },
        'path-extname': (_event: IpcMainInvokeEvent, filePath: string) => {
            return path.extname(filePath);
        },
        'show-file': (_event: IpcMainInvokeEvent, filePath: string) => {
            shell.showItemInFolder(filePath);
        },
        'open-file': async (_event: IpcMainInvokeEvent, defaultPath?: string, title?: string, filters?: Electron.FileFilter[], properties?: Electron.OpenDialogOptions['properties']) => {
            const { filePaths } = await dialog.showOpenDialog(browserWindow, { title, defaultPath, ...(filters && { filters }), properties });
            return filePaths;
        },
        'save-file': async (_event: IpcMainInvokeEvent, defaultPath?: string, title?: string, filters?: Electron.FileFilter[]) => {
            const { filePath } = await dialog.showSaveDialog(browserWindow, { title, defaultPath, ...(filters && { filters }) });
            return filePath;
        },
        'move-file': async (_event: IpcMainInvokeEvent, oldPath: string, newPath: string) => {
            return fs.promises.rename(oldPath, newPath);
        },
        'get-cpu': (_event: IpcMainInvokeEvent) => {
            const cpus = os.cpus();
            return {
                cores: cpus.length,
                parallism: os.availableParallelism(),
            };
        },
        'copy-to-clipboard': (_event: IpcMainInvokeEvent, text: string) => {
            clipboard.writeText(text);
        },
    } satisfies ClientSDK;
}

// // BrowserWindow is not necessary for generating the client API
// const generatedClientAPI = generateClientAPI(registerSDK(undefined as never));

// export const clientAPI = {
//     ...generatedClientAPI,
//     // Custom Handlers
// };