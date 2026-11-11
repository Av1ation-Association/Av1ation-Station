#!/usr/bin/env node
/**
 * Build the Python language-server archive the service embeds.
 *
 * The archive is a build artifact, never source: `rust/crates/service/assets/python-lsp.lock`
 * pins the distributions, their wheel URLs, and their SHA-256 digests, and this script is
 * the only thing that turns those pins into bytes. `rust/crates/service/build.rs` runs it
 * before the crate compiles, so a local build and CI produce the same archive from the
 * same lock.
 *
 * Node's own `zlib` handles deflate and the ZIP container is written here, so the script
 * has no third-party dependency and needs no Python, pip, or network access once the
 * wheels are cached.
 *
 *   node scripts/vendor-python-lsp.mjs
 *   node scripts/vendor-python-lsp.mjs --lock <file> --wheels <dir> --out <zip>
 *   node scripts/vendor-python-lsp.mjs --refresh-lock
 *
 * `--refresh-lock` re-resolves the URL and digest for each pinned name and version, which
 * is how a version bump is recorded: edit `version` in the lock, refresh, rebuild.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_LOCK = join(ROOT, "crates", "service", "assets", "python-lsp.lock");
const DEFAULT_WHEELS = join(ROOT, "target", "python-lsp", "wheels");
const DEFAULT_OUT = join(ROOT, "target", "python-lsp", "python-lsp.zip");

/** Arguments are plain positional flags; the build script passes absolute paths. */
function parseArguments(argv) {
    const options = {
        lock: DEFAULT_LOCK,
        wheels: DEFAULT_WHEELS,
        out: DEFAULT_OUT,
        refresh: false,
        check: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const flag = argv[index];
        if (flag === "--refresh-lock") {
            options.refresh = true;
        } else if (flag === "--check") {
            options.check = true;
        } else if (flag === "--lock") {
            options.lock = resolve(argv[(index += 1)]);
        } else if (flag === "--wheels") {
            options.wheels = resolve(argv[(index += 1)]);
        } else if (flag === "--out") {
            options.out = resolve(argv[(index += 1)]);
        } else {
            throw new Error(`unknown argument: ${flag}`);
        }
    }
    return options;
}

function readLock(path) {
    const lock = JSON.parse(readFileSync(path, "utf8"));
    if (!Array.isArray(lock.packages) || lock.packages.length === 0) {
        throw new Error(`${path} lists no packages`);
    }
    return lock;
}

/** Re-resolve the wheel URL and digest for every pinned name and version. */
async function refreshLock(lock, path) {
    for (const entry of lock.packages) {
        const metadata = await fetchJson(
            `https://pypi.org/pypi/${entry.name}/${entry.version}/json`,
        );
        const wheels = metadata.urls.filter(
            (file) => file.packagetype === "bdist_wheel" && file.filename.endsWith("-none-any.whl"),
        );
        if (wheels.length !== 1) {
            throw new Error(`${entry.name} ${entry.version}: ${wheels.length} universal wheels`);
        }
        entry.filename = wheels[0].filename;
        entry.url = wheels[0].url;
        entry.sha256 = wheels[0].digests.sha256;
    }
    lock.packages.sort((left, right) => left.name.localeCompare(right.name));
    writeFileSync(path, `${JSON.stringify(lock, null, 2)}\n`);
    process.stderr.write(`refreshed ${path}\n`);
}

async function fetchJson(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
        throw new Error(`${url} answered ${response.status}`);
    }
    return response.json();
}

/** A cached wheel is trusted only after its digest matches the lock. */
async function ensureWheel(entry, directory) {
    mkdirSync(directory, { recursive: true });
    const path = join(directory, entry.filename);
    if (existsSync(path)) {
        const cached = readFileSync(path);
        if (digest(cached) === entry.sha256) {
            return cached;
        }
        // A truncated download from an interrupted build is replaced, not trusted.
        process.stderr.write(`discarding ${entry.filename}: digest does not match the lock\n`);
    }
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(120_000) });
    if (!response.ok) {
        throw new Error(`${entry.url} answered ${response.status}`);
    }
    const wheel = Buffer.from(await response.arrayBuffer());
    const actual = digest(wheel);
    if (actual !== entry.sha256) {
        throw new Error(`${entry.filename}: sha256 ${actual} does not match ${entry.sha256}`);
    }
    writeFileSync(path, wheel);
    return wheel;
}

function digest(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

/** Read every file from a wheel, dismissing directory entries. */
function readZip(buffer) {
    let end = -1;
    for (
        let offset = buffer.length - 22;
        offset >= Math.max(0, buffer.length - 22 - 0xffff);
        offset -= 1
    ) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) {
            end = offset;
            break;
        }
    }
    if (end < 0) {
        throw new Error("not a zip archive: no end-of-central-directory record");
    }
    const count = buffer.readUInt16LE(end + 10);
    let cursor = buffer.readUInt32LE(end + 16);
    const files = [];
    for (let index = 0; index < count; index += 1) {
        if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
            throw new Error("not a zip archive: bad central-directory entry");
        }
        const method = buffer.readUInt16LE(cursor + 10);
        const compressedSize = buffer.readUInt32LE(cursor + 20);
        const nameLength = buffer.readUInt16LE(cursor + 28);
        const extraLength = buffer.readUInt16LE(cursor + 30);
        const commentLength = buffer.readUInt16LE(cursor + 32);
        const localOffset = buffer.readUInt32LE(cursor + 42);
        const name = buffer.toString("utf8", cursor + 46, cursor + 46 + nameLength);
        cursor += 46 + nameLength + extraLength + commentLength;
        if (name.endsWith("/")) {
            continue;
        }
        if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
            throw new Error(`not a zip archive: bad local header for ${name}`);
        }
        const localNameLength = buffer.readUInt16LE(localOffset + 26);
        const localExtraLength = buffer.readUInt16LE(localOffset + 28);
        const start = localOffset + 30 + localNameLength + localExtraLength;
        const data = buffer.subarray(start, start + compressedSize);
        files.push({ name, data: method === 8 ? inflateRawSync(data) : Buffer.from(data) });
    }
    return files;
}

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
})();

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Write a deterministic archive: fixed timestamps, sorted entries, deflate level 9.
 *
 * Determinism matters because the archive ends up in the binary; a rebuild with nothing
 * changed must not produce a different file for a cache to trip over.
 */
function writeZip(files) {
    const local = [];
    const central = [];
    let offset = 0;
    for (const file of files) {
        const name = Buffer.from(file.name, "utf8");
        const compressed = deflateRawSync(file.data, { level: 9 });
        const crc = crc32(file.data);

        const header = Buffer.alloc(30);
        header.writeUInt32LE(0x04034b50, 0);
        header.writeUInt16LE(20, 4);
        header.writeUInt16LE(0x0800, 6); // UTF-8 names
        header.writeUInt16LE(8, 8); // deflate
        header.writeUInt16LE(0, 10); // 00:00
        header.writeUInt16LE(0x21, 12); // 1980-01-01
        header.writeUInt32LE(crc, 14);
        header.writeUInt32LE(compressed.length, 18);
        header.writeUInt32LE(file.data.length, 22);
        header.writeUInt16LE(name.length, 26);
        local.push(header, name, compressed);

        const entry = Buffer.alloc(46);
        entry.writeUInt32LE(0x02014b50, 0);
        entry.writeUInt16LE(20, 4);
        entry.writeUInt16LE(20, 6);
        entry.writeUInt16LE(0x0800, 8);
        entry.writeUInt16LE(8, 10);
        entry.writeUInt16LE(0, 12);
        entry.writeUInt16LE(0x21, 14);
        entry.writeUInt32LE(crc, 16);
        entry.writeUInt32LE(compressed.length, 20);
        entry.writeUInt32LE(file.data.length, 24);
        entry.writeUInt16LE(name.length, 28);
        entry.writeUInt32LE((0o100644 << 16) >>> 0, 38);
        entry.writeUInt32LE(offset, 42);
        central.push(entry, name);

        offset += header.length + name.length + compressed.length;
    }
    const directory = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, directory, end]);
}

/** Provenance a reader can find inside the extracted tree. */
function notice(lock) {
    return [
        "Vendored Python language server for the Av1ation Station script editor.",
        "",
        "Generated by scripts/vendor-python-lsp.mjs from",
        "rust/crates/service/assets/python-lsp.lock. The service extracts this tree into its",
        "app-data directory and runs it inside the interpreter the user selected.",
        "",
        "Sources (PyPI, exact pins):",
        ...lock.packages.map((entry) => `  ${entry.name}==${entry.version} (${entry.sha256})`),
        "",
        "Each distribution's *.dist-info directory carries its own license.",
        "",
    ].join("\n");
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const lock = readLock(options.lock);
    if (options.refresh) {
        await refreshLock(lock, options.lock);
        if (options.check) {
            return;
        }
    }

    const files = new Map();
    for (const entry of lock.packages) {
        const wheel = await ensureWheel(entry, options.wheels);
        for (const file of readZip(wheel)) {
            if (files.has(file.name)) {
                throw new Error(`${file.name} appears in more than one wheel`);
            }
            files.set(file.name, file.data);
        }
    }
    files.set("BUNDLE.txt", Buffer.from(notice(lock), "utf8"));

    const ordered = [...files.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, data]) => ({ name, data }));
    const archive = writeZip(ordered);

    if (options.check) {
        const existing = existsSync(options.out) ? readFileSync(options.out) : null;
        if (existing === null || !existing.equals(archive)) {
            throw new Error(`${options.out} is out of date; rebuild it`);
        }
        process.stderr.write(`${options.out} matches the lock\n`);
        return;
    }

    mkdirSync(dirname(options.out), { recursive: true });
    const partial = `${options.out}.partial`;
    writeFileSync(partial, archive);
    renameSync(partial, options.out);
    process.stderr.write(`wrote ${options.out} (${archive.length} bytes)\n`);
}

main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
});
