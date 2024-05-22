import { get } from 'node:https';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as url from 'node:url';
import { spawn } from 'node:child_process';
import decompress from 'decompress';
import win7zip from 'win-7zip';
const _7z = win7zip['7z'];

if (os.platform() !== 'win32') {
    console.log('Only running on Windows');
    process.exit(0);
}

console.log('ENV:\n', process.env, '\n');

const vapoursynthUrl = process.env.VAPOURSYNTH_URL;
const av1anUrl = process.env.AV1AN_URL;
const ffmpegUrl = process.env.FFMPEG_URL;
const mkvtoolnixUrl = process.env.MKVTOOLNIX_URL;

// Av1an Chunking Methods
const ffms2Url = process.env.FFMS2_URL;
const lsmashUrl = process.env.LSMASH_URL;
const bestsourceUrl = process.env.BESTSOURCE_URL;
const dgdecnvUrl = process.env.DGDECNV_URL; // Not bundled until there is a licensing agreement

// Encoders
const aomUrl = process.env.AOM_URL;
const svtUrl = process.env.SVT_URL;
const rav1eUrl = process.env.RAV1E_URL;
const vpxUrl = process.env.VPX_URL;
const x264Url = process.env.X264_URL;
const x265Url = process.env.X265_URL;

const buildResourcesPath = path.resolve(url.fileURLToPath(new URL('.', import.meta.url)), '../buildResources');
const downloadsPath = path.resolve(buildResourcesPath, 'downloads');
const windowsResourcesPath = path.resolve(buildResourcesPath, 'win');
const vapoursynthPath = path.resolve(windowsResourcesPath, 'vapoursynth');
const dgdecnvPath = path.resolve(windowsResourcesPath, 'dgdecnv');
const vapoursynthPluginsPath = path.resolve(vapoursynthPath, 'vs-plugins');
const av1anPath = path.resolve(windowsResourcesPath, 'av1an');

const downloadRetry = async (filePath, url, redirectCount = 0) => {
    if (redirectCount > 10) {
        throw new Error(`Too many redirects for ${url}`);
    }

    return new Promise((resolve, reject) => {
        const req = get(url, (res) => {
            if (res.statusCode >= 400) {
                return reject(new Error(`Failed to download ${url}: ${res.statusCode}`));
            }

            if (res.statusCode >= 300 && res.statusCode < 400) {
                const redirectUrl = res.headers.location;
                return downloadRetry(filePath, redirectUrl, redirectCount + 1).then(resolve, reject);
            }

            const fileStream = fs.createWriteStream(filePath);
            res.pipe(fileStream);
            fileStream.on('finish', () => {
                fileStream.close();
            });
            fileStream.on('close', () => {
                resolve();
            });
            fileStream.on('error', reject);
        });

        req.on('error', reject);
    });
};

const download = async (filePath, url) => {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(filePath)) {
            console.log(`${filePath} already exists, skipping download`);
            return resolve();
        }

        console.log(`Downloading ${url} to ${filePath}`);
        if (!fs.existsSync(path.dirname(filePath))) {
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
        }

        downloadRetry(filePath, url).then(() => {
            console.log(`Downloaded ${url} to ${filePath}`);
            return resolve();
        }).catch(reject);
    });
};

const extract7z = async (archivePath, outputPath) => {
    if (!fs.existsSync(outputPath)) {
        await fs.promises.mkdir(outputPath, { recursive: true });
    }

    return new Promise((resolve, reject) => {
        const extractor = spawn(_7z, ['x', archivePath, '-y', `-o${outputPath}`], { stdio: ['inherit', 'inherit', 'inherit'] });

        extractor.on('exit', (code) => {
            if (code !== 0) {
                return reject(new Error('Failed to extract 7z'));
            }

            return resolve();
        });
    });
};

const extract = async (archivePath, outputPath) => {
    if (!fs.existsSync(outputPath)) {
        await fs.promises.mkdir(outputPath, { recursive: true });
    }

    if (path.extname(archivePath) === '.7z') {
        return extract7z(archivePath, outputPath);
    } else {
        return decompress(archivePath, outputPath);
    }
};

const downloadAll = async () => {
    await Promise.all([
        vapoursynthUrl ? download(path.resolve(downloadsPath, 'vapoursynth.ps1'), vapoursynthUrl) : Promise.resolve(),
        av1anUrl ? download(path.resolve(av1anPath, 'av1an.exe'), av1anUrl) : Promise.resolve(),
        ffmpegUrl ? download(path.resolve(downloadsPath, 'ffmpeg.zip'), ffmpegUrl) : Promise.resolve(),
        mkvtoolnixUrl ? download(path.resolve(downloadsPath, 'mkvtoolnix.7z'), mkvtoolnixUrl) : Promise.resolve(),
        ffms2Url ? download(path.resolve(downloadsPath, 'ffms2.7z'), ffms2Url) : Promise.resolve(),
        lsmashUrl ? download(path.resolve(downloadsPath, 'lsmash.7z'), lsmashUrl) : Promise.resolve(),
        bestsourceUrl ? download(path.resolve(downloadsPath, 'bestsource.7z'), bestsourceUrl) : Promise.resolve(),
        // dgdecnvUrl ? download(path.resolve(downloadsPath, 'dgdecnv.zip'), dgdecnvUrl) : Promise.resolve(),
        aomUrl ? download(path.resolve(downloadsPath, 'aom.7z'), aomUrl) : Promise.resolve(),
        svtUrl ? download(path.resolve(downloadsPath, 'svtav1.7z'), svtUrl) : Promise.resolve(),
        rav1eUrl ? download(path.resolve(av1anPath, 'encoders', 'rav1e', 'rav1e.exe'), rav1eUrl) : Promise.resolve(),
        vpxUrl ? download(path.resolve(downloadsPath, 'vpx.7z'), vpxUrl) : Promise.resolve(),
        x264Url ? download(path.resolve(av1anPath, 'encoders', 'x264', 'x264.exe'), x264Url) : Promise.resolve(),
        x265Url ? download(path.resolve(downloadsPath, 'x265.zip'), x265Url) : Promise.resolve(),
    ]);
};

const executeVapourSynthPowerShellScript = async () => {
    return new Promise((resolve, reject) => {
        const powershell = spawn('powershell.exe', ['-ExecutionPolicy', 'Bypass', '-File', path.resolve(downloadsPath, 'vapoursynth.ps1'), '66', vapoursynthPath, '-Unattended'], { stdio: ['inherit', 'inherit', 'inherit'] });

        powershell.on('exit', (code) => {
            if (code !== 0) {
                reject(new Error('Failed to install VapourSynth'));
            }

            resolve();
        });
    });
};

const installVapoursynth = async () => {
    console.log('Installing Vapoursynth');

    await executeVapourSynthPowerShellScript();

    console.log('VapourSynth installed');
};

const installFFMS2 = async () => {
    console.log('Installing FFMS2');

    await extract(path.resolve(downloadsPath, 'ffms2.7z'), path.resolve(downloadsPath, 'ffms2'));
    // Move ffms2-2.40-mvsc/x64 to vapoursynthPath/vs-plugins
    await fs.promises.cp(path.resolve(downloadsPath, 'ffms2', 'ffms2-2.40-msvc', 'x64'), vapoursynthPluginsPath, { recursive: true });

    console.log('FFMS2 installed');
};

const installLSmash = async () => {
    console.log('Installing LSMASH');

    await extract(path.resolve(downloadsPath, 'lsmash.7z'), path.resolve(downloadsPath, 'lsmash'));
    // Move lsmash to vapoursynthPath/vs-plugins
    await fs.promises.cp(path.resolve(downloadsPath, 'lsmash', 'x64'), vapoursynthPluginsPath, { recursive: true });

    console.log('LSMASH installed');
};

const installBestSource = async () => {
    console.log('Installing BestSource');

    await extract(path.resolve(downloadsPath, 'bestsource.7z'), path.resolve(downloadsPath, 'bestsource'));
    // Move bestsource to vapoursynthPath/vs-plugins
    await fs.promises.rename(path.resolve(downloadsPath, 'bestsource', 'BestSource.dll'), path.resolve(vapoursynthPluginsPath, 'BestSource.dll'));

    console.log('BestSource installed');
};

const installFfmpeg = async () => {
    console.log('Installing Ffmpeg');

    await extract(path.resolve(downloadsPath, 'ffmpeg.zip'), path.resolve(downloadsPath, 'ffmpeg'));
    // Move ffmpeg-n7.0-latest-win64-lgpl-shared-7.0 to av1anPath/ffmpeg
    if (!fs.existsSync(path.resolve(av1anPath, 'ffmpeg'))) {
        await fs.promises.mkdir(path.resolve(av1anPath, 'ffmpeg'), { recursive: true });
    }
    await fs.promises.cp(path.resolve(downloadsPath, 'ffmpeg', 'ffmpeg-n7.0-latest-win64-lgpl-shared-7.0', 'bin'), path.resolve(av1anPath, 'ffmpeg'), { recursive: true });

    console.log('Ffmpeg installed');
};

const installDgdecnv = async () => {
    console.log('Installing Dgdecnv');

    await extract(path.resolve(downloadsPath, 'dgdecnv.zip'), path.resolve(downloadsPath, 'dgdecnv'));
    if (!fs.existsSync(path.resolve(dgdecnvPath))) {
        await fs.promises.mkdir(path.resolve(dgdecnvPath), { recursive: true });
    }
    await fs.promises.rename(path.resolve(downloadsPath, 'dgdecnv', 'DGDecodeNV.dll'), path.resolve(vapoursynthPluginsPath, 'DGDecodeNV.dll'));
    await fs.promises.cp(path.resolve(downloadsPath, 'dgdecnv'), path.resolve(dgdecnvPath), { recursive: true });

    console.log('Dgdecnv installed');
};

const installMKVToolnix = async () => {
    console.log('Installing MKVToolnix');

    await extract(path.resolve(downloadsPath, 'mkvtoolnix.7z'), path.resolve(downloadsPath, 'mkvtoolnix'));
    // Move mkvtoolnix to av1anPath/mkvtoolnix
    if (!fs.existsSync(path.resolve(av1anPath, 'mkvtoolnix'))) {
        await fs.promises.mkdir(path.resolve(av1anPath, 'mkvtoolnix'), { recursive: true });
    }
    await fs.promises.rename(path.resolve(downloadsPath, 'mkvtoolnix', 'mkvtoolnix', 'mkvmerge.exe'), path.resolve(av1anPath, 'mkvtoolnix', 'mkvmerge.exe'));
    await fs.promises.rename(path.resolve(downloadsPath, 'mkvtoolnix', 'mkvtoolnix', 'mkvextract.exe'), path.resolve(av1anPath, 'mkvtoolnix', 'mkvextract.exe'));
    await fs.promises.rename(path.resolve(downloadsPath, 'mkvtoolnix', 'mkvtoolnix', 'mkvinfo.exe'), path.resolve(av1anPath, 'mkvtoolnix', 'mkvinfo.exe'));
    await fs.promises.rename(path.resolve(downloadsPath, 'mkvtoolnix', 'mkvtoolnix', 'mkvpropedit.exe'), path.resolve(av1anPath, 'mkvtoolnix', 'mkvpropedit.exe'));

    console.log('MKVToolnix installed');
};

const installAOM = async () => {
    console.log('Installing AOM');

    await extract(path.resolve(downloadsPath, 'aom.7z'), path.resolve(downloadsPath, 'aom'));
    // Move aom to av1anPath/aom
    if (!fs.existsSync(path.resolve(av1anPath, 'encoders', 'aom'))) {
        await fs.promises.mkdir(path.resolve(av1anPath, 'encoders', 'aom'), { recursive: true });
    }
    await fs.promises.rename(path.resolve(downloadsPath, 'aom', 'aomenc.exe'), path.resolve(av1anPath, 'encoders', 'aom', 'aomenc.exe'));

    console.log('AOM installed');
};

const installSVTAV1 = async () => {
    console.log('Installing SVT-AV1-PSY');

    await extract(path.resolve(downloadsPath, 'svtav1.7z'), path.resolve(downloadsPath, 'svtav1'));
    // Move svtav1 to av1anPath/encoders/svtav1
    if (!fs.existsSync(path.resolve(av1anPath, 'encoders', 'svtav1'))) {
        await fs.promises.mkdir(path.resolve(av1anPath, 'encoders', 'svtav1'), { recursive: true });
    }
    await fs.promises.cp(path.resolve(downloadsPath, 'svtav1', 'SVT-PSY', 'Generic'), path.resolve(av1anPath, 'encoders', 'svtav1'), { recursive: true });

    console.log('SVT-AV1-PSY installed');
};

const installVpx = async () => {
    console.log('Installing VPX');

    await extract(path.resolve(downloadsPath, 'vpx.7z'), path.resolve(downloadsPath, 'vpx'));
    // Move vpx to av1anPath/encoders/vpx
    if (!fs.existsSync(path.resolve(av1anPath, 'encoders', 'vpx'))) {
        await fs.promises.mkdir(path.resolve(av1anPath, 'encoders', 'vpx'), { recursive: true });
    }
    fs.promises.rename(path.resolve(downloadsPath, 'vpx', 'vpxenc.exe'), path.resolve(av1anPath, 'encoders', 'vpx', 'vpxenc.exe'));

    console.log('VPX installed');
};

const installX265 = async () => {
    console.log('Installing X265');

    await extract(path.resolve(downloadsPath, 'x265.zip'), path.resolve(downloadsPath, 'x265'));
    // Move x265 to av1anPath/encoders/x265
    if (!fs.existsSync(path.resolve(av1anPath, 'encoders', 'x265'))) {
        await fs.promises.mkdir(path.resolve(av1anPath, 'encoders', 'x265'), { recursive: true });
    }
    await fs.promises.cp(path.resolve(downloadsPath, 'x265', 'x265_64-12bit[gcc].exe'), path.resolve(av1anPath, 'encoders', 'x265', 'x265.exe'), { recursive: true });

    console.log('X265 installed');
};

(async () => {
    try {
        // Check if the minimum required dependencies are specified
        if (!vapoursynthUrl || !av1anUrl || !ffmpegUrl || !lsmashUrl || !aomUrl) {
            console.error('The following dependencies must be specified in the environment: VAPOURSYNTH_URL, AV1AN_URL, FFMPEG_URL, LSMASH_URL, AOM_URL');
            return process.exit(0);
        }

        console.log('Downloading dependencies...');
        await downloadAll();
        console.log('Dependencies downloaded');

        console.log('Installing dependencies...');
        
        await installVapoursynth();
        await installFfmpeg();
        await installLSmash();
        await installAOM();
        if (dgdecnvUrl && fs.existsSync(path.resolve(downloadsPath, 'dgdecnv.zip'))) {
            await installDgdecnv();
        }
        if (mkvtoolnixUrl) {
            await installMKVToolnix();
        }
        if (ffms2Url) {
            await installFFMS2();
        }
        if (bestsourceUrl) {
            await installBestSource();
        }
        if (svtUrl) {
            await installSVTAV1();
        }
        if (vpxUrl) {
            await installVpx();
        }
        if (x265Url) {
            await installX265();
        }

        console.log('Dependencies installed');
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
})();
