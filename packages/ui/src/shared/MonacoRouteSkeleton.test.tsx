// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { lazy, Suspense, type ReactElement } from "react";
import { expect, it } from "vitest";

import { MonacoRouteSkeleton } from "./MonacoRouteSkeleton";

it("shows the sized skeleton until a delayed editor module resolves", async () => {
    let resolveEditor!: (module: { default: () => ReactElement }) => void;
    const pending = new Promise<{ default: () => ReactElement }>((resolve) => {
        resolveEditor = resolve;
    });
    const LazyEditor = lazy(() => pending);

    render(
        <Suspense fallback={<MonacoRouteSkeleton side />}>
            <LazyEditor />
        </Suspense>,
    );

    expect(screen.getByRole("status").textContent).toBe("Loading the editor…");
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();

    resolveEditor({ default: () => <p>Editor ready</p> });

    expect(await screen.findByText("Editor ready")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
});
