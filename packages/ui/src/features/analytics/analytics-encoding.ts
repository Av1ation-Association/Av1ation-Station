import { chartSeconds } from "../../shared/duration";
import { formatBytes } from "../../shared/format";
import { getIn } from "../../shared/schema/config-schema";

import type { AnalyticsMetric, AnalyticsSource, SequenceAnalytics } from "./analytics-types";
import {
    finite,
    fixed,
    formatMbps,
    formatQuantizer,
    integer,
    mode,
    plural,
} from "./analytics-format";
import { sceneMetric } from "./analytics-scene-metric";
import { sceneChunkBitrate } from "./analytics-series";
import { numericCell, tableFor } from "./analytics-tables";

export function encoding(source: AnalyticsSource): SequenceAnalytics {
    // The benchmarked worker count is stored on Parallel Encoder's own document, so this is
    // the only run-level result Benchmarker leaves behind.
    const workers = getIn(source.document, ["sequences", "parallel_encoder", "workers"]);
    const chunk = sceneMetric(
        {
            id: "chunk",
            label: "Chunk size",
            help: "The retained chunk each scene encoded to. Retained chunks are what make a later quality check and a per-scene re-encode possible.",
            format: formatBytes,
            value: (scene) => {
                const bytes = finite(scene.chunk_bytes);
                return bytes !== null && bytes > 0 ? bytes : null;
            },
            extra: (values) => [
                { label: "Chunks", value: integer(values.length) },
                {
                    label: "Total",
                    value: formatBytes(values.reduce((sum, value) => sum + value, 0)),
                },
            ],
            cumulative: true,
            empty: "Chunk sizes chart here as Parallel Encoder finishes scenes.",
        },
        source,
    );
    const unordered: AnalyticsMetric[] = [
        chunk,
        sceneMetric(
            {
                id: "bitrate",
                label: "Bitrate",
                help: "The bitrate each retained chunk works out to at the source's frame rate. A scene with no chunk yet has no bitrate.",
                format: formatMbps,
                value: (scene) => sceneChunkBitrate(scene, source.frameRate),
                empty: "Bitrates chart here as Parallel Encoder finishes scenes.",
            },
            source,
        ),
        sceneMetric(
            {
                id: "quantizer",
                label: "Quantizer",
                help: "The quantizer each scene encoded at, as Target Quality left it. A scene it never probed has no value here, so the gap is a decision nobody made.",
                format: formatQuantizer,
                value: (scene) => finite(scene.quantizer),
                discrete: true,
                extra: (values) => {
                    const most = mode(values);
                    return most === null
                        ? []
                        : [
                              {
                                  label: "Most common",
                                  value: `${formatQuantizer(most)} (${plural(
                                      values.filter((value) => value === most).length,
                                      "scene",
                                  )})`,
                              },
                          ];
                },
                empty: "Scene quantizers chart here once Target Quality has chosen one.",
            },
            source,
        ),
        sceneMetric(
            {
                id: "duration",
                label: "Encode time",
                help: "Wall-clock seconds this scene's chunk took. Workers run at the same time, so the total across scenes is worker time, not the run's duration.",
                format: chartSeconds,
                value: (scene) => {
                    const ms = finite(scene.encode_ms);
                    return ms !== null && ms > 0 ? ms / 1000 : null;
                },
                extra: (values) => [
                    {
                        label: "Worker time",
                        value: chartSeconds(values.reduce((sum, value) => sum + value, 0)),
                    },
                ],
                empty: "Encode times chart here as Parallel Encoder finishes scenes.",
            },
            source,
        ),
        sceneMetric(
            {
                id: "speed",
                label: "Encode FPS",
                help: "Frames per second this scene encoded at, from its chunk's own wall-clock duration.",
                format: (value) => `${fixed(value, 1)} fps`,
                value: (scene) => {
                    const ms = finite(scene.encode_ms);
                    return ms !== null && ms > 0 ? (scene.frame_count * 1000) / ms : null;
                },
                extra: (values) => [
                    {
                        label: "Fastest",
                        value: values.length === 0 ? "—" : `${fixed(Math.max(...values), 1)} fps`,
                    },
                ],
                empty: "Encode speeds chart here as Parallel Encoder finishes scenes.",
            },
            source,
        ),
    ];
    // The page reads in this order: what Target Quality chose, what the chunk cost, and how
    // fast it ran. Sorting by id keeps the construction order above free to follow the data
    // dependencies; every id here is one of the metrics built above.
    const order = ["quantizer", "bitrate", "chunk", "speed", "duration"];
    const metrics = [...unordered].sort(
        (left, right) => order.indexOf(left.id) - order.indexOf(right.id),
    );
    return {
        metrics,
        table: tableFor(
            source,
            [
                {
                    id: "chunk",
                    label: "Chunk",
                    numeric: true,
                    cell: (scene) => {
                        const bytes = finite(scene.chunk_bytes);
                        return bytes === null || bytes <= 0
                            ? null
                            : numericCell(bytes, formatBytes);
                    },
                },
                {
                    id: "bitrate",
                    label: "Bitrate",
                    numeric: true,
                    cell: (scene) =>
                        numericCell(sceneChunkBitrate(scene, source.frameRate), formatMbps),
                },
                {
                    id: "quantizer",
                    label: "Quantizer",
                    numeric: true,
                    cell: (scene) => numericCell(finite(scene.quantizer), formatQuantizer),
                },
                {
                    id: "duration",
                    label: "Encode",
                    numeric: true,
                    cell: (scene) => {
                        const ms = finite(scene.encode_ms);
                        return ms === null || ms <= 0 ? null : numericCell(ms / 1000, chartSeconds);
                    },
                },
                {
                    id: "speed",
                    label: "FPS",
                    numeric: true,
                    cell: (scene) => {
                        const ms = finite(scene.encode_ms);
                        return ms === null || ms <= 0
                            ? null
                            : numericCell(
                                  (scene.frame_count * 1000) / ms,
                                  (value) => `${fixed(value, 1)} fps`,
                              );
                    },
                },
            ],
            "A dash means that scene has no retained chunk yet, or its encoder has not recorded a duration.",
        ),
        note: `Parallel Encoder writes one chunk per scene. Durations are wall clock and overlap across workers; the cumulative view is the retained bytes as they accumulate.${typeof workers === "number" && workers > 0 ? ` Benchmarker resolved ${plural(workers, "worker")}, which is how many scenes encode at once.` : " Benchmarker has not resolved a worker count; Parallel Encoder uses the one in its configuration."}`,
        empty: "Parallel Encoder has not written any chunks yet.",
        scenes: source.scenes.length,
    };
}

export function concatenation(source: AnalyticsSource): SequenceAnalytics {
    const chunk = sceneMetric(
        {
            id: "chunk",
            label: "Chunk size",
            help: "The chunks the concatenator joins, in scene order. It does not re-encode, so these sizes are exactly what the output carries.",
            format: formatBytes,
            value: (scene) => {
                const bytes = finite(scene.chunk_bytes);
                return bytes !== null && bytes > 0 ? bytes : null;
            },
            extra: (values, context) => [
                { label: "Chunks", value: integer(values.length) },
                { label: "Output", value: context.outputExists ? "Written" : "Not written" },
            ],
            cumulative: true,
            empty: "The joined track's chunks chart here once encoding has retained them.",
        },
        source,
    );
    return {
        metrics: [chunk],
        table: tableFor(
            source,
            [
                {
                    id: "chunk",
                    label: "Chunk",
                    numeric: true,
                    cell: (scene) => {
                        const bytes = finite(scene.chunk_bytes);
                        return bytes === null || bytes <= 0
                            ? null
                            : numericCell(bytes, formatBytes);
                    },
                },
                {
                    id: "cumulative",
                    label: "Joined so far",
                    numeric: true,
                    cell: (scene) => {
                        const bytes = source.scenes
                            .slice(0, scene.index + 1)
                            .reduce((sum, entry) => sum + (finite(entry.chunk_bytes) ?? 0), 0);
                        return bytes <= 0 ? null : numericCell(bytes, formatBytes);
                    },
                },
            ],
            "A dash means the scene has no retained chunk. Joining does not resize a chunk, so the output size is their sum.",
        ),
        note: "Scene Concatenator joins the retained chunks without re-encoding. A missing chunk is a scene that was never encoded, not an empty one.",
        empty: "There are no retained chunks to join yet.",
        scenes: source.scenes.length,
    };
}
