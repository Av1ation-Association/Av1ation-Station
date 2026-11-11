// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SceneView } from "@av1ation/contracts";

import { sequenceAnalytics, type AnalyticsSource } from "./sequence-analytics";

import { SequenceAnalyticsCard } from "./SequenceAnalyticsCard";

// ECharts paints into a real DOM and owns a render loop; the card's own decisions are the
// metric, view and pass controls above it, so the chart is replaced with a readable stub.
vi.mock("./AnalyticsChart", () => ({
    AnalyticsChart: ({
        data,
    }: {
        data: {
            shape: string;
            y: { title: string };
            series: readonly { key: string; label: string }[];
        };
    }) => (
        <div data-testid="chart" data-shape={data.shape}>
            <span data-testid="chart-title">{data.y.title}</span>
            {data.series.map((series) => (
                <span key={series.key} data-testid={`series-${series.key}`}>
                    {series.label}
                </span>
            ))}
        </div>
    ),
}));

afterEach(cleanup);

function scene(index: number, start: number, end: number, score: number | null): SceneView {
    return {
        index,
        start_frame: start,
        end_frame: end,
        frame_count: end - start,
        encoded: true,
        chunk_bytes: 500_000,
        quality_score: score ?? undefined,
        passes: [
            {
                pass: 1,
                quantizer: 30,
                score: 70,
                score_min: 68,
                score_max: 72,
                frames: 10,
                bitrate: 2,
                duration_ms: 400,
            },
            {
                pass: 2,
                quantizer: 24,
                score: score ?? undefined,
                score_min: 72,
                score_max: 78,
                frames: 10,
                bitrate: 3,
                duration_ms: 600,
            },
        ],
        encoder_label: "SVT-AV1",
        encoder_custom: false,
        custom_data: {},
    };
}

const DOCUMENT = {
    sequences: {
        target_quality: {
            metric: { SSIMULACRA2: { target_range: [74, 76] } },
            maximum_probes: 4,
        },
    },
};

function analytics(): ReturnType<typeof sequenceAnalytics> {
    const source: AnalyticsSource = {
        scenes: [scene(0, 0, 24, 75), scene(1, 24, 48, 68)],
        frameRate: 24,
        width: 1920,
        height: 1080,
        document: DOCUMENT,
        outputExists: false,
    };
    return sequenceAnalytics("target-quality", source);
}

describe("SequenceAnalyticsCard", () => {
    it("starts on the score and draws one series per pass", () => {
        render(<SequenceAnalyticsCard analytics={analytics()} />);

        expect(screen.getByTestId("chart-title").textContent).toBe("SSIMULACRA2 score");
        expect(screen.getByTestId("series-score-p1")).toBeTruthy();
        expect(screen.getByTestId("series-score-p2")).toBeTruthy();
        expect(screen.getByText(/All 2 scenes/)).toBeTruthy();
    });

    it("hides a pass and refuses to hide the last visible one", () => {
        render(<SequenceAnalyticsCard analytics={analytics()} />);
        const chips = within(screen.getByRole("group", { name: "Probe passes" }));

        fireEvent.click(chips.getByRole("button", { name: "P2" }));
        expect(screen.queryByTestId("series-score-p2")).toBeNull();
        expect(screen.getByTestId("series-score-p1")).toBeTruthy();

        // P1 is now the only visible pass, so its chip stays on rather than emptying the chart.
        const last = chips.getByRole("button", { name: "P1" });
        fireEvent.click(last);
        expect(screen.getByTestId("series-score-p1")).toBeTruthy();
        expect(last.getAttribute("aria-disabled")).toBe("true");
    });

    it("opens on the measure that has data and reports that measure's coverage", () => {
        // Noise Detector has run and Noise Scaler has not: the card must land on the noise it
        // measured instead of an empty scale-factor chart, and the chip must follow the tab.
        const source: AnalyticsSource = {
            scenes: [scene(0, 0, 24, 75), scene(1, 24, 48, 68)],
            frameRate: 24,
            width: 1920,
            height: 1080,
            document: {},
            outputExists: false,
        };
        const noise = scene(0, 0, 24, 75);
        noise.noise = 0.0018;
        const second = scene(1, 24, 48, 68);
        second.noise = 0.0031;
        source.scenes = [noise, second];

        render(<SequenceAnalyticsCard analytics={sequenceAnalytics("noise-generation", source)} />);

        expect(screen.getByTestId("chart-title").textContent).toBe("Measured noise");
        expect(screen.getByText(/All 2 scenes/)).toBeTruthy();

        const measures = within(screen.getByRole("group", { name: "Measure" }));
        fireEvent.click(measures.getByRole("button", { name: "Scale factor" }));
        expect(screen.getByText(/0 of 2 scenes/)).toBeTruthy();
    });

    it("keeps a comparable view when the measure changes", () => {
        render(<SequenceAnalyticsCard analytics={analytics()} />);
        const views = within(screen.getByRole("group", { name: "View" }));
        fireEvent.click(views.getByRole("button", { name: "Convergence" }));
        expect(screen.getByText("Mean")).toBeTruthy();

        const measures = within(screen.getByRole("group", { name: "Measure" }));
        fireEvent.click(measures.getByRole("button", { name: "Quantizer" }));
        // Quantizer also has convergence, so the view is kept instead of jumping to per-scene.
        expect(screen.getByTestId("chart-title").textContent).toBe("Quantizer");
        expect(screen.getByText("Median")).toBeTruthy();
    });

    it("sorts the scene table from its headers", () => {
        render(<SequenceAnalyticsCard analytics={analytics()} />);
        const summary = screen.getByText(/Inspect scenes/);
        const details = summary.closest("details");
        if (details === null) {
            throw new Error("the table is not inside a details element");
        }
        details.open = true;

        const table = screen.getByRole("table");
        const scoreHeader = within(table).getByRole("button", { name: /Score/ });
        const firstScene = () => {
            const row = within(table).getAllByRole("row")[1];
            if (row === undefined) {
                throw new Error("the table has no data row");
            }
            return within(row).getAllByRole("cell")[0]?.textContent;
        };

        fireEvent.click(scoreHeader);
        // Ascending: the 68-scoring scene comes first.
        expect(firstScene()).toBe("2");

        fireEvent.click(scoreHeader);
        expect(firstScene()).toBe("1");
    });

    it("explains a section with nothing to measure instead of charting it", () => {
        const source: AnalyticsSource = {
            scenes: [scene(0, 0, 24, 75)],
            frameRate: 24,
            width: 1920,
            height: 1080,
            document: {},
            outputExists: false,
        };
        render(<SequenceAnalyticsCard analytics={sequenceAnalytics("not-a-sequence", source)} />);

        expect(screen.getByText(/has no measured data/)).toBeTruthy();
        expect(screen.queryByTestId("chart")).toBeNull();
        expect(screen.queryByRole("table")).toBeNull();
    });
});
