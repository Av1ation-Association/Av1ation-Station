import { existsSync } from "node:fs";
import { join } from "node:path";

import {
    download,
    extract,
    gitCheckout,
    library,
    makeConfigured,
    platform,
    requireFile,
    shellScript,
    stageFile,
} from "./lib.mjs";

export default async function build({ target, workDir, outputDir, component, log = () => {} }) {
    if (platform(target) === "win32") {
        const url = component.build?.variables?.windows_archive_url;
        const sha256 = component.build?.variables?.windows_archive_sha256;
        if (url === undefined || sha256 === undefined) {
            throw new Error("the Windows ffms2 archive URL and SHA-256 are required");
        }
        // The upstream MSVC build links FFmpeg and zlib into ffms2.dll. The MinGW build
        // produced by the old recipe imported avcodec-63.dll, libz-1.dll and the MinGW
        // runtime, but the toolchain only staged ffms2.dll itself, so a clean install
        // failed in the Windows loader before the app could start.
        const archive = join(workDir, "ffms2.7z");
        await download({ url, destination: archive, sha256 });
        const unpacked = join(workDir, "ffms2");
        extract(archive, unpacked);
        const binary = requireFile(
            unpacked,
            (path) => /(?:^|[\\/])x64[\\/]ffms2\.dll$/iu.test(path),
            "the x64 ffms2.dll",
        );
        stageFile(binary, outputDir, "lib/ffms2.dll");
        log("staged the self-contained MSVC ffms2.dll");
        return;
    }
    const source = join(workDir, "src");
    gitCheckout({
        url: component.source.url,
        commit: component.source.commit,
        destination: source,
    });
    if (!existsSync(join(source, "configure"))) {
        shellScript("./autogen.sh", [], { cwd: source });
    }
    const args = ["--enable-shared", "--disable-static", "--with-pic"];
    if (platform(target) === "win32") {
        args.push("--host=x86_64-w64-mingw32");
    }
    shellScript("./configure", args, { cwd: source });
    // ffmsindex uses wmain on Windows without adding -municode to its link flags;
    // only the shared library is bundled, so skip the indexer target there.
    makeConfigured(source, null, platform(target) === "win32" ? "src/core/libffms2.la" : null);
    const name = library(target, "ffms2");
    const binary = requireFile(
        source,
        (path) => {
            const filename = path.split(/[\\/]/u).pop() ?? "";
            return platform(target) === "win32"
                ? /^(?:lib)?ffms2(?:[-.][0-9]+)?\.dll$/iu.test(filename)
                : /^libffms2(?:\.[0-9]+)*\.(?:so(?:\.[0-9]+)*|dylib)$/u.test(filename);
        },
        name,
    );
    stageFile(binary, outputDir, `lib/${name}`);
}
