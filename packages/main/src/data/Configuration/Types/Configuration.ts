import type { Options } from '../../Av1an/Types/Options';
import { type Av1anConfiguration } from '../Av1anConfiguration';
import { type Project } from '../Projects';

export enum Theme {
    Auto = 'auto',
    Light = 'light',
    Dark = 'dark',
}

export interface Appearance {
    theme: Theme;
    size: {
        width: number;
        height: number;
    };
    position: {
        x: number;
        y: number;
    };
    maximized: boolean;
    enableHardwareAcceleration: boolean;
}

export enum StartUpBehavior {
    NewProject = 'new-project',
    OpenRecentProject = 'open-recent-project',
}

export interface StartUpConfiguration {
    // startPage: string; // Home, Queue, Encode?
    behavior: StartUpBehavior;
}

export interface Defaults  {
    Av1an: Av1anConfiguration;
    Av1anCustom: Omit<Options, 'encoding'> & {
        encoding?: Record<string, string | number | null>;
    };
}

export interface Preferences {
    defaults: {
        [path: string]: 'none' | 'pinned' | 'hidden';
    };
    showHidden?: boolean;
    showAdvanced?: boolean;
}

export interface Configuration {
    // General App Settings
    // Appearance
    appearance: Appearance;
    // StartUp
    startUp: StartUpConfiguration;
    
    recentlyOpenedProjects: (Pick<Project, 'id' | 'path' | 'name'> & { accessedAt: Date })[];

    Av1anExecutablePath?: string;
    defaults: Defaults;
    preferences: Preferences;
}