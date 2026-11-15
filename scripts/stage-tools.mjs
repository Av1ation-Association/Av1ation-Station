// Assemble the release toolchain under dist/tools for the current platform.
//
// The tree is not the same shape everywhere: Windows ships .exe and .dll files with
// python/python.exe, while macOS and Linux ship bare executables, .dylib or .so libraries,
// and python/bin/python3. This script stages what the platform actually has and names what
// is missing, so the Windows release gate and the secondary targets share one command.
//
// Every release target now stages the full provider set, including the CPython/VapourSynth
// tree and the native metrics. A source tree may be either a staged `tools/` directory or a
// target directory produced by `toolchain:build`, which contains `tools/`.

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const value = (flag, fallback) => {
    const index = args.indexOf(flag);
    return index === -1 ? fallback : args[index + 1];
};

const requestedSource = resolve(value("--from", join(root, "dist", "dev-tools")));
const out = resolve(value("--out", join(root, "dist", "tools")));

const source = existsSync(join(requestedSource, "tools"))
    ? join(requestedSource, "tools")
    : requestedSource;

if (!existsSync(source) || !statSync(source).isDirectory()) {
    console.error(`The staged toolchain is missing: ${source}`);
    console.error("Stage one first: npm run dev:tools -- --from <tools-directory>");
    process.exit(1);
}

// Directories and files the packaging contract excludes: build tooling, headers, docs, test
// suites, debug symbols, and the GPU payloads that are not bundled (docs/packaging.md §1).
const EXCLUDED_PREFIXES = [
    "Doc",
    "include",
    "libs",
    "Scripts",
    "share",
    "Lib/ensurepip",
    "Lib/idlelib",
    "Lib/test",
    "Lib/turtledemo",
    "Lib/venv",
];
const EXCLUDED_PACKAGES = new Set([
    "nvidia",
    "tensorrt_libs",
    "tensorrt_rtx_libs",
    "cuda",
    "PySide6",
    "onnx",
    "onnxruntime",
    "pip",
    "mesonbuild",
    "vapoursynth_mlrt_ort_cuda",
    "ov",
]);
const EXCLUDED_FILES = /\.(?:pdb|whl|lib|a)$/iu;

/** True when a staged Python path is one the bundle deliberately omits. */
function keep(relativePath) {
    if (
        EXCLUDED_PREFIXES.some(
            (prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`),
        )
    ) {
        return false;
    }
    if (EXCLUDED_FILES.test(relativePath)) {
        return false;
    }
    // macOS and Linux put site-packages under lib/pythonX.Y/ and their test suite beside it.
    if (
        /^lib\/python\d+\.\d+\/(?:ensurepip|idlelib|test|turtledemo|venv)(?:\/|$)/u.test(
            relativePath,
        )
    ) {
        return false;
    }
    const segments = relativePath.split("/");
    const sitePackages = segments.lastIndexOf("site-packages");
    if (sitePackages !== -1 && EXCLUDED_PACKAGES.has(segments[sitePackages + 1])) {
        return false;
    }
    return true;
}

function copy(name, filter) {
    const from = join(source, name);
    if (!existsSync(from)) {
        return false;
    }
    cpSync(from, join(out, name), {
        recursive: true,
        dereference: true,
        filter:
            filter === undefined
                ? undefined
                : (file) => filter(relative(from, file).split(sep).join("/")),
    });
    return true;
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

console.log(`Staging ${source}`);
copy("bin");
copy("lib");
copy("model");
if (copy("python", keep)) {
    console.log("  python: copied without doc, headers, tests, pip and GPU payloads");
}

/**
 * Debian's ffmpeg, mkvmerge and aomenc link against more than glibc, so a copied binary is
 * not a working tool. Copy that closure into `lib/` and give every ELF an rpath to its
 * siblings; the tree then runs on a machine with none of those packages installed. Windows
 * and macOS stage self-contained binaries and are not touched.
 */
function bundleLinuxRuntime() {
    const binDir = join(out, "bin");
    if (!existsSync(binDir)) {
        return;
    }
    const libDir = join(out, "lib");
    mkdirSync(libDir, { recursive: true });
    const binaries = readdirSync(binDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => join(binDir, entry.name));
    const glibc = new Set([
        "libc.so.6",
        "libm.so.6",
        "libpthread.so.0",
        "libdl.so.2",
        "librt.so.1",
        "libresolv.so.2",
        "libutil.so.2",
        "ld-linux-x86-64.so.2",
    ]);
    const libraries = new Set();
    for (const binary of binaries) {
        const output = execFileSync("ldd", [binary], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        });
        const missing = output
            .split("\n")
            .filter((line) => line.includes("not found"))
            .map((line) => line.split("=>")[0].trim());
        if (missing.length > 0) {
            throw new Error(
                `${binary} cannot find ${missing.join(", ")}; install its package first`,
            );
        }
        for (const line of output.split("\n")) {
            const match = /=>\s+(\/\S+)\s+\(0x/u.exec(line);
            if (match !== null) {
                libraries.add(match[1]);
            }
        }
    }
    let copied = 0;
    for (const library of [...libraries].sort()) {
        const name = basename(library);
        if (glibc.has(name)) {
            continue;
        }
        const destination = join(libDir, name);
        if (existsSync(destination)) {
            continue;
        }
        cpSync(library, destination);
        copied += 1;
    }
    for (const binary of binaries) {
        execFileSync("patchelf", ["--set-rpath", "$ORIGIN/../lib", binary]);
    }
    for (const name of readdirSync(libDir)) {
        execFileSync("patchelf", ["--set-rpath", "$ORIGIN", join(libDir, name)]);
    }
    console.log(`  lib: ${copied} runtime libraries staged with \$ORIGIN rpaths`);
}

if (process.platform === "linux") {
    try {
        bundleLinuxRuntime();
    } catch (error) {
        if (error.code === "ENOENT" && error.path === "patchelf") {
            console.error("patchelf is required to stage the Linux runtime libraries");
            console.error("Install it first: apt install patchelf");
            process.exit(1);
        }
        throw error;
    }
}

const executable = (name) => (process.platform === "win32" ? `${name}.exe` : name);
const metrics =
    process.platform === "win32"
        ? ["fmetrics.dll", "libvmaf.dll", "libvship.dll"]
        : process.platform === "darwin"
          ? ["libfmetrics.dylib", "libvmaf.dylib", "libvship.dylib"]
          : ["libfmetrics.so", "libvmaf.so", "libvship.so"];

const required = [
    join("bin", executable("ffmpeg")),
    join("bin", executable("mkvmerge")),
    join("model", "transnetv2.onnx"),
];
const python =
    process.platform === "win32" ? join("python", "python.exe") : join("python", "bin", "python3");
const vsscript =
    process.platform === "win32"
        ? join("python", "Lib", "site-packages", "vapoursynth", "vsscript.dll")
        : join(
              "python",
              "lib",
              "python3.14",
              "site-packages",
              "vapoursynth",
              process.platform === "darwin" ? "libvsscript.dylib" : "libvsscript.so",
          );
const ffms2 =
    process.platform === "win32"
        ? join("lib", "ffms2.dll")
        : join("lib", process.platform === "darwin" ? "libffms2.dylib" : "libffms2.so");
const sourcePlugin =
    process.platform === "win32"
        ? join("python", "Lib", "site-packages", "vapoursynth", "plugins", "ffms2.dll")
        : join(
              "python",
              "lib",
              "python3.14",
              "site-packages",
              "vapoursynth",
              "plugins",
              process.platform === "darwin" ? "libffms2.dylib" : "libffms2.so",
          );

required.push(
    join("bin", executable("x264")),
    join("bin", executable("x265")),
    join("bin", executable("aomenc")),
    join("bin", executable("SvtAv1EncApp")),
    join("bin", executable("rav1e")),
    join("bin", executable("vpxenc")),
    join("bin", executable("avmenc")),
    ...metrics.map((name) => join("lib", name)),
    ffms2,
    vsscript,
    sourcePlugin,
    python,
);

const missing = required.filter((relativePath) => !existsSync(join(out, relativePath)));
if (missing.length > 0) {
    console.error(`The staged toolchain is incomplete: ${missing.join(", ")}`);
    process.exit(1);
}

function sizeOf(directory) {
    let total = 0;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        total += entry.isDirectory() ? sizeOf(path) : statSync(path).size;
    }
    return total;
}

console.log("");
for (const name of readdirSync(out, { withFileTypes: true })) {
    if (!name.isDirectory()) {
        continue;
    }
    const path = join(out, name.name);
    console.log(`${name.name.padEnd(8)} ${(sizeOf(path) / 1024 / 1024).toFixed(1)} MiB`);
}
console.log(`staged: ${out}`);
