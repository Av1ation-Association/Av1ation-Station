export type Platform = "windows" | "macos" | "linux";

export const PLATFORM_LABELS: Record<Platform, string> = {
    windows: "Windows",
    macos: "macOS",
    linux: "Linux",
};

/**
 * The visitor's desktop platform, from the client hints when a browser has them and the
 * user-agent string otherwise. Tablets and phones report macOS here because the current
 * release has no mobile build at all; the download section says so rather than guessing.
 */
export function detectPlatform(): Platform | null {
    if (typeof navigator === "undefined") {
        return null;
    }
    const data = navigator as Navigator & { userAgentData?: { platform?: string } };
    const value = `${data.userAgentData?.platform ?? ""} ${navigator.platform} ${navigator.userAgent}`;
    if (/mac|iphone|ipad|ipod/i.test(value)) {
        return "macos";
    }
    if (/linux|x11/i.test(value) && !/android/i.test(value)) {
        return "linux";
    }
    if (/win/i.test(value)) {
        return "windows";
    }
    return null;
}
