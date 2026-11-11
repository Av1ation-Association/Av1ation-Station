import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

import { useMediaUrl, useVideoAudioTracks } from "@av1ation/api";

type PreviewAudioOptions = {
    projectId: string;
    videoId: string;
    source: "original" | "decoded" | "encode";
    encodeFrom: "decoded" | "original";
    frameRate: number | null;
    anchor: number;
    url: string | null;
    volume: number;
    muted: boolean;
    playbackRate: number;
    mediaStart: RefObject<number>;
    videoRef: RefObject<HTMLVideoElement | null>;
};

/**
 * The player's separate audio element.
 *
 * A MediaSource picture carries only video, so a chosen track is always extracted from the
 * original file. The track list is fetched for every source; nothing mounts until that answer
 * says the file has streams.
 */
export function usePreviewAudio({
    projectId,
    videoId,
    source,
    encodeFrom,
    frameRate,
    anchor,
    url,
    volume,
    muted,
    playbackRate,
    mediaStart,
    videoRef,
}: PreviewAudioOptions) {
    const audioTracks = useVideoAudioTracks(projectId, videoId);
    /** False when the file has no audio streams, or its header could not be read. */
    const hasAudio = (audioTracks.data?.tracks.length ?? 0) > 0;
    const [audioTrack, setAudioTrack] = useState<number | null>(null);
    const [audioFailed, setAudioFailed] = useState(false);
    /** The failure notice is a hint about one track, not a permanent state. */
    const [audioNoticeDismissed, setAudioNoticeDismissed] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    /** True while the sound was stopped because the picture stopped moving. */
    const audioHeld = useRef(false);

    // The audio element always reads the original file, whose timeline starts at frame 0.
    // A scene or decoded stream starts later, so its sound needs the same offset.
    const audioOffset = frameRate === null ? 0 : anchor / frameRate;
    // Sound stays in its own element. A single stream cannot carry a chosen audio track and
    // the decoded picture at once, so the video keeps its own audio as the default and this
    // element is mounted only once the user picks an alternative track.
    const audioSourceUrl = useMediaUrl(
        `/api/projects/${encodeURIComponent(projectId)}/videos/${encodeURIComponent(videoId)}/media?source=original&audio=${String(audioTrack ?? 0)}`,
    );
    // A MediaSource picture carries only the video track, so its sound always comes from the
    // original file — the default track when the user has not chosen another. `Original`
    // keeps its own audio until a different track is selected.
    const audioUrl =
        hasAudio && (source !== "original" || audioTrack !== null) ? audioSourceUrl : null;

    /**
     * Start the sound without treating a superseded or gesture-blocked request as a broken
     * track. A real decode or fetch error arrives through the audio element's `onError`.
     */
    const startAudio = (audio: HTMLAudioElement) => {
        void Promise.resolve(audio.play()).catch((error: unknown) => {
            if (
                error instanceof DOMException &&
                (error.name === "NotAllowedError" || error.name === "AbortError")
            ) {
                return;
            }
            setAudioFailed(true);
            setAudioNoticeDismissed(false);
        });
    };

    useEffect(() => {
        setAudioTrack(null);
        setAudioFailed(false);
        setAudioNoticeDismissed(false);
    }, [source, encodeFrom]);

    useEffect(() => {
        setAudioFailed(false);
        setAudioNoticeDismissed(false);
    }, [audioTrack]);

    // Keep the sound element in step with the transport before sync can start it. A new
    // track or element otherwise plays its first moment at the default volume.
    useEffect(() => {
        if (videoRef.current !== null) {
            videoRef.current.volume = volume;
        }
        if (audioRef.current !== null) {
            audioRef.current.volume = volume;
            audioRef.current.muted = muted;
            audioRef.current.playbackRate = playbackRate;
        }
    }, [volume, muted, url, audioTrack, playbackRate, videoRef]);

    // The audio element reads the original track on its own timeline, so it has to be
    // nudged to whatever the picture is doing: after a seek, on play, and when it finishes
    // loading behind a video that is already running.
    useEffect(() => {
        const audio = audioRef.current;
        const video = videoRef.current;
        if (audio === null || video === null || audioUrl === null) {
            return;
        }
        audio.currentTime = audioOffset + Math.max(0, video.currentTime - mediaStart.current);
        if (!video.paused) {
            startAudio(audio);
        }
    }, [audioUrl, audioOffset, audioRef, mediaStart, videoRef]);

    /**
     * Put the sound where the picture is, never where it is about to be.
     *
     * A backward seek into an encoded chunk keeps the old frame on screen for the length of
     * the decode walk, so moving the audio element at request time played a second of sound
     * from a picture nobody could see yet.
     */
    const syncAudio = useCallback(
        (element: HTMLVideoElement) => {
            const audio = audioRef.current;
            if (audio === null) {
                return;
            }
            audio.currentTime = audioOffset + Math.max(0, element.currentTime - mediaStart.current);
            // A held sound waits for the first presented frame; starting it here would put
            // narration ahead of a picture that has not arrived yet.
            if (!element.paused && !audioHeld.current) {
                startAudio(audio);
            }
        },
        [audioOffset, mediaStart],
    );

    const chooseAudio = (next: number | null) => {
        if (next === audioTrack) {
            return;
        }
        setAudioTrack(next);
    };

    const audioLabel =
        audioTrack === null
            ? "Source audio"
            : (audioTracks.data?.tracks.find((track) => track.index === audioTrack)?.label ??
              `Track ${String(audioTrack + 1)}`);

    return {
        audioTracks,
        audioTrack,
        audioFailed,
        setAudioFailed,
        audioNoticeDismissed,
        setAudioNoticeDismissed,
        audioOffset,
        audioUrl,
        audioRef,
        audioHeld,
        startAudio,
        syncAudio,
        chooseAudio,
        audioLabel,
    };
}
