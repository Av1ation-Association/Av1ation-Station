import { app } from 'electron';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { JSONSchema } from 'json-schema-typed';
import { ConfigurationManager } from './Configuration';
import type { Options } from '../Av1an/Types/Options';
import type { Av1anStatus } from '../../utils/Av1an/Av1an';
import type { Defaults, Preferences } from './Types/Configuration';

export interface Task {
    id: ReturnType<typeof crypto['randomUUID']>;
    projectId: Project['id'];
    inputFileName: string;
    outputFileName: string;
    outputFileOveridden: boolean;
    totalFrames: number;
    statusHistory: Av1anStatus[];
    item: {
        Av1an: Omit<Options, 'temporary' | 'overwriteOutput'> & {
            input: string;
            output: string;
            temporary: Options['temporary'] & {
                path: string;
            };
        };
        Av1anCustom: Omit<Options, 'encoding'> & {
            encoding?: Record<string, string | number | null>;
        };
    };
    skip: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface Project {
    id: ReturnType<typeof crypto['randomUUID']>;
    name?: string;
    path: string;
    defaults: Defaults;
    preferences: Preferences;
    tasks: Task[];
    createdAt: Date;
    updatedAt: Date;
}

export class ProjectManager {
    private static _instance: ProjectManager;

    private constructor() {}

    public static get instance() {
        if (!this._instance) {
            this._instance = new ProjectManager();
        }

        return this._instance;
    }

    public get projectsFolder() {
        return path.resolve(app.getPath('userData'), 'projects');
    }

    public listProjects(existingProjectPaths: Project['path'][] = []) {
        if (!fs.existsSync(this.projectsFolder)) {
            return [];
        }

        const projectFileNames = fs.readdirSync(this.projectsFolder);
        const projectFilePaths = projectFileNames.map((projectFileName) => {
            return path.resolve(this.projectsFolder, projectFileName);
        });
        
        return [...(new Set(existingProjectPaths.concat(projectFilePaths)))].map((projectPath) => {
            return JSON.parse(fs.readFileSync(projectPath, 'utf8')) as Project;
        });
    }

    // Create a new project
    public createProject(projectPath?: Project['path'], projectName?: Project['name']) {
        const id = crypto.randomUUID();
        const { input, output, temporary } = ConfigurationManager.instance.configuration.defaults.Av1an;
        const project: Project = {
            id,
            name: projectName,
            path: projectPath ?? path.resolve(this.projectsFolder, `${id}.json`),
            defaults: {
                Av1an: { input, output, temporary },
                Av1anCustom: {},
            },
            preferences: {
                defaults: {},
            },
            tasks: [],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        return project;
    }

    // Load the project from a file location
    public loadProject(projectPath: Project['path']) {
        if (!fs.existsSync(projectPath)) {
            return;
        }

        const project = JSON.parse(fs.readFileSync(projectPath, 'utf8')) as Project;

        return project;
    }
    
    // Save the project to a file
    public saveProject(project: Project) {
        // Create the project directory if it doesn't exist
        const projectFolder = path.dirname(project.path);
        if (!fs.existsSync(projectFolder)) {
            fs.mkdirSync(projectFolder, { recursive: true });
        }

        fs.writeFileSync(project.path, JSON.stringify(project, null, 4));
    }

    // Delete the project
    public deleteProject(projectPath: Project['path']) {
        if (!fs.existsSync(projectPath)) {
            return;
        }

        fs.rmSync(projectPath);
    }

    // Delete projects folder
    public deleteProjectsFolder() {
        if (!fs.existsSync(this.projectsFolder)) {
            return;
        }

        fs.rmSync(this.projectsFolder, { recursive: true });
    }

    // Create a new project queue item
    public createTask() {
        const item: Pick<Task, 'id' | 'createdAt' | 'updatedAt'> = {
            id: crypto.randomUUID(),
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        return item;
    }
}

export const optionsSchema = {
    type: 'object',
    required: ['input', 'output'],
    properties: {
        input: {
            type: 'string',
        },
        output: {
            type: 'string',
        },
        temporary: {
            type: 'object',
            required: ['path'],
            properties: {
                path: {
                    type: 'string',
                },
                keep: {
                    type: 'boolean',
                    default: true,
                },
                resume: {
                    type: 'boolean',
                    default: true,
                },
            },
            additionalProperties: false,
        },
        overwriteOutput: {
            type: 'boolean',
            default: true,
        },
        help: {
            type: 'boolean',
            default: false,
        },
        version: {
            type: 'boolean',
            default: false,
        },
        verbosity: {
            type: 'string',
            enum: ['quiet', 'verbose'],
            default: undefined,
        },
        maxTries: {
            type: 'integer',
            minimum: 0,
            default: 3,
        },
        workers: {
            type: 'integer',
            minimum: 1,
            default: 0,
        },
        threadAffinity: {
            type: 'integer',
            minimum: 1,
            default: undefined,
        },
        scaler: {
            type: 'string',
        },
        logging: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                },
                level: {
                    type: 'string',
                    enum: ['error', 'warning', 'info', 'debug', 'trace'],
                    default: 'debug',
                },
            },
            additionalProperties: false,
        },
        scenes: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                },
                splitMethod: {
                    type: 'string',
                    enum: ['none', 'av-scenechange'],
                    default: 'av-scenechange',
                },
                detectionMethod: {
                    type: 'string',
                    enum: ['standard', 'fast'],
                    default: 'standard',
                },
                detectionDownScaleHeight: {
                    type: 'integer',
                    minimum: 0,
                    default: undefined,
                },
                detectionPixelFormat: {
                    type: 'string',
                    // enum: ['yuv420p', 'yuv444p', 'yuv422p', 'yuv420p10le', 'yuv444p10le', 'yuv422p10le', 'yuv420p12le', 'yuv444p12le', 'yuv422p12le'],
                    default: undefined,
                },
                detectionOnly: {
                    type: 'boolean',
                    default: false,
                },
                maximumSceneLength: {
                    oneOf: [
                        {
                            type: 'object',
                            required: ['seconds'],
                            properties: {
                                seconds: {
                                    type: 'integer',
                                    minimum: 0,
                                    default: 10,
                                },
                            },
                        },
                        {
                            type: 'object',
                            required: ['frames'],
                            properties: {
                                frames: {
                                    type: 'integer',
                                    minimum: 0,
                                },
                            },
                        },
                    ],
                },
                minimumSceneLengthFrames: {
                    type: 'integer',
                    minimum: 0,
                    default: 24,
                },
                ignoreFrameMismatch: {
                    type: 'boolean',
                    default: false,
                },
            },
        },
        encoding: {
            // TODO: Add encoding options
        },
        chunking: {
            type: 'object',
            properties: {
                method: {
                    type: 'string',
                    enum: ['segment', 'select', 'ffms2', 'lsmash', 'hybrid', 'dgdecnv', 'bestsource'],
                    default: 'lsmash',
                },
                order: {
                    type: 'string',
                    enum: ['long-to-short', 'short-to-long', 'sequential', 'random'],
                    default: 'long-to-short',
                },
                concatenator: {
                    type: 'string',
                    enum: ['ffmpeg', 'mkvmerge', 'ivf'],
                    default: 'ffmpeg',
                },
            },
        },
        photonNoise: {
            type: 'integer',
            minimum: 0,
            maximum: 64,
            default: 0,
        },
        pixelFormat: {
            type: 'string',
            // enum: ['yuv420p', 'yuv422p', 'yuv444p', 'yuv420p10le', 'yuv422p10le', 'yuv444p10le', 'yuv420p12le', 'yuv422p12le', 'yuv444p12le'],
            default: 'yuv420p10le',
        },
        zones: {
            type: 'string',
            default: undefined,
        },
        vmaf: {
            type: 'object',
            properties: {
                path: {
                    type: 'string',
                },
                resolution: {
                    type: 'string',
                },
                threads: {
                    type: 'integer',
                },
                filter: {
                    type: 'string',
                },
            },
            additionalProperties: false,
        },
        targetQuality: {
            type: 'object',
            properties: {
                targetVMAFScore: {
                    type: 'number',
                    minimum: 0,
                    maximum: 100,
                },
                maximumProbes: {
                    type: 'integer',
                    minimum: 0,
                    default: 4,
                },
                probingFrameRate: {
                    type: 'integer',
                    minimum: 0,
                    default: 1,
                },
                probeSlow: {
                    type: 'boolean',
                    default: false,
                },
                minimumQ: {
                    type: 'integer',
                    minimum: 0,
                },
                maximumQ: {
                    type: 'integer',
                    minimum: 0,
                },
            },
            additionalProperties: false,
        },
    },
} satisfies JSONSchema;