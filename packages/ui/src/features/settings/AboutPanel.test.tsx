// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockTransport } from "@av1ation/api";
import type { DiagnosticsBundle, UpdateStatus } from "@av1ation/contracts";
import type { ZodType } from "zod";

import { ROUTE_PROJECT } from "../../test/route-fixtures";
import { renderWithApi } from "../../test/render";
import { AboutPanel } from "./AboutPanel";

const UPDATE: UpdateStatus = {
    current: "0.1.0",
    latest: "0.2.0",
    checked_at: "2026-11-12T12:00:00Z",
    url: "https://example.test/releases/tag/v0.2.0",
    published_at: "2026-11-11T12:00:00Z",
};

const BUNDLE: DiagnosticsBundle = {
    filename: "av1ation-diagnostics.md",
    log_lines: 12,
    replacements: { "<redacted>": "C:/Users/demo" },
    text: "bundle text",
};

class AboutTransport extends MockTransport {
    update: UpdateStatus = UPDATE;
    failUpdate = false;
    failBundle = false;
    readonly bundlePaths: string[] = [];

    override async get<T>(path: string, schema: ZodType<T>): Promise<T> {
        if (path === "/api/update") {
            if (this.failUpdate) {
                throw new Error("GitHub is unreachable.");
            }
            return schema.parse(this.update);
        }
        if (path.startsWith("/api/diagnostics/bundle")) {
            this.bundlePaths.push(path);
            if (this.failBundle) {
                throw new Error("No application log is available.");
            }
            return schema.parse(BUNDLE);
        }
        return await super.get(path, schema);
    }
}

class FailingHealthTransport extends MockTransport {
    override async get<T>(path: string, schema: ZodType<T>): Promise<T> {
        if (path === "/api/health") {
            throw new Error("The service did not return its health document.");
        }
        return await super.get(path, schema);
    }
}

beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: vi.fn(async () => undefined) },
    });
});

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

function mount(
    transport: MockTransport = new AboutTransport({ projects: [ROUTE_PROJECT] }),
    queryClient?: QueryClient,
) {
    return renderWithApi(<AboutPanel />, {
        transport,
        ...(queryClient === undefined ? {} : { queryClient }),
    });
}

describe("AboutPanel", () => {
    it("shows the version, engine provenance, and project links", async () => {
        mount();

        expect(await screen.findByRole("heading", { name: "Av1ation Station" })).toBeTruthy();
        const version = screen.getByRole("link", { name: /Version/u });
        expect(version.getAttribute("href")).toContain("/releases/tag/v");
        expect(screen.getByText("Andean Condor")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Repository" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Website" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Documentation" })).toBeTruthy();
        expect(screen.getByRole("link", { name: "Read the license" })).toBeTruthy();
        expect(screen.queryByText(/Last checked/u)).toBeNull();
    });

    it("checks the newest release only when asked and links the update", async () => {
        mount();
        await screen.findByRole("heading", { name: "Av1ation Station" });

        fireEvent.click(screen.getByRole("button", { name: "Check now" }));

        const link = await screen.findByRole("link", { name: "Update available · v0.2.0" });
        expect(link.getAttribute("href")).toBe(UPDATE.url);
        expect(screen.getByText(/Last checked/u)).toBeTruthy();
    });

    it("reports a failed release lookup without losing the version card", async () => {
        const transport = new AboutTransport({ projects: [ROUTE_PROJECT] });
        transport.failUpdate = true;
        mount(transport);
        await screen.findByRole("heading", { name: "Av1ation Station" });

        fireEvent.click(screen.getByRole("button", { name: "Check now" }));

        expect((await screen.findByRole("alert")).textContent).toContain("GitHub is unreachable.");
        expect(screen.getByRole("heading", { name: "Av1ation Station" })).toBeTruthy();
    });

    it("builds a bundle for the most recently used project and copies it", async () => {
        const transport = new AboutTransport({ projects: [ROUTE_PROJECT] });
        mount(transport);
        await screen.findByRole("heading", { name: "Av1ation Station" });

        fireEvent.click(screen.getByRole("button", { name: "Copy bundle" }));

        await waitFor(() =>
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith("bundle text"),
        );
        expect(transport.bundlePaths[0]).toContain("projects=demo-project");
        expect(transport.bundlePaths[0]).toContain("logs=true");
    });

    it("honours the log toggle and a project removed from the picker", async () => {
        const transport = new AboutTransport({ projects: [ROUTE_PROJECT] });
        mount(transport);
        await screen.findByRole("heading", { name: "Av1ation Station" });

        fireEvent.click(screen.getByRole("checkbox", { name: /Include the tail/u }));
        fireEvent.click(screen.getByRole("button", { name: /Manifests/u }));
        fireEvent.click(screen.getByRole("checkbox", { name: ROUTE_PROJECT.name }));
        expect(screen.getByRole("button", { name: /Manifests/u }).textContent).toContain(
            "No project manifest",
        );
        fireEvent.click(screen.getByRole("button", { name: "Copy bundle" }));

        await waitFor(() => expect(transport.bundlePaths).toHaveLength(1));
        expect(transport.bundlePaths[0]).not.toContain("projects=");
        expect(transport.bundlePaths[0]).toContain("logs=false");
    });

    it("saves an exported bundle, shows its path, and reveals it", async () => {
        const saveTextFile = vi.fn(async () => "C:/Users/demo/Downloads/diagnostics.md");
        const revealPath = vi.fn(async () => undefined);
        const transport = new AboutTransport({ projects: [ROUTE_PROJECT] }, { saveTextFile });
        Object.defineProperty(transport, "revealPath", {
            configurable: true,
            value: revealPath,
        });
        mount(transport);
        await screen.findByRole("heading", { name: "Av1ation Station" });

        fireEvent.click(screen.getByRole("button", { name: /Export/u }));

        const path = await screen.findByText("C:/Users/demo/Downloads/diagnostics.md");
        expect(path).toBeTruthy();
        expect(saveTextFile).toHaveBeenCalledWith(
            BUNDLE.filename,
            BUNDLE.text,
            expect.objectContaining({ title: "Export diagnostics" }),
        );
        fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
        await waitFor(() =>
            expect(revealPath).toHaveBeenCalledWith("C:/Users/demo/Downloads/diagnostics.md"),
        );
    });

    it("keeps the export action and reports a failed bundle", async () => {
        const transport = new AboutTransport({ projects: [ROUTE_PROJECT] });
        transport.failBundle = true;
        mount(transport);
        await screen.findByRole("heading", { name: "Av1ation Station" });

        fireEvent.click(screen.getByRole("button", { name: "Copy bundle" }));

        expect((await screen.findByRole("alert")).textContent).toContain(
            "No application log is available.",
        );
        expect(screen.getByRole("button", { name: "Copy bundle" })).toBeTruthy();
    });

    it("offers a retry when the health document cannot be loaded", async () => {
        mount(
            new FailingHealthTransport({ projects: [ROUTE_PROJECT] }),
            new QueryClient({
                defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
            }),
        );

        // useHealth owns one retry, so this branch settles after the query client's delay.
        const alert = await screen.findByRole("alert", {}, { timeout: 5_000 });
        expect(alert.textContent).toContain("Version information could not be loaded");
        fireEvent.click(screen.getByRole("button", { name: "Try again" }));
        expect(await screen.findByRole("alert", {}, { timeout: 5_000 })).toBeTruthy();
    });
});
