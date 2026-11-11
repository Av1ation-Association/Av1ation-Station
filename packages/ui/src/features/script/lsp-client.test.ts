import { describe, expect, it } from "vitest";

import type { LanguageServerChannel } from "@av1ation/api";

import {
    completionFromLsp,
    declaredModulePaths,
    fileUri,
    hoverFromLsp,
    LanguageServerClient,
} from "./lsp-client";

class FakeChannel implements LanguageServerChannel {
    readonly sent: Array<Record<string, unknown>> = [];
    #message: ((message: string) => void) | null = null;
    #close: (() => void) | null = null;

    send(message: string): void {
        this.sent.push(JSON.parse(message) as Record<string, unknown>);
    }

    close(): void {
        this.#close?.();
    }

    onMessage(handler: (message: string) => void): void {
        this.#message = handler;
    }

    onClose(handler: () => void): void {
        this.#close = handler;
    }

    receive(message: unknown): void {
        this.#message?.(JSON.stringify(message));
    }
}

async function flush(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

describe("language server client", () => {
    it("maps completions, including a server edit range and a snippet", () => {
        const items = completionFromLsp({
            isIncomplete: false,
            items: [
                {
                    label: "video_path",
                    kind: 6,
                    detail: "str",
                    documentation: { kind: "markdown", value: "The source file." },
                    textEdit: {
                        range: {
                            start: { line: 2, character: 4 },
                            end: { line: 2, character: 9 },
                        },
                        newText: "video_path",
                    },
                },
                {
                    label: "scene_at",
                    kind: 3,
                    insertText: "scene_at(${1:frame})",
                    insertTextFormat: 2,
                },
            ],
        });
        expect(items).toHaveLength(2);
        expect(items[0]).toMatchObject({
            label: "video_path",
            kind: 6,
            detail: "str",
            documentation: "The source file.",
            range: { startLine: 3, startColumn: 5, endLine: 3, endColumn: 10 },
        });
        expect(items[1]).toMatchObject({
            snippet: true,
            insertText: "scene_at(${1:frame})",
        });
        expect(items[1]?.range).toBeUndefined();
    });

    it("maps hover markup and drops an empty answer", () => {
        expect(
            hoverFromLsp({
                contents: { kind: "markdown", value: "**Scene** · frame range" },
                range: {
                    start: { line: 0, character: 0 },
                    end: { line: 0, character: 5 },
                },
            }),
        ).toEqual({
            markdown: "**Scene** · frame range",
            range: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 6 },
        });
        expect(
            hoverFromLsp({
                contents: [
                    { language: "python", value: "def scene_at(frame: int) -> Scene" },
                    "The scene containing a frame.",
                ],
            })?.markdown,
        ).toContain("```python");
        expect(hoverFromLsp({ contents: { kind: "markdown", value: "" } })).toBeNull();
        expect(hoverFromLsp(null)).toBeNull();
    });

    it("opens the stub and the script before completing", async () => {
        const channel = new FakeChannel();
        const client = new LanguageServerClient({
            channel,
            workspace: "C:\\Temp\\av1ation-lsp",
            stub: "video_path: str",
        });
        const ready = client.initialize();
        expect(channel.sent[0]?.method).toBe("initialize");
        channel.receive({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
        expect(await ready).toBe(true);
        await flush();

        expect(channel.sent.map((message) => message.method)).toEqual([
            "initialize",
            "initialized",
            "textDocument/didOpen",
        ]);
        expect(
            (channel.sent[2]?.params as { textDocument: { uri: string } }).textDocument.uri,
        ).toBe("file:///C:/Temp/av1ation-lsp/condor_data.pyi");

        const completion = client.completion("import condor_data as cd\ncd.", 2, 4);
        await flush();
        expect(channel.sent.map((message) => message.method)).toContain("textDocument/didOpen");
        const request = channel.sent.find(
            (message) => message.method === "textDocument/completion",
        );
        expect(request?.params).toEqual({
            textDocument: { uri: "file:///C:/Temp/av1ation-lsp/script.py" },
            position: { line: 1, character: 3 },
        });
        channel.receive({
            jsonrpc: "2.0",
            id: request?.id,
            result: [{ label: "video_path", kind: 6 }],
        });
        expect(await completion).toHaveLength(1);
        client.dispose();
    });

    it("answers server-initiated configuration requests", async () => {
        const channel = new FakeChannel();
        const client = new LanguageServerClient({
            channel,
            workspace: "/tmp/lsp",
        });
        const ready = client.initialize();
        channel.receive({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
        await ready;
        channel.receive({
            jsonrpc: "2.0",
            id: 99,
            method: "workspace/configuration",
            params: { items: [{ section: "python" }, {}] },
        });
        await flush();
        expect(channel.sent.at(-1)).toMatchObject({
            jsonrpc: "2.0",
            id: 99,
            result: [
                { analysis: { extraPaths: ["/tmp/lsp"], diagnosticMode: "openFilesOnly" } },
                {},
            ],
        });
        client.dispose();
    });

    it("reads the directories a script puts on sys.path", () => {
        expect(
            declaredModulePaths(
                [
                    "import sys",
                    'sys.path.insert(0, r"P:\\vsc\\src\\local\\Tools\\Condor")',
                    'sys.path.append("/opt/vs/modules")',
                    'sys.path.append("relative/modules")',
                    '# sys.path.append("/commented/out")',
                    'sys.path.insert(0, r"P:\\vsc\\src\\local\\Tools\\Condor")',
                ].join("\n"),
            ),
        ).toEqual(["P:\\vsc\\src\\local\\Tools\\Condor", "/opt/vs/modules"]);
        // A computed path is not a literal the editor can forward.
        expect(declaredModulePaths("sys.path.append(module_dir)")).toEqual([]);
    });

    it("forwards declared module directories to every server family", async () => {
        const channel = new FakeChannel();
        const client = new LanguageServerClient({
            channel,
            workspace: "/tmp/lsp",
            kind: "jedi",
            modulePaths: ["P:/vsc/toolkit"],
        });
        const ready = client.initialize();
        expect(channel.sent[0]?.params).toMatchObject({
            initializationOptions: {
                workspace: { extraPaths: ["/tmp/lsp", "P:/vsc/toolkit"] },
            },
        });
        channel.receive({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
        expect(await ready).toBe(true);
        channel.receive({
            jsonrpc: "2.0",
            id: 4,
            method: "workspace/configuration",
            params: { items: [{ section: "python" }, { section: "pylsp" }] },
        });
        await flush();
        expect(channel.sent.at(-1)).toMatchObject({
            id: 4,
            result: [
                { analysis: { extraPaths: ["/tmp/lsp", "P:/vsc/toolkit"] } },
                {
                    plugins: {
                        jedi: { extra_paths: ["/tmp/lsp", "P:/vsc/toolkit"] },
                    },
                },
            ],
        });
        client.dispose();
    });

    it("points each server family at the configured interpreter", async () => {
        const channel = new FakeChannel();
        const client = new LanguageServerClient({
            channel,
            workspace: "/tmp/lsp",
            interpreter: "C:/venvs/encode/Scripts/python.exe",
            kind: "pyright",
        });
        const ready = client.initialize();
        expect(channel.sent[0]?.params).toMatchObject({
            rootUri: "file:///tmp/lsp",
        });
        channel.receive({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
        await ready;
        channel.receive({
            jsonrpc: "2.0",
            id: 7,
            method: "workspace/configuration",
            params: { items: [{ section: "python" }, { section: "pylsp" }] },
        });
        await flush();
        const answer = channel.sent.at(-1);
        expect(answer).toMatchObject({
            id: 7,
            result: [
                {
                    pythonPath: "C:/venvs/encode/Scripts/python.exe",
                    analysis: { extraPaths: ["/tmp/lsp"], diagnosticMode: "openFilesOnly" },
                },
                {
                    plugins: {
                        jedi: { environment: "C:/venvs/encode/Scripts/python.exe" },
                    },
                },
            ],
        });
        client.dispose();

        // Jedi takes the environment at initialize time, not over workspace/configuration.
        const jediChannel = new FakeChannel();
        const jedi = new LanguageServerClient({
            channel: jediChannel,
            workspace: "/tmp/lsp",
            interpreter: "C:/venvs/encode/Scripts/python.exe",
            kind: "jedi",
        });
        const jediReady = jedi.initialize();
        expect(jediChannel.sent[0]?.params).toMatchObject({
            initializationOptions: {
                workspace: {
                    extraPaths: ["/tmp/lsp"],
                    environmentPath: "C:/venvs/encode/Scripts/python.exe",
                },
            },
        });
        jediChannel.receive({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
        await jediReady;
        jedi.dispose();

        // pylsp reads settings from didChangeConfiguration, so it gets the same tree both
        // as initialization options and as a notification after initialized.
        const pylspChannel = new FakeChannel();
        const pylsp = new LanguageServerClient({
            channel: pylspChannel,
            workspace: "/tmp/lsp",
            interpreter: "C:/venvs/encode/Scripts/python.exe",
            kind: "pylsp",
        });
        const pylspReady = pylsp.initialize();
        expect(pylspChannel.sent[0]?.params).toMatchObject({
            initializationOptions: {
                pylsp: {
                    plugins: { jedi: { environment: "C:/venvs/encode/Scripts/python.exe" } },
                },
            },
        });
        pylspChannel.receive({ jsonrpc: "2.0", id: 1, result: { capabilities: {} } });
        expect(await pylspReady).toBe(true);
        await flush();
        expect(
            pylspChannel.sent.find(
                (message) => message.method === "workspace/didChangeConfiguration",
            )?.params,
        ).toEqual({
            settings: {
                pylsp: {
                    plugins: { jedi: { environment: "C:/venvs/encode/Scripts/python.exe" } },
                },
            },
        });
        pylsp.dispose();
    });

    it("builds a file URI the server can open on either platform", () => {
        expect(fileUri("C:\\Temp\\a b\\script.py")).toBe("file:///C:/Temp/a%20b/script.py");
        expect(fileUri("/tmp/lsp/script.py")).toBe("file:///tmp/lsp/script.py");
    });
});
