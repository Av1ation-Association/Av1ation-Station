import {
    type Encoder,
    type Options,
} from './Types/Options.js';
import { type ConfigurationType } from './Configuration.js';

//#region Av1an

export enum Av1anInputLocationType {
    Videos = 'videos',
    Desktop = 'desktop',
    Downloads = 'downloads',
    Custom = 'custom',
}

export function Av1anInputLocationTypeToString(type: Av1anInputLocationType) {
    switch (type) {
        default:
        case Av1anInputLocationType.Videos:
            return 'Videos';
        case Av1anInputLocationType.Desktop:
            return 'Desktop';
        case Av1anInputLocationType.Downloads:
            return 'Downloads';
        case Av1anInputLocationType.Custom:
            return 'Custom';
    }
}

export enum Av1anOutputLocationType {
    InputAdjacent = 'input-adjacent',
    InputAdjacentAv1anFolder = 'input-adjacent-av1an-folder',
    Videos = 'videos',
    Desktop = 'desktop',
    Downloads = 'downloads',
    Custom = 'custom',
}

export function Av1anOutputLocationTypeToString (type: Av1anOutputLocationType) {
    switch (type) {
        default:
        case Av1anOutputLocationType.InputAdjacent:
            return 'Input Adjacent';
        case Av1anOutputLocationType.InputAdjacentAv1anFolder:
            return 'Input Adjacent Av1an Folder';
        case Av1anOutputLocationType.Videos:
            return 'Videos';
        case Av1anOutputLocationType.Desktop:
            return 'Desktop';
        case Av1anOutputLocationType.Downloads:
            return 'Downloads';
        case Av1anOutputLocationType.Custom:
            return 'Custom';
    }
}

export enum Av1anOutputExtension {
    mkv = 'mkv',
    webm = 'webm',
    mp4 = 'mp4',
}

export enum Av1anTemporaryLocationType {
    InputAdjacentAv1anFolder = 'input-adjacent-av1an-folder',
    Av1ationStationDocumentsFolder = 'av1ation-station-documents-folder',
    Custom = 'custom',
}

export function Av1anTemporaryLocationTypeToString(type: Av1anTemporaryLocationType) {
    switch (type) {
        default:
        case Av1anTemporaryLocationType.InputAdjacentAv1anFolder:
            return 'Input Adjacent Av1an Folder';
        case Av1anTemporaryLocationType.Av1ationStationDocumentsFolder:
            return 'Av1ation Station Documents Folder';
        case Av1anTemporaryLocationType.Custom:
            return 'Custom';
    }
}

export interface DefaultAv1anConfiguration<T extends ConfigurationType.Config | ConfigurationType.Project = ConfigurationType.Config, U extends Encoder = Encoder.aom> extends Omit<Options<U>, 'overwriteOutput' | 'temporary'> {
    input: {
        type: Av1anInputLocationType.Desktop | Av1anInputLocationType.Downloads | Av1anInputLocationType.Videos;
    } | {
        type: Av1anInputLocationType.Custom;
        customFolder: string;
    };
    output: ((
        T extends ConfigurationType.Project ? {
            type?: Av1anOutputLocationType.InputAdjacent | Av1anOutputLocationType.InputAdjacentAv1anFolder | Av1anOutputLocationType.Videos | Av1anOutputLocationType.Desktop | Av1anOutputLocationType.Downloads;
        } : {
            type: Av1anOutputLocationType.Desktop | Av1anOutputLocationType.Downloads | Av1anOutputLocationType.Videos | Av1anOutputLocationType.InputAdjacent | Av1anOutputLocationType.InputAdjacentAv1anFolder;
        }
    ) | {
        type: Av1anOutputLocationType.Custom;
        customFolder: string;
    }) & {
        extension?: Av1anOutputExtension;
        overwrite?: boolean;
    };
    temporary: {
        type: Av1anTemporaryLocationType.InputAdjacentAv1anFolder | Av1anTemporaryLocationType.Av1ationStationDocumentsFolder;
    } | {
        type: Av1anTemporaryLocationType.Custom;
        customFolder: string;
    };
}

export type Av1anConfiguration<T extends ConfigurationType = ConfigurationType.Config, U extends Encoder = Encoder.aom> = T extends ConfigurationType.Task
    ? Omit<Options<U>, 'temporary' | 'overwriteOutput'> & {
        input: string;
        output: string;
        temporary: Options['temporary'] & {
            path: string;
        };
    }
    : T extends ConfigurationType.Project
        ? Partial<DefaultAv1anConfiguration<T>>
        : DefaultAv1anConfiguration;

export const defaultAv1anConfiguration: Av1anConfiguration = {
    input: {
        type: Av1anInputLocationType.Videos,
    },
    output: {
        type: Av1anOutputLocationType.InputAdjacent,
        extension: Av1anOutputExtension.mkv,
        overwrite: false,
    },
    temporary: {
        type: Av1anTemporaryLocationType.InputAdjacentAv1anFolder,
    },
};

//#endregion Av1an
