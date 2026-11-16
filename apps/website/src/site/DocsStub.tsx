import { withBase } from "../base-path";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

const DOCS_URL = "https://github.com/Av1ation-Association/Av1ation-Station/tree/main/docs";
const README_URL = "https://github.com/Av1ation-Association/Av1ation-Station/blob/main/README.md";

export function DocsStub() {
    return (
        <div className="site site--docs">
            <a className="skip-link" href="#site-main">
                Skip to content
            </a>
            <SiteHeader />
            <main id="site-main" className="docs-stub">
                <p className="docs-stub__kicker">Documentation</p>
                <h1>Documentation is being rebuilt.</h1>
                <p className="docs-stub__lede">
                    The site is being rebuilt around the real application. Until the new guides
                    land, the repository documentation and the live demo are the authoritative
                    references.
                </p>
                <div className="docs-stub__links">
                    <a className="site-button site-button--primary" href={DOCS_URL}>
                        Read the repository docs
                    </a>
                    <a
                        className="site-button site-button--secondary"
                        href={withBase(
                            "/demo/?gallery=populated#/projects/demo-project/videos/demo-video",
                        )}
                    >
                        Open the demo
                    </a>
                    <a className="site-text-link" href={README_URL}>
                        Read the README
                    </a>
                </div>
                <p className="docs-stub__note">
                    The homepage has the download links and the current platform support.
                </p>
                <p>
                    <a className="site-text-link" href={withBase("/#downloads")}>
                        Go to downloads
                    </a>
                </p>
            </main>
            <SiteFooter />
        </div>
    );
}
