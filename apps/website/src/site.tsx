import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ApiProvider, MockTransport } from "@av1ation/api";
import "@av1ation/ui/styles.css";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";

import { DocsApp } from "./site/docs/DocsApp";
import { Home } from "./site/Home";
import { NotFound } from "./site/NotFound";
import "./site/site.css";

/** Strip a trailing slash and an emitted `index.html` so one route table serves dev and build. */
function currentPath(): string {
    const path = window.location.pathname.replace(/\/index\.html$/u, "/").replace(/\/+$/u, "");
    return path === "" ? "/" : path;
}

const path = currentPath();
const transport = new MockTransport({ mediaUrl: () => "" });

function Site() {
    if (path === "/") {
        return <Home />;
    }
    if (path === "/docs" || path.startsWith("/docs/")) {
        return <DocsApp initialPath={path} />;
    }
    return <NotFound />;
}

const container = document.getElementById("root");
if (container === null) {
    throw new Error("The site document is missing #root.");
}

createRoot(container).render(
    <StrictMode>
        <ApiProvider transport={transport}>
            <Site />
        </ApiProvider>
    </StrictMode>,
);
