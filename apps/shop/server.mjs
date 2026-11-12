// Serves the production build of the shop (dist/). Every path without a file extension gets
// index.html, so the routes of the single-page app work on a hard load. The origin of the
// third-party mocks goes into index.html when it is served, so the same build runs locally
// and in Docker Compose.
// Usage: node server.mjs   (PORT, default 3000; THIRDPARTY_ORIGIN, default http://localhost:4000)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { lcpImageFor } from "./src/products.ts";

const COMPRESSIBLE = new Set([".html", ".js", ".css", ".svg", ".json"]);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
  ".json": "application/json",
};

const escapeAttr = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

function preloadTag(pathname) {
  const image = lcpImageFor(pathname);
  if (!image) return "";
  const { href, srcset, sizes } = image;
  return `<link rel="preload" as="image" href="${escapeAttr(href)}" imagesrcset="${escapeAttr(srcset)}" imagesizes="${escapeAttr(sizes)}" fetchpriority="high" />`;
}

// The index.html of a route: the origin of the third-party mocks and the preload of its LCP image.
// static-pages.mjs writes the same pages ahead of time for a static host.
export const renderIndex = (html, pathname, thirdPartyOrigin) =>
  html.replaceAll("__THIRDPARTY_ORIGIN__", thirdPartyOrigin).replace("<!-- lcp-preload -->", preloadTag(pathname));

export function createShopServer({ root, thirdPartyOrigin }) {
  const indexHtml = (pathname) => readFile(join(root, "index.html"), "utf8").then((html) => renderIndex(html, pathname, thirdPartyOrigin));

  return createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = normalize(join(root, pathname));
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(404).end();
      return;
    }

    const ext = extname(pathname);
    if (!ext || ext === ".html") {
      const headers = { "content-type": TYPES[".html"], "cache-control": "no-cache", vary: "accept-encoding" };
      let body = Buffer.from(await indexHtml(pathname));
      if (/\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
        body = gzipSync(body);
        headers["content-encoding"] = "gzip";
      }
      res.writeHead(200, headers);
      res.end(body);
      return;
    }

    try {
      let body = await readFile(file);
      const headers = {
        "content-type": TYPES[ext] ?? "application/octet-stream",
        // Vite puts a content hash in the names under assets/
        "cache-control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
      };
      // Images and fonts are compressed formats already
      if (COMPRESSIBLE.has(ext)) {
        headers.vary = "accept-encoding";
        if (/\bgzip\b/.test(req.headers["accept-encoding"] ?? "")) {
          body = gzipSync(body);
          headers["content-encoding"] = "gzip";
        }
      }
      res.writeHead(200, headers);
      res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found\n");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const root = fileURLToPath(new URL("./dist", import.meta.url));
  const thirdPartyOrigin = process.env.THIRDPARTY_ORIGIN ?? "http://localhost:4000";
  createShopServer({ root, thirdPartyOrigin }).listen(port, () => console.log(`shop listening on http://localhost:${port}`));
}
