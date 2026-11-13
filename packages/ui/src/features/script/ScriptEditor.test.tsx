// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { populatedTransport } from "../../test/route-fixtures";
import {
    FakeLanguageServerChannel,
    fakeMonacoState,
    provideCompletion,
    provideHover,
    resetFakeMonaco,
} from "../../test/fake-monaco";
import { renderWithApi } from "../../test/render";
import { ScriptEditor } from "./ScriptEditor";

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

const STUB = [
    "video_path: str",
    '"""Absolute path of the source file this run decodes."""',
    "scene_count: int",
    "",
    "class Scene:",
    "    index: int",
    "    start: int",
    "    def frame_count(self) -> int: ...",
    "",
    "class SequenceConfig:",
    "    noise_detector: NoiseDetectorConfig",
    "",
    "class NoiseDetectorConfig:",
    "    strength: float",
    "",
    "sequence_config: SequenceConfig",
    "scenes: tuple[Scene, ...]",
].join("\n");

// Monaco initialization is a lazy import; the 1 s Testing Library default is too tight when
// the full suite runs every file in parallel. This is still a condition wait, not a sleep.
const READY_TIMEOUT = { timeout: 3_000 };

const VARIABLES = [
    {
        key: "condor_video_path",
        description: "Absolute path of the source file this run decodes.",
        format: "text",
    },
    {
        key: "condor_scenes",
        description: "JSON array of the scene table.",
        format: "json",
    },
];

function renderEditor(overrides: Partial<Parameters<typeof ScriptEditor>[0]> = {}) {
    const onChange = vi.fn<(next: string) => void>();
    const view = renderWithApi(
        <ScriptEditor
            value={"import vapoursynth as vs\n\nout = vs.core.std.BlankClip()\nout.set_output()\n"}
            onChange={onChange}
            stub={STUB}
            variables={VARIABLES}
            {...overrides}
        />,
        { transport: populatedTransport() },
    );
    return { ...view, onChange };
}

function touchEvent(
    type: string,
    touches: Array<{ identifier: number; clientX: number; clientY: number }>,
) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "touches", { value: touches });
    return event;
}

beforeEach(() => {
    resetFakeMonaco();
});

afterEach(() => {
    resetFakeMonaco();
});

describe("script editor", () => {
    it("offers the bundled module, VapourSynth, plugin, chain, and bare-name completions", async () => {
        renderEditor();
        await waitFor(() => expect(fakeMonacoState.editor).not.toBeNull(), READY_TIMEOUT);

        const moduleMembers = await provideCompletion("cd.");
        expect(moduleMembers.map((entry) => entry.label)).toEqual(
            expect.arrayContaining(["video_path", "sequence_config", "scenes"]),
        );
        expect(moduleMembers.map((entry) => entry.label)).not.toContain("Scene");

        const configured = await provideCompletion("cd.sequence_config.");
        expect(configured.map((entry) => entry.label)).toContain("noise_detector");

        const scene = await provideCompletion("for scene in cd.scenes:\n    scene.", 2);
        expect(scene.map((entry) => entry.label)).toEqual(
            expect.arrayContaining(["index", "start", "frame_count"]),
        );

        const vapourSynth = await provideCompletion("vs.");
        expect(vapourSynth.map((entry) => entry.label)).toContain("VideoNode");
        const core = await provideCompletion("vs.core.");
        expect(core.map((entry) => entry.label)).toContain("std");
        const plugin = await provideCompletion("core.std.");
        expect(plugin.map((entry) => entry.label)).toContain("BlankClip");
        const namespace = await provideCompletion("core.");
        expect(namespace.map((entry) => entry.label)).toContain("std");

        const bare = await provideCompletion("x", 1, 2);
        expect(bare.map((entry) => entry.label)).toEqual(
            expect.arrayContaining(["condor_data", "vapoursynth", "print"]),
        );

        const empty = await provideCompletion("cd.video_path.");
        expect(empty).toEqual([]);
    });

    it("answers hover for module values, VapourSynth names, variables, and scene fields", async () => {
        renderEditor();
        await waitFor(() => expect(fakeMonacoState.hoverProvider).not.toBeNull(), READY_TIMEOUT);

        const moduleValue = await provideHover("cd.video_path");
        expect(moduleValue?.contents.map((entry) => entry.value).join(" ")).toContain(
            "cd.video_path",
        );

        const vsValue = await provideHover("vs.core");
        expect(vsValue?.contents.map((entry) => entry.value).join(" ")).toContain("VapourSynth");
        const pluginValue = await provideHover("core.std.BlankClip");
        expect(pluginValue?.contents.map((entry) => entry.value).join(" ")).toContain(
            "core.std.BlankClip",
        );
        const coreValue = await provideHover("core.std");
        expect(coreValue?.contents.map((entry) => entry.value).join(" ")).toContain("std");
        const coreNamespace = await provideHover("core");
        expect(coreNamespace?.contents.map((entry) => entry.value).join(" ")).toContain(
            "the loaded VapourSynth core",
        );

        const variable = await provideHover("condor_video_path");
        expect(variable?.contents.map((entry) => entry.value).join(" ")).toContain(
            "condor_video_path",
        );
        const scene = await provideHover("for scene in cd.scenes:\n    scene.index", 2);
        expect(scene?.contents.map((entry) => entry.value).join(" ")).toContain("index");
        expect(await provideHover("unknown_name")).toBeNull();
    });

    it("prefers a language server, then disposes it when the editor unmounts", async () => {
        const channel = new FakeLanguageServerChannel();
        const view = renderEditor({
            openLanguageServer: async () => channel,
            languageServerWorkspace: "C:\\work",
            languageServerKind: "pylsp",
            languageServerInterpreter: "C:\\Python\\python.exe",
        });
        await waitFor(
            () =>
                expect(channel.sent.some((message) => message.method === "initialized")).toBe(true),
            READY_TIMEOUT,
        );

        const completion = await provideCompletion("cd.");
        expect(completion[0]).toMatchObject({
            label: "from_server",
            insertText: "from_server(${1:frame})",
        });
        expect(completion[0]?.range).toMatchObject({ startLineNumber: 1, startColumn: 1 });

        const hover = await provideHover("cd.video_path");
        expect(hover?.contents[0]?.value).toBe("**server hover**");

        view.unmount();
        await waitFor(() => expect(channel.closed).toBe(true), READY_TIMEOUT);
    });

    it("falls back to the bundled tables when the server errors or returns nothing", async () => {
        const channel = new FakeLanguageServerChannel({
            completion: "error",
            hover: "empty",
        });
        renderEditor({
            openLanguageServer: async () => channel,
            languageServerWorkspace: "C:\\work",
        });
        await waitFor(
            () =>
                expect(channel.sent.some((message) => message.method === "initialized")).toBe(true),
            READY_TIMEOUT,
        );

        const completion = await provideCompletion("cd.");
        expect(completion.map((entry) => entry.label)).toContain("video_path");
        const hover = await provideHover("cd.video_path");
        expect(hover?.contents.map((entry) => entry.value).join(" ")).toContain("cd.video_path");
    });

    it("keeps the bundled tables when initialization fails or the bridge is absent", async () => {
        const failed = new FakeLanguageServerChannel({ initialize: "error" });
        const view = renderEditor({
            openLanguageServer: async () => failed,
            languageServerWorkspace: "C:\\work",
        });
        await waitFor(() => expect(failed.closed).toBe(true), READY_TIMEOUT);
        view.unmount();

        const nullBridge = renderEditor({
            openLanguageServer: async () => null,
            languageServerWorkspace: "C:\\work",
        });
        await waitFor(() => expect(fakeMonacoState.editor).not.toBeNull(), READY_TIMEOUT);
        const completion = await provideCompletion("cd.");
        expect(completion.map((entry) => entry.label)).toContain("video_path");
        nullBridge.unmount();
    });

    it("pans the editor on a touch drag without panning a tap", async () => {
        const view = renderEditor();
        await waitFor(() => expect(fakeMonacoState.editor).not.toBeNull(), READY_TIMEOUT);
        const editor = fakeMonacoState.editor;
        if (editor === null) throw new Error("the editor did not mount");
        const container = editor.getContainerDomNode();
        expect(container.style.touchAction).toBe("none");

        container.dispatchEvent(
            touchEvent("touchstart", [{ identifier: 1, clientX: 10, clientY: 10 }]),
        );
        container.dispatchEvent(
            touchEvent("touchmove", [{ identifier: 1, clientX: 1, clientY: 1 }]),
        );
        expect(fakeMonacoState.scrollTop).toBe(9);
        expect(fakeMonacoState.scrollLeft).toBe(9);

        container.dispatchEvent(
            touchEvent("touchstart", [{ identifier: 1, clientX: 10, clientY: 10 }]),
        );
        container.dispatchEvent(
            touchEvent("touchmove", [{ identifier: 1, clientX: 8, clientY: 9 }]),
        );
        expect(fakeMonacoState.scrollTop).toBe(9);

        container.dispatchEvent(
            touchEvent("touchstart", [{ identifier: 1, clientX: 10, clientY: 10 }]),
        );
        container.dispatchEvent(
            touchEvent("touchmove", [{ identifier: 2, clientX: 1, clientY: 1 }]),
        );
        expect(fakeMonacoState.scrollTop).toBe(9);
        container.dispatchEvent(touchEvent("touchend", []));

        container.dispatchEvent(
            touchEvent("touchstart", [
                { identifier: 1, clientX: 10, clientY: 10 },
                { identifier: 2, clientX: 20, clientY: 20 },
            ]),
        );
        container.dispatchEvent(
            touchEvent("touchmove", [{ identifier: 1, clientX: 1, clientY: 1 }]),
        );
        expect(fakeMonacoState.scrollTop).toBe(9);
        container.dispatchEvent(touchEvent("touchcancel", []));

        view.unmount();
        expect(container.style.touchAction).toBe("");
    });

    it("reflects the selected theme, read-only mode, and textarea edits", async () => {
        const view = renderEditor({ readOnly: true });
        const textarea = await screen.findByLabelText("VapourSynth script");
        expect(textarea).toHaveProperty("readOnly", true);
        expect((screen.getByTestId("fake-monaco") as HTMLElement).dataset.theme).toBe(
            "av1ation-dark",
        );

        view.rerenderWithApi(
            <ScriptEditor
                value="changed"
                onChange={view.onChange}
                stub={STUB}
                variables={VARIABLES}
                ariaLabel="Custom script"
            />,
        );
        fireEvent.change(await screen.findByLabelText("Custom script"), {
            target: { value: "changed again" },
        });
        expect(view.onChange).toHaveBeenCalledWith("changed again");
    });
});
