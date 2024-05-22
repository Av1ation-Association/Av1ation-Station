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
    type AppCommand,
    type ClientSDK,
    // type ClientAPI,
    // OmitFirstArg,
} from '../index';
import { ConfigurationManager } from '../../data/Configuration/Configuration';
import { type Configuration } from '../../data/Configuration/Types/Configuration';


export function registerSDK(browserWindow: BrowserWindow, appCommand: (command: AppCommand) => void) {
    return {
        'get-config': (_event: IpcMainInvokeEvent) => {
            return ConfigurationManager.instance.configuration;
        },
        'set-config': (_event: IpcMainInvokeEvent, config: Configuration) => {
            ConfigurationManager.instance.configuration = config;
        },
        'save-config': (_event: IpcMainInvokeEvent) => {
            ConfigurationManager.SaveConfiguration();
        },
        'reset-config': (_event: IpcMainInvokeEvent) => {
            ConfigurationManager.ResetConfiguration();
        },
        'restart-app': (_event: IpcMainInvokeEvent) => {
            appCommand('restart');
        },
        'init-environment': (_event: IpcMainInvokeEvent) => {
            // Windows only
            if (process.platform !== 'win32') {
                return;
            }

            // Set resources if in development mode
            const resourcesPath = import.meta.env.DEV ? path.resolve(app.getAppPath(), 'buildResources', 'win') : process.resourcesPath;

            import.meta.resources = {
                PORTABLE: {
                    VAPOURSYNTH_PATH: fs.existsSync(path.resolve(resourcesPath, 'vapoursynth')) && fs.readdirSync(path.resolve(resourcesPath, 'vapoursynth')).length ? path.resolve(resourcesPath, 'vapoursynth') : undefined,
                    DGDECNV_PATH: fs.existsSync(path.resolve(resourcesPath, 'dgdecnv')) && fs.readdirSync(path.resolve(resourcesPath, 'dgdecnv')).length ? path.resolve(resourcesPath, 'dgdecnv') : undefined,
                    AV1AN_PATH: fs.existsSync(path.resolve(resourcesPath, 'av1an', 'av1an.exe')) ? path.resolve(resourcesPath, 'av1an', 'av1an.exe') : undefined,
                    FFMPEG_PATH: fs.existsSync(path.resolve(resourcesPath, 'av1an', 'ffmpeg')) && fs.readdirSync(path.resolve(resourcesPath, 'av1an', 'ffmpeg')).length ? path.resolve(resourcesPath, 'av1an', 'ffmpeg') : undefined,
                    MKVTOOLNIX_PATH: fs.existsSync(path.resolve(resourcesPath, 'av1an', 'mkvtoolnix')) && fs.readdirSync(path.resolve(resourcesPath, 'av1an', 'mkvtoolnix')).length ? path.resolve(resourcesPath, 'av1an', 'mkvtoolnix') : undefined,
                    AOM_PATH: fs.existsSync(path.resolve(resourcesPath, 'av1an', 'encoders', 'aom', 'aomenc.exe')) ? path.resolve(resourcesPath, 'av1an', 'encoders', 'aom', 'aomenc.exe') : undefined,
                    SVT_PATH: fs.existsSync(path.resolve(resourcesPath, 'av1an', 'encoders', 'svtav1', 'SvtAv1EncApp.exe')) ? path.resolve(resourcesPath, 'av1an', 'encoders', 'svtav1', 'SvtAv1EncApp.exe') : undefined,
                    RAV1E_PATH: fs.existsSync(path.resolve(resourcesPath, 'av1an', 'encoders', 'rav1e', 'rav1e.exe')) ? path.resolve(resourcesPath, 'av1an', 'encoders', 'rav1e', 'rav1e.exe') : undefined,
                    VPX_PATH: fs.existsSync(path.resolve(resourcesPath, 'av1an', 'encoders', 'vpx', 'vpxenc.exe')) ? path.resolve(resourcesPath, 'av1an', 'encoders', 'vpx', 'vpxenc.exe') : undefined,
                    x264_PATH: fs.existsSync(path.resolve(resourcesPath, 'av1an', 'encoders', 'x264', 'x264.exe')) ? path.resolve(resourcesPath, 'av1an', 'encoders', 'x264', 'x264.exe') : undefined,
                    x265_PATH: fs.existsSync(path.resolve(resourcesPath, 'av1an', 'encoders', 'x265', 'x265.exe')) ? path.resolve(resourcesPath, 'av1an', 'encoders', 'x265', 'x265.exe') : undefined,
                },
            };
        },
        'get-environment-resources': (_event: IpcMainInvokeEvent) => {
            return import.meta.resources;
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