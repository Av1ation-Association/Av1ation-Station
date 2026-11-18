import { releaseChannelLabel, type PublishedRelease } from "./releases";

export function ReleaseChooser({
    releases,
    selectedTag,
    onSelect,
    label,
    className,
}: {
    readonly releases: readonly PublishedRelease[];
    readonly selectedTag: string;
    readonly onSelect: (tag: string) => void;
    readonly label: string;
    readonly className?: string;
}) {
    if (releases.length < 2) {
        return null;
    }
    return (
        <div
            className={className === undefined ? "release-choice" : `release-choice ${className}`}
            role="group"
            aria-label={label}
        >
            {releases.map((release) => (
                <button
                    key={release.tag}
                    type="button"
                    className="release-choice__button"
                    aria-pressed={release.tag === selectedTag}
                    onClick={() => {
                        onSelect(release.tag);
                    }}
                >
                    <span className="release-choice__channel">{releaseChannelLabel(release)}</span>
                    <span className="release-choice__version">{release.version}</span>
                </button>
            ))}
        </div>
    );
}
