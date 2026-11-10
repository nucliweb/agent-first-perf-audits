// Copies the heading font from its pinned npm package to public/fonts/, so index.html can
// preload it by a stable URL.
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const SOURCE = join(dirname(require.resolve("@fontsource/fraunces/package.json")), "files");
const TARGET = fileURLToPath(new URL("../public/fonts/", import.meta.url));
const FILES = ["fraunces-latin-600-normal.woff2"];

await mkdir(TARGET, { recursive: true });
for (const file of FILES) await copyFile(join(SOURCE, file), join(TARGET, file));
