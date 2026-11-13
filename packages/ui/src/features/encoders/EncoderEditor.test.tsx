// @vitest-environment jsdom
import { useState } from "react";

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";

import type { JsonSchema } from "../../shared/schema/config-schema";
import { renderRoute } from "../../test/render";
import { EncoderEditor } from "./EncoderEditor";

afterEach(cleanup);

const ROOT: JsonSchema = {
    $defs: {
        Encoder: {
            oneOf: [
                { properties: { X265: { $ref: "#/$defs/X265" } } },
                { properties: { SVTAV1: { $ref: "#/$defs/SVTAV1" } } },
            ],
        },
        X265: {
            properties: {
                executable: { type: ["string", "null"] },
                options: { type: "object" },
                pass: { type: "object" },
                append_color_data: { type: "boolean" },
                ffmpeg_filter: { type: ["string", "null"] },
            },
        },
        SVTAV1: {
            properties: {
                executable: { type: ["string", "null"] },
                options: { type: "object" },
                pass: { type: "object" },
                append_color_data: { type: "boolean" },
                ffmpeg_filter: { type: ["string", "null"] },
                photon_noise: { type: ["object", "null"] },
            },
        },
    },
};

const NODE: JsonSchema = { $ref: "#/$defs/Encoder" };

const X265_VALUE = {
    X265: {
        executable: null,
        options: {},
        pass: { All: 1 },
        append_color_data: true,
        ffmpeg_filter: null,
    },
};

interface EditorOptions {
    initial?: unknown;
    locked?: boolean;
    scope?: "project" | "video" | "template" | "scene";
}

/** Keep the editor live so a change is observable in both the callback and the next render. */
function Harness({
    initial,
    locked = false,
    scope = "project",
    onChange,
}: EditorOptions & { onChange: (next: unknown) => void }) {
    const [value, setValue] = useState<unknown>(initial ?? X265_VALUE);
    return (
        <EncoderEditor
            root={ROOT}
            node={NODE}
            value={value}
            onChange={(next) => {
                setValue(next);
                onChange(next);
            }}
            locked={locked}
            scope={scope}
        />
    );
}

function mount(options: EditorOptions = {}) {
    const onChange = vi.fn();
    renderRoute(<Harness {...options} onChange={onChange} />, {
        transport: new MockTransport(),
        route: "/settings",
        initialEntry: "/settings",
    });
    return onChange;
}

function bodyOf(call: unknown): Record<string, unknown> {
    const encoder = call as {
        X265?: Record<string, unknown>;
        SVTAV1?: Record<string, unknown>;
    };
    return encoder.X265 ?? encoder.SVTAV1 ?? {};
}

it("switches encoder and seeds the new encoder's required fields", async () => {
    const onChange = mount();
    await screen.findByRole("heading", { name: "Parameters" });

    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Encoder" });
    expect(select.value).toBe("base:X265");

    fireEvent.change(select, { target: { value: "base:SVTAV1" } });

    await waitFor(() => expect(select.value).toBe("base:SVTAV1"));
    expect(onChange).toHaveBeenLastCalledWith({
        SVTAV1: {
            executable: null,
            options: {},
            pass: { All: 1 },
            append_color_data: true,
            ffmpeg_filter: null,
            photon_noise: null,
        },
    });
    // SVT-AV1's descriptor is in the catalogue but the mock marks the binary missing.
    expect(screen.getByText("Missing")).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Encoder passes" })).toBeTruthy();
});

it("writes passes as All(n) and toggles colour and filter fields", async () => {
    const onChange = mount();
    await screen.findByRole("heading", { name: "Parameters" });

    const passes = screen.getByRole<HTMLInputElement>("spinbutton", { name: "Encoder passes" });
    fireEvent.change(passes, { target: { value: "3" } });
    await waitFor(() => expect(bodyOf(onChange.mock.lastCall?.[0]).pass).toEqual({ All: 3 }));

    const colour = screen.getByRole("switch", { name: "Append colour data" });
    fireEvent.click(colour);
    await waitFor(() => expect(bodyOf(onChange.mock.lastCall?.[0]).append_color_data).toBe(false));

    const filter = screen.getByRole("textbox", { name: "FFmpeg filter" });
    fireEvent.change(filter, { target: { value: "scale=1920:-2" } });
    await waitFor(() =>
        expect(bodyOf(onChange.mock.lastCall?.[0]).ffmpeg_filter).toBe("scale=1920:-2"),
    );
    expect(screen.getByText(/Quality Check scores the unfiltered source/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(bodyOf(onChange.mock.lastCall?.[0]).ffmpeg_filter).toBeNull());
});

it("adds a catalogue parameter, previews the command, and removes it again", async () => {
    const onChange = mount();
    await screen.findByRole("heading", { name: "Parameters" });
    expect(
        screen.getByText("No parameter set. The executable runs with its own defaults."),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    const add = await screen.findByRole("dialog", { name: "Add parameter" });
    fireEvent.change(within(add).getByPlaceholderText("Search flags"), {
        target: { value: "constant" },
    });
    fireEvent.click(within(add).getByRole("button", { name: /Constant Rate Factor/u }));

    await waitFor(() =>
        expect(bodyOf(onChange.mock.lastCall?.[0]).options).toEqual({
            crf: { Number: { prefix: "--", delimiter: " ", value: 24 } },
        }),
    );
    expect(screen.getByRole("button", { name: "Remove Constant Rate Factor" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    const preview = await screen.findByRole("dialog", { name: "Preview command" });
    expect(within(preview).getByText("x265 --crf 24")).toBeTruthy();
    fireEvent.click(
        within(preview).getAllByRole("button", { name: "Close" }).at(-1) as HTMLButtonElement,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove Constant Rate Factor" }));
    await waitFor(() => expect(bodyOf(onChange.mock.lastCall?.[0]).options).toEqual({}));
});

it("adds a flag the catalogue does not know and searches the set parameters", async () => {
    const onChange = mount({
        initial: {
            X265: {
                ...X265_VALUE.X265,
                options: {
                    crf: { Number: { prefix: "--", delimiter: " ", value: 24 } },
                    tune: { String: { prefix: "--", delimiter: " ", value: "film" } },
                },
            },
        },
    });
    await screen.findByRole("heading", { name: "Parameters" });

    const search = screen.getByRole("searchbox", { name: "Search parameters" });
    fireEvent.change(search, { target: { value: "tune" } });
    expect(screen.getByText("tune")).toBeTruthy();
    expect(screen.queryByText("Constant Rate Factor")).toBeNull();

    fireEvent.change(search, { target: { value: "missing" } });
    expect(screen.getByText("No parameter matches “missing”.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Add parameter" }));
    const add = await screen.findByRole("dialog", { name: "Add parameter" });
    fireEvent.change(within(add).getByRole("textbox", { name: "Parameter flag" }), {
        target: { value: "custom" },
    });
    fireEvent.click(within(add).getByRole("button", { name: "Add" }));
    await waitFor(() =>
        expect(bodyOf(onChange.mock.lastCall?.[0]).options).toMatchObject({
            custom: { Bool: { prefix: "--", value: true } },
        }),
    );
});

it("enables photon noise with its required ISO and opens the coefficient sheet", async () => {
    const onChange = mount({
        initial: {
            SVTAV1: {
                executable: null,
                options: {},
                pass: { All: 1 },
                append_color_data: true,
                ffmpeg_filter: null,
                photon_noise: null,
            },
        },
    });
    await screen.findByRole("heading", { name: "Parameters" });

    fireEvent.click(screen.getByRole("switch", { name: "Photon noise" }));
    await waitFor(() =>
        expect(bodyOf(onChange.mock.lastCall?.[0]).photon_noise).toMatchObject({ iso: 1600 }),
    );

    const iso = screen.getByRole<HTMLInputElement>("textbox", { name: "ISO" });
    fireEvent.change(iso, { target: { value: "3200" } });
    await waitFor(() =>
        expect(bodyOf(onChange.mock.lastCall?.[0]).photon_noise).toMatchObject({ iso: 3200 }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Custom coefficients" }));
    expect(await screen.findByRole("dialog", { name: /coefficients/iu })).toBeTruthy();
});

it("disables every authoring control when the document is locked", async () => {
    mount({ locked: true });
    await screen.findByRole("heading", { name: "Parameters" });

    expect(screen.getByRole<HTMLSelectElement>("combobox", { name: "Encoder" }).disabled).toBe(
        true,
    );
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Add parameter" }).disabled).toBe(
        true,
    );
    expect(
        screen.getByRole<HTMLInputElement>("spinbutton", { name: "Encoder passes" }).disabled,
    ).toBe(true);
    expect(screen.getByRole<HTMLInputElement>("textbox", { name: "FFmpeg filter" }).disabled).toBe(
        true,
    );
    expect(
        screen.getByRole<HTMLButtonElement>("switch", { name: "Append colour data" }).disabled,
    ).toBe(true);
});

it("names the scope whose encoder is being edited", async () => {
    mount({ scope: "video" });
    await screen.findByRole("heading", { name: "Parameters" });
    expect(
        screen.getByText(
            "The encoder every scene of this video is encoded with. A scene can choose another.",
        ),
    ).toBeTruthy();
    expect(screen.getByText(/An individual scene can override this encoder/u)).toBeTruthy();
});
