import type { SceneView } from "@av1ation/contracts";

import type { AnalyticsMetric, AnalyticsSource, SequenceAnalytics } from "./analytics-types";
import { finite, formatMbps, integer, plural, scoreFormat } from "./analytics-format";
import { sceneMetric } from "./analytics-scene-metric";
import {
    efficiencyOf,
    isInverseMetric,
    sceneChunkBpp,
    sceneChunkBitrate,
} from "./analytics-series";
import { numericCell, tableFor } from "./analytics-tables";
import { qualityTarget, targetReferences } from "./analytics-target";

export function qualityCheck(source: AnalyticsSource): SequenceAnalytics {
    const check = qualityTarget(source.document, ["sequences", "quality_check"]);
    const configured = qualityTarget(source.document, ["sequences", "target_quality"]);
    // Quality Check does not choose a target. Its metric document still carries a target range
    // because the engine's shared enum requires one; drawing that hidden default would put a
    // range from another metric's scale on the chart. Only Target Quality's range is evidence,
    // and only when it applies to the metric Quality Check actually used.
    const target = {
        label: check.label,
        range: check.label === configured.label ? configured.range : null,
    };
    const range = target.range;
    const format = scoreFormat(range);
    const inverse = isInverseMetric(target.label);
    const bppAvailable =
        source.frameRate !== null && source.width !== null && source.height !== null;
    const score = sceneMetric(
        {
            id: "score",
            label: `${target.label} score`,
            help: `The mean ${target.label} score measured on each scene of the finished output.${range === null ? "" : " The reference lines are Target Quality's target range for this metric."} The frontier view plots the same score against what each scene cost.`,
            format,
            value: (scene) => finite(scene.quality_score),
            references: () => targetReferences(target, format),
            extra: (values) =>
                range === null || values.length === 0
                    ? []
                    : [
                          {
                              label: "Below target",
                              value: plural(
                                  values.filter((value) => value < range[0]).length,
                                  "scene",
                              ),
                          },
                      ],
            frontierPoint: bppAvailable
                ? (scene, context) => {
                      const value = finite(scene.quality_score);
                      const bpp = sceneChunkBpp(scene, context);
                      return value === null || bpp === null ? null : { x: bpp, y: value };
                  }
                : undefined,
            empty: "Quality scores chart here as Quality Check scores the output.",
        },
        source,
    );
    const metrics: AnalyticsMetric[] = [
        score,
        sceneMetric(
            {
                id: "bitrate",
                label: "Bitrate",
                help: "The bitrate the finished output spends on each scene, from its retained chunk.",
                format: formatMbps,
                value: (scene) => sceneChunkBitrate(scene, source.frameRate),
                empty: "Bitrates chart here once the chunks exist and the source rate is known.",
            },
            source,
        ),
    ];
    if (bppAvailable) {
        metrics.push(
            sceneMetric(
                {
                    id: "efficiency",
                    label: "Efficiency",
                    help: `${inverse ? "The score's reciprocal" : "Score"} divided by the bits per pixel the scene cost. Higher is more quality for the same size.`,
                    format: (value) => integer(value),
                    value: (scene) =>
                        efficiencyOf(
                            finite(scene.quality_score),
                            sceneChunkBpp(scene, source),
                            inverse,
                        ),
                    empty: "Efficiency charts here when a scene has both a score and a chunk.",
                },
                source,
            ),
        );
    }
    return {
        metrics,
        table: tableFor(
            source,
            [
                {
                    id: "score",
                    label: "Score",
                    numeric: true,
                    cell: (scene) => numericCell(finite(scene.quality_score), format),
                },
                {
                    id: "bitrate",
                    label: "Bitrate",
                    numeric: true,
                    cell: (scene) =>
                        numericCell(sceneChunkBitrate(scene, source.frameRate), formatMbps),
                },
                ...(bppAvailable
                    ? [
                          {
                              id: "efficiency",
                              label: "Efficiency",
                              numeric: true,
                              cell: (scene: SceneView) =>
                                  numericCell(
                                      efficiencyOf(
                                          finite(scene.quality_score),
                                          sceneChunkBpp(scene, source),
                                          inverse,
                                      ),
                                      (value) => integer(value),
                                  ),
                          },
                      ]
                    : []),
            ],
            "A dash means Quality Check has not scored that scene, or its chunk is not retained.",
        ),
        note: "Quality Check scores the concatenated output against the source. The frontier view is the one comparison worth making: quality bought per bit, with the upper left the efficient scenes.",
        empty: "Quality Check has not scored any scenes yet.",
        scenes: source.scenes.length,
    };
}
