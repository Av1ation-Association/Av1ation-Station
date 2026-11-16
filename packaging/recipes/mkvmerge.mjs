import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { basename, join } from "node:path";

import {
    executable,
    gitCheckout,
    platform,
    requireFile,
    run,
    shellScript,
    stageFile,
} from "./lib.mjs";

/**
 * Resolve an MSYS2 tool from the prefix the builder installed. The build job puts the
 * UCRT64 tree on PATH, but Git for Windows also ships `ldd` and `cygpath`; invoking the
 * action's own copy keeps `/ucrt64` mapped through the tree the muxer was built against.
 */
function msys2Tool(name) {
    const location = process.env.MSYS2_LOCATION;
    if (location) {
        const candidate = join(location, "usr", "bin", `${name}.exe`);
        if (existsSync(candidate)) {
            return candidate;
        }
    }
    return name;
}

function lddOutput(binary) {
    const result = spawnSync(msys2Tool("ldd"), [binary], { encoding: "utf8" });
    if (result.error) {
        throw new Error(`ldd could not start: ${result.error.message}`);
    }
    if (result.status !== 0) {
        const output = `${result.stdout}${result.stderr}`.trim();
        if (/not a dynamic executable|not a valid Win32 application/iu.test(output)) {
            return "";
        }
        throw new Error(`ldd ${binary} exited with ${String(result.status)}: ${output}`);
    }
    return result.stdout;
}

function directDependencies(binary) {
    const dependencies = [];
    for (const line of lddOutput(binary).split(/\r?\n/u)) {
        const missing = /^\s*(\S+)\s*=>\s*not found\b/iu.exec(line);
        if (missing !== null) {
            throw new Error(`${binary} cannot find ${missing[1]}`);
        }
        const match = /^\s*\S+\s*=>\s*(.+?)\s*(?:\(0x[0-9a-f]+\))?\s*$/iu.exec(line);
        if (match !== null) {
            dependencies.push(match[1].trim());
        }
    }
    return dependencies;
}

function windowsPath(value) {
    const result = spawnSync(msys2Tool("cygpath"), ["-w", value], { encoding: "utf8" });
    if (result.error) {
        throw new Error(`cygpath could not start: ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`cygpath could not resolve ${value}: ${result.stderr.trim()}`);
    }
    return result.stdout.trim().replaceAll("\\", "/");
}

/**
 * Stage the complete PE dependency closure beside the executable. The Windows loader only
 * searches the executable's directory, system directories and PATH, so a copied mkvmerge.exe
 * is not runnable on a clean machine until its Qt, Boost, MinGW and support DLLs travel with
 * it. System DLLs stay with Windows; every other dependency must live under the MSYS2 UCRT64
 * prefix, which is the tree the recipe built against.
 */
function stageWindowsRuntime(binary, outputDir, root, log) {
    const normalizedRoot = windowsPath(root)
        .replaceAll("\\", "/")
        .replace(/\/$/u, "")
        .toLowerCase();
    const seen = new Set();
    const queue = [binary];
    const dependencies = [];
    while (queue.length > 0) {
        const current = queue.shift();
        for (const dependency of directDependencies(current)) {
            const resolved = windowsPath(dependency);
            const normalized = resolved.toLowerCase();
            if (/^[a-z]:\/windows(?:\/|$)/iu.test(normalized)) {
                continue;
            }
            if (normalized !== normalizedRoot && !normalized.startsWith(`${normalizedRoot}/`)) {
                throw new Error(
                    `${current} depends on ${resolved}, which is outside the MSYS2 UCRT64 prefix ${root}`,
                );
            }
            const name = basename(resolved);
            const key = name.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            dependencies.push({ name, path: resolved });
            queue.push(resolved);
        }
    }
    for (const dependency of dependencies.sort((left, right) =>
        left.name.localeCompare(right.name),
    )) {
        stageFile(dependency.path, outputDir, `bin/${dependency.name}`);
    }
    log(`staged ${String(dependencies.length)} runtime DLL(s) beside ${basename(binary)}`);
}

export default async function build({ target, workDir, outputDir, component, log = () => {} }) {
    const source = join(workDir, "src");
    gitCheckout({
        url: component.source.url,
        commit: component.source.commit,
        destination: source,
    });
    // MKVToolNix 103 requires libEBML 1.4.7, which is newer than the Ubuntu 24.04
    // system package; use the release's pinned submodules instead.
    run("git", ["-C", source, "submodule", "update", "--init", "--recursive", "--depth", "1"]);
    if (!existsSync(join(source, "configure"))) {
        shellScript("./autogen.sh", [], { cwd: source });
    }
    // The commit-only checkout has no tag objects, so upstream's `git describe` cannot
    // produce a version suffix anyway. Removing the metadata before rake also keeps it from
    // spawning git inside zsh, where the Git for Windows entry is not on PATH; configure's
    // pinned PACKAGE_VERSION is the complete version for this release build.
    rmSync(join(source, ".git"), { recursive: true, force: true });
    const args = ["--disable-gui", "--disable-update-check"];
    const windows = platform(target) === "win32";
    const prefix = process.env.MINGW_PREFIX ?? "/ucrt64";
    const location = process.env.MSYS2_LOCATION;
    const root =
        windows && location && prefix.startsWith("/")
            ? `${location.replaceAll("\\", "/").replace(/\/+$/u, "")}${prefix}`
            : prefix;
    if (windows) {
        // AX_BOOST_BASE searches /usr, /usr/local, /opt, and /opt/local; it does not
        // discover MSYS2's UCRT64 prefix from the compiler's default include path. Pass
        // the MSYS-style prefix, not the drive-letter path: the Boost macro strips the
        // first non-slash run from -L, which would drop a Windows drive letter.
        args.push(
            "--host=x86_64-w64-mingw32",
            `--with-boost=${prefix}`,
            `--with-boost-libdir=${prefix}/lib`,
            // MSYS2 names the library `libboost_filesystem-mt`; name the stem explicitly
            // instead of relying on autoconf's directory probing to discover the suffix.
            "--with-boost-filesystem=boost_filesystem-mt",
        );
    }
    if (platform(target) === "darwin" && process.env.QMAKE6) {
        args.push(`--with-qmake6=${process.env.QMAKE6}`);
    }
    if (platform(target) === "darwin" && process.env.BOOST_ROOT) {
        args.push(`--with-boost=${process.env.BOOST_ROOT}`);
    }
    if (platform(target) === "darwin" && process.env.DOCBOOK_ROOT) {
        args.push(`--with-docbook-xsl-root=${process.env.DOCBOOK_ROOT}`);
    }
    const env = {};
    if (windows) {
        // MKVToolNix's Qt check assumes qmake emits POSIX include paths. MSYS2's
        // qmake emits drive-letter paths, which its cleanup strips as if relative;
        // supplying the UCRT64 headers through CPPFLAGS fixes both the check and
        // the resulting USER_CPPFLAGS used by rake.
        env.CPPFLAGS = [
            process.env.CPPFLAGS,
            `-I${root}/include/qt6`,
            `-I${root}/include/qt6/QtCore`,
        ]
            .filter(Boolean)
            .join(" ");
    }
    shellScript("./configure", args, { cwd: source, env });
    // RubyInstaller exposes rake as a .bat wrapper, which CreateProcess cannot execute
    // directly; let cmd resolve it through PATHEXT on Windows. The Windows MSIX asset
    // generator is a zsh script (it uses `setopt`), so make rake's child shell zsh as
    // well; plain sh would fail halfway through the default target.
    if (windows) {
        run("cmd", ["/c", "rake", "-j", "4"], {
            cwd: source,
            env: { RUBYSHELL: "zsh" },
        });
    } else {
        run("rake", ["-j", "4"], { cwd: source });
    }
    const name = executable(target, "mkvmerge");
    const binary = requireFile(
        source,
        (path) => path.endsWith(`/${name}`) || path.endsWith(`\\${name}`),
        name,
    );
    stageFile(binary, outputDir, `bin/${name}`);
    if (windows) {
        stageWindowsRuntime(binary, outputDir, root, log);
    }
}
