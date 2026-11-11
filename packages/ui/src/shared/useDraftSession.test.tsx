// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useDraftSession } from "./useDraftSession";

afterEach(cleanup);

interface Draft {
    value: number;
}

interface Snapshot {
    value: number;
}

const FIRST = { value: 1 };
const SECOND = { value: 10 };

function options(snapshot: Snapshot, save: (draft: Draft, server: Snapshot) => Promise<boolean>) {
    return {
        identity: "session",
        label: "Test draft",
        snapshot,
        toDraft: (server: Snapshot): Draft => ({ value: server.value }),
        save,
    };
}

describe("useDraftSession", () => {
    it("adopts a clean snapshot but keeps a dirty draft across a refetch", async () => {
        const save = vi.fn(async () => true);
        const { result, rerender } = renderHook(
            ({ snapshot }: { snapshot: Snapshot }) =>
                useDraftSession<Draft, Snapshot>(options(snapshot, save)),
            { initialProps: { snapshot: FIRST } },
        );

        await waitFor(() => expect(result.current.value).toEqual(FIRST));
        expect(result.current.dirty).toBe(false);

        act(() => result.current.setValue({ value: 2 }));
        rerender({ snapshot: { value: 3 } });

        // The query cache produced a new object, but it must not replace unsaved work.
        expect(result.current.value).toEqual({ value: 2 });
        expect(result.current.dirty).toBe(true);

        act(() => result.current.discard());
        expect(result.current.value).toEqual({ value: 3 });
        expect(result.current.dirty).toBe(false);

        rerender({ snapshot: { value: 4 } });
        await waitFor(() => expect(result.current.value).toEqual({ value: 4 }));
    });

    it("resets both draft and baseline when the document identity changes", async () => {
        const save = vi.fn(async () => true);
        const { result, rerender } = renderHook(
            ({ identity, snapshot }: { identity: string; snapshot: Snapshot }) =>
                useDraftSession<Draft, Snapshot>({
                    ...options(snapshot, save),
                    identity,
                }),
            { initialProps: { identity: "first", snapshot: FIRST } },
        );

        await waitFor(() => expect(result.current.value).toEqual(FIRST));
        act(() => result.current.setValue({ value: 2 }));

        rerender({ identity: "second", snapshot: SECOND });

        expect(result.current.value).toEqual(SECOND);
        expect(result.current.dirty).toBe(false);
        expect(result.current.actions.canUndo).toBe(false);
    });

    it("keeps the draft dirty after a rejected save and rebases it after an accepted one", async () => {
        const save = vi.fn<(draft: Draft, server: Snapshot) => Promise<boolean>>(async () => false);
        const { result, rerender } = renderHook(
            ({ snapshot }: { snapshot: Snapshot }) =>
                useDraftSession<Draft, Snapshot>(options(snapshot, save)),
            { initialProps: { snapshot: FIRST } },
        );

        await waitFor(() => expect(result.current.value).toEqual(FIRST));
        act(() => result.current.setValue({ value: 2 }));

        let accepted = true;
        await act(async () => {
            accepted = await result.current.save();
        });

        expect(accepted).toBe(false);
        expect(save).toHaveBeenCalledWith({ value: 2 }, FIRST);
        expect(result.current.value).toEqual({ value: 2 });
        expect(result.current.dirty).toBe(true);

        save.mockResolvedValue(true);
        await act(async () => {
            accepted = await result.current.save();
        });

        expect(accepted).toBe(true);
        expect(result.current.dirty).toBe(false);

        // The query cache now carries the accepted document; discard is defined against
        // that latest snapshot, so an edit made after the save returns to it.
        rerender({ snapshot: { value: 2 } });
        act(() => result.current.setValue({ value: 3 }));
        act(() => result.current.discard());
        expect(result.current.value).toEqual({ value: 2 });
        expect(result.current.dirty).toBe(false);
    });

    it("lets only the active document answer undo, as the template's two drafts require", async () => {
        function usePair(active: "general" | "section") {
            const general = useDraftSession<Draft, Snapshot>({
                identity: "template/general",
                label: "General defaults",
                snapshot: FIRST,
                toDraft: (server) => ({ value: server.value }),
                save: async () => true,
                active: active === "general",
            });
            const section = useDraftSession<Draft, Snapshot>({
                identity: "template/section",
                label: "Section defaults",
                snapshot: SECOND,
                toDraft: (server) => ({ value: server.value }),
                save: async () => true,
                active: active === "section",
            });
            return { general, section };
        }

        const { result, rerender } = renderHook(
            ({ active }: { active: "general" | "section" }) => usePair(active),
            { initialProps: { active: "general" as "general" | "section" } },
        );

        await waitFor(() => expect(result.current.general.value).toEqual(FIRST));
        await waitFor(() => expect(result.current.section.value).toEqual(SECOND));

        act(() => {
            result.current.general.setValue({ value: 2 });
            result.current.section.setValue({ value: 11 });
        });

        fireEvent.keyDown(document, { key: "z", ctrlKey: true });
        expect(result.current.general.value).toEqual(FIRST);
        expect(result.current.section.value).toEqual({ value: 11 });

        rerender({ active: "section" });
        fireEvent.keyDown(document, { key: "z", ctrlKey: true });
        expect(result.current.general.value).toEqual(FIRST);
        expect(result.current.section.value).toEqual(SECOND);
    });
});
