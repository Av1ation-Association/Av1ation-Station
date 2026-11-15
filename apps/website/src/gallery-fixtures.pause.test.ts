import { EncodeEventSchema, type EncodeEvent } from "@av1ation/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GalleryDemoTransport, seedGallery } from "./gallery-fixtures";

describe("GalleryDemoTransport pause", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("stops emitting while paused and resumes at the next step", () => {
        const transport = new GalleryDemoTransport();
        seedGallery(transport, "populated");
        transport.prepareSimulation();

        const events: EncodeEvent[] = [];
        const stop = transport.subscribe("/api/events", EncodeEventSchema, (event) => {
            events.push(event);
        });

        const first = events[0];
        expect(first).toBeDefined();
        if (first === undefined) {
            throw new Error("the simulation did not emit its first step");
        }

        transport.pauseSimulation();
        const pausedAt = events.length;
        vi.advanceTimersByTime(120_000);
        expect(events).toHaveLength(pausedAt);

        transport.resumeSimulation();
        vi.advanceTimersByTime(700);
        expect(events).toHaveLength(pausedAt + 1);
        expect(events[pausedAt]?.run_id).toBe(first.run_id);
        expect(events[pausedAt]?.seq).toBe(first.seq + 1);

        stop();
    });
});
