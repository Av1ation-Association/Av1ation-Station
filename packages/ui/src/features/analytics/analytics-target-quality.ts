import type { SceneView } from "@av1ation/contracts";
import { chartSeconds } from "../../shared/duration";
import { getIn } from "../../shared/schema/config-schema";

import type { AnalyticsMetric, AnalyticsSource, SequenceAnalytics } from "./analytics-types";
import {
    deviation,
    finite,
    fixed,
    formatMbps,
    formatQuantizer,
    integer,
    mean,
    mode,
    plural,
    scoreFormat,
} from "./analytics-format";
import { passMetric } from "./analytics-pass-metric";
import { sceneMetric } from "./analytics-scene-metric";
import { efficiencyOf, isInverseMetric, passBpp } from "./analytics-series";
import { numericCell, tableFor } from "./analytics-tables";
import { qualityTarget, targetReferences, threshold } from "./analytics-target";

export function targetQuality(source: AnalyticsSource): SequenceAnalytics {
    const target = qualityTarget(source.document, ["sequences", "target_quality"]);
    const range = target.range;
    const format = scoreFormat(range);
    const inverse = isInverseMetric(target.label);
    const configuredProbes = getIn(source.document, [
        "sequences",
        "target_quality",
        "maximum_probes",
    ]);
    const maximumProbes = typeof configuredProbes === "number" ? configuredProbes : 4;
    // Bitrate Optimizer reads Target Quality's final probes and rewrites the quantizer of the
    // scenes above the mean-plus-sigma line; the line it uses belongs on this chart.
    const sigmaDistance = threshold(source, [
        "sequences",
        "bitrate_optimizer",
        "bitrate_sigma_threshold",
    ]);
    const finalBitrates = source.scenes.flatMap((scene) => {
        const value = scene.passes?.[scene.passes.length - 1]?.bitrate;
        return value === undefined || value === null || value <= 0 ? [] : [value];
    });
    const bitrateCentre = mean(finalBitrates);
    const bitrateSigma = deviation(finalBitrates);
    const bitrateLimit =
        sigmaDistance === null || finalBitrates.length === 0
            ? null
            : bitrateCentre + sigmaDistance * bitrateSigma;
    const overBitrate =
        bitrateLimit === null ? null : finalBitrates.filter((value) => value > bitrateLimit).length;
    const quantizer = passMetric(
        {
            id: "quantizer",
            label: "Quantizer",
            help: "The quantizer each probe encoded at. A lower quantizer spends more bits for more quality; each pass is one probe the search made.",
            format: formatQuantizer,
            value: (pass) => finite(pass.quantizer),
            convergenceChange: (value) => fixed(value, 0),
            empty: "Probe quantizers chart here as Target Quality runs.",
        },
        source,
    );
    const score = passMetric(
        {
            id: "score",
            label: `${target.label} score`,
            help: `The mean ${target.label} score of each probe pass. The two reference lines are the configured target range; a pass is one probe encode.`,
            format,
            value: (pass) => finite(pass.score),
            references: () => targetReferences(target, format),
            extra: (values) =>
                range === null || values.length === 0
                    ? []
                    : [
                          {
                              label: "In target",
                              value: plural(
                                  values.filter((value) => value >= range[0] && value <= range[1])
                                      .length,
                                  "probe",
                              ),
                          },
                      ],
            frontierPoint: (pass, _scene, context) => {
                const value = finite(pass.score);
                const bpp = passBpp(pass, context);
                return value === null || bpp === null ? null : { x: bpp, y: value };
            },
            empty: "Probe scores chart here as Target Quality runs.",
        },
        source,
    );
    const bitrate = passMetric(
        {
            id: "bitrate",
            label: "Probe bitrate",
            help: "The bitrate each probe encode produced. The final pass is the one the scene keeps.",
            format: formatMbps,
            value: (pass) => finite(pass.bitrate),
            references:
                bitrateLimit === null
                    ? undefined
                    : () => [
                          {
                              value: bitrateLimit,
                              label: `optimizer ${formatMbps(bitrateLimit)}`,
                              tone: "warning",
                          },
                      ],
            extra: (values, context) => {
                const durations = context.scenes.flatMap((scene) =>
                    (scene.passes ?? [])
                        .map((pass) => finite(pass.duration_ms))
                        .filter((value): value is number => value !== null),
                );
                return values.length === 0
                    ? []
                    : [
                          {
                              label: "Probe time",
                              value: chartSeconds(
                                  durations.reduce((sum, value) => sum + value, 0) / 1000,
                              ),
                          },
                          ...(overBitrate === null || sigmaDistance === null
                              ? []
                              : [
                                    {
                                        label: `Mean + ${fixed(sigmaDistance, 1)}σ`,
                                        value: formatMbps(bitrateLimit ?? 0),
                                    },
                                    {
                                        label: "Over line",
                                        value: plural(overBitrate, "scene"),
                                    },
                                ]),
                      ];
            },
            empty: "Probe bitrates chart here as Target Quality runs.",
        },
        source,
    );
    const speed = passMetric(
        {
            id: "speed",
            label: "Probe speed",
            help: "Frames per second each probe encoded at. Speed and score move against each other, so this is the cost side of a probe that its quantizer does not show.",
            format: (value) => `${fixed(value, 1)} fps`,
            value: (pass, scene) => {
                const ms = finite(pass.duration_ms);
                return ms !== null && ms > 0 && scene.frame_count > 0
                    ? (scene.frame_count * 1000) / ms
                    : null;
            },
            extra: (values) => [
                {
                    label: "Fastest",
                    value: values.length === 0 ? "—" : `${fixed(Math.max(...values), 1)} fps`,
                },
            ],
            empty: "Probe speeds chart here as Target Quality runs.",
        },
        source,
    );
    const efficiency =
        source.frameRate === null || source.width === null || source.height === null
            ? null
            : passMetric(
                  {
                      id: "efficiency",
                      label: "Efficiency",
                      help: `${inverse ? "The score's reciprocal" : "Score"} divided by bits per pixel: the quality a pass bought for its size. Higher is better, and the frontier view plots the raw score against the cost directly.`,
                      format: (value) => integer(value),
                      value: (pass, _scene, context) =>
                          efficiencyOf(finite(pass.score), passBpp(pass, context), inverse),
                      empty: "Efficiency charts here when a probe has both a score and a bitrate.",
                  },
                  source,
              );
    // Speed Scaler is this section's other sequence: it rewrites the preset on every scene's
    // encoder document, so its result is a per-scene value like the probes are.
    const preset = sceneMetric(
        {
            id: "preset",
            label: "Speed preset",
            help: "The encoder speed preset each scene carries. Speed Scaler spreads this value across scenes so a noisy scene costs less bitrate; higher is faster.",
            format: (value) => (Number.isInteger(value) ? integer(value) : fixed(value, 1)),
            value: (scene) => finite(scene.speed),
            discrete: true,
            extra: (values) => {
                const most = mode(values);
                return most === null
                    ? []
                    : [
                          {
                              label: "Most common",
                              value: `${integer(most)} (${plural(
                                  values.filter((value) => value === most).length,
                                  "scene",
                              )})`,
                          },
                      ];
            },
            empty: "Scene presets chart here once Speed Scaler writes them.",
        },
        source,
    );
    const metrics: AnalyticsMetric[] = [score, quantizer, preset, bitrate];
    if (efficiency !== null) {
        metrics.push(efficiency);
    }
    metrics.push(speed);
    const lastPass = (scene: SceneView) => scene.passes?.[scene.passes.length - 1];
    return {
        metrics,
        table: tableFor(
            source,
            [
                {
                    id: "quantizer",
                    label: "Quantizer",
                    numeric: true,
                    cell: (scene) => {
                        const pass = lastPass(scene);
                        return pass === undefined
                            ? null
                            : numericCell(finite(pass.quantizer), formatQuantizer);
                    },
                },
                {
                    id: "score",
                    label: "Score",
                    numeric: true,
                    cell: (scene) => {
                        const pass = lastPass(scene);
                        return pass === undefined ? null : numericCell(finite(pass.score), format);
                    },
                },
                {
                    id: "bitrate",
                    label: "Bitrate",
                    numeric: true,
                    cell: (scene) => {
                        const pass = lastPass(scene);
                        return pass === undefined
                            ? null
                            : numericCell(finite(pass.bitrate), formatMbps);
                    },
                },
                {
                    id: "speed",
                    label: "Speed",
                    numeric: true,
                    cell: (scene) => {
                        const ms = finite(lastPass(scene)?.duration_ms);
                        return ms === null || ms <= 0
                            ? null
                            : numericCell(
                                  (scene.frame_count * 1000) / ms,
                                  (value) => `${fixed(value, 1)} fps`,
                              );
                    },
                },
                {
                    id: "preset",
                    label: "Preset",
                    numeric: true,
                    cell: (scene) =>
                        numericCell(finite(scene.speed), (value) =>
                            Number.isInteger(value) ? integer(value) : fixed(value, 1),
                        ),
                },
                ...(metrics.some((metric) => metric.id === "efficiency")
                    ? [
                          {
                              id: "efficiency",
                              label: "Efficiency",
                              numeric: true,
                              cell: (scene: SceneView) => {
                                  const pass = lastPass(scene);
                                  return pass === undefined
                                      ? null
                                      : numericCell(
                                            efficiencyOf(
                                                finite(pass.score),
                                                passBpp(pass, source),
                                                inverse,
                                            ),
                                            (value) => integer(value),
                                        );
                              },
                          },
                      ]
                    : []),
                {
                    id: "probes",
                    label: "Probes",
                    numeric: true,
                    cell: (scene) =>
                        scene.passes === undefined || scene.passes.length === 0
                            ? null
                            : {
                                  text: String(scene.passes.length),
                                  sort: scene.passes.length,
                              },
                },
            ],
            "A dash means the scene was not probed; the table's figures are the final pass the sequence settled on.",
        ),
        note: `Target Quality runs up to ${integer(maximumProbes)} probe encodes per scene. Every measurement is per pass, so the charts keep the path the search took, not just the quantizer it stopped at.${bitrateLimit === null ? "" : ` The Bitrate Optimizer line is projected onto the final probe: it re-quantizes the ${plural(overBitrate ?? 0, "scene")} whose final bitrate is above mean + ${fixed(sigmaDistance ?? 0, 1)}σ.`} Speed Scaler records a preset instead of a probe, so its section is one value per scene.`,
        empty: "Target Quality has not probed any scenes yet.",
        scenes: source.scenes.length,
    };
}
