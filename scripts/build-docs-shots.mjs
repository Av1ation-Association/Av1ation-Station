// Copy the generated gallery captures into the website's public docs directory.
//
// The docs build guard requires both theme variants for every capture a page can reference.
// Screenshots stay out of git; this directory is generated and ignored for the same reason.
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const source = join(root, "dist", "screenshots", "avif");
const output = join(root, "apps", "website", "public", "docs-shots");

if (!existsSync(source)) {
    console.error(
        "The docs captures are missing. Run `npm run screenshots` before `npm run build:docs-shots`.",
    );
    process.exit(1);
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const files = readdirSync(source).filter((name) => name.endsWith(".avif"));
if (files.length === 0) {
    console.error(`${source} contains no AVIF captures. Run \`npm run screenshots\`.`);
    process.exit(1);
}

const ids = new Set();
for (const file of files) {
    if (statSync(join(source, file)).size === 0) {
        console.error(`${file} is empty; regenerate the screenshot gallery.`);
        process.exit(1);
    }
    copyFileSync(join(source, file), join(output, file));
    ids.add(file.replace(/-(dark|light)\.avif$/u, ""));
}
writeFileSync(join(output, "index.json"), `${JSON.stringify({ ids: [...ids].sort() }, null, 2)}\n`);
console.log(`Docs shots: ${files.length} AVIF variants for ${ids.size} captures in ${output}`);
