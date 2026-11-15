import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";

import type { Transport } from "@av1ation/api";

import type { GalleryDemoTransport } from "../../gallery-fixtures";
import { galleryMediaUrl } from "../../gallery-media";
import { DEMO_URL } from "../demoUrl";
import { useEmbeddedDemoActive } from "../useEmbeddedDemoActive";
import { useMediaQuery } from "../useMediaQuery";
import { useNearViewport } from "../useNearViewport";
import { MobileDemoTour } from "./MobileDemoTour";

interface LoadedDemo {
    readonly Demo: ComponentType<{
        transport: Transport;
        onNavigate?: () => void;
        paused?: boolean;
    }>;
    readonly transport: GalleryDemoTransport;
}

export function VideoSection() {
    const { ref, near } = useNearViewport<HTMLElement>();
    const viewportRef = useRef<HTMLDivElement>(null);
    const active = useEmbeddedDemoActive(viewportRef);
    const mobile = useMediaQuery("(max-width: 900px)");
    const [loaded, setLoaded] = useState<LoadedDemo | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleNavigate = useCallback(() => {
        viewportRef.current?.scrollTo({ top: 0, left: 0 });
    }, []);

    useEffect(() => {
        if (loaded === null) {
            return;
        }
        if (active && !mobile) {
            loaded.transport.resumeSimulation();
        } else {
            loaded.transport.pauseSimulation();
        }
    }, [active, loaded, mobile]);

    useEffect(() => {
        if (mobile || !near || loaded !== null || error !== null) {
            return;
        }
        let cancelled = false;
        void Promise.all([import("@av1ation/ui/video-demo"), import("../../gallery-fixtures")])
            .then(([demo, fixtures]) => {
                if (cancelled) {
                    return;
                }
                const transport = new fixtures.GalleryDemoTransport({
                    mediaUrl: galleryMediaUrl,
                });
                fixtures.seedGallery(transport, "populated");
                transport.prepareSimulation();
                setLoaded({ Demo: demo.VideoDemo, transport });
            })
            .catch((cause: unknown) => {
                if (!cancelled) {
                    setError(cause instanceof Error ? cause.message : "The screen could not load.");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [mobile, near, loaded, error]);

    return (
        <section
            ref={ref}
            id="app"
            className="site-section site-section--app"
            aria-labelledby="app-title"
        >
            <div className="site-section__inner">
                <header className="section-head">
                    <div>
                        <h2 id="app-title">
                            {mobile
                                ? "The actual app, screen by screen."
                                : "The actual Video → Configuration screen."}
                        </h2>
                        <p>
                            {mobile
                                ? "The live demo needs a desktop-sized window. On a phone, step through three captures from the same sample project: configure the run, inspect the detected scenes, then review the finished history."
                                : "Not a mockup. This is the application's own screen, mounted with a sample project and a live simulated encode. Watch each sequence run, then switch tabs to inspect the scenes, history, and logs."}
                        </p>
                    </div>
                    <p className="section-head__aside">
                        {mobile
                            ? "Captured from the real app at 1280 × 720. Nothing reads or encodes a file."
                            : "Everything here runs on sample data. Nothing reads or encodes a file."}
                    </p>
                </header>

                {mobile ? (
                    <MobileDemoTour />
                ) : (
                    <div className="app-frame">
                        <div className="app-frame__bar">
                            <span className="app-frame__title">Video</span>
                            <span className="app-frame__sample">Sample data</span>
                            <a className="app-frame__link" href={DEMO_URL}>
                                Open full demo
                            </a>
                        </div>
                        <div
                            ref={viewportRef}
                            className="app-frame__viewport"
                            aria-busy={loaded === null}
                        >
                            {loaded === null ? (
                                <div className="app-skeleton" aria-label="Loading the video screen">
                                    <span className="app-skeleton__tabs" />
                                    <span className="app-skeleton__card" />
                                    <span className="app-skeleton__card" />
                                    <span className="app-skeleton__card" />
                                </div>
                            ) : (
                                <loaded.Demo
                                    transport={loaded.transport}
                                    paused={!active}
                                    onNavigate={handleNavigate}
                                />
                            )}
                            {error === null ? null : (
                                <div className="app-frame__error" role="alert">
                                    <p>The live screen could not load here.</p>
                                    <p>{error}</p>
                                    <a className="site-button site-button--primary" href={DEMO_URL}>
                                        Open the demo instead
                                    </a>
                                </div>
                            )}
                        </div>
                    </div>
                )}
                <p className="section-caption">
                    {mobile
                        ? "These crops come from the same sample project as the screenshot gallery. The full demo opens the real application with the sample run already loaded."
                        : "The sample run works through all six sequences and loops, with 14 scenes and 2,160 frames. The clip is a generated Conway's Game of Life animation at 24 fps; its project, paths, and measurements are fixtures, and nothing reads or encodes a file."}
                </p>
            </div>
        </section>
    );
}
