// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";

import { MockTransport } from "@av1ation/api";

import type { DocumentScope } from "../../shared/model/project-sections";
import { renderWithApi } from "../../test/render";
import { InputOverrideEditor } from "./InputOverrideEditor";

afterEach(cleanup);

function Harness({ initial, scope = "project" }: { initial: unknown; scope?: DocumentScope }) {
    const [value, setValue] = useState<unknown>(initial);
    return (
        <>
            <InputOverrideEditor
                scope={scope}
                value={value}
                onChange={setValue}
                disabled={false}
                idPrefix="noise-detector-input"
            />
            <pre data-testid="value">{JSON.stringify(value)}</pre>
        </>
    );
}

function renderEditor(initial: unknown, scope: DocumentScope = "project") {
    renderWithApi(<Harness initial={initial} scope={scope} />, {
        transport: new MockTransport(),
    });
}

function stored(): unknown {
    return JSON.parse(screen.getByTestId("value").textContent ?? "null") as unknown;
}

it("inherits General until an override is chosen, in the same editor General uses", () => {
    renderEditor(null);

    expect(
        screen.getByRole("radio", { name: /^Project input/u }).getAttribute("aria-checked"),
    ).toBe("true");
    // Nothing is rendered until the sequence carries an input of its own.
    expect(screen.queryByRole("radiogroup", { name: "Input kind" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /^Custom input/u }));

    // The shared editor: the same three kinds as General, not a script-only console.
    expect(screen.getByRole("radiogroup", { name: "Input kind" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /^FFMS2/u })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Plugin importer/u })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /VapourSynth script/u })).toBeTruthy();
});

it("hides the source and index in a project document, because they name one file", () => {
    renderEditor(null);

    fireEvent.click(screen.getByRole("radio", { name: /^Custom input/u }));

    const value = stored() as { Video?: Record<string, unknown> };
    expect(value.Video).toBeTruthy();
    expect(value.Video?.path).toBe("");
    expect(screen.queryByLabelText("Input path")).toBeNull();
    expect(screen.queryByLabelText("FFMS2 index file")).toBeNull();
});

it("names the template, not a project, in Settings → Project Defaults", () => {
    renderEditor(null, "template");

    expect(
        screen.getByRole("radio", { name: /^Template input/u }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.queryByRole("radio", { name: /^Project input/u })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /^Custom input/u }));
    fireEvent.click(screen.getByRole("radio", { name: /^VapourSynth script/u }));

    // The template is the document being edited, so the script is stored there and the
    // override still cannot name one file for every project that copies it.
    expect(screen.getByText("Stored in the project template")).toBeTruthy();
    expect(screen.queryByText("Stored in the project document")).toBeNull();
    expect(screen.queryByLabelText("Input path")).toBeNull();
});

it("shows the source and index in a video document, which owns that file", () => {
    renderEditor(null, "video");

    fireEvent.click(screen.getByRole("radio", { name: /^Custom input/u }));

    expect(screen.getByLabelText("Input path")).toBeTruthy();
    expect(screen.getByLabelText("FFMS2 index file")).toBeTruthy();
});

it("keeps the filter list on a script input, which is where Encoding usually lands", () => {
    renderEditor(null);

    fireEvent.click(screen.getByRole("radio", { name: /^Custom input/u }));
    fireEvent.click(screen.getByRole("radio", { name: /^VapourSynth script/u }));

    // A script input has its own `filters` list in the engine: filters chained onto the
    // script's output. Hiding the list left the input editor unable to express it.
    expect(screen.getByText("Filters")).toBeTruthy();
    expect(screen.getByText(/script's output is used as it is/u)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Add filter/u })).toBeTruthy();
});

it("names the document that stores a video override's script", () => {
    renderEditor(null, "video");

    fireEvent.click(screen.getByRole("radio", { name: /^Custom input/u }));
    fireEvent.click(screen.getByRole("radio", { name: /^VapourSynth script/u }));

    expect(screen.getByText("Stored in the video document")).toBeTruthy();
    expect(screen.queryByText("Stored in the project document")).toBeNull();
});

it("switches a sequence to a script and clears the override again", async () => {
    renderEditor(null);

    fireEvent.click(screen.getByRole("radio", { name: /^Custom input/u }));
    fireEvent.click(screen.getByRole("radio", { name: /^VapourSynth script/u }));

    const value = stored() as { VapourSynthScript?: Record<string, unknown> };
    expect(value.VapourSynthScript).toBeTruthy();
    expect(value.VapourSynthScript?.source).toEqual({ Path: "" });
    expect(screen.getByRole("radiogroup", { name: "Script source" })).toBeTruthy();
    expect(screen.getByText("Stored in the project document")).toBeTruthy();
    expect(screen.queryByLabelText("Input path")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: /Edit a custom VapourSynth script/u }));
    // Stored text starts from the generated template: the service refuses an empty custom
    // script, so an empty buffer would leave the document unsavable.
    await waitFor(() => {
        const seeded = stored() as { VapourSynthScript?: { source?: { Text?: string } } };
        expect((seeded.VapourSynthScript?.source?.Text ?? "").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("radio", { name: /^Project input/u }));
    expect(stored()).toBeNull();
});

it("keeps an unnamed variable row until it is named, then flags a repeated key", () => {
    renderEditor(null);

    fireEvent.click(screen.getByRole("radio", { name: /^Custom input/u }));
    fireEvent.click(screen.getByRole("radio", { name: /^VapourSynth script/u }));

    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
    // The stored document is a map, which drops a blank key. The row must stay on screen
    // anyway, or it would vanish before the user could name it.
    expect(screen.getByLabelText("Variable name 1")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Variable name 1"), {
        target: { value: "threshold" },
    });
    fireEvent.change(screen.getByLabelText("Variable value 1"), {
        target: { value: "0.005" },
    });

    const named = stored() as {
        VapourSynthScript?: { variables?: Record<string, string> };
    };
    expect(named.VapourSynthScript?.variables).toEqual({ threshold: "0.005" });

    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
    fireEvent.change(screen.getByLabelText("Variable name 2"), {
        target: { value: "threshold" },
    });

    // A repeated key cannot be written to a map, so it is described while both rows stay
    // editable in place instead of one silently disappearing under the caret.
    expect(
        screen
            .getAllByRole("alert")
            .some((alert) => alert.textContent.includes("Another row already uses this key.")),
    ).toBe(true);
    expect(screen.getByLabelText("Variable name 2")).toBeTruthy();
});
