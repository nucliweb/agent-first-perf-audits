---
title: "Pas 3: Navigator, CLS i LoAF/INP"
description: Recórrer la botiga com una persona i mesurar els desplaçaments i el que bloqueja el fil principal a cada recorregut.
sidebar:
  order: 13
---

## Objectiu

Tres subagents que treballen sobre recorreguts, no sobre una càrrega: el Navigator recorre la botiga pas a pas i comprova que cada recorregut acaba; CLS i LoAF/INP mesuren aquests mateixos recorreguts. L'orquestrador passa el Navigator primer i lliura als altres el que ha trobat.

## Què escriuràs

Cinc funcions, cadascuna entre les seves marques `// workshop: step 3`:

| Fitxer | Funció | Què fa |
|---|---|---|
| `agents/src/subagents/navigator.ts` | `runJourney` | Obre la pàgina d'un recorregut, n'executa els passos un a un i retorna un `JourneyRun` |
| `agents/src/subagents/cls.ts` | `measure` | Mesura els desplaçaments d'un recorregut |
| | `clsJourneyOf` | Converteix la resposta en el `ClsJourney` del recorregut |
| `agents/src/subagents/loaf.ts` | `measure` | Mesura el que bloqueja el fil principal en un recorregut |
| | `loafJourneyOf` | Converteix la resposta en el `LoafJourney` del recorregut, sense el trace |

Els recorreguts són els JSON d'`agents/journeys/`: `home`, `shop`, `product` i `add-to-cart`, cadascun amb la seva pàgina (`path`) i els seus passos (`click`, `type`, `hover`, `scroll` i `wait`). És el format de `--interact-script` de la CLI de WebPerf Snippets, i el gate mesura afegir al carretó amb el mateix fitxer.

## Les eines

Tot amb WebPerf Snippets MCP i el throttling del gate (`CONDITIONS`):

| Subagent | Eines | Arguments |
|---|---|---|
| Navigator | `open_page`, `interact`, `read_results` i `close_page` | `open_page` amb `url`, `cpu`, `network` i `track: ["INP"]`; `interact` amb el `sessionId` i `steps` |
| CLS | `run_snippet` | `snippet: "Layout-Shift-Loading-and-Interaction"`, `interactions` amb els passos del recorregut, `runs` i `detail: "full"` |
| LoAF/INP | `run_workflow` | `workflow: "interaction"`, `interactions`, `runs` i `detail: "full"` |

## Pistes

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

## Comprova-ho

```bash
docker compose run --rm agents node --test test/subagents/navigator.test.ts test/subagents/cls.test.ts test/subagents/loaf.test.ts
```

Els tests del Navigator obren una pàgina local amb el servidor real; un espera que un pas falli, així que triguen uns segons. Després, els tres subagents contra la branca del handler pesat (el Navigator va sol, perquè CLS i LoAF el necessiten):

```bash
CANDIDATE=pr-loaf-cart-handler docker compose up -d
CANDIDATE=pr-loaf-cart-handler docker compose run --rm agents node src/orchestrator.ts cls loaf
```

Són uns minuts: quatre recorreguts per costat i tres execucions de cadascun. Als fixtures, l'INP d'afegir al carretó passa de 32 a 192 ms, gairebé tot processament (de 10 a 169 ms), i el primer script dels long animation frames és el handler del clic, `DIV#root.onclick`, amb 166 ms. Als recorreguts amb un clic, el subagent grava a més un trace del clic, i trace-engine-cli anomena la funció: `recommendFor`. Prova també el CLS amb `CANDIDATE=pr-cls-promo-banner`: el node que més es mou és `main.main`, perquè el bàner empeny la pàgina.

```bash
docker compose run --rm agents npm run check -- step-03
```

## Si et quedes enrere

```bash
git checkout step-03-solution -- agents/src
```
