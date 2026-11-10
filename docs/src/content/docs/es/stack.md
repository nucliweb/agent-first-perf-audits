---
title: Por qué este stack
description: Cada pieza del taller, qué descartamos y el dato que lo decidió.
sidebar:
  order: 80
---

El stack del taller no salió de un diagrama: cada pieza es la respuesta a algo que probamos y no funcionó como esperábamos. Esta página es el mapa. Cada fila dice qué elegimos, qué descartamos, por qué y cómo comprobarlo en tu máquina. Las historias largas están en [Learnings](../learnings/).

## Las reglas deciden, el LLM explica

| Decisión | Descartado | Por qué | Compruébalo |
|---|---|---|---|
| El veredicto del gate es el exit code de la CLI de WebPerf Snippets: Mann-Whitney U, umbral y `--fail-on-regression` | Que el LLM decida si una rama pasa | El gate detecta las tres regresiones y deja pasar el refactor, siempre con el mismo resultado. Los modelos pequeños se inventan regresiones que no existen | [`experiments/regressions`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/regressions) y [`experiments/models`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/models) |
| La regla decide también qué métricas explicar, y el Judge pide una explicación por métrica | Que el LLM elija la métrica | Es lo que más fallaban los modelos, y una rama puede empeorar dos métricas por dos causas: `pr/loaf-cart-handler` empeora el LCP por un script síncrono y el INP por un handler pesado | `experiments/models`, `rules.test.mjs` |
| Las métricas se ordenan por cuántas veces superan su umbral | Ordenarlas por porcentaje | El CLS de la versión base es 0, así que su porcentaje no existe; el umbral es la misma vara con la que el gate decide | `experiments/models`, `rules.test.mjs` |

## Medir

| Decisión | Descartado | Por qué | Compruébalo |
|---|---|---|---|
| El gate mide con CPU 4x, red fast-4g y 5 ejecuciones | Medir sin throttling de red | Con la red local instantánea, la prioridad de descarga de la imagen LCP apenas pesa, y la regresión de LCP no se distingue del ruido | `experiments/regressions` |
| El INP se mide con `--workflow interaction` y un journey | El workflow por defecto | El workflow por defecto no devuelve el INP | [`agents/journeys/add-to-cart.json`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/agents/journeys/add-to-cart.json) |
| Un solo Chromium, el completo de Playwright, para WebPerf Snippets y Chrome DevTools MCP | El headless shell para la CLI y Chromium para DevTools | Las dos herramientas miden con el mismo binario y el mismo modo headless, y la imagen solo lleva un navegador. WebPerf Snippets lanza el Chromium completo cuando está instalado y registra en sus condiciones cuál usó | `docker compose run --rm agents` |

## Atribuir

| Decisión | Descartado | Por qué | Compruébalo |
|---|---|---|---|
| trace-engine-cli, llamada como CLI | Envolverla en un servidor MCP, o quedarse solo con los insights de Chrome DevTools MCP | Sobre el mismo trace, Chrome DevTools MCP da más del triple de texto y no nombra la función que causa el INP | [No todo tiene que ser un MCP](../learnings/#no-todo-tiene-que-ser-un-mcp), [`experiments/trace-engine-cli`](https://github.com/nucliweb/agent-first-perf-audits/tree/main/experiments/trace-engine-cli) |
| El build de la tienda conserva los nombres de función (`keepNames` de Rolldown) | La minificación por defecto, o source maps | Minificado, el profiler nombra la función con una letra y el Judge no la puede relacionar con el diff. trace-engine-cli no lee source maps | [`apps/shop/build.test.mjs`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/apps/shop/build.test.mjs) |
| Chrome DevTools MCP con `--no-page-id-routing`, `--workspace` y, en el contenedor, `--no-sandbox` | Sus valores por defecto | Están pensados para un agente en el editor, no para subagentes en un contenedor | [Chrome DevTools MCP fuera del editor](../learnings/#chrome-devtools-mcp-fuera-del-editor) |

## La app y las ramas

| Decisión | Descartado | Por qué | Compruébalo |
|---|---|---|---|
| La tienda es una SPA de React, y su servidor hace preload de la imagen LCP de cada ruta | Una SPA sin preload | En una SPA, la imagen LCP no se descubre hasta que se ejecuta el JavaScript. Sin preload en la versión base, quitar `fetchpriority` y añadir `loading="lazy"` no cambia el LCP lo bastante como para que el gate lo vea | `experiments/regressions` |
| Cada rama de regresión actualiza los tests de la app que su cambio rompe | Dejar que el CI clásico detecte la regresión | Es lo que haría el autor de la PR, y muestra lo que el taller defiende: el CI clásico pasa en las cuatro ramas y solo el gate de rendimiento detecta las tres regresiones | `npm test` en `apps/shop` de cada rama |

## El laboratorio

| Decisión | Descartado | Por qué | Compruébalo |
|---|---|---|---|
| Una imagen de la tienda por ref git, construida con el mismo Dockerfile | Construir en Compose desde la URL del repo, o una sola imagen con todas las variantes | La versión base y la candidata se construyen igual, cada asistente solo descarga imágenes y quien quiera puede construir su propia rama | [`scripts/build-shop.sh`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/scripts/build-shop.sh) |
| Todos los servicios en una red interna, sin salida a internet | La red por defecto de Docker | El gate no depende de la red del evento, y nada de la medida sale de la máquina | [`agents/test/compose.test.ts`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/agents/test/compose.test.ts) |
| `agents` solo arranca con `docker compose run` | Que `docker compose up` lo arranque | Un Chromium de más en segundo plano se reparte la CPU con la medida | [`compose.yaml`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/compose.yaml) |
| El modelo va dentro de la imagen de `ollama` | Descargarlo con `ollama pull` al arrancar, a un volumen | La red del laboratorio no tiene salida a internet, y la Wi-Fi del evento no aguanta 2 GB por persona: el modelo llega con `docker compose pull` en casa | [`agents/test/ollama.test.ts`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/agents/test/ollama.test.ts) |
| La imagen de `ollama` copia el binario y las librerías de CPU de la oficial a un Ubuntu limpio | Usar `ollama/ollama` tal cual como base | La oficial lleva unos 3,6 GB de librerías CUDA que en Docker sobre CPU no se usan. Sin ellas, la imagen con el modelo dentro ocupa 2,04 GB, menos que la oficial sin modelo (2,85 GB) | `docker image inspect --format '{{.Size}}'` sobre las dos |
| El build comprueba el digest del modelo | Fiarse de la etiqueta `llama3.2:3b` | Una etiqueta de Ollama puede apuntar a otro modelo mañana, y las cifras del benchmark son de este | [`docker/ollama/Dockerfile`](https://github.com/nucliweb/agent-first-perf-audits/blob/main/docker/ollama/Dockerfile) |
| `ollama` está en el perfil `llm`, que activa el `.env` del repo; con `COMPOSE_PROFILES=lite` no se descarga ni se arranca | Un `ollama` siempre activo, o un segundo fichero de Compose | Compose no tiene un perfil por defecto del que excluir un servicio. Así, quien va con 8 GB no descarga el modelo, y cada comando sigue siendo el mismo | `COMPOSE_PROFILES=lite docker compose config --services` |

## El modelo

| Decisión | Descartado | Por qué | Compruébalo |
|---|---|---|---|
| `llama3.2:3b` en Ollama, en CPU | `qwen3:1.7b`, `qwen2.5-coder:1.5b` y `gemma3:1b` | Es el que más acierta la causa en cada etapa, y cabe en un portátil de 16 GB: Ollama le asigna 3,3 GB | [El LLM explica, las reglas deciden](../learnings/#el-llm-explica-las-reglas-deciden), `experiments/models` |
| El JSON del modelo se pide con el schema como salida estructurada (`format` de Ollama) | Describir el JSON solo en el prompt | Solo con el prompt, algún modelo envuelve siempre el JSON en un bloque de código y la respuesta no se puede procesar; con el schema, los cuatro devuelven JSON válido | `experiments/models` |
| Las reglas relacionan cada sospechoso de los traces con la línea del diff que lo añade, y el LLM solo redacta la causa | Darle al modelo los sospechosos y dejar que razone | Con los sospechosos, `llama3.2:3b` sigue en 9 de 15 respuestas correctas; con la causa relacionada por las reglas, llega a 14 de 15 | `experiments/models`, `match.test.mjs` |
| Sin regresión, el Judge responde sin preguntar al LLM | Preguntarle también en las ramas que pasan | Con la regla diciendo que nada empeoró, los modelos se inventaban una regresión | `experiments/models` |
