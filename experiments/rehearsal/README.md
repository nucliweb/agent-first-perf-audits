# Experiment: timed rehearsal

English · [Castellano](README.es.md) · [Català](README.ca.md)

Runs the workshop as an attendee would: it clones the repo clean, takes the commands from the README and from the guide of each step, runs them in order and records what happened with each one. The durations and the test counts in the guides come from that file, and a test checks that they are still the measured ones.

## What it does

1. Clones the repo into a temporary folder, at the ref it is given (`main` by default) and into a folder named `agent-first-perf-audits`, the one of the README. The Compose project of the clone has the same name as the one of an attendee.
2. Reads the `bash` blocks of the "Puesta en marcha" section of [`README.es.md`](../../README.es.md) and of the Spanish guides in [`docs/src/content/docs/es/workshop/`](../../docs/src/content/docs/es/workshop/), in order, with [`scripts/lib/markdown.mjs`](../../scripts/lib/markdown.mjs), the same code the documentation checker uses.
3. Runs each block with `bash` from the root of the clone, with the profile of `COMPOSE_PROFILES` (`llm` by default, or `lite`) and without the lab variables the terminal may have (`CANDIDATE`, `BASELINE`, `OUT`, `COMPOSE_PROJECT_NAME` and `COMPOSE_FILE`). A command that takes more than 30 minutes is stopped.
4. Saves per command, in `results/<profile>.json`: the file and the line of the guide, the exit code, the duration, the `pass` and `fail` counts of `node --test`, whether the output has the lines of the `text` block that follows the command in the guide (with `…` as a wildcard) and the last 20 lines of the output. The whole output goes to `rehearsal.log`, in the temporary folder.

The file is saved after every command, with `complete: false` until the rehearsal ends. The clone and its lab keep running afterwards; `docker compose down` from the clone stops it.

The rehearsal measures, so nothing else runs on the reference machine at the same time. The lab of the clone has the same project name as the one of the working repo: stop that one before starting.

## The markers in the guides

An HTML comment right above a `bash` block tells the rehearsal what to do with it, without changing the page. An unknown marker, or one that is not above a `bash` block, stops the rehearsal with its line number.

| Marker | What the rehearsal does |
|---|---|
| `<!-- rehearsal: optional -->` | Runs the block, but its time does not count in the slot of its step |
| `<!-- rehearsal: skip, <reason> -->` | Does not run it |
| `<!-- rehearsal: clone -->` | Runs it without its `git clone` and `cd` lines, because the rehearsal has already cloned the repo |

## Requirements

Those of the workshop, which `scripts/preflight.sh` checks, and Node 22 or later, git and bash. It has no npm dependencies.

## Usage

```bash
node rehearse.mjs --dry-run                 # lists the commands of the guides, without running anything
node rehearse.mjs                           # llm profile, from a clone of this repo at main
COMPOSE_PROFILES=lite node rehearse.mjs     # lite profile
node rehearse.mjs --only step-01,step-02    # only those steps, to results/llm-step-01-step-02.json
npm test                                    # the tests of the rehearsal and the checks on results/
```

`--source` takes a path or a git URL, `--ref` a branch, a tag or a commit, `--skip-optional` leaves out the optional blocks, `--dir` chooses the folder of the clone and `--timeout` gives the minutes to wait per command.

## What the tests check

`npm test` runs the tests of the rehearsal itself (reading the guides, comparing the outputs and a whole rehearsal over a test repo) and `claims.test.mjs`, which reads each file in `results/` from a finished rehearsal and checks that:

1. The rehearsed commands are the ones the guides write today. If a guide changes, the rehearsal has to run again.
2. The `pass N` and `fail N` the guides give after a command are the measured ones.
3. Each command exits with 1 when its guide announces failing tests, and with 0 otherwise.
4. The machine time of each step, without the optional blocks, stays within 60 % of its slot in the agenda of [`PLAN.md`](../../PLAN.md).
5. Step 5 exits with 1, 1, 1 and 0, in the order of its branches.
6. With the `llm` profile, the output of each command has the lines its guide shows. The guides show the output of that profile.

Without files in `results/`, those checks are skipped and say so.
