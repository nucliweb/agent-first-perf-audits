---
title: "Paso 5: el gate en ci contra las cuatro ramas"
description: El gate de rendimiento de una pull request, contra las tres regresiones y el refactor que no cambia nada.
sidebar:
  order: 15
---

## Qué vas a aprender

- Usar el gate como lo usaría un equipo, en el CI de cada pull request, y leer sus tres exit codes.
- Por qué el gate compara con `main` y no con los umbrales de Google.
- Qué hacer cuando el gate no puede decidir.

## Tiempo

Este paso tiene 20 minutos en la agenda. El tiempo de máquina está medido en el Mac de referencia, con el [ensayo cronometrado](https://github.com/nucliweb/agent-first-perf-audits/blob/main/experiments/rehearsal/README.es.md):

| | `llm` | `lite` |
|---|---|---|
| Tiempo de máquina del paso | 11,2 min | 9,3 min |
| Punto 1, el gate por las cuatro ramas | 11,2 min | 9,3 min |

## La idea en un minuto

Todo lo anterior cabe en un servicio: `ci` compara la tienda de una rama con la de `main` y sale con 0 si pasa, con 1 si alguna métrica empeora y con 2 si no ha podido medir. Un pipeline no necesita saber más: el exit code para la pull request, y el informe dice por qué.

Las medidas son las de un laboratorio, así que el gate no afirma lo que no puede sostener. Cuando un cambio supera su umbral y las medidas no bastan para distinguirlo del ruido, la métrica queda como no concluyente: el gate no falla por ella, y el informe pide lanzarlo otra vez.

El repo usa este mismo gate en GitHub Actions: cada pull request de una rama `pr/*` pasa `ci` y recibe el informe en un comentario, como la de [`pr/lcp-hero-lazy`](https://github.com/nucliweb/agent-first-perf-audits/pull/1). Contra las cuatro ramas del taller tiene que dar tres fallos y un pass.

## Antes de empezar

Sigues en tu rama `taller`, con el laboratorio levantado. Este paso no tiene código: `ci` funciona aunque no hayas aplicado ninguna solución.

Las ramas que vas a comparar con `main`:

| Rama | Cambio | Qué empeora |
|---|---|---|
| `pr/lcp-hero-lazy` | La imagen del hero pierde el preload y el `fetchpriority`, y pasa a `loading="lazy"` | LCP |
| `pr/cls-promo-banner` | El banner de un tercero sin espacio reservado y un swap de fuente sin preload | CLS |
| `pr/loaf-cart-handler` | Un script síncrono de A/B testing y recomendaciones calculadas en el handler de añadir al carrito | INP y LCP |
| `pr/noop-refactor` | Extrae el hero a un componente | Nada: el control de falsos positivos |

Los tests de la app pasan en las cuatro: el CI clásico no ve ninguna regresión. Las tres quedan dentro de "good" en valor absoluto; el gate las detecta porque compara con `main`, no con los umbrales de Google.

Las cuatro ramas también están desplegadas en Vercel, para verlas en el navegador sin Docker: [Las ramas en el navegador](../../previews/).

## Paso a paso

1. Pasa el gate por las cuatro ramas, cada una en su carpeta de `out/ci/` para que los informes no se pisen:

   ```bash
   for branch in pr-lcp-hero-lazy pr-cls-promo-banner pr-loaf-cart-handler pr-noop-refactor; do
     CANDIDATE=$branch docker compose run --rm -e OUT=/out/ci/$branch ci
     echo "$branch: exit $?"
   done
   ```

   `docker compose run` arranca la tienda de cada rama antes de medirla. Cada rama tarda unos minutos, porque el gate mide cinco veces cada escenario en cada lado, alternando las dos tiendas. Al terminar cada una, escribe su exit code:

   ```text
   pr-lcp-hero-lazy: exit 1
   pr-cls-promo-banner: exit 1
   pr-loaf-cart-handler: exit 1
   pr-noop-refactor: exit 0
   ```

2. Pasa la comprobación del paso:

   ```bash
   docker compose run --rm agents npm run check -- step-05
   ```

   Da un `OK` por rama cuando su informe tiene el veredicto esperado, y termina con `step-05 is done.`

   Si una rama que debería fallar pasa con una métrica no concluyente hacia peor, la comprobación dice que la lances otra vez.

## Mientras esperas

Cada rama tarda unos minutos. Mientras corre la siguiente, lee el `report.md` de la anterior, en `out/ci/<rama>/`. Fíjate en cinco cosas:

- `pr/loaf-cart-handler` empeora dos métricas por dos causas distintas, y el Judge pide una explicación por cada una.
- `pr/noop-refactor` pasa y el LLM no llega a ser consultado: sin regresión, las reglas responden solas, y no hay ocasión de inventarse una.
- En `pr/lcp-hero-lazy`, la explicación del LLM nombra `loading="lazy"`, y los hechos de las reglas, al final del informe, añaden lo que no dice: el `fetchPriority` y el preload que pierde el hero.
- Si una métrica supera su umbral y p no baja de 0,05, el informe lo dice arriba, en un bloque "Inconclusive: run the gate again." con la métrica, su cambio y su p, y cuántas ejecuciones por lado midió la CLI. El gate no falla por esa métrica.
- Con el perfil `lite`, cada carpeta tiene un `handoff.md` en lugar de la explicación. Enviarlo a un servicio externo es una decisión de cada equipo para su propio código.

## Punto de control

En pantalla, los cuatro exit codes, `1`, `1`, `1` y `0`, y `step-05 is done.`

## Si algo falla

| Qué ves | Por qué | Qué hacer |
|---|---|---|
| Una rama con regresión sale con 0 | Su métrica quedó como no concluyente | Lanza esa rama otra vez. La comprobación del punto 2 escribe el comando |
| Una rama sale con 2 | El gate no ha podido medir: falta la imagen de la tienda de esa rama, o una variable | El mensaje dice qué falta. El preflight de [Preparación](../../setup/) descarga la tienda de cada rama |
| `pr-noop-refactor` sale con 1 | Un falso positivo, casi siempre con la máquina ocupada en otra cosa | Cierra lo que consuma CPU y lanza esa rama otra vez. Por qué pasa, en [Conceptos](../../concepts/#por-qué-importa-el-orden) |
| El bucle tarda mucho más que en la tabla de Tiempo | Otra carga en la máquina, o un equipo más lento que el de referencia | Déjalo terminar: las medidas van una detrás de otra para no repartirse la CPU |

## Qué te llevas

- El CI clásico no veía ninguna de las tres regresiones: los tests de la app pasan en las cuatro ramas.
- El gate las ve porque compara con la versión base en la misma máquina y en la misma ejecución, no con un umbral absoluto.
- Tres salidas, 0, 1 y 2, y un resultado no concluyente que se dice en voz alta en lugar de pasar por bueno.

Para pensar: ¿qué pull request de los últimos meses habría parado este gate en tu producto?
