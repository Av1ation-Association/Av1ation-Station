// Small, dependency-free helpers shared by the toolchain recipes.
//
// A recipe may assume a native compiler for its target, but it must not assume a package
// manager, a pre-existing checkout, or a writable source tree. Everything is fetched into
// `workDir`; only files under `outputDir/tools` survive the component cache.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
    chmodSync,
    cpSync,
    existsSync,
    mkdirSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative } from "node:path";

export function platform(target) {
    if (target === "x86_64-pc-windows-msvc") {
        return "win32";
    }
    if (target === "aarch64-apple-darwin" || target === "x86_64-apple-darwin") {
        return "darwin";
    }
    return "linux";
}

export function executable(target, name) {
    return platform(target) === "win32" ? `${name}.exe` : name;
}

export function library(target, stem) {
    return platform(target) === "win32"
        ? `${stem}.dll`
        : platform(target) === "darwin"
          ? `lib${stem}.dylib`
          : `lib${stem}.so`;
}

export function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
        stdio: "inherit",
        ...options,
        env: { ...process.env, ...options.env },
    });
    if (result.error) {
        throw new Error(`${command} could not start: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`${command} exited with ${result.status ?? "an unknown status"}`);
    }
}

function shellQuote(value) {
    return `'${value.replaceAll("'", "'\\''")}'`;
}

/** Run a configure-style script through bash, including on Windows runners. */
export function shellScript(script, args = [], options = {}) {
    const command = [script, ...args.map(shellQuote)].join(" ");
    run("bash", ["-lc", command], options);
}

export function gitCheckout({ url, commit, destination }) {
    rmSync(destination, { recursive: true, force: true });
    mkdirSync(destination, { recursive: true });
    run("git", ["init", "--quiet", destination]);
    run("git", ["-C", destination, "remote", "add", "origin", url]);
    run("git", ["-C", destination, "fetch", "--quiet", "--depth", "1", "origin", commit]);
    run("git", ["-C", destination, "checkout", "--quiet", "FETCH_HEAD"]);
    const head = spawnSync("git", ["-C", destination, "rev-parse", "HEAD"], {
        encoding: "utf8",
    });
    if (head.status !== 0 || head.stdout.trim() !== commit) {
        throw new Error(`checkout ${url} did not resolve ${commit}`);
    }
    return destination;
}

export async function fetchText(url) {
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
        throw new Error(`${url} returned HTTP ${response.status}`);
    }
    return response.text();
}

export async function download({ url, destination, sha256 = null }) {
    mkdirSync(dirname(destination), { recursive: true });
    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok || response.body === null) {
        throw new Error(`${url} returned HTTP ${response.status}`);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (sha256 !== null) {
        const actual = createHash("sha256").update(bytes).digest("hex");
        if (actual !== sha256) {
            throw new Error(`${url} checksum mismatch: expected ${sha256}, got ${actual}`);
        }
    }
    writeFileSync(destination, bytes);
    return destination;
}

export function extract(archive, directory) {
    mkdirSync(directory, { recursive: true });
    if (/\.(?:zip|whl)$/iu.test(archive)) {
        if (process.platform === "win32") {
            const quote = (value) => `'${value.replaceAll("'", "''")}'`;
            run("powershell", [
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                `Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::ExtractToDirectory(${quote(archive)}, ${quote(directory)})`,
            ]);
        } else {
            run("unzip", ["-q", archive, "-d", directory]);
        }
        return directory;
    }
    if (/\.7z$/iu.test(archive)) {
        run("7z", ["x", "-y", `-o${directory}`, archive]);
        return directory;
    }
    // GNU tar treats `P:\path` as a remote host and cannot translate a Windows drive
    // path passed to `-C`. Extract relative to the archive's directory instead.
    const base = dirname(archive);
    const destination = relative(base, directory) || ".";
    run("tar", ["-xf", basename(archive), "-C", destination], { cwd: base });
    return directory;
}

export function copy(source, destination) {
    if (!existsSync(source)) {
        throw new Error(`missing staged file: ${source}`);
    }
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(source, destination, { recursive: true, dereference: true });
}

export function stageFile(source, outputDir, relativePath) {
    const destination = join(outputDir, relativePath);
    copy(source, destination);
    if (process.platform !== "win32" && !relativePath.endsWith(".dll")) {
        try {
            chmodSync(destination, 0o755);
        } catch {
            // A library may not need the executable bit; a failed chmod is not a build error.
        }
    }
    return destination;
}

export function stageTree(source, outputDir, relativePath) {
    copy(source, join(outputDir, relativePath));
}

export function findFirst(root, predicate) {
    if (!existsSync(root)) {
        return null;
    }
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        if (entry.isDirectory()) {
            const found = findFirst(path, predicate);
            if (found !== null) {
                return found;
            }
        } else if (entry.isSymbolicLink()) {
            // Build trees commonly leave `libfoo.so` as a symlink to `libfoo.so.5`.
            // Recipes stage the canonical name, so follow the link for inspection and let
            // `cpSync({ dereference: true })` copy the target bytes.
            if (predicate(path, entry.name) && statSync(path).isFile()) {
                return path;
            }
        } else if (entry.isFile() && predicate(path, entry.name)) {
            return path;
        }
    }
    return null;
}

export function requireFile(root, predicate, description) {
    const found = findFirst(root, predicate);
    if (found === null) {
        throw new Error(`did not produce ${description} under ${root}`);
    }
    return found;
}

export function cmakeBuild({
    source,
    buildDir,
    prefix,
    configureArgs = [],
    buildArgs = [],
    target = null,
    jobs = null,
}) {
    rmSync(buildDir, { recursive: true, force: true });
    mkdirSync(buildDir, { recursive: true });
    run("cmake", [
        "-S",
        source,
        "-B",
        buildDir,
        "-DCMAKE_BUILD_TYPE=Release",
        `-DCMAKE_INSTALL_PREFIX=${prefix}`,
        ...configureArgs,
    ]);
    const parallel = jobs === null ? ["--parallel"] : ["--parallel", String(jobs)];
    run("cmake", [
        "--build",
        buildDir,
        "--config",
        "Release",
        ...(target === null ? [] : ["--target", target]),
        ...parallel,
        ...buildArgs,
    ]);
    return buildDir;
}

export function cmakeInstall(buildDir, prefix, extraArgs = []) {
    run("cmake", ["--install", buildDir, "--config", "Release", "--prefix", prefix, ...extraArgs]);
}

export function make(source, jobs = null) {
    const args = ["-C", source];
    if (jobs !== null) {
        args.push(`-j${String(jobs)}`);
    }
    run("make", args);
}

export function makeConfigured(source, jobs = null) {
    const args = ["-j"];
    if (jobs !== null) {
        args.push(String(jobs));
    }
    run("make", args, { cwd: source });
}

export function mesonBuild({ source, buildDir, prefix, args = [], target = null }) {
    rmSync(buildDir, { recursive: true, force: true });
    run("meson", ["setup", buildDir, source, "--buildtype=release", `--prefix=${prefix}`, ...args]);
    run("ninja", ["-C", buildDir, ...(target === null ? [] : [target])]);
    run("meson", ["install", "-C", buildDir]);
    return buildDir;
}

export function removeIfPresent(root, relativePath) {
    rmSync(join(root, relativePath), { recursive: true, force: true });
}

export function sizeOf(root) {
    if (!existsSync(root)) {
        return 0;
    }
    let total = 0;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        const path = join(root, entry.name);
        total += entry.isDirectory() ? sizeOf(path) : statSync(path).size;
    }
    return total;
}

export function manifestVariables(component) {
    return component.build?.variables ?? {};
}

export function targetDirectoryName(target) {
    return target === "x86_64-pc-windows-msvc"
        ? "windows"
        : target.includes("apple")
          ? "macos"
          : "linux";
}

export function writeMarker(directory, value) {
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "recipe.json"), `${JSON.stringify(value, null, 4)}\n`, "utf8");
}

export function sourceArchiveName(url) {
    return basename(new URL(url).pathname);
}

export function relativeTo(root, path) {
    return relative(root, path).split("\\").join("/");
}
