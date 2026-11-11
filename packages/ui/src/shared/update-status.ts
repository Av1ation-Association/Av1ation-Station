import type { UpdateStatus } from "@av1ation/contracts";

/** What the About screen can say about this build against the newest release. */
export type UpdateVerdict =
    | { kind: "newer"; latest: string; url: string | null }
    | { kind: "current"; latest: string }
    | { kind: "ahead"; latest: string }
    | { kind: "unreleased" };

/** A numeric version core, with pre-release sort last so `1.0.0` beats `1.0.0-rc1`. */
function core(value: string): { numbers: number[]; prerelease: boolean } {
    const [main = "", ...rest] = value.trim().split("-");
    return {
        numbers: main.split(".").map((part) => {
            const parsed = Number.parseInt(part, 10);
            return Number.isFinite(parsed) ? parsed : 0;
        }),
        prerelease: rest.length > 0,
    };
}

/** Compare two release versions: negative when `left` is older, positive when newer. */
export function compareVersions(left: string, right: string): number {
    const a = core(left);
    const b = core(right);
    const width = Math.max(a.numbers.length, b.numbers.length);
    for (let index = 0; index < width; index += 1) {
        const difference = (a.numbers[index] ?? 0) - (b.numbers[index] ?? 0);
        if (difference !== 0) {
            return difference < 0 ? -1 : 1;
        }
    }
    if (a.prerelease === b.prerelease) {
        return 0;
    }
    return a.prerelease ? -1 : 1;
}

/**
 * The verdict the screen shows.
 *
 * A repository with no published release is a normal answer, not an outdated build: the tag
 * is what a release page is named after, so there is nothing to compare and nothing to link.
 */
export function verdictFor(status: UpdateStatus): UpdateVerdict {
    const latest = status.latest;
    if (latest === undefined || latest === null || latest === "") {
        return { kind: "unreleased" };
    }
    const order = compareVersions(status.current, latest);
    if (order < 0) {
        return { kind: "newer", latest, url: status.url ?? null };
    }
    if (order > 0) {
        return { kind: "ahead", latest };
    }
    return { kind: "current", latest };
}

/** A coarse age for "Last checked …", or `null` when the timestamp cannot be read. */
export function relativeTime(iso: string, now: Date = new Date()): string | null {
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) {
        return null;
    }
    const seconds = Math.round((now.getTime() - then) / 1000);
    if (seconds < 0) {
        return "just now";
    }
    if (seconds < 60) {
        return "just now";
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
        return `${String(minutes)} ${minutes === 1 ? "minute" : "minutes"} ago`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        return `${String(hours)} ${hours === 1 ? "hour" : "hours"} ago`;
    }
    const days = Math.floor(hours / 24);
    return `${String(days)} ${days === 1 ? "day" : "days"} ago`;
}
