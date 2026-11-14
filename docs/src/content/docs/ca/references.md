---
title: Referències
description: Lectures per anar més lluny en cada tema del taller, amb el que aporta cadascuna.
sidebar:
  order: 94
---

Lectures escollides, per tema. Gairebé totes són fonts primàries: la documentació oficial, l'especificació o el repositori de l'eina. Són en anglès.

## Core Web Vitals

- [Web Vitals](https://web.dev/articles/vitals): què són les Core Web Vitals i d'on surten els seus llindars.
- [Largest Contentful Paint](https://web.dev/articles/lcp) i [Optimize Largest Contentful Paint](https://web.dev/articles/optimize-lcp): la mètrica, les seves quatre fases i l'arranjament de cadascuna. D'aquí surt "mai no carreguis en `lazy` la imatge de l'LCP".
- [Fetch Priority API](https://web.dev/articles/fetch-priority): què fa `fetchpriority` i en què es diferencia d'un preload.
- [Cumulative Layout Shift](https://web.dev/articles/cls), [Optimize Cumulative Layout Shift](https://web.dev/articles/optimize-cls) i [Debug layout shifts](https://web.dev/articles/debug-layout-shifts): com es calcula, quins desplaçaments compten i com trobar el node que es mou.
- [Interaction to Next Paint](https://web.dev/articles/inp) i [Optimize Interaction to Next Paint](https://web.dev/articles/optimize-inp): les tres fases d'una interacció i què fer amb cadascuna.

## Atribuir una interacció lenta

- [Long Animation Frames API](https://developer.chrome.com/docs/web-platform/long-animation-frames): la guia de Chrome, amb els camps que anomenen l'script i qui l'invoca.
- [Long animation frame timing](https://developer.mozilla.org/en-US/docs/Web/API/Performance_API/Long_animation_frame_timing), a MDN, i l'[especificació](https://w3c.github.io/long-animation-frames/).
- [PerformanceEventTiming](https://developer.mozilla.org/en-US/docs/Web/API/PerformanceEventTiming), a MDN, i l'[especificació d'Event Timing](https://w3c.github.io/event-timing/): d'on surten els temps de l'INP.

## Mesurar en laboratori

- [Why lab and field data can be different](https://web.dev/articles/lab-and-field-data-differences): per què el laboratori i el camp no coincideixen, mètrica a mètrica.
- [Score Variability](https://github.com/GoogleChrome/lighthouse/blob/main/docs/variability.md), de Lighthouse: d'on ve el soroll d'una mesura de laboratori i com reduir-lo.
- [Network Throttling](https://github.com/GoogleChrome/lighthouse/blob/main/docs/throttling.md), de Lighthouse: què simula el throttling de xarxa i de CPU, i com es calibra amb la velocitat de la màquina.
- [Throttling](https://developer.chrome.com/docs/devtools/settings/throttling), a DevTools: com calibrar el throttling de CPU al teu equip.
- [Performance features reference](https://developer.chrome.com/docs/devtools/performance/reference): com llegir un trace al panell Performance, que és on s'obre el del pas 1.

## Un gate de rendiment

- [Performance budgets 101](https://web.dev/articles/performance-budgets-101): la idea d'un pressupost de rendiment, l'antecedent del gate.
- [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci): una altra manera de passar un control de rendiment a cada commit, amb llindars absoluts.
- [Performance Sheriffing](https://firefox-source-docs.mozilla.org/testing/perfdocs/perf-sheriffing.html), de Firefox: com un projecte gran detecta i atén regressions de rendiment cada dia.
- [Exploring Statistical Change Point Detection Techniques for Performance Anomaly Detection at Mozilla](https://arxiv.org/abs/2606.18377): un estudi dels falsos positius d'aquestes alertes, que compara 25 mètodes de detecció de canvis per reduir-los.

## L'estadística del gate

- [Mann-Whitney U test](https://en.wikipedia.org/wiki/Mann%E2%80%93Whitney_U_test): el test que fa servir el gate, i per què mira l'ordre i no els valors.
- [Interpreting results: Mann-Whitney test](https://www.graphpad.com/guides/prism/8/statistics/how_the_mann-whitney_test_works.htm): una explicació planera, amb el cas de les mostres petites.
- [scipy.stats.mannwhitneyu](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.mannwhitneyu.html): quan el p-value és exacte i quan una aproximació.
- [Hodges-Lehmann estimator](https://en.wikipedia.org/wiki/Hodges%E2%80%93Lehmann_estimator): com s'estima quant ha canviat, que és la dada que acompanya p als informes.

## MCP i les eines del taller

- [Model Context Protocol](https://modelcontextprotocol.io/specification/2025-11-25): l'especificació. Les seves pàgines de [transports](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) i d'[eines](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) expliquen stdio i el resultat estructurat que llegeixen els subagents.
- [SDK de TypeScript de MCP](https://github.com/modelcontextprotocol/typescript-sdk): el client que fa servir `agents/src/mcp/client.ts`.
- [Chrome DevTools MCP](https://github.com/ChromeDevTools/chrome-devtools-mcp), amb la seva [llista d'eines](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md) i l'[anunci](https://developer.chrome.com/blog/chrome-devtools-mcp) que explica per a què es va fer.
- [WebPerf Snippets](https://github.com/nucliweb/webperf-snippets): les mesures, els workflows i el gate amb baseline, per MCP i per CLI.
- [trace-engine-cli](https://github.com/ChromeDevTools/trace-engine-cli): els resums d'un trace que anomenen la funció, i el [motor de traces de DevTools](https://github.com/ChromeDevTools/devtools-frontend/tree/main/front_end/models/trace) en què es recolza.
- [TOON](https://github.com/toon-format/toon): el format compacte d'aquests resums.

## El model que explica

- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents): començar per la solució més simple i posar comprovacions de codi entre els passos d'un model.
- [Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents): com dissenyar eines que retornin poc text i molt útil.
- [Structured outputs](https://docs.ollama.com/capabilities/structured-outputs), a Ollama: com s'obliga el model local a respondre amb el schema del veredicte.
- [JSON Schema](https://json-schema.org/understanding-json-schema/): la referència per llegir `agents/schemas/verdict.schema.json`.

## El laboratori

- [Profiles](https://docs.docker.com/compose/how-tos/profiles/), a Docker Compose: com conviuen els perfils `llm` i `lite`.
- [Browsers](https://playwright.dev/docs/browsers), a Playwright: la diferència entre el Chromium complet i el headless shell.
- [`keepNames`](https://rolldown.rs/reference/OutputOptions.keepNames), a Rolldown: l'opció que conserva els noms de les funcions al build de la botiga.
