---
title: "Paso 3: Navigator, CLS y LoAF/INP"
description: Recorrer la tienda como una persona y medir los desplazamientos y lo que bloquea el hilo principal en cada recorrido.
sidebar:
  order: 13
---

## Objetivo

Tres subagentes que trabajan sobre recorridos, no sobre una carga: el Navigator recorre la tienda paso a paso y comprueba que cada recorrido termina; CLS y LoAF/INP miden esos mismos recorridos. En este paso ves la evidencia de la segunda regresión, la rama `pr/loaf-cart-handler`, que hace pesado el click de añadir al carrito.

## Antes de empezar

Sigues en tu rama `taller`, con el laboratorio levantado. Si no has terminado los pasos anteriores, no pasa nada: la solución de este paso trae también la de los anteriores.

## Paso a paso

1. Lanza los tests del paso:

   ```bash
   docker compose run --rm agents node --test test/subagents/navigator.test.ts test/subagents/cls.test.ts test/subagents/loaf.test.ts
   ```

   De 19 tests, fallan 14 (`fail 14`) con mensajes como este:

   ```text
   Step 3 of the workshop: run the steps of a journey with open_page, interact and read_results. Its tests: test/subagents/navigator.test.ts
   ```

   Es el punto de partida, no un error: las cinco funciones del paso todavía son un `throw`. Los 5 que pasan no dependen de ellas.

2. Aplica la solución del paso:

   ```bash
   git checkout step-03-solution -- agents/src
   ```

3. Vuelve a lanzar los tests:

   ```bash
   docker compose run --rm agents node --test test/subagents/navigator.test.ts test/subagents/cls.test.ts test/subagents/loaf.test.ts
   ```

   Los 19 pasan (`pass 19`). Tardan algo más de medio minuto: los del Navigator abren una página local con el servidor real, y uno espera a que un paso falle.

4. Cambia la tienda candidata por la rama del handler pesado:

   ```bash
   CANDIDATE=pr-loaf-cart-handler docker compose up -d
   ```

5. Recorre y mide las dos tiendas:

   ```bash
   CANDIDATE=pr-loaf-cart-handler docker compose run --rm agents node src/orchestrator.ts cls loaf
   ```

   Son unos 6 minutos: el Navigator va primero, porque CLS y LoAF/INP miden sus recorridos, y cada subagente mide cuatro recorridos por lado, tres veces cada uno. Escribe una línea por subagente y tienda, entre ellas estas (las cifras cambian en cada ejecución):

   ```text
   [orchestrator] navigator, baseline: home 5 steps, shop 3 steps, product 3 steps, add-to-cart 3 steps; no page errors
   [orchestrator] loaf, baseline: home no click, shop INP … ms, product INP … ms, add-to-cart INP … ms; slowest add-to-cart: processing … ms, top script MessagePort.onmessage (…)
   [orchestrator] loaf, candidate: home no click, shop INP … ms, product INP … ms, add-to-cart INP … ms; slowest add-to-cart: processing … ms, top script DIV#root.onclick (…)
   ```

   Esta es la evidencia de la regresión: en la rama, el click de añadir al carrito pasa casi todo su tiempo procesando, y el script que más bloquea es el handler del click, `DIV#root.onclick`. En los fixtures de los tests, el INP de añadir al carrito pasa de 32 a 192 ms, el procesamiento de 10 a 169 ms y el handler bloquea 166 ms. En los recorridos con un click, el subagente graba además un trace del click, y trace-engine-cli nombra la función: `recommendFor`. El CLS de esta rama no cambia: su regresión es otra. El detalle está en `out/agents/navigator-*.json`, `cls-*.json` y `loaf-*.json`.

6. Pasa la comprobación del paso:

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

7. Opcional: la regresión de CLS, con la rama del banner:

   ```bash
   CANDIDATE=pr-cls-promo-banner docker compose up -d
   CANDIDATE=pr-cls-promo-banner docker compose run --rm agents node src/orchestrator.ts cls
   ```

   En la línea `cls, candidate`, el CLS deja de ser 0 en los cuatro recorridos. En `out/agents/cls-candidate.json`, el nodo que más se mueve es `main.main`: el banner empuja la página hacia abajo.

## Qué hace el código que has aplicado

Para verlo:

```bash
git diff workshop-start -- agents/src/subagents/navigator.ts agents/src/subagents/cls.ts agents/src/subagents/loaf.ts
```

Son cinco funciones:

| Fichero | Función | Qué hace |
|---|---|---|
| `agents/src/subagents/navigator.ts` | `runJourney` | Abre la página de un recorrido, ejecuta sus pasos uno a uno y devuelve un `JourneyRun` |
| `agents/src/subagents/cls.ts` | `measure` | Mide los desplazamientos de un recorrido |
| | `clsJourneyOf` | Convierte la respuesta en el `ClsJourney` del recorrido |
| `agents/src/subagents/loaf.ts` | `measure` | Mide lo que bloquea el hilo principal en un recorrido |
| | `loafJourneyOf` | Convierte la respuesta en el `LoafJourney` del recorrido, sin el trace |

Los recorridos son los JSON de `agents/journeys/`: `home`, `shop`, `product` y `add-to-cart`, cada uno con su página (`path`) y sus pasos (`click`, `type`, `hover`, `scroll` y `wait`). Es el formato de `--interact-script` de la CLI de WebPerf Snippets, y el gate mide añadir al carrito con el mismo fichero.

Todo con WebPerf Snippets MCP y el throttling del gate (`CONDITIONS`), llamando a cada herramienta con `callTool`:

| Subagente | Herramientas | Argumentos |
|---|---|---|
| Navigator | `open_page`, `interact`, `read_results` y `close_page` | `open_page` con `url`, `cpu`, `network` y `track: ["INP"]`; `interact` con el `sessionId` y `steps` |
| CLS | `run_snippet` | `snippet: "Layout-Shift-Loading-and-Interaction"`, `interactions` con los pasos del recorrido, `runs` y `detail: "full"` |
| LoAF/INP | `run_workflow` | `workflow: "interaction"`, `interactions`, `runs` y `detail: "full"` |

## Si quieres escribirlo tú (opcional)

En lugar del punto 2, escribe las cinco funciones, cada una entre sus marcas `// workshop: step 3`. Después sigue desde el punto 3: los tests dicen si lo tienes. Si te atascas, el punto 2 sobrescribe lo que hayas escrito con la solución.

**Navigator.** Un paso por llamada a `interact`: así sabes la URL en la que deja la página cada paso y, si uno falla, cuál ha sido. Un elemento que no aparece en 5 segundos para `interact` con un error. Conviértelo en uno que diga el recorrido, el número de paso y el paso, por ejemplo `journey add-to-cart, step 2 (click button:has-text("Add to cart")): ...`; la función `described` del mismo fichero escribe el paso. Al final, `read_results` da los `pageErrors`, y `close_page` cierra la página aunque algo haya fallado. `open_page` necesita al menos un snippet en `track`; INP no registra nada hasta un click.

**CLS y LoAF/INP.** Los pasos que miden son los que ha ejecutado el Navigator, en `journey.steps`, no los del JSON. El resultado de cada uno:

| Campo | De |
|---|---|
| `cls.value`, `cls.rating` | `result` del snippet; `cls.runs` de `runs.summary.CLS`, con `agreement: null` cuando todas las ejecuciones dan 0 |
| `shifts` | `result.details.countedShifts` y `excludedShifts`: los desplazamientos tras una interacción no cuentan |
| `elements` | `result.details.topElements`: `selector`, `shiftCount` y `totalImpact` |
| `inp` | El resultado con `id: "INP"`: `value`, `rating`, `details.worstEvent` y `details.phases`; `runs` de `runs.summary.INP`. `null` cuando el recorrido no tiene click y el resultado llega `skipped` |
| `longFrames` | El resultado `long-frames`: `totalLoAFs`, `withBlockingTime`, `totalBlockingTimeMs`, `worstBlockingMs` y `topScripts` |
| `longTasks` | El resultado `long-tasks`: `totalBlockingTimeMs` y `worstTaskMs` |

Un resultado con otro `status` para el subagente con el recorrido, el id o el snippet y el mensaje. Los fixtures de `agents/test/fixtures/cls/` y `loaf/` son respuestas reales en `pr/cls-promo-banner` y `pr/loaf-cart-handler`.
