// Decide whether this week's tested HEAD should get a weekly release tag.
//
// The workflow calls this after every weekly job passes. The decision is deliberately
// separate from tag creation: it is pure enough to test, refuses an invalid base version,
// never moves an existing tag, and skips a documentation-only week. The caller creates the
// tag and dispatches release.yml only when `skip` is false.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { projectRoot } from "./build-paths.mjs";

const BASE_VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const WEEKLY_TAG =
    /^v(?<base>(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))-weekly\.(?<date>\d{8})$/u;

export function isCalendarDate(value) {
    if (typeof value !== "string" || !/^\d{8}$/u.test(value)) {
        return false;
    }
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6));
    const day = Number(value.slice(6, 8));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}

function assertBaseVersion(baseVersion) {
    if (typeof baseVersion !== "string" || !BASE_VERSION.test(baseVersion)) {
        throw new Error(
            `weekly releases need a stable package version, got ${JSON.stringify(baseVersion)}`,
        );
    }
    return baseVersion;
}

function assertDate(date) {
    if (!isCalendarDate(date)) {
        throw new Error(
            `weekly release date must be a real UTC date in YYYYMMDD form, got ${JSON.stringify(date)}`,
        );
    }
    return date;
}

export function weeklyTagFor({ baseVersion, date }) {
    return `v${assertBaseVersion(baseVersion)}-weekly.${assertDate(date)}`;
}

/** True for the documentation-only paths the weekly policy allows to skip a release. */
export function isDocumentationPath(path) {
    const normalized = path.replaceAll("\\", "/");
    return normalized.startsWith("docs/") || normalized.endsWith(".md");
}

/** Choose the newest existing weekly tag by its date suffix. */
export function selectPreviousWeeklyTag(tags) {
    let selected = null;
    for (const tag of tags) {
        const match = WEEKLY_TAG.exec(tag);
        if (match === null) {
            continue;
        }
        if (selected === null || match.groups.date > selected.date) {
            selected = { tag, date: match.groups.date, base: match.groups.base };
        }
    }
    return selected;
}

/**
 * Review a candidate without touching git.
 *
 * `tags` must include existing local tags; `changedPaths` must be the paths changed from
 * the previous weekly tag to the tested HEAD. An existing tag for the date always wins,
 * even if it points at another commit: release tags are immutable.
 */
export function reviewWeeklyRelease({ baseVersion, date, head, tags = [], changedPaths = [] }) {
    const tag = weeklyTagFor({ baseVersion, date });
    if (typeof head !== "string" || head.trim() === "") {
        throw new Error("a tested HEAD commit is required");
    }
    const existingToday = tags.filter((candidate) => {
        const match = WEEKLY_TAG.exec(candidate);
        return match !== null && match.groups.date === date;
    });
    if (existingToday.length > 0) {
        return {
            tag: existingToday[0],
            head: head.trim(),
            skip: true,
            reason: `a weekly tag already exists for ${date}`,
            previous_tag: selectPreviousWeeklyTag(tags)?.tag ?? null,
            changed_paths: changedPaths.length,
            code_paths: [],
        };
    }

    const previous = selectPreviousWeeklyTag(tags);
    const codePaths = changedPaths.filter((path) => !isDocumentationPath(path));
    if (previous !== null && codePaths.length === 0) {
        return {
            tag,
            head: head.trim(),
            skip: true,
            reason:
                changedPaths.length === 0
                    ? `no changes since ${previous.tag}`
                    : `only documentation changed since ${previous.tag}`,
            previous_tag: previous.tag,
            changed_paths: changedPaths.length,
            code_paths: [],
        };
    }

    return {
        tag,
        head: head.trim(),
        skip: false,
        reason:
            previous === null
                ? "no earlier weekly tag"
                : `${String(codePaths.length)} non-documentation path(s) changed since ${previous.tag}`,
        previous_tag: previous?.tag ?? null,
        changed_paths: changedPaths.length,
        code_paths: codePaths,
    };
}

function git(root, args) {
    return execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
    }).trim();
}

function readBaseVersion(root) {
    const packagePath = join(root, "package.json");
    if (!existsSync(packagePath)) {
        throw new Error(`missing ${packagePath}`);
    }
    const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
    return assertBaseVersion(pkg.version);
}

function utcDate() {
    return new Date().toISOString().slice(0, 10).replaceAll("-", "");
}

function requiredValue(argv, index, option) {
    const value = argv[index + 1];
    if (typeof value !== "string" || value.trim() === "" || value.startsWith("--")) {
        throw new Error(`${option} must be followed by a value`);
    }
    return value.trim();
}

function parseCli(argv) {
    const options = {
        root: projectRoot,
        date: utcDate(),
        json: undefined,
        githubOutput: undefined,
        help: false,
    };
    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        switch (argument) {
            case "--root":
                options.root = requiredValue(argv, index, "--root");
                index += 1;
                break;
            case "--date":
                options.date = requiredValue(argv, index, "--date");
                index += 1;
                break;
            case "--json":
                options.json = requiredValue(argv, index, "--json");
                index += 1;
                break;
            case "--github-output":
                options.githubOutput = requiredValue(argv, index, "--github-output");
                index += 1;
                break;
            case "--help":
                options.help = true;
                break;
            default:
                throw new Error(`Unknown argument: ${argument}`);
        }
    }
    return options;
}

function plan(root, date) {
    const baseVersion = readBaseVersion(root);
    assertDate(date);
    const head = git(root, ["rev-parse", "HEAD"]);
    const tags = git(root, ["tag", "--list", "v*-weekly.*"])
        .split("\n")
        .map((tag) => tag.trim())
        .filter((tag) => tag !== "");
    const previous = selectPreviousWeeklyTag(tags);
    const changedPaths =
        previous === null
            ? []
            : git(root, ["diff", "--name-only", previous.tag, head, "--"])
                  .split("\n")
                  .map((path) => path.trim())
                  .filter((path) => path !== "");
    return reviewWeeklyRelease({ baseVersion, date, head, tags, changedPaths });
}

function writeGithubOutput(path, result) {
    const values = {
        tag: result.tag,
        skip: String(result.skip),
        reason: result.reason,
        previous_tag: result.previous_tag ?? "",
        head: result.head,
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
        path,
        `${Object.entries(values)
            .map(([key, value]) => `${key}=${String(value).replaceAll("\n", " ")}`)
            .join("\n")}\n`,
        { encoding: "utf8", flag: "a" },
    );
}

function main() {
    const options = parseCli(process.argv.slice(2));
    if (options.help) {
        console.log(`Usage: npm run release:weekly-tag -- [options]

Decide whether the tested HEAD should receive a weekly release tag.

Options:
  --date <YYYYMMDD>       Candidate date (default: current UTC date)
  --root <dir>            Repository root (default: ${projectRoot})
  --json <path>           Write the decision as JSON
  --github-output <path>  Append tag, skip, reason and head for a workflow step
  --help                  Show this help`);
        return;
    }
    const root = resolve(options.root);
    const result = plan(root, options.date);
    if (options.json !== undefined) {
        const jsonPath = resolve(root, options.json);
        mkdirSync(dirname(jsonPath), { recursive: true });
        writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    }
    if (options.githubOutput !== undefined) {
        writeGithubOutput(resolve(root, options.githubOutput), result);
    }
    console.log(
        result.skip
            ? `weekly tag skipped: ${result.reason}`
            : `weekly tag candidate: ${result.tag} at ${result.head}`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main();
    } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
    }
}
