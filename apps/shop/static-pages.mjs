// Writes the shop for a static host, such as Vercel, after the build: a copy of dist/ in
// dist-static/ with the same HTML that server.mjs gives each route when it serves it. The home and
// each product page get the preload of their LCP image; any other route gets app.html, which the
// host serves as a fallback. dist/ stays as it is, so server.mjs can still serve it.
// Usage: node static-pages.mjs   (THIRDPARTY_ORIGIN, default /thirdparty, on the same host)
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderIndex } from "./server.mjs";
import { PRODUCTS } from "./src/products.ts";

export async function writeStaticPages(dist, out, thirdPartyOrigin) {
  const template = await readFile(join(dist, "index.html"), "utf8");
  await rm(out, { recursive: true, force: true });
  await cp(dist, out, { recursive: true });
  const pages = {
    "index.html": "/",
    "app.html": "/app",
    ...Object.fromEntries(PRODUCTS.map(({ slug }) => [`product/${slug}.html`, `/product/${slug}`])),
  };
  await mkdir(join(out, "product"), { recursive: true });
  for (const [file, pathname] of Object.entries(pages)) {
    await writeFile(join(out, file), renderIndex(template, pathname, thirdPartyOrigin));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const here = (path) => fileURLToPath(new URL(path, import.meta.url));
  await writeStaticPages(here("./dist"), here("./dist-static"), process.env.THIRDPARTY_ORIGIN ?? "/thirdparty");
}
