import * as fs from 'fs';
import { type Parameters as AOMParameters } from './AOM.js';
import { type Parameters as Rav1eParameters } from './Rav1e.js';
import { type Parameters as SVTParameters } from './SVT.js';

export interface ZoneOverrides<T = null> {
    encoder: 'svt_av1' | string;
    passes: number;
    video_params: T;
    // parsedVideoParams?: ParsedVideoParams;
    photon_noise: number | null;
    extra_splits_len: number;
    min_scene_len: number;
}

export interface Scene<T = null> {
    start_frame: number;
    end_frame: number;
    zone_overrides: T;
}

export interface ScenesJSON<T = null> {
    scenes: Scene<T>[];
    frames: number;
}

export function parseScenesJsonFile<T extends SVTParameters | AOMParameters | Rav1eParameters>(scenesPath: string) {
    // Read scenes.json and parse
    const scenesJson = JSON.parse(fs.readFileSync(scenesPath).toString()) as ScenesJSON<ZoneOverrides<string[]> & { parsedVideoParams: T }>;
    // Parse zone_overrides.video_params and save parsedVideoParams
    scenesJson.scenes.forEach(scene => {
        if (!scene.zone_overrides) {
            return;
        }
        scene.zone_overrides.parsedVideoParams = scene.zone_overrides.video_params.reduce((parsedParameters, parameter, index) => {
            if (parameter.startsWith('--')) {
                const parameterName = parameter.substring(2);
                parsedParameters[parameterName] = Number(scene.zone_overrides.video_params[index + 1]);
            }
            return parsedParameters;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }, {} as any) as T;
    });
    return scenesJson;
}