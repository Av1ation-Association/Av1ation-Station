import { delimiter } from "node:path";

const gitBashBinaries = /[\\/](?:Git[\\/])?(?:usr|mingw64)[\\/]bin[\\/]?$/iu;

/** Return a PATH that does not put Git Bash's `link.exe` ahead of MSVC's linker. */
export function sanitizedPath(platform = process.platform, value = process.env.PATH ?? "") {
    return value
        .split(delimiter)
        .filter(
            (entry) => entry.length > 0 && (platform !== "win32" || !gitBashBinaries.test(entry)),
        )
        .join(delimiter);
}
