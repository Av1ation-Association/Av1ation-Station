// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { AppSettings, GeneralDefaults } from "@av1ation/contracts";

import { populatedTransport } from "../../test/route-fixtures";
import { renderRoute } from "../../test/render";
import { DefaultsScriptScreen } from "./DefaultsScriptScreen";

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

const SCRIPT_TEXT = "import vapoursynth as vs\nout = vs.core.std.BlankClip()\nout.set_output()\n";

function templateGeneral(overrides: Partial<GeneralDefaults>): GeneralDefaults {
    return {
        input_kind: "vapour_synth_script",
        output_mode: "next_to_input",
        script_mode: "text",
        script_text: SCRIPT_TEXT,
        ffms2_filters: [],
        vapour_synth_filters: [],
        ...overrides,
    };
}

function transportWithGeneral(general: GeneralDefaults) {
    const transport = populatedTransport();
    const settings = transport.routes.get("/api/settings") as AppSettings;
    transport.routes.set("/api/settings", {
        ...settings,
        project_templates: settings.project_templates.map((entry) =>
            entry.id === "default" ? { ...entry, general } : entry,
        ),
    });
    return transport;
}

it("edits and saves the template's stored script", async () => {
    const transport = transportWithGeneral(templateGeneral({}));
    const { topBar } = renderRoute(<DefaultsScriptScreen />, {
        route: "/settings/templates/$templateId/script",
        initialEntry: "/settings/templates/default/script?section=general",
        transport,
        topBar: true,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "script.vpy" })).toBeTruthy();
    const editor = (await screen.findByLabelText(
        "Custom VapourSynth script",
    )) as HTMLTextAreaElement;
    expect(editor.value).toBe(SCRIPT_TEXT);

    fireEvent.change(editor, { target: { value: `${SCRIPT_TEXT}# changed\n` } });
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    const save = within(topBar).getByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toHaveProperty("disabled", false));
    fireEvent.click(save);

    await waitFor(() => {
        const settings = transport.routes.get("/api/settings") as AppSettings;
        expect(settings.project_templates[0]?.general.script_text).toContain("# changed");
    });
});

it("converts a template file script to stored text", async () => {
    const transport = transportWithGeneral(
        templateGeneral({
            script_mode: "file",
            script: "C:\\scripts\\aurora.vpy",
            script_text: "",
        }),
    );
    renderRoute(<DefaultsScriptScreen />, {
        route: "/settings/templates/$templateId/script",
        initialEntry: "/settings/templates/default/script?section=general",
        transport,
        topBar: true,
    });

    expect(await screen.findByText("External script")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Store a script in the app" }));
    const editor = (await screen.findByLabelText(
        "Custom VapourSynth script",
    )) as HTMLTextAreaElement;
    expect(editor.value).toContain("import vapoursynth as vs");
});

it("converts a template sequence override and explains that it cannot be checked", async () => {
    const transport = populatedTransport();
    renderRoute(<DefaultsScriptScreen />, {
        route: "/settings/templates/$templateId/script",
        initialEntry: "/settings/templates/default/script?section=general&part=scene_detection",
        transport,
    });

    expect(await screen.findByText("This default override does not use a script yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use a custom script" }));
    await waitFor(() =>
        expect(transport.templateDefaults.get("default")).toMatchObject({
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
    expect(screen.getByText(/A project template has no video to open/u)).toBeTruthy();
});
