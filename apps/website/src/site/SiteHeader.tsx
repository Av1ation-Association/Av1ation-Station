import { LogoMark } from "@av1ation/ui/logo-mark";

import { withBase } from "../base-path";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
    return (
        <header className="site-header">
            <div className="site-header__inner">
                <a
                    className="site-header__brand"
                    href={withBase("/")}
                    aria-label="Av1ation Station — home"
                >
                    <LogoMark className="site-header__mark" />
                    <span>Av1ation Station</span>
                </a>
                <nav className="site-header__nav" aria-label="Site">
                    <a href={withBase("/docs/")}>Docs</a>
                    <a href={withBase("/demo/")}>Demo</a>
                </nav>
                <ThemeToggle />
                <a
                    className="site-button site-button--primary site-header__download"
                    href={withBase("/#downloads")}
                >
                    Download
                </a>
            </div>
        </header>
    );
}
