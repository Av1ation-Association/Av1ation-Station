// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { LogRecord } from "@av1ation/contracts";

import { LogRow } from "./LogRow";

function record(message: string): LogRecord {
    return {
        at: "2026-11-12T10:00:08Z",
        level: "error",
        message,
        project_id: "docs-aurora",
        run_id: "docs-run",
        scope: "run",
        seq: 4,
        sequence: "ParallelEncoder",
        video_id: "docs-video",
    };
}

describe("LogRow", () => {
    it("marks every case-insensitive occurrence of the search needle", () => {
        const view = render(<LogRow record={record("Fail, fail, FAIL.")} search="fail" />);

        const marks = [...view.container.querySelectorAll("mark")];
        expect(marks.map((mark) => mark.textContent)).toEqual(["Fail", "fail", "FAIL"]);
        expect(view.container.textContent).toContain("Fail, fail, FAIL.");
    });

    it("leaves the message plain when there is no needle or no match", () => {
        const view = render(<LogRow record={record("SVT-AV1 exited with status 1.")} />);
        expect(view.container.querySelectorAll("mark")).toHaveLength(0);

        view.rerender(<LogRow record={record("SVT-AV1 exited with status 1.")} search="zzz" />);
        expect(view.container.querySelectorAll("mark")).toHaveLength(0);
        expect(view.container.textContent).toContain("SVT-AV1 exited with status 1.");
    });
});
