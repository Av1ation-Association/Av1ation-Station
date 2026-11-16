import { withBase } from "../base-path";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

export function NotFound() {
    return (
        <div className="site site--docs">
            <a className="skip-link" href="#site-main">
                Skip to content
            </a>
            <SiteHeader />
            <main id="site-main" className="docs-stub">
                <p className="docs-stub__kicker">404</p>
                <h1>This page is not here.</h1>
                <p className="docs-stub__lede">
                    The address may be stale, or the page may arrive in a later pass. The homepage
                    and the demo are both available.
                </p>
                <p>
                    <a className="site-button site-button--primary" href={withBase("/")}>
                        Back to the homepage
                    </a>
                </p>
            </main>
            <SiteFooter />
        </div>
    );
}
