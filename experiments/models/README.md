# Experimento: el modelo del Judge

Reproduce los datos del benchmark de modelos: qué modelo local explica mejor las regresiones del taller, y cuánto trabajo tienen que hacer las reglas antes de preguntarle.

## Qué hace

1. [`fixtures.mjs`](fixtures.mjs) genera la entrada del Judge para cada rama de regresión, con datos reales:
   - el veredicto y las métricas del gate, de [`experiments/regressions`](../regressions);
   - el diff de la rama, sin los tests;
   - los resúmenes de trace-engine-cli de la versión base y de la candidata en los dos escenarios, con CPU 4x y red fast-4g.

   Los guarda en [`fixtures/`](fixtures), así que todos los modelos reciben exactamente el mismo prompt.
2. [`bench.mjs`](bench.mjs) pasa cada caso por cada modelo en Ollama, con Chromium abierto en otro contenedor, como en el laboratorio. Mide:
   - la latencia;
   - si la respuesta es JSON y si cumple [`agents/schemas/verdict.schema.json`](../../agents/schemas/verdict.schema.json);
   - si repite el veredicto y la métrica de las reglas;
   - si nombra la causa real;
   - la RAM que Ollama da al modelo.
3. [`claims.test.mjs`](claims.test.mjs) comprueba las cifras de la documentación sobre las respuestas guardadas en [`results/`](results).

Las reglas y el prompt son los del Judge: viven en [`agents/src/judge`](../../agents/src/judge), con sus tests en `agents/test/judge`, y el experimento los importa desde allí. Así el benchmark mide el mismo código que ejecuta el Judge.

Un caso es una métrica que empeora en una rama. `pr/loaf-cart-handler` empeora dos (el LCP por `ab.js` y el INP por `recommendFor`), así que el Judge pide dos explicaciones. Una rama sin regresión es un caso propio.

## Requisitos

- Node 22.18 o superior y Docker.
- Ollama 0.40.13 en un contenedor, con los modelos descargados:

  ```bash
  docker run -d --name ollama-bench -p 127.0.0.1:11434:11434 -v ollama-bench:/root/.ollama ollama/ollama:0.40.13
  docker exec ollama-bench ollama pull llama3.2:3b   # y qwen3:1.7b, qwen2.5-coder:1.5b, gemma3:1b
  ```

- La imagen `agents` construida, para el Chromium de fondo: `docker compose build agents`.
- Para regenerar los fixtures, `npm test` en `experiments/regressions` antes de nada.

## Uso

```bash
npm install
npm test                          # tests de la puntuación y las cifras de results/
npm run fixtures                  # regenera fixtures/ con traces nuevos
node fixtures.mjs --gate-only     # actualiza el gate de fixtures/ sin traces nuevos
MODES=schema node bench.mjs       # los cuatro modelos; llama3.2:3b para uno solo
STAGE=quotes COLD=1 MODES=schema node bench.mjs llama3.2:3b   # la pasada 6, en frío
node bench.mjs --rescore results/4-rules.json   # vuelve a puntuar respuestas guardadas, sin modelos
```

`STAGE` dice cuánto hacen las reglas antes del LLM. Cada etapa añade algo a la anterior:

| `STAGE` | Qué hacen las reglas |
|---|---|
| `llm` | Deciden el veredicto y qué métrica explicar |
| `suspects` | Además, comparan los traces de la base y de la candidata, y pasan al prompt las funciones y scripts nuevos o que crecen ([`suspects.ts`](../../agents/src/judge/suspects.ts)) |
| `rules` | Además, no preguntan al LLM cuando nada empeora, y relacionan cada sospechoso con la línea del diff que lo añade ([`match.ts`](../../agents/src/judge/match.ts)) |
| `quotes` | Además, escapan las comillas dobles del diff y de la línea relacionada (`escapeQuotes` en [`prompt.ts`](../../agents/src/judge/prompt.ts)), como las envía el Judge. Es el valor por defecto |

`COLD=1` descarga el modelo antes de cada llamada, así que ninguna aprovecha la caché del prompt de la anterior.

## Qué comprueba el test

El test vuelve a puntuar las respuestas guardadas en lugar de llamar a los modelos. Con temperatura 0 y semilla fija, las respuestas son deterministas en frío: las tres repeticiones de cada caso de las pasadas 5 y 6 son idénticas. En caliente no lo son del todo, porque Ollama reutiliza la caché del prompt de la llamada anterior, que comparte el prompt de sistema, y con ella la misma entrada puede dar otra redacción. Las pasadas 1 a 4 se hicieron en caliente.

En frío, la imagen `ollama` del taller da las mismas respuestas que la pasada 6, así que sus cifras valen para lo que verán los asistentes. Lo comprueba [`agents/test/ollama.test.ts`](../../agents/test/ollama.test.ts) dentro de Docker Compose, con este experimento montado:

```bash
docker compose run --rm -v "$PWD/experiments:/experiments:ro" agents npm test
```

Las afirmaciones de cada pasada:

| Pasada | Afirmación |
|---|---|
| `1-free-metric` | Con el schema como salida estructurada, los cuatro modelos devuelven JSON válido en todas las respuestas; con el JSON descrito solo en el prompt, `qwen2.5-coder:1.5b` no lo hace nunca |
| `2-metric-by-rules` | Con la métrica decidida por las reglas, `llama3.2:3b` nombra la causa en 9 de 15 respuestas, y los demás en 6 o menos |
| `3-suspects` | Con los sospechosos de los traces en el prompt, `llama3.2:3b` sigue en 9 de 15 |
| `4-rules` | Con la causa relacionada con el diff por las reglas, `llama3.2:3b` la nombra en 14 de 15, con 12 llamadas al LLM; la única que falla es la del LCP del hero |
| `5-rules-cold` | La misma etapa en frío: 12 de 15. La frase del hero se corta en `loading=` en las tres repeticiones, porque la comilla de `loading="lazy"` cierra la cadena del JSON restringido por el schema |
| `6-quotes-cold` | Con las comillas del diff escapadas, en frío: 15 de 15, con la frase del hero completa |

La puntuación de la causa es estricta ([`score.mjs`](score.mjs)): la causa tiene que estar en la frase, no basta con la evidencia, y en una rama sin regresión la frase tiene que decir que no hay regresión, sin culpar a ningún cambio ni copiar las instrucciones del prompt.

## Resultados en el Mac de referencia

Apple Silicon de 16 GB, Ollama en Docker en CPU, VM de 8 GB:

| Modelo | RAM del modelo | Causa (`llm`) | Causa (`suspects`) | Causa (`rules`) |
|---|---|---|---|---|
| `llama3.2:3b` | 3295 MiB | 9/15 | 9/15 | 14/15 (12/15 en frío; 15/15 con `quotes`) |
| `qwen3:1.7b` | 2315 MiB | 6/15 | 8/15 | |
| `qwen2.5-coder:1.5b` | 1493 MiB | 6/15 | 6/15 | |
| `gemma3:1b` | 1225 MiB | 0/15 | 0/15 | |

La RAM del modelo es la que Ollama le asigna con un contexto de 8192 tokens, con un solo modelo cargado cada vez.

La latencia cambia mucho con la carga de la máquina. En la pasada `rules`, las 12 llamadas de `llama3.2:3b` tardaron entre 9 y 37 segundos, con una mediana de 15,8 s, en un portátil en uso normal. Es la cifra de orientación para el taller: entre 15 y 20 segundos por explicación. En frío la mediana sube a 46-48 s, porque cada llamada incluye cargar el modelo.

## Versiones

`ollama/ollama` 0.40.13, `ajv` 8.20.0, `playwright` 1.63.0 y `trace-engine-cli` 0.2.0. Los modelos se descargan por su etiqueta de Ollama.
