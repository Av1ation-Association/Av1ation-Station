import * as fs from 'fs';

export interface Chunk {
    temp: string;
    index: number;
    input: {
        VapourSynth: string;
    };
    source_cmd: {
        Windows: number[];
    }[];
    output_ext: string;
    start_frame: number;
    end_frame: number;
    frame_rate: number;
    passes: number;
    video_params: string[];
    encoder: string;
    noise_size: number[] | null[];
    per_shot_target_quality_cq: number | null;
}

export function parseChunksJsonFile(chunksPath: string) {
    // Read chunks.json and parse
    return JSON.parse(fs.readFileSync(chunksPath).toString()) as Chunk[];
}