// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SceneView } from "@av1ation/contracts";

import type { SceneSelection } from "./scene-selection";
import { SceneTimeline } from "./SceneTimeline";

afterEach(cleanup);

function scene(index: number): SceneView {
    return {
        index,
        start_frame: index * 24,
        end_frame: (index + 1) * 24,
        frame_count: 24,
        encoded: index === 1,
        chunk_bytes: index === 1 ? 2_048 : null,
        quantizer: null,
        score: null,
        encoder_label: "SVT-AV1",
        encoder_custom: false,
    };
}

const SELECTED: SceneSelection = { selected: new Set([1]), anchor: 1, cursor: 1 };

describe("SceneTimeline", () => {
    it("draws one proportional block per scene and one shared selection", () => {
        const { container } = render(
            <SceneTimeline
                scenes={[scene(0), scene(1), scene(2)]}
                selection={SELECTED}
                onSelectionChange={vi.fn()}
                onSeek={vi.fn()}
                playhead={24}
                frameRate={24}
            />,
        );

        expect(screen.getByRole("group").getAttribute("aria-label")).toContain(
            "3 scenes, 1 selected",
        );
        const blocks = container.querySelectorAll("[data-block]");
        expect(blocks).toHaveLength(3);
        // The ruler labels round intervals of the visible window, not fractions of it.
        expect(screen.getByText("00:00:01.0")).toBeDefined();
        expect(screen.getByText("00:00:02.0")).toBeDefined();
    });

    it("anchors a source-aspect still at the start of a block", () => {
        const { container } = render(
            <SceneTimeline
                scenes={[scene(0), scene(1), scene(2)]}
                selection={SELECTED}
                onSelectionChange={vi.fn()}
                onSeek={vi.fn()}
                playhead={0}
                frameRate={24}
                thumbnailFor={() => "/thumb.jpg"}
                aspectRatio={4 / 3}
                trackHeight={72}
            />,
        );

        const still = container.querySelector("[data-still]") as HTMLElement | null;
        expect(still).not.toBeNull();
        expect(still?.style.aspectRatio).toContain(String(4 / 3));
        expect(still?.className).toContain("left-0");
        expect(still?.className).not.toContain("w-full");
        expect(still?.querySelector("img")?.getAttribute("src")).toBe("/thumb.jpg");
        expect(still?.querySelector("img")?.getAttribute("class")).toContain("object-cover");
    });

    it("keeps the full-block crop when the source aspect is unknown", () => {
        const { container } = render(
            <SceneTimeline
                scenes={[scene(0), scene(1), scene(2)]}
                selection={SELECTED}
                onSelectionChange={vi.fn()}
                onSeek={vi.fn()}
                playhead={0}
                frameRate={24}
                thumbnailFor={() => "/thumb.jpg"}
            />,
        );

        const still = container.querySelector("[data-still]") as HTMLElement | null;
        expect(still?.style.aspectRatio).toBe("");
        expect(still?.className).toContain("w-full");
    });

    it("names the hovered scene in the readout and leaves a gap unnamed", () => {
        render(
            <SceneTimeline
                scenes={[scene(0), scene(1), scene(2)]}
                selection={SELECTED}
                onSelectionChange={vi.fn()}
                onSeek={vi.fn()}
                playhead={0}
                frameRate={24}
                totalFrames={240}
            />,
        );

        const track = screen.getByRole("group");
        track.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 300,
                bottom: 64,
                width: 300,
                height: 64,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        // 75 of 300 px across a 240-frame source is frame 60, inside scene 3.
        fireEvent.pointerMove(track, { pointerId: 1, clientX: 75 });
        const readout = screen.getByRole("status").textContent ?? "";
        expect(readout).toBe("03: 00:00:02.5 · f 60");

        // The scenes end at frame 72; past that the frame belongs to no block, so the
        // readout must not claim the last scene for it.
        fireEvent.pointerMove(track, { pointerId: 1, clientX: 280 });
        expect(screen.getByRole("status").textContent).toBe("00:00:09.3 · f 224");
    });

    it("seeks and selects on a click that does not move", () => {
        const onSelectionChange = vi.fn();
        const onSeek = vi.fn();
        render(
            <SceneTimeline
                scenes={[scene(0), scene(1), scene(2)]}
                selection={SELECTED}
                onSelectionChange={onSelectionChange}
                onSeek={onSeek}
                playhead={0}
                frameRate={24}
            />,
        );

        const track = screen.getByRole("group");
        track.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 300,
                bottom: 64,
                width: 300,
                height: 64,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        fireEvent.pointerDown(track, {
            button: 0,
            pointerId: 1,
            clientX: 0,
        });
        fireEvent.pointerUp(track, { pointerId: 1, clientX: 0 });

        const next = onSelectionChange.mock.calls[0]?.[0] as SceneSelection | undefined;
        expect([...(next?.selected ?? [])]).toEqual([0]);
        expect(onSeek).toHaveBeenCalledWith(0);
    });

    it("pans on drag instead of seeking or changing the multi-selection", () => {
        const onSelectionChange = vi.fn();
        const onSeek = vi.fn();
        render(
            <SceneTimeline
                scenes={[scene(0), scene(1), scene(2)]}
                selection={SELECTED}
                onSelectionChange={onSelectionChange}
                onSeek={onSeek}
                playhead={0}
                frameRate={24}
            />,
        );

        const track = screen.getByRole("group");
        // jsdom reports a zero-width rect; this is the 300 px track the component measures
        // in a real window. Half-way across a 72-frame span is frame 36, inside scene 1 —
        // not that scene's start, which is the bug the seek test guards against.
        track.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 300,
                bottom: 64,
                width: 300,
                height: 64,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        fireEvent.pointerDown(track, { button: 0, pointerId: 1, clientX: 150 });
        fireEvent.pointerMove(track, { pointerId: 1, clientX: 250 });
        fireEvent.pointerUp(track, { pointerId: 1, clientX: 250 });

        // A drag is a pan, never a scrub: the playhead did not move while the window did.
        expect(onSeek).not.toHaveBeenCalled();
        expect(onSelectionChange).not.toHaveBeenCalled();
    });

    it("pans a zoomed timeline by dragging it", () => {
        const onSeek = vi.fn();
        const { container } = render(
            <SceneTimeline
                scenes={[scene(0), scene(1), scene(2)]}
                selection={SELECTED}
                onSelectionChange={vi.fn()}
                onSeek={onSeek}
                playhead={0}
                frameRate={24}
            />,
        );

        const track = screen.getByRole("group");
        track.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 300,
                bottom: 64,
                width: 300,
                height: 64,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        // Zoom in first; at fit there is no overflow to pan.
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
        const window = () =>
            (container.querySelector("[data-block]")?.parentElement as HTMLElement).style.transform;
        const before = window();

        fireEvent.pointerDown(track, { button: 0, pointerId: 1, clientX: 200 });
        fireEvent.pointerMove(track, { pointerId: 1, clientX: 100 });
        fireEvent.pointerUp(track, { pointerId: 1, clientX: 100 });

        expect(window()).not.toBe(before);
        expect(onSeek).not.toHaveBeenCalled();
    });

    it("zooms on a plain wheel without a keyboard modifier", () => {
        const { container } = render(
            <SceneTimeline
                scenes={[scene(0), scene(1), scene(2)]}
                selection={SELECTED}
                onSelectionChange={vi.fn()}
                onSeek={vi.fn()}
                playhead={0}
                frameRate={24}
            />,
        );

        const track = screen.getByRole("group");
        track.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 300,
                bottom: 64,
                width: 300,
                height: 64,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        const window = () =>
            (container.querySelector("[data-block]")?.parentElement as HTMLElement).style.transform;
        const before = window();

        fireEvent.wheel(track, { deltaY: -120, clientX: 150 });

        expect(window()).not.toBe(before);
        expect(track.getAttribute("aria-label")).toContain("Scroll to zoom");
    });

    it("pinch-zooms a touch gesture around the fingers", () => {
        const onSeek = vi.fn();
        render(
            <SceneTimeline
                scenes={[scene(0), scene(1), scene(2)]}
                selection={SELECTED}
                onSelectionChange={vi.fn()}
                onSeek={onSeek}
                playhead={0}
                frameRate={24}
            />,
        );

        const track = screen.getByRole("group");
        track.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 300,
                bottom: 64,
                width: 300,
                height: 64,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        // Fit is 1.0; the toolbar takes it to 1.5 before the pinch doubles it again.
        fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
        fireEvent.pointerDown(track, {
            button: 0,
            pointerType: "touch",
            pointerId: 1,
            clientX: 100,
            clientY: 32,
        });
        fireEvent.pointerDown(track, {
            button: 0,
            pointerType: "touch",
            pointerId: 2,
            clientX: 200,
            clientY: 32,
        });
        fireEvent.pointerMove(track, {
            pointerType: "touch",
            pointerId: 2,
            clientX: 300,
            clientY: 32,
        });

        expect(screen.getByText("×3.0")).toBeDefined();
        // A pinch changes the window, never the playhead.
        expect(onSeek).not.toHaveBeenCalled();
    });

    it("scrubs past the last scene when the source is longer", () => {
        const onSeek = vi.fn();
        render(
            <SceneTimeline
                scenes={[scene(0), scene(1), scene(2)]}
                selection={SELECTED}
                onSelectionChange={vi.fn()}
                onSeek={onSeek}
                playhead={0}
                frameRate={24}
                totalFrames={240}
            />,
        );

        const track = screen.getByRole("group");
        track.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 300,
                bottom: 64,
                width: 300,
                height: 64,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        fireEvent.pointerDown(track, { button: 0, pointerId: 1, clientX: 225 });
        fireEvent.pointerUp(track, { button: 0, pointerId: 1, clientX: 225 });
        expect(onSeek).toHaveBeenLastCalledWith(180);
    });

    it("lets a video with no scenes be scrubbed", () => {
        const onSeek = vi.fn();
        render(
            <SceneTimeline
                scenes={[]}
                selection={{ selected: new Set(), anchor: null, cursor: null }}
                onSelectionChange={vi.fn()}
                onSeek={onSeek}
                playhead={0}
                frameRate={24}
                totalFrames={240}
            />,
        );

        const track = screen.getByRole("group");
        track.getBoundingClientRect = () =>
            ({
                left: 0,
                top: 0,
                right: 300,
                bottom: 64,
                width: 300,
                height: 64,
                x: 0,
                y: 0,
                toJSON: () => ({}),
            }) as DOMRect;

        fireEvent.pointerDown(track, { button: 0, pointerId: 1, clientX: 150 });
        fireEvent.pointerUp(track, { button: 0, pointerId: 1, clientX: 150 });
        expect(onSeek).toHaveBeenLastCalledWith(120);
    });

    it("steps the shared selection with the keyboard", () => {
        const onSelectionChange = vi.fn();
        const onSeek = vi.fn();
        render(
            <SceneTimeline
                scenes={[scene(0), scene(1), scene(2)]}
                selection={SELECTED}
                onSelectionChange={onSelectionChange}
                onSeek={onSeek}
                playhead={24}
                frameRate={24}
            />,
        );

        fireEvent.keyDown(screen.getByRole("group"), { key: "ArrowDown" });

        const next = onSelectionChange.mock.calls[0]?.[0] as SceneSelection | undefined;
        expect(next?.cursor).toBe(2);
        expect([...(next?.selected ?? [])]).toEqual([2]);
        expect(onSeek).toHaveBeenCalledWith(48);
    });
});
