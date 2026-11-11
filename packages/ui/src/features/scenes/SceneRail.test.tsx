// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SceneView } from "@av1ation/contracts";

import { NO_SELECTION, type SceneSelection } from "./scene-selection";
import { SceneRail } from "./SceneRail";
import { SceneTimeline } from "./SceneTimeline";

afterEach(cleanup);

function scene(index: number): SceneView {
    return {
        index,
        start_frame: index * 24,
        end_frame: (index + 1) * 24,
        frame_count: 24,
        encoded: index % 2 === 0,
        chunk_bytes: index % 2 === 0 ? 1_024 : null,
        quantizer: 24,
        score: 92,
        encoder_label: "SVT-AV1",
        encoder_custom: index === 3,
    };
}

function scenes(count: number): SceneView[] {
    return Array.from({ length: count }, (_, index) => scene(index));
}

describe("SceneRail", () => {
    it("mounts only the visible window of a 5,000-scene list", () => {
        render(
            <SceneRail
                scenes={scenes(5_000)}
                selection={NO_SELECTION}
                onSelectionChange={vi.fn()}
                onSeek={vi.fn()}
                frameRate={24}
                height={440}
            />,
        );

        const rows = screen.getAllByRole("option");
        expect(rows.length).toBeLessThanOrEqual(30);
        expect(rows[0]?.textContent).toContain("0–23");
        expect(screen.queryByText("4,999")).toBeNull();
    });

    it("moves and extends the selection with the keyboard", () => {
        const onSelectionChange = vi.fn<(next: SceneSelection) => void>();
        const onSeek = vi.fn();
        const view = render(
            <SceneRail
                scenes={scenes(50)}
                selection={NO_SELECTION}
                onSelectionChange={onSelectionChange}
                onSeek={onSeek}
                frameRate={24}
                height={440}
            />,
        );

        const rail = screen.getByRole("listbox");
        fireEvent.keyDown(rail, { key: "ArrowDown" });
        expect(onSelectionChange).toHaveBeenCalledTimes(1);
        const moved = onSelectionChange.mock.calls[0]?.[0];
        expect(moved?.cursor).toBe(0);
        expect([...(moved?.selected ?? [])]).toEqual([0]);
        expect(onSeek).toHaveBeenCalledWith(0);

        onSelectionChange.mockClear();
        view.rerender(
            <SceneRail
                scenes={scenes(50)}
                selection={moved ?? NO_SELECTION}
                onSelectionChange={onSelectionChange}
                onSeek={onSeek}
                frameRate={24}
                height={440}
            />,
        );
        fireEvent.keyDown(screen.getByRole("listbox"), {
            key: "PageDown",
            shiftKey: true,
        });
        const page = onSelectionChange.mock.calls[0]?.[0];
        expect(page?.selected.size).toBe(10);
        expect(page?.anchor).toBe(0);
        expect(page?.cursor).toBe(9);
    });

    it("sweeps a range from one pointer drag", () => {
        const onSelectionChange = vi.fn<(next: SceneSelection) => void>();
        render(
            <SceneRail
                scenes={scenes(50)}
                selection={NO_SELECTION}
                onSelectionChange={onSelectionChange}
                onSeek={vi.fn()}
                frameRate={null}
                height={440}
            />,
        );

        const rail = screen.getByRole("listbox");
        fireEvent.pointerDown(rail, { button: 0, pointerId: 1, clientY: 0 });
        fireEvent.pointerMove(rail, { pointerId: 1, clientY: 88 });
        fireEvent.pointerUp(rail, { pointerId: 1, clientY: 88 });

        const swept = onSelectionChange.mock.calls.at(-1)?.[0];
        expect([...(swept?.selected ?? [])]).toEqual([0, 1, 2]);
        expect(swept?.cursor).toBe(2);
    });

    it("jumps to a frame typed into the find field", () => {
        const onSelectionChange = vi.fn<(next: SceneSelection) => void>();
        const onSeek = vi.fn();
        render(
            <SceneRail
                scenes={scenes(50)}
                selection={NO_SELECTION}
                onSelectionChange={onSelectionChange}
                onSeek={onSeek}
                frameRate={24}
                height={440}
            />,
        );

        fireEvent.change(screen.getByRole("searchbox"), { target: { value: "48" } });
        fireEvent.keyDown(screen.getByRole("searchbox"), { key: "Enter" });

        const jumped = onSelectionChange.mock.calls.at(-1)?.[0];
        expect([...(jumped?.selected ?? [])]).toEqual([2]);
        expect(onSeek).toHaveBeenCalledWith(48);
    });

    it("accepts the player's full timecode in the find field", () => {
        const onSelectionChange = vi.fn<(next: SceneSelection) => void>();
        const onSeek = vi.fn();
        render(
            <SceneRail
                scenes={scenes(50)}
                selection={NO_SELECTION}
                onSelectionChange={onSelectionChange}
                onSeek={onSeek}
                frameRate={24}
                sourceFrames={1_200}
                height={440}
            />,
        );

        const input = screen.getByRole("searchbox");
        fireEvent.change(input, { target: { value: "00:00:02.0" } });
        fireEvent.keyDown(input, { key: "Enter" });

        const jumped = onSelectionChange.mock.calls.at(-1)?.[0];
        expect([...(jumped?.selected ?? [])]).toEqual([2]);
        expect(onSeek).toHaveBeenCalledWith(48);
    });

    it("refuses an out-of-range query and clears the inline error on edit", () => {
        const onSelectionChange = vi.fn<(next: SceneSelection) => void>();
        const onSeek = vi.fn();
        render(
            <SceneRail
                scenes={scenes(50)}
                selection={NO_SELECTION}
                onSelectionChange={onSelectionChange}
                onSeek={onSeek}
                frameRate={24}
                sourceFrames={1_200}
                height={440}
            />,
        );

        const input = screen.getByRole("searchbox");
        fireEvent.change(input, { target: { value: "1200" } });
        fireEvent.keyDown(input, { key: "Enter" });

        expect(onSelectionChange).not.toHaveBeenCalled();
        expect(onSeek).not.toHaveBeenCalled();
        expect(input.getAttribute("aria-invalid")).toBe("true");
        expect(screen.getByRole("alert").textContent).toContain(
            "Enter a frame or time within the source.",
        );

        fireEvent.change(input, { target: { value: "48" } });
        expect(input.getAttribute("aria-invalid")).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();

        fireEvent.keyDown(input, { key: "Enter" });
        expect(onSeek).toHaveBeenCalledWith(48);
    });

    it("says how much of the source the scene table covers", () => {
        render(
            <SceneRail
                scenes={scenes(2)}
                selection={NO_SELECTION}
                onSelectionChange={vi.fn()}
                onSeek={vi.fn()}
                frameRate={24}
                sourceFrames={60}
                height={440}
            />,
        );

        expect(screen.getByText(/2 scenes · 48 of 60 frames/)).toBeDefined();
    });

    it("marks invalid bounds and falls back to frame counts without a rate", () => {
        const invalid = { ...scene(0), end_frame: 0, frame_count: 0, encoded: false };
        render(
            <SceneRail
                scenes={[invalid]}
                selection={{ selected: new Set([0]), anchor: 0, cursor: 0 }}
                onSelectionChange={vi.fn()}
                onSeek={vi.fn()}
                frameRate={null}
                height={440}
            />,
        );

        expect(screen.getByLabelText("Invalid scene boundaries")).toBeDefined();
        expect(screen.getByText("0 frames")).toBeDefined();
    });

    it("draws the same cached thumbnail as the timeline for a scene", () => {
        const url = "/api/projects/p/videos/v/thumbnails/1?v=revision";
        const thumbnailFor = vi.fn(() => url);
        const list = [scene(0), scene(1)];

        const rail = render(
            <SceneRail
                scenes={list}
                selection={NO_SELECTION}
                onSelectionChange={vi.fn()}
                onSeek={vi.fn()}
                frameRate={24}
                thumbnailFor={thumbnailFor}
                height={440}
            />,
        );
        expect(rail.container.querySelector("img")?.getAttribute("src")).toBe(url);
        rail.unmount();

        const timeline = render(
            <SceneTimeline
                scenes={list}
                selection={NO_SELECTION}
                onSelectionChange={vi.fn()}
                onSeek={vi.fn()}
                playhead={0}
                frameRate={24}
                thumbnailFor={thumbnailFor}
            />,
        );
        expect(timeline.container.querySelector("img")?.getAttribute("src")).toBe(url);
        expect(thumbnailFor).toHaveBeenCalledWith(0);
    });
});
