import * as fs from 'fs';
import type { ChunkMethod } from './Options.js';

type Input = {
    VapourSynth: {
        path: string;
        vspipe_args: string[];
        script_text: string;
        is_proxy: boolean;
    };
} | {
    Video: {
        path: string;
        temp: string;
        chunk_method: ChunkMethod;
        is_proxy: boolean;
    }
};
export interface Chunk {
    temp: string;
    index: number;
    input: Input;
    proxy?: Input; 
    source_cmd: {
        Windows: number[];
    }[];
    proxy_cmd?: {
        Windows: number[];
    }[];
    output_ext: string;
    start_frame: number;
    end_frame: number;
    frame_rate: number;
    passes: number;
    video_params: string[];
    encoder: string;
    noise_size: [number, number] | [null, null];
    per_shot_target_quality_cq: number | null;
    ignore_frame_mismatch: boolean;
}

export function parseChunksJsonFile(chunksPath: string) {
    // Read chunks.json and parse
    return JSON.parse(fs.readFileSync(chunksPath).toString()) as Chunk[];
}