// @vitest-environment jsdom
import type { ProjectTemplate } from "@av1ation/contracts";
import { QueryClient } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ApiError, type Transport } from "../transport/types";
import { ApiProvider } from "./client";
import {
    useImportProjectTemplates,
    type TemplateImportBatch,
    type TemplateImportSource,
} from "./templates";

function template(name: string): ProjectTemplate {
    return {
        id: `id-${name.toLowerCase()}`,
        name,
        config: {},
        general: { input_kind: "ffms2", output_mode: "next_to_input" },
        updated_at: "2026-11-18T00:00:00Z",
    };
}

function archive(name: string): string {
    return JSON.stringify({
        kind: "av1ation.project-template",
        schema_version: 1,
        exported_at: "2026-11-18T00:00:00Z",
        template: {
            name,
            config: {},
            general: { input_kind: "ffms2", output_mode: "next_to_input" },
        },
    });
}

function source(name: string, text: () => Promise<string>): TemplateImportSource {
    return { name, text };
}

/** A transport whose only implemented route is the template import. */
function transportWith(respond: (body: unknown) => Promise<ProjectTemplate>) {
    const bodies: unknown[] = [];
    const post = vi.fn();
    const transport: Transport = {
        get: <T,>(): Promise<T> => Promise.reject(new Error("no reads")),
        post: async <T,>(_path: string, body: unknown): Promise<T> => {
            post(body);
            bodies.push(body);
            return { template: await respond(body), removed: [] } as T;
        },
        put: () => Promise.resolve(),
        putJson: <T,>(): Promise<T> => Promise.reject(new Error("no writes")),
        patchJson: <T,>(): Promise<T> => Promise.reject(new Error("no writes")),
        delete: () => Promise.resolve(),
        subscribe: () => () => undefined,
        mediaUrl: undefined,
        pickFile: undefined,
        pickSaveFile: undefined,
        pickExecutable: undefined,
        pickVideoFile: undefined,
        pickVideoFiles: undefined,
        pickDirectory: undefined,
        saveTextFile: undefined,
        pickScript: undefined,
        pickIndex: undefined,
        pickModel: undefined,
        revealPath: undefined,
        openPath: undefined,
        restartApp: undefined,
        openLanguageServer: undefined,
    };
    return { transport, post, bodies };
}

function renderImportHook(transport: Transport) {
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    return renderHook(() => useImportProjectTemplates(), {
        wrapper: ({ children }: { children: ReactNode }) => (
            <ApiProvider transport={transport} queryClient={queryClient}>
                {children}
            </ApiProvider>
        ),
    });
}

describe("useImportProjectTemplates", () => {
    it("imports files one at a time and reports progress for each", async () => {
        const calls: string[] = [];
        let releaseFirst: (() => void) | undefined;
        const firstGate = new Promise<void>((resolve) => {
            releaseFirst = resolve;
        });
        const { transport } = transportWith(async (body) => {
            const name = (body as { template: { name: string } }).template.name;
            calls.push(`start:${name}`);
            if (name === "First") {
                await firstGate;
            }
            calls.push(`done:${name}`);
            return template(name);
        });
        const { result } = renderImportHook(transport);
        const progress: string[] = [];
        let batch: TemplateImportBatch | undefined;

        await act(async () => {
            const pending = result.current.mutateAsync({
                files: [
                    source("first.json", async () => archive("First")),
                    source("second.json", async () => archive("Second")),
                ],
                onProgress: (current, total) => progress.push(`${current}/${total}`),
            });
            // The second file must wait for the first response, not race it.
            await vi.waitFor(() => expect(calls).toEqual(["start:First"]));
            releaseFirst?.();
            batch = await pending;
        });

        expect(batch?.imported.map((entry) => entry.name)).toEqual(["First", "Second"]);
        expect(batch?.failures).toEqual([]);
        expect(progress).toEqual(["1/2", "2/2"]);
        expect(calls).toEqual(["start:First", "done:First", "start:Second", "done:Second"]);
    });

    it("keeps the successful files when the service refuses one", async () => {
        const { transport } = transportWith(async (body) => {
            const name = (body as { template: { name: string } }).template.name;
            if (name === "Broken") {
                throw new ApiError(422, null, "This JSON file is not a project template archive.");
            }
            return template(name);
        });
        const { result } = renderImportHook(transport);
        const progress: string[] = [];
        let batch: TemplateImportBatch | undefined;

        await act(async () => {
            batch = await result.current.mutateAsync({
                files: [
                    source("broken.json", async () => archive("Broken")),
                    source("good.json", async () => archive("Good")),
                ],
                onProgress: (current, total) => progress.push(`${current}/${total}`),
            });
        });

        expect(batch?.imported.map((entry) => entry.name)).toEqual(["Good"]);
        expect(batch?.failures).toEqual([
            {
                filename: "broken.json",
                message: "This JSON file is not a project template archive.",
            },
        ]);
        expect(progress).toEqual(["1/2", "2/2"]);
    });

    it("refuses more than ten files before reading any of them", async () => {
        const { transport, post } = transportWith(async (body) => {
            return template((body as { template: { name: string } }).template.name);
        });
        const read = vi.fn(async () => archive("Extra"));
        const files = Array.from({ length: 11 }, (_, index) =>
            source(`file-${String(index)}.json`, read),
        );
        const { result } = renderImportHook(transport);

        await act(async () => {
            await expect(result.current.mutateAsync({ files })).rejects.toThrow(
                "Choose at most 10 template files at a time.",
            );
        });

        expect(read).not.toHaveBeenCalled();
        expect(post).not.toHaveBeenCalled();
    });

    it("reports a file whose contents are not JSON without calling the service", async () => {
        const { transport, post } = transportWith(async () => template("Unreachable"));
        const { result } = renderImportHook(transport);
        let batch: TemplateImportBatch | undefined;

        await act(async () => {
            batch = await result.current.mutateAsync({
                files: [source("notes.json", async () => "{ not json")],
            });
        });

        expect(batch?.imported).toEqual([]);
        expect(batch?.failures).toEqual([
            { filename: "notes.json", message: "This file is not valid JSON." },
        ]);
        expect(post).not.toHaveBeenCalled();
    });

    it("rejects a file with a non-JSON extension without reading it", async () => {
        const { transport, post } = transportWith(async () => template("Unreachable"));
        const read = vi.fn(async () => archive("Ignored"));
        const { result } = renderImportHook(transport);
        let batch: TemplateImportBatch | undefined;

        await act(async () => {
            batch = await result.current.mutateAsync({
                files: [source("notes.txt", read)],
            });
        });

        expect(batch?.imported).toEqual([]);
        expect(batch?.failures).toEqual([
            { filename: "notes.txt", message: "Only .json template files can be imported." },
        ]);
        expect(read).not.toHaveBeenCalled();
        expect(post).not.toHaveBeenCalled();
    });
});
