// The VapourSynth ffms2 source plugin is not the native FFMS2 library.
//
// It is published by Jaded-Encoding-Thaumaturgy on the vs-wheels simple index, not PyPI,
// and is consumed by vsjetpack's `source`/`full` extras. This recipe fetches the wheel for
// the target directly from that index and stages only the plugin payload; the Python
// runtime component owns everything else in the same tree.
import { join } from "node:path";

import { download, extract, findFirst, platform, stageFile } from "./lib.mjs";

const INDEX = "https://jaded-encoding-thaumaturgy.github.io/vs-wheels/simple";

function wheelTag(target) {
    if (target === "x86_64-pc-windows-msvc") {
        return "win_amd64";
    }
    if (target === "aarch64-apple-darwin") {
        return "macosx_13_0_arm64";
    }
    return "manylinux_2_28_x86_64";
}

function pluginName(target) {
    if (platform(target) === "win32") {
        return /(?:^|[\\/])ffms2\.dll$/u;
    }
    if (platform(target) === "darwin") {
        return /(?:^|[\\/])(?:lib)?ffms2\.dylib$/u;
    }
    return /(?:^|[\\/])(?:lib)?ffms2\.so$/u;
}

export default async function build({ target, workDir, outputDir, component, log }) {
    const version = component.source.version;
    const indexUrl = `${INDEX}/vapoursynth-ffms2/`;
    const response = await fetch(indexUrl, { redirect: "follow" });
    if (!response.ok) {
        throw new Error(`${indexUrl} returned HTTP ${response.status}`);
    }
    const page = await response.text();
    const tag = wheelTag(target);
    const candidates = [...page.matchAll(/href="([^"]+)"/gu)]
        .map((match) => match[1])
        .map((href) => ({ href, url: new URL(href, `${indexUrl}/`), name: "" }))
        .map((candidate) => ({
            ...candidate,
            name: candidate.url.pathname.split("/").pop() ?? "",
        }))
        .filter(({ name }) => {
            return (
                name.startsWith(`vapoursynth_ffms2-${version}-`) &&
                name.endsWith(".whl") &&
                name.includes(tag)
            );
        })
        .sort((left, right) => left.name.localeCompare(right.name));
    if (candidates.length === 0) {
        throw new Error(
            `vs-wheels has no vapoursynth-ffms2 ${version} wheel for ${target} (${tag})`,
        );
    }
    const wheelUrl = candidates[0].url.href;
    const expected = candidates[0].url.hash.match(/^#sha256=([a-f0-9]{64})$/u)?.[1];
    log(`fetching ${wheelUrl}`);
    const wheel = join(workDir, "vapoursynth_ffms2.whl");
    await download({ url: wheelUrl, destination: wheel, sha256: expected ?? null });
    const unpacked = join(workDir, "wheel");
    extract(wheel, unpacked);
    const plugin = findFirst(unpacked, (path) => pluginName(target).test(path));
    if (plugin === null) {
        throw new Error(`the ${version} wheel contains no ffms2 plugin for ${target}`);
    }
    const relative =
        platform(target) === "win32"
            ? "python/Lib/site-packages/vapoursynth/plugins"
            : "python/lib/python3.14/site-packages/vapoursynth/plugins";
    const filename =
        platform(target) === "win32"
            ? "ffms2.dll"
            : platform(target) === "darwin"
              ? "libffms2.dylib"
              : "libffms2.so";
    stageFile(plugin, outputDir, `${relative}/${filename}`);
}
