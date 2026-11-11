// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import type { ZodType } from "zod";

import type { EncodeEvent, SceneList } from "@av1ation/contracts";

import { ApiProvider, useEncodeEvents, useVideoScenes } from "./api";
import type { Transport } from "./transport/types";

function table(): SceneList {
    return {
        video_id: "video-1",
        scenes: [
            {
                index: 0,
                start_frame: 0,
                end_frame: 24,
                frame_count: 24,
                encoded: false,
                encoder_custom: false,
                encoder_label: "SVT-AV1",
            },
        ],
        total_frames: 24,
        scene_fingerprint: "table",
    };
}

function measured(): EncodeEvent {
    return {
        project_id: "project-late",
        video_id: "video-1",
        run_id: "run-1",
        seq: 3,
        at: "2026-11-07T00:00:00Z",
        kind: "progress",
        sequence: "NoiseDetector",
        message: "measured",
        scene_index: 0,
        scene_noise: 0.004,
    };
}

function chunk(): EncodeEvent {
    return {
        project_id: "project-live",
        video_id: "video-1",
        run_id: "run-2",
        seq: 9,
        at: "2026-11-07T00:00:01Z",
        kind: "progress",
        sequence: "ParallelEncoder",
        message: "Parallel Encoder: Scene 1 wrote 2048 bytes in 1.5s",
        scene_index: 0,
        scene_bytes: 2_048,
        scene_encode_ms: 1_500,
    };
}

function quality(): EncodeEvent {
    return {
        project_id: "project-quality",
        video_id: "video-1",
        run_id: "run-3",
        seq: 12,
        at: "2026-11-07T00:00:02Z",
        kind: "progress",
        sequence: "QualityCheck",
        message: "Quality Check scored scene 1",
        scene_index: 0,
        scene_quality: 94.5,
    };
}

/** A transport that answers the scene read once and pushes events the shell listens to. */
function liveTransport(list: SceneList) {
    let push: ((event: EncodeEvent) => void) | null = null;
    const transport: Transport = {
        get: <T,>(path: string): Promise<T> =>
            path.endsWith("/scenes")
                ? Promise.resolve(list as T)
                : Promise.reject(new Error(`unexpected read ${path}`)),
        post: () => Promise.reject(new Error("no writes")),
        put: () => Promise.resolve(),
        putJson: () => Promise.reject(new Error("no writes")),
        patchJson: () => Promise.reject(new Error("no writes")),
        delete: () => Promise.resolve(),
        subscribe: <T,>(_path: string, _schema: ZodType<T>, onEvent: (event: T) => void) => {
            push = onEvent as (event: EncodeEvent) => void;
            return () => {
                push = null;
            };
        },
        mediaUrl: undefined,
        pickFile: undefined,
        pickSaveFile: undefined,
        pickExecutable: undefined,
        pickVideoFile: undefined,
        pickVideoFiles: undefined,
        pickDirectory: undefined,
        saveTextFile: undefined,
        pickScript: undefined,
        pickIndex: undefined,
        pickModel: undefined,
        revealPath: undefined,
        openPath: undefined,
        restartApp: undefined,
        openLanguageServer: undefined,
    };
    return { transport, push: (event: EncodeEvent) => push?.(event) };
}

function Shell({ children }: { children: ReactNode }) {
    useEncodeEvents();
    return <>{children}</>;
}

/**
 * The reported flow: the run starts on the directory list, the page is opened seconds later,
 * and the service's read has not caught up with the run's tally. The chart reads this hook,
 * so the measurement has to survive in the shell until that read lands.
 */
describe("a page opened after the run started", () => {
    it("still shows the measurements that arrived before it mounted", async () => {
        let push: ((event: EncodeEvent) => void) | null = null;
        let settle: ((list: SceneList) => void) | null = null;
        const pending = new Promise<SceneList>((resolve) => {
            settle = resolve;
        });
        const transport: Transport = {
            get: <T,>(path: string): Promise<T> => {
                if (!path.endsWith("/scenes")) {
                    return Promise.reject(new Error(`unexpected read ${path}`));
                }
                return pending as Promise<T>;
            },
            post: () => Promise.reject(new Error("no writes")),
            put: () => Promise.resolve(),
            putJson: () => Promise.reject(new Error("no writes")),
            patchJson: () => Promise.reject(new Error("no writes")),
            delete: () => Promise.resolve(),
            subscribe: <T,>(_path: string, _schema: ZodType<T>, onEvent: (event: T) => void) => {
                push = onEvent as (event: EncodeEvent) => void;
                return () => {
                    push = null;
                };
            },
            mediaUrl: undefined,
            pickFile: undefined,
            pickSaveFile: undefined,
            pickExecutable: undefined,
            pickVideoFile: undefined,
            pickVideoFiles: undefined,
            pickDirectory: undefined,
            saveTextFile: undefined,
            pickScript: undefined,
            pickIndex: undefined,
            pickModel: undefined,
            revealPath: undefined,
            openPath: undefined,
            restartApp: undefined,
            openLanguageServer: undefined,
        };
        const Wrapper = ({ children }: { children: ReactNode }) => (
            <ApiProvider transport={transport}>
                <Shell>{children}</Shell>
            </ApiProvider>
        );

        const { result } = renderHook(() => useVideoScenes("project-late", "video-1"), {
            wrapper: Wrapper,
        });

        // The measurement is handled while the read the page needs is still in flight, and
        // no later event touches the cache. This is the order the page sees: the value had
        // to be kept by the shell, not applied to a table that already existed.
        act(() => push?.(measured()));
        await act(
            async () =>
                await new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
        );
        act(() => settle?.(table()));

        await waitFor(() => expect(result.current.data?.scenes[0]?.noise).toBe(0.004));
    });
});

/**
 * Parallel Encoder checkpoints a scene when its chunk lands, and the event carries the size
 * and duration that checkpoint recorded. The rail and the Encoding chart read this table,
 * so the row has to gain its chunk without a full scene read.
 */
describe("a finished Parallel Encoder scene", () => {
    it("patches its row live from the event's chunk size and duration", async () => {
        const { transport, push } = liveTransport(table());
        const Wrapper = ({ children }: { children: ReactNode }) => (
            <ApiProvider transport={transport}>
                <Shell>{children}</Shell>
            </ApiProvider>
        );

        const { result } = renderHook(() => useVideoScenes("project-live", "video-1"), {
            wrapper: Wrapper,
        });
        await waitFor(() => expect(result.current.data).toBeDefined());

        act(() => push(chunk()));

        await waitFor(() =>
            expect(result.current.data?.scenes[0]).toMatchObject({
                encoded: true,
                chunk_bytes: 2_048,
                encode_ms: 1_500,
            }),
        );
    });
});

/** Quality Check writes its scene scores only in the end-of-run checkpoint. The chart
 * reads this table, so a score has to reach the row as each scene finishes. */
describe("a scored Quality Check scene", () => {
    it("patches its row from the live score", async () => {
        const { transport, push } = liveTransport(table());
        const Wrapper = ({ children }: { children: ReactNode }) => (
            <ApiProvider transport={transport}>
                <Shell>{children}</Shell>
            </ApiProvider>
        );

        const { result } = renderHook(() => useVideoScenes("project-quality", "video-1"), {
            wrapper: Wrapper,
        });
        await waitFor(() => expect(result.current.data).toBeDefined());

        act(() => push(quality()));

        await waitFor(() => expect(result.current.data?.scenes[0]?.quality_score).toBe(94.5));
    });
});
