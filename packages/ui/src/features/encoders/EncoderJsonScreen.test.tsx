// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ApiProvider, MockTransport, type Transport } from "@av1ation/api";
import {
    RouterProvider,
    createMemoryHistory,
    createRootRoute,
    createRoute,
    createRouter,
} from "@tanstack/react-router";

import { TopBarTargetContext } from "../../shared/TopBarActions";
import { EncoderJsonScreen } from "./EncoderJsonScreen";

/** Direct-route tests mount no shell; the router still requires static data. */
const TEST_ROUTE_STATIC_DATA = { trail: "home", params: [], back: () => null } as const;

/** The real editor needs a canvas host; what it is handed is what this test reads. */
const handed = vi.hoisted(() => ({
    markers: [] as { offset: number; length: number; message: string }[],
    focus: null as { offset: number; nonce: number } | null,
}));

vi.mock("./JsonEditor", () => ({
    JsonEditor: (props: {
        value: string;
        onChange: (value: string) => void;
        markers?: { offset: number; length: number; message: string }[];
        focus?: { offset: number; nonce: number } | null;
    }) => {
        handed.markers = props.markers ?? [];
        handed.focus = props.focus ?? null;
        return (
            <textarea
                aria-label="parameters JSON"
                value={props.value}
                onChange={(event) => props.onChange(event.target.value)}
            />
        );
    },
}));

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    handed.markers = [];
    handed.focus = null;
});

/** x265 is the mock's encoder with a descriptor, so the page has a document to edit. */
function renderScreen(saveTextFile: Transport["saveTextFile"] = undefined) {
    const rootRoute = createRootRoute({ staticData: TEST_ROUTE_STATIC_DATA });
    const route = createRoute({
        getParentRoute: () => rootRoute,
        path: "/settings/encoders/$encoderId/json",
        staticData: TEST_ROUTE_STATIC_DATA,
        component: () => <EncoderJsonScreen />,
    });
    const router = createRouter({
        routeTree: rootRoute.addChildren([route]),
        history: createMemoryHistory({
            initialEntries: ["/settings/encoders/x265/json"],
        }),
    });
    const topBar = document.createElement("div");
    document.body.append(topBar);
    render(
        <TopBarTargetContext.Provider value={topBar}>
            <ApiProvider transport={new MockTransport({}, { saveTextFile })}>
                <RouterProvider router={router} />
            </ApiProvider>
        </TopBarTargetContext.Provider>,
    );
    return topBar;
}

const INVALID_FIELD = [
    "{",
    '  "--crf": {',
    '    "label": 12,',
    '    "kind": "Flag",',
    '    "widget": "Auto"',
    "  }",
    "}",
].join("\n");

it("names the rejected field with the line and column it sits on", async () => {
    const topBar = renderScreen();
    const editor = await screen.findByRole("textbox", { name: "parameters JSON" });

    fireEvent.change(editor, { target: { value: INVALID_FIELD } });

    // The schema wraps a field problem in a descriptor-level issue; the page must reach
    // through that wrapper and point at the field, not at the descriptor.
    const issue = await screen.findByRole("button", { name: /--crf\.label/u });
    expect(issue.textContent).toContain("line 3, col 14");
    expect(issue.textContent).toContain("expected string, received number");

    // The same characters are shaded in the editor, so the list and the squiggle agree.
    expect(handed.markers).toHaveLength(1);
    expect(handed.markers[0]?.offset).toBe(INVALID_FIELD.indexOf("12"));
    expect(handed.markers[0]?.length).toBe(2);

    // An unrenderable document cannot be saved, and the preview says why it is empty.
    const save = [...topBar.querySelectorAll("button")].find(
        (button) => button.getAttribute("aria-label") === "Save",
    );
    expect(save?.disabled).toBe(true);
    expect(screen.getByText("Correct the document above to preview its parameters.")).toBeTruthy();
});

/** Hand a file to the page's one input, the way the picker would. */
function openFile(text: string, name = "league.json") {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (input === null) {
        throw new Error("the page has no file input");
    }
    Object.defineProperty(input, "files", {
        configurable: true,
        value: [new File([text], name, { type: "application/json" })],
    });
    fireEvent.change(input);
}

const VALID_IMPORT = [
    "{",
    '  "--crf": {',
    '    "label": "Film grain CRF",',
    '    "kind": "Flag",',
    '    "widget": "Auto"',
    "  }",
    "}",
].join("\n");

it("opens an imported file in place of the draft", async () => {
    renderScreen();
    const editor = await screen.findByRole("textbox", { name: "parameters JSON" });

    openFile(VALID_IMPORT);

    await waitFor(() => expect((editor as HTMLTextAreaElement).value).toBe(VALID_IMPORT));
    // The preview is built from the document that was just opened, not the one before it.
    await screen.findByText("Film grain CRF");
});

it("opens a file the contract rejects and says where it is wrong", async () => {
    renderScreen();
    await screen.findByRole("textbox", { name: "parameters JSON" });
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export" }).disabled).toBe(false);

    openFile(INVALID_FIELD);

    // The file is shown rather than refused: its problems are located under the editor.
    const issue = await screen.findByRole("button", { name: /--crf\.label/u });
    expect(issue.textContent).toContain("line 3, col 14");
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Export" }).disabled).toBe(true);
});

it("exports the validated set through the host's save dialog", async () => {
    const saveTextFile = vi.fn<NonNullable<Transport["saveTextFile"]>>(
        async () => "C:/exports/x265-parameters.json",
    );
    renderScreen(saveTextFile);
    await screen.findByRole("textbox", { name: "parameters JSON" });

    fireEvent.click(screen.getByRole("button", { name: "Export" }));

    await waitFor(() => expect(saveTextFile).toHaveBeenCalledOnce());
    const call = saveTextFile.mock.calls.at(0);
    expect(call?.[0]).toBe("x265-parameters.json");
    // The file is the whole set, keyed the way the contract reads it.
    const body = call?.[1] ?? "";
    expect(body).not.toBe("");
    expect(JSON.parse(body)).toHaveProperty(["--crf"]);
    expect(call?.[2]).toEqual({
        title: "Export encoder parameters",
        extensions: ["json"],
    });
});

it("previews the parameters with the encoder editor's own controls, without touching the document", async () => {
    renderScreen();
    const editor = await screen.findByRole<HTMLTextAreaElement>("textbox", {
        name: "parameters JSON",
    });
    const before = editor.value;

    // The preview is the control Configuration → Encoding renders, not a summary of it.
    const control = await screen.findByRole<HTMLInputElement>("textbox", {
        name: "Constant Rate Factor",
    });
    fireEvent.change(control, { target: { value: "31" } });

    expect(control.value).toBe("31");
    // The widgets are a preview: the page saves the descriptor document, never the values.
    expect(editor.value).toBe(before);
});

it("moves the editor to the problem the user selects", async () => {
    renderScreen();
    const editor = await screen.findByRole("textbox", { name: "parameters JSON" });
    fireEvent.change(editor, { target: { value: INVALID_FIELD } });

    const issue = await screen.findByRole("button", { name: /--crf\.label/u });
    fireEvent.click(issue);

    expect(handed.focus?.offset).toBe(INVALID_FIELD.indexOf("12"));
});

it("locates a syntax error and clears everything once the document is valid", async () => {
    renderScreen();
    const editor = await screen.findByRole("textbox", { name: "parameters JSON" });

    fireEvent.change(editor, { target: { value: '{"--crf": }' } });
    const issue = await screen.findByRole("button", { name: /document/u });
    expect(issue.textContent).toContain("line 1, col 11");
    expect(screen.getByText("The document is not valid JSON.")).toBeTruthy();

    fireEvent.change(editor, { target: { value: "{}" } });
    await screen.findByText(
        "This document describes no parameters, so the encoder editor will show an empty table.",
    );
    expect(handed.markers).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /document/u })).toBeNull();
});
