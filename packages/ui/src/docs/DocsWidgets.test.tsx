// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DocsSample, type DocsSampleKind } from "./DocsWidgets";

const KINDS: readonly DocsSampleKind[] = [
    "toolchain",
    "new-project",
    "run-control",
    "video-config",
    "command-palette",
    "draft-actions",
    "appearance",
    "project-search",
    "run-lock",
    "quality-metric",
    "quality-range",
    "speed-scaling",
    "bitrate-threshold",
    "scene-table",
    "scene-details",
    "history-item",
    "input-kinds",
    "script-validation",
    "log-filter",
    "queue-selection",
    "storage",
    "retained-removal",
    "network",
];

describe("website documentation samples", () => {
    it.each(KINDS)("mounts the %s sample against fixture data", (kind) => {
        const { container } = render(<DocsSample kind={kind} />);

        expect(container.querySelector("section.docs-app-widget")).not.toBeNull();
        expect(screen.getByRole("button", { name: "Reset" })).toBeTruthy();
    });

    it("remounts the sample when Reset is pressed", () => {
        render(<DocsSample kind="run-control" />);

        fireEvent.click(screen.getByRole("button", { name: "Reset" }));

        expect(screen.getByText("Live sample · Run control")).toBeTruthy();
        expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    });
});
