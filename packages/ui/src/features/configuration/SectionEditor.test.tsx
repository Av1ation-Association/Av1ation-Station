// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";

import type { SectionDefinition } from "../../shared/model/section-definitions";
import { SectionParts } from "./SectionEditor";

afterEach(cleanup);

const NODE = {
    type: "object",
    properties: { threshold: { type: "number", title: "Threshold" } },
    required: ["threshold"],
};

const DEFINITION: SectionDefinition = {
    id: "concatenation",
    title: "Optional sample",
    description: "A sample section with one optional stage.",
    note: "The switch owns the stage's on/off state.",
    outputs: [],
    parts: [
        {
            key: "optional_stage",
            title: "Optional stage",
            description: "A stage that can be skipped.",
            optional: true,
        },
    ],
};

const RESOLVED = {
    root: {},
    parts: [{ root: {}, node: NODE }],
};

function Harness({ locked = false }: { locked?: boolean }) {
    const [draft, setDraft] = useState<Record<string, unknown> | null>({
        optional_stage: null,
    });
    if (draft === null) {
        return null;
    }
    return (
        <SectionParts
            definition={DEFINITION}
            resolved={RESOLVED}
            draft={draft}
            setDraft={setDraft}
            locked={locked}
        />
    );
}

it("enables and disables an optional stage with the shared switch", () => {
    render(<Harness />);

    const toggle = screen.getByRole("switch", { name: "Optional stage" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("Threshold")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Threshold")).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("Threshold")).toBeNull();
});

it("disables the optional stage switch while the section is locked", () => {
    render(<Harness locked />);

    const toggle = screen.getByRole("switch", { name: "Optional stage" });
    expect(toggle.hasAttribute("disabled")).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("Threshold")).toBeNull();
});
