// @vitest-environment jsdom
import { useState } from "react";

import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";
import type { EncoderDescriptor } from "@av1ation/contracts";

import type { JsonSchema } from "../../shared/schema/config-schema";
import { renderRoute } from "../../test/render";
import { EncoderEditor } from "./EncoderEditor";
import { forkOptionName } from "./encoder-document";

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

/** A saved x265 build with no executable yet, as a pathless selection writes it. */
function pathlessFork(forkId: string, label: string) {
    const descriptor: EncoderDescriptor = {
        id: forkId,
        base: "x265",
        label,
        default: { X265: { ...X265_VALUE.X265, options: {} } },
        parameters: {},
        source: "Known",
        executable: null,
        version: null,
        available: true,
        fork: true,
        warning: null,
        overridden: false,
    };
    return {
        record: {
            id: forkId,
            label,
            base: "x265",
            executable: "",
            version: null,
            profile: null,
            warning: null,
            parameters: {},
            parameters_edited: false,
        },
        descriptor,
    };
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
    // The fixture carries every built-in encoder as available, including SVT-AV1.
    expect(screen.getByText("Available")).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Encoder passes" })).toBeTruthy();
});

it("offers a pathless fork, warns, and keeps it selected without counting its marker", async () => {
    const forkId = "fork:pathless-x265";
    const transport = new MockTransport();
    transport.forks.push(pathlessFork(forkId, "Pathless x265"));
    const onChange = vi.fn();
    renderRoute(<Harness onChange={onChange} />, {
        transport,
        route: "/settings",
        initialEntry: "/settings",
    });
    await screen.findByRole("heading", { name: "Parameters" });

    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Encoder" });
    const option = await within(select).findByRole("option", { name: /Pathless x265/u });
    expect(option.textContent).toContain("not located");

    fireEvent.change(select, { target: { value: `fork:${forkId}` } });
    await waitFor(() => expect(select.value).toBe(`fork:${forkId}`));

    const warning = await screen.findByRole("alert");
    expect(within(warning).getByText(/Pathless x265 has no executable yet/u)).toBeTruthy();
    expect(
        within(warning).getByRole("link", { name: "Manage encoders" }).getAttribute("href"),
    ).toBe("/settings#encoders");
    expect(
        screen.getByText("No parameter set. The executable runs with its own defaults."),
    ).toBeTruthy();

    const next = onChange.mock.lastCall?.[0] as {
        X265: { executable: unknown; options: Record<string, unknown> };
    };
    expect(next.X265.executable).toBeNull();
    expect(next.X265.options[forkOptionName(forkId)]).toEqual({
        Bool: { prefix: "--", value: false },
    });
});

it("warns when the selected build is no longer saved", async () => {
    const marker = forkOptionName("fork:removed-x265");
    mount({
        initial: {
            X265: {
                ...X265_VALUE.X265,
                options: { [marker]: { Bool: { prefix: "--", value: false } } },
            },
        },
    });
    await screen.findByRole("heading", { name: "Parameters" });

    const warning = await screen.findByRole("alert");
    expect(within(warning).getByText(/no longer saved/u)).toBeTruthy();
    expect(within(warning).getByRole("link", { name: "Manage encoders" })).toBeTruthy();
});

it("does not call a selected build deleted before the catalogue answers", async () => {
    const marker = forkOptionName("fork:removed-x265");
    const queryClient = new QueryClient({
        defaultOptions: { queries: { enabled: false, retry: false } },
    });
    renderRoute(
        <Harness
            initial={{
                X265: {
                    ...X265_VALUE.X265,
                    options: { [marker]: { Bool: { prefix: "--", value: false } } },
                },
            }}
            onChange={vi.fn()}
        />,
        {
            transport: new MockTransport(),
            queryClient,
            route: "/settings",
            initialEntry: "/settings",
        },
    );
    await screen.findByRole("heading", { name: "Parameters" });

    // A pending catalogue has no evidence that the saved row was deleted.
    expect(screen.queryByText(/no longer saved/u)).toBeNull();
});

it("keeps an ordinary option that shares the marker prefix", async () => {
    const forkId = "fork:pathless-x265";
    const transport = new MockTransport();
    transport.forks.push(pathlessFork(forkId, "Pathless x265"));
    renderRoute(
        <Harness
            initial={{
                X265: {
                    ...X265_VALUE.X265,
                    options: {
                        // An enabled flag with the reserved prefix is an ordinary option,
                        // not a selection, and must not mask the real marker after it.
                        __av1ation_fork_ordinary: { Bool: { prefix: "--", value: true } },
                        [forkOptionName(forkId)]: { Bool: { prefix: "--", value: false } },
                    },
                },
            }}
            onChange={vi.fn()}
        />,
        {
            transport,
            route: "/settings",
            initialEntry: "/settings",
        },
    );
    await screen.findByRole("heading", { name: "Parameters" });

    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Encoder" });
    await within(select).findByRole("option", { name: /Pathless x265/u });
    expect(select.value).toBe(`fork:${forkId}`);
    expect(screen.queryByText(/no longer saved/u)).toBeNull();
    // The ordinary option stays in the parameter list and remains editable.
    expect(screen.getByRole("button", { name: /Reset --__av1ation_fork_ordinary/u })).toBeTruthy();
});

it("clears a deleted build's marker when its base encoder is chosen again", async () => {
    const marker = forkOptionName("fork:removed-x265");
    const onChange = mount({
        initial: {
            X265: {
                ...X265_VALUE.X265,
                options: { [marker]: { Bool: { prefix: "--", value: false } } },
            },
        },
    });
    await screen.findByRole("heading", { name: "Parameters" });

    // The stale selection is its own option, so choosing the base encoder is a real
    // change rather than the value the select already shows.
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Encoder" });
    await within(select).findByRole("option", { name: /no longer saved/u });
    expect(select.value.startsWith("stale:")).toBe(true);
    expect(select.value).not.toBe("base:X265");
    expect(await screen.findByRole("alert")).toBeTruthy();

    fireEvent.change(select, { target: { value: "base:X265" } });

    await waitFor(() => expect(select.value).toBe("base:X265"));
    expect(bodyOf(onChange.mock.lastCall?.[0]).options).toEqual({});
    expect(screen.queryByRole("alert")).toBeNull();
});

it("warns when a selected build's saved path is missing", async () => {
    const forkId = "fork:moved-x265";
    const path = "C:/gone/x265.exe";
    const descriptor: EncoderDescriptor = {
        id: forkId,
        base: "x265",
        label: "Moved x265",
        default: { X265: { ...X265_VALUE.X265, executable: path } },
        parameters: {},
        source: "Known",
        executable: path,
        version: null,
        available: false,
        fork: true,
        warning: null,
        overridden: false,
    };
    const transport = new MockTransport();
    transport.forks.push({
        record: {
            id: forkId,
            label: "Moved x265",
            base: "x265",
            executable: path,
            version: null,
            profile: null,
            warning: null,
            parameters: {},
            parameters_edited: false,
        },
        descriptor,
    });
    renderRoute(
        <Harness initial={{ X265: { ...X265_VALUE.X265, executable: path } }} onChange={vi.fn()} />,
        {
            transport,
            route: "/settings",
            initialEntry: "/settings",
        },
    );
    await screen.findByRole("heading", { name: "Parameters" });

    const warning = await screen.findByRole("alert");
    expect(within(warning).getByText(/is not at its saved path/u)).toBeTruthy();
});

it("warns when a selected build's saved path has moved", async () => {
    const forkId = "fork:relocated-x265";
    const path = "C:/old/x265.exe";
    const descriptor: EncoderDescriptor = {
        id: forkId,
        base: "x265",
        label: "Relocated x265",
        default: { X265: { ...X265_VALUE.X265, executable: path } },
        parameters: {},
        source: "Known",
        executable: path,
        version: null,
        available: false,
        fork: true,
        warning: null,
        overridden: false,
    };
    const transport = new MockTransport();
    transport.forks.push({
        record: {
            id: forkId,
            label: "Relocated x265",
            base: "x265",
            executable: path,
            version: null,
            warning: null,
            parameters: {},
            parameters_edited: false,
        },
        descriptor,
    });
    renderRoute(
        <Harness
            initial={{
                X265: {
                    ...X265_VALUE.X265,
                    options: {
                        [forkOptionName(forkId)]: { Bool: { prefix: "--", value: false } },
                    },
                },
            }}
            onChange={vi.fn()}
        />,
        {
            transport,
            route: "/settings",
            initialEntry: "/settings",
        },
    );
    await screen.findByRole("heading", { name: "Parameters" });

    // The project selected the build while it was pathless. The record now names a path the
    // build has since left, so the marker keeps it selected and the warning names the path.
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Encoder" });
    await within(select).findByRole("option", { name: /Relocated x265/u });
    expect(select.value).toBe(`fork:${forkId}`);
    const warning = await screen.findByRole("alert");
    expect(within(warning).getByText(/is not at its saved path/u)).toBeTruthy();
    expect(within(warning).getByRole("link", { name: "Manage encoders" })).toBeTruthy();
});

it("warns when a reset shipped build is still selected", async () => {
    const forkId = "fork:svt-av1-essential";
    const descriptor: EncoderDescriptor = {
        id: forkId,
        base: "svt-av1",
        label: "SVT-AV1-Essential",
        default: {
            SVTAV1: {
                executable: null,
                options: {},
                pass: { All: 1 },
                append_color_data: true,
                ffmpeg_filter: null,
                photon_noise: null,
            },
        },
        parameters: {},
        source: "Known",
        executable: null,
        version: null,
        available: true,
        fork: true,
        warning: null,
        overridden: false,
    };
    const transport = new MockTransport();
    transport.forks.push({
        record: {
            id: forkId,
            label: "SVT-AV1-Essential",
            base: "svt-av1",
            executable: "",
            version: null,
            warning: null,
            parameters: {},
            parameters_edited: false,
        },
        descriptor,
    });
    renderRoute(
        <Harness
            initial={{
                SVTAV1: {
                    executable: null,
                    options: {
                        [forkOptionName(forkId)]: { Bool: { prefix: "--", value: false } },
                    },
                    pass: { All: 1 },
                    append_color_data: true,
                    ffmpeg_filter: null,
                    photon_noise: null,
                },
            }}
            onChange={vi.fn()}
        />,
        {
            transport,
            route: "/settings",
            initialEntry: "/settings",
        },
    );
    await screen.findByRole("heading", { name: "Parameters" });

    // A reset row resolves on PATH, so the catalogue reports the base provider's
    // availability. The warning must still say the build itself is not located.
    const select = screen.getByRole<HTMLSelectElement>("combobox", { name: "Encoder" });
    await within(select).findByRole("option", { name: /SVT-AV1-Essential/u });
    expect(select.value).toBe(`fork:${forkId}`);
    expect(screen.getByText("Available")).toBeTruthy();
    const warning = await screen.findByRole("alert");
    expect(within(warning).getByText(/SVT-AV1-Essential has no executable yet/u)).toBeTruthy();
    expect(within(warning).getByRole("link", { name: "Manage encoders" })).toBeTruthy();
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

it("copies the previewed command and reports a copy failure", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText },
    });
    mount();
    await screen.findByRole("heading", { name: "Parameters" });

    fireEvent.click(screen.getByRole("button", { name: "Preview command" }));
    const preview = await screen.findByRole("dialog", { name: "Preview command" });
    fireEvent.click(within(preview).getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("x265"));

    writeText.mockRejectedValueOnce(new Error("clipboard denied"));
    fireEvent.click(within(preview).getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
});

it("edits each photon field and applies custom coefficients", async () => {
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

    fireEvent.change(screen.getByRole("textbox", { name: "Chroma ISO" }), {
        target: { value: "800" },
    });
    await waitFor(() =>
        expect(bodyOf(onChange.mock.lastCall?.[0]).photon_noise).toMatchObject({ chroma_iso: 800 }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Width" }), {
        target: { value: "1920" },
    });
    await waitFor(() =>
        expect(bodyOf(onChange.mock.lastCall?.[0]).photon_noise).toMatchObject({ width: 1920 }),
    );
    fireEvent.change(screen.getByRole("textbox", { name: "Height" }), {
        target: { value: "1080" },
    });
    await waitFor(() =>
        expect(bodyOf(onChange.mock.lastCall?.[0]).photon_noise).toMatchObject({ height: 1080 }),
    );

    const iso = screen.getByRole<HTMLInputElement>("textbox", { name: "ISO" });
    fireEvent.change(iso, { target: { value: "" } });
    expect(iso.value).toBe("");
    fireEvent.blur(iso);
    await waitFor(() => expect(iso.value).toBe("1600"));

    fireEvent.click(screen.getByRole("button", { name: "Custom coefficients" }));
    const sheet = await screen.findByRole("dialog", { name: /coefficients/iu });
    fireEvent.click(within(sheet).getByRole("button", { name: "Customise" }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Apply coefficients" }));
    await waitFor(() =>
        expect(bodyOf(onChange.mock.lastCall?.[0]).photon_noise).toMatchObject({
            c_y: expect.any(Array),
        }),
    );
    expect(screen.getByText("1 of 3 planes customised")).toBeTruthy();
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
