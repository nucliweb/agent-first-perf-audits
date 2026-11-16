---
title: "Paso 2: el subagente de LCP"
description: El LCP de la home con su desglose y cómo carga la imagen LCP, con WebPerf Snippets MCP.
sidebar:
  order: 12
---

## Qué vas a aprender

- Leer el LCP por sus cuatro fases, y saber cuál mirar primero.
- Pedir a WebPerf Snippets MCP una métrica con su contexto: el elemento, las fases y cómo carga la imagen.
- Separar medir de decidir: el subagente da la evidencia, y el veredicto es del gate, que llega en el paso 4.

## Tiempo

Este paso tiene 20 minutos en la agenda. El tiempo de máquina está medido en el Mac de referencia, con el [ensayo cronometrado](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.es.md):

| | `llm` | `lite` |
|---|---|---|
| Tiempo de máquina del paso | 2,9 min | 2,9 min |
| Punto 5, medir el LCP de las dos tiendas | 1,2 min | 1,2 min |

## La idea en un minuto

El LCP es el tiempo que tarda en pintarse el elemento más grande de la pantalla. El número solo dice que algo va lento; dónde se pierde el tiempo lo dicen sus cuatro fases:

<img src="/diagrams/phases.svg" alt="Las fases del LCP, de la navegación al pintado del elemento más grande: ttfb, resourceLoadDelay, resourceLoadTime y elementRenderDelay. Las fases del INP, de un click al siguiente frame: inputDelay, processingTime y presentationDelay" width="1120" height="340" loading="lazy" decoding="async">

Cada fase apunta a un arreglo distinto. Si crece `resourceLoadDelay`, el navegador descubre la imagen tarde; si crece `resourceLoadTime`, la imagen pesa o la red es lenta; si crece `elementRenderDelay`, algo bloquea el pintado. Lo desarrolla [Conceptos](../../concepts/#lcp-cuatro-fases).

El primer subagente mide eso en la home de cada tienda: el LCP, sus fases y cómo carga la imagen LCP. Aquí ves la evidencia de la primera regresión, la rama `pr/lcp-hero-lazy`, que quita el preload del hero.

## Antes de empezar

Sigues en tu rama `taller`, con el laboratorio levantado. Si no has terminado el paso 1, no pasa nada: la solución de este paso trae también la del anterior.

## Paso a paso

1. Lanza los tests del paso:

   ```bash
   docker compose run --rm agents node --test test/subagents/lcp.test.ts
   ```

   Los 7 tests fallan (`fail 7`) con mensajes como este:

   ```text
   Step 2 of the workshop: shape the answers of WebPerf Snippets into the LCP report. Its tests: test/subagents/lcp.test.ts
   ```

   Es el punto de partida, no un error: `askWebPerf` y `lcpReportOf`, en `agents/src/subagents/lcp.ts`, todavía son un `throw`.

2. Aplica la solución del paso:

   ```bash
   git checkout step-02-solution -- agents/src
   ```

3. Vuelve a lanzar los tests:

   ```bash
   docker compose run --rm agents node --test test/subagents/lcp.test.ts
   ```

   Los 7 pasan (`pass 7`). Los seis primeros usan respuestas guardadas del servidor; el último mide la tienda de verdad y tarda unos 40 segundos.

4. Cambia la tienda candidata por la rama del hero:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose up -d
   ```

5. Mide el LCP de las dos tiendas:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp
   ```

   Es la espera del paso. Por cada tienda escribe una línea como estas (las cifras cambian en cada ejecución):

   ```text
   [orchestrator] lcp, baseline: LCP … ms (img.hero__image); slowest phase resourceLoadTime, … ms; image loading=(not set), fetchpriority=high, preloaded
   [orchestrator] lcp, candidate: LCP … ms (img.hero__image); slowest phase resourceLoadDelay, … ms; image loading=lazy, fetchpriority=(not set), not preloaded
   ```

   Esta es la evidencia de la regresión: el LCP crece, la fase que más pesa pasa a ser el retraso de carga del recurso y la imagen pasa a `loading="lazy"`, sin preload ni `fetchpriority`. En los fixtures de los tests, el LCP pasa de 760 a 1168 ms y el retraso de carga del recurso de 188 a 741 ms. Tus cifras serán parecidas, no iguales: cada ejecución mide de nuevo. El detalle está en `out/agents/lcp-baseline.json` y `lcp-candidate.json`.

6. Pasa la comprobación del paso:

   ```bash
   docker compose run --rm agents npm run check -- step-02
   ```

   ```text
   step-02: The LCP subagent

     OK  tests: test/subagents/lcp.test.ts
     OK  out/agents/lcp-baseline.json
     OK  out/agents/lcp-candidate.json

   step-02 is done.
   ```

## Mientras esperas

El punto 5 mide cada tienda tres veces. Mientras tanto:

- Abre las dos tiendas en el navegador, desde [Las ramas en el navegador](../../previews/). ¿Notas la diferencia a simple vista?
- Cuando salga la línea del baseline, abre `out/agents/lcp-baseline.json`. ¿Qué fase pesa más? ¿Qué atributos tiene la imagen LCP?
- ¿Por qué el subagente se queda con la mediana de tres medidas y no con una sola?

## Punto de control

En pantalla, las dos líneas `[orchestrator] lcp`, con una fase más lenta distinta en cada lado (`resourceLoadTime` en el baseline y `resourceLoadDelay` en la rama), y `step-02 is done.`

## Si algo falla

| Qué ves | Por qué | Qué hacer |
|---|---|---|
| Tus cifras no son las de la guía | Cada ejecución mide de nuevo, y cada máquina es distinta | Compara los dos lados entre sí: cuenta la diferencia y la fase que cambia |
| Las dos líneas dicen lo mismo, con `preloaded` en los dos lados | La tienda candidata no es la del hero: sin `CANDIDATE`, el laboratorio usa `pr-noop-refactor` | Repite los puntos 4 y 5, con `CANDIDATE=pr-lcp-hero-lazy` delante de los dos comandos |
| `KO` en un fichero de `out/agents/` en la comprobación | Falta el punto 5 | La comprobación escribe el comando debajo de "To make the files of out/, run:" |
| Los tests del punto 1 pasan en lugar de fallar | `agents/src` ya tiene la solución de este paso | Sigue desde el punto 4 |

## Qué te llevas

- El LCP se arregla por fases. En esta rama la imagen no pesa más: se descubre más tarde, y lo dice `resourceLoadDelay`.
- Un subagente es código que pide datos a una herramienta y los deja en un JSON con una forma fija. Aquí no hay ningún LLM.
- Tres medidas y su mediana: una sola no distingue un cambio del ruido.

Para pensar: en la página que más importa de tu producto, ¿cuál es el elemento LCP y qué decide cuándo lo descubre el navegador?

## Qué hace el código que has aplicado

Para verlo:

```bash
git diff workshop-start -- agents/src/subagents/lcp.ts
```

Son dos funciones:

- `askWebPerf(url)`: las dos llamadas a WebPerf Snippets MCP. Devuelve `{ workflow, subparts }`, el `structuredContent` de cada respuesta.
- `lcpReportOf(workflow, subparts)`: convierte esas dos respuestas en el `LcpReport` que define el mismo fichero.

El resto del subagente ya estaba: `lcp.run` llama a las dos y graba el trace con el `recordTrace` del paso 1, con el throttling del gate.

`connect("webperf")` arranca WebPerf Snippets MCP y, como en el paso 1, cada herramienta se llama con `callTool(client, name, args)`. Las dos llamadas usan `CONDITIONS` de `agents/src/subagents/subagent.ts`, que son el throttling del gate (CPU 4x y `fast-4g`) y la mediana de 3 ejecuciones, más `detail: "full"` para recibir los objetos enteros:

| Herramienta (`name`) | Argumentos (`args`) | Qué da |
|---|---|---|
| `run_workflow` | `url`, `workflow: "core-web-vitals"` | El LCP y su elemento y, cuando el LCP es una imagen, la auditoría de la imagen, que el workflow añade por su cuenta |
| `run_snippet` | `url`, `snippet: "LCP-Subparts"` | El desglose del LCP de la ejecución mediana |

Así llega el desglose del candidate de `pr/lcp-hero-lazy` (de `agents/test/fixtures/lcp/subparts-candidate.json`, recortado):

```json
"subParts": {
  "ttfb": { "value": 3, "percent": 0, "overTarget": false },
  "resourceLoadDelay": { "value": 741, "percent": 63, "overTarget": true },
  "resourceLoadTime": { "value": 412, "percent": 35, "overTarget": false, "waiting": 3, "download": 409 },
  "elementRenderDelay": { "value": 13, "percent": 1, "overTarget": false }
}
```

## Si quieres escribirlo tú (opcional)

En lugar del punto 2, escribe las dos funciones en `agents/src/subagents/lcp.ts`, entre sus marcas `// workshop: step 2`. Después sigue desde el punto 3: los tests de `agents/test/subagents/lcp.test.ts` dicen exactamente qué tiene que salir. Si te atascas, el punto 2 sobrescribe lo que hayas escrito con la solución.

De dónde sale cada campo del `LcpReport`:

| Campo | De |
|---|---|
| `url` y `conditions` | `subparts.url`, `subparts.throttling` (`cpu`, `network`) y `subparts.runs.count` |
| `lcp` | `subparts.result`: `value`, `unit` y `rating`; `runs` sale de `subparts.runs.summary.LCP` |
| `element` | El resultado con `script: "LCP"` de `workflow.results`: su `details.element`, `details.elementType` y `details.url` |
| `subparts` y `slowestPhase` | `subparts.result.details.subParts`, quedándote con el `value` de cada fase, y `details.slowestPhase` |
| `image` | El resultado `Image-Element-Audit` de `workflow.results`: el elemento de `items` con `isLCP`, y `preloaded` de `details.lcpCandidate`. `null` si el LCP no es una imagen |

- Un snippet que no termina bien llega con un `status` distinto de `ok` y un `error`. El subagente se para con el nombre del snippet y ese mensaje, por ejemplo `LCP-Subparts: No LCP entry`.
- Los fixtures son respuestas reales del servidor en `main` y en `pr/lcp-hero-lazy`.
