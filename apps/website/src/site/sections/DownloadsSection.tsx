import { useState } from "react";

import { detectPlatform, PLATFORM_LABELS, type Platform } from "../platform";
import { RELEASE, assetUrl, formatMiB, type ReleaseVariant } from "../releases";

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

export function DownloadsSection() {
    const [platform, setPlatform] = useState<Platform>(() => detectPlatform() ?? "windows");
    const variants = RELEASE.variants[platform];
    const missingPlatforms = PLATFORMS.filter((entry) => RELEASE.variants[entry].length === 0).map(
        (entry) => RELEASE.platformLabels[entry],
    );
    const channel = RELEASE.prerelease ? "pre-release" : "stable release";

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
                            Download {RELEASE.prerelease ? "the pre-release" : "Av1ation Station"}.
                        </h2>
                        <p>
                            Version {RELEASE.version} is a {channel} for {RELEASE.platformSummary}.
                            The bundled build is the recommended one: it carries the dependency set
                            the app expects.
                        </p>
                    </div>
                    <p className="section-head__aside">
                        {missingPlatforms.length === 0
                            ? ""
                            : `${joinLabels(missingPlatforms)} ${missingPlatforms.length === 1 ? "is" : "are"} not in this build. `}
                        {RELEASE.prerelease
                            ? "All published downloads are pre-release; there is no stable channel yet."
                            : "These downloads come from the current stable release."}
                    </p>
                </header>

                <div className="downloads">
                    <div className="downloads__meta">
                        <p className="downloads__release">
                            <span className="downloads__version">{RELEASE.version}</span>
                            <span className="downloads__badge">
                                {RELEASE.prerelease ? "Pre-release" : "Stable release"}
                            </span>
                            <span className="downloads__date">{RELEASE.published}</span>
                        </p>
                        <p className="downloads__note">
                            Windows and Linux installers are unsigned. Verify the{" "}
                            <a href={RELEASE.checksumsUrl}>SHA-256 sums</a> before running one.
                            Bundled builds are larger because they carry the toolchain.
                        </p>
                    </div>

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
                                No {RELEASE.platformLabels[platform]} build in {RELEASE.version}.
                            </h3>
                            <p>
                                The current {channel} ships {RELEASE.platformSummary} only.{" "}
                                {platform === "macos"
                                    ? "An older macOS alpha exists in the release history, but it predates this application and is not offered here as a current download."
                                    : "See the release history for builds on other platforms."}
                            </p>
                            <a className="site-text-link" href={RELEASE.allReleasesUrl}>
                                See all releases
                            </a>
                        </div>
                    ) : (
                        <div className="download-variants">
                            {variants.map((variant) => (
                                <DownloadVariant key={variant.id} variant={variant} />
                            ))}
                        </div>
                    )}

                    <div className="downloads__footer">
                        <a href={RELEASE.notesUrl}>Release notes</a>
                        <a href={RELEASE.allReleasesUrl}>All releases</a>
                        <a href={RELEASE.repositoryUrl}>Source code</a>
                    </div>
                </div>
            </div>
        </section>
    );
}

function DownloadVariant({ variant }: { variant: ReleaseVariant }) {
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
                        <a href={assetUrl(asset.name)} rel="noreferrer">
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
