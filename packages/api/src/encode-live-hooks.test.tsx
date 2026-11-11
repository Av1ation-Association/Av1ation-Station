// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { EncodeEvent } from "@av1ation/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { clearLive, recordLive, useProjectEncodeBlockedElsewhere } from "./encode-live";

function started(projectId: string, seq = 1): EncodeEvent {
    return {
        project_id: projectId,
        video_id: "video-1",
        run_id: "run-1",
        seq,
        at: "2026-01-01T00:00:00Z",
        kind: "started",
        sequence: "SceneDetector",
        message: "started",
    };
}

afterEach(clearLive);

describe("useProjectEncodeBlockedElsewhere", () => {
    it("reports only a run that belongs to another project", () => {
        const { result } = renderHook(() => useProjectEncodeBlockedElsewhere("project-one"));
        expect(result.current).toBe(false);

        act(() => recordLive([started("project-one")]));
        expect(result.current).toBe(false);

        act(() => recordLive([started("project-two")]));
        expect(result.current).toBe(true);

        act(() => recordLive([{ ...started("project-two", 2), kind: "finished" }]));
        expect(result.current).toBe(false);
    });
});
