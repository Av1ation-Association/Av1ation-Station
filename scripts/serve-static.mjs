// Serve a built single-page host with history fallback.
//
// The screenshot gallery needs every client route to answer with the same index
// document. `vite preview` can do that, but it also applies the host's asset base; this
// server is deliberately tiny and serves the built website from one explicit root.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";

const MIME = new Map([
    [".css", "text/css; charset=utf-8"],
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".map", "application/json; charset=utf-8"],
    [".avif", "image/avif"],
    [".png", "image/png"],
    [".svg", "image/svg+xml"],
    [".webp", "image/webp"],
    [".woff2", "font/woff2"],
]);

const args = process.argv.slice(2);
function option(name, fallback) {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? fallback : (args[index + 1] ?? fallback);
}

const root = resolve(option("root", "dist/apps/website"));
const port = Number(option("port", "8740"));
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    console.error(`serve-static: invalid port ${String(port)}`);
    process.exit(2);
}

async function fileAt(pathname) {
    const decoded = decodeURIComponent(pathname);
    const candidate = resolve(root, `.${decoded}`);
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
        return null;
    }
    try {
        const info = await stat(candidate);
        if (info.isFile()) {
            return candidate;
        }
        if (info.isDirectory()) {
            const index = resolve(candidate, "index.html");
            return (await stat(index)).isFile() ? index : null;
        }
    } catch {
        return null;
    }
    return null;
}

const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`)
        .pathname;
    const direct = await fileAt(pathname);
    const fallback =
        direct === null && extname(pathname) === "" ? await fileAt("/index.html") : null;
    const file = direct ?? fallback;
    if (file === null) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
    }
    try {
        const body = await readFile(file);
        response.writeHead(200, {
            "content-type": MIME.get(extname(file)) ?? "application/octet-stream",
            "cache-control": "no-store",
        });
        response.end(body);
    } catch {
        response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
        response.end("Cannot read the build output");
    }
});

server.listen(port, "127.0.0.1", () => {
    console.log(`Static SPA at http://127.0.0.1:${String(port)} (root ${root})`);
});
