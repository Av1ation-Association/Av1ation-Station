// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";

import { MockTransport } from "@av1ation/api";

import type { DocumentScope } from "../../shared/model/project-sections";
import { renderWithApi } from "../../test/render";
import { SceneDetectionEditor } from "./SceneDetectionEditor";

afterEach(cleanup);

function Harness({
    initial,
    scope = "project",
    frameRate = null,
}: {
    initial: Record<string, unknown>;
    scope?: DocumentScope;
    frameRate?: number | null;
}) {
    const [value, setValue] = useState(initial);
    return (
        <SceneDetectionEditor
            value={value}
            onChange={setValue}
            locked={false}
            scope={scope}
            frameRate={frameRate}
        />
    );
}

function renderEditor(
    initial: Record<string, unknown>,
    scope: DocumentScope = "project",
    frameRate: number | null = null,
) {
    renderWithApi(<Harness initial={initial} scope={scope} frameRate={frameRate} />, {
        transport: new MockTransport(),
    });
}

function avSceneChange(): Record<string, unknown> {
    return {
        method: {
            AVSceneChange: {
                minimum_length: 24,
                maximum_length: 240,
                method: "Standard",
                save_scores: false,
            },
        },
        input: null,
    };
}

function checked(role: "radio", name: RegExp | string): boolean {
    const element = screen.getByRole(role, { name });
    return element.getAttribute("aria-checked") === "true";
}

it("keeps scores inside the method card and shows the preset only for AVSceneChange", () => {
    renderEditor(avSceneChange());

    expect(checked("radio", "AVSceneChange")).toBe(true);
    expect(screen.getByRole("radiogroup", { name: "Detection preset" })).toBeTruthy();
    expect(
        screen.getByText(
            "Fast scores a downscaled clip; Standard scores the full-resolution source.",
        ),
    ).toBeTruthy();
    // The scores switch belongs to the method, not to an Options card.
    expect(screen.getByRole("checkbox", { name: /Write per-frame scores/u })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "TransNetV2" }));
    expect(screen.queryByRole("radiogroup", { name: "Detection preset" })).toBeNull();
    // The model file is machine-level, so the section points at Settings rather than
    // repeating a path field in every project.
    expect(screen.getByText(/located once in Settings → Dependencies/u)).toBeTruthy();
    expect(screen.queryByLabelText(/ONNX model/u)).toBeNull();
    expect(screen.getByRole("checkbox", { name: /Write per-frame scores/u })).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "None" }));
    expect(screen.queryByRole("checkbox", { name: /Write per-frame scores/u })).toBeNull();
    expect(screen.getByText(/None produces one arbitrary scene/u)).toBeTruthy();
});

it("edits scene bounds in seconds when the video's rate is known", () => {
    renderEditor(avSceneChange(), "video", 24);

    const minimum = screen.getByLabelText("Minimum scene length in seconds");
    expect((minimum as HTMLInputElement).value).toBe("1");
    expect(screen.getByText("24 frames")).toBeTruthy();

    fireEvent.change(minimum, { target: { value: "1.5" } });
    // A save shortcut can run before the field blurs, so the edit is already in the draft.
    expect(screen.getByText("36 frames")).toBeTruthy();
    fireEvent.blur(minimum);
    expect((minimum as HTMLInputElement).value).toBe("1.5");
    expect(screen.getByText("36 frames")).toBeTruthy();
});

it("rounds a seconds edit to the nearest frame at 23.976 fps", () => {
    renderEditor(avSceneChange(), "video", 23.976);

    const maximum = screen.getByLabelText("Maximum scene length in seconds");
    fireEvent.change(maximum, { target: { value: "2.5" } });
    fireEvent.blur(maximum);

    expect(screen.getByText("60 frames")).toBeTruthy();
    expect((maximum as HTMLInputElement).value).toBe("2.503");
});

it("keeps frames at project scope, where no single rate exists", () => {
    renderEditor(avSceneChange());

    expect(screen.getByLabelText("Minimum scene length in frames")).toBeTruthy();
    expect(screen.queryByLabelText("Minimum scene length in seconds")).toBeNull();
    expect(screen.getByText(/Frames are the engine's unit/u)).toBeTruthy();
});

it("names the video's input on a video, not the project's", () => {
    renderEditor(avSceneChange(), "video");

    expect(
        screen.getByText("The video input by default. An override applies to detection only."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /^Custom input/u }));
    // The video scope is what lets the override name the file it decodes.
    expect(screen.getByLabelText("Input path")).toBeTruthy();
});

it("names the template's input in Settings → Project Defaults", () => {
    renderEditor(avSceneChange(), "template");

    expect(
        screen.getByText("The template input by default. An override applies to detection only."),
    ).toBeTruthy();
    expect(screen.queryByText(/The project input by default/u)).toBeNull();
});

it("edits a custom detection input with General's own editor", () => {
    renderEditor(avSceneChange());

    fireEvent.click(screen.getByRole("radio", { name: /^Custom input/u }));

    // The detection override is one more sequence input: all three kinds, the same decoder
    // group, and the same filter list. A project document names no file, so the source and
    // index are absent even though the kind row offers them.
    expect(screen.getByRole("radiogroup", { name: "Input kind" })).toBeTruthy();
    expect(screen.queryByLabelText("Input path")).toBeNull();
    expect(screen.queryByLabelText("FFMS2 index file")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /^VapourSynth script/u }));
    expect(screen.getByRole("radiogroup", { name: "Script source" })).toBeTruthy();
    expect(screen.getByText("Choose a .vpy file, or switch to a custom script.")).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: /Edit a custom VapourSynth script/u }));
    expect(screen.getByLabelText("Custom VapourSynth script")).toBeTruthy();
});
