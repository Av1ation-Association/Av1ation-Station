// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { Button } from "./Button";

it("translates a title into the application tooltip", () => {
    render(<Button title="Save this document">Save</Button>);

    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("data-tip")).toBe("Save this document");
    expect(button.hasAttribute("title")).toBe(false);
});

it("keeps a hinted disabled button hit-testable so the reason can open", () => {
    render(
        <Button disabled title="Fix the document before exporting it">
            Export
        </Button>,
    );

    const button = screen.getByRole("button", { name: "Export" });
    expect(button.getAttribute("data-tip")).toBe("Fix the document before exporting it");
    expect(button.className).toContain("disabled:pointer-events-auto");
    expect(button.className).not.toContain("disabled:pointer-events-none");
});

it("leaves an unhinted disabled button out of row hit-testing", () => {
    render(<Button disabled>Export</Button>);

    const button = screen.getByRole("button", { name: "Export" });
    expect(button.className).toContain("disabled:pointer-events-none");
});
