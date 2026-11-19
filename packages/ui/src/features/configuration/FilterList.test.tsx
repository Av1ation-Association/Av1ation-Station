// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { FilterList } from "./FilterList";

afterEach(cleanup);

const FILTERS = [{ Resize: { width: 1920, height: 1080 } }, { OutputFormat: { bit_depth: 10 } }];

class Transfer {
    #data = new Map<string, string>();
    effectAllowed = "none";
    dropEffect = "none";

    setData(type: string, value: string) {
        this.#data.set(type, value);
    }

    getData(type: string) {
        return this.#data.get(type) ?? "";
    }
}

function setup(disabled = false) {
    const onChange = vi.fn();
    render(
        <FilterList
            label="Filters"
            filters={FILTERS}
            schema={undefined}
            target="vapour_synth"
            disabled={disabled}
            emptyText="No filters"
            onChange={onChange}
        />,
    );
    return { onChange, handles: screen.getAllByRole("button", { name: /Reorder/u }) };
}

it("reorders a filter when its handle is dragged onto another row", () => {
    const { onChange, handles } = setup();
    const transfer = new Transfer();

    fireEvent.dragStart(handles[0]!, { dataTransfer: transfer });
    const rows = screen.getAllByRole("listitem");
    fireEvent.dragOver(rows[1]!, { dataTransfer: transfer });
    fireEvent.drop(rows[1]!, { dataTransfer: transfer });

    expect(onChange).toHaveBeenCalledWith([FILTERS[1], FILTERS[0]]);
});

it("reorders with the arrow keys while the handle is focused", () => {
    const { onChange, handles } = setup();

    fireEvent.keyDown(handles[0]!, { key: "ArrowDown" });

    expect(onChange).toHaveBeenCalledWith([FILTERS[1], FILTERS[0]]);
});

it("does not start or accept a drag on a locked document", () => {
    const { onChange, handles } = setup(true);
    const transfer = new Transfer();

    fireEvent.dragStart(handles[0]!, { dataTransfer: transfer });
    const rows = screen.getAllByRole("listitem");
    fireEvent.dragOver(rows[1]!, { dataTransfer: transfer });
    fireEvent.drop(rows[1]!, { dataTransfer: transfer });

    expect(onChange).not.toHaveBeenCalled();
});
