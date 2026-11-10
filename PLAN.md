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
| Modelo | Por decidir en el spike | Candidatos: `qwen3:1.7b` (sin thinking), `qwen2.5-coder:1.5b`, `llama3.2:3b`, `gemma3:1b` |

## Arquitectura (docker compose)

- **`shop-baseline`** y **`shop-candidate`**: la misma app construida desde dos refs git (`main` y la rama PR). La comparación A/B ocurre en la misma máquina y en la misma ejecución, lo que neutraliza la varianza entre portátiles.
- **`thirdparty`**: mocks locales (analytics, chat, banner de promo, A/B testing) con latencia y coste de CPU configurables.
- **`agents`**: Node 22, Chromium de Playwright, Chrome DevTools MCP, WebPerf Snippets y trace-engine-cli. Contiene el orquestador y los subagentes.
- **`ollama`**: imagen con el modelo ya incluido.
- **`ci`**: ejecuta el gate, escribe `report.json`, `report.md` y `report.html`, y sale con 0 o 1.

### Flujo de subagentes

1. **Navigator**: journeys deterministas (home, listado, ficha, añadir al carrito) definidos como pasos de interacción (`click`, `type`, `hover`, `scroll`, `wait`).
2. **LCP**: WebPerf Snippets MCP `run_workflow` (`core-web-vitals`) y trace con Chrome DevTools MCP.
3. **CLS**: WebPerf Snippets MCP, con selectores de los nodos que se desplazan.
4. **LoAF/INP**: WebPerf Snippets MCP `run_workflow` con `workflow: "interaction"`, `interactions` del Navigator, `runs` y `cpu`. Trace del journey con Chrome DevTools MCP (`performance_start_trace` y `performance_stop_trace` a fichero).
5. **Judge**:
   - **Veredicto**: CLI de WebPerf Snippets con `--interact-script`, `--runs 5`, `--cpu 4`, `--network fast-4g`, `--baseline` y `--fail-on-regression`. El INP necesita `--workflow interaction`; el workflow por defecto no lo devuelve. El exit code es la decisión.
   - **Atribución**: `trace-engine-cli overview`, `interactions` y `tasks --tree bottom-up --top 5` sobre los traces de baseline y candidate.
   - **Explicación**: el LLM recibe el veredicto, las métricas, los selectores, los dos resúmenes de trace y el diff de la rama, y devuelve JSON (`verdict`, `metric`, `suspected_cause`, `evidence`, `confidence`). Si contradice a las reglas, ganan las reglas y se marca la discrepancia.
   - **Perfil `lite`**: sin LLM, solo veredicto y atribución.

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
├── compose.yaml                 # perfiles: default, lite
├── apps/shop/                   # e-commerce demo
├── apps/thirdparty/             # mocks
├── agents/
│   ├── src/orchestrator.ts
│   ├── src/subagents/{navigator,lcp,cls,loaf,judge}.ts
│   ├── src/mcp/client.ts
│   ├── journeys/                # pasos de interacción en JSON
│   └── schemas/verdict.schema.json
├── ci/gate.ts
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

## Pendiente

- Servicios `ollama` (tras el benchmark de modelos) y `ci` (tras el Judge), con los perfiles `default` y `lite`.
- Workflow de GHCR: publicar multiarch `agents`, `thirdparty` y una imagen `shop` por cada ref (`main` y las cuatro `pr/*`).

- Experimento reproducible de la atribución con y sin `keepNames` (hoy solo hay un spike en el scratchpad), antes de llevarlo a Learnings como candidato: "si quieres que un agente atribuya, conserva los nombres".
- `--workspace` en `agents/src/mcp/client.ts` cuando exista la carpeta de salida compartida con `ci`.
- Medir el tamaño de descarga real de la imagen `agents` (con un solo Chromium, Docker Desktop muestra 1,51 GB y `docker image inspect`, 416 MB).
- Decidir si se añaden a Learnings estos cuatro candidatos:
  1. El cliente stdio de MCP no pasa todo el entorno al servidor (el caso de `TMPDIR` ya está en "Chrome DevTools MCP fuera del editor"; falta el de `PLAYWRIGHT_BROWSERS_PATH`).
  2. No hay paquete de Google Chrome para Linux ARM64; se usa el Chromium de Playwright.
  3. El LLM explica y las reglas deciden.
  4. Cambio en la herramienta antes que parche en el taller (PRs #404 a #406).
- Posible línea en `content/MCP.mdx` de WebPerf Snippets sobre el entorno del cliente stdio.
- Traducciones de Learnings a catalán e inglés.
