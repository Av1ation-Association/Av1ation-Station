import * as fs from 'fs';
import { type Parameters as AOMParameters } from './AOM.js';
import { type Parameters as Rav1eParameters } from './Rav1e.js';
import { type Parameters as SVTParameters } from './SVT.js';
import type { InterpolationMethod, ProbeStatistic, TargetMetric, VMAFFeature} from './Options.js';
import { type Encoder } from './Options.js';

export interface ZoneOverrides<T = null> {
    encoder: Encoder | string;
    passes: number;
    video_params: T;
    // parsedVideoParams?: ParsedVideoParams;
    photon_noise: number | null;
    photon_noise_width: number | null;
    photon_noise_height: number | null;
    chroma_noise: number | null;
    extra_splits_len: number;
    min_scene_len: number;
    target_quality: {
        vmaf_res: `${number}x${number}`;
        probe_res: `${number}x${number}` | null;
        vmaf_scaler: 'bicubic' | string;
        vmaf_filter: string | null;
        vmaf_threads: number;
        model: string | null;
        probing_rate: 1 | 2 | 3 | 4;
        probes: number;
        target: [number, number] | null;
        metric: TargetMetric;
        min_q: number;
        max_q: number;
        interp_method: [InterpolationMethod, InterpolationMethod] | null;
        encoder: Encoder | string;
        pix_format: string;
        temp: string;
        workers: number;
        video_params: T;
        params_copied: boolean;
        vspipe_args: string[];
        probing_vmaf_features: VMAFFeature[];
        probing_statistic: {
            name: ProbeStatistic;
            value: number | null;
        };
    }
}

export interface Scene<T = null> {
    start_frame: number;
    end_frame: number;
    zone_overrides: T;
}

export interface ScenesJSON<T = null> {
    scenes: Scene<T>[];
    split_scenes: Scene<T>[];
    frames: number;
}

// TODO: Support other encoders and also parse target_quality.video_params
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