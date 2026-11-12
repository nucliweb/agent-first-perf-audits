---
title: "Step 1: the first call to an MCP"
description: Record the trace of the shop load from the container with Chrome DevTools MCP.
sidebar:
  order: 11
---

## Goal

Talk to an MCP server from code, with no editor or chat in between: open the shop home with Chrome DevTools MCP and record the trace of its load to a file. It is what the LCP subagent does later, and what any agent does when it "looks" at a page.

## Before you start

With the images downloaded and the preflight green, create your branch from the start of the workshop and bring up the lab:

```bash
git fetch origin workshop --tags
git switch -c taller workshop-start
docker compose up -d
```

With the `lite` profile, prefix each `docker compose` command with `COMPOSE_PROFILES=lite`.

## What you will write

The body of `recordTrace(url, file, emulation?)` in `agents/src/mcp/trace.ts`, between the `// workshop: step 1` and `// workshop: end` markers. At the start it is a `throw` that names the step and its tests.

It receives the page URL, the file to save the trace to and, optionally, an emulation (throttling and viewport). It returns nothing: it leaves the trace in `file`.

## The tools

- `connect("devtools")` from `agents/src/mcp/client.ts` starts Chrome DevTools MCP over stdio and returns a client. Always close it with `close()`, also if something fails.
- `callTool(client, name, args)` calls a tool and turns a server error into an exception with its message.

The three Chrome DevTools MCP tools you need:

| Tool | Arguments | What for |
|---|---|---|
| `emulate` | the `emulation` object as is, for example `{ cpuThrottlingRate: 4, networkConditions: "Fast 4G", viewport: "412x823x1,mobile,touch" }` | Only if you are given an emulation |
| `navigate_page` | `{ type: "url", url }` | Open the page |
| `performance_start_trace` | `{ reload: true, autoStop: true, filePath }` | Reload, record the load and stop on its own, with the trace in `filePath` |

## Hints

- Chrome DevTools MCP only writes files inside its client's temporary folder: the SDK client does not negotiate MCP roots, and the server warns about it at startup. Record to a folder in `tmpdir()` (for example with `mkdtemp`) and copy the file to `file` afterwards. The full story is in [Learnings](../../learnings/), in "Chrome DevTools MCP outside the editor".
- `file` can be in a folder that does not exist yet: create it with `mkdir(..., { recursive: true })`.
- The server creates the trace readable only by its user. Make it readable by everyone (`chmod` to `0o644`), like the rest of the files in `out/`.

## Check it

The tests record a local page with the real server, so they run inside the container:

```bash
docker compose run --rm agents node --test test/mcp/trace.test.ts
```

When they pass, record the home of the baseline shop:

```bash
docker compose run --rm agents node src/first-trace.ts
```

The trace ends up in `out/first-trace.json`. Open it in the Performance panel of Chrome DevTools: it is the same thing an agent receives, about 2 MB of events. That is why, later on, the subagents do not pass it whole to the LLM.

And the check for the step:

```bash
docker compose run --rm agents npm run check -- step-01
```

## If you fall behind

```bash
git checkout step-01-solution -- agents/src
```
