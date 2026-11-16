---
title: "Pas 2: el subagent d'LCP"
description: L'LCP de la home amb el seu desglossament i com carrega la imatge LCP, amb WebPerf Snippets MCP.
sidebar:
  order: 12
---

## Què aprendràs

- Llegir l'LCP per les seves quatre fases, i saber quina mirar primer.
- Demanar a WebPerf Snippets MCP una mètrica amb el seu context: l'element, les fases i com carrega la imatge.
- Separar mesurar de decidir: el subagent dona l'evidència, i el veredicte és del gate, que arriba al pas 4.

## Temps

Aquest pas té 20 minuts a l'agenda. El temps de màquina està mesurat al Mac de referència, amb l'[assaig cronometrat](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.ca.md):

| | `llm` | `lite` |
|---|---|---|
| Temps de màquina del pas | 2,9 min | 2,9 min |
| Punt 5, mesurar l'LCP de les dues botigues | 1,2 min | 1,2 min |

## La idea en un minut

L'LCP és el temps que triga a pintar-se l'element més gran de la pantalla. El número només diu que alguna cosa va lenta; on es perd el temps ho diuen les seves quatre fases:

<img src="/diagrams/phases.svg" alt="Les fases de l'LCP, de la navegació al pintat de l'element més gran: ttfb, resourceLoadDelay, resourceLoadTime i elementRenderDelay. Les fases de l'INP, d'un clic al següent frame: inputDelay, processingTime i presentationDelay" width="1120" height="340" loading="lazy" decoding="async">

Cada fase apunta a un arranjament diferent. Si creix `resourceLoadDelay`, el navegador descobreix la imatge tard; si creix `resourceLoadTime`, la imatge pesa o la xarxa és lenta; si creix `elementRenderDelay`, alguna cosa bloqueja el pintat. Ho desenvolupa [Conceptes](../../concepts/#lcp-quatre-fases).

El primer subagent mesura això a la home de cada botiga: l'LCP, les seves fases i com carrega la imatge LCP. Aquí veus l'evidència de la primera regressió, la branca `pr/lcp-hero-lazy`, que treu el preload del hero.

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

   És l'espera del pas. Per cada botiga escriu una línia com aquestes (les xifres canvien a cada execució):

   ```text
   [orchestrator] lcp, baseline: LCP … ms (img.hero__image); slowest phase resourceLoadTime, … ms; image loading=(not set), fetchpriority=high, preloaded
   [orchestrator] lcp, candidate: LCP … ms (img.hero__image); slowest phase resourceLoadDelay, … ms; image loading=lazy, fetchpriority=(not set), not preloaded
   ```

   Aquesta és l'evidència de la regressió: l'LCP creix, la fase que més pesa passa a ser el retard de càrrega del recurs i la imatge passa a `loading="lazy"`, sense preload ni `fetchpriority`. Als fixtures dels tests, l'LCP passa de 760 a 1168 ms i el retard de càrrega del recurs de 188 a 741 ms. Les teves xifres seran semblants, no iguals: cada execució mesura de nou. El detall és a `out/agents/lcp-baseline.json` i `lcp-candidate.json`.

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

## Mentre esperes

El punt 5 mesura cada botiga tres vegades. Mentrestant:

- Obre les dues botigues al navegador, des de [Les branques al navegador](../../previews/). Notes la diferència a simple vista?
- Quan surti la línia del baseline, obre `out/agents/lcp-baseline.json`. Quina fase pesa més? Quins atributs té la imatge LCP?
- Per què el subagent es queda amb la mediana de tres mesures i no amb una de sola?

## Punt de control

En pantalla, les dues línies `[orchestrator] lcp`, amb una fase més lenta diferent a cada costat (`resourceLoadTime` al baseline i `resourceLoadDelay` a la branca), i `step-02 is done.`

## Si alguna cosa falla

| Què veus | Per què | Què fer |
|---|---|---|
| Les teves xifres no són les de la guia | Cada execució mesura de nou, i cada màquina és diferent | Compara els dos costats entre ells: compta la diferència i la fase que canvia |
| Les dues línies diuen el mateix, amb `preloaded` als dos costats | La botiga candidata no és la del hero: sense `CANDIDATE`, el laboratori fa servir `pr-noop-refactor` | Repeteix els punts 4 i 5, amb `CANDIDATE=pr-lcp-hero-lazy` davant de les dues ordres |
| `KO` en un fitxer d'`out/agents/` a la comprovació | Falta el punt 5 | La comprovació escriu l'ordre sota "To make the files of out/, run:" |
| Els tests del punt 1 passen en lloc de fallar | `agents/src` ja té la solució d'aquest pas | Continua des del punt 4 |

## Què t'emportes

- L'LCP s'arregla per fases. En aquesta branca la imatge no pesa més: es descobreix més tard, i ho diu `resourceLoadDelay`.
- Un subagent és codi que demana dades a una eina i les deixa en un JSON amb una forma fixa. Aquí no hi ha cap LLM.
- Tres mesures i la seva mediana: una de sola no distingeix un canvi del soroll.

Per pensar: a la pàgina que més importa del teu producte, quin és l'element LCP i què decideix quan el descobreix el navegador?

## Què fa el codi que has aplicat

Per veure'l:

```bash
git diff workshop-start -- agents/src/subagents/lcp.ts
```

Són dues funcions:

- `askWebPerf(url)`: les dues crides a WebPerf Snippets MCP. Retorna `{ workflow, subparts }`, el `structuredContent` de cada resposta.
- `lcpReportOf(workflow, subparts)`: converteix aquestes dues respostes en el `LcpReport` que defineix el mateix fitxer.

La resta del subagent ja hi era: `lcp.run` crida totes dues i enregistra el trace amb el `recordTrace` del pas 1, amb el throttling del gate.

`connect("webperf")` arrenca WebPerf Snippets MCP i, com al pas 1, cada eina es crida amb `callTool(client, name, args)`. Les dues crides fan servir `CONDITIONS` d'`agents/src/subagents/subagent.ts`, que són el throttling del gate (CPU 4x i `fast-4g`) i la mediana de 3 execucions, més `detail: "full"` per rebre els objectes sencers:

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
