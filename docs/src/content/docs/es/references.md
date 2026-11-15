---
title: Referencias
description: Lecturas para ir más lejos en cada tema del taller, con lo que aporta cada una.
sidebar:
  order: 94
---

Lecturas escogidas, por tema. Casi todas son fuentes primarias: la documentación oficial, la especificación o el repositorio de la herramienta. Están en inglés.

## Core Web Vitals

- [Web Vitals](https://web.dev/articles/vitals): qué son las Core Web Vitals y de dónde salen sus umbrales.
- [Largest Contentful Paint](https://web.dev/articles/lcp) y [Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp): la métrica, sus cuatro fases y el arreglo de cada una. De aquí sale "nunca cargues en `lazy` la imagen del LCP".
- [Fetch Priority API](https://web.dev/articles/fetch-priority): qué hace `fetchpriority` y en qué se diferencia de un preload.
- [Cumulative Layout Shift](https://web.dev/articles/cls), [Optimize Cumulative Layout Shift](https://web.dev/articles/optimize-cls) y [Debug layout shifts](https://web.dev/articles/debug-layout-shifts): cómo se calcula, qué desplazamientos cuentan y cómo encontrar el nodo que se mueve.
- [Interaction to Next Paint](https://web.dev/articles/inp) y [Optimize Interaction to Next Paint](https://web.dev/articles/optimize-inp): las tres fases de una interacción y qué hacer con cada una.

## Atribuir una interacción lenta

- [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames): la guía de Chrome, con los campos que nombran el script y quién lo invoca.
- [Long animation frame timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing), en MDN, y la [especificación](https://w3c.github.io/long-animation-frames/).
- [PerformanceEventTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming), en MDN, y la [especificación de Event Timing](https://w3c.github.io/event-timing/): de dónde salen los tiempos del INP.

## Medir en laboratorio

- [Why lab and field data can be different](https://web.dev/articles/lab-and-field-data-differences): por qué el laboratorio y el campo no coinciden, métrica a métrica.
- [Score Variability](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md), de Lighthouse: de dónde viene el ruido de una medida de laboratorio y cómo reducirlo.
- [Network Throttling](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md), de Lighthouse: qué simula el throttling de red y de CPU, y cómo se calibra con la velocidad de la máquina.
- [Throttling](https://developer.chrome.com/docs/devtools/settings/throttling), en DevTools: cómo calibrar el throttling de CPU en tu equipo.
- [Performance features reference](https://developer.chrome.com/docs/devtools/performance/reference): cómo leer un trace en el panel Performance, que es donde se abre el del paso 1.

## Un gate de rendimiento

- [Performance budgets 101](https://web.dev/articles/performance-budgets-101): la idea de un presupuesto de rendimiento, el antecedente del gate.
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci): otra manera de pasar un control de rendimiento en cada commit, con umbrales absolutos.
- [Performance Sheriffing](https://firefox-source-docs.mozilla.org/testing/perfdocs/perf-sheriffing.html), de Firefox: cómo un proyecto grande detecta y atiende regresiones de rendimiento a diario.
- [Exploring Statistical Change Point Detection Techniques for Performance Anomaly Detection at Mozilla](https://arxiv.org/abs/2606.18377): un estudio de los falsos positivos de esas alertas, que compara 25 métodos de detección de cambios para reducirlos.

## La estadística del gate

- [Mann-Whitney U test](https://en.wikipedia.org/wiki/Mann%E2%80%93Whitney_U_test): el test que usa el gate, y por qué mira el orden y no los valores.
- [Interpreting results: Mann-Whitney test](https://www.graphpad.com/guides/prism/8/statistics/how_the_mann-whitney_test_works.htm): una explicación llana, con el caso de las muestras pequeñas.
- [scipy.stats.mannwhitneyu](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.mannwhitneyu.html): cuándo el p-value es exacto y cuándo una aproximación.
- [Hodges-Lehmann estimator](https://en.wikipedia.org/wiki/Hodges%E2%80%93Lehmann_estimator): cómo se estima cuánto ha cambiado, que es el dato que acompaña a p en los informes.

## MCP y las herramientas del taller

- [Model Context Protocol](https://modelcontextprotocol.io/specification/2025-11-25): la especificación. Sus páginas de [transportes](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) y de [herramientas](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) explican stdio y el resultado estructurado que leen los subagentes.
- [SDK de TypeScript de MCP](https://github.com/modelcontextprotocol/typescript-sdk): el cliente que usa `agents/src/mcp/client.ts`.
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp), con su [lista de herramientas](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md) y el [anuncio](https://developer.chrome.com/blog/chrome-devtools-mcp) que cuenta para qué se hizo.
- [WebPerf Snippets](https://github.com/nucliweb/webperf-snippets): las medidas, los workflows y el gate con baseline, por MCP y por CLI.
- [trace-engine-cli](https://github.com/ChromeDevTools/trace-engine-cli): los resúmenes de un trace que nombran la función, y el [motor de traces de DevTools](https://github.com/ChromeDevTools/devtools-frontend/tree/main/front_end/models/trace) en el que se apoya.
- [TOON](https://github.com/toon-format/toon): el formato compacto de esos resúmenes.

## El modelo que explica

- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents): empezar por la solución más simple y poner comprobaciones de código entre los pasos de un modelo.
- [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents): cómo diseñar herramientas que devuelvan poco texto y muy útil.
- [Structured outputs](https://docs.ollama.com/capabilities/structured-outputs), en Ollama: cómo se obliga al modelo local a responder con el schema del veredicto.
- [JSON Schema](https://json-schema.org/understanding-json-schema/): la referencia para leer `agents/schemas/verdict.schema.json`.

## El laboratorio

- [Profiles](https://docs.docker.com/compose/how-tos/profiles/), en Docker Compose: cómo conviven los perfiles `llm` y `lite`.
- [Browsers](https://playwright.dev/docs/browsers), en Playwright: la diferencia entre el Chromium completo y el headless shell.
- [`keepNames`](https://rolldown.rs/reference/OutputOptions.keepNames), en Rolldown: la opción que conserva los nombres de las funciones en el build de la tienda.
