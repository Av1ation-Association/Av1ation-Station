import * as path from 'node:path';
import { contextBridge } from 'electron';

import {
    api as configurationsAPI,
} from '../../main/src/api/Configuration/client.js';
import {
    api as projectsAPI,
} from '../../main/src/api/Projects/client.js';

export const getEnvironmentVariable = (name: string) => {
    return process.env[name];
};

export const resolvePath = (...paths: string[]) => {
    return path.resolve(...paths);
};

// Note: All return values are frozen and immutable - See https://www.electronjs.org/docs/latest/api/context-bridge#parameter--error--return-type-support
// Changes made to these values on the renderer side will not be reflected on the main side
contextBridge.exposeInMainWorld('configurationsApi', configurationsAPI);
contextBridge.exposeInMainWorld('projectsApi', projectsAPI);