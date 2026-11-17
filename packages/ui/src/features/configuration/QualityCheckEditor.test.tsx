// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";

import { MockTransport } from "@av1ation/api";

import { renderWithApi } from "../../test/render";
import { QualityCheckEditor } from "./QualityCheckEditor";

afterEach(cleanup);

const NO_SCHEMA = { root: {}, node: {} };

function Harness({
    initial,
    locked = false,
}: {
    initial: Record<string, unknown>;
    locked?: boolean;
}) {
    const [draft, setDraft] = useState<Record<string, unknown> | null>(initial);
    if (draft === null) {
        return null;
    }
    return (
        <QualityCheckEditor
            parts={{ check: NO_SCHEMA }}
            draft={draft}
            setDraft={setDraft}
            locked={locked}
            scope="project"
            encodingFilter={false}
        />
    );
}

function renderCheck(initial: Record<string, unknown>, locked = false) {
    renderWithApi(<Harness initial={initial} locked={locked} />, {
        transport: new MockTransport(),
    });
}

it("enables and disables quality check with the shared switch", () => {
    renderCheck({ quality_check: null });

    const check = screen.getByRole("switch", { name: "Quality check" });
    expect(check.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Quality check is off/u)).toBeTruthy();

    fireEvent.click(check);
    expect(check.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByText(/Quality check is off/u)).toBeNull();
    expect(screen.getByText(/A metric is available/u)).toBeTruthy();

    fireEvent.click(check);
    expect(check.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Quality check is off/u)).toBeTruthy();
});

it("disables the quality-check switch while the sequence is locked", () => {
    renderCheck({ quality_check: null }, true);

    const check = screen.getByRole("switch", { name: "Quality check" });
    expect(check.hasAttribute("disabled")).toBe(true);

    fireEvent.click(check);
    expect(check.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Quality check is off/u)).toBeTruthy();
});
