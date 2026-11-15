// @vitest-environment jsdom
//
// The marketing site mounts the real video screens inside its own main landmark. Each case
// audits the embedded screens against that surrounding document, so a nested main, a portal
// that leaves the frame, or a modal host regression is visible to the same accessibility
// check that governs the desktop application.
import axe from "axe-core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { populatedTransport } from "../test/route-fixtures";
import { VideoDemo } from "./VideoDemo";

const CASES = [
    {
        name: "Configuration",
        entry: "/projects/demo-project/videos/demo-video",
        heading: "Pipeline",
    },
    {
        name: "Scenes",
        entry: "/projects/demo-project/videos/demo-video/scenes",
        heading: "Scenes",
    },
    {
        name: "History",
        entry: "/projects/demo-project/videos/demo-video/history",
        heading: "History",
    },
    {
        name: "Logs",
        entry: "/projects/demo-project/videos/demo-video/logs",
        heading: "Logs",
    },
] as const;

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

describe("screen accessibility · embedded demo", () => {
    it.each(CASES)(
        "$name",
        async ({ entry, heading }) => {
            const view = render(
                <main id="site-main">
                    <h1>Marketing page</h1>
                    <VideoDemo transport={populatedTransport()} initialEntry={entry} />
                </main>,
            );

            await screen.findByRole("heading", { level: 1, name: heading }, { timeout: 5_000 });

            // The host page owns the document landmark. A demo screen must not add a second.
            expect(view.container.querySelectorAll("main")).toHaveLength(1);

            const result = await axe.run(view.container, {
                rules: {
                    "color-contrast": { enabled: false },
                    "target-size": { enabled: false },
                },
            });
            expect(
                result.violations.map(
                    (violation) => `${violation.id} (${violation.impact}): ${violation.help}`,
                ),
            ).toEqual([]);
        },
        30_000,
    );
});
