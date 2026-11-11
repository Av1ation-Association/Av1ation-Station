// Assemble the release toolchain under dist/tools for the current platform.
//
// The tree is not the same shape everywhere: Windows ships .exe and .dll files with
// python/python.exe, while macOS and Linux ship bare executables, .dylib or .so libraries,
// and python/bin/python3. This script stages what the platform actually has and names what
// is missing, so the Windows release gate and the secondary targets share one command.
//
// VapourSynth's relocation gate still decides whether a Python tree belongs in a given
// bundle. When one is staged it is copied; when it is not, the executable and metric subset
// is staged alone and the caller is told that the build will select System VapourSynth.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const value = (flag, fallback) => {
    const index = args.indexOf(flag);
    return index === -1 ? fallback : args[index + 1];
};

const source = resolve(value("--from", join(root, "dist", "dev-tools")));
const out = resolve(value("--out", join(root, "dist", "tools")));

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
    "scipy",
    "scipy.libs",
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
    join("bin", executable("x264")),
    join("bin", executable("x265")),
    join("bin", executable("aomenc")),
    join("bin", executable("SvtAv1EncApp")),
    join("bin", executable("rav1e")),
    join("bin", executable("avmenc")),
    ...metrics.map((name) => join("lib", name)),
    join("model", "transnetv2.onnx"),
];
if (process.platform === "win32") {
    // Windows is the only target whose VapourSynth relocation gate has passed.
    required.push(
        join("python", "python.exe"),
        join("python", "Lib", "site-packages", "vapoursynth", "vsscript.dll"),
    );
}

const missing = required.filter((relativePath) => !existsSync(join(out, relativePath)));
if (missing.length > 0) {
    console.error(`The staged toolchain is incomplete: ${missing.join(", ")}`);
    process.exit(1);
}

if (process.platform !== "win32" && !existsSync(join(out, "python", "bin", "python3"))) {
    console.log(
        "No Python tree staged; this build will select System VapourSynth " +
            "(the relocation gate in docs/packaging.md §7 decides when it may bundle one).",
    );
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
