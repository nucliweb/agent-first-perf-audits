---
title: "Paso 2: el subagente de LCP"
description: El LCP de la home con su desglose y cómo carga la imagen LCP, con WebPerf Snippets MCP.
sidebar:
  order: 12
---

## Objetivo

El primer subagente: mide el LCP de la home de cada tienda, desglosado en sus cuatro fases, y cómo carga la imagen LCP. En este paso ves la evidencia de la primera regresión, la rama `pr/lcp-hero-lazy`, que quita el preload del hero. El subagente mide, no decide: el veredicto es del gate, que llega en el paso 4.

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

   Tarda un minuto y medio. Por cada tienda escribe una línea como estas, aquí con las cifras de los fixtures de los tests:

   ```text
   [orchestrator] lcp, baseline: LCP 760 ms (img.hero__image); slowest phase resourceLoadTime, 309 ms; image loading=(not set), fetchpriority=high, preloaded
   [orchestrator] lcp, candidate: LCP 1168 ms (img.hero__image); slowest phase resourceLoadDelay, 741 ms; image loading=lazy, fetchpriority=(not set), not preloaded
   ```

   Esta es la evidencia de la regresión: el LCP crece, la fase que más pesa pasa a ser el retraso de carga del recurso (de 188 a 741 ms en los fixtures) y la imagen pasa a `loading="lazy"`, sin preload ni `fetchpriority`. Tus cifras serán parecidas, no iguales: cada ejecución mide de nuevo. El detalle está en `out/agents/lcp-baseline.json` y `lcp-candidate.json`.

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
