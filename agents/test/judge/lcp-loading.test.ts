// The facts of the rules for a regressed LCP: the LCP element of the trace and the lines of the
// diff that change how it loads, with the diff and the trace summaries of pr/lcp-hero-lazy.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lcpLoadingFacts } from "../../src/judge/lcp-loading.ts";
import type { JudgeInput } from "../../src/judge/types.ts";

const HERO_DIFF = `diff --git a/apps/shop/src/pages.tsx b/apps/shop/src/pages.tsx
index 83dbdd0..6fb5a12 100644
--- a/apps/shop/src/pages.tsx
+++ b/apps/shop/src/pages.tsx
@@ -30,7 +30,7 @@ export function Home() {
           sizes={HERO_SIZES}
           width={1600}
           height={900}
-          fetchPriority="high"
+          loading="lazy"
           alt="Freshly brewed specialty coffee"
         />
         <div className="hero__text">
diff --git a/apps/shop/src/products.ts b/apps/shop/src/products.ts
index 63c2817..cae0344 100644
--- a/apps/shop/src/products.ts
+++ b/apps/shop/src/products.ts
@@ -115,7 +115,6 @@ export const PRODUCT_PAGE_SIZES = "(min-width: 960px) 50vw, 100vw";
 // The LCP image of a route. server.mjs preloads it from the HTML, so the browser fetches it
 // while the JavaScript of the app downloads, instead of after the app renders the page.
 export function lcpImageFor(pathname: string) {
-  if (pathname === "/") return { href: "/images/hero-1200.webp", srcset: heroSrcSet(), sizes: HERO_SIZES };
   const slug = pathname.match(/^\\/product\\/([\\w-]+)$/)?.[1];
   if (slug && productBySlug(slug)) {
     return { href: productSrc(slug, 800), srcset: productSrcSet(slug), sizes: PRODUCT_PAGE_SIZES };`;

// A branch that slows the LCP down without touching how the image loads: a synchronous script
const SCRIPT_DIFF = `diff --git a/apps/shop/index.html b/apps/shop/index.html
--- a/apps/shop/index.html
+++ b/apps/shop/index.html
@@ -10,2 +10,3 @@
     <link rel="preload" href="/fonts/fraunces-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin />
+    <script src="__THIRDPARTY_ORIGIN__/ab.js?cpu=150"></script>
     <script async src="__THIRDPARTY_ORIGIN__/analytics.js?delay=100&cpu=30"></script>`;

const overview = (origin: string, element = "IMG class='hero__image'", image = "hero-800.webp") => `bounds:
  durationMs: 2563.42
mainUrl: "${origin}/"
coreWebVitals:
  fcp:
    valueMs: 583.56
    rating: good
  lcp:
    valueMs: 1050.2
    rating: good
    url: "${origin}/images/${image}"
    element: ${element}
  cls:
    value: 0
    rating: good`;

const input = (diff: string, candidate = overview("http://shop-candidate:3000")): JudgeInput => ({
  branch: "pr/lcp-hero-lazy",
  gate: { verdict: "fail", scenarios: [] },
  diff,
  traces: { home: { baseline: { overview: overview("http://shop-baseline:3000") }, candidate: { overview: candidate } } },
});

const LCP_HOME = { metric: "LCP", scenario: "home" };

test("lists the lines of the diff that change how the LCP image loads, in the order of the diff", () => {
  assert.deepEqual(lcpLoadingFacts(input(HERO_DIFF), LCP_HOME), [
    "The LCP element is IMG class='hero__image' (/images/hero-800.webp) in the baseline and in the branch",
    'apps/shop/src/pages.tsx, in Home, removes: fetchPriority="high"',
    'apps/shop/src/pages.tsx, in Home, adds: loading="lazy"',
    'apps/shop/src/products.ts, in lcpImageFor, removes a line that names the LCP image: if (pathname === "/") return { href: "/images/hero-1200.webp", srcset: heroSrcSet(), sizes: HERO_SIZES };',
  ]);
});

test("says nothing when no line of the diff changes how the LCP image loads", () => {
  assert.deepEqual(lcpLoadingFacts(input(SCRIPT_DIFF), LCP_HOME), []);
});

test("names both LCP elements when the branch changes it", () => {
  const facts = lcpLoadingFacts(input(HERO_DIFF, overview("http://shop-candidate:3000", "H1 class='hero__title'", "none")), LCP_HOME);
  assert.equal(facts[0], "The LCP element is IMG class='hero__image' (/images/hero-800.webp) in the baseline and H1 class='hero__title' (/images/none) in the branch");
});

test("only explains a regressed LCP of a scenario with an overview of the load", () => {
  assert.deepEqual(lcpLoadingFacts(input(HERO_DIFF), { metric: "INP", scenario: "home" }), []);
  assert.deepEqual(lcpLoadingFacts(input(HERO_DIFF), { metric: "LCP", scenario: "add-to-cart" }), []);
});
