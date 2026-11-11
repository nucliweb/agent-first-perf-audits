# Plan de implementación: agent-first-perf-audits

Workshop de 2 horas: **Multi-Agent Performance Audits: Automatizando Core Web Vitals en tu plataforma interna con MCP**.

Estado a 9 de noviembre de 2026. Las decisiones de este documento ya están cerradas salvo las que aparecen en "Pendiente".

## Decisiones cerradas

| Ámbito | Decisión |
|---|---|
| Repo | `github.com/nucliweb/agent-first-perf-audits`, marca PerfReviews |
| Máquina de referencia | Mac Apple Silicon 16 GB, Ollama en Docker (CPU) |
| Rol del LLM | Explica la causa a partir de datos ya medidos, con salida JSON validada por schema. **No decide el gate** |
| Quién decide el gate | Las reglas: la estadística de la CLI de WebPerf Snippets (Mann-Whitney U, umbrales, exit code) |
| Stack del orquestador | Node/TS + MCP SDK, sin framework |
| Capa MCP | Chrome DevTools MCP + WebPerf Snippets MCP |
| Atribución en traces | trace-engine-cli como **llamada directa a la CLI**, sin servidor MCP (ver Learnings) |
| App de prueba | E-commerce demo con third parties simulados en local |
| Subagentes | Navigator, LCP, CLS, LoAF/INP, Judge |
| Regresiones | Ramas git tipo PR |
| Pipeline | Servicio `ci` en Docker Compose (gate local, sin red) |
| Distribución | Imágenes multiarch en GHCR; los asistentes hacen `docker compose pull` en casa |
| Requisitos | 16 GB recomendado; perfil `lite` sin LLM para equipos de 8 GB |
| Runtime de contenedores | Cualquiera compatible con Compose v2 (Docker Desktop, OrbStack, Colima, Podman) |
| Audiencia | Mixta, más de 30 personas; checkpoints y soluciones por paso |
| Documentación | Fuente en castellano, traducción a catalán e inglés; Markdown en el repo y web con Astro Starlight |

## Versiones a fijar

Nunca `@latest`. Versiones exactas en `package.json` y en las imágenes.

| Herramienta | Versión | Notas |
|---|---|---|
| `webperf-snippets` | 1.15.0 | `cpu`, `network` e `interactions` en el MCP (PRs #404, #405, #406). Lanza el Chromium completo cuando está instalado y registra el binario en las condiciones |
| `chrome-devtools-mcp` | 1.12.0 | Con `--executablePath` apuntando al Chromium de Playwright |
| `trace-engine-cli` | 0.2.0 | Proyecto muy reciente; revisar antes de congelar |
| `playwright` | 1.63.0 | Su Chromium completo sirve a las tres herramientas; la imagen lo instala con `--no-shell` |
| Imagen base | `node:22.23.4-bookworm-slim` | Node 22 ejecuta TypeScript sin compilar (type stripping) |
| `@modelcontextprotocol/client` | 2.4.0 | SDK v2, la misma línea que usa el servidor de WebPerf Snippets |
| `typescript` | 7.0.2 | Solo para el typecheck; no va en la imagen |
| `@types/node` | 22.20.5 | |
| Modelo | `llama3.2:3b` | Elegido en `experiments/models` frente a `qwen3:1.7b`, `qwen2.5-coder:1.5b` y `gemma3:1b` |
| Ollama | `ollama/ollama:0.40.13` | En CPU dentro de Docker; el JSON con el schema en `format` |
| `ajv` | 8.20.0 | Valida las respuestas contra el schema del veredicto, en el benchmark y en el Judge |

## Arquitectura (docker compose)

- **`shop-baseline`** y **`shop-candidate`**: la misma app construida desde dos refs git (`main` y la rama PR). La comparación A/B ocurre en la misma máquina y en la misma ejecución, lo que neutraliza la varianza entre portátiles.
- **`thirdparty`**: mocks locales (analytics, chat, banner de promo, A/B testing) con latencia y coste de CPU configurables.
- **`agents`**: Node 22, Chromium de Playwright, Chrome DevTools MCP, WebPerf Snippets y trace-engine-cli. Contiene el orquestador y los subagentes.
- **`ollama`**: imagen con el modelo ya incluido, en el perfil `llm`. El `.env` del repo lo activa; con `COMPOSE_PROFILES=lite` no se descarga ni se arranca.
- **`ci`**: la imagen de `agents` con otro comando (`agents/src/ci/gate.ts`). Ejecuta el gate, graba los traces, pide la explicación al Judge y escribe en `out/` `report.json`, `report.md`, `report.html`, `handoff.json` y `handoff.md`. Sale con 0 si pasa, 1 si falla y 2 si el gate no ha podido ejecutarse. Lee el diff del repo, montado en solo lectura en `/repo`.

### Flujo de subagentes

1. **Navigator**: journeys deterministas (home, listado, ficha, añadir al carrito) definidos como pasos de interacción (`click`, `type`, `hover`, `scroll`, `wait`).
2. **LCP**: WebPerf Snippets MCP `run_workflow` (`core-web-vitals`) y trace con Chrome DevTools MCP.
3. **CLS**: WebPerf Snippets MCP, con selectores de los nodos que se desplazan.
4. **LoAF/INP**: WebPerf Snippets MCP `run_workflow` con `workflow: "interaction"`, `interactions` del Navigator, `runs` y `cpu`. Trace del journey con Chrome DevTools MCP (`performance_start_trace` y `performance_stop_trace` a fichero).
5. **Judge**:
   - **Veredicto**: CLI de WebPerf Snippets con `--interact-script`, `--runs 5`, `--cpu 4`, `--network fast-4g`, `--baseline` y `--fail-on-regression`. El INP necesita `--workflow interaction`; el workflow por defecto no lo devuelve. El exit code es la decisión.
   - **Atribución**: `trace-engine-cli overview`, `interactions` y `tasks --tree bottom-up --top 5` sobre los traces de baseline y candidate.
   - **Explicación**: el LLM recibe el veredicto, las métricas, los selectores, los dos resúmenes de trace y el diff de la rama, y devuelve JSON (`verdict`, `metric`, `suspected_cause`, `evidence`, `confidence`). Si contradice a las reglas, ganan las reglas y se marca la discrepancia.
   - **Perfil `lite`**: sin LLM local, para equipos de 8 GB. Da el mismo veredicto y la misma atribución, y además escribe un fichero para pasar a un agente, por ejemplo en el cloud: la misma entrada que recibiría el LLM local (veredicto, métricas, resúmenes de trace y diff), el prompt y el schema del veredicto. Así quien va con `lite` también obtiene la explicación. Hay que dejarlo claro en los requisitos, en el preflight y en la documentación, incluido que enviar el diff a un servicio externo es una decisión de cada equipo para su propio código.

La medición es secuencial (un solo Chromium a la vez) para no contaminar las métricas por CPU compartida. El análisis puede ir en paralelo.

### Reparto de responsabilidades entre herramientas

| Necesidad | Herramienta |
|---|---|
| Métricas, selectores, varias ejecuciones, comparación con baseline | WebPerf Snippets (MCP para los agentes, CLI para el gate) |
| Captura de traces, insights de DevTools | Chrome DevTools MCP |
| Atribución a función, URL y línea | trace-engine-cli |
| Explicación en lenguaje natural | LLM local |

### Ramas de regresión

| Rama | Regresión | Métrica | Gate (CPU 4x, fast-4g, 5 runs, Mac de referencia) |
|---|---|---|---|
| `pr/lcp-hero-lazy` | Hero sin preload, con `loading="lazy"` y sin `fetchpriority` | LCP | 656 ms a 1056 ms, p = 0,0055 |
| `pr/cls-promo-banner` | Banner de third party sin espacio reservado + swap de fuente sin preload | CLS | 0 a 0,070 en la home y 0 a 0,055 en la ficha, p = 0,002 |
| `pr/loaf-cart-handler` | Script síncrono de A/B testing + recomendaciones calculadas en el handler de añadir al carrito | LoAF / INP | INP de 48 a 120 ms, p = 0,005; también LCP de la home de 656 a 972 ms |
| `pr/noop-refactor` | Extrae el hero a un componente | Control de falsos positivos | Pass en los dos escenarios |

La app es una SPA de React: sin preload, la imagen LCP no se descubre hasta que se ejecuta el JS. Por eso `loading="lazy"` solo añade unos 24 ms (por debajo del umbral) y la regresión de LCP necesita quitar el preload que el servidor inyecta por ruta. El throttling de red forma parte de las condiciones del gate: sin red, la prioridad de descarga apenas pesa.

Las tres regresiones quedan dentro de "good" en valor absoluto; el gate las detecta porque compara con el baseline, no con los umbrales de Google. Dos ramas empeoran más de una métrica, así que el Judge tiene que atribuir cada una a su causa. Cada rama ajusta los tests de la app que su cambio rompe, como haría su autor: el CI clásico pasa en las cuatro.

Las cifras salen de `experiments/regressions/` (`npm run measure`), y su test comprueba el veredicto de cada rama.

## Estructura del repo

```
├── README.md / README.ca.md / README.en.md
├── AGENTS.md                    # instrucciones para agentes; CLAUDE.md lo importa
├── PLAN.md
├── compose.yaml                 # perfiles: llm (por defecto, desde .env) y lite
├── .env                         # COMPOSE_PROFILES=llm
├── apps/shop/                   # e-commerce demo
├── apps/thirdparty/             # mocks
├── agents/
│   ├── src/orchestrator.ts
│   ├── src/subagents/{navigator,lcp,cls,loaf,judge}.ts
│   ├── src/judge/               # gate, traces, diff, reglas, sospechosos, prompt y handoff del Judge
│   ├── src/ci/                  # el servicio ci y su informe
│   ├── src/mcp/client.ts
│   ├── journeys/                # pasos de interacción en JSON
│   └── schemas/verdict.schema.json
├── experiments/
│   └── trace-engine-cli/        # reproduce los datos de Learnings
├── docker/{agents,shop,thirdparty,ollama}/Dockerfile
├── scripts/preflight.{sh,ps1}
├── scripts/build-shop.sh        # imagen de la tienda de cada ref git
├── docs/                        # Starlight: src/content/docs/{es,ca,en}/
└── .github/workflows/           # build multiarch a GHCR, deploy docs, paridad de traducciones
```

Los Markdown viven una sola vez en `docs/src/content/docs/<idioma>/`. GitHub los renderiza tal cual y Starlight genera la web. Un check en CI verifica la paridad entre idiomas: mismos archivos y mismos headings.

Cada paso tiene un comando de verificación (`npm run check -- step-03`) y un tag `step-03-solution` para quien se descuelgue.

## Agenda (2 h)

| Tiempo | Paso | Resultado verificable |
|---|---|---|
| 0:00 | Contexto: Agent-First Design, por qué el CI clásico no basta | |
| 0:10 | 1. Entorno y primera llamada MCP a mano | Trace capturado desde el contenedor |
| 0:25 | 2. Primer subagente: LCP | JSON de LCP con desglose |
| 0:45 | 3. Navigator + CLS + LoAF/INP | Métricas de un journey con interacción |
| 1:05 | 4. Judge: reglas, atribución y explicación del LLM | Veredicto correcto en `pr/lcp-hero-lazy` |
| 1:25 | 5. Gate en `ci` contra las 4 ramas | 3 fallos, 1 pass |
| 1:45 | 6. Llevarlo a tu plataforma, learnings y preguntas | |

## Requisitos para asistentes (instalado en casa)

- 16 GB de RAM recomendado (8 GB con perfil `lite`), 15 GB libres de disco.
- macOS, Linux o Windows con WSL2.
- Runtime de contenedores con Compose v2, con **al menos 8 GB asignados a la VM**. En Docker Desktop el valor por defecto suele ser menor; es el fallo más probable el día del taller.
- git y un editor. Node 22 opcional, solo para el autocompletado del editor.
- Ejecutar `scripts/preflight` en casa. Comprueba el runtime, la memoria de la VM, la arquitectura y el disco; hace `docker compose pull` y un smoke test (Chromium arranca, se captura un trace, el modelo responde dentro de un tiempo límite). Imprime un resumen OK/KO.

## Calendario (4 semanas)

**Semana 1: spikes y app**
- Chromium ARM64 de Playwright con Chrome DevTools MCP y WebPerf Snippets MCP en el contenedor.
- **Chromium en la ruta por defecto** (`~/.cache/ms-playwright`). El cliente stdio del MCP SDK no pasa `PLAYWRIGHT_BROWSERS_PATH` al servidor y este no encuentra el navegador (verificado con los tests e2e de WebPerf Snippets).
- Medir el tamaño de la salida de `performance_analyze_insight` de Chrome DevTools MCP frente a trace-engine-cli sobre el mismo trace. Si DevTools MCP es igual de compacto, trace-engine-cli sobra.
- Benchmark de modelos en el Mac de referencia con Chromium corriendo a la vez: latencia p50, tasa de JSON válido, acierto en las 4 ramas y RAM. Se fija el modelo con datos.
- E-commerce y las 4 ramas de regresión.

**Semana 2: agentes y gate**
- Orquestador, 5 subagentes, Judge, servicio `ci`, perfil `lite`.
- Tags de solución por paso y comandos de verificación.

**Semana 3: distribución y docs**
- Workflow de build multiarch y publicación en GHCR.
- Preflight `.sh` y `.ps1`.
- Docs en castellano, web Starlight con marca PerfReviews, traducción a catalán e inglés y check de paridad.

**Semana 4: ensayo**
- Ensayo completo cronometrado desde un `git clone` limpio.
- Prueba en Linux amd64 y en un equipo de 8 GB con `lite`.
- Ajustes y congelación de versiones.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| VM con poca memoria asignada | El preflight lo detecta y da instrucciones por runtime |
| Ruido en métricas de laboratorio | A/B en la misma ejecución, mediana de 5, throttling fijo, test estadístico |
| Modelo lento en CPU | Benchmark en la semana 1, prompt compacto (resúmenes TOON de unos 2 KB), perfil `lite` |
| Cambios en las herramientas | Versiones fijadas y probadas en las imágenes |
| Asistentes sin pull previo | Comunicación temprana; la Wi-Fi del evento no basta para 4 o 5 GB por persona |
| trace-engine-cli inmaduro (0.2.0) | Llamada directa a la CLI, fácil de sustituir; el experimento detecta cambios de comportamiento |

## Hecho

- **WebPerf Snippets 1.14.0** (PRs #404, #405 y #406): `cpu` y `network` en las tools del MCP, throttling en las condiciones del baseline, `interactions` con `runs` y `baseline` en `run_workflow` y `run_snippet`, y test e2e de la CLI con `--interact-script`, `--runs`, `--cpu`, `--baseline` y `--fail-on-regression`. Revisado: 554 tests unitarios y 44 e2e de las partes que usa el taller, todos en verde.
- **Experimento trace-engine-cli** en `experiments/trace-engine-cli/`, con 6 aserciones estables en tres ejecuciones.
- **Learnings**: "No todo tiene que ser un MCP", en `docs/src/content/docs/es/learnings.md`.
- **Spike del contenedor `agents`** (ARM64): imagen `docker/agents/Dockerfile`, cliente `agents/src/mcp/client.ts` y smoke test con los dos MCP por stdio, en verde sin red en tres ejecuciones.
- **Experimento Chrome DevTools MCP** en `experiments/chrome-devtools-mcp/`, con 7 tests en macOS (6 y 1 saltado en Linux), estables en tres ejecuciones.
- **Learnings**: "Chrome DevTools MCP fuera del editor" (`pageId`, rutas, `TMPDIR`, sandbox).
- **Spike DevTools MCP frente a trace-engine-cli**: sobre el mismo trace, Chrome DevTools MCP da unas 5,6 veces más texto y no nombra la función del INP. trace-engine-cli se queda para la atribución. Test en `experiments/trace-engine-cli/compare.test.mjs` y subsección en "No todo tiene que ser un MCP".

- **App Perf Coffee** (`apps/shop`, React 19 + Vite 8, interfaz en inglés) y **mocks de third parties** (`apps/thirdparty`, Node sin dependencias). Servidor de producción con gzip y preload de la imagen LCP por ruta. 22 tests en la tienda (7 de lógica del carrito, 11 del servidor y 4 e2e del recorrido) y 6 en los mocks. Fotos de Unsplash en `apps/shop/photos.json` y `CREDITS.md`.
- **Un solo Chromium**: WebPerf Snippets 1.15.0 lanza el Chromium completo, con fallback al headless shell, y la imagen `agents` lo instala con `--no-shell`. La imagen pasa de 531 MB a 416 MB (`docker image inspect`), y la CLI registra `"build": "chromium"` en las condiciones.
- **Nombres de función en el build**: con la minificación por defecto de Vite, trace-engine-cli nombra `Ae` en lugar de `recommendFor`, y no lee source maps. El build de la tienda usa `output.keepNames` de Rolldown: sigue minificado, con un 10 % más de gzip (de 72 a 80 KB), y `tasks --tree bottom-up` nombra `recommendFor` en `pr/loaf-cart-handler`. `apps/shop/build.test.mjs` lo protege, y las ramas `pr/*` están rebasadas sobre ese build.
- **Ramas de regresión** `pr/lcp-hero-lazy`, `pr/cls-promo-banner`, `pr/loaf-cart-handler` y `pr/noop-refactor`, publicadas en el remoto. **Experimento** `experiments/regressions/`: construye `main` y las cuatro ramas, pasa el gate y comprueba los veredictos (3 fallos y 1 pass), en unos 5 minutos. Journey `agents/journeys/add-to-cart.json`.
- **Capa de medida en Docker Compose**: `thirdparty`, `shop-baseline`, `shop-candidate` y `agents` en una red `lab` interna, sin salida a internet. Una imagen de la tienda por ref (`shop:main`, `shop:pr-lcp-hero-lazy`...), construida por `scripts/build-shop.sh` con el Dockerfile del árbol de trabajo; `BASELINE` y `CANDIDATE` eligen cuáles se comparan. `agents/test/compose.test.ts` comprueba los nombres de servicio, el LCP de las dos tiendas por MCP y que no hay salida a internet. El gate de la CLI dentro de Compose detecta `pr-lcp-hero-lazy` (LCP de 652 ms a 1,06 s) y `pr-loaf-cart-handler` (INP de 16 a 96 ms), los dos con exit 1. Imágenes: `shop` 81 MB y `thirdparty` 80 MB.

- **Benchmark de modelos** en `experiments/models/`: cuatro modelos sobre las entradas reales de las ramas, en cuatro pasadas guardadas en `results/`. Se fija `llama3.2:3b` con el schema como salida estructurada. Las reglas deciden el veredicto, la métrica (una explicación por métrica regressed, ordenadas por cuántas veces superan su umbral) y, cuando un sospechoso de los traces aparece en el diff, la causa; sin regresión no se pregunta al LLM. Con todo eso, la causa correcta pasa de 9 a 14 de 15 respuestas. Documentado en Learnings ("El LLM explica, las reglas deciden") y en la página mapa "Por qué este stack".

- **Servicio `ollama`** (`docker/ollama/Dockerfile`, imagen `ollama:llama3.2-3b`): `llama3.2:3b` dentro de la imagen, con el digest `a80c4f17acd5` comprobado en el build, y sin las librerías CUDA de la imagen oficial (unos 3,6 GB que en CPU no se usan). Con el modelo dentro ocupa 2,04 GB en `docker image inspect`, frente a 2,85 GB de la oficial sin modelo. `OLLAMA_NO_CLOUD=1` evita las consultas a ollama.com en la red sin salida. Perfil `llm` activado por el `.env` del repo; `agents` depende de `ollama` con `required: false`, así que con `COMPOSE_PROFILES=lite` arranca sin él. `agents/test/ollama.test.ts` comprueba que el modelo está en la imagen y responde JSON restringido por un schema; en `lite` se salta. Verificado en los dos perfiles: 7 tests en verde con `llm` y 5 más 2 saltados con `lite`. Sin el modelo cargado, el contenedor ocupa 23 MB; con el modelo, 2,7 GB con el contexto por defecto de 4.096 tokens (`docker stats`).
- **Reglas del Judge en `agents/src/judge/`**: `rules.ts`, `suspects.ts`, `match.ts`, `normalize.ts` y `prompt.ts`, pasados a TypeScript sin cambiar la lógica, con sus 17 tests en `agents/test/judge/`. `experiments/models` los importa desde allí y solo conserva lo propio del benchmark (el modo sin salida estructurada y la puntuación); `claims.test.mjs` sigue en verde y el rescore de `4-rules` da las mismas cifras (14 de 15 causas).
- **Explicación del Judge** en `agents/src/subagents/judge.ts`: `explain(input, chat)` aplica las reglas, pide a ollama una explicación por métrica con el schema como `format` y las opciones del benchmark (temperatura 0, semilla 42, contexto de 8.192 tokens), valida la respuesta con `ajv` y, si contradice el veredicto o la métrica de las reglas, se queda con los de las reglas y anota la discrepancia. Sin regresión responde sin LLM; un JSON inválido, una respuesta fuera del schema o una llamada fallida quedan como error sin explicación, y el veredicto no cambia. 5 tests con un LLM de respuestas fijadas y uno de integración con `llama3.2:3b` sobre el fixture de `pr/loaf-cart-handler` (se salta si no están el modelo o `experiments/models`): dentro de Compose nombra `ab.js` para el LCP y `recommendFor` para el INP, sin discrepancias, en unos 35 s las dos llamadas.
- **Servicio `ci`** en `agents/src/ci/gate.ts`, con la imagen de `agents` (que ahora lleva `git`) y el repo montado en solo lectura. El gate de `experiments/regressions` y la grabación y los resúmenes de traces de `experiments/models` pasan a `agents/src/judge/` (`gate.ts`, `traces.ts`, `diff.ts`), y los experimentos los importan: los fixtures salen idénticos con `--gate-only` y `npm test` de regresiones da los cuatro veredictos. `ci` encuentra la rama de cada imagen de la tienda por su tag (local o en `origin`). Escribe siempre el handoff en JSON y en Markdown (`agents/src/judge/handoff.ts`), con las mismas peticiones que recibe el LLM local (`requestsFor` en `prompt.ts`) y el aviso de que enviar el diff fuera es decisión de cada equipo. Sin regresión, las reglas responden en los dos perfiles. Verificado de punta a punta: `pr-lcp-hero-lazy` con `llm` (exit 1, LCP de 652 a 1064 ms, una llamada al LLM, unos 3 minutos en total), `pr-noop-refactor` con `lite` (exit 0, la respuesta de las reglas en el informe, sin arrancar ollama) y `pr-cls-promo-banner` con `lite` (exit 1, el informe remite al handoff).
- **Un trace de carga en cada escenario**: el CLS de `pr/cls-promo-banner` queda casi igual en los dos escenarios (0,053 en la home y 0,055 en `add-to-cart` en una ejecución de `ci`), así que el ruido decide cuál explica el Judge. El trace de `add-to-cart` empezaba después de la carga y no tenía resumen `shifts`, y cuando ganaba ese escenario el prompt decía que no había sospechosos. Ahora `add-to-cart` graba dos traces por lado: uno de la carga para `shifts` y otro del click para `interactions` y `tasks`, para que las tareas de la carga no tapen el handler. Con `ci`: en `pr-cls-promo-banner` el sospechoso es el cluster de 0,0541 que el baseline no tiene y el modelo nombra `font-display: swap`; en `pr-loaf-cart-handler` el INP sigue teniendo solo a `recommendFor` como sospechoso y el LCP solo a `ab.js`.
- **Comillas escapadas en el prompt del Judge**: el modelo copiaba `loading="lazy"` del diff a su respuesta y la comilla cerraba la cadena del JSON restringido por el schema, así que la frase del hero se quedaba en `loading=`. `requestsFor` escapa ahora las comillas dobles del diff y de la línea que relacionan las reglas (`escapeQuotes` en `prompt.ts`), y el handoff lleva lo mismo. El benchmark tiene la etapa `quotes` (por defecto) y `COLD=1`, que descarga el modelo antes de cada llamada. La diferencia entre repeticiones era la caché del prompt de Ollama: en frío, las tres repeticiones de cada caso salen idénticas. Pasadas en frío: `5-rules-cold`, 12 de 15, con el hero cortado las tres veces; `6-quotes-cold`, 15 de 15. Con `ci` en `pr-lcp-hero-lazy`, la explicación nombra el `loading="lazy"` añadido al `img`. En un prototipo del scratchpad, pedir en el prompt comillas simples también evitaba el corte, pero la frase decía "from `'lazy'` to `'lazy'`"; no está en el repo y no va a los docs.
- **Textos cortados en el informe**: la gramática del schema corta cada evidencia en 200 caracteres sin avisar (pasó una vez con `ci` en `pr-lcp-hero-lazy`). En el benchmark, ninguna de las 108 evidencias de las pasadas 4 a 6 llega al límite (`claims.test.mjs`), así que el schema y el prompt no cambian: el informe añade "…" al texto que llega al límite, leído del propio schema.
- **Las cifras del benchmark valen para la imagen del taller**: en frío, la imagen `ollama` da exactamente las mismas respuestas que `ollama-bench` y que las guardadas en `6-quotes-cold`, en los 4 casos con regresión; la diferencia que se vio antes entre las dos era la caché del prompt. `agents/test/ollama.test.ts` lo comprueba contra el servicio de Compose cuando `experiments/` está montado (`-v "$PWD/experiments:/experiments:ro"`), y sirve de guarda al subir de versión Ollama o el modelo. Pasó también con la máquina cargada (carga media de 10 a 12): la carga cambia la latencia, no las respuestas. Comprobado solo en el Mac de referencia.
- **Fixtures regenerados y benchmark repetido en frío**: los fixtures y las pasadas del 10 y 11 de noviembre quedan en `experiments/models/history/2026-11-10/`, y `claims.test.mjs` sigue comprobando sus cifras. Los fixtures nuevos llevan el gate de la última ejecución de `experiments/regressions` y dos traces en `add-to-cart`. En frío, una repetición basta, y las pasadas se guardan por etapa (`results/llm.json`, `suspects`, `rules`, `quotes`). Causa correcta: `llm` 3/5 con `llama3.2:3b`, 2/5 con `qwen3:1.7b` y `qwen2.5-coder:1.5b` y 0/5 con `gemma3:1b`; `suspects` 3/5, 3/5, 2/5 y 0/5; `rules` y `quotes` 5/5 con `llama3.2:3b`. Sin escapar, la frase del hero ya no se corta, pero mezcla `loading` con `fetchPriority`; escapada, nombra el atributo. La imagen `ollama` da las mismas respuestas en frío que `quotes`. En el benchmark el CLS de `pr/cls-promo-banner` se sigue explicando en la home (0,0696 frente a 0,0547), así que el `shifts` de `add-to-cart` no se usa. Una evidencia mide justo 200 caracteres y está completa, así que el informe solo marca con "…" el texto en el límite que no termina una frase.

## Pendiente

- Ojo: `node fixtures.mjs --gate-only` reescribe el gate de los fixtures con el último `results.json` de `experiments/regressions`.
- En Linux, Compose crea `out/` como root si no existe y el usuario `node` del contenedor no puede escribir. El preflight debería crearla, o `ci` correr con el UID del host. Probarlo en la prueba de Linux amd64.
- La explicación del LCP de `pr/lcp-hero-lazy` sigue siendo la floja, como en el benchmark: en la primera ejecución de `ci` nombra `lazy` pero lo mezcla con `fetchPriority`, con confianza baja.
- Probar la imagen `ollama` en amd64: allí las librerías de CPU son otras y no se ha comprobado que el `rm -rf cuda_*` deje todo lo necesario.
- En la prueba de Linux amd64, ejecutar `agents/test/ollama.test.ts` con `experiments/` montado: otra CPU carga otra variante de `libggml-cpu` y podría dar otras respuestas en frío, y entonces las cifras del benchmark no valdrían tal cual en esa máquina.
- En la ejecución de `ci` de `pr-lcp-hero-lazy`, la tercera evidencia dice que `lcpImageFor` no cambia, cuando la rama quita su línea de la home. Es una evidencia falsa con la causa correcta; el criterio de `score.mjs` no mira las evidencias.
- Repetir la latencia en caliente del benchmark con la máquina en reposo (carga media por debajo de 3): `STAGE=quotes REPS=3 MODES=schema node bench.mjs llama3.2:3b`. La única cifra en caliente es la de la primera medida, de 9 a 37 s por explicación con otra carga; el 11 de noviembre la carga media pasó de 20 y llegó a 33 por otros procesos.
- Traducir a catalán e inglés la página mapa y las secciones nuevas de Learnings.
- Workflow de GHCR: publicar multiarch `agents`, `thirdparty`, `ollama` y una imagen `shop` por cada ref (`main` y las cuatro `pr/*`).
- Experimentos reproducibles de dos datos que hoy solo cuenta la página mapa, sin cifras: sin throttling de red la regresión de LCP no se ve, y sin preload el `lazy` del hero apenas cambia el LCP.
- Experimento reproducible de la atribución con y sin `keepNames` (hoy solo hay un spike en el scratchpad), antes de llevarlo a Learnings como candidato: "si quieres que un agente atribuya, conserva los nombres".
- `--workspace` en `agents/src/mcp/client.ts`, apuntando a `out/`, la carpeta de salida de `ci`.
- Medir el tamaño de descarga real de la imagen `agents` (con un solo Chromium, Docker Desktop muestra 1,51 GB y `docker image inspect`, 416 MB).
- Decidir si se añaden a Learnings estos cuatro candidatos:
  1. El cliente stdio de MCP no pasa todo el entorno al servidor (el caso de `TMPDIR` ya está en "Chrome DevTools MCP fuera del editor"; falta el de `PLAYWRIGHT_BROWSERS_PATH`).
  2. No hay paquete de Google Chrome para Linux ARM64; se usa el Chromium de Playwright.
  3. El LLM explica y las reglas deciden.
  4. Cambio en la herramienta antes que parche en el taller (PRs #404 a #406).
- Posible línea en `content/MCP.mdx` de WebPerf Snippets sobre el entorno del cliente stdio.
- Traducciones de Learnings a catalán e inglés.
