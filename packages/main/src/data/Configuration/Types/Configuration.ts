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

export type ConfigurationType = 'Config' | 'Project';

export interface Defaults {
    Av1an: Av1anConfiguration;
    Av1anCustom: Omit<Options, 'encoding'> & {
        encoding?: Record<string, string | number | null>;
    };
}

export enum DependencyType {
    System = 'system',
    Packaged = 'packaged',
    Custom = 'custom',
}
export type DependencyPathPreference<CustomAllowed extends boolean = true> = CustomAllowed extends true ? { type: DependencyType.Custom; path: string } | { type: DependencyType.System | DependencyType.Packaged; } : { type: DependencyType.System | DependencyType.Packaged; };

export interface DependencyPaths {
    vapoursynth: DependencyPathPreference<false>;
    av1an: DependencyPathPreference;
    ffmpeg: DependencyPathPreference;
    mkvtoolnix: DependencyPathPreference;
    dgdecnv: DependencyPathPreference;
    aom: DependencyPathPreference;
    svt: DependencyPathPreference;
    rav1e: DependencyPathPreference;
    vpx: DependencyPathPreference;
    x264: DependencyPathPreference;
    x265: DependencyPathPreference;
}

export interface Preferences<T extends 'Config' | 'Project' = 'Config'> {
    defaults: {
        [path: string]: 'none' | 'pinned' | 'hidden';
    };
    showHidden?: boolean;
    showAdvanced?: boolean;
    dependencyPaths: T extends 'Config' ? DependencyPaths : Partial<DependencyPaths>;
}

export interface Configuration {
    // General App Settings
    // Appearance
    appearance: Appearance;
    // StartUp
    startUp: StartUpConfiguration;
    
    recentlyOpenedProjects: (Pick<Project, 'id' | 'path' | 'name'> & { accessedAt: Date })[];

    defaults: Defaults;
    preferences: Preferences;
}