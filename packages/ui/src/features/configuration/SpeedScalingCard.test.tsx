// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";

import { SpeedScalingCard } from "./SpeedScalingCard";

afterEach(cleanup);

function Harness({ initial, disabled = false }: { initial: unknown; disabled?: boolean }) {
    const [value, setValue] = useState<unknown>(initial);
    return (
        <SpeedScalingCard
            value={value}
            onChange={(next) =>
                setValue(next === null ? null : next.map((point) => [point.speed, point.quantizer]))
            }
            disabled={disabled}
            maxQuantizer={63}
        />
    );
}

it("enables and disables speed scaling with the shared switch", () => {
    render(<Harness initial={null} />);

    const toggle = screen.getByRole("switch", { name: "Speed scaling" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Every scene runs at the encoder/iu)).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("img", { name: /Encoder speed by quantizer/iu })).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Every scene runs at the encoder/iu)).toBeTruthy();
});

it("disables the speed-scaling switch while the sequence is locked", () => {
    render(<Harness initial={null} disabled />);

    const toggle = screen.getByRole("switch", { name: "Speed scaling" });
    expect(toggle.hasAttribute("disabled")).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText(/Every scene runs at the encoder/iu)).toBeTruthy();
});
