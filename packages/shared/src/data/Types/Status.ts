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