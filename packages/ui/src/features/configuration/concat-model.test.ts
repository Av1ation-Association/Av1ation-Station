import { expect, it } from "vitest";

import type { ConcatInventory } from "@av1ation/contracts";

import {
    attachmentProblems,
    chaptersFor,
    metadataFor,
    nextAttachmentKey,
    optionCount,
    withChapter,
    withMetadata,
    withTrackIncluded,
    withTrackOptions,
    withExtraPath,
} from "./concat-model";

const INVENTORY: ConcatInventory = {
    method: "mkvmerge",
    tracks: [
        {
            key: 5,
            kind: "audio",
            label: "Audio 1",
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
            label: "Subtitle 1",
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
            size_bytes: 4_312,
            selectable: false,
        },
    ],
    data_stream_count: 0,
    chapter_count: 12,
    detail: "",
};

it("uses the probe's own keys and never offsets mkvmerge IDs", () => {
    const next = withTrackIncluded("mkvmerge", null, INVENTORY, "main", "5", false);

    expect(next).toEqual({
        "0": { type: "video", copy: true },
        "5": { type: "audio", copy: false },
        "9": { type: "subtitle", copy: true },
    });
});

it("returns to include-all when every source row is included again", () => {
    const dropped = withTrackIncluded("mkvmerge", null, INVENTORY, "main", "5", false);
    expect(withTrackIncluded("mkvmerge", dropped, INVENTORY, "main", "5", true)).toBeNull();
});

it("materializes every row before writing one track option", () => {
    const next = withTrackOptions("mkvmerge", null, INVENTORY, "main", "5", {
        language: "jpn",
    });

    expect(next).toEqual({
        "0": { type: "video", copy: true },
        "5": { type: "audio", copy: true, language: "jpn" },
        "9": { type: "subtitle", copy: true },
    });
});

it("counts only explicit option fields, not row state", () => {
    expect(
        optionCount({
            type: "audio",
            copy: true,
            language: "jpn",
            name: null,
            commentary: false,
            delay: undefined,
        }),
    ).toBe(2);
    expect(optionCount({ type: "audio", copy: false })).toBe(0);
});

it("gives an attachment addition a key above every source key", () => {
    expect(
        nextAttachmentKey({ "0": { type: "video" }, "9": { type: "subtitle" } }, INVENTORY),
    ).toBe(10);
});

it("keeps a chapter option while copy is on, and null means copy", () => {
    expect(withChapter(null, { language: "eng" })).toEqual({
        copy: true,
        language: "eng",
        charset: null,
    });
    expect(chaptersFor({ copy: false })).toEqual({
        copy: false,
        language: null,
        charset: null,
    });
    expect(
        withChapter(
            { copy: true, language: "eng", charset: "UTF-8" },
            {
                language: null,
                charset: null,
            },
        ),
    ).toBeNull();
});

it("writes an explicit metadata object only when it differs from copy-all", () => {
    expect(withMetadata(null, { title: "Big Buck Bunny" })).toEqual({
        copy: true,
        title: "Big Buck Bunny",
        tags: {},
    });
    expect(withMetadata({ copy: false, title: null, tags: {} }, { copy: true })).toBeNull();
    expect(metadataFor({ tags: { TITLE: "Buck" } }).tags).toEqual({ TITLE: "Buck" });
});

it("requires a path and an FFmpeg MIME type for an added attachment", () => {
    expect(attachmentProblems("mkvmerge", { path: "  " })).toEqual({
        path: "Choose a file for this attachment.",
        mimeType: null,
    });
    expect(attachmentProblems("mkvmerge", { path: "C:\\art\\cover.jpg" })).toEqual({
        path: null,
        mimeType: null,
    });
    expect(attachmentProblems("ffmpeg", { path: "C:\\art\\cover.jpg" })).toEqual({
        path: null,
        mimeType: "FFmpeg needs a MIME type for an attached file.",
    });
    expect(
        attachmentProblems("ffmpeg", {
            path: "C:\\art\\cover.jpg",
            attachment_mime_type: " image/jpeg ",
        }),
    ).toEqual({ path: null, mimeType: null });
});

it("clears a changed extra path's source-specific choices", () => {
    const next = withExtraPath(
        [
            {
                path: "old.mka",
                tracks: { "1": { type: "audio", copy: false } },
                chapters: { copy: false },
            },
        ],
        0,
        "new.mka",
    );
    expect(next).toEqual([{ path: "new.mka", tracks: null, chapters: null, metadata: null }]);
});
