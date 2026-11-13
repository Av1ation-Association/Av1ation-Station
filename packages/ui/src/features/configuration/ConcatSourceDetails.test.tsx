// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, expect, it } from "vitest";
import type { ZodType } from "zod";

import { MockTransport } from "@av1ation/api";

import { renderWithApi } from "../../test/render";
import { SourceDetailsSheet, type SourceDetailsView } from "./ConcatSourceDetails";
import { VideoConcatSources } from "./ConcatWorkbench";

afterEach(cleanup);

const SOURCE_INFO = {
    chapters: [
        { index: 0, title: "Opening", start_seconds: 0, end_seconds: 12 },
        { index: 1, title: null, start_seconds: 12, end_seconds: 60 },
    ],
    metadata: [
        { key: "title", value: "The sample" },
        { key: "encoder", value: "libebml v1.4.5" },
    ],
    chapters_detail: "2 chapters in this source.",
    metadata_detail: "2 metadata fields in this source.",
};

class SourceDetailsTransport extends MockTransport {
    reads = 0;

    constructor(
        private readonly info: unknown = SOURCE_INFO,
        private readonly failure: Error | null = null,
    ) {
        super();
    }

    override async post<T>(path: string, body: unknown, schema: ZodType<T>): Promise<T> {
        if (path.endsWith("/concat-source-info")) {
            this.reads += 1;
            if (this.failure !== null) {
                throw this.failure;
            }
            return schema.parse(this.info);
        }
        return super.post(path, body, schema);
    }
}

function client(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: { retry: false, refetchOnWindowFocus: false },
        },
    });
}

function renderSheet(
    view: SourceDetailsView,
    transport: SourceDetailsTransport = new SourceDetailsTransport(),
): SourceDetailsTransport {
    renderWithApi(
        <SourceDetailsSheet
            projectId="project-1"
            videoId="video-1"
            view={view}
            onClose={() => undefined}
        />,
        { transport, queryClient: client() },
    );
    return transport;
}

function renderSources(
    transport: SourceDetailsTransport = new SourceDetailsTransport(),
): SourceDetailsTransport {
    renderWithApi(
        <VideoConcatSources
            projectId="project-1"
            videoId="video-1"
            method="mkvmerge"
            config={{ chapters: null, metadata: null, extra_inputs: [] }}
            locked={false}
            onChange={() => undefined}
        />,
        { transport, queryClient: client() },
    );
    return transport;
}

it("lists chapters and switches to metadata without a second source read", async () => {
    const transport = renderSheet("chapters");

    expect(await screen.findByText("Opening")).toBeTruthy();
    expect(screen.getByText("Chapter 2")).toBeTruthy();
    expect(screen.getByText("0:00 – 0:12")).toBeTruthy();
    expect(screen.getByText("0:12 – 1:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));

    expect(await screen.findByText("libebml v1.4.5")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Metadata" }).getAttribute("aria-selected")).toBe(
        "true",
    );
    expect(transport.reads).toBe(1);
});

it("opens chapters from the Chapters card and shares one read with metadata", async () => {
    const transport = renderSources();

    fireEvent.click(screen.getByRole("button", { name: "View chapters" }));
    expect(await screen.findByText("Opening")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Metadata" }));
    expect(await screen.findByText("libebml v1.4.5")).toBeTruthy();
    expect(transport.reads).toBe(1);
});

it("opens on the metadata tab from the Metadata card", async () => {
    const transport = renderSources();

    fireEvent.click(screen.getByRole("button", { name: "View metadata" }));

    expect(await screen.findByText("libebml v1.4.5")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Metadata" }).getAttribute("aria-selected")).toBe(
        "true",
    );
    expect(transport.reads).toBe(1);
});

it("shows the probe's reason when the source has no chapters", async () => {
    renderSheet(
        "chapters",
        new SourceDetailsTransport({
            chapters: [],
            metadata: [],
            chapters_detail: "This file reports no chapters.",
            metadata_detail: "",
        }),
    );

    expect(await screen.findByText("This file reports no chapters.")).toBeTruthy();
});

it("surfaces a source-details failure as an alert", async () => {
    renderSheet(
        "chapters",
        new SourceDetailsTransport(SOURCE_INFO, new Error("FFmpeg is unavailable.")),
    );

    expect((await screen.findByRole("alert")).textContent).toBe("FFmpeg is unavailable.");
});
