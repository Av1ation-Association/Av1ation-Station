// Check the documentation graph before it reaches a reviewer.
//
// Markdown links rot quietly: a renamed heading leaves every `#anchor` pointing at a
// section that no longer exists, and a duplicated heading makes two sections share one
// anchor. This checker resolves relative links, validates heading anchors, requires a
// complete `Contents` map in a long top-level reference document, and enforces the single
// owner for delivery status. External URLs are out of scope, so the check is deterministic
// and cannot fail because a vendor site is down.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKIP_DIRECTORIES = new Set([
    ".git",
    ".freebuff",
    "coverage",
    "dist",
    "node_modules",
    "playwright-report",
    "target",
    "test-results",
]);

/** Reference documents at or above this size must carry a Contents map. */
export const CONTENTS_MIN_HEADINGS = 6;

/** The banner every execution plan carries; delivery status belongs to progress.md. */
export const PLAN_BANNER =
    "> **Planning record.** Current delivery status lives in [progress.md](../progress.md).";

/** GitHub's heading slug for the subset of Markdown used by this repository. */
export function headingSlug(text) {
    return text
        .replace(/<[^>]*>/gu, "")
        .replace(/!\[([^\]]*)\]\([^)]*\)/gu, "$1")
        .replace(/\[([^\]]*)\]\([^)]*\)/gu, "$1")
        .replace(/[`*]/gu, "")
        .replace(/[^\p{L}\p{N}\s_-]/gu, "")
        .trim()
        .toLowerCase()
        .replace(/\s/gu, "-");
}

/** Remove fenced code and inline code so examples are never treated as links. */
export function proseOnly(markdown) {
    let fenced = false;
    return markdown
        .split(/\r?\n/u)
        .map((line) => {
            if (/^\s*(```|~~~)/u.test(line)) {
                fenced = !fenced;
                return "";
            }
            return fenced ? "" : line.replace(/`[^`]*`/gu, "");
        })
        .join("\n");
}

/** Remove fenced code but keep inline code; headings need the text inside a code span. */
function withoutFencedCode(markdown) {
    let fenced = false;
    return markdown
        .split(/\r?\n/u)
        .map((line) => {
            if (/^\s*(```|~~~)/u.test(line)) {
                fenced = !fenced;
                return "";
            }
            return fenced ? "" : line;
        })
        .join("\n");
}

/**
 * Collect the anchors a Markdown file exposes, and report duplicate headings.
 *
 * GitHub silently suffixes a duplicate with `-1`, which means a reader can never know which
 * section a `#anchor` will land on. A duplicate is a documentation defect, so it fails the
 * check instead of being hidden behind GitHub's fallback.
 */
export function documentAnchors(markdown) {
    const anchors = new Set();
    const duplicates = [];
    const text = withoutFencedCode(markdown);
    for (const line of text.split(/\r?\n/u)) {
        const heading = /^(#{1,6})\s+(.+?)\s*#*\s*$/u.exec(line);
        if (heading?.[2] !== undefined) {
            const slug = headingSlug(heading[2]);
            if (anchors.has(slug)) {
                duplicates.push(slug);
            }
            anchors.add(slug);
        }
        for (const match of line.matchAll(/<a\s+[^>]*\bid=["']([^"']+)["'][^>]*>/giu)) {
            if (match[1] !== undefined) {
                anchors.add(match[1]);
            }
        }
    }
    return { anchors, duplicates };
}

function h2Heading(line) {
    const match = /^##\s+(.+?)\s*#*\s*$/u.exec(line);
    return match?.[1] ?? null;
}

function headingLabel(heading) {
    return heading.replace(/[`*]/gu, "").trim();
}

/**
 * Check the Contents map of a long reference document against its H2 headings.
 *
 * The map must list every section in document order and link to the exact heading
 * anchor. This is deliberately separate from link checking: a Contents entry is a
 * same-file link, and an incomplete map is a defect even when every link it does contain
 * resolves.
 */
export function contentsErrors(markdown) {
    const lines = withoutFencedCode(markdown).split(/\r?\n/u);
    const headings = [];
    let contentsAt = -1;

    for (const [index, line] of lines.entries()) {
        const heading = h2Heading(line);
        if (heading === null) {
            continue;
        }
        if (heading === "Contents") {
            if (contentsAt === -1) {
                contentsAt = index;
            }
            continue;
        }
        headings.push(heading);
    }

    if (headings.length < CONTENTS_MIN_HEADINGS) {
        return [];
    }
    if (contentsAt === -1) {
        return [`missing Contents section (${String(headings.length)} H2 headings)`];
    }

    const entries = [];
    for (let index = contentsAt + 1; index < lines.length; index += 1) {
        const line = lines[index] ?? "";
        if (h2Heading(line) !== null) {
            break;
        }
        const trimmed = line.trim();
        if (trimmed === "") {
            continue;
        }
        const entry = /^-\s+\[([^\]]+)\]\(#([^)]+)\)$/u.exec(trimmed);
        if (entry?.[1] === undefined || entry[2] === undefined) {
            return [`Contents contains a line that is not a section link: ${trimmed}`];
        }
        entries.push({ label: entry[1], anchor: entry[2] });
    }

    const problems = [];
    if (entries.length !== headings.length) {
        problems.push(
            `Contents has ${String(entries.length)} entries for ${String(headings.length)} H2 headings`,
        );
    }
    const count = Math.max(entries.length, headings.length);
    for (let index = 0; index < count; index += 1) {
        const heading = headings[index];
        const entry = entries[index];
        if (heading === undefined) {
            problems.push(`Contents has an extra entry "${entry?.label ?? ""}"`);
            continue;
        }
        if (entry === undefined) {
            problems.push(`Contents is missing "${heading}"`);
            continue;
        }
        const label = headingLabel(entry.label);
        const expected = headingLabel(heading);
        if (label !== expected) {
            problems.push(
                `Contents entry ${String(index + 1)} is "${label}" but the heading is "${expected}"`,
            );
        }
        const anchor = headingSlug(heading);
        if (entry.anchor !== anchor) {
            problems.push(
                `Contents entry ${String(index + 1)} links to #${entry.anchor} but the heading anchor is #${anchor}`,
            );
        }
    }
    return problems;
}

/** Every relative link in a Markdown document, including images and HTML anchors. */
export function documentLinks(markdown) {
    const text = proseOnly(markdown);
    const links = [];
    for (const match of text.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu)) {
        if (match[1] !== undefined) {
            links.push(match[1]);
        }
    }
    for (const match of text.matchAll(/<a\s+[^>]*\bhref=["']([^"']+)["'][^>]*>/giu)) {
        if (match[1] !== undefined) {
            links.push(match[1]);
        }
    }
    return links;
}

function markdownFiles(directory) {
    const files = [];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
            continue;
        }
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...markdownFiles(path));
        } else if (entry.isFile() && /\.(md|markdown)$/iu.test(entry.name)) {
            files.push(path);
        }
    }
    return files;
}

function isExternal(target) {
    return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(target);
}

function isReferenceDocument(root, file) {
    const display = relative(root, file).split("\\").join("/");
    if (!display.startsWith("docs/") || !display.endsWith(".md")) return false;
    if (display === "docs/README.md") return false;
    return !/^docs\/(?:plan|spikes)\//u.test(display);
}

function decodeFragment(fragment) {
    try {
        return decodeURIComponent(fragment);
    } catch {
        return fragment;
    }
}

/**
 * Validate every relative link and heading anchor under `root`.
 *
 * Returns a list of human-readable errors. The caller decides whether to print and exit;
 * keeping the result pure is what lets the unit test drive temporary fixtures without
 * spawning a process.
 */
export function checkDocs(root) {
    const files = markdownFiles(root);
    const errors = [];
    const anchorsByFile = new Map();

    for (const file of files) {
        const markdown = readFileSync(file, "utf8");
        const display = relative(root, file).split("\\").join("/");
        const { anchors, duplicates } = documentAnchors(markdown);
        anchorsByFile.set(resolve(file), anchors);
        for (const slug of duplicates) {
            errors.push(`${relative(root, file)}: duplicate heading anchor #${slug}`);
        }
        if (display === "README.md" && /^>\s*\*\*Status:/mu.test(markdown)) {
            errors.push(
                `${display}: root README must not carry a status block; current delivery status lives in docs/progress.md`,
            );
        }
        if (
            /^docs\/plan\/[^/]+\.md$/u.test(display) &&
            !markdown.split(/\r?\n/u).includes(PLAN_BANNER)
        ) {
            errors.push(
                `${display}: missing the planning-record banner that links to ../progress.md`,
            );
        }
        if (isReferenceDocument(root, file)) {
            for (const problem of contentsErrors(markdown)) {
                errors.push(`${relative(root, file)}: ${problem}`);
            }
        }
    }

    for (const file of files) {
        const display = relative(root, file);
        for (const raw of documentLinks(readFileSync(file, "utf8"))) {
            if (raw.startsWith("//") || isExternal(raw)) {
                continue;
            }
            const [pathPart, fragment] = raw.split("#", 2);
            const cleanPath = (pathPart ?? "").split("?", 1)[0] ?? "";
            if (cleanPath === "") {
                if (
                    fragment !== undefined &&
                    !anchorsByFile.get(resolve(file))?.has(decodeFragment(fragment))
                ) {
                    errors.push(`${display}: missing anchor #${decodeFragment(fragment)}`);
                }
                continue;
            }
            let target = resolve(dirname(file), cleanPath);
            if (!existsSync(target) && extname(target) === "") {
                target = `${target}.md`;
            }
            if (!existsSync(target)) {
                errors.push(`${display}: missing link target ${cleanPath}`);
                continue;
            }
            if (fragment === undefined || fragment === "" || !statSync(target).isFile()) {
                continue;
            }
            if (!/\.(md|markdown)$/iu.test(target)) {
                continue;
            }
            if (!anchorsByFile.get(resolve(target))?.has(decodeFragment(fragment))) {
                errors.push(`${display}: missing anchor ${cleanPath}#${decodeFragment(fragment)}`);
            }
        }
    }

    return errors;
}

const root = fileURLToPath(new URL("../", import.meta.url));
if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const errors = checkDocs(root);
    if (errors.length > 0) {
        console.error(`Documentation check failed with ${String(errors.length)} problem(s):`);
        for (const error of errors) {
            console.error(`  ${error}`);
        }
        process.exitCode = 1;
    } else {
        console.log("Documentation links, anchors, and Contents maps are valid.");
    }
}
