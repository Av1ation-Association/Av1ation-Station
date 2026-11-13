import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { join, relative, sep } from "node:path";

import { ErrorBodySchema, LanStatusSchema, ProjectSchema } from "@av1ation/contracts";
import { projectGeneralPath, projectPath } from "@av1ation/api/paths";
import type { APIRequestContext, APIResponse } from "@playwright/test";

import { desktopBuild } from "../scripts/build-paths.mjs";
import { expect, test } from "./fixtures";

/**
 * Security-negative journeys against the real service.
 *
 * Log redaction remains covered by `log-export.spec.ts`; this file covers the other
 * boundary cases from the security contract: a foreign Origin, a LAN token that is absent,
 * wrong, or stale, and a path that tries to escape the served SPA root. The path probe uses
 * raw HTTP because a URL parser would normalise `..` before the request reached the service.
 */

interface RawResponse {
    readonly status: number;
    readonly body: string;
}

function rawGet(origin: string, path: string): Promise<RawResponse> {
    const url = new URL(origin);
    return new Promise((resolve, reject) => {
        const request = httpRequest(
            {
                hostname: url.hostname,
                port: url.port,
                path,
                method: "GET",
                headers: { host: url.host, connection: "close" },
            },
            (response) => {
                let body = "";
                response.setEncoding("utf8");
                response.on("data", (chunk) => {
                    body += chunk;
                });
                response.on("end", () => {
                    resolve({ status: response.statusCode ?? 0, body });
                });
            },
        );
        request.on("error", reject);
        request.end();
    });
}

async function readLanStatus(request: APIRequestContext, origin: string) {
    const response = await request.get(`${origin}/api/lan`);
    expect(response.ok()).toBeTruthy();
    return LanStatusSchema.parse(await response.json());
}

function requiredString(value: string | null | undefined, label: string): string {
    if (typeof value !== "string" || value === "") {
        throw new Error(`The LAN response did not include ${label}.`);
    }
    return value;
}

async function enableLan(request: APIRequestContext, origin: string) {
    const response = await request.post(`${origin}/api/lan/enable`);
    expect(response.ok()).toBeTruthy();
    return LanStatusSchema.parse(await response.json());
}

async function disableLan(request: APIRequestContext, origin: string) {
    const response = await request.post(`${origin}/api/lan/disable`);
    expect(response.ok()).toBeTruthy();
    const status = LanStatusSchema.parse(await response.json());
    expect(status.enabled).toBe(false);
}

async function expectUnauthorized(response: APIResponse, status = 401) {
    expect(response.status()).toBe(status);
    const body = ErrorBodySchema.parse(await response.json());
    expect(body.code).toBe("UNAUTHORIZED");
    return body;
}

test("refuses foreign-origin pairing and authenticated writes", async ({
    request,
    hosts,
    workspaceFor,
}) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.lan.origin;
    const lan = hosts.lan.lan;
    if (lan === undefined) {
        throw new Error("The LAN host did not publish its pairing origin.");
    }
    const token = requiredString((await readLanStatus(request, serviceOrigin)).token, "a token");
    const workspace = workspaceFor(serviceOrigin);
    const project = await workspace.createProject("E2E security origin");
    const projectResponse = await request.get(`${serviceOrigin}${projectPath(project.id)}`);
    expect(projectResponse.ok()).toBeTruthy();
    const document = ProjectSchema.parse(await projectResponse.json());

    const foreignOrigin = "https://evil.example";
    const pairing = await request.post(`${lan.origin}/api/pair`, {
        headers: { origin: foreignOrigin },
        data: { shortcode: lan.shortcode },
    });
    const pairingError = await expectUnauthorized(pairing, 403);
    expect(pairingError.message).toContain("another origin");

    // A same-origin write proves the token is valid before the foreign-origin request is
    // rejected. The document is unchanged, so the project is safe to clean up afterwards.
    const sameOrigin = await request.put(`${lan.origin}${projectGeneralPath(project.id)}`, {
        headers: { authorization: `Bearer ${token}`, origin: lan.origin },
        data: document.general,
    });
    expect(sameOrigin.status()).toBe(200);

    const foreignWrite = await request.put(`${lan.origin}${projectGeneralPath(project.id)}`, {
        headers: { authorization: `Bearer ${token}`, origin: foreignOrigin },
        data: document.general,
    });
    const writeError = await expectUnauthorized(foreignWrite, 403);
    expect(writeError.message).toContain("another origin");
});

test("refuses missing, wrong, and stale LAN bearer tokens", async ({ request, hosts }) => {
    test.setTimeout(60_000);
    const serviceOrigin = hosts.lan.origin;
    const lan = hosts.lan.lan;
    if (lan === undefined) {
        throw new Error("The LAN host did not publish its pairing origin.");
    }
    const token = requiredString((await readLanStatus(request, serviceOrigin)).token, "a token");
    const wrongToken = `${token.slice(0, -1)}${token.endsWith("0") ? "1" : "0"}`;

    await expectUnauthorized(await request.get(`${lan.origin}/api/health`));
    await expectUnauthorized(
        await request.get(`${lan.origin}/api/health`, {
            headers: { authorization: `Bearer ${wrongToken}` },
        }),
    );
    expect(
        (
            await request.get(`${lan.origin}/api/health`, {
                headers: { authorization: `Bearer ${token}` },
            })
        ).status(),
    ).toBe(200);

    // The full session TTL is 24 hours. Disabling and re-enabling LAN clears the old
    // sessions, so the first listener's token is the E2E-observable stale credential; the
    // second listener is healthy and its token still works.
    const completeOrigin = hosts.complete.origin;
    let lanEnabled = false;
    try {
        const first = await enableLan(request, completeOrigin);
        lanEnabled = true;
        const staleToken = requiredString(first.token, "the first LAN token");
        await disableLan(request, completeOrigin);
        lanEnabled = false;

        const second = await enableLan(request, completeOrigin);
        lanEnabled = true;
        const secondUrl = requiredString(second.url, "the second LAN URL");
        const currentToken = requiredString(second.token, "the second LAN token");
        await expectUnauthorized(
            await request.get(`${secondUrl}/api/health`, {
                headers: { authorization: `Bearer ${staleToken}` },
            }),
        );
        expect(
            (
                await request.get(`${secondUrl}/api/health`, {
                    headers: { authorization: `Bearer ${currentToken}` },
                })
            ).status(),
        ).toBe(200);
    } finally {
        if (lanEnabled) {
            await disableLan(request, completeOrigin);
        }
    }
});

test("rejects path traversal outside the served SPA root", async ({ hosts }, testInfo) => {
    const serviceOrigin = hosts.complete.origin;
    const outputDir = testInfo.outputDir;
    mkdirSync(outputDir, { recursive: true });
    const marker = `av1ation-e2e-traversal-${randomUUID()}`;
    const sentinel = join(outputDir, "traversal-secret.txt");
    writeFileSync(sentinel, marker, "utf8");

    const relativePath = relative(desktopBuild, sentinel).split(sep).join("/");
    expect(relativePath.startsWith("..")).toBe(true);

    const literal = await rawGet(serviceOrigin, `/${encodeURI(relativePath)}`);
    expect(literal.status).toBe(400);
    expect(literal.body).toContain("Invalid path");
    expect(literal.body).not.toContain(marker);

    // Percent-encoded separators must not turn the traversal into a readable file either.
    const encodedPath = `/${relativePath.replaceAll("..", "%2e%2e").replaceAll("/", "%2f")}`;
    const encoded = await rawGet(serviceOrigin, encodedPath);
    expect(encoded.status).toBe(404);
    expect(encoded.body).not.toContain(marker);
});
