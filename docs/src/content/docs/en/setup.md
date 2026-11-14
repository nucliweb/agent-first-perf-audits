---
title: Setup
description: What your machine needs, how to download the lab at home and how to check it is ready before the workshop.
sidebar:
  order: 2
---

The whole workshop runs on your laptop with Docker Compose, with no API keys. The only thing it asks is to download the images beforehand: they are several GB and the Wi-Fi of an event cannot handle everyone. Do this page at home, with a good connection.

This is what you download: two shops, the third-party mocks, the agents and the model, on a network with no internet access.

<img src="/diagrams/lab.svg" alt="The services of the lab: agents and ci measure shop-baseline and shop-candidate, which load the scripts of thirdparty; agents asks ollama for the explanation and writes the reports in out/" width="960" height="420" loading="lazy" decoding="async">

## What you need

- **16 GB of RAM.** With 8 GB you can follow the workshop with the `lite` profile, with no local model (below).
- **A container runtime** with the `docker compose` command, Compose v2.20.2 or later (`docker compose version`), and **at least 8 GB assigned to its virtual machine**. In Docker Desktop the default value is usually lower: it is the most frequent failure.
  - Docker Desktop and OrbStack: as they are.
  - Colima: start it with enough memory, for example `colima start --memory 8 --cpu 4`.
  - Podman: with its Docker-compatible mode and the `docker compose` command, not `podman-compose`.
- **15 GB of free disk.**
- **macOS, Linux or Windows with WSL2**, git and an editor. Node is not needed: everything runs inside the containers.

The lab is tested with Docker Desktop on macOS. On the other runtimes, the preflight says what to change if something does not fit.

## Download and check

```bash
git clone https://github.com/nucliweb/agent-first-perf-audits.git
cd agent-first-perf-audits
scripts/preflight.sh
```

The preflight does three things, and writes `OK` or `KO` on each:

1. **Checks the machine**: the runtime, the Compose version, the architecture, the memory of the virtual machine, the regression branches and the free disk.
2. **Downloads the images**: the lab and the shop of each branch.
3. **Runs a smoke test** inside Compose: Chromium starts, a trace is recorded, the two shops respond, the lab has no access to the internet and the local model answers.

Each `KO` says what to change in your runtime. When it exits with 0, the machine is ready.

On Windows, from PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1
```

From WSL2, `scripts/preflight.sh` works.

## With 8 GB: the lite profile

The local model is what asks for the most memory. The `lite` profile does not download or start it:

```bash
COMPOSE_PROFILES=lite scripts/preflight.sh
```

With `lite` you do not miss the workshop. This is what changes:

| | `llm` profile (default) | `lite` profile |
|---|---|---|
| Subagent measurements | Yes | Yes |
| Gate verdict | Yes | Yes, the same |
| Attribution with the traces | Yes | Yes, the same |
| One-sentence explanation | The local model writes it | The report points to `handoff.md` |

`handoff.md` carries the same input the local model would receive (the verdict, the metrics, the trace summaries and the diff of the branch), with the prompt and the schema of the answer. You can pass it to an agent of your choice to get the explanation. Sending the diff of your code to an external service is a decision for each team: in the workshop the diff is that of a sample shop.

To use `lite` for the whole workshop, put the variable before each command or export it once in your terminal:

```bash
export COMPOSE_PROFILES=lite
```

## The downloads, by hand

The same thing the preflight downloads, in case you prefer to do it step by step:

```bash
docker compose --profile llm --profile run pull
for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
  CANDIDATE=$branch docker compose pull shop-candidate
done
```

The first line brings the model, the third-party mocks, the agents and the shop of `main`; the loop, the shop of each branch.

## The most frequent failures

| What you see | Why | What to do |
|---|---|---|
| `KO` on memory | The virtual machine of the runtime has less than 8 GB | Raise it in the settings of the runtime, or use the `lite` profile, which asks for 4 GB |
| `KO` on Compose | It is `podman-compose` or a version older than 2.20.2 | Install Docker Compose v2 and check `docker compose version` |
| `KO` on disk | There are not 15 GB free and some images are still to pull | Free some space; `docker system df` says how much Docker uses |
| `KO` on the branches | The clone does not have the `pr/*` branches | `git fetch origin` |
| `KO` on `out/`, which cannot be written | On Linux, Docker created the folder as root | `sudo chown -R "$(id -u):$(id -g)" out` |
| `KO` on the image download | Slow connection or full disk in the virtual machine | Run the preflight again: the images that finished are kept |

## Without Docker

If your machine cannot handle the lab, the four branches are deployed to see in the browser: [The branches in the browser](../previews/). It does not replace the workshop, but it lets you follow the explanations and see each regression in DevTools.

With the machine ready, review the [Concepts](../concepts/) and start with [step 1](../workshop/step-01/).
