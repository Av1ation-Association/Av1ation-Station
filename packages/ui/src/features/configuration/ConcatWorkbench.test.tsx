// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ChaptersPanel, MetadataPanel } from "./ConcatWorkbench";

afterEach(cleanup);

it("offers the chapter view when the count is unknown, but not when it is zero", () => {
    const onView = vi.fn();
    const { rerender } = render(
        <ChaptersPanel
            method="mkvmerge"
            value={null}
            chapterCount={null}
            locked={false}
            onChange={() => undefined}
            onViewChapters={onView}
        />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View chapters" }));
    expect(onView).toHaveBeenCalledTimes(1);

    rerender(
        <ChaptersPanel
            method="mkvmerge"
            value={null}
            chapterCount={0}
            locked={false}
            onChange={() => undefined}
            onViewChapters={onView}
        />,
    );
    expect(screen.queryByRole("button", { name: "View chapters" })).toBeNull();
});

it("offers the metadata view from the Metadata card", () => {
    const onView = vi.fn();
    render(
        <MetadataPanel
            method="mkvmerge"
            value={null}
            locked={false}
            onChange={() => undefined}
            onViewMetadata={onView}
        />,
    );

    fireEvent.click(screen.getByRole("button", { name: "View metadata" }));
    expect(onView).toHaveBeenCalledTimes(1);
});
