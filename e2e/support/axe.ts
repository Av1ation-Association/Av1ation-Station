import { expect, type Page } from "@playwright/test";
import axe from "axe-core";

interface AxeWindow {
    axe?: {
        run: (context: Document) => Promise<{
            violations: readonly {
                id: string;
                impact: string | null;
                help: string;
                nodes: readonly { target: readonly string[]; html: string }[];
            }[];
        }>;
    };
}

/**
 * Run axe in the real browser, where layout and computed colour are available.
 *
 * The source is evaluated through Playwright rather than added as a same-origin script, so
 * the application's CSP stays exactly what the product ships. A violation names its rule
 * and node count; callers add the route to make a failure actionable.
 */
export async function expectAxeClean(page: Page, route: string): Promise<void> {
    const loaded = await page.evaluate(() => (window as unknown as AxeWindow).axe !== undefined);
    if (!loaded) {
        await page.evaluate(axe.source);
    }
    const violations = await page.evaluate(async () => {
        const runner = (window as unknown as AxeWindow).axe;
        if (runner === undefined) {
            throw new Error("axe was not injected into the page.");
        }
        const result = await runner.run(document);
        return result.violations.map(
            (violation) =>
                `${violation.id} (${violation.impact ?? "unknown"}): ${violation.help} [${violation.nodes
                    .map((node) => `${node.target.join(" ")} ${node.html}`)
                    .join("; ")}]`,
        );
    });
    expect(violations, `axe violations on ${route}`).toEqual([]);
}
