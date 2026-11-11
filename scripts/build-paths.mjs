// One build-output root. Every generated artifact has a predictable home so a developer
// can find it, clean it, or ignore it without searching the source tree.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = fileURLToPath(new URL("..", import.meta.url));
export const outputRoot = resolve(projectRoot, "dist");
export const cargoTarget = resolve(outputRoot, "cargo");
export const stagedTools = resolve(outputRoot, "tools");
export const devTools = resolve(outputRoot, "dev-tools");
export const serviceCache = resolve(outputRoot, "cache", "service");
export const appsRoot = resolve(outputRoot, "apps");
export const desktopBuild = resolve(appsRoot, "desktop");
export const webBuild = resolve(appsRoot, "web");
export const websiteBuild = resolve(appsRoot, "website");
export const tsBuildInfoDir = resolve(outputRoot, "tsbuildinfo");
export const testDataRoot = resolve(outputRoot, "test-data");
export const coverageDir = resolve(outputRoot, "coverage");
export const testResultsDir = resolve(outputRoot, "test-results");
export const playwrightReportDir = resolve(outputRoot, "playwright-report");
export const releaseDir = resolve(outputRoot, "release");
