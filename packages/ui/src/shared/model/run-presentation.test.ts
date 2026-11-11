import { describe, expect, it } from "vitest";

import { elapsedSeconds, fromContractOutcome, runOutcome, runWhen } from "./run-presentation";

describe("fromContractOutcome", () => {
    it("maps the contract's unknown to an unrecorded run", () => {
        expect(fromContractOutcome("unknown")).toBe("unrecorded");
        expect(fromContractOutcome("running")).toBe("running");
        expect(fromContractOutcome("completed")).toBe("completed");
        expect(fromContractOutcome("cancelled")).toBe("cancelled");
        expect(fromContractOutcome("failed")).toBe("failed");
    });
});

describe("runOutcome", () => {
    it("has no chip when no outcome was recorded", () => {
        expect(runOutcome("unrecorded")).toEqual({ recorded: false });
    });

    it("names every recorded outcome and its tone", () => {
        expect(runOutcome("running")).toEqual({
            recorded: true,
            label: "Running",
            tone: "info",
        });
        expect(runOutcome("completed")).toEqual({
            recorded: true,
            label: "Completed",
            tone: "success",
        });
        expect(runOutcome("cancelled")).toEqual({
            recorded: true,
            label: "Cancelled",
            tone: "warning",
        });
        expect(runOutcome("failed")).toEqual({
            recorded: true,
            label: "Failed",
            tone: "danger",
        });
        expect(runOutcome("unrecognized")).toEqual({
            recorded: true,
            label: "Unknown",
            tone: "neutral",
        });
    });
});

describe("runWhen", () => {
    it("returns the value when it cannot be parsed", () => {
        expect(runWhen("not-a-date")).toBe("not-a-date");
    });
});

describe("elapsedSeconds", () => {
    it("returns the seconds between two instants", () => {
        expect(elapsedSeconds("2026-11-02T10:00:00.000Z", "2026-11-02T10:01:00.000Z")).toBe(60);
    });

    it("has no duration for a missing, reversed, or invalid range", () => {
        expect(elapsedSeconds("2026-11-02T10:00:00.000Z", null)).toBeNull();
        expect(elapsedSeconds("2026-11-02T10:00:00.000Z", undefined)).toBeNull();
        expect(elapsedSeconds("2026-11-02T10:00:00.000Z", "2026-11-02T09:59:00.000Z")).toBeNull();
        expect(elapsedSeconds("not-a-date", "2026-11-02T10:00:00.000Z")).toBeNull();
    });
});
