// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import type { VideoGeneral } from "@av1ation/contracts";

import { ROUTE_PROJECT, ROUTE_VIDEO, populatedTransport } from "../../test/route-fixtures";
import { renderRoute } from "../../test/render";
import { VideoScriptEditorScreen } from "./VideoScriptEditorScreen";

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

const SCRIPT_INPUT = {
    VapourSynthScript: {
        source: { Text: SCRIPT_TEXT },
        filters: [],
        variables: {},
        index: 0,
        stream_concurrently: true,
    },
};

function generalDocument(input: unknown): VideoGeneral {
    return {
        input,
        output: { path: ROUTE_VIDEO.output_path, tags: {}, video_tags: {} },
        source_path: ROUTE_VIDEO.input_path,
    };
}

it("saves a video General script through the editor draft", async () => {
    const transport = populatedTransport();
    const get = transport.get.bind(transport);
    transport.get = ((path, schema) => {
        if (path.endsWith(`/videos/${ROUTE_VIDEO.id}/general`)) {
            return Promise.resolve(generalDocument(SCRIPT_INPUT));
        }
        return get(path, schema);
    }) as typeof transport.get;
    const putJson = transport.putJson.bind(transport);
    let saved: VideoGeneral | null = null;
    transport.putJson = ((path, body, schema) => {
        if (path.endsWith(`/videos/${ROUTE_VIDEO.id}/general`)) {
            saved = generalDocument((body as { input?: unknown }).input);
            return Promise.resolve(saved);
        }
        return putJson(path, body, schema);
    }) as typeof transport.putJson;

    const { topBar } = renderRoute(<VideoScriptEditorScreen />, {
        route: "/projects/$projectId/videos/$videoId/script",
        initialEntry: `/projects/${ROUTE_PROJECT.id}/videos/${ROUTE_VIDEO.id}/script?section=general`,
        transport,
        topBar: true,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "script.vpy" })).toBeTruthy();
    const editor = (await screen.findByLabelText(
        "Custom VapourSynth script",
    )) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: `${SCRIPT_TEXT}\nout.set_output()\n` } });
    if (topBar === null) throw new Error("the screen must mount its draft actions");
    fireEvent.click(within(topBar).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saved).not.toBeNull());
    expect((saved as unknown as VideoGeneral).input.VapourSynthScript.source.Text).toContain(
        "out.set_output()",
    );
});

it("converts a non-script sequence override, validates it, and keeps its draft", async () => {
    const transport = populatedTransport();
    const post = transport.post.bind(transport);
    let materialised = false;
    transport.post = ((path, body, schema) => {
        if (path.endsWith("/api/script/materialise")) {
            materialised = true;
            return Promise.resolve({
                filename: "script.vpy",
                source: "import vapoursynth as vs\nout.set_output()\n",
                variables: [],
            });
        }
        return post(path, body, schema);
    }) as typeof transport.post;

    const { topBar } = renderRoute(<VideoScriptEditorScreen />, {
        route: "/projects/$projectId/videos/$videoId/script",
        initialEntry: `/projects/${ROUTE_PROJECT.id}/videos/${ROUTE_VIDEO.id}/script?section=general&part=scene_detection`,
        transport,
        topBar: true,
    });

    expect(await screen.findByText("This override does not use a script yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use a custom script" }));
    await waitFor(() =>
        expect(
            transport.videoOverrideFields.get(`${ROUTE_PROJECT.id}/${ROUTE_VIDEO.id}`),
        ).toMatchObject({
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
    await waitFor(() => expect(materialised).toBe(true));
    expect(await screen.findByText(/out\.set_output/u)).toBeTruthy();
    expect(topBar).not.toBeNull();
});
