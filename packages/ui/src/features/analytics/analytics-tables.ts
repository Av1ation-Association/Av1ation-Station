import type { SceneView } from "@av1ation/contracts";

import type { AnalyticsCell, AnalyticsSource, AnalyticsTable } from "./analytics-types";
import { integer } from "./analytics-format";

/* --------------------------------------------------------------------------------------------
 * Tables
 * ------------------------------------------------------------------------------------------ */

export interface ColumnSpec {
    id: string;
    label: string;
    numeric: boolean;
    cell: (scene: SceneView, source: AnalyticsSource) => AnalyticsCell | null;
}

export function emptyCell(): AnalyticsCell {
    return { text: "—", sort: null };
}

export function tableFor(
    source: AnalyticsSource,
    columns: readonly ColumnSpec[],
    note: string,
): AnalyticsTable {
    const all: ColumnSpec[] = [
        {
            id: "scene",
            label: "Scene",
            numeric: true,
            cell: (scene) => ({ text: String(scene.index + 1), sort: scene.index + 1 }),
        },
        {
            id: "start",
            label: "Start",
            numeric: true,
            cell: (scene) => ({
                text: integer(scene.start_frame),
                sort: scene.start_frame,
            }),
        },
        {
            id: "frames",
            label: "Frames",
            numeric: true,
            cell: (scene) =>
                scene.frame_count > 0
                    ? { text: integer(scene.frame_count), sort: scene.frame_count }
                    : null,
        },
        ...columns,
    ];
    return {
        columns: all.map(({ id, label, numeric }) => ({ id, label, numeric })),
        rows: source.scenes.map((scene) => ({
            scene: scene.index,
            cells: all.map((column) => column.cell(scene, source) ?? emptyCell()),
        })),
        note,
    };
}

export function numericCell(
    value: number | null,
    format: (value: number) => string,
): AnalyticsCell | null {
    return value === null ? null : { text: format(value), sort: value };
}
