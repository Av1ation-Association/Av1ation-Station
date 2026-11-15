import { useEffect, useState, type ComponentType } from "react";

import type { SequenceAnalytics } from "@av1ation/ui/sequence-analytics";

import { useNearViewport } from "../useNearViewport";

interface LoadedQuality {
    readonly Card: ComponentType<{ analytics: SequenceAnalytics }>;
    readonly analytics: SequenceAnalytics;
}

export function QualitySection() {
    const { ref, near } = useNearViewport<HTMLElement>();
    const [loaded, setLoaded] = useState<LoadedQuality | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!near || loaded !== null || error !== null) {
            return;
        }
        let cancelled = false;
        void Promise.all([
            import("@av1ation/ui/sequence-analytics"),
            import("@av1ation/ui/sequence-analytics-card"),
            import("../../gallery-fixtures"),
        ])
            .then(([analyticsModule, cardModule, fixtures]) => {
                if (cancelled) {
                    return;
                }
                const analytics = analyticsModule.sequenceAnalytics("quality-check", {
                    scenes: fixtures.GALLERY_SCENES,
                    frameRate: 24,
                    width: 1280,
                    height: 720,
                    document: fixtures.GALLERY_VIDEO_EFFECTIVE,
                    outputExists: true,
                });
                setLoaded({ Card: cardModule.SequenceAnalyticsCard, analytics });
            })
            .catch((cause: unknown) => {
                if (!cancelled) {
                    setError(cause instanceof Error ? cause.message : "The chart could not load.");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [near, loaded, error]);

    return (
        <section
            ref={ref}
            id="quality"
            className="site-section site-section--quality"
            aria-labelledby="quality-title"
        >
            <div className="site-section__inner">
                <header className="section-head">
                    <div>
                        <h2 id="quality-title">Quality is measured, not assumed.</h2>
                        <p>
                            Quality Check scores the finished output against the source. The card
                            below is the application&apos;s own Measured data card, using the
                            captured 14-scene run.
                        </p>
                    </div>
                    <p className="section-head__aside">
                        Switch between CVVDP score, bitrate, and efficiency. Hover or tap to inspect
                        a scene; the statistics below the chart are the real summary.
                    </p>
                </header>

                <div className="quality-frame">
                    {loaded === null ? (
                        <div className="quality-skeleton" aria-busy="true">
                            <span />
                            <span />
                            <span />
                        </div>
                    ) : (
                        <loaded.Card analytics={loaded.analytics} />
                    )}
                    {error === null ? null : (
                        <p className="quality-frame__error" role="alert">
                            The measured data card could not load: {error}
                        </p>
                    )}
                </div>
                <p className="section-caption">
                    CVVDP scores, per-scene bitrate, and the statistics strip come from the captured
                    run. The chart is the real component, not a screenshot.
                </p>
            </div>
        </section>
    );
}
