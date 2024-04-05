import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import Watcher from 'watcher';
// import * as url from 'url';
import type { ChildProcessByStdio} from 'child_process';
import { spawn } from 'child_process';
import type { Readable, Writable } from 'stream';
import type { Options} from '../../data/Av1an/Types/Options.js';
import { Encoder, OutputOverwrite, Verbosity } from '../../data/Av1an/Types/Options.js';
import { parseDoneJsonFile } from '../../data/Av1an/Types/Done.js';
import type { Parameters as SVTParameters } from '../../data/Av1an/Types/SVT.js';
import type { Chunk } from '../../data/Av1an/Types/Chunks.js';
import { parseChunksJsonFile } from '../../data/Av1an/Types/Chunks.js';
import { type Task } from '../../data/Configuration/Projects';
// import { Parameters as AOMParameters } from './Types/AOM.js';
// import { Parameters as Rav1eParameters } from './Types/Rav1e.js';
// import commandExists from "command-exists";

export interface Av1anStatus {
    time: Date;
    state: 'idle' | 'paused' | 'scene-detection' | 'encoding' | 'done' | 'cancelled' | 'error';
    progress?: {
        chunk: {
            id: string;
            framesCompleted: number;
            bytesCompleted: number;
            framesPerSecond: number;
            bitrate: number;
        };
        framesCompleted: number;
        bytesCompleted: number;
        framesPerSecond: number;
        bitrate: number;
        estimatedSeconds: number;
        estimatedSizeInBytes: number;
    }
    error?: unknown;
}

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

    public addAv1an(id: Task['id'], input: Task['inputFileName'], output: Task['outputFileName'], options: Task['item'], history: Task['statusHistory']) {
        const av1an = new Av1an(input, output, options, history);
        this.av1anMap.set(id, av1an);
        return av1an;
    }
}

export class Av1an extends EventEmitter {
    private childProcess?: ChildProcessByStdio<Writable, Readable, Readable>;
    // private childProcess?: ChildProcessByStdio<Writable, null, null>;
    // List of all Av1an states
    private allStates: Av1anStatus[] = [{ time: new Date(), state: 'idle' }];
    private temporaryFolderWatcher?: Watcher;
    private totalFrames = 0;
    private chunks: Chunk[] = [];
    private previouslyCompletedChunkIds: string[] = [];
    private recentlyCompletedChunkIds: string[] = [];

    constructor(public input: string, public output: string, public options?: Options, private readonly previousStatusHistory: Av1anStatus[] = []) {
        super();
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

    public static BuildArguments(input: string, output: string, options?: Options) {
        const av1anArguments = [
            '-i', input,
            '-o', output,
        ];
        const av1anPrintFriendlyArguments = [
            '-i', `"${input}"`,
            '-o', `"${output}"`,
        ];

        if (options) {
            if (options.overwriteOutput) {
                const arg = options.overwriteOutput === OutputOverwrite.yes ? '-y' : '-n';
                av1anArguments.push(arg);
                av1anPrintFriendlyArguments.push(arg);
            } else {
                // If not specified, overwrite by default to avoid av1an asking for input in shell
                av1anArguments.push('-y');
                av1anPrintFriendlyArguments.push('-y');
            }
            if (options.verbosity) {
                const arg = options.verbosity === Verbosity.verbose ? '--verbose' : '--quiet';
                av1anArguments.push(arg);
                av1anPrintFriendlyArguments.push(arg);
            }
            if (options.help) {
                av1anArguments.push('--help');
                av1anPrintFriendlyArguments.push('--help');
            }
            if (options.version) {
                av1anArguments.push('--version');
                av1anPrintFriendlyArguments.push('--version');
            }
            if (options.logging && Object.keys(options.logging).length) {
                if (options.logging.path) {
                    av1anArguments.push('--log-file', options.logging.path);
                    av1anPrintFriendlyArguments.push('--log-file', `"${options.logging.path}"`);
                }
                if (options.logging.level) {
                    av1anArguments.push('--log-level', options.logging.level);
                    av1anPrintFriendlyArguments.push('--log-level', options.logging.level);
                }
            }

            if (options.temporary && Object.keys(options.temporary).length) {
                if (options.temporary.path) {
                    av1anArguments.push('--temp', options.temporary.path);
                    av1anPrintFriendlyArguments.push('--temp', `"${options.temporary.path}"`);
                }
                if (options.temporary.keep) {
                    av1anArguments.push('--keep');
                    av1anPrintFriendlyArguments.push('--keep');
                }
                if (options.temporary.resume) {
                    av1anArguments.push('--resume');
                    av1anPrintFriendlyArguments.push('--resume');
                }
            }

            if (options.maxTries) {
                av1anArguments.push('--max-tries', `${options.maxTries}`);
                av1anPrintFriendlyArguments.push('--max-tries', `${options.maxTries}`);
            }
            if (options.workers) {
                av1anArguments.push('-w', `${options.workers}`);
                av1anPrintFriendlyArguments.push('-w', `${options.workers}`);
            }
            if (options.threadAffinity) {
                av1anArguments.push('--set-thread-affinity', `${options.threadAffinity}`);
                av1anPrintFriendlyArguments.push('--set-thread-affinity', `${options.threadAffinity}`);
            }
            if (options.scaler) {
                av1anArguments.push('--scaler', options.scaler);
                av1anPrintFriendlyArguments.push('--scaler', options.scaler);
            }

            if (options.scenes && Object.keys(options.scenes).length) {
                if (options.scenes.path) {
                    av1anArguments.push('--scenes', options.scenes.path);
                    av1anPrintFriendlyArguments.push('--scenes', `"${options.scenes.path}"`);
                }
                if (options.scenes.splitMethod) {
                    av1anArguments.push('--split-method', options.scenes.splitMethod);
                    av1anPrintFriendlyArguments.push('--split-method', options.scenes.splitMethod);
                }
                if (options.scenes.detectionMethod) {
                    av1anArguments.push('--sc-method', options.scenes.detectionMethod);
                    av1anPrintFriendlyArguments.push('--sc-method', options.scenes.detectionMethod);
                }
                if (options.scenes.detectionDownscaleHeight) {
                    av1anArguments.push('--sc-downscale-height', `${options.scenes.detectionDownscaleHeight}`);
                    av1anPrintFriendlyArguments.push('--sc-downscale-height', `${options.scenes.detectionDownscaleHeight}`);
                }
                if (options.scenes.detectionPixelFormat) {
                    av1anArguments.push('--sc-pix-format', options.scenes.detectionPixelFormat);
                    av1anPrintFriendlyArguments.push('--sc-pix-format', options.scenes.detectionPixelFormat);
                }
                if (options.scenes.detectionOnly) {
                    av1anArguments.push('--sc-only');
                    av1anPrintFriendlyArguments.push('--sc-only');
                }
                if (options.scenes.maximumSceneLength) {
                    if ('frames' in options.scenes.maximumSceneLength) {
                        av1anArguments.push('--extra-split', `${options.scenes.maximumSceneLength.frames}`);
                        av1anPrintFriendlyArguments.push('--extra-split', `${options.scenes.maximumSceneLength.frames}`);
                    }
                    if ('seconds' in options.scenes.maximumSceneLength) {
                        av1anArguments.push('--extra-split-sec', `${options.scenes.maximumSceneLength['seconds']}`);
                        av1anPrintFriendlyArguments.push('--extra-split-sec', `${options.scenes.maximumSceneLength['seconds']}`);
                    }
                }
                if (options.scenes.minimumSceneLengthFrames) {
                    av1anArguments.push('--min-scene-len', `${options.scenes.minimumSceneLengthFrames}`);
                    av1anPrintFriendlyArguments.push('--min-scene-len', `${options.scenes.minimumSceneLengthFrames}`);
                }
                if (options.scenes.ignoreFrameMismatch) {
                    av1anArguments.push('--ignore-frame-mismatch');
                    av1anPrintFriendlyArguments.push('--ignore-frame-mismatch');
                }
            }

            if (options.encoding && Object.keys(options.encoding).length) {
                const { encoder, force, passes, FFmpegAudioParameters, FFmpegFilterOptions, ...encoderParameters } = options.encoding;
                av1anArguments.push('--encoder', encoder);
                av1anPrintFriendlyArguments.push('--encoder', encoder);

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
                    av1anPrintFriendlyArguments.push('--ffmpeg', `"${options.encoding.FFmpegFilterOptions}"`);
                }

                switch (encoder) {
                    case Encoder.svt: {
                        const svtParameters = Object.entries(encoderParameters as SVTParameters).map(([key, value]) => `--${key} ${value}`).join(' ');
                        av1anArguments.push('--video-params', svtParameters);
                        av1anPrintFriendlyArguments.push('--video-params', `"${svtParameters}"`);
                        break;
                    }
                    case Encoder.aom:
                        break;
                    case Encoder.rav1e:
                        break;
                    default:
                        break;
                }
            }

            if (options.chunking && Object.keys(options.chunking).length) {
                if (options.chunking.method) {
                    av1anArguments.push('--chunk-method', options.chunking.method);
                    av1anPrintFriendlyArguments.push('--chunk-method', options.chunking.method);
                }
                if (options.chunking.order) {
                    av1anArguments.push('--chunk-order', options.chunking.order);
                    av1anPrintFriendlyArguments.push('--chunk-order', options.chunking.order);
                }
                if (options.chunking.concatenater) {
                    av1anArguments.push('--concat', options.chunking.concatenater);
                    av1anPrintFriendlyArguments.push('--concat', options.chunking.concatenater);
                }
            }
            if (options.pixelFormat) {
                av1anArguments.push('--pix-format', options.pixelFormat);
                av1anPrintFriendlyArguments.push('--pix-format', options.pixelFormat);
            }
            if (options.photonNoise) {
                av1anArguments.push('--photon-noise', `${options.photonNoise}`);
                av1anPrintFriendlyArguments.push('--photon-noise', `${options.photonNoise}`);
            }

            if (options.zones) {
                av1anArguments.push('--zones', options.zones);
                av1anPrintFriendlyArguments.push('--zones', `"${options.zones}"`);
            }

            if (options.vmaf && Object.keys(options.vmaf).length) {
                if (options.vmaf.path) {
                    av1anArguments.push('--vmaf', options.vmaf.path);
                    av1anPrintFriendlyArguments.push('--vmaf', `"${options.vmaf.path}"`);
                }
                if (options.vmaf.resolution) {
                    av1anArguments.push('--vmaf-res', options.vmaf.resolution);
                    av1anPrintFriendlyArguments.push('--vmaf-res', `"${options.vmaf.resolution}"`);
                }
                if (options.vmaf.threads) {
                    av1anArguments.push('--vmaf-threads', `${options.vmaf.threads}`);
                    av1anPrintFriendlyArguments.push('--vmaf-threads', `${options.vmaf.threads}`);
                }
                if (options.vmaf.filter) {
                    av1anArguments.push('--vmaf-filter', options.vmaf.filter);
                    av1anPrintFriendlyArguments.push('--vmaf-filter', `"${options.vmaf.filter}"`);
                }
            }

            if (options.targetQuality && Object.keys(options.targetQuality).length) {
                av1anArguments.push('--target-quality', `${options.targetQuality.targetVMAFScore}`);
                av1anPrintFriendlyArguments.push('--target-quality', `${options.targetQuality.targetVMAFScore}`);

                if (options.targetQuality.maximumProbes) {
                    av1anArguments.push('--probes', `${options.targetQuality.maximumProbes}`);
                    av1anPrintFriendlyArguments.push('--probes', `${options.targetQuality.maximumProbes}`);
                }
                if (options.targetQuality.probingFrameRate) {
                    av1anArguments.push('--probing-rate', `${options.targetQuality.probingFrameRate}`);
                    av1anPrintFriendlyArguments.push('--probing-rate', `${options.targetQuality.probingFrameRate}`);
                }
                if (options.targetQuality.probeSlow) {
                    av1anArguments.push('--probe-slow');
                    av1anPrintFriendlyArguments.push('--probe-slow');
                }
                if (options.targetQuality.minimumQ) {
                    av1anArguments.push('--min-q', `${options.targetQuality.minimumQ}`);
                    av1anPrintFriendlyArguments.push('--min-q', `${options.targetQuality.minimumQ}`);
                }
                if (options.targetQuality.maximumQ) {
                    av1anArguments.push('--max-q', `${options.targetQuality.maximumQ}`);
                    av1anPrintFriendlyArguments.push('--max-q', `${options.targetQuality.maximumQ}`);
                }
            }
        }

        return {
            arguments: av1anArguments,
            printFriendlyArguments: av1anPrintFriendlyArguments,
        };
    }

    public get command() {
        return `av1an ${Av1an.BuildArguments(this.input, this.output, this.options).printFriendlyArguments.join(' ')}`;
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
        if (this.options?.temporary?.path) {
            const doneJsonPath = path.join(this.options.temporary.path, 'done.json');

            return parseDoneJsonFile(doneJsonPath);
        }
    }

    // private get chunksJson() {
    //     if (this.options?.temporary?.path) {
    //         const chunksJsonPath = path.join(this.options.temporary.path, 'chunks.json');

    //         return parseChunksJsonFile(chunksJsonPath);
    //     }
    // }

    private get completedChunkIds() {
        return Object.keys(this.doneJson?.done ?? {});
    }

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
        // Check if the scenes.json exists
        const scenesJSONExists = this.options?.scenes?.path && fs.existsSync(this.options.scenes.path);

        if (!scenesJSONExists) {
            await this.sceneDetection();
        }

        return new Promise<void>((resolve, reject) => {
            this.childProcess = spawn('av1an', Av1an.BuildArguments(this.input, this.output, this.options).arguments, { stdio: ['pipe', 'pipe', 'pipe'] });

            this.childProcess.on('close', (code) => {
                switch (code) {
                    case 0: {
                        // Add new status with the state 'done'
                        this.addStatus({
                            state: 'done',
                        });
        
                        this.temporaryFolderWatcher?.close();
        
                        return resolve();
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
                        // Add new status with the state 'error'
                        const error = new Error(`Av1an exited with code ${code}`);
                        this.addStatus({
                            state: 'error',
                            error,
                        });
        
                        this.temporaryFolderWatcher?.close();
        
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

                this.temporaryFolderWatcher?.close();

                return reject(error);
            });

            this.childProcess.stderr.on('data', (data) => {
                console.log(`[Av1an STDERR]: ${data.toString()}`);
            });

            if (this.options?.temporary?.path) {
                const temporaryPath = this.options.temporary.path;
                const doneJsonFilePath = path.resolve(temporaryPath, 'done.json');
                const chunksJsonFilePath = path.resolve(temporaryPath, 'chunks.json');

                // Instantiate chunks.json and done.json in case temporary folder already exists (resuming a previous run)
                if (fs.existsSync(chunksJsonFilePath)) {
                    this.chunks = parseChunksJsonFile(chunksJsonFilePath);
                }
                if (fs.existsSync(doneJsonFilePath)) {
                    const { frames, done } = parseDoneJsonFile(doneJsonFilePath);
                    this.totalFrames = frames;
                    this.previouslyCompletedChunkIds = Object.keys(done);
                }

                // Watch the done.json file and check for new chunks
                this.temporaryFolderWatcher = new Watcher(temporaryPath, {  }, (targetEvent, targetPath) => {
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
                        } catch (error) {
                            // Av1an writes to done.json multiple times with invalid json - ignore these instances
                            return;
                        }
                    } else if (targetEvent === 'add' && targetPath === chunksJsonFilePath) {
                        // Instantiate and parse newly created chunks.json
                        this.chunks = parseChunksJsonFile(chunksJsonFilePath);
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
            this.childProcess.kill('SIGKILL');
            this.addStatus({
                state: 'cancelled',
            });
            return;
        }
    }

    public async sceneDetection() {
        return new Promise<void>((resolve, reject) => {
            const sceneDetectionOptions: Options = {
                ...this.options,
                scenes: {
                    ...this.options?.scenes,
                    detectionOnly: true,
                },
            };

            console.log(`av1an ${Av1an.BuildArguments(this.input, this.output, sceneDetectionOptions).printFriendlyArguments.join(' ')}`);
            this.childProcess = spawn('av1an', Av1an.BuildArguments(this.input, this.output, sceneDetectionOptions).arguments, { stdio: ['pipe', 'pipe', 'pipe'] });
            // this.childProcess = spawn('av1an', this.buildArguments().arguments, { stdio: ['pipe', 'inherit', 'inherit'] });

            this.childProcess.on('close', (code) => {
                if (code === 0) {
                    // Add new status with the state 'idle'
                    this.addStatus({
                        state: 'idle',
                    });

                    return resolve();
                } else {
                    // Add new status with the state 'error'
                    const error = new Error(`Av1an exited with code ${code}`);
                    this.addStatus({
                        state: 'error',
                        error,
                    });

                    return reject(error);
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