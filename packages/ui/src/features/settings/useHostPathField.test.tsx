// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useHostPathField, type HostPathFieldOptions } from "./useHostPathField";

function options(
    overrides: Partial<HostPathFieldOptions<string>> = {},
): HostPathFieldOptions<string> {
    return {
        stored: "C:/stored.exe",
        pick: vi.fn(async (): Promise<string | null> => "C:/picked.exe"),
        save: vi.fn(async () => "saved"),
        empty: "clear",
        describeSaveFailure: (error) => (error instanceof Error ? error.message : "Save failed."),
        ...overrides,
    };
}

describe("useHostPathField", () => {
    it("starts from the stored value and follows it", () => {
        const { result, rerender } = renderHook(
            (props: HostPathFieldOptions<string>) => useHostPathField(props),
            { initialProps: options() },
        );

        expect(result.current.path).toBe("C:/stored.exe");

        rerender({ ...options(), stored: "C:/moved.exe" });

        expect(result.current.path).toBe("C:/moved.exe");
    });

    it("keeps a typed draft when there is no stored value to follow", () => {
        const withoutStored = options();
        delete withoutStored.stored;
        const { result } = renderHook(() => useHostPathField(withoutStored));

        act(() => {
            result.current.edit("C:/typed.exe");
        });

        expect(result.current.path).toBe("C:/typed.exe");
        expect(result.current.result).toBeNull();
    });

    it("does not discard a typed draft on an unchanged stored refetch", () => {
        const initial = options();
        const { result, rerender } = renderHook(
            (props: HostPathFieldOptions<string>) => useHostPathField(props),
            { initialProps: initial },
        );

        act(() => {
            result.current.edit("C:/typed.exe");
        });
        rerender({ ...initial, stored: "C:/stored.exe" });

        expect(result.current.path).toBe("C:/typed.exe");
    });

    it("trims the draft before saving and keeps it when the save fails", async () => {
        const save = vi.fn(async () => {
            throw new Error("The path is not absolute.");
        });
        const { result } = renderHook(() =>
            useHostPathField(
                options({
                    save,
                    describeSaveFailure: (error) =>
                        error instanceof Error ? `Rejected: ${error.message}` : "Rejected.",
                }),
            ),
        );

        act(() => {
            result.current.edit("  C:/typed.exe  ");
        });
        act(() => {
            result.current.submit();
        });

        await waitFor(() =>
            expect(result.current.saveError).toBe("Rejected: The path is not absolute."),
        );
        expect(save).toHaveBeenCalledWith("C:/typed.exe");
        expect(result.current.path).toBe("  C:/typed.exe  ");
        expect(result.current.result).toBeNull();
        expect(result.current.pending).toBe(false);
    });

    it("clears an empty draft through the same save operation", async () => {
        const save = vi.fn(async () => "saved");
        const { result } = renderHook(() => useHostPathField(options({ save })));

        act(() => {
            result.current.submit("");
        });

        await waitFor(() => expect(save).toHaveBeenCalledWith(null));
        await waitFor(() => expect(result.current.result).toBe("saved"));
    });

    it("rejects an empty draft without saving", () => {
        const save = vi.fn(async () => "saved");
        const { result } = renderHook(() =>
            useHostPathField(options({ save, empty: { reject: "Choose the executable first." } })),
        );

        act(() => {
            result.current.submit("   ");
        });

        expect(save).not.toHaveBeenCalled();
        expect(result.current.fieldError).toBe("Choose the executable first.");
        expect(result.current.pending).toBe(false);
    });

    it("applies an explicit candidate without changing the draft", async () => {
        const save = vi.fn(async () => "saved");
        const { result } = renderHook(() => useHostPathField(options({ save })));

        act(() => {
            result.current.submit(" C:/selected.exe ");
        });

        await waitFor(() => expect(save).toHaveBeenCalledWith("C:/selected.exe"));
        expect(result.current.path).toBe("C:/stored.exe");
    });

    it("clears both failures and the last result when the draft changes", async () => {
        const save = vi
            .fn(async () => "saved")
            .mockRejectedValueOnce(new Error("first failure"))
            .mockResolvedValueOnce("saved");
        const { result } = renderHook(() =>
            useHostPathField(
                options({
                    save,
                    describeSaveFailure: (error) =>
                        error instanceof Error ? error.message : "Save failed.",
                }),
            ),
        );

        act(() => {
            result.current.submit();
        });
        await waitFor(() => expect(result.current.saveError).toBe("first failure"));

        act(() => {
            result.current.edit("C:/next.exe");
        });
        expect(result.current.saveError).toBeNull();
        expect(result.current.fieldError).toBeNull();
        expect(result.current.result).toBeNull();

        act(() => {
            result.current.submit();
        });
        await waitFor(() => expect(result.current.result).toBe("saved"));
    });

    it("ignores a second submit and a locate while a save is pending", async () => {
        let resolveSave: (value: string) => void = () => {};
        const save = vi.fn(
            () =>
                new Promise<string>((resolve) => {
                    resolveSave = resolve;
                }),
        );
        const pick = vi.fn(async (): Promise<string | null> => "C:/picked.exe");
        const { result } = renderHook(() => useHostPathField(options({ save, pick })));

        act(() => {
            result.current.submit();
        });
        expect(result.current.pending).toBe(true);

        act(() => {
            result.current.submit();
            result.current.locate("");
        });
        expect(save).toHaveBeenCalledOnce();
        expect(pick).not.toHaveBeenCalled();

        await act(async () => {
            resolveSave("saved");
        });
        await waitFor(() => expect(result.current.pending).toBe(false));
    });

    it("passes the trimmed start path to the picker, applies the choice, and saves it", async () => {
        const pick = vi.fn(async (): Promise<string | null> => "C:/picked.exe");
        const save = vi.fn(async () => "saved");
        const { result } = renderHook(() => useHostPathField(options({ pick, save })));

        act(() => {
            result.current.locate("  C:/start.exe  ");
        });

        await waitFor(() => expect(pick).toHaveBeenCalledWith("C:/start.exe"));
        await waitFor(() => expect(save).toHaveBeenCalledWith("C:/picked.exe"));
        await waitFor(() => expect(result.current.path).toBe("C:/picked.exe"));
    });

    it("omits an empty start path so the picker keeps its own default", async () => {
        const pick = vi.fn(async (): Promise<string | null> => null);
        const { result } = renderHook(() => useHostPathField(options({ pick })));

        act(() => {
            result.current.locate("   ");
        });

        await waitFor(() => expect(pick).toHaveBeenCalledWith(undefined));
    });

    it("leaves the draft untouched when the picker is cancelled", async () => {
        const pick = vi.fn(async (): Promise<string | null> => null);
        const save = vi.fn(async () => "saved");
        const { result } = renderHook(() => useHostPathField(options({ pick, save })));

        act(() => {
            result.current.locate("C:/start.exe");
        });

        await waitFor(() => expect(pick).toHaveBeenCalled());
        expect(result.current.path).toBe("C:/stored.exe");
        expect(save).not.toHaveBeenCalled();
    });

    it("reports a picker that rejects and keeps the draft", async () => {
        const pick = vi.fn(async (): Promise<string | null> => {
            throw new Error("The dialog is already open.");
        });
        const save = vi.fn(async () => "saved");
        const { result } = renderHook(() => useHostPathField(options({ pick, save })));

        act(() => {
            result.current.locate("");
        });

        await waitFor(() =>
            expect(result.current.fieldError).toBe(
                "The file picker could not open: The dialog is already open.",
            ),
        );
        expect(result.current.path).toBe("C:/stored.exe");
        expect(save).not.toHaveBeenCalled();
    });

    it("uses the typing fallback when the picker fails without an error message", async () => {
        const pick = vi.fn(async (): Promise<string | null> => {
            throw "denied";
        });
        const { result } = renderHook(() => useHostPathField(options({ pick })));

        act(() => {
            result.current.locate("");
        });

        await waitFor(() =>
            expect(result.current.fieldError).toBe(
                "The file picker could not open. Type the path instead.",
            ),
        );
    });

    it("does nothing on a host with no picker", () => {
        const save = vi.fn(async () => "saved");
        const { result } = renderHook(() => useHostPathField(options({ pick: null, save })));

        expect(result.current.canPick).toBe(false);
        act(() => {
            result.current.locate("C:/start.exe");
        });

        expect(result.current.path).toBe("C:/stored.exe");
        expect(result.current.fieldError).toBeNull();
        expect(save).not.toHaveBeenCalled();
    });
});
