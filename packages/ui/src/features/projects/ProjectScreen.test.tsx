// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";
import { ProjectSchema, VideoDetailSchema } from "@av1ation/contracts";

import { renderRoute } from "../../test/render";
import { ProjectScreen } from "./ProjectScreen";

afterEach(() => {
    vi.restoreAllMocks();
});

const NAMES = ["One", "Two", "Three", "Four"] as const;

/** Create the project and its queue through the transport the screen itself reads. */
async function seedQueue(transport: MockTransport): Promise<string> {
    const project = await transport.post("/api/projects", { name: "Queue project" }, ProjectSchema);
    for (const name of NAMES) {
        await transport.post(
            `/api/projects/${project.id}/videos`,
            { name, input_path: `C:/media/${name}.mkv` },
            VideoDetailSchema,
        );
    }
    return project.id;
}

function renderProject(transport: MockTransport, projectId: string) {
    return renderRoute(<ProjectScreen />, {
        route: "/projects/$projectId",
        initialEntry: `/projects/${projectId}`,
        // The screen links to the sections and the queue's videos; the stubs keep those
        // paths resolvable without mounting pages this test does not read.
        stubs: ["/projects/$projectId/config/$section", "/projects/$projectId/videos/$videoId"],
        transport,
    });
}

/**
 * Drag a row by its own handle and drop it on another row's own target.
 *
 * `dataTransfer` is not implemented in jsdom, so the test supplies the same tiny store the
 * browser would: the handle writes the dragged id and the drop target reads it back.
 */
function dragRowOnto(dragged: string, target: string) {
    const payload = new Map<string, string>();
    const dataTransfer = {
        setData: (format: string, value: string) => payload.set(format, value),
        getData: (format: string) => payload.get(format) ?? "",
        effectAllowed: "move",
        dropEffect: "move",
    };
    fireEvent.dragStart(screen.getByRole("button", { name: `Reorder ${dragged}` }), {
        dataTransfer,
    });
    expect(dataTransfer.getData("text/plain")).not.toBe("");
    const row = screen.getByRole("link", { name: target }).closest("li");
    if (row === null) {
        throw new Error(`the ${target} row is not rendered`);
    }
    fireEvent.dragOver(row, { dataTransfer });
    fireEvent.drop(row, { dataTransfer });
}

it("runs the one selected video from the run chord", async () => {
    const transport = new MockTransport();
    const projectId = await seedQueue(transport);
    const post = vi.spyOn(transport, "post");
    renderProject(transport, projectId);

    await screen.findByRole("link", { name: "One" });
    const checkbox = screen.getByRole("checkbox", { name: "Select One" });
    fireEvent.click(checkbox);
    // Selecting a row leaves focus on the checkbox; that is not typing, so the chord
    // still runs the video the row selected.
    (checkbox as HTMLInputElement).focus();

    const run = screen.getByRole("button", { name: "Run selected" });
    await waitFor(() => expect((run as HTMLButtonElement).disabled).toBe(false));

    const event = new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        cancelable: true,
    });
    window.dispatchEvent(event);

    await waitFor(() =>
        expect(post.mock.calls.some(([path]) => String(path).endsWith("/encode"))).toBe(true),
    );
    expect(event.defaultPrevented).toBe(true);
});

it("opens a row's actions without navigating to the video", async () => {
    const transport = new MockTransport();
    const projectId = await seedQueue(transport);
    const { router } = renderProject(transport, projectId);

    const trigger = await screen.findByRole("button", { name: "Actions for One" });
    const before = router.state.location.pathname;

    // Radix opens on pointerdown; the later click is the one that used to bubble to the
    // row and navigate after the menu had already opened.
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);

    expect(await screen.findByRole("menu")).toBeDefined();
    expect(router.state.location.pathname).toBe(before);
});

it("shows a refused row start in that row, not at the top of the queue", async () => {
    const transport = new MockTransport();
    const projectId = await seedQueue(transport);
    renderProject(transport, projectId);

    const link = await screen.findByRole("link", { name: "One" });
    const row = link.closest("li");
    if (row === null) {
        throw new Error("the One row is not rendered");
    }
    vi.spyOn(transport, "post").mockRejectedValue(new Error("Another video is encoding."));

    const start = within(row).getByRole("button", { name: "Start" });
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(start);

    const alert = await within(row).findByRole("alert");
    expect(alert.textContent).toContain("Another video is encoding.");
});

it("keeps entries hidden by the queue search in their queue positions during a drag", async () => {
    const transport = new MockTransport();
    const projectId = await seedQueue(transport);
    renderProject(transport, projectId);

    await screen.findByRole("link", { name: "One" });
    const queue = document.getElementById("queue");
    if (queue === null) {
        throw new Error("the queue section is not rendered");
    }
    const order = () =>
        within(queue)
            .queryAllByRole("link")
            .map((link) => link.textContent?.trim() ?? "")
            .filter((name) => (NAMES as readonly string[]).includes(name));

    expect(order()).toEqual(["One", "Two", "Three", "Four"]);

    // "t" hides One and Four, leaving Two above Three as the only pair the user can see.
    fireEvent.change(
        screen.getByRole("searchbox", {
            name: "Search the queue by name or path",
        }),
        { target: { value: "t" } },
    );
    await waitFor(() => expect(order()).toEqual(["Two", "Three"]));

    dragRowOnto("Two", "Three");
    await waitFor(() => expect(order()).toEqual(["Three", "Two"]));

    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));

    // The drag named positions in the full queue, not in the filtered view. One is still
    // first and Four is still last because a filtered reorder never moved them.
    await waitFor(() => expect(order()).toEqual(["One", "Three", "Two", "Four"]));
});
