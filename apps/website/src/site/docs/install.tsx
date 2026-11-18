import { useRef, useState, type KeyboardEvent } from "react";

import { detectPlatform, PLATFORM_LABELS, type Platform } from "../platform";
import { ReleaseChooser } from "../ReleaseChooser";
import {
    assetUrl,
    formatMiB,
    RELEASE,
    RELEASES,
    type PublishedRelease,
    type ReleaseAsset,
} from "../releases";

type InstallTab = Platform | "source";

const INSTALL_TABS: readonly { readonly id: InstallTab; readonly label: string }[] = [
    { id: "windows", label: "Windows" },
    { id: "linux", label: "Linux" },
    { id: "macos", label: "macOS" },
    { id: "source", label: "Source" },
];

const DOWNLOAD_LABELS: Record<Platform, string> = {
    windows: "Download Windows installer",
    linux: "Download Linux AppImage",
    macos: "Download macOS disk image",
};

const FORMAT_ORDER: Record<Platform, readonly string[]> = {
    windows: ["exe", "msi", "zip"],
    linux: ["appimage", "deb"],
    macos: ["dmg", "app.zip"],
};

const PLATFORM_NOTES: Record<Platform, string> = {
    windows:
        "Run the installer, then open Av1ation Station from the Start menu. SmartScreen warns because this build is unsigned; confirm the download came from the project release page instead of turning off security controls.",
    linux:
        "Make the AppImage executable, then run it. The Debian package installs the same build through your package manager. A normal desktop session is required.",
    macos:
        "Open the disk image and copy Av1ation Station to Applications. The build is ad-hoc signed and not notarised, so Gatekeeper may block it; confirm the download came from the project release page instead of turning off security controls.",
};

function orderedAssets(
    platform: Platform,
    assets: readonly ReleaseAsset[],
): readonly ReleaseAsset[] {
    const order = FORMAT_ORDER[platform];
    return [...assets].sort((first, second) => {
        const firstIndex = order.indexOf(first.format);
        const secondIndex = order.indexOf(second.format);
        return (firstIndex === -1 ? order.length : firstIndex) -
            (secondIndex === -1 ? order.length : secondIndex);
    });
}

function InstallPanel({
    release,
    platform,
}: {
    release: PublishedRelease;
    platform: Platform;
}) {
    const variants = release.variants[platform];
    return (
        <>
            <p className="docs-install__lede">
                Choose the bundled build unless you already maintain FFmpeg, VapourSynth, and
                the encoders. It is larger, but nothing else has to be installed.
            </p>
            <div className="docs-install__builds">
                {variants.map((variant) => (
                    <section
                        key={variant.id}
                        className="docs-install__build"
                        data-recommended={variant.recommended ? "true" : undefined}
                    >
                        <div className="docs-install__build-head">
                            <h3>{variant.label}</h3>
                            {variant.recommended ? (
                                <span className="docs-install__badge">Recommended</span>
                            ) : null}
                        </div>
                        <p className="docs-install__description">{variant.description}</p>
                        <ul className="docs-install__assets">
                            {orderedAssets(platform, variant.assets).map((asset, index) => {
                                const primary = variant.recommended && index === 0;
                                return (
                                    <li key={asset.name}>
                                        <a
                                            className={
                                                primary
                                                    ? "site-button site-button--primary docs-install__download"
                                                    : "docs-install__asset"
                                            }
                                            href={assetUrl(release, asset.name)}
                                        >
                                            <span>
                                                {primary
                                                    ? DOWNLOAD_LABELS[platform]
                                                    : asset.label}
                                            </span>
                                            <span className="docs-install__size">
                                                {formatMiB(asset.sizeMiB)}
                                            </span>
                                        </a>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>
            <p className="docs-install__note">{PLATFORM_NOTES[platform]}</p>
            <p className="docs-install__note">
                Using tools you already manage? Choose the system build above. Its downloads
                use the same version number and leave the bundled toolchain out.
            </p>
        </>
    );
}

function UnsupportedPanel({
    release,
    platform,
}: {
    release: PublishedRelease;
    platform: Platform;
}) {
    const label = PLATFORM_LABELS[platform];
    return (
        <div className="docs-install__empty">
            <p>
                There is no {label} asset in {release.version}.{" "}
                {platform === "macos"
                    ? "macOS builds are published best-effort when a release includes them; this one does not. A published macOS app may still be blocked by Gatekeeper because it is ad-hoc signed and not notarised."
                    : "See the release history for a release that includes it."}
            </p>
            <a
                className="site-button site-button--secondary"
                href="https://github.com/Av1ation-Association/Av1ation-Station/blob/main/CONTRIBUTING.md"
            >
                Read the build instructions
            </a>
        </div>
    );
}

function SourcePanel() {
    return (
        <div className="docs-install__empty">
            <p>
                A source build uses the repository&apos;s Rust and Node toolchain. It does not
                install the bundled FFmpeg, VapourSynth, encoders, scene model, or metrics, so
                point <strong>Settings → Dependencies</strong> at tools you already have.
            </p>
            <a
                className="site-button site-button--secondary"
                href="https://github.com/Av1ation-Association/Av1ation-Station/blob/main/CONTRIBUTING.md"
            >
                Read the build instructions
            </a>
        </div>
    );
}

/**
 * The install download chooser. Bundled builds lead each platform panel; the reader only
 * downloads the assets for the platform they selected. The release chooser appears only when
 * the catalogue contains both a stable release and a newer pre-release.
 */
export function PlatformInstall() {
    const [selected, setSelected] = useState<InstallTab>(() => detectPlatform() ?? "windows");
    const [releaseTag, setReleaseTag] = useState<string>(RELEASE.tag);
    const release = RELEASES.find((entry) => entry.tag === releaseTag) ?? RELEASE;
    const tabs = useRef<Partial<Record<InstallTab, HTMLButtonElement | null>>>({});
    const panelId = "install-downloads";

    const move = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
        const offsets: Record<string, number> = {
            ArrowRight: 1,
            ArrowLeft: -1,
            Home: -index,
            End: INSTALL_TABS.length - index - 1,
        };
        const offset = offsets[event.key];
        if (offset === undefined) {
            return;
        }
        event.preventDefault();
        const next = INSTALL_TABS[(index + offset + INSTALL_TABS.length) % INSTALL_TABS.length];
        if (next === undefined) {
            return;
        }
        setSelected(next.id);
        tabs.current[next.id]?.focus();
    };

    return (
        <section className="docs-install" aria-label="Download Av1ation Station">
            <p className="docs-install__meta">
                <span>Version {release.version}</span>
                <span>{release.prerelease ? "Pre-release build" : "Stable build"}</span>
            </p>
            <ReleaseChooser
                releases={RELEASES}
                selectedTag={release.tag}
                onSelect={setReleaseTag}
                label="Release channel"
                className="docs-install__releases"
            />
            <div className="docs-install__tabs" role="tablist" aria-label="Choose your platform">
                {INSTALL_TABS.map((tab, index) => (
                    <button
                        key={tab.id}
                        ref={(node) => {
                            tabs.current[tab.id] = node;
                        }}
                        type="button"
                        role="tab"
                        id={`install-tab-${tab.id}`}
                        aria-selected={selected === tab.id}
                        aria-controls={panelId}
                        tabIndex={selected === tab.id ? 0 : -1}
                        onClick={() => setSelected(tab.id)}
                        onKeyDown={(event) => move(event, index)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>
            <div
                className="docs-install__panel"
                id={panelId}
                role="tabpanel"
                aria-labelledby={`install-tab-${selected}`}
                tabIndex={0}
            >
                {selected === "source" ? (
                    <SourcePanel />
                ) : release.variants[selected].length === 0 ? (
                    <UnsupportedPanel release={release} platform={selected} />
                ) : (
                    <InstallPanel release={release} platform={selected} />
                )}
            </div>
        </section>
    );
}
