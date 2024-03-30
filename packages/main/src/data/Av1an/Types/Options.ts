import type { Parameters as SVTParameters } from './SVT.js';
import type { Parameters as AOMParameters } from './AOM.js';
import type { Parameters as Rav1eParameters } from './Rav1e.js';

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
    encoder: Encoder;
    force?: boolean;
    passes?: number;
    FFmpegAudioParameters?: string | '-c:a copy';
    FFmpegFilterOptions?: string;
}

export type SVTEncoding = BaseEncoding & Partial<SVTParameters>;
export type AOMEncoding = BaseEncoding & Partial<AOMParameters>;
export type Rav1eEncoding = BaseEncoding & Partial<Rav1eParameters>;

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
    overwriteOutput?: OutputOverwrite;
    help?: boolean;
    version?: boolean;
    verbosity?: Verbosity;
    maxTries?: number;
    workers?: number;
    threadAffinity?: number;
    scaler?: string;
    temporary?: {
        path?: string;
        keep?: boolean;
        resume?: boolean;
    };
    logging?: {
        path?: string;
        level?: LogLevel;
    };
    scenes?: {
        path?: string;
        splitMethod?: SplitMethod;
        detectionMethod?: SceneDetectionMethod;
        detectionDownscaleHeight?: number;
        detectionPixelFormat?: string;
        detectionOnly?: boolean;
        maximumSceneLength?: { frames: number } | { seconds: number };
        minimumSceneLengthFrames?: number;
        ignoreFrameMismatch?: boolean;
    };
    encoding?: SVTEncoding | AOMEncoding | Rav1eEncoding;
    // encoding?: SVTEncoding | AOMEncoding | Rav1eEncoding | x264Encoding | x265Encoding;
    chunking?: {
        method?: ChunkMethod;
        order?: ChunkOrder;
        concatenater?: Concatenator;
    };
    photonNoise?: number;
    pixelFormat?: FFmpegPixelFormat;
    zones?: string;
    vmaf?: {
        path?: string;
        resolution?: string;
        threads?: number;
        filter?: string;
    };
    targetQuality?: {
        targetVMAFScore: number;
        maximumProbes?: number;
        probingFrameRate?: number;
        probeSlow?: boolean;
        minimumQ?: number;
        maximumQ?: number;
    };
}
