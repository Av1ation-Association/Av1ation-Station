import { type Encoder } from './Types/Options.js';
import { type Av1anConfiguration } from './Av1anConfiguration.js';
import { type Project } from './Projects.js';

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

export enum ConfigurationType {
    Config = 'Config',
    Project = 'Project',
    Task = 'Task',
}

export enum VSHIPBackend {
    Disabled = 'disabled',
    NVIDIA = 'NVIDIA',
    AMD = 'AMD',
}

export interface CustomOption<T extends string | number | boolean | null | undefined = string | number | boolean | null | undefined> {
    name: string;
    flagPrefix: '-' | '--' | '' | string;
    type: T extends string ? 'string' : T extends number ? 'number' : T extends boolean ? 'boolean' : T extends undefined ? 'undefined' : never;
    value: T;
    delimiter: ' ' | '=' | string;
}

export interface Defaults<T extends ConfigurationType = ConfigurationType.Config, U extends Encoder = Encoder.aom> {
    Av1an: Av1anConfiguration<T, U>;
    Av1anCustom: {
        [key: string]: CustomOption;
    } & {
        encoding?: {
            [key: string]: CustomOption;
        }
    };
}

export enum DependencyType {
    System = 'system',
    Packaged = 'packaged',
    Custom = 'custom',
}

export function DependencyTypeToString(type: DependencyType): string {
    switch (type) {
        default:
        case DependencyType.System:
            return 'System';
        case DependencyType.Packaged:
            return 'Packaged';
        case DependencyType.Custom:
            return 'Custom';
    }
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

export interface Preferences<T extends ConfigurationType.Config | ConfigurationType.Project = ConfigurationType.Config> {
    defaults: {
        [path: string]: 'none' | 'pinned' | 'hidden';
    };
    showHidden?: boolean;
    showAdvanced?: boolean;
    dependencyPaths: T extends ConfigurationType.Config ? DependencyPaths : Partial<DependencyPaths>;
}

export interface ConfigPreferences extends Preferences<ConfigurationType.Config> {
    notifications: {
        os: boolean;
        app: boolean;
    };
    vship: VSHIPBackend;
}

export interface Configuration {
    // General App Settings
    // Appearance
    appearance: Appearance;
    // StartUp
    startUp: StartUpConfiguration;

    recentlyOpenedProjects: (Pick<Project, 'id' | 'path' | 'name'> & { accessedAt: Date })[];

    defaults: Defaults;
    preferences: ConfigPreferences;
}
