---
title: "Pas 3: Navigator, CLS i LoAF/INP"
description: Recórrer la botiga com una persona i mesurar els desplaçaments i el que bloqueja el fil principal a cada recorregut.
sidebar:
  order: 13
---

## Objectiu

Tres subagents que treballen sobre recorreguts, no sobre una càrrega: el Navigator recorre la botiga pas a pas i comprova que cada recorregut acaba; CLS i LoAF/INP mesuren aquests mateixos recorreguts. En aquest pas veus l'evidència de la segona regressió, la branca `pr/loaf-cart-handler`, que fa pesat el clic d'afegir al carretó.

## Abans de començar

Continues a la teva branca `taller`, amb el laboratori aixecat. Si no has acabat els passos anteriors, no passa res: la solució d'aquest pas porta també la dels anteriors.

## Pas a pas

1. Llança els tests del pas:

   ```bash
   docker compose run --rm agents node --test test/subagents/navigator.test.ts test/subagents/cls.test.ts test/subagents/loaf.test.ts
   ```

   De 19 tests, en fallen 14 (`fail 14`) amb missatges com aquest:

   ```text
   Step 3 of the workshop: run the steps of a journey with open_page, interact and read_results. Its tests: test/subagents/navigator.test.ts
   ```

   És el punt de partida, no un error: les cinc funcions del pas encara són un `throw`. Els 5 que passen no en depenen.

2. Aplica la solució del pas:

   ```bash
   git checkout step-03-solution -- agents/src
   ```

3. Torna a llançar els tests:

   ```bash
   docker compose run --rm agents node --test test/subagents/navigator.test.ts test/subagents/cls.test.ts test/subagents/loaf.test.ts
   ```

   Tots 19 passen (`pass 19`). Triguen una mica més de mig minut: els del Navigator obren una pàgina local amb el servidor real, i un espera que un pas falli.

4. Canvia la botiga candidata per la branca del handler pesat:

   ```bash
   CANDIDATE=pr-loaf-cart-handler docker compose up -d
   ```

5. Recorre i mesura les dues botigues:

   ```bash
   CANDIDATE=pr-loaf-cart-handler docker compose run --rm agents node src/orchestrator.ts cls loaf
   ```

   Són uns 6 minuts: el Navigator va primer, perquè CLS i LoAF/INP mesuren els seus recorreguts, i cada subagent mesura quatre recorreguts per costat, tres vegades cadascun. Escriu una línia per subagent i botiga, entre elles aquestes (les xifres canvien a cada execució):

   ```text
   [orchestrator] navigator, baseline: home 5 steps, shop 3 steps, product 3 steps, add-to-cart 3 steps; no page errors
   [orchestrator] loaf, baseline: home no click, shop INP … ms, product INP … ms, add-to-cart INP … ms; slowest add-to-cart: processing … ms, top script MessagePort.onmessage (…)
   [orchestrator] loaf, candidate: home no click, shop INP … ms, product INP … ms, add-to-cart INP … ms; slowest add-to-cart: processing … ms, top script DIV#root.onclick (…)
   ```

   Aquesta és l'evidència de la regressió: a la branca, el clic d'afegir al carretó passa gairebé tot el temps processant, i l'script que més bloqueja és el handler del clic, `DIV#root.onclick`. Als fixtures dels tests, l'INP d'afegir al carretó passa de 32 a 192 ms, el processament de 10 a 169 ms i el handler bloqueja 166 ms. Als recorreguts amb un clic, el subagent enregistra a més un trace del clic, i trace-engine-cli anomena la funció: `recommendFor`. El CLS d'aquesta branca no canvia: la seva regressió és una altra. El detall és a `out/agents/navigator-*.json`, `cls-*.json` i `loaf-*.json`.

6. Passa la comprovació del pas:

   ```bash
   docker compose run --rm agents npm run check -- step-03
   ```

   ```text
   step-03: The Navigator, CLS and LoAF/INP

     OK  tests: test/subagents/cls.test.ts test/subagents/loaf.test.ts test/subagents/navigator.test.ts
     OK  out/agents/navigator-baseline.json
     OK  out/agents/cls-baseline.json
     OK  out/agents/loaf-baseline.json
     OK  out/agents/navigator-candidate.json
     OK  out/agents/cls-candidate.json
     OK  out/agents/loaf-candidate.json

   step-03 is done.
   ```

7. Opcional: la regressió de CLS, amb la branca del bàner:

   ```bash
   CANDIDATE=pr-cls-promo-banner docker compose up -d
   CANDIDATE=pr-cls-promo-banner docker compose run --rm agents node src/orchestrator.ts cls
   ```

   A la línia `cls, candidate`, el CLS deixa de ser 0 als quatre recorreguts. A `out/agents/cls-candidate.json`, el node que més es mou és `main.main`: el bàner empeny la pàgina cap avall.

## Què fa el codi que has aplicat

Per veure'l:

```bash
git diff workshop-start -- agents/src/subagents/navigator.ts agents/src/subagents/cls.ts agents/src/subagents/loaf.ts
```

Són cinc funcions:

| Fitxer | Funció | Què fa |
|---|---|---|
| `agents/src/subagents/navigator.ts` | `runJourney` | Obre la pàgina d'un recorregut, n'executa els passos un a un i retorna un `JourneyRun` |
| `agents/src/subagents/cls.ts` | `measure` | Mesura els desplaçaments d'un recorregut |
| | `clsJourneyOf` | Converteix la resposta en el `ClsJourney` del recorregut |
| `agents/src/subagents/loaf.ts` | `measure` | Mesura el que bloqueja el fil principal en un recorregut |
| | `loafJourneyOf` | Converteix la resposta en el `LoafJourney` del recorregut, sense el trace |

Els recorreguts són els JSON d'`agents/journeys/`: `home`, `shop`, `product` i `add-to-cart`, cadascun amb la seva pàgina (`path`) i els seus passos (`click`, `type`, `hover`, `scroll` i `wait`). És el format de `--interact-script` de la CLI de WebPerf Snippets, i el gate mesura afegir al carretó amb el mateix fitxer.

Tot amb WebPerf Snippets MCP i el throttling del gate (`CONDITIONS`), cridant cada eina amb `callTool`:

| Subagent | Eines | Arguments |
|---|---|---|
| Navigator | `open_page`, `interact`, `read_results` i `close_page` | `open_page` amb `url`, `cpu`, `network` i `track: ["INP"]`; `interact` amb el `sessionId` i `steps` |
| CLS | `run_snippet` | `snippet: "Layout-Shift-Loading-and-Interaction"`, `interactions` amb els passos del recorregut, `runs` i `detail: "full"` |
| LoAF/INP | `run_workflow` | `workflow: "interaction"`, `interactions`, `runs` i `detail: "full"` |

## Si el vols escriure tu (opcional)

En lloc del punt 2, escriu les cinc funcions, cadascuna entre les seves marques `// workshop: step 3`. Després continua des del punt 3: els tests diuen si ho tens. Si t'encalles, el punt 2 sobreescriu el que hagis escrit amb la solució.

**Navigator.** Un pas per crida a `interact`: així saps la URL on deixa la pàgina cada pas i, si un falla, quin ha estat. Un element que no apareix en 5 segons atura `interact` amb un error. Converteix-lo en un que digui el recorregut, el número de pas i el pas, per exemple `journey add-to-cart, step 2 (click button:has-text("Add to cart")): ...`; la funció `described` del mateix fitxer escriu el pas. Al final, `read_results` dona els `pageErrors`, i `close_page` tanca la pàgina encara que alguna cosa hagi fallat. `open_page` necessita almenys un snippet a `track`; INP no registra res fins a un clic.

**CLS i LoAF/INP.** Els passos que mesuren són els que ha executat el Navigator, a `journey.steps`, no els del JSON. El resultat de cadascun:

| Camp | De |
|---|---|
| `cls.value`, `cls.rating` | `result` del snippet; `cls.runs` de `runs.summary.CLS`, amb `agreement: null` quan totes les execucions donen 0 |
| `shifts` | `result.details.countedShifts` i `excludedShifts`: els desplaçaments després d'una interacció no compten |
| `elements` | `result.details.topElements`: `selector`, `shiftCount` i `totalImpact` |
| `inp` | El resultat amb `id: "INP"`: `value`, `rating`, `details.worstEvent` i `details.phases`; `runs` de `runs.summary.INP`. `null` quan el recorregut no té clic i el resultat arriba `skipped` |
| `longFrames` | El resultat `long-frames`: `totalLoAFs`, `withBlockingTime`, `totalBlockingTimeMs`, `worstBlockingMs` i `topScripts` |
| `longTasks` | El resultat `long-tasks`: `totalBlockingTimeMs` i `worstTaskMs` |

Un resultat amb un altre `status` atura el subagent amb el recorregut, l'id o el snippet i el missatge. Els fixtures d'`agents/test/fixtures/cls/` i `loaf/` són respostes reals a `pr/cls-promo-banner` i `pr/loaf-cart-handler`.
