import { toRaw } from 'vue';
import { defineStore } from 'pinia';
import { type Project, type Task } from '../../../main/src/data/Configuration/Projects';
import { type Av1anStatus } from '../../../main/src/utils/Av1an/Av1an';
import { Av1anInputLocationType, Av1anOutputLocationType, Av1anTemporaryLocationType } from '../../../main/src/data/Configuration/Av1anConfiguration';
import { useGlobalStore } from './global';

export const useProjectsStore = defineStore('projects', {
    state: () => {
        return {
            projects: [] as Project[],
            projectQueueMap: {} as {
                [projectId: Project['id']]:
                { 
                    taskId?: Task['id'];
                    status: 'idle' | 'paused' | 'processing' | 'done' | 'cancelled' | 'error';
                };
            },
            taskLogMap: {} as {
                [projectId: Project['id']]: {
                    [taskId: Task['id']]: string;
                };
            },
            taskStatusListenerRegistered: false,
        };
    },
    actions: {
        async initialize() {
            const configStore = useGlobalStore();

            this.projects = await window.projectsApi['list-projects'](configStore.config.recentlyOpenedProjects.map(project => project.path));

            // Initialize projectQueueMap
            this.projectQueueMap = this.projects.reduce((map, project: Project) => {
                map[project.id] = {
                    status: 'idle',
                };
                for (const task of project.tasks) {
                    const lastStatus = task.statusHistory.length ? task.statusHistory[task.statusHistory.length - 1].state : 'idle';
                
                    if (lastStatus !== 'idle') {
                        map[project.id] = {
                            taskId: task.id,
                            status: 'paused',
                        };
        
                        break;
                    }
                }
        
                return map;
            }, {} as typeof this.projectQueueMap);
        },
        async createProject() {
            const project = await window.projectsApi['create-project']();
            // Save the new project
            await window.projectsApi['save-project'](project);
            // Add project to projects
            this.projects.push(project);
            // Initialize projectQueueMap
            this.projectQueueMap[project.id] = {
                status: 'idle',
            };


            return project;
        },
        async loadProject(projectPath: string) {
            const project = await window.projectsApi['load-project'](projectPath);
            const configStore = useGlobalStore();

            if (project) {
                const projectIndex = configStore.config.recentlyOpenedProjects.findIndex(recent => recent.id === project.id);

                if (projectIndex !== -1) {
                    // Update accessedAt
                    configStore.config.recentlyOpenedProjects[projectIndex].accessedAt = new Date();

                    // Add 'paused' status to Tasks that were mid-encode when aborted
                    project.tasks = project.tasks.map(task => {
                        // Ignore currently processing task
                        if (this.projectQueueMap[project.id].status === 'processing' && this.projectQueueMap[project.id].taskId === task.id) {
                            return task;
                        }

                        // Initialize with idle state if none found
                        if (!task.statusHistory.length) {
                            task.statusHistory.push({ state: 'idle', time: new Date() });
                        }

                        const lastStatus = task.statusHistory[task.statusHistory.length - 1];

                        if (['encoding', 'scene-detection'].includes(lastStatus.state)) {
                            task.statusHistory.push({ state: 'cancelled', time: new Date() });
                        }

                        return task;
                    });

                    // Save updated project
                    this.projects[projectIndex] = project;
                    await this.saveProject(project, false);
                } else {
                    configStore.config.recentlyOpenedProjects.push({
                        id: project.id,
                        path: project.path,
                        name: project.name,
                        accessedAt: new Date(),
                    });
                }

                // Save the updated config
                await configStore.setConfig(toRaw(configStore.config), true);
            }

            return project;
        },
        async saveProject(projectOrId: Project['id'] | Project, resetUpdatedAt = true) {
            const project = typeof projectOrId === 'string' ? this.projects.find(project => project.id === projectOrId) : projectOrId;

            if (!project) {
                return;
            }

            if (resetUpdatedAt) {
                project.updatedAt = new Date();
            }

            await window.projectsApi['save-project'](toRaw(project));
        },
        async deleteProject(projectOrId: Project['id'] | Project) {
            const project = typeof projectOrId === 'string' ? this.projects.find(project => project.id === projectOrId) : projectOrId;

            if (!project) {
                return;
            }

            // Delete project file
            await window.projectsApi['delete-project'](project.path);
            // Remove project from recently opened projects
            const configStore = await useGlobalStore();
            const projectIndex = configStore.config.recentlyOpenedProjects.findIndex(recent => recent.id === project.id);
            
            if (projectIndex !== -1) {
                configStore.config.recentlyOpenedProjects.splice(projectIndex, 1);
            }

            // Save the updated config
            configStore.setConfig(toRaw(configStore.config), true);

            // Cancel Tasks
            if (this.projectQueueMap[project.id]) {
                if (this.projectQueueMap[project.id].status in ['processing', 'paused']) {
                    // Cancel task
                    const task = project.tasks.find(task => task.id === this.projectQueueMap[project.id].taskId);

                    if (task) {
                        await window.projectsApi['cancel-task'](toRaw(task));
                    }
                }

                // Remove project from queue
                delete this.projectQueueMap[project.id];
            }

            // Delete task temporary files
            await Promise.all(project.tasks.map(task => window.projectsApi['task-delete-temporary-files'](toRaw(task))));

            // Remove project from projects
            this.projects.splice(this.projects.findIndex(p => p.id === project.id), 1);
        },
        async createTasks(project: Project) {
            const projectIndex = this.projects.findIndex(p => p.id === project.id);

            // Typeguard - Should not occur
            if (projectIndex === -1) {
                return Promise.resolve();
            }

            const initialPath = await this.getDefaultTaskInputDirectory(project);
            const inputFilePaths = await window.configurationsApi['open-file'](initialPath, 'Av1an Input', undefined, ['multiSelections']);

            if (inputFilePaths === undefined || inputFilePaths.length === 0) {
                return Promise.resolve();
            }

            const tasks = await Promise.all(inputFilePaths.map(async inputFilePath => {
                const newTask = await window.projectsApi['create-queue-item']();
                const inputFileName = await window.configurationsApi['path-basename'](inputFilePath, true);
                const { outputFilePath, temporaryFolderPath, scenesFilePath } = await this.buildDefaultTaskPaths(project, newTask.id, inputFilePath);
                const outputFileName = await window.configurationsApi['path-basename'](outputFilePath, true);
                const task: Task = {
                    ...newTask,
                    projectId: project.id,
                    inputFileName,
                    outputFileName,
                    outputFileOveridden: false,
                    totalFrames: 0,
                    statusHistory: [{
                        state: 'idle',
                        time: new Date(),
                    }],
                    item: {
                        Av1an: {
                            input: inputFilePath,
                            output: outputFilePath,
                            temporary: {
                                path: temporaryFolderPath,
                                keep: true,
                                resume: true,
                            },
                            scenes: {
                                path: scenesFilePath,
                            },
                        },
                        Av1anCustom: {},
                    },
                    skip: false,
                };

                return Promise.resolve(task);
            }));

            this.projects[projectIndex].tasks.push(...tasks);

            await this.saveProject(toRaw(this.projects[projectIndex]));

            return tasks;
        },
        async getDefaultTaskInputDirectory(project: Project) {
            const configStore = useGlobalStore();

            const defaultInput = project.defaults.Av1an.input.type ?? configStore.config.defaults.Av1an.input.type;
            // Tremendous Ternary
            return defaultInput === Av1anInputLocationType.Videos
                ? await window.configurationsApi['get-path']('videos')
                : defaultInput === Av1anInputLocationType.Downloads
                    ? await window.configurationsApi['get-path']('downloads')
                    : defaultInput === Av1anInputLocationType.Desktop
                        ? await window.configurationsApi['get-path']('desktop')
                        : defaultInput === Av1anInputLocationType.Custom
                            ? project.defaults.Av1an.input.customFolder ?? configStore.config.defaults.Av1an.input.customFolder
                            : project.path;
        },
        async buildDefaultTaskPaths(project: Project, taskId: Task['id'], inputFilePath: string) {
            const configStore = useGlobalStore();
            const projectIndex = this.projects.findIndex(p => p.id === project.id);
            const inputFileDirectory = await window.configurationsApi['path-dirname'](inputFilePath ?? this.projects[projectIndex]);
            const inputFileName = await window.configurationsApi['path-basename'](inputFilePath ?? this.projects[projectIndex], true);

            const defaultOutput = this.projects[projectIndex].defaults.Av1an.output.type ?? configStore.config.defaults.Av1an.output.type;
            let outputFilePath: string;
            const outputFileExtension = this.projects[projectIndex].defaults.Av1an.output.extension ?? configStore.config.defaults.Av1an.output.extension;

            // Splendiferous Switch - But which is best?
            switch (defaultOutput) {
                case Av1anOutputLocationType.InputAdjacent:
                    outputFilePath = await window.configurationsApi['resolve-path'](inputFileDirectory, `${inputFileName}.av1an.${outputFileExtension}`);
                    break;
                case Av1anOutputLocationType.InputAdjacentAv1anFolder:
                    outputFilePath = await window.configurationsApi['resolve-path'](inputFileDirectory, 'Av1an', `${inputFileName}.${outputFileExtension}`);
                    break;
                case Av1anOutputLocationType.Videos: {
                    const outputDirectory = await window.configurationsApi['get-path']('videos');
                    outputFilePath = await window.configurationsApi['resolve-path'](outputDirectory, `${inputFileName}.${outputFileExtension}`);
                    break;
                }
                case Av1anOutputLocationType.Downloads: {
                    const outputDirectory = await window.configurationsApi['get-path']('downloads');
                    outputFilePath = await window.configurationsApi['resolve-path'](outputDirectory, `${inputFileName}.${outputFileExtension}`);
                    break;
                }
                case Av1anOutputLocationType.Desktop: {
                    const outputDirectory = await window.configurationsApi['get-path']('desktop');
                    outputFilePath = await window.configurationsApi['resolve-path'](outputDirectory, `${inputFileName}.${outputFileExtension}`);
                    break;
                }
                case Av1anOutputLocationType.Custom: {
                    outputFilePath = await window.configurationsApi['resolve-path'](this.projects[projectIndex].defaults.Av1an.output.customFolder ?? configStore.config.defaults.Av1an.output.customFolder ?? inputFileDirectory, `${inputFileName}.${outputFileExtension}`);
                    break;
                }
            }

            let temporaryFolderPath: string;
    
            switch (project.defaults.Av1an.temporary.type ?? configStore.config.defaults.Av1an.temporary.type) {
                case Av1anTemporaryLocationType.InputAdjacentAv1anFolder:
                    temporaryFolderPath = await window.configurationsApi['resolve-path'](inputFileDirectory, 'Av1ation Station', taskId, 'temporary');
                    break;
                case Av1anTemporaryLocationType.Av1ationStationDocumentsFolder:{
                    const documentsFolder = await window.configurationsApi['get-path']('documents');
                    temporaryFolderPath = await window.configurationsApi['resolve-path'](documentsFolder, 'Av1ation Station', taskId, 'temporary');
                    break;
                }
                case Av1anTemporaryLocationType.Custom:
                    temporaryFolderPath = await window.configurationsApi['resolve-path'](project.defaults.Av1an.temporary.customFolder ?? configStore.config.defaults.Av1an.temporary.customFolder ?? inputFileDirectory, 'Av1ation Station', taskId, 'temporary');
                    break;
            }

            const scenesFilePath = await window.configurationsApi['resolve-path'](temporaryFolderPath, '../scenes.json');

            return {
                outputFilePath,
                temporaryFolderPath,
                scenesFilePath,
            };
        },
        async registerTaskListeners() {
            await window.projectsApi['task-status'](async (status) => {
                const projectIndex = this.projects.findIndex(p => p.id === status.projectId);
                if (projectIndex === -1) {
                    return;
                }
                const taskIndex = this.projects[projectIndex].tasks.findIndex(t => t.id === status.taskId);
                if (taskIndex === -1) {
                    return;
                }

                if (status.status.state === 'encoding') {
                    // Update task frame count
                    if (!this.projects[projectIndex].tasks[taskIndex].totalFrames) {
                        const frameCount = await window.projectsApi['task-av1an-frame-count'](toRaw(this.projects[projectIndex].tasks[taskIndex]));
                        if (frameCount) {
                            this.projects[projectIndex].tasks[taskIndex].totalFrames = frameCount;
                        }
                    }
                }
                this.projects[projectIndex].tasks[taskIndex].statusHistory.push(status.status);

                // Save Project File
                await this.saveProject(toRaw(this.projects[projectIndex]), false);
            });

            await window.projectsApi['task-log'](async (log) => {
                const projectIndex = this.projects.findIndex(p => p.id === log.projectId);
                if (projectIndex === -1) {
                    return;
                }
                const taskIndex = this.projects[projectIndex].tasks.findIndex(t => t.id === log.taskId);
                if (taskIndex === -1) {
                    return;
                }
                this.taskLogMap[log.projectId][log.taskId] = log.log;
            });

            this.taskStatusListenerRegistered = true;
        },
        buildTaskAv1anOptions(task: Task) {
            const configStore = useGlobalStore();
            const project = this.projects.find(p => p.id === task.projectId);

            if (!project) {
                return;
            }

            // Build Task Av1an Options
            const {
                input: _configInput,
                output: _configOutput,
                temporary: _configTemporary,
                ...configDefaults
            } = toRaw(configStore.config.defaults.Av1an);
            const {
                input: _projectInput,
                output: _projectOutput,
                temporary: _projectTemporary,
                ...projectDefaults
            } = toRaw(project.defaults.Av1an);

            // Initial Av1an Options
            const configOptions: Task['item']['Av1an'] = {
                input: task.inputFileName,
                output: task.outputFileName,
                temporary: toRaw(task).item.Av1an.temporary,
                ...configDefaults,
            };
            // Apply Av1an Defaults - Config -> Project -> Task
            const configCustomOptions = this.applyAv1anOptions(configOptions, configStore.config.defaults.Av1anCustom);
            const projectOptions = this.applyAv1anOptions(configCustomOptions, projectDefaults);
            const projectCustomOptions = this.applyAv1anOptions(projectOptions, project.defaults.Av1anCustom);
            const taskOptions = this.applyAv1anOptions(projectCustomOptions, task.item.Av1an);
            const taskCustomOptions = this.applyAv1anOptions(taskOptions, task.item.Av1anCustom);

            return taskCustomOptions;
        },
        applyAv1anOptions(options: Task['item']['Av1an'], av1anCustom: Record<string, unknown>) {
            return Object.entries(av1anCustom).reduce((opts, [parameterName, parameterValue]) => {
                if (parameterValue === null) {
                    delete (opts as Record<string, unknown>)[parameterName];
                } else if (typeof parameterValue === 'object') {
                    if (!(parameterName in opts)) {
                        (opts as Record<string, unknown>)[parameterName] = {};
                    }
                    Object.entries(parameterValue).forEach(([subParameterName, subParameterValue]) => {
                        if (subParameterValue === null) {
                            delete ((opts as Record<string, unknown>)[parameterName] as Record<string, unknown>)[subParameterName];
                        } else {
                            ((opts as Record<string, unknown>)[parameterName] as Record<string, unknown>)[subParameterName] = toRaw(subParameterValue);
                        }
                    });
                } else {
                    (opts as Record<string, unknown>)[parameterName] = parameterValue;
                }
    
                return opts;
            }, options);
        },
        async resetTask(task: Task, saveProject = true) {
            const taskIndex = this.projects[this.projects.findIndex(p => p.id === task.projectId)].tasks.findIndex(pTask => pTask.id === task.id);

            if (taskIndex === -1) {
                return;
            }

            const projectIndex = this.projects.findIndex(p => p.id === task.projectId);
            
            // Reset total frames, Status History, and delete temporary files
            this.projects[projectIndex].tasks[taskIndex].totalFrames = 0;
            this.projects[projectIndex].tasks[taskIndex].statusHistory = [{
                state: 'idle',
                time: new Date(),
            }];
            await window.projectsApi['task-delete-temporary-files'](toRaw(this.projects[projectIndex].tasks[taskIndex]));
            // Reset updatedAt
            this.projects[projectIndex].tasks[taskIndex].updatedAt = new Date();
        
            // Save Project File
            if (saveProject) {
                await this.saveProject(toRaw(this.projects[projectIndex]), false);
            }
        },
        async deleteTask(task: Task, saveProject = true) {
            const projectIndex = this.projects.findIndex(project => project.id === task.projectId);
            if (projectIndex === -1) {
                return;
            }
            const taskIndex = this.projects[projectIndex].tasks.findIndex(t => t.id === task.id);
            if (taskIndex === -1) {
                return;
            }

            // Move Task Queue "cursor" to previous unskipped task or reset to Idle
            if (this.projectQueueMap[this.projects[projectIndex].id].taskId && this.projectQueueMap[this.projects[projectIndex].id].taskId === this.projects[projectIndex].tasks[taskIndex].id) {
                const previousUnskippedTaskIndex = this.projects[projectIndex].tasks.slice(0, taskIndex).reverse().findIndex(task => !task.skip);

                if (previousUnskippedTaskIndex === -1) {
                    this.projectQueueMap[this.projects[projectIndex].id] = {
                        status: 'idle',
                    };
                } else {
                    this.projectQueueMap[this.projects[projectIndex].id].taskId = this.projects[projectIndex].tasks[previousUnskippedTaskIndex].id;
                }
            }

            // Delete temporary files
            await window.projectsApi['task-delete-temporary-files'](toRaw(this.projects[projectIndex].tasks[taskIndex]));
            // Remove task
            this.projects[projectIndex].tasks.splice(taskIndex, 1);

            // Save Project File (False for batch operations)
            if (saveProject) {
                await this.saveProject(toRaw(this.projects[projectIndex]));
            }
        },
        taskProgressStatus(task: Task): 'info' | 'success' | 'error' | 'default' | 'warning' {
            const lastStatus: Av1anStatus = task.statusHistory[task.statusHistory.length - 1];
        
            if (!lastStatus) {
                return 'default';
            }
        
            switch (lastStatus.state) {
                case 'done':
                    return 'success';
                case 'cancelled':
                    return 'warning';
                case 'error':
                    return 'error'; 
                case 'idle':
                    return 'info';
                case 'scene-detection':
                case 'encoding':
                default:
                    return 'default';
            }
        },
        taskProgressPercentage(task: Task) {
            const totalFramesCompleted = [...task.statusHistory].reverse().find(status => status.progress)?.progress?.framesCompleted ?? 0;

            return (totalFramesCompleted / (task.totalFrames || 1)) * 100;
        },
        taskProgressEstimatedSeconds(task: Task) {
            const lastStatus = [...task.statusHistory].reverse().find(status => status.progress);
    
            if (!lastStatus || !lastStatus.progress) {
                return;
            }

            return lastStatus.progress.estimatedSeconds;
        },
        taskProgressETA(task: Task) {
            const estimatedSeconds = this.taskProgressEstimatedSeconds(task);

            if (!estimatedSeconds) {
                return;
            }

            return new Date(Date.now() + (estimatedSeconds * 1000));
        },
        taskStarted(task: Task) {
            return task.statusHistory.some(status => status.state === 'scene-detection' || status.state === 'encoding');
        },
        taskCompleted(task: Task) {
            return task.statusHistory[task.statusHistory.length - 1].state === 'done';
        },
    },
});
