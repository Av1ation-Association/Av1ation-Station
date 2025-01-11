import * as fs from 'fs';

export interface DoneJSON {
    frames: number;
    done: {
        [chunk: string]: {
            frames: number;
            size_bytes: number;
        };
    };
    audio_done: boolean;
}

export function parseDoneJsonFile(donePath: string) {
    // Read done.json and parse
    return JSON.parse(fs.readFileSync(donePath).toString()) as DoneJSON;
}