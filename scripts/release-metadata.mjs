// Build the single metadata archive attached to a release.
//
// The archive keeps the installers and portables as the only individual downloads. It
// carries the per-target lock, notices, licence texts, SBOM and source offer beside the
// audit checksum and both checksum files. The ZIP writer is deliberately local: the
// release job must not depend on a host zip command, and the same bytes are readable by
// the preflight check.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";

import { TARGETS } from "./toolchain-manifest.mjs";

export const AUDIT_FILES = [
    "toolchain.lock.json",
    "THIRD_PARTY_NOTICES.md",
    "PYTHON_NOTICES.md",
    "PYTHON-LICENSES.txt",
    "sbom.spdx.json",
    "SOURCE-OFFER.md",
];
export const METADATA_README = "README.txt";

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

function sha256(buffer) {
    return createHash("sha256").update(buffer).digest("hex");
}

/** Write a deterministic ZIP with fixed timestamps and sorted entries. */
export function writeZip(files) {
    const entries = [...files].sort((left, right) => left.name.localeCompare(right.name));
    const names = new Set();
    const local = [];
    const central = [];
    let offset = 0;
    for (const file of entries) {
        if (names.has(file.name)) {
            throw new Error(`duplicate metadata archive entry: ${file.name}`);
        }
        names.add(file.name);
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
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(directory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, directory, end]);
}

/** Read a ZIP archive created by this module or by a standard zip command. */
export function readZip(path) {
    const buffer = Buffer.isBuffer(path) ? path : readFileSync(path);
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

export function metadataArchiveName(version) {
    return `Av1ation-Station_${version}_metadata.zip`;
}

function metadataReadme({ tag, version, files }) {
    return [
        `Av1ation Station ${version} release metadata`,
        "",
        `Tag: ${tag}`,
        "",
        "This archive contains the release's audit and checksum files. Installers and",
        "portable applications are separate GitHub release assets.",
        "",
        "Files:",
        ...files.map((file) => `  ${file}`),
        "",
        "AUDIT-SHA256SUMS.txt covers the per-target audit files below. SHA256SUMS-github.txt",
        "uses the GitHub asset names; SHA256SUMS.txt keeps the build-tree paths.",
        "",
    ].join("\n");
}

function auditChecksums(releaseDir, auditFiles) {
    return auditFiles
        .map((file) => {
            const data = readFileSync(join(releaseDir, "audit", file.target, file.source));
            return `${sha256(data)}  ${file.name}`;
        })
        .join("\n");
}

/**
 * Create the archive in `<releaseDir>/assets` and return the manifest asset and file list.
 *
 * The audit directory is required: a release without it must not silently publish an
 * archive that claims to carry notices or source offers.
 */
export function createMetadataArchive({ releaseDir, tag, version }) {
    const auditDir = join(releaseDir, "audit");
    const checksumPath = join(releaseDir, "SHA256SUMS-github.txt");
    const aggregateChecksumPath = join(releaseDir, "SHA256SUMS.txt");
    if (!existsSync(auditDir)) {
        throw new Error(`missing audit bundle: ${auditDir}`);
    }
    if (!existsSync(checksumPath)) {
        throw new Error(`missing ${checksumPath}; write the release checksums first`);
    }

    const auditFiles = [];
    const entries = [];
    for (const target of TARGETS) {
        for (const source of AUDIT_FILES) {
            const name = `${target}-${source}`;
            const path = join(auditDir, target, source);
            if (!existsSync(path)) {
                throw new Error(`missing audit file: ${path}`);
            }
            auditFiles.push({ target, source, name });
            entries.push({ name, data: readFileSync(path) });
        }
    }

    const auditSums = auditChecksums(releaseDir, auditFiles);
    entries.push({ name: "AUDIT-SHA256SUMS.txt", data: Buffer.from(`${auditSums}\n`) });
    entries.push({ name: "SHA256SUMS-github.txt", data: readFileSync(checksumPath) });
    if (existsSync(aggregateChecksumPath)) {
        entries.push({ name: "SHA256SUMS.txt", data: readFileSync(aggregateChecksumPath) });
    }
    const names = entries
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
    entries.push({
        name: METADATA_README,
        data: Buffer.from(metadataReadme({ tag, version, files: names })),
    });

    const name = metadataArchiveName(version);
    const directory = join(releaseDir, "assets");
    mkdirSync(directory, { recursive: true });
    const archivePath = join(directory, name);
    const archive = writeZip(entries);
    writeFileSync(archivePath, archive);

    return {
        name,
        path: `assets/${name}`,
        size: statSync(archivePath).size,
        sha256: sha256(archive),
        entries: entries.map((entry) => entry.name),
        asset: {
            name,
            path: `assets/${name}`,
            variant: "release",
            format: "zip",
            kind: "metadata",
            size: statSync(archivePath).size,
            sha256: sha256(archive),
        },
    };
}

/** Expected members for a complete release metadata archive. */
export function expectedMetadataEntries() {
    return [
        ...TARGETS.flatMap((target) => AUDIT_FILES.map((source) => `${target}-${source}`)),
        "AUDIT-SHA256SUMS.txt",
        "SHA256SUMS-github.txt",
        "SHA256SUMS.txt",
        METADATA_README,
    ];
}
