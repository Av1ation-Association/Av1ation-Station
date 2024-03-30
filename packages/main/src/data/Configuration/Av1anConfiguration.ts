import { type Options } from '../Av1an/Types/Options';

//#region Av1an

export enum Av1anInputLocationType {
    Videos = 'videos',
    Desktop = 'desktop',
    Downloads = 'downloads',
    Custom = 'custom',
}

export enum Av1anOutputLocationType {
    InputAdjacent = 'input-adjacent',
    InputAdjacentAv1anFolder = 'input-adjacent-av1an-folder',
    Videos = 'videos',
    Desktop = 'desktop',
    Downloads = 'downloads',
    Custom = 'custom',
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

export interface Av1anConfiguration extends Omit<Options, 'overwriteOutput' | 'temporary'> {
    input: {
        type: Av1anInputLocationType;
        customFolder?: string;
    };
    output: {
        type: Av1anOutputLocationType;
        customFolder?: string;
        extension: Av1anOutputExtension;
        overwrite?: boolean;
    };
    temporary: {
        type: Av1anTemporaryLocationType;
        customFolder?: string;
    };
}

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