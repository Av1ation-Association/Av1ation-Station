import type { ReactNode } from "react";

import type { SceneView } from "@av1ation/contracts";
import { Plus } from "lucide-react";

import { formatTimecode } from "../../shared/format";
import {
    Menu,
    MenuContent,
    MenuItem,
    MenuLabel,
    MenuSeparator,
    MenuTrigger,
} from "../../shared/Menu";
import { sceneAtFrame } from "../../shared/model/scene-layout";

export function SceneContextMenu({
    children,
    frame,
    frameRate,
    gap,
    scenes,
    selectedIndices,
    locked,
    busy,
    onClose,
    onAdd,
    onSplit,
    onMerge,
    onReset,
    onCopy,
}: {
    /** The timeline region whose right-click opens this menu. */
    children: ReactNode;
    frame: number | null;
    frameRate: number | null;
    gap: { start: number; end: number } | null;
    scenes: readonly SceneView[];
    selectedIndices: readonly number[];
    locked: boolean;
    /** True while any scene edit is being written; all edit actions share one guard. */
    busy: boolean;
    onClose: () => void;
    onAdd: () => void;
    onSplit: () => void;
    onMerge: () => void;
    onReset: () => void;
    onCopy: (text: string, label: string) => void;
}) {
    return (
        <Menu
            mode="context"
            open={frame !== null}
            onOpenChange={(open) => {
                if (!open) {
                    onClose();
                }
            }}
        >
            <MenuTrigger asChild>
                <div className="contents">{children}</div>
            </MenuTrigger>
            {frame === null ? null : (
                <MenuContent className="w-52" aria-label="Scene actions">
                    <MenuLabel>
                        frame {frame.toLocaleString()} · {formatTimecode(frame, frameRate)}
                    </MenuLabel>
                    {gap === null ? (
                        <MenuItem disabled={locked || busy} onSelect={onSplit}>
                            Split at this frame
                        </MenuItem>
                    ) : (
                        <MenuItem disabled={locked || busy} onSelect={onAdd}>
                            <Plus
                                aria-hidden="true"
                                className="h-3 w-3 shrink-0"
                                strokeWidth={1.8}
                            />
                            Add scene here
                        </MenuItem>
                    )}
                    <MenuItem
                        disabled={locked || busy || selectedIndices.length < 2}
                        onSelect={onMerge}
                    >
                        Merge selected scenes
                    </MenuItem>
                    <MenuItem
                        disabled={locked || busy || selectedIndices.length === 0}
                        onSelect={onReset}
                    >
                        Delete selected chunks
                    </MenuItem>
                    {locked ? (
                        <MenuLabel className="px-2 py-1 text-[9px] leading-snug">
                            Read-only while a sequence runs. Copy actions stay available.
                        </MenuLabel>
                    ) : null}
                    <MenuSeparator />
                    <MenuItem onSelect={() => onCopy(formatTimecode(frame, frameRate), "Timecode")}>
                        Copy timecode
                    </MenuItem>
                    <MenuItem onSelect={() => onCopy(String(frame), "Frame number")}>
                        Copy frame number
                    </MenuItem>
                    <MenuItem
                        onSelect={() =>
                            onCopy(
                                (selectedIndices.length > 0
                                    ? selectedIndices
                                    : [sceneAtFrame(scenes, frame) ?? 0]
                                )
                                    .map((index) => String(index + 1))
                                    .join(", "),
                                "Scene number",
                            )
                        }
                    >
                        Copy scene number
                    </MenuItem>
                </MenuContent>
            )}
        </Menu>
    );
}
