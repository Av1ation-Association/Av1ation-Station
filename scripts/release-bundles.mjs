// Keep bundled and system release builds on the same channel shape.
//
// Tauri's WiX bundler accepts only numeric prerelease identifiers, so an RC or weekly
// version cannot use the Windows `all` target. Stable releases get MSI and NSIS; the other
// release channels get NSIS only, and the release collector adds the portable ZIP for both.
const platformDefaults = {
    darwin: ["dmg", "app"],
    linux: ["deb", "rpm", "appimage"],
    win32: ["msi", "nsis"],
};

function normalizeRequested(requested) {
    if (requested === undefined) {
        return undefined;
    }
    const values = Array.isArray(requested)
        ? requested
        : String(requested)
              .split(",")
              .map((value) => value.trim());
    const filtered = values.map((value) => value.trim()).filter(Boolean);
    if (filtered.length === 1 && filtered[0] === "all") {
        return "all";
    }
    return filtered.length === 0 ? undefined : filtered;
}

/** Choose Tauri bundle targets for the host platform and the version's release channel. */
export function selectBundleTargets({ platform = process.platform, version, requested } = {}) {
    const prerelease = String(version ?? "").includes("-");
    const defaults = platformDefaults[platform] ?? platformDefaults.linux;
    const configured =
        normalizeRequested(requested) ?? (platform === "win32" && prerelease ? ["nsis"] : defaults);
    if (platform === "win32" && prerelease && configured === "all") {
        return ["nsis"];
    }
    return configured;
}
