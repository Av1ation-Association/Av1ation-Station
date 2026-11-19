// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { clearLive, MockTransport, recordLive, useSettings } from "@av1ation/api";
import type {
    AppSettings,
    EncodeEvent,
    PreviewOverlaySettings,
    SceneView,
} from "@av1ation/contracts";

import { renderWithApi } from "../../test/render";
import { PreviewOverlay } from "./PreviewOverlay";

const SCENE = {
    index: 1,
    start_frame: 48,
    end_frame: 96,
    frame_count: 48,
    encoded: true,
    chunk_bytes: 12_000_000,
    encoder_label: "SVT-AV1",
    encoder_custom: false,
    quality_score: 92.4,
    quantizer: 28,
    score: 0.97,
    noise: 1.2,
    noise_scaler: 0.8,
} as SceneView;

const OVERLAY: PreviewOverlaySettings = {
    enabled: true,
    target_quality: true,
    quality_check: true,
    noise: true,
    chunk: false,
    encoder: false,
    live_stage: true,
    progress: true,
    fps_eta: false,
};

function transportWith(overrides: Partial<PreviewOverlaySettings>): MockTransport {
    const transport = new MockTransport({ mediaUrl: () => "blob:preview" });
    const settings = structuredClone(transport.routes.get("/api/settings") as AppSettings);
    settings.preview_overlay = { ...OVERLAY, ...overrides };
    transport.routes.set("/api/settings", settings);
    return transport;
}

afterEach(clearLive);

describe("PreviewOverlay", () => {
    it("renders the scene at the playhead and only the enabled facts", async () => {
        renderWithApi(<PreviewOverlay projectId="project" videoId="video" scene={SCENE} />, {
            transport: transportWith({}),
        });

        expect(await screen.findByLabelText("Preview overlay")).toBeTruthy();
        expect(screen.getByText(/Scene 2/)).toBeTruthy();
        expect(screen.getByText(/48/)).toBeTruthy();
        expect(screen.getByText(/Q28/)).toBeTruthy();
        expect(screen.getByText(/0\.970/)).toBeTruthy();
        expect(screen.getByText("92.4")).toBeTruthy();
        expect(screen.getByText(/1\.20/)).toBeTruthy();
        expect(screen.queryByText("Chunk")).toBeNull();
        expect(screen.queryByText("Encoder")).toBeNull();
        expect(screen.queryByText("Speed")).toBeNull();
    });

    it("does not render while the overlay preference is off", async () => {
        const Probe = () => {
            const settings = useSettings();
            return (
                <>
                    <span>{settings.data === undefined ? "loading" : "loaded"}</span>
                    <PreviewOverlay projectId="project" videoId="video" scene={SCENE} />
                </>
            );
        };
        renderWithApi(<Probe />, { transport: transportWith({ enabled: false }) });

        expect(await screen.findByText("loaded")).toBeTruthy();
        expect(screen.queryByLabelText("Preview overlay")).toBeNull();
    });

    it("adds the live stage and progress rows for this video's run", async () => {
        renderWithApi(<PreviewOverlay projectId="project" videoId="video" scene={SCENE} />, {
            transport: transportWith({}),
        });
        expect(await screen.findByLabelText("Preview overlay")).toBeTruthy();

        act(() => {
            recordLive([
                {
                    at: "2026-11-19T10:00:00Z",
                    kind: "progress",
                    message: "Encoding scene 2",
                    project_id: "project",
                    video_id: "video",
                    run_id: "run",
                    sequence: "ParallelEncoder",
                    progress: 42,
                    phase: "Encode",
                    pass: 2,
                } as EncodeEvent,
            ]);
        });

        expect(await screen.findByText(/Encoding · Encode · pass 2/)).toBeTruthy();
        expect(screen.getByText("42%")).toBeTruthy();
    });
});
