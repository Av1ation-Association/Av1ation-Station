/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    type BrowserWindow,
    type IpcMainInvokeEvent,
    ipcRenderer,
} from 'electron';
import { registerSDK as registerConfigurationsSDK } from './Configuration/sdk.js';
import { registerSDK as registerProjectsSDK } from './Projects/sdk.js';

export type AppCommand = 'restart';

// Thanks, georg - https://stackoverflow.com/questions/58764853/typescript-remove-first-argument-from-a-function
export type OmitFirstArg<F> = F extends (omitted: any, ...args: infer P) => infer R ? (...args: P) => R : never;

export type APIFunction<SDKFunction> = SDKFunction extends (_event: infer _E extends IpcMainInvokeEvent, ...params: infer Parameters) => infer SDKFunctionReturn ? (...params: Parameters) => Promise<SDKFunctionReturn> : never;

export type ClientSDK = {
    [key: string]: (event: IpcMainInvokeEvent, ...params: any) => any;
};

export type ClientAPI<SDK extends ClientSDK> = {
    [key in keyof SDK]: APIFunction<SDK[key]>;
};

export function generateClientAPI<SDK extends ClientSDK>(clientSDK: SDK): ClientAPI<SDK> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return Object.entries(clientSDK).reduce((acc, [key, value]) => {
        return {
            ...acc,
            [key]: (...args: Parameters<OmitFirstArg<typeof value>>) => {
                return ipcRenderer.invoke(key, ...args) as
                    Promise<ReturnType<typeof value>>;
            },
        };
    }, {} as ClientAPI<typeof clientSDK>);
}

export function registerAllSDKs(browserWindow: BrowserWindow, appCommand: (command: AppCommand) => void) {
    // TODO: Ensure all apis are imported without key conflicts

    // const API = (() => {
    //     const allApis: IpcAPI = {} satisfies IpcAPI;
    //     const ApisSuccessfullyMerged = importedApis
    //         .every((api) => {
    //             Object.keys(api).forEach((key) => {
    //                 if (!allApis[key]) {
    //                     allApis[key] = api[key];
    //                     return true;
    //                 } else {
    //                     throw new Error('Duplicate api: ' + key);
    //                 }
    //             });
    //         });
    //     return allApis;
    // })();
    return {
        ...registerConfigurationsSDK(browserWindow, appCommand),
        ...registerProjectsSDK(browserWindow),
    };
}

// export { clientAPI as configurationsAPI } from './configurations';