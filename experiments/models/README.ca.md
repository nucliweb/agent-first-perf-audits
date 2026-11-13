# Experiment: el model del Judge

[English](README.md) · [Castellano](README.es.md) · Català

Reprodueix les dades del benchmark de models: quin model local explica millor les regressions del taller, i quanta feina han de fer les regles abans de preguntar-li.

## Què fa

1. [`fixtures.mjs`](fixtures.mjs) genera l'entrada del Judge per a cada branca de regressió, amb dades reals:
   - el veredicte i les mètriques del gate, d'[`experiments/regressions`](../regressions/README.ca.md);
   - el diff de la branca, sense els tests;
   - els resums de trace-engine-cli de la versió base i de la candidata als dos escenaris, amb CPU 4x i xarxa fast-4g. A `add-to-cart` hi ha dos traces per costat: el de la càrrega dona els layout shifts i el del clic, les interaccions i les tasques.

   Els desa a [`fixtures/`](fixtures), així que tots els models reben exactament el mateix prompt.
2. [`bench.mjs`](bench.mjs) passa cada cas per cada model a Ollama, amb Chromium obert en un altre contenidor, com al laboratori. Mesura:
   - la latència;
   - si la resposta és JSON i si compleix [`agents/schemas/verdict.schema.json`](../../agents/schemas/verdict.schema.json);
   - si repeteix el veredicte i la mètrica de les regles;
   - si anomena la causa real;
   - la RAM que Ollama dona al model.
3. [`claims.test.mjs`](claims.test.mjs) comprova les xifres de la documentació sobre les respostes desades a [`results/`](results), una per etapa, i a [`history/`](history).

Les regles i el prompt són els del Judge: viuen a [`agents/src/judge`](../../agents/src/judge), amb els seus tests a `agents/test/judge`, i l'experiment els importa des d'allà. Així el benchmark mesura el mateix codi que executa el Judge.

Un cas és una mètrica que empitjora en una branca. `pr/loaf-cart-handler` n'empitjora dues (l'LCP per `ab.js` i l'INP per `recommendFor`), així que el Judge demana dues explicacions. Una branca sense regressió és un cas propi.

## Requisits

- Node 22.18 o superior i Docker.
- Ollama 0.40.13 en un contenidor, amb els models descarregats:

  ```bash
  docker run -d --name ollama-bench -p 127.0.0.1:11434:11434 -v ollama-bench:/root/.ollama ollama/ollama:0.40.13
  docker exec ollama-bench ollama pull llama3.2:3b   # i qwen3:1.7b, qwen2.5-coder:1.5b, gemma3:1b
  ```

- La imatge `agents` construïda, per al Chromium de fons: `docker compose build agents`.
- Per regenerar els fixtures, `npm test` a `experiments/regressions` abans de res.

## Ús

```bash
npm install
npm test                          # tests de la puntuació i les xifres de results/
npm run fixtures                  # regenera fixtures/ amb traces nous
node fixtures.mjs --gate-only     # actualitza el gate de fixtures/ sense traces nous
STAGE=llm COLD=1 REPS=1 MODES=schema node bench.mjs   # una etapa amb els quatre models, en fred
STAGE=quotes COLD=1 REPS=1 MODES=schema node bench.mjs llama3.2:3b   # l'etapa del Judge
STAGE=quotes REPS=3 MODES=schema node bench.mjs llama3.2:3b   # la latència en calent, amb la màquina en repòs
node bench.mjs --rescore results/rules.json   # torna a puntuar respostes desades, sense models
```

Cada passada escriu a `out/results.json`; les de `results/` són còpies amb el nom de la seva etapa.

Compte amb `npm run fixtures` i `node fixtures.mjs --gate-only`: tots dos reescriuen `fixtures/` amb l'últim `results.json` d'`experiments/regressions`, que pot ser d'una altra mesura. Les respostes de `results/` i les xifres de Learnings surten dels fixtures actuals, així que després de regenerar-los cal tornar a passar el benchmark abans de citar una xifra.

`STAGE` diu quant fan les regles abans de l'LLM. Cada etapa afegeix alguna cosa a l'anterior:

| `STAGE` | Què fan les regles |
|---|---|
| `llm` | Decideixen el veredicte i quina mètrica cal explicar |
| `suspects` | A més, comparen els traces de la base i de la candidata, i passen al prompt les funcions i els scripts nous o que creixen ([`suspects.ts`](../../agents/src/judge/suspects.ts)) |
| `rules` | A més, no pregunten a l'LLM quan res no empitjora, i relacionen cada sospitós amb la línia del diff que l'afegeix ([`match.ts`](../../agents/src/judge/match.ts)) |
| `quotes` | A més, escapen les cometes dobles del diff i de la línia relacionada (`escapeQuotes` a [`prompt.ts`](../../agents/src/judge/prompt.ts)), com les envia el Judge. És el valor per defecte |

`COLD=1` descarrega el model abans de cada crida, així que cap no aprofita la memòria cau del prompt de l'anterior.

## Què comprova el test

El test torna a puntuar les respostes desades en lloc de cridar els models. Amb temperatura 0 i llavor fixa, les respostes són deterministes en fred: les tres repeticions de cada cas de les passades 5 i 6 de la història són idèntiques, així que les passades actuals en fan una de sola. En calent no ho són del tot, perquè Ollama reutilitza la memòria cau del prompt de la crida anterior, que comparteix el prompt de sistema, i amb ella la mateixa entrada pot donar una altra redacció.

En fred, la imatge `ollama` del taller dona les mateixes respostes que l'etapa `quotes`, així que les seves xifres valen per al que veuran els assistents. Ho comprova [`agents/test/ollama.test.ts`](../../agents/test/ollama.test.ts) dins de Docker Compose, amb aquest experiment muntat:

```bash
docker compose run --rm -v "$PWD/experiments:/experiments:ro" agents npm test
```

### Passades actuals

En fred i amb una repetició, sobre els fixtures de [`fixtures/`](fixtures):

| Etapa | Afirmació |
|---|---|
| `llm` | `llama3.2:3b` anomena la causa en 3 de 5 respostes; `qwen3:1.7b` i `qwen2.5-coder:1.5b` en 2 i `gemma3:1b` en cap. Els quatre compleixen el schema en totes |
| `suspects` | `llama3.2:3b` continua en 3 de 5, i `qwen3:1.7b` puja a 3 |
| `rules` | `llama3.2:3b` encerta 5 de 5, amb 4 crides a l'LLM. La puntuació dona per bona la frase del hero, però barreja l'atribut `loading` amb una "propietat `fetchPriority`" |
| `quotes` | 5 de 5, i la frase del hero anomena l'atribut `loading="lazy"` de l'`img` |

Una de les 22 evidències de `rules` i `quotes` fa just 200 caràcters, el límit del schema, i és una frase completa.

### Història: fixtures del 10 de novembre

A [`history/2026-11-10`](history/2026-11-10), amb els fixtures en què es van mesurar. Les passades 1 a 4 es van fer en calent i amb tres repeticions; la 1 demanava al model també la mètrica, i el codi actual ja no la reprodueix:

| Passada | Afirmació |
|---|---|
| `1-free-metric` | Amb el schema com a sortida estructurada, els quatre models retornen JSON vàlid en totes les respostes; amb el JSON descrit només al prompt, `qwen2.5-coder:1.5b` no ho fa mai |
| `2-metric-by-rules` | Amb la mètrica decidida per les regles, `llama3.2:3b` anomena la causa en 9 de 15 respostes, i els altres en 6 o menys |
| `3-suspects` | Amb els sospitosos dels traces al prompt, `llama3.2:3b` continua en 9 de 15 |
| `4-rules` | Amb la causa relacionada amb el diff per les regles, `llama3.2:3b` l'anomena en 14 de 15, amb 12 crides a l'LLM; l'única que falla és la de l'LCP del hero |
| `5-rules-cold` | La mateixa etapa en fred: 12 de 15. La frase del hero es talla a `loading=` en les tres repeticions, perquè la cometa de `loading="lazy"` tanca la cadena del JSON restringit pel schema |
| `6-quotes-cold` | Amb les cometes del diff escapades, en fred: 15 de 15, amb la frase del hero completa |

Cap de les 108 evidències de les passades 4 a 6 no arriba al límit de 200 caràcters.

La puntuació de la causa és estricta ([`score.mjs`](score.mjs)): la causa ha de ser a la frase, no n'hi ha prou amb l'evidència, i en una branca sense regressió la frase ha de dir que no hi ha regressió, sense culpar cap canvi ni copiar les instruccions del prompt.

## Resultats al Mac de referència

Apple Silicon de 16 GB, Ollama a Docker en CPU, VM de 8 GB:

| Model | RAM del model | Causa (`llm`) | Causa (`suspects`) | Causa (`rules`) | Causa (`quotes`) |
|---|---|---|---|---|---|
| `llama3.2:3b` | 3295 MiB | 3/5 | 3/5 | 5/5 | 5/5 |
| `qwen3:1.7b` | 2315 MiB | 2/5 | 3/5 | | |
| `qwen2.5-coder:1.5b` | 1493 MiB | 2/5 | 2/5 | | |
| `gemma3:1b` | 1225 MiB | 0/5 | 0/5 | | |

A la història, amb tres repeticions en calent: `llama3.2:3b` 9/15, 9/15 i 14/15; `qwen3:1.7b` 6/15 i 8/15; `qwen2.5-coder:1.5b` 6/15 i 6/15; `gemma3:1b` 0/15 i 0/15.

La RAM del model és la que Ollama li assigna amb un context de 8192 tokens, amb un sol model carregat cada vegada.

La latència canvia molt amb la càrrega de la màquina. En calent, a l'etapa `quotes` i amb la màquina en repòs en començar, les 12 crides de `llama3.2:3b` van trigar entre 13,7 i 40,3 segons, amb una mediana de 23,2 s ([`results/quotes-warm.json`](results/quotes-warm.json)). A la passada `4-rules` de la història, en un portàtil en ús normal, entre 9 i 37 segons, amb una mediana de 15,8 s. És la xifra d'orientació per al taller: entre 15 i 25 segons per explicació. En fred cada crida inclou carregar el model, i la mediana puja a 46-48 s (passades 5 i 6 de la història).

La càrrega mitjana de l'amfitrió no serveix per vigilar la mesura mentre corre: durant cada crida, Ollama fa servir gairebé tots els nuclis de la VM de Docker i la càrrega es dispara. Cal mirar-la abans de començar.

## Versions

`ollama/ollama` 0.40.13, `ajv` 8.20.0, `playwright` 1.63.0 i `trace-engine-cli` 0.2.0. Els models es descarreguen per la seva etiqueta d'Ollama.
