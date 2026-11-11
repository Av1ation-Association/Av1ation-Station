// @vitest-environment jsdom
import type { ReactElement } from "react";

import type { ParameterDescriptor } from "@av1ation/contracts";
import { ApiProvider, HttpTransport, MockTransport } from "@av1ation/api";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { ParameterControl } from "./parameter-control";

afterEach(cleanup);

function renderControl(element: ReactElement) {
    return render(
        <ApiProvider
            transport={new MockTransport({}, { pickFile: async () => "C:/config/svt.toml" })}
        >
            {element}
        </ApiProvider>,
    );
}

function choice(
    values: string[],
    widget: ParameterDescriptor["widget"] = "Auto",
): ParameterDescriptor {
    return {
        delimiter: "Space",
        label: "Assembly",
        description: null,
        doc_link: null,
        kind: {
            Choice: {
                options: values.map((value) => ({
                    value,
                    label: value,
                    description: null,
                    doc_link: null,
                })),
                value_kind: "Text",
                multiple: false,
                min_selected: 1,
                max_selected: 1,
            },
        },
        default: null,
        widget,
        advanced: false,
        group: null,
        relations: [],
    };
}

const stringOption = { String: { prefix: "--", delimiter: " ", value: "c" } };

it("shows a short enumeration as radios and a long one as a dropdown", () => {
    const { unmount } = renderControl(
        <ParameterControl
            descriptor={choice(["c", "mmx", "sse"])}
            parameter={stringOption}
            onChange={() => undefined}
            disabled={false}
        />,
    );
    expect(screen.getByRole("radiogroup", { name: "Assembly" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    unmount();

    renderControl(
        <ParameterControl
            descriptor={choice(["c", "mmx", "sse", "sse2", "avx2"])}
            parameter={stringOption}
            onChange={() => undefined}
            disabled={false}
        />,
    );
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByRole("combobox", { name: "Assembly" })).toBeTruthy();
});

it("honours a presentation the descriptor names", () => {
    const { unmount } = renderControl(
        <ParameterControl
            descriptor={choice(["c", "mmx", "sse"], {
                ChoiceInput: { presentation: "Dropdown" },
            })}
            parameter={stringOption}
            onChange={() => undefined}
            disabled={false}
        />,
    );
    expect(screen.getByRole("combobox", { name: "Assembly" })).toBeTruthy();
    unmount();

    // Segmented draws the same values as radios, even when there are more than four.
    renderControl(
        <ParameterControl
            descriptor={choice(["c", "mmx", "sse", "sse2", "avx2"], {
                ChoiceInput: { presentation: "Segmented" },
            })}
            parameter={stringOption}
            onChange={() => undefined}
            disabled={false}
        />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(5);
});

function pathDescriptor(): ParameterDescriptor {
    return {
        delimiter: "Space",
        label: "Config file",
        description: null,
        doc_link: null,
        kind: { Path: { directory: false, accept: ["toml", "json"] } },
        default: null,
        widget: "Auto",
        advanced: false,
        group: null,
        relations: [],
    };
}

function textDescriptor(label: string, format: "Email" | "Url" | "DateTime"): ParameterDescriptor {
    return {
        delimiter: "Space",
        label,
        description: null,
        doc_link: null,
        kind: { Text: { max_len: null, pattern: null, multiline: false, format } },
        default: null,
        widget: "Auto",
        advanced: false,
        group: null,
        relations: [],
    };
}

it("browses a path from inside its text field", async () => {
    let picked = "";
    renderControl(
        <ParameterControl
            descriptor={pathDescriptor()}
            parameter={{ String: { prefix: "--", delimiter: " ", value: "" } }}
            onChange={(next) => {
                picked = String(next);
            }}
            disabled={false}
        />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Browse for Config file" }));
    await waitFor(() => expect(picked).toBe("C:/config/svt.toml"));
    expect(screen.getByRole("textbox", { name: "Config file" })).toBeTruthy();
});

it("explains an invalid validated text value", () => {
    renderControl(
        <ParameterControl
            descriptor={textDescriptor("Contact", "Email")}
            parameter={{ String: { prefix: "--", delimiter: " ", value: "nope" } }}
            onChange={() => undefined}
            disabled={false}
        />,
    );

    expect(screen.getByRole("alert").textContent).toContain("email address");
});

function numberedChoice(): ParameterDescriptor {
    return {
        delimiter: "Space",
        label: "Colour format",
        description: null,
        doc_link: null,
        kind: {
            Choice: {
                options: [
                    {
                        value: 0,
                        label: "4:0:0",
                        description: "Luma only, for monochrome sources",
                        doc_link: null,
                    },
                    {
                        value: 1,
                        label: "4:2:0",
                        description: "Default broadcast sampling",
                        doc_link: null,
                    },
                    {
                        value: 2,
                        label: "4:2:2",
                        description: "Mezzanine sampling",
                        doc_link: null,
                    },
                ],
                value_kind: "Number",
                multiple: false,
                min_selected: 1,
                max_selected: 1,
            },
        },
        default: 1,
        widget: "Auto",
        advanced: false,
        group: null,
        relations: [],
    };
}

it("shows a numbered choice's labels and sends its number", () => {
    const picked: Array<string | number | boolean> = [];
    renderControl(
        <ParameterControl
            descriptor={numberedChoice()}
            parameter={{ String: { prefix: "--", delimiter: " ", value: "1" } }}
            onChange={(next) => picked.push(next)}
            disabled={false}
        />,
    );

    expect(screen.getByRole("radiogroup", { name: "Colour format" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "4:2:0" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("Default broadcast sampling")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "4:2:2" }).getAttribute("title")).toBe(
        "Mezzanine sampling",
    );

    fireEvent.click(screen.getByRole("radio", { name: "4:2:2" }));
    expect(picked).toEqual([2]);
});

it("keeps a typeable path field where the host has no picker", () => {
    render(
        <ApiProvider transport={new HttpTransport("http://127.0.0.1:1")}>
            <ParameterControl
                descriptor={pathDescriptor()}
                parameter={{ String: { prefix: "--", delimiter: " ", value: "" } }}
                onChange={() => undefined}
                disabled={false}
            />
        </ApiProvider>,
    );

    expect(screen.queryByRole("button", { name: "Browse for Config file" })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Config file" })).toBeTruthy();
});

it("commits the value a radio picks", () => {
    const picked: string[] = [];
    renderControl(
        <ParameterControl
            descriptor={choice(["c", "mmx"])}
            parameter={stringOption}
            onChange={(next) => picked.push(String(next))}
            disabled={false}
        />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "mmx" }));
    expect(picked).toEqual(["mmx"]);
});

function zeroOrOneDescriptor(min: number, max: number): ParameterDescriptor {
    return {
        delimiter: "Space",
        label: "Quantisation matrices",
        description: null,
        doc_link: null,
        kind: { Number: { integer: true, min, max, step: null, unit: null } },
        default: 1,
        widget: "Auto",
        advanced: false,
        group: null,
        relations: [],
    };
}

it("renders a 0/1 number as a switch and writes the literal", () => {
    const picked: Array<string | number | boolean> = [];
    renderControl(
        <ParameterControl
            descriptor={zeroOrOneDescriptor(0, 1)}
            parameter={{ Number: { prefix: "--", delimiter: " ", value: 0 } }}
            onChange={(next) => picked.push(next)}
            disabled={false}
        />,
    );

    const toggle = screen.getByRole("switch", { name: "Quantisation matrices" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(picked).toEqual([1]);
});

it("keeps a wider numeric range out of a switch", () => {
    // SVT-AV1's `--enable-tf` also takes 2 and 3; turning it into a switch would make the
    // adaptive values unreachable.
    renderControl(
        <ParameterControl
            descriptor={zeroOrOneDescriptor(0, 3)}
            parameter={{ Number: { prefix: "--", delimiter: " ", value: 1 } }}
            onChange={() => undefined}
            disabled={false}
        />,
    );

    expect(screen.queryByRole("switch")).toBeNull();
});

it("shows a numeric parameter's unit beside the field and names it in the field", () => {
    const picked: Array<string | number | boolean> = [];
    renderControl(
        <ParameterControl
            descriptor={{
                delimiter: "Space",
                label: "Keyframes",
                description: null,
                doc_link: null,
                kind: {
                    Number: {
                        integer: true,
                        min: 1,
                        max: 500,
                        step: null,
                        unit: "frames",
                    },
                },
                default: null,
                widget: "DurationInput",
                advanced: false,
                group: null,
                relations: [],
            }}
            parameter={{ Number: { prefix: "--", delimiter: " ", value: 12 } }}
            onChange={(next) => picked.push(next)}
            disabled={false}
        />,
    );

    // The unit is the value's meaning; a field that shows `12` for both `--frames` and a
    // second count would read as the same parameter.
    expect(screen.getByText("frames")).toBeTruthy();
    const field = screen.getByRole("textbox", { name: "Keyframes (frames)" });
    expect((field as HTMLInputElement).value).toBe("12");

    fireEvent.change(field, { target: { value: "48" } });
    expect(picked).toEqual([48]);
});
