import type { SceneView } from "@av1ation/contracts";
import {
    useAddVideoScene,
    useDeleteVideoScene,
    useMergeVideoScenes,
    useResetVideoSceneOutputs,
    useSetVideoSceneData,
    useSetVideoSceneRange,
    useSplitVideoScene,
    useUndoVideoSceneEdit,
} from "@av1ation/api";
import { toast } from "sonner";

import { sceneGapAt } from "./scene-screen-model";
import { NO_SELECTION, type SceneSelection } from "./scene-selection";

/** The editor state a successful command asks the screen to apply. */
export interface SceneCommandEffects {
    selection?: SceneSelection;
    playhead?: number;
    closeMenu?: boolean;
    canUndo?: boolean;
    closeReset?: boolean;
    closeDelete?: boolean;
}

export interface SceneCommandsOptions {
    projectId: string;
    videoId: string;
    locked: boolean;
    scenes: readonly SceneView[];
    sourceFrames: number;
    selectedIndices: readonly number[];
    onApplied: (effects: SceneCommandEffects) => void;
}

/**
 * One seam for every structural scene edit.
 *
 * The screen keeps the editor state it renders: selection, playhead, context menu, and the
 * two confirmation dialogs. This module owns the shared policy around changing the table:
 * the lock and one-edit-at-a-time guard, the mutation call, the error path, and the effects
 * a successful command asks the screen to apply. Each command still carries its own effect
 * set because the operations are not interchangeable: add and split move the playhead,
 * merge and delete clear the selection, and reset deliberately leaves both alone.
 */
export function useSceneCommands({
    projectId,
    videoId,
    locked,
    scenes,
    sourceFrames,
    selectedIndices,
    onApplied,
}: SceneCommandsOptions) {
    const add = useAddVideoScene(projectId, videoId);
    const split = useSplitVideoScene(projectId, videoId);
    const merge = useMergeVideoScenes(projectId, videoId);
    const resetOutputsMutation = useResetVideoSceneOutputs(projectId, videoId);
    const remove = useDeleteVideoScene(projectId, videoId);
    const setRange = useSetVideoSceneRange(projectId, videoId);
    const setSceneData = useSetVideoSceneData(projectId, videoId);
    const undoMutation = useUndoVideoSceneEdit(projectId, videoId);

    const busy =
        add.isPending ||
        split.isPending ||
        merge.isPending ||
        resetOutputsMutation.isPending ||
        remove.isPending ||
        setRange.isPending ||
        setSceneData.isPending ||
        undoMutation.isPending;

    const fail = (error: Error) => {
        toast.error(error.message);
    };

    const addSceneAt = (frame: number) => {
        if (locked || busy) {
            return;
        }
        const gap = sceneGapAt(scenes, sourceFrames, frame);
        if (gap === null) {
            return;
        }
        add.mutate(
            { start_frame: gap.start, end_frame: gap.end },
            {
                onSuccess: () => {
                    onApplied({
                        selection: NO_SELECTION,
                        playhead: gap.start,
                        closeMenu: true,
                        canUndo: true,
                    });
                    toast.success(
                        `Added scene ${gap.start.toLocaleString()}–${(gap.end - 1).toLocaleString()}`,
                    );
                },
                onError: fail,
            },
        );
    };

    const splitAt = (frame: number) => {
        if (locked || busy) {
            return;
        }
        split.mutate(
            { frame },
            {
                onSuccess: () => {
                    onApplied({
                        selection: NO_SELECTION,
                        playhead: frame,
                        closeMenu: true,
                        canUndo: true,
                    });
                    toast.success(`Split scene at frame ${frame.toLocaleString()}`);
                },
                onError: fail,
            },
        );
    };

    const mergeSelection = () => {
        if (locked || busy || selectedIndices.length < 2) {
            return;
        }
        merge.mutate(
            { scenes: [...selectedIndices] },
            {
                onSuccess: () => {
                    onApplied({ selection: NO_SELECTION, closeMenu: true, canUndo: true });
                    toast.success("Scenes merged");
                },
                onError: fail,
            },
        );
    };

    /** Replace one scene's boundaries; the service leaves its neighbours alone. */
    const changeRange = (index: number, startFrame: number, endFrame: number) => {
        if (locked || busy) {
            return;
        }
        if (!Number.isInteger(startFrame) || !Number.isInteger(endFrame)) {
            toast.error("Scene boundaries must be whole frame numbers.");
            return;
        }
        if (endFrame <= startFrame) {
            toast.error("A scene must end after it starts.");
            return;
        }
        setRange.mutate(
            { index, start_frame: startFrame, end_frame: endFrame },
            {
                onSuccess: () => onApplied({ canUndo: true }),
                onError: fail,
            },
        );
    };

    const changeCustomData = (index: number, values: Record<string, unknown>) => {
        if (locked || busy) {
            return;
        }
        setSceneData.mutate({ index, values }, { onError: fail });
    };

    const deleteSelected = () => {
        const index = selectedIndices[0];
        const scene = index === undefined ? undefined : scenes[index];
        if (locked || busy || scene === undefined) {
            return;
        }
        remove.mutate(scene.index, {
            onSuccess: () => {
                onApplied({
                    selection: NO_SELECTION,
                    closeDelete: true,
                    canUndo: true,
                });
                toast.success(
                    `Scene ${String(scene.index + 1)} deleted; frames ${scene.start_frame.toLocaleString()}–${Math.max(scene.start_frame, scene.end_frame - 1).toLocaleString()} are uncovered`,
                );
            },
            onError: fail,
        });
    };

    const undo = () => {
        if (locked || busy) {
            return;
        }
        undoMutation.mutate(undefined, {
            onSuccess: () => {
                onApplied({ selection: NO_SELECTION, canUndo: false });
                toast.success("Scene edit undone; re-run encoding to write the chunks again");
            },
            onError: fail,
        });
    };

    const resetOutputs = () => {
        if (locked || busy || selectedIndices.length === 0) {
            return;
        }
        const count = selectedIndices.length;
        resetOutputsMutation.mutate(
            { scenes: [...selectedIndices] },
            {
                onSuccess: () => {
                    onApplied({ closeReset: true });
                    toast.success(
                        count === 1
                            ? "Scene chunk deleted; run Encoding to write it again"
                            : `${String(count)} scene chunks deleted`,
                    );
                },
                onError: fail,
            },
        );
    };

    return {
        busy,
        resetPending: resetOutputsMutation.isPending,
        deletePending: remove.isPending,
        resetError: resetOutputsMutation.error,
        deleteError: remove.error,
        addSceneAt,
        splitAt,
        mergeSelection,
        changeRange,
        changeCustomData,
        deleteSelected,
        resetOutputs,
        undo,
    };
}
