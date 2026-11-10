import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSuspects } from "./match.mjs";

const DIFF = `diff --git a/apps/shop/index.html b/apps/shop/index.html
--- a/apps/shop/index.html
+++ b/apps/shop/index.html
@@ -10,2 +10,3 @@
     <link rel="preload" href="/fonts/fraunces-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin />
+    <script src="__THIRDPARTY_ORIGIN__/ab.js?cpu=150"></script>
     <script async src="__THIRDPARTY_ORIGIN__/analytics.js?delay=100&cpu=30"></script>
diff --git a/apps/shop/src/pages.tsx b/apps/shop/src/pages.tsx
--- a/apps/shop/src/pages.tsx
+++ b/apps/shop/src/pages.tsx
@@ -4,2 +4,3 @@
 import { FREE_SHIPPING_FROM } from "./cart-lines.ts";
+import { recommendFor } from "./recommendations.ts";
@@ -92,2 +94,3 @@
     setAdded((n) => n + 1);
+    setRecommended(recommendFor(product.slug));
   };
diff --git a/apps/shop/src/recommendations.ts b/apps/shop/src/recommendations.ts
new file mode 100644
--- /dev/null
+++ b/apps/shop/src/recommendations.ts
@@ -0,0 +1,3 @@
+export function recommendFor(slug: string) {
+  return [];
+}`;

const RECOMMEND = { kind: "function", name: "recommendFor", url: "/assets/index.js", line: 8, selfTimeMs: 80, baselineSelfTimeMs: 0 };
const AB = { kind: "script", name: "http://thirdparty:4000/ab.js?cpu=150", url: "http://thirdparty:4000/ab.js?cpu=150", line: 0, selfTimeMs: 151, baselineSelfTimeMs: 0 };

test("matches a function with the added line that calls it, before the one that defines it", () => {
  assert.deepEqual(matchSuspects([RECOMMEND], DIFF), [
    { suspect: RECOMMEND, file: "apps/shop/src/pages.tsx", line: "setRecommended(recommendFor(product.slug));" },
  ]);
});

test("matches a third-party script by its file name", () => {
  assert.deepEqual(matchSuspects([AB], DIFF), [
    { suspect: AB, file: "apps/shop/index.html", line: '<script src="__THIRDPARTY_ORIGIN__/ab.js?cpu=150"></script>' },
  ]);
});

test("leaves out a suspect that no added line names", () => {
  const other = { ...RECOMMEND, name: "formatPrice" };
  assert.deepEqual(matchSuspects([other], DIFF), []);
});

test("ignores the removed and the unchanged lines", () => {
  const diff = "+++ b/apps/shop/src/pages.tsx\n-    setRecommended(recommendFor(product.slug));\n     recommendFor();";
  assert.deepEqual(matchSuspects([RECOMMEND], diff), []);
});
