import { expect, test, type CDPSession, type Locator, type Page } from "@playwright/test";

const CHART_NAME = /quality score per scene/iu;
const DOCS_PATH = "/docs/concepts/quality";

type TouchEventType = "touchStart" | "touchMove" | "touchEnd" | "touchCancel";
type TouchPoint = { id: number; x: number; y: number };

const CHART_ERROR_SOURCE = /analytics|echarts|zrender|datazoom|sequence-analytics/iu;

/**
 * A clean checkout has no generated captures, so the docs page logs 404s for its images.
 * Those are unrelated to this regression; an uncaught page error or an error raised from the
 * chart stack is not.
 */
function trackErrors(page: Page): string[] {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(`Uncaught: ${error.message}`));
    page.on("console", (message) => {
        if (message.type() !== "error") {
            return;
        }
        const location = message.location().url;
        if (CHART_ERROR_SOURCE.test(message.text()) || CHART_ERROR_SOURCE.test(location)) {
            errors.push(`${message.text()} (${location})`);
        }
    });
    return errors;
}

async function labels(chart: Locator): Promise<string> {
    return JSON.stringify(await chart.locator("text").allTextContents());
}

/** The widget is lazy and ECharts paints after its host mounts. */
async function chartOnPage(page: Page): Promise<Locator> {
    const chart = page.getByRole("img", { name: CHART_NAME });
    await expect(chart).toBeVisible();
    await expect.poll(() => chart.locator("text").count()).toBeGreaterThan(0);
    await chart.scrollIntoViewIfNeeded();
    return chart;
}

async function openChart(page: Page): Promise<{ chart: Locator; before: string }> {
    await page.goto(DOCS_PATH);
    const chart = await chartOnPage(page);
    return { chart, before: await labels(chart) };
}

/** Poll the rendered SVG labels; ECharts redraws them after it accepts the gesture. */
async function expectChange(chart: Locator, before: string): Promise<void> {
    await expect.poll(() => labels(chart), { timeout: 4000 }).not.toBe(before);
}

async function centre(page: Page, chart: Locator): Promise<void> {
    const box = await chart.boundingBox();
    if (box === null) {
        throw new Error("The chart has no rendered box.");
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
}

async function pinch(
    chart: Locator,
    cdp: CDPSession,
    direction: "in" | "out",
): Promise<(type: TouchEventType, touchPoints: TouchPoint[]) => Promise<unknown>> {
    const box = await chart.boundingBox();
    if (box === null) {
        throw new Error("The chart has no rendered box.");
    }
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const from = direction === "in" ? 80 : 180;
    const to = direction === "in" ? 180 : 80;
    const send = (type: TouchEventType, touchPoints: TouchPoint[]) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    await send("touchStart", [
        { id: 0, x: cx - from, y: cy },
        { id: 1, x: cx + from, y: cy },
    ]);
    for (let step = 1; step <= 5; step += 1) {
        const distance = from + ((to - from) * step) / 5;
        await send("touchMove", [
            { id: 0, x: cx - distance, y: cy },
            { id: 1, x: cx + distance, y: cy },
        ]);
    }
    // The browser has to keep the synthetic touch context for the caller's end/cancel.
    return send;
}

test.describe("quality chart gestures", () => {
    test("wheel zooms the chart", async ({ page }) => {
        const errors = trackErrors(page);
        const { chart, before } = await openChart(page);
        await centre(page, chart);
        await page.mouse.wheel(0, -500);
        await expectChange(chart, before);
        expect(errors).toEqual([]);
    });

    test("Ctrl-wheel zooms the chart", async ({ page }) => {
        const errors = trackErrors(page);
        const { chart, before } = await openChart(page);
        await centre(page, chart);
        await page.keyboard.down("Control");
        await page.mouse.wheel(0, -500);
        await page.keyboard.up("Control");
        await expectChange(chart, before);
        expect(errors).toEqual([]);
    });

    test("reload resets the chart", async ({ page }) => {
        const errors = trackErrors(page);
        const { chart, before } = await openChart(page);
        await centre(page, chart);
        await page.mouse.wheel(0, -500);
        await expectChange(chart, before);

        await page.reload();
        const resetChart = await chartOnPage(page);
        expect(await labels(resetChart)).toBe(before);
        expect(errors).toEqual([]);
    });

    test.describe("touch", () => {
        test.use({ hasTouch: true });

        test("two-finger pinch zooms the chart", async ({ page }) => {
            const errors = trackErrors(page);
            const { chart, before } = await openChart(page);
            const cdp = await page.context().newCDPSession(page);
            const send = await pinch(chart, cdp, "in");
            await send("touchEnd", []);
            await expectChange(chart, before);
            expect(errors).toEqual([]);
        });

        test("a cancelled touch does not wedge the chart", async ({ page }) => {
            const errors = trackErrors(page);
            const { chart } = await openChart(page);
            const cdp = await page.context().newCDPSession(page);
            const box = await chart.boundingBox();
            if (box === null) {
                throw new Error("The chart has no rendered box.");
            }
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            await cdp.send("Input.dispatchTouchEvent", {
                type: "touchStart",
                touchPoints: [
                    { id: 0, x: cx - 80, y: cy },
                    { id: 1, x: cx + 80, y: cy },
                ],
            });
            await cdp.send("Input.dispatchTouchEvent", {
                type: "touchMove",
                touchPoints: [
                    { id: 0, x: cx - 120, y: cy },
                    { id: 1, x: cx + 120, y: cy },
                ],
            });
            await cdp.send("Input.dispatchTouchEvent", {
                type: "touchCancel",
                touchPoints: [],
            });

            const beforeRecovery = await labels(chart);
            const send = await pinch(chart, cdp, "out");
            await send("touchEnd", []);
            await expectChange(chart, beforeRecovery);
            expect(errors).toEqual([]);
        });
    });
});
