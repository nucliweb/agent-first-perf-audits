---
title: "Step 1: the first call to an MCP"
description: Record the trace of the shop load from the container with Chrome DevTools MCP.
sidebar:
  order: 11
---

## What you will learn

- What an MCP tool is and how a program calls it, with no editor or chat in between.
- How to record the trace of a page load from a container, with Chrome DevTools MCP.
- The rhythm of each step of the workshop: red tests, solution with `git`, green tests, measurement and check.

## Time

This step has 15 minutes in the agenda. The machine time is measured on the reference Mac, with the [timed rehearsal](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.md):

| | `llm` | `lite` |
|---|---|---|
| Machine time of the step | 0.8 min | 0.8 min |

No command in this step takes a minute.

## The idea in a minute

An MCP server publishes tools: actions with a name and some arguments. Whoever calls them is a client. In an editor, the client is the agent of the chat; here it is a program, and that is all it takes for it to "look" at a page: open it, record its load and leave the result in a file. It is what the LCP subagent will do later.

<img src="/diagrams/lab.svg" alt="The services of the lab: agents and ci measure shop-baseline and shop-candidate, which load the scripts of thirdparty; agents asks ollama for the explanation and writes the reports in out/" width="960" height="420" loading="lazy" decoding="async">

Everything runs in the Docker Compose lab. The program lives in the `agents` service, which starts Chrome DevTools MCP as a separate process and, through it, a headless Chrome. The pages it looks at are the two shops: `shop-baseline`, built from `main`, and `shop-candidate`, built from the branch being compared. This step only uses the first one.

## Before you start

With the images pulled and the preflight green, create your branch from the start of the workshop and start the lab:

```bash
git fetch origin workshop --tags
git switch -c taller workshop-start
docker compose up -d
```

Every command of the workshop runs in your terminal, from the root of the repo. With the `lite` profile, put `COMPOSE_PROFILES=lite` in front of each `docker compose` command.

In each step, the code that does the work starts as a `throw` that names the step and its tests. You see it fail, apply the solution with `git` and see it work. Writing it yourself is optional: the last section of each step explains how.

## Step by step

1. Run the tests of the step:

   ```bash
   docker compose run --rm agents node --test test/mcp/trace.test.ts
   ```

   The 2 tests fail (`fail 2`) with this message:

   ```text
   Step 1 of the workshop: record the load of url with Chrome DevTools MCP. Its tests: test/mcp/trace.test.ts
   ```

   It is the starting point, not an error: `recordTrace`, in `agents/src/mcp/trace.ts`, is still a `throw`.

2. Apply the solution of the step:

   ```bash
   git checkout step-01-solution -- agents/src
   ```

   It prints nothing. There is nothing to rebuild or restart: the container reads `agents/src` from your copy of the repo.

3. Run the tests again:

   ```bash
   docker compose run --rm agents node --test test/mcp/trace.test.ts
   ```

   Both pass (`pass 2`). They take a few seconds because they record a local page with a real Chrome.

4. Record the load of the home of the shop:

   ```bash
   docker compose run --rm agents node src/first-trace.ts
   ```

   When it finishes, it prints:

   ```text
   [first-trace] http://shop-baseline:3000/ -> /out/first-trace.json
   ```

   `/out` inside the container is the `out/` folder of the repo: the trace is in `out/first-trace.json`.

5. Open the trace in your Chrome: DevTools, Performance panel, the "Load profile" button and the file `out/first-trace.json`. It is the same thing an agent gets: about 2 MB of events. That is why, later on, the subagents do not pass it whole to the LLM.

6. Run the check of the step:

   ```bash
   docker compose run --rm agents npm run check -- step-01
   ```

   ```text
   step-01: The first call to an MCP server

     OK  tests: test/mcp/trace.test.ts
     OK  out/first-trace.json

   step-01 is done.
   ```

   If a line says `KO`, the check tells you which command is missing.

## Checkpoint

On screen, `step-01 is done.`, and in the `out/` folder a `first-trace.json` that opens in the Performance panel of DevTools.

## If something fails

| What you see | Why | What to do |
|---|---|---|
| `fatal: a branch named 'taller' already exists` | You already created the branch in another session | `git switch taller` |
| The tests of point 1 pass instead of failing | `agents/src` already has the solution, from a previous session | Carry on from point 4. To start from scratch, `git checkout workshop-start -- agents/src` |
| `KO  out/first-trace.json: missing` in the check | Point 4 is missing | The check prints the command below "To make the files of out/, run:" |
| With 8 GB, Compose downloads and starts `ollama` | `COMPOSE_PROFILES=lite` is missing in front of the command | `export COMPOSE_PROFILES=lite` in that terminal, and it applies to every command |

If the lab does not start, the runtime failures are in [Setup](../../setup/#the-most-frequent-failures).

## What you take away

- An MCP tool is an action with a name and arguments. An agent "looks" at a page by calling them, and a program can do the same.
- The trace of a load weighs about 2 MB: it is evidence for people and for tools, not a prompt.
- The rhythm of each step: red, solution, green, measurement and check.

To think about: of what you look at by hand in DevTools today, what could a program ask for by name?

## What the code you applied does

To see it:

```bash
git diff workshop-start -- agents/src/mcp/trace.ts
```

`recordTrace(url, file, emulation?)` takes the URL of the page, the file to save the trace to and, optionally, an emulation (throttling and viewport). It returns nothing: it leaves the trace in `file`.

Everything happens in that code, inside the container: nobody opens Chrome or the DevTools console. The code starts Chrome DevTools MCP as a separate process and asks it for actions by name; the server runs them in a headless Chrome. To talk to it, it uses two functions from `agents/src/mcp/client.ts`:

- `connect("devtools")` starts the server over stdio and returns a client, which is closed with `client.close()` also if something fails.
- `callTool(client, name, args)` asks the server to run the tool `name` with `args`, and turns a server error into an exception with its message.

For example, opening the page is `await callTool(client, "navigate_page", { type: "url", url })`. `recordTrace` uses three tools:

| Tool (`name`) | Arguments (`args`) | What for |
|---|---|---|
| `emulate` | the `emulation` object as is, for example `{ cpuThrottlingRate: 4, networkConditions: "Fast 4G", viewport: "412x823x1,mobile,touch" }` | Only if it is given an emulation |
| `navigate_page` | `{ type: "url", url }` | Open the page |
| `performance_start_trace` | `{ reload: true, autoStop: true, filePath }` | Reload, record the load and stop on its own, with the trace in `filePath` |

## If you want to write it yourself (optional)

Instead of point 2, write the body of `recordTrace` in `agents/src/mcp/trace.ts`, between the markers `// workshop: step 1` and `// workshop: end`, with the tools of the table above. Then carry on from point 3: the tests tell you whether you have it. If you get stuck, point 2 overwrites what you wrote with the solution.

Hints:

- Chrome DevTools MCP only writes files inside its client's temporary folder: the SDK client does not negotiate MCP roots, and the server warns about it at startup. Record to a folder in `tmpdir()` (for example with `mkdtemp`) and copy the file to `file` afterwards. The full story is in [Learnings](../../learnings/), in "Chrome DevTools MCP outside the editor".
- `file` may be in a folder that does not exist yet: create it with `mkdir(..., { recursive: true })`.
- The server creates the trace for its user only. Make it readable by everyone (`chmod` to `0o644`), like the rest of the files in `out/`.
