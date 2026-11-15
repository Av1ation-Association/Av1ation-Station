import { BrandLockup } from "./BrandLockup";

const REPOSITORY_URL = "https://github.com/Av1ation-Association/Av1ation-Station";

export function Hero() {
    return (
        <section className="hero" aria-labelledby="hero-title">
            <div className="hero__inner">
                <BrandLockup />
                <div className="hero__grid">
                    <div className="hero__copy">
                        <h1 id="hero-title" className="hero__title">
                            The command center for fast, high quality encoding.
                        </h1>
                        <p className="hero__deck">
                            A desktop workspace built on Av1an. Detect scenes, set the quality
                            target, and encode as fast as possible. No surprises... get data and
                            visual feedback live.
                        </p>
                    </div>
                    <div className="hero__actions">
                        <a className="site-button site-button--primary" href="#downloads">
                            Download
                        </a>
                        <a
                            className="site-button site-button--secondary"
                            href={REPOSITORY_URL}
                            target="_blank"
                            rel="noreferrer"
                        >
                            Free and Open-Source
                        </a>
                        <a className="site-button site-button--secondary" href="/docs/">
                            Documentation
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
}
