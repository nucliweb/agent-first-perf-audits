// The demo of the gate on GitHub, as images for the slides: the check of the pull request of
// pr/lcp-hero-lazy with its annotations, and the comment that ci leaves, in three captures (the
// verdict with the metrics, the explanation and the facts of the rules). They are the backup of the
// live demo when the room has no network. demo.json keeps what the captures show.
// It reads the public API and the public pages of GitHub, without signing in.
// Usage: node demo.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

const REPO = "nucliweb/agent-first-perf-audits";
const PULL = 1;
const OUT = new URL("../../docs/public/evidence/", import.meta.url);
const file = (name) => new URL(name, OUT).pathname;

async function api(path) {
  const response = await fetch(`https://api.github.com/repos/${REPO}/${path}`, { headers: { accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} to ${path}`);
  return response.json();
}

// The last gate of the pull request and the comment of ci
const pull = await api(`pulls/${PULL}`);
const runs = (await api(`commits/${pull.head.sha}/check-runs?check_name=gate&per_page=100`)).check_runs;
const check = runs.sort((a, b) => b.completed_at.localeCompare(a.completed_at))[0];
const annotations = (await api(`check-runs/${check.id}/annotations`)).map((a) => a.message);
const comment = (await api(`issues/${PULL}/comments?per_page=100`)).findLast((c) => c.user.login === "github-actions[bot]");
if (!check || !comment) throw new Error(`the pull request ${PULL} has no gate or no comment of ci`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2, colorScheme: "light" });
mkdirSync(OUT, { recursive: true });

// The check, with its annotations open: from the name of the commit to the end of the annotations
await page.goto(`https://github.com/${REPO}/pull/${PULL}/checks?check_run_id=${check.id}`, { waitUntil: "load" });
await page.getByRole("heading", { name: "Annotations" }).waitFor();
// The annotations come folded, and the script that unfolds them does not load without signing in:
// show the block that holds them, as its button would
await page.getByText(annotations.at(-1)).first().evaluate((el) => {
  for (let node = el; node; node = node.parentElement) {
    node.hidden = false;
    if (getComputedStyle(node).display === "none") node.style.display = "block";
  }
});
await page.getByText(annotations.at(-1)).first().waitFor();
const tabs = await page.getByRole("link", { name: /Checks/ }).first().boundingBox();
const last = await page.getByText(annotations.at(-1)).first().boundingBox();
const top = tabs.y + tabs.height + 8;
await page.screenshot({ path: file("gate-check.png"), clip: { x: 0, y: top, width: 1280, height: Math.min(1000, last.y + last.height + 120) - top } });

// The comment, in three parts: each one from a heading to the next
await page.setViewportSize({ width: 1280, height: 2600 });
await page.goto(`https://github.com/${REPO}/pull/${PULL}`, { waitUntil: "load" });
const body = page.locator(`#issuecomment-${comment.id}`);
await body.waitFor();
await body.scrollIntoViewIfNeeded();
const box = await body.boundingBox();
const yOf = async (name) => (await body.getByRole("heading", { name, exact: true }).first().boundingBox()).y;
const [explanation, facts] = [await yOf("Explanation"), await yOf("Facts of the rules")];
const verdictLine = body.getByText(/^Verdict of the rules:/).first();
const verdictTop = (await verdictLine.boundingBox()).y;
const clip = (from, to) => ({ x: box.x, y: from - 16, width: box.width, height: to - from + 8 });
await page.screenshot({ path: file("gate-comment-metrics.png"), clip: clip(verdictTop, explanation) });
await page.screenshot({ path: file("gate-comment-explanation.png"), clip: clip(explanation, facts) });
await page.screenshot({ path: file("gate-comment-facts.png"), clip: clip(facts, box.y + box.height) });
const verdict = (await verdictLine.textContent()).trim().replace(/\s+/g, " ");
await browser.close();

writeFileSync(
  new URL("./demo.json", import.meta.url),
  JSON.stringify(
    {
      pull: PULL,
      branch: pull.head.ref,
      commit: pull.head.sha,
      check: { id: check.id, conclusion: check.conclusion, completedAt: check.completed_at, annotations },
      comment: { id: comment.id, updatedAt: comment.updated_at, verdict },
    },
    null,
    2,
  ) + "\n",
);
console.log(`gate ${check.conclusion}, ${annotations.join(" | ")}\n${verdict}`);
