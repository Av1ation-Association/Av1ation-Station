import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import Watcher from 'watcher';
// import * as url from 'url';
import type { ChildProcessByStdio} from 'child_process';
import { spawn } from 'child_process';
import {
    type Readable,
    type Writable,
} from 'stream';
import { type Options } from '../../../../shared/src/data/Types/Options.js';
import { Encoder, OutputOverwrite, Verbosity } from '../../../../shared/src/data/Types/Options.js';
import { parseDoneJsonFile } from '../../../../shared/src/data/Types/Done.js';
import type { Parameters as SVTParameters } from '../../../../shared/src/data/Types/SVT.js';
import type { Parameters as AOMParameters } from '../../../../shared/src/data/Types/AOM.js';
import type { Parameters as Rav1eParameters } from '../../../../shared/src/data/Types/Rav1e.js';
import type { Parameters as VpxParameters } from '../../../../shared/src/data/Types/Vpx.js';
import type { Chunk } from '../../../../shared/src/data/Types/Chunks.js';
import { parseChunksJsonFile } from '../../../../shared/src/data/Types/Chunks.js';
import {
    type DependencyPaths,
    DependencyType,
} from '../../../../shared/src/data/Configuration.js';
import { type Task } from '../../../../shared/src/data/Projects.js'; 
import { type Av1anStatus } from '../../../../shared/src/data/Types/Status.js';
// import commandExists from "command-exists";

type Av1anOptions = Task['item'] & { Av1an: Options };

export class Av1anManager {
    private static _instance: Av1anManager;
    public readonly av1anMap = new Map<Task['id'], Av1an>();

    private constructor() {}

    public static get instance() {
        if (!this._instance) {
            this._instance = new Av1anManager();
        }

        return this._instance;
    }

    public addAv1an(id: Task['id'], options: Av1anOptions, environment: DependencyPaths, history: Task['statusHistory']) {
        const av1an = new Av1an(options, environment, history);
        this.av1anMap.set(id, av1an);
        return av1an;
    }

    public removeAv1an(id: Task['id']) {
        const av1an = this.av1anMap.get(id);
        if (av1an) {
            av1an.removeAllListeners();
            this.av1anMap.delete(id);
        }
    }
}

export class Av1an extends EventEmitter {
    private childProcess?: ChildProcessByStdio<Writable, Readable, Readable>;
    // private childProcess?: ChildProcessByStdio<Writable, Readable | null, Readable | null>;
    // List of all Av1an states
    private allStates: Av1anStatus[] = [{ time: new Date(), state: 'idle' }];
    private temporaryFolderWatcher?: Watcher;
    private totalFrames = 0;
    private chunks: Chunk[] = [];
    public log: string = '';
    private previouslyCompletedChunkIds: string[] = [];
    private recentlyCompletedChunkIds: string[] = [];

    public input: string;
    public output: string;

    constructor(public options: Av1anOptions, public environment: DependencyPaths, previousStatusHistory: Av1anStatus[] = []) {
        super();

        this.input = options.Av1an.input;
        this.output = options.Av1an.output;

        // Todo: Ensure input file exists
        // Todo: Ensure temporary folder exists if in options.temp
        // Todo: Ensure output folder exists
        // Todo: Ensure zones.txt exists if in options.zones
        // Todo: Ensure scenes.json exists if in options.scenes
        // Todo: Check if output already exists and check if options.overwriteOutput is true

        // Only reset to 'idle' state if not already 'done' or 'canceled' or 'error'
        if (previousStatusHistory.length && !(/done|canceled|error/.test(previousStatusHistory[previousStatusHistory.length - 1].state))) {
            this.addStatus({
                state: 'idle',
            });
        }
    }

    public static BuildArguments(options: Av1anOptions) {
        const av1anArguments = [
            '-i', options.Av1an.input,
            '-o', options.Av1an.output,
        ];
        const av1anPrintFriendlyArguments = [
            '-i', `"${options.Av1an.input}"`,
            '-o', `"${options.Av1an.output}"`,
        ];

        if (options.Av1an) {
            if (options.Av1an.proxy) {
                av1anArguments.push('--proxy', options.Av1an.proxy);
                av1anPrintFriendlyArguments.push('--proxy', `"${options.Av1an.proxy}"`);
            }
            if (options.Av1an.vspipeArguments) {
                av1anArguments.push('--vspipe-args', options.Av1an.vspipeArguments);
                av1anPrintFriendlyArguments.push('--vspipe-args', options.Av1an.vspipeArguments);
            }
            if (options.Av1an.overwriteOutput) {
                const arg = options.Av1an.overwriteOutput === OutputOverwrite.yes ? '-y' : '-n';
                av1anArguments.push(arg);
                av1anPrintFriendlyArguments.push(arg);
            } else {
                // If not specified, overwrite by default to avoid av1an asking for input in shell
                av1anArguments.push('-y');
                av1anPrintFriendlyArguments.push('-y');
            }
            if (options.Av1an.verbosity) {
                const arg = options.Av1an.verbosity === Verbosity.verbose ? '--verbose' : '--quiet';
                av1anArguments.push(arg);
                av1anPrintFriendlyArguments.push(arg);
            }
            if (options.Av1an.help) {
                av1anArguments.push('--help');
                av1anPrintFriendlyArguments.push('--help');
            }
            if (options.Av1an.version) {
                av1anArguments.push('--version');
                av1anPrintFriendlyArguments.push('--version');
            }
            if (options.Av1an.logging && Object.keys(options.Av1an.logging).length) {
                if (options.Av1an.logging.path) {
                    av1anArguments.push('--log-file', options.Av1an.logging.path);
                    av1anPrintFriendlyArguments.push('--log-file', `"${options.Av1an.logging.path}"`);
                }
                if (options.Av1an.logging.level) {
                    av1anArguments.push('--log-level', options.Av1an.logging.level);
                    av1anPrintFriendlyArguments.push('--log-level', options.Av1an.logging.level);
                }
            }

            if (options.Av1an.temporary && Object.keys(options.Av1an.temporary).length) {
                if (options.Av1an.temporary.path) {
                    av1anArguments.push('--temp', options.Av1an.temporary.path);
                    av1anPrintFriendlyArguments.push('--temp', `"${options.Av1an.temporary.path}"`);
                }
                if (options.Av1an.temporary.keep) {
                    av1anArguments.push('--keep');
                    av1anPrintFriendlyArguments.push('--keep');
                }
                if (options.Av1an.temporary.resume) {
                    av1anArguments.push('--resume');
                    av1anPrintFriendlyArguments.push('--resume');
                }
            }

            if (options.Av1an.maxTries) {
                av1anArguments.push('--max-tries', `${options.Av1an.maxTries}`);
                av1anPrintFriendlyArguments.push('--max-tries', `${options.Av1an.maxTries}`);
            }
            if (options.Av1an.workers) {
                av1anArguments.push('-w', `${options.Av1an.workers}`);
                av1anPrintFriendlyArguments.push('-w', `${options.Av1an.workers}`);
            }
            if (options.Av1an.threadAffinity) {
                av1anArguments.push('--set-thread-affinity', `${options.Av1an.threadAffinity}`);
                av1anPrintFriendlyArguments.push('--set-thread-affinity', `${options.Av1an.threadAffinity}`);
            }
            if (options.Av1an.scaler) {
                av1anArguments.push('--scaler', options.Av1an.scaler);
                av1anPrintFriendlyArguments.push('--scaler', options.Av1an.scaler);
            }

            if (options.Av1an.scenes && Object.keys(options.Av1an.scenes).length) {
                if (options.Av1an.scenes.path) {
                    av1anArguments.push('--scenes', options.Av1an.scenes.path);
                    av1anPrintFriendlyArguments.push('--scenes', `"${options.Av1an.scenes.path}"`);
                }
                if (options.Av1an.scenes.splitMethod) {
                    av1anArguments.push('--split-method', options.Av1an.scenes.splitMethod);
                    av1anPrintFriendlyArguments.push('--split-method', options.Av1an.scenes.splitMethod);
                }
                if (options.Av1an.scenes.detectionMethod) {
                    av1anArguments.push('--sc-method', options.Av1an.scenes.detectionMethod);
                    av1anPrintFriendlyArguments.push('--sc-method', options.Av1an.scenes.detectionMethod);
                }
                if (options.Av1an.scenes.detectionDownscaleHeight) {
                    av1anArguments.push('--sc-downscale-height', `${options.Av1an.scenes.detectionDownscaleHeight}`);
                    av1anPrintFriendlyArguments.push('--sc-downscale-height', `${options.Av1an.scenes.detectionDownscaleHeight}`);
                }
                if (options.Av1an.scenes.detectionPixelFormat) {
                    av1anArguments.push('--sc-pix-format', options.Av1an.scenes.detectionPixelFormat);
                    av1anPrintFriendlyArguments.push('--sc-pix-format', options.Av1an.scenes.detectionPixelFormat);
                }
                if (options.Av1an.scenes.detectionOnly) {
                    av1anArguments.push('--sc-only');
                    av1anPrintFriendlyArguments.push('--sc-only');
                }
                if (options.Av1an.scenes.maximumSceneLengthFrames) {
                    av1anArguments.push('--extra-split', `${options.Av1an.scenes.maximumSceneLengthFrames}`);
                    av1anPrintFriendlyArguments.push('--extra-split', `${options.Av1an.scenes.maximumSceneLengthFrames}`);
                }
                if (options.Av1an.scenes.maximumSceneLengthSeconds) {
                    av1anArguments.push('--extra-split-sec', `${options.Av1an.scenes.maximumSceneLengthSeconds}`);
                    av1anPrintFriendlyArguments.push('--extra-split-sec', `${options.Av1an.scenes.maximumSceneLengthSeconds}`);
                }
                if (options.Av1an.scenes.minimumSceneLengthFrames) {
                    av1anArguments.push('--min-scene-len', `${options.Av1an.scenes.minimumSceneLengthFrames}`);
                    av1anPrintFriendlyArguments.push('--min-scene-len', `${options.Av1an.scenes.minimumSceneLengthFrames}`);
                }
                if (options.Av1an.scenes.forcedKeyframes) {
                    av1anArguments.push('--force-keyframes', options.Av1an.scenes.forcedKeyframes);
                    av1anPrintFriendlyArguments.push('--force-keyframes', options.Av1an.scenes.forcedKeyframes);
                }
                if (options.Av1an.scenes.ignoreFrameMismatch) {
                    av1anArguments.push('--ignore-frame-mismatch');
                    av1anPrintFriendlyArguments.push('--ignore-frame-mismatch');
                }
            }

            if (options.Av1an.encoding && Object.keys(options.Av1an.encoding).length) {
                const { encoder, noDefaults, force, passes, FFmpegAudioParameters, FFmpegFilterOptions, ...encoderParameters } = options.Av1an.encoding;

                if (encoder) {
                    av1anArguments.push('--encoder', encoder);
                    av1anPrintFriendlyArguments.push('--encoder', encoder);
                }
                if (noDefaults) {
                    av1anArguments.push('--no-defaults');
                    av1anPrintFriendlyArguments.push('--no-defaults');
                }
                if (force) {
                    av1anArguments.push('--force');
                    av1anPrintFriendlyArguments.push('--force');
                }
                if (passes) {
                    av1anArguments.push('--passes', `${passes}`);
                    av1anPrintFriendlyArguments.push('--passes', `${passes}`);
                }
                if (FFmpegAudioParameters) {
                    av1anArguments.push('--audio-params', FFmpegAudioParameters);
                    av1anPrintFriendlyArguments.push('--audio-params', `"${FFmpegAudioParameters}"`);
                }
                if (FFmpegFilterOptions) {
                    av1anArguments.push('--ffmpeg', FFmpegFilterOptions);
                    av1anPrintFriendlyArguments.push('--ffmpeg', `"${options.Av1an.encoding.FFmpegFilterOptions}"`);
                }

                if (options.Av1anCustom.encoding) {
                    Object.entries(options.Av1anCustom.encoding).forEach(([key, value]) => {
                        if (value.type === 'boolean') {
                            if (value.value) {
                                av1anArguments.push(`${value.flagPrefix}${key}`);
                                av1anPrintFriendlyArguments.push(`${value.flagPrefix}${key}`);
                            }
                        }
                    });
                }

                if (options.Av1anCustom.encoding) {
                    // Remove parameters in encoderParameters with the same name as in options.Av1anCustom.encoding
                    Object.entries(options.Av1anCustom.encoding).forEach(([name, _value]) => {
                        if (name in encoderParameters) {
                            delete (encoderParameters as Record<string, unknown>)[name];
                        }
                    });
                }

                let videoParams = '';

                switch (encoder) {
                    case Encoder.svt: {
                        videoParams = Object.entries(encoderParameters as unknown as SVTParameters).map(([key, value]) => `--${key} ${value}`).join(' ');
                        break;
                    }
                    case Encoder.rav1e: {
                        videoParams = Object.entries(encoderParameters as Rav1eParameters).map(([key, value]) => `--${key} ${value}`).join(' ');
                        break;
                    }
                    case Encoder.vpx: {
                        videoParams = Object.entries(encoderParameters as VpxParameters).map(([key, value]) => `--${key}=${value}`).join(' ');
                        break;
                    }
                    default:
                    case Encoder.aom: {
                        videoParams = Object.entries(encoderParameters as AOMParameters).map(([key, value]) => `--${key}=${value}`).join(' ');
                        break;
                    }
                }

                // Add custom encoder parameters
                Object.entries(options.Av1anCustom.encoding ?? {}).forEach(([key, value]) => {
                    if (value.type === 'boolean' && value.value) {
                        videoParams = `${videoParams} ${value.flagPrefix}${key}`;
                    } else {
                        videoParams = `${videoParams} ${value.flagPrefix}${key}${value.delimiter}${value.value}`;
                    }
                });

                av1anArguments.push('--video-params', videoParams);
                av1anPrintFriendlyArguments.push('--video-params', `"${videoParams}"`);

            }

            if (options.Av1an.chunking && Object.keys(options.Av1an.chunking).length) {
                if (options.Av1an.chunking.method) {
                    av1anArguments.push('--chunk-method', options.Av1an.chunking.method);
                    av1anPrintFriendlyArguments.push('--chunk-method', options.Av1an.chunking.method);
                }
                if (options.Av1an.chunking.order) {
                    av1anArguments.push('--chunk-order', options.Av1an.chunking.order);
                    av1anPrintFriendlyArguments.push('--chunk-order', options.Av1an.chunking.order);
                }
                if (options.Av1an.chunking.concatenater) {
                    av1anArguments.push('--concat', options.Av1an.chunking.concatenater);
                    av1anPrintFriendlyArguments.push('--concat', options.Av1an.chunking.concatenater);
                }
            }
            if (options.Av1an.pixelFormat) {
                av1anArguments.push('--pix-format', options.Av1an.pixelFormat);
                av1anPrintFriendlyArguments.push('--pix-format', options.Av1an.pixelFormat);
            }
            if (options.Av1an.photonNoise) {
                av1anArguments.push('--photon-noise', `${options.Av1an.photonNoise}`);
                av1anPrintFriendlyArguments.push('--photon-noise', `${options.Av1an.photonNoise}`);
            }
            if (options.Av1an.photonNoiseWidth) {
                av1anArguments.push('--photon-noise-width', `${options.Av1an.photonNoiseWidth}`);
                av1anPrintFriendlyArguments.push('--photon-noise-width', `${options.Av1an.photonNoiseWidth}`);
            }
            if (options.Av1an.photonNoiseHeight) {
                av1anArguments.push('--photon-noise-height', `${options.Av1an.photonNoiseHeight}`);
                av1anPrintFriendlyArguments.push('--photon-noise-height', `${options.Av1an.photonNoiseHeight}`);
            }
            if (options.Av1an.chromaNoise) {
                av1anArguments.push('--chroma-noise', `${options.Av1an.chromaNoise}`);
                av1anPrintFriendlyArguments.push('--chroma-noise', `${options.Av1an.chromaNoise}`);
            }

            if (options.Av1an.zones) {
                av1anArguments.push('--zones', options.Av1an.zones);
                av1anPrintFriendlyArguments.push('--zones', `"${options.Av1an.zones}"`);
            }

            if (options.Av1an.vmaf && Object.keys(options.Av1an.vmaf).length) {
                if (options.Av1an.vmaf.path) {
                    av1anArguments.push('--vmaf', options.Av1an.vmaf.path);
                    av1anPrintFriendlyArguments.push('--vmaf', `"${options.Av1an.vmaf.path}"`);
                }
                if (options.Av1an.vmaf.resolution) {
                    av1anArguments.push('--vmaf-res', options.Av1an.vmaf.resolution);
                    av1anPrintFriendlyArguments.push('--vmaf-res', `"${options.Av1an.vmaf.resolution}"`);
                }
                if (options.Av1an.vmaf.threads) {
                    av1anArguments.push('--vmaf-threads', `${options.Av1an.vmaf.threads}`);
                    av1anPrintFriendlyArguments.push('--vmaf-threads', `${options.Av1an.vmaf.threads}`);
                }
                if (options.Av1an.vmaf.filter) {
                    av1anArguments.push('--vmaf-filter', options.Av1an.vmaf.filter);
                    av1anPrintFriendlyArguments.push('--vmaf-filter', `"${options.Av1an.vmaf.filter}"`);
                }
            }

            if (options.Av1an.targetQuality && Object.keys(options.Av1an.targetQuality).length) {
                if (options.Av1an.targetQuality.target) {
                    av1anArguments.push('--target-quality', `${options.Av1an.targetQuality.target.minimum}-${options.Av1an.targetQuality.target.maximum}`);
                    av1anPrintFriendlyArguments.push('--target-quality', `${options.Av1an.targetQuality.target.minimum}-${options.Av1an.targetQuality.target.maximum}`);
                }
                if (options.Av1an.targetQuality.metric) {
                    av1anArguments.push('--target-metric', `${options.Av1an.targetQuality.metric}`);
                    av1anPrintFriendlyArguments.push('--target-metric', `${options.Av1an.targetQuality.metric}`);
                }

                if (options.Av1an.targetQuality.maximumProbes) {
                    av1anArguments.push('--probes', `${options.Av1an.targetQuality.maximumProbes}`);
                    av1anPrintFriendlyArguments.push('--probes', `${options.Av1an.targetQuality.maximumProbes}`);
                }
                if (options.Av1an.targetQuality.probingFrameRate) {
                    av1anArguments.push('--probing-rate', `${options.Av1an.targetQuality.probingFrameRate}`);
                    av1anPrintFriendlyArguments.push('--probing-rate', `${options.Av1an.targetQuality.probingFrameRate}`);
                }
                if (options.Av1an.targetQuality.probeVideoParameters) {
                    if (options.Av1an.targetQuality.probeVideoParameters.copy) {
                        av1anArguments.push('--probe-video-params', 'copy');
                        av1anPrintFriendlyArguments.push('--probe-video-params', 'copy');
                    } else {
                        let videoParams = '';

                        switch (options.Av1an.encoding?.encoder) {
                            case Encoder.svt: {
                                videoParams = Object.entries(options.Av1an.targetQuality.probeVideoParameters.parameters as unknown as SVTParameters).map(([key, value]) => `--${key} ${value}`).join(' ');
                                break;
                            }
                            case Encoder.rav1e: {
                                videoParams = Object.entries(options.Av1an.targetQuality.probeVideoParameters.parameters as Rav1eParameters).map(([key, value]) => `--${key} ${value}`).join(' ');
                                break;
                            }
                            case Encoder.vpx: {
                                videoParams = Object.entries(options.Av1an.targetQuality.probeVideoParameters.parameters as VpxParameters).map(([key, value]) => `--${key}=${value}`).join(' ');
                                break;
                            }
                            default:
                            case Encoder.aom: {
                                videoParams = Object.entries(options.Av1an.targetQuality.probeVideoParameters.parameters as AOMParameters).map(([key, value]) => `--${key}=${value}`).join(' ');
                                break;
                            }
                        }

                        av1anArguments.push('--probe-video-params', videoParams);
                        av1anPrintFriendlyArguments.push('--probe-video-params', `"${videoParams}"`);
                    }
                }
                if (options.Av1an.targetQuality.quantizerRange) {
                    av1anArguments.push('--qp-range', `${options.Av1an.targetQuality.quantizerRange.minimum}-${options.Av1an.targetQuality.quantizerRange.maximum}`);
                    av1anPrintFriendlyArguments.push('--qp-range', `${options.Av1an.targetQuality.quantizerRange.minimum}-${options.Av1an.targetQuality.quantizerRange.maximum}`);
                }
                if (options.Av1an.targetQuality.probeResolution) {
                    av1anArguments.push('--probe-res', `${options.Av1an.targetQuality.probeResolution}`);
                    av1anPrintFriendlyArguments.push('--probe-res', `${options.Av1an.targetQuality.probeResolution}`);
                }
                if (options.Av1an.targetQuality.probeStatistic) {
                    av1anArguments.push('--probing-stat', `${options.Av1an.targetQuality.probeStatistic.name}${options.Av1an.targetQuality.probeStatistic.value ? `=${options.Av1an.targetQuality.probeStatistic.value}` : ``}`);
                    av1anPrintFriendlyArguments.push('--probing-stat', `${options.Av1an.targetQuality.probeStatistic.name}${options.Av1an.targetQuality.probeStatistic.value ? `=${options.Av1an.targetQuality.probeStatistic.value}` : ``}`);
                }
                if (options.Av1an.targetQuality.interpolationMethod) {
                    av1anArguments.push('--interp-method', `${options.Av1an.targetQuality.interpolationMethod.pass4}-${options.Av1an.targetQuality.interpolationMethod.pass5}`);
                    av1anPrintFriendlyArguments.push('--interp-method', `${options.Av1an.targetQuality.interpolationMethod.pass4}-${options.Av1an.targetQuality.interpolationMethod.pass5}`);
                }
                if (options.Av1an.targetQuality.VMAFFeatures) {
                    const features = Array.from(options.Av1an.targetQuality.VMAFFeatures);
                    av1anArguments.push('--probing-vmaf-features', ...features);
                    av1anPrintFriendlyArguments.push('--probing-vmaf-features', ...features);
                }
            }
        }

        if (options.Av1anCustom) {
            const { encoding: _encoding, ...av1anCustom } = options.Av1anCustom;

            Object.entries(av1anCustom).forEach(([name, value]) => {
                if (value.type === 'boolean') {
                    av1anArguments.push(`${value.flagPrefix}${name}`);
                    av1anPrintFriendlyArguments.push(`${value.flagPrefix}${name}`);
                } else if (value.type === 'string') {
                    av1anArguments.push(`${value.flagPrefix}${name}`);
                    av1anPrintFriendlyArguments.push(`${value.flagPrefix}${name}`);
                    if ((value.value as string).length) {
                        av1anArguments.push(`${value.delimiter}${value.value}`);
                        av1anPrintFriendlyArguments.push(`${value.delimiter}"${value.value}"`);
                    }
                } else {
                    av1anArguments.push(`${value.flagPrefix}${name}`, `${value.delimiter}${value.value}`);
                    av1anPrintFriendlyArguments.push(`${value.flagPrefix}${name}`, `${value.delimiter}${value.value}`);
                }
            });
        }

        return {
            arguments: av1anArguments,
            printFriendlyArguments: av1anPrintFriendlyArguments,
        };
    }

    public static BuildEnvironmentPath(environment: DependencyPaths) {
        // Build Environment PATH
        const pathValues = process.env.PATH?.split(';') ?? [];
        // Modify PATH to add paths from PORTABLE
        if (process.platform === 'win32') {
            // vapoursynth
            if (environment.vapoursynth.type === DependencyType.Packaged && import.meta.resources.PORTABLE.VAPOURSYNTH_PATH) {
                pathValues.unshift(import.meta.resources.PORTABLE.VAPOURSYNTH_PATH);
                pathValues.unshift(path.resolve(import.meta.resources.PORTABLE.VAPOURSYNTH_PATH, 'Lib', 'site-packages'));    
            }
            // dgdecnv
            if (environment.dgdecnv.type === DependencyType.Packaged && import.meta.resources.PORTABLE.DGDECNV_PATH) {
                pathValues.unshift(import.meta.resources.PORTABLE.DGDECNV_PATH);
            } else if (environment.dgdecnv.type === DependencyType.Custom) {
                pathValues.unshift(environment.dgdecnv.path);
            }
            // av1an
            if (environment.av1an.type === DependencyType.Packaged && import.meta.resources.PORTABLE.AV1AN_PATH) {
                pathValues.unshift(path.dirname(import.meta.resources.PORTABLE.AV1AN_PATH));
            } else if (environment.av1an.type === DependencyType.Custom) {
                pathValues.unshift(path.dirname(environment.av1an.path));
            }
            // ffmpeg
            if (environment.ffmpeg.type === DependencyType.Packaged && import.meta.resources.PORTABLE.FFMPEG_PATH) {
                pathValues.unshift(import.meta.resources.PORTABLE.FFMPEG_PATH);
            } else if (environment.ffmpeg.type === DependencyType.Custom) {
                pathValues.unshift(environment.ffmpeg.path);
            }
            // mkvtoolnix
            if (environment.mkvtoolnix.type === DependencyType.Packaged && import.meta.resources.PORTABLE.MKVTOOLNIX_PATH) {
                pathValues.unshift(import.meta.resources.PORTABLE.MKVTOOLNIX_PATH);
            } else if (environment.mkvtoolnix.type === DependencyType.Custom) {
                pathValues.unshift(environment.mkvtoolnix.path);
            }
            // aom
            if (environment.aom.type === DependencyType.Packaged && import.meta.resources.PORTABLE.AOM_PATH) {
                pathValues.unshift(path.dirname(import.meta.resources.PORTABLE.AOM_PATH));
            } else if (environment.aom.type === DependencyType.Custom) {
                pathValues.unshift(path.dirname(environment.aom.path));
            }
            // svt
            if (environment.svt.type === DependencyType.Packaged && import.meta.resources.PORTABLE.SVT_PATH) {
                pathValues.unshift(path.dirname(import.meta.resources.PORTABLE.SVT_PATH));
            } else if (environment.svt.type === DependencyType.Custom) {
                pathValues.unshift(path.dirname(environment.svt.path));
            }
            // rav1e
            if (environment.rav1e.type === DependencyType.Packaged && import.meta.resources.PORTABLE.RAV1E_PATH) {
                pathValues.unshift(path.dirname(import.meta.resources.PORTABLE.RAV1E_PATH));
            } else if (environment.rav1e.type === DependencyType.Custom) {
                pathValues.unshift(path.dirname(environment.rav1e.path));
            }
            // vpx
            if (environment.vpx.type === DependencyType.Packaged && import.meta.resources.PORTABLE.VPX_PATH) {
                pathValues.unshift(path.dirname(import.meta.resources.PORTABLE.VPX_PATH));
            } else if (environment.vpx.type === DependencyType.Custom) {
                pathValues.unshift(path.dirname(environment.vpx.path));
            }
            // x264
            if (environment.x264.type === DependencyType.Packaged && import.meta.resources.PORTABLE.x264_PATH) {
                pathValues.unshift(path.dirname(import.meta.resources.PORTABLE.x264_PATH));
            } else if (environment.x264.type === DependencyType.Custom) {
                pathValues.unshift(path.dirname(environment.x264.path));
            }
            // x265
            if (environment.x265.type === DependencyType.Packaged && import.meta.resources.PORTABLE.x265_PATH) {
                pathValues.unshift(path.dirname(import.meta.resources.PORTABLE.x265_PATH));
            } else if (environment.x265.type === DependencyType.Custom) {
                pathValues.unshift(path.dirname(environment.x265.path));
            }

        }

        return pathValues.join(';');
    }

    public get command() {
        return `av1an ${Av1an.BuildArguments(this.options).printFriendlyArguments.join(' ')}`;
    }

    public get statusHistory() {
        return this.allStates;
    }

    public get status() {
        return this.allStates[this.allStates.length - 1];
    }

    public get frameCount() {
        return this.totalFrames;
    }

    public get framesCompleted() {
        return Object.values(this.doneJson?.done ?? {}).reduce((total, chunk) => total + chunk.frames, 0);
    }

    private get framesRecentlyCompleted() {
        return this.recentlyCompletedChunkIds.reduce((total, chunkId) => total + (this.doneJson?.done[chunkId]?.frames ?? 0), 0);
    }

    public get framesPerSecond() {
        // TODO: Change to use current 
        const now = new Date();
        const lastStartStatus = [...this.statusHistory].reverse().find(status => status.state === 'idle' || (status.state === 'encoding' && !status.progress?.framesCompleted));
        const secondsSinceLastStarted = (now.getTime() - (lastStartStatus?.time ?? now).getTime()) / 1000;

        return this.framesRecentlyCompleted / secondsSinceLastStarted;
    }

    private get doneJson() {
        if (this.options.Av1an.temporary?.path) {
            const doneJsonPath = path.join(this.options.Av1an.temporary.path, 'done.json');

            return parseDoneJsonFile(doneJsonPath);
        }
    }

    // private get chunksJson() {
    //     if (this.options?.temporary?.path) {
    //         const chunksJsonPath = path.join(this.options.temporary.path, 'chunks.json');

    //         return parseChunksJsonFile(chunksJsonPath);
    //     }
    // }

    // private get completedChunkIds() {
    //     return Object.keys(this.doneJson?.done ?? {});
    // }

    private get framerate() {
        // Get framerate from first chunk or assume 23.976
        return this.chunks[0].frame_rate ?? 23.976;
    }

    public get bitrate() {
        const { bytesCompleted, framesCompleted } = Object.values(this.doneJson?.done ?? {}).reduce((total, chunk) => ({ bytesCompleted: total.bytesCompleted + chunk.size_bytes, framesCompleted: total.framesCompleted + chunk.frames }), { bytesCompleted: 0, framesCompleted: 0 });
        const secondsCompleted = framesCompleted / this.framerate;

        return (bytesCompleted * 8) / secondsCompleted;
    }

    public get estimatedSizeInBytes() {
        return ((this.totalFrames / this.framerate) * this.bitrate) / 8;
    }

    public get estimatedSecondsRemaining() {
        const framesRemaining = this.totalFrames - this.framesCompleted;

        return framesRemaining / this.framesPerSecond;
    }

    private addStatus(status: Omit<Av1anStatus, 'time'>) {
        const newStatus: Av1anStatus = {
            time: new Date(),
            ...status,
        };
        this.allStates.push(newStatus);
        this.emit('status', newStatus);
    }

    public onStatus(callback: (status: Av1anStatus) => void) {
        this.on('status', callback);
    }

    public async start() {
        // Ensure temporary folder exists
        if (this.options.Av1an.temporary?.path && !fs.existsSync(this.options.Av1an.temporary.path)) {
            await fs.promises.mkdir(this.options.Av1an.temporary.path, { recursive: true });
        }
        // Ensure output folder exists
        if (!fs.existsSync(path.dirname(this.output))) {
            await fs.promises.mkdir(path.dirname(this.output), { recursive: true });
        }

        // Check if the scenes.json exists
        const scenesJSONExists = this.options.Av1an.scenes?.path && fs.existsSync(this.options.Av1an.scenes.path);

        if (!scenesJSONExists) {
            await this.sceneDetection();
            // If scene detection was cancelled, return
            if (this.status.state === 'cancelled') {
                return;
            }
        }

        return new Promise<void>((resolve, reject) => {
            this.childProcess = spawn('av1an', Av1an.BuildArguments(this.options).arguments, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, Path: Av1an.BuildEnvironmentPath(this.environment) }, cwd: path.resolve(this.options.Av1an.temporary.path, '../') });

            this.childProcess.on('close', (code) => {
                switch (code) {
                    case 0: {
                        // this.temporaryFolderWatcher?.close();
                        // Workaround: Watch temporary folder for 5 seconds before closing
                        setTimeout(() => {
                            this.temporaryFolderWatcher?.close();

                            // Add new status with the state 'done'
                            this.addStatus({
                                state: 'done',
                            });
    
                            return resolve();
                        }, 5000);
                        break;
                    }
                    case null: {
                        // // Add new status with the state 'canceled'
                        // this.addStatus({
                        //     state: 'canceled',
                        // });

                        this.temporaryFolderWatcher?.close();

                        return resolve();
                    }
                    default: {
                        this.temporaryFolderWatcher?.close();
                        if (this.status.state === 'cancelled') {
                            // Ignore this error if the process has been cancelled
                            console.log('Cancelled Av1an process exited with code', code);
                            return;
                        }

                        // Add new status with the state 'error'
                        const error = new Error(`Av1an exited with code ${code}`);
                        this.addStatus({
                            state: 'error',
                            error,
                        });
                        
                        return reject(error);
                    }
                }
            });

            this.childProcess.on('error', (error) => {
                if (this.status.state === 'cancelled') {
                    // Ignore this error if the process has been cancelled
                    console.log('Cancelled Av1an process received error:', error);
                    return;
                }

                // Add new status with the state 'error'
                this.addStatus({
                    state: 'error',
                    error,
                });

                this.temporaryFolderWatcher?.close();

                return reject(error);
            });

            this.childProcess.stderr.on('data', (data) => {
                console.log(`[Av1an STDERR]: ${data.toString()}`);
            });

            if (this.options.Av1an.temporary?.path) {
                const temporaryPath = this.options.Av1an.temporary.path;
                const doneJsonFilePath = path.resolve(temporaryPath, 'done.json');
                const chunksJsonFilePath = path.resolve(temporaryPath, 'chunks.json');
                const logFilePath = this.options.Av1an.logging?.path ?? path.resolve(temporaryPath, '../log.log');

                // Instantiate chunks.json and done.json in case temporary folder already exists (resuming a previous run)
                if (fs.existsSync(chunksJsonFilePath)) {
                    this.chunks = parseChunksJsonFile(chunksJsonFilePath);
                }
                if (fs.existsSync(doneJsonFilePath)) {
                    const { frames, done } = parseDoneJsonFile(doneJsonFilePath);
                    this.totalFrames = frames;
                    this.previouslyCompletedChunkIds = Object.keys(done);
                }
                if (fs.existsSync(logFilePath)) {
                    this.log = fs.readFileSync(logFilePath, 'utf-8');
                }

                // Watch the done.json file and check for new chunks
                this.temporaryFolderWatcher = new Watcher(temporaryPath, {  }, (targetEvent: string, targetPath: string) => {
                    if (targetEvent === 'change' && targetPath === doneJsonFilePath) {
                        try {
                            const { frames, done } = parseDoneJsonFile(doneJsonFilePath);
            
                            // Update totalFrames from initial value
                            if (frames > this.totalFrames) {
                                this.totalFrames = frames;
                            }

                            // filter out chunks in done.json that are already in completedChunks
                            const newChunks = Object.keys(done).filter(chunk => !this.recentlyCompletedChunkIds.concat(this.previouslyCompletedChunkIds).includes(chunk));
                            if (newChunks.length) {
                                // Newly completed chunks
                                this.recentlyCompletedChunkIds.push(...newChunks);
                                const now = new Date();
                                // Get the time in seconds since the last 'encoding' or 'idle' status
                                const lastRunningStatus = this.statusHistory.reverse().find(status => status.state === 'encoding');
                                const firstRunningStatus = this.statusHistory.find(status => status.state === 'encoding');
                                const lastIdleStatus = this.statusHistory.reverse().find(status => status.state === 'idle');
                                const previousChunkCompletedDate = (lastRunningStatus ?? lastIdleStatus)?.time ?? now;
            
                                const secondsSinceLastRunningStatus = (now.getTime() - previousChunkCompletedDate.getTime()) / 1000;
                                const secondsSinceStarted = (now.getTime() - (firstRunningStatus?.time ?? now).getTime()) / 1000;
            
                                const { framesCompleted, bytesCompleted } = newChunks.reduce((chunkTotal, chunkId) => {
                                    return {
                                        framesCompleted: chunkTotal.framesCompleted + done[chunkId].frames,
                                        bytesCompleted: chunkTotal.bytesCompleted + done[chunkId].size_bytes,
                                    };
                                }, { framesCompleted: 0, bytesCompleted: 0 });

                                const { totalFramesCompleted, totalBytesCompleted } = Object.values(done).reduce((total, chunk) => {
                                    return {
                                        totalFramesCompleted: total.totalFramesCompleted + chunk.frames,
                                        totalBytesCompleted: total.totalBytesCompleted + chunk.size_bytes,
                                    };
                                }, { totalFramesCompleted: 0, totalBytesCompleted: 0 });

                                this.addStatus({
                                    state: 'encoding',
                                    progress: {
                                        chunk: {
                                            id: newChunks[0],
                                            framesCompleted,
                                            bytesCompleted,
                                            bitrate: bytesCompleted * 8 / (framesCompleted / this.framerate),
                                            framesPerSecond: framesCompleted / secondsSinceLastRunningStatus,
                                        },
                                        framesCompleted: totalFramesCompleted,
                                        bytesCompleted: totalBytesCompleted,
                                        bitrate: totalBytesCompleted * 8 / (totalFramesCompleted / this.framerate),
                                        framesPerSecond: totalFramesCompleted / secondsSinceStarted,
                                        estimatedSeconds: this.estimatedSecondsRemaining,
                                        estimatedSizeInBytes: this.estimatedSizeInBytes,
                                    },
                                });
                            }
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        } catch (_error) {
                            // Av1an writes to done.json multiple times with invalid json - ignore these instances
                            return;
                        }
                    } else if (targetEvent === 'add' && targetPath === chunksJsonFilePath) {
                        // Instantiate and parse newly created chunks.json
                        this.chunks = parseChunksJsonFile(chunksJsonFilePath);
                    } else if (targetEvent === 'change' && targetPath === logFilePath) {
                        this.log = fs.readFileSync(logFilePath, 'utf-8');
                    }
                });
            }
    
            // Add new 'encoding' status
            this.addStatus({
                state: 'encoding',
            });
        });
    }

    public async pause() {
        if (!this.childProcess) {
            console.warn('Av1an has not been started');
            return;
        }
        
        this.childProcess.kill('SIGSTOP');
        
        // Add new status with the state 'paused'
        this.addStatus({
            state: 'paused',
        });
    }

    public async resume() {
        if (!this.childProcess) {
            console.warn('Av1an has not been started');
            if (this.status.state === 'idle') {
                return this.start();
            }
            return;
        }
        if (this.childProcess.exitCode) {
            console.warn('Av1an has been terminated');
            return;
        }
        if (this.childProcess.killed && this.status.state === 'paused') {
            // Resume the process
            this.childProcess.kill('SIGCONT');
            this.addStatus({
                state: 'encoding',
            });
            return;
        }
    }

    public async cancel() {
        if (!this.childProcess) {
            console.warn('Av1an has not been started');
            return;
        }
        if (this.childProcess.exitCode) {
            console.warn('Av1an has been terminated');
            return;
        }
        if (['scene-detection', 'encoding', 'paused'].includes(this.status.state)) {
            // Kill the process
            // this.childProcess.kill('SIGKILL');
            if (this.childProcess.pid) {
                const terminate = (await import('terminate')).default;
                await terminate(this.childProcess.pid);
            }
            this.addStatus({
                state: 'cancelled',
            });
            return;
        }
    }

    public async sceneDetection() {
        return new Promise<void>((resolve, reject) => {
            const sceneDetectionOptions: Av1anOptions = {
                Av1anCustom: this.options.Av1anCustom,
                Av1an: {
                    ...this.options.Av1an,
                    scenes: {
                        ...this.options.Av1an.scenes,
                        detectionOnly: true,
                    },
                },
            };

            this.childProcess = spawn('av1an', Av1an.BuildArguments(sceneDetectionOptions).arguments, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, Path: Av1an.BuildEnvironmentPath(this.environment) } });
            // spawn('av1an', Av1an.BuildArguments(this.input, this.output, sceneDetectionOptions).arguments, { stdio: ['pipe', 'inherit', 'inherit'], env: { ...process.env, Path: Av1an.BuildEnvironmentPath(this.environment) } });

            this.childProcess.on('close', (code) => {
                switch (code) {
                    case 0: {
                        // Add new status with the state 'idle'
                        this.addStatus({
                            state: 'idle',
                        });

                        return resolve();
                    }
                    // case null: {
                    //     // // Add new status with the state 'canceled'
                    //     // this.addStatus({
                    //     //     state: 'canceled',
                    //     // });

                    //     return resolve();
                    // }
                    default: {
                        // Ignore errror if process is cancelled
                        if (this.status.state === 'cancelled') {
                            return resolve();
                        }
                        // Add new status with the state 'error'
                        const error = new Error(`Av1an exited with code ${code}`);
                        this.addStatus({
                            state: 'error',
                            error,
                        });

                        return reject(error);
                    }
                }
            });
    
            this.childProcess.on('error', (error) => {
                // Add new status with the state 'error'
                this.addStatus({
                    state: 'error',
                    error,
                });

                return reject(error);
            });
    
            this.childProcess.stderr.on('data', (data) => {
                console.log(`[Av1an STDERR]: ${data.toString()}`);
            });

            // Add new status with the state 'running'
            this.addStatus({
                state: 'scene-detection',
            });
        });
    }
}