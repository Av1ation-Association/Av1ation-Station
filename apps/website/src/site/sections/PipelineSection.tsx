const STAGES = [
    {
        name: "Scene detection",
        body: "Find where each scene starts and ends for accurate analysis.",
    },
    {
        name: "Noise generation",
        body: "Measure the source grain and recreate an approximate film-grain layer.",
    },
    {
        name: "Target quality",
        body: "Ensure each scene gets the right treatment for overall consistent results.",
    },
    {
        name: "Parallel encoding",
        body: "Encode the sequences concurrently to maximize speed.",
    },
    {
        name: "Concatenation",
        body: "Join the encoded scenes into the output file. Choose which tracks are copied.",
    },
    {
        name: "Quality check",
        body: "Score the finished output against the source to find what worked and what didn't.",
    },
] as const;

export function PipelineSection() {
    return (
        <section
            id="pipeline"
            className="site-section site-section--pipeline"
            aria-labelledby="pipeline-title"
        >
            <div className="site-section__inner">
                <header className="section-head">
                    <div>
                        <h2 id="pipeline-title">One video, six stages.</h2>
                        <p>
                            Configuration is a pipeline, not a single form. Each card owns its
                            settings, its derived status, and the data its stage produced.
                        </p>
                    </div>
                    <p className="section-head__aside">
                        Optional stages can be absent from a run; the app says so instead of drawing
                        an empty chart.
                    </p>
                </header>

                <ol className="pipeline">
                    {STAGES.map((stage, index) => (
                        <li className="pipeline__stage" key={stage.name}>
                            <span className="pipeline__number" aria-hidden="true">
                                {String(index + 1).padStart(2, "0")}
                            </span>
                            <h3>{stage.name}</h3>
                            <p>{stage.body}</p>
                        </li>
                    ))}
                </ol>
            </div>
        </section>
    );
}
