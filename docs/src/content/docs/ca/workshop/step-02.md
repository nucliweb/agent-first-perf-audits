---
title: "Pas 2: el subagent d'LCP"
description: L'LCP de la home amb el seu desglossament i com carrega la imatge LCP, amb WebPerf Snippets MCP.
sidebar:
  order: 12
---

## Objectiu

El primer subagent: mesurar l'LCP de la home de cada botiga, desglossat en les seves quatre fases, i saber com carrega la imatge LCP. Mesura, no decideix: el veredicte és del gate, que arriba al pas 4.

## Què escriuràs

Dues funcions d'`agents/src/subagents/lcp.ts`, entre les seves marques `// workshop: step 2`:

- `askWebPerf(url)`: les dues crides a WebPerf Snippets MCP. Retorna `{ workflow, subparts }`, el `structuredContent` de cada resposta.
- `lcpReportOf(workflow, subparts)`: converteix aquestes dues respostes en el `LcpReport` que defineix el mateix fitxer.

La resta del subagent ja hi és: `lcp.run` crida totes dues i enregistra el trace amb el teu `recordTrace` del pas 1, amb el throttling del gate.

## Les eines

`connect("webperf")` arrenca WebPerf Snippets MCP. Les dues crides fan servir les condicions del gate, `CONDITIONS` d'`agents/src/subagents/subagent.ts` (CPU 4x, `fast-4g` i la mediana de 3 execucions), més `detail: "full"` per rebre els objectes sencers:

| Eina | Arguments | Què dona |
|---|---|---|
| `run_workflow` | `url`, `workflow: "core-web-vitals"` | L'LCP i el seu element i, quan l'LCP és una imatge, l'auditoria de la imatge, que el workflow afegeix pel seu compte |
| `run_snippet` | `url`, `snippet: "LCP-Subparts"` | El desglossament de l'LCP de l'execució mediana |

## Pistes

D'on surt cada camp del `LcpReport`:

| Camp | De |
|---|---|
| `url` i `conditions` | `subparts.url`, `subparts.throttling` (`cpu`, `network`) i `subparts.runs.count` |
| `lcp` | `subparts.result`: `value`, `unit` i `rating`; `runs` surt de `subparts.runs.summary.LCP` |
| `element` | El resultat amb `script: "LCP"` de `workflow.results`: el seu `details.element`, `details.elementType` i `details.url` |
| `subparts` i `slowestPhase` | `subparts.result.details.subParts`, quedant-te amb el `value` de cada fase, i `details.slowestPhase` |
| `image` | El resultat `Image-Element-Audit` de `workflow.results`: l'element d'`items` amb `isLCP`, i `preloaded` de `details.lcpCandidate`. `null` si l'LCP no és una imatge |

Així arriba el desglossament del candidate de `pr/lcp-hero-lazy` (d'`agents/test/fixtures/lcp/subparts-candidate.json`, retallat):

```json
"subParts": {
  "ttfb": { "value": 3, "percent": 0, "overTarget": false },
  "resourceLoadDelay": { "value": 741, "percent": 63, "overTarget": true },
  "resourceLoadTime": { "value": 412, "percent": 35, "overTarget": false, "waiting": 3, "download": 409 },
  "elementRenderDelay": { "value": 13, "percent": 1, "overTarget": false }
}
```

- Un snippet que no acaba bé arriba amb un `status` diferent d'`ok` i un `error`. El subagent s'atura amb el nom del snippet i aquest missatge, per exemple `LCP-Subparts: No LCP entry`.
- Els fixtures són respostes reals del servidor a `main` i a `pr/lcp-hero-lazy`. Els tests d'`agents/test/subagents/lcp.test.ts` diuen exactament què n'ha de sortir.

## Comprova-ho

Els tests amb els fixtures no necessiten el laboratori; l'últim mesura la botiga i només s'executa dins de Compose:

```bash
docker compose run --rm agents node --test test/subagents/lcp.test.ts
```

Després, el subagent contra la branca que treu el preload del hero:

```bash
CANDIDATE=pr-lcp-hero-lazy docker compose up -d
CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp
```

A `out/agents/lcp-baseline.json` i `lcp-candidate.json` tens les dues botigues. Als fixtures, l'LCP passa de 760 a 1168 ms, la fase que més creix és el retard de càrrega del recurs (de 188 a 741 ms) i la imatge passa a `loading="lazy"`, sense preload ni `fetchpriority`. Les teves xifres seran semblants, no iguals: cada execució torna a mesurar.

```bash
docker compose run --rm agents npm run check -- step-02
```

## Si et quedes enrere

```bash
git checkout step-02-solution -- agents/src
```
