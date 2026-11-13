// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { ZodType } from "zod";

import { MockTransport } from "@av1ation/api";

import { renderWithApi } from "../../test/render";
import { PythonInterpreterGroup } from "./PythonInterpreterGroup";

/**
 * A host that owns the vendored server, which the demo cannot. The row has to name it, so
 * the test supplies the one answer the mock's browser host deliberately cannot.
 */
class BundledServerTransport extends MockTransport {
    override async get<T>(path: string, schema: ZodType<T>): Promise<T> {
        if (path === "/api/editor/language-server") {
            return schema.parse({
                available: true,
                kind: "jedi",
                label: "jedi-language-server 0.47 (bundled)",
                detail: "Completion, hover, and diagnostics come from jedi-language-server.",
            });
        }
        return super.get(path, schema);
    }
}

afterEach(() => {
    cleanup();
    document.body.innerHTML = "";
});

it("picks a located interpreter and can return to the machine's Python", async () => {
    const path = "C:/venvs/encode/Scripts/python.exe";
    renderWithApi(<PythonInterpreterGroup />, {
        transport: new MockTransport({}, { pickExecutable: async () => path }),
    });

    // Locating saves the picked interpreter, so the picker and the inventory agree without
    // a second confirmation.
    const locate = await screen.findByRole("button", { name: /Locate/ });
    await waitFor(() => expect((locate as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(locate);

    await waitFor(() =>
        expect(
            (screen.getByRole("combobox", { name: /Python interpreter/ }) as HTMLSelectElement)
                .value,
        ).toBe(path),
    );

    // The automatic entry is the clear action: it removes the setting and returns the
    // editor to the interpreter the machine resolves.
    fireEvent.change(screen.getByRole("combobox", { name: /Python interpreter/ }), {
        target: { value: "" },
    });

    await waitFor(() =>
        expect(
            (screen.getByRole("combobox", { name: /Python interpreter/ }) as HTMLSelectElement)
                .value,
        ).toBe(""),
    );
});

it("offers the staged bundle as its own interpreter", async () => {
    const bundled = "C:/Program Files/Av1ation Station/tools/python/python.exe";
    class BundledInterpreterTransport extends MockTransport {
        override async get<T>(path: string, schema: ZodType<T>): Promise<T> {
            if (path === "/api/editor/interpreters") {
                return schema.parse({
                    interpreters: [{ path: bundled, version: "3.14.10", source: "bundled" }],
                });
            }
            if (path === "/api/editor/language-server") {
                return schema.parse({
                    available: true,
                    kind: "jedi",
                    label: "jedi-language-server 0.47 (bundled)",
                    interpreter: bundled,
                    interpreter_version: "3.14.10",
                    interpreter_source: "bundled",
                    detail: "Completion, hover, and diagnostics come from jedi-language-server.",
                });
            }
            return super.get(path, schema);
        }
    }

    renderWithApi(<PythonInterpreterGroup />, {
        transport: new BundledInterpreterTransport(),
    });

    // The automatic choice names the bundled runtime and where it came from, so a clean
    // install never reads as a machine Python the user does not have.
    expect(await screen.findByText(/Bundled · Python 3\.14\.10/)).toBeTruthy();
    expect(await screen.findByText(/from the bundled toolchain/)).toBeTruthy();
});

it("names the active completion server beside the interpreter", async () => {
    renderWithApi(<PythonInterpreterGroup />, {
        transport: new BundledServerTransport(),
    });

    // The provider is part of the row, not a page elsewhere: the interpreter and the server
    // analysing it are one decision, and a bundled version has to be visible as such.
    expect(await screen.findByText(/jedi-language-server 0\.47 \(bundled\)/)).toBeTruthy();
});
