import { useState } from "react";

import { DEMO_URL } from "../demoUrl";
import { useSiteTheme } from "../useSiteTheme";

interface TourStep {
    readonly id: "configure" | "scenes" | "history";
    readonly label: string;
    readonly title: string;
    readonly caption: string;
    readonly alt: string;
}

const STEPS: readonly TourStep[] = [
    {
        id: "configure",
        label: "Configuration",
        title: "Configure the run",
        caption:
            "Every sequence in order, with its inherited settings and overrides still visible. This crop shows Scene detection and Encoding: the detector's completed pass, then SVT-AV1 with eight workers, six parameters, and a completed parallel encoder.",
        alt: "The Scene detection and Encoding cards on the real Video Configuration screen, showing a completed detector, SVT-AV1, eight workers, six parameters, and a completed parallel encoder.",
    },
    {
        id: "scenes",
        label: "Scenes",
        title: "Inspect every shot",
        caption:
            "Scene detection split the video into 14 shots across 2,160 frames. Each row keeps its own frame range and duration, and any scene can take a separate encoder.",
        alt: "Five scene rows from the real Scenes screen with their frame ranges and durations, beside the Details panel showing that no scene is selected.",
    },
    {
        id: "history",
        label: "History",
        title: "Review what happened",
        caption:
            "A finished run records every stage with its duration, frame count, and outcome. Scene detection, parallel encoding, concatenation, and the quality check all report here.",
        alt: "The real History screen with a completed run listing SceneDetector, ParallelEncoder, SceneConcatenator, and QualityCheck.",
    },
];

export function MobileDemoTour() {
    const [index, setIndex] = useState(0);
    const theme = useSiteTheme();
    const step = STEPS[index] ?? STEPS[0];

    if (step === undefined) {
        return null;
    }

    const previous = () => setIndex((current) => Math.max(0, current - 1));
    const next = () => setIndex((current) => Math.min(STEPS.length - 1, current + 1));

    return (
        <div className="mobile-tour">
            <div className="mobile-tour__stage">
                <img
                    className="mobile-tour__image"
                    src={`/demo-tour/${step.id}-${theme}.avif`}
                    width={400}
                    height={300}
                    alt={step.alt}
                    decoding="async"
                />
            </div>
            <div className="mobile-tour__body" aria-live="polite" aria-atomic="true">
                <p className="mobile-tour__progress">
                    Step {index + 1} of {STEPS.length} · {step.label}
                </p>
                <h3>{step.title}</h3>
                <p className="mobile-tour__caption">{step.caption}</p>
            </div>
            <div className="mobile-tour__actions">
                <a className="site-button site-button--primary" href={DEMO_URL}>
                    Open full demo <span aria-hidden="true">→</span>
                </a>
            </div>
            <div className="mobile-tour__nav" role="group" aria-label="Preview steps">
                <button
                    className="mobile-tour__control"
                    type="button"
                    onClick={previous}
                    disabled={index === 0}
                    aria-label="Previous step"
                >
                    <span aria-hidden="true">←</span> Previous
                </button>
                <span className="mobile-tour__position" aria-hidden="true">
                    {index + 1} / {STEPS.length}
                </span>
                <button
                    className="mobile-tour__control"
                    type="button"
                    onClick={next}
                    disabled={index === STEPS.length - 1}
                    aria-label="Next step"
                >
                    Next <span aria-hidden="true">→</span>
                </button>
            </div>
        </div>
    );
}
