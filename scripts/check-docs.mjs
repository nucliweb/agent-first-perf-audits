// The checker of the documentation. Without flags it reads the repo and needs no network:
//   node scripts/check-docs.mjs
// - the docs have the same files, headings, frontmatter keys and code blocks in es, ca and en
// - the READMEs come in the three languages with the same headings
// - the three slide decks have the same structure, and no text of ca or en is left in Spanish
// - no em dashes and no emojis outside the code
// - the guides of the workshop name scripts, paths, tags and services that exist, and each one has
//   the commands that the check of its step expects (agents/src/check.ts)
// With --dist docs/dist it also checks the internal links and anchors of the built site, and with
// --external, the external links of the sources (this one needs network).
// It prints a line for each finding and exits with 1 when there is any.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { fencesOf, frontmatterKeysOf, headingsOf, inlineCodeOf, isShell, proseOf, withoutInlineCode } from "./lib/markdown.mjs";
import { STEPS, testsOf } from "../agents/src/check.ts";

const ROOT = join(import.meta.dirname, "..");
const DOCS = "docs/src/content/docs";
const LANGS = ["es", "ca", "en"];
const DECKS = { es: "docs/public/slides/index.html", ca: "docs/public/slides/ca/index.html", en: "docs/public/slides/en/index.html" };
const READMES = ["README.md", "README.es.md", "README.ca.md"];

const lineOf = (text, index) => text.slice(0, index).split("\n").length;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- Parity of the docs ---------------------------------------------------------------------------

// The code blocks as they have to match: a comment of a shell block may be translated
function comparableFences(text) {
  return fencesOf(text).map((fence) => ({
    lang: fence.lang,
    body: fence.body
      .split("\n")
      .map((line) => (isShell(fence) ? line.replace(/(^|\s)#.*$/, "") : line).trimEnd())
      .filter((line) => !isShell(fence) || line.trim())
      .join("\n"),
  }));
}

// docs: { es: { "workshop/step-01.md": text }, ca: {...}, en: {...} }. Spanish is the source.
export function parity(docs, root = "") {
  const findings = [];
  const add = (lang, file, rule, message, line) => findings.push({ file: `${root}${lang}/${file}`, line, rule, message });
  for (const lang of LANGS.filter((l) => l !== "es")) {
    for (const file of Object.keys(docs.es).filter((f) => !(f in docs[lang]))) add(lang, file, "parity-files", `missing: es has ${file}`);
    for (const file of Object.keys(docs[lang]).filter((f) => !(f in docs.es))) add(lang, file, "parity-files", `no Spanish source for ${file}`);
    for (const file of Object.keys(docs.es).filter((f) => f in docs[lang])) {
      const [source, other] = [docs.es[file], docs[lang][file]];
      const [sh, oh] = [headingsOf(source), headingsOf(other)];
      if (!same(sh.map((h) => h.level), oh.map((h) => h.level))) {
        const at = sh.findIndex((h, i) => h.level !== oh[i]?.level);
        const where = at === -1 ? oh[sh.length] : sh[at];
        add(lang, file, "parity-headings", `${oh.length} headings against ${sh.length} in es; they differ at "${where.text}"`, (at === -1 ? where : oh[at])?.line);
      }
      if (!same(frontmatterKeysOf(source), frontmatterKeysOf(other))) {
        add(lang, file, "parity-frontmatter", `keys ${frontmatterKeysOf(other).join(", ")} against ${frontmatterKeysOf(source).join(", ")} in es`, 1);
      }
      const [sf, of] = [comparableFences(source), comparableFences(other)];
      const at = sf.length === of.length ? sf.findIndex((f, i) => !same(f, of[i])) : Math.min(sf.length, of.length);
      if (sf.length !== of.length) add(lang, file, "parity-fences", `${of.length} code blocks against ${sf.length} in es`);
      else if (at !== -1) add(lang, file, "parity-fences", `code block ${at + 1} (${sf[at].lang}) is not the one of es`, fencesOf(other)[at].line);
    }
  }
  return findings;
}

// groups: [{ dir, files: { "README.md": text, "README.es.md": text, "README.ca.md": text } }]
export function readmeParity(groups) {
  const findings = [];
  for (const { dir, files } of groups) {
    const missing = READMES.filter((name) => files[name] === undefined);
    for (const name of missing) findings.push({ file: join(dir, name), rule: "readme-files", message: "missing" });
    if (missing.length) continue;
    const levels = (name) => headingsOf(files[name]).map((h) => h.level);
    for (const name of READMES.slice(1)) {
      if (!same(levels(name), levels("README.md"))) {
        findings.push({ file: join(dir, name), rule: "readme-headings", message: `${levels(name).length} headings against ${levels("README.md").length} in README.md, or at other levels` });
      }
    }
  }
  return findings;
}

// --- Slides ---------------------------------------------------------------------------------------

// Words that mark a text as Spanish. Catalan shares many (el, la, de, que, en, un, una), so its list
// only has the ones Catalan does not use.
const SPANISH = {
  ca: ["y", "los", "las", "con", "para", "por", "más", "sin", "tu", "su", "lo"],
  en: ["y", "el", "la", "los", "las", "de", "del", "que", "con", "en", "para", "por", "un", "una", "más", "sin", "tu", "su", "lo", "al", "se"],
};

const decode = (text) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ");

// Each slide of a deck: its title, its tags in order and its texts outside code and pre
export function slidesOf(html) {
  return [...html.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)].map((section) => {
    const [, attrs, body] = section;
    const tags = [];
    const texts = [];
    const title = attrs.match(/data-title="([^"]*)"/)?.[1];
    if (title) texts.push(decode(title));
    const open = [];
    for (const [, close, tag, text] of body.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>|([^<]+)/g)) {
      if (tag && close) open.splice(open.lastIndexOf(tag), 1);
      else if (tag) {
        tags.push(tag);
        if (!["img", "br", "hr", "input", "meta", "link"].includes(tag)) open.push(tag);
      } else if (text.trim() && !open.includes("code") && !open.includes("pre")) texts.push(decode(text.replace(/\s+/g, " ").trim()));
    }
    return { tags, texts, line: lineOf(html, section.index) };
  });
}

const words = (text) => text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);

// decks: { es: html, ca: html, en: html }. allow.untranslated: [{ text, reason }]
export function slidesParity(decks, allow = {}) {
  const findings = [];
  const allowed = new Set((allow.untranslated ?? []).map((entry) => entry.text));
  const source = slidesOf(decks.es);
  for (const lang of LANGS.filter((l) => l !== "es")) {
    const file = DECKS[lang];
    const slides = slidesOf(decks[lang]);
    if (slides.length !== source.length) {
      findings.push({ file, rule: "slides-count", message: `${slides.length} slides against ${source.length} in es` });
      continue;
    }
    slides.forEach((slide, i) => {
      if (!same(slide.tags, source[i].tags)) {
        const at = slide.tags.findIndex((tag, j) => tag !== source[i].tags[j]);
        const detail = at === -1 ? `${slide.tags.length} tags against ${source[i].tags.length}` : `<${slide.tags[at]}> where es has <${source[i].tags[at]}>`;
        findings.push({ file, line: slide.line, rule: "slides-structure", message: `slide ${i + 1} is not built like the one of es: ${detail}` });
      }
      for (const text of slide.texts) {
        if (!source[i].texts.includes(text) || allowed.has(text)) continue;
        if (words(text).some((word) => SPANISH[lang].includes(word))) {
          findings.push({ file, line: slide.line, rule: "slides-untranslated", message: `slide ${i + 1} has a text left in Spanish: "${text}"` });
        }
      }
    });
  }
  return findings;
}

// --- Lint -----------------------------------------------------------------------------------------

// Em dashes and emojis, outside the fences of a Markdown page and anywhere in an HTML one
export function lint(file, text) {
  const all = file.endsWith(".html") ? text.split("\n").map((line, i) => ({ line: i + 1, text: line })) : proseOf(text);
  return all.flatMap((l) => [
    ...(l.text.includes("—") ? [{ file, line: l.line, rule: "em-dash", message: l.text.trim().slice(0, 80) }] : []),
    ...(/\p{Extended_Pictographic}/u.test(l.text) ? [{ file, line: l.line, rule: "emoji", message: l.text.trim().slice(0, 80) }] : []),
  ]);
}

// --- References of the guides ----------------------------------------------------------------------

// The lines of a shell block, with a `for x in a b; do ... done` loop written out for each value
export function expandLoops(body) {
  const out = [];
  let loop = null;
  for (const line of body.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const start = line.match(/^for (\w+) in (.+?);\s*do$/);
    if (start) loop = { name: start[1], values: start[2].split(/\s+/), lines: [] };
    else if (loop && line === "done") {
      for (const value of loop.values) out.push(...loop.lines.map((l) => l.replace(new RegExp(`\\$\\{?${loop.name}\\}?`, "g"), value)));
      loop = null;
    } else if (loop) loop.lines.push(line);
    else out.push(line);
  }
  return out;
}

const REPO_PATH = /^(agents|apps|scripts|docs|experiments|docker)\/[\w./-]+$/;
const AGENTS_PATH = /^(src|test|journeys|schemas)\/[\w./-]+$/;
const repoPathOf = (token) => (REPO_PATH.test(token) ? token : AGENTS_PATH.test(token) ? `agents/${token}` : null)?.replace(/\/$/, "");

// The services a docker compose command names
function servicesOf(command) {
  const args = command.match(/docker compose (run|exec|up)\b(.*)/);
  if (!args) return [];
  const tokens = args[2].trim().split(/\s+/).filter(Boolean);
  const services = [];
  for (let i = 0; i < tokens.length; i++) {
    if (["-e", "-v", "-u", "-w", "-p", "--name", "--entrypoint"].includes(tokens[i])) i++;
    else if (!tokens[i].startsWith("-")) {
      services.push(tokens[i]);
      if (args[1] !== "up") break;
    }
  }
  return services;
}

// context: { scripts, services, tags (null when git has none), exists(path), step: { run, tests, check } }
export function references(file, text, context) {
  const findings = [];
  const seen = new Set();
  const add = (rule, message, line) => {
    if (!seen.has(rule + message)) findings.push({ file, line, rule, message });
    seen.add(rule + message);
  };
  const commands = fencesOf(text).filter(isShell).flatMap((fence) => expandLoops(fence.body).map((command) => ({ command, line: fence.line })));
  const inline = inlineCodeOf(text);

  for (const { command, line } of commands) {
    for (const [, script] of command.matchAll(/npm run ([\w:-]+)/g)) {
      if (!context.scripts.includes(script)) add("ref-script", `no npm script ${script} in agents/package.json`, line);
    }
    for (const service of servicesOf(command)) {
      if (!context.services.includes(service)) add("ref-service", `no service ${service} in compose.yaml`, line);
    }
  }
  const tokens = [...commands.flatMap((c) => c.command.split(/\s+/).map((code) => ({ code, line: c.line }))), ...inline];
  for (const { code, line } of tokens) {
    const path = repoPathOf(code);
    if (path && !context.exists(path)) add("ref-path", `${code} does not exist`, line);
  }
  if (context.tags) {
    for (const { code, line } of [...commands.map((c) => ({ code: c.command, line: c.line })), ...inline]) {
      for (const [tag] of code.matchAll(/\b(workshop-start|step-\d\d-solution)\b/g)) {
        if (!context.tags.includes(tag)) add("ref-tag", `no git tag ${tag}`, line);
      }
    }
  }
  if (context.step) {
    const has = (wanted) => commands.some((c) => c.command.replace(/\s+/g, " ").includes(wanted));
    const missing = context.step.run.filter((command) => !has(command));
    if (missing.length) add("ref-step-run", `the check of the step expects: ${missing.join(" | ")}`);
    const untested = context.step.tests.filter((test) => !commands.some((c) => c.command.includes("--test") && c.command.includes(test)));
    if (untested.length) add("ref-step-tests", `no command runs the tests of the step: ${untested.join(" ")}`);
    if (!has(context.step.check)) add("ref-step-check", `no command runs ${context.step.check}`);
  }
  return findings;
}

// --- Links ----------------------------------------------------------------------------------------

// pages: { "es/stack/index.html": html } of a built site; assets: its other files
export function internalLinks(pages, assets = []) {
  const findings = [];
  const files = new Set([...Object.keys(pages), ...assets]);
  const target = (pathname) => {
    const path = decodeURIComponent(pathname).replace(/^\//, "");
    return [path, `${path}index.html`, `${path}/index.html`, `${path}.html`].map((p) => p.replace(/^\//, "")).find((p) => files.has(p));
  };
  for (const [file, html] of Object.entries(pages)) {
    for (const [, href] of html.matchAll(/\s(?:href|src)="([^"]*)"/g)) {
      if (!href || /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
      const url = new URL(href, `http://site/${file}`);
      const found = target(url.pathname);
      const id = decodeURIComponent(url.hash.slice(1));
      if (!found) findings.push({ file, rule: "link", message: `no page for ${href}` });
      else if (id && found in pages && !new RegExp(`\\sid="${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(pages[found])) {
        findings.push({ file, rule: "link", message: `no anchor for ${href}` });
      }
    }
  }
  return findings;
}

// The external links of a source file, without the hash and once each
export function externalLinksOf(file, text) {
  const lines = file.endsWith(".html") ? text.split("\n") : proseOf(text).map((l) => withoutInlineCode(l.text));
  const urls = lines.flatMap((line) => [...line.matchAll(/https?:\/\/[^\s)"'<>`\]]+/g)].map((m) => m[0].replace(/#.*$/, "").replace(/[.,;:]+$/, "")));
  return [...new Set(urls)];
}

async function status(url) {
  for (const method of ["HEAD", "GET"]) {
    try {
      const response = await fetch(url, { method, redirect: "follow", headers: { "user-agent": "docs-link-check" }, signal: AbortSignal.timeout(20_000) });
      if (response.status < 400) return response.status;
      if (method === "GET") return response.status;
    } catch (error) {
      if (method === "GET") return error.cause?.code ?? error.name;
    }
  }
}

// urls: Map of url to the first file that has it
export async function externalLinks(urls, concurrency = 6) {
  const findings = [];
  const queue = [...urls];
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const [url, file] = next;
        const result = await status(url);
        if (typeof result !== "number" || result >= 400) findings.push({ file, rule: "external-link", message: `${result} for ${url}` });
      }
    }),
  );
  return findings;
}

// --- The repo -------------------------------------------------------------------------------------

const read = (root, path) => readFileSync(join(root, path), "utf8");
const walk = (dir) => readdirSync(dir, { recursive: true, encoding: "utf8" }).filter((file) => statSync(join(dir, file)).isFile());

function git(root, ...args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

// The files the rules read, by their path in the repo
export function sourcesOf(root = ROOT) {
  const docs = Object.fromEntries(
    LANGS.map((lang) => [lang, Object.fromEntries(walk(join(root, DOCS, lang)).filter((f) => /\.mdx?$/.test(f)).map((f) => [f, read(root, join(DOCS, lang, f))]))]),
  );
  const dirs = [".", ...readdirSync(join(root, "experiments"), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join("experiments", e.name))];
  const readmes = dirs.map((dir) => ({ dir, files: Object.fromEntries(READMES.map((name) => [name, existsSync(join(root, dir, name)) ? read(root, join(dir, name)) : undefined])) }));
  const decks = Object.fromEntries(LANGS.map((lang) => [lang, read(root, DECKS[lang])]));
  const all = new Map([
    ...LANGS.flatMap((lang) => Object.entries(docs[lang]).map(([file, text]) => [join(DOCS, lang, file), text])),
    ...readmes.flatMap(({ dir, files }) => Object.entries(files).filter(([, text]) => text !== undefined).map(([name, text]) => [join(dir, name), text])),
    ...LANGS.map((lang) => [DECKS[lang], decks[lang]]),
  ]);
  return { docs, readmes, decks, all };
}

export function checkRepo(root = ROOT) {
  const { docs, readmes, decks, all } = sourcesOf(root);
  const allow = JSON.parse(read(root, "scripts/check-docs.allowlist.json"));
  const skipped = [];

  const tags = git(root, "tag", "--list")?.split("\n").filter(Boolean) ?? [];
  if (!tags.length) skipped.push("ref-tag: this clone has no git tags");
  const branch = ["workshop", "origin/workshop"].find((ref) => git(root, "rev-parse", "--verify", "--quiet", ref));
  const context = {
    scripts: Object.keys(JSON.parse(read(root, "agents/package.json")).scripts),
    services: [...read(root, "compose.yaml").split(/^services:$/m)[1].split(/^\S/m)[0].matchAll(/^ {2}([\w-]+):/gm)].map((m) => m[1]),
    tags: tags.length ? tags : null,
    exists: (path) => existsSync(join(root, path)) || (branch !== undefined && git(root, "cat-file", "-e", `${branch}:${path}`) !== null),
  };

  const findings = [
    ...parity(docs, `${DOCS}/`),
    ...readmeParity(readmes),
    ...slidesParity(decks, allow),
    ...[...all].flatMap(([file, text]) => lint(file, text)),
    ...Object.entries(docs.es)
      .filter(([file]) => file.startsWith("workshop/"))
      .flatMap(([file, text]) => {
        const name = file.match(/step-\d\d/)?.[0];
        const step = name in STEPS ? { run: STEPS[name].run, tests: testsOf(Number(name.slice(-2))), check: `npm run check -- ${name}` } : undefined;
        return references(join(DOCS, "es", file), text, { ...context, step });
      }),
  ];
  return { findings, skipped };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const { findings, skipped } = checkRepo();
  const ran = ["the sources"];

  if (args.includes("--dist")) {
    const dist = join(process.cwd(), args[args.indexOf("--dist") + 1]);
    const files = walk(dist);
    const pages = Object.fromEntries(files.filter((f) => f.endsWith(".html")).map((f) => [f, readFileSync(join(dist, f), "utf8")]));
    findings.push(...internalLinks(pages, files.filter((f) => !f.endsWith(".html"))).map((f) => ({ ...f, file: join(relative(ROOT, dist), f.file) })));
    ran.push(`the internal links of ${Object.keys(pages).length} pages`);
  }
  if (args.includes("--external")) {
    const urls = new Map();
    for (const [file, text] of sourcesOf().all) for (const url of externalLinksOf(file, text)) if (!urls.has(url)) urls.set(url, file);
    findings.push(...(await externalLinks(urls)));
    ran.push(`${urls.size} external links`);
  }

  for (const f of findings) console.log(`${f.file}:${f.line ?? ""}: ${f.rule}: ${f.message}`);
  for (const note of skipped) console.log(`skipped: ${note}`);
  console.log(`\n${findings.length} finding(s) in ${ran.join(", ")}.`);
  process.exitCode = findings.length ? 1 : 0;
}
