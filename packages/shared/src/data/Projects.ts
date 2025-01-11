import { type UUID } from 'crypto';
import {
    type Defaults,
    type ConfigurationType,
    type Preferences,
} from './Configuration.js';
import { type Av1anStatus } from './Types/Status.js';

export interface Project {
    id: UUID;
    name?: string;
    path: string;
    defaults: Defaults<ConfigurationType.Project>;
    preferences: Preferences<ConfigurationType.Project>;
    tasks: Task[];
    createdAt: Date;
    updatedAt: Date;
}
export interface Task {
    id: UUID;
    projectId: Project['id'];
    inputFileName: string;
    outputFileName: string;
    outputFileOveridden: boolean;
    totalFrames: number;
    statusHistory: Av1anStatus[];
    item: Defaults<ConfigurationType.Task>;
    skip: boolean;
    createdAt: Date;
    updatedAt: Date;
}
