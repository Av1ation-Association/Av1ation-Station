// Confirm that a component cache restored by actions/cache contains the artifact the
// manifest promises. The workflow uses this to skip compiler setup on a warm cache; the
// build script still verifies the cache key and marker before reusing it.
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";

const target = process.env.TARGET;
const id = process.env.COMPONENT;
const expectedKey = process.env.EXPECTED_CACHE_KEY;
if (!target || !id || !expectedKey) {
    console.error("TARGET, COMPONENT and EXPECTED_CACHE_KEY are required");
    process.exit(1);
}

const manifest = JSON.parse(readFileSync("packaging/toolchain.json", "utf8"));
const component = manifest.components.find((candidate) => candidate.id === id);
if (component === undefined) {
    console.error(`unknown component: ${id}`);
    process.exit(1);
}
const artifact = component.artifacts?.[target]?.install;
if (typeof artifact !== "string") {
    console.error(`${id} has no artifact for ${target}`);
    process.exit(1);
}

const cacheRoot = resolve("dist", "toolchain-cache", target, id.replaceAll(":", "-"));
const markerPath = join(cacheRoot, "component.json");
if (!existsSync(markerPath)) {
    console.error(`no cache marker under ${cacheRoot}`);
    process.exit(1);
}
const marker = JSON.parse(readFileSync(markerPath, "utf8"));
if (marker.cache_key !== expectedKey) {
    console.error(`cache marker key does not match the current recipe under ${cacheRoot}`);
    process.exit(1);
}
const artifactPath = resolve(cacheRoot, artifact);
if (artifactPath !== cacheRoot && !artifactPath.startsWith(`${cacheRoot}${sep}`)) {
    console.error(`cached artifact escapes its component directory: ${artifact}`);
    process.exit(1);
}
if (!existsSync(artifactPath)) {
    console.error(`cached artifact is missing: ${artifactPath}`);
    process.exit(1);
}
if (lstatSync(artifactPath).isSymbolicLink()) {
    console.error(`cached artifact is a symbolic link: ${artifactPath}`);
    process.exit(1);
}
