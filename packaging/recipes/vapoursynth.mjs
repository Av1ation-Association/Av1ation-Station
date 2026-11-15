// CPython, VapourSynth and the JET plugin set are one runtime.
//
// The interpreter is python-build-standalone's `install_only` tree. VapourSynth and
// vsjetpack are installed into that interpreter with a hash-checked source tree, and the
// vs-wheels index is supplied explicitly because `vapoursynth-ffms2` is not published on
// PyPI. That package is the VapourSynth source plugin; it is unrelated to the native FFMS2
// library built by `ffms2.mjs`.
import { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { download, extract, findFirst, platform, run, stageTree } from "./lib.mjs";

const CUSTOM_INDEX = "https://jaded-encoding-thaumaturgy.github.io/vs-wheels/simple";

const cpython = {
    "x86_64-pc-windows-msvc": {
        url: "https://github.com/astral-sh/python-build-standalone/releases/download/20261110/cpython-3.14.10%2B20261110-x86_64-pc-windows-msvc-install_only.tar.gz",
        sha256: "b9bee0a6f590914a495a8305701951e543b4475bb620d11661b49052b990456b",
    },
    "aarch64-apple-darwin": {
        url: "https://github.com/astral-sh/python-build-standalone/releases/download/20261110/cpython-3.14.10%2B20261110-aarch64-apple-darwin-install_only.tar.gz",
        sha256: "42031ed5f0d38777335252c8c77d64708c8010dd67c128246bdec25000672666",
    },
    "x86_64-apple-darwin": {
        url: "https://github.com/astral-sh/python-build-standalone/releases/download/20261110/cpython-3.14.10%2B20261110-x86_64-apple-darwin-install_only.tar.gz",
        sha256: "f6c82fcf867b4aaadd373ac97699ad95fbb9c96f9ecf9b25775943aa5458b87f",
    },
    "x86_64-unknown-linux-gnu": {
        url: "https://github.com/astral-sh/python-build-standalone/releases/download/20261110/cpython-3.14.10%2B20261110-x86_64-unknown-linux-gnu-install_only.tar.gz",
        sha256: "3fe0d7c0538eb5d190c34582992d26230532551355cbd789fabc6591621cfc07",
    },
};

function pythonPath(root, target) {
    return platform(target) === "win32"
        ? join(root, "python", "python.exe")
        : join(root, "python", "bin", "python3");
}

function sitePackages(root, target) {
    return platform(target) === "win32"
        ? join(root, "python", "Lib", "site-packages")
        : join(root, "python", "lib", "python3.14", "site-packages");
}

function trimTree(root) {
    const remove = [
        "Lib/ensurepip",
        "Lib/idlelib",
        "Lib/test",
        "Lib/turtledemo",
        "Lib/venv",
        "lib/python3.14/ensurepip",
        "lib/python3.14/idlelib",
        "lib/python3.14/test",
        "lib/python3.14/turtledemo",
        "lib/python3.14/venv",
        "Scripts",
        "bin/pip",
        "bin/pip3",
        "bin/pip3.14",
        "bin/vapoursynth",
        "bin/vspipe",
    ];
    for (const relative of remove) {
        rmSync(join(root, relative), { recursive: true, force: true });
    }
    for (const directory of ["Lib/site-packages", "lib/python3.14/site-packages"]) {
        const packages = join(root, directory);
        if (!existsSync(packages)) {
            continue;
        }
        for (const name of [
            "pip",
            "pip-*",
            "setuptools",
            "pkg_resources",
            "hatchling",
            "hatch_fancy_pypi_readme",
            "meson-python",
            "meson_python",
            "mesonbuild",
            "scikit_build_core",
            "scikit-build-core",
            "setuptools_rust",
            "wheel",
            "__pycache__",
        ]) {
            for (const entry of readdirSync(packages, { withFileTypes: true })) {
                if (entry.name.startsWith(name.replace("*", ""))) {
                    rmSync(join(packages, entry.name), {
                        recursive: true,
                        force: true,
                    });
                }
            }
        }
    }
    const files = [];
    const walk = (directory) => {
        if (!existsSync(directory)) {
            return;
        }
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
            const path = join(directory, entry.name);
            if (entry.isDirectory()) {
                walk(path);
            } else if (/\.(?:pdb|a|lib)$/iu.test(entry.name)) {
                files.push(path);
            }
        }
    };
    walk(root);
    for (const file of files) {
        rmSync(file, { force: true });
    }
}

export default async function build({ target, workDir, outputDir, component, log }) {
    const source = cpython[target];
    if (source === undefined) {
        throw new Error(`no python-build-standalone archive for ${target}`);
    }
    const variables = component.build?.variables ?? {};
    const vsjetpack = variables.vsjetpack;
    const ffms2 = variables.vapoursynth_ffms2;
    if (vsjetpack === undefined || ffms2 === undefined) {
        throw new Error("vapoursynth recipe requires vsjetpack and vapoursynth_ffms2 variables");
    }

    const archive = join(workDir, "python.tar.gz");
    await download({ url: source.url, destination: archive, sha256: source.sha256 });
    const unpacked = join(workDir, "python-unpacked");
    extract(archive, unpacked);
    const root = join(outputDir, "python");
    stageTree(join(unpacked, "python"), outputDir, "python");

    const python = pythonPath(outputDir, target);
    const packages = sitePackages(outputDir, target);
    if (!existsSync(python)) {
        throw new Error(`the python-build-standalone tree has no interpreter: ${python}`);
    }
    log(`installing VapourSynth and vsjetpack ${vsjetpack} from PyPI and vs-wheels`);
    run(python, [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-cache-dir",
        "--no-input",
        "--no-warn-script-location",
        "--extra-index-url",
        CUSTOM_INDEX,
        "vapoursynth==82",
        `vapoursynth-ffms2==${ffms2}`,
    ]);
    // The macOS x64 plugin set has sdists but no wheels for a few plugins. Install the core
    // first so a source build can find the VapourSynth headers and library, and keep the
    // build backends in the environment for the non-isolated build.
    run(python, [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-cache-dir",
        "--no-input",
        "--no-warn-script-location",
        "--prefer-binary",
        "setuptools",
        "setuptools-scm",
        "wheel",
        "hatchling",
        "hatch-fancy-pypi-readme",
        "meson-python",
        "scikit-build-core",
        "setuptools-rust",
    ]);
    run(python, [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-cache-dir",
        "--no-input",
        "--no-warn-script-location",
        "--prefer-binary",
        "--no-build-isolation",
        "--extra-index-url",
        CUSTOM_INDEX,
        `vsjetpack[full,gpu,cl,vulkan]==${vsjetpack}`,
    ]);
    trimTree(root);

    const vsscript = findFirst(packages, (path) =>
        /(?:^|[\\/])(?:vsscript|libvsscript)\.(?:dll|dylib|so)$/u.test(path),
    );
    if (vsscript === null) {
        throw new Error(`VapourSynth installed without VSScript under ${packages}`);
    }
    const required = ["vapoursynth", "vsjetpack", "vstools", "vskernels"];
    for (const name of required) {
        if (!existsSync(join(packages, name))) {
            throw new Error(`the VapourSynth environment is missing ${name} under ${packages}`);
        }
    }
    log(`staged ${root} (${target})`);
}
