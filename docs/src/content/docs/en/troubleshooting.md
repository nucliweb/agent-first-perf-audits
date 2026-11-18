---
title: Common problems
description: What to look at when the lab does not start, a measurement does not come out as in the guide or the local model does not answer, and how to start over.
sidebar:
  order: 93
---

Each guide has an "If something fails" section, with the failures of that step, and [Setup](../setup/#the-most-frequent-failures) has the ones about the installation. This page gathers the ones that do not belong to a particular step.

## Where to start

Three commands almost always say what is going on:

```bash
docker compose ps
docker compose run --rm agents npm run check -- step-03
scripts/preflight.sh
```

- `docker compose ps` lists the running services. `thirdparty`, `shop-baseline` and `shop-candidate` have to be there, and with the `llm` profile `ollama` too, all of them `healthy`. If one is missing, `docker compose up -d` starts it.
- The check of a step, here the one of step 3, gives an `OK` or a `KO` for each thing the step has to leave done, and prints the command that is missing.
- The preflight checks the computer and runs a smoke test in a separate lab, without touching yours. You can run it at any time except during a measurement.

| Where it fails | Where to look |
|---|---|
| When installing, or in the preflight | [Setup](../setup/#the-most-frequent-failures) |
| In a step | The "If something fails" section of its guide, from [step 1](../workshop/step-01/#if-something-fails) to [step 5](../workshop/step-05/#if-something-fails) |
| In a challenge | [Challenges](../challenges/#before-you-start) explains how to try a change in the shop |

## The lab

| What you see | Why | What to do |
|---|---|---|
| Docker stops responding, or a download hangs halfway | The disk of the Docker virtual machine is full | `docker system df` says how much each thing takes up. Free some space and restart the runtime before going on: an image downloaded with a full disk may have ended up broken |
| With 8 GB, Compose downloads or starts `ollama` | `COMPOSE_PROFILES=lite` is missing in that terminal | `export COMPOSE_PROFILES=lite`, and it applies to all the commands |
| You do not know which profile you are measuring with | The profile comes from `COMPOSE_PROFILES`, or from the `.env` file of the repo, which says `llm` | The first line that `ci` writes says it: `[ci] <branch> against main, llm profile` or `lite profile` |
| On Linux, a command cannot write to `out/` | Docker created the folder as root | `sudo chown -R "$(id -u):$(id -g)" out` |
| The shop of the lab does not open in the browser | The lab does not publish ports, and its network has no access to the internet | The same shops are deployed: [The branches in the browser](../previews/) |
| A command inside the container cannot download anything | It is the same network with no access: what the gate measures does not depend on the internet | Whatever has to be downloaded is downloaded outside, with the preflight or with `scripts/build-shop.sh` |

## The measurements

| What you see | Why | What to do |
|---|---|---|
| Your figures are not the ones in the guide | Each run measures again, and each machine is different | Compare the two sides with each other. What has to match the guide is the verdict and the phase or function that changes |
| The two shops measure the same | The candidate shop is not the one you think: without `CANDIDATE`, the lab uses `pr-noop-refactor` | Put `CANDIDATE=<branch>` before the command, with the branch name written with hyphens: `pr-lcp-hero-lazy` |
| A branch with a regression passes the gate | Its metric was left as inconclusive, and the report says so at the top | Run the gate again. Why it passes is in [Concepts](../concepts/#why-it-matters-how-many-times-you-measure) |
| `pr-noop-refactor` fails the gate | The machine was busy with something else during the measurement | Close whatever uses CPU and run that branch again |
| The INP of `pr/loaf-cart-handler` changes from one session to another | The handler does a fixed amount of work, and it takes less the faster the machine is going at that moment | Compare with the baseline of the same run, not with the figure of another day |
| A measurement takes much longer than in the Time table of its guide | Another load on the machine, or a slower computer than the reference one | Let it finish, and do not start another at the same time: two Chromium instances share the CPU and both measurements come out worse |

Measurements always go one at a time. It is the reason `docker compose up -d` does not start any Chromium, and the reason each command of the workshop waits for the previous one.

## The local model

The verdict does not depend on the model: the rules decide it before asking the model. What can fail is the explanation.

| What you see | Why | What to do |
|---|---|---|
| The report has the verdict, and an error where the explanation would go | The model did not answer, or answered something that does not match the schema | Check with `docker compose ps` that `ollama` is running, and run the command again |
| The explanation takes a long time | The model runs on the CPU, next to everything else | Wait. During the call it uses almost every core of the virtual machine, and it is normal for the computer to feel slow |
| The explanation names a single cause when there are several | The model is small, so it fits on a laptop | The facts of the rules, at the end of the report, give the others. For another explanation, `handoff.md` carries the same input: it is [challenge 2](../challenges/#challenge-2-ask-another-model-for-the-explanation) |
| The report has no explanation and points to `handoff.md` | You are on the `lite` profile, with no local model | It is expected: the verdict and the facts are the same |

## If you write your own code

Anyone who writes the subagents instead of applying the solution, or takes the flow to their platform, runs into the defaults of the MCP servers, which are designed for an editor:

| What you see | Why | What to do |
|---|---|---|
| `navigate_page` returns a validation error | Chrome DevTools MCP asks for a `pageId` in every page tool | Start the server with `--no-page-id-routing` |
| `Access denied` when saving a trace | The server only writes to its temporary directory | Record there and copy the file, or give it the folder with `--workspace` |
| `No usable sandbox!` | Chromium has no sandbox inside the container | `--chromeArg=--no-sandbox`, only in the container |
| The server cannot find the browser | The stdio client does not pass it your environment variables, `PLAYWRIGHT_BROWSERS_PATH` included | Pass it the path of the browser with `--executablePath`, as the workshop does, or install the Playwright Chromium in its default path |

The context of the four is in [Learnings](../learnings/#chrome-devtools-mcp-outside-the-editor), and the flags the workshop starts the server with are in `agents/src/mcp/client.ts`.

## Starting over

To repeat the workshop from step 1, with your `taller` branch just as it came out of `workshop-start`:

```bash
docker compose down
git checkout workshop-start -- agents/src
rm -rf out
mkdir out
docker compose up -d
```

The `out/` folder is created empty by hand so that on Linux Docker does not create it as root. It only has what the workshop commands write: the traces, the JSON of the subagents and the reports. The downloaded images are kept.

With the `lite` profile, export `COMPOSE_PROFILES=lite` first. On Linux, if `rm` cannot delete `out/`, run the `chown` of the table of the lab first.
