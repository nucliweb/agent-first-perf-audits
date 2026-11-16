---
title: "Paso 3: Navigator, CLS y LoAF/INP"
description: Recorrer la tienda como una persona y medir los desplazamientos y lo que bloquea el hilo principal en cada recorrido.
sidebar:
  order: 13
---

## Qué vas a aprender

- Describir un recorrido de usuario como datos, y reutilizarlo en varias medidas.
- Leer el INP por sus tres fases, y encontrar el script que bloquea con los long animation frames.
- Qué desplazamientos cuentan para el CLS y cuáles no.

## Tiempo

Este paso tiene 20 minutos en la agenda. El tiempo de máquina está medido en el Mac de referencia, con el [ensayo cronometrado](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.es.md):

| | `llm` | `lite` |
|---|---|---|
| Tiempo de máquina del paso | 6,9 min | 6,9 min |
| Punto 5, recorrer y medir las dos tiendas | 5,5 min | 5,5 min |

## La idea en un minuto

El LCP se mide en una carga. El CLS y el INP pasan mientras una persona usa la página, así que hace falta alguien que la use: un recorrido es una página y una lista de pasos (click, escribir, scroll), guardados como datos.

<img src="/diagrams/flow.svg" alt="El flujo de los subagentes: navigator recorre la tienda y pasa sus recorridos a cls y a loaf; lcp mide la carga por su cuenta; los tres dejan un JSON por lado en out/agents, y judge decide y explica en su informe" width="1120" height="380" loading="lazy" decoding="async">

Son tres subagentes sobre los mismos recorridos. El Navigator recorre la tienda paso a paso y comprueba que cada recorrido termina. CLS mide qué se mueve en cada uno, y LoAF/INP mide lo que tarda la página en responder a un click, con sus tres fases, y qué scripts ocupan el hilo principal. Las fases del INP están en el diagrama del paso 2, y las dos métricas en [Conceptos](../../concepts/#inp-y-los-long-animation-frames).

Aquí ves la evidencia de la segunda regresión, la rama `pr/loaf-cart-handler`, que hace pesado el click de añadir al carrito.

## Antes de empezar

Sigues en tu rama `taller`, con el laboratorio levantado. Si no has terminado los pasos anteriores, no pasa nada: la solución de este paso trae también la de los anteriores.

## Paso a paso

1. Lanza los tests del paso:

   ```bash
   docker compose run --rm agents node --test test/subagents/navigator.test.ts test/subagents/cls.test.ts test/subagents/loaf.test.ts
   ```

   De 22 tests, fallan 17 (`fail 17`) con mensajes como este:

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

   Los 22 pasan (`pass 22`). Tardan algo más de medio minuto: los del Navigator abren una página local con el servidor real, y uno espera a que un paso falle.

4. Cambia la tienda candidata por la rama del handler pesado:

   ```bash
   CANDIDATE=pr-loaf-cart-handler docker compose up -d
   ```

5. Recorre y mide las dos tiendas:

   ```bash
   CANDIDATE=pr-loaf-cart-handler docker compose run --rm agents node src/orchestrator.ts cls loaf
   ```

   Es la espera larga del paso: el Navigator va primero, porque CLS y LoAF/INP miden sus recorridos, y cada subagente mide cuatro recorridos por lado, tres veces cada uno. Escribe una línea por subagente y tienda, entre ellas estas (las cifras cambian en cada ejecución):

   ```text
   [orchestrator] navigator, baseline: home 5 steps, shop 3 steps, product 3 steps, add-to-cart 3 steps; no page errors
   [orchestrator] loaf, baseline: home no click, shop INP … ms, product INP … ms, add-to-cart INP … ms; slowest …
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

   <!-- rehearsal: optional -->
   ```bash
   CANDIDATE=pr-cls-promo-banner docker compose up -d
   CANDIDATE=pr-cls-promo-banner docker compose run --rm agents node src/orchestrator.ts cls
   ```

   En la línea `cls, candidate`, el CLS deja de ser 0 en los cuatro recorridos. En `out/agents/cls-candidate.json`, el nodo que más se mueve es `main.main`: el banner empuja la página hacia abajo.

## Mientras esperas

El punto 5 es la espera más larga de los cuatro primeros pasos. Mientras tanto:

- Abre `agents/journeys/add-to-cart.json`: es el recorrido que se está midiendo, y el mismo fichero que usa el gate.
- Los JSON aparecen en `out/agents/` según termina cada subagente. Abre `navigator-baseline.json`: ¿en qué URL deja la página cada paso?
- Abre la tienda de la rama desde [Las ramas en el navegador](../../previews/) y añade un producto al carrito. Esa página explica cómo verlo en DevTools.
- ¿Por qué la línea de LoAF dice `home no click`? ¿Y por qué el Navigator va antes que los otros dos?

## Punto de control

En pantalla, la línea `loaf, candidate` con `add-to-cart` como recorrido más lento y `DIV#root.onclick` como script, y `step-03 is done.`

## Si algo falla

| Qué ves | Por qué | Qué hacer |
|---|---|---|
| El INP de la rama no es el de los fixtures | El handler hace un trabajo fijo, así que tarda menos en una máquina más rápida | Compara con el baseline: lo que crece es `processing`, y el script es el handler |
| La línea `cls, candidate` da 0 en los cuatro recorridos | Es lo esperado: la regresión de esta rama es otra | El CLS se ve en el punto 7, con la rama del banner |
| El orquestador se para con un mensaje como `journey add-to-cart, step 2 (click ...)` | Un elemento del recorrido no apareció en 5 segundos | Comprueba con `docker compose ps` que las dos tiendas están en marcha y repite el punto 5 |
| `KO` en un fichero de `out/agents/` en la comprobación | Falta el punto 5, o se paró a medias | La comprobación escribe el comando debajo de "To make the files of out/, run:" |

## Qué te llevas

- Un recorrido es un JSON que sirve al Navigator, a los subagentes y al gate.
- El INP señala la interacción lenta; los long animation frames, el script que la bloquea; el trace del click, la función: `recommendFor`.
- No todo desplazamiento es CLS: los que siguen a una interacción no cuentan.

Para pensar: ¿qué tres recorridos de tu producto guardarías en `agents/journeys/`?

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
