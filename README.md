# agent-first-perf-audits

English · [Castellano](README.es.md) · [Català](README.ca.md)

Repository of the workshop **Multi-Agent Performance Audits: Automatizando Core Web Vitals en tu plataforma interna con MCP**, by PerfReviews.

We build a performance gate for pull requests with agents: they measure a sample shop before and after a change, decide whether it has regressed and explain why. Everything runs on your laptop with Docker Compose, with no internet access.

The idea that runs through the workshop: **the rules decide, the LLM explains**. The verdict comes from the statistics of the WebPerf Snippets CLI (Mann-Whitney U, thresholds and exit code). A local model only writes up the cause from data that is already measured, with JSON output validated by a schema. If it contradicts the rules, the rules win.

## How it works

```
shop-baseline ─┐                         ┌─ verdict: WebPerf Snippets CLI (exit code)
               ├─ agents / ci ── Chromium ┤─ attribution: trace-engine-cli (function, URL, line)
shop-candidate ┘        │                 └─ explanation: llama3.2:3b in Ollama, or handoff
                    thirdparty
```

| Service | What it does |
|---|---|
| `shop-baseline` and `shop-candidate` | The Perf Coffee shop built from two git refs: `main` and the branch being compared |
| `thirdparty` | Local mocks of third-party scripts (analytics, chat, promo banner, A/B testing) |
| `agents` | Node 22, the Playwright Chromium, Chrome DevTools MCP, WebPerf Snippets and trace-engine-cli |
| `ci` | The gate for a PR: it measures, attributes, explains, writes the reports and exits with 0 or 1 |
| `ollama` | The local LLM of the Judge, with `llama3.2:3b` inside the image |

The comparison happens on the same machine and in the same run, so the difference between laptops does not affect the verdict.

## Requirements

- 16 GB of RAM. With 8 GB, the `lite` profile, with no local LLM.
- A container runtime with the `docker compose` command, Compose v2.20.2 or later (`docker compose version`), and **at least 8 GB allocated to the VM**. In Docker Desktop the default is usually lower.
  - Docker Desktop and OrbStack: as is.
  - Colima: start it with enough memory, for example `colima start --memory 8 --cpu 4`.
  - Podman: use its Docker-compatible mode and the `docker compose` command, not `podman-compose`, which does not cover everything the lab uses.

  Only Docker Desktop on macOS has been tested; the other runtimes will be tested before the workshop.
- 15 GB of free disk space.
- macOS, Linux or Windows with WSL2, and git.

Download the images at home: they take several GB and the Wi-Fi at an event is not enough for everyone.

## Getting started

At home, with a good connection:

```bash
git clone https://github.com/nucliweb/agent-first-perf-audits.git
cd agent-first-perf-audits
scripts/preflight.sh                                  # with 8 GB: COMPOSE_PROFILES=lite scripts/preflight.sh
```

The preflight checks the runtime, the Compose version, the architecture, the VM memory, the regression branches and the free disk space. Then it downloads all the images and runs a smoke test inside Compose: Chromium starts, a trace is recorded, both shops respond, the lab has no internet access and, with the `llm` profile, the model responds. It prints OK or KO for each step, with what to change in your runtime when something fails, and exits with 0 if the machine is ready.

On Windows, from PowerShell (Windows does not run scripts without `-ExecutionPolicy Bypass`):

```powershell
powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1
$env:COMPOSE_PROFILES = 'lite'; powershell -ExecutionPolicy Bypass -File scripts\preflight.ps1   # with 8 GB
```

From WSL2, `scripts/preflight.sh` works. The `.ps1` does the same as the `.sh`, but it has not been tested on Windows yet.

The preflight downloads, in case you prefer to do them by hand:

```bash
docker compose --profile llm --profile run pull       # Ollama, the mocks, agents and the main shop
for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
  CANDIDATE=$branch docker compose pull shop-candidate # the shop of each branch
done
```

`agents` and `ci` share an image and are in the `run` profile, which is not downloaded unless you ask for it: `docker compose up` starts the lab, not a Chromium that would share the CPU with the measurement.

To run the gate on a branch:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d       # both shops, the mocks and Ollama
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm ci
```

`ci` compares the `CANDIDATE` shop with the `BASELINE` one (by default, `main`) and writes to `out/`:

| File | Contents |
|---|---|
| `report.md`, `report.html` and `report.json` | The verdict of the rules, the metrics of each scenario and the explanation of each metric that regresses |
| `handoff.md` and `handoff.json` | The same input the local LLM receives, with the prompt and the schema, to pass it to another agent |
| `gate/` and `traces/` | The CLI reports and the Chromium traces |

The exit code of `ci` is the verdict: 0 if it passes, 1 if any metric regresses and 2 if the gate could not run.

The preflight creates `out/`. If you have not run it, on Linux create the folder before the first run (`mkdir out`): if it does not exist, Docker creates it as root and the container cannot write to it.

### The subagents

The orchestrator runs each subagent against the `BASELINE` shop and the `CANDIDATE` shop, one measurement after the other so that two Chromium instances do not share the CPU, and writes what it finds to `out/agents/`, one JSON per subagent and side:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts
CANDIDATE=pr-cls-promo-banner docker compose run --rm agents node src/orchestrator.ts cls   # one, with what it needs
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp judge
```

Without names it runs all the subagents and then the Judge; with names, only those and the ones they need, like the Navigator for the CLS one, and the Judge if it is named.

The Navigator goes first: on both shops it walks the four journeys in `agents/journeys/` (home, listing, product page and add to cart), step by step and with the gate throttling, and records the URL where each step leaves the page and the page errors. If the element of a step does not appear, the orchestrator stops with the journey, the side and the step: measuring a journey that does not finish gives figures that mean nothing. Each journey is a JSON with its page and its steps (`click`, `type`, `hover`, `scroll` and `wait`), the same format as the CLI `--interact-script`, and the gate measures add to cart with the same file.

The LCP subagent measures the home with the gate throttling (4x CPU and fast-4g) and the median of 3 runs. With WebPerf Snippets MCP it gets the LCP, its element, the breakdown into its four phases (TTFB, resource load delay, resource load time and render delay) and, when the LCP is an image, how it loads: `loading`, `fetchpriority`, whether it is preloaded and the audit warnings. With Chrome DevTools MCP it records a trace of the load in `out/agents/traces/`. It measures, it does not decide: the verdict belongs to the gate.

The CLS subagent measures each Navigator journey, from the load of its page to the last step, with the steps the Navigator has checked, the gate throttling and the median of 3 runs. With the `Layout-Shift-Loading-and-Interaction` snippet of WebPerf Snippets MCP it gets the CLS, how many shifts count and how many do not (those that follow an interaction) and the selectors of the nodes that move, from most to least. On `pr/cls-promo-banner`, the CLS goes from 0 to 0.053 on the home and to 0.0547 on the other three journeys, and the first node is always `main.main`: the banner pushes the page down.

The LoAF/INP subagent measures what blocks the main thread in each Navigator journey, with the `interaction` workflow of WebPerf Snippets MCP, the Navigator steps, the gate throttling and the median of 3 runs: the INP of the click with its three phases (input delay, processing and presentation), the long animation frames with the scripts that cause them and their invoker, and the long tasks. In the journeys with a click it also records a trace of the click with the same code as the Judge, and trace-engine-cli summarizes it: the snippets name the script and the trace names the function. On `pr/loaf-cart-handler`, the INP of add to cart goes from 32 to 192 ms in one run and from 16 to 96 ms in another, almost all of it processing, the script is the click handler (`DIV#root.onclick`) and the trace names `recommendFor`.

The Judge goes last and does the same as `ci`: the CLI gate, the traces, the rules and the explanation of the local LLM (or the handoff with `lite`), in `out/agents/judge/`. In addition, for each metric that regresses, its report adds the findings of the subagent that measures it, picked by rules: the LCP phases and the LCP image changes, the nodes that move for CLS, and the INP phases, the scripts that only the branch runs and the function from the trace. The LLM does not see them: it receives the same prompt as in `ci`, the one checked in the model benchmark.

### `lite` profile, for 8 GB machines

```bash
COMPOSE_PROFILES=lite scripts/preflight.sh            # or by hand: docker compose --profile run pull, everything except Ollama
COMPOSE_PROFILES=lite CANDIDATE=pr-lcp-hero-lazy docker compose up -d
COMPOSE_PROFILES=lite CANDIDATE=pr-lcp-hero-lazy docker compose run --rm ci
```

The branch shops are downloaded the same way as with the default profile.

Without Ollama, `ci` gives the same verdict and the same attribution, and the report points to the handoff for the explanation: `handoff.md` is pasted into the chat of an agent, for example in the cloud, and `handoff.json` is for a script. The handoff carries the branch diff and the trace summaries. **Sending it to an external service is a decision each team makes for its own code.**

The default profile, `llm`, is enabled by the repo `.env` file.

### Build the images locally

If you prefer not to download them, or you want to compare a branch of your own:

```bash
docker compose build thirdparty agents ollama         # without ollama with the lite profile
scripts/build-shop.sh main pr/lcp-hero-lazy           # one shop image per git ref
```

## The workshop step by step

In the workshop you write the core of each subagent: the functions that call the MCP servers and turn their responses into JSON. The `workshop` branch starts (tag `workshop-start`) with those functions as a `throw` that names the step, the task and its tests, between two `// workshop:` markers. Everything else already works: the lab, the orchestrator, the gate, the rules and the Judge explanation.

```bash
git fetch origin workshop --tags
git switch -c taller workshop-start                   # your branch, from the start of the workshop
```

The tip of the `workshop` branch is the complete solution: you start from the `workshop-start` tag.

`compose.yaml` mounts `agents/src`, `agents/test` and `agents/journeys` in the container, so what runs is what you write; the image only provides Node, Chromium and the dependencies. Each step has its check: it runs its tests and looks at the files it leaves in `out/`, and if any is missing it says what to run.

```bash
docker compose run --rm agents npm run check -- step-02
```

| Step | What you write | What it leaves in `out/` |
|---|---|---|
| 1 | `recordTrace` in `agents/src/mcp/trace.ts`: the first call to Chrome DevTools MCP | `first-trace.json`, with `node src/first-trace.ts` |
| 2 | `askWebPerf` and `lcpReportOf` in `agents/src/subagents/lcp.ts` | `agents/lcp-*.json`, with `node src/orchestrator.ts lcp` |
| 3 | The Navigator journey and the CLS and LoAF/INP measurement | `agents/navigator-*.json`, `cls-*.json` and `loaf-*.json`, with `node src/orchestrator.ts cls loaf` |
| 4 | The Judge findings in `agents/src/judge/findings.ts` | `agents/judge/report.json` of `pr/lcp-hero-lazy`, with `node src/orchestrator.ts lcp judge` |
| 5 | Nothing: `ci` against the four branches, each one in `out/ci/<branch>/` | 3 failures and 1 pass |

Each step has its guide, with what to write, the MCP tools, hints and how to check it: start with [step 1](docs/src/content/docs/en/workshop/step-01.md). If you fall behind, the `step-0N-solution` tag has the solved code of step N, for example `git checkout step-02-solution -- agents/src`.

The branch and its tags are created from `main` with `node scripts/workshop.mjs`, which checks that each state compiles and that, in the `agents` image, the tests of each step fail before its solution and pass after it.

## The regression branches

| Branch | Change | What regresses | Preview |
|---|---|---|---|
| `pr/lcp-hero-lazy` | The hero image loses the preload and the `fetchpriority`, and switches to `loading="lazy"` | LCP | [preview](https://perf-coffee-git-pr-lcp-hero-lazy-nucliweb-projects.vercel.app/) |
| `pr/cls-promo-banner` | The third-party banner without reserved space and a font swap without preload | CLS | [preview](https://perf-coffee-git-pr-cls-promo-banner-nucliweb-projects.vercel.app/) |
| `pr/loaf-cart-handler` | A synchronous A/B testing script and recommendations computed in the add to cart handler | INP and LCP | [preview](https://perf-coffee-git-pr-loaf-cart-handler-nucliweb-projects.vercel.app/) |
| `pr/noop-refactor` | Extracts the hero into a component | Nothing: the false positive control | [preview](https://perf-coffee-git-pr-noop-refactor-nucliweb-projects.vercel.app/) |

The shop of `main` is at [perf-coffee.vercel.app](https://perf-coffee.vercel.app/) and each branch has its preview on Vercel. How to see each regression in the browser, with its figures, in [The branches in the browser](docs/src/content/docs/en/previews.md).

The three regressions stay within "good" in absolute value. The gate detects them because it compares with the baseline, not with the Google thresholds. The app tests pass on all four branches: classic CI does not see any of them.

## Structure

```
├── compose.yaml          # the lab, with the llm and lite profiles
├── apps/shop/            # the Perf Coffee shop (React 19 and Vite)
├── apps/thirdparty/      # the third-party mocks
├── agents/
│   ├── src/judge/        # gate, traces, diff, rules, prompt and handoff
│   ├── src/ci/           # the ci service and its report
│   ├── src/orchestrator.ts  # runs the subagents against both shops
│   ├── src/subagents/    # the subagents: Navigator, LCP, CLS, LoAF/INP and the Judge
│   ├── journeys/         # the journeys in JSON, one per page
│   └── schemas/          # the schema of the LLM explanation
├── docker/               # one Dockerfile per image
├── experiments/          # the experiments that back each figure in the documentation
├── scripts/              # preflight, workshop.mjs, build-shop.sh and publish-images.sh
└── docs/                 # the workshop documentation (Astro Starlight)
```

## Documentation

- [The workshop step by step](docs/src/content/docs/en/workshop/step-01.md): one guide per step, from the first trace to the gate against the four branches.
- [The branches in the browser](docs/src/content/docs/en/previews.md): the shop of `main` and the four branches deployed on Vercel, to see each regression without Docker.
- [Why this stack](docs/src/content/docs/en/stack.md): each piece, what we discarded and the data that decided it.
- [Learnings](docs/src/content/docs/en/learnings.md): the design decisions with their context and their data.

Each figure in the documentation comes from an experiment in [`experiments/`](experiments), with its test:

| Experiment | What it reproduces |
|---|---|
| [`regressions`](experiments/regressions) | The gate verdict on the four branches |
| [`models`](experiments/models) | The benchmark of the Judge models |
| [`trace-engine-cli`](experiments/trace-engine-cli) | Why trace-engine-cli is called as a CLI and not as an MCP |
| [`chrome-devtools-mcp`](experiments/chrome-devtools-mcp) | Chrome DevTools MCP outside the editor |
| [`discarded`](experiments/discarded) | The alternatives the map page discards: without network throttling, without preload and without `keepNames` |
| [`previews`](experiments/previews) | The branches in the browser: the shop on Vercel, with and without network throttling |

## License

[MIT](LICENSE)
