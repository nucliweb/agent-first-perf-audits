---
title: "Paso 3: Navigator, CLS y LoAF/INP"
description: Recorrer la tienda como una persona y medir los desplazamientos y lo que bloquea el hilo principal en cada recorrido.
sidebar:
  order: 13
---

## Objetivo

Tres subagentes que trabajan sobre recorridos, no sobre una carga: el Navigator recorre la tienda paso a paso y comprueba que cada recorrido termina; CLS y LoAF/INP miden esos mismos recorridos. El orquestador pasa el Navigator primero y entrega a los demás lo que ha encontrado.

## Qué vas a escribir

Cinco funciones, cada una entre sus marcas `// workshop: step 3`:

| Fichero | Función | Qué hace |
|---|---|---|
| `agents/src/subagents/navigator.ts` | `runJourney` | Abre la página de un recorrido, ejecuta sus pasos uno a uno y devuelve un `JourneyRun` |
| `agents/src/subagents/cls.ts` | `measure` | Mide los desplazamientos de un recorrido |
| | `clsJourneyOf` | Convierte la respuesta en el `ClsJourney` del recorrido |
| `agents/src/subagents/loaf.ts` | `measure` | Mide lo que bloquea el hilo principal en un recorrido |
| | `loafJourneyOf` | Convierte la respuesta en el `LoafJourney` del recorrido, sin el trace |

Los recorridos son los JSON de `agents/journeys/`: `home`, `shop`, `product` y `add-to-cart`, cada uno con su página (`path`) y sus pasos (`click`, `type`, `hover`, `scroll` y `wait`). Es el formato de `--interact-script` de la CLI de WebPerf Snippets, y el gate mide añadir al carrito con el mismo fichero.

## Las herramientas

Todo con WebPerf Snippets MCP y el throttling del gate (`CONDITIONS`):

| Subagente | Herramientas | Argumentos |
|---|---|---|
| Navigator | `open_page`, `interact`, `read_results` y `close_page` | `open_page` con `url`, `cpu`, `network` y `track: ["INP"]`; `interact` con el `sessionId` y `steps` |
| CLS | `run_snippet` | `snippet: "Layout-Shift-Loading-and-Interaction"`, `interactions` con los pasos del recorrido, `runs` y `detail: "full"` |
| LoAF/INP | `run_workflow` | `workflow: "interaction"`, `interactions`, `runs` y `detail: "full"` |

## Pistas

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

## Compruébalo

```bash
docker compose run --rm agents node --test test/subagents/navigator.test.ts test/subagents/cls.test.ts test/subagents/loaf.test.ts
```

Los tests del Navigator abren una página local con el servidor real; uno espera a que un paso falle, así que tardan unos segundos. Después, los tres subagentes contra la rama del handler pesado (el Navigator va solo, porque CLS y LoAF lo necesitan):

```bash
CANDIDATE=pr-loaf-cart-handler docker compose up -d
CANDIDATE=pr-loaf-cart-handler docker compose run --rm agents node src/orchestrator.ts cls loaf
```

Son unos minutos: cuatro recorridos por lado y tres ejecuciones de cada uno. En los fixtures, el INP de añadir al carrito pasa de 32 a 192 ms, casi todo procesamiento (de 10 a 169 ms), y el primer script de los long animation frames es el handler del click, `DIV#root.onclick`, con 166 ms. En los recorridos con un click, el subagente graba además un trace del click, y trace-engine-cli nombra la función: `recommendFor`. Prueba también el CLS con `CANDIDATE=pr-cls-promo-banner`: el nodo que más se mueve es `main.main`, porque el banner empuja la página.

```bash
docker compose run --rm agents npm run check -- step-03
```

## Si te descuelgas

```bash
git checkout step-03-solution -- agents/src
```
