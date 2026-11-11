// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import type { SceneView } from "@av1ation/contracts";
import { toast } from "sonner";

import { NO_SELECTION } from "./scene-selection";
import { useSceneCommands, type SceneCommandsOptions } from "./useSceneCommands";

const mutations = vi.hoisted(() => {
    const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null });
    return {
        add: mutation(),
        split: mutation(),
        merge: mutation(),
        reset: mutation(),
        remove: mutation(),
        range: mutation(),
        data: mutation(),
        undo: mutation(),
    };
});

vi.mock("@av1ation/api", () => ({
    useAddVideoScene: () => mutations.add,
    useSplitVideoScene: () => mutations.split,
    useMergeVideoScenes: () => mutations.merge,
    useResetVideoSceneOutputs: () => mutations.reset,
    useDeleteVideoScene: () => mutations.remove,
    useSetVideoSceneRange: () => mutations.range,
    useSetVideoSceneData: () => mutations.data,
    useUndoVideoSceneEdit: () => mutations.undo,
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

interface MutationCall {
    input: unknown;
    options: {
        onSuccess?: () => void;
        onError?: (error: Error) => void;
    };
}

function lastCall(mutation: { mutate: Mock }): MutationCall | undefined {
    const call = mutation.mutate.mock.calls.at(-1) as
        [unknown, MutationCall["options"]] | undefined;
    if (call === undefined) {
        return undefined;
    }
    return { input: call[0], options: call[1] };
}

function succeed(call: MutationCall | undefined) {
    act(() => {
        call?.options.onSuccess?.();
    });
}

function scene(index: number, start: number, end: number): SceneView {
    return {
        index,
        start_frame: start,
        end_frame: end,
        frame_count: end - start,
        encoded: false,
        quantizer: null,
        score: null,
        encoder_label: "SVT-AV1",
        encoder_custom: false,
    };
}

function options(overrides: Partial<SceneCommandsOptions> = {}): SceneCommandsOptions {
    return {
        projectId: "project",
        videoId: "video",
        locked: false,
        scenes: [scene(0, 0, 50), scene(1, 50, 100)],
        sourceFrames: 120,
        selectedIndices: [0, 1],
        onApplied: vi.fn(),
        ...overrides,
    };
}

function mount(overrides: Partial<SceneCommandsOptions> = {}) {
    const onApplied = vi.fn();
    const hook = renderHook((props: SceneCommandsOptions) => useSceneCommands(props), {
        initialProps: options({ onApplied, ...overrides }),
    });
    return { ...hook, onApplied };
}

beforeEach(() => {
    vi.clearAllMocks();
    for (const mutation of Object.values(mutations)) {
        mutation.isPending = false;
        mutation.error = null;
    }
});

describe("useSceneCommands", () => {
    it("adds a scene in the gap, moves the playhead, and closes the menu", () => {
        const { result, onApplied } = mount();

        act(() => {
            result.current.addSceneAt(110);
        });

        const call = lastCall(mutations.add);
        expect(call?.input).toEqual({ start_frame: 100, end_frame: 120 });
        succeed(call);

        expect(onApplied).toHaveBeenCalledWith({
            selection: NO_SELECTION,
            playhead: 100,
            closeMenu: true,
            canUndo: true,
        });
        expect(toast.success).toHaveBeenCalledWith("Added scene 100–119");
    });

    it("does not add a scene where one already exists", () => {
        const { result } = mount();

        act(() => {
            result.current.addSceneAt(10);
        });

        expect(mutations.add.mutate).not.toHaveBeenCalled();
    });

    it("splits at the requested frame and leaves the playhead there", () => {
        const { result, onApplied } = mount();

        act(() => {
            result.current.splitAt(25);
        });

        const call = lastCall(mutations.split);
        expect(call?.input).toEqual({ frame: 25 });
        succeed(call);

        expect(onApplied).toHaveBeenCalledWith({
            selection: NO_SELECTION,
            playhead: 25,
            closeMenu: true,
            canUndo: true,
        });
        expect(toast.success).toHaveBeenCalledWith("Split scene at frame 25");
    });

    it("merges the whole sorted selection and clears it on success", () => {
        const { result, onApplied } = mount({ selectedIndices: [1, 0] });

        act(() => {
            result.current.mergeSelection();
        });

        const call = lastCall(mutations.merge);
        expect(call?.input).toEqual({ scenes: [1, 0] });
        succeed(call);

        expect(onApplied).toHaveBeenCalledWith({
            selection: NO_SELECTION,
            closeMenu: true,
            canUndo: true,
        });
        expect(toast.success).toHaveBeenCalledWith("Scenes merged");
    });

    it("needs two selected scenes before merging", () => {
        const { result } = mount({ selectedIndices: [0] });

        act(() => {
            result.current.mergeSelection();
        });

        expect(mutations.merge.mutate).not.toHaveBeenCalled();
    });

    it("validates a range before sending it", () => {
        const { result } = mount();

        act(() => {
            result.current.changeRange(0, 10.5, 20);
        });
        expect(toast.error).toHaveBeenCalledWith("Scene boundaries must be whole frame numbers.");
        expect(mutations.range.mutate).not.toHaveBeenCalled();

        act(() => {
            result.current.changeRange(0, 20, 20);
        });
        expect(toast.error).toHaveBeenCalledWith("A scene must end after it starts.");
        expect(mutations.range.mutate).not.toHaveBeenCalled();
    });

    it("writes a range and offers only undo afterwards", () => {
        const { result, onApplied } = mount();

        act(() => {
            result.current.changeRange(0, 0, 50);
        });

        const call = lastCall(mutations.range);
        expect(call?.input).toEqual({ index: 0, start_frame: 0, end_frame: 50 });
        succeed(call);

        expect(onApplied).toHaveBeenCalledWith({ canUndo: true });
    });

    it("stores custom data without touching selection, playhead, or undo", () => {
        const { result, onApplied } = mount();

        act(() => {
            result.current.changeCustomData(1, { gain: 2.5 });
        });

        expect(lastCall(mutations.data)?.input).toEqual({ index: 1, values: { gain: 2.5 } });
        expect(onApplied).not.toHaveBeenCalled();
    });

    it("deletes the selected scene, closes the dialog, and clears the selection", () => {
        const { result, onApplied } = mount({ selectedIndices: [0] });

        act(() => {
            result.current.deleteSelected();
        });

        const call = lastCall(mutations.remove);
        expect(call?.input).toBe(0);
        succeed(call);

        expect(onApplied).toHaveBeenCalledWith({
            selection: NO_SELECTION,
            closeDelete: true,
            canUndo: true,
        });
        expect(toast.success).toHaveBeenCalledWith("Scene 1 deleted; frames 0–49 are uncovered");
    });

    it("resets the selected chunks without changing the selection", () => {
        const { result, onApplied } = mount();

        act(() => {
            result.current.resetOutputs();
        });

        const call = lastCall(mutations.reset);
        expect(call?.input).toEqual({ scenes: [0, 1] });
        succeed(call);

        expect(onApplied).toHaveBeenCalledWith({ closeReset: true });
        expect(toast.success).toHaveBeenCalledWith("2 scene chunks deleted");
    });

    it("needs a selection before resetting chunks", () => {
        const { result } = mount({ selectedIndices: [] });

        act(() => {
            result.current.resetOutputs();
        });

        expect(mutations.reset.mutate).not.toHaveBeenCalled();
    });

    it("undoes the last edit and drops the selection", () => {
        const { result, onApplied } = mount();

        act(() => {
            result.current.undo();
        });

        expect(mutations.undo.mutate).toHaveBeenCalledTimes(1);
        succeed(lastCall(mutations.undo));

        expect(onApplied).toHaveBeenCalledWith({ selection: NO_SELECTION, canUndo: false });
    });

    it("surfaces a refused request through the shared error path", () => {
        const { result, onApplied } = mount();

        act(() => {
            result.current.splitAt(25);
        });
        const call = lastCall(mutations.split);
        act(() => {
            call?.options.onError?.(new Error("The scene table rejected the edit."));
        });

        expect(toast.error).toHaveBeenCalledWith("The scene table rejected the edit.");
        expect(onApplied).not.toHaveBeenCalled();
    });

    it("blocks every command while another edit is being written", () => {
        mutations.range.isPending = true;
        const { result } = mount();

        expect(result.current.busy).toBe(true);
        act(() => {
            result.current.addSceneAt(110);
            result.current.splitAt(25);
            result.current.mergeSelection();
            result.current.changeRange(0, 0, 50);
            result.current.changeCustomData(0, { gain: 1 });
            result.current.deleteSelected();
            result.current.resetOutputs();
            result.current.undo();
        });

        expect(mutations.add.mutate).not.toHaveBeenCalled();
        expect(mutations.split.mutate).not.toHaveBeenCalled();
        expect(mutations.merge.mutate).not.toHaveBeenCalled();
        expect(mutations.range.mutate).not.toHaveBeenCalled();
        expect(mutations.data.mutate).not.toHaveBeenCalled();
        expect(mutations.remove.mutate).not.toHaveBeenCalled();
        expect(mutations.reset.mutate).not.toHaveBeenCalled();
        expect(mutations.undo.mutate).not.toHaveBeenCalled();
    });

    it("blocks every command while a run holds the configuration lock", () => {
        const { result } = mount({ locked: true });

        act(() => {
            result.current.addSceneAt(110);
            result.current.splitAt(25);
            result.current.mergeSelection();
            result.current.changeRange(0, 0, 50);
            result.current.changeCustomData(0, { gain: 1 });
            result.current.deleteSelected();
            result.current.resetOutputs();
            result.current.undo();
        });

        expect(mutations.add.mutate).not.toHaveBeenCalled();
        expect(mutations.split.mutate).not.toHaveBeenCalled();
        expect(mutations.merge.mutate).not.toHaveBeenCalled();
        expect(mutations.range.mutate).not.toHaveBeenCalled();
        expect(mutations.data.mutate).not.toHaveBeenCalled();
        expect(mutations.remove.mutate).not.toHaveBeenCalled();
        expect(mutations.reset.mutate).not.toHaveBeenCalled();
        expect(mutations.undo.mutate).not.toHaveBeenCalled();
    });

    it("exposes per-dialog pending flags and the shared busy state", () => {
        mutations.reset.isPending = true;
        mutations.remove.isPending = true;
        const { result } = mount();

        expect(result.current.busy).toBe(true);
        expect(result.current.resetPending).toBe(true);
        expect(result.current.deletePending).toBe(true);
    });
});
