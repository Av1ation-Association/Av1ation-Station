/**
 * The public site is served at `/` on the root host and under a repository prefix on
 * GitHub project Pages. Every internal URL goes through here so a direct docs load and a
 * client-side navigation agree about that prefix.
 */
const configuredBase = import.meta.env.BASE_URL;

/** The configured base without a trailing slash; empty for a root-hosted site. */
export const BASE_PATH =
    configuredBase === "./" || configuredBase === "." ? "" : configuredBase.replace(/\/+$/u, "");

/** Prefix a root-relative path, while leaving anchors and external URLs untouched. */
export function withBase(path: string, base = BASE_PATH): string {
    if (path.startsWith("#") || path.startsWith("//") || /^[a-z][a-z0-9+.-]*:/iu.test(path)) {
        return path;
    }
    return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Remove the deployment prefix before matching the application's own route table. */
export function withoutBase(pathname: string, base = BASE_PATH): string {
    if (base === "" || pathname === base) {
        return base === "" ? pathname : "/";
    }
    return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}
