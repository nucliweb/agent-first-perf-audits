---
title: "Paso 2: el subagente de LCP"
description: El LCP de la home con su desglose y cómo carga la imagen LCP, con WebPerf Snippets MCP.
sidebar:
  order: 12
---

## Objetivo

El primer subagente: medir el LCP de la home de cada tienda, desglosado en sus cuatro fases, y saber cómo carga la imagen LCP. Mide, no decide: el veredicto es del gate, que llega en el paso 4.

## Qué vas a escribir

Dos funciones de `agents/src/subagents/lcp.ts`, entre sus marcas `// workshop: step 2`:

- `askWebPerf(url)`: las dos llamadas a WebPerf Snippets MCP. Devuelve `{ workflow, subparts }`, el `structuredContent` de cada respuesta.
- `lcpReportOf(workflow, subparts)`: convierte esas dos respuestas en el `LcpReport` que define el mismo fichero.

El resto del subagente ya está: `lcp.run` llama a las dos y graba el trace con tu `recordTrace` del paso 1, con el throttling del gate.

## Las herramientas

`connect("webperf")` arranca WebPerf Snippets MCP. Las dos llamadas usan las condiciones del gate, `CONDITIONS` de `agents/src/subagents/subagent.ts` (CPU 4x, `fast-4g` y la mediana de 3 ejecuciones), más `detail: "full"` para recibir los objetos enteros:

| Herramienta | Argumentos | Qué da |
|---|---|---|
| `run_workflow` | `url`, `workflow: "core-web-vitals"` | El LCP y su elemento y, cuando el LCP es una imagen, la auditoría de la imagen, que el workflow añade por su cuenta |
| `run_snippet` | `url`, `snippet: "LCP-Subparts"` | El desglose del LCP de la ejecución mediana |

## Pistas

De dónde sale cada campo del `LcpReport`:

| Campo | De |
|---|---|
| `url` y `conditions` | `subparts.url`, `subparts.throttling` (`cpu`, `network`) y `subparts.runs.count` |
| `lcp` | `subparts.result`: `value`, `unit` y `rating`; `runs` sale de `subparts.runs.summary.LCP` |
| `element` | El resultado con `script: "LCP"` de `workflow.results`: su `details.element`, `details.elementType` y `details.url` |
| `subparts` y `slowestPhase` | `subparts.result.details.subParts`, quedándote con el `value` de cada fase, y `details.slowestPhase` |
| `image` | El resultado `Image-Element-Audit` de `workflow.results`: el elemento de `items` con `isLCP`, y `preloaded` de `details.lcpCandidate`. `null` si el LCP no es una imagen |

Así llega el desglose del candidate de `pr/lcp-hero-lazy` (de `agents/test/fixtures/lcp/subparts-candidate.json`, recortado):

```json
"subParts": {
  "ttfb": { "value": 3, "percent": 0, "overTarget": false },
  "resourceLoadDelay": { "value": 741, "percent": 63, "overTarget": true },
  "resourceLoadTime": { "value": 412, "percent": 35, "overTarget": false, "waiting": 3, "download": 409 },
  "elementRenderDelay": { "value": 13, "percent": 1, "overTarget": false }
}
```

- Un snippet que no termina bien llega con un `status` distinto de `ok` y un `error`. El subagente se para con el nombre del snippet y ese mensaje, por ejemplo `LCP-Subparts: No LCP entry`.
- Los fixtures son respuestas reales del servidor en `main` y en `pr/lcp-hero-lazy`. Los tests de `agents/test/subagents/lcp.test.ts` dicen exactamente qué tiene que salir de ellos.

## Compruébalo

Los tests con los fixtures no necesitan el laboratorio; el último mide la tienda y solo corre dentro de Compose:

```bash
docker compose run --rm agents node --test test/subagents/lcp.test.ts
```

Después, el subagente contra la rama que quita el preload del hero:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp
```

En `out/agents/lcp-baseline.json` y `lcp-candidate.json` tienes las dos tiendas. En los fixtures, el LCP pasa de 760 a 1168 ms, la fase que más crece es el retraso de carga del recurso (de 188 a 741 ms) y la imagen pasa a `loading="lazy"`, sin preload ni `fetchpriority`. Tus cifras serán parecidas, no iguales: cada ejecución mide de nuevo.

```bash
docker compose run --rm agents npm run check -- step-02
```

## Si te descuelgas

```bash
git checkout step-02-solution -- agents/src
```
