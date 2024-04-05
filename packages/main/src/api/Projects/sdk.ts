import {
    type BrowserWindow,
    type IpcMainInvokeEvent,
    // ipcRenderer,
    // app,
    // dialog,
    // shell,
} from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
    type ClientSDK,
    // type ClientAPI,
    // OmitFirstArg,
} from '../index';
import { ProjectManager, type Task } from '../../data/Configuration/Projects';
import { type Project } from '../../data/Configuration/Projects';
import { Av1an, Av1anManager } from '../../utils/Av1an/Av1an';

export function registerSDK(window: BrowserWindow) {
    return {
        'list-projects': (_event: IpcMainInvokeEvent, existingProjectPaths?: string[]) => {
            return ProjectManager.instance.listProjects(existingProjectPaths);
        },
        'create-project': (_event: IpcMainInvokeEvent, path?: string, name?: string) => {
            return ProjectManager.instance.createProject(path, name);
        },
        'load-project': (_event: IpcMainInvokeEvent, path: string) => {
            return ProjectManager.instance.loadProject(path);
        },
        'save-project': (_event: IpcMainInvokeEvent, project: Project) => {
            return ProjectManager.instance.saveProject(project);
        },
        'delete-project': (_event: IpcMainInvokeEvent, projectPath: string) => {
            return ProjectManager.instance.deleteProject(projectPath);
        },
        'create-queue-item': (_event: IpcMainInvokeEvent) => {
            return ProjectManager.instance.createTask();
        },
        'create-task': (_event: IpcMainInvokeEvent, task: Task, options: Task['item']) => {
            return Av1anManager.instance.addAv1an(task.id, task.inputFileName, task.outputFileName, options, task.statusHistory);
        },
        'update-task': (_event: IpcMainInvokeEvent, task: Task) => {
            const av1an = Av1anManager.instance.av1anMap.get(task.id);
            if (av1an) {
                av1an.input = task.item.input;
                av1an.output = task.item.output;
                av1an.options = {
                    ...av1an.options,
                    ...task.item,
                };
            }
        },
        'start-task': async (_event: IpcMainInvokeEvent, task: Task, options: Task['item']) => {
            const av1an = Av1anManager.instance.av1anMap.get(task.id) ?? Av1anManager.instance.addAv1an(task.id, options.input, options.output, options, task.statusHistory);
            
            av1an.onStatus((status) => {
                console.log('SEND STATUS:', status.state);
                window.webContents.send('task-status', {
                    projectId: task.projectId,
                    taskId: task.id,
                    status,
                });
            });

            try {
                await av1an.start();
            } catch (error) {
                console.error(error);
            }
        },
        'pause-task': async (_event: IpcMainInvokeEvent, task: Task) => {
            const av1an = Av1anManager.instance.av1anMap.get(task.id);
            if (av1an) {
                await av1an.pause();
            }
        },
        'resume-task': async (_event: IpcMainInvokeEvent, task: Task) => {
            const av1an = Av1anManager.instance.av1anMap.get(task.id);
            if (av1an) {
                await av1an.resume();
            }
        },
        'cancel-task': async (_event: IpcMainInvokeEvent, task: Task) => {
            const av1an = Av1anManager.instance.av1anMap.get(task.id);
            if (av1an) {
                await av1an.cancel();
            }
        },
        'build-task-av1an-arguments': async (_event: IpcMainInvokeEvent, options: Task['item']) => {
            return Av1an.BuildArguments(options.input, options.output, options);
        },
        'task-av1an-frame-count': async (_event: IpcMainInvokeEvent, task: Task) => {
            const av1an = Av1anManager.instance.av1anMap.get(task.id);
            if (av1an) {
                return av1an.frameCount;
            }
        },
        'task-av1an-estimated-size': async (_event: IpcMainInvokeEvent, task: Task) => {
            const av1an = Av1anManager.instance.av1anMap.get(task.id);
            if (av1an) {
                return av1an.estimatedSizeInBytes;
            }
        },
        'task-av1an-estimated-seconds': async (_event: IpcMainInvokeEvent, task: Task) => {
            const av1an = Av1anManager.instance.av1anMap.get(task.id);
            if (av1an) {
                return av1an.estimatedSecondsRemaining;
            }
        },
        'task-delete-temporary-files': async (_event: IpcMainInvokeEvent, task: Task) => {
            // Delete temp folder parent folder
            await fs.promises.rm(path.resolve(task.item.temporary.path, '..'));
        },
    } satisfies ClientSDK;
}

// // BrowserWindow is not necessary for generating the client API
// const generatedClientAPI = generateClientAPI(registerSDK(undefined as never));

// export const clientAPI = {
//     ...generatedClientAPI,
//     // Custom Handlers
// };