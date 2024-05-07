import type { Parameters as SVTParameters } from './SVT.js';
import type { Parameters as AOMParameters } from './AOM.js';
import type { Parameters as Rav1eParameters } from './Rav1e.js';
import type { Parameters as VpxParameters } from './Vpx.js';

export enum OutputOverwrite {
    yes = 'yes',
    no = 'no',
}

export enum Verbosity {
    quiet = 'quiet',
    verbose = 'verbose',
}

export enum LogLevel {
    error = 'error',
    warning = 'warning',
    info = 'info',
    debug = 'debug',
    trace = 'trace',
}

export enum SplitMethod {
    avSceneChange = 'av-scenechange',
    none = 'none',
}

export enum SceneDetectionMethod {
    standard = 'standard',
    fast = 'fast',
}

export enum Encoder {
    aom = 'aom',
    rav1e = 'rav1e',
    vpx = 'vpx',
    svt = 'svt-av1',
    x264 = 'x264',
    x265 = 'x265',
}

export interface BaseEncoding {
    encoder: Encoder | null;
    force?: boolean | null;
    passes?: number | null;
    FFmpegAudioParameters?: string | '-c:a copy' | null;
    FFmpegFilterOptions?: string | null;
}

type PartialNullable<T> = { [K in keyof T]?: T[K] | null };

export type SVTEncoding = BaseEncoding & PartialNullable<SVTParameters>;
export type AOMEncoding = BaseEncoding & PartialNullable<AOMParameters>;
export type Rav1eEncoding = BaseEncoding & PartialNullable<Rav1eParameters>;
export type VpxEncoding = BaseEncoding & PartialNullable<VpxParameters>;

export enum ChunkMethod {
    segment = 'segment',
    select = 'select',
    ffms2 = 'ffms2',
    lsmash = 'lsmash',
    hybrid = 'hybrid',
    dgdecnv = 'dgdecnv',
    bestsource = 'bestsource',
}

export enum ChunkOrder {
    longToShort = 'long-to-short',
    shortToLong = 'short-to-long',
    sequential = 'sequential',
    random = 'random',
}

export enum Concatenator {
    ffmpeg = 'ffmpeg',
    mkvmerge = 'mkvmerge',
    ivf = 'ivf',
}

export enum FFmpegPixelFormat {
    yuv420p10le = 'yuv420p10le',
}

export interface Options {
    overwriteOutput?: OutputOverwrite | null;
    help?: boolean | null;
    version?: boolean | null;
    verbosity?: Verbosity | null;
    maxTries?: number | null;
    workers?: number | null;
    threadAffinity?: number | null;
    scaler?: string | null;
    temporary?: {
        path?: string;
        keep?: boolean;
        resume?: boolean;
    };
    logging?: {
        path?: string | null;
        level?: LogLevel | null;
    };
    scenes?: {
        path?: string | null;
        splitMethod?: SplitMethod | null;
        detectionMethod?: SceneDetectionMethod | null;
        detectionDownscaleHeight?: number | null;
        detectionPixelFormat?: string | null;
        detectionOnly?: boolean | null;
        // maximumSceneLength?: { frames: number } | { seconds: number };
        maximumSceneLengthFrames?: number | null;
        maximumSceneLengthSeconds?: number | null;
        minimumSceneLengthFrames?: number | null;
        ignoreFrameMismatch?: boolean | null;
    };
    encoding?: SVTEncoding | AOMEncoding | Rav1eEncoding | VpxEncoding;
    // encoding?: SVTEncoding | AOMEncoding | Rav1eEncoding | x264Encoding | x265Encoding;
    chunking?: {
        method?: ChunkMethod | null;
        order?: ChunkOrder | null;
        concatenater?: Concatenator | null;
    };
    photonNoise?: number | null;
    pixelFormat?: FFmpegPixelFormat | null;
    zones?: string | null;
    vmaf?: {
        path?: string | null;
        resolution?: string | null;
        threads?: number | null;
        filter?: string | null;
    };
    targetQuality?: {
        targetVMAFScore: number | null;
        maximumProbes?: number | null;
        probingFrameRate?: number | null;
        probeSlow?: boolean | null;
        minimumQ?: number | null;
        maximumQ?: number | null;
    };
}
