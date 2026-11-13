---
title: "Pas 2: el subagent d'LCP"
description: L'LCP de la home amb el seu desglossament i com carrega la imatge LCP, amb WebPerf Snippets MCP.
sidebar:
  order: 12
---

## Objectiu

El primer subagent: mesura l'LCP de la home de cada botiga, desglossat en les seves quatre fases, i com carrega la imatge LCP. En aquest pas veus l'evidència de la primera regressió, la branca `pr/lcp-hero-lazy`, que treu el preload del hero. El subagent mesura, no decideix: el veredicte és del gate, que arriba al pas 4.

## Abans de començar

Continues a la teva branca `taller`, amb el laboratori aixecat. Si no has acabat el pas 1, no passa res: la solució d'aquest pas porta també la de l'anterior.

## Pas a pas

1. Llança els tests del pas:

   ```bash
   docker compose run --rm agents node --test test/subagents/lcp.test.ts
   ```

   Els 7 tests fallen (`fail 7`) amb missatges com aquest:

   ```text
   Step 2 of the workshop: shape the answers of WebPerf Snippets into the LCP report. Its tests: test/subagents/lcp.test.ts
   ```

   És el punt de partida, no un error: `askWebPerf` i `lcpReportOf`, a `agents/src/subagents/lcp.ts`, encara són un `throw`.

2. Aplica la solució del pas:

   ```bash
   git checkout step-02-solution -- agents/src
   ```

3. Torna a llançar els tests:

   ```bash
   docker compose run --rm agents node --test test/subagents/lcp.test.ts
   ```

   Tots 7 passen (`pass 7`). Els sis primers fan servir respostes desades del servidor; l'últim mesura la botiga de veritat i triga uns 40 segons.

4. Canvia la botiga candidata per la branca del hero:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose up -d
   ```

5. Mesura l'LCP de les dues botigues:

   ```bash
   CANDIDATE=pr-lcp-hero-lazy docker compose run --rm agents node src/orchestrator.ts lcp
   ```

   Triga un minut i mig. Per cada botiga escriu una línia com aquestes, aquí amb les xifres dels fixtures dels tests:

   ```text
   [orchestrator] lcp, baseline: LCP 760 ms (img.hero__image); slowest phase resourceLoadTime, 309 ms; image loading=(not set), fetchpriority=high, preloaded
   [orchestrator] lcp, candidate: LCP 1168 ms (img.hero__image); slowest phase resourceLoadDelay, 741 ms; image loading=lazy, fetchpriority=(not set), not preloaded
   ```

   Aquesta és l'evidència de la regressió: l'LCP creix, la fase que més pesa passa a ser el retard de càrrega del recurs (de 188 a 741 ms als fixtures) i la imatge passa a `loading="lazy"`, sense preload ni `fetchpriority`. Les teves xifres seran semblants, no iguals: cada execució mesura de nou. El detall és a `out/agents/lcp-baseline.json` i `lcp-candidate.json`.

6. Passa la comprovació del pas:

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

## Què fa el codi que has aplicat

Per veure'l:

```bash
git diff workshop-start -- agents/src/subagents/lcp.ts
```

Són dues funcions:

- `askWebPerf(url)`: les dues crides a WebPerf Snippets MCP. Retorna `{ workflow, subparts }`, el `structuredContent` de cada resposta.
- `lcpReportOf(workflow, subparts)`: converteix aquestes dues respostes en el `LcpReport` que defineix el mateix fitxer.

La resta del subagent ja hi era: `lcp.run` crida totes dues i enregistra el trace amb el `recordTrace` del pas 1, amb el throttling del gate.

`connect("webperf")` arrenca WebPerf Snippets MCP i, com al pas 1, cada eina es crida amb `callTool(client, name, args)`. Les dues crides fan servir les condicions del gate, `CONDITIONS` d'`agents/src/subagents/subagent.ts` (CPU 4x, `fast-4g` i la mediana de 3 execucions), més `detail: "full"` per rebre els objectes sencers:

| Eina (`name`) | Arguments (`args`) | Què dona |
|---|---|---|
| `run_workflow` | `url`, `workflow: "core-web-vitals"` | L'LCP i el seu element i, quan l'LCP és una imatge, l'auditoria de la imatge, que el workflow afegeix pel seu compte |
| `run_snippet` | `url`, `snippet: "LCP-Subparts"` | El desglossament de l'LCP de l'execució mediana |

Així arriba el desglossament del candidate de `pr/lcp-hero-lazy` (d'`agents/test/fixtures/lcp/subparts-candidate.json`, retallat):

```json
"subParts": {
  "ttfb": { "value": 3, "percent": 0, "overTarget": false },
  "resourceLoadDelay": { "value": 741, "percent": 63, "overTarget": true },
  "resourceLoadTime": { "value": 412, "percent": 35, "overTarget": false, "waiting": 3, "download": 409 },
  "elementRenderDelay": { "value": 13, "percent": 1, "overTarget": false }
}
```

## Si el vols escriure tu (opcional)

En lloc del punt 2, escriu les dues funcions a `agents/src/subagents/lcp.ts`, entre les seves marques `// workshop: step 2`. Després continua des del punt 3: els tests d'`agents/test/subagents/lcp.test.ts` diuen exactament què n'ha de sortir. Si t'encalles, el punt 2 sobreescriu el que hagis escrit amb la solució.

D'on surt cada camp del `LcpReport`:

| Camp | De |
|---|---|
| `url` i `conditions` | `subparts.url`, `subparts.throttling` (`cpu`, `network`) i `subparts.runs.count` |
| `lcp` | `subparts.result`: `value`, `unit` i `rating`; `runs` surt de `subparts.runs.summary.LCP` |
| `element` | El resultat amb `script: "LCP"` de `workflow.results`: el seu `details.element`, `details.elementType` i `details.url` |
| `subparts` i `slowestPhase` | `subparts.result.details.subParts`, quedant-te amb el `value` de cada fase, i `details.slowestPhase` |
| `image` | El resultat `Image-Element-Audit` de `workflow.results`: l'element d'`items` amb `isLCP`, i `preloaded` de `details.lcpCandidate`. `null` si l'LCP no és una imatge |

- Un snippet que no acaba bé arriba amb un `status` diferent d'`ok` i un `error`. El subagent s'atura amb el nom del snippet i aquest missatge, per exemple `LCP-Subparts: No LCP entry`.
- Els fixtures són respostes reals del servidor a `main` i a `pr/lcp-hero-lazy`.
