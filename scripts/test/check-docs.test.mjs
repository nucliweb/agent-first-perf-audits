// The checker of the documentation: each rule on small texts, and then on the repo itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { commandsOf, fencesOf, frontmatterKeysOf, headingsOf, linksOf } from "../lib/markdown.mjs";
import {
  checkRepo,
  expandLoops,
  externalLinksOf,
  internalLinks,
  lint,
  parity,
  readmeParity,
  references,
  slidesParity,
} from "../check-docs.mjs";

const rules = (findings) => findings.map((f) => f.rule);

const PAGE = `---
title: "Paso 4: el Judge"
description: Las reglas deciden
sidebar:
  order: 14
---

## Objetivo

Texto con un [enlace](../../learnings/#el-llm) y \`código\`.

1. Lanza los tests:

   \`\`\`bash
   docker compose run --rm agents node --test test/judge/findings.test.ts
   \`\`\`

   Fallan:

   \`\`\`text
   # fail 5
   \`\`\`

2. Aplica la solución:

   \`\`\`bash
   git checkout step-04-solution -- agents/src
   \`\`\`

### Qué hace
`;

test("markdown: the fences, with their language, their line and their body without the indent", () => {
  const fences = fencesOf(PAGE);
  assert.deepEqual(fences.map((f) => f.lang), ["bash", "text", "bash"]);
  assert.equal(fences[0].body, "docker compose run --rm agents node --test test/judge/findings.test.ts");
  assert.equal(fences[0].line, 14);
});

test("markdown: the headings outside the fences and the frontmatter", () => {
  assert.deepEqual(
    headingsOf(PAGE).map((h) => [h.level, h.text]),
    [[2, "Objetivo"], [3, "Qué hace"]],
  );
});

test("markdown: the keys of the frontmatter, in order", () => {
  assert.deepEqual(frontmatterKeysOf(PAGE), ["title", "description", "sidebar"]);
  assert.deepEqual(frontmatterKeysOf("# No frontmatter"), []);
});

test("markdown: the links of the prose", () => {
  assert.deepEqual(linksOf(PAGE).map((l) => l.href), ["../../learnings/#el-llm"]);
});

test("markdown: each command with the output that follows it", () => {
  const commands = commandsOf(PAGE);
  assert.equal(commands.length, 2);
  assert.equal(commands[0].expected, "# fail 5");
  assert.equal(commands[1].command, "git checkout step-04-solution -- agents/src");
  assert.equal(commands[1].expected, null);
});

test("parity: the same files in the three languages", () => {
  const findings = parity({ es: { "a.md": "## Uno", "b.md": "## Dos" }, ca: { "a.md": "## Un" }, en: { "a.md": "## One", "b.md": "## Two" } });
  assert.deepEqual(rules(findings), ["parity-files"]);
  assert.match(findings[0].message, /b\.md/);
  assert.equal(findings[0].file, "ca/b.md");
});

test("parity: the same headings, by level and in order", () => {
  const es = { "a.md": "## Uno\n\n### Dos\n" };
  assert.deepEqual(parity({ es, ca: { "a.md": "## Un\n\n### Dos\n" }, en: { "a.md": "## One\n\n### Two\n" } }), []);
  assert.deepEqual(rules(parity({ es, ca: { "a.md": "## Un\n\n## Dos\n" }, en: { "a.md": "## One\n" } })), ["parity-headings", "parity-headings"]);
});

test("parity: the same keys of the frontmatter", () => {
  const page = (keys) => `---\n${keys.map((k) => `${k}: x`).join("\n")}\n---\n`;
  const findings = parity({ es: { "a.md": page(["title", "description"]) }, ca: { "a.md": page(["title"]) }, en: { "a.md": page(["title", "description"]) } });
  assert.deepEqual(rules(findings), ["parity-frontmatter"]);
});

test("parity: the same commands and outputs; a comment may be translated", () => {
  const page = (body) => "```bash\n" + body + "\n```\n";
  const es = { "a.md": page("npm test   # mide de nuevo") };
  assert.deepEqual(parity({ es, ca: { "a.md": page("npm test   # mesura de nou") }, en: { "a.md": page("npm test   # measures again") } }), []);
  const findings = parity({ es, ca: es, en: { "a.md": page("npm run test") } });
  assert.deepEqual(rules(findings), ["parity-fences"]);
  assert.equal(findings[0].file, "en/a.md");
});

test("readme parity: the three files, with the same headings", () => {
  const ok = { "README.md": "# x\n## Requirements", "README.es.md": "# x\n## Requisitos", "README.ca.md": "# x\n## Requisits" };
  assert.deepEqual(readmeParity([{ dir: "experiments/a", files: ok }]), []);
  assert.deepEqual(rules(readmeParity([{ dir: ".", files: { ...ok, "README.ca.md": undefined } }])), ["readme-files"]);
  assert.deepEqual(rules(readmeParity([{ dir: ".", files: { ...ok, "README.es.md": "# x" } }])), ["readme-headings"]);
});

const deck = (...slides) => `<main>${slides.map(([title, body]) => `<section class="slide" data-title="${title}">${body}</section>`).join("\n")}</main>`;

test("slides: the same number of slides and the same structure in each one", () => {
  const es = deck(["Portada", "<h1>Taller</h1>"], ["Cierre", "<h2>Gracias</h2><p>Preguntas</p>"]);
  assert.deepEqual(slidesParity({ es, ca: es.replace("Gracias", "Gràcies"), en: deck(["Cover", "<h1>Workshop</h1>"], ["End", "<h2>Thanks</h2><p>Questions</p>"]) }), []);
  assert.deepEqual(rules(slidesParity({ es, ca: es, en: deck(["Cover", "<h1>Workshop</h1>"]) })), ["slides-count"]);
  const other = deck(["Cover", "<h1>Workshop</h1>"], ["End", "<h2>Thanks</h2><ul><li>Questions</li></ul>"]);
  const findings = slidesParity({ es, ca: es, en: other });
  assert.deepEqual(rules(findings), ["slides-structure"]);
  assert.match(findings[0].message, /slide 2/);
});

test("slides: a text left in Spanish in another language", () => {
  const es = deck(["INP y LoAF", "<h2>El Judge</h2><p>Automatizando Core Web Vitals en tu plataforma interna con MCP</p><code>npm run check</code>"]);
  const en = slidesParity({ es, ca: es, en: es }).filter((f) => f.file.includes("/en/"));
  assert.deepEqual(rules(en), ["slides-untranslated", "slides-untranslated", "slides-untranslated"]);
  // In Catalan "El Judge" is correct; "y" and "tu ... con" are not
  const ca = slidesParity({ es, ca: es, en: es }).filter((f) => f.file.includes("/ca/"));
  assert.deepEqual(ca.map((f) => f.message.match(/"(.+)"/)[1]), ["INP y LoAF", "Automatizando Core Web Vitals en tu plataforma interna con MCP"]);
});

test("slides: an exception of the allowlist is not a finding", () => {
  const es = deck(["Portada", "<p>Las reglas deciden</p>"]);
  assert.equal(slidesParity({ es, ca: es, en: es }).length, 2);
  assert.deepEqual(slidesParity({ es, ca: es, en: es }, { untranslated: [{ text: "Las reglas deciden", reason: "the motto" }] }), []);
});

test("lint: no em dashes and no emojis outside the code", () => {
  assert.deepEqual(rules(lint("a.md", "Una frase — con raya\n")), ["em-dash"]);
  assert.deepEqual(rules(lint("a.md", "Listo \u{1F680}\n")), ["emoji"]);
  assert.equal(lint("a.md", "Una frase\n")[0], undefined);
  assert.deepEqual(lint("a.md", "```text\n✔ passes — ok\n```\n"), []);
  assert.equal(lint("a.md", "uno\ndos — tres\n")[0].line, 2);
});

test("loops: a for loop over a list becomes one command for each value", () => {
  const loop = 'for branch in pr-a pr-b; do\n  CANDIDATE=$branch docker compose run --rm -e OUT=/out/ci/$branch ci\n  echo "$branch: exit $?"\ndone';
  assert.deepEqual(expandLoops(loop).filter((l) => l.includes("docker")), [
    "CANDIDATE=pr-a docker compose run --rm -e OUT=/out/ci/pr-a ci",
    "CANDIDATE=pr-b docker compose run --rm -e OUT=/out/ci/pr-b ci",
  ]);
  assert.deepEqual(expandLoops("npm test"), ["npm test"]);
});

const CONTEXT = {
  scripts: ["test", "check"],
  services: ["agents", "ci"],
  tags: ["workshop-start", "step-04-solution"],
  exists: (path) => ["agents/src/judge/findings.ts", "agents/test/judge/findings.test.ts", "agents/src/orchestrator.ts", "agents/src"].includes(path),
  step: { run: ["docker compose run --rm agents node src/orchestrator.ts lcp judge"], tests: ["test/judge/findings.test.ts"], check: "npm run check -- step-04" },
};
const GUIDE = `Escribe \`agents/src/judge/findings.ts\` y lee \`out/agents/judge/report.md\`.

\`\`\`bash
docker compose run --rm agents node --test test/judge/findings.test.ts
git checkout step-04-solution -- agents/src
docker compose run --rm agents node src/orchestrator.ts lcp judge
docker compose run --rm agents npm run check -- step-04
\`\`\`
`;

test("references: a guide that names what exists has no findings", () => {
  assert.deepEqual(references("step-04.md", GUIDE, CONTEXT), []);
});

test("references: a script, a path, a tag or a service that does not exist", () => {
  const of = (text) => rules(references("step-04.md", GUIDE + text, CONTEXT));
  assert.deepEqual(of("```bash\ndocker compose run --rm agents npm run verify\n```"), ["ref-script"]);
  assert.deepEqual(of("Mira `agents/src/judge/facts.ts`."), ["ref-path"]);
  assert.deepEqual(of("```bash\ndocker compose run --rm agents node --test test/judge/facts.test.ts\n```"), ["ref-path"]);
  assert.deepEqual(of("```bash\ngit checkout step-07-solution -- agents/src\n```"), ["ref-tag"]);
  assert.deepEqual(of("```bash\ndocker compose run --rm judge npm test\n```"), ["ref-service"]);
});

test("references: without git tags, the rule is skipped and says so", () => {
  const findings = references("step-04.md", GUIDE, { ...CONTEXT, tags: null });
  assert.deepEqual(findings, []);
});

test("references: the guide of a step has the commands its check expects", () => {
  const without = (line) => GUIDE.split("\n").filter((l) => !l.includes(line)).join("\n");
  assert.deepEqual(rules(references("step-04.md", without("orchestrator.ts"), CONTEXT)), ["ref-step-run"]);
  assert.deepEqual(rules(references("step-04.md", without("node --test"), CONTEXT)), ["ref-step-tests"]);
  assert.deepEqual(rules(references("step-04.md", without("npm run check"), CONTEXT)), ["ref-step-check"]);
});

test("links: an internal link to a page or an anchor that the build does not have", () => {
  const pages = {
    "index.html": '<a href="/es/stack/">ok</a> <a href="/es/stack/#por-que">ok</a> <a href="/es/nada/">ko</a> <a href="/es/stack/#nada">ko</a> <a href="https://web.dev/">out</a>',
    "es/stack/index.html": '<h2 id="por-que">Por qué</h2> <a href="../../">ok</a> <a href="#por-que">ok</a> <a href="#roto">ko</a>',
  };
  const findings = internalLinks(pages, ["slides/slides.css"]);
  assert.deepEqual(findings.map((f) => `${f.file} ${f.message.match(/\S+$/)[0]}`), ["index.html /es/nada/", "index.html /es/stack/#nada", "es/stack/index.html #roto"]);
  assert.deepEqual(internalLinks({ "slides/index.html": '<link href="slides.css">' }, ["slides/slides.css"]), []);
});

test("links: the external links of a text, once each", () => {
  const page = "Ver [a](https://web.dev/articles/lcp) y [b](https://web.dev/articles/lcp#x), no `http://shop-baseline:3000/`.\n\n```text\nhttp://shop-baseline:3000/\n```\n";
  assert.deepEqual(externalLinksOf("a.md", page), ["https://web.dev/articles/lcp"]);
  assert.deepEqual(externalLinksOf("a.html", '<a href="https://web.dev/">web.dev</a>.'), ["https://web.dev/"]);
});

// The repo itself. Each rule has its test, so a failure names what is wrong.
const repo = checkRepo();
const of = (prefix) => repo.findings.filter((f) => f.rule.startsWith(prefix)).map((f) => `${f.file}:${f.line ?? ""}: ${f.rule}: ${f.message}`);

for (const [name, prefix] of [
  ["the docs have the same files, headings, frontmatter and commands in the three languages", "parity-"],
  ["the READMEs come in the three languages with the same headings", "readme-"],
  ["the slides have the same structure and no text left in Spanish", "slides-"],
  ["no em dashes in the documentation", "em-dash"],
  ["no emojis in the documentation", "emoji"],
  ["the guides name scripts, paths, tags and services that exist, and the commands of their check", "ref-"],
]) {
  test(`repo: ${name}`, () => assert.deepEqual(of(prefix), []));
}

test("repo: the rules that need git ran", () => assert.deepEqual(repo.skipped, []));
