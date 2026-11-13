# Experiment: the Judge model

English · [Castellano](README.es.md) · [Català](README.ca.md)

Reproduces the data of the model benchmark: which local model best explains the workshop regressions, and how much work the rules have to do before asking it.

## What it does

1. [`fixtures.mjs`](fixtures.mjs) generates the Judge input for each regression branch, with real data:
   - the verdict and the metrics of the gate, from [`experiments/regressions`](../regressions);
   - the diff of the branch, without the tests;
   - the trace-engine-cli summaries of the baseline and of the candidate in both scenarios, with 4x CPU and fast-4g network. In `add-to-cart` there are two traces per side: the load one gives the layout shifts and the click one, the interactions and the tasks.

   It saves them in [`fixtures/`](fixtures), so every model gets exactly the same prompt.
2. [`bench.mjs`](bench.mjs) runs each case through each model in Ollama, with Chromium open in another container, as in the lab. It measures:
   - the latency;
   - whether the answer is JSON and whether it meets [`agents/schemas/verdict.schema.json`](../../agents/schemas/verdict.schema.json);
   - whether it repeats the verdict and the metric of the rules;
   - whether it names the real cause;
   - the RAM that Ollama gives the model.
3. [`claims.test.mjs`](claims.test.mjs) checks the figures of the documentation against the answers saved in [`results/`](results), one per stage, and in [`history/`](history).

The rules and the prompt are those of the Judge: they live in [`agents/src/judge`](../../agents/src/judge), with their tests in `agents/test/judge`, and the experiment imports them from there. That way the benchmark measures the same code that the Judge runs.

A case is a metric that regresses on a branch. `pr/loaf-cart-handler` regresses two (the LCP because of `ab.js` and the INP because of `recommendFor`), so the Judge asks for two explanations. A branch without regression is a case of its own.

## Requirements

- Node 22.18 or later and Docker.
- Ollama 0.40.13 in a container, with the models pulled:

  ```bash
  docker run -d --name ollama-bench -p 127.0.0.1:11434:11434 -v ollama-bench:/root/.ollama ollama/ollama:0.40.13
  docker exec ollama-bench ollama pull llama3.2:3b   # and qwen3:1.7b, qwen2.5-coder:1.5b, gemma3:1b
  ```

- The `agents` image built, for the background Chromium: `docker compose build agents`.
- To regenerate the fixtures, `npm test` in `experiments/regressions` first.

## Usage

```bash
npm install
npm test                          # tests of the scoring and the figures of results/
npm run fixtures                  # regenerates fixtures/ with new traces
node fixtures.mjs --gate-only     # updates the gate of fixtures/ without new traces
STAGE=llm COLD=1 REPS=1 MODES=schema node bench.mjs   # one stage with the four models, cold
STAGE=quotes COLD=1 REPS=1 MODES=schema node bench.mjs llama3.2:3b   # the Judge stage
STAGE=quotes REPS=3 MODES=schema node bench.mjs llama3.2:3b   # the warm latency, with the machine idle
node bench.mjs --rescore results/rules.json   # scores saved answers again, without models
```

Each pass writes to `out/results.json`; the ones in `results/` are copies named after their stage.

Careful with `npm run fixtures` and `node fixtures.mjs --gate-only`: both rewrite `fixtures/` with the latest `results.json` of `experiments/regressions`, which may come from another measurement. The answers in `results/` and the figures in Learnings come from the current fixtures, so after regenerating them the benchmark has to run again before quoting a figure.

`STAGE` says how much the rules do before the LLM. Each stage adds something to the previous one:

| `STAGE` | What the rules do |
|---|---|
| `llm` | They decide the verdict and which metric to explain |
| `suspects` | Also, they compare the traces of the baseline and of the candidate, and pass to the prompt the functions and scripts that are new or that grow ([`suspects.ts`](../../agents/src/judge/suspects.ts)) |
| `rules` | Also, they do not ask the LLM when nothing regresses, and they relate each suspect to the line of the diff that adds it ([`match.ts`](../../agents/src/judge/match.ts)) |
| `quotes` | Also, they escape the double quotes of the diff and of the related line (`escapeQuotes` in [`prompt.ts`](../../agents/src/judge/prompt.ts)), as the Judge sends them. It is the default |

`COLD=1` unloads the model before each call, so none of them benefits from the prompt cache of the previous one.

## What the test checks

The test scores the saved answers again instead of calling the models. With temperature 0 and a fixed seed, the answers are deterministic when cold: the three repetitions of each case in passes 5 and 6 of the history are identical, so the current passes run only one. When warm they are not quite, because Ollama reuses the prompt cache of the previous call, which shares the system prompt, and with it the same input can give a different wording.

When cold, the workshop `ollama` image gives the same answers as the `quotes` stage, so its figures hold for what attendees will see. [`agents/test/ollama.test.ts`](../../agents/test/ollama.test.ts) checks it inside Docker Compose, with this experiment mounted:

```bash
docker compose run --rm -v "$PWD/experiments:/experiments:ro" agents npm test
```

### Current passes

Cold and with one repetition, on the fixtures in [`fixtures/`](fixtures):

| Stage | Claim |
|---|---|
| `llm` | `llama3.2:3b` names the cause in 3 of 5 answers; `qwen3:1.7b` and `qwen2.5-coder:1.5b` in 2 and `gemma3:1b` in none. All four meet the schema in every answer |
| `suspects` | `llama3.2:3b` stays at 3 of 5, and `qwen3:1.7b` goes up to 3 |
| `rules` | `llama3.2:3b` gets 5 of 5, with 4 calls to the LLM. The scoring accepts the hero sentence, but it mixes the `loading` attribute with a "`fetchPriority` property" |
| `quotes` | 5 of 5, and the hero sentence names the `loading="lazy"` attribute of the `img` |

One of the 22 pieces of evidence of `rules` and `quotes` is exactly 200 characters long, the limit of the schema, and it is a complete sentence.

### History: fixtures of November 10

In [`history/2026-11-10`](history/2026-11-10), with the fixtures they were measured on. Passes 1 to 4 ran warm and with three repetitions; pass 1 also asked the model for the metric, and the current code no longer reproduces it:

| Pass | Claim |
|---|---|
| `1-free-metric` | With the schema as structured output, the four models return valid JSON in every answer; with the JSON described only in the prompt, `qwen2.5-coder:1.5b` never does |
| `2-metric-by-rules` | With the metric decided by the rules, `llama3.2:3b` names the cause in 9 of 15 answers, and the others in 6 or fewer |
| `3-suspects` | With the suspects of the traces in the prompt, `llama3.2:3b` stays at 9 of 15 |
| `4-rules` | With the cause related to the diff by the rules, `llama3.2:3b` names it in 14 of 15, with 12 calls to the LLM; the only one that fails is the hero LCP |
| `5-rules-cold` | The same stage, cold: 12 of 15. The hero sentence is cut at `loading=` in the three repetitions, because the quote of `loading="lazy"` closes the string of the JSON constrained by the schema |
| `6-quotes-cold` | With the quotes of the diff escaped, cold: 15 of 15, with the full hero sentence |

None of the 108 pieces of evidence of passes 4 to 6 reaches the 200-character limit.

The scoring of the cause is strict ([`score.mjs`](score.mjs)): the cause has to be in the sentence, the evidence is not enough, and on a branch without regression the sentence has to say that there is no regression, without blaming any change or copying the instructions of the prompt.

## Results on the reference Mac

16 GB Apple Silicon, Ollama in Docker on CPU, 8 GB VM:

| Model | Model RAM | Cause (`llm`) | Cause (`suspects`) | Cause (`rules`) | Cause (`quotes`) |
|---|---|---|---|---|---|
| `llama3.2:3b` | 3295 MiB | 3/5 | 3/5 | 5/5 | 5/5 |
| `qwen3:1.7b` | 2315 MiB | 2/5 | 3/5 | | |
| `qwen2.5-coder:1.5b` | 1493 MiB | 2/5 | 2/5 | | |
| `gemma3:1b` | 1225 MiB | 0/5 | 0/5 | | |

In the history, with three warm repetitions: `llama3.2:3b` 9/15, 9/15 and 14/15; `qwen3:1.7b` 6/15 and 8/15; `qwen2.5-coder:1.5b` 6/15 and 6/15; `gemma3:1b` 0/15 and 0/15.

The model RAM is what Ollama assigns it with a context of 8192 tokens, with a single model loaded at a time.

The latency changes a lot with the load of the machine. Warm, in the `quotes` stage and with the machine idle at the start, the 12 calls of `llama3.2:3b` took between 13.7 and 40.3 seconds, with a median of 23.2 s ([`results/quotes-warm.json`](results/quotes-warm.json)). In the `4-rules` pass of the history, on a laptop in normal use, between 9 and 37 seconds, with a median of 15.8 s. That is the guideline figure for the workshop: between 15 and 25 seconds per explanation. Cold, each call includes loading the model, and the median goes up to 46-48 s (passes 5 and 6 of the history).

The host load average is no use to watch the measurement while it runs: during each call, Ollama uses almost every core of the Docker VM and the load shoots up. It has to be checked before starting.

## Versions

`ollama/ollama` 0.40.13, `ajv` 8.20.0, `playwright` 1.63.0 and `trace-engine-cli` 0.2.0. The models are pulled by their Ollama tag.
