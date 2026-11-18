import { useState } from "react";

import { detectPlatform, PLATFORM_LABELS, type Platform } from "../platform";
import { ReleaseChooser } from "../ReleaseChooser";
import {
    ALL_RELEASES_URL,
    assetUrl,
    formatMiB,
    RELEASE,
    RELEASES,
    REPOSITORY_URL,
    type PublishedRelease,
    type ReleaseVariant,
} from "../releases";

const PLATFORMS: readonly Platform[] = ["windows", "macos", "linux"];

function joinLabels(labels: readonly string[]): string {
    if (labels.length === 0) {
        return "";
    }
    if (labels.length === 1) {
        return labels[0] ?? "";
    }
    return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1) ?? ""}`;
}

export function DownloadsSection({
    releases = RELEASES,
    initialTag = RELEASE.tag,
}: {
    readonly releases?: readonly PublishedRelease[];
    readonly initialTag?: string;
} = {}) {
    const [platform, setPlatform] = useState<Platform>(() => detectPlatform() ?? "windows");
    const [releaseTag, setReleaseTag] = useState<string>(initialTag);
    const fallbackRelease = releases.at(-1) ?? RELEASE;
    const release = releases.find((entry) => entry.tag === releaseTag) ?? fallbackRelease;
    const stable = releases.find((entry) => !entry.prerelease) ?? null;
    const variants = release.variants[platform];
    const missingPlatforms = PLATFORMS.filter((entry) => release.variants[entry].length === 0).map(
        (entry) => release.platformLabels[entry],
    );
    const channel = release.prerelease ? "pre-release" : "stable release";
    const prereleaseAside =
        release.prerelease && stable !== null
            ? `This pre-release is newer than stable ${stable.version}. Both releases are available above.`
            : release.prerelease
              ? "All published downloads are pre-release; there is no stable channel yet."
              : "These downloads come from the current stable release.";

    return (
        <section
            id="downloads"
            className="site-section site-section--downloads"
            aria-labelledby="downloads-title"
        >
            <div className="site-section__inner">
                <header className="section-head">
                    <div>
                        <h2 id="downloads-title">
                            Download {release.prerelease ? "the pre-release" : "Av1ation Station"}.
                        </h2>
                        <p>
                            Version {release.version} is a {channel} for {release.platformSummary}.
                            The bundled build is the recommended one: it carries the dependency set
                            the app expects.
                        </p>
                    </div>
                    <p className="section-head__aside">
                        {missingPlatforms.length === 0
                            ? ""
                            : `${joinLabels(missingPlatforms)} ${missingPlatforms.length === 1 ? "is" : "are"} not in this build. `}
                        {prereleaseAside}
                    </p>
                </header>

                <div className="downloads">
                    <div className="downloads__meta">
                        <p className="downloads__release">
                            <span className="downloads__version">{release.version}</span>
                            <span className="downloads__badge">
                                {release.prerelease ? "Pre-release" : "Stable release"}
                            </span>
                            <span className="downloads__date">{release.published}</span>
                        </p>
                        <p className="downloads__note">
                            Windows and Linux installers are unsigned.
                            {release.variants.macos.length > 0
                                ? " macOS builds are ad-hoc signed and not notarised."
                                : ""}{" "}
                            Verify the <a href={release.checksumsUrl}>SHA-256 sums</a> before
                            running one. Bundled builds are larger because they carry the toolchain.
                        </p>
                    </div>

                    <ReleaseChooser
                        releases={releases}
                        selectedTag={release.tag}
                        onSelect={setReleaseTag}
                        label="Release channel"
                        className="downloads__channels"
                    />

                    <div
                        className="downloads__platforms"
                        role="group"
                        aria-label="Download platform"
                    >
                        {PLATFORMS.map((entry) => (
                            <button
                                key={entry}
                                type="button"
                                className="downloads__platform"
                                aria-pressed={platform === entry}
                                onClick={() => {
                                    setPlatform(entry);
                                }}
                            >
                                {PLATFORM_LABELS[entry]}
                            </button>
                        ))}
                    </div>

                    {variants.length === 0 ? (
                        <div className="downloads__mac">
                            <h3>
                                No {release.platformLabels[platform]} build in {release.version}.
                            </h3>
                            <p>
                                The current {channel} ships {release.platformSummary} only.{" "}
                                {platform === "macos"
                                    ? "macOS builds are best-effort and appear only in releases that include them; this one does not."
                                    : "See the release history for builds on other platforms."}
                            </p>
                            <a className="site-text-link" href={ALL_RELEASES_URL}>
                                See all releases
                            </a>
                        </div>
                    ) : (
                        <div className="download-variants">
                            {variants.map((variant) => (
                                <DownloadVariant
                                    key={variant.id}
                                    release={release}
                                    variant={variant}
                                />
                            ))}
                        </div>
                    )}

                    <div className="downloads__footer">
                        <a href={release.notesUrl}>Release notes</a>
                        <a href={ALL_RELEASES_URL}>All releases</a>
                        <a href={REPOSITORY_URL}>Source code</a>
                    </div>
                </div>
            </div>
        </section>
    );
}

function DownloadVariant({
    release,
    variant,
}: {
    release: PublishedRelease;
    variant: ReleaseVariant;
}) {
    return (
        <div className="download-variant">
            <div className="download-variant__head">
                <div>
                    <h3>
                        {variant.label}
                        {variant.recommended ? (
                            <span className="download-variant__recommended">Recommended</span>
                        ) : null}
                    </h3>
                    <p>{variant.description}</p>
                </div>
            </div>
            <ul className="download-assets">
                {variant.assets.map((asset) => (
                    <li key={asset.name}>
                        <a href={assetUrl(release, asset.name)} rel="noreferrer">
                            <span className="download-assets__label">{asset.label}</span>
                            <span className="download-assets__size">
                                {formatMiB(asset.sizeMiB)}
                            </span>
                            <span className="download-assets__arrow" aria-hidden="true">
                                <svg viewBox="0 0 12 12" width="12" height="12" fill="none">
                                    <path
                                        d="M6 1v7m0 0 3-3M6 8 3 5M1 10.5h10"
                                        stroke="currentColor"
                                        strokeWidth="1.4"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                </svg>
                            </span>
                        </a>
                    </li>
                ))}
            </ul>
        </div>
    );
}
