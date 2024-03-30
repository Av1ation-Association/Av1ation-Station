import { defineStore } from 'pinia';
// import { StartUpBehavior } from '../../../main/src/data/Configuration/Types/Configuration';
import { type Project, type Task } from '../../../main/src/data/Configuration/Projects';
import { Av1anInputLocationType, Av1anOutputLocationType, Av1anTemporaryLocationType } from '../../../main/src/data/Configuration/Av1anConfiguration';
import { useGlobalStore } from './global';
import { toRaw } from 'vue';
// import { type StatusChange } from '../../../main/src/api/Projects/client';

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
            taskStatusListenerRegistered: false,
        };
    },
    actions: {
        // async getProject() {
        //     const globalStore = useGlobalStore();
        //     const config = await globalStore.getConfig();
        //     const projectsSorted = config.recentlyOpenedProjects.sort((a, b) => b.accessedAt.getTime() - a.accessedAt.getTime());
        //     let project = config.startUp.behavior === StartUpBehavior.OpenRecentProject && config.recentlyOpenedProjects.length > 0 ? await window.projectsApi['load-project'](projectsSorted[0].path) : undefined;

        //     if (!project) {
        //         project = await window.projectsApi['create-project']();
        //         // Save the new project
        //         await window.projectsApi['save-project'](project);
        //         // Add to recently opened projects in the config
        //         config.recentlyOpenedProjects.push({
        //             id: project.id,
        //             path: project.path,
        //             name: project.name,
        //             accessedAt: new Date(),
        //         });
        //         await globalStore.setConfig(config, true);
        //     }

        //     this.project = project;
        //     return project;
        // },
        async createProject() {
            const project = await window.projectsApi['create-project']();
            // Save the new project
            await window.projectsApi['save-project'](project);
            // Add project to projects
            this.projects.push(project);

            return project;
        },
        async loadProject(projectPath: string) {
            const project = await window.projectsApi['load-project'](projectPath);
            const config = await useGlobalStore().getConfig();

            if (project) {
                const projectIndex = config.recentlyOpenedProjects.findIndex(recent => recent.id === project.id);

                if (projectIndex !== -1) {
                    // Update accessedAt
                    config.recentlyOpenedProjects[projectIndex].accessedAt = new Date();
                } else {
                    config.recentlyOpenedProjects.push({
                        id: project.id,
                        path: project.path,
                        name: project.name,
                        accessedAt: new Date(),
                    });
                }

                // Save the updated config
                (await useGlobalStore()).setConfig(config, true);
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

            // Cancel and Remove Tasks
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

            // Remove project from projects
            this.projects.splice(this.projects.findIndex(p => p.id === project.id), 1);
        },
        async createTasks(projectProxy: Project) {
            const config = toRaw((await useGlobalStore()).config);
            const project = toRaw(projectProxy);
            const defaultInput = project.defaults.Av1an.input.type ?? config.defaults.Av1an.input.type;
            // Tremendous Ternary
            const initialPath = defaultInput === Av1anInputLocationType.Videos
                ? await window.configurationsApi['get-path']('videos')
                : defaultInput === Av1anInputLocationType.Downloads
                    ? await window.configurationsApi['get-path']('downloads')
                    : defaultInput === Av1anInputLocationType.Desktop
                        ? await window.configurationsApi['get-path']('desktop')
                        : defaultInput === Av1anInputLocationType.Custom
                            ? project.defaults.Av1an.input.customFolder ?? config.defaults.Av1an.input.customFolder
                            : project.path;

            const inputFilePaths = await window.configurationsApi['open-file'](initialPath, 'Av1an Input', undefined, ['multiSelections']);

            if (inputFilePaths === undefined || inputFilePaths.length === 0) {
                return Promise.resolve();
            }

            const tasks = await Promise.all(inputFilePaths.map(async inputFilePath => {
                const inputFileDirectory = await window.configurationsApi['path-dirname'](inputFilePath);
                const inputFileName = await window.configurationsApi['path-basename'](inputFilePath, true);
    
                const defaultOutput = project.defaults.Av1an.output.type ?? config.defaults.Av1an.output.type;
                let outputFilePath: string;
                const outputFileExtension = project.defaults.Av1an.output.extension ?? config.defaults.Av1an.output.extension;
    
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
                        outputFilePath = await window.configurationsApi['resolve-path'](project.defaults.Av1an.output.customFolder ?? config.defaults.Av1an.output.customFolder ?? inputFileDirectory, `${inputFileName}.${outputFileExtension}`);
                        break;
                    }
                }
    
                let temporaryFolderPath: string;
    
                switch (project.defaults.Av1an.temporary.type ?? config.defaults.Av1an.temporary.type) {
                    case Av1anTemporaryLocationType.InputAdjacentAv1anFolder:
                        temporaryFolderPath = await window.configurationsApi['resolve-path'](inputFileDirectory, 'Av1ation Station', project.id, 'temporary');
                        break;
                    case Av1anTemporaryLocationType.Av1ationStationDocumentsFolder:{
                        const documentsFolder = await window.configurationsApi['get-path']('documents');
                        temporaryFolderPath = await window.configurationsApi['resolve-path'](documentsFolder, 'Av1ation Station', project.id, 'temporary');
                        break;
                    }
                    case Av1anTemporaryLocationType.Custom:
                        temporaryFolderPath = await window.configurationsApi['resolve-path'](project.defaults.Av1an.temporary.customFolder ?? config.defaults.Av1an.temporary.customFolder ?? inputFileDirectory, 'Av1ation Station', project.id, 'temporary');
                        break;
                }
    
                const newQueueItem = await window.projectsApi['create-queue-item']();
                const outputFileName = await window.configurationsApi['path-basename'](outputFilePath, true);
                const scenesFilePath = await window.configurationsApi['resolve-path'](temporaryFolderPath, '../scenes.json');
                const task: Task = {
                    ...newQueueItem,
                    projectId: project.id,
                    inputFileName,
                    outputFileName,
                    totalFrames: 0,
                    statusHistory: [],
                    item: {
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
                    skip: false,
                };

                return Promise.resolve(task);
            }));

            projectProxy.tasks.push(...tasks);
            // this.projects[this.projects.findIndex(p => p.id === project.id)] = projectProxy;

            await this.saveProject(project);

            return tasks;
        },
    },
});
