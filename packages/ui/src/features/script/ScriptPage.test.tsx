// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ScriptGuide, ScriptMaterialised } from "@av1ation/contracts";

import { populatedTransport } from "../../test/route-fixtures";
import { resetFakeMonaco } from "../../test/fake-monaco";
import { renderWithApi } from "../../test/render";
import { ScriptPage } from "./ScriptPage";

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

vi.mock("@wasm-fmt/ruff_fmt/vite", () => ({
    default: async () => undefined,
    format: (text: string) => `${text}# formatted\n`,
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
].join("\n");

const GUIDE: ScriptGuide = {
    module_file: "condor_data.py",
    stub: STUB,
    template: "import vapoursynth as vs\n\nout = vs.core.std.BlankClip()\nout.set_output()\n",
    variables: [
        {
            key: "condor_video_path",
            description: "Absolute path of the source file this run decodes.",
            source: "the video in the queue",
            format: "text",
            value: "C:\\\\media\\\\clip.mkv",
            truncated: false,
            bytes: 21,
        },
    ],
};

const MATERIALISED: ScriptMaterialised = {
    filename: "script.vpy",
    source: "import vapoursynth as vs\nout.set_output()\n",
    variables: [
        {
            key: "condor_video_path",
            description: "Absolute path of the source file this run decodes.",
            format: "text",
            value: "C:\\\\media\\\\clip.mkv",
        },
    ],
};

function renderPage(overrides: Partial<Parameters<typeof ScriptPage>[0]> = {}) {
    const onTextChange = vi.fn();
    const onMaterialise = vi.fn(async () => MATERIALISED);
    const view = renderWithApi(
        <ScriptPage
            locationLabel="General → Input"
            scopeTitle="This project"
            scopeNote="Every sequence without its own input evaluates this script."
            storedNote="Storing a copy keeps the draft with its owner."
            filename="script.vpy"
            origin="Stored in this project"
            mode="text"
            text={GUIDE.template}
            dirty={false}
            pending={false}
            onSave={() => undefined}
            onDiscard={() => undefined}
            onTextChange={onTextChange}
            onStoreCopy={() => undefined}
            onEditFile={() => undefined}
            onMaterialise={onMaterialise}
            guide={GUIDE}
            videoPath="C:\\media\\aurora.mkv"
            check={null}
            onValidate={() => undefined}
            validating={false}
            incomplete={null}
            backLabel="Back to General"
            onBack={() => undefined}
            {...overrides}
        />,
        { transport: populatedTransport() },
    );
    return { ...view, onTextChange, onMaterialise };
}

beforeEach(() => {
    resetFakeMonaco();
});

afterEach(() => {
    resetFakeMonaco();
});

describe("script page", () => {
    it("switches between script, stub, and materialised tabs and rebuilds the export", async () => {
        const { onMaterialise } = renderPage();
        const scriptTab = await screen.findByRole("tab", { name: "script.vpy" });
        expect(scriptTab.getAttribute("aria-selected")).toBe("true");
        expect(await screen.findByText("cd.video_path")).toBeTruthy();

        fireEvent.click(screen.getByRole("tab", { name: "condor_data.pyi" }));
        const stub = (await screen.findByLabelText(
            "Generated condor_data stub",
        )) as HTMLTextAreaElement;
        expect(stub.readOnly).toBe(true);
        expect(stub.value).toBe(STUB);

        fireEvent.click(scriptTab);
        fireEvent.click(screen.getByRole("tab", { name: "Materialised .vpy" }));
        expect(await screen.findByText(/out\.set_output/u)).toBeTruthy();
        expect(screen.getAllByText("condor_video_path").length).toBeGreaterThan(0);
        expect(onMaterialise).toHaveBeenCalledWith(GUIDE.template);

        fireEvent.click(screen.getByRole("button", { name: "Rebuild" }));
        await waitFor(() => expect(onMaterialise).toHaveBeenCalledTimes(2));
    });

    it("moves through the tab strip with the arrow, Home, and End keys", async () => {
        renderPage();
        const scriptTab = await screen.findByRole("tab", { name: "script.vpy" });
        scriptTab.focus();

        fireEvent.keyDown(scriptTab, { key: "ArrowRight" });
        expect(
            screen.getByRole("tab", { name: "condor_data.pyi" }).getAttribute("aria-selected"),
        ).toBe("true");
        fireEvent.keyDown(scriptTab, { key: "End" });
        await waitFor(() => expect(screen.getByText(/out\.set_output/u)).toBeTruthy());

        fireEvent.keyDown(scriptTab, { key: "Home" });
        expect(screen.getByRole("tab", { name: "script.vpy" }).getAttribute("aria-selected")).toBe(
            "true",
        );
        fireEvent.keyDown(scriptTab, { key: "ArrowLeft" });
        expect(
            screen.getByRole("tab", { name: "Materialised .vpy" }).getAttribute("aria-selected"),
        ).toBe("true");
        fireEvent.keyDown(scriptTab, { key: "ArrowRight" });
        expect(screen.getByRole("tab", { name: "script.vpy" }).getAttribute("aria-selected")).toBe(
            "true",
        );
    });

    it("copies and exports a materialised script, and shows a build failure", async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, "clipboard", {
            configurable: true,
            value: { writeText },
        });
        Object.defineProperty(URL, "createObjectURL", {
            configurable: true,
            value: vi.fn(() => "blob:script"),
        });
        Object.defineProperty(URL, "revokeObjectURL", {
            configurable: true,
            value: vi.fn(),
        });
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

        const { onMaterialise } = renderPage();
        await screen.findByRole("tab", { name: "script.vpy" });
        fireEvent.click(screen.getByRole("tab", { name: "Materialised .vpy" }));
        await screen.findByText(/out\.set_output/u);

        fireEvent.click(screen.getByRole("button", { name: "Copy" }));
        await waitFor(() => expect(writeText).toHaveBeenCalledWith(MATERIALISED.source));

        fireEvent.click(screen.getByRole("button", { name: "Export .vpy" }));
        expect(click).toHaveBeenCalled();
        expect(URL.createObjectURL).toHaveBeenCalled();

        onMaterialise.mockRejectedValueOnce(new Error("the service refused"));
        fireEvent.click(screen.getByRole("button", { name: "Rebuild" }));
        expect(await screen.findByRole("alert")).toHaveProperty(
            "textContent",
            "the service refused",
        );
        click.mockRestore();
    });

    it("renders the external-file state and exposes both copy actions", async () => {
        const onStoreCopy = vi.fn();
        const onEditFile = vi.fn();
        renderPage({
            mode: "file",
            origin: "C:\\scripts\\aurora.vpy",
            onStoreCopy,
            onEditFile,
        });
        expect(await screen.findByText("External script")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Store a script in the app" }));
        expect(onStoreCopy).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole("button", { name: "Store a copy" }));
        expect(onStoreCopy).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByRole("button", { name: "Edit file" }));
        expect(onEditFile).toHaveBeenCalledOnce();
        expect(screen.queryByLabelText("Custom VapourSynth script")).toBeNull();
    });

    it("formats a non-empty draft and shows the incomplete-document alert", async () => {
        const { onTextChange } = renderPage({ incomplete: "Choose an output first." });
        const format = await screen.findByRole("button", { name: "Format" });
        fireEvent.click(format);
        await waitFor(() =>
            expect(onTextChange).toHaveBeenCalledWith(`${GUIDE.template}# formatted\n`),
        );
        expect(screen.getByRole("alert").textContent).toBe("Choose an output first.");
    });

    it("shows the empty-data and raw-variable empty states", async () => {
        renderPage({
            guide: { ...GUIDE, stub: "", variables: [] },
            filename: "script.py",
            videoPath: "",
        });
        expect(await screen.findByText("The guide has not loaded yet.")).toBeTruthy();
        expect(screen.getByText(/This context has no video/)).toBeTruthy();
    });

    it("marks a check result and lets the page validate a non-empty draft", async () => {
        const onValidate = vi.fn();
        renderPage({
            check: { status: "valid", clip: null, detail: "One clip, 10 frames." },
            onValidate,
        });
        expect(await screen.findByText("Validated")).toBeTruthy();
        expect(screen.getByText("One clip, 10 frames.")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Validate" }));
        expect(onValidate).toHaveBeenCalledOnce();
    });
});
