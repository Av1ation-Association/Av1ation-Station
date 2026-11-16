import { LogoMark } from "@av1ation/ui/logo-mark";

import { withBase } from "../base-path";

export function SiteFooter() {
    return (
        <footer className="site-footer">
            <div className="site-footer__inner">
                <div className="site-footer__brand">
                    <LogoMark className="site-footer__mark" />
                    <div>
                        <p className="site-footer__name">Av1ation Station</p>
                        <p className="site-footer__line">
                            A desktop workspace for scene-aware, quality-targeted encoding with
                            Av1an.
                        </p>
                    </div>
                </div>
                <nav className="site-footer__links" aria-label="Footer">
                    <a href="https://github.com/Av1ation-Association/Av1ation-Station">GitHub</a>
                    <a href="https://github.com/Av1ation-Association/Av1ation-Station/releases">
                        Releases
                    </a>
                    <a href={withBase("/docs/")}>Documentation</a>
                    <a href={withBase("/demo/")}>Demo</a>
                    <a href={withBase("/#downloads")}>Download</a>
                </nav>
                <p className="site-footer__legal">
                    GPL-3.0. Pre-release software; installers are unsigned.{" "}
                    <span>Av1ation Station is not affiliated with the Av1an project.</span>
                </p>
            </div>
        </footer>
    );
}
