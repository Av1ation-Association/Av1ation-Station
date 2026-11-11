// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SceneValidationMenu } from "./SceneValidationMenu";

beforeAll(() => {
    // Radix menus portal and measure their content; jsdom has neither by default.
    Element.prototype.scrollIntoView = () => undefined;
    vi.stubGlobal(
        "ResizeObserver",
        class {
            observe() {
                return undefined;
            }
            unobserve() {
                return undefined;
            }
            disconnect() {
                return undefined;
            }
        },
    );
    vi.stubGlobal("PointerEvent", class extends MouseEvent {});
});

afterEach(cleanup);

describe("SceneValidationMenu", () => {
    it("counts errors in the badge and jumps to the scene named by an issue", () => {
        const onSelect = vi.fn();
        render(
            <SceneValidationMenu
                issues={[
                    {
                        kind: "overlap",
                        scene: 3,
                        severity: "error",
                        message: "Scene 4 overlaps scene 3 by 8 frames.",
                    },
                    {
                        kind: "gap",
                        scene: 7,
                        severity: "warning",
                        message: "Frames 120–127 are not in any scene.",
                    },
                ]}
                onSelect={onSelect}
            />,
        );

        // A badge, not a banner: the count is on the button and the list is closed.
        const trigger = screen.getByRole("button", {
            name: "1 scene boundary issue",
        });
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(screen.queryByRole("menu")).toBeNull();

        fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
        fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false });
        fireEvent.click(trigger);
        expect(screen.getByRole("menu")).toBeDefined();
        expect(screen.getByText(/1 boundary needs fixing before Start/u)).toBeDefined();

        fireEvent.click(
            screen.getByRole("menuitem", {
                name: /Scene 4 overlaps scene 3 by 8 frames/u,
            }),
        );
        expect(onSelect).toHaveBeenCalledWith(3);
        expect(screen.queryByRole("menu")).toBeNull();
    });

    it("uses the warning tone when nothing blocks Start", () => {
        render(
            <SceneValidationMenu
                issues={[
                    {
                        kind: "gap",
                        scene: 1,
                        severity: "warning",
                        message: "Frames 12–15 are not in any scene.",
                    },
                ]}
                onSelect={vi.fn()}
            />,
        );

        const trigger = screen.getByRole("button", { name: "1 scene boundary warning" });
        fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
        fireEvent.pointerUp(trigger, { button: 0, ctrlKey: false });
        fireEvent.click(trigger);
        expect(screen.getByText("Scene boundaries are usable")).toBeDefined();
        expect(screen.queryByText(/needs fixing/u)).toBeNull();
    });

    it("renders nothing when every boundary is valid", () => {
        const { container } = render(<SceneValidationMenu issues={[]} onSelect={vi.fn()} />);

        expect(container.firstChild).toBeNull();
    });
});
