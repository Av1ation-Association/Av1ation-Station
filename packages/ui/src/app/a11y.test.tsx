// @vitest-environment jsdom
//
// The plan requires an axe pass over every screen (docs/plan/03-ui.md §5 and §8). This
// renders the real application tree at each destination, so the shell, the route
// component and its loading state are audited together rather than a component in
// isolation.
import axe from "axe-core";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { ApiProvider, MockTransport } from "@av1ation/api";
import type { ProjectSummary } from "@av1ation/contracts";

import { App } from "./App";
import { createAppRouter } from "./router";

const demoProject: ProjectSummary = {
    id: "demo",
    name: "Demo",
    path: "C:\\Users\\demo\\Av1ation\\demo",
    accessed_at: "2026-11-01T12:00:00Z",
    created_at: "2026-11-01T12:00:00Z",
    size_bytes: 780_000_000,
    video_count: 1,
    completed_videos: 1,
};

beforeAll(() => {
    // jsdom has no top layer; every sheet in the shell uses the native dialog API.
    HTMLDialogElement.prototype.showModal = function showModal() {
        this.open = true;
    };
    HTMLDialogElement.prototype.close = function close() {
        this.open = false;
    };
});

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
    window.history.replaceState(null, "", "/");
});

async function violationsAt(path: string): Promise<string[]> {
    window.history.replaceState(null, "", path);
    const router = createAppRouter();
    const view = render(
        <ApiProvider transport={new MockTransport({ projects: [demoProject] })}>
            <App router={router} />
        </ApiProvider>,
    );

    // Wait for the lazy route and its queries before auditing. A screen may legitimately
    // settle into loading or error, and those states are audited too. The dynamic import
    // can miss the default second when the suite runs one worker per file.
    await waitFor(() => expect(router.state.isLoading).toBe(false), {
        timeout: 5_000,
    });

    const result = await axe.run(view.container, {
        rules: {
            // jsdom performs no layout, so contrast and target size cannot be measured.
            "color-contrast": { enabled: false },
            "target-size": { enabled: false },
        },
    });
    return result.violations.map(
        (violation) => `${violation.id} (${violation.impact}): ${violation.help}`,
    );
}

describe("screen accessibility", () => {
    it("home", async () => {
        expect(await violationsAt("/")).toEqual([]);
    });

    it("settings", async () => {
        expect(await violationsAt("/settings")).toEqual([]);
    });

    // The strip names seven destinations; only the default inventory is the bare route.
    it("settings appearance", async () => {
        expect(await violationsAt("/settings#appearance")).toEqual([]);
    });

    it("settings encoders", async () => {
        expect(await violationsAt("/settings#encoders")).toEqual([]);
    });

    it("settings project template", async () => {
        expect(await violationsAt("/settings#project-defaults")).toEqual([]);
    });

    it("settings storage", async () => {
        expect(await violationsAt("/settings#storage")).toEqual([]);
    });

    it("settings network", async () => {
        expect(await violationsAt("/settings#network")).toEqual([]);
    });

    it("about", async () => {
        expect(await violationsAt("/settings/about")).toEqual([]);
    });

    it("project", async () => {
        expect(await violationsAt("/projects/demo")).toEqual([]);
    });

    it("project general", async () => {
        expect(await violationsAt("/projects/demo/config/general")).toEqual([]);
    });

    it("video", async () => {
        expect(await violationsAt("/projects/demo/videos/demo-video")).toEqual([]);
    });

    it("scenes", async () => {
        expect(await violationsAt("/projects/demo/videos/demo-video/scenes")).toEqual([]);
    });
});
