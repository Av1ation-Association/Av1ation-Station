// @vitest-environment jsdom
import { useState } from "react";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import type { ConcatInventory } from "@av1ation/contracts";

import { useDraftBlockers } from "../../shared/draft-blockers";
import type { JsonSchema } from "../../shared/schema/config-schema";
import { TrackMapPanel, trackOptionFields } from "./TrackMapEditor";

afterEach(cleanup);

const INVENTORY: ConcatInventory = {
    method: "mkvmerge",
    tracks: [
        {
            key: 5,
            kind: "audio",
            label: "English 5.1",
            codec: "AAC",
            language: "eng",
            name: null,
            channels: 6,
            default: true,
            forced: false,
        },
        {
            key: 9,
            kind: "subtitle",
            label: "English subtitles",
            codec: "SRT",
            language: "eng",
            name: null,
            channels: null,
            default: false,
            forced: false,
        },
    ],
    attachments: [
        {
            key: 2,
            label: "cover.jpg",
            mime_type: "image/jpeg",
            description: null,
            size_bytes: 4_096,
            selectable: false,
        },
    ],
    data_stream_count: 0,
    chapter_count: 12,
    detail: "",
};

it("uses the source's own keys in the map and counts every input stream", () => {
    const onChange = vi.fn();
    render(
        <TrackMapPanel
            method="mkvmerge"
            scope="main"
            tracks={null}
            inventory={INVENTORY}
            onChange={onChange}
            onProbe={() => undefined}
        />,
    );

    expect(screen.getByText("Video · encoded")).toBeTruthy();
    expect(screen.getByText("Always")).toBeTruthy();
    expect(screen.getByText("4 included · 4 total")).toBeTruthy();
});

it("drops the clicked subtitle by its mkvmerge ID, not its row position", () => {
    const onChange = vi.fn();
    render(
        <TrackMapPanel
            method="mkvmerge"
            scope="main"
            tracks={null}
            inventory={INVENTORY}
            onChange={onChange}
            onProbe={() => undefined}
        />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Subtitles/u }));
    fireEvent.click(screen.getByRole("switch", { name: "Include English subtitles" }));

    expect(onChange).toHaveBeenCalledWith({
        "0": { type: "video", copy: true },
        "5": { type: "audio", copy: true },
        "9": { type: "subtitle", copy: false },
    });
});

it("keeps mkvmerge source attachments read-only and labels the copy-all state", () => {
    render(
        <TrackMapPanel
            method="mkvmerge"
            scope="main"
            tracks={null}
            inventory={INVENTORY}
            onChange={() => undefined}
            onProbe={() => undefined}
        />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Attachments/u }));

    expect(screen.getByText("cover.jpg")).toBeTruthy();
    expect(screen.getByText("Copy all")).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Include cover.jpg" })).toBeNull();
});

it("shows a saved key the probe did not report instead of silently rewriting it", () => {
    render(
        <TrackMapPanel
            method="mkvmerge"
            scope="main"
            tracks={{
                "0": { type: "video", copy: true },
                "5": { type: "audio", copy: false },
                "99": { type: "audio", copy: true },
            }}
            inventory={INVENTORY}
            onChange={() => undefined}
            onProbe={() => undefined}
        />,
    );

    expect(screen.getByText(/Saved keys the probe did not report: 99/u)).toBeTruthy();
});

function BlockerProbe() {
    return <p data-testid="draft-blockers">{useDraftBlockers().join(" ")}</p>;
}

function AttachmentHarness({
    onChange,
    pickFile,
    method = "mkvmerge",
}: {
    onChange: (next: Record<string, unknown> | null) => void;
    pickFile?: (() => Promise<string | null>) | undefined;
    method?: "mkvmerge" | "ffmpeg";
}) {
    const [tracks, setTracks] = useState<Record<string, unknown> | null>(null);
    return (
        <TrackMapPanel
            method={method}
            scope="main"
            tracks={tracks}
            inventory={{ ...INVENTORY, method }}
            pickFile={pickFile}
            onChange={(next) => {
                onChange(next);
                setTracks(next);
            }}
            onProbe={() => undefined}
        />
    );
}

const OPTION_ROOT: JsonSchema = {
    $defs: {
        MkvmergeTrack: {
            oneOf: [
                {
                    type: "object",
                    properties: {
                        type: { const: "audio" },
                        copy: { type: "boolean" },
                        name: { type: "string" },
                    },
                },
            ],
        },
    },
};

it("prefers the container's track title over the generated type-and-ordinal label", () => {
    const named: ConcatInventory = {
        ...INVENTORY,
        tracks: INVENTORY.tracks.map((track) =>
            track.key === 5 ? { ...track, name: "Main audio" } : track,
        ),
    };
    render(
        <TrackMapPanel
            method="mkvmerge"
            scope="main"
            tracks={null}
            inventory={named}
            optionRoot={OPTION_ROOT}
            onChange={() => undefined}
            onProbe={() => undefined}
        />,
    );

    expect(screen.getByText("Main audio")).toBeTruthy();
    expect(screen.queryByText("English 5.1")).toBeNull();
    expect(screen.getByRole("switch", { name: "Include Main audio" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Options for Main audio" })).toBeTruthy();
});

it("stages one track's options in a sheet and applies them on demand", () => {
    const onChange = vi.fn();
    render(
        <TrackMapPanel
            method="mkvmerge"
            scope="main"
            tracks={null}
            inventory={INVENTORY}
            optionRoot={OPTION_ROOT}
            onChange={onChange}
            onProbe={() => undefined}
        />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Options for English 5.1" }));
    expect(screen.getByRole("dialog", { name: "English 5.1 options" })).toBeTruthy();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Surround" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onChange).toHaveBeenCalledWith({
        "0": { type: "video", copy: true },
        "5": { type: "audio", copy: true, name: "Surround" },
        "9": { type: "subtitle", copy: true },
    });
});

it("discards a track's staged options when the sheet is cancelled", () => {
    const onChange = vi.fn();
    render(
        <TrackMapPanel
            method="mkvmerge"
            scope="main"
            tracks={null}
            inventory={INVENTORY}
            optionRoot={OPTION_ROOT}
            onChange={onChange}
            onProbe={() => undefined}
        />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Options for English 5.1" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Surround" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onChange).not.toHaveBeenCalled();
});

it("marks a row that carries explicit non-default options", () => {
    render(
        <TrackMapPanel
            method="mkvmerge"
            scope="main"
            tracks={{ "5": { type: "audio", copy: true, language: "jpn" } }}
            inventory={INVENTORY}
            onChange={() => undefined}
            onProbe={() => undefined}
        />,
    );

    expect(screen.getByLabelText("1 option set")).toBeTruthy();
});

it("edits file, name, MIME type, and description on an added attachment", () => {
    const onChange = vi.fn();
    render(<AttachmentHarness onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /Attachments/u }));
    fireEvent.click(screen.getByRole("button", { name: "Add attachment" }));
    fireEvent.change(screen.getByLabelText("Added attachment 10 path"), {
        target: { value: "C:\\art\\cover.jpg" },
    });
    fireEvent.change(screen.getByLabelText("Added attachment 10 name"), {
        target: { value: "cover.jpg" },
    });
    fireEvent.change(screen.getByLabelText("Added attachment 10 MIME type"), {
        target: { value: "image/jpeg" },
    });
    fireEvent.change(screen.getByLabelText("Added attachment 10 description"), {
        target: { value: "Front cover" },
    });

    expect(onChange).toHaveBeenLastCalledWith({
        "0": { type: "video", copy: true },
        "5": { type: "audio", copy: true },
        "9": { type: "subtitle", copy: true },
        "10": {
            type: "attachment",
            copy: true,
            path: "C:\\art\\cover.jpg",
            attachment_name: "cover.jpg",
            attachment_mime_type: "image/jpeg",
            attachment_description: "Front cover",
        },
    });
});

it("requires a file path before an added attachment can be saved", () => {
    render(
        <>
            <AttachmentHarness onChange={() => undefined} />
            <BlockerProbe />
        </>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Attachments/u }));
    fireEvent.click(screen.getByRole("button", { name: "Add attachment" }));

    expect(screen.getByText("Choose a file for this attachment.")).toBeTruthy();
    expect(screen.getByTestId("draft-blockers").textContent).toContain("has no file path");

    fireEvent.change(screen.getByLabelText("Added attachment 10 path"), {
        target: { value: "C:\\art\\cover.jpg" },
    });

    expect(screen.queryByText("Choose a file for this attachment.")).toBeNull();
    expect(screen.getByTestId("draft-blockers").textContent).not.toContain("has no file path");
});

it("requires a MIME type for an FFmpeg added attachment", () => {
    render(
        <>
            <AttachmentHarness method="ffmpeg" onChange={() => undefined} />
            <BlockerProbe />
        </>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Attachments/u }));
    fireEvent.click(screen.getByRole("button", { name: "Add attachment" }));
    fireEvent.change(screen.getByLabelText("Added attachment 10 path"), {
        target: { value: "C:\\art\\cover.jpg" },
    });

    expect(screen.getByText("FFmpeg needs a MIME type for an attached file.")).toBeTruthy();
    expect(screen.getByTestId("draft-blockers").textContent).toContain("needs a MIME type");

    fireEvent.change(screen.getByLabelText("Added attachment 10 MIME type"), {
        target: { value: "image/jpeg" },
    });

    expect(screen.queryByText("FFmpeg needs a MIME type for an attached file.")).toBeNull();
    expect(screen.getByTestId("draft-blockers").textContent).not.toContain("needs a MIME type");
});

it("fills an added attachment's file from the host picker", async () => {
    const onChange = vi.fn();
    const pickFile = vi.fn().mockResolvedValue("C:\\art\\cover.jpg");
    render(<AttachmentHarness onChange={onChange} pickFile={pickFile} />);

    fireEvent.click(screen.getByRole("button", { name: /Attachments/u }));
    fireEvent.click(screen.getByRole("button", { name: "Add attachment" }));
    fireEvent.click(screen.getByRole("button", { name: /Browse/u }));

    await waitFor(() =>
        expect(onChange).toHaveBeenLastCalledWith(
            expect.objectContaining({
                "10": expect.objectContaining({ path: "C:\\art\\cover.jpg" }),
            }),
        ),
    );
    expect(pickFile).toHaveBeenCalledTimes(1);
});

it("reports a failed attachment picker and keeps the path field", async () => {
    const pickFile = vi.fn().mockRejectedValue(new Error("The dialog is unavailable."));
    render(<AttachmentHarness onChange={() => undefined} pickFile={pickFile} />);

    fireEvent.click(screen.getByRole("button", { name: /Attachments/u }));
    fireEvent.click(screen.getByRole("button", { name: "Add attachment" }));
    fireEvent.click(screen.getByRole("button", { name: /Browse/u }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("The dialog is unavailable.");
    expect(screen.getByLabelText("Added attachment 10 path")).toBeTruthy();
});

it("takes its option fields from the generated track variant", () => {
    const root: JsonSchema = {
        $defs: {
            MkvmergeTrack: {
                oneOf: [
                    {
                        type: "object",
                        properties: {
                            type: { const: "audio" },
                            copy: { type: "boolean" },
                            language: { type: "string" },
                            name: { type: "string" },
                        },
                    },
                ],
            },
        },
    };

    expect(trackOptionFields(root, "mkvmerge", "audio")?.properties).toEqual({
        language: { type: "string" },
        name: { type: "string" },
    });
    expect(trackOptionFields(root, "mkvmerge", "subtitle")).toBeNull();
});
