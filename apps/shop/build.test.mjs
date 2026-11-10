// The production build keeps the names of functions, so a CPU profile names the function
// behind a long task (addLine, not a one-letter name) and the Judge can match it with the diff.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build } from "vite";

test("the production build is minified but keeps function names", async () => {
  const outDir = await mkdtemp(join(tmpdir(), "shop-build-"));
  await build({ root: import.meta.dirname, logLevel: "silent", build: { outDir, emptyOutDir: true } });
  const assets = join(outDir, "assets");
  const file = (await readdir(assets)).find((name) => name.endsWith(".js"));
  const code = await readFile(join(assets, file), "utf8");
  assert.ok(code.split("\n").length < 50, "the bundle is minified");
  for (const name of ["addLine", "setQuantity", "productSrcSet", "ProductPage"]) {
    assert.match(code, new RegExp(`\\b${name}\\b`), `${name} is in the bundle`);
  }
});
