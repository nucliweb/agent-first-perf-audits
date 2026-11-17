// The QR codes of the last slide of each deck: the website of the workshop, the repo and the slides,
// each one in the language of its deck. It writes docs/public/slides/qr/<target>-<language>.svg with
// the qrcode package, at a fixed version. The links are the ones the last slide writes.
// Usage: node scripts/slides-qr.mjs   (it needs the network the first time, for npx)
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const QRCODE = "qrcode@1.5.4";
const OUT = join(import.meta.dirname, "../docs/public/slides/qr");
const SITE = "https://agent-first-perf-audits.vercel.app";
const REPO = "https://github.com/nucliweb/agent-first-perf-audits";

export const TARGETS = {
  web: { es: `${SITE}/es/`, ca: `${SITE}/ca/`, en: `${SITE}/` },
  repo: { es: `${REPO}/blob/main/README.es.md`, ca: `${REPO}/blob/main/README.ca.md`, en: REPO },
  slides: { es: `${SITE}/slides/`, ca: `${SITE}/slides/ca/`, en: `${SITE}/slides/en/` },
};

if (process.argv[1] === import.meta.filename) {
  mkdirSync(OUT, { recursive: true });
  for (const [target, urls] of Object.entries(TARGETS)) {
    for (const [language, url] of Object.entries(urls)) {
      const file = join(OUT, `${target}-${language}.svg`);
      execFileSync("npx", ["--yes", QRCODE, "-t", "svg", "-o", file, url], { stdio: ["ignore", "ignore", "inherit"] });
      console.log(`${target}-${language}.svg  ${url}`);
    }
  }
}
