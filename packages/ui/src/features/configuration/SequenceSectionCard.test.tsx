// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";
import type { VideoFailure } from "@av1ation/contracts";

import { renderRoute } from "../../test/render";
import type { TimelineStep } from "../../shared/model/video-timeline";

import { SequenceSectionCard } from "./SequenceSectionCard";

const STEP: TimelineStep = {
    id: "SceneDetector",
    name: "Scene Detector",
    status: "incomplete",
    label: "Incomplete",
    detail: "32.1%, 101 found",
    next: true,
    runnable: true,
    progress: null,
};

const RUN_FAILURE: VideoFailure = {
    at: "2026-11-09T00:00:00Z",
    message: "script error\nTraceback line",
    run_id: "run-1",
    sequence: "SceneDetector",
};

function renderCard(
    onRun: (sequence: string) => void,
    refusal: { sequence: string; message: string } | null = null,
    runFailure: VideoFailure | null = null,
    blockedElsewhere = false,
) {
    renderRoute(
        <SequenceSectionCard
            projectId="project-1"
            videoId="video-1"
            section="scene-detection"
            title="Scene detection"
            lines={["AVSceneChange · 24–240 frames"]}
            badge={null}
            steps={[STEP]}
            locked={false}
            lockedLabel="Locked while an encode runs"
            runningVideo={false}
            blockedElsewhere={blockedElsewhere}
            onRun={onRun}
            onStop={() => undefined}
            onResetData={() => undefined}
            onResetConfiguration={() => undefined}
            resetConfigurationDisabled
            pending={false}
            refusal={refusal}
            runFailure={runFailure}
        />,
        {
            route: "/projects/$projectId/videos/$videoId/config/$section",
            initialEntry: "/projects/project-1/videos/video-1/config/scene-detection",
            transport: new MockTransport(),
        },
    );
}

describe("SequenceSectionCard", () => {
    it("offers Resume for a partial sequence and starts only that sequence", async () => {
        const onRun = vi.fn();
        renderCard(onRun);

        const resume = await screen.findByRole("button", {
            name: "Resume Scene Detector",
        });
        fireEvent.click(resume);

        expect(onRun).toHaveBeenCalledWith("SceneDetector");
        expect(screen.queryByText("Start")).toBeNull();
    });

    it("disables a start while another video holds the encode lock", async () => {
        const onRun = vi.fn();
        renderCard(onRun, null, null, true);

        const start = await screen.findByRole("button", {
            name: "Resume Scene Detector",
        });
        expect(start.hasAttribute("disabled")).toBe(true);
        expect(start.getAttribute("data-tip")).toContain("Another video is encoding");
        fireEvent.click(start);
        expect(onRun).not.toHaveBeenCalled();
    });

    it("states a refused start on the row that issued it", async () => {
        renderCard(vi.fn(), {
            sequence: "SceneDetector",
            message: "Another video is encoding.",
        });

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("Another video is encoding.");
    });

    it("carries the failed run in the card without replacing a refused retry", async () => {
        renderCard(
            vi.fn(),
            {
                sequence: "SceneDetector",
                message: "Another video is encoding.",
            },
            RUN_FAILURE,
        );

        const alerts = await screen.findAllByRole("alert");
        expect(alerts).toHaveLength(2);
        const runAlert = screen.getByText("Scene Detector failed.").closest("[role='alert']");
        expect(runAlert?.textContent).toContain("script error");
        expect(runAlert?.textContent).not.toContain("Traceback line");
        expect(screen.getByTitle(/script error/)).toBeDefined();
        expect(screen.getByText("Another video is encoding.")).toBeDefined();
    });
});
