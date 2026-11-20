// @vitest-environment jsdom
import type { ScriptMaterialised } from "@av1ation/contracts";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, expect, it, vi } from "vitest";

import { ROUTE_PROJECT, populatedTransport } from "../../test/route-fixtures";
import { renderRoute } from "../../test/render";
import { ScriptEditorScreen } from "./ScriptEditorScreen";

vi.mock("@monaco-editor/react", async () => {
    const { FakeScriptEditor, fakeMonacoLoader } = await import("../../test/fake-monaco");
    return { default: FakeScriptEditor, loader: fakeMonacoLoader };
});
vi.mock("monaco-editor", async () => {
    const { fakeMonaco } = await import("../../test/fake-monaco");
    return fakeMonaco;
});
vi.mock("../../shared/monaco-env", () => ({
    MONACO_THEMES: { dark: "av1ation-dark", light: "av1ation-light" },
}));

afterEach(() => {
    vi.restoreAllMocks();
});

const MATERIALISED: ScriptMaterialised = {
    filename: "script.vpy",
    source: "import vapoursynth as vs\nout.set_output()\n",
    variables: [
        {
            key: "condor_video_path",
            description: "The video this export opens.",
            format: "text",
            value: "C:\\\\media\\\\clip.mkv",
        },
    ],
};

it("converts a file input to a stored script, saves it, and discards later edits", async () => {
    const transport = populatedTransport();
    transport.general.set(ROUTE_PROJECT.id, {
        input_kind: "vapour_synth_script",
        output_mode: "next_to_input",
        script_mode: "file",
        script: "C:\\Users\\demo\\scripts\\aurora.vpy",
        ffms2_filters: [],
        vapour_synth_filters: [],
    });
    const { topBar } = renderRoute(<ScriptEditorScreen />, {
        route: "/projects/$projectId/config/script",
        initialEntry: "/projects/demo-project/config/script?section=general",
        transport,
        topBar: true,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "aurora.vpy" })).toBeTruthy();
    expect(await screen.findByText("External script")).toBeTruthy();
    if (topBar === null) throw new Error("the screen must mount its draft actions");

    fireEvent.click(screen.getByRole("button", { name: "Store a script in the app" }));
    const editor = (await screen.findByLabelText(
        "Custom VapourSynth script",
    )) as HTMLTextAreaElement;
    await waitFor(() => expect(editor.value).toContain("import vapoursynth as vs"));
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();

    const edited = `${editor.value}\nout = src.std.SetFrameProp(prop="_PictType", intval=0)\nout.set_output()\n`;
    fireEvent.change(editor, { target: { value: edited } });
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(transport.general.get(ROUTE_PROJECT.id)?.script_text).toBe(edited));
    expect(transport.general.get(ROUTE_PROJECT.id)?.script_mode).toBe("text");
    await waitFor(() => expect(within(topBar).queryByText("Unsaved changes")).toBeNull());

    fireEvent.change(editor, { target: { value: `${edited}# unsaved` } });
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
    fireEvent.click(within(topBar).getByRole("button", { name: "Discard" }));

    await waitFor(() =>
        expect(
            (screen.getByLabelText("Custom VapourSynth script") as HTMLTextAreaElement).value,
        ).toBe(edited),
    );
    expect(within(topBar).queryByText("Unsaved changes")).toBeNull();
});

it("refuses to save a cleared project script and keeps the draft", async () => {
    const transport = populatedTransport();
    transport.general.set(ROUTE_PROJECT.id, {
        input_kind: "vapour_synth_script",
        output_mode: "next_to_input",
        script_mode: "text",
        script_text: "import vapoursynth as vs\nout.set_output()\n",
        ffms2_filters: [],
        vapour_synth_filters: [],
    });
    const putJson = vi.spyOn(transport, "putJson");
    const error = vi.spyOn(toast, "error");
    const { topBar } = renderRoute(<ScriptEditorScreen />, {
        route: "/projects/$projectId/config/script",
        initialEntry: "/projects/demo-project/config/script?section=general",
        transport,
        topBar: true,
    });

    const editor = (await screen.findByLabelText(
        "Custom VapourSynth script",
    )) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "   " } });
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    // The service refuses an empty custom script, so the draft must not reach it.
    await waitFor(() => expect(error).toHaveBeenCalledWith("The custom script is empty."));
    expect(putJson).not.toHaveBeenCalled();
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
});

it("keeps a cleared project script empty once the script guide has loaded", async () => {
    const transport = populatedTransport();
    transport.general.set(ROUTE_PROJECT.id, {
        input_kind: "vapour_synth_script",
        output_mode: "next_to_input",
        script_mode: "text",
        script_text: "import vapoursynth as vs\nout.set_output()\n",
        ffms2_filters: [],
        vapour_synth_filters: [],
    });
    const putJson = vi.spyOn(transport, "putJson");
    const error = vi.spyOn(toast, "error");
    const { topBar } = renderRoute(<ScriptEditorScreen />, {
        route: "/projects/$projectId/config/script",
        initialEntry: "/projects/demo-project/config/script?section=general",
        transport,
        topBar: true,
    });

    const editor = (await screen.findByLabelText(
        "Custom VapourSynth script",
    )) as HTMLTextAreaElement;
    // The guide supplies the template the editor seeds from: wait for it before clearing,
    // otherwise the seeding effect has not run and the empty draft is not what is tested.
    await screen.findByText("cd.video_path");
    fireEvent.change(editor, { target: { value: "" } });
    expect(editor.value).toBe("");

    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("The custom script is empty."));
    expect(putJson).not.toHaveBeenCalled();
});

it("reports a rejected project script save and keeps the draft", async () => {
    const transport = populatedTransport();
    transport.general.set(ROUTE_PROJECT.id, {
        input_kind: "vapour_synth_script",
        output_mode: "next_to_input",
        script_mode: "text",
        script_text: "import vapoursynth as vs\nout.set_output()\n",
        ffms2_filters: [],
        vapour_synth_filters: [],
    });
    vi.spyOn(transport, "putJson").mockRejectedValue(new Error("The service refused the write."));
    const error = vi.spyOn(toast, "error");
    const { topBar } = renderRoute(<ScriptEditorScreen />, {
        route: "/projects/$projectId/config/script",
        initialEntry: "/projects/demo-project/config/script?section=general",
        transport,
        topBar: true,
    });

    const editor = (await screen.findByLabelText(
        "Custom VapourSynth script",
    )) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: `${editor.value}# changed\n` } });
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(error).toHaveBeenCalledWith("The service refused the write."));
    expect(within(topBar).getByText("Unsaved changes")).toBeTruthy();
});

it("converts a non-script sequence override and validates a project script", async () => {
    const transport = populatedTransport();
    transport.general.set(ROUTE_PROJECT.id, {
        input_kind: "vapour_synth_script",
        output_mode: "next_to_input",
        script_mode: "text",
        script_text: "import vapoursynth as vs\nout.set_output()\n",
        ffms2_filters: [],
        vapour_synth_filters: [],
    });
    const post = transport.post.bind(transport);
    transport.post = ((path, body, schema) => {
        if (path.endsWith("/api/script/materialise")) {
            return Promise.resolve(MATERIALISED);
        }
        return post(path, body, schema);
    }) as typeof transport.post;
    const { topBar } = renderRoute(<ScriptEditorScreen />, {
        route: "/projects/$projectId/config/script",
        initialEntry: "/projects/demo-project/config/script?section=general&part=scene_detection",
        transport,
        topBar: true,
    });

    expect(await screen.findByText("This override does not use a script yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use a custom script" }));
    await waitFor(() =>
        expect(transport.projectConfigs.get(ROUTE_PROJECT.id)).toMatchObject({
            sequences: {
                scene_detection: {
                    input: { VapourSynthScript: { source: { Text: expect.any(String) } } },
                },
            },
        }),
    );
    expect(await screen.findByRole("tab", { name: "script.vpy" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Validate" }));
    expect(await screen.findByText("Cannot check here")).toBeTruthy();
    expect(screen.getByText(/demo runs without VapourSynth/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Materialised .vpy" }));
    expect(await screen.findByText(/out\.set_output/u)).toBeTruthy();
    expect(screen.getAllByText("condor_video_path").length).toBeGreaterThan(0);
    expect(topBar).not.toBeNull();
});
