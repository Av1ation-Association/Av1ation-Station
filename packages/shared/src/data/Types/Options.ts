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

export function LogLevelToString(logLevel: LogLevel): string {
    switch (logLevel) {
        case LogLevel.error:
            return 'Error';
        case LogLevel.warning:
            return 'Warning';
        case LogLevel.info:
            return 'Info';
        default:
        case LogLevel.debug:
            return 'Debug';
        case LogLevel.trace:
            return 'Trace';
    }
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

export function EncodertoString(encoder: Encoder): string {
    switch (encoder) {
        default:
        case Encoder.aom:
            return 'Alliance for Open Media AV1 (aom)';
        case Encoder.rav1e:
            return 'Rust AV1 Encoder (rav1e)-av1';
        case Encoder.svt:
            return 'Scalable Video Technology (svt-av1)';
        case Encoder.vpx:
            return 'Alliance for Open Media VP8/VP9 (vpx)';
        case Encoder.x264:
            return 'Advanced Video Coding (x264)';
        case Encoder.x265:
            return 'High Efficiency Video Coding (x265)';
    }
}

export interface BaseEncoding {
    encoder?: Encoder | null;
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

export function ChunkMethodtoString(chunkMethod: ChunkMethod): string {
    switch (chunkMethod) {
        case ChunkMethod.segment:
            return 'Segment';
        case ChunkMethod.select:
            return 'Select';
        case ChunkMethod.ffms2:
            return 'FFMS2';
        default:
        case ChunkMethod.lsmash:
            return 'L-SmashWorks';
        case ChunkMethod.hybrid:
            return 'Hybrid';
        case ChunkMethod.dgdecnv:
            return 'DGDecNV';
        case ChunkMethod.bestsource:
            return 'BestSource';
    }
}

export enum ChunkOrder {
    longToShort = 'long-to-short',
    shortToLong = 'short-to-long',
    sequential = 'sequential',
    random = 'random',
}

export function ChunkOrdertoString(chunkOrder: ChunkOrder): string {
    switch (chunkOrder) {
        default:
        case ChunkOrder.longToShort:
            return 'Long to Short';
        case ChunkOrder.shortToLong:
            return 'Short to Long';
        case ChunkOrder.sequential:
            return 'Sequential';
        case ChunkOrder.random:
            return 'Random';
    }
}

export enum Concatenator {
    ffmpeg = 'ffmpeg',
    mkvmerge = 'mkvmerge',
    ivf = 'ivf',
}

export function ConcatenatortoString(concatenator: Concatenator): string {
    switch (concatenator) {
        default:
        case Concatenator.ffmpeg:
            return 'FFmpeg';
        case Concatenator.mkvmerge:
            return 'MKVMerge';
        case Concatenator.ivf:
            return 'IVF';
    }
}

export enum FFmpegPixelFormat {
    yuv420p10le = 'yuv420p10le',
}

export interface Options<T extends Encoder = Encoder.aom> {
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
    // encoding?: SVTEncoding | AOMEncoding | Rav1eEncoding | VpxEncoding | x264Encoding | x265Encoding;
    encoding?: T extends Encoder.aom ? AOMEncoding
    : T extends Encoder.svt ? SVTEncoding
    : T extends Encoder.rav1e ? Rav1eEncoding
    : T extends Encoder.vpx ? VpxEncoding
    : AOMEncoding;
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
        targetVMAFScore?: number | null;
        maximumProbes?: number | null;
        probingFrameRate?: number | null;
        probeSlow?: boolean | null;
        minimumQ?: number | null;
        maximumQ?: number | null;
    };
}
