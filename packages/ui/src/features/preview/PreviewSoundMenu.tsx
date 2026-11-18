import type { Dispatch, RefObject, SetStateAction } from "react";
import { Volume1, Volume2, VolumeX } from "lucide-react";

import type { AudioTrackList } from "@av1ation/contracts";

type PreviewSoundMenuProps = {
    soundRoot: RefObject<HTMLDivElement | null>;
    soundOpen: boolean;
    setSoundOpen: Dispatch<SetStateAction<boolean>>;
    audioLabel: string;
    volumePercent: number;
    muted: boolean;
    volume: number;
    setMuted: Dispatch<SetStateAction<boolean>>;
    setVolume: Dispatch<SetStateAction<number>>;
    audioTracks: AudioTrackList | undefined;
    audioTrack: number | null;
    chooseAudio: (next: number | null) => void;
};

/** The transport's volume control and audio-track picker. */
export function PreviewSoundMenu({
    soundRoot,
    soundOpen,
    setSoundOpen,
    audioLabel,
    volumePercent,
    muted,
    volume,
    setMuted,
    setVolume,
    audioTracks,
    audioTrack,
    chooseAudio,
}: PreviewSoundMenuProps) {
    return (
        <div className="relative" ref={soundRoot}>
            <button
                type="button"
                aria-haspopup="dialog"
                aria-expanded={soundOpen}
                aria-label={`Sound and audio track: ${audioLabel}`}
                data-tip={
                    soundOpen ? undefined : `Volume ${String(volumePercent)}% · ${audioLabel}`
                }
                data-tip-align="end"
                onClick={() => setSoundOpen((open) => !open)}
                className="inline-flex h-8 w-8 items-center justify-center rounded text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
                {muted || volume === 0 ? (
                    <VolumeX aria-hidden="true" className="h-3.5 w-3.5" />
                ) : volume < 0.5 ? (
                    <Volume1 aria-hidden="true" className="h-3.5 w-3.5" />
                ) : (
                    <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />
                )}
            </button>
            {soundOpen ? (
                <div
                    role="dialog"
                    aria-label="Sound"
                    className="absolute right-0 bottom-full z-40 mb-1.5 w-72 rounded-md border border-line-strong bg-overlay p-2.5 shadow-elevation-2"
                >
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            aria-label={muted ? "Unmute" : "Mute"}
                            data-tip={muted ? "Unmute" : "Mute"}
                            aria-pressed={muted}
                            onClick={() => setMuted((value) => !value)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded text-ink-secondary transition-colors duration-150 hover:bg-hover hover:text-ink"
                        >
                            {muted || volume === 0 ? (
                                <VolumeX aria-hidden="true" className="h-3.5 w-3.5" />
                            ) : volume < 0.5 ? (
                                <Volume1 aria-hidden="true" className="h-3.5 w-3.5" />
                            ) : (
                                <Volume2 aria-hidden="true" className="h-3.5 w-3.5" />
                            )}
                        </button>
                        <input
                            type="range"
                            aria-label="Volume"
                            min={0}
                            max={1}
                            step={0.01}
                            value={muted ? 0 : volume}
                            onChange={(event) => {
                                const next = Number(event.target.value);
                                setVolume(next);
                                setMuted(next === 0);
                            }}
                            className="h-1 min-w-0 flex-1 cursor-pointer accent-brand"
                        />
                        <span className="w-8 shrink-0 text-right font-mono text-[10px] text-ink-muted tabular-nums">
                            {volumePercent}%
                        </span>
                    </div>
                    {audioTracks !== undefined && audioTracks.tracks.length > 1 ? (
                        <div className="mt-2 border-t border-line-subtle pt-2">
                            <p className="m-0 px-1 pb-1 text-[9px] tracking-[0.08em] text-ink-muted uppercase">
                                Audio track
                            </p>
                            <div role="radiogroup" aria-label="Audio track">
                                {[
                                    {
                                        index: null,
                                        label: "Source audio",
                                    },
                                    ...audioTracks.tracks,
                                ].map((track) => {
                                    const active = track.index === audioTrack;
                                    return (
                                        <button
                                            key={track.index ?? "default"}
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            onClick={() => chooseAudio(track.index)}
                                            className={`flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[11.5px] transition-colors duration-100 ${
                                                active
                                                    ? "bg-raised font-medium text-ink"
                                                    : "text-ink-secondary hover:bg-hover hover:text-ink"
                                            }`}
                                        >
                                            <span className="min-w-0 flex-1 truncate">
                                                {track.label}
                                            </span>
                                            {active ? (
                                                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                                            ) : null}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="mt-1 mb-0 px-1 text-[9.5px] leading-snug text-ink-muted">
                                {audioTracks.detail}
                            </p>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
