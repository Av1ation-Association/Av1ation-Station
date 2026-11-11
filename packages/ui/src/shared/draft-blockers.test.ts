// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";

import { setDraftBlocker, useDraftBlockers } from "./draft-blockers";

it("refuses Save while any mounted editor reports a reason", () => {
    const { result, unmount } = renderHook(() => useDraftBlockers());
    expect(result.current).toEqual([]);

    act(() => setDraftBlocker("variables", "Row 2 repeats a key."));
    expect(result.current).toEqual(["Row 2 repeats a key."]);

    // The list belongs to the editor, so clearing or unmounting it re-enables Save.
    act(() => setDraftBlocker("variables", null));
    expect(result.current).toEqual([]);

    act(() => {
        setDraftBlocker("first", "one");
        setDraftBlocker("second", "two");
    });
    expect(result.current).toEqual(["one", "two"]);

    unmount();
    act(() => {
        setDraftBlocker("first", null);
        setDraftBlocker("second", null);
    });
});
