// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import type { DocumentScope } from "../../shared/model/project-sections";
import { ConcatenationEditor } from "./SectionEditor";

afterEach(cleanup);

const DRAFT = { scene_concatenator: { method: "mkvmerge" } };

function renderEditor(scope: DocumentScope) {
    render(
        <ConcatenationEditor
            draft={DRAFT}
            setDraft={() => undefined}
            locked={false}
            scope={scope}
        />,
    );
}

it("describes the project default as applying to every video", () => {
    renderEditor("project");

    expect(screen.getByText(/Default for every video/u)).toBeTruthy();
    expect(screen.getByText(/belong to\s+each video/u)).toBeTruthy();
});

it("describes the project template as the default for every video", () => {
    renderEditor("template");

    expect(screen.getByText(/Default for every video/u)).toBeTruthy();
    expect(screen.queryByText(/The method this video uses/u)).toBeNull();
});

it("describes a video's own method without claiming to set the default", () => {
    renderEditor("video");

    expect(screen.getByText(/The method this video uses/u)).toBeTruthy();
    expect(screen.getByText(/come from this video's encoded chunks/u)).toBeTruthy();
    expect(screen.queryByText(/Default for every video/u)).toBeNull();
});
