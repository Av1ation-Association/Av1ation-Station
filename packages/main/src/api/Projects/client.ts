import {
    ipcRenderer,
} from 'electron';
import {
    type ClientAPI,
    type OmitFirstArg,
} from '../index.js';
import { type  registerSDK } from './sdk.js';
import { type Av1anStatus } from '../../../../shared/src/data/Types/Status.js'; 
import {
    type Project,
    type Task,
} from '../../../../shared/src/data/Projects.js';

export interface StatusChange {
    projectId: Project['id'];
    taskId: Task['id'];
    status: Av1anStatus;
}

export interface TaskLog {
    projectId: Project['id'];
    taskId: Task['id'];
    log: string;
}

const customApi = {
    'task-status': async (callback: (status: StatusChange) => void) => {
        ipcRenderer.on('task-status', (_event, status: StatusChange) => {
            callback(status);
        });
    },
    'task-log': async (callback: (log: TaskLog) => void) => {
        ipcRenderer.on('task-log', (_event, log: TaskLog) => {
            callback(log);
        });
    },
};

export const api = {
    'list-projects': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['list-projects']>>) => {
        return ipcRenderer.invoke('list-projects', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['list-projects']>>;
    },
    'create-project': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['create-project']>>) => {
        return ipcRenderer.invoke('create-project', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['create-project']>>;
    },
    'load-project': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['load-project']>>) => {
        return ipcRenderer.invoke('load-project', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['load-project']>>;
    },
    'save-project': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['save-project']>>) => {
        return ipcRenderer.invoke('save-project', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['save-project']>>;
    },
    'delete-project': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['delete-project']>>) => {
        return ipcRenderer.invoke('delete-project', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['delete-project']>>;
    },
    'delete-projects-folder': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['delete-projects-folder']>>) => {
        return ipcRenderer.invoke('delete-projects-folder', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['delete-projects-folder']>>;
    },
    'create-queue-item': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['create-queue-item']>>) => {
        return ipcRenderer.invoke('create-queue-item', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['create-queue-item']>>;
    },
    'create-task': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['create-task']>>) => {
        return ipcRenderer.invoke('create-task', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['create-task']>>;
    },
    'update-task': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['update-task']>>) => {
        return ipcRenderer.invoke('update-task', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['update-task']>>;
    },
    'start-task': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['start-task']>>) => {
        return ipcRenderer.invoke('start-task', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['start-task']>>;
    },
    'cancel-task': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['cancel-task']>>) => {
        return ipcRenderer.invoke('cancel-task', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['cancel-task']>>;
    },
    'build-task-av1an-arguments': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['build-task-av1an-arguments']>>) => {
        return ipcRenderer.invoke('build-task-av1an-arguments', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['build-task-av1an-arguments']>>;
    },
    'task-av1an-frame-count': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['task-av1an-frame-count']>>) => {
        return ipcRenderer.invoke('task-av1an-frame-count', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['task-av1an-frame-count']>>;
    },
    'task-av1an-estimated-size': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['task-av1an-estimated-size']>>) => {
        return ipcRenderer.invoke('task-av1an-estimated-size', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['task-av1an-estimated-size']>>;
    },
    'task-av1an-estimated-seconds': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['task-av1an-estimated-seconds']>>) => {
        return ipcRenderer.invoke('task-av1an-estimated-seconds', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['task-av1an-estimated-seconds']>>;
    },
    'task-delete-temporary-files': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['task-delete-temporary-files']>>) => {
        return ipcRenderer.invoke('task-delete-temporary-files', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['task-delete-temporary-files']>>;
    },
    'task-get-av1an-temporary-log-file': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['task-get-av1an-temporary-log-file']>>) => {
        return ipcRenderer.invoke('task-get-av1an-temporary-log-file', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['task-get-av1an-temporary-log-file']>>;
    },
    ...customApi,
} satisfies ClientAPI<ReturnType<typeof registerSDK>> & typeof customApi;