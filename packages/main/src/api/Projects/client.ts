import {
    ipcRenderer,
} from 'electron';
import type { ClientAPI, OmitFirstArg } from '../index';
import type { registerSDK } from './sdk';
import { type Av1anStatus } from '../../utils/Av1an/Av1an';
import { type Project, type Task } from '../../data/Configuration/Projects';

export interface StatusChange {
    projectId: Project['id'];
    taskId: Task['id'];
    status: Av1anStatus;
}

const customApi = {
    'task-status': async (callback: (status: StatusChange) => void) => {
        ipcRenderer.on('task-status', (_event, status: StatusChange) => {
            callback(status);
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
    'pause-task': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['pause-task']>>) => {
        return ipcRenderer.invoke('pause-task', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['pause-task']>>;
    },
    'resume-task': (...args: Parameters<OmitFirstArg<ReturnType<typeof registerSDK>['resume-task']>>) => {
        return ipcRenderer.invoke('resume-task', ...args) as
            Promise<ReturnType<ReturnType<typeof registerSDK>['resume-task']>>;
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
    ...customApi,
} satisfies ClientAPI<ReturnType<typeof registerSDK>> & typeof customApi;