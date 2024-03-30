import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as net from 'net';
import * as path from 'path';
import * as url from 'url';
import { type ChildProcessByStdio, spawn } from 'child_process';
import {
    // type Readable,
    type Writable,
} from 'stream';

export enum ImportMethod {
    DGDECNV = 'dgdecnv',
    BESTSOURCE = 'bestsource',
    LSMASH = 'lsmash',
    FFMS2 = 'ffms2',
}

export enum SSIMULACRAMethod {
    SSIMULACRA = 'v1',
    SSIMULACRA2 = 'v2',
    SSIMULACRA2Zig = 'v2_zig',
}

export interface SSIMULACRA2Status {
    time: Date;
    state: 'idle' | 'paused' | 'running' | 'connected' | 'done' | 'disconnected' | 'canceled' | 'error';
    index?: number;
    score?: number;
    error?: unknown;
}

export class SSIMULACRA2 extends EventEmitter {
    // private childProcess?: ChildProcessByStdio<Writable, Readable, Readable>;
    private childProcess?: ChildProcessByStdio<Writable, null, null>;
    // List of all SSIMULACRA2 states
    private allStates: SSIMULACRA2Status[] = [{ time: new Date(), state: 'idle' }];
    private totalFrames = 0;
    private ssimulacraScores: number[] = [];

    constructor(
        private sourceFileLocation: string,
        private encodedFileLocation: string,
        private scoresFileLocation: string,
        private threads?: number,
        private dimensions?: { width: number; height: number; },
        private every?: number,
        private progress?: boolean,
        private importer: ImportMethod = ImportMethod.DGDECNV,
        private sourceImporter?: ImportMethod,
        private encodedImporter?: ImportMethod,
        private method: SSIMULACRAMethod = SSIMULACRAMethod.SSIMULACRA,
        private port = 3000,
    ) {
        super();
    }

    private buildArguments() {
        const args: string[] = [];
        const printFriendlyArguments: string[] = [];

        // args.push('-p');
        const vapoursynthScriptFileLocation = path.resolve(url.fileURLToPath(new URL('.', import.meta.url)), '../../../../../src/local/Tools/Ssimulacra/ssimulacra.vpy');
        args.push(vapoursynthScriptFileLocation);
        printFriendlyArguments.push(`"${vapoursynthScriptFileLocation}"`);

        // Required positional arguments, source, encoded, scores
        args.push(`${this.sourceFileLocation}`);
        printFriendlyArguments.push(`"${this.sourceFileLocation}"`);
        args.push(`${this.encodedFileLocation}`);
        printFriendlyArguments.push(`"${this.encodedFileLocation}"`);
        args.push(`${this.scoresFileLocation}`);
        printFriendlyArguments.push(`"${this.scoresFileLocation}"`);

        if (this.method) {
            args.push(`--method`, this.method);
            printFriendlyArguments.push(`--method`, this.method);
        }
        if (this.importer) {
            args.push(`--importer`, this.importer);
            printFriendlyArguments.push(`--importer`, this.importer);
        }
        if (this.sourceImporter) {
            args.push(`--source-importer`, this.sourceImporter);
            printFriendlyArguments.push(`--source-importer`, this.sourceImporter);
        }
        if (this.encodedImporter) {
            args.push(`--encoded-importer`, this.encodedImporter);
            printFriendlyArguments.push(`--encoded-importer`, this.encodedImporter);
        }
        if (this.threads) {
            args.push(`--threads`, `${this.threads}`);
            printFriendlyArguments.push(`--threads`, `${this.threads}`);
        }
        if (this.dimensions) {
            args.push(`--width`, `${this.dimensions.width}`);
            printFriendlyArguments.push(`--width`, `${this.dimensions.width}`);
            args.push(`--height`, `${this.dimensions.height}`);
            printFriendlyArguments.push(`--height`, `${this.dimensions.height}`);
        }
        if (this.every) {
            args.push(`--every`, `${this.every}`);
            printFriendlyArguments.push(`--every`, `${this.every}`);
        }
        if (this.progress) {
            args.push(`--progress`);
            printFriendlyArguments.push(`--progress`);
        }
        // if (this.installed) {
        //     args.push(`--installed`);
        //     printFriendlyArguments.push(`--installed`);
        // }

        args.push(`--port`, `${this.port}`);
        printFriendlyArguments.push(`--port`, `${this.port}`);

        return {
            args,
            printFriendlyArguments,
        };
    }

    public get command() {
        return `${this.buildArguments().printFriendlyArguments.join(' ')}`;
    }

    public get frameCount() {
        return this.totalFrames;
    }

    public get framesPerSecond() {
        const firstScoreTime = this.statusHistory.find((status) => status.state === 'running' && status.score)?.time ?? new Date();
        const lastScoreTime = this.statusHistory.reverse().find((status) => status.state === 'running' && status.score)?.time ?? new Date();

        return this.totalFrames / ((lastScoreTime.getTime() - firstScoreTime.getTime()) / 1000);
    }

    public get estimatedSecondsRemaining() {
        return (this.totalFrames - this.scores.length) / this.framesPerSecond;
    }

    public get statusHistory() {
        return this.allStates;
    }

    public get status() {
        return this.allStates[this.allStates.length - 1];
    }

    public get scores() {
        return this.ssimulacraScores;
    }

    private addStatus(status: Omit<SSIMULACRA2Status, 'time'>) {
        const newStatus: SSIMULACRA2Status = {
            time: new Date(),
            ...status,
        };
        this.allStates.push(newStatus);
        this.emit('status', newStatus);
    }

    public onStatus(callback: (status: SSIMULACRA2Status) => void) {
        this.on('status', callback);
    }

    public async start() {
        return new Promise<number[]>((resolve, reject) => {
            // Create socket server
            const server = net.createServer((socket) => {
                // console.log('[SSIMULACRA]: Socket connection established');
                this.addStatus({
                    state: 'connected',
                });
                socket.on('data', (data) => {
                    // Check if multiple strings are concatenated
                    const packets = data.toString().split('\n');
                    packets.filter(packet => packet.trim() !== '').forEach((packet) => {
                        const { index, score, totalFrames } = SSIMULACRA2.Parse(packet);
                        if (totalFrames > this.totalFrames) {
                            this.totalFrames = totalFrames;
                        }

                        this.ssimulacraScores.push(score);
                        this.addStatus({
                            state: 'running',
                            index,
                            score,
                        });
                    });
                });
                // socket.on('end', () => {
                //     console.log('[SSIMULACRA]: Socket connection ended');
                // });
                socket.on('close', () => {
                    // console.log('[SSIMULACRA]: Socket connection closed');
                    this.addStatus({
                        state: 'disconnected',
                    });
                    // Close the server
                    server.close();
                });
            });

            server.listen(this.port, () => {
                // console.log(`[SSIMULACRA]: Server listening on port ${this.port}`);
            });

            // Spawn vspipe with the arguments
            // this.childProcess = spawn('vspipe', this.buildArguments().args, { stdio: ['pipe', 'pipe', 'pipe'] });
            this.childProcess = spawn('python', this.buildArguments().args, { stdio: ['pipe', 'inherit', 'inherit'] });

            this.childProcess.on('close', (code) => {
                // Close the server
                server.close();
                if (code === 0) {
                    // Add new status with the state 'done'
                    this.addStatus({
                        state: 'done',
                    });
                    // Overwrite the scores from the scores file
                    const { scores } = JSON.parse(fs.readFileSync(this.scoresFileLocation).toString()) as { scores: number[]; };
                    this.ssimulacraScores = scores;
                    resolve(this.ssimulacraScores);
                } else {
                    // Add new status with the state 'error'
                    const error = new Error(`SSIMULACRA2 exited with code ${code}`);
                    this.addStatus({
                        state: 'error',
                        error,
                    });
                    reject(error);
                }
            });

            this.childProcess.on('error', (error) => {
                // Close the server
                server.close();
                // Add new status with the state 'error'
                this.addStatus({
                    state: 'error',
                    error,
                });
                reject(error);
            });

            // Add new status with the state 'running'
            this.addStatus({
                state: 'running',
            });
        });
    }

    public async pause() {
        if (!this.childProcess) {
            console.warn('SSIMULACRA2 has not been started');
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
            console.warn('SSIMULACRA2 has not been started');
            if (this.status.state === 'idle') {
                return this.start();
            }
            return;
        }
        if (this.childProcess.exitCode) {
            console.warn('SSIMULACRA2 has been terminated');
            return;
        }
        if (this.childProcess.killed && this.status.state === 'paused') {
            // Resume the process
            this.childProcess.kill('SIGCONT');
            this.addStatus({
                state: 'running',
            });
            return;
        }
    }

    public async cancel() {
        if (!this.childProcess) {
            console.warn('SSIMULACRA2 has not been started');
            return;
        }
        if (this.childProcess.exitCode) {
            console.warn('SSIMULACRA2 has been terminated');
            return;
        }
        if (['running', 'paused'].includes(this.status.state)) {
            // Kill the process
            this.childProcess.kill('SIGKILL');
            this.addStatus({
                state: 'canceled',
            });
            return;
        }
    }

    public static Parse(input: string) {
        const regex = /^(\d+)\/(\d+): (-?\d+(?:\.\d+)?)$/;
        const match = input.match(regex);

        if (!match) {
            throw new Error('Invalid input format');
        }

        const index = parseInt(match[1]);
        const totalFrames = parseInt(match[2]);
        const score = parseFloat(match[3]);

        return {
            index,
            totalFrames,
            score,
        };
    }
}