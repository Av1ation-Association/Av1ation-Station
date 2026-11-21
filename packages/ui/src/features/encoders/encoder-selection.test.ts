import { describe, expect, it } from "vitest";

import type { EncoderDescriptor, ParameterDescriptor } from "@av1ation/contracts";

import { ENCODER_CHOICES, buildDocument, forkOptionName, record } from "./encoder-document";
import { encoderChoiceDocument, resolveEncoderSelection } from "./encoder-selection";

function descriptor(patch: Partial<ParameterDescriptor> = {}): ParameterDescriptor {
    return {
        delimiter: "Space",
        label: "Parameter",
        description: null,
        doc_link: null,
        kind: "Flag",
        default: null,
        widget: "Auto",
        advanced: false,
        group: null,
        relations: [],
        ...patch,
    } as ParameterDescriptor;
}

function encoder(patch: Partial<EncoderDescriptor> = {}): EncoderDescriptor {
    return {
        id: "x265",
        base: "x265",
        label: "x265",
        default: {
            X265: {
                executable: null,
                options: {},
                pass: { All: 1 },
                append_color_data: true,
                ffmpeg_filter: null,
            },
        },
        parameters: {},
        source: "Builtin",
        executable: null,
        version: null,
        available: true,
        fork: false,
        warning: null,
        overridden: false,
        ...patch,
    } as EncoderDescriptor;
}

function fork(patch: Partial<EncoderDescriptor> = {}): EncoderDescriptor {
    return encoder({
        id: "fork:pathless",
        base: "x265",
        label: "Pathless x265",
        fork: true,
        source: "Known",
        ...patch,
    });
}

function markerDocument(forkId: string) {
    return {
        X265: {
            executable: null,
            options: {
                [forkOptionName(forkId)]: { Bool: { prefix: "--", value: false } },
            },
            pass: { All: 1 },
            append_color_data: true,
            ffmpeg_filter: null,
        },
    };
}

function choice(variant: (typeof ENCODER_CHOICES)[number]["variant"]) {
    const entry = ENCODER_CHOICES.find((candidate) => candidate.variant === variant);
    if (entry === undefined) {
        throw new Error(`the ${variant} encoder choice exists`);
    }
    return entry;
}

const X265_CHOICE = choice("X265");
const SVTAV1_CHOICE = choice("SVTAV1");

describe("encoder selection", () => {
    it("selects a pathless build by its marker and hides the marker from the parameters", () => {
        const pathless = fork();
        const selection = resolveEncoderSelection(
            [encoder(), pathless],
            true,
            markerDocument(pathless.id),
        );

        expect(selection.variant).toBe("X265");
        expect(selection.selectedFork?.id).toBe("fork:pathless");
        expect(selection.marker).toBe("pathless");
        expect(selection.missingFork).toBe(false);
        expect(selection.visibleOptions).toEqual([]);
        expect(selection.buildLabel).toBe("Pathless x265");
        expect(selection.forkWarning?.title).toBe("Pathless x265 has no executable yet.");
    });

    it("matches a located build by the path the document runs", () => {
        const path = "C:/tools/x265.exe";
        const located = fork({
            id: "fork:located",
            label: "Located x265",
            executable: path,
        });
        const selection = resolveEncoderSelection([encoder(), located], true, {
            X265: {
                executable: path,
                options: {},
                pass: { All: 1 },
                append_color_data: true,
                ffmpeg_filter: null,
            },
        });

        expect(selection.selectedFork?.id).toBe("fork:located");
        expect(selection.marker).toBeNull();
        expect(selection.forkWarning).toBeNull();
    });

    it("does not call a build deleted until the catalogue is loaded", () => {
        const value = markerDocument("fork:removed");

        expect(resolveEncoderSelection([encoder()], false, value).missingFork).toBe(false);
        const loaded = resolveEncoderSelection([encoder()], true, value);
        expect(loaded.missingFork).toBe(true);
        expect(loaded.marker).toBe("removed");
        expect(loaded.forkWarning?.title).toBe(
            "The build this project selected is no longer saved.",
        );
    });

    it("does not let an ordinary prefixed option mask the real marker", () => {
        const pathless = fork();
        const value = markerDocument(pathless.id);
        value.X265.options.__av1ation_fork_ordinary = {
            Bool: { prefix: "--", value: true },
        };
        const selection = resolveEncoderSelection([encoder(), pathless], true, value);

        expect(selection.selectedFork?.id).toBe("fork:pathless");
        expect(selection.visibleOptions.map(([name]) => name)).toEqual([
            "__av1ation_fork_ordinary",
        ]);
    });

    it("merges the base catalogue with the build's own rows", () => {
        const baseCrf = descriptor({
            label: "CRF",
            description: "base description",
            group: "Rate control",
            kind: { Number: { integer: false, min: 1, max: 70, step: 0.25, unit: null } },
            default: 30,
        });
        const basePreset = descriptor({ label: "Preset" });
        const forkCrf = descriptor({
            label: "Crf",
            description: "fork description",
            group: "Fork",
            kind: "Flag",
            default: 24,
        });
        const forkAlt = descriptor({ label: "Alt CDEF", group: "Filtering" });
        const pathless = fork({
            parameters: { "--crf": forkCrf, "--enable-alt-cdef": forkAlt },
        });
        const selection = resolveEncoderSelection(
            [encoder({ parameters: { "--crf": baseCrf, "--preset": basePreset } }), pathless],
            true,
            markerDocument(pathless.id),
        );

        expect([...selection.catalogue.keys()]).toEqual(["--crf", "--preset", "--enable-alt-cdef"]);
        const crf = selection.catalogue.get("--crf");
        expect(crf?.label).toBe("CRF");
        expect(crf?.description).toBe("base description");
        expect(crf?.group).toBe("Rate control");
        expect(crf?.kind).toEqual(baseCrf.kind);
        expect(crf?.default).toBe(24);
        expect(selection.catalogue.get("--preset")).toBe(basePreset);
        expect(selection.catalogue.get("--enable-alt-cdef")).toBe(forkAlt);
    });

    it("warns when a selected build's path is missing", () => {
        const path = "C:/gone/x265.exe";
        const moved = fork({
            id: "fork:moved",
            label: "Moved x265",
            executable: path,
            available: false,
        });
        const selection = resolveEncoderSelection([encoder(), moved], true, {
            X265: {
                executable: path,
                options: {},
                pass: { All: 1 },
                append_color_data: true,
                ffmpeg_filter: null,
            },
        });

        expect(selection.selectedFork?.id).toBe("fork:moved");
        expect(selection.forkWarning?.title).toBe("Moved x265 is not at its saved path.");
    });

    it("seeds a built-in document without carrying the previous executable", () => {
        const base = encoder({
            default: {
                X265: {
                    executable: "C:/old/x265.exe",
                    options: { crf: { Number: { prefix: "--", delimiter: " ", value: 20 } } },
                    pass: { All: 2 },
                    append_color_data: false,
                },
            },
        });
        const next = encoderChoiceDocument(X265_CHOICE, [base]);

        expect(next).toEqual({
            executable: null,
            options: { crf: { Number: { prefix: "--", delimiter: " ", value: 20 } } },
            pass: { All: 2 },
            append_color_data: false,
            ffmpeg_filter: null,
        });
    });

    it("seeds the fields a different encoder requires", () => {
        const svt = encoder({
            id: "svt-av1",
            base: "svt-av1",
            label: "SVT-AV1",
            default: { SVTAV1: { executable: null, options: {} } },
        });
        const next = encoderChoiceDocument(SVTAV1_CHOICE, [svt]);

        expect(next).toEqual({
            executable: null,
            options: {},
            pass: { All: 1 },
            append_color_data: true,
            ffmpeg_filter: null,
            photon_noise: null,
        });
    });

    it("writes the marker only for a pathless build", () => {
        const pathless = fork();
        const pathlessDocument = buildDocument(pathless);
        expect(pathlessDocument?.body.executable).toBeNull();
        expect(record(pathlessDocument?.body.options)[forkOptionName(pathless.id)]).toEqual({
            Bool: { prefix: "--", value: false },
        });

        const located = fork({ id: "fork:located", executable: "C:/tools/x265.exe" });
        const locatedDocument = buildDocument(located);
        expect(locatedDocument?.body.executable).toBe("C:/tools/x265.exe");
        expect(record(locatedDocument?.body.options)[forkOptionName(located.id)]).toBeUndefined();
    });
});
