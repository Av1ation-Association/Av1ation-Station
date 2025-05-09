import {
    ipcRenderer,
} from 'electron';
import {
    type ClientAPI,
    type OmitFirstArg,
} from '../index.js';
import { type registerSDK } from './sdk.js';

export const api = {
    'get-config': (..._args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['get-config']>>) => {
        return ipcRenderer.invoke('get-config') as
            Promise<ReturnType<ReturnType<typeof registerSDK>['get-config']>>;
    },
    'set-config': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['set-config']>>) => {
        return ipcRenderer.invoke('set-config', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['set-config']>>;
    },
    'save-config': (..._args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['save-config']>>) => {
        return ipcRenderer.invoke('save-config') as
            Promise<ReturnType<ReturnType<typeof registerSDK>['save-config']>>;
    },
    'reset-config': (..._args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['reset-config']>>) => {
        return ipcRenderer.invoke('reset-config') as
            Promise<ReturnType<ReturnType<typeof registerSDK>['reset-config']>>;
    },
    'restart-app': (..._args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['restart-app']>>) => {
        return ipcRenderer.invoke('restart-app') as
            Promise<ReturnType<ReturnType<typeof registerSDK>['restart-app']>>;
    },
    'init-environment': (..._args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['init-environment']>>) => {
        return ipcRenderer.invoke('init-environment') as
            Promise<ReturnType<ReturnType<typeof registerSDK>['init-environment']>>;
    },
    'get-environment-resources': (..._args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['get-environment-resources']>>) => {
        return ipcRenderer.invoke('get-environment-resources') as
            Promise<ReturnType<ReturnType<typeof registerSDK>['get-environment-resources']>>;
    },
    'get-environment-variable': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['get-environment-variable']>>) => {
        return ipcRenderer.invoke('get-environment-variable', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['get-environment-variable']>>;
    },
    'get-path': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['get-path']>>) => {
        return ipcRenderer.invoke('get-path', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['get-path']>>;
    },
    'resolve-path': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['resolve-path']>>) => {
        return ipcRenderer.invoke('resolve-path', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['resolve-path']>>;
    },
    'path-basename': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['path-basename']>>) => {
        return ipcRenderer.invoke('path-basename', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['path-basename']>>;
    },
    'path-dirname': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['path-dirname']>>) => {
        return ipcRenderer.invoke('path-dirname', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['path-dirname']>>;
    },
    'path-extname': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['path-extname']>>) => {
        return ipcRenderer.invoke('path-extname', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['path-extname']>>;
    },
    'show-file': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['show-file']>>) => {
        return ipcRenderer.invoke('show-file', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['show-file']>>;
    },
    'open-file': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['open-file']>>) => {
        return ipcRenderer.invoke('open-file', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['open-file']>>;
    },
    'save-file': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['save-file']>>) => {
        return ipcRenderer.invoke('save-file', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['save-file']>>;
    },
    'move-file': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['move-file']>>) => {
        return ipcRenderer.invoke('move-file', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['move-file']>>;
    },
    'get-cpu': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['get-cpu']>>) => {
        return ipcRenderer.invoke('get-cpu', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['get-cpu']>>;
    },
    'copy-to-clipboard': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['copy-to-clipboard']>>) => {
        return ipcRenderer.invoke('copy-to-clipboard', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['copy-to-clipboard']>>;
    },
    'notify': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['notify']>>) => {
        return ipcRenderer.invoke('notify', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['notify']>>;
    },
} satisfies ClientAPI<ReturnType<typeof registerSDK>>;