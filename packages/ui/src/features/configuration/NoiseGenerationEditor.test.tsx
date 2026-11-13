// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { MockTransport } from "@av1ation/api";

import type { DocumentScope } from "../../shared/model/project-sections";
import { renderWithApi } from "../../test/render";
import { NoiseGenerationEditor } from "./NoiseGenerationEditor";

afterEach(cleanup);

const PARTS = {
    detector: { root: {}, node: {} },
    scaler: { root: {}, node: {} },
};

const DETECTOR = {
    input: {
        Video: {
            path: "C:/media/clip.mkv",
            filters: [],
            import_method: { FFMS2: { cache_path: null, index: null } },
        },
    },
    reference_filters: [],
    denoised_filters: [],
};

function renderEditor(scope: DocumentScope) {
    renderWithApi(
        <NoiseGenerationEditor
            parts={PARTS}
            draft={{ noise_detector: DETECTOR, noise_scaler: null }}
            setDraft={() => undefined}
            locked={false}
            scope={scope}
        />,
        { transport: new MockTransport() },
    );
}

it("names the source on a video's detector override", () => {
    renderEditor("video");

    // A video override describes one file, so the shared editor shows the fields that name it.
    expect((screen.getByLabelText("Input path") as HTMLInputElement).value).toBe(
        "C:/media/clip.mkv",
    );
    expect(screen.getByLabelText("FFMS2 index file")).toBeTruthy();
});

it("leaves the source out of a project template, which applies to every video", () => {
    renderEditor("project");

    expect(screen.queryByLabelText("Input path")).toBeNull();
    expect(screen.queryByLabelText("FFMS2 index file")).toBeNull();
});

it("calls Settings → Project Defaults a template, not a project", () => {
    renderEditor("template");

    expect(screen.getByRole("radio", { name: /^Template input/u })).toBeTruthy();
    expect(screen.queryByLabelText("Input path")).toBeNull();
});
